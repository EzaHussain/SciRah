import { Controller, Get, Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller.js';
import { AiController } from './ai/ai.controller.js';
import { AiService } from './ai/ai.service.js';
import { AlertsController, NotificationsController } from './alerts/alerts.controller.js';
import { AlertsService } from './alerts/alerts.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthorsController, AuthorsService } from './authors/authors.controller.js';
import { BookmarksController, BookmarksService } from './bookmarks/bookmarks.controller.js';
import { CommentsController } from './comments/comments.controller.js';
import { AiQuota, AuthGuard, OptionalAuthGuard } from './common/auth.js';
import { CacheService } from './common/cache.service.js';
import { DbService } from './common/db.service.js';
import { config } from './config.js';
import { ExploreController } from './explore/explore.controller.js';
import { FeedController } from './feed/feed.controller.js';
import { FeedService } from './feed/feed.service.js';
import { NewsController } from './news/news.controller.js';
import { NewsService } from './news/news.service.js';
import { PapersController } from './papers/papers.controller.js';
import { FullTextService } from './papers/fulltext.service.js';
import { InsightsService } from './papers/insights.service.js';
import { PapersService } from './papers/papers.service.js';
import { SeoController } from './seo/seo.controller.js';
import { ReaderController } from './reader/reader.controller.js';
import { ResearchersController, SubmissionsController, SubmissionsService } from './submissions/submissions.controller.js';
import { VenuesController } from './venues/venues.controller.js';
import { coreEnabled } from './papers/sources/core.js';
import { mailEnabled } from './common/mail.js';

@Controller('health')
class HealthController {
  constructor(
    private readonly db: DbService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  health() {
    return {
      ok: true,
      features: {
        database: this.db.enabled,
        accounts: this.db.enabled,
        googleSignIn: this.auth.googleEnabled,
        authSecretSet: config.authSecret.length >= 32,
        redis: !!config.redisUrl,
        semanticScholarKey: !!config.semanticScholarApiKey,
        core: coreEnabled(),
        aiSummaries: !!config.openaiApiKey,
        voiceOver: !!config.openaiApiKey,
        alerts: this.db.enabled && config.alertsEnabled,
        aiGraphics: !!config.openaiApiKey,
        orcidClaims: !!(config.orcidClientId && config.orcidClientSecret),
        universityEmailCodes: mailEnabled(),
        news: true,
      },
    };
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    PapersController,
    AuthorsController,
    BookmarksController,
    AiController,
    FeedController,
    CommentsController,
    AlertsController,
    NotificationsController,
    NewsController,
    VenuesController,
    ReaderController,
    SubmissionsController,
    ResearchersController,
    ExploreController,
    AdminController,
    SeoController,
  ],
  providers: [
    CacheService,
    DbService,
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    AiQuota,
    PapersService,
    InsightsService,
    FullTextService,
    SubmissionsService,
    AuthorsService,
    BookmarksService,
    AiService,
    FeedService,
    NewsService,
    AlertsService,
  ],
})
export class AppModule {}
