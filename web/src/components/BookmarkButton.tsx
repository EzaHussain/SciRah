"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { BookmarkIcon, SpinnerIcon } from "./icons";

export function BookmarkButton({ paperId, variant = "icon" }: { paperId: string; variant?: "icon" | "full" }) {
  const { user, saved, toggleSaved, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSaved = saved.has(paperId);

  if (!configured) return null;

  const onClick = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await toggleSaved(paperId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = isSaved ? "Saved" : "Save";
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={isSaved}
        title={isSaved ? "Remove from saved papers" : "Save to your library"}
        className={
          variant === "full"
            ? `btn ${isSaved ? "border border-primary bg-primary/15 text-fg" : "btn-ghost"}`
            : `rounded-lg p-2 transition-colors ${isSaved ? "text-primary" : "text-muted hover:bg-subtle hover:text-fg"}`
        }
      >
        {busy ? <SpinnerIcon /> : <BookmarkIcon filled={isSaved} />}
        {variant === "full" ? label : <span className="sr-only">{label}</span>}
      </button>
      {error && (
        <span role="alert" className="mt-1 max-w-[14rem] text-right text-xs text-accent">
          {error}
        </span>
      )}
    </span>
  );
}
