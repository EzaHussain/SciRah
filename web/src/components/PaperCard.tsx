import Link from "next/link";
import { authorHref, paperHref } from "@/lib/api";
import { SOURCE_LABEL, type Paper } from "@/lib/types";
import { BookmarkButton } from "./BookmarkButton";
import { ExpandableText } from "./ExpandableText";
import { QuoteIcon, UnlockIcon } from "./icons";

export function formatCount(n?: number) {
  if (n === undefined || n === null) return null;
  return new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard" }).format(n);
}

export function AuthorList({ authors, max = 4, linked = true }: { authors: Paper["authors"]; max?: number; linked?: boolean }) {
  if (!authors.length) return <span className="text-muted">Unknown authors</span>;
  const shown = authors.slice(0, max);
  return (
    <span>
      {shown.map((a, i) => (
        <span key={`${a.name}-${i}`}>
          {linked && a.id ? (
            <Link href={authorHref(a.id)} className="hover:text-fg hover:underline">
              {a.name}
            </Link>
          ) : (
            a.name
          )}
          {i < shown.length - 1 ? ", " : ""}
        </span>
      ))}
      {authors.length > max && <span> +{authors.length - max} more</span>}
    </span>
  );
}

export function PaperMeta({ paper }: { paper: Paper }) {
  const cites = formatCount(paper.citationCount);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      {paper.year && <span className="font-mono">{paper.year}</span>}
      {paper.venue && <span className="max-w-[22rem] truncate italic">{paper.venue}</span>}
      {cites !== null && (
        <span className="inline-flex items-center gap-1" title="Citations">
          <QuoteIcon className="h-3 w-3" />
          {cites} citations
        </span>
      )}
      {paper.isOpenAccess && (
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-fg">
          <UnlockIcon /> Open access
        </span>
      )}
    </div>
  );
}

export function PaperCard({ paper, showAbstract = true, reason }: { paper: Paper; showAbstract?: boolean; reason?: string }) {
  return (
    <article className="card group relative p-4 transition-colors hover:border-primary/50 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {reason && <p className="label mb-1.5 text-accent">{reason}</p>}
          <h3 className="text-[1.05rem] leading-snug font-semibold text-balance sm:text-lg">
            <Link href={paperHref(paper.id)} className="decoration-primary decoration-2 underline-offset-4 group-hover:underline">
              {paper.title}
            </Link>
          </h3>
          <p className="mt-1.5 line-clamp-2 text-sm text-muted">
            <AuthorList authors={paper.authors} />
          </p>
          <div className="mt-2">
            <PaperMeta paper={paper} />
          </div>
          {showAbstract && (paper.tldr || paper.abstract) && (
            <ExpandableText text={(paper.tldr ?? paper.abstract)!} lines={3} className="mt-3 text-sm leading-relaxed text-fg/85" />
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {paper.sources.map((s) => (
              <span key={s} className="tag">
                {SOURCE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <BookmarkButton paperId={paper.id} />
      </div>
    </article>
  );
}

export function PaperCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton mb-3 h-5 w-4/5" />
      <div className="skeleton mb-2 h-3.5 w-2/5" />
      <div className="skeleton mb-4 h-3 w-1/3" />
      <div className="skeleton mb-1.5 h-3 w-full" />
      <div className="skeleton h-3 w-11/12" />
    </div>
  );
}
