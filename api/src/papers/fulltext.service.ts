import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { CacheService } from '../common/cache.service.js';
import { fetchJson, fetchText, qs } from '../common/http.js';
import { assertPublicUrl, safeFetch } from '../common/safe-url.js';
import { config } from '../config.js';
import { PapersService } from './papers.service.js';
import type { Paper } from './types.js';

/** How the full paper can be read inside SciRah. */
export type FullText =
  | { kind: 'article'; pmcid: string; source: 'Europe PMC' }
  | { kind: 'pdf'; url: string; source: string }
  | { kind: 'page'; url: string; source: string }
  | { kind: 'none'; reason: string };

export interface FullArticle {
  pmcid: string;
  title: string;
  abstractHtml: string;
  sections: { title: string; html: string }[];
  references: string[];
  license?: string;
  sourceUrl: string;
  /** PDF of the same article in NCBI's public open-access bucket, when available. */
  pdfUrl?: string;
}

/** NCBI publishes every open-access PMC article (XML, PDF, figure images) in a free public AWS bucket. */
const PMC_BUCKET = 'https://pmc-oa-opendata.s3.amazonaws.com';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 SciRah-Reader';
// Hosts that block server downloads (they answer with a "checking your browser" page) — their papers are read via Europe PMC instead.
const SKIP_PDF_HOSTS = /(^|\.)(ncbi\.nlm\.nih\.gov|europepmc\.org)$/i;
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

/**
 * Finds the best way to read a paper in full inside SciRah:
 *   1. the complete open-access article text from Europe PMC (rendered as a SciRah page),
 *   2. otherwise a free PDF that really downloads (shown in SciRah's PDF reader),
 *   3. otherwise the open-access landing page (SciRah's reader),
 *   4. otherwise nothing — the paper is subscription-only.
 */
@Injectable()
export class FullTextService {
  private readonly logger = new Logger(FullTextService.name);

  constructor(
    private readonly papers: PapersService,
    private readonly cache: CacheService,
  ) {}

  resolve(id: string): Promise<FullText> {
    return this.cache.wrap(`fulltext:v1:${id}`, 12 * 3600, () => this.find(id));
  }

  private async find(id: string): Promise<FullText> {
    const paper = await this.papers.getPaper(id);
    const [locations, epmc] = await Promise.all([this.openAlexPdfs(paper), this.europePmc(paper)]);
    if (epmc) return { kind: 'article', pmcid: epmc, source: 'Europe PMC' };

    const pdfs = [...new Set([paper.pdfUrl, ...locations].filter((u): u is string => !!u))].filter((u) => !SKIP_PDF_HOSTS.test(host(u)));
    for (const url of pdfs.slice(0, 5)) {
      if (await this.isPdf(url)) return { kind: 'pdf', url, source: host(url) };
    }
    if (paper.isOpenAccess && paper.oaUrl && !SKIP_PDF_HOSTS.test(host(paper.oaUrl))) return { kind: 'page', url: paper.oaUrl, source: host(paper.oaUrl) };
    return {
      kind: 'none',
      reason: paper.isOpenAccess
        ? 'This paper is open access, but its free copy could not be loaded right now.'
        : 'This paper is not open access — the full text is only available from the publisher (often through a university subscription).',
    };
  }

  /** Every PDF link OpenAlex knows for the work (publisher + repositories). */
  private async openAlexPdfs(paper: Paper): Promise<string[]> {
    if (!paper.ids.openalex) return [];
    type Loc = { pdf_url?: string | null; is_oa?: boolean };
    const w = await fetchJson<{ best_oa_location?: Loc | null; locations?: Loc[] }>(
      `https://api.openalex.org/works/${paper.ids.openalex}?${qs({ select: 'best_oa_location,locations', mailto: config.contactEmail, api_key: config.openAlexApiKey })}`,
    ).catch(() => null);
    if (!w) return [];
    return [w.best_oa_location, ...(w.locations ?? [])].filter((l): l is Loc => !!l?.pdf_url && l.is_oa !== false).map((l) => l.pdf_url!);
  }

  /** PMCID of the paper if Europe PMC has its full text in the open-access subset. */
  private async europePmc(paper: Paper): Promise<string | null> {
    const query = paper.ids.doi ? `DOI:"${paper.ids.doi}"` : paper.ids.pmid ? `EXT_ID:${paper.ids.pmid} AND SRC:MED` : null;
    if (!query) return null;
    type Hit = { pmcid?: string; isOpenAccess?: string; inEPMC?: string };
    const r = await fetchJson<{ resultList?: { result?: Hit[] } }>(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${qs({ query, format: 'json', resultType: 'lite', pageSize: 3 })}`,
    ).catch(() => null);
    const hit = r?.resultList?.result?.find((h) => h.pmcid && h.isOpenAccess === 'Y' && h.inEPMC === 'Y');
    return hit?.pmcid ?? null;
  }

  private async isPdf(url: string): Promise<boolean> {
    try {
      const start = await assertPublicUrl(url);
      const { res } = await safeFetch(start, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*', Range: 'bytes=0-1023' }, timeoutMs: 12_000 });
      if (!res.ok || !res.body) return false;
      const reader = res.body.getReader();
      const { value } = await reader.read();
      await reader.cancel().catch(() => undefined);
      return !!value && Buffer.from(value).subarray(0, 5).toString() === '%PDF-';
    } catch {
      return false;
    }
  }

  /** Latest version folder of a PMC article in the public bucket (figures load from there). */
  private async pmcBucketFiles(pmcid: string): Promise<{ base?: string; pdf?: string }> {
    const xml = await fetchText(`${PMC_BUCKET}/?${qs({ 'list-type': 2, prefix: `${pmcid}.`, 'max-keys': 1000 })}`, { timeoutMs: 15_000 }).catch(() => '');
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    const versions = [...new Set(keys.map((k) => k.split('/')[0]))].sort((a, b) => Number(b.split('.')[1]) - Number(a.split('.')[1]));
    const v = versions[0];
    if (!v) return {};
    const pdf = keys.find((k) => k === `${v}/${v}.pdf`);
    return { base: `${PMC_BUCKET}/${v}/`, pdf: pdf ? `${PMC_BUCKET}/${pdf}` : undefined };
  }

  // ---------------------------------------------------------------------------
  // Europe PMC article (JATS XML) → safe HTML built from an allow-list of tags.
  // ---------------------------------------------------------------------------

  article(pmcid: string): Promise<FullArticle> {
    if (!/^PMC\d{3,10}$/i.test(pmcid)) throw new NotFoundException('Unknown article');
    const id = pmcid.toUpperCase();
    return this.cache.wrap(`fulltext:article:v1:${id}`, 24 * 3600, async () => {
      const [xml, files] = await Promise.all([
        fetchText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/fullTextXML`, { timeoutMs: 20_000 }).catch(() => null),
        this.pmcBucketFiles(id),
      ]);
      if (!xml || !xml.includes('<article')) throw new NotFoundException('The full text is not available from Europe PMC');
      const article = jatsToArticle(id, xml, files.base);
      if (files.pdf) article.pdfUrl = files.pdf;
      return article;
    });
  }
}

type Node = Record<string, unknown> & { ':@'?: Record<string, string> };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ':@')!;
const kids = (n: Node) => (n[tagOf(n)] as Node[]) ?? [];
const attr = (n: Node, a: string) => n[':@']?.[`@_${a}`];

function find(nodes: Node[], tag: string): Node | undefined {
  for (const n of nodes) {
    const t = tagOf(n);
    if (t === tag) return n;
    if (t !== '#text') {
      const hit = find(kids(n), tag);
      if (hit) return hit;
    }
  }
  return undefined;
}

function text(nodes: Node[]): string {
  return nodes
    .map((n) => (tagOf(n) === '#text' ? String(n['#text']) : text(kids(n))))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Ctx {
  pmcid: string;
  /** Where figure images are served from. */
  figureBase: string;
}

const INLINE: Record<string, string> = { italic: 'em', bold: 'strong', sub: 'sub', sup: 'sup', underline: 'u', sc: 'span', monospace: 'code' };

function html(nodes: Node[], ctx: Ctx, depth = 2): string {
  let out = '';
  for (const n of nodes) {
    const t = tagOf(n);
    if (t === '#text') {
      out += esc(String(n['#text']));
      continue;
    }
    const c = kids(n);
    if (INLINE[t]) out += `<${INLINE[t]}>${html(c, ctx, depth)}</${INLINE[t]}>`;
    else if (t === 'p') out += `<p>${html(c, ctx, depth)}</p>`;
    else if (t === 'sec') {
      const title = c.find((x) => tagOf(x) === 'title');
      const h = Math.min(depth, 4);
      out += `<section>${title ? `<h${h}>${esc(text(kids(title)))}</h${h}>` : ''}${html(
        c.filter((x) => tagOf(x) !== 'title'),
        ctx,
        depth + 1,
      )}</section>`;
    } else if (t === 'list') {
      const ordered = attr(n, 'list-type') === 'order';
      out += `<${ordered ? 'ol' : 'ul'}>${html(c, ctx, depth)}</${ordered ? 'ol' : 'ul'}>`;
    } else if (t === 'list-item') out += `<li>${html(c, ctx, depth)}</li>`;
    else if (t === 'fig') {
      const label = find(c, 'label');
      const caption = find(c, 'caption');
      const graphic = find(c, 'graphic');
      const href = graphic ? attr(graphic, 'xlink:href') : undefined;
      const src = href ? `${ctx.figureBase}${encodeURIComponent(href)}${/\.\w{3,4}$/.test(href) ? '' : '.jpg'}` : '';
      out += `<figure>${src ? `<img src="${esc(src)}" alt="${esc(label ? text(kids(label)) : 'Figure')}" loading="lazy">` : ''}<figcaption>${
        label ? `<strong>${esc(text(kids(label)))}</strong> ` : ''
      }${caption ? html(kids(caption), ctx, depth) : ''}</figcaption></figure>`;
    } else if (t === 'table-wrap') {
      const label = find(c, 'label');
      const caption = find(c, 'caption');
      const table = find(c, 'table');
      out += `<figure class="table"><figcaption>${label ? `<strong>${esc(text(kids(label)))}</strong> ` : ''}${
        caption ? html(kids(caption), ctx, depth) : ''
      }</figcaption>${table ? `<div class="table-scroll">${tableHtml(table, ctx)}</div>` : ''}</figure>`;
    } else if (t === 'disp-formula' || t === 'inline-formula') {
      const tex = find(c, 'tex-math');
      out += `<code class="formula">${esc(tex ? text(kids(tex)) : text(c))}</code>`;
    } else if (t === 'title' || t === 'label' || t === 'graphic' || t === 'alternatives' || t === 'object-id' || t === 'ref-list') continue;
    else out += html(c, ctx, depth); // xref, ext-link, named-content… → their text only (no outside links)
  }
  return out;
}

function tableHtml(table: Node, ctx: Ctx): string {
  const cell = (n: Node): string => {
    const t = tagOf(n);
    if (t === 'thead' || t === 'tbody' || t === 'tfoot') return `<${t}>${kids(n).map(cell).join('')}</${t}>`;
    if (t === 'tr') return `<tr>${kids(n).map(cell).join('')}</tr>`;
    if (t === 'th' || t === 'td') {
      const span = (a: string) => (/^\d{1,2}$/.test(attr(n, a) ?? '') ? ` ${a}="${attr(n, a)}"` : '');
      return `<${t}${span('colspan')}${span('rowspan')}>${html(kids(n), ctx)}</${t}>`;
    }
    return kids(n).map(cell).join('');
  };
  return `<table>${kids(table).map(cell).join('')}</table>`;
}

export function jatsToArticle(pmcid: string, xml: string, figureBase = `https://europepmc.org/articles/${pmcid}/bin/`): FullArticle {
  const ctx: Ctx = { pmcid, figureBase };
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, processEntities: true });
  const doc = parser.parse(xml) as Node[];
  const article = find(doc, 'article');
  if (!article) throw new NotFoundException('Unreadable article');
  const front = find(kids(article), 'front');
  const body = find(kids(article), 'body');
  const back = find(kids(article), 'back');
  const titleNode = front && find(kids(front), 'article-title');
  const abstract = front && find(kids(front), 'abstract');
  const license = front && find(kids(front), 'license');

  const bodyKids = body ? kids(body) : [];
  const secs = bodyKids.filter((n) => tagOf(n) === 'sec');
  const loose = bodyKids.filter((n) => tagOf(n) !== 'sec' && tagOf(n) !== '#text');
  const sections = [
    ...(loose.length ? [{ title: '', html: html(loose, ctx) }] : []),
    ...secs.map((s) => {
      const t = kids(s).find((x) => tagOf(x) === 'title');
      return { title: t ? text(kids(t)) : '', html: html(kids(s).filter((x) => tagOf(x) !== 'title'), ctx, 3) };
    }),
  ];
  const refList = back && find(kids(back), 'ref-list');
  const references = refList
    ? kids(refList)
        .filter((n) => tagOf(n) === 'ref')
        .map((r) => text(kids(r)))
        .filter(Boolean)
        .slice(0, 400)
    : [];

  return {
    pmcid,
    title: titleNode ? text(kids(titleNode)) : '',
    abstractHtml: abstract ? html(kids(abstract).filter((x) => tagOf(x) !== 'title'), ctx, 3) : '',
    sections,
    references,
    license: license ? text(kids(license)).slice(0, 600) : undefined,
    sourceUrl: `https://europepmc.org/article/PMC/${pmcid}`,
  };
}
