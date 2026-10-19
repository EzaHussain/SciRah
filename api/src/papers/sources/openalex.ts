import { config } from '../../config.js';
import { fetchJson, qs } from '../../common/http.js';
import {
  finalizePaper,
  normalizeDoi,
  type AuthorProfile,
  type AuthorSummary,
  type Paper,
  type PaperTopic,
  type SearchParams,
  type SourceResult,
} from '../types.js';

const BASE = 'https://api.openalex.org';
const WORK_FIELDS = [
  'id',
  'doi',
  'display_name',
  'publication_year',
  'publication_date',
  'ids',
  'primary_location',
  'best_oa_location',
  'type',
  'open_access',
  'authorships',
  'cited_by_count',
  'referenced_works_count',
  'abstract_inverted_index',
  'topics',
].join(',');

function url(path: string, params: Record<string, string | number | undefined> = {}) {
  return `${BASE}${path}?${qs({ ...params, mailto: config.contactEmail, api_key: config.openAlexApiKey })}`;
}

const short = (id?: string | null) => (id ? id.replace('https://openalex.org/', '').replace(/^.*\//, '') : undefined);

// ---- raw shapes (only the bits we read) ----
interface OAInstitution {
  id?: string;
  display_name?: string;
  ror?: string;
  country_code?: string;
}
interface OAWork {
  id: string;
  doi?: string;
  display_name?: string;
  publication_year?: number;
  publication_date?: string;
  ids?: { pmid?: string };
  type?: string;
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string;
    source?: { id?: string; display_name?: string; host_organization?: string; host_organization_name?: string };
  };
  best_oa_location?: { landing_page_url?: string; pdf_url?: string };
  open_access?: { is_oa?: boolean; oa_url?: string };
  authorships?: {
    author?: { id?: string; display_name?: string; orcid?: string };
    institutions?: OAInstitution[];
    raw_affiliation_strings?: string[];
    is_corresponding?: boolean;
  }[];
  cited_by_count?: number;
  referenced_works_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  topics?: {
    id: string;
    display_name: string;
    score?: number;
    subfield?: { id: string; display_name: string };
    field?: { id: string; display_name: string };
  }[];
}
interface OAList<T> {
  meta: { count: number };
  results: T[];
}
interface OAAuthor {
  id: string;
  display_name: string;
  orcid?: string;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: { h_index?: number; i10_index?: number };
  last_known_institutions?: OAInstitution[];
  affiliations?: { institution: OAInstitution; years: number[] }[];
  topics?: { display_name: string }[];
  counts_by_year?: { year: number; works_count: number; cited_by_count: number }[];
}

export function rebuildAbstract(index?: Record<string, number[]> | null): string | undefined {
  if (!index) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  const text = words.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 20 ? text : undefined;
}

export function mapTopics(topics: OAWork['topics']): PaperTopic[] {
  return (topics ?? []).map((t) => ({
    id: short(t.id),
    name: t.display_name,
    score: t.score,
    subfieldId: short(t.subfield?.id),
    subfield: t.subfield?.display_name,
    fieldId: short(t.field?.id),
    field: t.field?.display_name,
  }));
}

/** Clean and de-duplicate affiliation strings (some records repeat one affiliation or join two with ";"). */
function uniqueAffiliations(list: string[]): string[] | undefined {
  const seen = new Map<string, string>();
  for (const raw of list.flatMap((x) => x.split(/\s*;\s*(?=[A-Z])/))) {
    const s = raw.replace(/\s+/g, ' ').replace(/^[\s,.;]+|[\s,;]+$/g, '').trim();
    if (s.length < 3) continue;
    const key = s.toLowerCase();
    if (!seen.has(key)) seen.set(key, s);
  }
  return seen.size ? [...seen.values()] : undefined;
}

export function mapWork(w: OAWork): Paper | null {
  const loc = w.primary_location;
  return finalizePaper({
    ids: {
      openalex: short(w.id),
      doi: normalizeDoi(w.doi),
      pmid: w.ids?.pmid ? short(w.ids.pmid) : undefined,
    },
    title: w.display_name ?? '',
    abstract: rebuildAbstract(w.abstract_inverted_index),
    authors: (w.authorships ?? []).map((a) => {
      const inst = a.institutions?.[0];
      return {
        name: a.author?.display_name ?? 'Unknown',
        id: a.author?.id ? `openalex:${short(a.author.id)}` : undefined,
        orcid: a.author?.orcid ?? undefined,
        affiliation: inst?.display_name ?? a.raw_affiliation_strings?.[0],
        institutionId: short(inst?.id),
        institutionUrl: inst?.ror ?? undefined,
        affiliations: uniqueAffiliations(a.raw_affiliation_strings?.length ? a.raw_affiliation_strings : (a.institutions ?? []).map((i) => i.display_name ?? '')),
        corresponding: a.is_corresponding || undefined,
      };
    }),
    venue: loc?.source?.display_name,
    venueId: short(loc?.source?.id),
    publisher: loc?.source?.host_organization_name,
    publisherId: loc?.source?.host_organization?.includes('/P') ? short(loc.source.host_organization) : undefined,
    year: w.publication_year,
    publishedDate: w.publication_date,
    type: w.type,
    citationCount: w.cited_by_count,
    referenceCount: w.referenced_works_count,
    isOpenAccess: !!w.open_access?.is_oa,
    sourceUrl: loc?.landing_page_url ?? (w.doi ? w.doi : undefined),
    oaUrl: w.open_access?.oa_url ?? w.best_oa_location?.landing_page_url ?? undefined,
    pdfUrl: w.best_oa_location?.pdf_url ?? loc?.pdf_url ?? undefined,
    topics: mapTopics(w.topics),
    sources: ['openalex'],
  });
}

export function buildFilter(p: Partial<SearchParams>, extra: string[] = []): string {
  const f = [...extra, 'is_paratext:false'];
  if (p.yearFrom || p.yearTo) f.push(`publication_year:${p.yearFrom ?? ''}-${p.yearTo ?? ''}`);
  // Some records carry future (pre-announced) dates; keep "newest" to things already out.
  if (p.sort === 'newest') f.push(`to_publication_date:${new Date().toISOString().slice(0, 10)}`);
  if (p.openAccess) f.push('is_oa:true');
  const countries = new Set((p.countries ?? []).map((c) => c.toLowerCase()));
  if (p.pakistan) countries.add('pk');
  if (countries.size) f.push(`authorships.institutions.country_code:${[...countries].join('|')}`);
  if (p.continent) f.push(`authorships.institutions.continent:${p.continent}`);
  if (p.globalSouth) f.push('authorships.institutions.is_global_south:true');
  if (p.institution) f.push(`authorships.institutions.lineage:${p.institution}`);
  if (p.types?.length) f.push(`type:${p.types.join('|')}`);
  if (p.language) f.push(`language:${p.language}`);
  if (p.field) f.push(`primary_topic.field.id:${p.field}`);
  if (p.topic) f.push(`topics.id:${p.topic}`);
  if (p.venueType) f.push(`primary_location.source.type:${p.venueType}`);
  if (p.minCitations) f.push(`cited_by_count:>${p.minCitations - 1}`);
  if (p.hasAbstract) f.push('has_abstract:true');
  if (p.excludeRetracted) f.push('is_retracted:false');
  return f.join(',');
}

function sortParam(sort: SearchParams['sort'], hasSearch: boolean) {
  if (sort === 'citations') return 'cited_by_count:desc';
  if (sort === 'newest') return 'publication_date:desc';
  return hasSearch ? undefined : 'cited_by_count:desc';
}

export async function searchWorks(p: SearchParams, extraFilters: string[] = [], useSearch = true): Promise<SourceResult> {
  const data = await fetchJson<OAList<OAWork>>(
    url('/works', {
      search: useSearch ? p.q : undefined,
      filter: buildFilter(p, extraFilters),
      sort: sortParam(p.sort, useSearch),
      per_page: p.perPage,
      page: p.page,
      select: WORK_FIELDS,
    }),
  );
  return { source: 'openalex', total: data.meta.count, papers: data.results.map(mapWork).filter((x): x is Paper => !!x) };
}

/** id may be "W123", or an external id OpenAlex understands: "doi:10.x/y", "pmid:123". */
export async function getWork(id: string): Promise<Paper | null> {
  const path = id.startsWith('doi:') ? `/works/https://doi.org/${id.slice(4)}` : `/works/${id}`;
  const w = await fetchJson<OAWork>(url(path, { select: WORK_FIELDS })).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  return w ? mapWork(w) : null;
}

function mapAuthorSummary(a: OAAuthor): AuthorSummary {
  return {
    id: `openalex:${short(a.id)}`,
    name: a.display_name,
    affiliation: a.last_known_institutions?.[0]?.display_name,
    worksCount: a.works_count,
    citationCount: a.cited_by_count,
    hIndex: a.summary_stats?.h_index,
    orcid: a.orcid ?? undefined,
    topics: (a.topics ?? []).slice(0, 3).map((t) => t.display_name),
  };
}

export async function searchAuthors(q: string, limit = 5, pakistan = false): Promise<AuthorSummary[]> {
  const data = await fetchJson<OAList<OAAuthor>>(
    url('/authors', {
      search: q,
      per_page: limit,
      filter: pakistan ? 'last_known_institutions.country_code:pk' : undefined,
    }),
  );
  return data.results.map(mapAuthorSummary);
}

export interface SubjectMatch {
  level: 'field' | 'subfield' | 'keyword' | 'topic';
  id: string;
  name: string;
}

const SUBJECT_LEVELS = [
  ['fields', 'field'],
  ['subfields', 'subfield'],
  ['keywords', 'keyword'],
  ['topics', 'topic'],
] as const;

/**
 * Map a free-text subject onto OpenAlex's taxonomy by exact (case-insensitive) name:
 * a field ("Computer Science"), subfield ("Agronomy and Crop Science"), keyword
 * ("Machine learning") or topic. Returns null when nothing matches exactly, in which
 * case the caller falls back to a keyword search rather than guessing a narrow topic.
 */
export async function findSubject(q: string): Promise<SubjectMatch | null> {
  type Named = { id: string; display_name: string };
  const lists = await Promise.all(
    SUBJECT_LEVELS.map(([path]) =>
      fetchJson<OAList<Named>>(url(`/${path}`, { search: q, per_page: 5 })).catch(() => ({ results: [] as Named[] })),
    ),
  );
  const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < SUBJECT_LEVELS.length; i++) {
    const hit = lists[i].results.find((r) => r.display_name.toLowerCase() === needle);
    if (hit) return { level: SUBJECT_LEVELS[i][1], id: short(hit.id)!, name: hit.display_name };
  }
  return null;
}

export function subjectFilter(s: SubjectMatch): string {
  if (s.level === 'keyword') return `keywords.id:${s.id}`;
  if (s.level === 'topic') return `primary_topic.id:${s.id}`;
  return `primary_topic.${s.level}.id:${s.id}`;
}

export async function getAuthor(authorId: string): Promise<AuthorProfile | null> {
  const a = await fetchJson<OAAuthor>(url(`/authors/${authorId}`)).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  if (!a) return null;

  const works = await fetchJson<OAList<OAWork>>(
    url('/works', { filter: `author.id:${authorId}`, sort: 'cited_by_count:desc', per_page: 50, select: WORK_FIELDS }),
  );
  const papers = works.results.map(mapWork).filter((x): x is Paper => !!x);

  // Co-authors: count how often each other author appears on this author's top works.
  const co = new Map<string, { id?: string; name: string; count: number; affiliation?: string }>();
  const self = `openalex:${authorId}`;
  for (const p of papers) {
    for (const au of p.authors) {
      if (au.id === self) continue;
      const key = au.id ?? au.name.toLowerCase();
      const entry = co.get(key) ?? { id: au.id, name: au.name, count: 0, affiliation: au.affiliation };
      entry.count++;
      co.set(key, entry);
    }
  }

  const ror = (i: OAInstitution) => i.ror ?? (i.id ? `https://openalex.org/${short(i.id)}` : undefined);
  return {
    ...mapAuthorSummary(a),
    i10Index: a.summary_stats?.i10_index,
    institutions: (a.last_known_institutions ?? []).map((i) => ({
      id: short(i.id),
      name: i.display_name ?? 'Unknown institution',
      countryCode: i.country_code,
      url: ror(i),
    })),
    pastAffiliations: (a.affiliations ?? []).slice(0, 10).map((af) => ({
      name: af.institution.display_name ?? 'Unknown',
      years: af.years,
      url: ror(af.institution),
    })),
    externalUrl: `https://openalex.org/${authorId}`,
    countsByYear: (a.counts_by_year ?? [])
      .map((c) => ({ year: c.year, works: c.works_count, citations: c.cited_by_count }))
      .sort((x, y) => x.year - y.year),
    papers,
    coAuthors: [...co.values()].sort((x, y) => y.count - x.count).slice(0, 20),
    source: 'openalex',
  };
}

/** Recent/related works for feeds: filter by subfield ids (OR) and recency. */
export async function worksBySubfields(
  subfieldIds: string[],
  opts: { fromDate?: string; sort?: string; perPage?: number; pakistan?: boolean },
): Promise<Paper[]> {
  const filters: string[] = [];
  if (subfieldIds.length) filters.push(`topics.subfield.id:${subfieldIds.join('|')}`);
  if (opts.fromDate) filters.push(`from_publication_date:${opts.fromDate}`);
  filters.push(`to_publication_date:${new Date().toISOString().slice(0, 10)}`);
  if (opts.pakistan) filters.push('authorships.institutions.country_code:pk');
  // Real research outputs only: skips journal/issue-level records that can carry huge
  // aggregated citation counts and would otherwise dominate "most cited, recent" lists.
  // Recent citation counts are noisy; OpenAlex "core" sources (curated, established venues) keep feeds credible.
  filters.push(
    'has_abstract:true',
    'type:article|review|preprint',
    'authors_count:>0',
    'is_paratext:false',
    'primary_location.source.is_core:true',
  );
  const data = await fetchJson<OAList<OAWork>>(
    url('/works', {
      filter: filters.join(','),
      sort: opts.sort ?? 'cited_by_count:desc',
      per_page: opts.perPage ?? 25,
      select: WORK_FIELDS,
    }),
  );
  return data.results
    .map(mapWork)
    .filter((x): x is Paper => !!x && x.authors.length > 0 && x.title.toLowerCase() !== x.venue?.toLowerCase());
}

/** Institution name autocomplete (for the "Institution" search filter). */
export async function autocompleteInstitutions(q: string): Promise<{ id: string; name: string; hint?: string; works?: number }[]> {
  const data = await fetchJson<{ results: { id: string; display_name: string; hint?: string; works_count?: number }[] }>(
    url('/autocomplete/institutions', { q }),
  );
  return data.results.slice(0, 8).map((r) => ({ id: short(r.id)!, name: r.display_name, hint: r.hint ?? undefined, works: r.works_count }));
}

/**
 * Newest works for an alert topic, published on/after `fromDate`.
 * `extra` carries the topic's resolved filters (author id, subject) plus any saved search filters.
 */
export async function recentWorks(
  q: string | undefined,
  filters: Partial<SearchParams>,
  extra: string[],
  fromDate: string,
  perPage = 10,
): Promise<Paper[]> {
  const today = new Date().toISOString().slice(0, 10);
  const f = buildFilter({ ...filters, sort: undefined, yearFrom: undefined, yearTo: undefined }, [
    ...extra,
    `from_publication_date:${fromDate}`,
    `to_publication_date:${today}`,
    'type:article|review|preprint|book-chapter|dissertation|report',
  ]);
  const data = await fetchJson<OAList<OAWork>>(
    url('/works', { search: q, filter: f, sort: 'publication_date:desc', per_page: perPage, select: WORK_FIELDS }),
  );
  return data.results.map(mapWork).filter((x): x is Paper => !!x && x.authors.length > 0);
}

// ---------------------------------------------------------------------------
// Research landscape ("insights"): counts grouped by country, institution, author, year, topic.
// ---------------------------------------------------------------------------

export interface GroupCount {
  key: string;
  name: string;
  count: number;
}

/** OpenAlex group_by over the same works a search would return (top 200 groups). */
export async function groupWorks(
  p: Partial<SearchParams> & { q?: string },
  groupBy: string,
  extraFilters: string[] = [],
  useSearch = true,
): Promise<GroupCount[]> {
  const data = await fetchJson<{ group_by?: { key: string; key_display_name: string; count: number }[] }>(
    url('/works', {
      search: useSearch ? p.q : undefined,
      filter: buildFilter({ ...p, sort: undefined }, extraFilters),
      group_by: groupBy,
    }),
    { timeoutMs: 15_000 },
  );
  return (data.group_by ?? [])
    .filter((g) => g.key && g.key !== 'unknown')
    .map((g) => ({ key: short(g.key)!, name: g.key_display_name, count: g.count }));
}

export interface InstitutionGeo {
  id: string;
  name: string;
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

/** Locations of up to 100 institutions (for map pins). */
export async function institutionsGeo(ids: string[]): Promise<InstitutionGeo[]> {
  if (!ids.length) return [];
  type Raw = { id: string; display_name: string; geo?: { city?: string; country_code?: string; latitude?: number; longitude?: number } };
  const data = await fetchJson<OAList<Raw>>(
    url('/institutions', { filter: `openalex:${ids.slice(0, 100).join('|')}`, per_page: 100, select: 'id,display_name,geo' }),
    { timeoutMs: 15_000 },
  );
  return data.results.map((i) => ({
    id: short(i.id)!,
    name: i.display_name,
    city: i.geo?.city,
    countryCode: i.geo?.country_code?.toLowerCase(),
    lat: i.geo?.latitude,
    lng: i.geo?.longitude,
  }));
}

// ---------------------------------------------------------------------------
// Venue profiles: journals / repositories (S…) and publishers (P…).
// ---------------------------------------------------------------------------

export interface VenueProfile {
  id: string;
  kind: 'source' | 'publisher';
  name: string;
  type?: string;
  publisher?: string;
  publisherId?: string;
  parentPublisher?: string;
  issn?: string[];
  homepage?: string;
  countryCodes: string[];
  worksCount?: number;
  oaWorksCount?: number;
  citedByCount?: number;
  hIndex?: number;
  i10Index?: number;
  meanCitedness?: number;
  isOa?: boolean;
  isInDoaj?: boolean;
  apcUsd?: number;
  firstYear?: number;
  topics: string[];
  countsByYear: { year: number; works: number; citations: number }[];
  topPapers: Paper[];
  recentPapers: Paper[];
}

interface OAVenue {
  id: string;
  display_name: string;
  type?: string;
  issn?: string[] | null;
  host_organization?: string | null;
  host_organization_name?: string | null;
  parent_publisher?: { id?: string; display_name?: string } | string | null;
  homepage_url?: string | null;
  country_code?: string | null;
  country_codes?: string[] | null;
  works_count?: number;
  oa_works_count?: number;
  cited_by_count?: number;
  summary_stats?: { h_index?: number; i10_index?: number; '2yr_mean_citedness'?: number };
  is_oa?: boolean;
  is_in_doaj?: boolean;
  apc_usd?: number | null;
  first_publication_year?: number | null;
  topics?: { display_name: string }[];
  counts_by_year?: { year: number; works_count: number; cited_by_count: number }[];
}

export async function getVenue(id: string): Promise<VenueProfile | null> {
  const kind = id.startsWith('P') ? 'publisher' : 'source';
  const v = await fetchJson<OAVenue>(url(`/${kind === 'publisher' ? 'publishers' : 'sources'}/${id}`)).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  if (!v) return null;

  const venueFilter = kind === 'publisher' ? `primary_location.source.publisher_lineage:${id}` : `primary_location.source.id:${id}`;
  const works = (sort: string, extra: string[] = []) =>
    fetchJson<OAList<OAWork>>(
      url('/works', { filter: [venueFilter, 'is_paratext:false', ...extra].join(','), sort, per_page: 10, select: WORK_FIELDS }),
    )
      .then((d) => d.results.map(mapWork).filter((x): x is Paper => !!x))
      .catch(() => [] as Paper[]);
  const today = new Date().toISOString().slice(0, 10);
  const [topPapers, recentPapers] = await Promise.all([
    works('cited_by_count:desc'),
    works('publication_date:desc', [`to_publication_date:${today}`]),
  ]);

  const parent = typeof v.parent_publisher === 'string' ? undefined : v.parent_publisher?.display_name;
  return {
    id,
    kind,
    name: v.display_name,
    type: v.type,
    publisher: v.host_organization_name ?? undefined,
    publisherId: v.host_organization?.includes('/P') ? short(v.host_organization) : undefined,
    parentPublisher: parent,
    issn: v.issn ?? undefined,
    homepage: v.homepage_url ?? undefined,
    countryCodes: (v.country_codes ?? (v.country_code ? [v.country_code] : [])).map((c) => c.toLowerCase()),
    worksCount: v.works_count,
    oaWorksCount: v.oa_works_count,
    citedByCount: v.cited_by_count,
    hIndex: v.summary_stats?.h_index,
    i10Index: v.summary_stats?.i10_index,
    meanCitedness: v.summary_stats?.['2yr_mean_citedness'],
    isOa: v.is_oa,
    isInDoaj: v.is_in_doaj,
    apcUsd: v.apc_usd ?? undefined,
    firstYear: v.first_publication_year ?? undefined,
    topics: (v.topics ?? []).slice(0, 8).map((t) => t.display_name),
    countsByYear: (v.counts_by_year ?? [])
      .map((c) => ({ year: c.year, works: c.works_count, citations: c.cited_by_count }))
      .sort((a, b) => a.year - b.year),
    topPapers,
    recentPapers,
  };
}

// ---------------------------------------------------------------------------
// SciRah Score inputs: every work's citations, field-normalised percentile and grants.
// ---------------------------------------------------------------------------

export interface ScoreWork {
  citations: number;
  /** Citation percentile among works of the same field and year (0–1), when OpenAlex has one. */
  percentile?: number;
  awards: string[];
}

/** Up to `max` of an author's works (most-cited first). */
export async function authorScoreWorks(authorId: string, max = 1000): Promise<{ works: ScoreWork[]; total: number }> {
  type Raw = {
    cited_by_count?: number;
    citation_normalized_percentile?: { value?: number } | null;
    awards?: { id?: string; funder_award_id?: string | null; funder_id?: string | null }[] | null;
  };
  const works: ScoreWork[] = [];
  let total = 0;
  // Page-based paging (cursor paging needs an OpenAlex API key; 5 pages of 200 is plenty here).
  for (let page = 1; works.length < max; page++) {
    const data: OAList<Raw> = await fetchJson(
      url('/works', {
        filter: `author.id:${authorId},is_paratext:false`,
        sort: 'cited_by_count:desc',
        per_page: 200,
        page,
        select: 'cited_by_count,citation_normalized_percentile,awards',
      }),
      { timeoutMs: 20_000 },
    );
    total = data.meta.count;
    for (const w of data.results) {
      works.push({
        citations: w.cited_by_count ?? 0,
        percentile: w.citation_normalized_percentile?.value ?? undefined,
        awards: (w.awards ?? [])
          .map((a) => (a.funder_award_id ? `${a.funder_id}:${a.funder_award_id}` : (a.id ?? '')))
          .filter(Boolean),
      });
    }
    if (data.results.length < 200 || page >= 5) break;
  }
  return { works, total };
}
