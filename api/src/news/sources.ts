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
  provider: 'gdelt' | 'googlenews' | 'sciencedaily';
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

// ---- ScienceDaily: news about newly published research (each story is based on one paper) ----

const SCIENCEDAILY_FEEDS = [
  'all',
  'top',
  'top/science',
  'top/health',
  'top/technology',
  'top/environment',
  'top/society',
  'health_medicine',
  'mind_brain',
  'plants_animals',
  'earth_climate',
  'space_time',
  'matter_energy',
  'computers_math',
  'fossils_ruins',
  'science_society',
];

async function scienceDailyFeed(feed: string): Promise<NewsItem[]> {
  const xml = await fetchText(`https://www.sciencedaily.com/rss/${feed}.xml`, { timeoutMs: 15_000 });
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag: string) => block.match(new RegExp(String.raw`<${tag}>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</${tag}>`))?.[1]?.trim();
    const url = pick('link');
    const title = pick('title');
    if (!url || !title) continue;
    const date = pick('pubDate');
    items.push({
      id: newsId(url),
      title: decodeEntities(stripTags(title) ?? title),
      url,
      source: 'ScienceDaily',
      domain: 'sciencedaily.com',
      publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString(),
      snippet: stripTags(decodeEntities(pick('description') ?? '')),
      provider: 'sciencedaily',
    });
  }
  return items;
}

/** Recent research news across all ScienceDaily subjects, de-duplicated, newest first. */
export async function scienceDailyPool(): Promise<NewsItem[]> {
  const settled = await Promise.allSettled(SCIENCEDAILY_FEEDS.map(scienceDailyFeed));
  const byUrl = new Map<string, NewsItem>();
  for (const r of settled) if (r.status === 'fulfilled') for (const it of r.value) if (!byUrl.has(it.url)) byUrl.set(it.url, it);
  if (!byUrl.size) {
    const failed = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw new Error(`ScienceDaily unavailable: ${(failed?.reason as Error)?.message ?? 'no items'}`);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'study', 'studies', 'research', 'based', 'work', 'new', 'using', 'effect', 'effects', 'role', 'pakistan']);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));

/** Research stories about a topic: most of the topic's words must appear, with title matches ranked first. */
export function matchResearchNews(pool: NewsItem[], topic: string): NewsItem[] {
  const q = [...new Set(words(topic))];
  if (!q.length) return [];
  const need = Math.max(1, Math.ceil(q.length * 0.6));
  const scored: { it: NewsItem; s: number }[] = [];
  for (const it of pool) {
    const title = new Set(words(it.title));
    const body = new Set(words(`${it.title} ${it.snippet ?? ''}`));
    const hits = q.filter((w) => body.has(w)).length;
    if (hits < need) continue;
    scored.push({ it, s: hits + q.filter((w) => title.has(w)).length });
  }
  return scored.sort((a, b) => b.s - a.s || b.it.publishedAt.localeCompare(a.it.publishedAt)).map((x) => x.it);
}
