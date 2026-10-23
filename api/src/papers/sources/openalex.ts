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

/**
 * OpenAlex's "last known institutions" includes any institution on the author's single most recent
 * paper (e.g. a one-off collaboration). Prefer the one with the longest affiliation history.
 */
function mainKnownInstitution(a: OAAuthor): OAInstitution | undefined {
  const years = new Map((a.affiliations ?? []).map((af) => [af.institution.id, af.years.length]));
  return [...(a.last_known_institutions ?? [])].sort((x, y) => (years.get(y.id) ?? 0) - (years.get(x.id) ?? 0))[0];
}

/**
 * The author's current institution(s), from their OWN affiliation on their most recent papers (not
 * their co-authors'): an institution counts only if it appears on a real share of those papers.
 */
function currentInstitutions(authorId: string, recent: OAWork[]): { institutions: OAInstitution[]; department?: string } {
  const counts = new Map<string, { inst: OAInstitution; n: number }>();
  const raw = new Map<string, number>();
  let withAffiliation = 0;
  for (const w of recent) {
    const me = w.authorships?.find((x) => short(x.author?.id) === authorId);
    const insts = (me?.institutions ?? []).filter((i) => i.id);
    if (!insts.length) continue;
    withAffiliation++;
    for (const i of insts) {
      const e = counts.get(i.id!) ?? { inst: i, n: 0 };
      e.n++;
      counts.set(i.id!, e);
    }
    for (const r of me?.raw_affiliation_strings ?? []) raw.set(r.trim(), (raw.get(r.trim()) ?? 0) + 1);
  }
  if (!withAffiliation) return { institutions: [] };
  const sorted = [...counts.values()].sort((x, y) => y.n - x.n);
  const threshold = Math.max(2, Math.ceil(withAffiliation * 0.25));
  const kept = sorted.filter((e, i) => i === 0 || e.n >= threshold).map((e) => e.inst);
  // The most common way the author writes their affiliation (department / campus), for the top institution.
  const topName = kept[0]?.display_name?.toLowerCase() ?? '';
  const department = [...raw.entries()]
    .filter(([r]) => !topName || r.toLowerCase().includes(topName.split(' ')[0]))
    .sort((x, y) => y[1] - x[1])[0]?.[0];
  return { institutions: kept, department: department && department.length <= 220 ? department : undefined };
}

function mapAuthorSummary(a: OAAuthor): AuthorSummary {
  return {
    id: `openalex:${short(a.id)}`,
    name: a.display_name,
    affiliation: mainKnownInstitution(a)?.display_name,
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

  const today = new Date().toISOString().slice(0, 10);
  const [works, recent] = await Promise.all([
    fetchJson<OAList<OAWork>>(url('/works', { filter: `author.id:${authorId}`, sort: 'cited_by_count:desc', per_page: 50, select: WORK_FIELDS })),
    fetchJson<OAList<OAWork>>(
      url('/works', {
        filter: `author.id:${authorId},to_publication_date:${today}`,
        sort: 'publication_date:desc',
        per_page: 25,
        select: 'id,publication_date,authorships',
      }),
    ).catch(() => ({ meta: { count: 0 }, results: [] as OAWork[] })),
  ]);
  const papers = works.results.map(mapWork).filter((x): x is Paper => !!x);
  const current = currentInstitutions(authorId, recent.results);
  const fallback = mainKnownInstitution(a);
  const institutionsNow = current.institutions.length ? current.institutions : fallback ? [fallback] : [];

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
    affiliation: institutionsNow[0]?.display_name,
    department: current.department,
    institutions: institutionsNow.map((i) => ({
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

export interface Suggestion {
  id: string;
  name: string;
  /** Institution (authors), field (subjects) or authors (papers). */
  hint?: string;
  works?: number;
  citations?: number;
  /** Keyword search only: a search phrase to complete the query, or a paper to open directly. */
  kind?: 'query' | 'paper';
}

/**
 * Type-ahead suggestions while the user is typing (OpenAlex autocomplete): author names, subjects, or —
 * for keyword search — common search phrases plus a few matching paper titles.
 */
export async function autocomplete(kind: 'authors' | 'subjects' | 'keywords', q: string): Promise<Suggestion[]> {
  type Row = { id: string; display_name: string; hint?: string | null; works_count?: number; cited_by_count?: number };
  const get = (entity: string) => fetchJson<{ results: Row[] }>(url(`/autocomplete/${entity}`, { q })).then((d) => d.results);
  if (kind === 'keywords') {
    const [phrases, papers] = await Promise.allSettled([get('keywords'), get('works')]);
    const list = (r: PromiseSettledResult<Row[]>) => (r.status === 'fulfilled' ? r.value : []);
    return [
      ...list(phrases)
        .slice(0, 6)
        .map((r) => ({ id: short(r.id)!, name: r.display_name, works: r.works_count, kind: 'query' as const })),
      ...list(papers)
        .slice(0, 3)
        .map((r) => ({ id: short(r.id)!, name: r.display_name, hint: r.hint ?? undefined, citations: r.cited_by_count, kind: 'paper' as const })),
    ];
  }
  const rows =
    kind === 'authors'
      ? await get('authors')
      : (await Promise.allSettled(['fields', 'subfields', 'topics', 'keywords'].map(get))).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return rows
    // OpenAlex's hint for authors is their "last known" institution, which can be a one-off collaboration — leave it out.
    .map((r) => ({ id: short(r.id)!, name: r.display_name, hint: kind === 'subjects' ? (r.hint ?? undefined) : undefined, works: r.works_count, citations: r.cited_by_count }))
    // Best-known first: most-cited researchers, largest subjects.
    .sort((a, b) => (kind === 'subjects' ? (b.works ?? 0) - (a.works ?? 0) : (b.citations ?? 0) - (a.citations ?? 0)))
    .slice(0, 8);
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

/** Every work by an author (up to `max`, most-cited first) with its DOI and OpenAlex citation count. */
export async function authorWorkCitations(authorId: string, max = 1000): Promise<{ id?: string; doi?: string; citations: number }[]> {
  const out: { id?: string; doi?: string; citations: number }[] = [];
  for (let page = 1; out.length < max; page++) {
    const data: OAList<{ id?: string; doi?: string | null; cited_by_count?: number }> = await fetchJson(
      url('/works', { filter: `author.id:${authorId},is_paratext:false`, sort: 'cited_by_count:desc', per_page: 200, page, select: 'id,doi,cited_by_count' }),
      { timeoutMs: 20_000 },
    );
    for (const w of data.results) out.push({ id: short(w.id), doi: normalizeDoi(w.doi ?? undefined) ?? undefined, citations: w.cited_by_count ?? 0 });
    if (data.results.length < 200 || page >= 5) break;
  }
  return out;
}

/**
 * The organisation part of a web or email domain: "lahore.comsats.edu.pk" -> "comsats.edu.pk",
 * "www.ox.ac.uk" -> "ox.ac.uk", "mit.edu" -> "mit.edu".
 */
export function orgDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  const twoLevel = parts.length >= 3 && parts[parts.length - 1].length === 2 && ['edu', 'ac', 'com', 'org', 'gov', 'net', 'co', 'gob', 'res'].includes(parts[parts.length - 2]);
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

/** Web domains (organisation part) of institutions and the institutions linked to them (e.g. other campuses). */
export async function institutionDomains(ids: string[]): Promise<string[]> {
  type Inst = { id: string; homepage_url?: string | null; associated_institutions?: { id: string }[] };
  const fetchInst = async (list: string[]) =>
    list.length
      ? (await fetchJson<OAList<Inst>>(url('/institutions', { filter: `openalex:${list.slice(0, 50).join('|')}`, per_page: 50, select: 'id,homepage_url,associated_institutions' }))).results
      : [];
  const main = await fetchInst(ids);
  const linked = await fetchInst([...new Set(main.flatMap((i) => (i.associated_institutions ?? []).map((a) => short(a.id)!)))].filter((id) => !ids.includes(id))).catch(() => []);
  const domains = new Set<string>();
  for (const i of [...main, ...linked]) {
    try {
      if (i.homepage_url) domains.add(orgDomain(new URL(i.homepage_url).hostname));
    } catch {
      /* ignore malformed homepages */
    }
  }
  return [...domains];
}

// ---- Explore pages (Authors, Pakistan, Topics, Journals) ----

export interface TopAuthor {
  id: string;
  name: string;
  institution?: string;
  works?: number;
  citations?: number;
  hIndex?: number;
}

/**
 * The most-cited researchers who currently work in a country. OpenAlex's "last known institution" also
 * lists one-off collaborations, so each candidate is re-checked against their own affiliation on their
 * recent papers (same rule as author profiles) and dropped unless they really work there.
 */
export async function topAuthorsInCountry(countryCode: string, want = 24): Promise<TopAuthor[]> {
  const cc = countryCode.toLowerCase();
  const candidates = await fetchJson<OAList<OAAuthor>>(
    url('/authors', { filter: `last_known_institutions.country_code:${cc}`, sort: 'cited_by_count:desc', per_page: 60 }),
    { timeoutMs: 20_000 },
  );
  const today = new Date().toISOString().slice(0, 10);
  const out: TopAuthor[] = [];
  const list = candidates.results;
  for (let i = 0; i < list.length && out.length < want; i += 8) {
    const checked = await Promise.all(
      list.slice(i, i + 8).map(async (a) => {
        const id = short(a.id)!;
        const recent = await fetchJson<OAList<OAWork>>(
          url('/works', { filter: `author.id:${id},to_publication_date:${today}`, sort: 'publication_date:desc', per_page: 25, select: 'id,publication_date,authorships' }),
        ).catch(() => null);
        if (!recent) return null;
        const inst = currentInstitutions(id, recent.results).institutions.find((x) => x.country_code?.toLowerCase() === cc);
        if (!inst) return null;
        return {
          id: `openalex:${id}`,
          name: a.display_name ?? 'Unknown',
          institution: inst.display_name ?? undefined,
          works: a.works_count,
          citations: a.cited_by_count,
          hIndex: a.summary_stats?.h_index,
        } satisfies TopAuthor;
      }),
    );
    for (const c of checked) if (c && out.length < want) out.push(c);
  }
  return out;
}

export interface CountryOverview {
  worksByYear: { year: number; count: number }[];
  /** Biggest institutions by papers in the last five years. */
  institutions: { id: string; name: string; city?: string; works: number }[];
  institutionCount: number;
  fields: { id: string; name: string; count: number }[];
  journals: { id: string; name: string; count: number }[];
}

/** A country's research at a glance: papers per year, biggest institutions, strongest fields and journals. */
export async function countryOverview(countryCode: string): Promise<CountryOverview> {
  const cc = countryCode.toLowerCase();
  const year = new Date().getFullYear();
  const base = `authorships.institutions.country_code:${cc},is_paratext:false`;
  const group = (filter: string, by: string) =>
    fetchJson<{ group_by?: { key: string; key_display_name: string; count: number }[] }>(url('/works', { filter, group_by: by }), { timeoutMs: 20_000 }).then(
      (d) => (d.group_by ?? []).filter((g) => g.key && g.key !== 'unknown'),
    );
  const [years, instGroups, instCount, fields, journals] = await Promise.all([
    group(`${base},publication_year:${year - 10}-${year}`, 'publication_year'),
    group(`${base},publication_year:${year - 4}-${year}`, 'authorships.institutions.id'),
    fetchJson<OAList<unknown>>(url('/institutions', { filter: `country_code:${cc}`, per_page: 1, select: 'id' })).then((d) => d.meta.count),
    group(`${base},publication_year:${year - 2}-${year}`, 'primary_topic.field.id'),
    group(`${base},publication_year:${year - 2}-${year},primary_location.source.type:journal`, 'primary_location.source.id'),
  ]);
  return {
    worksByYear: years.map((g) => ({ year: Number(g.key), count: g.count })).sort((a, b) => a.year - b.year),
    institutions: await (async () => {
      // Papers are grouped by every co-author's institution, so foreign collaborators appear too: keep this country's.
      const top = instGroups.sort((a, b) => b.count - a.count).slice(0, 80);
      const geo = new Map((await institutionsGeo(top.map((g) => short(g.key)!)).catch(() => [])).map((g) => [g.id, g]));
      return top
        .filter((g) => geo.get(short(g.key)!)?.countryCode === cc)
        .slice(0, 25)
        .map((g) => ({ id: short(g.key)!, name: g.key_display_name, city: geo.get(short(g.key)!)?.city, works: g.count }));
    })(),
    institutionCount: instCount,
    fields: fields.map((g) => ({ id: short(g.key)!, name: g.key_display_name, count: g.count })).sort((a, b) => b.count - a.count),
    journals: journals.slice(0, 24).map((g) => ({ id: short(g.key)!, name: g.key_display_name, count: g.count })),
  };
}

export interface FieldInfo {
  id: string;
  name: string;
  domain: string;
  works: number;
  subfields: { id: string; name: string }[];
}

/** OpenAlex's 26 research fields, grouped by domain, with their subfields. */
export async function allFields(): Promise<FieldInfo[]> {
  const data = await fetchJson<
    OAList<{ id: string; display_name: string; works_count: number; domain?: { display_name: string }; subfields?: { id: string; display_name: string }[] }>
  >(url('/fields', { per_page: 50, select: 'id,display_name,works_count,domain,subfields' }));
  return data.results
    .map((f) => ({
      id: short(f.id)!,
      name: f.display_name,
      domain: f.domain?.display_name ?? 'Other',
      works: f.works_count,
      subfields: (f.subfields ?? []).map((s) => ({ id: short(s.id)!, name: s.display_name })).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Type-ahead for journals (S…) and publishers (P…). */
export async function autocompleteVenues(q: string): Promise<{ id: string; name: string; hint?: string; works?: number; kind: 'journal' | 'publisher' }[]> {
  type Row = { id: string; display_name: string; hint?: string | null; works_count?: number };
  const [s, p] = await Promise.allSettled([
    fetchJson<{ results: Row[] }>(url('/autocomplete/sources', { q })),
    fetchJson<{ results: Row[] }>(url('/autocomplete/publishers', { q })),
  ]);
  const map = (r: PromiseSettledResult<{ results: Row[] }>, kind: 'journal' | 'publisher') =>
    r.status === 'fulfilled' ? r.value.results.map((x) => ({ id: short(x.id)!, name: x.display_name, hint: x.hint ?? undefined, works: x.works_count, kind })) : [];
  return [...map(s, 'journal').slice(0, 7), ...map(p, 'publisher').slice(0, 3)];
}
