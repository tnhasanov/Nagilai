-- =====================================================================
-- Nagilai · 0004 · Background jobs, AI usage/cost tracking, credits,
--                  moderation events, analytics, rate limiting
-- =====================================================================

-- ---------------------------------------------------------------------
-- generation_jobs (§27)
-- ---------------------------------------------------------------------
-- A durable queue in Postgres. Claiming is done with
-- `select ... for update skip locked` (see 0006) so several workers --
-- a Vercel cron tick, an inline "kick" after an HTTP request, or an
-- external queue consumer -- can drain it concurrently without ever
-- handing the same job to two runners.
create table if not exists public.generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  type            public.job_type not null,
  status          public.job_status not null default 'queued',

  owner_id        uuid references public.profiles (id) on delete cascade,
  story_id        uuid references public.stories (id) on delete cascade,
  version_id      uuid references public.story_versions (id) on delete cascade,
  page_id         uuid references public.story_pages (id) on delete cascade,

  payload         jsonb not null default '{}'::jsonb,
  result          jsonb,

  priority        smallint not null default 100,   -- lower runs first
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  started_at      timestamptz,
  finished_at     timestamptz,
  error_message   text,
  error_detail    jsonb,

  -- Collapses duplicate enqueues of the same unit of work (§17).
  idempotency_key text unique,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint generation_jobs_attempts_nonneg check (attempts >= 0)
);

create index if not exists generation_jobs_claim_idx
  on public.generation_jobs (status, run_after, priority, created_at)
  where status = 'queued';
create index if not exists generation_jobs_story_idx on public.generation_jobs (story_id, type);
create index if not exists generation_jobs_owner_idx on public.generation_jobs (owner_id, created_at desc);
create index if not exists generation_jobs_stuck_idx
  on public.generation_jobs (locked_at) where status = 'running';

drop trigger if exists generation_jobs_touch_updated_at on public.generation_jobs;
create trigger generation_jobs_touch_updated_at
  before update on public.generation_jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- usage_events — every billable AI call (§17)
-- ---------------------------------------------------------------------
-- Costs are stored in micro-USD integers rather than floats so the admin
-- totals are exact. `unit_costs` snapshots the per-unit rates that were
-- in force at the time, so historic reports do not shift when pricing
-- configuration is updated.
create table if not exists public.usage_events (
  id                  bigint generated always as identity primary key,
  owner_id            uuid references public.profiles (id) on delete set null,
  story_id            uuid references public.stories (id) on delete set null,
  version_id          uuid references public.story_versions (id) on delete set null,
  job_id              uuid references public.generation_jobs (id) on delete set null,

  provider            text not null,
  model               text not null,
  operation           public.ai_operation not null,

  input_tokens        integer,
  output_tokens       integer,
  cached_input_tokens integer,
  reasoning_tokens    integer,
  image_count         integer,
  image_size          text,
  audio_characters    integer,
  audio_seconds       numeric(10,2),

  estimated_cost_micro_usd bigint not null default 0,
  unit_costs          jsonb,

  duration_ms         integer,
  succeeded           boolean not null default true,
  error_code          text,

  created_at          timestamptz not null default now()
);

create index if not exists usage_events_owner_idx on public.usage_events (owner_id, created_at desc);
create index if not exists usage_events_story_idx on public.usage_events (story_id);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_operation_idx on public.usage_events (operation, created_at desc);

-- ---------------------------------------------------------------------
-- credit_transactions — append-only ledger (§16)
-- ---------------------------------------------------------------------
-- `idempotency_key` is what makes double-charging impossible: the same
-- logical spend can be submitted any number of times and only the first
-- insert wins. `balance_after` is recorded per row so a support agent can
-- reconstruct history without replaying the whole ledger.
create table if not exists public.credit_transactions (
  id               bigint generated always as identity primary key,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  delta            integer not null,
  reason           public.credit_reason not null,
  balance_after    integer not null,

  story_id         uuid references public.stories (id) on delete set null,
  job_id           uuid references public.generation_jobs (id) on delete set null,
  order_id         uuid,
  note             text,
  metadata         jsonb not null default '{}'::jsonb,

  idempotency_key  text unique,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint credit_transactions_delta_nonzero check (delta <> 0)
);

create index if not exists credit_transactions_owner_idx
  on public.credit_transactions (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- moderation_events (§7)
-- ---------------------------------------------------------------------
create table if not exists public.moderation_events (
  id             bigint generated always as identity primary key,
  owner_id       uuid references public.profiles (id) on delete set null,
  story_id       uuid references public.stories (id) on delete set null,
  job_id         uuid references public.generation_jobs (id) on delete set null,

  stage          public.moderation_stage not null,
  outcome        public.moderation_outcome not null,
  provider       text,
  model          text,
  categories     text[] not null default '{}',
  scores         jsonb,
  -- Truncated + redacted. Full offending text is never persisted.
  excerpt        text,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),

  constraint moderation_events_excerpt_len check (excerpt is null or length(excerpt) <= 500)
);

create index if not exists moderation_events_created_idx on public.moderation_events (created_at desc);
create index if not exists moderation_events_outcome_idx
  on public.moderation_events (outcome, created_at desc) where outcome <> 'allowed';

-- ---------------------------------------------------------------------
-- analytics_events (§19)
-- ---------------------------------------------------------------------
-- Written server-side so the funnel survives ad blockers. A forwarder
-- ships rows to PostHog/GA4 through the analytics service abstraction;
-- the table itself is provider-agnostic.
create table if not exists public.analytics_events (
  id             bigint generated always as identity primary key,
  owner_id       uuid references public.profiles (id) on delete set null,
  anonymous_id   text,
  session_id     text,
  name           text not null,
  properties     jsonb not null default '{}'::jsonb,
  url            text,
  referrer       text,
  forwarded_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on public.analytics_events (name, created_at desc);
create index if not exists analytics_events_owner_idx on public.analytics_events (owner_id, created_at desc);
create index if not exists analytics_events_pending_idx
  on public.analytics_events (created_at) where forwarded_at is null;

-- ---------------------------------------------------------------------
-- rate_limits — fixed-window counters (§17, §24)
-- ---------------------------------------------------------------------
-- Deliberately in Postgres: it works on serverless with no extra
-- infrastructure, and the limits that matter here (paid AI calls) are
-- low-frequency. The service interface allows a Redis/Upstash backend
-- to replace this later without touching call sites.
create table if not exists public.rate_limits (
  bucket        text not null,
  subject       text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  expires_at    timestamptz not null,
  primary key (bucket, subject, window_start)
);

create index if not exists rate_limits_expiry_idx on public.rate_limits (expires_at);

-- ---------------------------------------------------------------------
-- admin_audit_log (§24: audit important administrative actions)
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null,
  entity_type   text,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);
