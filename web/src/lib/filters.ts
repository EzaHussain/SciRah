import type { AlertFilters } from "./types";

// Option lists for the advanced search filters (values match OpenAlex).

export const COUNTRIES: [code: string, name: string][] = [
  ["pk", "Pakistan"],
  ["in", "India"],
  ["bd", "Bangladesh"],
  ["af", "Afghanistan"],
  ["ir", "Iran"],
  ["cn", "China"],
  ["lk", "Sri Lanka"],
  ["np", "Nepal"],
  ["sa", "Saudi Arabia"],
  ["ae", "United Arab Emirates"],
  ["qa", "Qatar"],
  ["kw", "Kuwait"],
  ["om", "Oman"],
  ["tr", "Türkiye"],
  ["eg", "Egypt"],
  ["my", "Malaysia"],
  ["id", "Indonesia"],
  ["sg", "Singapore"],
  ["th", "Thailand"],
  ["vn", "Vietnam"],
  ["ph", "Philippines"],
  ["jp", "Japan"],
  ["kr", "South Korea"],
  ["tw", "Taiwan"],
  ["hk", "Hong Kong"],
  ["kz", "Kazakhstan"],
  ["uz", "Uzbekistan"],
  ["iq", "Iraq"],
  ["jo", "Jordan"],
  ["lb", "Lebanon"],
  ["ma", "Morocco"],
  ["tn", "Tunisia"],
  ["dz", "Algeria"],
  ["ng", "Nigeria"],
  ["ke", "Kenya"],
  ["et", "Ethiopia"],
  ["gh", "Ghana"],
  ["za", "South Africa"],
  ["tz", "Tanzania"],
  ["ug", "Uganda"],
  ["us", "United States"],
  ["ca", "Canada"],
  ["mx", "Mexico"],
  ["br", "Brazil"],
  ["ar", "Argentina"],
  ["cl", "Chile"],
  ["co", "Colombia"],
  ["gb", "United Kingdom"],
  ["ie", "Ireland"],
  ["de", "Germany"],
  ["fr", "France"],
  ["it", "Italy"],
  ["es", "Spain"],
  ["pt", "Portugal"],
  ["nl", "Netherlands"],
  ["be", "Belgium"],
  ["ch", "Switzerland"],
  ["at", "Austria"],
  ["se", "Sweden"],
  ["no", "Norway"],
  ["dk", "Denmark"],
  ["fi", "Finland"],
  ["pl", "Poland"],
  ["cz", "Czechia"],
  ["gr", "Greece"],
  ["ru", "Russia"],
  ["ua", "Ukraine"],
  ["au", "Australia"],
  ["nz", "New Zealand"],
];
export const COUNTRY_NAME = Object.fromEntries(COUNTRIES);

export const CONTINENTS: [string, string][] = [
  ["asia", "Asia"],
  ["africa", "Africa"],
  ["europe", "Europe"],
  ["north_america", "North America"],
  ["south_america", "South America"],
  ["oceania", "Oceania"],
];

export const TYPES: [string, string][] = [
  ["article", "Journal article"],
  ["review", "Review"],
  ["preprint", "Preprint"],
  ["book-chapter", "Book chapter"],
  ["book", "Book"],
  ["dissertation", "Thesis / dissertation"],
  ["dataset", "Dataset"],
  ["report", "Report"],
  ["letter", "Letter"],
  ["editorial", "Editorial"],
];

export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["ur", "Urdu"],
  ["ar", "Arabic"],
  ["fa", "Persian"],
  ["hi", "Hindi"],
  ["zh", "Chinese"],
  ["fr", "French"],
  ["de", "German"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["id", "Indonesian"],
  ["ms", "Malay"],
];

/** OpenAlex fields (ids 11–36). */
export const FIELDS: [string, string][] = [
  ["11", "Agricultural & Biological Sciences"],
  ["12", "Arts & Humanities"],
  ["13", "Biochemistry, Genetics & Molecular Biology"],
  ["14", "Business, Management & Accounting"],
  ["15", "Chemical Engineering"],
  ["16", "Chemistry"],
  ["17", "Computer Science"],
  ["18", "Decision Sciences"],
  ["19", "Earth & Planetary Sciences"],
  ["20", "Economics, Econometrics & Finance"],
  ["21", "Energy"],
  ["22", "Engineering"],
  ["23", "Environmental Science"],
  ["24", "Immunology & Microbiology"],
  ["25", "Materials Science"],
  ["26", "Mathematics"],
  ["27", "Medicine"],
  ["28", "Neuroscience"],
  ["29", "Nursing"],
  ["30", "Pharmacology, Toxicology & Pharmaceutics"],
  ["31", "Physics & Astronomy"],
  ["32", "Psychology"],
  ["33", "Social Sciences"],
  ["34", "Veterinary"],
  ["35", "Dentistry"],
  ["36", "Health Professions"],
];

export const VENUES: [string, string][] = [
  ["journal", "Journals"],
  ["conference", "Conferences"],
  ["repository", "Repositories (e.g. arXiv)"],
  ["book series", "Book series"],
];

/** Every search-param key the filters use (forwarded to the API by the results page). */
export const FILTER_KEYS = [
  "sort",
  "from",
  "to",
  "oa",
  "pk",
  "country",
  "continent",
  "gs",
  "inst",
  "type",
  "lang",
  "field",
  "venue",
  "cites",
  "abs",
  "retracted",
  "instName",
  "topic",
  "topicName",
] as const;

/** The URL's filters in the shape the alerts API stores. */
export function filtersFromParams(p: URLSearchParams): AlertFilters {
  const list = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  const countries = new Set(list("country"));
  if (p.get("pk") === "1") countries.add("pk");
  const f: AlertFilters = {
    openAccess: p.get("oa") === "1" || undefined,
    countries: countries.size ? [...countries] : undefined,
    continent: p.get("continent") ?? undefined,
    globalSouth: p.get("gs") === "1" || undefined,
    institution: p.get("inst") ?? undefined,
    types: list("type").length ? list("type") : undefined,
    language: p.get("lang") ?? undefined,
    field: p.get("field") ?? undefined,
    venueType: p.get("venue") ?? undefined,
    minCitations: p.get("cites") ? Number(p.get("cites")) : undefined,
    hasAbstract: p.get("abs") === "1" || undefined,
    excludeRetracted: p.get("retracted") === "0" || undefined,
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as AlertFilters;
}

/** Short description of an alert's saved filters, e.g. "Pakistan, India · Reviews". */
export function describeFilters(f: AlertFilters): string {
  const parts: string[] = [];
  const countries = [...new Set([...(f.countries ?? []), ...(f.pakistan ? ["pk"] : [])])];
  if (countries.length) parts.push(countries.map((c) => COUNTRY_NAME[c] ?? c.toUpperCase()).join(", "));
  if (f.continent) parts.push(label(CONTINENTS, f.continent));
  if (f.globalSouth) parts.push("Global South");
  if (f.types?.length) parts.push(f.types.map((t) => label(TYPES, t)).join(", "));
  if (f.field) parts.push(label(FIELDS, f.field));
  if (f.language) parts.push(label(LANGUAGES, f.language));
  if (f.openAccess) parts.push("Open access");
  return parts.join(" · ");
}

const label = (list: [string, string][], v: string) => list.find(([k]) => k === v)?.[1] ?? v;

/** Human-readable chips for the active filters: [param key, label, value-to-remove]. */
export function activeFilterChips(p: URLSearchParams): { key: string; value?: string; label: string }[] {
  const chips: { key: string; value?: string; label: string }[] = [];
  const countries = new Set((p.get("country") ?? "").split(",").filter(Boolean));
  if (p.get("pk") === "1") countries.add("pk");
  for (const c of countries) chips.push({ key: "country", value: c, label: COUNTRY_NAME[c] ?? c.toUpperCase() });
  if (p.get("continent")) chips.push({ key: "continent", label: label(CONTINENTS, p.get("continent")!) });
  if (p.get("gs") === "1") chips.push({ key: "gs", label: "Global South" });
  if (p.get("inst")) chips.push({ key: "inst", label: p.get("instName") ?? p.get("inst")! });
  for (const t of (p.get("type") ?? "").split(",").filter(Boolean)) chips.push({ key: "type", value: t, label: label(TYPES, t) });
  if (p.get("lang")) chips.push({ key: "lang", label: label(LANGUAGES, p.get("lang")!) });
  if (p.get("field")) chips.push({ key: "field", label: label(FIELDS, p.get("field")!) });
  if (p.get("topic")) chips.push({ key: "topic", label: p.get("topicName") ?? p.get("topic")! });
  if (p.get("venue")) chips.push({ key: "venue", label: label(VENUES, p.get("venue")!) });
  if (p.get("cites")) chips.push({ key: "cites", label: `≥ ${p.get("cites")} citations` });
  if (p.get("from") || p.get("to")) chips.push({ key: "years", label: `${p.get("from") ?? "…"}–${p.get("to") ?? "…"}` });
  if (p.get("oa") === "1") chips.push({ key: "oa", label: "Open access" });
  if (p.get("abs") === "1") chips.push({ key: "abs", label: "Has abstract" });
  if (p.get("retracted") === "0") chips.push({ key: "retracted", label: "No retractions" });
  return chips;
}
