"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, authorHref } from "@/lib/api";
import type { AuthorSummary, SessionUser, Submission } from "@/lib/types";
import { SpinnerIcon } from "./icons";
import { RolePicker, type Role } from "./RolePicker";

type GetToken = () => Promise<string | null>;

/** Account type + (for researchers) public profile, publication profile and own papers. */
export function ResearcherSettings({ user, getToken, onSaved }: { user: SessionUser; getToken: GetToken; onSaved: () => Promise<void> }) {
  const params = useSearchParams();
  const setup = params.get("setup") === "1";
  return (
    <>
      {setup && user.role === "researcher" && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
          <p className="font-semibold">Welcome, researcher! Three quick steps:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-fg/85">
            <li>Fill in your public profile below.</li>
            <li>Find your publication profile and verify it’s you — then you can correct your numbers.</li>
            <li>Add any of your papers that are missing.</li>
          </ol>
        </div>
      )}
      <AccountType user={user} getToken={getToken} onSaved={onSaved} />
      {user.role === "researcher" && (
        <>
          <ProfileForm user={user} getToken={getToken} onSaved={onSaved} />
          <PublicationProfile user={user} />
          <YourPapers user={user} getToken={getToken} />
        </>
      )}
    </>
  );
}

function AccountType({ user, getToken, onSaved }: { user: SessionUser; getToken: GetToken; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const change = async (role: Role) => {
    if (role === user.role) return;
    setBusy(true);
    await api("/auth/me", { method: "PATCH", token: await getToken(), body: { role } }).catch(() => undefined);
    await onSaved();
    setBusy(false);
  };
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold">Account type {busy && <SpinnerIcon />}</h2>
      <RolePicker value={user.role} onChange={change} />
    </section>
  );
}

function ProfileForm({ user, getToken, onSaved }: { user: SessionUser; getToken: GetToken; onSaved: () => Promise<void> }) {
  const p = user.profile;
  const [form, setForm] = useState({
    affiliation: p.affiliation ?? "",
    position: p.position ?? "",
    bio: p.bio ?? "",
    interests: p.interests.join(", "),
    website: p.website ?? "",
    scholarUrl: p.scholarUrl ?? "",
    orcid: p.orcid ?? "",
  });
  const [state, setState] = useState<null | "saving" | "saved">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      await api("/auth/me", { method: "PATCH", token: await getToken(), body: form });
      await onSaved();
      setState("saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setState(null);
    }
  };

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your public researcher profile</h2>
        <Link href={`/researcher/${user.id}`} className="text-sm text-muted hover:text-fg hover:underline">
          View public page →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institution / affiliation">
          <input className="input" value={form.affiliation} onChange={set("affiliation")} placeholder="COMSATS University Islamabad" maxLength={200} />
        </Field>
        <Field label="Position">
          <input className="input" value={form.position} onChange={set("position")} placeholder="Assistant Professor, Dept. of Physics" maxLength={120} />
        </Field>
      </div>
      <Field label="About you">
        <textarea className="input min-h-24" value={form.bio} onChange={set("bio")} maxLength={2000} placeholder="Your research focus, current projects, students you’re looking for…" />
      </Field>
      <Field label="Research interests" hint="comma-separated">
        <input className="input" value={form.interests} onChange={set("interests")} placeholder="graphene, supercapacitors, energy storage" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Google Scholar profile link">
          <input className="input" type="url" value={form.scholarUrl} onChange={set("scholarUrl")} placeholder="https://scholar.google.com/citations?user=…" />
        </Field>
        <Field label="ORCID iD">
          <input className="input" value={form.orcid} onChange={set("orcid")} placeholder="0000-0002-1825-0097" />
        </Field>
      </div>
      <Field label="Website / lab page">
        <input className="input" type="url" value={form.website} onChange={set("website")} placeholder="https://…" />
      </Field>
      {error && <p className="text-sm text-accent">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={state === "saving"}>
          {state === "saving" && <SpinnerIcon />} Save profile
        </button>
        {state === "saved" && <span className="text-sm text-muted">Saved ✓</span>}
      </div>
    </form>
  );
}

/** Link the account to the researcher's publication profile (OpenAlex), which they then verify. */
function PublicationProfile({ user }: { user: SessionUser }) {
  const [q, setQ] = useState(user.name);
  const [results, setResults] = useState<AuthorSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (user.claimedAuthorId)
    return (
      <section className="card space-y-2 p-5">
        <h2 className="font-semibold">Your publication profile</h2>
        <p className="text-sm text-muted">✓ Verified. You can correct your citation numbers, patents and students there.</p>
        <Link href={authorHref(user.claimedAuthorId)} className="btn-ghost">
          Open my profile
        </Link>
      </section>
    );

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    const r = await api<AuthorSummary[]>(`/authors/search?q=${encodeURIComponent(q.trim())}`).catch(() => []);
    setResults(r.filter((a) => a.id.startsWith("openalex:")));
    setBusy(false);
  };

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Find your publication profile</h2>
      <p className="text-sm text-muted">
        SciRah builds researcher profiles from your published papers. Find yours, open it and press <strong>“This is me”</strong> to verify it.
      </p>
      <form onSubmit={search} className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Your name as it appears on your papers" />
        <button className="btn-primary shrink-0" disabled={busy}>
          {busy && <SpinnerIcon />} Search
        </button>
      </form>
      {results && results.length === 0 && <p className="text-sm text-muted">No profiles found. Try the name exactly as it appears on your papers.</p>}
      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((a) => (
            <li key={a.id}>
              <Link href={authorHref(a.id)} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 hover:border-primary/60">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted">{a.affiliation ?? "Affiliation unknown"}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">{a.worksCount ?? 0} works</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function YourPapers({ user, getToken }: { user: SessionUser; getToken: GetToken }) {
  const [mine, setMine] = useState<Submission[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) => api<Submission[]>("/submissions/mine", { token }))
      .then((r) => !cancelled && setMine(r))
      .catch(() => !cancelled && setMine([]));
    return () => {
      cancelled = true;
    };
  }, [getToken, user.id]);

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your papers on SciRah</h2>
        <Link href="/submit" className="btn-primary py-1.5">
          + Add a paper
        </Link>
      </div>
      <p className="text-sm text-muted">
        Add a paper by its DOI or a link — including theses and local journal articles that aren’t indexed yet.
        {user.claimedAuthorId ? " As a verified researcher your additions go live immediately." : " They appear after a quick review (instantly once your profile is verified)."}
      </p>
      {mine && mine.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {mine.slice(0, 8).map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{s.paper?.title}</span>
              <span className="shrink-0 text-xs text-muted">{s.status === "approved" ? "Live" : s.status === "pending" ? "In review" : "Not approved"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block">
        {label} {hint && <span className="text-xs text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}
