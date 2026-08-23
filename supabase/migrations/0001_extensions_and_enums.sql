-- =====================================================================
-- Nagilai · 0001 · Extensions and enumerated types
-- =====================================================================
-- Every domain state that has a small, closed, code-visible set of values
-- is modelled as a Postgres enum so the database rejects impossible states.
-- Values that are *business configuration* (themes, languages, voices,
-- illustration styles, prices) are NOT enums -- they live in config tables
-- so they can be changed from the admin panel without a deployment.
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()
create extension if not exists "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------
-- Identity / access
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('user', 'support', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Story lifecycle
-- ---------------------------------------------------------------------
-- Mirrors §27 of the specification. A story moves forward through these
-- states; `failed` is terminal-until-retried and always carries an error
-- on the owning generation job.
do $$ begin
  create type public.story_status as enum (
    'draft',
    'queued',
    'generating_text',
    'text_ready',
    'generating_images',
    'images_ready',
    'generating_audio',
    'ready',
    'failed',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.story_length as enum ('short', 'medium', 'long');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.remix_kind as enum (
    'alternate_ending',
    'new_adventure',
    'shorter',
    'longer',
    'different_lesson',
    'different_language',
    'different_style'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Asset generation
-- ---------------------------------------------------------------------
do $$ begin
  create type public.asset_status as enum ('pending', 'generating', 'ready', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.narration_scope as enum ('full_story', 'page');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Background jobs (§27)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.job_type as enum (
    'story_text',
    'story_illustration',
    'story_cover',
    'story_narration',
    'story_pdf',
    'print_submission'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead_letter');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Cost tracking (§17)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.ai_operation as enum (
    'text_generation',
    'image_generation',
    'speech_synthesis',
    'moderation',
    'embedding'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Credits & commerce (§16)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.credit_reason as enum (
    'signup_grant',
    'monthly_grant',
    'purchase',
    'promotional',
    'refund',
    'admin_adjustment',
    'story_text',
    'story_illustration',
    'story_narration',
    'story_pdf_hq',
    'reversal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'paused', 'unpaid'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_kind as enum ('subscription_plan', 'credit_pack', 'printed_book', 'digital_addon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'draft', 'awaiting_payment', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('requires_action', 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.print_job_status as enum (
    'not_submitted', 'submitted', 'accepted', 'printing', 'shipped', 'delivered', 'rejected', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.book_binding as enum ('softcover', 'hardcover');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Safety (§7)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.moderation_stage as enum ('user_input', 'generated_text', 'illustration_prompt', 'generated_image', 'share_metadata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_outcome as enum ('allowed', 'flagged', 'blocked', 'regenerated');
exception when duplicate_object then null; end $$;
