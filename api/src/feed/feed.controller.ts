import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, OptionalAuthGuard } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @UseGuards(AuthGuard)
  personal(@CurrentUser() user: AuthUser) {
    return this.feed.personalFeed(user.id);
  }

  @Get('trending')
  @UseGuards(OptionalAuthGuard)
  trending(@CurrentUser() user: AuthUser | null, @Query('pk') pk?: string) {
    return this.feed.trending(user?.id ?? null, pk === '1' || pk === 'true');
  }
}
