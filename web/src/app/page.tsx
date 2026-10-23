import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ForYouFeed, NewsTeaser, TrendingFeed } from "@/components/Feeds";
import { SearchBar } from "@/components/SearchBar";

const STARTERS: { q: string; mode?: string; pk?: boolean }[] = [
  { q: "climate change adaptation", pk: true },
  { q: "dengue" },
  { q: "Artificial Intelligence", mode: "subject" },
];

// The home page is the canonical "/" (set here, not in the layout, so other pages don't inherit it).
export const metadata: Metadata = { alternates: { canonical: "/" } };

const SOURCES = ["OpenAlex", "Semantic Scholar", "Crossref", "CORE", "arXiv", "PubMed"];

export default function Home() {
  return (
    <>
      <section className="relative z-10">
        <div className="relative mx-auto max-w-3xl px-4 pt-8 pb-3 text-center sm:px-6 sm:pt-12 sm:pb-4">
          <p className="label mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-3 py-1 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Research discovery for Pakistan
          </p>
          <h1 className="text-4xl leading-[1.08] font-bold text-balance sm:text-5xl lg:text-6xl">
            Find your <span className="text-primary">path</span> through research.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Search millions of papers from six open scholarly databases at once, with plain-language summaries in 7 languages.
          </p>
          <div className="mt-6 text-left">
            <Suspense>
              <SearchBar size="lg" />
            </Suspense>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {STARTERS.map((s) => {
              const p = new URLSearchParams({ q: s.q, ...(s.mode ? { mode: s.mode } : {}), ...(s.pk ? { pk: "1" } : {}) });
              return (
                <Link key={s.q} href={`/search?${p}`} className="tag px-2.5 py-1 text-[12px] hover:border-primary/60 hover:text-fg">
                  {s.q}
                  {s.pk && <span className="text-accent">· PK</span>}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted">
            Live from {SOURCES.join(" · ")}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-2 sm:px-6">
        <ForYouFeed />
        <NewsTeaser />
        <TrendingFeed />
      </div>
    </>
  );
}
