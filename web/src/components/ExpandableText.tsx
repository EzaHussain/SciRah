"use client";

import { useLayoutEffect, useRef, useState } from "react";

const CLAMP: Record<number, string> = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" };

/** Text clamped to a few lines with a "See more" toggle (shown only when the text actually overflows). */
export function ExpandableText({ text, lines = 3, className = "" }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  return (
    <div className={className}>
      <p ref={ref} className={`whitespace-pre-line ${open ? "" : CLAMP[lines]}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {open ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}
