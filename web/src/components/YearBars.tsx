"use client";

import { useState } from "react";

interface Point {
  year: number;
  value: number;
}

/** Single-series column chart (e.g. citations or papers per year) with per-bar hover and a table view. */
export function YearBars({ data, label, valueLabel = "Citations" }: { data: Point[]; label: string; valueLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (data.length < 2) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = new Intl.NumberFormat("en");
  const active = hover !== null ? data[hover] : data[data.length - 1];
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <figure className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <figcaption className="label text-muted">{label}</figcaption>
        <button className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setTable((t) => !t)}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Year</th>
                <th className="py-1 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.year} className="border-t border-line">
                  <td className="py-1 font-mono text-xs">{d.year}</td>
                  <td className="py-1 text-right font-mono text-xs">{fmt.format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm" aria-live="polite">
            <span className="font-heading text-lg font-semibold">{fmt.format(active.value)}</span>{" "}
            <span className="text-muted">in {active.year}</span>
          </p>
          <div
            className="flex h-28 items-end gap-[2px] border-b border-line"
            role="img"
            aria-label={`${label}: peak of ${fmt.format(peak.value)} in ${peak.year}. Use "Show table" for all values.`}
            onMouseLeave={() => setHover(null)}
          >
            {data.map((d, i) => (
              <div
                key={d.year}
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              >
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%`,
                    background: "var(--chart-bar)",
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            <span>{data[0].year}</span>
            <span>{data[data.length - 1].year}</span>
          </div>
        </>
      )}
    </figure>
  );
}
