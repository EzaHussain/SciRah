import type { Metadata } from "next";
import Link from "next/link";
import { api, cached } from "@/lib/api";
import type { FieldInfo } from "@/lib/types";

// Built from live SciRah data, then served from Vercel's cache and rebuilt at most once an hour (ISR).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Topics",
  description: "Browse research by field and subfield — from medicine and agriculture to computer science and engineering.",
};

const subjectHref = (name: string) => `/search?${new URLSearchParams({ q: name, mode: "subject" })}`;

export default async function TopicsPage() {
  const fields = await api<FieldInfo[]>("/explore/fields", cached(revalidate)).catch(() => null);
  const domains = new Map<string, FieldInfo[]>();
  for (const f of fields ?? []) domains.set(f.domain, [...(domains.get(f.domain) ?? []), f]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Topics</p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Browse research by topic</h1>
      <p className="mt-3 max-w-2xl text-muted">
        All research is grouped into 26 fields and their subfields. Choose one to see its papers; on the results page you can narrow to Pakistan.
      </p>

      {!fields ? (
        <p className="card mt-8 p-6 text-sm text-muted">Topics are unavailable right now. Please try again later.</p>
      ) : (
        [...domains.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([domain, list]) => (
            <section key={domain} className="mt-10">
              <h2 className="mb-4 text-xl font-semibold">{domain}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((f) => (
                  <details key={f.id} className="card group p-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="font-medium">{f.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-muted">{new Intl.NumberFormat("en", { notation: "compact" }).format(f.works)} papers</span>
                        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden="true">
                          ›
                        </span>
                      </span>
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                      <Link href={subjectHref(f.name)} className="tag border-primary/50 text-fg hover:border-primary">
                        All of {f.name}
                      </Link>
                      {f.subfields.map((s) => (
                        <Link key={s.id} href={subjectHref(s.name)} className="tag hover:border-primary/60 hover:text-fg">
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
