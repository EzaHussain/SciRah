import type { NextConfig } from "next";

/**
 * One address for visitors and search engines: once a custom domain is set (NEXT_PUBLIC_SITE_URL, e.g.
 * https://scirah.com), the old Vercel address and the "www." form redirect there permanently. These are
 * routing rules handled by Vercel's edge — unlike middleware, they don't run a function on every visit.
 * Sign-in callbacks (/auth/…) in flight are left alone.
 */
const OLD_HOST = "sci-rah.vercel.app";

function siteRedirects() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!site) return [];
  let host: string;
  try {
    host = new URL(site).host;
  } catch {
    return [];
  }
  return [OLD_HOST, `www.${host}`]
    .filter((h) => h !== host)
    .map((h) => ({
      source: "/:path((?!auth/).*)",
      has: [{ type: "host" as const, value: h }],
      destination: `${site}/:path`,
      permanent: true,
    }));
}

const nextConfig: NextConfig = {
  async redirects() {
    return siteRedirects();
  },
};

export default nextConfig;
