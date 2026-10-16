import { createHash } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { config } from '../config.js';
import { AiQuota } from '../common/auth.js';
import { CacheService } from '../common/cache.service.js';
import { fetchJson, UpstreamError } from '../common/http.js';
import { DbService } from '../common/db.service.js';
import { PapersService } from '../papers/papers.service.js';
import { getFullText } from '../papers/sources/core.js';
import type { Paper } from '../papers/types.js';
import { LANGS, translateInstructions, type SummaryLang, type TranslationLang } from './languages.js';

export interface SummaryRecord {
  paperId: string;
  summaryEn: string;
  /** Translations generated so far, keyed by language code (ur, hi, ar, zh, fr, es). */
  translations: Partial<Record<TranslationLang, string>>;
  basis: 'abstract' | 'fulltext';
  model: string;
}

const SUMMARY_INSTRUCTIONS = `You summarise research papers for university students and early-career researchers in Pakistan.
Write a 3-5 sentence plain-language summary covering: the question the study asks, how it was done, the main finding, and why it matters.
Avoid jargon; if a technical term is unavoidable, explain it in a few words. Use only information present in the text — never invent results, numbers or claims.
Output only the summary as plain text, with no heading, bullet points or markdown.`;

const MIN_ABSTRACT = 200;
const MAX_INPUT_CHARS = 15_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly db: DbService,
    private readonly papers: PapersService,
    private readonly cache: CacheService,
    private readonly quota: AiQuota,
  ) {}

  /** Returns a cached summary (with its translations) if one exists, without generating one. */
  async peek(paperId: string): Promise<SummaryRecord | null> {
    if (!this.db.enabled) return null;
    const data = await this.db.one<{ paper_id: string; summary_en: string; basis: 'abstract' | 'fulltext'; model: string }>(
      'select paper_id, summary_en, basis, model from paper_summaries where paper_id = $1',
      [paperId],
    );
    if (!data) return null;
    const rows = await this.db.query<{ lang: TranslationLang; text: string }>(
      'select lang, text from paper_translations where paper_id = $1',
      [paperId],
    );
    return {
      paperId: data.paper_id,
      summaryEn: data.summary_en,
      translations: Object.fromEntries(rows.map((r) => [r.lang, r.text])),
      basis: data.basis,
      model: data.model,
    };
  }

  async summarize(paperId: string, userId: string): Promise<SummaryRecord> {
    const paper = await this.papers.getPaper(paperId);
    const existing = await this.peek(paper.id);
    if (existing) return existing;

    return this.cache.wrap(`ai:summary:${paper.id}`, 300, async () => {
      const { text, basis } = await this.summaryInput(paper);
      await this.quota.consume(userId);
      const summaryEn = await this.chat(SUMMARY_INSTRUCTIONS, text);
      const record: SummaryRecord = { paperId: paper.id, summaryEn, translations: {}, basis, model: config.openaiModel };
      await this.db
        .query(
          `insert into paper_summaries (paper_id, summary_en, basis, model) values ($1, $2, $3, $4)
           on conflict (paper_id) do update set summary_en = excluded.summary_en, basis = excluded.basis,
             model = excluded.model, updated_at = now()`,
          [paper.id, summaryEn, basis, config.openaiModel],
        )
        .catch((e: Error) => this.logger.error(`Saving summary failed: ${e.message}`));
      return record;
    });
  }

  /** Translate the summary into `lang` (generated once per paper and language, then shared). */
  async translate(paperId: string, lang: TranslationLang, userId: string): Promise<SummaryRecord> {
    const summary = await this.summarize(paperId, userId);
    if (summary.translations[lang]) return summary;

    const text = await this.cache.wrap(`ai:tr:${lang}:${summary.paperId}`, 300, async () => {
      await this.quota.consume(userId);
      const out = await this.chat(translateInstructions(lang), summary.summaryEn);
      await this.db
        .query(
          `insert into paper_translations (paper_id, lang, text, model) values ($1, $2, $3, $4)
           on conflict (paper_id, lang) do update set text = excluded.text, model = excluded.model`,
          [summary.paperId, lang, out, config.openaiModel],
        )
        .catch((e: Error) => this.logger.error(`Saving ${lang} translation failed: ${e.message}`));
      return out;
    });
    return { ...summary, translations: { ...summary.translations, [lang]: text } };
  }

  /** Abstract by default; open-access full text only when the abstract is missing/too short. */
  private async summaryInput(paper: Paper): Promise<{ text: string; basis: 'abstract' | 'fulltext' }> {
    const header = [
      `Title: ${paper.title}`,
      paper.authors.length ? `Authors: ${paper.authors.slice(0, 8).map((a) => a.name).join(', ')}` : '',
      paper.venue ? `Published in: ${paper.venue}${paper.year ? ` (${paper.year})` : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const abstract = paper.abstract?.trim();
    if (abstract && abstract.length >= MIN_ABSTRACT) return { text: `${header}\n\nAbstract:\n${abstract}`, basis: 'abstract' };

    if (paper.isOpenAccess) {
      const full = await getFullText({ core: paper.ids.core, doi: paper.ids.doi }).catch(() => undefined);
      if (full && full.length > MIN_ABSTRACT) {
        return { text: `${header}\n\nOpen-access full text (excerpt):\n${full.slice(0, MAX_INPUT_CHARS)}`, basis: 'fulltext' };
      }
    }
    if (abstract) return { text: `${header}\n\nAbstract:\n${abstract}`, basis: 'abstract' };
    throw new UnprocessableEntityException(
      'No abstract is available for this paper, and no open-access full text was found, so it cannot be summarised.',
    );
  }

  private async chat(instructions: string, input: string, allowReasoningParam = true): Promise<string> {
    if (!config.openaiApiKey) throw new ServiceUnavailableException('AI summaries are not configured (OPENAI_API_KEY missing)');
    const body: Record<string, unknown> = {
      model: config.openaiModel,
      messages: [
        { role: 'developer', content: instructions },
        { role: 'user', content: input },
      ],
      max_completion_tokens: 2000,
    };
    if (allowReasoningParam) body.reasoning_effort = 'minimal';
    try {
      const res = await fetchJson<{ choices: { message: { content: string | null }; finish_reason: string }[] }>(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
          body: JSON.stringify(body),
          timeoutMs: 45_000,
        },
      );
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new InternalServerErrorException('The AI model returned an empty response');
      return text;
    } catch (e) {
      if (e instanceof UpstreamError) {
        // Older/newer model snapshots may reject the reasoning_effort value — retry once without it.
        if (allowReasoningParam && e.status === 400 && /reasoning/i.test(e.message)) return this.chat(instructions, input, false);
        this.logger.error(`OpenAI call failed: ${e.message}`);
        throw new ServiceUnavailableException('The AI service is unavailable right now. Please try again shortly.');
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Voice-over via OpenAI text-to-speech (same OPENAI_API_KEY; no Google Cloud project).
  // Audio is stored in Postgres so each summary is synthesised only once.
  // ---------------------------------------------------------------------------
  get ttsEnabled() {
    return !!config.openaiApiKey;
  }

  async speak(paperId: string, lang: SummaryLang, userId: string): Promise<Buffer> {
    if (!this.ttsEnabled) throw new ServiceUnavailableException('Voice-over is not configured on the server (OPENAI_API_KEY missing)');
    const summary = lang === 'en' ? await this.summarize(paperId, userId) : await this.translate(paperId, lang, userId);
    const text = lang === 'en' ? summary.summaryEn : summary.translations[lang]!;
    const key = `tts:v2:${config.ttsModel}:${config.ttsVoice}:${lang}:${createHash('sha1').update(text).digest('hex')}`;

    const stored = this.db.enabled
      ? await this.db.one<{ audio: Buffer }>('select audio from tts_audio where cache_key = $1', [key]).catch(() => null)
      : null;
    if (stored) return stored.audio;

    const pending = this.ttsInflight.get(key);
    if (pending) return pending;
    const job = (async () => {
      await this.quota.consume(userId);
      const audio = await this.synthesize(text, lang);
      if (this.db.enabled)
        await this.db
          .query('insert into tts_audio (cache_key, audio) values ($1, $2) on conflict (cache_key) do nothing', [key, audio])
          .catch((e: Error) => this.logger.error(`Caching audio failed: ${e.message}`));
      return audio;
    })().finally(() => this.ttsInflight.delete(key));
    this.ttsInflight.set(key, job);
    return job;
  }

  private ttsInflight = new Map<string, Promise<Buffer>>();

  private async synthesize(text: string, lang: SummaryLang, attempt: { model: string; voice: string } = { model: config.ttsModel, voice: config.ttsVoice }): Promise<Buffer> {
    const instructions = LANGS[lang].voice;
    const body: Record<string, unknown> = { model: attempt.model, voice: attempt.voice, input: text.slice(0, 4000), response_format: 'mp3' };
    if (!attempt.model.startsWith('tts-1')) body.instructions = instructions;
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      this.logger.error(`OpenAI TTS request failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Voice-over is unavailable right now. Please try again shortly.');
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      // Fall back to the long-standing tts-1 model / alloy voice if the configured ones are rejected.
      if ((res.status === 400 || res.status === 404) && attempt.model !== 'tts-1') {
        this.logger.warn(`TTS ${attempt.model}/${attempt.voice} rejected (${res.status}): ${detail} — retrying with tts-1/alloy`);
        return this.synthesize(text, lang, { model: 'tts-1', voice: 'alloy' });
      }
      this.logger.error(`OpenAI TTS failed (${res.status}): ${detail}`);
      throw new ServiceUnavailableException('Voice-over is unavailable right now. Please try again shortly.');
    }
    return Buffer.from(await res.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // AI illustration of a paper's topic (OpenAI image generation), generated once and stored.
  // ---------------------------------------------------------------------------

  /** The stored illustration, or null if none has been generated yet. */
  async graphic(paperId: string): Promise<{ image: Buffer; mime: string } | null> {
    if (!this.db.enabled) return null;
    return this.db.one<{ image: Buffer; mime: string }>('select image, mime from paper_graphics where paper_id = $1', [paperId]);
  }

  async createGraphic(paperId: string, userId: string): Promise<{ paperId: string }> {
    if (!config.openaiApiKey) throw new ServiceUnavailableException('AI graphics are not configured (OPENAI_API_KEY missing)');
    const paper = await this.papers.getPaper(paperId);
    if (await this.graphic(paper.id)) return { paperId: paper.id };

    const pending = this.imageInflight.get(paper.id);
    if (pending) return pending;
    const job = (async () => {
      await this.quota.consume(userId);
      const { image, model } = await this.generateImage(this.imagePrompt(paper));
      await this.db.query(
        'insert into paper_graphics (paper_id, image, mime, model) values ($1, $2, $3, $4) on conflict (paper_id) do nothing',
        [paper.id, image, 'image/png', model],
      );
      return { paperId: paper.id };
    })().finally(() => this.imageInflight.delete(paper.id));
    this.imageInflight.set(paper.id, job);
    return job;
  }

  private imageInflight = new Map<string, Promise<{ paperId: string }>>();

  private imagePrompt(paper: Paper): string {
    const about = (paper.abstract ?? paper.tldr ?? '').slice(0, 1200);
    return [
      'Create a clean, modern editorial illustration that conveys the research topic below at a glance, for a research-discovery website.',
      'Style: flat vector illustration with soft gradients and simple shapes, warm palette of gold, burnt orange and deep navy on a light background, generous empty space.',
      'Strict rules: absolutely no text, letters, numbers, labels, logos, or charts with data. Do not depict specific results or invent findings; show the subject conceptually. No identifiable real people.',
      '',
      `Title: ${paper.title}`,
      about ? `About: ${about}` : '',
    ].join('\n');
  }

  /** Try the configured model; fall back to dall-e-3 if it isn't available on this OpenAI account. */
  private async generateImage(prompt: string, model = config.imageModel): Promise<{ image: Buffer; model: string }> {
    const isDalle = model.startsWith('dall-e');
    const body: Record<string, unknown> = isDalle
      ? { model, prompt, n: 1, size: '1792x1024', response_format: 'b64_json' }
      : { model, prompt, n: 1, size: '1536x1024', quality: 'low' };
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      this.logger.error(`OpenAI image request failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('AI graphics are unavailable right now. Please try again shortly.');
    }
    const data = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } };
    if (!res.ok || !data.data?.[0]?.b64_json) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Image generation with ${model} failed: ${msg}`);
      if (!isDalle && (res.status === 403 || res.status === 404 || (res.status === 400 && /model|verif/i.test(msg))))
        return this.generateImage(prompt, 'dall-e-3');
      if (/safety|policy|rejected/i.test(msg))
        throw new UnprocessableEntityException('The AI could not create an image for this paper’s topic.');
      throw new ServiceUnavailableException('AI graphics are unavailable right now. Please try again shortly.');
    }
    return { image: Buffer.from(data.data[0].b64_json, 'base64'), model };
  }
}
