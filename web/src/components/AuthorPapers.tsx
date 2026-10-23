"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, paperHref } from "@/lib/api";
import type { AuthorClaim, Paper } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { CLAIM_CHANGED } from "./AuthorOwnerPanel";
import { PaperCard } from "./PaperCard";

/** Fired when the researcher removes or restores a paper, so the numbers panel reloads. */
export const PAPERS_CHANGED = "scirah:papers-changed";

interface HiddenWork {
  workId: string;
  title: string | null;
  hiddenAt: string;
}

/**
 * The researcher's papers. The verified researcher can remove a paper that isn't theirs ("Not my paper"):
 * it disappears from the profile and from the cross-checked numbers, and can be restored later.
 */
export function AuthorPapers({ authorId, papers }: { authorId: string; papers: Paper[] }) {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const [mine, setMine] = useState(false);
  const [hidden, setHidden] = useState<HiddenWork[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/authors/${encodeURIComponent(authorId)}`;

  const load = useCallback(async () => {
    const token = await getToken();
    const claim = await api<AuthorClaim>(`${base}/claim`, { token }).catch(() => null);
    setMine(!!claim?.mine);
    if (claim?.mine) setHidden(await api<HiddenWork[]>(`${base}/hidden`).catch(() => []));
  }, [base, getToken]);

  useEffect(() => {
    if (loading || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once the session is known
    load();
    // Reload when the researcher verifies this profile on the same page.
    window.addEventListener(CLAIM_CHANGED, load);
    return () => window.removeEventListener(CLAIM_CHANGED, load);
  }, [loading, user, load]);

  const hide = async (p: Paper) => {
    if (!p.ids.openalex) return;
    if (!window.confirm(`Remove “${p.title}” from your profile? You can restore it later.`)) return;
    setBusy(p.ids.openalex);
    setError(null);
    try {
      setHidden(await api<HiddenWork[]>(`${base}/hidden`, { method: "POST", token: await getToken(), body: { workId: p.ids.openalex, title: p.title } }));
      setRemoved((s) => new Set(s).add(p.ids.openalex!));
      window.dispatchEvent(new Event(PAPERS_CHANGED));
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove the paper");
    }
    setBusy(null);
  };

  const restore = async (workId: string) => {
    setBusy(workId);
    setError(null);
    try {
      setHidden(await api<HiddenWork[]>(`${base}/hidden/${workId}`, { method: "DELETE", token: await getToken() }));
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(workId);
        return next;
      });
      window.dispatchEvent(new Event(PAPERS_CHANGED));
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not restore the paper");
    }
    setBusy(null);
  };

  const shown = papers.filter((p) => !p.ids.openalex || !removed.has(p.ids.openalex));

  return (
    <div>
      {mine && (
        <p className="mb-3 rounded-lg border border-line bg-subtle px-3 py-2 text-xs text-muted">
          This is your profile. If a paper below isn’t yours, choose <strong>Not my paper</strong> to remove it — your numbers update too.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-accent">{error}</p>}
      {shown.length === 0 ? (
        <p className="text-muted">No papers found for this researcher.</p>
      ) : (
        <ol className="space-y-3">
          {shown.map((p) => (
            <li key={p.id}>
              <PaperCard paper={p} showAbstract={false} />
              {mine && p.ids.openalex && (
                <div className="mt-1 flex justify-end">
                  <button className="text-xs text-muted hover:text-accent" disabled={busy === p.ids.openalex} onClick={() => hide(p)}>
                    {busy === p.ids.openalex ? "Removing…" : "Not my paper"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {mine && hidden.length > 0 && (
        <div className="card mt-6 p-4">
          <p className="label mb-2 text-muted">Papers you removed ({hidden.length})</p>
          <ul className="space-y-2 text-sm">
            {hidden.map((h) => (
              <li key={h.workId} className="flex items-center justify-between gap-3">
                <Link href={paperHref(`openalex:${h.workId}`)} className="min-w-0 truncate hover:text-primary">
                  {h.title ?? h.workId}
                </Link>
                <button className="btn-ghost shrink-0 py-0.5 text-xs" disabled={busy === h.workId} onClick={() => restore(h.workId)}>
                  {busy === h.workId ? "Restoring…" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
