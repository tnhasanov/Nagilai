-- =====================================================================
-- Nagilai · 0007 · Row Level Security
-- =====================================================================
-- Default posture: RLS on for every table, and *no* policy at all for
-- rows only the backend may write. Supabase's `service_role` key bypasses
-- RLS, so "no policy" means "server-side service layer only".
--
-- The rule that matters most for this product: a signed-in parent can
-- reach their own children and their own stories, and nothing else.
-- Anonymous visitors reach shared stories only through the
-- `get_shared_story()` function in 0006 -- never through a table.
-- =====================================================================

alter table public.profiles                enable row level security;
alter table public.children                enable row level security;
alter table public.languages               enable row level security;
alter table public.themes                  enable row level security;
alter table public.educational_objectives  enable row level security;
alter table public.illustration_styles     enable row level security;
alter table public.voices                  enable row level security;
alter table public.app_settings            enable row level security;
alter table public.stories                 enable row level security;
alter table public.story_versions          enable row level security;
alter table public.story_pages             enable row level security;
alter table public.story_illustrations     enable row level security;
alter table public.narrations              enable row level security;
alter table public.story_pdfs              enable row level security;
alter table public.share_links             enable row level security;
alter table public.generation_jobs         enable row level security;
alter table public.usage_events            enable row level security;
alter table public.credit_transactions     enable row level security;
alter table public.moderation_events       enable row level security;
alter table public.analytics_events        enable row level security;
alter table public.rate_limits             enable row level security;
alter table public.admin_audit_log         enable row level security;
alter table public.products                enable row level security;
alter table public.prices                  enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.payments                enable row level security;
alter table public.print_jobs              enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- A parent may edit their display name and locale but must never be able
-- to promote themselves or mint credits. Enforced in a trigger because
-- RLS operates per row, not per column.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and for internal triggers.
  if auth.uid() is not null and not public.is_admin() then
    new.id             := old.id;
    new.role           := old.role;
    new.credit_balance := old.credit_balance;
    new.email          := old.email;
    new.deleted_at     := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------
-- children — the strictest table in the schema (§24)
-- ---------------------------------------------------------------------
drop policy if exists children_select_own on public.children;
create policy children_select_own on public.children
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists children_insert_own on public.children;
create policy children_insert_own on public.children
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists children_update_own on public.children;
create policy children_update_own on public.children
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists children_delete_own on public.children;
create policy children_delete_own on public.children
  for delete to authenticated using (owner_id = auth.uid());

-- Note: no staff/admin read policy. Admins see aggregate counts through
-- `admin_dashboard_metrics()`, never individual children's records.

-- ---------------------------------------------------------------------
-- Reference/configuration tables — readable by everyone, writable by admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['languages', 'themes', 'educational_objectives',
                           'illustration_styles', 'voices']
  loop
    execute format('drop policy if exists %I_select_active on public.%I', t, t);
    execute format(
      'create policy %I_select_active on public.%I for select to anon, authenticated using (is_active or public.is_staff())',
      t, t);

    execute format('drop policy if exists %I_admin_all on public.%I', t, t);
    execute format(
      'create policy %I_admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t, t);
  end loop;
end $$;

drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated using (is_public or public.is_staff());

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- stories and their children rows
-- ---------------------------------------------------------------------
drop policy if exists stories_select_own on public.stories;
create policy stories_select_own on public.stories
  for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories
  for insert to authenticated with check (owner_id = auth.uid());

-- Parents may rename, favourite, dedicate and soft-delete. Generated
-- content and status transitions are written by the service layer only.
drop policy if exists stories_update_own on public.stories;
create policy stories_update_own on public.stories
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated using (owner_id = auth.uid());

-- Descendant tables: read-only for the owner, written by the service layer.
do $$
declare t text;
begin
  foreach t in array array['story_versions', 'story_pages', 'story_illustrations',
                           'narrations', 'story_pdfs']
  loop
    execute format('drop policy if exists %I_select_own on public.%I', t, t);
    execute format($f$
      create policy %I_select_own on public.%I
        for select to authenticated
        using (exists (
          select 1 from public.stories s
          where s.id = %I.story_id and s.owner_id = auth.uid() and s.deleted_at is null
        ))
    $f$, t, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- share_links — the owner manages them; readers use get_shared_story()
-- ---------------------------------------------------------------------
drop policy if exists share_links_owner_all on public.share_links;
create policy share_links_owner_all on public.share_links
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- Jobs, usage, credits — readable by their owner, written server-side
-- ---------------------------------------------------------------------
drop policy if exists generation_jobs_select_own on public.generation_jobs;
create policy generation_jobs_select_own on public.generation_jobs
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own on public.usage_events
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

-- moderation_events / analytics_events / admin_audit_log / rate_limits:
-- staff read only, service-role write. Parents never see raw moderation
-- output about their own prompts.
drop policy if exists moderation_events_staff_select on public.moderation_events;
create policy moderation_events_staff_select on public.moderation_events
  for select to authenticated using (public.is_staff());

drop policy if exists analytics_events_staff_select on public.analytics_events;
create policy analytics_events_staff_select on public.analytics_events
  for select to authenticated using (public.is_staff());

drop policy if exists admin_audit_log_staff_select on public.admin_audit_log;
create policy admin_audit_log_staff_select on public.admin_audit_log
  for select to authenticated using (public.is_staff());

-- rate_limits: no policy at all -- service role only.

-- ---------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------
drop policy if exists products_select_active on public.products;
create policy products_select_active on public.products
  for select to anon, authenticated using (is_active or public.is_staff());

drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists prices_select_active on public.prices;
create policy prices_select_active on public.prices
  for select to anon, authenticated using (is_active or public.is_staff());

drop policy if exists prices_admin_all on public.prices;
create policy prices_admin_all on public.prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and (o.owner_id = auth.uid() or public.is_staff())
  ));

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists print_jobs_select_own on public.print_jobs;
create policy print_jobs_select_own on public.print_jobs
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = print_jobs.order_id and (o.owner_id = auth.uid() or public.is_staff())
  ));
