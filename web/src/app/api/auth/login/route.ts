import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage, setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const r = await apiFromServer(req, "/auth/login", { method: "POST", body: { email: body.email, password: body.password } });
  if (!r.ok) return NextResponse.json({ message: errorMessage(r.data, "Sign-in failed") }, { status: r.status || 502 });
  const res = NextResponse.json({ user: r.data.user, token: r.data.token });
  setSessionCookie(res, req, r.data.token);
  return res;
}
