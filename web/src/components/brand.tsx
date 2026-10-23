import Image from "next/image";

/** The SciRah logo with its dark background removed (header, footer and sign-in screens). */
export function HeaderLogo({ className = "h-11 w-11", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/logo-transparent.png" alt="SciRah" width={192} height={192} unoptimized className={`shrink-0 ${className}`} priority={priority} />;
}

/**
 * Fixed layer behind the whole interface: the SciRah road mark as a large watermark, with
 * slowly drifting colour glows (logo gold + burnt orange, plus teal and violet) that tint the
 * translucent cards above them. Purely decorative.
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-glow backdrop-glow-1" />
      <div className="backdrop-glow backdrop-glow-2" />
      <div className="backdrop-glow backdrop-glow-3" />
      <div className="backdrop-glow backdrop-glow-4" />
      <Image src="/logo-mark.png" alt="" width={598} height={598} className="backdrop-logo" priority />
    </div>
  );
}

export function Wordmark() {
  return (
    <span className="font-heading text-xl font-bold tracking-tight">
      Sci<span className="text-primary">Rah</span>
    </span>
  );
}

/**
 * Section divider: a quiet winding road with a dashed centre line. Purely decorative.
 */
export function RoadDivider({ className = "" }: { className?: string }) {
  const d = "M0 20 C 120 6, 240 34, 360 20 S 600 6, 720 20 S 960 34, 1080 20 S 1200 12, 1200 12";
  return (
    <div className={`relative h-8 w-full ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path
          d={d}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.55"
          strokeWidth="1.25"
          strokeDasharray="6 9"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Small section heading with a road-marker accent. */
export function SectionTitle({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && (
          <p className="label mb-1 flex items-center gap-2 text-accent">
            <span className="inline-block h-1.5 w-4 rounded-full bg-accent" />
            {kicker}
          </p>
        )}
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}
