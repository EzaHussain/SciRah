import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthUser } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';

interface CommentRow {
  id: string;
  paper_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
}

const toDto = (r: CommentRow) => ({
  id: r.id,
  paperId: r.paper_id,
  userId: r.user_id,
  body: r.body,
  createdAt: r.created_at,
  author: { name: r.display_name || r.email.split('@')[0] || 'Researcher', avatarUrl: r.avatar_url ?? null },
});

const SELECT = `select c.id, c.paper_id, c.user_id, c.body, c.created_at, u.display_name, u.email, u.avatar_url
  from comments c join users u on u.id = c.user_id`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('comments')
export class CommentsController {
  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async list(@Query('paperId') paperId?: string) {
    if (!paperId) throw new BadRequestException('paperId is required');
    const rows = await this.db.query<CommentRow>(`${SELECT} where c.paper_id = $1 order by c.created_at asc limit 200`, [paperId]);
    return rows.map(toDto);
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: AuthUser, @Body() body: { paperId?: string; body?: string }) {
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!body?.paperId || typeof body.paperId !== 'string') throw new BadRequestException('paperId is required');
    if (!text || text.length > 2000) throw new BadRequestException('Comment must be 1–2000 characters');
    const n = await this.cache.incr(`ratelimit:comments:${user.id}`, 600);
    if (n > 20) throw new HttpException('You are commenting too fast. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);

    const inserted = await this.db.one<{ id: string }>(
      'insert into comments (paper_id, user_id, body) values ($1, $2, $3) returning id',
      [body.paperId.slice(0, 300), user.id, text],
    );
    const row = await this.db.one<CommentRow>(`${SELECT} where c.id = $1`, [inserted!.id]);
    return toDto(row!);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException('Comment not found');
    const rows = await this.db.query('delete from comments where id = $1 and user_id = $2 returning id', [id, user.id]);
    if (!rows.length) throw new NotFoundException('Comment not found');
    return { id, deleted: true };
  }
}
