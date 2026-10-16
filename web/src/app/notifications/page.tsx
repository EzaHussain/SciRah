"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SectionTitle } from "@/components/brand";
import { BellIcon, RefreshIcon, SpinnerIcon, TrashIcon } from "@/components/icons";
import { NotificationRow } from "@/components/NotificationBell";
import { api, ApiError } from "@/lib/api";
import { describeFilters } from "@/lib/filters";
import { timeAgo } from "@/lib/time";
import type { Alert, AppNotification, SearchMode } from "@/lib/types";

type Tab = "all" | "unread" | "paper" | "news";
const TABS: [Tab, string][] = [
  ["all", "All"],
  ["unread", "Unread"],
  ["paper", "Papers"],
  ["news", "News"],
];

export default function NotificationsPage() {
  const { user, loading, getToken, configured, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = (t: Tab, before?: number) => {
    const p = new URLSearchParams({ limit: "30" });
    if (t === "unread") p.set("unread", "1");
    if (t === "paper" || t === "news") p.set("kind", t);
    if (before) p.set("before", String(before));
    return `/notifications?${p}`;
  };

  const loadItems = useCallback(
    async (t: Tab) => {
      setItems(null);
      try {
        const res = await api<{ items: AppNotification[]; unread: number }>(query(t), { token: await getToken() });
        setItems(res.items);
        setHasMore(res.items.length === 30);
        setUnread(res.unread);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load notifications");
        setItems([]);
      }
    },
    [getToken],
  );

  const loadAlerts = useCallback(async () => {
    const list = await api<Alert[]>("/alerts", { token: await getToken() }).catch(() => [] as Alert[]);
    setAlerts(list);
  }, [getToken]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on tab change
    loadItems(tab);
  }, [user, tab, loadItems]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadAlerts();
  }, [user, loadAlerts]);

  if (!configured || (!loading && !user)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <BellIcon className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold">Stay on top of your topics</h1>
        <p className="mt-2 text-muted">
          Sign in and SciRah will tell you when new papers are published or news breaks on the topics you search — dengue, wheat yields, AI, anything.
        </p>
        <Link href="/login?next=/notifications" className="btn-primary mt-6">
          Sign in
        </Link>
      </div>
    );
  }

  const loadMore = async () => {
    if (!items?.length) return;
    const res = await api<{ items: AppNotification[] }>(query(tab, items[items.length - 1].id), { token: await getToken() }).catch(() => null);
    if (res) {
      setItems([...items, ...res.items]);
      setHasMore(res.items.length === 30);
    }
  };

  const markAll = async () => {
    const res = await api<{ unread: number }>("/notifications/read", { method: "POST", token: await getToken(), body: { all: true } }).catch(() => null);
    if (res) {
      setUnread(0);
      setItems((prev) => (tab === "unread" ? [] : (prev?.map((i) => ({ ...i, read: true })) ?? prev)));
    }
  };

  const markOne = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) ?? prev);
    const res = await api<{ unread: number }>("/notifications/read", { method: "POST", token: await getToken(), body: { ids: [n.id] } }).catch(() => null);
    if (res) setUnread(res.unread);
  };

  const remove = async (n: AppNotification) => {
    setItems((prev) => prev?.filter((i) => i.id !== n.id) ?? prev);
    await api(`/notifications/${n.id}`, { method: "DELETE", token: await getToken() }).catch(() => undefined);
  };

  const checkNow = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await api<{ checked: number; created: number; throttled?: boolean }>("/alerts/check", { method: "POST", token: await getToken() });
      setMessage(
        res.throttled
          ? "Checked very recently — try again in a minute."
          : res.checked === 0
            ? "You don’t have any active topics yet."
            : res.created
              ? `Found ${res.created} new update${res.created > 1 ? "s" : ""}.`
              : `Checked ${res.checked} topic${res.checked > 1 ? "s" : ""} — nothing new right now.`,
      );
      await Promise.all([loadItems(tab), loadAlerts()]);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <SectionTitle kicker="Updates" title="Notifications">
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost py-1.5" onClick={checkNow} disabled={checking}>
            {checking ? <SpinnerIcon /> : <RefreshIcon />} Check now
          </button>
          {unread > 0 && (
            <button className="btn-ghost py-1.5" onClick={markAll}>
              Mark all read
            </button>
          )}
        </div>
      </SectionTitle>

      <DesktopNotificationsPrompt />
      {message && (
        <p role="status" className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}

      <div role="tablist" aria-label="Filter notifications" className="mb-3 flex w-fit rounded-xl border border-line bg-subtle p-0.5 text-sm">
        {TABS.map(([v, l]) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={`rounded-lg px-3 py-1 transition-colors ${tab === v ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"}`}
          >
            {l}
            {v === "unread" && unread > 0 && <span className="ml-1 font-mono text-xs text-accent">{unread}</span>}
          </button>
        ))}
      </div>

      <div className="card mb-10 overflow-hidden">
        {items === null ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            <p className="font-medium text-fg">{tab === "unread" ? "You’re all caught up." : "No updates yet."}</p>
            <p className="mt-1">
              Topics are checked every few hours. Search for something you care about, or add a topic below, then come back — or press “Check now”.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="group relative">
                <NotificationRow n={n} onOpen={() => markOne(n)} />
                <button
                  className="absolute top-3 right-3 hidden rounded-lg p-1.5 text-muted group-hover:block hover:bg-subtle hover:text-accent"
                  aria-label="Delete notification"
                  onClick={() => remove(n)}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button className="block w-full border-t border-line py-3 text-sm text-muted hover:text-fg" onClick={loadMore}>
            Load more
          </button>
        )}
      </div>

      <TopicsManager alerts={alerts} reload={loadAlerts} getToken={getToken} autoAlerts={user?.autoAlerts ?? true} onAutoChange={() => refresh()} />
    </div>
  );
}

function DesktopNotificationsPrompt() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read a browser-only API after mount
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  if (perm === null || perm === "unsupported" || perm === "granted") return null;
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-sm text-muted">
        {perm === "denied"
          ? "Desktop pop-ups are blocked for this site. You can allow them in your browser’s site settings."
          : "Get a desktop pop-up when new updates arrive while SciRah is open."}
      </p>
      {perm === "default" && (
        <button className="btn-primary py-1.5" onClick={async () => setPerm(await Notification.requestPermission())}>
          <BellIcon /> Enable pop-ups
        </button>
      )}
    </div>
  );
}

function TopicsManager({
  alerts,
  reload,
  getToken,
  autoAlerts,
  onAutoChange,
}: {
  alerts: Alert[] | null;
  reload: () => Promise<void>;
  getToken: () => Promise<string | null>;
  autoAlerts: boolean;
  onAutoChange: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await api("/alerts", { method: "POST", token: await getToken(), body: { query: topic.trim(), mode } });
      setTopic("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add topic");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (a: Alert, body: Partial<Pick<Alert, "enabled" | "papers" | "news">>) => {
    await api(`/alerts/${a.id}`, { method: "PATCH", token: await getToken(), body }).catch(() => undefined);
    await reload();
  };
  const remove = async (a: Alert) => {
    await api(`/alerts/${a.id}`, { method: "DELETE", token: await getToken() }).catch(() => undefined);
    await reload();
  };
  const setAuto = async (v: boolean) => {
    await api("/auth/me", { method: "PATCH", token: await getToken(), body: { autoAlerts: v } }).catch(() => undefined);
    onAutoChange();
  };

  return (
    <section aria-labelledby="topics">
      <SectionTitle kicker="Alerts" title="Topics you follow" />

      <div className="card mb-4 p-4">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <select className="input py-2 text-sm sm:w-36" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} aria-label="Topic type">
            <option value="keyword">Keyword</option>
            <option value="author">Researcher</option>
            <option value="subject">Subject</option>
          </select>
          <input
            className="input py-2 text-sm"
            placeholder={mode === "author" ? "e.g. Atta-ur-Rahman" : "e.g. dengue, wheat rust, large language models"}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={200}
            aria-label="New topic"
          />
          <button className="btn-primary shrink-0" disabled={busy || topic.trim().length < 2}>
            {busy ? <SpinnerIcon /> : <BellIcon />} Follow
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={autoAlerts} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          Automatically follow topics I search for <span className="text-muted">(the last 25 searches)</span>
        </label>
      </div>

      {alerts === null ? (
        <div className="skeleton h-24 w-full" />
      ) : alerts.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No topics yet. Follow one above, or just search — your searches are followed automatically.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {alerts.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 p-4 ${a.enabled ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <Link href={`/search?${new URLSearchParams({ q: a.query, mode: a.mode })}`} className="hover:underline">
                    {a.query}
                  </Link>
                  {a.mode !== "keyword" && <span className="tag ml-2">{a.mode === "author" ? "researcher" : "subject"}</span>}
                  {a.source === "search" && <span className="tag ml-2">from your searches</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {describeFilters(a.filters) && <>{describeFilters(a.filters)} · </>}
                  {a.notificationCount} update{a.notificationCount === 1 ? "" : "s"} so far
                  {a.lastCheckedAt ? <> · checked {timeAgo(a.lastCheckedAt)}</> : <> · not checked yet</>}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={a.papers} onChange={(e) => patch(a, { papers: e.target.checked })} className="accent-[var(--primary)]" /> Papers
                </label>
                {a.mode !== "author" && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={a.news} onChange={(e) => patch(a, { news: e.target.checked })} className="accent-[var(--primary)]" /> News
                  </label>
                )}
                <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => patch(a, { enabled: !a.enabled })}>
                  {a.enabled ? "Pause" : "Resume"}
                </button>
                <button className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-accent" aria-label={`Stop following ${a.query}`} onClick={() => remove(a)}>
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
