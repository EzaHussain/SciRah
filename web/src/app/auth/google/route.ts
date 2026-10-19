import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage, OAUTH_COOKIE, oauthCookieOptions } from "@/lib/session";

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

/** Start "Continue with Google": ask the API for Google's consent URL and redirect there. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const roleParam = req.nextUrl.searchParams.get("role");
  const role = roleParam === "researcher" || roleParam === "reader" ? roleParam : undefined;
  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${origin}/auth/google/callback`;

  const r = await apiFromServer(req, `/auth/google/url?${new URLSearchParams({ redirectUri, state })}`);
  if (!r.ok || !r.data.url) {
    const msg = errorMessage(r.data, "Google sign-in is unavailable");
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  }
  const res = NextResponse.redirect(r.data.url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, next, role }), oauthCookieOptions(req));
  return res;
}
