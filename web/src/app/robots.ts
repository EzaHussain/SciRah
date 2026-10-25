import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/paper-export";

/**
 * AI-training and SEO-tool crawlers: they bring no visitors but crawl every page, which used up the
 * Vercel Hobby limits (Oct 2026). Search engines (Google, Bing…) are still welcome.
 */
const BLOCKED_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "FacebookBot",
  "PerplexityBot",
  "Google-Extended",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "PetalBot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
];

/** robots.txt: let search engines in, keep them out of private, utility and search-result pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: BLOCKED_BOTS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        // Google matches these as prefixes ("/auth" would also block "/authors"), so each ends at a word
        // boundary: "/x$" = exactly that page, "/x/" = everything under it, "/x?" = that page with a query.
        disallow: [
          // Search results: endless combinations of queries and filters, each a heavy page. Papers and
          // researchers are found through the sitemap and the links on paper/author pages instead.
          "/search$",
          "/search?",
          "/account$",
          "/account/",
          "/saved$",
          "/notifications$",
          "/admin/",
          "/auth/",
          "/api/",
          "/login",
          "/signup$",
          "/welcome$",
          "/submit$",
          "/read$",
          "/read?",
          "/*/export",
          "/*/slide$",
          "/*/full$",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
