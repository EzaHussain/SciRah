import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { NewsService } from '../news/news.service.js';
import * as openalex from '../papers/sources/openalex.js';
import type { Paper, SearchMode, SearchParams } from '../papers/types.js';

export type AlertFilters = Partial<
  Pick<
    SearchParams,
    | 'openAccess'
    | 'pakistan'
    | 'countries'
    | 'continent'
    | 'globalSouth'
    | 'institution'
    | 'types'
    | 'language'
    | 'field'
    | 'venueType'
    | 'minCitations'
    | 'hasAbstract'
    | 'excludeRetracted'
  >
>;

interface AlertRow {
  id: number;
  user_id: string;
  query: string;
  query_key: string;
  mode: SearchMode;
  filters: AlertFilters;
  source: 'search' | 'manual';
  papers: boolean;
  news: boolean;
  enabled: boolean;
  last_checked_at: Date | null;
  last_hit_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const MODES: SearchMode[] = ['keyword', 'author', 'subject'];
const LOCK_ID = 727_001;
const DAY = 86_400_000;

export const alertKey = (mode: string, q: string) => `${mode}:${q.toLowerCase().replace(/\s+/g, ' ').trim()}`;

/** Only the filters that make sense for "new papers on this topic" (no years/sort/paging). */
export function alertFilters(p: Partial<SearchParams>): AlertFilters {
  const f: AlertFilters = {
    openAccess: p.openAccess || undefined,
    pakistan: p.pakistan || undefined,
    countries: p.countries?.length ? p.countries : undefined,
    continent: p.continent,
    globalSouth: p.globalSouth || undefined,
    institution: p.institution,
    types: p.types?.length ? p.types : undefined,
    language: p.language,
    field: p.field,
    venueType: p.venueType,
    minCitations: p.minCitations,
    hasAbstract: p.hasAbstract || undefined,
    excludeRetracted: p.excludeRetracted || undefined,
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as AlertFilters;
}

function toDto(a: AlertRow & { notification_count?: number }) {
  return {
    id: a.id,
    query: a.query,
    mode: a.mode,
    filters: a.filters,
    source: a.source,
    papers: a.papers,
    news: a.news,
    enabled: a.enabled,
    lastCheckedAt: a.last_checked_at,
    lastHitAt: a.last_hit_at,
    createdAt: a.created_at,
    notificationCount: a.notification_count ?? 0,
  };
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
    private readonly news: NewsService,
  ) {}

  onModuleInit() {
    if (!config.alertsEnabled) return;
    // First run shortly after start-up, then on a fixed interval.
    const first = setTimeout(() => this.runDue().catch(() => undefined), 60_000);
    const every = setInterval(() => this.runDue().catch(() => undefined), config.alertsIntervalMinutes * 60_000);
    first.unref();
    every.unref();
    this.timers.push(first, every);
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  // ---- managing alerts ---------------------------------------------------------------

  /** Called for every signed-in search (page 1): remembers the topic so new work on it can be announced. */
  async trackSearch(userId: string, p: SearchParams) {
    if (!this.db.enabled) return;
    const user = await this.db.one<{ auto_alerts: boolean }>('select auto_alerts from users where id = $1', [userId]);
    if (!user?.auto_alerts) return;
    await this.db.query(
      `insert into alerts (user_id, query, query_key, mode, filters, source) values ($1, $2, $3, $4, $5, 'search')
       on conflict (user_id, query_key) do update set updated_at = now(),
         filters = case when alerts.source = 'search' then excluded.filters else alerts.filters end`,
      [userId, p.q.slice(0, 200), alertKey(p.mode, p.q), p.mode, JSON.stringify(alertFilters(p))],
    );
    // Keep only the most recent automatically-tracked topics.
    await this.db.query(
      `delete from alerts where id in (
         select id from alerts where user_id = $1 and source = 'search' order by updated_at desc offset $2)`,
      [userId, config.maxAutoAlerts],
    );
  }

  async follow(userId: string, input: { query?: unknown; mode?: unknown; filters?: unknown; papers?: unknown; news?: unknown }) {
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 200) : '';
    if (query.length < 2) throw new BadRequestException('Topic must be at least 2 characters');
    const mode: SearchMode = MODES.includes(input.mode as SearchMode) ? (input.mode as SearchMode) : 'keyword';
    const filters = input.filters && typeof input.filters === 'object' ? alertFilters(input.filters as Partial<SearchParams>) : {};
    const count = await this.db.one<{ n: number }>('select count(*)::int as n from alerts where user_id = $1', [userId]);
    if ((count?.n ?? 0) >= 100) throw new BadRequestException('You can follow at most 100 topics. Remove some first.');
    const row = await this.db.one<AlertRow>(
      `insert into alerts (user_id, query, query_key, mode, filters, source, papers, news, enabled)
       values ($1, $2, $3, $4, $5, 'manual', $6, $7, true)
       on conflict (user_id, query_key) do update set source = 'manual', enabled = true, filters = excluded.filters,
         papers = excluded.papers, news = excluded.news, updated_at = now()
       returning *`,
      [userId, query, alertKey(mode, query), mode, JSON.stringify(filters), input.papers !== false, input.news !== false],
    );
    // Check right away so the user sees something soon.
    this.checkAlert(row!).catch(() => undefined);
    return toDto(row!);
  }

  async list(userId: string) {
    const rows = await this.db.query<AlertRow & { notification_count: number }>(
      `select a.*, (select count(*)::int from notifications n where n.alert_id = a.id) as notification_count
       from alerts a where a.user_id = $1
       order by (a.source = 'manual') desc, a.enabled desc, a.updated_at desc`,
      [userId],
    );
    return rows.map(toDto);
  }

  async update(userId: string, id: number, input: { enabled?: unknown; papers?: unknown; news?: unknown }) {
    const sets: string[] = [];
    const vals: unknown[] = [id, userId];
    for (const k of ['enabled', 'papers', 'news'] as const) {
      if (typeof input[k] === 'boolean') {
        vals.push(input[k]);
        sets.push(`${k} = $${vals.length}`);
      }
    }
    // Touching an auto-tracked topic makes it "manual" so it is never pruned.
    sets.push("source = 'manual'", 'updated_at = now()');
    const row = await this.db.one<AlertRow>(`update alerts set ${sets.join(', ')} where id = $1 and user_id = $2 returning *`, vals);
    if (!row) throw new NotFoundException('Alert not found');
    return toDto(row);
  }

  async remove(userId: string, id: number) {
    const rows = await this.db.query('delete from alerts where id = $1 and user_id = $2 returning id', [id, userId]);
    if (!rows.length) throw new NotFoundException('Alert not found');
    return { id, deleted: true };
  }

  // ---- checking for new work -----------------------------------------------------------

  /** Background job: check every enabled topic that hasn't been checked for ALERT_CHECK_HOURS. */
  async runDue() {
    if (!this.db.enabled || this.running) return;
    this.running = true;
    try {
      await this.db.withLock(LOCK_ID, async () => {
        const due = await this.db.query<AlertRow>(
          `select * from alerts where enabled and (papers or news)
             and (last_checked_at is null or last_checked_at < now() - make_interval(hours => $1))
           order by last_checked_at nulls first limit 60`,
          [config.alertCheckHours],
        );
        let created = 0;
        for (const a of due) created += await this.checkAlert(a).catch((e: Error) => (this.logger.warn(`Alert ${a.id}: ${e.message}`), 0));
        await this.db.query("delete from notifications where created_at < now() - interval '120 days'");
        if (due.length) this.logger.log(`Checked ${due.length} alert topic(s), ${created} new notification(s)`);
      });
    } finally {
      this.running = false;
    }
  }

  /** Check one user's topics now (on demand, e.g. when they open notifications). Rate-limited. */
  async checkUser(userId: string, force = false) {
    if (!this.db.enabled) return { checked: 0, created: 0 };
    const n = await this.cache.incr(`ratelimit:alertcheck:${force ? 'manual' : 'auto'}:${userId}`, force ? 60 : 15 * 60);
    if (n > 1) return { checked: 0, created: 0, throttled: true };
    const rows = await this.db.query<AlertRow>(
      `select * from alerts where user_id = $1 and enabled and (papers or news)
         ${force ? '' : 'and (last_checked_at is null or last_checked_at < now() - make_interval(hours => $2))'}
       order by last_checked_at nulls first limit 15`,
      force ? [userId] : [userId, config.alertCheckHours],
    );
    let created = 0;
    for (const a of rows) created += await this.checkAlert(a).catch(() => 0);
    return { checked: rows.length, created };
  }

  /** Look for papers published / news reported since the last check. Returns notifications created. */
  async checkAlert(a: AlertRow): Promise<number> {
    const now = Date.now();
    const last = a.last_checked_at ? new Date(a.last_checked_at).getTime() : null;
    let created = 0;

    if (a.papers) {
      // Indexing lags publication by days, so look back a little further than the last check.
      const from = new Date((last ?? now - 14 * DAY) - 3 * DAY).toISOString().slice(0, 10);
      const papers = await this.recentPapers(a, from).catch((e: Error) => {
        this.logger.warn(`Papers for alert ${a.id} ("${a.query}"): ${e.message}`);
        return [] as Paper[];
      });
      let added = 0;
      for (const p of papers) {
        if (added >= 3) break;
        const authors = p.authors.slice(0, 3).map((x) => x.name).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
        const ok = await this.notify(a, {
          kind: 'paper',
          ref: p.id,
          title: p.title.slice(0, 500),
          body: [authors, p.venue].filter(Boolean).join(' · ').slice(0, 500) || null,
          paperId: p.id,
          source: p.venue ?? null,
          publishedAt: p.publishedDate ?? null,
        });
        if (ok) added++;
      }
      created += added;
    }

    if (a.news && a.mode !== 'author') {
      const region = a.filters?.pakistan || a.filters?.countries?.includes('pk') ? 'pk' : 'world';
      const res = await this.news.search(a.query, region, last && now - last < 2 * DAY ? '24h' : '7d', 15, true).catch(() => null);
      const since = last ?? now - 2 * DAY;
      let added = 0;
      for (const it of res?.items ?? []) {
        if (added >= 2) break;
        if (Date.parse(it.publishedAt) < since) continue;
        const ok = await this.notify(a, {
          kind: 'news',
          ref: it.url.slice(0, 1000),
          title: it.title.slice(0, 500),
          body: it.snippet ?? null,
          url: it.url,
          imageUrl: it.imageUrl ?? null,
          source: it.source,
          publishedAt: it.publishedAt,
        });
        if (ok) added++;
      }
      created += added;
    }

    await this.db.query(
      `update alerts set last_checked_at = now(), last_hit_at = case when $2 > 0 then now() else last_hit_at end where id = $1`,
      [a.id, created],
    );
    return created;
  }

  private async recentPapers(a: AlertRow, fromDate: string): Promise<Paper[]> {
    const filters = a.filters ?? {};
    if (a.mode === 'author') {
      const author = await this.cache.wrap(`alerts:author:${a.query_key}`, 7 * 86_400, async () => (await openalex.searchAuthors(a.query, 1))[0] ?? null);
      if (!author) return [];
      return openalex.recentWorks(undefined, filters, [`author.id:${author.id.replace('openalex:', '')}`], fromDate);
    }
    if (a.mode === 'subject') {
      const subject = await this.cache.wrap(`alerts:subject:${a.query_key}`, 7 * 86_400, async () => (await openalex.findSubject(a.query)) ?? false);
      if (subject) return openalex.recentWorks(undefined, filters, [openalex.subjectFilter(subject)], fromDate);
    }
    return openalex.recentWorks(a.query, filters, [], fromDate);
  }

  private async notify(
    a: AlertRow,
    n: {
      kind: 'paper' | 'news';
      ref: string;
      title: string;
      body?: string | null;
      url?: string | null;
      paperId?: string | null;
      imageUrl?: string | null;
      source?: string | null;
      publishedAt?: string | null;
    },
  ): Promise<boolean> {
    // Don't announce papers the user has already saved.
    if (n.paperId) {
      const saved = await this.db.one('select 1 from bookmarks where user_id = $1 and paper_id = $2', [a.user_id, n.paperId]);
      if (saved) return false;
    }
    const rows = await this.db.query(
      `insert into notifications (user_id, alert_id, kind, ref, title, body, url, paper_id, image_url, source, topic, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (user_id, kind, ref) do nothing returning id`,
      [
        a.user_id,
        a.id,
        n.kind,
        n.ref,
        n.title,
        n.body ?? null,
        n.url ?? null,
        n.paperId ?? null,
        n.imageUrl ?? null,
        n.source ?? null,
        a.query,
        n.publishedAt && !isNaN(Date.parse(n.publishedAt)) ? n.publishedAt : null,
      ],
    );
    return rows.length > 0;
  }

  // ---- notifications ---------------------------------------------------------------------

  async notifications(userId: string, opts: { limit?: number; before?: number; kind?: string; unread?: boolean }) {
    const vals: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (opts.before) {
      vals.push(opts.before);
      where.push(`id < $${vals.length}`);
    }
    if (opts.kind === 'paper' || opts.kind === 'news') {
      vals.push(opts.kind);
      where.push(`kind = $${vals.length}`);
    }
    if (opts.unread) where.push('read_at is null');
    vals.push(Math.min(Math.max(opts.limit ?? 30, 1), 100));
    const items = await this.db.query<{
      id: number;
      kind: string;
      title: string;
      body: string | null;
      url: string | null;
      paper_id: string | null;
      image_url: string | null;
      source: string | null;
      topic: string | null;
      alert_id: number | null;
      published_at: Date | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `select id, kind, title, body, url, paper_id, image_url, source, topic, alert_id, published_at, read_at, created_at
       from notifications where ${where.join(' and ')} order by id desc limit $${vals.length}`,
      vals,
    );
    return {
      items: items.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        url: r.url,
        paperId: r.paper_id,
        imageUrl: r.image_url,
        source: r.source,
        topic: r.topic,
        alertId: r.alert_id,
        publishedAt: r.published_at,
        read: !!r.read_at,
        createdAt: r.created_at,
      })),
      unread: await this.unreadCount(userId),
    };
  }

  async unreadCount(userId: string): Promise<number> {
    const row = await this.db.one<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [userId]);
    return row?.n ?? 0;
  }

  async markRead(userId: string, input: { ids?: unknown; all?: unknown }) {
    if (input.all === true) {
      await this.db.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [userId]);
    } else if (Array.isArray(input.ids)) {
      const ids = input.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
      if (ids.length)
        await this.db.query('update notifications set read_at = now() where user_id = $1 and id = any($2::bigint[]) and read_at is null', [
          userId,
          ids,
        ]);
    } else throw new BadRequestException('Pass { all: true } or { ids: [...] }');
    return { unread: await this.unreadCount(userId) };
  }

  async removeNotification(userId: string, id: number) {
    await this.db.query('delete from notifications where id = $1 and user_id = $2', [id, userId]);
    return { unread: await this.unreadCount(userId) };
  }
}
