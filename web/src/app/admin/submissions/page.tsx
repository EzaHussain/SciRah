"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError, paperHref } from "@/lib/api";
import type { Submission } from "@/lib/types";

type Status = Submission["status"];

/** Admins review papers that users added manually. */
export default function ReviewSubmissionsPage() {
  const { user, loading, getToken } = useAuth();
  const [status, setStatus] = useState<Status>("pending");
  const [items, setItems] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      setItems(await api<Submission[]>(`/submissions?status=${status}`, { token: await getToken() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load submissions");
      setItems([]);
    }
  }, [getToken, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the queue for the selected tab
    if (user?.isAdmin) load();
  }, [user, load]);

  const review = async (id: string, next: "approved" | "rejected") => {
    const note = next === "rejected" ? (window.prompt("Reason (shown to the submitter, optional):") ?? undefined) : undefined;
    try {
      await api(`/submissions/${id}`, { method: "PATCH", token: await getToken(), body: { status: next, note } });
      setItems((list) => list?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update");
    }
  };

  if (loading) return null;
  if (!user?.isAdmin)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-muted">This page is for SciRah admins (accounts listed in ADMIN_EMAILS on the API server).</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Review added papers</h1>
      <div role="tablist" className="mt-5 flex gap-1.5">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${status === s ? "border-primary bg-primary/15" : "border-line text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      {!items ? (
        <div className="skeleton mt-6 h-32 w-full" />
      ) : items.length === 0 ? (
        <p className="mt-6 text-muted">Nothing here.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((s) => (
            <li key={s.id} className="card p-4">
              <p className="font-semibold">{s.paper?.title}</p>
              <p className="mt-1 text-sm text-muted">
                {s.paper?.authors.map((a) => a.name).join(", ")}
                {s.paper?.venue && <> · {s.paper.venue}</>}
                {s.paper?.year && <> · {s.paper.year}</>}
              </p>
              {s.paper?.abstract && <p className="mt-2 line-clamp-3 text-sm">{s.paper.abstract}</p>}
              <p className="mt-2 font-mono text-[11px] text-muted">
                by {s.submitterEmail ?? "deleted user"} · {new Date(s.createdAt).toLocaleString()}
                {s.paper?.sourceUrl && <> · {s.paper.sourceUrl}</>}
              </p>
              <div className="mt-3 flex gap-2">
                {status !== "approved" && (
                  <button className="btn-primary py-1.5" onClick={() => review(s.id, "approved")}>
                    Approve
                  </button>
                )}
                {status !== "rejected" && (
                  <button className="btn-ghost py-1.5" onClick={() => review(s.id, "rejected")}>
                    Reject
                  </button>
                )}
                {status === "approved" && (
                  <Link href={paperHref(s.paperId)} className="btn-ghost py-1.5">
                    Open
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
