import type { PaperTopic } from '../papers/types.js';

/**
 * Topic embeddings without an external embedding model.
 *
 * Each paper is a sparse vector over OpenAlex's fixed research taxonomy:
 *   index 1..4999      topic     (OpenAlex T10001… → topicNumber − 10000)
 *   index 5000..7999   subfield  (OpenAlex subfields 1100…3700 → 5000 + n − 1000)
 *   index 8000..8191   field     (OpenAlex fields 11…36 → 8000 + n)
 * Weights come from OpenAlex's topic scores, so related work shares subfield/field
 * mass even when exact topics differ. Stored in Postgres as jsonb; similarity is computed in the API.
 */
export const TOPIC_DIMS = 8192;
export type SparseVec = Map<number, number>;

const num = (id?: string) => (id ? Number.parseInt(id.replace(/^\D+/, ''), 10) : NaN);

export function topicVector(topics: PaperTopic[]): SparseVec {
  const v: SparseVec = new Map();
  const add = (i: number, w: number) => {
    if (Number.isInteger(i) && i >= 1 && i <= TOPIC_DIMS) v.set(i, (v.get(i) ?? 0) + w);
  };
  for (const t of topics) {
    const s = Math.max(0.1, t.score ?? 0.5);
    const tn = num(t.id);
    if (tn > 10000 && tn < 15000) add(tn - 10000, s);
    const sn = num(t.subfieldId);
    if (sn >= 1000 && sn < 4000) add(5000 + sn - 1000, 0.6 * s);
    const fn = num(t.fieldId);
    if (fn > 0 && fn < 192) add(8000 + fn, 0.3 * s);
  }
  return normalize(v);
}

export function normalize(v: SparseVec): SparseVec {
  let sum = 0;
  for (const x of v.values()) sum += x * x;
  if (sum === 0) return v;
  const n = Math.sqrt(sum);
  return new Map([...v].map(([i, x]) => [i, x / n]));
}

export function addScaled(acc: SparseVec, v: SparseVec, w: number) {
  for (const [i, x] of v) acc.set(i, (acc.get(i) ?? 0) + x * w);
}

export function cosine(a: SparseVec, b: SparseVec): number {
  let dot = 0;
  for (const [i, x] of a) dot += x * (b.get(i) ?? 0);
  return dot; // both are L2-normalised
}

/** Stored in Postgres as jsonb: {"index": weight, …} (only non-zero entries). */
export function toJson(v: SparseVec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [i, x] of [...v].sort((a, b) => a[0] - b[0])) if (Math.abs(x) > 1e-6) out[i] = Number(x.toFixed(5));
  return out;
}

export function fromJson(o: unknown): SparseVec {
  const v: SparseVec = new Map();
  if (!o || typeof o !== 'object') return v;
  for (const [i, x] of Object.entries(o as Record<string, unknown>)) {
    const n = Number(x);
    if (Number.isFinite(n)) v.set(Number(i), n);
  }
  return v;
}

/** OpenAlex subfield ids ("1702") present in a vector — used to pre-filter feed candidates. */
export function subfieldsOf(v: SparseVec): string[] {
  return [...v.keys()].filter((i) => i >= 5000 && i < 8000).map((i) => String(i - 5000 + 1000));
}

export function topSubfields(v: SparseVec, n = 5): string[] {
  return [...v]
    .filter(([i]) => i >= 5000 && i < 8000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([i]) => String(i - 5000 + 1000));
}
