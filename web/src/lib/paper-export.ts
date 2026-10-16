import { api, ApiError } from "./api";
import type { Paper, Summary } from "./types";

/** A paper plus its AI summary (if one has been generated) — for exports and slides. */
export async function loadPaperForExport(id: string): Promise<{ paper: Paper; summary: Summary | null } | null> {
  try {
    const paper = await api<Paper>(`/papers/detail?id=${encodeURIComponent(id)}`);
    const summary = await api<Summary | null>(`/ai/summary?paperId=${encodeURIComponent(paper.id)}`).catch(() => null);
    return { paper, summary };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/** "Lastname, F. M." for APA. */
function apaName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts.pop()!;
  return `${last}, ${parts.map((p) => `${p[0]}.`).join(" ")}`;
}

/** APA 7-style reference. */
export function apaCitation(p: Paper): string {
  const names = p.authors.map((a) => apaName(a.name));
  const authors =
    names.length === 0
      ? ""
      : names.length === 1
        ? names[0]
        : names.length <= 20
          ? `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
          : `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;
  const parts = [
    authors ? `${authors} ` : "",
    `(${p.year ?? "n.d."}). `,
    `${p.title.replace(/\.$/, "")}. `,
    p.venue ? `${p.venue}. ` : "",
    p.ids.doi ? `https://doi.org/${p.ids.doi}` : (p.sourceUrl ?? ""),
  ];
  return parts.join("").trim();
}

/**
 * The site's public address: NEXT_PUBLIC_SITE_URL when set (e.g. a custom domain), otherwise the
 * production address Vercel provides automatically, otherwise local development.
 */
export const siteUrl = () =>
  (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
