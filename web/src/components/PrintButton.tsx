"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary py-1.5" onClick={() => window.print()}>
      {label}
    </button>
  );
}
