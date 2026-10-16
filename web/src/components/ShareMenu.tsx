"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

interface ShareProps {
  /** Path on SciRah ("/paper/…") or an absolute URL. */
  path: string;
  /** Headline used in the shared message. */
  title: string;
  /** Optional longer message (e.g. a summary, or an invitation). */
  text?: string;
  buttonLabel?: string;
  className?: string;
}

const absolute = (path: string) => (path.startsWith("http") ? path : `${window.location.origin}${path}`);

/** Share dialogs open in a small pop-up (not a tab) that closes once the post is sent. */
function popup(url: string) {
  const w = 620;
  const h = 640;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  window.open(url, "scirah-share", `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
}

/**
 * Share a SciRah page: WhatsApp, LinkedIn, Facebook, a WeChat QR code (WeChat has no web share
 * link — people scan the code in the app), copy link, and the phone's own share sheet.
 */
export function ShareMenu({ path, title, text, buttonLabel = "Share", className = "btn-ghost" }: ShareProps) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanNative(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const url = () => absolute(path);
  const message = () => [title, text, url()].filter(Boolean).join("\n\n");

  const showWeChat = async () => {
    const dataUrl = await QRCode.toDataURL(url(), { width: 320, margin: 2, color: { dark: "#16222c", light: "#ffffff" } });
    setQr(dataUrl);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", url());
    }
  };

  const native = async () => {
    try {
      await navigator.share({ title, text: text ?? title, url: url() });
    } catch {
      /* cancelled */
    }
  };

  const targets = [
    { name: "WhatsApp", color: "#25D366", go: () => popup(`https://wa.me/?text=${encodeURIComponent(message())}`) },
    { name: "LinkedIn", color: "#0A66C2", go: () => popup(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`) },
    { name: "Facebook", color: "#1877F2", go: () => popup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`) },
    { name: "WeChat", color: "#07C160", go: showWeChat },
  ];

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <ShareIcon /> {buttonLabel}
      </button>
      <dialog
        ref={dialog}
        onClose={() => {
          setOpen(false);
          setQr(null);
        }}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-card-solid p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label text-muted">{buttonLabel}</p>
              <p className="mt-1 line-clamp-2 font-heading font-semibold">{title}</p>
            </div>
            <button type="button" aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-fg" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>

          {qr ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for this page" className="mx-auto h-56 w-56 rounded-xl border border-line bg-white p-2" />
              <p className="mt-3 text-sm text-muted">Open WeChat → Scan, then share the page with your contacts or Moments.</p>
              <div className="mt-4 flex justify-center gap-2">
                <a href={qr} download="scirah-qr.png" className="btn-ghost py-1.5">
                  Download QR
                </a>
                <button type="button" className="btn-ghost py-1.5" onClick={() => setQr(null)}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {targets.map((t) => (
                  <button key={t.name} type="button" onClick={t.go} className="btn-ghost justify-start py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} aria-hidden="true" />
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input readOnly value={open ? url() : path} className="input py-2 font-mono text-xs" aria-label="Link" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-primary shrink-0 py-2" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {canNative && (
                <button type="button" className="mt-2 w-full text-center text-sm text-muted hover:text-fg" onClick={native}>
                  More options…
                </button>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

export const ShareIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);
