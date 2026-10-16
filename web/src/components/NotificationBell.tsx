"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, paperHref, readerHref } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { AppNotification } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { BellIcon, NewsIcon, SparkIcon, SpinnerIcon } from "./icons";

const POLL_MS = 90_000;

/** Bell with unread count; polls while the tab is visible and raises a desktop notification for new items. */
export function NotificationBell() {
  const { user, getToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const lastCount = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const { unread: n } = await api<{ unread: number }>("/notifications/unread-count", { token }).catch(() => ({ unread: -1 }));
    if (n < 0) return;
    const prev = lastCount.current;
    lastCount.current = n;
    setUnread(n);
    if (prev !== null && n > prev && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const fresh = n - prev;
      const note = new Notification("SciRah", {
        body: `${fresh} new update${fresh > 1 ? "s" : ""} on topics you follow`,
        icon: "/logo-mark.png",
        tag: "scirah-updates",
      });
      note.onclick = () => {
        window.focus();
        router.push("/notifications");
      };
    }
  }, [getToken, router]);

  useEffect(() => {
    if (!user) {
      lastCount.current = null;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    poll();
    const id = setInterval(() => document.visibilityState === "visible" && poll(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, poll]);

  // Close on navigation / outside click.
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(null);
      const token = await getToken();
      const res = await api<{ items: AppNotification[]; unread: number }>("/notifications?limit=8", { token }).catch(() => null);
      setItems(res?.items ?? []);
      if (res) {
        setUnread(res.unread);
        lastCount.current = res.unread;
      }
    }
  };

  const markAll = async () => {
    const res = await api<{ unread: number }>("/notifications/read", { method: "POST", token: await getToken(), body: { all: true } }).catch(() => null);
    if (res) {
      setUnread(0);
      lastCount.current = 0;
      setItems((prev) => prev?.map((i) => ({ ...i, read: true })) ?? prev);
    }
  };

  const markOne = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) ?? prev);
    const res = await api<{ unread: number }>("/notifications/read", { method: "POST", token: await getToken(), body: { ids: [n.id] } }).catch(() => null);
    if (res) {
      setUnread(res.unread);
      lastCount.current = res.unread;
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] leading-none font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="popover fixed inset-x-3 top-16 z-50 shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-heading font-semibold">Updates on your topics</p>
            {unread > 0 && (
              <button className="text-xs text-muted hover:text-fg" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
                <SpinnerIcon /> Loading…
              </p>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">
                <p>No updates yet.</p>
                <p className="mt-1">
                  Search for topics (e.g. “dengue”) — SciRah checks them regularly and lets you know about new papers and news.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} compact onOpen={() => markOne(n)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/notifications" className="block border-t border-line px-4 py-2.5 text-center text-sm text-muted hover:text-fg">
            See all &amp; manage alerts
          </Link>
        </div>
      )}
    </div>
  );
}

export function NotificationRow({ n, compact = false, onOpen }: { n: AppNotification; compact?: boolean; onOpen: () => void }) {
  const inner = (
    <div className={`flex gap-3 ${compact ? "px-4 py-3" : "p-4"} ${n.read ? "" : "bg-primary/[0.06]"}`}>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.kind === "news" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
        {n.kind === "news" ? <NewsIcon className="h-3.5 w-3.5" /> : <SparkIcon className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="label text-muted">
          {n.kind === "news" ? "News" : "New paper"}
          {n.topic && <> · {n.topic}</>}
        </p>
        <p className={`mt-0.5 text-sm leading-snug ${n.read ? "" : "font-semibold"} ${compact ? "line-clamp-2" : ""}`}>{n.title}</p>
        {n.body && <p className={`mt-0.5 text-xs text-muted ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{n.body}</p>}
        <p className="mt-1 text-[11px] text-muted">
          {n.source && n.kind === "news" && <>{n.source} · </>}
          {timeAgo(n.publishedAt ?? n.createdAt)}
        </p>
      </div>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
    </div>
  );
  if (n.kind === "paper" && n.paperId)
    return (
      <Link href={paperHref(n.paperId)} onClick={onOpen} className="block hover:bg-subtle">
        {inner}
      </Link>
    );
  return (
    <Link href={n.url ? readerHref(n.url, { title: n.title, back: "/notifications" }) : "/notifications"} onClick={onOpen} className="block hover:bg-subtle">
      {inner}
    </Link>
  );
}
