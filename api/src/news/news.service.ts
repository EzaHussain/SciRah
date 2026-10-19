import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { fetchText } from '../common/http.js';
import { FeedService } from '../feed/feed.service.js';
import { PapersService } from '../papers/papers.service.js';
import { normalizeDoi } from '../papers/types.js';
import {
  gdelt,
  googleNews,
  matchResearchNews,
  scienceDailyPool,
  titleKey,
  type NewsItem,
  type NewsRegion,
  type NewsSpan,
} from './sources.js';

export interface NewsResult {
  query: string;
  region: NewsRegion;
  span: NewsSpan;
  /** Research news: stories about newly published papers (ScienceDaily). */
  items: (NewsItem & { topic?: string })[];
  /** General press coverage of the topic (Google News + GDELT) — only on the News page. */
  press: NewsItem[];
  providers: { name: string; ok: boolean; count: number; error?: string }[];
}

export const SPANS: NewsSpan[] = ['24h', '7d', '30d'];
const SPAN_MS: Record<NewsSpan, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: DbService,
    private readonly feed: FeedService,
    private readonly papers: PapersService,
  ) {}

  /** All recent research stories (refreshed hourly). */
  researchPool(): Promise<NewsItem[]> {
    return this.cache.wrap('news:research:pool:v1', 60 * 60, () => scienceDailyPool());
  }

  private async research(query: string, span: NewsSpan): Promise<NewsItem[]> {
    const cutoff = new Date(Date.now() - SPAN_MS[span]).toISOString();
    const pool = await this.researchPool();
    return matchResearchNews(pool, query).filter((it) => it.publishedAt >= cutoff);
  }

  /**
   * News about one topic: research stories first; with `fast` (alerts, home page) only those.
   * Otherwise also general press coverage from Google News + GDELT (GDELT allows ~1 request / 5 s).
   */
  async search(q: string, region: NewsRegion = 'world', span: NewsSpan = '7d', limit = 30, fast = false): Promise<NewsResult> {
    const query = q.trim().slice(0, 120);
    const key = `news:v2:${fast ? 'fast' : 'full'}:${region}:${span}:${query.toLowerCase()}`;
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
      const [research, gn, g] = await Promise.all([
        run('ScienceDaily', () => this.research(query, span)),
        fast ? Promise.resolve([] as NewsItem[]) : run('Google News', () => googleNews(query, region, span, 40)),
        fast ? Promise.resolve([] as NewsItem[]) : run('GDELT', () => gdelt(query, region, span, 40)),
      ]);
      const result: NewsResult = { query, region, span, items: research.slice(0, limit), press: mergeNews([...gn, ...g]).slice(0, limit), providers };
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

  /**
   * "For you": research stories on the user's topics, interleaved so one topic can't crowd out the rest,
   * topped up with the latest research news. Only stories about published research — no general news.
   */
  async forYou(userId: string | null, _region: NewsRegion, span: NewsSpan) {
    const personal = userId ? await this.topicsFor(userId).catch(() => []) : [];
    const pool = await this.researchPool().catch(() => [] as NewsItem[]);
    const cutoff = new Date(Date.now() - SPAN_MS[span === '24h' ? '7d' : span]).toISOString();
    const recent = pool.filter((it) => it.publishedAt >= cutoff);

    const seen = new Set<string>();
    const items: NewsResult['items'] = [];
    const add = (it: NewsItem, topic?: string) => {
      const k = titleKey(it.title);
      if (seen.has(k)) return;
      seen.add(k);
      items.push({ ...it, topic });
    };
    const perTopic = personal.map((t) => ({ t, list: matchResearchNews(recent, t) }));
    for (let i = 0; i < 12; i++) for (const { t, list } of perTopic) if (list[i]) add(list[i], t);
    const matched = items.length;
    for (const it of recent) {
      if (items.length >= 40) break;
      add(it);
    }
    return { personalized: matched > 0, topics: personal, items: items.slice(0, 40) };
  }

  /**
   * The research paper a ScienceDaily story is about (its "Journal Reference" DOI), resolved to a SciRah
   * paper so readers can open the actual study.
   */
  async paperForStory(url: unknown) {
    if (typeof url !== 'string' || !/^https:\/\/(www\.)?sciencedaily\.com\/releases\/[\w/.-]+$/i.test(url)) throw new BadRequestException('Unsupported story link');
    return this.cache.wrap(`news:story-paper:v1:${url}`, 7 * 86_400, async () => {
      const html = await fetchText(url, { timeoutMs: 15_000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SciRah/1.0)' } }).catch(() => '');
      const doi = normalizeDoi(html.match(/doi\.org\/(10\.\d{4,9}\/[^\s"<>&]+)/i)?.[1] ?? html.match(/DOI:\s*(10\.\d{4,9}\/[^\s"<>&]+)/i)?.[1]);
      if (!doi) return { doi: null, paperId: null, title: null, venue: null };
      const paper = await this.papers.getPaper(`doi:${doi.replace(/[.,;)]+$/, '')}`).catch(() => null);
      return { doi, paperId: paper?.id ?? `doi:${doi}`, title: paper?.title ?? null, venue: paper?.venue ?? null };
    });
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
