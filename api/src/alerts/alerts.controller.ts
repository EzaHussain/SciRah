import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthUser } from '../common/auth.js';
import { AlertsService } from './alerts.service.js';

type Json = Record<string, unknown>;

/** Topics the user gets updates on (auto-created from searches, or followed explicitly). */
@Controller('alerts')
@UseGuards(AuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.alerts.list(user.id);
  }

  @Post()
  follow(@CurrentUser() user: AuthUser, @Body() body: Json) {
    return this.alerts.follow(user.id, body ?? {});
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: Json) {
    return this.alerts.update(user.id, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.alerts.remove(user.id, id);
  }

  /** "Check now" for all of this user's topics (rate-limited to once a minute). */
  @Post('check')
  @HttpCode(200)
  check(@CurrentUser() user: AuthUser) {
    return this.alerts.checkUser(user.id, true);
  }
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('kind') kind?: string,
    @Query('unread') unread?: string,
  ) {
    // Opening notifications also checks any of this user's topics that are due (in the background).
    this.alerts.checkUser(user.id).catch(() => undefined);
    return this.alerts.notifications(user.id, {
      limit: limit ? Number(limit) : undefined,
      before: before ? Number(before) : undefined,
      kind,
      unread: unread === '1',
    });
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.alerts.unreadCount(user.id) };
  }

  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Body() body: Json) {
    return this.alerts.markRead(user.id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.alerts.removeNotification(user.id, id);
  }
}
