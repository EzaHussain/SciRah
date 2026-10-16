"use client";

import { toPng } from "html-to-image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AI_DISCLAIMER, langInfo, SUMMARY_LANGS, type SummaryLang } from "@/lib/languages";
import { SpinnerIcon } from "./icons";

export interface SlideData {
  paperId: string;
  title: string;
  authors: string;
  meta: string;
  /** Summary text per language; missing languages fall back to the abstract. */
  summaries: Partial<Record<SummaryLang, string>>;
  abstract?: string;
  url: string;
  citations?: number;
}

const W = 1280;
const H = 720;

/**
 * A one-slide summary of a paper (16:9), drawn by the browser so every script (Urdu, Arabic, Hindi,
 * Chinese…) renders properly. Download as PNG or save as PDF via the print dialog.
 */
export function SlideView({ data, initialLang }: { data: SlideData; initialLang: SummaryLang }) {
  const slide = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = SUMMARY_LANGS.filter((l) => data.summaries[l.code]);
  const [lang, setLang] = useState<SummaryLang>(data.summaries[initialLang] ? initialLang : (available[0]?.code ?? "en"));
  const text = data.summaries[lang];
  const body = text ?? data.abstract ?? "";
  const info = langInfo(lang);
  const fontSize = body.length > 900 ? 21 : body.length > 650 ? 24 : body.length > 420 ? 27 : 30;

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    QRCode.toDataURL(data.url, { width: 220, margin: 1, color: { dark: "#16222c", light: "#ffffff" } }).then(setQr);
  }, [data.url]);

  const downloadPng = async () => {
    if (!slide.current) return;
    setBusy(true);
    try {
      const png = await toPng(slide.current, { width: W, height: H, pixelRatio: 2, style: { transform: "none" }, cacheBust: true });
      const a = document.createElement("a");
      a.href = png;
      a.download = `scirah-slide-${data.title.slice(0, 40).replace(/[^\w]+/g, "-")}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* The slide prints as one exact 16:9 page. */}
      <style>{`@media print { @page { size: ${W}px ${H}px; margin: 0; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/paper/${encodeURIComponent(data.paperId)}`} className="btn-ghost py-1.5">
          ← Paper
        </Link>
        {available.length > 1 && (
          <div role="radiogroup" aria-label="Slide language" className="flex flex-wrap gap-1">
            {available.map((l) => (
              <button
                key={l.code}
                role="radio"
                aria-checked={lang === l.code}
                onClick={() => setLang(l.code)}
                className={`rounded-full border px-2.5 py-0.5 text-sm ${lang === l.code ? "border-primary bg-primary/15" : "border-line text-muted hover:text-fg"}`}
              >
                {l.native}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn-primary py-1.5" onClick={downloadPng} disabled={busy}>
            {busy ? <SpinnerIcon /> : null} Download PNG
          </button>
          <button className="btn-ghost py-1.5" onClick={() => window.print()}>
            Save as PDF
          </button>
        </div>
      </div>
      {!text && (
        <p className="no-print mb-3 text-sm text-muted">
          No AI summary yet — the slide shows the abstract. Generate a summary on the paper page to use it here.
        </p>
      )}

      <div ref={frame} className="slide-frame w-full" style={{ height: H * scale }}>
        <div
          ref={slide}
          className="slide-print origin-top-left overflow-hidden rounded-2xl shadow-2xl"
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            background: "linear-gradient(135deg, #fbf3e4 0%, #ffffff 55%, #fdeee2 100%)",
            color: "#16222c",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            position: "relative",
          }}
        >
          {/* Brand mark, faint in the corner */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" style={{ position: "absolute", right: -120, top: -120, width: 520, opacity: 0.08 }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(#f0981f, #d9461e)" }} />

          <div style={{ padding: "52px 64px 0 76px", display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SciRah" style={{ width: 52, height: 52, borderRadius: 12 }} />
            <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 700, fontSize: 26 }}>
              Sci<span style={{ color: "#d97f0f" }}>Rah</span>
            </span>
            <span style={{ marginLeft: 16, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", color: "#d9461e", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
              {text ? "Research summary" : "Abstract"}
            </span>
          </div>

          <div style={{ padding: "26px 300px 0 76px" }}>
            <h1
              style={{
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontWeight: 700,
                fontSize: data.title.length > 120 ? 30 : data.title.length > 80 ? 36 : 42,
                lineHeight: 1.15,
                margin: 0,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.title}
            </h1>
            <p style={{ marginTop: 14, fontSize: 18, color: "#5a6670", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.authors}</p>
            <p style={{ marginTop: 4, fontSize: 16, color: "#5a6670", fontStyle: "italic" }}>{data.meta}</p>
          </div>

          <div
            lang={lang}
            dir={info.dir}
            style={{
              margin: "26px 300px 0 76px",
              fontSize,
              lineHeight: lang === "ur" ? 2.1 : 1.5,
              fontFamily: lang === "ur" ? "var(--font-nastaliq), serif" : undefined,
              display: "-webkit-box",
              WebkitLineClamp: lang === "ur" ? 6 : 9,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {body}
          </div>

          <div style={{ position: "absolute", right: 64, top: 200, width: 196, textAlign: "center" }}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code to the paper on SciRah" style={{ width: 196, height: 196, borderRadius: 12, background: "#fff", padding: 6, boxShadow: "0 4px 18px rgba(0,0,0,0.08)" }} />
            )}
            <p style={{ marginTop: 10, fontSize: 14, color: "#5a6670" }}>Scan to read on SciRah</p>
            {data.citations !== undefined && (
              <p style={{ marginTop: 18, fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 34, fontWeight: 700 }}>
                {new Intl.NumberFormat("en").format(data.citations)}
                <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "#5a6670" }}>citations</span>
              </p>
            )}
          </div>

          <p style={{ position: "absolute", left: 76, right: 64, bottom: 26, fontSize: 12.5, color: "#7a848c" }}>
            {text ? `${AI_DISCLAIMER} ` : ""}
            {data.url.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>
    </div>
  );
}
