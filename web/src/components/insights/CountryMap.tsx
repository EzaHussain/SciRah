"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MapPin {
  id: string;
  name: string;
  city?: string;
  count: number;
  x: number;
  y: number;
}

/**
 * One country (e.g. Pakistan) with a pin per institution, sized by its number of papers on the
 * topic. Hover for details; click to see that institution's papers.
 */
export function CountryMap({
  countryName,
  outline,
  neighbours,
  width,
  height,
  pins,
  searchBase,
}: {
  countryName: string;
  outline: string;
  neighbours: string[];
  width: number;
  height: number;
  pins: MapPin[];
  searchBase: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const fmt = new Intl.NumberFormat("en");
  const max = Math.max(1, ...pins.map((p) => p.count));
  // Big pins first so small ones stay on top and clickable.
  const ordered = [...pins].sort((a, b) => b.count - a.count);
  const r = (n: number) => 3.5 + 13 * Math.sqrt(n / max);
  const active = pins.find((p) => p.id === hover);
  const open = (p: MapPin) => router.push(`/search?${searchBase}&inst=${p.id}&instName=${encodeURIComponent(p.name)}`);

  return (
    <figure className="min-w-0">
      <figcaption className="label mb-2 text-muted">Where in {countryName} · institutions by number of papers</figcaption>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-[28rem] w-full" role="img" aria-label={`Map of ${countryName} with ${pins.length} institutions. The list beside it has the same data.`}>
          {neighbours.map((d, i) => (
            <path key={i} d={d} fill="var(--map-empty)" stroke="var(--map-stroke)" strokeWidth={0.8} opacity={0.55} />
          ))}
          <path d={outline} fill="var(--subtle)" stroke="var(--primary)" strokeWidth={1.5} />
          {ordered.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={r(p.count)}
              fill={hover === p.id ? "var(--accent)" : "var(--chart-bar)"}
              fillOpacity={hover && hover !== p.id ? 0.45 : 0.85}
              stroke="var(--map-stroke)"
              strokeWidth={2}
              className="cursor-pointer transition-[fill-opacity]"
              onMouseEnter={() => setHover(p.id)}
              onFocus={() => setHover(p.id)}
              onClick={() => open(p)}
              tabIndex={0}
              role="link"
              aria-label={`${p.name}: ${p.count} papers`}
              onKeyDown={(e) => e.key === "Enter" && open(p)}
            />
          ))}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card-solid px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${(active.x / width) * 100}%`, top: `calc(${(active.y / height) * 100}% - ${r(active.count) + 6}px)` }}
          >
            <p className="max-w-56 font-medium">{active.name}</p>
            <p className="text-muted">
              {active.city ? `${active.city} · ` : ""}
              {fmt.format(active.count)} papers
            </p>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">Circle size = number of papers. Click an institution to see its papers.</p>
    </figure>
  );
}
