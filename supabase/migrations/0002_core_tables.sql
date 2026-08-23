-- =====================================================================
-- Nagilai · 0002 · Identity, children, and admin-editable configuration
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — one row per authenticated user (mirrors auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  email                 citext not null,
  display_name          text,
  avatar_url            text,
  role                  public.user_role not null default 'user',

  -- Interface language (§13). Distinct from a story's language.
  ui_locale             text not null default 'en-US',
  country_code          text,
  timezone              text,

  -- Denormalised balance. `credit_transactions` remains the source of
  -- truth; this column is maintained by trigger for cheap reads.
  credit_balance        integer not null default 0,

  marketing_opt_in      boolean not null default false,
  onboarding_completed  boolean not null default false,

  -- §22: account deletion. Soft-delete first so we can honour the
  -- 30-day grace window before the hard purge job runs.
  deletion_requested_at timestamptz,
  deleted_at            timestamptz,

  last_seen_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profiles_credit_balance_nonneg check (credit_balance >= 0)
);

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- languages — story + interface languages (§13). Admin-editable.
-- ---------------------------------------------------------------------
create table if not exists public.languages (
  code                text primary key,               -- BCP-47, e.g. 'az-AZ'
  name_native         text not null,                  -- 'Azərbaycan dili'
  name_en             text not null,                  -- 'Azerbaijani'
  flag_emoji          text,
  is_story_language   boolean not null default true,
  is_ui_language      boolean not null default false,
  -- Guidance appended to the story system prompt so each language reads
  -- natively rather than as a translation from English (§6).
  style_guidance      text,
  default_voice_id    uuid,                           -- FK added in 0003
  sort_order          integer not null default 100,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint languages_code_format check (code ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

drop trigger if exists languages_touch_updated_at on public.languages;
create trigger languages_touch_updated_at
  before update on public.languages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- themes — story types (§4). Admin-editable, never hard-coded.
-- ---------------------------------------------------------------------
create table if not exists public.themes (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  -- Localised labels: { "en-US": "Adventure", "az-AZ": "Macəra", ... }
  labels            jsonb not null default '{}'::jsonb,
  descriptions      jsonb not null default '{}'::jsonb,
  icon              text,
  accent_color      text,
  cover_art_url     text,
  -- Extra instructions merged into the story prompt for this theme.
  prompt_guidance   text,
  min_age           smallint not null default 2,
  max_age           smallint not null default 12,
  is_premium        boolean not null default false,
  is_custom_input   boolean not null default false, -- the "Custom story" tile
  sort_order        integer not null default 100,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint themes_age_range check (min_age <= max_age)
);

create index if not exists themes_active_sort_idx on public.themes (is_active, sort_order);

drop trigger if exists themes_touch_updated_at on public.themes;
create trigger themes_touch_updated_at
  before update on public.themes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- educational_objectives — optional learning goal (§4). Admin-editable.
-- ---------------------------------------------------------------------
create table if not exists public.educational_objectives (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  category         text not null default 'values',  -- values | academic | emotional
  labels           jsonb not null default '{}'::jsonb,
  prompt_guidance  text,
  min_age          smallint not null default 2,
  max_age          smallint not null default 12,
  sort_order       integer not null default 100,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists educational_objectives_active_idx
  on public.educational_objectives (is_active, category, sort_order);

drop trigger if exists educational_objectives_touch_updated_at on public.educational_objectives;
create trigger educational_objectives_touch_updated_at
  before update on public.educational_objectives
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- illustration_styles — visual direction (§8). Admin-editable.
-- ---------------------------------------------------------------------
create table if not exists public.illustration_styles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  labels            jsonb not null default '{}'::jsonb,
  -- Prepended to every illustration prompt for this style. Deliberately
  -- describes technique and mood only -- never a living artist (§8).
  prompt_prefix     text not null,
  negative_prompt   text,
  preview_image_url text,
  is_premium        boolean not null default false,
  sort_order        integer not null default 100,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists illustration_styles_active_idx
  on public.illustration_styles (is_active, sort_order);

drop trigger if exists illustration_styles_touch_updated_at on public.illustration_styles;
create trigger illustration_styles_touch_updated_at
  before update on public.illustration_styles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- voices — narration voices (§10). Admin-editable.
-- ---------------------------------------------------------------------
create table if not exists public.voices (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  provider           text not null default 'openai',
  provider_voice_id  text not null,                  -- e.g. 'alloy', 'nova'
  labels             jsonb not null default '{}'::jsonb,
  description        text,
  -- Empty array => suitable for every language.
  supported_language_codes text[] not null default '{}',
  sample_audio_url   text,
  -- Extra narration direction sent to the TTS model.
  delivery_guidance  text,
  is_premium         boolean not null default false,
  sort_order         integer not null default 100,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists voices_active_idx on public.voices (is_active, sort_order);

drop trigger if exists voices_touch_updated_at on public.voices;
create trigger voices_touch_updated_at
  before update on public.voices
  for each row execute function public.touch_updated_at();

alter table public.languages
  drop constraint if exists languages_default_voice_fk;
alter table public.languages
  add constraint languages_default_voice_fk
  foreign key (default_voice_id) references public.voices (id) on delete set null;

-- ---------------------------------------------------------------------
-- app_settings — feature flags, model config, business knobs (§18)
-- ---------------------------------------------------------------------
-- One row per namespaced key. `value` is jsonb so a setting can be a
-- scalar, a list or a whole config object. Nothing here is a secret;
-- secrets stay in environment variables (§24).
create table if not exists public.app_settings (
  key           text primary key,
  value         jsonb not null,
  description   text,
  -- Readable by unauthenticated visitors (e.g. marketing copy toggles).
  is_public     boolean not null default false,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- children — child profiles (§3)
-- ---------------------------------------------------------------------
-- The most privacy-sensitive table in the product. Never exposed through
-- share links; see 0007 for the RLS policies and 0003 for the redacted
-- snapshot that share pages read instead.
create table if not exists public.children (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete cascade,

  name                  text not null,
  nickname              text,
  -- Birth date is optional; when present `age_years` is derived so the
  -- child's age stays correct over time without the parent editing it.
  birth_date            date,
  age_years             smallint,
  gender                text,                       -- free text, optional (§3)
  preferred_language    text not null default 'en-US'
                          references public.languages (code) on update cascade,

  interests             text[] not null default '{}',
  favourite_animals     text[] not null default '{}',
  favourite_activities  text[] not null default '{}',
  favourite_characters  text[] not null default '{}',
  personality_traits    text[] not null default '{}',
  learning_interests    text[] not null default '{}',
  parent_notes          text,

  avatar_color          text,
  -- Storage object path in the private `child-photos` bucket. Never a
  -- public URL: the app mints short-lived signed URLs on demand (§24).
  photo_storage_path    text,
  photo_consent_at      timestamptz,
  photo_consent_by      uuid references public.profiles (id) on delete set null,
  -- Frozen visual description derived from the photo, reused across
  -- stories so the same child looks the same book to book (§8).
  appearance_description text,

  is_archived           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint children_name_not_blank check (length(btrim(name)) between 1 and 60),
  constraint children_nickname_len check (nickname is null or length(btrim(nickname)) <= 60),
  constraint children_age_range check (age_years is null or age_years between 0 and 17),
  constraint children_notes_len check (parent_notes is null or length(parent_notes) <= 1000),
  -- A photo may only be stored alongside a recorded consent timestamp.
  constraint children_photo_requires_consent
    check (photo_storage_path is null or photo_consent_at is not null)
);

create index if not exists children_owner_idx on public.children (owner_id, is_archived, created_at desc);

drop trigger if exists children_touch_updated_at on public.children;
create trigger children_touch_updated_at
  before update on public.children
  for each row execute function public.touch_updated_at();

-- Keep `age_years` consistent with `birth_date` when one is supplied.
create or replace function public.children_sync_age()
returns trigger
language plpgsql
as $$
begin
  if new.birth_date is not null then
    new.age_years := greatest(0, extract(year from age(current_date, new.birth_date))::smallint);
  end if;
  return new;
end;
$$;

drop trigger if exists children_sync_age on public.children;
create trigger children_sync_age
  before insert or update of birth_date on public.children
  for each row execute function public.children_sync_age();
