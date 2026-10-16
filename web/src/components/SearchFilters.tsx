"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { activeFilterChips, CONTINENTS, COUNTRIES, COUNTRY_NAME, FIELDS, LANGUAGES, TYPES, VENUES } from "@/lib/filters";
import { CloseIcon, SpinnerIcon } from "./icons";

type Changes = Record<string, string | null>;

const csv = (v: string | null) => (v ?? "").split(",").filter(Boolean);

export function SearchFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [cites, setCites] = useState(params.get("cites") ?? "");

  const update = (changes: Changes) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.push(`/search?${next.toString()}`));
  };

  const thisYear = new Date().getFullYear();
  const applyYears = (e?: React.FormEvent) => {
    e?.preventDefault();
    const valid = (y: string) => (/^\d{4}$/.test(y) && +y >= 1800 && +y <= thisYear + 1 ? y : null);
    if (valid(from) === params.get("from") && valid(to) === params.get("to")) return;
    update({ from: valid(from), to: valid(to) });
  };

  // Countries: the legacy `pk=1` flag is folded into `country`.
  const countries = new Set(csv(params.get("country")));
  if (params.get("pk") === "1") countries.add("pk");
  const setCountries = (next: Set<string>) => update({ country: [...next].join(",") || null, pk: null });
  const toggleList = (key: string, value: string) => {
    const set = new Set(csv(params.get(key)));
    if (set.has(value)) set.delete(value);
    else set.add(value);
    update({ [key]: [...set].join(",") || null });
  };

  const chips = activeFilterChips(params);
  const removeChip = (c: { key: string; value?: string }) => {
    if (c.key === "country") {
      const next = new Set(countries);
      next.delete(c.value!);
      setCountries(next);
    } else if (c.key === "type") toggleList("type", c.value!);
    else if (c.key === "years") {
      setFrom("");
      setTo("");
      update({ from: null, to: null });
    } else if (c.key === "inst") update({ inst: null, instName: null });
    else if (c.key === "topic") update({ topic: null, topicName: null });
    else {
      if (c.key === "cites") setCites("");
      update({ [c.key]: null });
    }
  };
  const clearAll = () => {
    setFrom("");
    setTo("");
    setCites("");
    const keep = new URLSearchParams();
    for (const k of ["q", "mode", "sort"]) if (params.get(k)) keep.set(k, params.get(k)!);
    startTransition(() => router.push(`/search?${keep.toString()}`));
  };

  return (
    <aside className="card p-4" aria-label="Filters">
      <div className="mb-3 flex items-center justify-between">
        <p className="label text-fg">Refine</p>
        {pending ? (
          <SpinnerIcon className="h-3.5 w-3.5 text-primary" />
        ) : (
          chips.length > 0 && (
            <button className="text-xs text-muted hover:text-fg" onClick={clearAll}>
              Clear all
            </button>
          )
        )}
      </div>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <button
              key={`${c.key}:${c.value ?? ""}`}
              onClick={() => removeChip(c)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 py-0.5 pr-1.5 pl-2.5 text-xs hover:border-primary"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label}
              <CloseIcon className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <label className="mb-1 block text-xs text-muted" htmlFor="sort">
        Sort by
      </label>
      <select
        id="sort"
        className="input mb-4 py-2 text-sm"
        value={params.get("sort") ?? "relevance"}
        onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })}
      >
        <option value="relevance">Relevance</option>
        <option value="citations">Most cited</option>
        <option value="newest">Newest</option>
      </select>

      <form onSubmit={applyYears} className="mb-2">
        <p className="mb-1 text-xs text-muted">Publication year</p>
        <div className="flex items-center gap-2">
          <input
            aria-label="From year"
            inputMode="numeric"
            placeholder="From"
            value={from}
            onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={() => applyYears()}
            className="input py-2 text-sm"
          />
          <span className="text-muted">–</span>
          <input
            aria-label="To year"
            inputMode="numeric"
            placeholder="To"
            value={to}
            onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={() => applyYears()}
            className="input py-2 text-sm"
          />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {[
            ["Last year", thisYear - 1],
            ["5 yrs", thisYear - 5],
            ["10 yrs", thisYear - 10],
          ].map(([l, y]) => (
            <button
              key={l}
              type="button"
              className="tag hover:border-primary/60 hover:text-fg"
              onClick={() => {
                setFrom(String(y));
                setTo("");
                update({ from: String(y), to: null });
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="submit" className="sr-only">
          Apply years
        </button>
      </form>

      <Toggle label="Open access only" hint="Free to read at the source" checked={params.get("oa") === "1"} onChange={(v) => update({ oa: v ? "1" : null })} />

      <Section title="Location" count={countries.size + (params.get("continent") ? 1 : 0) + (params.get("gs") ? 1 : 0) + (params.get("inst") ? 1 : 0)}>
        <Toggle
          label="Pakistani institutions"
          hint="At least one author affiliated in Pakistan"
          checked={countries.has("pk")}
          onChange={(v) => {
            const next = new Set(countries);
            if (v) next.add("pk");
            else next.delete("pk");
            setCountries(next);
          }}
        />
        <CountryPicker selected={countries} onChange={setCountries} />

        <label className="mt-3 mb-1 block text-xs text-muted" htmlFor="continent">
          Continent
        </label>
        <select id="continent" className="input py-2 text-sm" value={params.get("continent") ?? ""} onChange={(e) => update({ continent: e.target.value || null })}>
          <option value="">Any continent</option>
          {CONTINENTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <Toggle label="Global South" hint="At least one author in a Global South country" checked={params.get("gs") === "1"} onChange={(v) => update({ gs: v ? "1" : null })} />

        <InstitutionPicker
          id={params.get("inst")}
          name={params.get("instName")}
          onChange={(inst) => update({ inst: inst?.id ?? null, instName: inst?.name ?? null })}
        />
      </Section>

      <Section
        title="Content"
        count={csv(params.get("type")).length + ["lang", "field", "venue", "cites", "abs", "retracted"].filter((k) => params.get(k)).length}
      >
        <p className="mb-1.5 text-xs text-muted">Document type</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPES.map(([v, l]) => {
            const on = csv(params.get("type")).includes(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => toggleList("type", v)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-primary/15 text-fg" : "border-line text-muted hover:text-fg"}`}
              >
                {l}
              </button>
            );
          })}
        </div>

        <Select id="field" label="Field" value={params.get("field")} options={FIELDS} any="Any field" onChange={(v) => update({ field: v })} />
        <Select id="lang" label="Language" value={params.get("lang")} options={LANGUAGES} any="Any language" onChange={(v) => update({ lang: v })} />
        <Select id="venue" label="Published in" value={params.get("venue")} options={VENUES} any="Any venue" onChange={(v) => update({ venue: v })} />

        <form
          className="mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ cites: /^\d+$/.test(cites) && +cites > 0 ? cites : null });
          }}
        >
          <label className="mb-1 block text-xs text-muted" htmlFor="cites">
            Minimum citations
          </label>
          <input
            id="cites"
            inputMode="numeric"
            placeholder="e.g. 10"
            className="input py-2 text-sm"
            value={cites}
            onChange={(e) => setCites(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onBlur={() => {
              const v = /^\d+$/.test(cites) && +cites > 0 ? cites : null;
              if (v !== params.get("cites")) update({ cites: v });
            }}
          />
        </form>

        <Toggle label="Has an abstract" hint="Skip records without a summary" checked={params.get("abs") === "1"} onChange={(v) => update({ abs: v ? "1" : null })} />
        <Toggle label="Hide retracted papers" hint="Exclude works marked as retracted" checked={params.get("retracted") === "0"} onChange={(v) => update({ retracted: v ? "0" : null })} />
      </Section>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">Location and content filters use OpenAlex metadata, so other sources are skipped while they’re on.</p>
    </aside>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group mt-3 border-t border-line pt-3" open={count > 0 || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        <span>
          {title}
          {count > 0 && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] text-on-primary">{count}</span>}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function Select({
  id,
  label,
  value,
  options,
  any,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: [string, string][];
  any: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-muted" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input py-2 text-sm" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{any}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function CountryPicker({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const matches = COUNTRIES.filter(([c, n]) => !selected.has(c) && (!q || n.toLowerCase().includes(q.toLowerCase()) || c === q.toLowerCase())).slice(0, 8);
  const add = (c: string) => {
    const next = new Set(selected);
    next.add(c);
    onChange(next);
    setQ("");
    setOpen(false);
  };
  const others = [...selected].filter((c) => c !== "pk");

  return (
    <div className="relative mt-2" ref={ref}>
      <label className="mb-1 block text-xs text-muted" htmlFor="country-q">
        Author countries <span className="text-muted/70">(any of)</span>
      </label>
      {others.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {others.map((c) => (
            <span key={c} className="tag text-fg">
              {COUNTRY_NAME[c] ?? c.toUpperCase()}
              <button
                aria-label={`Remove ${COUNTRY_NAME[c] ?? c}`}
                onClick={() => {
                  const next = new Set(selected);
                  next.delete(c);
                  onChange(next);
                }}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id="country-q"
        className="input py-2 text-sm"
        placeholder="Add a country…"
        value={q}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            add(matches[0][0]);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="popover absolute z-30 mt-1 max-h-60 w-full overflow-auto p-1 shadow-lg" role="listbox">
          {matches.map(([c, n]) => (
            <li key={c}>
              <button type="button" className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => add(c)}>
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InstitutionPicker({ id, name, onChange }: { id: string | null; name: string | null; onChange: (v: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; hint?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      api<{ id: string; name: string; hint?: string }[]>(`/papers/institutions?q=${encodeURIComponent(q.trim())}`)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (id) {
    return (
      <div className="mt-3">
        <p className="mb-1 text-xs text-muted">Institution</p>
        <span className="tag max-w-full text-fg">
          <span className="truncate">{name ?? id}</span>
          <button aria-label="Remove institution filter" onClick={() => onChange(null)}>
            <CloseIcon className="h-3 w-3" />
          </button>
        </span>
      </div>
    );
  }

  const shown = q.trim().length >= 2 ? results : [];
  return (
    <div className="relative mt-3">
      <label className="mb-1 block text-xs text-muted" htmlFor="inst-q">
        Institution
      </label>
      <input id="inst-q" className="input py-2 text-sm" placeholder="e.g. COMSATS, Aga Khan…" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      {loading && <SpinnerIcon className="absolute top-8 right-3 h-3.5 w-3.5 text-primary" />}
      {shown.length > 0 && (
        <ul className="popover absolute z-30 mt-1 max-h-64 w-full overflow-auto p-1 shadow-lg">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-subtle"
                onClick={() => {
                  setQ("");
                  setResults([]);
                  onChange({ id: r.id, name: r.name });
                }}
              >
                <span className="block text-sm">{r.name}</span>
                {r.hint && <span className="block text-xs text-muted">{r.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg py-2">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border border-line bg-subtle p-0.5 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] [&>span]:transition-transform peer-checked:[&>span]:translate-x-4"
      >
        <span className="h-3.5 w-3.5 rounded-full bg-card shadow-sm" />
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
