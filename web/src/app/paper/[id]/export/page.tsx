import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { decodeParam } from "@/lib/api";
import { AI_DISCLAIMER, SUMMARY_LANGS } from "@/lib/languages";
import { apaCitation, loadPaperForExport, siteUrl } from "@/lib/paper-export";

export const metadata: Metadata = { title: "Export", robots: { index: false } };

/** A clean, printable document of the paper's details and AI summary ("Save as PDF"). */
export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadPaperForExport(decodeParam((await params).id));
  if (!loaded) notFound();
  const { paper, summary } = loaded;
  const link = `${siteUrl()}/paper/${encodeURIComponent(paper.id)}`;
  const translations = SUMMARY_LANGS.flatMap((l) => {
    const text = l.code === "en" ? undefined : summary?.translations[l.code];
    return text ? [{ ...l, text }] : [];
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/paper/${encodeURIComponent(paper.id)}`} className="btn-ghost py-1.5">
          ← Paper
        </Link>
        <PrintButton label="Save as PDF" />
        <a href={`/paper/${encodeURIComponent(paper.id)}/export/docx`} download className="btn-ghost py-1.5">
          Download Word (.docx)
        </a>
        <p className="w-full text-xs text-muted">In the print dialog, choose “Save as PDF” as the destination.</p>
      </div>

      <article className="card p-6 sm:p-8">
        <p className="label text-accent">SciRah · Paper summary</p>
        <h1 className="mt-2 text-2xl leading-tight font-bold">{paper.title}</h1>
        <p className="mt-3 text-sm">{paper.authors.map((a) => a.name).join(", ")}</p>
        <p className="mt-1 text-sm text-muted">
          {[paper.venue, paper.publisher, paper.publishedDate ?? paper.year].filter(Boolean).join(" · ")}
          {paper.citationCount !== undefined && <> · {new Intl.NumberFormat("en").format(paper.citationCount)} citations</>}
        </p>
        {paper.ids.doi && <p className="mt-1 font-mono text-xs">DOI: {paper.ids.doi}</p>}

        {summary && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">AI summary</h2>
            <p className="mt-2 leading-relaxed">{summary.summaryEn}</p>
            {translations.map((l) => (
              <div key={l.code} className="mt-4">
                <h3 className="text-sm font-semibold text-muted">{l.label}</h3>
                <p lang={l.code} dir={l.dir} className={`mt-1 leading-relaxed ${l.code === "ur" ? "urdu" : ""}`}>
                  {l.text}
                </p>
              </div>
            ))}
            <p className="mt-4 rounded-lg border border-line p-2 text-xs text-muted">{AI_DISCLAIMER}</p>
          </section>
        )}

        {paper.abstract && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Abstract</h2>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-fg/90">{paper.abstract}</p>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-semibold">How to cite (APA)</h2>
          <p className="mt-2 text-sm leading-relaxed">{apaCitation(paper)}</p>
        </section>

        <p className="mt-8 border-t border-line pt-3 text-xs text-muted">
          Exported from SciRah — {link}. SciRah does not host papers; read the full text at the original publisher.
        </p>
      </article>
    </div>
  );
}
