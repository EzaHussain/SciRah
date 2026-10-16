import { fetchText, qs, decodeEntities } from '../../common/http.js';
import { finalizePaper, normalizeArxiv, normalizeDoi, type Paper, type SearchParams, type SourceResult } from '../types.js';

// arXiv asks clients to keep to ~1 request / 3 s; results are cached upstream of this.
const BASE = 'https://export.arxiv.org/api/query';

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : undefined;
};

function parseFeed(xml: string): { total: number; papers: Paper[] } {
  const total = Number(tag(xml, 'opensearch:totalResults') ?? 0);
  const entries = xml.split('<entry>').slice(1);
  const papers = entries
    .map((e): Paper | null => {
      const absUrl = tag(e, 'id') ?? '';
      const arxivId = normalizeArxiv(absUrl);
      const published = tag(e, 'published');
      const authors = [...e.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => ({
        name: tag(m[1], 'name') ?? 'Unknown',
        affiliation: tag(m[1], 'arxiv:affiliation'),
      }));
      const categories = [...e.matchAll(/<category term="([^"]+)"/g)].map((m) => m[1]);
      return finalizePaper({
        ids: { arxiv: arxivId, doi: normalizeDoi(tag(e, 'arxiv:doi')) },
        title: tag(e, 'title') ?? '',
        abstract: tag(e, 'summary'),
        authors,
        venue: tag(e, 'arxiv:journal_ref') ?? 'arXiv',
        year: published ? Number(published.slice(0, 4)) : undefined,
        publishedDate: published?.slice(0, 10),
        type: 'preprint',
        isOpenAccess: true,
        sourceUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : absUrl,
        oaUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
        pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : undefined,
        topics: categories.map((c) => ({ name: c })),
        sources: ['arxiv'],
      });
    })
    .filter((x): x is Paper => !!x);
  return { total, papers };
}

function buildQuery(p: SearchParams): string {
  const q = p.q.replace(/["()]/g, ' ').trim();
  const words = q.split(/\s+/).filter(Boolean);
  let sq: string;
  if (p.mode === 'author') sq = `au:"${q}"`;
  else if (p.mode === 'subject') sq = words.map((w) => `(ti:${w} OR abs:${w})`).join(' AND ');
  else sq = words.map((w) => `all:${w}`).join(' AND ');
  if (p.yearFrom || p.yearTo) {
    const from = `${p.yearFrom ?? 1991}01010000`;
    const to = `${p.yearTo ?? new Date().getFullYear()}12312359`;
    sq += ` AND submittedDate:[${from} TO ${to}]`;
  }
  return sq;
}

export async function search(p: SearchParams): Promise<SourceResult> {
  const sortBy = p.sort === 'newest' ? 'submittedDate' : 'relevance';
  const xml = await fetchText(
    `${BASE}?${qs({ search_query: buildQuery(p), start: (p.page - 1) * p.perPage, max_results: p.perPage, sortBy, sortOrder: 'descending' })}`,
    { timeoutMs: 9000 },
  );
  const { total, papers } = parseFeed(xml);
  return { source: 'arxiv', total, papers };
}

export async function getPaper(arxivId: string): Promise<Paper | null> {
  const xml = await fetchText(`${BASE}?${qs({ id_list: arxivId, max_results: 1 })}`);
  return parseFeed(xml).papers[0] ?? null;
}
