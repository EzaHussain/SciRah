import { config } from '../../config.js';
import { fetchJson, qs, stripTags } from '../../common/http.js';
import { finalizePaper, normalizeDoi, type Paper, type SearchParams, type SourceResult } from '../types.js';

const BASE = 'https://api.crossref.org';
const SELECT = 'DOI,title,author,container-title,published,issued,is-referenced-by-count,references-count,abstract,URL,type,subject,publisher';

interface CRItem {
  DOI: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string; ORCID?: string; affiliation?: { name: string }[] }[];
  'container-title'?: string[];
  published?: { 'date-parts'?: number[][] };
  issued?: { 'date-parts'?: number[][] };
  'is-referenced-by-count'?: number;
  'references-count'?: number;
  abstract?: string;
  URL?: string;
  type?: string;
  subject?: string[];
  publisher?: string;
}

function dateOf(item: CRItem): { year?: number; date?: string } {
  const parts = item.published?.['date-parts']?.[0] ?? item.issued?.['date-parts']?.[0];
  if (!parts?.[0]) return {};
  const [y, m, d] = parts;
  const date = [y, m, d]
    .filter(Boolean)
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0')))
    .join('-');
  return { year: y, date };
}

export function mapItem(it: CRItem): Paper | null {
  const { year, date } = dateOf(it);
  return finalizePaper({
    ids: { doi: normalizeDoi(it.DOI) },
    title: it.title?.[0] ?? '',
    abstract: stripTags(it.abstract),
    authors: (it.author ?? []).map((a) => ({
      name: a.name ?? [a.given, a.family].filter(Boolean).join(' '),
      orcid: a.ORCID,
      affiliation: a.affiliation?.[0]?.name,
      affiliations: a.affiliation?.length ? a.affiliation.map((x) => x.name) : undefined,
    })),
    venue: it['container-title']?.[0],
    publisher: it.publisher,
    year,
    publishedDate: date,
    type: it.type,
    citationCount: it['is-referenced-by-count'],
    referenceCount: it['references-count'],
    isOpenAccess: false,
    sourceUrl: it.URL ?? `https://doi.org/${it.DOI}`,
    topics: (it.subject ?? []).map((s) => ({ name: s })),
    sources: ['crossref'],
  });
}

export async function search(p: SearchParams): Promise<SourceResult> {
  const filter: string[] = ['type:journal-article,type:proceedings-article,type:book-chapter,type:posted-content'];
  if (p.yearFrom) filter.push(`from-pub-date:${p.yearFrom}`);
  if (p.yearTo) filter.push(`until-pub-date:${p.yearTo}`);
  const sort = p.sort === 'citations' ? 'is-referenced-by-count' : p.sort === 'newest' ? 'published' : undefined;
  const data = await fetchJson<{ message: { 'total-results': number; items: CRItem[] } }>(
    `${BASE}/works?${qs({
      query: p.mode === 'author' ? undefined : p.q,
      'query.author': p.mode === 'author' ? p.q : undefined,
      rows: p.perPage,
      offset: (p.page - 1) * p.perPage,
      select: SELECT,
      filter: filter.join(','),
      sort,
      order: sort ? 'desc' : undefined,
      mailto: config.contactEmail,
    })}`,
    { timeoutMs: 8000 },
  );
  return {
    source: 'crossref',
    total: data.message['total-results'],
    papers: data.message.items.map(mapItem).filter((x): x is Paper => !!x),
  };
}

export async function getWork(doi: string): Promise<Paper | null> {
  const data = await fetchJson<{ message: CRItem }>(
    `${BASE}/works/${encodeURIComponent(doi)}?${qs({ mailto: config.contactEmail })}`,
  ).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  return data ? mapItem(data.message) : null;
}

/** Crossref's citation count ("is-referenced-by-count") for each DOI, looked up 40 DOIs per request. */
export async function citationsByDois(dois: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const chunks: string[][] = [];
  for (let i = 0; i < dois.length; i += 40) chunks.push(dois.slice(i, i + 40));
  // A few requests at a time keeps us within Crossref's polite-pool limits.
  for (let i = 0; i < chunks.length; i += 3) {
    await Promise.all(
      chunks.slice(i, i + 3).map(async (chunk) => {
        const data = await fetchJson<{ message: { items: { DOI: string; 'is-referenced-by-count'?: number }[] } }>(
          `${BASE}/works?${qs({ filter: chunk.map((d) => `doi:${d}`).join(','), rows: chunk.length, select: 'DOI,is-referenced-by-count', mailto: config.contactEmail })}`,
          { timeoutMs: 20_000 },
        );
        for (const it of data.message.items) out.set(it.DOI.toLowerCase(), it['is-referenced-by-count'] ?? 0);
      }),
    );
  }
  return out;
}
