import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { mergeResults, mergeTwo } from './merge.js';
import * as arxiv from './sources/arxiv.js';
import * as core from './sources/core.js';
import * as crossref from './sources/crossref.js';
import * as openalex from './sources/openalex.js';
import * as pubmed from './sources/pubmed.js';
import * as s2 from './sources/semanticscholar.js';
import {
  finalizePaper,
  parseId,
  usesAdvancedFilters,
  type AuthorSummary,
  type Paper,
  type SearchParams,
  type SearchResponse,
  type SourceName,
  type SourceResult,
  type SourceStatus,
} from './types.js';

const SEARCH_TTL = 30 * 60;
const PAPER_TTL = 12 * 60 * 60;

type Task = { source: SourceName; run: () => Promise<SourceResult> };

@Injectable()
export class PapersService {
  private readonly logger = new Logger(PapersService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: DbService,
  ) {}

  search(params: SearchParams): Promise<SearchResponse> {
    const key = `search:v2:${JSON.stringify(params)}`;
    return this.cache.wrap(key, SEARCH_TTL, () => this.runSearch(params));
  }

  private async runSearch(p: SearchParams): Promise<SearchResponse> {
    const per = { ...p, perPage: Math.min(p.perPage, 10) };
    const oaPer = { ...p, perPage: Math.max(p.perPage, 15) };
    const tasks: Task[] = [];
    const skipped: SourceStatus[] = [];
    let authors: AuthorSummary[] | undefined;
    let subject: SearchResponse['subject'];

    if (p.mode === 'author') {
      const [oaAuthors, s2Authors] = await Promise.all([
        openalex.searchAuthors(p.q, 6, p.pakistan || p.countries?.includes('pk')).catch(() => [] as AuthorSummary[]),
        usesAdvancedFilters(p) ? Promise.resolve([] as AuthorSummary[]) : s2.searchAuthors(p.q, 3).catch(() => [] as AuthorSummary[]),
      ]);
      authors = [...oaAuthors, ...s2Authors];
      const top = oaAuthors[0];
      tasks.push({
        source: 'openalex',
        run: () =>
          top
            ? openalex.searchWorks(oaPer, [`author.id:${top.id.replace('openalex:', '')}`], false)
            : openalex.searchWorks(oaPer, [`raw_author_name.search:${p.q}`], false),
      });
    } else if (p.mode === 'subject') {
      const match = await openalex.findSubject(p.q).catch(() => null);
      if (match) subject = { id: match.id, name: match.name, level: match.level };
      tasks.push({
        source: 'openalex',
        run: () => (match ? openalex.searchWorks(oaPer, [openalex.subjectFilter(match)], false) : openalex.searchWorks(oaPer)),
      });
    } else {
      tasks.push({ source: 'openalex', run: () => openalex.searchWorks(oaPer) });
    }

    if (usesAdvancedFilters(p)) {
      const why = p.pakistan || p.countries?.length || p.continent || p.globalSouth || p.institution
        ? 'Location filters use OpenAlex affiliation data only'
        : 'These filters use OpenAlex metadata only';
      for (const s of ['semanticscholar', 'crossref', 'core', 'arxiv', 'pubmed'] as SourceName[])
        skipped.push({ source: s, ok: true, count: 0, skipped: why });
    } else {
      if (p.mode !== 'author') {
        tasks.push({ source: 'semanticscholar', run: () => s2.search(per) });
        tasks.push({ source: 'crossref', run: () => crossref.search(per) });
      } else {
        // S2 has no author-name paper search; CrossRef's author matching is too fuzzy to be useful.
        skipped.push({ source: 'semanticscholar', ok: true, count: 0, skipped: 'Author profiles listed above instead' });
        skipped.push({ source: 'crossref', ok: true, count: 0, skipped: 'Author-name matching too imprecise' });
      }
      if (core.coreEnabled()) tasks.push({ source: 'core', run: () => core.search(per) });
      else skipped.push({ source: 'core', ok: true, count: 0, skipped: 'CORE_API_KEY not configured' });
      tasks.push({ source: 'arxiv', run: () => arxiv.search(per) });
      tasks.push({ source: 'pubmed', run: () => pubmed.search(per) });
    }

    // Papers added manually on SciRah (approved ones only).
    if (this.db.enabled && p.page === 1 && !usesAdvancedFilters(p)) tasks.push({ source: 'scirah', run: () => this.searchUserPapers(p) });

    const settled = await Promise.allSettled(tasks.map((t) => t.run()));
    const ok: SourceResult[] = [];
    const statuses: SourceStatus[] = settled.map((r, i) => {
      const source = tasks[i].source;
      if (r.status === 'fulfilled') {
        ok.push(r.value);
        return { source, ok: true, count: r.value.papers.length };
      }
      const msg = (r.reason as Error)?.message ?? 'failed';
      this.logger.warn(`${source} search failed: ${msg}`);
      return { source, ok: false, count: 0, error: msg.slice(0, 160) };
    });

    // In author mode OpenAlex results belong to a disambiguated researcher; name matches elsewhere may not.
    const weights = p.mode === 'author' ? { openalex: 2, arxiv: 0.6, pubmed: 0.6, core: 0.6 } : undefined;
    let results = mergeResults(ok, p.sort, weights);
    if (p.openAccess) results = results.filter((x) => x.isOpenAccess);
    if (p.minCitations) results = results.filter((x) => (x.citationCount ?? 0) >= p.minCitations!);
    if (p.yearFrom) results = results.filter((x) => !x.year || x.year >= p.yearFrom!);
    if (p.yearTo) results = results.filter((x) => !x.year || x.year <= p.yearTo!);

    // Remember each result briefly so detail pages for non-OpenAlex ids resolve instantly.
    await Promise.all(results.map((r) => this.cache.set(`paper:seen:${r.id}`, r, 6 * 60 * 60)));

    return {
      query: p.q,
      mode: p.mode,
      page: p.page,
      perPage: p.perPage,
      total: Math.max(0, ...ok.map((r) => r.total)),
      results,
      sources: [...statuses, ...skipped],
      authors,
      subject,
    };
  }

  institutions(q: string) {
    return this.cache.wrap(`inst:ac:${q.toLowerCase()}`, 24 * 3600, () => openalex.autocompleteInstitutions(q));
  }

  async getPaper(id: string): Promise<Paper> {
    const paper = await this.cache.wrap(`paper:v1:${id}`, PAPER_TTL, () => this.resolve(id));
    if (!paper) throw new NotFoundException('Paper not found');
    return paper;
  }

  private async resolve(id: string): Promise<Paper | null> {
    const ref = parseId(id);
    if (!ref) throw new NotFoundException('Unrecognised paper id');
    const tryGet = <T>(p: Promise<T>) => p.catch((e) => (this.logger.warn(`resolve ${id}: ${(e as Error).message}`), null));

    let paper: Paper | null = null;
    switch (ref.kind) {
      case 'openalex':
        paper = await tryGet(openalex.getWork(ref.value));
        break;
      case 'doi':
        paper = (await tryGet(openalex.getWork(`doi:${ref.value}`))) ?? (await tryGet(crossref.getWork(ref.value)));
        break;
      case 'pmid':
        paper = (await tryGet(openalex.getWork(`pmid:${ref.value}`))) ?? (await tryGet(pubmed.getPaper(ref.value)));
        break;
      case 'arxiv':
        paper = await tryGet(arxiv.getPaper(ref.value));
        break;
      case 's2':
        paper = await tryGet(s2.getPaper(ref.value));
        break;
      case 'core':
        paper = core.coreEnabled() ? await tryGet(core.getWork(ref.value)) : null;
        break;
      case 'scirah':
        // Manually added papers are complete as stored; nothing to enrich from other sources.
        return this.userPaper(ref.value);
    }
    const seen = await this.cache.get<Paper>(`paper:seen:${id}`);
    if (!paper) paper = seen;
    else if (seen) paper = mergeTwo(paper, seen);
    if (!paper) return null;

    return this.enrich(paper, tryGet);
  }

  /** Pull complementary fields (abstract, TLDR, author ids, topics) from the other sources. */
  private async enrich(paper: Paper, tryGet: <T>(p: Promise<T>) => Promise<T | null>): Promise<Paper> {
    const { doi, arxiv: arxivId, pmid, openalex: oaId, s2: s2Id } = paper.ids;
    const extra: Promise<Paper | null>[] = [];

    if (!oaId && doi) extra.push(tryGet(openalex.getWork(`doi:${doi}`)));
    else if (!oaId && pmid) extra.push(tryGet(openalex.getWork(`pmid:${pmid}`)));
    // arXiv registers DOIs of the form 10.48550/arXiv.<id>, which OpenAlex indexes.
    else if (!oaId && arxivId) extra.push(tryGet(openalex.getWork(`doi:10.48550/arxiv.${arxivId}`)));

    const s2Ref = s2Id ?? (doi ? `DOI:${doi}` : arxivId ? `ARXIV:${arxivId}` : pmid ? `PMID:${pmid}` : undefined);
    if (s2Ref) extra.push(tryGet(s2.getPaper(s2Ref)));

    for (const p of await Promise.all(extra)) if (p) paper = mergeTwo(paper, p);

    if (!paper.abstract && pmid) paper.abstract = (await tryGet(pubmed.getAbstract(pmid))) ?? undefined;
    if (!paper.abstract && doi && !paper.sources.includes('crossref')) {
      const cr = await tryGet(crossref.getWork(doi));
      if (cr) paper = mergeTwo(paper, cr);
    }
    if (!paper.abstract && arxivId && !paper.sources.includes('arxiv')) {
      const ax = await tryGet(arxiv.getPaper(arxivId));
      if (ax) paper = mergeTwo(paper, ax);
    }
    return paper;
  }

  // ---- Papers added manually on SciRah ----

  /** An approved manually added paper (or any status when `includeUnapproved`, for its submitter / admins). */
  async userPaper(uuid: string, includeUnapproved = false): Promise<Paper | null> {
    if (!this.db.enabled || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;
    const row = await this.db.one<UserPaperRow>(
      `select * from user_papers where id = $1 ${includeUnapproved ? '' : "and status = 'approved'"}`,
      [uuid],
    );
    return row ? userPaperToPaper(row) : null;
  }

  private async searchUserPapers(p: SearchParams): Promise<SourceResult> {
    const rows = await this.db.query<UserPaperRow>(
      p.mode === 'author'
        ? `select * from user_papers where status = 'approved' and array_to_string(authors, ' ') ilike '%' || $1 || '%'
           order by created_at desc limit 5`
        : `select * from user_papers where status = 'approved'
             and to_tsvector('simple', title || ' ' || coalesce(abstract, '') || ' ' || array_to_string(authors, ' '))
                 @@ plainto_tsquery('simple', $1)
           order by created_at desc limit 5`,
      [p.q],
    );
    const papers = rows.map(userPaperToPaper).filter((x): x is Paper => !!x);
    return { source: 'scirah', papers, total: papers.length };
  }
}

export interface UserPaperRow {
  id: string;
  submitted_by: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export function userPaperToPaper(r: UserPaperRow): Paper | null {
  return finalizePaper({
    ids: { scirah: r.id },
    title: r.title,
    abstract: r.abstract ?? undefined,
    authors: r.authors.map((name) => ({ name })),
    venue: r.venue ?? undefined,
    year: r.year ?? undefined,
    isOpenAccess: false,
    sourceUrl: r.url ?? (r.doi ? `https://doi.org/${r.doi}` : undefined),
    topics: [],
    sources: ['scirah'],
  });
}
