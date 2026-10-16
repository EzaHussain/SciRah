import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { AuthGuard, CurrentUser } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { PapersService } from '../papers/papers.service.js';
import { AiService } from './ai.service.js';
import { isSummaryLang, isTranslationLang } from './languages.js';

function requireId(id?: unknown): string {
  if (!id || typeof id !== 'string') throw new BadRequestException('paperId is required');
  return id.trim();
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly papers: PapersService,
  ) {}

  /** Public: an already-generated summary (or null). Generating one requires sign-in. */
  @Get('summary')
  async cached(@Query('paperId') paperId?: string) {
    const paper = await this.papers.getPaper(requireId(paperId));
    return (await this.ai.peek(paper.id)) ?? null;
  }

  @Post('summary')
  @UseGuards(AuthGuard)
  summarize(@CurrentUser() user: AuthUser, @Body() body: { paperId?: string }) {
    return this.ai.summarize(requireId(body?.paperId), user.id);
  }

  @Post('translate')
  @UseGuards(AuthGuard)
  translate(@CurrentUser() user: AuthUser, @Body() body: { paperId?: string; lang?: string }) {
    const lang = body?.lang ?? 'ur';
    if (!isTranslationLang(lang)) throw new BadRequestException('Unsupported language');
    return this.ai.translate(requireId(body?.paperId), lang, user.id);
  }

  @Get('tts')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'audio/mpeg')
  @Header('Cache-Control', 'private, max-age=86400')
  async tts(@CurrentUser() user: AuthUser, @Query('paperId') paperId?: string, @Query('lang') lang?: string) {
    const audio = await this.ai.speak(requireId(paperId), isSummaryLang(lang) ? lang : 'en', user.id);
    return new StreamableFile(audio);
  }

  /** Public: the paper's AI illustration (404 until someone generates it). */
  @Get('graphic')
  async graphic(@Query('paperId') paperId: string | undefined, @Res({ passthrough: true }) res: ExpressResponse) {
    const paper = await this.papers.getPaper(requireId(paperId));
    const g = await this.ai.graphic(paper.id);
    if (!g) throw new NotFoundException('No graphic yet');
    res.set({ 'Content-Type': g.mime, 'Cache-Control': 'public, max-age=604800' });
    return new StreamableFile(g.image);
  }

  @Post('graphic')
  @UseGuards(AuthGuard)
  createGraphic(@CurrentUser() user: AuthUser, @Body() body: { paperId?: string }) {
    return this.ai.createGraphic(requireId(body?.paperId), user.id);
  }
}
