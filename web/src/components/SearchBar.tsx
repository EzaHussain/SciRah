"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { api, authorHref } from "@/lib/api";
import type { SearchMode } from "@/lib/types";
import { SearchIcon } from "./icons";

interface Suggestion {
  id: string;
  name: string;
  hint?: string;
  works?: number;
  citations?: number;
}

const MODES: { value: SearchMode; label: string; placeholder: string }[] = [
  { value: "keyword", label: "Keyword", placeholder: "e.g. dengue vaccine efficacy" },
  { value: "author", label: "Author", placeholder: "e.g. Atta-ur-Rahman" },
  { value: "subject", label: "Subject", placeholder: "e.g. Agronomy and Crop Science" },
];

/** `only` restricts the box to one search type (e.g. the Authors page), hiding the type buttons. */
export function SearchBar({ size = "md", autoFocus = false, only }: { size?: "md" | "lg"; autoFocus?: boolean; only?: SearchMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<SearchMode>(only ?? ((params.get("mode") as SearchMode) || "keyword"));
  const current = MODES.find((m) => m.value === mode) ?? MODES[0];
  const listId = useId();

  // Type-ahead (like Google): author names or subjects that start with what has been typed so far.
  const [suggestions, setSuggestions] = useState<{ key: string; items: Suggestion[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestKind = mode === "author" ? "authors" : mode === "subject" ? "subjects" : null;
  const term = q.trim();
  const suggestKey = `${suggestKind}:${term.toLowerCase()}`;
  const items = suggestKind && term.length >= 2 && suggestions?.key === suggestKey ? suggestions.items : [];

  useEffect(() => {
    if (!suggestKind || term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<Suggestion[]>(`/authors/suggest?${new URLSearchParams({ kind: suggestKind, q: term })}`)
        .then((list) => !cancelled && setSuggestions({ key: suggestKey, items: list }))
        .catch(() => !cancelled && setSuggestions({ key: suggestKey, items: [] }));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [suggestKind, term, suggestKey]);

  const go = (query: string, m: SearchMode) => {
    // Keep active filters, reset paging.
    const next = new URLSearchParams(params.toString());
    next.set("q", query);
    next.set("mode", m);
    next.delete("page");
    setOpen(false);
    router.push(`/search?${next.toString()}`);
  };

  const pick = (s: Suggestion) => {
    setQ(s.name);
    setOpen(false);
    // An author suggestion is one specific person, so open their profile; a subject runs a subject search.
    if (mode === "author") router.push(authorHref(`openalex:${s.id}`));
    else go(s.name, mode);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (open && active >= 0 && items[active]) return pick(items[active]);
    const query = q.trim();
    if (query.length < 2) return;
    go(query, mode);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };
  const showList = open && items.length > 0;

  const lg = size === "lg";
  return (
    <form onSubmit={submit} role="search" className="w-full">
      <div role="radiogroup" aria-label="Search by" className={`mb-2.5 flex gap-1.5 ${only ? "hidden" : ""}`}>
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
      <div className="relative">
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
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
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
      {showList && (
        <ul id={listId} role="listbox" className="popover absolute inset-x-0 top-full z-30 mt-1.5 max-h-96 overflow-auto rounded-2xl border border-line p-1.5 text-left shadow-lg">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 ${i === active ? "bg-subtle" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{s.name}</span>
                {s.hint && <span className="block truncate text-xs text-muted">{s.hint}</span>}
              </span>
              {s.works != null && (
                <span className="shrink-0 text-right font-mono text-[11px] text-muted">
                  {s.works.toLocaleString()} works
                  {mode === "author" && s.citations != null && <span className="block">{s.citations.toLocaleString()} citations</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </form>
  );
}
