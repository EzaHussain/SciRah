import { NextResponse, type NextRequest } from "next/server";
import { setSessionCookie } from "@/lib/session";

/** Replace the session cookie after the API issued a fresh token (e.g. after a password change). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.token !== "string" || body.token.split(".").length !== 3) {
    return NextResponse.json({ message: "Invalid token" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, req, body.token);
  return res;
}
