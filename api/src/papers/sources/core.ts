import { config } from '../../config.js';
import { fetchJson, qs } from '../../common/http.js';
import { finalizePaper, normalizeArxiv, normalizeDoi, type Paper, type SearchParams, type SourceResult } from '../types.js';

const BASE = 'https://api.core.ac.uk/v3';

export const coreEnabled = () => !!config.coreApiKey;
const headers = () => ({ Authorization: `Bearer ${config.coreApiKey}` });

interface CoreWork {
  id: number;
  title?: string;
  authors?: { name: string }[];
  abstract?: string;
  yearPublished?: number;
  publishedDate?: string;
  doi?: string;
  arxivId?: string;
  pubmedId?: string;
  downloadUrl?: string;
  fullText?: string;
  links?: { type: string; url: string }[];
  publisher?: string;
  journals?: { title?: string }[];
  citationCount?: number;
  documentType?: string;
  fieldOfStudy?: string;
}

function mapWork(w: CoreWork): Paper | null {
  const display = w.links?.find((l) => l.type === 'display')?.url ?? `https://core.ac.uk/works/${w.id}`;
  return finalizePaper({
    ids: {
      core: String(w.id),
      doi: normalizeDoi(w.doi),
      arxiv: normalizeArxiv(w.arxivId),
      pmid: w.pubmedId || undefined,
    },
    title: w.title ?? '',
    abstract: w.abstract?.trim() || undefined,
    authors: (w.authors ?? []).map((a) => ({ name: a.name.replace(/^(.+?),\s*(.+)$/, '$2 $1') })),
    venue: w.journals?.[0]?.title,
    publisher: w.publisher?.replace(/^'|'$/g, ''),
    year: w.yearPublished,
    publishedDate: w.publishedDate?.slice(0, 10),
    type: w.documentType,
    citationCount: w.citationCount,
    // CORE aggregates open-access repositories: everything here has a free copy at the source.
    isOpenAccess: true,
    sourceUrl: w.doi ? `https://doi.org/${w.doi}` : display,
    oaUrl: w.downloadUrl || display,
    pdfUrl: w.downloadUrl || undefined,
    topics: w.fieldOfStudy ? [{ name: w.fieldOfStudy }] : [],
    sources: ['core'],
  });
}

function buildQuery(p: SearchParams): string {
  const esc = p.q.replace(/"/g, '');
  let q = p.mode === 'author' ? `authors:"${esc}"` : p.mode === 'subject' ? `(title:(${esc}) OR fieldOfStudy:"${esc}")` : esc;
  if (p.yearFrom) q += ` AND yearPublished>=${p.yearFrom}`;
  if (p.yearTo) q += ` AND yearPublished<=${p.yearTo}`;
  return q;
}

export async function search(p: SearchParams): Promise<SourceResult> {
  const data = await fetchJson<{ totalHits: number; results: CoreWork[] }>(
    `${BASE}/search/works?${qs({ q: buildQuery(p), limit: p.perPage, offset: (p.page - 1) * p.perPage })}`,
    { headers: headers(), timeoutMs: 9000 },
  );
  return {
    source: 'core',
    total: data.totalHits ?? 0,
    papers: (data.results ?? []).map(mapWork).filter((x): x is Paper => !!x),
  };
}

export async function getWork(id: string): Promise<Paper | null> {
  const w = await fetchJson<CoreWork>(`${BASE}/works/${encodeURIComponent(id)}`, { headers: headers() }).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  return w ? mapWork(w) : null;
}

/**
 * Open-access full text, used ONLY as input to the AI summary when the abstract is
 * missing. It is never stored or served to users.
 */
export async function getFullText(ref: { core?: string; doi?: string }): Promise<string | undefined> {
  if (!coreEnabled()) return undefined;
  if (ref.core) {
    const w = await fetchJson<CoreWork>(`${BASE}/works/${encodeURIComponent(ref.core)}`, { headers: headers() }).catch(
      () => null,
    );
    if (w?.fullText) return w.fullText;
  }
  if (ref.doi) {
    const data = await fetchJson<{ results: CoreWork[] }>(
      `${BASE}/search/works?${qs({ q: `doi:"${ref.doi}"`, limit: 1 })}`,
      { headers: headers() },
    ).catch(() => null);
    return data?.results?.[0]?.fullText || undefined;
  }
  return undefined;
}
