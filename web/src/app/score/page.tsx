import type { Metadata } from "next";
import Link from "next/link";
import { SectionTitle } from "@/components/brand";

export const metadata: Metadata = {
  title: "How the SciRah Score works",
  description: "The SciRah Score is a transparent 0–100 researcher score built from citations, h-index, publications, funding, patents and graduated students.",
};

const COMPONENTS = [
  { label: "Citation impact", weight: 40, value: "Σ over papers of ln(1 + citations) × (0.5 + field percentile)", k: 400, note: "Highly cited papers count much more, but no single paper can dominate." },
  { label: "h-index", weight: 20, value: "h-index", k: 25, note: "h papers with at least h citations each." },
  { label: "Publications", weight: 15, value: "total number of works", k: 150, note: "Steady output counts, with diminishing returns." },
  { label: "Research funding", weight: 10, value: "distinct grants acknowledged in the papers", k: 10, note: "From the funding acknowledgements recorded by OpenAlex." },
  { label: "Patents", weight: 10, value: "patents granted", k: 5, note: "Self-reported by the researcher on an ORCID-verified profile." },
  { label: "Graduated students", weight: 5, value: "MPhil / PhD students supervised to graduation", k: 10, note: "Self-reported on a verified profile; lower weight." },
];

export default function ScorePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">SciRah Score</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">A transparent score for researchers</h1>
      <p className="mt-4 leading-relaxed text-fg/90">
        The SciRah Score (0–100) summarises a researcher’s body of work from public data. Unlike scores that reward clicks or site activity, it only
        counts research outcomes — and the whole formula is published here.
      </p>

      <div className="card mt-8 p-5 sm:p-6">
        <SectionTitle title="The formula" />
        <p className="text-sm leading-relaxed">
          Each part is turned into 0–100 points with the same curve, <code className="font-mono text-[13px]">points = 100 × (1 − e^(−value ÷ k))</code>, so
          early progress counts most and nobody can exceed 100. The parts are then combined with fixed weights:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Part</th>
                <th className="py-2 pr-3 font-medium">Weight</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 font-medium">k</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map((c) => (
                <tr key={c.label} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-medium">
                    {c.label}
                    <span className="block text-xs font-normal text-muted">{c.note}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono">{c.weight}%</td>
                  <td className="py-2 pr-3">{c.value}</td>
                  <td className="py-2 font-mono">{c.k}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">Why citations use a logarithm</h2>
        <p>
          A paper with 10,000 citations should never weigh the same as one with 10 — but it also shouldn’t be worth a thousand of them. With{" "}
          <code className="font-mono">ln(1 + citations)</code> a paper with 10 citations counts about 2.4 and one with 10,000 about 9.2.
        </p>
        <h2 className="text-lg font-semibold">Why fields are compared fairly</h2>
        <p>
          Medicine papers collect citations far faster than mathematics papers. Each paper is therefore weighted by its <em>field percentile</em> — how its
          citations compare with papers from the same field and year (from OpenAlex) — between ×0.5 and ×1.5.
        </p>
        <h2 className="text-lg font-semibold">What never counts</h2>
        <p>Likes, follows, profile views, comments or any other activity on SciRah. Those are easy to game and say nothing about research quality.</p>
        <h2 className="text-lg font-semibold">Claiming your profile</h2>
        <p>
          Researchers can verify their profile by signing in with ORCID (the ORCID iD must match the one linked to the profile). They can then add their
          patents and graduated students, which are shown as self-reported.
        </p>
        <p className="text-muted">
          Like any single number, the score is a rough guide, not a judgement of a person’s research. Read their papers.{" "}
          <Link href="/search?mode=author&q=" className="link">
            Find a researcher
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
