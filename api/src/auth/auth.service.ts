import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { CacheService } from '../common/cache.service.js';
import { DbService } from '../common/db.service.js';
import { hashPassword, signToken, verifyPassword, verifyToken } from './crypto.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface PublicUser extends AuthUser {
  hasPassword: boolean;
  googleLinked: boolean;
  autoAlerts: boolean;
  /** Can review manually added papers (email listed in ADMIN_EMAILS). */
  isAdmin: boolean;
  createdAt: string;
}

export const isAdmin = (u: { email: string }) => config.adminEmails.includes(u.email.toLowerCase());

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token_version: number;
  auto_alerts: boolean;
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_COLS = 'id,email,password_hash,google_sub,display_name,avatar_url,token_version,auto_alerts,created_at';

function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.display_name || u.email.split('@')[0],
    avatarUrl: u.avatar_url ?? undefined,
    hasPassword: !!u.password_hash,
    googleLinked: !!u.google_sub,
    autoAlerts: u.auto_alerts,
    isAdmin: isAdmin(u),
    createdAt: u.created_at,
  };
}

let warnedSecret = false;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  private userCache = new Map<string, { user: AuthUser; ver: number; expiresAt: number }>();

  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
  ) {
    if (config.authSecret.length >= 32) this.secret = config.authSecret;
    else {
      // Dev convenience: a random per-process secret (everyone is signed out on restart).
      this.secret = randomBytes(32).toString('hex');
      if (!warnedSecret) {
        warnedSecret = true;
        this.logger.warn('AUTH_SECRET missing or shorter than 32 characters — using a temporary secret; sessions reset on every restart');
      }
    }
  }

  get googleEnabled() {
    return !!(config.googleClientId && config.googleClientSecret);
  }

  // ---- sessions ----------------------------------------------------------------

  private issue(u: UserRow) {
    const token = signToken({ sub: u.id, ver: u.token_version }, this.secret, config.sessionDays * 86_400);
    return { token, user: toPublic(u) };
  }

  /** Verify a bearer token and return the user, cached briefly. */
  async verify(token: string): Promise<AuthUser | null> {
    const payload = verifyToken(token, this.secret);
    if (!payload || !this.db.enabled) return null;
    const hit = this.userCache.get(payload.sub);
    if (hit && hit.expiresAt > Date.now()) return hit.ver === payload.ver ? hit.user : null;

    const row = await this.db.one<UserRow>(`select ${USER_COLS} from users where id = $1`, [payload.sub]).catch(() => null);
    if (!row) return null;
    const user: AuthUser = { id: row.id, email: row.email, name: row.display_name || row.email.split('@')[0], avatarUrl: row.avatar_url ?? undefined };
    if (this.userCache.size > 5000) this.userCache.clear();
    this.userCache.set(row.id, { user, ver: row.token_version, expiresAt: Date.now() + 60_000 });
    return row.token_version === payload.ver ? user : null;
  }

  private forget(userId: string) {
    this.userCache.delete(userId);
  }

  // ---- email + password ----------------------------------------------------------

  private async throttle(key: string, max: number, windowSec: number) {
    const n = await this.cache.incr(`ratelimit:auth:${key}`, windowSec);
    if (n > max) throw new HttpException('Too many attempts. Please wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
  }

  async signup(input: { email?: unknown; password?: unknown; name?: unknown }, ip: string) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!EMAIL_RE.test(email) || email.length > 254) throw new BadRequestException('Please enter a valid email address');
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    if (password.length > 200) throw new BadRequestException('Password is too long');
    await this.throttle(`signup:${ip}`, 10, 3600);

    const existing = await this.db.one<UserRow>(`select ${USER_COLS} from users where lower(email) = $1`, [email]);
    if (existing) {
      if (!existing.password_hash && existing.google_sub)
        throw new ConflictException('This email is registered with Google. Use “Continue with Google” to sign in.');
      throw new ConflictException('An account with this email already exists. Please sign in instead.');
    }
    const hash = await hashPassword(password);
    const row = await this.db.one<UserRow>(
      `insert into users (email, password_hash, display_name, last_login_at) values ($1, $2, $3, now()) returning ${USER_COLS}`,
      [email, hash, name || null],
    );
    return this.issue(row!);
  }

  async login(input: { email?: unknown; password?: unknown }, ip: string) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password) throw new BadRequestException('Email and password are required');
    await this.throttle(`login:${ip}:${email}`, 10, 900);

    const row = await this.db.one<UserRow>(`select ${USER_COLS} from users where lower(email) = $1`, [email]);
    if (row && !row.password_hash && row.google_sub)
      throw new UnauthorizedException('This account uses Google sign-in. Click “Continue with Google”.');
    if (!row || !(await verifyPassword(password, row.password_hash))) throw new UnauthorizedException('Incorrect email or password');
    await this.db.query('update users set last_login_at = now() where id = $1', [row.id]);
    return this.issue(row);
  }

  // ---- Google OAuth (authorization-code flow; the web app hosts the redirect URI) ----

  private checkRedirectUri(redirectUri: unknown): string {
    if (typeof redirectUri !== 'string') throw new BadRequestException('redirectUri is required');
    let u: URL;
    try {
      u = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Invalid redirectUri');
    }
    if (!config.webOrigins.includes(u.origin) || u.pathname !== '/auth/google/callback' || u.search || u.hash)
      throw new BadRequestException(`redirectUri must be <WEB_ORIGIN>/auth/google/callback (got ${u.origin}${u.pathname})`);
    return `${u.origin}${u.pathname}`;
  }

  googleAuthUrl(redirectUri: unknown, state: unknown): { url: string } {
    if (!this.googleEnabled) throw new ServiceUnavailableException('Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
    if (typeof state !== 'string' || state.length < 16 || state.length > 200) throw new BadRequestException('Invalid state');
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: this.checkRedirectUri(redirectUri),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  async googleSignIn(input: { code?: unknown; redirectUri?: unknown }, ip: string) {
    if (!this.googleEnabled) throw new ServiceUnavailableException('Google sign-in is not configured on the server');
    if (typeof input.code !== 'string' || !input.code) throw new BadRequestException('Missing authorization code');
    const redirectUri = this.checkRedirectUri(input.redirectUri);
    await this.throttle(`google:${ip}`, 30, 900);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e: Error) => {
      throw new ServiceUnavailableException(`Could not reach Google: ${e.message}`);
    });
    const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !tok.access_token) {
      this.logger.warn(`Google token exchange failed: ${tok.error} ${tok.error_description ?? ''}`);
      const hint =
        tok.error === 'redirect_uri_mismatch'
          ? ` Add ${redirectUri} to "Authorized redirect URIs" of your Google OAuth client.`
          : tok.error === 'invalid_client'
            ? ' Check GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.'
            : '';
      throw new UnauthorizedException(`Google sign-in failed (${tok.error ?? tokenRes.status}).${hint}`);
    }

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const info = (await infoRes.json().catch(() => ({}))) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!infoRes.ok || !info.sub || !info.email) throw new UnauthorizedException('Google did not return an email address for this account');
    if (info.email_verified === false) throw new UnauthorizedException('Your Google email address is not verified');
    const email = info.email.toLowerCase();

    const row = await this.db.tx(async (c) => {
      const bySub = await c.query<UserRow>(`select ${USER_COLS} from users where google_sub = $1`, [info.sub]);
      if (bySub.rows[0]) {
        const r = await c.query<UserRow>(
          `update users set last_login_at = now(), avatar_url = coalesce(avatar_url, $2), display_name = coalesce(display_name, $3)
           where id = $1 returning ${USER_COLS}`,
          [bySub.rows[0].id, info.picture ?? null, info.name ?? null],
        );
        return r.rows[0];
      }
      // Same (Google-verified) email as an existing password account: link them.
      const byEmail = await c.query<UserRow>(`select ${USER_COLS} from users where lower(email) = $1`, [email]);
      if (byEmail.rows[0]) {
        const r = await c.query<UserRow>(
          `update users set google_sub = $2, email_verified = true, last_login_at = now(),
             avatar_url = coalesce(avatar_url, $3), display_name = coalesce(display_name, $4)
           where id = $1 returning ${USER_COLS}`,
          [byEmail.rows[0].id, info.sub, info.picture ?? null, info.name ?? null],
        );
        return r.rows[0];
      }
      const r = await c.query<UserRow>(
        `insert into users (email, email_verified, google_sub, display_name, avatar_url, last_login_at)
         values ($1, true, $2, $3, $4, now()) returning ${USER_COLS}`,
        [email, info.sub, info.name ?? null, info.picture ?? null],
      );
      return r.rows[0];
    });
    return this.issue(row);
  }

  // ---- account ---------------------------------------------------------------------

  async me(userId: string): Promise<PublicUser> {
    const row = await this.db.one<UserRow>(`select ${USER_COLS} from users where id = $1`, [userId]);
    if (!row) throw new UnauthorizedException('Account not found');
    return toPublic(row);
  }

  async update(userId: string, input: { name?: unknown; autoAlerts?: unknown }): Promise<PublicUser> {
    const sets: string[] = [];
    const vals: unknown[] = [userId];
    if (typeof input.name === 'string') {
      const name = input.name.trim().slice(0, 80);
      if (!name) throw new BadRequestException('Name cannot be empty');
      vals.push(name);
      sets.push(`display_name = $${vals.length}`);
    }
    if (typeof input.autoAlerts === 'boolean') {
      vals.push(input.autoAlerts);
      sets.push(`auto_alerts = $${vals.length}`);
    }
    if (sets.length) await this.db.query(`update users set ${sets.join(', ')} where id = $1`, vals);
    this.forget(userId);
    return this.me(userId);
  }

  async changePassword(userId: string, input: { currentPassword?: unknown; newPassword?: unknown }) {
    const next = typeof input.newPassword === 'string' ? input.newPassword : '';
    if (next.length < 8 || next.length > 200) throw new BadRequestException('New password must be at least 8 characters');
    const row = await this.db.one<UserRow>(`select ${USER_COLS} from users where id = $1`, [userId]);
    if (!row) throw new UnauthorizedException('Account not found');
    // Google-only accounts may set a first password without a current one.
    if (row.password_hash && !(await verifyPassword(String(input.currentPassword ?? ''), row.password_hash)))
      throw new UnauthorizedException('Current password is incorrect');
    const updated = await this.db.one<UserRow>(
      `update users set password_hash = $2, token_version = token_version + 1 where id = $1 returning ${USER_COLS}`,
      [userId, await hashPassword(next)],
    );
    this.forget(userId);
    return this.issue(updated!);
  }

  /** Invalidate every existing session for this user. */
  async signOutEverywhere(userId: string) {
    await this.db.query('update users set token_version = token_version + 1 where id = $1', [userId]);
    this.forget(userId);
    return { ok: true };
  }

  async deleteAccount(userId: string) {
    await this.db.query('delete from users where id = $1', [userId]);
    this.forget(userId);
    return { deleted: true };
  }
}
