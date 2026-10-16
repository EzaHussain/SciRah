"use client";

import { useSyncExternalStore } from "react";

export const THEME_KEY = "scirah-theme";

/** Runs in <head> before paint: saved choice wins, otherwise the OS preference. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

// The <html data-theme> attribute is the source of truth (set before paint by themeInitScript).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function ThemeToggle() {
  // null on the server, so the thumb stays hidden until the real theme is known.
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);

  const dark = theme === "dark";
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className="relative inline-flex h-8 w-[3.6rem] shrink-0 items-center rounded-full border border-line bg-subtle p-0.5 transition-colors"
    >
      <span className="sr-only">Toggle dark mode</span>
      {/* track icons */}
      <SunIcon className="absolute left-2 h-3.5 w-3.5 text-muted" />
      <MoonIcon className="absolute right-2 h-3.5 w-3.5 text-muted" />
      {/* thumb */}
      <span
        className={`relative z-10 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm transition-transform duration-200 ${
          dark ? "translate-x-[1.6rem]" : "translate-x-0"
        } ${theme === null ? "opacity-0" : "opacity-100"}`}
      >
        {dark ? <MoonIcon className="h-3.5 w-3.5" /> : <SunIcon className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
