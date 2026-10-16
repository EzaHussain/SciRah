"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SectionTitle } from "@/components/brand";
import { Avatar } from "@/components/Header";
import { GoogleIcon, SpinnerIcon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";

export default function AccountPage() {
  const { user, loading, getToken, refresh, signOut } = useAuth();
  const router = useRouter();

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-10"><div className="skeleton h-40 w-full" /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-2 text-muted">Sign in to manage your account.</p>
        <Link href="/login?next=/account" className="btn-primary mt-6">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <SectionTitle kicker="Account" title="Your account" />

      <div className="card flex items-center gap-4 p-5">
        <Avatar name={user.name} url={user.avatarUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-semibold">{user.name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
            {user.googleLinked && (
              <span className="tag">
                <GoogleIcon className="h-3 w-3" /> Google linked
              </span>
            )}
            {user.hasPassword && <span className="tag">Password set</span>}
            <span>Member since {new Date(user.createdAt).toLocaleDateString()}</span>
          </p>
        </div>
      </div>

      <NameForm initial={user.name} onSaved={() => refresh()} getToken={getToken} />
      <PasswordForm hasPassword={user.hasPassword} getToken={getToken} onChanged={(t) => refresh(t)} />

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Sessions</h2>
        <p className="text-sm text-muted">Signed in on a shared or lost device? Sign out everywhere (including here).</p>
        <button
          className="btn-ghost"
          onClick={async () => {
            await api("/auth/logout-all", { method: "POST", token: await getToken() }).catch(() => undefined);
            await signOut();
            router.push("/login");
          }}
        >
          Sign out of all devices
        </button>
      </section>

      <DangerZone getToken={getToken} onDeleted={async () => {
        await signOut();
        router.push("/");
      }} />
    </div>
  );
}

function NameForm({ initial, onSaved, getToken }: { initial: string; onSaved: () => void; getToken: () => Promise<string | null> }) {
  const [name, setName] = useState(initial);
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          await api("/auth/me", { method: "PATCH", token: await getToken(), body: { name } });
          setState("saved");
          onSaved();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not save");
          setState("idle");
        }
      }}
    >
      <h2 className="font-semibold">Display name</h2>
      <p className="text-sm text-muted">Shown next to your comments.</p>
      <div className="flex gap-2">
        <input className="input" value={name} onChange={(e) => (setName(e.target.value), setState("idle"))} maxLength={80} required aria-label="Display name" />
        <button className="btn-primary shrink-0" disabled={state === "busy" || !name.trim()}>
          {state === "busy" && <SpinnerIcon />}
          {state === "saved" ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}
    </form>
  );
}

function PasswordForm({ hasPassword, getToken, onChanged }: { hasPassword: boolean; getToken: () => Promise<string | null>; onChanged: (token: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ token: string }>("/auth/password", { method: "POST", token: await getToken(), body: { currentPassword: current, newPassword: next } });
          setCurrent("");
          setNext("");
          setMsg({ ok: true, text: hasPassword ? "Password changed. Other devices have been signed out." : "Password set. You can now also sign in with email." });
          onChanged(r.token);
        } catch (err) {
          setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not change password" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">{hasPassword ? "Change password" : "Set a password"}</h2>
      {!hasPassword && <p className="text-sm text-muted">You sign in with Google. Add a password to also sign in with your email.</p>}
      {hasPassword && (
        <input className="input" type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      )}
      <input className="input" type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} autoComplete="new-password" required />
      <button className="btn-primary" disabled={busy}>
        {busy && <SpinnerIcon />} {hasPassword ? "Change password" : "Set password"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-fg" : "text-accent"}`}>{msg.text}</p>}
    </form>
  );
}

function DangerZone({ getToken, onDeleted }: { getToken: () => Promise<string | null>; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 border-accent/40 p-5">
      <h2 className="font-semibold text-accent">Delete account</h2>
      <p className="text-sm text-muted">Permanently deletes your account, saved papers, comments, alerts and notifications. Type DELETE to confirm.</p>
      <div className="flex gap-2">
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" />
        <button
          className="btn shrink-0 bg-accent text-white"
          disabled={confirm !== "DELETE" || busy}
          onClick={async () => {
            setBusy(true);
            await api("/auth/me", { method: "DELETE", token: await getToken() }).catch(() => undefined);
            onDeleted();
          }}
        >
          {busy && <SpinnerIcon />} Delete
        </button>
      </div>
    </section>
  );
}
