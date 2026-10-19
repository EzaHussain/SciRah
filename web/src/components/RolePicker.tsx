"use client";

export type Role = "reader" | "researcher";

const OPTIONS: { role: Role; title: string; text: string; icon: string }[] = [
  {
    role: "researcher",
    title: "I’m a researcher",
    text: "Publish a profile, add your papers, verify your publication record and keep your numbers accurate.",
    icon: "🔬",
  },
  {
    role: "reader",
    title: "I read research",
    text: "Student or curious reader: search, save and follow papers, with AI summaries in 7 languages.",
    icon: "📖",
  },
];

/** "Researcher or reader?" — asked when an account is created. */
export function RolePicker({ value, onChange }: { value: Role | null; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid gap-2.5 sm:grid-cols-2">
      {OPTIONS.map((o) => {
        const active = value === o.role;
        return (
          <button
            key={o.role}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.role)}
            className={`rounded-xl border p-3.5 text-left transition-colors ${
              active ? "border-primary bg-primary/12 ring-2 ring-[var(--ring)]" : "border-line hover:border-primary/50"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">{o.icon}</span>
              {o.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}
