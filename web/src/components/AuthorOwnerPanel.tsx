"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, readerHref } from "@/lib/api";
import type { AuthorClaim } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { SpinnerIcon } from "./icons";

const SOURCES = ["Google Scholar", "Scopus", "Web of Science", "ResearchGate", "Other"];

/**
 * The researcher behind this profile: their own SciRah profile once verified, a "This is me" flow for
 * everyone else, and (for the verified owner) editing of their numbers, patents and students.
 */
export function AuthorOwnerPanel({ authorId, name }: { authorId: string; name: string }) {
  const { user, getToken, loading } = useAuth();
  const pathname = usePathname();
  const [claim, setClaim] = useState<AuthorClaim | null>(null);
  const [mode, setMode] = useState<null | "request" | "edit">(null);

  const load = useCallback(async () => {
    const c = await api<AuthorClaim>(`/authors/${encodeURIComponent(authorId)}/claim`, { token: await getToken() }).catch(() => null);
    setClaim(c);
  }, [authorId, getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once the session is known
    if (!loading) load();
  }, [loading, load]);

  if (!claim) return null;
  const o = claim.owner;

  return (
    <section className="card p-4">
      {claim.claimed && o ? (
        <>
          <p className="label flex items-center gap-1.5 text-primary">✓ Verified researcher</p>
          {(o.position || o.affiliation) && (
            <p className="mt-2 text-sm">
              {o.position}
              {o.position && o.affiliation && " · "}
              {o.affiliation}
            </p>
          )}
          {o.bio && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-fg/85">{o.bio}</p>}
          {o.interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {o.interests.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="tag hover:border-primary/60 hover:text-fg">
                  {t}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href={`/researcher/${o.userId}`} className="btn-ghost py-1">
              SciRah profile
            </Link>
            {o.scholarUrl && (
              <Link href={readerHref(o.scholarUrl, { title: `${name} · Google Scholar` })} className="btn-ghost py-1">
                Google Scholar
              </Link>
            )}
            {o.website && (
              <Link href={readerHref(o.website, { title: `${name} · Website` })} className="btn-ghost py-1">
                Website
              </Link>
            )}
          </div>
          {claim.mine && (
            <div className="mt-4 border-t border-line pt-3">
              {mode === "edit" ? (
                <EditNumbers authorId={authorId} claim={claim} onDone={async () => (setMode(null), await load())} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">This is your profile.</span>
                  <button className="btn-primary py-1 text-xs" onClick={() => setMode("edit")}>
                    Correct my numbers
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Edit your bio and links in{" "}
                <Link href="/account" className="link">
                  Account settings
                </Link>
                .
              </p>
            </div>
          )}
        </>
      ) : claim.claimed ? (
        <p className="text-xs text-muted">✓ This profile has been verified by its researcher.</p>
      ) : (
        <>
          <p className="font-medium">Are you {name}?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Verify this profile to show your bio, correct your citation numbers (e.g. from Google Scholar) and add patents and graduated students.
          </p>
          {!user ? (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-primary mt-3 py-1.5 text-sm">
              Sign in to verify
            </Link>
          ) : user.claimedAuthorId ? (
            <p className="mt-2 text-xs text-muted">Your account is already linked to another profile.</p>
          ) : claim.requestPending ? (
            <p className="mt-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
              Your request is being reviewed. You’ll be able to edit this profile once it’s approved.
            </p>
          ) : mode === "request" ? (
            <RequestForm authorId={authorId} onDone={async () => (setMode(null), await load())} onCancel={() => setMode(null)} />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {claim.claimable && (
                <a href={`/auth/orcid?author=${encodeURIComponent(authorId)}`} className="btn-primary py-1.5 text-sm">
                  Verify with ORCID (instant)
                </a>
              )}
              <button className={`${claim.claimable ? "btn-ghost" : "btn-primary"} py-1.5 text-sm`} onClick={() => setMode("request")}>
                This is me
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RequestForm({ authorId, onDone, onCancel }: { authorId: string; onDone: () => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/authors/${encodeURIComponent(authorId)}/claim-request`, { method: "POST", token: await getToken(), body: { evidenceUrl, message } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the request");
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="mt-3 space-y-2">
      <label className="block text-xs">
        A link that shows it’s you
        <input className="input mt-1 py-1.5" type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="University staff page or Google Scholar profile" />
      </label>
      <label className="block text-xs">
        Anything else? (optional)
        <textarea className="input mt-1 min-h-16 py-1.5" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="e.g. I use my university email, ali@uni.edu.pk" />
      </label>
      {error && <p className="text-xs text-accent">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary py-1 text-xs" disabled={busy}>
          {busy && <SpinnerIcon />} Send for review
        </button>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-muted">A SciRah admin checks the request, usually within a day.</p>
    </form>
  );
}

function EditNumbers({ authorId, claim, onDone }: { authorId: string; claim: AuthorClaim; onDone: () => void }) {
  const { getToken } = useAuth();
  const m = claim.metrics;
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const [f, setF] = useState({
    citations: str(m?.citations),
    hIndex: str(m?.hIndex),
    i10Index: str(m?.i10Index),
    works: str(m?.works),
    metricsSource: m?.source ?? "Google Scholar",
    metricsUrl: m?.url ?? "",
    patents: String(claim.patents),
    students: String(claim.students),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await api(`/authors/${encodeURIComponent(authorId)}/claim`, {
        method: "PATCH",
        token: await getToken(),
        body: {
          citations: n(f.citations),
          hIndex: n(f.hIndex),
          i10Index: n(f.i10Index),
          works: n(f.works),
          metricsSource: f.metricsSource,
          metricsUrl: f.metricsUrl,
          patents: Number(f.patents || 0),
          students: Number(f.students || 0),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setBusy(false);
    }
  };

  const num = (k: keyof typeof f, label: string) => (
    <label className="block text-xs">
      {label}
      <input type="number" min={0} className="input mt-1 py-1.5" value={f[k]} onChange={set(k)} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-xs text-muted">Your numbers as shown on another profile. Leave empty to use the databases’ numbers.</p>
      <div className="grid grid-cols-2 gap-2">
        {num("citations", "Citations")}
        {num("hIndex", "h-index")}
        {num("i10Index", "i10-index")}
        {num("works", "Publications")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          Taken from
          <select className="input mt-1 py-1.5" value={f.metricsSource} onChange={set("metricsSource")}>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          Link to that profile
          <input type="url" className="input mt-1 py-1.5" value={f.metricsUrl} onChange={set("metricsUrl")} placeholder="https://…" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("patents", "Patents granted")}
        {num("students", "Graduated MPhil/PhD students")}
      </div>
      {error && <p className="text-xs text-accent">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary py-1 text-xs" disabled={busy}>
          {busy && <SpinnerIcon />} Save
        </button>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
