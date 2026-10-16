import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { decodeParam } from "@/lib/api";
import { AI_DISCLAIMER, SUMMARY_LANGS } from "@/lib/languages";
import { apaCitation, loadPaperForExport, siteUrl } from "@/lib/paper-export";

/** The paper's details, abstract and AI summary (with translations) as an editable Word document. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const loaded = await loadPaperForExport(decodeParam((await ctx.params).id));
  if (!loaded) return new Response("Paper not found", { status: 404 });
  const { paper, summary } = loaded;
  const link = `${siteUrl()}/paper/${encodeURIComponent(paper.id)}`;

  const p = (text: string, opts: { size?: number; italics?: boolean; color?: string; bold?: boolean } = {}) =>
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: opts.size, italics: opts.italics, color: opts.color, bold: opts.bold })] });
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });

  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "SciRah · Paper summary", color: "D9461E", size: 18 })] }),
    new Paragraph({ text: paper.title, heading: HeadingLevel.TITLE, spacing: { after: 160 } }),
    p(paper.authors.map((a) => a.name).join(", ")),
    p(
      [paper.venue, paper.publisher, paper.publishedDate ?? paper.year, paper.citationCount !== undefined ? `${paper.citationCount} citations` : null]
        .filter(Boolean)
        .join(" · "),
      { italics: true, color: "5A6670" },
    ),
  ];
  if (paper.ids.doi) children.push(p(`DOI: ${paper.ids.doi}`, { size: 18 }));

  if (summary) {
    children.push(heading("AI summary"), p(summary.summaryEn));
    for (const l of SUMMARY_LANGS) {
      const text = l.code === "en" ? undefined : summary.translations[l.code];
      if (!text) continue;
      const rtl = l.dir === "rtl";
      children.push(
        new Paragraph({ children: [new TextRun({ text: l.label, bold: true, color: "5A6670", size: 20 })], spacing: { before: 160, after: 60 } }),
        new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { after: 120 },
          children: [new TextRun({ text, rightToLeft: rtl })],
        }),
      );
    }
    children.push(p(AI_DISCLAIMER, { size: 18, italics: true, color: "7A848C" }));
  }

  if (paper.abstract) children.push(heading("Abstract"), ...paper.abstract.split(/\n+/).map((t) => p(t)));
  children.push(heading("How to cite (APA)"), p(apaCitation(paper)));
  children.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [
        new TextRun({ text: "Exported from SciRah — ", size: 18, color: "7A848C" }),
        new ExternalHyperlink({ link, children: [new TextRun({ text: link, size: 18, style: "Hyperlink" })] }),
      ],
    }),
  );

  const doc = new Document({
    creator: "SciRah",
    title: paper.title,
    description: "Paper summary exported from SciRah",
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(doc);
  const name = paper.title.slice(0, 60).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "paper";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="scirah-${name}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
