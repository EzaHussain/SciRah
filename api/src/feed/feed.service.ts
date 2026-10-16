import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { worksBySubfields } from '../papers/sources/openalex.js';
import type { Paper, PaperTopic, SearchParams } from '../papers/types.js';
import { addScaled, cosine, fromJson, normalize, subfieldsOf, toJson, topicVector, topSubfields, type SparseVec } from './embedding.js';

const DAY = 86_400_000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

/** Compact copy stored alongside vectors and returned in feeds (abstract trimmed to a snippet). */
export function cardOf(p: Paper): Paper {
  return {
    ...p,
    abstract: p.abstract && p.abstract.length > 420 ? p.abstract.slice(0, 400).trimEnd() + '…' : p.abstract,
    authors: p.authors.slice(0, 6),
    topics: p.topics.slice(0, 4),
  };
}

export interface FeedItem {
  paper: Paper;
  score: number;
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
  ) {}

  // ---- signals -------------------------------------------------------------

  async recordSearch(userId: string, params: SearchParams, results: Paper[]) {
    if (!this.db.enabled) return;
    const top = results.filter((r) => r.topics.some((t) => t.id)).slice(0, 5);
    const topics: PaperTopic[] = top.flatMap((r) => r.topics.slice(0, 3));
    await this.db.query('insert into search_history (user_id, query, mode, topics) values ($1, $2, $3, $4)', [
      userId,
      params.q,
      params.mode,
      JSON.stringify(topics),
    ]);
    await this.upsertVectors(top);
    // Debounce recomputation: at most once a minute from searches.
    if (await this.cache.get(`interests:debounce:${userId}`)) return;
    await this.cache.set(`interests:debounce:${userId}`, 1, 60);
    await this.refreshInterests(userId);
  }

  async recordBookmark(userId: string, paper: Paper) {
    await this.upsertVectors([paper]);
    await this.refreshInterests(userId);
  }

  /** Interest vector = time-decayed sum of bookmarked papers (strong) and recent searches (weak). */
  async refreshInterests(userId: string) {
    if (!this.db.enabled) return;
    const [bm, sh] = await Promise.all([
      this.db.query<{ topics: PaperTopic[]; created_at: Date }>(
        'select topics, created_at from bookmarks where user_id = $1 order by created_at desc limit 150',
        [userId],
      ),
      this.db.query<{ topics: PaperTopic[]; created_at: Date }>(
        'select topics, created_at from search_history where user_id = $1 order by created_at desc limit 40',
        [userId],
      ),
    ]);
    const acc: SparseVec = new Map();
    const now = Date.now();
    const decay = (d: Date, halfLifeDays: number) => Math.pow(0.5, (now - new Date(d).getTime()) / (halfLifeDays * DAY));
    for (const b of bm) addScaled(acc, topicVector(b.topics ?? []), decay(b.created_at, 120));
    for (const s of sh) addScaled(acc, topicVector(s.topics ?? []), 0.35 * decay(s.created_at, 30));

    if (acc.size === 0) {
      await this.db.query('delete from user_interests where user_id = $1', [userId]);
      return;
    }
    const v = normalize(acc);
    await this.db
      .query(
        `insert into user_interests (user_id, embedding, top_subfields, updated_at) values ($1, $2, $3, now())
         on conflict (user_id) do update set embedding = excluded.embedding, top_subfields = excluded.top_subfields, updated_at = now()`,
        [userId, JSON.stringify(toJson(v)), topSubfields(v, 6)],
      )
      .catch((e: Error) => this.logger.error(`Saving interests failed: ${e.message}`));
  }

  private async upsertVectors(papers: Paper[]) {
    if (!this.db.enabled) return;
    // De-duplicate first: Postgres rejects updating the same row twice in one upsert.
    const byId = new Map<string, { p: Paper; v: SparseVec }>();
    for (const p of papers) {
      const v = topicVector(p.topics);
      if (v.size > 0 && !byId.has(p.id)) byId.set(p.id, { p, v });
    }
    if (!byId.size) return;
    const values: unknown[] = [];
    const tuples = [...byId.values()].map(({ p, v }) => {
      const published = p.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(p.publishedDate) ? p.publishedDate : p.year ? `${p.year}-01-01` : null;
      const b = values.length;
      values.push(p.id, JSON.stringify(toJson(v)), subfieldsOf(v), published, p.citationCount ?? 0, JSON.stringify(cardOf(p)));
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, now())`;
    });
    await this.db
      .query(
        `insert into paper_vectors (paper_id, embedding, subfields, published_date, citation_count, metadata, updated_at)
         values ${tuples.join(',')}
         on conflict (paper_id) do update set embedding = excluded.embedding, subfields = excluded.subfields,
           published_date = excluded.published_date, citation_count = excluded.citation_count,
           metadata = excluded.metadata, updated_at = now()`,
        values,
      )
      .catch((e: Error) => this.logger.error(`Saving paper vectors failed: ${e.message}`));
  }

  private async interests(userId: string): Promise<{ vector: SparseVec; subfields: string[] } | null> {
    const row = await this.db.one<{ embedding: unknown; top_subfields: string[] }>(
      'select embedding, top_subfields from user_interests where user_id = $1',
      [userId],
    );
    if (!row) return null;
    return { vector: fromJson(row.embedding), subfields: row.top_subfields };
  }

  // ---- feeds ---------------------------------------------------------------

  /** Personalised feed: refresh the candidate pool for the user's top subfields, then rank by cosine similarity. */
  async personalFeed(userId: string): Promise<{ personalized: boolean; items: FeedItem[]; subfields: string[] }> {
    const interests = await this.interests(userId);
    if (!interests || !interests.subfields.length) return { personalized: false, items: [], subfields: [] };

    const subs = interests.subfields.slice(0, 4);
    const poolKey = `feed:pool:${[...subs].sort().join(',')}`;
    await this.cache.wrap(poolKey, 6 * 3600, async () => {
      const [established, recent] = await Promise.all([
        worksBySubfields(subs, { fromDate: isoDaysAgo(3 * 365), perPage: 50 }).catch(() => [] as Paper[]),
        worksBySubfields(subs, { fromDate: isoDaysAgo(365), perPage: 50 }).catch(() => [] as Paper[]),
      ]);
      await this.upsertVectors([...established, ...recent]);
      return true;
    });

    const candidates = await this.db.query<{ paper_id: string; embedding: unknown; metadata: Paper }>(
      `select v.paper_id, v.embedding, v.metadata
       from paper_vectors v
       where v.subfields && $2::text[]
         and v.published_date >= $3
         and not exists (select 1 from bookmarks b where b.user_id = $1 and b.paper_id = v.paper_id)
       order by v.published_date desc
       limit 1500`,
      [userId, interests.subfields, isoDaysAgo(3 * 365)],
    );
    const items = candidates
      .map((r) => ({ paper: r.metadata, score: cosine(interests.vector, fromJson(r.embedding)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
    return { personalized: true, items, subfields: interests.subfields };
  }

  /** "Trending now": recent, already-cited work — in the user's subfields if known, optionally Pakistan-only. */
  async trending(userId: string | null, pakistan: boolean): Promise<{ personalized: boolean; items: FeedItem[] }> {
    const interests = userId && this.db.enabled ? await this.interests(userId).catch(() => null) : null;
    const subs = interests?.subfields.slice(0, 4) ?? [];
    const key = `feed:trending:v1:${pakistan ? 'pk' : 'all'}:${[...subs].sort().join(',')}`;
    const papers = await this.cache.wrap(key, 6 * 3600, async () =>
      (await worksBySubfields(subs, { fromDate: isoDaysAgo(pakistan ? 365 : 120), perPage: 40, pakistan })).map(cardOf),
    );
    const now = Date.now();
    const items = papers
      .map((p) => {
        // Floor at 30 days so a paper a few days old isn't boosted by a tiny denominator.
        const ageDays = Math.max(30, (now - Date.parse(p.publishedDate ?? `${p.year}-06-01`)) / DAY);
        const velocity = Math.log2(2 + (p.citationCount ?? 0)) / Math.sqrt(ageDays);
        const sim = interests ? 0.5 + cosine(interests.vector, topicVector(p.topics)) : 1;
        return { paper: p, score: velocity * sim };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    return { personalized: !!interests, items };
  }

  /** Most frequent subfield names among the user's saved papers (used for news "for you"). */
  async savedSubfieldNames(userId: string, limit = 2): Promise<string[]> {
    if (!this.db.enabled) return [];
    const rows = await this.db.query<{ name: string }>(
      `select t->>'subfield' as name, count(*) as n
       from bookmarks b, jsonb_array_elements(b.topics) t
       where b.user_id = $1 and t->>'subfield' is not null
       group by 1 order by n desc limit $2`,
      [userId, limit],
    );
    return rows.map((r) => r.name);
  }
}
