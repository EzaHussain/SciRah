"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { api, venueHref } from "@/lib/api";
import type { VenueSuggestion } from "@/lib/types";
import { SearchIcon } from "./icons";

/** Type-ahead search for journals and publishers; choosing one opens its SciRah profile. */
export function VenueFinder() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ key: string; items: VenueSuggestion[] } | null>(null);
  const [active, setActive] = useState(-1);
  const term = q.trim();
  const items = term.length >= 2 && result?.key === term.toLowerCase() ? result.items : [];

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<VenueSuggestion[]>(`/explore/venues?q=${encodeURIComponent(term)}`)
        .then((list) => !cancelled && setResult({ key: term.toLowerCase(), items: list }))
        .catch(() => !cancelled && setResult({ key: term.toLowerCase(), items: [] }));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const open = (v: VenueSuggestion) => router.push(venueHref(v.id));

  return (
    <div className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const pick = items[active >= 0 ? active : 0];
          if (pick) open(pick);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-card p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--ring)]"
      >
        <span className="pl-2.5 text-muted">
          <SearchIcon className="h-5 w-5" />
        </span>
        <input
          value={q}
          onChange={(e) => (setQ(e.target.value), setActive(-1))}
          onKeyDown={(e) => {
            if (!items.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length));
            }
          }}
          placeholder="Journal or publisher, e.g. Pakistan Journal of Botany"
          aria-label="Search journals and publishers"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base text-fg placeholder:text-muted/70 focus:outline-none"
        />
        <button type="submit" className="btn-primary">
          Open
        </button>
      </form>
      {items.length > 0 && (
        <ul id={listId} role="listbox" className="popover absolute inset-x-0 top-full z-30 mt-1.5 max-h-96 overflow-auto rounded-2xl border border-line p-1.5 shadow-lg">
          {items.map((v, i) => (
            <li
              key={v.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => open(v)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 ${i === active ? "bg-subtle" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.name}</span>
                {v.hint && <span className="block truncate text-xs text-muted">{v.hint}</span>}
              </span>
              <span className="shrink-0 text-right font-mono text-[11px] text-muted">
                {v.kind === "publisher" ? "Publisher" : "Journal"}
                {v.works != null && <span className="block">{v.works.toLocaleString()} papers</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
