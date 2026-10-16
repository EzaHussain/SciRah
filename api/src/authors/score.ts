import type { ScoreWork } from '../papers/sources/openalex.js';

/**
 * The SciRah Score (0–100) — a transparent, formula-based researcher score.
 *
 * Six components, each turned into 0–100 points with the same saturating curve
 *     points = 100 × (1 − e^(−value / k))
 * (early progress counts most; nobody can exceed 100), then combined with fixed weights:
 *
 *   Citation impact   40%   value = Σ over papers ln(1 + citations) × (0.5 + field percentile)    k = 400
 *   h-index           20%   value = h                                                              k = 25
 *   Publications      15%   value = number of works                                                k = 150
 *   Research funding  10%   value = distinct grants acknowledged in the papers                     k = 10
 *   Patents           10%   value = patents (self-reported on an ORCID-verified profile)           k = 5
 *   Graduated students 5%   value = graduated students (self-reported on a verified profile)       k = 10
 *
 * ln(1 + citations) means a paper with 10,000 citations counts far more than one with 10 (≈9.2 vs ≈2.4)
 * without one paper dominating. The field percentile (0–1, from OpenAlex: how a paper's citations compare
 * with papers of the same field and year) scales each paper between ×0.5 and ×1.5, so fields that cite
 * less are not penalised. Likes, follows or other site activity never count.
 */
export const SCORE_COMPONENTS = [
  { key: 'impact', label: 'Citation impact', weight: 0.4, k: 400 },
  { key: 'hIndex', label: 'h-index', weight: 0.2, k: 25 },
  { key: 'productivity', label: 'Publications', weight: 0.15, k: 150 },
  { key: 'funding', label: 'Research funding', weight: 0.1, k: 10 },
  { key: 'patents', label: 'Patents', weight: 0.1, k: 5 },
  { key: 'students', label: 'Graduated students', weight: 0.05, k: 10 },
] as const;

type ComponentKey = (typeof SCORE_COMPONENTS)[number]['key'];

export interface ScoreInput {
  works: ScoreWork[];
  totalWorks: number;
  hIndex: number;
  patents: number;
  students: number;
}

export interface ScoreBreakdown {
  /** 0–100, one decimal. */
  score: number;
  parts: {
    key: ComponentKey;
    label: string;
    /** Share of the final score, e.g. 0.4. */
    weight: number;
    /** 0–100 for this component. */
    points: number;
    /** Contribution to the final score (weight × points). */
    contribution: number;
    detail: string;
  }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const curve = (value: number, k: number) => 100 * (1 - Math.exp(-Math.max(0, value) / k));

export function sciRahScore(i: ScoreInput): ScoreBreakdown {
  const impact = i.works.reduce((s, w) => s + Math.log1p(w.citations) * (0.5 + (w.percentile ?? 0.5)), 0);
  const grants = new Set(i.works.flatMap((w) => w.awards)).size;
  const citations = i.works.reduce((s, w) => s + w.citations, 0);
  const n = (x: number) => x.toLocaleString('en');

  const values: Record<ComponentKey, { value: number; detail: string }> = {
    impact: { value: impact, detail: `${n(i.works.length)} papers, ${n(citations)} citations, weighted by field` },
    hIndex: { value: i.hIndex, detail: `h-index ${i.hIndex}` },
    productivity: { value: i.totalWorks, detail: `${n(i.totalWorks)} works` },
    funding: { value: grants, detail: `${grants} grant${grants === 1 ? '' : 's'} acknowledged in papers` },
    patents: { value: i.patents, detail: `${i.patents} (self-reported)` },
    students: { value: i.students, detail: `${i.students} (self-reported)` },
  };

  const parts = SCORE_COMPONENTS.map((c) => {
    const points = curve(values[c.key].value, c.k);
    return { key: c.key, label: c.label, weight: c.weight, points: round1(points), contribution: round1(points * c.weight), detail: values[c.key].detail };
  });
  return { score: round1(parts.reduce((s, p) => s + p.points * p.weight, 0)), parts };
}
