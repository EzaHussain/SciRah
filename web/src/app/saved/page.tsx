"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SectionTitle } from "@/components/brand";
import { BookmarkIcon, UnlockIcon } from "@/components/icons";
import { api, ApiError, paperHref, readerHref } from "@/lib/api";
import type { Bookmark } from "@/lib/types";

export default function SavedPage() {
  const { user, loading, getToken, saved, toggleSaved, configured } = useAuth();
  const [items, setItems] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getToken()
      .then((token) => api<Bookmark[]>("/bookmarks", { token }))
      .then((rows) => !cancelled && setItems(rows))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load saved papers"));
    return () => {
      cancelled = true;
    };
  }, [user, getToken]);

  // Hide rows the user just un-saved (without refetching).
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (items ?? [])
      .filter((b) => saved.has(b.paper_id))
      .filter((b) => !f || b.title.toLowerCase().includes(f) || b.authors.some((a) => a.toLowerCase().includes(f)));
  }, [items, saved, filter]);

  if (!configured || (!loading && !user)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <BookmarkIcon className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold">Your saved papers</h1>
        <p className="mt-2 text-muted">Sign in to build a personal library. SciRah saves the reference, and the paper stays at its original source.</p>
        <Link href="/login?next=/saved" className="btn-primary mt-6">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <SectionTitle kicker="Library" title="Saved papers">
        {items && items.length > 0 && (
          <input className="input w-full py-2 text-sm sm:w-64" placeholder="Filter by title or author" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter saved papers" />
        )}
      </SectionTitle>

      {error ? (
        <p role="alert" className="card p-5 text-sm text-accent">
          {error}
        </p>
      ) : items === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-medium">{filter ? "No saved papers match that filter." : "Nothing saved yet"}</p>
          {!filter && (
            <p className="mt-1 text-sm text-muted">
              Tap the bookmark icon on any paper to keep it here. <Link href="/search" className="link text-fg">Start searching</Link>
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((b) => (
            <li key={b.paper_id} className="card flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={paperHref(b.paper_id)} className="font-heading leading-snug font-semibold hover:underline">
                  {b.title}
                </Link>
                <p className="mt-1 line-clamp-1 text-sm text-muted">
                  {b.authors.slice(0, 4).join(", ")}
                  {b.authors.length > 4 && ` +${b.authors.length - 4}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {b.year && <span className="font-mono">{b.year}</span>}
                  {b.venue && <span className="italic">{b.venue}</span>}
                  {b.is_open_access && (
                    <span className="inline-flex items-center gap-1">
                      <UnlockIcon /> Open access
                    </span>
                  )}
                  {b.source_url && (
                    <Link href={readerHref(b.source_url, { title: b.title, paperId: b.paper_id, back: "/saved" })} className="hover:text-fg hover:underline">
                      Read paper
                    </Link>
                  )}
                  <span>Saved {new Date(b.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button className="rounded-lg p-2 text-primary hover:bg-subtle" title="Remove from saved" aria-label={`Remove ${b.title} from saved`} onClick={() => toggleSaved(b.paper_id).catch(() => undefined)}>
                <BookmarkIcon filled />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
