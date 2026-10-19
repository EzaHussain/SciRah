import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage, OAUTH_COOKIE, setSessionCookie } from "@/lib/session";

/** Google redirects here with ?code&state. Exchange the code via the API and start a session. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const fail = (msg: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/auth/google", maxAge: 0 });
    return res;
  };

  const providerError = searchParams.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed: ${providerError}`);

  let saved: { state?: string; next?: string; role?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {}
  const code = searchParams.get("code");
  if (!code || !saved.state || saved.state !== searchParams.get("state")) {
    return fail("Your sign-in session expired. Please try “Continue with Google” again.");
  }

  const r = await apiFromServer(req, "/auth/google", {
    method: "POST",
    body: { code, redirectUri: `${origin}/auth/google/callback` },
  });
  if (!r.ok || !r.data.token) return fail(errorMessage(r.data, "Google sign-in failed"));

  let next = saved.next && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/";
  // New Google accounts haven't said whether they are a researcher or a reader yet.
  if (!r.data.user?.role) {
    const role = saved.role === "researcher" || saved.role === "reader" ? saved.role : null;
    if (role) {
      await apiFromServer(req, "/auth/me", { method: "PATCH", token: r.data.token, body: { role } });
      if (role === "researcher") next = "/account?setup=1";
    } else next = `/welcome?next=${encodeURIComponent(next)}`;
  }
  const res = NextResponse.redirect(`${origin}${next}`);
  setSessionCookie(res, req, r.data.token);
  res.cookies.set(OAUTH_COOKIE, "", { path: "/auth/google", maxAge: 0 });
  return res;
}
