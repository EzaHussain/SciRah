import { NextResponse, type NextRequest } from "next/server";
import { apiFromServer, errorMessage, setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const r = await apiFromServer(req, "/auth/signup", {
    method: "POST",
    body: { name: body.name, email: body.email, password: body.password },
  });
  if (!r.ok) return NextResponse.json({ message: errorMessage(r.data, "Could not create your account") }, { status: r.status || 502 });
  const res = NextResponse.json({ user: r.data.user, token: r.data.token }, { status: 201 });
  setSessionCookie(res, req, r.data.token);
  return res;
}
