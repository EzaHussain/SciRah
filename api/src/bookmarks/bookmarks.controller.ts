import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../common/auth.js';
import { DbService } from '../common/db.service.js';
import type { AuthUser } from '../common/auth.js';
import { FeedService } from '../feed/feed.service.js';
import { PapersService } from '../papers/papers.service.js';

export interface BookmarkRow {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  source_url: string | null;
  is_open_access: boolean;
  created_at: string;
}

@Injectable()
export class BookmarksService {
  constructor(
    private readonly db: DbService,
    private readonly papers: PapersService,
    private readonly feed: FeedService,
  ) {}

  list(userId: string): Promise<BookmarkRow[]> {
    return this.db.query<BookmarkRow>(
      `select paper_id, title, authors, year, venue, doi, source_url, is_open_access, created_at
       from bookmarks where user_id = $1 order by created_at desc limit 500`,
      [userId],
    );
  }

  async ids(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ paper_id: string }>('select paper_id from bookmarks where user_id = $1 limit 2000', [userId]);
    return rows.map((r) => r.paper_id);
  }

  async add(userId: string, paperId: string) {
    // Metadata comes from our own lookup, not from the client.
    const paper = await this.papers.getPaper(paperId);
    await this.db.query(
      `insert into bookmarks (user_id, paper_id, title, authors, year, venue, doi, source_url, is_open_access, topics)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (user_id, paper_id) do update set title = excluded.title, authors = excluded.authors, year = excluded.year,
         venue = excluded.venue, doi = excluded.doi, source_url = excluded.source_url,
         is_open_access = excluded.is_open_access, topics = excluded.topics`,
      [
        userId,
        paper.id,
        paper.title.slice(0, 1000),
        paper.authors.slice(0, 25).map((a) => a.name),
        paper.year ?? null,
        paper.venue ?? null,
        paper.ids.doi ?? null,
        paper.sourceUrl ?? null,
        paper.isOpenAccess,
        JSON.stringify(paper.topics.slice(0, 10)),
      ],
    );
    this.feed.recordBookmark(userId, paper).catch(() => undefined);
    return { paperId: paper.id, saved: true };
  }

  async remove(userId: string, paperId: string) {
    const del = (id: string) =>
      this.db.query('delete from bookmarks where user_id = $1 and paper_id = $2 returning paper_id', [userId, id]);
    let removed = await del(paperId);
    // `add` stores the canonical id (e.g. doi:… → openalex:W…), so resolve it when the given id didn't match.
    if (!removed.length) {
      const paper = await this.papers.getPaper(paperId).catch(() => null);
      if (paper && paper.id !== paperId) removed = await del(paper.id);
    }
    this.feed.refreshInterests(userId).catch(() => undefined);
    return { paperId: removed[0]?.paper_id ?? paperId, saved: false };
  }
}

@Controller('bookmarks')
@UseGuards(AuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.bookmarks.list(user.id);
  }

  @Get('ids')
  ids(@CurrentUser() user: AuthUser) {
    return this.bookmarks.ids(user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() body: { paperId?: string }) {
    if (!body?.paperId || typeof body.paperId !== 'string') throw new BadRequestException('paperId is required');
    return this.bookmarks.add(user.id, body.paperId.trim());
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Query('paperId') paperId?: string) {
    if (!paperId) throw new BadRequestException('paperId is required');
    return this.bookmarks.remove(user.id, paperId);
  }
}
