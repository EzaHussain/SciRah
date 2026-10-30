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

/**
 * Cache public, per-URL pages in Vercel's CDN for a while (Vercel-CDN-Cache-Control: honoured by
 * Vercel's edge, ignored by browsers). Unlike ISR this writes nothing to Vercel's ISR store — ISR on
 * millions of crawled paper/author URLs blew the Hobby "ISR Writes" limit (Oct 2026). These pages don't
 * read cookies, so every visitor gets the same HTML; personal parts load in the browser.
 */
const cdn = (seconds: number) => [{ key: "Vercel-CDN-Cache-Control", value: `max-age=${seconds}, stale-while-revalidate=${seconds * 7}` }];

const nextConfig: NextConfig = {
  async redirects() {
    return siteRedirects();
  },
  async headers() {
    return [
      { source: "/paper/:id", headers: cdn(86400) },
      { source: "/paper/:id/full", headers: cdn(86400) },
      { source: "/paper/:id/opengraph-image", headers: cdn(7 * 86400) },
      { source: "/author/:id", headers: cdn(6 * 3600) },
      { source: "/venue/:id", headers: cdn(86400) },
      { source: "/researcher/:id", headers: cdn(3600) },
    ];
  },
};

export default nextConfig;
