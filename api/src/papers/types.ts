export type SourceName = 'openalex' | 'semanticscholar' | 'crossref' | 'core' | 'arxiv' | 'pubmed' | 'scirah';

export type SearchMode = 'keyword' | 'author' | 'subject';
export type SortMode = 'relevance' | 'citations' | 'newest';

export interface PaperIds {
  openalex?: string; // W123…
  doi?: string; // lower-cased, no https://doi.org/ prefix
  arxiv?: string; // 2101.00001 (no version)
  pmid?: string;
  s2?: string;
  core?: string;
  /** Papers added manually on SciRah (uuid of the user_papers row). */
  scirah?: string;
}

export interface PaperAuthor {
  name: string;
  /** SciRah author id: "openalex:A123" or "s2:123" — present when we can show a profile page. */
  id?: string;
  orcid?: string;
  affiliation?: string;
  institutionId?: string; // OpenAlex I123…
  institutionUrl?: string; // ROR / homepage
  /** Every affiliation exactly as printed on the paper (e.g. "School of …, Beijing 100049, PR China"). */
  affiliations?: string[];
  /** Marked as corresponding author on the paper. */
  corresponding?: boolean;
}

export interface PaperTopic {
  id?: string; // OpenAlex T123…
  name: string;
  score?: number;
  subfieldId?: string; // numeric string, e.g. "1702"
  subfield?: string;
  fieldId?: string;
  field?: string;
}

export interface Paper {
  /** Canonical SciRah id, e.g. "openalex:W123", "doi:10.1/abc", "arxiv:2101.00001". */
  id: string;
  ids: PaperIds;
  title: string;
  abstract?: string;
  tldr?: string;
  authors: PaperAuthor[];
  venue?: string;
  /** OpenAlex source (journal / repository) id, S123… — for the venue profile page. */
  venueId?: string;
  publisher?: string;
  /** OpenAlex publisher id, P123…. */
  publisherId?: string;
  year?: number;
  publishedDate?: string;
  type?: string;
  citationCount?: number;
  referenceCount?: number;
  isOpenAccess: boolean;
  /** Landing page at the original publisher / repository. We never host the paper. */
  sourceUrl?: string;
  /** Link to an open-access copy at the original host (only a link, never proxied). */
  oaUrl?: string;
  /** Direct link to an open-access PDF, when one is known (shown in SciRah's reader). */
  pdfUrl?: string;
  topics: PaperTopic[];
  sources: SourceName[];
}

export interface SearchParams {
  q: string;
  mode: SearchMode;
  page: number;
  perPage: number;
  sort: SortMode;
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  /** Only works with at least one author at a Pakistani institution (OpenAlex only). */
  pakistan?: boolean;

  // ---- advanced filters (OpenAlex metadata; other sources are skipped when any is set) ----
  /** ISO 3166-1 alpha-2 codes (lower-case) of author institutions, OR-ed. */
  countries?: string[];
  /** africa | asia | europe | north_america | oceania | south_america | antarctica */
  continent?: string;
  /** At least one author institution in the Global South. */
  globalSouth?: boolean;
  /** OpenAlex institution id (I123…), including its sub-institutions. */
  institution?: string;
  /** OpenAlex work types, OR-ed (article, review, preprint, book-chapter, …). */
  types?: string[];
  /** ISO 639-1 language code. */
  language?: string;
  /** OpenAlex field id (11–36) of the primary topic. */
  field?: string;
  /** OpenAlex topic id (T123…) — any of the work's topics. */
  topic?: string;
  /** journal | conference | repository | book series | ebook platform */
  venueType?: string;
  minCitations?: number;
  hasAbstract?: boolean;
  excludeRetracted?: boolean;
}

/** True when the search uses filters only OpenAlex can apply. */
export function usesAdvancedFilters(p: SearchParams): boolean {
  return !!(
    p.pakistan ||
    p.countries?.length ||
    p.continent ||
    p.globalSouth ||
    p.institution ||
    p.types?.length ||
    p.language ||
    p.field ||
    p.topic ||
    p.venueType ||
    p.minCitations ||
    p.hasAbstract
  );
}

export interface SourceResult {
  source: SourceName;
  papers: Paper[];
  total: number;
}

export interface SourceStatus {
  source: SourceName;
  ok: boolean;
  count: number;
  error?: string;
  skipped?: string;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  page: number;
  perPage: number;
  total: number;
  results: Paper[];
  sources: SourceStatus[];
  authors?: AuthorSummary[];
  /** Set in subject mode when the query matched an OpenAlex field/subfield/keyword/topic exactly. */
  subject?: { id: string; name: string; level: 'field' | 'subfield' | 'keyword' | 'topic' };
}

export interface AuthorSummary {
  id: string; // "openalex:A123" | "s2:123"
  name: string;
  affiliation?: string;
  worksCount?: number;
  citationCount?: number;
  hIndex?: number;
  orcid?: string;
  topics?: string[];
}

export interface Institution {
  id?: string;
  name: string;
  countryCode?: string;
  url?: string;
}

export interface AuthorProfile extends AuthorSummary {
  i10Index?: number;
  institutions: Institution[];
  pastAffiliations: { name: string; years: number[]; url?: string }[];
  homepage?: string;
  externalUrl?: string;
  countsByYear: { year: number; works: number; citations: number }[];
  papers: Paper[];
  coAuthors: { id?: string; name: string; count: number; affiliation?: string }[];
  source: SourceName;
}

export function normalizeDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  const d = doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
  return d.startsWith('10.') ? d : undefined;
}

export function normalizeArxiv(id?: string | null): string | undefined {
  if (!id) return undefined;
  const m = id.trim().match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?([a-z\-.]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/i);
  return m ? m[1].toLowerCase() : undefined;
}

/** Choose the most stable id available, in priority order. */
export function canonicalId(ids: PaperIds): string | undefined {
  if (ids.openalex) return `openalex:${ids.openalex}`;
  if (ids.doi) return `doi:${ids.doi}`;
  if (ids.arxiv) return `arxiv:${ids.arxiv}`;
  if (ids.pmid) return `pmid:${ids.pmid}`;
  if (ids.s2) return `s2:${ids.s2}`;
  if (ids.core) return `core:${ids.core}`;
  if (ids.scirah) return `scirah:${ids.scirah}`;
  return undefined;
}

export function parseId(id: string): { kind: keyof PaperIds; value: string } | null {
  const i = id.indexOf(':');
  if (i < 0) return null;
  const kind = id.slice(0, i) as keyof PaperIds;
  const value = id.slice(i + 1).trim();
  if (!value || !['openalex', 'doi', 'arxiv', 'pmid', 's2', 'core', 'scirah'].includes(kind)) return null;
  return { kind, value };
}

export function finalizePaper(p: Omit<Paper, 'id'> & { id?: string }): Paper | null {
  if (p.ids.doi?.startsWith('10.48550/arxiv.') && !p.ids.arxiv) {
    p.ids.arxiv = normalizeArxiv(p.ids.doi.slice('10.48550/arxiv.'.length));
  }
  if (!p.pdfUrl && p.ids.arxiv) p.pdfUrl = `https://arxiv.org/pdf/${p.ids.arxiv}`;
  const id = canonicalId(p.ids);
  if (!id || !p.title) return null;
  return { ...p, id, title: p.title.replace(/\s+/g, ' ').trim() };
}
