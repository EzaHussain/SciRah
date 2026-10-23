import { Controller, Get } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import * as openalex from '../papers/sources/openalex.js';

interface Entry {
  id: string;
  updatedAt?: string;
}

/**
 * Pages worth listing in the sitemap for search engines: papers people have actually used on SciRah
 * (summarised, saved or added), verified and leading researchers, researchers' public pages, and the
 * journals Pakistani researchers publish in. Only ids and dates — no personal data.
 */
@Controller('seo')
export class SeoController {
  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
  ) {}

  @Get('sitemap')
  sitemap() {
    return this.cache.wrap('seo:sitemap:v1', 6 * 3600, async () => {
      const q = <T>(sql: string) => (this.db.enabled ? this.db.query<T>(sql).catch(() => [] as T[]) : Promise.resolve([] as T[]));
      const [summaries, saved, added, claimed, researchers, top, country] = await Promise.all([
        q<Entry>('select paper_id as id, updated_at as "updatedAt" from paper_summaries order by updated_at desc limit 20000'),
        q<Entry>('select paper_id as id, max(created_at) as "updatedAt" from bookmarks group by paper_id order by count(*) desc limit 10000'),
        q<Entry>(`select 'scirah:' || id as id, coalesce(reviewed_at, created_at) as "updatedAt" from user_papers where status = 'approved' limit 10000`),
        q<Entry>('select author_id as id, updated_at as "updatedAt" from author_claims'),
        q<Entry>(`select id::text as id, created_at as "updatedAt" from users where role = 'researcher' limit 10000`),
        this.cache.wrap('explore:researchers:v1:pk', 24 * 3600, () => openalex.topAuthorsInCountry('pk')).catch(() => []),
        this.cache.wrap('explore:country:v2:pk', 12 * 3600, () => openalex.countryOverview('pk')).catch(() => null),
      ]);
      const unique = (list: Entry[]) => [...new Map(list.map((e) => [e.id, e])).values()];
      return {
        papers: unique([...summaries, ...added, ...saved]).slice(0, 40_000),
        authors: unique([...claimed, ...top.map((a) => ({ id: a.id }))]),
        researchers,
        venues: (country?.journals ?? []).map((j) => ({ id: j.id })),
      };
    });
  }
}
