"use client";

import { useEffect, useRef } from "react";

/**
 * Renders article HTML that the SciRah API built from an allow-list of tags (no scripts, no outside
 * links). Figure images come from Europe PMC; any that fail to load are hidden, keeping the caption.
 */
export function ArticleBody({ html, className = "" }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const imgs = ref.current?.querySelectorAll("img") ?? [];
    const hide = (e: Event) => ((e.target as HTMLImageElement).style.display = "none");
    imgs.forEach((img) => {
      img.addEventListener("error", hide);
      if (img.complete && img.naturalWidth === 0) img.style.display = "none";
    });
    return () => imgs.forEach((img) => img.removeEventListener("error", hide));
  }, [html]);

  return <div ref={ref} className={`article-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
