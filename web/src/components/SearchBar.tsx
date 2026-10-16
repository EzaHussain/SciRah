"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SearchMode } from "@/lib/types";
import { SearchIcon } from "./icons";

const MODES: { value: SearchMode; label: string; placeholder: string }[] = [
  { value: "keyword", label: "Keyword", placeholder: "e.g. dengue vaccine efficacy" },
  { value: "author", label: "Author", placeholder: "e.g. Atta-ur-Rahman" },
  { value: "subject", label: "Subject", placeholder: "e.g. Agronomy and Crop Science" },
];

export function SearchBar({ size = "md", autoFocus = false }: { size?: "md" | "lg"; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<SearchMode>((params.get("mode") as SearchMode) || "keyword");
  const current = MODES.find((m) => m.value === mode) ?? MODES[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    // Keep active filters, reset paging.
    const next = new URLSearchParams(params.toString());
    next.set("q", query);
    next.set("mode", mode);
    next.delete("page");
    router.push(`/search?${next.toString()}`);
  };

  const lg = size === "lg";
  return (
    <form onSubmit={submit} role="search" className="w-full">
      <div role="radiogroup" aria-label="Search by" className="mb-2.5 flex gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => setMode(m.value)}
            className={`label rounded-lg border px-2.5 py-1.5 transition-colors ${
              mode === m.value ? "border-primary bg-primary/12 text-fg" : "border-line text-muted hover:text-fg"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className={`flex items-stretch gap-2 rounded-2xl border border-line bg-card p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--ring)] ${lg ? "sm:p-2" : ""}`}>
        <label htmlFor="q" className="sr-only">
          Search papers by {current.label.toLowerCase()}
        </label>
        <span className="flex items-center pl-2.5 text-muted">
          <SearchIcon className={lg ? "h-5 w-5" : "h-4 w-4"} />
        </span>
        <input
          id="q"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={current.placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          minLength={2}
          maxLength={300}
          className={`min-w-0 flex-1 bg-transparent px-1 text-fg placeholder:text-muted/70 focus:outline-none ${lg ? "py-2.5 text-base sm:text-lg" : "py-2 text-[15px]"}`}
        />
        <button type="submit" className={`btn-primary ${lg ? "sm:px-6 sm:text-base" : ""}`}>
          Search
        </button>
      </div>
    </form>
  );
}
