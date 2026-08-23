-- =====================================================================
-- Nagilai · 0003 · Stories, versions, pages, illustrations, narration
-- =====================================================================
-- Shape of the domain:
--
--   story ──┬── story_version (a generated realisation of the story)
--           │        ├── story_page          (scene text + layout)
--           │        │      └── story_illustration
--           │        └── narration           (full-story or per-page audio)
--           ├── story_pdf                    (rendered book files)
--           └── share_link
--
-- A *remix* (§12) never mutates the original: it creates a new `story`
-- row pointing back through `remixed_from_story_id`. A *regeneration*
-- of the same story creates a new `story_version` and moves the
-- `current_version_id` pointer, so earlier versions stay readable.
-- =====================================================================

create table if not exists public.stories (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  child_id            uuid references public.children (id) on delete set null,

  -- ---- Generation inputs (the "recipe") --------------------------------
  -- §"Additional architectural note": the story owns its language. No
  -- language code is ever passed through a URL or a client request for
  -- narration/PDF -- those services read it from here.
  language_code       text not null references public.languages (code) on update cascade,
  theme_id            uuid references public.themes (id) on delete set null,
  theme_slug          text not null,                 -- frozen at creation time
  objective_id        uuid references public.educational_objectives (id) on delete set null,
  objective_slug      text,
  illustration_style_id uuid references public.illustration_styles (id) on delete set null,
  illustration_style_slug text,
  length              public.story_length not null default 'medium',
  custom_instructions text,

  -- Redacted copy of the child's details used for generation. Keeping a
  -- snapshot means (a) regeneration is reproducible after the profile is
  -- edited, and (b) share pages can render "a story for Miray" without
  -- ever joining to `children` (§21).
  child_snapshot      jsonb not null default '{}'::jsonb,

  -- ---- Presentation ----------------------------------------------------
  title               text,
  subtitle            text,
  summary             text,
  dedication          text,
  cover_illustration_id uuid,                        -- FK added below
  is_favourite        boolean not null default false,

  -- ---- Lifecycle -------------------------------------------------------
  status              public.story_status not null default 'draft',
  status_message      text,
  current_version_id  uuid,                          -- FK added below
  failure_reason      text,

  -- ---- Provenance ------------------------------------------------------
  remixed_from_story_id uuid references public.stories (id) on delete set null,
  remix_kind          public.remix_kind,
  -- Set when the row was imported from the retired Bubble prototype (§36).
  legacy_bubble_id    text unique,

  first_ready_at      timestamptz,
  last_opened_at      timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint stories_custom_instructions_len
    check (custom_instructions is null or length(custom_instructions) <= 600),
  constraint stories_dedication_len
    check (dedication is null or length(dedication) <= 300)
);

create index if not exists stories_owner_idx
  on public.stories (owner_id, created_at desc) where deleted_at is null;
create index if not exists stories_child_idx
  on public.stories (child_id, created_at desc) where deleted_at is null;
create index if not exists stories_status_idx on public.stories (status, updated_at desc);
create index if not exists stories_language_idx on public.stories (language_code);
create index if not exists stories_theme_idx on public.stories (theme_slug);
create index if not exists stories_favourite_idx
  on public.stories (owner_id, is_favourite) where is_favourite and deleted_at is null;

drop trigger if exists stories_touch_updated_at on public.stories;
create trigger stories_touch_updated_at
  before update on public.stories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- story_versions
-- ---------------------------------------------------------------------
create table if not exists public.story_versions (
  id                uuid primary key default gen_random_uuid(),
  story_id          uuid not null references public.stories (id) on delete cascade,
  version_number    integer not null default 1,

  title             text,
  subtitle          text,
  summary           text,
  cover_concept     text,
  educational_takeaway text,
  discussion_questions text[] not null default '{}',

  -- The reusable character sheet (§8) that keeps the protagonist looking
  -- identical from page to page.
  character_bible   jsonb not null default '{}'::jsonb,
  -- Non-secret provenance: model id, prompt version, temperature, seed.
  generation_meta   jsonb not null default '{}'::jsonb,

  word_count        integer,
  reading_minutes   numeric(5,2),

  status            public.asset_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (story_id, version_number)
);

create index if not exists story_versions_story_idx
  on public.story_versions (story_id, version_number desc);

drop trigger if exists story_versions_touch_updated_at on public.story_versions;
create trigger story_versions_touch_updated_at
  before update on public.story_versions
  for each row execute function public.touch_updated_at();

alter table public.stories drop constraint if exists stories_current_version_fk;
alter table public.stories
  add constraint stories_current_version_fk
  foreign key (current_version_id) references public.story_versions (id) on delete set null;

-- ---------------------------------------------------------------------
-- story_pages — one scene per row (§5: never one long string)
-- ---------------------------------------------------------------------
create table if not exists public.story_pages (
  id                  uuid primary key default gen_random_uuid(),
  version_id          uuid not null references public.story_versions (id) on delete cascade,
  story_id            uuid not null references public.stories (id) on delete cascade,
  page_number         integer not null,

  text                text not null,
  scene_summary       text,
  illustration_prompt text,
  -- Layout hint for the reader and the PDF: how text and art share the page.
  layout              text not null default 'illustration_top',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (version_id, page_number),
  constraint story_pages_page_number_positive check (page_number >= 1),
  constraint story_pages_layout_known
    check (layout in ('illustration_top', 'illustration_left', 'illustration_right',
                      'illustration_full', 'text_only'))
);

create index if not exists story_pages_version_idx on public.story_pages (version_id, page_number);
create index if not exists story_pages_story_idx on public.story_pages (story_id);

drop trigger if exists story_pages_touch_updated_at on public.story_pages;
create trigger story_pages_touch_updated_at
  before update on public.story_pages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- story_illustrations
-- ---------------------------------------------------------------------
-- `page_id` is null for the book cover. The (version_id, page_id, style)
-- uniqueness rule is what stops the app paying twice for the same image
-- (§17): a re-render must explicitly supersede the previous row.
create table if not exists public.story_illustrations (
  id                uuid primary key default gen_random_uuid(),
  story_id          uuid not null references public.stories (id) on delete cascade,
  version_id        uuid not null references public.story_versions (id) on delete cascade,
  page_id           uuid references public.story_pages (id) on delete cascade,
  is_cover          boolean not null default false,

  style_slug        text not null,
  prompt            text not null,
  revised_prompt    text,

  provider          text not null default 'openai',
  model             text,
  storage_path      text,                 -- private bucket object path
  width             integer,
  height            integer,
  mime_type         text default 'image/png',
  bytes             integer,
  -- Deterministic hash of (prompt + style + model + size). Lets the
  -- generator short-circuit an identical request instead of re-billing.
  prompt_fingerprint text,

  status            public.asset_status not null default 'pending',
  error_message     text,
  superseded_by     uuid references public.story_illustrations (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint story_illustrations_cover_has_no_page
    check ((is_cover and page_id is null) or (not is_cover and page_id is not null))
);

create index if not exists story_illustrations_version_idx
  on public.story_illustrations (version_id, is_cover);
create index if not exists story_illustrations_page_idx on public.story_illustrations (page_id);
create unique index if not exists story_illustrations_active_page_uidx
  on public.story_illustrations (version_id, page_id, style_slug)
  where superseded_by is null and page_id is not null;
create unique index if not exists story_illustrations_active_cover_uidx
  on public.story_illustrations (version_id, style_slug)
  where superseded_by is null and is_cover;
create index if not exists story_illustrations_fingerprint_idx
  on public.story_illustrations (prompt_fingerprint) where prompt_fingerprint is not null;

drop trigger if exists story_illustrations_touch_updated_at on public.story_illustrations;
create trigger story_illustrations_touch_updated_at
  before update on public.story_illustrations
  for each row execute function public.touch_updated_at();

alter table public.stories drop constraint if exists stories_cover_illustration_fk;
alter table public.stories
  add constraint stories_cover_illustration_fk
  foreign key (cover_illustration_id) references public.story_illustrations (id) on delete set null;

-- ---------------------------------------------------------------------
-- narrations — cached TTS audio (§10, §17)
-- ---------------------------------------------------------------------
-- The unique index below is the "never regenerate audio on Play" rule
-- from §37 expressed as a database constraint.
create table if not exists public.narrations (
  id               uuid primary key default gen_random_uuid(),
  story_id         uuid not null references public.stories (id) on delete cascade,
  version_id       uuid not null references public.story_versions (id) on delete cascade,
  page_id          uuid references public.story_pages (id) on delete cascade,
  scope            public.narration_scope not null default 'full_story',

  voice_id         uuid references public.voices (id) on delete set null,
  voice_slug       text not null,
  language_code    text not null,
  speed            numeric(3,2) not null default 1.00,

  provider         text not null default 'openai',
  model            text,
  storage_path     text,
  mime_type        text not null default 'audio/mpeg',
  bytes            integer,
  duration_seconds numeric(8,2),
  -- Word/sentence timings used to highlight text while the audio plays.
  timings          jsonb,
  -- sha256 of the exact text that was synthesised.
  text_hash        text not null,

  status           public.asset_status not null default 'pending',
  error_message    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint narrations_scope_matches_page
    check ((scope = 'page' and page_id is not null) or (scope = 'full_story' and page_id is null)),
  constraint narrations_speed_range check (speed between 0.25 and 4.00)
);

create unique index if not exists narrations_full_story_uidx
  on public.narrations (version_id, voice_slug, speed, text_hash)
  where scope = 'full_story';
create unique index if not exists narrations_page_uidx
  on public.narrations (page_id, voice_slug, speed, text_hash)
  where scope = 'page';
create index if not exists narrations_story_idx on public.narrations (story_id, scope);

drop trigger if exists narrations_touch_updated_at on public.narrations;
create trigger narrations_touch_updated_at
  before update on public.narrations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- story_pdfs — rendered book files (§14)
-- ---------------------------------------------------------------------
create table if not exists public.story_pdfs (
  id             uuid primary key default gen_random_uuid(),
  story_id       uuid not null references public.stories (id) on delete cascade,
  version_id     uuid not null references public.story_versions (id) on delete cascade,
  -- 'digital'  → screen/home printing, RGB, no bleed
  -- 'print'    → commercial printing, bleed + trim marks
  variant        text not null default 'digital',
  page_size      text not null default 'a4',
  storage_path   text,
  bytes          integer,
  page_count     integer,
  -- Hash over (version content + illustrations + variant). Regenerating an
  -- unchanged book returns the cached object instead of re-rendering.
  content_hash   text not null,
  status         public.asset_status not null default 'pending',
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint story_pdfs_variant_known check (variant in ('digital', 'print')),
  unique (version_id, variant, page_size, content_hash)
);

create index if not exists story_pdfs_story_idx on public.story_pdfs (story_id, variant);

drop trigger if exists story_pdfs_touch_updated_at on public.story_pdfs;
create trigger story_pdfs_touch_updated_at
  before update on public.story_pdfs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- share_links — controlled public access (§21)
-- ---------------------------------------------------------------------
-- `token` carries 256 bits of entropy from a CSPRNG. Links are private by
-- default, revocable, individually expiring, and `noindex` unless the
-- owner deliberately opts in (§31).
create table if not exists public.share_links (
  id             uuid primary key default gen_random_uuid(),
  story_id       uuid not null references public.stories (id) on delete cascade,
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  token          text not null unique,
  version_id     uuid references public.story_versions (id) on delete set null,

  is_enabled     boolean not null default true,
  allow_indexing boolean not null default false,
  allow_audio    boolean not null default true,
  allow_download boolean not null default false,
  expires_at     timestamptz,
  view_count     integer not null default 0,
  last_viewed_at timestamptz,

  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint share_links_token_entropy check (length(token) >= 32)
);

create index if not exists share_links_story_idx on public.share_links (story_id);
create index if not exists share_links_owner_idx on public.share_links (owner_id, created_at desc);

drop trigger if exists share_links_touch_updated_at on public.share_links;
create trigger share_links_touch_updated_at
  before update on public.share_links
  for each row execute function public.touch_updated_at();
