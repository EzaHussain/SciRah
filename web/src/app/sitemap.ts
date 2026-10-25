import type { MetadataRoute } from "next";
import { API_URL, authorHref, paperHref, venueHref } from "@/lib/api";
import { siteUrl } from "@/lib/paper-export";

// Rebuilt every 6 hours with the papers and researchers people use on SciRah.
export const revalidate = 21600;

interface Entry {
  id: string;
  updatedAt?: string;
}

const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/authors", priority: 0.8, changeFrequency: "weekly" },
  { path: "/pakistan", priority: 0.8, changeFrequency: "weekly" },
  { path: "/news", priority: 0.7, changeFrequency: "daily" },
  { path: "/topics", priority: 0.7, changeFrequency: "monthly" },
  { path: "/journals", priority: 0.6, changeFrequency: "weekly" },
  { path: "/score", priority: 0.5, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

/** sitemap.xml for search engines (Google Search Console → Sitemaps → "sitemap.xml"). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const data = await fetch(`${API_URL}/seo/sitemap`, { next: { revalidate } })
    .then((r) => (r.ok ? (r.json() as Promise<{ papers: Entry[]; authors: Entry[]; researchers: Entry[]; venues: Entry[] }>) : null))
    .catch(() => null);

  const list = (entries: Entry[] | undefined, href: (id: string) => string, priority: number) =>
    (entries ?? []).map((e) => ({
      url: `${base}${href(e.id)}`,
      lastModified: e.updatedAt ? new Date(e.updatedAt) : undefined,
      changeFrequency: "monthly" as const,
      priority,
    }));

  return [
    ...STATIC.map((s) => ({ url: `${base}${s.path === "/" ? "" : s.path}`, lastModified: now, changeFrequency: s.changeFrequency, priority: s.priority })),
    ...list(data?.authors, authorHref, 0.6),
    ...list(data?.researchers, (id) => `/researcher/${encodeURIComponent(id)}`, 0.5),
    ...list(data?.venues, venueHref, 0.5),
    ...list(data?.papers, paperHref, 0.5),
  ].slice(0, 50_000);
}
