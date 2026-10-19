"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { HeaderLogo } from "./brand";
import { GoogleIcon, SpinnerIcon } from "./icons";
import { RolePicker, type Role } from "./RolePicker";

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

type Step = "email" | "password" | "create" | "google-only";

/**
 * One sign-in screen for everyone. Google in one click; or an email, after which SciRah knows whether
 * to ask for a password (returning) or for a name, password and account type (new).
 */
export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { configured, apiReachable, googleEnabled, loading, signIn, signUp } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const secondField = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("email");
    setPassword("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      if (step === "email") {
        const r = await api<{ exists: boolean; password: boolean; google: boolean }>("/auth/check-email", {
          method: "POST",
          body: { email: email.trim() },
        });
        const nextStep: Step = !r.exists ? "create" : r.password ? "password" : r.google ? "google-only" : "password";
        setStep(nextStep);
        setTimeout(() => secondField.current?.focus(), 50);
        return;
      }
      if (step === "password") {
        await signIn(email.trim(), password);
        router.replace(next);
      } else if (step === "create") {
        if (!role) throw new Error("Please choose whether you are a researcher or a reader.");
        await signUp(name.trim(), email.trim(), password, role);
        // Researchers go straight to setting up their public profile.
        router.replace(role === "researcher" ? "/account?setup=1" : next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const title = step === "create" ? "Create your account" : step === "password" ? "Welcome back" : "Sign in to SciRah";
  const subtitle =
    step === "create"
      ? "New here — just a few details."
      : step === "password"
        ? "Enter your password to continue."
        : "Save papers, get AI summaries in 7 languages and a feed that learns your interests. New or returning, start here.";

  const googleButton = googleEnabled && (
    // A plain link (full-page navigation): the server route redirects to Google's consent screen.
    <a
      href={`/auth/google?next=${encodeURIComponent(next)}`}
      onClick={() => setBusy("google")}
      aria-disabled={busy !== null}
      className={`btn-ghost w-full py-2.5 ${busy !== null ? "pointer-events-none opacity-60" : ""}`}
    >
      {busy === "google" ? <SpinnerIcon /> : <GoogleIcon />} Continue with Google
    </a>
  );

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
      <div className="mb-6 flex flex-col items-center text-center">
        <HeaderLogo className="mb-4 h-16 w-16 rounded-2xl shadow-lg" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
      </div>

      <div className="card p-5 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !configured ? (
          <p className="text-sm text-muted">
            {!apiReachable ? "Can’t reach the SciRah server right now. Please try again in a minute." : "Accounts are not available on this server."}
          </p>
        ) : (
          <>
            {step === "email" && googleEnabled && (
              <>
                {googleButton}
                <div className="my-5 flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm">
                  Email
                </label>
                {step === "email" ? (
                  <input id="email" type="email" required autoFocus className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-subtle px-3.5 py-2.5 text-sm">
                    <span className="truncate">{email}</span>
                    <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={reset}>
                      Change
                    </button>
                  </div>
                )}
              </div>

              {step === "google-only" && (
                <div className="space-y-3">
                  <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm">This account signs in with Google.</p>
                  {googleButton}
                </div>
              )}

              {step === "create" && (
                <>
                  <div>
                    <p className="mb-2 text-sm">Who are you?</p>
                    <RolePicker value={role} onChange={setRole} />
                  </div>
                  <div>
                    <label htmlFor="name" className="mb-1 block text-sm">
                      Full name
                    </label>
                    <input id="name" ref={secondField} required className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                  </div>
                </>
              )}

              {(step === "password" || step === "create") && (
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm">
                    {step === "create" ? "Choose a password" : "Password"}
                  </label>
                  <input
                    id="password"
                    ref={step === "password" ? secondField : undefined}
                    type="password"
                    required
                    minLength={step === "create" ? 8 : undefined}
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={step === "create" ? "new-password" : "current-password"}
                  />
                  {step === "create" && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              {step !== "google-only" && (
                <button type="submit" disabled={busy !== null} className="btn-primary w-full py-2.5">
                  {busy === "email" && <SpinnerIcon />}
                  {step === "email" ? "Continue" : step === "password" ? "Sign in" : "Create account"}
                </button>
              )}
            </form>
          </>
        )}
      </div>
      <p className="mt-5 text-center text-xs text-muted">
        By continuing you agree to SciRah’s <a href="/terms" className="link">Terms</a> and <a href="/privacy" className="link">Privacy policy</a>.
      </p>
    </div>
  );
}
