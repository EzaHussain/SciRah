# SciRah

Research-paper discovery for students and researchers in Pakistan. SciRah **does not host or store papers**: it searches free, official scholarly APIs live, merges and de-duplicates the results, and links every paper back to its original source.

```
web/   Next.js 16 + Tailwind 4 frontend (Vercel)
api/   NestJS API — PostgreSQL, accounts (email + Google), sources, AI, feeds, alerts, news (Railway / Render)
```

## What's in it

- **Search** across OpenAlex, Semantic Scholar, Crossref, CORE, arXiv and PubMed, with filters for year, open access, **author countries (multi-select), continent, Global South, institution (autocomplete), document type, field, language, journal / conference / repository, minimum citations, has-abstract and hide-retracted**.
- **Accounts** — email + password, or **Continue with Google**. Stored in your own PostgreSQL database (no Supabase).
- **AI summaries** in English and Urdu, plus a **voice-over** (OpenAI text-to-speech, with the browser's built-in voice as a free fallback).
- **Alerts & notifications** — every topic you search is followed automatically (or click **Get alerts**). The API checks those topics every few hours for newly published papers and news, and shows them under the 🔔 bell, with a desktop pop-up while the site is open.
- **News** — recent news for your searched topics, or any topic, filtered by region (Pakistan / worldwide) and time (24 h / 7 d / 30 d). Sources: Google News RSS and GDELT (both free, no key).
- **Research landscape** on every search: a world map (countries shaded 1–99 … 100k+) or, when one country is selected, that country's map with institution pins; top institutions/countries, leading researchers, papers per year, and a topic breakdown (e.g. graphene → sensors, energy storage…) that works as a filter. Typing "graphene in Pakistan" applies the Pakistan filter automatically.
- **AI summaries in 7 languages** (English, Urdu, Hindi, Arabic, Chinese, French, Spanish) with voice-over in each, an AI disclaimer under every summary, and an optional **AI illustration** of the paper's topic.
- **Share** papers, summaries, journals and profiles to WhatsApp, LinkedIn, Facebook, or WeChat (QR code); rich link previews. **Invite co-authors** by sharing their profile.
- **Export** a paper's details + summary as PDF or Word, or as a **one-slide summary** (PNG / PDF).
- **Everything opens inside SciRah**: publisher pages and news open in the in-app reader (`/read`); open-access PDFs are streamed through the API (never stored). Sites that forbid embedding get a SciRah page with the paper details and the free PDF instead.
- **Journal & publisher profiles** (papers published, citations, h-index, open-access share, landmark and latest papers).
- **SciRah Score** (0–100) for researchers — a published formula over citations (log-scaled, field-normalised), h-index, publications, grants, patents and graduated students (`/score`). Researchers verify their profile with ORCID to add patents and students.
- **Add a paper** manually (DOI lookup first); admins (`ADMIN_EMAILS`) approve submissions at `/admin/submissions`.
- **Read the full paper in SciRah** for open-access papers: the complete article from Europe PMC (figures from NCBI's public PMC bucket), otherwise a verified free PDF, otherwise the open-access page. Subscription-only papers say so.
- **Affiliations as printed on the paper** (authors with a, b, c superscripts, affiliations listed below, ✉ corresponding author).
- **Researcher and reader accounts**: sign-up asks which. Researchers get a public page (`/researcher/<id>`), add their papers, and verify their publication profile (ORCID, or a "This is me" request reviewed by an admin at `/admin/verifications`). Verified researchers can enter their own numbers (e.g. from Google Scholar), patents and students.
- **Researcher numbers from several sources**: a paper-by-paper cross-check of OpenAlex, Crossref and Semantic Scholar, each source side by side, plus the verified researcher's own numbers.
- **Verify with a university email**: researchers get a 6-digit code at their university address; an address at the profile's own university verifies them instantly. Verified researchers can correct their numbers and remove papers that aren't theirs ("Not my paper").
- **Browse pages**: Authors (find a researcher + Pakistan's most-cited researchers), Pakistan (papers per year, leading institutions, fields, journals), Topics (all fields and subfields), Journals (journal/publisher search + where Pakistani researchers publish), About.
- **Admin**: `/admin/users` lists every account with totals; `/admin/submissions` and `/admin/verifications` for reviews.
- **Research news** (ScienceDaily: stories about newly published studies), each linked to the paper it reports on; general press coverage only as a separate section of the News page.
- Saved papers, personalised "For you" feed, trending papers, comments, researcher profiles.

## Setup (local)

You need **Node.js 22+** and **a PostgreSQL database**. Pick one:

| Option | How | `DATABASE_URL` |
|---|---|---|
| Neon (free, nothing to install) | neon.tech → New project → copy the connection string | `postgresql://…neon.tech/neondb?sslmode=require` |
| Docker | `docker compose up -d postgres` | `postgres://postgres:postgres@localhost:5432/scirah` |
| PostgreSQL installer (Windows) | postgresql.org/download → create a database `scirah` | `postgres://postgres:<your password>@localhost:5432/scirah` |

No extensions are needed — the API creates all tables automatically when it starts.

### 1. API
```bash
cd api
copy .env.example .env      # (cp on macOS/Linux) then fill in DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY …
npm install
npm run start:dev           # http://localhost:4000 — GET /health shows which features are on
```
Generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 2. Web
```bash
cd web
copy .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                    # http://localhost:3000
```

### 3. Google sign-in (optional, ~5 minutes, free)
Any "Sign in with Google" needs an OAuth client from Google — this is the only Google Cloud step left (voice-over no longer uses Google).

1. Go to **console.cloud.google.com** → create (or pick) a project.
2. **APIs & Services → OAuth consent screen** (now called *Google Auth Platform → Branding/Audience*): app name "SciRah", your email, User type **External**. While in *Testing* mode, add the Google accounts that may sign in under **Test users** (or click **Publish app** so anyone can).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:3000` (+ your production site, e.g. `https://scirah.vercel.app`)
   - **Authorized redirect URIs:** `http://localhost:3000/auth/google/callback` (+ `https://scirah.vercel.app/auth/google/callback`)
4. Copy the **Client ID** and **Client secret** into `api/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and restart the API.

If something is wrong, the sign-in page shows Google's exact error (e.g. `redirect_uri_mismatch` tells you which URL to add).

### 4. ORCID profile claiming (optional, free)
Lets researchers verify their profile so they can add patents and graduated students to their SciRah Score.
1. Sign in at **orcid.org** → your name → **Developer tools** → register a free *Public API* client.
2. Redirect URI: `http://localhost:3000/auth/orcid/callback` (+ your production URL).
3. Put the Client ID / secret in `api/.env` as `ORCID_CLIENT_ID` / `ORCID_CLIENT_SECRET` and restart the API.

### 4b. University-email codes (optional, free)
Researchers verify their profile with a code sent to their university email. Create a free account at **resend.com**, verify your domain (DNS records at your registrar), create an API key, and set `RESEND_API_KEY` and `MAIL_FROM` (e.g. `SciRah <verify@yourdomain.com>`) in `api/.env`. For local testing without email, start the API with `MAIL_DEV_LOG=1` and the code is printed to the log.

### 5. Admins
Set `ADMIN_EMAILS` in `api/.env` (comma-separated). Those accounts see **Review added papers** in their account menu, and their own added papers are approved straight away.

## Deploying
- **api → Railway or Render**: root directory `api`, build `npm install && npm run build`, start `npm start`. Add a PostgreSQL database (Railway/Render both offer one, or use Neon) and set the `.env` variables there, with `WEB_ORIGIN` = your Vercel URL. The API must stay running for alerts to be checked on schedule (on free tiers that sleep, topics are also checked whenever a user opens their notifications).
- **web → Vercel**: root directory `web`, `NEXT_PUBLIC_API_URL` = your API URL, `NEXT_PUBLIC_SITE_URL` = your site URL. Add the production redirect URI to your Google OAuth client.

## How it works

- **Accounts** (`api/src/auth`): passwords are hashed with scrypt; sessions are signed tokens (HS256, `AUTH_SECRET`) that the web app keeps in an httpOnly cookie. Google sign-in uses the standard authorization-code flow: the web app redirects to Google, Google returns to `/auth/google/callback` on the web app, and the API exchanges the code with the client secret. A Google account with the same (verified) email as an existing password account is linked to it. Changing your password or "Sign out of all devices" revokes old sessions.
- **Search** (`GET /papers/search`): fans out to every enabled source in parallel; results are de-duplicated and ranked with reciprocal-rank fusion. Location and content filters are applied with OpenAlex metadata (`authorships.institutions.country_code`, `…continent`, `…is_global_south`, `…lineage`, `type`, `language`, `primary_topic.field.id`, `primary_location.source.type`, `cited_by_count`, `is_retracted`), so other sources are skipped while they're on.
- **Alerts** (`api/src/alerts`): searches create "topics" (the last `MAX_AUTO_ALERTS` per user; users can follow topics explicitly, pause, or delete them). A background job (every `ALERTS_INTERVAL_MINUTES`, guarded by a Postgres advisory lock) re-checks each topic every `ALERT_CHECK_HOURS`: OpenAlex for works published since the last check (keyword, researcher or subject topics, keeping the search's filters) and Google News for new articles. New items become notifications (de-duplicated per user).
- **News** (`api/src/news`): Google News RSS search + GDELT DOC API, merged by headline, cached 20 minutes. "For you" uses the user's followed topics, recent searches and the fields of their saved papers.
- **AI summary / voice-over**: `OPENAI_MODEL` summarises the abstract (open-access full text only when there's no abstract; never stored). Voice-over uses OpenAI TTS (`OPENAI_TTS_MODEL`, Urdu supported) and is stored in Postgres so each summary is only synthesised once. If it isn't configured, the browser's own speech synthesis reads the summary instead.
- **Personalised feed**: each paper's OpenAlex topic → subfield → field classification becomes a sparse vector (`api/src/feed/embedding.ts`), stored as JSON; similarity is computed in the API.

## Security notes
- All secrets are environment variables and live only on the API server. The browser never sees `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` or the OpenAI key.
- Every user-owned query filters by the verified user id. Sign-in, sign-up and comments are rate-limited.
- Bookmark metadata is looked up by the server, never taken from the client.
