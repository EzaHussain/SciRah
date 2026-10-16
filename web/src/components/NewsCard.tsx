import Link from "next/link";
import { readerHref } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { NewsItem } from "@/lib/types";

export function NewsCard({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  return (
    <article className="card group flex gap-4 overflow-hidden p-4 transition-colors hover:border-primary/50">
      <div className="min-w-0 flex-1">
        <p className="label mb-1 flex flex-wrap items-center gap-x-2 text-muted">
          <span className="truncate">{item.source}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.publishedAt}>{timeAgo(item.publishedAt)}</time>
          {item.topic && <span className="tag normal-case">{item.topic}</span>}
        </p>
        <h3 className={`leading-snug font-semibold text-balance ${compact ? "text-[0.98rem]" : "text-[1.05rem]"}`}>
          <Link href={readerHref(item.url, { title: item.title, back: "/news" })} className="decoration-primary decoration-2 underline-offset-4 group-hover:underline">
            {item.title}
          </Link>
        </h3>
        {!compact && item.snippet && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{item.snippet}</p>}
      </div>
      {item.imageUrl && !compact && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="hidden h-20 w-28 shrink-0 rounded-lg border border-line object-cover sm:block"
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
      )}
    </article>
  );
}

export function NewsCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="skeleton mb-2 h-3 w-32" />
      <div className="skeleton mb-1.5 h-4 w-11/12" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}
