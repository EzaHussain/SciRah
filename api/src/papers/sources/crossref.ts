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
