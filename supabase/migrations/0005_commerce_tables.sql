-- =====================================================================
-- Nagilai · 0005 · Commerce — products, prices, subscriptions, orders,
--                  payments, print jobs
-- =====================================================================
-- These tables exist from day one so Phase 2 (monetisation) and Phase 3
-- (physical books) do not require a schema rewrite. Phase 1 ships with
-- them empty apart from seeded plan definitions.
--
-- Money is stored as integer minor units (cents/qəpik) plus an ISO-4217
-- currency code. Nothing in the application hard-codes a price (§16).
-- =====================================================================

create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  kind               public.product_kind not null,
  labels             jsonb not null default '{}'::jsonb,
  descriptions       jsonb not null default '{}'::jsonb,

  -- Plan/credit-pack entitlements, e.g.
  -- {"monthly_story_credits":30,"max_children":5,"premium_styles":true}
  features           jsonb not null default '{}'::jsonb,
  credits_granted    integer,

  -- Physical book attributes (kind = 'printed_book')
  book_trim_size     text,
  book_binding       public.book_binding,
  book_page_capacity integer,

  provider_product_id text,             -- Stripe product id, when synced
  image_url          text,
  sort_order         integer not null default 100,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists products_kind_idx on public.products (kind, is_active, sort_order);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- prices — a product may carry several currencies/intervals/regions
-- ---------------------------------------------------------------------
create table if not exists public.prices (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products (id) on delete cascade,
  currency          text not null,
  unit_amount       integer not null,               -- minor units
  interval          text,                           -- null | 'month' | 'year'
  interval_count    smallint not null default 1,
  trial_period_days smallint,
  country_code      text,                           -- null = default price
  provider          text not null default 'stripe',
  provider_price_id text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint prices_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint prices_amount_nonneg check (unit_amount >= 0),
  constraint prices_interval_known check (interval is null or interval in ('month', 'year'))
);

create index if not exists prices_product_idx on public.prices (product_id, is_active);
create unique index if not exists prices_provider_uidx
  on public.prices (provider, provider_price_id) where provider_price_id is not null;

drop trigger if exists prices_touch_updated_at on public.prices;
create trigger prices_touch_updated_at
  before update on public.prices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  product_id             uuid references public.products (id) on delete set null,
  price_id               uuid references public.prices (id) on delete set null,

  status                 public.subscription_status not null default 'incomplete',
  provider               text not null default 'stripe',
  provider_customer_id   text,
  provider_subscription_id text,

  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  trial_end              timestamptz,

  -- Guards the monthly credit grant against double-award on webhook retries.
  last_grant_period_start timestamptz,

  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_owner_idx on public.subscriptions (owner_id, status);
create unique index if not exists subscriptions_provider_uidx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- orders / order_items (§15)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete restrict,
  order_number        text not null unique,
  status              public.order_status not null default 'draft',
  currency            text not null default 'USD',

  subtotal_amount     integer not null default 0,
  shipping_amount     integer not null default 0,
  tax_amount          integer not null default 0,
  discount_amount     integer not null default 0,
  total_amount        integer not null default 0,

  -- Snapshot, not a foreign key: a delivery address must not change
  -- retroactively when the customer edits their address book.
  shipping_address    jsonb,
  billing_address     jsonb,
  contact_email       citext,
  customer_note       text,

  provider            text not null default 'stripe',
  provider_checkout_id text,
  paid_at             timestamptz,
  cancelled_at        timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_amounts_nonneg check (
    subtotal_amount >= 0 and shipping_amount >= 0 and tax_amount >= 0
    and discount_amount >= 0 and total_amount >= 0
  ),
  constraint orders_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index if not exists orders_owner_idx on public.orders (owner_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.credit_transactions drop constraint if exists credit_transactions_order_fk;
alter table public.credit_transactions
  add constraint credit_transactions_order_fk
  foreign key (order_id) references public.orders (id) on delete set null;

create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  story_id         uuid references public.stories (id) on delete set null,
  version_id       uuid references public.story_versions (id) on delete set null,
  pdf_id           uuid references public.story_pdfs (id) on delete set null,

  description      text not null,
  quantity         integer not null default 1,
  unit_amount      integer not null default 0,
  total_amount     integer not null default 0,
  -- Frozen configuration: trim size, binding, paper, cover finish.
  configuration    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),

  constraint order_items_quantity_positive check (quantity >= 1),
  constraint order_items_amounts_nonneg check (unit_amount >= 0 and total_amount >= 0)
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_story_idx on public.order_items (story_id);

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references public.profiles (id) on delete set null,
  order_id              uuid references public.orders (id) on delete set null,
  subscription_id       uuid references public.subscriptions (id) on delete set null,

  provider              text not null default 'stripe',
  provider_payment_id   text,
  provider_event_id     text,           -- webhook idempotency
  status                public.payment_status not null default 'pending',
  amount                integer not null default 0,
  currency              text not null default 'USD',
  refunded_amount       integer not null default 0,
  failure_code          text,
  failure_message       text,
  raw_payload           jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists payments_provider_payment_uidx
  on public.payments (provider, provider_payment_id) where provider_payment_id is not null;
create unique index if not exists payments_provider_event_uidx
  on public.payments (provider, provider_event_id) where provider_event_id is not null;
create index if not exists payments_owner_idx on public.payments (owner_id, created_at desc);

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- print_jobs (§15) — one per printed order item
-- ---------------------------------------------------------------------
-- Provider-neutral by design: `provider` names the PrintProvider
-- implementation ('manual' for the MVP admin fulfilment queue, later
-- 'gelato', 'lulu', a local Azerbaijani partner, ...).
create table if not exists public.print_jobs (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  order_item_id        uuid not null references public.order_items (id) on delete cascade,
  story_id             uuid references public.stories (id) on delete set null,
  print_pdf_id         uuid references public.story_pdfs (id) on delete set null,

  provider             text not null default 'manual',
  provider_job_id      text,
  status               public.print_job_status not null default 'not_submitted',
  tracking_number      text,
  tracking_url         text,
  estimated_ship_date  date,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  provider_cost_amount integer,
  provider_currency    text,
  last_error           text,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists print_jobs_order_idx on public.print_jobs (order_id);
create index if not exists print_jobs_status_idx on public.print_jobs (status, created_at desc);

drop trigger if exists print_jobs_touch_updated_at on public.print_jobs;
create trigger print_jobs_touch_updated_at
  before update on public.print_jobs
  for each row execute function public.touch_updated_at();
