import { config } from '../../config.js';
import { fetchJson, fetchText, qs, stripTags } from '../../common/http.js';
import { finalizePaper, normalizeDoi, type Paper, type SearchParams, type SourceResult } from '../types.js';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const common = () => ({ tool: 'scirah', email: config.contactEmail, api_key: config.ncbiApiKey });

interface ESummary {
  uid: string;
  title?: string;
  authors?: { name: string; authtype?: string }[];
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  articleids?: { idtype: string; value: string }[];
  pubtype?: string[];
}

function buildTerm(p: SearchParams): string {
  const q = p.q.trim();
  let term = p.mode === 'author' ? `${q}[Author]` : p.mode === 'subject' ? `(${q}[MeSH Terms] OR ${q}[Title])` : q;
  if (p.yearFrom || p.yearTo) term += ` AND ${p.yearFrom ?? 1800}:${p.yearTo ?? 3000}[dp]`;
  if (p.openAccess) term += ' AND free full text[sb]';
  return term;
}

function mapSummary(s: ESummary): Paper | null {
  const doi = normalizeDoi(s.articleids?.find((a) => a.idtype === 'doi')?.value);
  const pmc = s.articleids?.find((a) => a.idtype === 'pmc')?.value;
  const year = Number((s.sortpubdate ?? s.pubdate ?? '').slice(0, 4)) || undefined;
  return finalizePaper({
    ids: { pmid: s.uid, doi },
    title: (s.title ?? '').replace(/\.$/, ''),
    authors: (s.authors ?? []).filter((a) => a.authtype !== 'CollectiveName' || a.name).map((a) => ({ name: a.name })),
    venue: s.fulljournalname ?? s.source,
    year,
    publishedDate: s.sortpubdate?.slice(0, 10).replace(/\//g, '-'),
    type: s.pubtype?.[0]?.toLowerCase(),
    isOpenAccess: !!pmc,
    sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${s.uid}/`,
    oaUrl: pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc}/` : undefined,
    topics: [],
    sources: ['pubmed'],
  });
}

async function summaries(ids: string[]): Promise<Paper[]> {
  if (!ids.length) return [];
  const data = await fetchJson<{ result: Record<string, ESummary> & { uids: string[] } }>(
    `${BASE}/esummary.fcgi?${qs({ db: 'pubmed', id: ids.join(','), retmode: 'json', ...common() })}`,
  );
  return (data.result?.uids ?? []).map((uid) => mapSummary(data.result[uid] as ESummary)).filter((x): x is Paper => !!x);
}

export async function search(p: SearchParams): Promise<SourceResult> {
  const es = await fetchJson<{ esearchresult: { count: string; idlist: string[] } }>(
    `${BASE}/esearch.fcgi?${qs({
      db: 'pubmed',
      term: buildTerm(p),
      retmode: 'json',
      retmax: p.perPage,
      retstart: (p.page - 1) * p.perPage,
      sort: p.sort === 'newest' ? 'pub_date' : 'relevance',
      ...common(),
    })}`,
    { timeoutMs: 8000 },
  );
  const papers = await summaries(es.esearchresult.idlist);
  return { source: 'pubmed', total: Number(es.esearchresult.count) || 0, papers };
}

export async function getAbstract(pmid: string): Promise<string | undefined> {
  const xml = await fetchText(`${BASE}/efetch.fcgi?${qs({ db: 'pubmed', id: pmid, retmode: 'xml', ...common() })}`);
  const parts = [...xml.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((m) => {
    const label = m[1].match(/Label="([^"]+)"/)?.[1];
    const text = stripTags(m[2]) ?? '';
    return label ? `${label.charAt(0) + label.slice(1).toLowerCase()}: ${text}` : text;
  });
  return parts.join(' ').trim() || undefined;
}

export async function getPaper(pmid: string): Promise<Paper | null> {
  const [paper] = await summaries([pmid]);
  if (!paper) return null;
  paper.abstract = await getAbstract(pmid).catch(() => undefined);
  return paper;
}
