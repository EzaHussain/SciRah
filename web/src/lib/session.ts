import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { API_URL } from "./api";

/** httpOnly cookie holding the SciRah API session token (set only by our route handlers). */
export const SESSION_COOKIE = "scirah_session";
export const OAUTH_COOKIE = "scirah_oauth";
/**
 * Readable by the browser (unlike the session cookie) and holds no secret: it only says "someone signed
 * in here", so signed-out visitors and crawlers don't make a session request to the server on every page.
 */
export const SIGNED_IN_COOKIE = "scirah_signed_in";
const SESSION_DAYS = 30;

export async function getServerToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

const isHttps = (req: NextRequest) =>
  req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  res.cookies.set(SIGNED_IN_COOKIE, "1", { sameSite: "lax", secure: isHttps(req), path: "/", maxAge: SESSION_DAYS * 86_400 });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(SIGNED_IN_COOKIE, "", { path: "/", maxAge: 0 });
}

export function oauthCookieOptions(req: NextRequest) {
  return { httpOnly: true, sameSite: "lax" as const, secure: isHttps(req), path: "/auth/google", maxAge: 600 };
}

/** Server-side call to the SciRah API that forwards the visitor's IP (for rate limiting). */
export async function apiFromServer(req: NextRequest, path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "";
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(ip ? { "X-Forwarded-For": ip } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { message: `Can't reach the SciRah API at ${API_URL}. Is it running?` },
    };
  }
}

export const errorMessage = (data: unknown, fallback: string) => {
  const m = (data as { message?: unknown })?.message;
  return Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : fallback;
};
