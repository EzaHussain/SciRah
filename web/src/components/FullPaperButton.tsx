"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FullText } from "@/lib/types";
import { SpinnerIcon, UnlockIcon } from "./icons";

/**
 * "Read full paper": checks (once per paper, cached by the API) whether a free full text exists —
 * the complete article, a PDF or an open-access page — and opens it inside SciRah.
 */
export function FullPaperButton({ paperId, publisherHref }: { paperId: string; publisherHref?: string }) {
  const [ft, setFt] = useState<FullText | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<FullText>(`/papers/fulltext?id=${encodeURIComponent(paperId)}`)
      .then((r) => !cancelled && setFt(r))
      .catch(() => !cancelled && setFt({ kind: "none", reason: "Couldn’t check for a free full text right now." }));
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  const fullHref = `/paper/${encodeURIComponent(paperId)}/full`;

  if (!ft)
    return (
      <span className="btn-ghost cursor-default text-muted" aria-live="polite">
        <SpinnerIcon /> Looking for the full paper…
      </span>
    );

  if (ft.kind === "none")
    return (
      <>
        {publisherHref && (
          <Link href={publisherHref} className="btn-primary">
            View at publisher
          </Link>
        )}
        <span className="basis-full text-xs text-muted">{ft.reason}</span>
      </>
    );

  return (
    <>
      <Link href={fullHref} className="btn-primary">
        <UnlockIcon /> Read full paper
      </Link>
      {publisherHref && (
        <Link href={publisherHref} className="btn-ghost">
          Publisher’s page
        </Link>
      )}
    </>
  );
}
