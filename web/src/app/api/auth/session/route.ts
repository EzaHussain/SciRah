import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, clearSessionCookie, SESSION_COOKIE } from "@/lib/session";

interface Health {
  features?: { accounts?: boolean; googleSignIn?: boolean };
}

/** Current session for the browser: the user, their API token (kept in memory client-side), and which sign-in methods exist. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  const [health, me] = await Promise.all([
    apiFromServer(req, "/health"),
    token ? apiFromServer(req, "/auth/me", { token }) : Promise.resolve(null),
  ]);
  const features = (health.data as Health).features ?? {};
  const body = {
    apiReachable: health.ok,
    accounts: !!features.accounts,
    google: !!features.googleSignIn,
    user: me?.ok ? me.data : null,
    token: me?.ok ? token : null,
  };
  const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  // Expired / revoked token: drop the cookie (but keep it if the API is merely unreachable).
  if (token && me && (me.status === 401 || me.status === 403)) clearSessionCookie(res);
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
