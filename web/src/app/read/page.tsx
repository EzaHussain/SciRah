import type { Metadata } from "next";
import { Suspense } from "react";
import { ReaderView } from "@/components/ReaderView";

export const metadata: Metadata = { title: "Reader", robots: { index: false, follow: false } };

/**
 * The in-app reader. A static page: everything (link check, paper details) happens in the browser, so
 * the scrapers that follow every reader link cost no Vercel function time (Nov 2026 usage spike).
 */
export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderView />
    </Suspense>
  );
}
