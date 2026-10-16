import { config } from '../../config.js';
import { fetchJson as rawFetchJson, qs, UpstreamError } from '../../common/http.js';
import {
  finalizePaper,
  normalizeArxiv,
  normalizeDoi,
  type AuthorProfile,
  type AuthorSummary,
  type Paper,
  type SearchParams,
  type SourceResult,
} from '../types.js';

const BASE = 'https://api.semanticscholar.org/graph/v1';
const PAPER_FIELDS =
  'title,abstract,authors,year,venue,publicationDate,citationCount,referenceCount,externalIds,isOpenAccess,openAccessPdf,url,fieldsOfStudy,publicationTypes';

const headers = () => (config.semanticScholarApiKey ? { 'x-api-key': config.semanticScholarApiKey } : undefined);

// API keys are limited to 1 request/second, so a burst occasionally gets a 429: retry once after a short pause.
async function fetchJson<T>(url: string, opts?: Parameters<typeof rawFetchJson>[1]): Promise<T> {
  try {
    return await rawFetchJson<T>(url, opts);
  } catch (e) {
    if (!(e instanceof UpstreamError) || e.status !== 429) throw e;
    await new Promise((r) => setTimeout(r, 1100));
    return rawFetchJson<T>(url, opts);
  }
}

interface S2Paper {
  paperId: string;
  title?: string;
  abstract?: string;
  tldr?: { text?: string } | null;
  authors?: { authorId?: string; name: string }[];
  year?: number;
  venue?: string;
  publicationDate?: string;
  citationCount?: number;
  referenceCount?: number;
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string; CorpusId?: number };
  isOpenAccess?: boolean;
  openAccessPdf?: { url?: string } | null;
  url?: string;
  fieldsOfStudy?: string[] | null;
  publicationTypes?: string[] | null;
}

export function mapPaper(p: S2Paper): Paper | null {
  return finalizePaper({
    ids: {
      s2: p.paperId,
      doi: normalizeDoi(p.externalIds?.DOI),
      arxiv: normalizeArxiv(p.externalIds?.ArXiv),
      pmid: p.externalIds?.PubMed,
    },
    title: p.title ?? '',
    abstract: p.abstract ?? undefined,
    tldr: p.tldr?.text ?? undefined,
    authors: (p.authors ?? []).map((a) => ({ name: a.name, id: a.authorId ? `s2:${a.authorId}` : undefined })),
    venue: p.venue || undefined,
    year: p.year,
    publishedDate: p.publicationDate,
    type: p.publicationTypes?.[0]?.toLowerCase(),
    citationCount: p.citationCount,
    referenceCount: p.referenceCount,
    isOpenAccess: !!p.isOpenAccess,
    sourceUrl: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : p.url,
    oaUrl: p.openAccessPdf?.url || undefined,
    pdfUrl: p.openAccessPdf?.url || undefined,
    topics: (p.fieldsOfStudy ?? []).map((f) => ({ name: f })),
    sources: ['semanticscholar'],
  });
}

export async function search(p: SearchParams): Promise<SourceResult> {
  const year = p.yearFrom || p.yearTo ? `${p.yearFrom ?? ''}-${p.yearTo ?? ''}` : undefined;
  const data = await fetchJson<{ total: number; data?: S2Paper[] }>(
    `${BASE}/paper/search?${qs({
      query: p.q,
      offset: (p.page - 1) * p.perPage,
      limit: p.perPage,
      fields: PAPER_FIELDS,
      year,
    })}${p.openAccess ? '&openAccessPdf' : ''}`,
    { headers: headers(), timeoutMs: 7000 },
  );
  return {
    source: 'semanticscholar',
    total: data.total ?? 0,
    papers: (data.data ?? []).map(mapPaper).filter((x): x is Paper => !!x),
  };
}

/** id: S2 paper id, or "DOI:…", "ARXIV:…", "PMID:…". */
export async function getPaper(id: string): Promise<Paper | null> {
  const p = await fetchJson<S2Paper>(`${BASE}/paper/${encodeURIComponent(id)}?fields=${PAPER_FIELDS},tldr`, {
    headers: headers(),
    timeoutMs: 6000,
  }).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  return p ? mapPaper(p) : null;
}

interface S2Author {
  authorId: string;
  name: string;
  affiliations?: string[];
  hIndex?: number;
  paperCount?: number;
  citationCount?: number;
  homepage?: string;
  url?: string;
  externalIds?: { ORCID?: string };
}

const AUTHOR_FIELDS = 'name,affiliations,hIndex,paperCount,citationCount,homepage,url,externalIds';

function mapAuthor(a: S2Author): AuthorSummary {
  return {
    id: `s2:${a.authorId}`,
    name: a.name,
    affiliation: a.affiliations?.[0],
    worksCount: a.paperCount,
    citationCount: a.citationCount,
    hIndex: a.hIndex,
    orcid: a.externalIds?.ORCID ? `https://orcid.org/${a.externalIds.ORCID}` : undefined,
  };
}

export async function searchAuthors(q: string, limit = 5): Promise<AuthorSummary[]> {
  const data = await fetchJson<{ data?: S2Author[] }>(
    `${BASE}/author/search?${qs({ query: q, limit, fields: AUTHOR_FIELDS })}`,
    { headers: headers(), timeoutMs: 6000 },
  );
  return (data.data ?? []).map(mapAuthor);
}

export async function getAuthor(authorId: string): Promise<AuthorProfile | null> {
  const a = await fetchJson<S2Author>(`${BASE}/author/${authorId}?fields=${AUTHOR_FIELDS}`, { headers: headers() }).catch(
    (e) => {
      if (e.status === 404) return null;
      throw e;
    },
  );
  if (!a) return null;
  const papersRes = await fetchJson<{ data?: S2Paper[] }>(
    `${BASE}/author/${authorId}/papers?${qs({ limit: 100, fields: PAPER_FIELDS })}`,
    { headers: headers() },
  );
  const papers = (papersRes.data ?? [])
    .map(mapPaper)
    .filter((x): x is Paper => !!x)
    .sort((x, y) => (y.citationCount ?? 0) - (x.citationCount ?? 0))
    .slice(0, 50);

  const co = new Map<string, { id?: string; name: string; count: number }>();
  for (const p of papers)
    for (const au of p.authors) {
      if (au.id === `s2:${authorId}`) continue;
      const key = au.id ?? au.name.toLowerCase();
      const e = co.get(key) ?? { id: au.id, name: au.name, count: 0 };
      e.count++;
      co.set(key, e);
    }

  return {
    ...mapAuthor(a),
    institutions: (a.affiliations ?? []).map((name) => ({ name })),
    pastAffiliations: [],
    homepage: a.homepage,
    externalUrl: a.url,
    countsByYear: [],
    papers,
    coAuthors: [...co.values()].sort((x, y) => y.count - x.count).slice(0, 20),
    source: 'semanticscholar',
  };
}
