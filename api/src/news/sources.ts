import { createHash } from 'node:crypto';
import { decodeEntities, fetchText, stripTags } from '../common/http.js';

export type NewsRegion = 'pk' | 'world';
export type NewsSpan = '24h' | '7d' | '30d';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  domain?: string;
  publishedAt: string; // ISO
  imageUrl?: string;
  snippet?: string;
  country?: string;
  provider: 'gdelt' | 'googlenews';
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

export const newsId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16);

/** Normalised headline used to merge the same story from different providers. */
export const titleKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/\s[-–|]\s[^-–|]+$/, '') // trailing " - Source"
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 90);

// ---- GDELT DOC 2.0 (free, no key; asks for at most one request every ~5 seconds) ----

let gdeltNext = 0;
async function gdeltSlot(maxWaitMs: number): Promise<boolean> {
  const now = Date.now();
  const at = Math.max(now, gdeltNext);
  if (at - now > maxWaitMs) return false;
  gdeltNext = at + 5_500;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return true;
}

function gdeltQuery(q: string, region: NewsRegion) {
  // GDELT rejects very short words and some punctuation; keep plain terms.
  const terms = q
    .replace(/["()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);
  if (!terms.length) return null;
  const core = terms.length > 1 ? `(${terms.join(' ')})` : terms[0];
  return `${core} sourcelang:english${region === 'pk' ? ' sourcecountry:pakistan' : ''}`;
}

const gdeltDate = (s: string) => {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
};

export async function gdelt(q: string, region: NewsRegion, span: NewsSpan, max = 30): Promise<NewsItem[]> {
  const query = gdeltQuery(q, region);
  if (!query) return [];
  if (!(await gdeltSlot(6_000))) throw new Error('GDELT busy (rate limit)');
  const params = new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: String(max), sort: 'datedesc', timespan: span });
  const raw = await fetchText(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { timeoutMs: 12_000 });
  let data: { articles?: { url: string; title: string; seendate: string; socialimage?: string; domain?: string; sourcecountry?: string }[] };
  try {
    data = JSON.parse(raw);
  } catch {
    // GDELT answers query errors with a plain-text message.
    throw new Error(`GDELT: ${raw.slice(0, 120)}`);
  }
  return (data.articles ?? [])
    .filter((a) => a.url && a.title)
    .map((a) => ({
      id: newsId(a.url),
      title: decodeEntities(a.title).trim(),
      url: a.url,
      source: a.domain ?? hostOf(a.url),
      domain: a.domain,
      publishedAt: gdeltDate(a.seendate),
      imageUrl: a.socialimage || undefined,
      country: a.sourcecountry || undefined,
      provider: 'gdelt' as const,
    }));
}

// ---- Google News RSS search (free, no key) ----

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return undefined;
  return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

export async function googleNews(q: string, region: NewsRegion, span: NewsSpan, max = 30): Promise<NewsItem[]> {
  const when = span === '24h' ? '1d' : span;
  const locale = region === 'pk' ? { hl: 'en-PK', gl: 'PK', ceid: 'PK:en' } : { hl: 'en-US', gl: 'US', ceid: 'US:en' };
  const params = new URLSearchParams({ q: `${q} when:${when}`, ...locale });
  const xml = await fetchText(`https://news.google.com/rss/search?${params}`, { timeoutMs: 10_000 });
  const items = xml.split(/<item>/i).slice(1, max + 1);
  const out: NewsItem[] = [];
  for (const raw of items) {
    const body = raw.split(/<\/item>/i)[0];
    const link = tag(body, 'link');
    const titleRaw = tag(body, 'title');
    if (!link || !titleRaw) continue;
    const source = tag(body, 'source');
    const sourceUrl = body.match(/<source\s+url="([^"]+)"/i)?.[1];
    let title = decodeEntities(titleRaw);
    if (source && title.endsWith(` - ${decodeEntities(source)}`)) title = title.slice(0, -(source.length + 3));
    const pub = tag(body, 'pubDate');
    const date = pub ? new Date(pub) : new Date();
    out.push({
      id: newsId(link),
      title: title.trim(),
      url: decodeEntities(link),
      source: source ? decodeEntities(source) : 'Google News',
      domain: sourceUrl ? hostOf(sourceUrl) : undefined,
      publishedAt: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      snippet: stripTags(decodeEntities(tag(body, 'description') ?? ''))?.replace(/\u00a0/g, ' ').slice(0, 280),
      provider: 'googlenews',
    });
  }
  return out;
}
