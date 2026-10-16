import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import { fetchJson, qs } from '../common/http.js';
import { config } from '../config.js';
import * as openalex from './sources/openalex.js';
import type { SearchParams } from './types.js';

export interface InsightPlace {
  id: string;
  name: string;
  count: number;
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

export interface Insights {
  available: boolean;
  /** Works matching the search in OpenAlex. */
  total: number;
  /** "country" when the search is limited to exactly one country (e.g. Pakistan). */
  scope: { kind: 'world' } | { kind: 'country'; code: string; name: string };
  countries: { code: string; name: string; count: number }[];
  institutions: InsightPlace[];
  researchers: { id: string; name: string; count: number; affiliation?: string }[];
  years: { year: number; count: number }[];
  topics: { id: string; name: string; count: number }[];
}

const EMPTY: Insights = {
  available: false,
  total: 0,
  scope: { kind: 'world' },
  countries: [],
  institutions: [],
  researchers: [],
  years: [],
  topics: [],
};

/**
 * The "research landscape" for a search: where the work comes from (countries, institutions with
 * map coordinates, researchers), how it grew over time, and which sub-topics it splits into.
 * All counts come from OpenAlex group-by queries over the same filters as the search.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private readonly cache: CacheService) {}

  get(p: SearchParams): Promise<Insights> {
    const key = `insights:v1:${JSON.stringify({ ...p, page: 1, sort: undefined })}`;
    return this.cache.wrap(key, 6 * 3600, () => this.compute(p));
  }

  private async compute(p: SearchParams): Promise<Insights> {
    if (p.mode === 'author') return EMPTY;

    let extra: string[] = [];
    let useSearch = true;
    if (p.mode === 'subject') {
      const match = await openalex.findSubject(p.q).catch(() => null);
      if (match) {
        extra = [openalex.subjectFilter(match)];
        useSearch = false;
      }
    }

    const countries = new Set((p.countries ?? []).map((c) => c.toLowerCase()));
    if (p.pakistan) countries.add('pk');
    const single = countries.size === 1 && !p.institution ? [...countries][0] : undefined;

    const group = (by: string) =>
      openalex.groupWorks(p, by, extra, useSearch).catch((e: Error) => {
        this.logger.warn(`insights group_by ${by} failed: ${e.message}`);
        return [] as openalex.GroupCount[];
      });
    const [byCountry, byInst, byAuthor, byYear, byTopic] = await Promise.all([
      group('authorships.countries'),
      group('authorships.institutions.id'),
      group('authorships.author.id'),
      group('publication_year'),
      group('topics.id'),
    ]);

    const countryList = byCountry.map((c) => ({ code: c.key.toLowerCase(), name: c.name, count: c.count }));
    // Every work has a publication year, so the year groups add up to the total.
    const total = byYear.reduce((s, y) => s + y.count, 0);

    // Institutions with coordinates. With a single-country scope, keep only that country's institutions
    // (the counts otherwise include foreign co-authors' institutions).
    const geo = await openalex.institutionsGeo(byInst.slice(0, 100).map((i) => i.key)).catch(() => []);
    const geoById = new Map(geo.map((g) => [g.id, g]));
    let institutions: InsightPlace[] = byInst.map((i) => {
      const g = geoById.get(i.key);
      return { id: i.key, name: i.name, count: i.count, city: g?.city, countryCode: g?.countryCode, lat: g?.lat, lng: g?.lng };
    });
    if (single) institutions = institutions.filter((i) => i.countryCode === single);
    institutions = institutions.slice(0, 60);

    // Researchers: with a single-country scope, keep those currently based in that country.
    const topAuthors = byAuthor.slice(0, 60);
    const authorInfo = await this.authorAffiliations(topAuthors.map((a) => a.key));
    let researchers = topAuthors.map((a) => ({
      id: `openalex:${a.key}`,
      name: a.name,
      count: a.count,
      affiliation: authorInfo.get(a.key)?.institution,
      countryCode: authorInfo.get(a.key)?.country,
    }));
    if (single) researchers = researchers.filter((r) => r.countryCode === single);

    return {
      available: true,
      total,
      scope: single
        ? { kind: 'country', code: single, name: countryList.find((c) => c.code === single)?.name ?? single.toUpperCase() }
        : { kind: 'world' },
      countries: countryList,
      institutions,
      researchers: researchers.slice(0, 15).map(({ countryCode: _c, ...r }) => r),
      years: byYear
        .map((y) => ({ year: Number(y.key), count: y.count }))
        .filter((y) => y.year >= 1900 && y.year <= new Date().getFullYear())
        .sort((a, b) => a.year - b.year),
      topics: byTopic.slice(0, 24).map((t) => ({ id: t.key, name: t.name, count: t.count })),
    };
  }

  /** Last known institution (and its country) for up to 100 OpenAlex authors. */
  private async authorAffiliations(ids: string[]): Promise<Map<string, { institution?: string; country?: string }>> {
    const out = new Map<string, { institution?: string; country?: string }>();
    if (!ids.length) return out;
    type Raw = { id: string; last_known_institutions?: { display_name?: string; country_code?: string }[] };
    const params = qs({
      filter: `openalex:${ids.slice(0, 100).join('|')}`,
      per_page: 100,
      select: 'id,last_known_institutions',
      mailto: config.contactEmail,
      api_key: config.openAlexApiKey,
    });
    const data = await fetchJson<{ results: Raw[] }>(`https://api.openalex.org/authors?${params}`, { timeoutMs: 15_000 }).catch(
      () => ({ results: [] as Raw[] }),
    );
    for (const a of data.results) {
      const inst = a.last_known_institutions?.[0];
      out.set(a.id.replace(/^.*\//, ''), { institution: inst?.display_name, country: inst?.country_code?.toLowerCase() });
    }
    return out;
  }
}
