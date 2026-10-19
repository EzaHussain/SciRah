import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, OptionalAuthGuard } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { FeedService } from '../feed/feed.service.js';
import { FullTextService } from './fulltext.service.js';
import { InsightsService } from './insights.service.js';
import { PapersService } from './papers.service.js';
import type { SearchMode, SearchParams, SortMode } from './types.js';

const MODES: SearchMode[] = ['keyword', 'author', 'subject'];
const SORTS: SortMode[] = ['relevance', 'citations', 'newest'];

const CONTINENTS = ['africa', 'asia', 'europe', 'north_america', 'oceania', 'south_america', 'antarctica'];
const TYPES = ['article', 'review', 'preprint', 'book-chapter', 'book', 'dissertation', 'dataset', 'report', 'letter', 'editorial'];
const VENUES = ['journal', 'conference', 'repository', 'book series', 'ebook platform'];

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Parse and whitelist the advanced filter query params. */
export function parseAdvancedFilters(query: Record<string, string | undefined>): Partial<SearchParams> {
  const countries = list(query.country).filter((c) => /^[a-z]{2}$/.test(c)).slice(0, 15);
  const types = list(query.type).filter((t) => TYPES.includes(t));
  const continent = list(query.continent).find((c) => CONTINENTS.includes(c));
  const institution = /^i\d{3,12}$/i.test(query.inst ?? '') ? query.inst!.toUpperCase() : undefined;
  const language = /^[a-z]{2}$/.test(query.lang ?? '') ? query.lang : undefined;
  const field = /^\d{2}$/.test(query.field ?? '') && +query.field! >= 11 && +query.field! <= 36 ? query.field : undefined;
  const topic = /^t\d{3,8}$/i.test(query.topic ?? '') ? query.topic!.toUpperCase() : undefined;
  const venueType = VENUES.includes((query.venue ?? '').toLowerCase()) ? query.venue!.toLowerCase() : undefined;
  return {
    countries: countries.length ? countries : undefined,
    continent,
    globalSouth: query.gs === '1' || undefined,
    institution,
    types: types.length ? types : undefined,
    language,
    field,
    topic,
    venueType,
    minCitations: intOrUndef(query.cites, 1, 1_000_000),
    hasAbstract: query.abs === '1' || undefined,
    excludeRetracted: query.retracted === '0' || undefined,
  };
}

function intOrUndef(v?: string, min = 0, max = Infinity) {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

/** Search query params (shared by /papers/search and /papers/insights). */
function parseSearch(query: Record<string, string | undefined>): SearchParams {
  const q = (query.q ?? '').trim().slice(0, 300);
  if (q.length < 2) throw new BadRequestException('Please enter at least 2 characters');
  return {
    q,
    mode: MODES.includes(query.mode as SearchMode) ? (query.mode as SearchMode) : 'keyword',
    sort: SORTS.includes(query.sort as SortMode) ? (query.sort as SortMode) : 'relevance',
    page: intOrUndef(query.page, 1, 50) ?? 1,
    perPage: 10,
    yearFrom: intOrUndef(query.from, 1800, 2100),
    yearTo: intOrUndef(query.to, 1800, 2100),
    openAccess: query.oa === '1' || query.oa === 'true',
    pakistan: query.pk === '1' || query.pk === 'true',
    ...parseAdvancedFilters(query),
  };
}

@Controller('papers')
export class PapersController {
  constructor(
    private readonly papers: PapersService,
    private readonly insights: InsightsService,
    private readonly fulltext: FullTextService,
    private readonly feed: FeedService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('search')
  @UseGuards(OptionalAuthGuard)
  async search(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthUser | null,
  ) {
    const params = parseSearch(query);
    const res = await this.papers.search(params);
    if (user && params.page === 1) {
      this.feed.recordSearch(user.id, params, res.results).catch(() => undefined);
      this.alerts.trackSearch(user.id, params).catch(() => undefined);
    }
    return res;
  }

  /** Research landscape for a search: countries, institutions (map), researchers, years, sub-topics. */
  @Get('insights')
  insightsFor(@Query() query: Record<string, string | undefined>) {
    return this.insights.get(parseSearch(query));
  }

  /** Institution autocomplete for the location filter. */
  @Get('institutions')
  institutions(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return [];
    return this.papers.institutions(query.slice(0, 100));
  }

  /** How to read the whole paper inside SciRah (article text, PDF, open-access page, or not available). */
  @Get('fulltext')
  fullText(@Query('id') id?: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.fulltext.resolve(id.trim());
  }

  /** A Europe PMC open-access article converted to safe HTML. */
  @Get('fulltext/article')
  fullArticle(@Query('pmcid') pmcid?: string) {
    if (!pmcid) throw new BadRequestException('pmcid is required');
    return this.fulltext.article(pmcid.trim());
  }

  @Get('detail')
  detail(@Query('id') id?: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.papers.getPaper(id.trim());
  }
}
