import Link from "next/link";
import { authorHref } from "@/lib/api";
import type { PaperAuthor } from "@/lib/types";

const MAX_AUTHORS = 30;

/** a, b, … z, aa, ab … */
function letter(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);
}

/**
 * Authors with superscript affiliation letters and the affiliations listed underneath, as printed on
 * the paper (like a journal's article page). The corresponding author is marked with ✉.
 */
export function AuthorAffiliations({ authors }: { authors: PaperAuthor[] }) {
  const shown = authors.slice(0, MAX_AUTHORS);
  const order: string[] = [];
  const index = new Map<string, number>();
  for (const a of shown)
    for (const aff of a.affiliations ?? (a.affiliation ? [a.affiliation] : [])) {
      const key = aff.toLowerCase();
      if (!index.has(key)) {
        index.set(key, order.length);
        order.push(aff);
      }
    }
  const marks = (a: PaperAuthor) =>
    (a.affiliations ?? (a.affiliation ? [a.affiliation] : []))
      .map((x) => index.get(x.toLowerCase()))
      .filter((i): i is number => i !== undefined)
      .sort((x, y) => x - y)
      .map(letter);
  const hasCorresponding = shown.some((a) => a.corresponding);

  return (
    <div className="mt-4">
      <p className="text-[15px] leading-loose">
        {shown.map((a, i) => {
          const m = marks(a);
          return (
            <span key={`${a.name}-${i}`} className="whitespace-nowrap">
              {a.id ? (
                <Link href={authorHref(a.id)} className="link font-medium whitespace-normal">
                  {a.name}
                </Link>
              ) : (
                <span className="font-medium whitespace-normal">{a.name}</span>
              )}
              {m.length > 0 && <sup className="ml-0.5 font-mono text-[0.68rem] text-muted">{m.join(" ")}</sup>}
              {a.corresponding && (
                <span className="ml-1 text-xs text-primary" title="Corresponding author" aria-label="Corresponding author">
                  ✉
                </span>
              )}
              {i < shown.length - 1 && <span className="text-muted">, </span>}
            </span>
          );
        })}
        {authors.length > MAX_AUTHORS && <span className="text-muted"> and {authors.length - MAX_AUTHORS} others</span>}
      </p>

      {order.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm text-muted">
          {order.map((aff, i) => (
            <li key={aff} className="flex gap-2.5">
              <sup className="mt-2 w-4 shrink-0 text-right font-mono text-[0.7rem]">{letter(i)}</sup>
              <span>{aff}</span>
            </li>
          ))}
          {hasCorresponding && (
            <li className="flex gap-2.5">
              <span className="w-4 shrink-0 text-right text-xs text-primary">✉</span>
              <span>Corresponding author</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
