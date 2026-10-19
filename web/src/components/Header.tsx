"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { HeaderLogo, Wordmark } from "./brand";
import { CloseIcon, MenuIcon } from "./icons";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/news", label: "News" },
  { href: "/saved", label: "Saved" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the mobile menu on navigation (state reset during render, per React docs).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SciRah home">
          <HeaderLogo priority />
          <Wordmark />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive(n.href) ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <NotificationBell />
          <div className="hidden md:block">
            <AccountButton />
          </div>
          <button
            type="button"
            className="btn-ghost px-2.5 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-bg px-4 pt-2 pb-4 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2.5 ${isActive(n.href) ? "bg-subtle font-medium" : "text-muted"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <AccountButton block />
          </div>
        </div>
      )}
    </header>
  );
}

function AccountButton({ block = false }: { block?: boolean }) {
  const { user, loading, signOut, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  if (!configured) return null;
  if (loading) return <div className="skeleton h-9 w-20" />;

  if (!user) {
    const next = pathname && pathname !== "/login" && pathname !== "/signup" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <div className={`flex gap-2 ${block ? "flex-col" : ""}`}>
        <Link href={`/login${next}`} className={`btn-ghost ${block ? "w-full" : ""}`}>
          Sign in
        </Link>
        <Link href={`/signup${next}`} className={`btn-primary ${block ? "w-full" : "hidden lg:inline-flex"}`}>
          Create account
        </Link>
      </div>
    );
  }

  const name = user.name || user.email.split("@")[0] || "Account";
  const doSignOut = async () => {
    await signOut();
    setMenu(false);
    router.refresh();
  };

  if (block) {
    return (
      <div className="space-y-2 px-1">
        <p className="truncate text-sm">
          Signed in as <strong>{name}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/notifications" className="btn-ghost">
            Alerts
          </Link>
          <Link href="/account" className="btn-ghost">
            Account
          </Link>
          <button className="btn-ghost" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 text-sm hover:border-primary/60"
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <Avatar name={name} url={user.avatarUrl} />
        <span className="max-w-[9rem] truncate">{name}</span>
      </button>
      {menu && (
        <div role="menu" className="popover absolute right-0 mt-2 w-56 p-1.5 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
          <Link role="menuitem" href="/saved" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
            Saved papers
          </Link>
          <Link role="menuitem" href="/notifications" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
            Notifications &amp; alerts
          </Link>
          <Link role="menuitem" href="/submit" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
            Add a paper
          </Link>
          {user.isAdmin && (
            <Link role="menuitem" href="/admin/submissions" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
              Review added papers
            </Link>
          )}
          {user.isAdmin && (
            <Link role="menuitem" href="/admin/verifications" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
              Review profile verifications
            </Link>
          )}
          {user.role === "researcher" && (
            <Link role="menuitem" href={`/researcher/${user.id}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
              My researcher page
            </Link>
          )}
          <Link role="menuitem" href="/account" className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle" onClick={() => setMenu(false)}>
            Account settings
          </Link>
          <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  return (
    <span
      className="flex items-center justify-center rounded-full bg-primary font-heading text-xs font-semibold text-on-primary"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
