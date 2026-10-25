import type { Metadata } from "next";
import Link from "next/link";
import { SectionTitle } from "@/components/brand";
import { VenueFinder } from "@/components/VenueFinder";
import { api, cached, venueHref } from "@/lib/api";
import type { CountryOverview } from "@/lib/types";

// Built from live SciRah data, then served from Vercel's cache and rebuilt at most once an hour (ISR).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Journals",
  description: "Find journals and publishers, and see where Pakistani researchers publish most.",
};

export default async function JournalsPage() {
  const pk = await api<CountryOverview>("/explore/country?code=pk", cached(revalidate)).catch(() => null);
  const nf = new Intl.NumberFormat("en");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Journals</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Journals and publishers</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Look up any journal or publisher to see its papers, impact and topics. Start typing — suggestions appear as you type.
      </p>
      <div className="mt-6 max-w-3xl">
        <VenueFinder />
      </div>

      {pk && pk.journals.length > 0 && (
        <section className="mt-12">
          <SectionTitle kicker="Pakistan" title="Where Pakistani researchers publish most" />
          <p className="-mt-2 mb-3 text-sm text-muted">Pakistani papers per journal in the last three years.</p>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pk.journals.map((j, i) => (
              <li key={j.id}>
                <Link href={venueHref(j.id)} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:border-primary/50">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
                    {j.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">{nf.format(j.count)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
