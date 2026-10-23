import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/paper-export";

/** robots.txt: let search engines in, keep them out of private and utility pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/saved", "/notifications", "/admin", "/auth", "/api", "/login", "/signup", "/welcome", "/submit", "/read", "/*/export", "/*/slide"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
