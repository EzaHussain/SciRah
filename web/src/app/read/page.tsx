import type { Metadata } from "next";
import Link from "next/link";
import { ExpandableText } from "@/components/ExpandableText";
import { UnlockIcon } from "@/components/icons";
import { api, paperHref, pdfProxyUrl, readerHref } from "@/lib/api";
import type { Paper, ReaderInfo } from "@/lib/types";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: one(sp.title) ?? "Reader", robots: { index: false } };
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

const safeBack = (b?: string) => (b && b.startsWith("/") && !b.startsWith("//") ? b : undefined);

/**
 * SciRah's in-app reader. Publisher pages, open-access PDFs, news articles and profiles open here,
 * inside SciRah, instead of a new tab. PDFs are streamed through the SciRah API; web pages are shown
 * in a frame when the site allows it.
 */
export default async function ReaderPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const url = one(sp.url) ?? "";
  const paperId = one(sp.paper);
  const back = safeBack(one(sp.back)) ?? (paperId ? paperHref(paperId) : undefined);

  const [info, paper] = await Promise.all([
    api<ReaderInfo>(`/reader/inspect?url=${encodeURIComponent(url)}`).catch((e: Error) => ({ error: e.message })),
    paperId ? api<Paper>(`/papers/detail?id=${encodeURIComponent(paperId)}`).catch(() => null) : Promise.resolve(null),
  ]);
  const title = one(sp.title) ?? ("title" in info ? info.title : undefined) ?? hostOf(url);
  const ok = !("error" in info);
  const showFrame = ok && info.embeddable;
  const finalUrl = ok ? info.finalUrl : url;
  const frameSrc = ok && info.kind === "pdf" ? pdfProxyUrl(info.finalUrl) : finalUrl;
  // A free PDF of the same paper is the best fallback when the publisher's page can't be shown here.
  const altPdf = paper?.pdfUrl && paper.pdfUrl !== url ? paper.pdfUrl : undefined;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md sm:px-6">
        {back && (
          <Link href={back} className="btn-ghost py-1">
            ← Back
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate font-mono text-[11px] text-muted">
            {ok && info.kind === "pdf" ? "PDF · " : ""}
            {hostOf(finalUrl)} · opened in SciRah
          </p>
        </div>
        {showFrame && (
          <a href={finalUrl} className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
            Page not loading?
          </a>
        )}
      </div>

      {showFrame ? (
        <iframe
          src={frameSrc}
          title={title}
          className="w-full flex-1 border-0 bg-white"
          // No top-navigation or pop-ups: readers stay inside SciRah.
          sandbox={info.kind === "pdf" ? undefined : "allow-scripts allow-same-origin allow-forms allow-downloads"}
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="mx-auto w-full max-w-3xl flex-1 overflow-auto px-4 py-8 sm:px-6">
          <div className="card p-6">
            <p className="label mb-2 text-accent">Can’t show this page inside SciRah</p>
            <p className="text-sm text-muted">
              {"error" in info ? info.error : (info.reason ?? "This website can’t be displayed here.")}
            </p>

            {paper && (
              <div className="mt-5 border-t border-line pt-5">
                <h1 className="text-xl leading-snug font-semibold">{paper.title}</h1>
                <p className="mt-1 text-sm text-muted">
                  {paper.authors.slice(0, 6).map((a) => a.name).join(", ")}
                  {paper.venue && <> · {paper.venue}</>}
                  {paper.year && <> · {paper.year}</>}
                </p>
                {paper.abstract && <ExpandableText text={paper.abstract} lines={4} className="mt-3 text-sm leading-relaxed text-fg/90" />}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {altPdf && (
                <Link href={readerHref(altPdf, { title: paper?.title, paperId })} className="btn-primary">
                  <UnlockIcon /> Read the free PDF in SciRah
                </Link>
              )}
              {paperId && (
                <Link href={paperHref(paperId)} className="btn-ghost">
                  Paper details, summary & sharing
                </Link>
              )}
              <a href={finalUrl} className="btn-ghost">
                Continue to {hostOf(finalUrl)}
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">Some publishers block their pages from being shown inside other websites.</p>
          </div>
        </div>
      )}
    </div>
  );
}
