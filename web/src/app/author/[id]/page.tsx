import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { RoadDivider } from "@/components/brand";
import { formatCount, PaperCard } from "@/components/PaperCard";
import { AuthorMetricsPanel } from "@/components/AuthorMetricsPanel";
import { AuthorOwnerPanel } from "@/components/AuthorOwnerPanel";
import { AuthorPapers, ClaimNotice } from "@/components/AuthorPapers";
import { ScoreCard } from "@/components/ScoreCard";
import { ShareMenu } from "@/components/ShareMenu";
import { YearBars } from "@/components/YearBars";
import { api, ApiError, authorHref, decodeParam, readerHref } from "@/lib/api";
import type { AuthorProfile } from "@/lib/types";

const getAuthor = cache(async (id: string) => {
  try {
    return await api<AuthorProfile>(`/authors/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await getAuthor(decodeParam((await params).id)).catch(() => null);
  if (!a) return { title: "Researcher not found" };
  const where = a.institutions[0]?.name;
  const description = `${a.name}${where ? `, ${where}` : ""}: research papers, citations, h-index and SciRah Score.`;
  return { title: a.name, description, alternates: { canonical: authorHref(a.id) }, openGraph: { title: a.name, description, type: "profile", url: authorHref(a.id) } };
}

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAuthor(decodeParam((await params).id));
  if (!a) notFound();
  const here = authorHref(a.id);
  const read = (url: string, title: string) => readerHref(url, { title, back: here });

  const thisYear = new Date().getFullYear();
  const years = a.countsByYear.filter((c) => c.year >= thisYear - 14);
  const stats = [
    { label: "h-index", value: a.hIndex },
    { label: "i10-index", value: a.i10Index },
    { label: "Works", value: a.worksCount },
    { label: "Citations", value: a.citationCount },
  ].filter((s) => s.value !== undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-end">
        <div>
          <p className="label mb-2 text-accent">Researcher profile · {a.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">{a.name}</h1>
          {a.institutions.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-[15px]">
              {a.institutions.map((inst) => (
                <li key={inst.name} className="flex items-center gap-2">
                  {/* Plain text: the institution registry (ror.org) can't be shown inside SciRah. */}
                  <span className="font-medium">{inst.name}</span>
          {a.department && <p className="mt-1.5 max-w-2xl text-sm text-muted">{a.department}</p>}
                  {inst.countryCode && <span className="tag">{inst.countryCode}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ShareMenu path={here} title={`${a.name} — researcher profile on SciRah`} buttonLabel="Share profile" className="btn-ghost py-1.5" />
            {/* ORCID doesn't allow its pages inside other sites, so show the iD itself rather than a dead link. */}
            {a.orcid && (
              <span className="tag self-center" title="ORCID iD: this researcher's unique international researcher number">
                ORCID iD {a.orcid.replace(/^https?:\/\/orcid\.org\//, "")}
              </span>
            )}
            {a.homepage && (
              <Link href={read(a.homepage, `${a.name} · Homepage`)} className="btn-ghost py-1.5">
                Homepage
              </Link>
            )}
          </div>
          {/* Read in the browser so this page can be served from the cache. */}
          <Suspense>
            <ClaimNotice />
          </Suspense>
        </div>
        {a.source === "openalex" ? (
          <AuthorMetricsPanel
            authorId={a.id}
            initial={{ works: a.worksCount ?? null, citations: a.citationCount ?? null, hIndex: a.hIndex ?? null, i10Index: a.i10Index ?? null }}
          />
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {stats.map((s) => (
              <div key={s.label} className="card p-3.5">
                <dt className="label text-muted">{s.label}</dt>
                <dd className="mt-1 font-heading text-2xl font-semibold">{formatCount(s.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {a.topics && a.topics.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {a.topics.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <RoadDivider className="my-8" />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="works" className="min-w-0">
          <h2 id="works" className="mb-4 text-xl font-semibold">
            Most-cited papers
          </h2>
          {a.source === "openalex" ? (
            <AuthorPapers authorId={a.id} papers={a.papers} />
          ) : a.papers.length === 0 ? (
            <p className="text-muted">No papers found for this researcher.</p>
          ) : (
            <ol className="space-y-3">
              {a.papers.map((p) => (
                <li key={p.id}>
                  <PaperCard paper={p} showAbstract={false} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-4">
          {a.source === "openalex" && <AuthorOwnerPanel authorId={a.id} name={a.name} />}
          {a.source === "openalex" && <ScoreCard authorId={a.id} />}
          <YearBars label="Citations per year" data={years.map((y) => ({ year: y.year, value: y.citations }))} />

          {a.coAuthors.length > 0 && (
            <div className="card p-4">
              <p className="label mb-1 text-muted">Frequent co-authors</p>
              <p className="mb-3 text-xs text-muted">Invite them to SciRah by sharing their profile.</p>
              <ul className="space-y-2.5">
                {a.coAuthors.slice(0, 12).map((c) => (
                  <li key={c.id ?? c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      {c.id ? (
                        <Link href={authorHref(c.id)} className="hover:text-primary">
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                      {c.affiliation && <span className="block truncate text-xs text-muted">{c.affiliation}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-muted" title="Shared papers among the top works">
                        ×{c.count}
                      </span>
                      {c.id && (
                        <ShareMenu
                          path={authorHref(c.id)}
                          title={`${c.name} — researcher profile on SciRah`}
                          text={`Hi ${c.name.split(" ")[0]}, I found your research profile on SciRah — papers, citations and your SciRah Score in one place. Take a look and join me there:`}
                          buttonLabel="Invite"
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-xs text-muted hover:border-primary/60 hover:text-fg"
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.pastAffiliations.length > 0 && (
            <div className="card p-4">
              <p className="label mb-3 text-muted">Affiliation history</p>
              <ul className="space-y-2 text-sm">
                {a.pastAffiliations.map((af) => (
                  <li key={af.name} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{af.name}</span>
                    {af.years.length > 0 && (
                      <span className="shrink-0 font-mono text-xs text-muted">
                        {Math.min(...af.years)}
                        {af.years.length > 1 && `–${Math.max(...af.years)}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
