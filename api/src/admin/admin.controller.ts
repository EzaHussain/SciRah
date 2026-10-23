import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { isAdmin } from '../auth/auth.service.js';
import { AuthGuard, CurrentUser, type AuthUser } from '../common/auth.js';
import { DbService } from '../common/db.service.js';

/** Admin-only overview of everyone who has a SciRah account. */
@Controller('admin')
export class AdminController {
  constructor(private readonly db: DbService) {}

  @Get('users')
  @UseGuards(AuthGuard)
  async users(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('role') role?: string, @Query('page') page?: string) {
    if (!isAdmin(user)) throw new ForbiddenException('Admins only');
    const search = (q ?? '').trim().slice(0, 100);
    const roleFilter = ['reader', 'researcher', 'none', 'verified'].includes(role ?? '') ? role! : '';
    const p = Math.min(Math.max(Number(page) || 1, 1), 1000);
    const size = 50;

    const where: string[] = [];
    const args: unknown[] = [];
    if (search) {
      args.push(`%${search.toLowerCase()}%`);
      where.push(`(lower(u.email) like $${args.length} or lower(coalesce(u.display_name, '')) like $${args.length})`);
    }
    if (roleFilter === 'none') where.push('u.role is null');
    else if (roleFilter === 'verified') where.push('c.author_id is not null');
    else if (roleFilter) {
      args.push(roleFilter);
      where.push(`u.role = $${args.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const rows = await this.db.query<{
      id: string;
      email: string;
      name: string | null;
      role: string | null;
      affiliation: string | null;
      google: boolean;
      password: boolean;
      created_at: string;
      last_login_at: string | null;
      author_id: string | null;
      method: string | null;
      saved: number;
      total: number;
    }>(
      `select u.id, u.email, u.display_name as name, u.role, u.affiliation, u.google_sub is not null as google,
              u.password_hash is not null as password, u.created_at, u.last_login_at, c.author_id, c.method,
              (select count(*)::int from bookmarks b where b.user_id = u.id) as saved,
              count(*) over ()::int as total
       from users u left join author_claims c on c.user_id = u.id
       ${whereSql}
       order by u.created_at desc limit ${size} offset ${(p - 1) * size}`,
      args,
    );
    const totals = await this.db.one<{ users: number; researchers: number; readers: number; no_role: number; verified: number; last7: number; active7: number }>(
      `select count(*)::int as users,
              count(*) filter (where role = 'researcher')::int as researchers,
              count(*) filter (where role = 'reader')::int as readers,
              count(*) filter (where role is null)::int as no_role,
              (select count(*)::int from author_claims) as verified,
              count(*) filter (where created_at > now() - interval '7 days')::int as last7,
              count(*) filter (where last_login_at > now() - interval '7 days')::int as active7
       from users`,
    );
    return {
      totals,
      page: p,
      pageSize: size,
      matching: rows[0]?.total ?? 0,
      users: rows.map(({ total: _t, ...r }) => r),
    };
  }
}
