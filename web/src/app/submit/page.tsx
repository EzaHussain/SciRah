"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SpinnerIcon } from "@/components/icons";
import { api, ApiError, paperHref } from "@/lib/api";
import type { Submission } from "@/lib/types";

const STATUS: Record<Submission["status"], string> = {
  pending: "Waiting for review",
  approved: "Live on SciRah",
  rejected: "Not approved",
};

export default function SubmitPage() {
  const { user, loading, getToken } = useAuth();
  const [doi, setDoi] = useState("");
  const [lookup, setLookup] = useState<{ found: boolean; paperId?: string; title?: string; doi: string } | null>(null);
  const [form, setForm] = useState({ title: "", authors: "", year: "", venue: "", doi: "", url: "", abstract: "" });
  const [busy, setBusy] = useState<null | "lookup" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Submission | null>(null);
  const [mine, setMine] = useState<Submission[]>([]);

  const loadMine = useCallback(async () => {
    const token = await getToken();
    if (token) setMine(await api<Submission[]>("/submissions/mine", { token }).catch(() => []));
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load once signed in
    if (user) loadMine();
  }, [user, loadMine]);

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-10"><div className="skeleton h-40 w-full" /></div>;
  if (!user)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Add a research paper</h1>
        <p className="mt-2 text-muted">Sign in to add papers to SciRah.</p>
        <Link href="/login?next=/submit" className="btn-primary mt-5">
          Sign in
        </Link>
      </div>
    );

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("lookup");
    try {
      const r = await api<{ found: boolean; paperId?: string; title?: string; doi: string }>(`/submissions/lookup?doi=${encodeURIComponent(doi)}`, {
        token: await getToken(),
      });
      setLookup(r);
      if (!r.found) setForm((f) => ({ ...f, doi: r.doi }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("submit");
    try {
      const r = await api<{ existing: boolean; paperId?: string; submission?: Submission }>("/submissions", {
        method: "POST",
        token: await getToken(),
        body: { ...form, year: form.year ? Number(form.year) : undefined },
      });
      if (r.existing && r.paperId) setLookup({ found: true, paperId: r.paperId, doi: form.doi });
      else if (r.submission) {
        setDone(r.submission);
        setForm({ title: "", authors: "", year: "", venue: "", doi: "", url: "", abstract: "" });
        loadMine();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the paper");
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="label mb-2 text-accent">Contribute</p>
      <h1 className="text-3xl font-bold">Add a research paper</h1>
      <p className="mt-2 text-muted">
        Add a paper that’s missing from SciRah — for example a thesis, a local journal article or a conference paper. SciRah stores only its details, never
        the paper itself.
      </p>

      <form onSubmit={check} className="card mt-6 p-5">
        <label htmlFor="doi" className="font-medium">
          1. Does it have a DOI?
        </label>
        <p className="mb-3 text-sm text-muted">We’ll check whether SciRah already knows it.</p>
        <div className="flex gap-2">
          <input id="doi" className="input" placeholder="10.1234/abcd.5678 or https://doi.org/…" value={doi} onChange={(e) => setDoi(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={busy !== null || doi.trim().length < 4}>
            {busy === "lookup" && <SpinnerIcon />} Check
          </button>
        </div>
        {lookup?.found && lookup.paperId && (
          <p className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
            Good news — this paper is already on SciRah{lookup.title ? `: “${lookup.title}”` : ""}.{" "}
            <Link href={paperHref(lookup.paperId)} className="link font-medium">
              Open it
            </Link>
          </p>
        )}
        {lookup && !lookup.found && <p className="mt-3 text-sm text-muted">Not found in the scholarly databases — please fill in its details below.</p>}
      </form>

      <form onSubmit={submit} className="card mt-4 space-y-4 p-5">
        <p className="font-medium">2. Paper details</p>
        <Field label="Title *">
          <input className="input" required minLength={5} value={form.title} onChange={set("title")} />
        </Field>
        <Field label="Authors *" hint="Separate names with commas">
          <input className="input" required value={form.authors} onChange={set("authors")} placeholder="Ayesha Khan, Ali Raza" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Year">
            <input className="input" inputMode="numeric" pattern="\d{4}" value={form.year} onChange={set("year")} />
          </Field>
          <Field label="Journal / conference / university">
            <input className="input" value={form.venue} onChange={set("venue")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="DOI">
            <input className="input" value={form.doi} onChange={set("doi")} />
          </Field>
          <Field label="Link to the paper">
            <input className="input" type="url" value={form.url} onChange={set("url")} placeholder="https://…" />
          </Field>
        </div>
        <Field label="Abstract">
          <textarea className="input min-h-32" value={form.abstract} onChange={set("abstract")} maxLength={8000} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        {done && (
          <p className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
            {done.status === "approved" ? (
              <>
                Added.{" "}
                <Link href={paperHref(done.paperId)} className="link font-medium">
                  Open the paper
                </Link>
              </>
            ) : (
              "Thanks! The paper will appear on SciRah once it has been reviewed."
            )}
          </p>
        )}
        <button className="btn-primary" disabled={busy !== null}>
          {busy === "submit" && <SpinnerIcon />} Add paper
        </button>
      </form>

      {mine.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">Your added papers</h2>
          <ul className="space-y-2">
            {mine.map((s) => (
              <li key={s.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  {s.status === "approved" ? (
                    <Link href={paperHref(s.paperId)} className="font-medium hover:text-primary">
                      {s.paper?.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.paper?.title}</span>
                  )}
                  {s.reviewNote && <span className="block text-xs text-muted">Note: {s.reviewNote}</span>}
                </span>
                <span className={`tag shrink-0 ${s.status === "approved" ? "border-primary/40 bg-primary/15 text-fg" : s.status === "rejected" ? "text-accent" : ""}`}>
                  {STATUS[s.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
