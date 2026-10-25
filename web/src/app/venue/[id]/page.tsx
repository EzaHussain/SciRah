import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RoadDivider, SectionTitle } from "@/components/brand";
import { formatCount, PaperCard } from "@/components/PaperCard";
import { ShareMenu } from "@/components/ShareMenu";
import { YearBars } from "@/components/YearBars";
import { api, cached, ApiError, decodeParam, readerHref, venueHref } from "@/lib/api";
import { COUNTRY_NAME } from "@/lib/filters";
import type { VenueProfile } from "@/lib/types";


// Built on first visit, then served from Vercel's cache and rebuilt at most every 24 h (ISR).
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}
const getVenue = cache(async (id: string) => {
  try {
    return await api<VenueProfile>(`/venues/${encodeURIComponent(id)}`, cached(revalidate));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const v = await getVenue(decodeParam((await params).id)).catch(() => null);
  if (!v) return { title: "Not found" };
  const description = `${v.name}: papers, citations, impact and topics on SciRah.`;
  return { title: v.name, description, alternates: { canonical: venueHref(v.id) } };
}

const TYPE_LABEL: Record<string, string> = {
  journal: "Journal",
  repository: "Repository",
  conference: "Conference",
  "book series": "Book series",
  "ebook platform": "E-book platform",
};

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeParam((await params).id);
  const v = await getVenue(id);
  if (!v) notFound();

  const thisYear = new Date().getFullYear();
  const years = v.countsByYear.filter((c) => c.year >= thisYear - 14 && c.year <= thisYear);
  const oaShare = v.worksCount && v.oaWorksCount ? Math.round((v.oaWorksCount / v.worksCount) * 100) : undefined;
  const stats = [
    { label: "Papers published", value: formatCount(v.worksCount) },
    { label: "Citations", value: formatCount(v.citedByCount) },
    { label: "h-index", value: formatCount(v.hIndex) },
    { label: v.kind === "source" ? "2-yr mean citations" : "i10-index", value: v.kind === "source" ? v.meanCitedness?.toFixed(2) : formatCount(v.i10Index) },
    { label: "Open access", value: oaShare !== undefined ? `${oaShare}%` : undefined },
  ].filter((s) => s.value !== undefined && s.value !== null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="label mb-2 text-accent">
            {v.kind === "publisher" ? "Publisher profile" : `${TYPE_LABEL[v.type ?? ""] ?? "Venue"} profile`}
          </p>
          <h1 className="text-3xl font-bold text-balance sm:text-4xl">{v.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
            {v.publisher && (
              <span>
                Published by{" "}
                {v.publisherId ? (
                  <Link href={venueHref(v.publisherId)} className="link text-fg">
                    {v.publisher}
                  </Link>
                ) : (
                  v.publisher
                )}
              </span>
            )}
            {v.parentPublisher && <span>Part of {v.parentPublisher}</span>}
            {v.issn?.length ? <span className="font-mono text-xs">ISSN {v.issn.join(", ")}</span> : null}
            {v.firstYear && <span>Since {v.firstYear}</span>}
            {v.countryCodes.map((c) => (
              <span key={c} className="tag">
                {COUNTRY_NAME[c] ?? c.toUpperCase()}
              </span>
            ))}
            {v.isInDoaj && <span className="tag">DOAJ listed</span>}
            {v.apcUsd ? <span className="tag">APC ${formatCount(v.apcUsd)}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {v.homepage && (
              <Link href={readerHref(v.homepage, { title: v.name, back: venueHref(v.id) })} className="btn-ghost py-1.5">
                Website
              </Link>
            )}
            <ShareMenu path={venueHref(v.id)} title={`${v.name} on SciRah`} className="btn-ghost py-1.5" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          {stats.map((s) => (
            <div key={s.label} className="card p-3.5">
              <dt className="label text-muted">{s.label}</dt>
              <dd className="mt-1 font-heading text-2xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {v.topics.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {v.topics.map((t) => (
            <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="tag hover:border-primary/60 hover:text-fg">
              {t}
            </Link>
          ))}
        </div>
      )}

      <RoadDivider className="my-8" />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionTitle kicker="Most cited" title={`Landmark papers in ${v.kind === "publisher" ? "its journals" : v.name}`} />
            <ol className="space-y-3">
              {v.topPapers.map((p) => (
                <li key={p.id}>
                  <PaperCard paper={p} />
                </li>
              ))}
            </ol>
          </section>
          {v.recentPapers.length > 0 && (
            <section>
              <SectionTitle kicker="Latest" title="Recently published" />
              <ol className="space-y-3">
                {v.recentPapers.map((p) => (
                  <li key={p.id}>
                    <PaperCard paper={p} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <aside className="space-y-4">
          <YearBars label="Papers per year" valueLabel="Papers" data={years.map((y) => ({ year: y.year, value: y.works }))} />
          <YearBars label="Citations per year" valueLabel="Citations" data={years.map((y) => ({ year: y.year, value: y.citations }))} />
          <p className="text-xs text-muted">Data from OpenAlex.</p>
        </aside>
      </div>
    </div>
  );
}
