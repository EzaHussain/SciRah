import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { FeedService } from '../feed/feed.service.js';
import { gdelt, googleNews, titleKey, type NewsItem, type NewsRegion, type NewsSpan } from './sources.js';

export interface NewsResult {
  query: string;
  region: NewsRegion;
  span: NewsSpan;
  items: (NewsItem & { topic?: string })[];
  providers: { name: string; ok: boolean; count: number; error?: string }[];
}

export const SPANS: NewsSpan[] = ['24h', '7d', '30d'];

/** Used for signed-out visitors and users with no history yet. */
const DEFAULT_TOPICS = ['scientific research study', 'university research Pakistan', 'climate health study'];

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: DbService,
    private readonly feed: FeedService,
  ) {}

  /**
   * News about one topic from Google News (+ GDELT unless `fast`), merged and de-duplicated, newest first.
   * GDELT asks for at most one request every ~5 seconds, so multi-topic views use `fast`.
   */
  async search(q: string, region: NewsRegion = 'world', span: NewsSpan = '7d', limit = 30, fast = false): Promise<NewsResult> {
    const query = q.trim().slice(0, 120);
    const key = `news:v1:${fast ? 'fast' : 'full'}:${region}:${span}:${query.toLowerCase()}`;
    const cached = await this.cache.get<NewsResult>(key);
    if (cached) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const job = (async () => {
      const providers: NewsResult['providers'] = [];
      const run = async (name: string, fn: () => Promise<NewsItem[]>) => {
        try {
          const items = await fn();
          providers.push({ name, ok: true, count: items.length });
          return items;
        } catch (e) {
          const error = (e as Error).message.slice(0, 160);
          this.logger.warn(`${name} failed for "${query}": ${error}`);
          providers.push({ name, ok: false, count: 0, error });
          return [];
        }
      };
      const [gn, g] = await Promise.all([
        run('Google News', () => googleNews(query, region, span, 40)),
        fast ? Promise.resolve([] as NewsItem[]) : run('GDELT', () => gdelt(query, region, span, 40)),
      ]);
      const result: NewsResult = { query, region, span, items: mergeNews([...gn, ...g]).slice(0, limit), providers };
      // Cache good answers for 20 minutes; partial failures only briefly so they're retried soon.
      await this.cache.set(key, result, providers.every((p) => p.ok) ? 20 * 60 : 3 * 60);
      return result;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private inflight = new Map<string, Promise<NewsResult>>();

  /** Topics that describe what this user is researching: alerts / recent searches, then saved-paper fields. */
  async topicsFor(userId: string, max = 5): Promise<string[]> {
    if (!this.db.enabled) return [];
    const rows = await this.db.query<{ query: string }>(
      `select query from alerts where user_id = $1 and enabled and news and mode <> 'author'
       order by (source = 'manual') desc, updated_at desc limit $2`,
      [userId, max],
    );
    const topics = rows.map((r) => r.query);
    if (topics.length < max) {
      const recent = await this.db.query<{ query: string }>(
        `select query from (select distinct on (lower(query)) query, created_at from search_history
           where user_id = $1 and mode <> 'author' order by lower(query), created_at desc) s
         order by created_at desc limit $2`,
        [userId, max],
      );
      for (const r of recent) if (!topics.some((t) => t.toLowerCase() === r.query.toLowerCase())) topics.push(r.query);
    }
    if (topics.length < max) topics.push(...(await this.feed.savedSubfieldNames(userId, max - topics.length)));
    return topics.slice(0, max);
  }

  /** "For you": news across the user's topics, interleaved so one topic can't crowd out the rest. */
  async forYou(userId: string | null, region: NewsRegion, span: NewsSpan) {
    const personal = userId ? await this.topicsFor(userId).catch(() => []) : [];
    const topics = personal.length ? personal : DEFAULT_TOPICS;
    const results = await Promise.all(topics.map((t) => this.search(t, region, span, 12, true)));
    const seen = new Set<string>();
    const items: NewsResult['items'] = [];
    for (let i = 0; i < 12; i++) {
      for (const r of results) {
        const it = r.items[i];
        if (!it) continue;
        const k = titleKey(it.title);
        if (seen.has(k)) continue;
        seen.add(k);
        items.push({ ...it, topic: r.query });
      }
    }
    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return { personalized: personal.length > 0, topics, region, span, items: items.slice(0, 60) };
  }
}

export function mergeNews(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  for (const it of items) {
    // Google News descriptions usually just repeat the headline.
    if (it.snippet && titleKey(it.snippet).startsWith(titleKey(it.title).slice(0, 40))) it.snippet = undefined;
    const k = titleKey(it.title);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, it);
    else byKey.set(k, { ...prev, imageUrl: prev.imageUrl ?? it.imageUrl, snippet: prev.snippet ?? it.snippet });
  }
  return [...byKey.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
