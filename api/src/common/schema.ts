/**
 * SciRah database schema. Runs automatically (idempotently) every time the API starts,
 * so a fresh PostgreSQL 13+ database needs no manual setup. No extensions are required.
 *
 * SciRah never stores paper full text or PDFs: only ids + bibliographic metadata.
 */
export const SCHEMA_SQL = /* sql */ `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_verified boolean not null default false,
  password_hash text,
  google_sub text unique,
  display_name text,
  avatar_url text,
  -- Bumped on password change / "sign out everywhere"; invalidates older tokens.
  token_version int not null default 0,
  auto_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists users_email_key on users (lower(email));

-- Bookmarks: paper id + a small metadata snapshot (never full text)
create table if not exists bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  paper_id text not null,
  title text not null,
  authors text[] not null default '{}',
  year int,
  venue text,
  doi text,
  source_url text,
  is_open_access boolean not null default false,
  topics jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, paper_id)
);
create index if not exists bookmarks_user_created_idx on bookmarks (user_id, created_at desc);

-- AI summaries, shared across users so each paper is summarised only once
create table if not exists paper_summaries (
  paper_id text primary key,
  summary_en text not null,
  summary_ur text,
  basis text not null check (basis in ('abstract', 'fulltext')),
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Voice-over audio, cached so each summary is only ever synthesised once
create table if not exists tts_audio (
  cache_key text primary key,
  audio bytea not null,
  created_at timestamptz not null default now()
);

-- Summary translations (ur, hi, ar, zh, fr, es), one row per paper and language
create table if not exists paper_translations (
  paper_id text not null references paper_summaries (paper_id) on delete cascade,
  lang text not null,
  text text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (paper_id, lang)
);
-- Older databases kept the Urdu translation on paper_summaries.
insert into paper_translations (paper_id, lang, text, model)
  select paper_id, 'ur', summary_ur, model from paper_summaries where summary_ur is not null
  on conflict do nothing;

-- AI illustrations, generated once per paper
create table if not exists paper_graphics (
  paper_id text primary key,
  image bytea not null,
  mime text not null default 'image/png',
  model text not null,
  created_at timestamptz not null default now()
);

-- Papers added manually on SciRah (bibliographic details only — never the paper itself)
create table if not exists user_papers (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references users (id) on delete set null,
  title text not null check (char_length(title) between 5 and 600),
  authors text[] not null default '{}',
  year int,
  venue text,
  doi text,
  url text,
  abstract text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists user_papers_status_idx on user_papers (status, created_at desc);
create index if not exists user_papers_submitter_idx on user_papers (submitted_by, created_at desc);

-- Researcher profiles claimed via ORCID; holds the self-reported parts of the SciRah Score
create table if not exists author_claims (
  author_id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  orcid text not null,
  patents int not null default 0 check (patents between 0 and 1000),
  students int not null default 0 check (students between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  query text not null,
  mode text not null default 'keyword',
  -- OpenAlex topics of the top results, used to build the interest vector.
  topics jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists search_history_user_idx on search_history (user_id, created_at desc);

-- Topic vectors over OpenAlex's taxonomy (see feed/embedding.ts), stored as {"index": weight}.
create table if not exists paper_vectors (
  paper_id text primary key,
  embedding jsonb not null,
  subfields text[] not null default '{}',
  published_date date,
  citation_count int not null default 0,
  metadata jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists paper_vectors_published_idx on paper_vectors (published_date desc);
create index if not exists paper_vectors_subfields_idx on paper_vectors using gin (subfields);

create table if not exists user_interests (
  user_id uuid primary key references users (id) on delete cascade,
  embedding jsonb not null,
  top_subfields text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  paper_id text not null,
  user_id uuid not null references users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_paper_idx on comments (paper_id, created_at);

-- Topics a user wants updates on. Created automatically from searches (source = 'search')
-- or explicitly with "Get alerts" (source = 'manual').
create table if not exists alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  query text not null,
  query_key text not null,
  mode text not null default 'keyword',
  filters jsonb not null default '{}',
  source text not null default 'search' check (source in ('search', 'manual')),
  papers boolean not null default true,
  news boolean not null default true,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, query_key)
);
create index if not exists alerts_due_idx on alerts (enabled, last_checked_at nulls first);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  alert_id bigint references alerts (id) on delete set null,
  kind text not null check (kind in ('paper', 'news', 'system')),
  -- De-duplication key: the paper id, or the news URL.
  ref text not null,
  title text not null,
  body text,
  url text,
  paper_id text,
  image_url text,
  source text,
  topic text,
  published_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;
`;
