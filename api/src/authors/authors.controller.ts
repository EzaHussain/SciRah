import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, OptionalAuthGuard, type AuthUser } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { config } from '../config.js';
import * as openalex from '../papers/sources/openalex.js';
import * as s2 from '../papers/sources/semanticscholar.js';
import type { AuthorProfile, AuthorSummary } from '../papers/types.js';
import { sciRahScore } from './score.js';

const OPENALEX_AUTHOR = /^openalex:A\d+$/i;
const bareOrcid = (v?: string | null) => v?.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i)?.[0]?.toUpperCase();

interface ClaimRow {
  author_id: string;
  user_id: string;
  orcid: string;
  patents: number;
  students: number;
}

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: DbService,
  ) {}

  search(q: string): Promise<AuthorSummary[]> {
    return this.cache.wrap(`authors:search:${q.toLowerCase()}`, 6 * 3600, async () => {
      const [a, b] = await Promise.allSettled([openalex.searchAuthors(q, 8), s2.searchAuthors(q, 4)]);
      return [...(a.status === 'fulfilled' ? a.value : []), ...(b.status === 'fulfilled' ? b.value : [])];
    });
  }

  async get(id: string): Promise<AuthorProfile> {
    const m = id.match(/^(openalex:A\d+|s2:\d+)$/i);
    if (!m) throw new BadRequestException('Unrecognised author id');
    const profile = await this.cache.wrap(`author:v1:${id}`, 12 * 3600, async () => {
      const [kind, value] = id.split(':');
      return kind.toLowerCase() === 'openalex' ? openalex.getAuthor(value.toUpperCase()) : s2.getAuthor(value);
    });
    if (!profile) throw new NotFoundException('Researcher not found');
    return profile;
  }

  // ---- SciRah Score ----

  private claimRow(authorId: string) {
    return this.db.enabled
      ? this.db.one<ClaimRow>('select * from author_claims where author_id = $1', [authorId]).catch(() => null)
      : Promise.resolve(null);
  }

  async score(id: string) {
    if (!OPENALEX_AUTHOR.test(id)) throw new BadRequestException('The SciRah Score is available for OpenAlex researcher profiles');
    const authorId = id.split(':')[1].toUpperCase();
    const profile = await this.get(`openalex:${authorId}`);
    const works = await this.cache.wrap(`score:works:v1:${authorId}`, 12 * 3600, () => openalex.authorScoreWorks(authorId));
    const claim = await this.claimRow(`openalex:${authorId}`);
    const result = sciRahScore({
      works: works.works,
      totalWorks: Math.max(profile.worksCount ?? 0, works.total),
      hIndex: profile.hIndex ?? 0,
      patents: claim?.patents ?? 0,
      students: claim?.students ?? 0,
    });
    return { authorId: `openalex:${authorId}`, ...result, claimed: !!claim, papersCounted: works.works.length, totalWorks: works.total };
  }

  // ---- Claiming a profile with ORCID ----

  get orcidEnabled() {
    return !!(config.orcidClientId && config.orcidClientSecret);
  }

  private checkRedirectUri(redirectUri: unknown): string {
    if (typeof redirectUri !== 'string') throw new BadRequestException('redirectUri is required');
    let u: URL;
    try {
      u = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Invalid redirectUri');
    }
    if (!config.webOrigins.includes(u.origin) || u.pathname !== '/auth/orcid/callback' || u.search || u.hash)
      throw new BadRequestException('redirectUri must be <WEB_ORIGIN>/auth/orcid/callback');
    return u.toString();
  }

  orcidUrl(redirectUri: unknown, state: unknown) {
    if (!this.orcidEnabled) throw new ServiceUnavailableException('Profile claiming is not configured (ORCID_CLIENT_ID / ORCID_CLIENT_SECRET)');
    if (typeof state !== 'string' || state.length < 16) throw new BadRequestException('state is required');
    const params = new URLSearchParams({
      client_id: config.orcidClientId,
      response_type: 'code',
      scope: '/authenticate',
      redirect_uri: this.checkRedirectUri(redirectUri),
      state,
    });
    return { url: `${config.orcidBaseUrl}/oauth/authorize?${params}` };
  }

  async claim(user: AuthUser, body: { authorId?: unknown; code?: unknown; redirectUri?: unknown }) {
    if (!this.orcidEnabled) throw new ServiceUnavailableException('Profile claiming is not configured on the server');
    const authorId = typeof body.authorId === 'string' && OPENALEX_AUTHOR.test(body.authorId) ? `openalex:${body.authorId.split(':')[1].toUpperCase()}` : null;
    if (!authorId) throw new BadRequestException('Unrecognised researcher profile');
    if (typeof body.code !== 'string' || !body.code) throw new BadRequestException('code is required');
    const redirectUri = this.checkRedirectUri(body.redirectUri);

    const res = await fetch(`${config.orcidBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.orcidClientId,
        client_secret: config.orcidClientSecret,
        grant_type: 'authorization_code',
        code: body.code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e: Error) => {
      throw new ServiceUnavailableException(`Could not reach ORCID: ${e.message}`);
    });
    const tok = (await res.json().catch(() => ({}))) as { orcid?: string; error?: string; error_description?: string };
    if (!res.ok || !tok.orcid) {
      this.logger.warn(`ORCID token exchange failed: ${tok.error} ${tok.error_description ?? ''}`);
      throw new UnauthorizedException(`ORCID sign-in failed (${tok.error ?? res.status}).`);
    }

    const profile = await this.get(authorId);
    const profileOrcid = bareOrcid(profile.orcid);
    if (!profileOrcid)
      throw new ForbiddenException('This profile has no ORCID iD linked in OpenAlex, so it can’t be verified yet. Add your works to your ORCID record, then try again later.');
    if (profileOrcid !== bareOrcid(tok.orcid))
      throw new ForbiddenException('Your ORCID iD does not match this researcher profile.');

    // The ORCID proves ownership, so a re-claim (e.g. from a new SciRah account) moves the claim.
    const row = await this.db.one<ClaimRow>(
      `insert into author_claims (author_id, user_id, orcid) values ($1, $2, $3)
       on conflict (author_id) do update set user_id = excluded.user_id, orcid = excluded.orcid, updated_at = now()
       returning *`,
      [authorId, user.id, profileOrcid],
    );
    return this.presentClaim(row, user.id);
  }

  async claimInfo(id: string, userId?: string) {
    const row = OPENALEX_AUTHOR.test(id) ? await this.claimRow(`openalex:${id.split(':')[1].toUpperCase()}`) : null;
    return this.presentClaim(row, userId);
  }

  async updateClaim(id: string, user: AuthUser, body: { patents?: unknown; students?: unknown }) {
    const row = OPENALEX_AUTHOR.test(id) ? await this.claimRow(`openalex:${id.split(':')[1].toUpperCase()}`) : null;
    if (!row) throw new NotFoundException('This profile has not been claimed');
    if (row.user_id !== user.id) throw new ForbiddenException('Only the researcher who claimed this profile can edit it');
    const num = (v: unknown, cur: number) => {
      if (v === undefined) return cur;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new BadRequestException('Enter a whole number between 0 and 1000');
      return n;
    };
    const updated = await this.db.one<ClaimRow>(
      'update author_claims set patents = $2, students = $3, updated_at = now() where author_id = $1 returning *',
      [row.author_id, num(body.patents, row.patents), num(body.students, row.students)],
    );
    return this.presentClaim(updated, user.id);
  }

  private presentClaim(row: ClaimRow | null, userId?: string) {
    return {
      claimable: this.orcidEnabled,
      claimed: !!row,
      mine: !!row && row.user_id === userId,
      patents: row?.patents ?? 0,
      students: row?.students ?? 0,
    };
  }
}

@Controller('authors')
export class AuthorsController {
  constructor(private readonly authors: AuthorsService) {}

  @Get('search')
  search(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('Please enter at least 2 characters');
    return this.authors.search(query.slice(0, 200));
  }

  @Get('claim/orcid-url')
  orcidUrl(@Query('redirectUri') redirectUri?: string, @Query('state') state?: string) {
    return this.authors.orcidUrl(redirectUri, state);
  }

  @Post('claim')
  @UseGuards(AuthGuard)
  claim(@CurrentUser() user: AuthUser, @Body() body: { authorId?: unknown; code?: unknown; redirectUri?: unknown }) {
    if (!body) throw new ConflictException('Missing body');
    return this.authors.claim(user, body);
  }

  @Get(':id/score')
  score(@Param('id') id: string) {
    return this.authors.score(id);
  }

  @Get(':id/claim')
  @UseGuards(OptionalAuthGuard)
  claimInfo(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.authors.claimInfo(id, user?.id);
  }

  @Patch(':id/claim')
  @UseGuards(AuthGuard)
  updateClaim(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: { patents?: unknown; students?: unknown }) {
    return this.authors.updateClaim(id, user, body ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.authors.get(id);
  }
}
