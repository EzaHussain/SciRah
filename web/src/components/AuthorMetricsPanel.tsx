"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, readerHref } from "@/lib/api";
import type { AuthorMetrics, AuthorMetricsSet } from "@/lib/types";
import { PAPERS_CHANGED } from "./AuthorPapers";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("en").format(n));
const compact = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

const ROWS: { key: keyof AuthorMetricsSet; label: string }[] = [
  { key: "citations", label: "Citations" },
  { key: "hIndex", label: "h-index" },
  { key: "i10Index", label: "i10-index" },
  { key: "works", label: "Works" },
];

/**
 * Headline numbers for a researcher plus a side-by-side comparison of sources. Databases index
 * different papers, so numbers differ; when the verified researcher has entered their own numbers
 * (e.g. from Google Scholar) those lead, clearly labelled.
 */
export function AuthorMetricsPanel({ authorId, initial }: { authorId: string; initial: AuthorMetricsSet }) {
  const [m, setM] = useState<AuthorMetrics | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<AuthorMetrics>(`/authors/${encodeURIComponent(authorId)}/metrics`)
        .then((r) => !cancelled && setM(r))
        .catch(() => undefined);
    load();
    // The verified researcher removed or restored a paper: numbers change.
    window.addEventListener(PAPERS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PAPERS_CHANGED, load);
    };
  }, [authorId]);

  const verified = m?.verified;
  const combined = m?.combined;
  const headline = (k: keyof AuthorMetricsSet) => verified?.[k] ?? combined?.[k] ?? initial[k];
  const sources: { name: string; set: AuthorMetricsSet | null | undefined; href?: string; note?: string }[] = [
    { name: "SciRah cross-check", set: m ? m.combined : undefined },
    { name: "OpenAlex", set: m?.openalex ?? initial },
    { name: "Crossref", set: m ? m.crossref : undefined },
    { name: "Semantic Scholar", set: m?.semanticScholar, href: m?.semanticScholar?.url },
    ...(verified ? [{ name: `Researcher · ${verified.source ?? "self-reported"}`, set: verified, href: verified.url ?? undefined, note: "verified owner" }] : []),
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        {ROWS.map((r) => (
          <div key={r.key} className="card p-3.5">
            <dt className="label text-muted">{r.label}</dt>
            <dd className="mt-1 font-heading text-2xl font-semibold">{compact(headline(r.key))}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        {verified ? (
          <>✓ Numbers confirmed by the researcher{verified.source ? ` (from ${verified.source})` : ""}. </>
        ) : combined ? (
          <>Cross-checked paper by paper in OpenAlex, Crossref and Semantic Scholar. </>
        ) : (
          <>From OpenAlex. </>
        )}
        <button className="underline-offset-2 hover:text-fg hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide sources" : "Compare sources"}
        </button>
      </p>
      {open && (
        <div className="card mt-2 overflow-x-auto p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-3 font-medium">Source</th>
                {ROWS.map((r) => (
                  <th key={r.key} className="py-1 pr-3 text-right font-medium">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    {s.href ? (
                      <Link href={readerHref(s.href, { title: s.name })} className="hover:text-primary hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      s.name
                    )}
                  </td>
                  {ROWS.map((r) => (
                    <td key={r.key} className="py-1.5 pr-3 text-right font-mono text-xs">
                      {s.set === undefined ? "…" : fmt(s.set?.[r.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            The SciRah cross-check looks up every paper in OpenAlex, Crossref and Semantic Scholar and keeps the highest citation count found
            for each one. Each database finds a different set of citations, so numbers differ — Google Scholar usually counts the most because it
            also includes theses, preprints and web documents. SciRah can’t read Google Scholar automatically; a verified researcher can enter their
            Google Scholar numbers on this page.
          </p>
        </div>
      )}
    </div>
  );
}
