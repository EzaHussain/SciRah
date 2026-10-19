# SciRah — project guide for Claude

**Keep this file up to date.** After every change that adds/removes a feature, changes how something works, adds an env var, or changes deployment: update the relevant section and add a line to the Changelog at the bottom. When starting fresh (or after context was compacted), read this file first.

SciRah is a research-paper discovery platform for students and researchers in Pakistan. It searches free scholarly APIs live, merges results, and lets people read, summarise (AI, 7 languages), share and export papers — **without hosting papers itself**. Owner: Eza Hussain (ezahussainn@gmail.com, admin). The owner is not a developer: explain things in plain, simple English with numbered steps; avoid jargon.

## Product rules (owner decisions — do not break)

- **Everything opens inside SciRah.** No `target="_blank"`, no sending users off-site. Outside URLs go through the in-app reader `readerHref()` → `/read`. Only exception: share pop-ups (WhatsApp/LinkedIn/Facebook) in `ShareMenu`.
- **AI disclaimer** under every AI summary/translation (`AI_DISCLAIMER` in `web/src/lib/languages.ts`); AI images labelled as AI.
- **Never host or store papers** — only metadata. Full text is shown from Europe PMC / NCBI open data or proxied (streamed, not stored) PDFs.
- **News = research news only** (stories about published papers, ScienceDaily). General press only as a secondary section on the News page.
- **Researcher numbers must be credible**: show sources side by side; verified researchers may enter their own (e.g. Google Scholar) numbers, labelled as such. Google Scholar can't be read automatically (no API, blocks scraping) — never scrape it.
- **Institutions shown for an author** must be where they actually work: computed from the author's OWN affiliation on recent papers, not one-off collaborations.
- **SciRah Score** never counts likes/activity (formula in `api/src/authors/score.ts`, explained at `/score`).
- **Deferred by owner (don't build unless asked):** QS World Ranking / Q1–Q4 university report; subscriptions & payments (Stripe unavailable in Pakistan; local gateways need NTN). When payments come back, owner wants a free complimentary account for testing.
- Co-author "invite" = share their profile link (WhatsApp etc.) + WeChat QR code.

## Repository layout

```
api/   NestJS 12 API (Node 22, ESM, TypeScript) — PostgreSQL via `pg`, no ORM
web/   Next.js 16 (App Router, React 19, Tailwind 4) — read web/AGENTS.md: this Next version has breaking changes; docs in web/node_modules/next/dist/docs/
docker-compose.yml   optional local Postgres/Redis
README.md            user-facing setup + feature list (keep in sync too)
```

### API (`api/src`)
- `main.ts` loads `api/.env` with `process.loadEnvFile` (does NOT override existing env vars). `config.ts` = all env config.
- `common/` — `db.service.ts` (pg Pool, `query/one/tx/withLock`), `schema.ts` (**idempotent SQL run on every start**; add new tables/columns there with `create … if not exists` / `alter … add column if not exists`), `cache.service.ts` (Redis or in-memory; `wrap(key, ttl, fn)`), `auth.ts` (AuthGuard/OptionalAuthGuard, AiQuota), `http.ts` (fetchJson/fetchText with timeout), `safe-url.ts` (SSRF guard for server-side fetching of user URLs — always use it).
- `auth/` — email+password (scrypt) and Google OAuth; sessions are HS256 tokens. `POST /auth/check-email` powers the single sign-in screen. Users have `role` ('reader'|'researcher'|null) and researcher profile fields. Admins = `ADMIN_EMAILS`.
- `papers/` — `sources/*.ts` (openalex, semanticscholar, crossref, core, arxiv, pubmed), `merge.ts` (de-dupe + per-author merge of affiliations), `papers.service.ts` (search/getPaper; also manually added `scirah:<uuid>` papers), `insights.service.ts` (maps/years/topics via OpenAlex group_by), `fulltext.service.ts` (full paper: Europe PMC article → else verified PDF → else OA page; JATS→safe HTML with an allow-list; figures/PDF from NCBI `pmc-oa-opendata` S3 bucket).
- `authors/` — author profiles (OpenAlex/S2), current-institution logic, SciRah Score, `/metrics` (OpenAlex vs Semantic Scholar matched by DOIs vs verified owner numbers), profile claims (ORCID or admin-approved "This is me" requests).
- `ai/` — summaries (`OPENAI_MODEL`), translations in `languages.ts` (ur, hi, ar, zh, fr, es), TTS voice-over, AI graphics (`OPENAI_IMAGE_MODEL`, falls back to dall-e-3). Everything is generated once and stored in Postgres.
- `news/` — ScienceDaily pool (16 RSS feeds, cached 1 h), topic matching, `story-paper` (DOI of the study behind a story), press via Google News + GDELT.
- `alerts/` — followed topics, background checker (advisory lock), notifications (papers + research news).
- `reader/` — `/reader/inspect` (can a URL be framed?) and `/reader/pdf` (streams PDFs, 60 MB cap, rate-limited).
- `submissions/` — manually added papers (admins & verified researchers auto-approved) + `ResearchersController` (`/researchers/:userId` public page data).
- `venues/` — journal (S…) and publisher (P…) profiles.

### Web (`web/src`)
- `lib/api.ts` — `api()` fetch helper, `paperHref/authorHref/venueHref/readerHref/pdfProxyUrl`. `lib/types.ts` mirrors API shapes. `lib/session.ts` — httpOnly cookie `scirah_session`, `apiFromServer`.
- Auth: single page `/login` (`components/AuthForm.tsx`: Google, or email → password / create account with researcher-or-reader). `/signup` redirects to `/login`. Google routes `app/auth/google/*`; new Google users without a role → `/welcome`. `RoleNudge` bar for accounts without a role. ORCID routes `app/auth/orcid/*`.
- Pages: `/` home, `/search` (+ `InsightsPanel` maps), `/paper/[id]` (+ `/full`, `/slide`, `/export`, `/export/docx`, `opengraph-image`), `/author/[id]`, `/researcher/[id]`, `/venue/[id]`, `/read`, `/news`, `/saved`, `/notifications`, `/account`, `/submit`, `/admin/submissions`, `/admin/verifications`, `/score`, `/welcome`, `/privacy`, `/terms`.
- Styling: theme tokens in `app/globals.css` (light/dark via `data-theme`), frosted `card` / opaque `popover` utilities, `Backdrop` (logo watermark + glows), sequential map ramp `--seq-1..5`, `.article-body` for full-text articles. Brand colours: gold `#d97f0f`/`#f0981f`, burnt orange `#d9461e`, navy `#16222c`/`#091621`.

## Running locally (Windows)

1. Local PostgreSQL 15 service runs on the PC; DB `scirah` (API creates tables itself).
2. API: `cd api && npm run start:dev` (port 4000). Or `npm run build && node dist/main.js`.
3. Web: `cd web && npm run dev` (port 3000). Preview config in `.claude/launch.json` (name `web`).
4. Checks before pushing: `cd api && npx tsc --noEmit -p tsconfig.json`; `cd web && npx tsc --noEmit && npx eslint src && npm run build`.

## Deployment (live)

- **Website:** Vercel, project root `web`, URL **https://sci-rah.vercel.app**. Env: `NEXT_PUBLIC_API_URL=https://scirah-production.up.railway.app` (site URL auto-detected from `VERCEL_PROJECT_PRODUCTION_URL`; set `NEXT_PUBLIC_SITE_URL` only for a custom domain).
- **API:** Railway, root `/api`, URL **https://scirah-production.up.railway.app** (`/health` shows enabled features). Variables pasted from local `railway-variables.txt` (git-ignored, contains secrets). `WEB_ORIGIN=https://sci-rah.vercel.app,https://scirah.com,https://www.scirah.com`.
- **Database:** Neon (Singapore). Production DB is separate from the local one.
- **GitHub:** https://github.com/EzaHussain/SciRah (branch `main`). **Pushing to main auto-deploys both Vercel and Railway** (~2 min).
- **Google OAuth** client in Google Cloud: JS origin `https://sci-rah.vercel.app`, redirect `https://sci-rah.vercel.app/auth/google/callback` (+ localhost). Branding: home/privacy/terms on sci-rah.vercel.app.
- **Custom domain scirah.com** is owned but NOT connected yet (owner wants to stay on vercel.app for now). When connecting: Vercel Domains + DNS at registrar, then add `https://scirah.com` to Google origins/redirects, set `NEXT_PUBLIC_SITE_URL`, update Google Branding + authorized domain `scirah.com`.

## Environment variables (api/.env — see api/.env.example)

`PORT, WEB_ORIGIN, CONTACT_EMAIL, DATABASE_URL, DATABASE_SSL, AUTH_SECRET, SESSION_DAYS, GOOGLE_CLIENT_ID/SECRET, ORCID_CLIENT_ID/SECRET/BASE_URL (optional, not set), ADMIN_EMAILS, REDIS_URL (optional), OPENALEX_API_KEY, SEMANTIC_SCHOLAR_API_KEY, CORE_API_KEY, NCBI_API_KEY (empty), OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TTS_MODEL, OPENAI_TTS_VOICE, OPENAI_IMAGE_MODEL, AI_DAILY_LIMIT, ALERTS_*`.
Never print secret values; check them with length-only scripts. Inline `# comments` after values in .env are fine for Node but NOT for Railway's raw editor (strip them).

## Presentations (claude.ai artifacts, private to the owner)

- Payments guide (plain language, Pakistan + abroad): https://claude.ai/artifact/JuxySVPCDA9L4ZUyZktuPU
- Investor pitch — professional 13-slide version (owner wants formal tone; mention team costs only as a 'Product team' line, never 'interns'): ask PKR 200,000 = infrastructure PKR 150k for 12 months + product team PKR 50k ONE-TIME (interns are paid once for the project, never monthly) (Railway ~$5, OpenAI ~$5–20, Vercel free until paid plans then $20, Neon free, domain prepaid 3 yrs). Market: ~1.96M university students (2024–25 est.), 262 universities (QAA 2025), 81,852 Pakistani-authored articles in 2025 vs 48,196 in 2021 (OpenAlex): https://claude.ai/artifact/5yYCHdP9bVnMQnXjQp1NgE
- Payments research (Oct 2026): Stripe/PayPal unavailable for PK businesses; Safepay accepts sole proprietors (CNIC + FBR NTN + bank maintenance certificate <3 months + authority letter); Paddle & Lemon Squeezy (≈5% + $0.50) for customers abroad — Lemon Squeezy lists Pakistan for bank payouts.

## Gotchas learned

- Windows + Git Bash: complex inline `node -e` / heredoc-with-python scripts often break on quoting/backslashes. Write scripts to the scratchpad dir and run them; or use the Edit tool. Regexes inside TS template literals need `String.raw`.
- Bump cache key versions (e.g. `author:v2:`, `news:v2:`) when a cached shape/logic changes.
- OpenAlex: `last_known_institutions` includes one-off collaborations → use `currentInstitutions()`; cursor paging needs an API key (use page paging); `group_by` gives counts (max 200 groups).
- Semantic Scholar key = 1 req/s (429s) — retry wrapper in `semanticscholar.ts`.
- Europe PMC & PMC block server PDF/image downloads; use the `pmc-oa-opendata` S3 bucket. ScienceDaily pages can be framed; Nature/ScienceAlert can't; Phys.org blocks servers.
- OpenAI `gpt-image-1` (AI illustrations, `OPENAI_IMAGE_MODEL`) is reported to retire on 2026-10-23; switch to its successor model and update the fallback in `api/src/ai/ai.service.ts`.
- Testing with accounts: create `t_…@example.test` users via API and delete them afterwards (`DELETE /auth/me`).

## Changelog

- 2026-10-11 — Supabase → PostgreSQL migration finished (pg dependency installed, local DB created); bookmark-unsave fix.
- 2026-10-11 — Logo backdrop design; footer uses header logo.
- 2026-10-15 — Big feature set: 7-language summaries + voice, AI disclaimer, AI graphics, share (WhatsApp/LinkedIn/Facebook/WeChat QR), export PDF/Word, one-slide summary, OG images, in-app reader + PDF proxy, journal/publisher profiles, research landscape maps/years/topic filters, "in Pakistan" query parsing, SciRah Score, ORCID claims, manual paper submissions + admin review.
- 2026-10-16 — Deployed: GitHub → Vercel (sci-rah.vercel.app) + Railway API + Neon DB; privacy & terms pages; Google OAuth for production.
- 2026-10-19 — Full paper in SciRah (Europe PMC/NCBI bucket/PDF); a,b,c affiliations + corresponding author; researcher/reader accounts, researcher profile + public page, "This is me" verification + admin page, verified numbers; metrics compared across OpenAlex/Semantic Scholar; research-only news (ScienceDaily) linked to papers.
- 2026-10-19 — Single sign-in flow (one "Sign in" button; email check decides password vs create account); author current institution from own recent papers (+ department line); this CLAUDE.md created.
- 2026-10-19 — Two presentations created (payments guide, investor pitch); see Presentations.
- 2026-10-19 — Investor pitch budget made lean at owner's request (PKR 0.57M–0.75M / 12 months).
- 2026-10-19 — Investor pitch rebuilt professionally (exec summary, market, competition, model, GTM, cost structure, use of funds, roadmap).
- 2026-10-19 — Investor ask corrected to PKR 200,000 (team paid once, not monthly); owner edited the cover by hand (kept).
