import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service", description: "The rules for using SciRah." };

const UPDATED = "16 October 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Legal</p>
      <h1 className="text-3xl font-bold">Terms of service</h1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <p>By using SciRah you agree to these terms. If you don’t agree, please don’t use the service.</p>

        <section className="space-y-2">
          <h2>What SciRah is</h2>
          <p>
            SciRah is a free tool for discovering research. It searches public scholarly databases and links to papers at their original publishers and
            repositories. SciRah does not host, own or sell research papers; each paper remains the property of its authors and publishers, under their
            own licences.
          </p>
        </section>

        <section className="space-y-2">
          <h2>AI-generated content</h2>
          <p>
            Summaries, translations, voice-overs, illustrations and the SciRah Score are produced automatically and <strong>can be inaccurate or
            incomplete</strong>. They are provided for convenience only. SciRah is not responsible for decisions made using them — always read and cite the
            original paper.
          </p>
        </section>

        <section className="space-y-2">
          <h2>Your account and content</h2>
          <ul>
            <li>Keep your sign-in details safe; you are responsible for activity on your account.</li>
            <li>
              Comments and papers you add must be accurate and lawful. Don’t post spam, abuse, other people’s private information, or content you don’t
              have the right to share.
            </li>
            <li>Only claim a researcher profile that is genuinely yours, and report patents and students honestly.</li>
            <li>We may remove content or suspend accounts that break these rules.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2>Fair use</h2>
          <p>
            Don’t try to disrupt the service, get around its limits (for example the daily AI limit), or scrape it in bulk. Data shown on SciRah comes from
            third-party sources and is subject to their terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2>No warranty</h2>
          <p>
            SciRah is provided “as is”, without guarantees that it will always be available, complete or error-free. To the extent the law allows, SciRah is
            not liable for losses arising from its use.
          </p>
        </section>

        <section className="space-y-2">
          <h2>Changes and contact</h2>
          <p>
            We may update these terms; the date above shows the latest version. See also our{" "}
            <Link href="/privacy" className="link">
              Privacy policy
            </Link>
            . Contact:{" "}
            <a href="mailto:ezahussainn@gmail.com" className="link">
              ezahussainn@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
