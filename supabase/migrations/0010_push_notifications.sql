-- =====================================================================
-- Nagilai · 0010 · Push notification devices and delivery log
-- =====================================================================
-- Generation takes minutes. Without a way to say "your story is ready",
-- the native app is a thing a parent has to sit and watch -- which is
-- exactly the experience the app exists to avoid.
--
-- Two tables and three profile columns. Deliberately provider-neutral:
-- nothing here names Expo, APNs or FCM, because the token is opaque to
-- the database and the transport is a decision for the service layer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Notification preferences on the profile
-- ---------------------------------------------------------------------
-- On the profile rather than a table of their own: they are per-parent,
-- there are few of them, and every read of them already has the profile
-- row in hand.
--
-- `push_enabled` defaults to true and means "the parent has not said no".
-- It is *not* consent to send: a device only receives anything once it
-- has registered a token, which on iOS and Android requires the OS
-- permission prompt. Two independent gates, and the OS owns the real one.
alter table public.profiles
  add column if not exists push_enabled boolean not null default true;

alter table public.profiles
  add column if not exists push_story_ready boolean not null default true;

-- Quiet hours, stored as local wall-clock minutes past midnight in the
-- profile's own timezone. Null means "no quiet hours". A bedtime story
-- app that buzzes a phone at 3am has misunderstood its own product.
alter table public.profiles
  add column if not exists push_quiet_from_minute smallint;

alter table public.profiles
  add column if not exists push_quiet_to_minute smallint;

alter table public.profiles
  drop constraint if exists profiles_push_quiet_range;
alter table public.profiles
  add constraint profiles_push_quiet_range check (
    (push_quiet_from_minute is null and push_quiet_to_minute is null)
    or (
      push_quiet_from_minute between 0 and 1439
      and push_quiet_to_minute between 0 and 1439
    )
  );

-- ---------------------------------------------------------------------
-- device_push_tokens
-- ---------------------------------------------------------------------
-- One row per installation, not per parent: a household may read on a
-- phone and a tablet, and both should light up.
--
-- The token is the natural key. It is unique globally rather than per
-- owner because a device handed to a different family member re-registers
-- the same token under a new account -- and the *old* row must stop
-- receiving that family's notifications the moment it does. Enforced by
-- the unique constraint plus the upsert in the service layer.
create table if not exists public.device_push_tokens (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,

  -- Opaque to the database. Expo push tokens today; an APNs or FCM token
  -- would fit the same column without a migration.
  token         text not null,
  provider      text not null default 'expo',
  platform      text not null,

  -- Stable per installation, so a reinstall replaces its own row rather
  -- than accumulating dead tokens.
  device_id     text,
  device_name   text,
  app_version   text,

  -- The interface language at registration time, so a notification can be
  -- written in the language the parent reads without a profile lookup.
  locale        text not null default 'en-US',

  -- Set when the push service tells us the token is dead. Kept rather
  -- than deleted so a debugging session can see what happened.
  disabled_at   timestamptz,
  disabled_reason text,

  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint device_push_tokens_platform_check
    check (platform in ('ios', 'android', 'web')),
  constraint device_push_tokens_token_length
    check (char_length(token) between 8 and 512)
);

create unique index if not exists device_push_tokens_token_uidx
  on public.device_push_tokens (token);

-- One row per (owner, installation): re-registering from the same install
-- updates rather than duplicates.
create unique index if not exists device_push_tokens_owner_device_uidx
  on public.device_push_tokens (owner_id, device_id)
  where device_id is not null;

create index if not exists device_push_tokens_owner_idx
  on public.device_push_tokens (owner_id)
  where disabled_at is null;

drop trigger if exists device_push_tokens_touch_updated_at on public.device_push_tokens;
create trigger device_push_tokens_touch_updated_at
  before update on public.device_push_tokens
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------
-- Why this exists: a story finishing is not one event. The text job
-- completes, then eleven illustration jobs complete, and the worker
-- checks "is this story done?" after each. Without a record of what was
-- already sent, a parent gets the same "your story is ready" twice --
-- or twelve times.
--
-- `dedupe_key` is derived from the work, exactly like the job queue's
-- idempotency keys, and the unique index is the whole mechanism.
create table if not exists public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  story_id      uuid references public.stories (id) on delete cascade,

  kind          text not null,
  dedupe_key    text not null,

  -- 'sent' when the provider accepted it, 'skipped' when we deliberately
  -- did not send (preference off, quiet hours, no device), 'failed' when
  -- the provider rejected it. All three are worth keeping: "why did I not
  -- get a notification" is a real support question.
  status        text not null default 'sent',
  detail        jsonb not null default '{}'::jsonb,
  device_count  integer not null default 0,

  created_at    timestamptz not null default now(),

  constraint notification_deliveries_status_check
    check (status in ('sent', 'skipped', 'failed'))
);

create unique index if not exists notification_deliveries_dedupe_uidx
  on public.notification_deliveries (dedupe_key);

create index if not exists notification_deliveries_owner_idx
  on public.notification_deliveries (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.device_push_tokens      enable row level security;
alter table public.notification_deliveries enable row level security;

-- A parent may see and remove their own devices -- "sign this tablet out
-- of notifications" is a setting they should own. Inserts go through the
-- service layer, which is the only thing that should decide a row's
-- owner_id.
drop policy if exists device_push_tokens_select_own on public.device_push_tokens;
create policy device_push_tokens_select_own on public.device_push_tokens
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists device_push_tokens_delete_own on public.device_push_tokens;
create policy device_push_tokens_delete_own on public.device_push_tokens
  for delete to authenticated
  using (owner_id = auth.uid());

-- Delivery history is diagnostic, and readable by the parent it concerns.
-- No insert or update policy: only the service layer writes here.
drop policy if exists notification_deliveries_select_own on public.notification_deliveries;
create policy notification_deliveries_select_own on public.notification_deliveries
  for select to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- The profile guard has to learn the new columns
-- ---------------------------------------------------------------------
-- 0007 pins the privileged columns on update. The notification columns
-- are *not* privileged -- a parent may turn their own notifications off --
-- so the guard is left alone deliberately. This comment exists so the
-- next person to read 0007 does not assume an oversight.

-- ---------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------
-- Off until a real Expo project id and store credentials exist. The app
-- asks the server whether to prompt for permission, so nothing prompts a
-- parent for a permission the product cannot yet honour.
update public.app_settings
set value = value || jsonb_build_object('push_notifications_enabled', false)
where key = 'features'
  and not (value ? 'push_notifications_enabled');
