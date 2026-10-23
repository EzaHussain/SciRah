// Central place for environment configuration. Every secret comes from env vars;
// nothing is hardcoded. Optional keys simply disable/limit the matching feature.

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function bool(name: string, fallback: boolean): boolean {
  const v = env(name).toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

export const config = {
  port: Number(env('PORT', '4000')),
  webOrigins: env('WEB_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),

  // Used for the "polite pool" of OpenAlex / CrossRef / NCBI. Not a secret.
  contactEmail: env('CONTACT_EMAIL'),

  // Any PostgreSQL 13+ database: local install, Docker, Neon, Railway, Render, Supabase-as-plain-Postgres…
  databaseUrl: env('DATABASE_URL'),
  // "require" for most hosted databases (Neon, Railway, Render); "disable" for local Postgres.
  databaseSsl: env('DATABASE_SSL', 'auto'),

  // Signs session tokens. Use a long random string (e.g. `openssl rand -hex 32`). SECRET.
  authSecret: env('AUTH_SECRET'),
  sessionDays: Number(env('SESSION_DAYS', '30')),

  // Google sign-in (OAuth client of type "Web application"). The secret stays on the API server.
  googleClientId: env('GOOGLE_CLIENT_ID'),
  googleClientSecret: env('GOOGLE_CLIENT_SECRET'),

  // Researchers claim their profile (for the SciRah Score) by signing in with ORCID. Optional.
  orcidClientId: env('ORCID_CLIENT_ID'),
  orcidClientSecret: env('ORCID_CLIENT_SECRET'),
  orcidBaseUrl: env('ORCID_BASE_URL', 'https://orcid.org').replace(/\/$/, ''),

  // Sending email (6-digit codes that confirm a researcher's university email). Uses Resend's HTTP API
  // (https://resend.com, free tier) because Railway blocks ordinary SMTP. MAIL_FROM must be on a domain
  // verified in Resend, e.g. "SciRah <verify@scirah.com>". Optional: without it, university-email
  // verification is switched off.
  resendApiKey: env('RESEND_API_KEY'),
  mailFrom: env('MAIL_FROM'),
  // Local testing only: print emails to the server log instead of sending them.
  mailDevLog: bool('MAIL_DEV_LOG', false),

  // Accounts that can approve manually added papers (comma-separated emails).
  adminEmails: env('ADMIN_EMAILS')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  redisUrl: env('REDIS_URL'),

  openAlexApiKey: env('OPENALEX_API_KEY'),
  semanticScholarApiKey: env('SEMANTIC_SCHOLAR_API_KEY'),
  coreApiKey: env('CORE_API_KEY'),
  ncbiApiKey: env('NCBI_API_KEY'),

  openaiApiKey: env('OPENAI_API_KEY'),
  openaiModel: env('OPENAI_MODEL', 'gpt-5-nano'),
  // Voice-over uses OpenAI text-to-speech with the same OPENAI_API_KEY (no Google Cloud needed).
  ttsModel: env('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'),
  ttsVoice: env('OPENAI_TTS_VOICE', 'marin'),
  // AI illustrations for papers (OpenAI image generation). Each paper's image is generated once and stored.
  imageModel: env('OPENAI_IMAGE_MODEL', 'gpt-image-1'),

  // Per-user daily cap on AI calls that actually hit OpenAI (cache hits are free).
  aiDailyLimit: Number(env('AI_DAILY_LIMIT', '40')),

  // Alerts: how often the background checker wakes up, and how often each topic is re-checked.
  alertsEnabled: bool('ALERTS_ENABLED', true),
  alertsIntervalMinutes: Math.max(5, Number(env('ALERTS_INTERVAL_MINUTES', '30'))),
  alertCheckHours: Math.max(1, Number(env('ALERT_CHECK_HOURS', '6'))),
  // Searches are tracked as alert topics automatically; this caps how many per user.
  maxAutoAlerts: Number(env('MAX_AUTO_ALERTS', '25')),
};

export type AppConfig = typeof config;
