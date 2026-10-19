import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, OptionalAuthGuard, type AuthUser } from '../common/auth.js';
import { NewsService, SPANS } from './news.service.js';
import type { NewsRegion, NewsSpan } from './sources.js';

const region = (v?: string): NewsRegion => (v === 'pk' ? 'pk' : 'world');
const span = (v?: string): NewsSpan => (SPANS.includes(v as NewsSpan) ? (v as NewsSpan) : '7d');

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  /** News about any topic. */
  @Get()
  search(@Query('q') q?: string, @Query('region') r?: string, @Query('span') s?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('Please enter at least 2 characters');
    return this.news.search(query, region(r), span(s), 40);
  }

  /** The research paper a ScienceDaily story is about. */
  @Get('story-paper')
  storyPaper(@Query('url') url?: string) {
    return this.news.paperForStory(url);
  }

  /** Research news matched to the signed-in user's searches, alerts and saved papers (latest research news otherwise). */
  @Get('for-you')
  @UseGuards(OptionalAuthGuard)
  forYou(@CurrentUser() user: AuthUser | null, @Query('region') r?: string, @Query('span') s?: string) {
    return this.news.forYou(user?.id ?? null, region(r), span(s));
  }
}
