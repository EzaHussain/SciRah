import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isAdmin } from '../auth/auth.service.js';
import { AuthGuard, CurrentUser, type AuthUser } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { PapersService, userPaperToPaper, type UserPaperRow } from '../papers/papers.service.js';
import { normalizeDoi } from '../papers/types.js';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Manually adding papers. A DOI is looked up in the scholarly databases first — if the paper already
 * exists there, the user is simply sent to it. Otherwise the details are stored (bibliographic data
 * only, never the paper itself) and shown on SciRah once an admin approves them. Admins' own
 * submissions are approved straight away.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly db: DbService,
    private readonly papers: PapersService,
    private readonly cache: CacheService,
  ) {}

  /** Is this DOI already known to SciRah's sources? */
  async lookupDoi(raw: unknown): Promise<{ found: boolean; paperId?: string; title?: string; doi: string }> {
    const doi = normalizeDoi(typeof raw === 'string' ? raw : '');
    if (!doi) throw new BadRequestException('Please enter a valid DOI, e.g. 10.1038/s41586-020-2649-2');
    const paper = await this.papers.getPaper(`doi:${doi}`).catch(() => null);
    return paper ? { found: true, paperId: paper.id, title: paper.title, doi } : { found: false, doi };
  }

  async create(user: AuthUser, body: Record<string, unknown>) {
    const n = await this.cache.incr(`rl:submit:${user.id}`, 86_400);
    if (n > 20) throw new BadRequestException('You can add up to 20 papers per day.');

    const title = str(body.title, 600);
    if (title.length < 5) throw new BadRequestException('Please enter the paper’s title');
    const authors = (Array.isArray(body.authors) ? body.authors : str(body.authors, 4000).split(/[,;\n]/))
      .map((a) => str(a, 200))
      .filter(Boolean)
      .slice(0, 100);
    if (!authors.length) throw new BadRequestException('Please list at least one author');
    const year = Number(body.year);
    const validYear = Number.isInteger(year) && year >= 1800 && year <= new Date().getFullYear() + 1 ? year : null;
    const doi = body.doi ? normalizeDoi(str(body.doi, 300)) : undefined;
    if (body.doi && !doi) throw new BadRequestException('That DOI doesn’t look right (it should start with 10.)');
    if (doi) {
      const known = await this.lookupDoi(doi);
      if (known.found) return { existing: true, paperId: known.paperId };
    }
    let url = str(body.url, 1000) || null;
    if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException('The link must start with http:// or https://');
    if (url) url = new URL(url).toString();

    // Admins and verified researchers (who own a claimed profile) publish straight away; others are reviewed.
    const verified = await this.db.one('select 1 from author_claims where user_id = $1', [user.id]);
    const status = isAdmin(user) || verified ? 'approved' : 'pending';
    const row = await this.db.one<UserPaperRow>(
      `insert into user_papers (submitted_by, title, authors, year, venue, doi, url, abstract, status, reviewed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $9 = 'approved' then now() end) returning *`,
      [user.id, title, authors, validYear, str(body.venue, 300) || null, doi ?? null, url, str(body.abstract, 8000) || null, status],
    );
    return { existing: false, submission: present(row!) };
  }

  async mine(userId: string) {
    const rows = await this.db.query<UserPaperRow>('select * from user_papers where submitted_by = $1 order by created_at desc limit 100', [userId]);
    return rows.map(present);
  }

  async list(status: string) {
    const s = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
    const rows = await this.db.query<UserPaperRow & { submitter_email: string | null }>(
      `select p.*, u.email as submitter_email from user_papers p left join users u on u.id = p.submitted_by
       where p.status = $1 order by p.created_at desc limit 200`,
      [s],
    );
    return rows.map((r) => ({ ...present(r), submitterEmail: r.submitter_email }));
  }

  async review(id: string, body: { status?: unknown; note?: unknown }) {
    if (body.status !== 'approved' && body.status !== 'rejected') throw new BadRequestException('status must be approved or rejected');
    const row = await this.db.one<UserPaperRow>(
      `update user_papers set status = $2, review_note = $3, reviewed_at = now() where id = $1 returning *`,
      [id, body.status, str(body.note, 500) || null],
    );
    if (!row) throw new NotFoundException('Submission not found');
    await this.cache.del(`paper:v1:scirah:${id}`);
    return present(row);
  }
}

function present(r: UserPaperRow) {
  return {
    id: r.id,
    paperId: `scirah:${r.id}`,
    status: r.status,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    paper: userPaperToPaper(r),
  };
}

@Controller('submissions')
@UseGuards(AuthGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('lookup')
  lookup(@Query('doi') doi?: string) {
    return this.submissions.lookupDoi(doi);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.submissions.create(user, body ?? {});
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.submissions.mine(user.id);
  }

  /** Admins: the review queue. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    if (!isAdmin(user)) throw new ForbiddenException('Only SciRah admins can review submissions');
    return this.submissions.list(status ?? 'pending');
  }

  @Patch(':id')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: unknown; note?: unknown }) {
    if (!isAdmin(user)) throw new ForbiddenException('Only SciRah admins can review submissions');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('Invalid id');
    return this.submissions.review(id, body ?? {});
  }
}

/** Public SciRah researcher pages: the profile a researcher wrote, plus the papers they added. */
@Controller('researchers')
export class ResearchersController {
  constructor(private readonly db: DbService) {}

  @Get(':userId')
  async get(@Param('userId') userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new BadRequestException('Invalid id');
    const u = await this.db.one<{
      id: string;
      display_name: string | null;
      email: string;
      avatar_url: string | null;
      role: string | null;
      affiliation: string | null;
      position: string | null;
      bio: string | null;
      interests: string[];
      website: string | null;
      scholar_url: string | null;
      orcid: string | null;
      claimed_author_id: string | null;
    }>(
      `select id, display_name, email, avatar_url, role, affiliation, position, bio, interests, website, scholar_url, orcid,
         (select author_id from author_claims c where c.user_id = users.id) as claimed_author_id
       from users where id = $1`,
      [userId],
    );
    if (!u || u.role !== 'researcher') throw new NotFoundException('Researcher not found');
    const papers = await this.db.query<UserPaperRow>(
      "select * from user_papers where submitted_by = $1 and status = 'approved' order by year desc nulls last, created_at desc limit 200",
      [userId],
    );
    return {
      userId: u.id,
      name: u.display_name || u.email.split('@')[0],
      avatarUrl: u.avatar_url,
      affiliation: u.affiliation,
      position: u.position,
      bio: u.bio,
      interests: u.interests ?? [],
      website: u.website,
      scholarUrl: u.scholar_url,
      orcid: u.orcid,
      claimedAuthorId: u.claimed_author_id,
      papers: papers.map(userPaperToPaper).filter(Boolean),
    };
  }
}
