"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { AuthorClaim, SciRahScore } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { SpinnerIcon } from "./icons";

/** The researcher's SciRah Score with its breakdown, plus profile claiming (ORCID) for patents and students. */
export function ScoreCard({ authorId, name }: { authorId: string; name: string }) {
  const { user, getToken, loading } = useAuth();
  const pathname = usePathname();
  const [score, setScore] = useState<SciRahScore | null>(null);
  const [claim, setClaim] = useState<AuthorClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<SciRahScore>(`/authors/${encodeURIComponent(authorId)}/score`)
      .then((s) => !cancelled && setScore(s))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not calculate the score"));
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    getToken()
      .then((token) => api<AuthorClaim>(`/authors/${encodeURIComponent(authorId)}/claim`, { token }))
      .then((c) => !cancelled && setClaim(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authorId, getToken, loading]);

  const reload = async (c: AuthorClaim) => {
    setClaim(c);
    setEditing(false);
    setScore(await api<SciRahScore>(`/authors/${encodeURIComponent(authorId)}/score`));
  };

  return (
    <section aria-labelledby="scirah-score" className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p id="scirah-score" className="label text-muted">
          SciRah Score
        </p>
        <Link href="/score" className="text-xs text-muted hover:text-fg hover:underline">
          How it works
        </Link>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-muted">{error}</p>
      ) : !score ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="skeleton h-9 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      ) : (
        <>
          <p className="mt-1 font-heading text-4xl font-bold">
            {score.score.toFixed(1)}
            <span className="ml-1 text-base font-normal text-muted">/ 100</span>
          </p>
          <ul className="mt-3 space-y-2">
            {score.parts.map((p) => (
              <li key={p.key} title={p.detail}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span>
                    {p.label} <span className="text-muted">· {Math.round(p.weight * 100)}%</span>
                  </span>
                  <span className="font-mono text-muted">+{p.contribution.toFixed(1)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line/60">
                  <div className="h-full rounded-full" style={{ width: `${p.points}%`, background: "var(--chart-bar)" }} />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">{p.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {claim && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          {claim.mine ? (
            editing ? (
              <ClaimForm authorId={authorId} claim={claim} onSaved={reload} onCancel={() => setEditing(false)} />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">This is your verified profile.</span>
                <button className="btn-ghost py-1 text-xs" onClick={() => setEditing(true)}>
                  Edit patents & students
                </button>
              </div>
            )
          ) : claim.claimed ? (
            <p className="text-xs text-muted">✓ Profile verified by {name} via ORCID.</p>
          ) : claim.claimable ? (
            <div>
              <p className="text-xs text-muted">Are you {name}? Verify with ORCID to add your patents and graduated students.</p>
              {user ? (
                <a href={`/auth/orcid?author=${encodeURIComponent(authorId)}`} className="btn-ghost mt-2 py-1 text-xs">
                  Claim this profile with ORCID
                </a>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-ghost mt-2 py-1 text-xs">
                  Sign in to claim this profile
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Patents and graduated students count once the researcher verifies this profile.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ClaimForm({ authorId, claim, onSaved, onCancel }: { authorId: string; claim: AuthorClaim; onSaved: (c: AuthorClaim) => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const [patents, setPatents] = useState(String(claim.patents));
  const [students, setStudents] = useState(String(claim.students));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api<AuthorClaim>(`/authors/${encodeURIComponent(authorId)}/claim`, {
        method: "PATCH",
        token: await getToken(),
        body: { patents: Number(patents), students: Number(students) },
      });
      onSaved(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <label className="block text-xs">
        Patents granted
        <input type="number" min={0} max={1000} value={patents} onChange={(e) => setPatents(e.target.value)} className="input mt-1 py-1.5" />
      </label>
      <label className="block text-xs">
        Graduated students (MPhil / PhD) you supervised
        <input type="number" min={0} max={1000} value={students} onChange={(e) => setStudents(e.target.value)} className="input mt-1 py-1.5" />
      </label>
      {error && <p className="text-xs text-accent">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary py-1 text-xs" disabled={busy}>
          {busy && <SpinnerIcon />} Save
        </button>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-muted">Self-reported; shown as such on your profile.</p>
    </form>
  );
}
