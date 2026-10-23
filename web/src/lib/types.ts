// Mirrors api/src/papers/types.ts (response shapes only).

export type SourceName = "openalex" | "semanticscholar" | "crossref" | "core" | "arxiv" | "pubmed" | "scirah";
export type SearchMode = "keyword" | "author" | "subject";
export type SortMode = "relevance" | "citations" | "newest";

export interface PaperAuthor {
  name: string;
  id?: string;
  orcid?: string;
  affiliation?: string;
  institutionId?: string;
  institutionUrl?: string;
  /** Every affiliation as printed on the paper. */
  affiliations?: string[];
  corresponding?: boolean;
}

export interface PaperTopic {
  id?: string;
  name: string;
  score?: number;
  subfieldId?: string;
  subfield?: string;
  fieldId?: string;
  field?: string;
}

export interface Paper {
  id: string;
  ids: { openalex?: string; doi?: string; arxiv?: string; pmid?: string; s2?: string; core?: string; scirah?: string };
  title: string;
  abstract?: string;
  tldr?: string;
  authors: PaperAuthor[];
  venue?: string;
  /** OpenAlex journal / repository id (S…) — links to the venue profile. */
  venueId?: string;
  publisher?: string;
  /** OpenAlex publisher id (P…). */
  publisherId?: string;
  year?: number;
  publishedDate?: string;
  type?: string;
  citationCount?: number;
  referenceCount?: number;
  isOpenAccess: boolean;
  sourceUrl?: string;
  oaUrl?: string;
  /** Direct open-access PDF (opened in SciRah's reader). */
  pdfUrl?: string;
  topics: PaperTopic[];
  sources: SourceName[];
}

export interface SourceStatus {
  source: SourceName;
  ok: boolean;
  count: number;
  error?: string;
  skipped?: string;
}

export interface AuthorSummary {
  id: string;
  name: string;
  affiliation?: string;
  worksCount?: number;
  citationCount?: number;
  hIndex?: number;
  orcid?: string;
  topics?: string[];
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
  subject?: { id: string; name: string; level: string };
}

export interface AuthorProfile extends AuthorSummary {
  i10Index?: number;
  /** How the author most often writes their affiliation on recent papers (department / campus). */
  department?: string;
  institutions: { id?: string; name: string; countryCode?: string; url?: string }[];
  pastAffiliations: { name: string; years: number[]; url?: string }[];
  homepage?: string;
  externalUrl?: string;
  countsByYear: { year: number; works: number; citations: number }[];
  papers: Paper[];
  coAuthors: { id?: string; name: string; count: number; affiliation?: string }[];
  source: SourceName;
}

export interface Bookmark {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  source_url: string | null;
  is_open_access: boolean;
  created_at: string;
}

export interface Summary {
  paperId: string;
  summaryEn: string;
  /** Translations generated so far, keyed by language code. */
  translations: Partial<Record<"ur" | "hi" | "ar" | "zh" | "fr" | "es", string>>;
  basis: "abstract" | "fulltext";
  model: string;
}

export interface FeedItem {
  paper: Paper;
  score: number;
}

export interface Comment {
  id: string;
  paperId: string;
  userId: string;
  body: string;
  createdAt: string;
  author: { name: string; avatarUrl: string | null };
}

export const SOURCE_LABEL: Record<SourceName, string> = {
  openalex: "OpenAlex",
  semanticscholar: "Semantic Scholar",
  crossref: "Crossref",
  core: "CORE",
  arxiv: "arXiv",
  pubmed: "PubMed",
  scirah: "SciRah",
};

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  hasPassword: boolean;
  googleLinked: boolean;
  autoAlerts: boolean;
  isAdmin?: boolean;
  /** null until chosen (e.g. first Google sign-in). */
  role: "reader" | "researcher" | null;
  profile: ResearcherProfileFields;
  claimedAuthorId: string | null;
  createdAt: string;
}

export interface ResearcherProfileFields {
  affiliation: string | null;
  position: string | null;
  bio: string | null;
  interests: string[];
  website: string | null;
  scholarUrl: string | null;
  orcid: string | null;
}

export interface AlertFilters {
  openAccess?: boolean;
  pakistan?: boolean;
  countries?: string[];
  continent?: string;
  globalSouth?: boolean;
  institution?: string;
  types?: string[];
  language?: string;
  field?: string;
  venueType?: string;
  minCitations?: number;
  hasAbstract?: boolean;
  excludeRetracted?: boolean;
}

export interface Alert {
  id: number;
  query: string;
  mode: SearchMode;
  filters: AlertFilters;
  source: "search" | "manual";
  papers: boolean;
  news: boolean;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastHitAt: string | null;
  createdAt: string;
  notificationCount: number;
}

export interface AppNotification {
  id: number;
  kind: "paper" | "news" | "system";
  title: string;
  body: string | null;
  url: string | null;
  paperId: string | null;
  imageUrl: string | null;
  source: string | null;
  topic: string | null;
  alertId: number | null;
  publishedAt: string | null;
  read: boolean;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  domain?: string;
  publishedAt: string;
  imageUrl?: string;
  snippet?: string;
  country?: string;
  topic?: string;
  provider: "gdelt" | "googlenews" | "sciencedaily";
}

export type NewsRegion = "pk" | "world";
export type NewsSpan = "24h" | "7d" | "30d";

export interface Insights {
  available: boolean;
  total: number;
  scope: { kind: "world" } | { kind: "country"; code: string; name: string };
  countries: { code: string; name: string; count: number }[];
  institutions: { id: string; name: string; count: number; city?: string; countryCode?: string; lat?: number; lng?: number }[];
  researchers: { id: string; name: string; count: number; affiliation?: string }[];
  years: { year: number; count: number }[];
  topics: { id: string; name: string; count: number }[];
}

export interface VenueProfile {
  id: string;
  kind: "source" | "publisher";
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

export interface SciRahScore {
  authorId: string;
  score: number;
  parts: { key: string; label: string; weight: number; points: number; contribution: number; detail: string }[];
  claimed: boolean;
  papersCounted: number;
  totalWorks: number;
}

export interface AuthorMetricsSet {
  works: number | null;
  citations: number | null;
  hIndex: number | null;
  i10Index: number | null;
}

export interface AuthorClaim {
  /** ORCID sign-in is configured on the server. */
  claimable: boolean;
  claimed: boolean;
  mine: boolean;
  method: "orcid" | "admin" | null;
  requestPending?: boolean;
  patents: number;
  students: number;
  metrics: (AuthorMetricsSet & { source: string | null; url: string | null }) | null;
  owner: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    affiliation: string | null;
    position: string | null;
    bio: string | null;
    interests: string[];
    website: string | null;
    scholarUrl: string | null;
  } | null;
}

export interface AuthorMetrics {
  openalex: AuthorMetricsSet;
  /** Crossref's citation counts for the same papers (by DOI). */
  crossref: AuthorMetricsSet | null;
  /** Paper-by-paper cross-check: the highest count OpenAlex, Crossref or Semantic Scholar reports for each paper. */
  combined: AuthorMetricsSet | null;
  semanticScholar: (AuthorMetricsSet & { url: string }) | null;
  verified: (AuthorMetricsSet & { source: string | null; url: string | null; updatedAt: string | null }) | null;
}

export type FullText =
  | { kind: "article"; pmcid: string; source: string }
  | { kind: "pdf"; url: string; source: string }
  | { kind: "page"; url: string; source: string }
  | { kind: "none"; reason: string };

export interface FullArticle {
  pmcid: string;
  title: string;
  abstractHtml: string;
  sections: { title: string; html: string }[];
  references: string[];
  license?: string;
  sourceUrl: string;
  pdfUrl?: string;
}

export interface PublicResearcher extends ResearcherProfileFields {
  userId: string;
  name: string;
  avatarUrl: string | null;
  claimedAuthorId: string | null;
  papers: Paper[];
}

export interface Submission {
  id: string;
  paperId: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  paper: Paper | null;
  submitterEmail?: string | null;
}

export interface ReaderInfo {
  url: string;
  finalUrl: string;
  kind: "pdf" | "html" | "other";
  embeddable: boolean;
  title?: string;
  reason?: string;
}
