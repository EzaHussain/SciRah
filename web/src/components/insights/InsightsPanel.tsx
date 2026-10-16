import Link from "next/link";
import { YearBars } from "@/components/YearBars";
import { api, authorHref } from "@/lib/api";
import { compact } from "@/lib/bins";
import { countryGeometry, WORLD_VIEWBOX, worldShapes } from "@/lib/geo";
import type { Insights } from "@/lib/types";
import { CountryMap, type MapPin } from "./CountryMap";
import { WorldMap } from "./WorldMap";

const without = (params: URLSearchParams, ...keys: string[]) => {
  const p = new URLSearchParams(params);
  for (const k of [...keys, "page"]) p.delete(k);
  return p.toString();
};

/**
 * "Research landscape" for a search: where the work is done (world map, or one country's map with
 * institution pins), who does it, how it grew per year, and which sub-topics it splits into.
 */
export async function InsightsPanel({ params, query }: { params: URLSearchParams; query: string }) {
  const data = await api<Insights>(`/papers/insights?${params.toString()}`).catch(() => null);
  if (!data?.available || data.total === 0) return null;

  const fmt = new Intl.NumberFormat("en");
  const thisYear = new Date().getFullYear();
  const years = data.years.filter((y) => y.year >= thisYear - 24);
  const activeTopic = params.get("topic");
  const scopeName = data.scope.kind === "country" ? data.scope.name : null;

  let map: React.ReactNode = null;
  if (data.scope.kind === "country") {
    const geo = countryGeometry(data.scope.code);
    if (geo) {
      const pins: MapPin[] = data.institutions.flatMap((i) => {
        const xy = i.lat !== undefined && i.lng !== undefined ? geo.project(i.lng, i.lat) : null;
        return xy ? [{ id: i.id, name: i.name, city: i.city, count: i.count, x: xy[0], y: xy[1] }] : [];
      });
      map = (
        <CountryMap
          countryName={data.scope.name}
          outline={geo.outline}
          neighbours={geo.neighbours}
          width={geo.width}
          height={geo.height}
          pins={pins}
          searchBase={without(params, "inst", "instName")}
        />
      );
    }
  } else {
    map = (
      <WorldMap
        shapes={worldShapes()}
        counts={Object.fromEntries(data.countries.map((c) => [c.code, c.count]))}
        width={WORLD_VIEWBOX.width}
        height={WORLD_VIEWBOX.height}
        searchBase={without(params, "country", "pk")}
      />
    );
  }

  const ranking =
    data.scope.kind === "country"
      ? {
          title: `Top institutions in ${data.scope.name}`,
          rows: data.institutions.slice(0, 10).map((i) => ({
            key: i.id,
            name: i.name,
            sub: i.city,
            count: i.count,
            href: `/search?${without(params, "inst", "instName")}&inst=${i.id}&instName=${encodeURIComponent(i.name)}`,
          })),
        }
      : {
          title: "Top countries",
          rows: data.countries.slice(0, 10).map((c) => ({
            key: c.code,
            name: c.name,
            sub: undefined,
            count: c.count,
            href: `/search?${without(params, "country", "pk")}&country=${c.code}`,
          })),
        };

  return (
    <section aria-labelledby="landscape" className="card mb-6 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label mb-1 flex items-center gap-2 text-accent">
            <span className="inline-block h-1.5 w-4 rounded-full bg-accent" />
            Research landscape
          </p>
          <h2 id="landscape" className="text-lg font-semibold sm:text-xl">
            {compact(data.total)} papers on “{query}”{scopeName ? ` with authors in ${scopeName}` : " worldwide"}
          </h2>
        </div>
        <p className="text-xs text-muted">Counts from OpenAlex · {fmt.format(data.total)} works</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
        {map}
        <RankList title={ranking.title} rows={ranking.rows} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <YearBars label="Papers per year" valueLabel="Papers" data={years.map((y) => ({ year: y.year, value: y.count }))} />
        <div className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="label text-muted">Breakdown by topic · click to filter</p>
            {activeTopic && (
              <Link href={`/search?${without(params, "topic", "topicName")}`} className="text-xs text-muted hover:text-fg hover:underline">
                Clear topic
              </Link>
            )}
          </div>
          <TopicBars topics={data.topics.slice(0, 10)} params={params} active={activeTopic} />
        </div>
      </div>

      {data.researchers.length > 0 && (
        <div className="mt-6">
          <p className="label mb-2 text-muted">{scopeName ? `Leading researchers in ${scopeName}` : "Leading researchers"} on this topic</p>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.researchers.slice(0, 9).map((r, i) => (
              <li key={r.id}>
                <Link href={authorHref(r.id)} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 transition-colors hover:border-primary/60">
                  <span className="font-mono text-xs text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted">{r.affiliation ?? "Affiliation unknown"}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">{fmt.format(r.count)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function RankList({ title, rows }: { title: string; rows: { key: string; name: string; sub?: string; count: number; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const fmt = new Intl.NumberFormat("en");
  return (
    <div className="min-w-0">
      <p className="label mb-2 text-muted">{title}</p>
      <ol className="space-y-1">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="group block rounded-lg px-2 py-1.5 hover:bg-subtle">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate group-hover:text-primary" title={r.name}>
                  {r.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">{fmt.format(r.count)}</span>
              </span>
              <span className="mt-1 block h-1.5 rounded-full bg-line/60">
                <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--chart-bar)" }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TopicBars({ topics, params, active }: { topics: Insights["topics"]; params: URLSearchParams; active: string | null }) {
  const max = Math.max(1, ...topics.map((t) => t.count));
  const fmt = new Intl.NumberFormat("en");
  return (
    <ol className="space-y-1.5">
      {topics.map((t) => {
        const isActive = active === t.id;
        const p = new URLSearchParams(params);
        p.delete("page");
        p.set("topic", t.id);
        p.set("topicName", t.name);
        return (
          <li key={t.id}>
            <Link
              href={`/search?${p.toString()}`}
              aria-current={isActive ? "true" : undefined}
              className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 ${isActive ? "bg-primary/15" : "hover:bg-subtle"}`}
            >
              <span className="truncate text-sm group-hover:text-primary" title={t.name}>
                {t.name}
              </span>
              <span className="font-mono text-xs text-muted">{fmt.format(t.count)}</span>
              <span className="col-span-2 block h-1.5 rounded-full bg-line/60">
                <span className="block h-full rounded-full" style={{ width: `${(t.count / max) * 100}%`, background: "var(--chart-bar)" }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="card mb-6 p-5" aria-busy="true" aria-label="Loading research landscape">
      <div className="skeleton mb-2 h-3 w-32" />
      <div className="skeleton mb-5 h-5 w-72" />
      <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
        <div className="skeleton aspect-[2/1] w-full rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
