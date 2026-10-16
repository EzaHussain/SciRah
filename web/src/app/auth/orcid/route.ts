import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage } from "@/lib/session";

const ORCID_COOKIE = "scirah_orcid";

/** Start claiming a researcher profile: ask the API for ORCID's sign-in URL and redirect there. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const author = req.nextUrl.searchParams.get("author") ?? "";
  if (!/^openalex:A\d+$/i.test(author)) return NextResponse.redirect(`${origin}/`);
  const back = `${origin}/author/${encodeURIComponent(author)}`;
  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${origin}/auth/orcid/callback`;

  const r = await apiFromServer(req, `/authors/claim/orcid-url?${new URLSearchParams({ redirectUri, state })}`);
  if (!r.ok || !r.data.url) return NextResponse.redirect(`${back}?claimError=${encodeURIComponent(errorMessage(r.data, "ORCID sign-in is unavailable"))}`);
  const res = NextResponse.redirect(r.data.url);
  res.cookies.set(ORCID_COOKIE, JSON.stringify({ state, author }), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/auth/orcid",
    maxAge: 600,
  });
  return res;
}
