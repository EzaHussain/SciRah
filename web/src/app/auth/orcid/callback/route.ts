import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage, SESSION_COOKIE } from "@/lib/session";

/** ORCID redirects here with ?code&state. The API checks the ORCID iD matches the profile and records the claim. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  let saved: { state?: string; author?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("scirah_orcid")?.value ?? "{}");
  } catch {}
  const author = saved.author && /^openalex:A\d+$/i.test(saved.author) ? saved.author : null;
  const back = author ? `${origin}/author/${encodeURIComponent(author)}` : `${origin}/`;
  const done = (error?: string) => {
    const res = NextResponse.redirect(error ? `${back}?claimError=${encodeURIComponent(error)}` : `${back}?claimed=1`);
    res.cookies.set("scirah_orcid", "", { path: "/auth/orcid", maxAge: 0 });
    return res;
  };

  if (searchParams.get("error")) return done("ORCID sign-in was cancelled.");
  const code = searchParams.get("code");
  if (!author || !code || saved.state !== searchParams.get("state")) return done("Your verification session expired. Please try again.");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return done("Please sign in to SciRah first.");

  const r = await apiFromServer(req, "/authors/claim", {
    method: "POST",
    token,
    body: { authorId: author, code, redirectUri: `${origin}/auth/orcid/callback` },
  });
  return r.ok ? done() : done(errorMessage(r.data, "Could not verify this profile"));
}
