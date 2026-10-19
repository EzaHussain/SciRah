import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RoadDivider, SectionTitle } from "@/components/brand";
import { Avatar } from "@/components/Header";
import { PaperCard } from "@/components/PaperCard";
import { ShareMenu } from "@/components/ShareMenu";
import { api, ApiError, authorHref, readerHref } from "@/lib/api";
import type { PublicResearcher } from "@/lib/types";

const getResearcher = cache(async (id: string) => {
  try {
    return await api<PublicResearcher>(`/researchers/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await getResearcher((await params).id).catch(() => null);
  return { title: r ? r.name : "Researcher not found", description: r?.bio?.slice(0, 200) ?? undefined };
}

/** A researcher's own SciRah page: the profile they wrote and the papers they added. */
export default async function ResearcherPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getResearcher((await params).id);
  if (!r) notFound();
  const here = `/researcher/${r.userId}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={r.name} url={r.avatarUrl} size={88} />
        <div className="min-w-0 flex-1">
          <p className="label text-accent">Researcher on SciRah{r.claimedAuthorId ? " · ✓ verified" : ""}</p>
          <h1 className="mt-1 text-3xl font-bold">{r.name}</h1>
          {(r.position || r.affiliation) && (
            <p className="mt-1 text-[15px]">
              {r.position}
              {r.position && r.affiliation && " · "}
              {r.affiliation}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {r.claimedAuthorId && (
              <Link href={authorHref(r.claimedAuthorId)} className="btn-primary py-1.5">
                Publications, citations & SciRah Score
              </Link>
            )}
            <ShareMenu path={here} title={`${r.name} on SciRah`} buttonLabel="Share profile" className="btn-ghost py-1.5" />
            {r.scholarUrl && (
              <Link href={readerHref(r.scholarUrl, { title: `${r.name} · Google Scholar`, back: here })} className="btn-ghost py-1.5">
                Google Scholar
              </Link>
            )}
            {r.orcid && (
              <Link href={readerHref(`https://orcid.org/${r.orcid}`, { title: `${r.name} · ORCID`, back: here })} className="btn-ghost py-1.5">
                ORCID
              </Link>
            )}
            {r.website && (
              <Link href={readerHref(r.website, { title: `${r.name} · Website`, back: here })} className="btn-ghost py-1.5">
                Website
              </Link>
            )}
          </div>
        </div>
      </header>

      {(r.bio || r.interests.length > 0) && (
        <section className="card mt-8 p-5">
          {r.bio && <p className="leading-relaxed whitespace-pre-line">{r.bio}</p>}
          {r.interests.length > 0 && (
            <div className={`${r.bio ? "mt-4" : ""} flex flex-wrap gap-1.5`}>
              {r.interests.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="tag hover:border-primary/60 hover:text-fg">
                  {t}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <RoadDivider className="my-8" />

      <SectionTitle kicker="Added by the researcher" title="Papers" />
      {r.papers.length === 0 ? (
        <p className="text-muted">
          No papers added on SciRah yet.
          {r.claimedAuthorId && (
            <>
              {" "}
              See their{" "}
              <Link href={authorHref(r.claimedAuthorId)} className="link">
                indexed publications
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ol className="space-y-3">
          {r.papers.map((p) => (
            <li key={p.id}>
              <PaperCard paper={p} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
