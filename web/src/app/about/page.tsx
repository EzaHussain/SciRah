import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "SciRah helps students and researchers in Pakistan find, understand and share research — free, in 7 languages.",
};

const POINTS = [
  { title: "One search, six databases", text: "OpenAlex, Semantic Scholar, Crossref, CORE, arXiv and PubMed are searched together and duplicates merged." },
  { title: "Explained in your language", text: "AI summaries of papers in English, Urdu, Hindi, Arabic, Chinese, French and Spanish — with a voice-over." },
  { title: "Read without leaving", text: "Open-access papers open inside SciRah. SciRah never hosts or stores papers; it shows them from their official sources." },
  { title: "Pakistan’s research, visible", text: "Maps, leading universities, top researchers and research news from Pakistan, side by side with the world." },
  { title: "Credible researcher numbers", text: "Citations and h-index are cross-checked across databases, and verified researchers can correct their own profile." },
  { title: "Made for sharing", text: "Share papers on WhatsApp, LinkedIn, Facebook or WeChat, and export them to PDF, Word or a one-slide summary." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">About SciRah</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Find your path through research</h1>
      <p className="mt-4 text-lg leading-relaxed text-fg/90">
        <em>Rah</em> means “path”. SciRah is a free research-discovery platform built for students and researchers in Pakistan: it brings the
        world’s open scholarly data into one place and explains it in plain language.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {POINTS.map((p) => (
          <li key={p.title} className="card p-5">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.text}</p>
          </li>
        ))}
      </ul>

      <div className="card mt-10 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">For researchers</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Find your profile under <Link href="/authors" className="link">Authors</Link>, verify it with your university email, and you can correct
          your numbers, remove papers that aren’t yours and add your patents and graduated students. You can also{" "}
          <Link href="/submit" className="link">add a paper</Link> that SciRah doesn’t list yet.
        </p>
      </div>

      <p className="mt-10 text-sm text-muted">
        <Link href="/score" className="link">How the SciRah Score works</Link> · <Link href="/privacy" className="link">Privacy</Link> ·{" "}
        <Link href="/terms" className="link">Terms</Link>
      </p>
    </div>
  );
}
