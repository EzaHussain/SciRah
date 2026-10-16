import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SlideView } from "@/components/SlideView";
import { decodeParam } from "@/lib/api";
import { SUMMARY_LANGS, type SummaryLang } from "@/lib/languages";
import { loadPaperForExport, siteUrl } from "@/lib/paper-export";

export const metadata: Metadata = { title: "One-slide summary", robots: { index: false } };

export default async function SlidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const id = decodeParam((await params).id);
  const loaded = await loadPaperForExport(id);
  if (!loaded) notFound();
  const { paper, summary } = loaded;
  const want = (await searchParams).lang;
  const lang: SummaryLang = SUMMARY_LANGS.some((l) => l.code === want) ? (want as SummaryLang) : "en";

  const authors = paper.authors.length > 6 ? `${paper.authors.slice(0, 6).map((a) => a.name).join(", ")} et al.` : paper.authors.map((a) => a.name).join(", ");
  return (
    <div className="mx-auto max-w-[1340px] px-4 py-6 sm:px-6">
      <SlideView
        initialLang={lang}
        data={{
          paperId: paper.id,
          title: paper.title,
          authors,
          meta: [paper.venue, paper.year].filter(Boolean).join(" · "),
          summaries: summary ? { en: summary.summaryEn, ...summary.translations } : {},
          abstract: paper.abstract,
          url: `${siteUrl()}/paper/${encodeURIComponent(paper.id)}`,
          citations: paper.citationCount,
        }}
      />
    </div>
  );
}
