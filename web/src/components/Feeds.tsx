"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FeedItem, NewsItem } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { NewsCard, NewsCardSkeleton } from "./NewsCard";
import { SectionTitle } from "./brand";
import { PaperCard, PaperCardSkeleton } from "./PaperCard";

/** Personalised "For you" feed (pgvector topic similarity). Hidden for signed-out visitors. */
export function ForYouFeed() {
  const { user, getToken } = useAuth();
  const [data, setData] = useState<{ personalized: boolean; items: FeedItem[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getToken()
      .then((token) => api<{ personalized: boolean; items: FeedItem[] }>("/feed", { token }))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [user, getToken]);

  if (!user || failed) return null;

  return (
    <section className="mb-12">
      <SectionTitle kicker="For you" title="Picked for your interests" />
      {data === null ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PaperCardSkeleton key={i} />
          ))}
        </div>
      ) : !data.personalized || data.items.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          Your feed learns from what you search and save. <Link href="/search" className="link text-fg">Search</Link> for a few topics or save
          some papers, and recommendations will appear here.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.slice(0, 8).map((it) => (
            <PaperCard key={it.paper.id} paper={it.paper} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TrendingFeed() {
  const { user, loading, getToken } = useAuth();
  const [scope, setScope] = useState<"all" | "pk">("all");
  // Each result remembers the request it answers; a stale one renders as "loading".
  const [result, setResult] = useState<{
    key: string;
    data?: { personalized: boolean; items: FeedItem[] };
    failed?: boolean;
  } | null>(null);
  const requestKey = `${scope}:${user?.id ?? "anon"}`;
  const current = result?.key === requestKey ? result : null;
  const data = current?.data ?? null;
  const failed = current?.failed ?? false;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    getToken()
      .then((token) => api<{ personalized: boolean; items: FeedItem[] }>(`/feed/trending${scope === "pk" ? "?pk=1" : ""}`, { token }))
      .then((d) => !cancelled && setResult({ key: requestKey, data: d }))
      .catch(() => !cancelled && setResult({ key: requestKey, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [requestKey, scope, loading, getToken]);

  return (
    <section>
      <SectionTitle kicker="Trending now" title={data?.personalized ? "Rising in your fields" : "Recent research gaining attention"}>
        <div role="tablist" aria-label="Trending scope" className="flex rounded-xl border border-line bg-subtle p-0.5 text-sm">
          {(
            [
              ["all", "Worldwide"],
              ["pk", "Pakistan"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={scope === v}
              onClick={() => setScope(v)}
              className={`rounded-lg px-3 py-1 transition-colors ${scope === v ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </SectionTitle>
      {failed ? (
        <p className="card p-6 text-sm text-muted">Trending papers are unavailable right now.</p>
      ) : data === null ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PaperCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.map((it) => (
            <PaperCard key={it.paper.id} paper={it.paper} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A few headlines for the user's topics, linking to the full News page. */
export function NewsTeaser() {
  const { user, loading, getToken } = useAuth();
  const [result, setResult] = useState<{ key: string; items?: NewsItem[]; personalized?: boolean } | null>(null);
  const key = user?.id ?? "anon";
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    getToken()
      .then((token) => api<{ personalized: boolean; items: NewsItem[] }>("/news/for-you", { token }))
      .then((d) => !cancelled && setResult({ key, items: d.items.slice(0, 4), personalized: d.personalized }))
      .catch(() => !cancelled && setResult({ key, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [key, loading, getToken]);

  if (current && !current.items?.length) return null;

  return (
    <section className="mb-12">
      <SectionTitle kicker="In the news" title={current?.personalized ? "News on your topics" : "Research in the news"}>
        <Link href="/news" className="text-sm text-muted hover:text-fg">
          All news →
        </Link>
      </SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {current?.items
          ? current.items.map((it) => <NewsCard key={it.id} item={it} compact />)
          : Array.from({ length: 4 }).map((_, i) => <NewsCardSkeleton key={i} />)}
      </div>
    </section>
  );
}
