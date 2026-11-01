"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, paperHref, pdfProxyUrl, readerHref } from "@/lib/api";
import type { Paper, ReaderInfo } from "@/lib/types";
import { ExpandableText } from "./ExpandableText";
import { UnlockIcon } from "./icons";

type StoryPaper = { doi: string | null; paperId: string | null; title: string | null; venue: string | null };
type Loaded = { key: string; info: ReaderInfo | { error: string }; paper: Paper | null; story: StoryPaper | null };

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

const safeBack = (b?: string | null) => (b && b.startsWith("/") && !b.startsWith("//") ? b : undefined);

/**
 * SciRah's in-app reader. Publisher pages, open-access PDFs, news articles and profiles open here,
 * inside SciRah, instead of a new tab. PDFs are streamed through the SciRah API; web pages are shown
 * in a frame when the site allows it.
 *
 * Runs in the browser (the page itself is a static file): the checks go straight to the SciRah API, so
 * crawlers that follow every reader link cost no Vercel function time.
 */
export function ReaderView() {
  const sp = useSearchParams();
  const url = sp.get("url") ?? "";
  const paperId = sp.get("paper") ?? undefined;
  const back = safeBack(sp.get("back")) ?? (paperId ? paperHref(paperId) : undefined);
  const key = `${url}|${paperId ?? ""}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded?.key === key ? loaded : null;

  useEffect(() => {
    let cancelled = false;
    const isStory = /^https:\/\/(www\.)?sciencedaily\.com\/releases\//i.test(url);
    Promise.all([
      api<ReaderInfo>(`/reader/inspect?url=${encodeURIComponent(url)}`).catch((e: Error) => ({ error: e.message })),
      paperId ? api<Paper>(`/papers/detail?id=${encodeURIComponent(paperId)}`).catch(() => null) : Promise.resolve(null),
      // Research news: the study the story is about, so readers can open the paper itself in SciRah.
      isStory ? api<StoryPaper>(`/news/story-paper?url=${encodeURIComponent(url)}`).catch(() => null) : Promise.resolve(null),
    ]).then(([info, paper, story]) => {
      if (!cancelled) setLoaded({ key, info, paper, story });
    });
    return () => {
      cancelled = true;
    };
  }, [key, url, paperId]);

  const info = current?.info;
  const ok = !!info && !("error" in info);
  const title = sp.get("title") ?? (info && "title" in info ? info.title : undefined) ?? hostOf(url);
  const finalUrl = ok ? info.finalUrl : url;

  useEffect(() => {
    document.title = `${title} · SciRah`;
  }, [title]);

  const header = (
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
      {ok && info.embeddable && (
        <a href={finalUrl} className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
          Page not loading?
        </a>
      )}
    </div>
  );

  if (!current || !info) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col">
        {header}
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
          <div className="card space-y-3 p-6">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  const { paper, story } = current;
  const showFrame = ok && info.embeddable;
  const frameSrc = ok && info.kind === "pdf" ? pdfProxyUrl(info.finalUrl) : finalUrl;
  // A free PDF of the same paper is the best fallback when the publisher's page can't be shown here.
  const altPdf = paper?.pdfUrl && paper.pdfUrl !== url ? paper.pdfUrl : undefined;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {header}

      {story?.paperId && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-primary/10 px-4 py-2 text-sm sm:px-6">
          <span className="label text-accent">The research behind this story</span>
          <span className="min-w-0 flex-1 truncate">
            {story.title ?? story.doi}
            {story.venue && <span className="text-muted"> · {story.venue}</span>}
          </span>
          <Link href={paperHref(story.paperId)} className="btn-primary py-1">
            Read the paper in SciRah
          </Link>
        </div>
      )}

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
            <p className="text-sm text-muted">{"error" in info ? info.error : (info.reason ?? "This website can’t be displayed here.")}</p>

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
              {!paperId && (
                <Link href={`/search?q=${encodeURIComponent(title.replace(/\s[-–|]\s[^-–|]+$/, "").slice(0, 120))}`} className="btn-primary">
                  Find research papers on this
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
