/** Languages for AI summaries and voice-over (English is the source; the rest are translations). */
export const SUMMARY_LANGS = [
  { code: "en", label: "English", native: "English", bcp47: "en-US", dir: "ltr" },
  { code: "ur", label: "Urdu", native: "اردو", bcp47: "ur-PK", dir: "rtl" },
  { code: "hi", label: "Hindi", native: "हिन्दी", bcp47: "hi-IN", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", bcp47: "ar", dir: "rtl" },
  { code: "zh", label: "Chinese", native: "中文", bcp47: "zh-CN", dir: "ltr" },
  { code: "fr", label: "French", native: "Français", bcp47: "fr-FR", dir: "ltr" },
  { code: "es", label: "Spanish", native: "Español", bcp47: "es-ES", dir: "ltr" },
] as const;

export type SummaryLang = (typeof SUMMARY_LANGS)[number]["code"];
export type TranslationLang = Exclude<SummaryLang, "en">;

export const langInfo = (code: SummaryLang) => SUMMARY_LANGS.find((l) => l.code === code)!;

/** Shown under every AI summary and translation. */
export const AI_DISCLAIMER =
  "This summary is AI-generated and can make mistakes. SciRah is not responsible for its accuracy — always check the original paper.";
