import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/paper-export";

/** robots.txt: let search engines in, keep them out of private and utility pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Google matches these as prefixes ("/auth" would also block "/authors"), so each ends at a word
      // boundary: "/x$" = exactly that page, "/x/" = everything under it.
      disallow: [
        "/account$",
        "/account/",
        "/saved$",
        "/notifications$",
        "/admin/",
        "/auth/",
        "/api/",
        "/login$",
        "/signup$",
        "/welcome$",
        "/submit$",
        "/read$",
        "/read?",
        "/*/export",
        "/*/slide$",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
