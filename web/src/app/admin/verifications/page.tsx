"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError, authorHref, readerHref } from "@/lib/api";

interface ClaimRequest {
  id: string;
  author_id: string;
  message: string | null;
  evidence_url: string | null;
  status: string;
  created_at: string;
  email: string;
  display_name: string | null;
  affiliation: string | null;
  orcid: string | null;
  author: { name: string; affiliation: string | null; orcid: string | null; works: number | null } | null;
}

/** Admins: approve or reject "This is me" requests for researcher profiles. */
export default function VerificationsPage() {
  const { user, loading, getToken } = useAuth();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<ClaimRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      setItems(await api<ClaimRequest[]>(`/authors/claim-requests?status=${status}`, { token: await getToken() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load requests");
      setItems([]);
    }
  }, [getToken, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the queue for the selected tab
    if (user?.isAdmin) load();
  }, [user, load]);

  const review = async (id: string, next: "approved" | "rejected") => {
    const note = next === "rejected" ? (window.prompt("Reason (optional):") ?? undefined) : undefined;
    try {
      await api(`/authors/claim-requests/${id}`, { method: "PATCH", token: await getToken(), body: { status: next, note } });
      setItems((list) => list?.filter((r) => r.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update");
    }
  };

  if (loading) return null;
  if (!user?.isAdmin)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Profile verification requests</h1>
      <p className="mt-2 text-sm text-muted">
        Approve only when you’re confident the account belongs to the researcher — e.g. the link is their university staff page or Google Scholar
        profile, and the name, institution and ORCID match the profile.
      </p>
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
          {items.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="label text-muted">SciRah account</p>
                  <p className="mt-1 font-medium">{r.display_name ?? r.email}</p>
                  <p className="text-sm text-muted">{r.email}</p>
                  {r.affiliation && <p className="text-sm">{r.affiliation}</p>}
                  {r.orcid && <p className="font-mono text-xs">ORCID {r.orcid}</p>}
                </div>
                <div>
                  <p className="label text-muted">Claimed profile</p>
                  <Link href={authorHref(r.author_id)} className="mt-1 block font-medium hover:text-primary">
                    {r.author?.name ?? r.author_id}
                  </Link>
                  {r.author?.affiliation && <p className="text-sm">{r.author.affiliation}</p>}
                  {r.author?.orcid && <p className="font-mono text-xs">{r.author.orcid}</p>}
                  {r.author?.works !== undefined && r.author?.works !== null && <p className="text-xs text-muted">{r.author.works} works</p>}
                </div>
              </div>
              {(r.evidence_url || r.message) && (
                <div className="mt-3 rounded-xl border border-line bg-subtle p-3 text-sm">
                  {r.evidence_url && (
                    <p>
                      Evidence:{" "}
                      <Link href={readerHref(r.evidence_url, { title: "Verification evidence", back: "/admin/verifications" })} className="link break-all">
                        {r.evidence_url}
                      </Link>
                    </p>
                  )}
                  {r.message && <p className="mt-1 whitespace-pre-line">{r.message}</p>}
                </div>
              )}
              <p className="mt-2 font-mono text-[11px] text-muted">{new Date(r.created_at).toLocaleString()}</p>
              {status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary py-1.5" onClick={() => review(r.id, "approved")}>
                    Approve
                  </button>
                  <button className="btn-ghost py-1.5" onClick={() => review(r.id, "rejected")}>
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
