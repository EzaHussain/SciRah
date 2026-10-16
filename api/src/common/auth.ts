import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { config } from '../config.js';
import { CacheService } from './cache.service.js';

export type { AuthUser };
type AuthedRequest = Request & { user?: AuthUser | null };

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

/** Requires a valid SciRah session token. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    const user = token ? await this.auth.verify(token) : null;
    if (!user) throw new UnauthorizedException('Please sign in to use this feature');
    req.user = user;
    return true;
  }
}

/** Attaches the user if a valid token is present, but never blocks the request. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    req.user = token ? await this.auth.verify(token).catch(() => null) : null;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user ?? null;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
});

/** Per-user daily quota for calls that cost money (OpenAI summaries / voice-over). */
@Injectable()
export class AiQuota {
  constructor(private readonly cache: CacheService) {}

  async consume(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const n = await this.cache.incr(`quota:ai:${userId}:${day}`, 86_400);
    if (n > config.aiDailyLimit) {
      throw new HttpException(
        `Daily AI limit reached (${config.aiDailyLimit}). Please try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
