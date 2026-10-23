# SciRah — project guide for Claude

**Keep this file up to date.** After every change that adds/removes a feature, changes how something works, adds an env var, or changes deployment: update the relevant section and add a line to the Changelog at the bottom. When starting fresh (or after context was compacted), read this file first.

SciRah is a research-paper discovery platform for students and researchers in Pakistan. It searches free scholarly APIs live, merges results, and lets people read, summarise (AI, 7 languages), share and export papers — **without hosting papers itself**. Owner: Eza Hussain (ezahussainn@gmail.com, admin). The owner is not a developer: explain things in plain, simple English with numbered steps; avoid jargon.

## Product rules (owner decisions — do not break)

- **Everything opens inside SciRah.** No `target="_blank"`, no sending users off-site. Outside URLs go through the in-app reader `readerHref()` → `/read`. Only exception: share pop-ups (WhatsApp/LinkedIn/Facebook) in `ShareMenu`. Sites that refuse to be framed (orcid.org, ror.org) must NOT get a button/link at all — show the info as plain text (ORCID iD badge, institution name).
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
- `authors/` — author profiles (OpenAlex/S2), current-institution logic, SciRah Score, `/metrics` (headline = verified owner numbers, else the "SciRah cross-check": every OpenAlex work looked up by DOI in Crossref + Semantic Scholar, highest count per paper kept, h/i10 recomputed; table also shows OpenAlex, Crossref, Semantic Scholar), `/authors/suggest?kind=authors|subjects&q=` (search-box type-ahead via OpenAlex autocomplete, authors ranked by citations, no institution hint), profile claims: **university email** (`POST /authors/:id/verify-email` {email} → 6-digit code by email → `/verify-email/confirm` {code}; email domain = the profile's current institution's homepage domain (incl. associated institutions, `institutionDomains`/`orgDomain`) → verified instantly, method 'email'; other .edu/.ac emails → confirmed + sent to admin as a claim request; Gmail etc. refused; an account signed in with Google on that same uni address skips the code), ORCID (not configured), or admin-approved "Other proof" requests. Verified owner: "Correct my numbers" (PATCH claim), "Not my paper" (`POST/DELETE /authors/:id/hidden`, table `author_hidden_works`; hidden works are filtered out of `GET /authors/:id` (`getVisible`) and of the cross-check numbers; removed with the account).
- `ai/` — summaries (`OPENAI_MODEL`), translations in `languages.ts` (ur, hi, ar, zh, fr, es), TTS voice-over, AI graphics (`OPENAI_IMAGE_MODEL`, falls back to dall-e-3). Everything is generated once and stored in Postgres.
- `news/` — ScienceDaily pool (16 RSS feeds, cached 1 h), topic matching, `story-paper` (DOI of the study behind a story), press via Google News + GDELT. `/news/for-you?region=pk` = research news from Pakistan (ScienceDaily stories mentioning Pakistan + Google News PK study reports that mention Pakistan; cached 1 h) — the Worldwide/Pakistan switch on the home page.
- `alerts/` — followed topics, background checker (advisory lock), notifications (papers + research news).
- `reader/` — `/reader/inspect` (can a URL be framed?) and `/reader/pdf` (streams PDFs, 60 MB cap, rate-limited).
- `submissions/` — manually added papers (admins & verified researchers auto-approved) + `ResearchersController` (`/researchers/:userId` public page data).
- `venues/` — journal (S…) and publisher (P…) profiles.
- `explore/` — data for the menu pages: `/explore/researchers?country=pk` (most-cited researchers re-checked with `currentInstitutions`, ~15 s uncached → warmed on start-up), `/explore/country?code=pk` (papers/year, top institutions by papers in 5 y via group_by + geo filter, fields, journals), `/explore/fields`, `/explore/venues?q=` (journal/publisher type-ahead).
- `admin/` — `GET /admin/users` (admins only: totals + paged list of accounts with role, sign-in method, verified profile, saved count).
- `common/mail.ts` — `sendMail` via **Resend HTTP API** (Railway blocks SMTP); `MAIL_DEV_LOG=1` prints emails to the log for local testing.

### Web (`web/src`)
- `lib/api.ts` — `api()` fetch helper, `paperHref/authorHref/venueHref/readerHref/pdfProxyUrl`. `lib/types.ts` mirrors API shapes. `lib/session.ts` — httpOnly cookie `scirah_session`, `apiFromServer`.
- Auth: single page `/login` (`components/AuthForm.tsx`: Google, or email → password / create account with researcher-or-reader). `/signup` redirects to `/login`. Google routes `app/auth/google/*`; new Google users without a role → `/welcome`. `RoleNudge` bar for accounts without a role. ORCID routes `app/auth/orcid/*`.
- Main menu (`Header.tsx`): Home · Search · Authors · Pakistan · News · Saved · More▾ (Topics, Journals, Add a paper, SciRah Score, About); below `lg` everything is in the mobile menu. Admin account menu: All users, Review added papers, Review profile verifications.
- Pages: `/` home, `/search` (+ `InsightsPanel` maps), `/paper/[id]` (+ `/full`, `/slide`, `/export`, `/export/docx`, `opengraph-image`), `/author/[id]` (`AuthorPapers` with "Not my paper", `AuthorOwnerPanel` with university-email verification), `/researcher/[id]`, `/venue/[id]`, `/authors`, `/pakistan`, `/topics`, `/journals` (these four are `force-dynamic`, data from `/explore/*`), `/about`, `/read`, `/news`, `/saved`, `/notifications`, `/account`, `/submit`, `/admin/users`, `/admin/submissions`, `/admin/verifications`, `/score`, `/welcome`, `/privacy`, `/terms`.
- Styling: theme tokens in `app/globals.css` (light/dark via `data-theme`), frosted `card` / opaque `popover` utilities, `Backdrop` (logo watermark + glows; no road lines on the home hero or under it — owner removed them). Header/footer/sign-in logo = `public/logo-transparent.png` (192 px, dark background cut out of `logo.png`, served `unoptimized`), sequential map ramp `--seq-1..5`, `.article-body` for full-text articles. Brand colours: gold `#d97f0f`/`#f0981f`, burnt orange `#d9461e`, navy `#16222c`/`#091621`.

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

`PORT, WEB_ORIGIN, CONTACT_EMAIL, DATABASE_URL, DATABASE_SSL, AUTH_SECRET, SESSION_DAYS, GOOGLE_CLIENT_ID/SECRET, ORCID_CLIENT_ID/SECRET/BASE_URL (optional, not set), ADMIN_EMAILS, REDIS_URL (optional), OPENALEX_API_KEY, SEMANTIC_SCHOLAR_API_KEY, CORE_API_KEY, NCBI_API_KEY (empty), OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TTS_MODEL, OPENAI_TTS_VOICE, OPENAI_IMAGE_MODEL, AI_DAILY_LIMIT, ALERTS_*, RESEND_API_KEY + MAIL_FROM (university-email codes; **not set yet** — until set, only Google-signed-in university accounts verify instantly and the email form says codes aren't switched on), MAIL_DEV_LOG (local only)`.

**To switch on university-email codes (owner to do):** resend.com free account → Domains → add `scirah.com` → paste the DNS records it shows at the domain registrar → wait for "Verified" → API Keys → create key → Railway Variables: `RESEND_API_KEY=<key>`, `MAIL_FROM=SciRah <verify@scirah.com>`. (The domain doesn't need to be connected to Vercel for this.)
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
- Testing with accounts: create `t_…@example.test` users via API and delete them afterwards (`DELETE /auth/me`). For university-email tests run the API with `MAIL_DEV_LOG=1` and read the code from the log.
- Admin "see all users": `/admin/users` on the site (no need to open Neon).

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
- 2026-10-23 — UI fixes: transparent logo in header + footer (same image), road lines removed from home hero/divider, "For you" sits higher, hero says "7 languages", arXiv thank-you line removed from footer; Worldwide/Pakistan switch on home research news; Google-style type-ahead for author/subject search; author numbers cross-checked across OpenAlex, Crossref and Semantic Scholar (checked Mian Hasnain Nawaz: all three agree ~2,600–2,700 citations, h 26–28; Google Scholar is higher by design).
- 2026-10-23 — Researcher self-service: verify with university email (6-digit code via Resend; instant when the email domain matches the profile's institution), "Not my paper" (removes a paper and recomputes numbers; restore later), existing "Correct my numbers". ORCID button and institution links replaced by plain text (those sites can't open inside SciRah). New menu: Authors, Pakistan, More (Topics, Journals, Add a paper, SciRah Score, About) + pages; admin "All users" page (`/admin/users`).
