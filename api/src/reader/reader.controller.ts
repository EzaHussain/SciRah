import { Controller, Get, HttpException, HttpStatus, Logger, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { Readable, Transform } from 'node:stream';
import { ClientIp } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { assertPublicUrl, safeFetch } from '../common/safe-url.js';
import { config } from '../config.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 SciRah-Reader';
const MAX_PDF_BYTES = 60 * 1024 * 1024;

export interface ReaderInfo {
  url: string;
  finalUrl: string;
  kind: 'pdf' | 'html' | 'other';
  /** Whether the page can be shown inside SciRah (PDFs always can, through /reader/pdf). */
  embeddable: boolean;
  title?: string;
  reason?: string;
}

/** Can a page with these headers be shown in an iframe on SciRah? */
function frameable(headers: Headers): { ok: boolean; reason?: string } {
  const xfo = headers.get('x-frame-options')?.toLowerCase();
  if (xfo && (xfo.includes('deny') || xfo.includes('sameorigin')))
    return { ok: false, reason: 'This website does not allow itself to be shown inside other sites.' };
  const csp = headers.get('content-security-policy') ?? '';
  const fa = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (fa) {
    const sources = fa.split(/\s+/).slice(1);
    const ours = config.webOrigins.map((o) => new URL(o).host);
    const allowed = sources.some((s) => s === '*' || ours.some((h) => s.replace(/^https?:\/\//, '') === h || (s.startsWith('*.') && h.endsWith(s.slice(1)))));
    if (!allowed) return { ok: false, reason: 'This website does not allow itself to be shown inside other sites.' };
  }
  return { ok: true };
}

const isPdf = (type: string, url: URL) => type.includes('application/pdf') || (type.includes('octet-stream') && /\.pdf$/i.test(url.pathname));

/**
 * SciRah's in-app reader: everything a user opens stays on SciRah. Publisher pages are shown in a
 * frame when the site allows it; open-access PDFs are streamed through here (never stored).
 */
@Controller('reader')
export class ReaderController {
  private readonly logger = new Logger(ReaderController.name);

  constructor(private readonly cache: CacheService) {}

  private async throttle(key: string, max: number) {
    const n = await this.cache.incr(key, 3600);
    if (n > max) throw new HttpException('Too many requests — please slow down a little.', HttpStatus.TOO_MANY_REQUESTS);
  }

  @Get('inspect')
  async inspect(@Query('url') raw: string | undefined, @ClientIp() ip: string): Promise<ReaderInfo> {
    const start = await assertPublicUrl(raw);
    return this.cache.wrap(`reader:inspect:${start.href}`, 3600, async () => {
      await this.throttle(`rl:reader:inspect:${ip}`, 300);
      try {
        const { res, url } = await safeFetch(start, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/pdf,*/*' } });
        const type = res.headers.get('content-type')?.toLowerCase() ?? '';
        const base = { url: start.href, finalUrl: url.href };
        if (isPdf(type, url)) {
          await res.body?.cancel().catch(() => undefined);
          return { ...base, kind: 'pdf', embeddable: true } satisfies ReaderInfo;
        }
        if (!type.includes('html')) {
          await res.body?.cancel().catch(() => undefined);
          return { ...base, kind: 'other', embeddable: false, reason: 'This link is a file SciRah cannot display.' } satisfies ReaderInfo;
        }
        const head = await readStart(res, 96 * 1024);
        const title = head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
        if (res.status >= 400)
          return { ...base, kind: 'html', embeddable: false, title, reason: 'This website blocked SciRah from checking it.' } satisfies ReaderInfo;
        const f = frameable(res.headers);
        return { ...base, kind: 'html', embeddable: f.ok, title, reason: f.reason } satisfies ReaderInfo;
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.logger.warn(`inspect ${start.href}: ${(e as Error).message}`);
        return { url: start.href, finalUrl: start.href, kind: 'html', embeddable: false, reason: 'This website could not be reached.' } satisfies ReaderInfo;
      }
    });
  }

  /** Streams an open-access PDF so the browser's PDF viewer can show it inside SciRah. */
  @Get('pdf')
  async pdf(@Query('url') raw: string | undefined, @ClientIp() ip: string, @Res({ passthrough: true }) out: ExpressResponse) {
    const start = await assertPublicUrl(raw);
    await this.throttle(`rl:reader:pdf:${ip}`, 120);
    const { res, url } = await safeFetch(start, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' }, timeoutMs: 30_000 }).catch(
      (e: Error) => {
        if (e instanceof HttpException) throw e;
        throw new HttpException('The PDF could not be downloaded from its source.', HttpStatus.BAD_GATEWAY);
      },
    );
    const type = res.headers.get('content-type')?.toLowerCase() ?? '';
    if (!res.ok || !res.body || !isPdf(type, url)) {
      await res.body?.cancel().catch(() => undefined);
      throw new HttpException('This link is not a PDF that SciRah can show.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_PDF_BYTES) {
      await res.body.cancel().catch(() => undefined);
      throw new HttpException('This PDF is too large to show in SciRah.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    let seen = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        cb(seen > MAX_PDF_BYTES ? new Error('PDF too large') : null, chunk);
      },
    });
    const name = (url.pathname.split('/').pop() || 'paper').replace(/[^\w.-]+/g, '_').slice(0, 80);
    out.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name.endsWith('.pdf') ? name : `${name}.pdf`}"`,
      'Cache-Control': 'public, max-age=86400',
      ...(length ? { 'Content-Length': String(length) } : {}),
    });
    return new StreamableFile(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(limit));
  }
}

async function readStart(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString('utf8');
}
