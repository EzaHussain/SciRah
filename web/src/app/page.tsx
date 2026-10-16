import Link from "next/link";
import { Suspense } from "react";
import { RoadDivider } from "@/components/brand";
import { ForYouFeed, NewsTeaser, TrendingFeed } from "@/components/Feeds";
import { SearchBar } from "@/components/SearchBar";

const STARTERS: { q: string; mode?: string; pk?: boolean }[] = [
  { q: "climate change adaptation", pk: true },
  { q: "dengue" },
  { q: "wheat yield", pk: true },
  { q: "Artificial Intelligence", mode: "subject" },
  { q: "Indus basin water" },
  { q: "hepatitis C treatment" },
];

const SOURCES = ["OpenAlex", "Semantic Scholar", "Crossref", "CORE", "arXiv", "PubMed"];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <HeroPath />
        <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20 sm:pb-14">
          <p className="label mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-3 py-1 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Research discovery for Pakistan
          </p>
          <h1 className="text-4xl leading-[1.08] font-bold text-balance sm:text-5xl lg:text-6xl">
            Find your <span className="text-primary">path</span> through research.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Search millions of papers from six open scholarly databases at once, with plain-language summaries in English and{" "}
            <span className="font-urdu" lang="ur">
              اردو
            </span>
            .
          </p>
          <div className="mt-8 text-left">
            <Suspense>
              <SearchBar size="lg" />
            </Suspense>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
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
          <p className="mt-8 font-mono text-[11px] text-muted">
            Live from {SOURCES.join(" · ")}
          </p>
        </div>
      </section>

      <RoadDivider />

      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <ForYouFeed />
        <NewsTeaser />
        <TrendingFeed />
      </div>
    </>
  );
}

/** A faint winding road behind the hero — the "rah" motif, kept quiet. */
function HeroPath() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M-40 470 C 220 420, 260 300, 520 300 S 860 200, 900 120 S 1100 20, 1260 40" fill="none" stroke="var(--line)" strokeWidth="38" strokeLinecap="round" opacity="0.55" />
      <path d="M-40 470 C 220 420, 260 300, 520 300 S 860 200, 900 120 S 1100 20, 1260 40" fill="none" stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="14 16" />
    </svg>
  );
}
