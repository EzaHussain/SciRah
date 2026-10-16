/** Count bands for the maps ("10k+", "100k+" …), shared by legend, fills and tooltips. */
export const BANDS = [
  { min: 100_000, label: "100k+", fill: "var(--seq-5)" },
  { min: 10_000, label: "10k+", fill: "var(--seq-4)" },
  { min: 1_000, label: "1k+", fill: "var(--seq-3)" },
  { min: 100, label: "100+", fill: "var(--seq-2)" },
  { min: 1, label: "1–99", fill: "var(--seq-1)" },
] as const;

export const bandFor = (n?: number) => (n && n > 0 ? BANDS.find((b) => n >= b.min) : undefined);

/** 1234 → "1.2k", 123456 → "123k". */
export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
