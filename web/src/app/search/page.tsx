import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InsightsPanel, InsightsSkeleton } from "@/components/insights/InsightsPanel";
import { PaperCard } from "@/components/PaperCard";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilters } from "@/components/SearchFilters";
import { api, ApiError, authorHref } from "@/lib/api";
import { FollowTopicButton } from "@/components/FollowTopicButton";
import { COUNTRIES, FILTER_KEYS } from "@/lib/filters";
import { getServerToken } from "@/lib/session";
import { SOURCE_LABEL, type SearchResponse } from "@/lib/types";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const q = one((await searchParams).q);
  // Search results are endless and heavy: keep them out of search engines (robots.txt blocks them too).
  return { title: q ? `“${q}”` : "Search", robots: { index: false, follow: false } };
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "us",
  "united states of america": "us",
  america: "us",
  uk: "gb",
  britain: "gb",
  england: "gb",
  uae: "ae",
  ksa: "sa",
  china: "cn",
  turkey: "tr",
  korea: "kr",
};
const COUNTRY_BY_NAME: Record<string, string> = {
  ...Object.fromEntries(COUNTRIES.map(([code, name]) => [name.toLowerCase(), code])),
  ...COUNTRY_ALIASES,
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACE_RE = new RegExp(
  `^(.*\\S)\\s+(?:in|from)\\s+(?:the\\s+)?(${Object.keys(COUNTRY_BY_NAME).sort((a, b) => b.length - a.length).map(escapeRe).join("|")}|worldwide|the world|globally)$`,
  "i",
);

/** "graphene based work in Pakistan" → q="graphene based work" + Pakistan filter; "… worldwide" → no country filter. */
function placeFromQuery(q: string): { q: string; country: string | null } | null {
  const m = q.match(PLACE_RE);
  if (!m) return null;
  const place = m[2].toLowerCase();
  const country = ["worldwide", "the world", "globally"].includes(place) ? null : COUNTRY_BY_NAME[place];
  return { q: m[1].replace(/\s+(?:based\s+)?(?:work|research|papers?)$/i, "").trim() || m[1], country };
}

function apiParams(sp: SP, q: string) {
  const params = new URLSearchParams();
  params.set("q", q);
  for (const k of ["mode", "page", ...FILTER_KEYS]) {
    const v = one(sp[k]);
    if (v) params.set(k, v);
  }
  return params;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();

  const place = one(sp.mode) === "author" ? null : placeFromQuery(q);
  if (place) {
    const next = apiParams(sp, place.q);
    next.delete("page");
    if (place.country) {
      const set = new Set((next.get("country") ?? "").split(",").filter(Boolean));
      set.add(place.country);
      next.set("country", [...set].join(","));
    }
    redirect(`/search?${next.toString()}`);
  }
  const page = Number(one(sp.page) ?? 1);
  const showInsights = page <= 1 && one(sp.mode) !== "author";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto mb-6 max-w-3xl">
        <Suspense>
          <SearchBar />
        </Suspense>
      </div>

      {q.length < 2 ? (
        <EmptyPrompt />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <Suspense>
              <SearchFilters />
            </Suspense>
          </div>
          <div className="min-w-0">
            {showInsights && (
              <Suspense key={`ins-${JSON.stringify(sp)}`} fallback={<InsightsSkeleton />}>
                <InsightsPanel params={apiParams(sp, q)} query={q} />
              </Suspense>
            )}
            <Suspense key={JSON.stringify(sp)} fallback={<ResultsSkeleton />}>
              <Results sp={sp} q={q} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

async function Results({ sp, q }: { sp: SP; q: string }) {
  const params = apiParams(sp, q);

  // Forward the session (if any) so the API can learn from this search (personal feed + topic alerts).
  const token = await getServerToken();

  let data: SearchResponse;
  try {
    data = await api<SearchResponse>(`/papers/search?${params.toString()}`, { token });
  } catch (e) {
    return (
      <div className="card p-6" role="alert">
        <p className="font-medium">Search failed</p>
        <p className="mt-1 text-sm text-muted">{e instanceof ApiError ? e.message : "Something went wrong."}</p>
      </div>
    );
  }

  const page = data.page;
  const hasMore = data.results.length > 0 && page * data.perPage < data.total && page < 50;
  const pageHref = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `/search?${next.toString()}`;
  };

  return (
    <section aria-label="Results" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          About <strong className="text-fg">{new Intl.NumberFormat("en").format(data.total)}</strong> results
          {data.subject && (
            <>
              {" "}
              in <span className="tag ml-1">{data.subject.level}: {data.subject.name}</span>
            </>
          )}
          {page > 1 && <> · page {page}</>}
        </p>
        <div className="flex items-center gap-3">
          <FollowTopicButton query={q} mode={data.mode} />
          <SourceStatusLine sources={data.sources} />
        </div>
      </div>

      {data.authors && data.authors.length > 0 && page === 1 && (
        <div className="mb-5">
          <p className="label mb-2 text-muted">Matching researchers</p>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {data.authors.map((a) => (
              <Link
                key={a.id}
                href={authorHref(a.id)}
                className="card w-60 shrink-0 snap-start p-3.5 transition-colors hover:border-primary/60"
              >
                <p className="truncate font-heading font-semibold">{a.name}</p>
                <p className="truncate text-xs text-muted">{a.affiliation ?? "Affiliation unknown"}</p>
                <p className="mt-2 font-mono text-[11px] text-muted">
                  {a.hIndex !== undefined && <>h-index {a.hIndex} · </>}
                  {a.worksCount !== undefined && <>{a.worksCount} works</>}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted/80">{a.id.startsWith("s2:") ? "Semantic Scholar" : "OpenAlex"}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.results.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-medium">No papers found</p>
          <p className="mt-1 text-sm text-muted">Try fewer words, a different search mode, or remove some filters.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {data.results.map((p) => (
            <li key={p.id}>
              <PaperCard paper={p} />
            </li>
          ))}
        </ol>
      )}

      {(page > 1 || hasMore) && (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-ghost">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs text-muted">Page {page}</span>
          {hasMore ? (
            <Link href={pageHref(page + 1)} className="btn-ghost">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

function SourceStatusLine({ sources }: { sources: SearchResponse["sources"] }) {
  return (
    <details className="group relative text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted hover:text-fg">
        {sources.map((s) => (
          <span
            key={s.source}
            title={`${SOURCE_LABEL[s.source]}: ${s.skipped ?? (s.ok ? `${s.count} results` : s.error)}`}
            className={`h-2 w-2 rounded-full ${s.skipped ? "bg-line" : s.ok ? "bg-primary" : "bg-accent"}`}
          />
        ))}
        <span className="ml-1 underline-offset-2 group-open:underline">Sources</span>
      </summary>
      <ul className="popover absolute right-0 z-20 mt-2 w-72 space-y-1.5 p-3 shadow-lg">
        {sources.map((s) => (
          <li key={s.source} className="flex justify-between gap-3">
            <span className="font-medium">{SOURCE_LABEL[s.source]}</span>
            <span className={`text-right ${s.ok ? "text-muted" : "text-accent"}`}>
              {s.skipped ? s.skipped : s.ok ? `${s.count} results` : "unavailable"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EmptyPrompt() {
  return (
    <div className="mx-auto max-w-3xl text-center text-muted">
      <p>Search across OpenAlex, Semantic Scholar, Crossref, CORE, arXiv and PubMed at once.</p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading results">
      <div className="skeleton mb-4 h-4 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="skeleton mb-3 h-5 w-4/5" />
          <div className="skeleton mb-2 h-3.5 w-2/5" />
          <div className="skeleton mb-4 h-3 w-1/3" />
          <div className="skeleton mb-1.5 h-3 w-full" />
          <div className="skeleton h-3 w-11/12" />
        </div>
      ))}
    </div>
  );
}
