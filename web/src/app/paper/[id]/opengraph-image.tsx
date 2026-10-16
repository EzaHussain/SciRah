import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { api, decodeParam } from "@/lib/api";
import type { Paper } from "@/lib/types";

export const alt = "Research paper on SciRah";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card shown when a paper link is shared on WhatsApp, LinkedIn, Facebook, WeChat… */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeParam((await params).id);
  const [paper, logo] = await Promise.all([
    api<Paper>(`/papers/detail?id=${encodeURIComponent(id)}`).catch(() => null),
    readFile(join(process.cwd(), "public/logo.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`),
  ]);
  const title = paper?.title ?? "Research paper";
  const authors = paper ? paper.authors.slice(0, 4).map((a) => a.name).join(", ") + (paper.authors.length > 4 ? " et al." : "") : "";
  const meta = paper ? [paper.venue, paper.year].filter(Boolean).join(" · ") : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(135deg, #091621 0%, #102333 60%, #1d3548 100%)", color: "#f5e9d6", padding: "56px 64px", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 16, background: "linear-gradient(#f0981f, #d9461e)", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={64} height={64} style={{ borderRadius: 14 }} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
            Sci<span style={{ color: "#f0981f" }}>Rah</span>
          </div>
          <div style={{ display: "flex", marginLeft: 18, fontSize: 20, color: "#a7a196", letterSpacing: 3 }}>RESEARCH PAPER</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: title.length > 110 ? 44 : title.length > 70 ? 52 : 62, fontWeight: 700, lineHeight: 1.15, maxHeight: 360, overflow: "hidden" }}>
            {title.length > 180 ? `${title.slice(0, 177)}…` : title}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {authors && <div style={{ display: "flex", fontSize: 26, color: "#f5e9d6" }}>{authors}</div>}
          {meta && <div style={{ display: "flex", fontSize: 22, color: "#a7a196" }}>{meta}</div>}
        </div>
      </div>
    ),
    size,
  );
}
