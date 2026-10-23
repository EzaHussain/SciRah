import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { isAdmin } from '../auth/auth.service.js';
import { AuthGuard, CurrentUser, OptionalAuthGuard, type AuthUser } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { mailEnabled, sendMail } from '../common/mail.js';
import { config } from '../config.js';
import * as crossref from '../papers/sources/crossref.js';
import * as openalex from '../papers/sources/openalex.js';
import * as s2 from '../papers/sources/semanticscholar.js';
import type { AuthorProfile, AuthorSummary } from '../papers/types.js';
import { sciRahScore } from './score.js';

const OPENALEX_AUTHOR = /^openalex:A\d+$/i;
const bareOrcid = (v?: string | null) => v?.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i)?.[0]?.toUpperCase();
const normAuthorId = (id: unknown) =>
  typeof id === 'string' && OPENALEX_AUTHOR.test(id) ? `openalex:${id.split(':')[1].toUpperCase()}` : null;

interface ClaimRow {
  author_id: string;
  user_id: string;
  orcid: string | null;
  method: string;
  patents: number;
  students: number;
  citations: number | null;
  h_index: number | null;
  i10_index: number | null;
  works: number | null;
  metrics_source: string | null;
  metrics_url: string | null;
  metrics_updated_at: string | null;
  verified_email: string | null;
}

interface OwnerRow {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  affiliation: string | null;
  position: string | null;
  bio: string | null;
  interests: string[];
  website: string | null;
  scholar_url: string | null;
}

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: DbService,
  ) {}

  /** Type-ahead suggestions for the search box (author names or subjects). */
  suggest(kind: 'authors' | 'subjects', q: string) {
    return this.cache.wrap(`suggest:v2:${kind}:${q.toLowerCase()}`, 24 * 3600, () => openalex.autocomplete(kind, q));
  }

  search(q: string): Promise<AuthorSummary[]> {
    return this.cache.wrap(`authors:search:${q.toLowerCase()}`, 6 * 3600, async () => {
      const [a, b] = await Promise.allSettled([openalex.searchAuthors(q, 8), s2.searchAuthors(q, 4)]);
      return [...(a.status === 'fulfilled' ? a.value : []), ...(b.status === 'fulfilled' ? b.value : [])];
    });
  }

  async get(id: string): Promise<AuthorProfile> {
    const m = id.match(/^(openalex:A\d+|s2:\d+)$/i);
    if (!m) throw new BadRequestException('Unrecognised author id');
    const profile = await this.cache.wrap(`author:v2:${id}`, 12 * 3600, async () => {
      const [kind, value] = id.split(':');
      return kind.toLowerCase() === 'openalex' ? openalex.getAuthor(value.toUpperCase()) : s2.getAuthor(value);
    });
    if (!profile) throw new NotFoundException('Researcher not found');
    return profile;
  }

  /** The profile as shown on SciRah: without the papers the verified researcher said are not theirs. */
  async getVisible(id: string): Promise<AuthorProfile> {
    const profile = await this.get(id);
    const hidden = await this.hiddenIds(profile.id);
    return hidden.size ? { ...profile, papers: profile.papers.filter((p) => !p.ids.openalex || !hidden.has(p.ids.openalex)) } : profile;
  }

  // ---- "This is not my paper" ----

  private async hiddenIds(authorId: string): Promise<Set<string>> {
    if (!this.db.enabled || !OPENALEX_AUTHOR.test(authorId)) return new Set();
    const rows = await this.db.query<{ work_id: string }>('select work_id from author_hidden_works where author_id = $1', [authorId]).catch(() => []);
    return new Set(rows.map((r) => r.work_id));
  }

  async hiddenWorks(id: string) {
    const authorId = normAuthorId(id);
    if (!authorId || !this.db.enabled) return [];
    return this.db.query<{ workId: string; title: string | null; hiddenAt: string }>(
      'select work_id as "workId", title, created_at as "hiddenAt" from author_hidden_works where author_id = $1 order by created_at desc',
      [authorId],
    );
  }

  private async requireOwner(id: string, user: AuthUser) {
    const authorId = normAuthorId(id);
    const row = authorId ? await this.claimRow(authorId) : null;
    if (!row) throw new NotFoundException('This profile has not been verified yet');
    if (row.user_id !== user.id) throw new ForbiddenException('Only the verified researcher can change this profile');
    return row.author_id;
  }

  async hideWork(id: string, user: AuthUser, body: { workId?: unknown; title?: unknown }) {
    const authorId = await this.requireOwner(id, user);
    const workId = typeof body.workId === 'string' && /^W\d+$/i.test(body.workId) ? body.workId.toUpperCase() : null;
    if (!workId) throw new BadRequestException('workId must be an OpenAlex work id (W…)');
    const title = typeof body.title === 'string' ? body.title.slice(0, 500) : null;
    await this.db.query(
      'insert into author_hidden_works (author_id, work_id, title, hidden_by) values ($1, $2, $3, $4) on conflict (author_id, work_id) do nothing',
      [authorId, workId, title, user.id],
    );
    return this.hiddenWorks(authorId);
  }

  async unhideWork(id: string, user: AuthUser, workId: string) {
    const authorId = await this.requireOwner(id, user);
    await this.db.query('delete from author_hidden_works where author_id = $1 and work_id = $2', [authorId, workId.toUpperCase()]);
    return this.hiddenWorks(authorId);
  }

  // ---- Verifying a profile with a university email ----

  private codeHash(code: string, codeId: string) {
    return createHash('sha256').update(`${config.authSecret}:${codeId}:${code}`).digest('hex');
  }

  /**
   * Step 1: the researcher enters their university email. If it belongs to the profile's institution
   * (same web domain), confirming it verifies them automatically; any other university email goes to an
   * admin with "email confirmed" attached. A Google-signed-in account already proves its email.
   */
  async startEmailVerification(id: string, user: AuthUser, body: { email?: unknown }) {
    const authorId = normAuthorId(id);
    if (!authorId) throw new BadRequestException('Unrecognised researcher profile');
    if (!this.db.enabled) throw new ServiceUnavailableException('Accounts are not available');
    const existing = await this.claimRow(authorId);
    if (existing && existing.user_id !== user.id) throw new ConflictException('This profile has already been verified by someone else');
    const mine = await this.db.one<{ author_id: string }>('select author_id from author_claims where user_id = $1', [user.id]);
    if (mine && mine.author_id !== authorId) throw new ConflictException('Your account is already linked to another researcher profile');

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const m = email.match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!m) throw new BadRequestException('Enter a valid email address');
    const domain = m[1];
    if (FREE_MAIL.has(orgDomainOf(domain))) throw new BadRequestException('Please use your university email, not a personal one (Gmail, Outlook, Yahoo…)');

    const profile = await this.get(authorId);
    const instDomains = await this.cache
      .wrap(`inst-domains:v1:${authorId}`, 7 * 86_400, () => openalex.institutionDomains(profile.institutions.map((i) => i.id).filter((x): x is string => !!x)))
      .catch(() => [] as string[]);
    const matches = instDomains.includes(orgDomainOf(domain));
    if (!matches && !ACADEMIC_RE.test(domain))
      throw new BadRequestException(`That doesn't look like a university email. Use your email at ${profile.institutions[0]?.name ?? 'your university'}.`);

    // Signed in with Google using this same university address: the email is already proven.
    const acct = await this.db.one<{ email: string; email_verified: boolean }>('select email, email_verified from users where id = $1', [user.id]);
    if (acct?.email_verified && acct.email.toLowerCase() === email) {
      await this.finishEmailVerification(authorId, user.id, email, matches);
      return { status: matches ? 'verified' : 'review', ...(await this.claimInfo(authorId, user.id)) };
    }

    if (!mailEnabled()) throw new ServiceUnavailableException('Email codes are not switched on yet. Please use "Send for review" instead.');
    const recent = await this.db.one<{ n: number }>("select count(*)::int as n from email_codes where user_id = $1 and created_at > now() - interval '1 hour'", [user.id]);
    if ((recent?.n ?? 0) >= 4) throw new BadRequestException('Too many codes requested. Please try again in an hour.');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await this.db.one<{ id: string }>(
      `insert into email_codes (user_id, author_id, email, code_hash, domain_matches, expires_at)
       values ($1, $2, $3, '', $4, now() + interval '15 minutes') returning id`,
      [user.id, authorId, email, matches],
    );
    await this.db.query('update email_codes set code_hash = $2 where id = $1', [row!.id, this.codeHash(code, row!.id)]);
    try {
      await sendMail(
        email,
        `Your SciRah verification code: ${code}`,
        `Hello ${user.name || ''},

Your code to verify your researcher profile "${profile.name}" on SciRah is:

    ${code}

It expires in 15 minutes. If you did not ask for this, you can ignore this email.

— SciRah`,
      );
    } catch (e) {
      this.logger.warn(`Verification email failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('We could not send the email. Please try again later.');
    }
    return { status: 'code-sent', email, matches };
  }

  /** Step 2: the researcher types the 6-digit code from the email. */
  async confirmEmailVerification(id: string, user: AuthUser, body: { code?: unknown }) {
    const authorId = normAuthorId(id);
    if (!authorId) throw new BadRequestException('Unrecognised researcher profile');
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (code.length !== 6) throw new BadRequestException('Enter the 6-digit code from the email');
    const row = await this.db.one<{ id: string; email: string; code_hash: string; domain_matches: boolean; attempts: number }>(
      `select id, email, code_hash, domain_matches, attempts from email_codes
       where user_id = $1 and author_id = $2 and used_at is null and expires_at > now() order by created_at desc limit 1`,
      [user.id, authorId],
    );
    if (!row) throw new BadRequestException('The code has expired. Please ask for a new one.');
    if (row.attempts >= 5) throw new BadRequestException('Too many wrong tries. Please ask for a new code.');
    const a = Buffer.from(this.codeHash(code, row.id));
    const b = Buffer.from(row.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.db.query('update email_codes set attempts = attempts + 1 where id = $1', [row.id]);
      throw new BadRequestException('That code is not right. Check the email and try again.');
    }
    await this.db.query('update email_codes set used_at = now() where id = $1', [row.id]);
    await this.finishEmailVerification(authorId, user.id, row.email, row.domain_matches);
    return { status: row.domain_matches ? 'verified' : 'review', ...(await this.claimInfo(authorId, user.id)) };
  }

  private async finishEmailVerification(authorId: string, userId: string, email: string, matches: boolean) {
    if (matches) {
      await this.db.tx(async (c) => {
        await c.query('delete from author_claims where user_id = $1 and author_id <> $2', [userId, authorId]);
        await c.query(
          `insert into author_claims (author_id, user_id, orcid, method, verified_email) values ($1, $2, (select orcid from users where id = $2), 'email', $3)
           on conflict (author_id) do update set user_id = excluded.user_id, method = 'email', verified_email = excluded.verified_email, updated_at = now()`,
          [authorId, userId, email],
        );
        await c.query("update author_claim_requests set status = 'approved', reviewed_at = now(), review_note = 'University email confirmed' where author_id = $1 and user_id = $2 and status = 'pending'", [authorId, userId]);
        await c.query("update users set role = 'researcher' where id = $1", [userId]);
      });
    } else {
      // A real university address, but not at this profile's institution: an admin decides.
      await this.db.query(
        `insert into author_claim_requests (author_id, user_id, message, evidence_url) values ($1, $2, $3, null)
         on conflict (author_id, user_id) where status = 'pending' do update set message = excluded.message`,
        [authorId, userId, `University email confirmed by code: ${email} (domain not linked to the profile's current institution)`],
      );
    }
  }

  private claimRow(authorId: string) {
    return this.db.enabled
      ? this.db.one<ClaimRow>('select * from author_claims where author_id = $1', [authorId]).catch(() => null)
      : Promise.resolve(null);
  }

  // ---- SciRah Score ----

  async score(id: string) {
    const authorId = normAuthorId(id);
    if (!authorId) throw new BadRequestException('The SciRah Score is available for OpenAlex researcher profiles');
    const bare = authorId.split(':')[1];
    const profile = await this.get(authorId);
    const works = await this.cache.wrap(`score:works:v1:${bare}`, 12 * 3600, () => openalex.authorScoreWorks(bare));
    const claim = await this.claimRow(authorId);
    const result = sciRahScore({
      works: works.works,
      totalWorks: Math.max(profile.worksCount ?? 0, works.total),
      hIndex: profile.hIndex ?? 0,
      patents: claim?.patents ?? 0,
      students: claim?.students ?? 0,
    });
    return { authorId, ...result, claimed: !!claim, papersCounted: works.works.length, totalWorks: works.total };
  }

  // ---- Numbers from several sources ----

  /**
   * The researcher's numbers side by side: OpenAlex, Semantic Scholar (matched through the researcher's
   * own papers, not just the name), and the numbers the verified researcher entered themselves.
   */
  async metrics(id: string) {
    const authorId = normAuthorId(id);
    if (!authorId) throw new BadRequestException('Metrics are available for OpenAlex researcher profiles');
    const profile = await this.get(authorId);
    const dois = profile.papers.map((p) => p.ids.doi).filter((d): d is string => !!d);
    const sem = await this.cache.wrap(`metrics:s2:v1:${authorId}`, 24 * 3600, () => s2.authorMetricsByDois(profile.name, dois).catch(() => null));
    const raw = await this.cache.wrap(`metrics:checked:v2:${authorId}`, 24 * 3600, () => this.crossChecked(authorId).catch(() => null));
    const checked = raw ? summarise(raw, await this.hiddenIds(authorId)) : null;
    const claim = await this.claimRow(authorId);
    const hasVerified = claim && [claim.citations, claim.h_index, claim.i10_index, claim.works].some((v) => v !== null);
    return {
      openalex: { works: profile.worksCount ?? null, citations: profile.citationCount ?? null, hIndex: profile.hIndex ?? null, i10Index: profile.i10Index ?? null },
      crossref: checked?.crossref ?? null,
      combined: checked?.combined ?? null,
      semanticScholar: sem
        ? { works: sem.paperCount ?? null, citations: sem.citationCount ?? null, hIndex: sem.hIndex ?? null, i10Index: null, url: sem.url }
        : null,
      verified: hasVerified
        ? {
            works: claim.works,
            citations: claim.citations,
            hIndex: claim.h_index,
            i10Index: claim.i10_index,
            source: claim.metrics_source,
            url: claim.metrics_url,
            updatedAt: claim.metrics_updated_at,
          }
        : null,
    };
  }

  /**
   * Cross-check an author's citations paper by paper: for every work in their OpenAlex profile, look up the
   * same DOI in Crossref and Semantic Scholar, keep the highest count any of them reports, and recompute
   * total citations, h-index and i10-index from that. Also returns Crossref's own figures.
   */
  private async crossChecked(authorId: string) {
    const works = await openalex.authorWorkCitations(authorId.split(':')[1]);
    const dois = [...new Set(works.map((w) => w.doi).filter((d): d is string => !!d))];
    const [cr, ss] = await Promise.all([
      crossref.citationsByDois(dois).catch(() => new Map<string, number>()),
      s2.citationsByDois(dois).catch(() => new Map<string, number>()),
    ]);
    // Per paper: OpenAlex id, highest count found, and Crossref's count (if Crossref knows the DOI).
    return works.map((w) => ({
      id: w.id,
      best: Math.max(w.citations, w.doi ? (cr.get(w.doi) ?? 0) : 0, w.doi ? (ss.get(w.doi) ?? 0) : 0),
      crossref: w.doi && cr.has(w.doi) ? cr.get(w.doi)! : null,
    }));
  }

  // ---- Verifying a profile: ORCID sign-in (automatic) or an admin-reviewed request ----

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
    if (!this.orcidEnabled) throw new ServiceUnavailableException('ORCID verification is not configured (ORCID_CLIENT_ID / ORCID_CLIENT_SECRET)');
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
    if (!this.orcidEnabled) throw new ServiceUnavailableException('ORCID verification is not configured on the server');
    const authorId = normAuthorId(body.authorId);
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
    if (!profileOrcid || profileOrcid !== bareOrcid(tok.orcid))
      throw new ForbiddenException(
        profileOrcid
          ? 'Your ORCID iD does not match this researcher profile. Use “Request verification” instead and an admin will check it.'
          : 'This profile has no ORCID iD linked yet. Use “Request verification” instead and an admin will check it.',
      );

    // The ORCID proves ownership: a user owns one profile, and a re-claim moves the profile to the new account.
    const row = await this.db.tx(async (c) => {
      await c.query('delete from author_claims where user_id = $1 and author_id <> $2', [user.id, authorId]);
      const r = await c.query<ClaimRow>(
        `insert into author_claims (author_id, user_id, orcid, method) values ($1, $2, $3, 'orcid')
         on conflict (author_id) do update set user_id = excluded.user_id, orcid = excluded.orcid, method = 'orcid', updated_at = now()
         returning *`,
        [authorId, user.id, profileOrcid],
      );
      await c.query('update users set orcid = coalesce(orcid, $2) where id = $1', [user.id, profileOrcid]);
      return r.rows[0];
    });
    return this.presentClaim(row, user.id);
  }

  async requestClaim(user: AuthUser, id: string, body: { message?: unknown; evidenceUrl?: unknown }) {
    const authorId = normAuthorId(id);
    if (!authorId) throw new BadRequestException('Unrecognised researcher profile');
    const existing = await this.claimRow(authorId);
    if (existing?.user_id === user.id) throw new ConflictException('You have already verified this profile');
    const mine = await this.db.one<{ author_id: string }>('select author_id from author_claims where user_id = $1', [user.id]);
    if (mine) throw new ConflictException('Your account is already linked to another researcher profile');
    const evidence = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim().slice(0, 500) : '';
    if (evidence && !/^https?:\/\//i.test(evidence)) throw new BadRequestException('The link must start with http:// or https://');
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message && !evidence)
      throw new BadRequestException('Tell us how we can confirm it is you, e.g. a link to your university staff page or Google Scholar profile');
    await this.db.query(
      `insert into author_claim_requests (author_id, user_id, message, evidence_url) values ($1, $2, $3, $4)
       on conflict (author_id, user_id) where status = 'pending' do update set message = excluded.message, evidence_url = excluded.evidence_url`,
      [authorId, user.id, message || null, evidence || null],
    );
    return this.claimInfo(authorId, user.id);
  }

  async listClaimRequests(status: string) {
    const s = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
    const rows = await this.db.query<{
      id: string;
      author_id: string;
      message: string | null;
      evidence_url: string | null;
      status: string;
      created_at: string;
      email: string;
      display_name: string | null;
      affiliation: string | null;
      orcid: string | null;
    }>(
      `select r.id, r.author_id, r.message, r.evidence_url, r.status, r.created_at, u.email, u.display_name, u.affiliation, u.orcid
       from author_claim_requests r join users u on u.id = r.user_id where r.status = $1 order by r.created_at desc limit 200`,
      [s],
    );
    // The claimed profile next to each request, so the admin can compare names, institutions and ORCID.
    return Promise.all(
      rows.map(async (r) => {
        const p = await this.get(r.author_id).catch(() => null);
        return { ...r, author: p ? { name: p.name, affiliation: p.institutions[0]?.name ?? p.affiliation ?? null, orcid: p.orcid ?? null, works: p.worksCount ?? null } : null };
      }),
    );
  }

  async reviewClaimRequest(id: string, body: { status?: unknown; note?: unknown }) {
    if (body.status !== 'approved' && body.status !== 'rejected') throw new BadRequestException('status must be approved or rejected');
    return this.db.tx(async (c) => {
      const { rows } = await c.query<{ author_id: string; user_id: string }>(
        `update author_claim_requests set status = $2, review_note = $3, reviewed_at = now() where id = $1 and status = 'pending'
         returning author_id, user_id`,
        [id, body.status, typeof body.note === 'string' ? body.note.slice(0, 500) : null],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException('Request not found or already reviewed');
      if (body.status === 'approved') {
        await c.query('delete from author_claims where user_id = $1 and author_id <> $2', [r.user_id, r.author_id]);
        await c.query(
          `insert into author_claims (author_id, user_id, orcid, method) values ($1, $2, (select orcid from users where id = $2), 'admin')
           on conflict (author_id) do update set user_id = excluded.user_id, method = 'admin', updated_at = now()`,
          [r.author_id, r.user_id],
        );
        await c.query("update users set role = 'researcher' where id = $1", [r.user_id]);
      }
      return { ok: true };
    });
  }

  async claimInfo(id: string, userId?: string) {
    const authorId = normAuthorId(id);
    const row = authorId ? await this.claimRow(authorId) : null;
    const pending =
      authorId && userId && this.db.enabled
        ? await this.db.one("select id from author_claim_requests where author_id = $1 and user_id = $2 and status = 'pending'", [authorId, userId])
        : null;
    return { ...(await this.presentClaim(row, userId)), requestPending: !!pending };
  }

  /** The verified researcher edits their numbers (e.g. from Google Scholar), patents and students. */
  async updateClaim(id: string, user: AuthUser, body: Record<string, unknown>) {
    const authorId = normAuthorId(id);
    const row = authorId ? await this.claimRow(authorId) : null;
    if (!row) throw new NotFoundException('This profile has not been verified yet');
    if (row.user_id !== user.id) throw new ForbiddenException('Only the verified researcher can edit this profile');
    const num = (key: string, cur: number | null, max: number, nullable: boolean) => {
      const v = body[key];
      if (v === undefined) return cur;
      if (nullable && (v === null || v === '')) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > max) throw new BadRequestException(`Enter a whole number between 0 and ${max.toLocaleString('en')}`);
      return n;
    };
    const metricsTouched = ['citations', 'hIndex', 'i10Index', 'works', 'metricsSource', 'metricsUrl'].some((k) => body[k] !== undefined);
    const source = body.metricsSource === undefined ? row.metrics_source : typeof body.metricsSource === 'string' ? body.metricsSource.trim().slice(0, 60) || null : null;
    const url = body.metricsUrl === undefined ? row.metrics_url : typeof body.metricsUrl === 'string' ? body.metricsUrl.trim().slice(0, 500) || null : null;
    if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException('The link must start with http:// or https://');
    const updated = await this.db.one<ClaimRow>(
      `update author_claims set patents = $2, students = $3, citations = $4, h_index = $5, i10_index = $6, works = $7,
         metrics_source = $8, metrics_url = $9, metrics_updated_at = case when $10 then now() else metrics_updated_at end, updated_at = now()
       where author_id = $1 returning *`,
      [
        row.author_id,
        num('patents', row.patents, 1000, false),
        num('students', row.students, 1000, false),
        num('citations', row.citations, 10_000_000, true),
        num('hIndex', row.h_index, 1000, true),
        num('i10Index', row.i10_index, 100_000, true),
        num('works', row.works, 100_000, true),
        source,
        url,
        metricsTouched,
      ],
    );
    return this.presentClaim(updated, user.id);
  }

  private async presentClaim(row: ClaimRow | null, userId?: string) {
    const owner = row
      ? await this.db
          .one<OwnerRow>('select id, display_name, email, avatar_url, affiliation, position, bio, interests, website, scholar_url from users where id = $1', [
            row.user_id,
          ])
          .catch(() => null)
      : null;
    return {
      claimable: this.orcidEnabled,
      // University-email codes can be sent (email provider configured).
      emailCodes: mailEnabled(),
      verifiedEmailDomain: row?.verified_email ? row.verified_email.split('@')[1] : null,
      claimed: !!row,
      mine: !!row && row.user_id === userId,
      method: row?.method ?? null,
      patents: row?.patents ?? 0,
      students: row?.students ?? 0,
      metrics: row
        ? { works: row.works, citations: row.citations, hIndex: row.h_index, i10Index: row.i10_index, source: row.metrics_source, url: row.metrics_url }
        : null,
      // The verified researcher's own SciRah profile (public).
      owner: owner
        ? {
            userId: owner.id,
            name: owner.display_name || owner.email.split('@')[0],
            avatarUrl: owner.avatar_url,
            affiliation: owner.affiliation,
            position: owner.position,
            bio: owner.bio,
            interests: owner.interests ?? [],
            website: owner.website,
            scholarUrl: owner.scholar_url,
          }
        : null,
    };
  }
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'yandex.com', 'mail.com', 'zoho.com', 'qq.com', '163.com', '126.com']);
/** University-style email domains: .edu, .edu.pk, .ac.uk, .ac.in … */
const ACADEMIC_RE = /(\.edu|\.edu\.[a-z]{2}|\.ac\.[a-z]{2})$/i;
const orgDomainOf = (domain: string) => openalex.orgDomain(domain);

/** Combined and Crossref figures from the per-paper counts, leaving out papers the researcher removed. */
function summarise(rows: { id?: string; best: number; crossref: number | null }[], hidden: Set<string>) {
  const kept = rows.filter((r) => !r.id || !hidden.has(r.id));
  const cr = kept.map((r) => r.crossref).filter((c): c is number => c !== null);
  return {
    combined: { ...citationStats(kept.map((r) => r.best)), works: kept.length },
    crossref: cr.length ? { ...citationStats(cr), works: cr.length } : null,
  };
}

/** Total citations, h-index and i10-index from a list of per-paper citation counts. */
function citationStats(counts: number[]) {
  const sorted = [...counts].sort((a, b) => b - a);
  let h = 0;
  while (h < sorted.length && sorted[h] >= h + 1) h++;
  return { citations: sorted.reduce((a, b) => a + b, 0), hIndex: h, i10Index: sorted.filter((c) => c >= 10).length };
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

  /** Type-ahead suggestions while typing in the search box: ?kind=authors|subjects&q=… */
  @Get('suggest')
  suggest(@Query('q') q?: string, @Query('kind') kind?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return [];
    return this.authors.suggest(kind === 'subjects' ? 'subjects' : 'authors', query.slice(0, 100));
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

  /** Admins: "This is me" requests waiting for review. */
  @Get('claim-requests')
  @UseGuards(AuthGuard)
  claimRequests(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    if (!isAdmin(user)) throw new ForbiddenException('Admins only');
    return this.authors.listClaimRequests(status ?? 'pending');
  }

  @Patch('claim-requests/:requestId')
  @UseGuards(AuthGuard)
  reviewClaimRequest(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string, @Body() body: { status?: unknown; note?: unknown }) {
    if (!isAdmin(user)) throw new ForbiddenException('Admins only');
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new BadRequestException('Invalid id');
    return this.authors.reviewClaimRequest(requestId, body ?? {});
  }

  @Get(':id/score')
  score(@Param('id') id: string) {
    return this.authors.score(id);
  }

  @Get(':id/metrics')
  metrics(@Param('id') id: string) {
    return this.authors.metrics(id);
  }

  @Get(':id/claim')
  @UseGuards(OptionalAuthGuard)
  claimInfo(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.authors.claimInfo(id, user?.id);
  }

  @Post(':id/claim-request')
  @UseGuards(AuthGuard)
  requestClaim(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: { message?: unknown; evidenceUrl?: unknown }) {
    return this.authors.requestClaim(user, id, body ?? {});
  }

  @Patch(':id/claim')
  @UseGuards(AuthGuard)
  updateClaim(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.authors.updateClaim(id, user, body ?? {});
  }

  @Get(':id/hidden')
  hidden(@Param('id') id: string) {
    return this.authors.hiddenWorks(id);
  }

  /** The verified researcher removes a paper that isn't theirs from their profile. */
  @Post(':id/hidden')
  @UseGuards(AuthGuard)
  hide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { workId?: unknown; title?: unknown }) {
    return this.authors.hideWork(id, user, body ?? {});
  }

  @Delete(':id/hidden/:workId')
  @UseGuards(AuthGuard)
  unhide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('workId') workId: string) {
    if (!/^W\d+$/i.test(workId)) throw new BadRequestException('Invalid work id');
    return this.authors.unhideWork(id, user, workId);
  }

  /** Verify a profile with a university email: send a 6-digit code … */
  @Post(':id/verify-email')
  @UseGuards(AuthGuard)
  verifyEmail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { email?: unknown }) {
    return this.authors.startEmailVerification(id, user, body ?? {});
  }

  /** … and check it. */
  @Post(':id/verify-email/confirm')
  @UseGuards(AuthGuard)
  confirmEmail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { code?: unknown }) {
    return this.authors.confirmEmailVerification(id, user, body ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.authors.getVisible(id);
  }
}
