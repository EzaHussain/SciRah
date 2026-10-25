import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SectionTitle } from "@/components/brand";
import { formatCount } from "@/components/PaperCard";
import { SearchBar } from "@/components/SearchBar";
import { api, cached, authorHref } from "@/lib/api";
import type { TopAuthor } from "@/lib/types";

// Built from live SciRah data, then served from Vercel's cache and rebuilt at most once an hour (ISR).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Authors",
  description: "Find any researcher, and see Pakistan's most-cited researchers with their current university.",
};

export default function AuthorsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Authors</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Find a researcher</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Start typing a name — suggestions appear as you type. Each profile shows the researcher’s papers, cross-checked citation numbers and SciRah
        Score.
      </p>
      <div className="mt-6 max-w-3xl">
        <Suspense>
          <SearchBar only="author" size="lg" />
        </Suspense>
      </div>

      <section className="mt-12">
        <SectionTitle kicker="Pakistan" title="Most-cited researchers in Pakistan" />
        <p className="-mt-2 mb-4 text-sm text-muted">
          Researchers whose own recent papers list a Pakistani university — not people who only collaborated with one.
        </p>
        <Suspense fallback={<Skeleton />}>
          <TopResearchers />
        </Suspense>
      </section>
    </div>
  );
}

async function TopResearchers() {
  const list = await api<TopAuthor[]>("/explore/researchers?country=pk", cached(revalidate)).catch(() => null);
  if (!list?.length) return <p className="card p-6 text-sm text-muted">This list is unavailable right now. Please try again later.</p>;
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((a, i) => (
        <li key={a.id}>
          <Link href={authorHref(a.id)} className="card flex h-full gap-3 p-4 transition-colors hover:border-primary/50">
            <span className="font-mono text-sm text-muted">{i + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{a.name}</span>
              {a.institution && <span className="block truncate text-sm text-muted">{a.institution}</span>}
              <span className="mt-1.5 block font-mono text-[11px] text-muted">
                {formatCount(a.citations)} citations · h-index {a.hIndex ?? "—"} · {formatCount(a.works)} works
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="skeleton mb-2 h-5 w-3/5" />
          <div className="skeleton h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
