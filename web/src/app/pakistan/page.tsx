import type { Metadata } from "next";
import Link from "next/link";
import { SectionTitle } from "@/components/brand";
import { YearBars } from "@/components/YearBars";
import { api, venueHref } from "@/lib/api";
import type { CountryOverview } from "@/lib/types";

// Live data from the SciRah API: render on each request (the API caches the numbers).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pakistan",
  description: "Pakistan's research at a glance: papers per year, leading universities, strongest fields and the journals Pakistani researchers publish in.",
};

const nf = new Intl.NumberFormat("en");

export default async function PakistanPage() {
  const data = await api<CountryOverview>("/explore/country?code=pk").catch(() => null);
  const year = new Date().getFullYear();
  const lastFull = data?.worksByYear.find((y) => y.year === year - 1);
  const prev = data?.worksByYear.find((y) => y.year === year - 2);
  const growth = lastFull && prev && prev.count ? Math.round(((lastFull.count - prev.count) / prev.count) * 100) : null;
  const fieldMax = Math.max(1, ...(data?.fields.map((f) => f.count) ?? [1]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Pakistan</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Pakistan’s research at a glance</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Papers with at least one author at a Pakistani institution, counted live from OpenAlex. Numbers for this year are still growing.
      </p>

      {!data ? (
        <p className="card mt-8 p-6 text-sm text-muted">These figures are unavailable right now. Please try again later.</p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Papers in ${year - 1}`} value={lastFull ? nf.format(lastFull.count) : "—"} />
            <Stat label="Growth on year before" value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`} />
            <Stat label={`Papers so far in ${year}`} value={nf.format(data.worksByYear.find((y) => y.year === year)?.count ?? 0)} />
            <Stat label="Research institutions" value={nf.format(data.institutionCount)} />
          </dl>

          <div className="mt-6">
            <YearBars label="Papers per year" valueLabel="Papers" data={data.worksByYear.map((y) => ({ year: y.year, value: y.count }))} />
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <section>
              <SectionTitle kicker="Universities" title="Leading institutions" />
              <p className="-mt-2 mb-3 text-sm text-muted">By papers in the last five years.</p>
              <ol className="card divide-y divide-line">
                {data.institutions.map((i, n) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="mr-2 font-mono text-xs text-muted">{n + 1}</span>
                      <span className="font-medium">{i.name}</span>
                      {i.city && <span className="ml-1.5 text-xs text-muted">{i.city}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted">{nf.format(i.works)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <SectionTitle kicker="Fields" title="Strongest research fields" />
              <p className="-mt-2 mb-3 text-sm text-muted">Papers in the last three years. Select a field to see its Pakistani papers.</p>
              <ul className="card space-y-2.5 p-4">
                {data.fields.slice(0, 15).map((f) => (
                  <li key={f.id}>
                    <Link href={`/search?${new URLSearchParams({ q: f.name, mode: "subject", pk: "1" })}`} className="group block text-sm">
                      <span className="flex justify-between gap-3">
                        <span className="group-hover:text-primary">{f.name}</span>
                        <span className="font-mono text-xs text-muted">{nf.format(f.count)}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-subtle">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(f.count / fieldMax) * 100}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-12">
            <SectionTitle kicker="Journals" title="Where Pakistani researchers publish" />
            <p className="-mt-2 mb-3 text-sm text-muted">Journals with the most Pakistani papers in the last three years.</p>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.journals.map((j) => (
                <li key={j.id}>
                  <Link href={venueHref(j.id)} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:border-primary/50">
                    <span className="min-w-0 truncate">{j.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{nf.format(j.count)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/authors" className="btn-primary">
              Top researchers in Pakistan
            </Link>
            <Link href="/search?q=Pakistan&pk=1&sort=newest" className="btn-ghost">
              Newest papers from Pakistan
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <dt className="label text-muted">{label}</dt>
      <dd className="mt-1 font-heading text-2xl font-semibold">{value}</dd>
    </div>
  );
}
