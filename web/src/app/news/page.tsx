"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SectionTitle } from "@/components/brand";
import { FollowTopicButton } from "@/components/FollowTopicButton";
import { SearchIcon } from "@/components/icons";
import { NewsCard, NewsCardSkeleton } from "@/components/NewsCard";
import { api, ApiError } from "@/lib/api";
import type { NewsItem, NewsRegion, NewsSpan } from "@/lib/types";

interface ForYou {
  personalized: boolean;
  topics: string[];
  items: NewsItem[];
}
interface TopicNews {
  query: string;
  items: NewsItem[];
  /** General press coverage (shown after the research news). */
  press: NewsItem[];
  providers: { name: string; ok: boolean; count: number; error?: string }[];
}

const SPANS: [NewsSpan, string][] = [
  ["24h", "24 hours"],
  ["7d", "7 days"],
  ["30d", "30 days"],
];

export default function NewsPage() {
  return (
    <Suspense>
      <News />
    </Suspense>
  );
}

function News() {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const region: NewsRegion = params.get("region") === "pk" ? "pk" : "world";
  const span: NewsSpan = (["24h", "7d", "30d"] as const).find((s) => s === params.get("span")) ?? "30d";
  const [input, setInput] = useState(q);
  const [result, setResult] = useState<{ key: string; data?: ForYou | TopicNews; error?: string } | null>(null);
  const requestKey = `${q}|${region}|${span}|${user?.id ?? "anon"}`;
  const current = result?.key === requestKey ? result : null;

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/news${next.size ? `?${next}` : ""}`);
  };

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ region, span });
        const data = q
          ? await api<TopicNews>(`/news?${qs}&q=${encodeURIComponent(q)}`)
          : await api<ForYou>(`/news/for-you?${qs}`, { token: await getToken() });
        if (!cancelled) setResult({ key: requestKey, data });
      } catch (e) {
        if (!cancelled) setResult({ key: requestKey, error: e instanceof ApiError ? e.message : "News is unavailable right now." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, q, region, span, loading, getToken]);

  const data = current?.data;
  const forYou = data && "topics" in data ? data : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <SectionTitle kicker="Research news" title={q ? `Research news about “${q}”` : forYou?.personalized ? "Research news on your topics" : "Latest research news"} />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParam({ q: input.trim().length >= 2 ? input.trim() : null });
        }}
        className="mb-4 flex items-stretch gap-2 rounded-2xl border border-line bg-card p-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--ring)]"
      >
        <span className="flex items-center pl-2.5 text-muted">
          <SearchIcon />
        </span>
        <label htmlFor="news-q" className="sr-only">
          News topic
        </label>
        <input
          id="news-q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Any topic, e.g. dengue, heatwave, polio vaccine"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] focus:outline-none"
          maxLength={120}
        />
        <button className="btn-primary">Search news</button>
      </form>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          label="Region"
          value={region}
          options={[
            ["world", "Worldwide"],
            ["pk", "Pakistan"],
          ]}
          onChange={(v) => setParam({ region: v === "world" ? null : v })}
        />
        <Segmented label="Time" value={span} options={SPANS} onChange={(v) => setParam({ span: v === "30d" ? null : v })} />
        {q && (
          <>
            <button
              className="text-sm text-muted hover:text-fg"
              onClick={() => {
                setInput("");
                setParam({ q: null });
              }}
            >
              ← {user ? "News for you" : "Latest research news"}
            </button>
            <span className="ml-auto">
              <FollowTopicButton query={q} mode="keyword" />
            </span>
          </>
        )}
      </div>

      {forYou && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">{forYou.personalized ? "Based on:" : "Topics:"}</span>
          {forYou.topics.map((t) => (
            <button
              key={t}
              onClick={() => {
                setInput(t);
                setParam({ q: t });
              }}
              className="tag px-2.5 py-1 text-[12px] hover:border-primary/60 hover:text-fg"
            >
              {t}
            </button>
          ))}
          {!forYou.personalized && (
            <span className="text-xs text-muted">
              ·{" "}
              {user ? (
                <>Search a few topics and your news will follow them.</>
              ) : (
                <>
                  <Link href="/login?next=/news" className="link text-fg">
                    Sign in
                  </Link>{" "}
                  for news matched to your searches.
                </>
              )}
            </span>
          )}
        </div>
      )}

      {current?.error ? (
        <p role="alert" className="card p-6 text-sm text-accent">
          {current.error}
        </p>
      ) : !data ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Stories about newly published research — each one links to the study it reports on.
          </p>
          {data.items.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">
              <p className="font-medium text-fg">No research news{q ? ` about “${q}”` : ""} in this period</p>
              <p className="mt-1">Try “30 days” or a broader topic.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.items.map((it) => (
                <li key={it.id}>
                  <NewsCard item={it} />
                </li>
              ))}
            </ul>
          )}
          {"press" in data && data.press.length > 0 && (
            <details className="mt-10">
              <summary className="cursor-pointer font-heading text-lg font-semibold">
                More coverage in the press <span className="text-sm font-normal text-muted">({data.press.length})</span>
              </summary>
              <p className="mt-2 mb-3 text-sm text-muted">General news that mentions this topic. Some news sites don’t allow being shown inside SciRah.</p>
              <ul className="space-y-3">
                {data.press.map((it) => (
                  <li key={it.id}>
                    <NewsCard item={it} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {"providers" in (data ?? {}) && (
        <p className="mt-6 text-xs text-muted">
          Sources:{" "}
          {(data as TopicNews).providers.map((p) => `${p.name} ${p.ok ? `(${p.count})` : "(unavailable)"}`).join(" · ")}. SciRah links to the original
          publishers and does not host articles.
        </p>
      )}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-subtle p-0.5 text-sm">
      {options.map(([v, l]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1 transition-colors ${value === v ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
