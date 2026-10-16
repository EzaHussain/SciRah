/** Languages SciRah offers for AI summaries and voice-over. English is the source language. */
export const SUMMARY_LANGS = ['en', 'ur', 'hi', 'ar', 'zh', 'fr', 'es'] as const;
export type SummaryLang = (typeof SUMMARY_LANGS)[number];
export type TranslationLang = Exclude<SummaryLang, 'en'>;

interface LangInfo {
  name: string;
  /** How the translation should be written. */
  translate: string;
  /** How the voice-over should sound. */
  voice: string;
}

export const LANGS: Record<SummaryLang, LangInfo> = {
  en: {
    name: 'English',
    translate: '',
    voice: 'Read this clearly at a calm, steady pace, like a friendly university lecturer explaining research to students.',
  },
  ur: {
    name: 'Urdu',
    translate: 'clear, natural Urdu written in Nastaliq (Arabic) script, suitable for university students in Pakistan',
    voice: 'Read this in clear, natural Urdu with a Pakistani accent, at a calm, steady pace, like a friendly university lecturer.',
  },
  hi: {
    name: 'Hindi',
    translate: 'clear, natural Hindi written in Devanagari script, suitable for university students',
    voice: 'Read this in clear, natural Hindi at a calm, steady pace, like a friendly university lecturer.',
  },
  ar: {
    name: 'Arabic',
    translate: 'clear Modern Standard Arabic, suitable for university students',
    voice: 'Read this in clear Modern Standard Arabic at a calm, steady pace, like a friendly university lecturer.',
  },
  zh: {
    name: 'Chinese',
    translate: 'clear, natural Simplified Chinese (Mandarin), suitable for university students',
    voice: 'Read this in clear, natural Mandarin Chinese at a calm, steady pace, like a friendly university lecturer.',
  },
  fr: {
    name: 'French',
    translate: 'clear, natural French, suitable for university students',
    voice: 'Read this in clear, natural French at a calm, steady pace, like a friendly university lecturer.',
  },
  es: {
    name: 'Spanish',
    translate: 'clear, natural Spanish, suitable for university students',
    voice: 'Read this in clear, natural Spanish at a calm, steady pace, like a friendly university lecturer.',
  },
};

export const isSummaryLang = (v: unknown): v is SummaryLang => typeof v === 'string' && (SUMMARY_LANGS as readonly string[]).includes(v);
export const isTranslationLang = (v: unknown): v is TranslationLang => isSummaryLang(v) && v !== 'en';

export function translateInstructions(lang: TranslationLang): string {
  return `Translate the user's text into ${LANGS[lang].translate}.
Keep the meaning exact. For scientific terms with no common equivalent in the target language, keep the English term (in Latin script) in parentheses after the translated wording.
Output only the translation as plain text.`;
}
