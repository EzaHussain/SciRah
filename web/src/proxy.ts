import { NextResponse, type NextRequest } from "next/server";

/**
 * One address for search engines and visitors: once a custom domain is set (NEXT_PUBLIC_SITE_URL, e.g.
 * https://scirah.com), visits to the old Vercel production address are sent there permanently.
 * Preview deployments (other *.vercel.app hosts) and local development are left alone.
 */
const OLD_HOST = "sci-rah.vercel.app";

export function proxy(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || request.headers.get("host") !== OLD_HOST) return NextResponse.next();
  let target: URL;
  try {
    target = new URL(request.nextUrl.pathname + request.nextUrl.search, site);
  } catch {
    return NextResponse.next();
  }
  if (target.host === OLD_HOST) return NextResponse.next();
  return NextResponse.redirect(target, 308);
}

export const config = {
  // Pages only — not Next's own files, images or the Google sign-in callback in flight.
  matcher: ["/((?!_next/|favicon.ico|icon.png|apple-icon.png|logo|auth/).*)"],
};
