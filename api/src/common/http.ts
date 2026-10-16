import { config } from '../config.js';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const USER_AGENT = `SciRah/1.0 (research discovery; ${config.contactEmail ? 'mailto:' + config.contactEmail : 'no-contact'})`;

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

async function doFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 8000, headers, ...rest } = opts;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(headers as Record<string, string>) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = err as Error;
    throw new UpstreamError(e.name === 'TimeoutError' ? `Timed out: ${hostOf(url)}` : `${hostOf(url)}: ${e.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new UpstreamError(`${hostOf(url)} responded ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return res;
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await doFetch(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await doFetch(url, { ...opts, headers: { Accept: '*/*', ...(opts?.headers as Record<string, string>) } });
  return res.text();
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** Strip XML/HTML tags (JATS abstracts from CrossRef, PubMed markup) and decode common entities. */
export function stripTags(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const text = decodeEntities(input.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/^\s*(abstract|summary)[:.]?\s+/i, '')
    .trim();
  return text || undefined;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}
