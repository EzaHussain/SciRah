"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { filtersFromParams } from "@/lib/filters";
import type { Alert, SearchMode } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { BellIcon, SpinnerIcon } from "./icons";

const key = (mode: string, q: string) => `${mode}:${q.toLowerCase().replace(/\s+/g, " ").trim()}`;

/** "Get alerts" for the current search: new papers (and news) on this topic show up under the bell. */
export function FollowTopicButton({ query, mode }: { query: string; mode: SearchMode }) {
  const { user, getToken, configured } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
  const [alert, setAlert] = useState<Alert | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Small delay: the search itself may have just auto-created the topic.
    const t = setTimeout(async () => {
      const list = await api<Alert[]>("/alerts", { token: await getToken() }).catch(() => [] as Alert[]);
      if (!cancelled) setAlert(list.find((a) => key(a.mode, a.query) === key(mode, query)) ?? null);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user, getToken, query, mode]);

  if (!configured) return null;
  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`${pathname}?${params}`)}`} className="btn-ghost px-3 py-1.5 text-xs" title="Sign in to get alerts">
        <BellIcon className="h-3.5 w-3.5" /> Get alerts
      </Link>
    );
  }

  // Searches are tracked automatically (if enabled in settings), so an auto topic already counts as "on".
  const following = !!alert && alert.enabled;
  const toggle = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      if (following) setAlert(await api<Alert>(`/alerts/${alert!.id}`, { method: "PATCH", token, body: { enabled: false } }));
      else setAlert(await api<Alert>("/alerts", { method: "POST", token, body: { query, mode, filters: filtersFromParams(params) } }));
    } catch {
      // keep the previous state
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || alert === undefined}
      aria-pressed={following}
      title={following ? "You'll be notified about new papers and news on this topic. Click to stop." : "Notify me about new papers and news on this topic"}
      className={`btn px-3 py-1.5 text-xs ${following ? "border border-primary bg-primary/15 text-fg" : "btn-ghost"}`}
    >
      {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : <BellIcon className="h-3.5 w-3.5" filled={following} />}
      {following ? "Alerts on" : "Get alerts"}
    </button>
  );
}
