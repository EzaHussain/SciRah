import { canonicalId, type Paper, type SortMode, type SourceName, type SourceResult } from './types.js';

/** Higher-priority sources provide the "base" record when duplicates are merged. */
const PRIORITY: SourceName[] = ['openalex', 'semanticscholar', 'crossref', 'pubmed', 'arxiv', 'core', 'scirah'];
const prio = (p: Paper) => Math.min(...p.sources.map((s) => PRIORITY.indexOf(s)));

export function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function idKeys(p: Paper): string[] {
  const k: string[] = [];
  for (const [kind, v] of Object.entries(p.ids)) if (v) k.push(`${kind}:${String(v).toLowerCase()}`);
  return k;
}

const longer = (a?: string, b?: string) => (!a ? b : !b ? a : b.length > a.length * 1.15 ? b : a);

/** Merge `b` into `a` (a is the higher-priority record). Returns a new object. */
export function mergeTwo(a: Paper, b: Paper): Paper {
  const [base, other] = prio(a) <= prio(b) ? [a, b] : [b, a];
  const authorsWithIds = (p: Paper) => p.authors.filter((x) => x.id).length;
  const merged: Paper = {
    ...other,
    ...base,
    ids: { ...other.ids, ...base.ids },
    abstract: longer(base.abstract, other.abstract),
    tldr: base.tldr ?? other.tldr,
    authors:
      authorsWithIds(base) >= authorsWithIds(other) && base.authors.length ? base.authors : other.authors,
    venue: base.venue ?? other.venue,
    publisher: base.publisher ?? other.publisher,
    year: base.year ?? other.year,
    publishedDate: base.publishedDate ?? other.publishedDate,
    citationCount: Math.max(base.citationCount ?? 0, other.citationCount ?? 0) || base.citationCount || other.citationCount,
    referenceCount: base.referenceCount ?? other.referenceCount,
    isOpenAccess: base.isOpenAccess || other.isOpenAccess,
    oaUrl: base.oaUrl ?? other.oaUrl,
    pdfUrl: base.pdfUrl ?? other.pdfUrl,
    venueId: base.venueId ?? other.venueId,
    publisherId: base.publisherId ?? other.publisherId,
    sourceUrl: base.sourceUrl ?? other.sourceUrl,
    topics: base.topics.some((t) => t.id) ? base.topics : other.topics.some((t) => t.id) ? other.topics : base.topics.length ? base.topics : other.topics,
    sources: [...new Set([...base.sources, ...other.sources])],
  };
  // Fill in author profile ids from the other record when names line up (e.g. S2 ids for CrossRef authors).
  if (!merged.authors.some((x) => x.id)) {
    const byName = new Map(other.authors.filter((x) => x.id).map((x) => [x.name.toLowerCase(), x.id]));
    merged.authors = merged.authors.map((x) => ({ ...x, id: x.id ?? byName.get(x.name.toLowerCase()) }));
  }
  merged.id = canonicalId(merged.ids) ?? base.id;
  return merged;
}

interface Group {
  paper: Paper;
  score: number;
}

/**
 * Deduplicate across sources (by DOI / arXiv / PMID / other ids, then by normalised
 * title + year) and rank with reciprocal-rank fusion so papers found by several
 * sources float up.
 */
export function mergeResults(
  results: SourceResult[],
  sort: SortMode,
  weights: Partial<Record<SourceName, number>> = {},
): Paper[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();

  const register = (g: Group) => {
    for (const k of idKeys(g.paper)) index.set(k, g);
    const t = normTitle(g.paper.title);
    if (t.length >= 25) index.set(`t:${t}`, g);
  };

  for (const r of results) {
    const w = weights[r.source] ?? 1;
    r.papers.forEach((p, rank) => {
      const rrf = w / (60 + rank);
      let g = idKeys(p)
        .map((k) => index.get(k))
        .find(Boolean);
      if (!g) {
        const t = normTitle(p.title);
        const cand = t.length >= 25 ? index.get(`t:${t}`) : undefined;
        if (cand && (!cand.paper.year || !p.year || Math.abs(cand.paper.year - p.year) <= 1)) g = cand;
      }
      if (g) {
        g.paper = mergeTwo(g.paper, p);
        g.score += rrf;
      } else {
        g = { paper: p, score: rrf };
        groups.push(g);
      }
      register(g);
    });
  }

  const out = [...groups];
  if (sort === 'citations') out.sort((a, b) => (b.paper.citationCount ?? 0) - (a.paper.citationCount ?? 0));
  else if (sort === 'newest')
    out.sort((a, b) => (b.paper.publishedDate ?? String(b.paper.year ?? '')).localeCompare(a.paper.publishedDate ?? String(a.paper.year ?? '')));
  else out.sort((a, b) => b.score - a.score);
  return out.map((g) => g.paper);
}
