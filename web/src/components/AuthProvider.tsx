"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

interface AuthState {
  /** Accounts are available (API reachable and connected to its database). */
  configured: boolean;
  apiReachable: boolean;
  googleEnabled: boolean;
  loading: boolean;
  user: SessionUser | null;
  /** Current API token (kept in memory; the httpOnly cookie is the source of truth). */
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, role: "reader" | "researcher") => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the session (e.g. after editing the profile) or adopt a freshly issued token. */
  refresh: (newToken?: string) => Promise<void>;
  saved: Set<string>;
  toggleSaved: (paperId: string) => Promise<boolean>;
}

interface SessionResponse {
  apiReachable: boolean;
  accounts: boolean;
  google: boolean;
  user: SessionUser | null;
  token: string | null;
}

const AuthContext = createContext<AuthState | null>(null);
const EMPTY: Set<string> = new Set();

async function postJson<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [rawSaved, setSaved] = useState<Set<string>>(EMPTY);
  // Which user `rawSaved` belongs to, so a sign-out (or user switch) never shows stale bookmarks.
  const [savedOwner, setSavedOwner] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      setSession(await res.json());
    } catch {
      setSession({ apiReachable: false, accounts: false, google: false, user: null, token: null });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session fetch
    load();
  }, [load]);

  const token = session?.token ?? null;
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const saved = userId && savedOwner === userId ? rawSaved : EMPTY;

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    api<string[]>("/bookmarks/ids", { token })
      .then((ids) => {
        if (cancelled) return;
        setSaved(new Set(ids));
        setSavedOwner(userId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Reload only when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const getToken = useCallback(async () => token, [token]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await postJson<{ user: SessionUser; token: string }>("/api/auth/login", { email, password });
    setSession((s) => ({ ...(s ?? { apiReachable: true, accounts: true, google: false }), user: r.user, token: r.token }));
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, role: "reader" | "researcher") => {
    const r = await postJson<{ user: SessionUser; token: string }>("/api/auth/signup", { name, email, password, role });
    setSession((s) => ({ ...(s ?? { apiReachable: true, accounts: true, google: false }), user: r.user, token: r.token }));
  }, []);

  const signOut = useCallback(async () => {
    await postJson("/api/auth/session", undefined, "DELETE").catch(() => undefined);
    setSession((s) => (s ? { ...s, user: null, token: null } : s));
  }, []);

  const refresh = useCallback(
    async (newToken?: string) => {
      if (newToken) await postJson("/api/auth/token", { token: newToken });
      await load();
    },
    [load],
  );

  const toggleSaved = useCallback(
    async (paperId: string) => {
      if (!token) throw new Error("Please sign in to save papers");
      const isSaved = saved.has(paperId);
      // Optimistic update, rolled back on failure.
      setSaved((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(paperId);
        else next.add(paperId);
        return next;
      });
      try {
        if (isSaved) {
          const res = await api<{ paperId: string }>(`/bookmarks?paperId=${encodeURIComponent(paperId)}`, { method: "DELETE", token });
          // The server may have matched the canonical id; forget that one too.
          if (res.paperId !== paperId)
            setSaved((prev) => {
              const next = new Set(prev);
              next.delete(res.paperId);
              return next;
            });
        } else {
          const res = await api<{ paperId: string }>("/bookmarks", { method: "POST", token, body: { paperId } });
          // The server may canonicalise the id (e.g. doi:… → openalex:W…).
          if (res.paperId !== paperId) setSaved((prev) => new Set(prev).add(res.paperId));
        }
        return !isSaved;
      } catch (e) {
        setSaved((prev) => {
          const next = new Set(prev);
          if (isSaved) next.add(paperId);
          else next.delete(paperId);
          return next;
        });
        throw e;
      }
    },
    [token, saved],
  );

  const value = useMemo<AuthState>(
    () => ({
      configured: session ? session.accounts : true,
      apiReachable: session?.apiReachable ?? true,
      googleEnabled: session?.google ?? false,
      loading: session === null,
      user,
      getToken,
      signIn,
      signUp,
      signOut,
      refresh,
      saved,
      toggleSaved,
    }),
    [session, user, getToken, signIn, signUp, signOut, refresh, saved, toggleSaved],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
