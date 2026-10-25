import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArticleBody } from "@/components/ArticleBody";
import { UnlockIcon } from "@/components/icons";
import { api, cached, ApiError, decodeParam, paperHref, pdfProxyUrl, readerHref } from "@/lib/api";
import type { FullArticle, FullText, Paper } from "@/lib/types";

export const metadata: Metadata = { title: "Full paper", robots: { index: false } };

// Served from Vercel's cache, rebuilt at most once a day (ISR).
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

const slug = (s: string, i: number) => `s${i}-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

/** The whole paper, read inside SciRah: the complete article (Europe PMC) or the free PDF. */
export default async function FullPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeParam((await params).id);
  let paper: Paper;
  try {
    paper = await api<Paper>(`/papers/detail?id=${encodeURIComponent(id)}`, cached(revalidate));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const ft = await api<FullText>(`/papers/fulltext?id=${encodeURIComponent(paper.id)}`, cached(revalidate)).catch(
    (): FullText => ({ kind: "none", reason: "Couldn’t load the full text right now. Please try again." }),
  );
  const back = paperHref(paper.id);

  if (ft.kind === "page") redirect(readerHref(ft.url, { title: paper.title, paperId: paper.id }));

  if (ft.kind === "pdf")
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col">
        <ReaderBar back={back} title={paper.title} note={`Free PDF · ${ft.source} · opened in SciRah`} />
        <iframe src={pdfProxyUrl(ft.url)} title={paper.title} className="w-full flex-1 border-0 bg-white" />
      </div>
    );

  if (ft.kind === "none")
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="label text-accent">Full text not available</p>
        <h1 className="mt-2 text-2xl font-bold text-balance">{paper.title}</h1>
        <p className="mt-3 text-muted">{ft.reason}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={back} className="btn-primary">
            Abstract & AI summary
          </Link>
          {paper.sourceUrl && (
            <Link href={readerHref(paper.sourceUrl, { title: paper.title, paperId: paper.id })} className="btn-ghost">
              View at publisher
            </Link>
          )}
        </div>
      </div>
    );

  const article = await api<FullArticle>(`/papers/fulltext/article?pmcid=${encodeURIComponent(ft.pmcid)}`, cached(revalidate)).catch(() => null);
  if (!article) redirect(back);
  const sections = article.sections.filter((s) => s.html.trim());

  return (
    <div>
      <ReaderBar
        back={back}
        title={paper.title}
        note={`Open-access full text · ${ft.source} (${article.pmcid})`}
        sticky
        action={article.pdfUrl ? { href: readerHref(article.pdfUrl, { title: paper.title, paperId: paper.id }), label: "View PDF" } : undefined}
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Sections" className="hidden lg:block">
          <div className="sticky top-32 space-y-1 text-sm">
            <p className="label mb-2 text-muted">Contents</p>
            {article.abstractHtml && (
              <a href="#abstract" className="block rounded-lg px-2 py-1 text-muted hover:bg-subtle hover:text-fg">
                Abstract
              </a>
            )}
            {sections.map((s, i) =>
              s.title ? (
                <a key={i} href={`#${slug(s.title, i)}`} className="block rounded-lg px-2 py-1 text-muted hover:bg-subtle hover:text-fg">
                  {s.title}
                </a>
              ) : null,
            )}
            {article.references.length > 0 && (
              <a href="#references" className="block rounded-lg px-2 py-1 text-muted hover:bg-subtle hover:text-fg">
                References
              </a>
            )}
          </div>
        </nav>

        <article className="card min-w-0 p-5 sm:p-8">
          <p className="label flex items-center gap-1.5 text-accent">
            <UnlockIcon /> Open access
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-bold text-balance sm:text-3xl">{article.title || paper.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {paper.authors.slice(0, 12).map((a) => a.name).join(", ")}
            {paper.authors.length > 12 && " et al."}
            {paper.venue && <> · {paper.venue}</>}
            {paper.year && <> · {paper.year}</>}
          </p>

          {article.abstractHtml && (
            <section id="abstract" className="mt-8 scroll-mt-32">
              <h2 className="text-xl font-semibold">Abstract</h2>
              <ArticleBody html={article.abstractHtml} className="mt-2" />
            </section>
          )}

          {sections.map((s, i) => (
            <section key={i} id={s.title ? slug(s.title, i) : undefined} className="mt-8 scroll-mt-32">
              {s.title && <h2 className="text-xl font-semibold">{s.title}</h2>}
              <ArticleBody html={s.html} className="mt-2" />
            </section>
          ))}

          {article.references.length > 0 && (
            <details id="references" className="mt-10 scroll-mt-32 border-t border-line pt-6">
              <summary className="cursor-pointer text-xl font-semibold">References ({article.references.length})</summary>
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm text-fg/85">
                {article.references.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </details>
          )}

          <p className="mt-10 border-t border-line pt-4 text-xs text-muted">
            Full text from Europe PMC’s open-access collection, shown unchanged except for layout.
            {article.license && <> Licence: {article.license}</>}
          </p>
        </article>
      </div>
    </div>
  );
}

function ReaderBar({
  back,
  title,
  note,
  sticky = false,
  action,
}: {
  back: string;
  title: string;
  note: string;
  sticky?: boolean;
  action?: { href: string; label: string };
}) {
  return (
    <div className={`flex items-center gap-3 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md sm:px-6 ${sticky ? "sticky top-16 z-30" : ""}`}>
      <Link href={back} className="btn-ghost py-1">
        ← Paper
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate font-mono text-[11px] text-muted">{note}</p>
      </div>
      {action && (
        <Link href={action.href} className="btn-ghost shrink-0 py-1">
          {action.label}
        </Link>
      )}
    </div>
  );
}
