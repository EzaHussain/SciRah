"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BANDS, bandFor, compact } from "@/lib/bins";

interface Shape {
  code: string;
  name: string;
  d: string;
}

/**
 * Choropleth of where a topic's research comes from: countries shaded by number of papers in
 * bands (1–99 … 100k+). Hover for the exact count; click to narrow the search to that country.
 */
export function WorldMap({
  shapes,
  counts,
  width,
  height,
  searchBase,
}: {
  shapes: Shape[];
  counts: Record<string, number>;
  width: number;
  height: number;
  /** Current search query string (without `country`), used to drill into a country. */
  searchBase: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [table, setTable] = useState(false);
  const fmt = new Intl.NumberFormat("en");
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const nameOf = new Map(shapes.map((s) => [s.code, s.name]));
  const open = (code: string) => router.push(`/search?${searchBase}&country=${code}`);
  const hovered = hover ? { name: nameOf.get(hover.code) ?? hover.code.toUpperCase(), n: counts[hover.code] ?? 0 } : null;

  return (
    <figure className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="label text-muted">Papers by country (author affiliations)</figcaption>
        <button className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setTable((t) => !t)}>
          {table ? "Show map" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card-solid">
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-1.5 font-medium">Country</th>
                <th className="px-3 py-1.5 text-right font-medium">Papers</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(([code, n]) => (
                <tr key={code} className="cursor-pointer border-t border-line hover:bg-subtle" onClick={() => open(code)}>
                  <td className="px-3 py-1">{nameOf.get(code) ?? code.toUpperCase()}</td>
                  <td className="px-3 py-1 text-right font-mono text-xs">{fmt.format(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="World map of papers by country. Use Show table for the numbers.">
            {shapes.map((s) => {
              const band = bandFor(counts[s.code]);
              const active = hover?.code === s.code;
              return (
                <path
                  key={s.code}
                  d={s.d}
                  fill={band?.fill ?? "var(--map-empty)"}
                  stroke={active ? "var(--fg)" : "var(--map-stroke)"}
                  strokeWidth={active ? 1.4 : 0.5}
                  className={band ? "cursor-pointer" : ""}
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover({ code: s.code, x: e.clientX - box.left, y: e.clientY - box.top });
                  }}
                  onClick={() => band && open(s.code)}
                />
              );
            })}
          </svg>
          {hover && hovered && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card-solid px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
              style={{ left: hover.x, top: hover.y - 10 }}
            >
              <p className="font-medium">{hovered.name}</p>
              <p className="text-muted">
                {hovered.n ? `${fmt.format(hovered.n)} papers · click to explore` : "No papers found"}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Legend">
        {[...BANDS].reverse().map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ background: b.fill }} />
            {b.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-line" style={{ background: "var(--map-empty)" }} />
          none
        </span>
        {ranked[0] && (
          <span className="ml-auto">
            Most: {nameOf.get(ranked[0][0]) ?? ranked[0][0].toUpperCase()} ({compact(ranked[0][1])})
          </span>
        )}
      </div>
    </figure>
  );
}
