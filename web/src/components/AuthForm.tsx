"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { HeaderLogo } from "./brand";
import { GoogleIcon, SpinnerIcon } from "./icons";
import { RolePicker, type Role } from "./RolePicker";

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(null);

  const { configured, apiReachable, googleEnabled, loading, signIn, signUp } = useAuth();

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("email");
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        if (!role) throw new Error("Please choose whether you are a researcher or a reader.");
        await signUp(name.trim(), email.trim(), password, role);
        // Researchers go straight to setting up their public profile.
        router.replace(role === "researcher" ? "/account?setup=1" : next);
      } else {
        await signIn(email.trim(), password);
        router.replace(next);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };


  const title = mode === "login" ? "Welcome back" : "Create your SciRah account";
  const other = mode === "login" ? "signup" : "login";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
      <div className="mb-6 flex flex-col items-center text-center">
        <HeaderLogo className="mb-4 h-16 w-16 rounded-2xl shadow-lg" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {mode === "login" ? "Sign in to save papers and get AI summaries." : "Save papers, get summaries in English and Urdu, and a feed that learns your interests."}
        </p>
      </div>

      <div className="card p-5 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !configured ? (
          <div className="space-y-2 text-sm text-muted">
            {!apiReachable ? (
              <p>
                Can’t reach the SciRah API. Start it with <code className="font-mono text-xs">npm run start:dev</code> in{" "}
                <code className="font-mono text-xs">api/</code> and check <code className="font-mono text-xs">NEXT_PUBLIC_API_URL</code> in{" "}
                <code className="font-mono text-xs">web/.env.local</code>.
              </p>
            ) : (
              <p>
                Accounts need a database. Set <code className="font-mono text-xs">DATABASE_URL</code> in{" "}
                <code className="font-mono text-xs">api/.env</code> to any PostgreSQL database and restart the API.
              </p>
            )}
          </div>
        ) : (
          <>
            {mode === "signup" && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium">Who are you?</p>
                <RolePicker value={role} onChange={setRole} />
              </div>
            )}
            {googleEnabled ? (
              // A plain link (full-page navigation): the server route redirects to Google's consent screen.
              <a
                href={`/auth/google?next=${encodeURIComponent(next)}${mode === "signup" && role ? `&role=${role}` : ""}`}
                onClick={() => setBusy("google")}
                aria-disabled={busy !== null}
                className={`btn-ghost w-full py-2.5 ${busy !== null ? "pointer-events-none opacity-60" : ""}`}
              >
                {busy === "google" ? <SpinnerIcon /> : <GoogleIcon />} Continue with Google
              </a>
            ) : (
              <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-xs text-muted">
                Google sign-in isn’t set up on this server yet (add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">api/.env</code>). Email sign-in works below.
              </p>
            )}

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={onEmail} className="space-y-3.5">
              {mode === "signup" && (
                <div>
                  <label htmlFor="name" className="mb-1 block text-sm">
                    Full name
                  </label>
                  <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                </div>
              )}
              <div>
                <label htmlFor="email" className="mb-1 block text-sm">
                  Email
                </label>
                <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                {mode === "signup" && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                  {notice}
                </p>
              )}

              <button type="submit" disabled={busy !== null} className="btn-primary w-full py-2.5">
                {busy === "email" && <SpinnerIcon />}
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        {mode === "login" ? "New to SciRah?" : "Already have an account?"}{" "}
        <Link href={`/${other}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link text-fg">
          {mode === "login" ? "Create your SciRah account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
