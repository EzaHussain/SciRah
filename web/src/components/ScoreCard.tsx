"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { SciRahScore } from "@/lib/types";

/** The researcher's SciRah Score with its breakdown. */
export function ScoreCard({ authorId }: { authorId: string }) {
  const [score, setScore] = useState<SciRahScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<SciRahScore>(`/authors/${encodeURIComponent(authorId)}/score`)
      .then((s) => !cancelled && setScore(s))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not calculate the score"));
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  return (
    <section aria-labelledby="scirah-score" className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p id="scirah-score" className="label text-muted">
          SciRah Score
        </p>
        <Link href="/score" className="text-xs text-muted hover:text-fg hover:underline">
          How it works
        </Link>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-muted">{error}</p>
      ) : !score ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="skeleton h-9 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      ) : (
        <>
          <p className="mt-1 font-heading text-4xl font-bold">
            {score.score.toFixed(1)}
            <span className="ml-1 text-base font-normal text-muted">/ 100</span>
          </p>
          <ul className="mt-3 space-y-2">
            {score.parts.map((p) => (
              <li key={p.key} title={p.detail}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span>
                    {p.label} <span className="text-muted">· {Math.round(p.weight * 100)}%</span>
                  </span>
                  <span className="font-mono text-muted">+{p.contribution.toFixed(1)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line/60">
                  <div className="h-full rounded-full" style={{ width: `${p.points}%`, background: "var(--chart-bar)" }} />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">{p.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 border-t border-line pt-3 text-[11px] text-muted">
        Patents and graduated students count once the researcher verifies this profile.
      </p>
    </section>
  );
}
