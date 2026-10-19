import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AiGraphic } from "@/components/AiGraphic";
import { AuthorAffiliations } from "@/components/AuthorAffiliations";
import { RoadDivider } from "@/components/brand";
import { BookmarkButton } from "@/components/BookmarkButton";
import { Comments } from "@/components/Comments";
import { ExpandableText } from "@/components/ExpandableText";
import { FullPaperButton } from "@/components/FullPaperButton";
import { QuoteIcon, UnlockIcon } from "@/components/icons";
import { formatCount } from "@/components/PaperCard";
import { ShareMenu } from "@/components/ShareMenu";
import { SummaryPanel } from "@/components/SummaryPanel";
import { api, ApiError, decodeParam, paperHref, readerHref, venueHref } from "@/lib/api";
import { SOURCE_LABEL, type Paper } from "@/lib/types";

const getPaper = cache(async (id: string) => {
  try {
    return await api<Paper>(`/papers/detail?id=${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const paper = await getPaper(decodeParam((await params).id)).catch(() => null);
  if (!paper) return { title: "Paper not found" };
  const description = paper.abstract?.slice(0, 200) ?? `${paper.authors.slice(0, 3).map((a) => a.name).join(", ")}${paper.venue ? ` · ${paper.venue}` : ""}`;
  return {
    title: paper.title,
    description,
    openGraph: { title: paper.title, description, type: "article", siteName: "SciRah" },
    twitter: { card: "summary_large_image", title: paper.title, description },
  };
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeParam((await params).id);
  const paper = await getPaper(id);
  if (!paper) notFound();

  const here = paperHref(paper.id);
  const read = (url: string) => readerHref(url, { title: paper.title, paperId: paper.id });

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {paper.type && <span className="tag">{paper.type.replace(/-/g, " ")}</span>}
            {paper.isOpenAccess && (
              <span className="tag border-primary/40 bg-primary/15 text-fg">
                <UnlockIcon /> Open access
              </span>
            )}
            {paper.sources.includes("scirah") && <span className="tag">Added on SciRah</span>}
          </div>
          <h1 className="text-2xl leading-tight font-bold text-balance sm:text-3xl lg:text-[2.1rem]">{paper.title}</h1>

          <AuthorAffiliations authors={paper.authors} />

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            {paper.venue &&
              (paper.venueId ? (
                <Link href={venueHref(paper.venueId)} className="italic hover:text-primary hover:underline">
                  {paper.venue}
                </Link>
              ) : (
                <span className="italic">{paper.venue}</span>
              ))}
            {paper.publisher &&
              (paper.publisherId ? (
                <Link href={venueHref(paper.publisherId)} className="hover:text-primary hover:underline">
                  {paper.publisher}
                </Link>
              ) : (
                <span>{paper.publisher}</span>
              ))}
            {(paper.publishedDate || paper.year) && <span className="font-mono text-xs">{paper.publishedDate ?? paper.year}</span>}
            {paper.citationCount !== undefined && (
              <span className="inline-flex items-center gap-1">
                <QuoteIcon /> {formatCount(paper.citationCount)} citations
              </span>
            )}
            {paper.referenceCount ? <span>{formatCount(paper.referenceCount)} references</span> : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <FullPaperButton paperId={paper.id} publisherHref={paper.sourceUrl ? read(paper.sourceUrl) : undefined} />
            <BookmarkButton paperId={paper.id} variant="full" />
            <ShareMenu path={here} title={paper.title} text={paper.authors.slice(0, 3).map((a) => a.name).join(", ")} />
            <ExportMenu paperId={paper.id} />
          </div>
          <p className="mt-2 text-xs text-muted">Papers open inside SciRah from the original publisher or repository; SciRah never hosts them.</p>

          <RoadDivider className="my-7" />

          <section aria-labelledby="abstract">
            <h2 id="abstract" className="mb-3 text-lg font-semibold">
              Abstract
            </h2>
            {paper.abstract ? (
              <ExpandableText text={paper.abstract} lines={3} className="max-w-[70ch] leading-relaxed text-fg/90" />
            ) : (
              <p className="text-muted">No abstract is available from our sources. Use “Read paper” to view it.</p>
            )}
            {paper.tldr && (
              <p className="mt-4 max-w-[70ch] rounded-xl border border-line bg-subtle p-3 text-sm">
                <span className="label mr-2 text-accent">TL;DR</span>
                {paper.tldr} <span className="text-xs text-muted">(Semantic Scholar)</span>
              </p>
            )}
          </section>

          <div className="mt-8 space-y-6">
            <SummaryPanel paperId={paper.id} title={paper.title} hasAbstract={!!paper.abstract} isOpenAccess={paper.isOpenAccess} />
            {(paper.abstract || paper.tldr) && <AiGraphic paperId={paper.id} title={paper.title} />}
          </div>

          <div className="mt-10">
            <Comments paperId={paper.id} />
          </div>
        </div>

        <aside className="space-y-4 lg:pt-10">
          {(paper.venue || paper.publisher) && (
            <div className="card p-4">
              <p className="label mb-3 text-muted">Published in</p>
              {paper.venue && (
                <p className="text-sm font-medium">
                  {paper.venueId ? (
                    <Link href={venueHref(paper.venueId)} className="hover:text-primary">
                      {paper.venue} →
                    </Link>
                  ) : (
                    paper.venue
                  )}
                </p>
              )}
              {paper.publisher && (
                <p className="mt-1 text-sm text-muted">
                  {paper.publisherId ? (
                    <Link href={venueHref(paper.publisherId)} className="hover:text-primary">
                      {paper.publisher} — publisher profile →
                    </Link>
                  ) : (
                    paper.publisher
                  )}
                </p>
              )}
            </div>
          )}

          {paper.topics.length > 0 && (
            <div className="card p-4">
              <p className="label mb-3 text-muted">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {paper.topics.slice(0, 8).map((t) => (
                  <Link key={t.name} href={`/search?mode=subject&q=${encodeURIComponent(t.subfield ?? t.name)}`} className="tag hover:border-primary/60 hover:text-fg">
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <p className="label mb-3 text-muted">Identifiers</p>
            <dl className="space-y-1.5 font-mono text-xs break-all">
              {paper.ids.doi && <IdRow label="DOI" value={paper.ids.doi} href={read(`https://doi.org/${paper.ids.doi}`)} />}
              {paper.ids.arxiv && <IdRow label="arXiv" value={paper.ids.arxiv} href={read(`https://arxiv.org/abs/${paper.ids.arxiv}`)} />}
              {paper.ids.pmid && <IdRow label="PMID" value={paper.ids.pmid} href={read(`https://pubmed.ncbi.nlm.nih.gov/${paper.ids.pmid}/`)} />}
              {paper.ids.openalex && <IdRow label="OpenAlex" value={paper.ids.openalex} />}
              {paper.ids.s2 && <IdRow label="S2" value={paper.ids.s2.slice(0, 12) + "…"} />}
              {paper.ids.core && <IdRow label="CORE" value={paper.ids.core} />}
            </dl>
            <p className="mt-3 text-xs text-muted">Metadata from {paper.sources.map((s) => SOURCE_LABEL[s]).join(", ")}.</p>
          </div>
        </aside>
      </div>
    </article>
  );
}

/** Download the paper's details + AI summary as a PDF (print view) or a Word document. */
function ExportMenu({ paperId }: { paperId: string }) {
  const base = `/paper/${encodeURIComponent(paperId)}`;
  return (
    <details className="group relative">
      <summary className="btn-ghost cursor-pointer list-none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
          <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
        </svg>
        Export
      </summary>
      <div className="popover absolute left-0 z-20 mt-2 w-60 p-1.5 shadow-lg">
        <Link href={`${base}/export`} className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle">
          PDF <span className="block text-xs text-muted">Details, abstract & AI summary</span>
        </Link>
        <a href={`${base}/export/docx`} download className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle">
          Word (.docx) <span className="block text-xs text-muted">Editable document</span>
        </a>
        <Link href={`${base}/slide`} className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle">
          One-slide summary <span className="block text-xs text-muted">Image or PDF for presentations</span>
        </Link>
      </div>
    </details>
  );
}

function IdRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd>
        {href ? (
          <Link href={href} className="hover:text-primary">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
