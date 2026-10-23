import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Noto_Nastaliq_Urdu, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { AuthProvider } from "@/components/AuthProvider";
import { Backdrop, HeaderLogo, RoadDivider } from "@/components/brand";
import { Header } from "@/components/Header";
import { RoleNudge } from "@/components/RoleNudge";
import { readerHref } from "@/lib/api";
import { siteUrl } from "@/lib/paper-export";
import { themeInitScript } from "@/components/ThemeToggle";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });
const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-nastaliq",
  display: "swap",
  preload: false, // only needed once a reader switches to Urdu
});

const DESCRIPTION =
  "SciRah helps students and researchers in Pakistan find research papers from OpenAlex, Semantic Scholar, Crossref, CORE, arXiv and PubMed — free, with plain-language AI summaries in 7 languages including Urdu.";

export const metadata: Metadata = {
  title: { default: "SciRah — find your path through research", template: "%s · SciRah" },
  description: DESCRIPTION,
  metadataBase: new URL(siteUrl()),
  applicationName: "SciRah",
  keywords: ["research papers", "Pakistan research", "academic search", "Urdu summaries", "researchers Pakistan", "open access", "SciRah"],
  openGraph: { type: "website", siteName: "SciRah", locale: "en_PK", title: "SciRah — find your path through research", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "SciRah — find your path through research", description: DESCRIPTION },
  // Google Search Console "HTML tag" verification (optional — the DNS method needs no code).
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF6EF" },
    { media: "(prefers-color-scheme: dark)", color: "#091621" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${nastaliq.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <AuthProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
            Skip to content
          </a>
          <Backdrop />
          <Header />
          <RoleNudge />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="mt-16">
      <RoadDivider className="opacity-70" />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2 text-fg">
            <HeaderLogo />
            <span className="font-heading font-semibold">SciRah</span>
          </div>
          <p className="max-w-md leading-relaxed">
            SciRah does not host or store research papers. Results come live from free, official scholarly APIs, and every
            paper links back to its original source.
          </p>
        </div>
        <div>
          <p className="label mb-2 text-fg">Data sources</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {[
              ["OpenAlex", "https://openalex.org"],
              ["Semantic Scholar", "https://www.semanticscholar.org"],
              ["Crossref", "https://www.crossref.org"],
              ["CORE", "https://core.ac.uk"],
              ["arXiv", "https://arxiv.org"],
              ["PubMed", "https://pubmed.ncbi.nlm.nih.gov"],
            ].map(([name, href]) => (
              <li key={name}>
                <Link href={readerHref(href, { title: name })} className="hover:text-fg">
                  {name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-4 text-xs">
            <Link href="/privacy" className="hover:text-fg">
              Privacy policy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms of service
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
