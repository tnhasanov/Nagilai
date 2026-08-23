-- =====================================================================
-- Nagilai · 0006 · Database functions
-- =====================================================================
-- Everything here that runs as `security definer` pins `search_path` to
-- an empty string and fully qualifies every identifier, so a malicious
-- schema on the caller's search path cannot hijack the function body.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
      and p.deleted_at is null
  );
$$;

create or replace function public.is_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role in ('admin', 'support')
      and p.deleted_at is null
  );
$$;

create or replace function public.owns_story(p_story_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.owner_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------
-- New-user provisioning
-- ---------------------------------------------------------------------
-- Runs on `auth.users` insert. Creates the profile and awards the
-- welcome credits configured in `app_settings.credits`. Deliberately
-- exception-tolerant: a failure here must never block sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup_credits integer := 0;
  v_locale text;
  v_name text;
begin
  select coalesce((value ->> 'signup_grant')::integer, 0)
    into v_signup_credits
  from public.app_settings
  where key = 'credits';

  v_locale := coalesce(new.raw_user_meta_data ->> 'ui_locale', 'en-US');
  v_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.profiles (id, email, display_name, avatar_url, ui_locale)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@placeholder.invalid'),
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    v_locale
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  if coalesce(v_signup_credits, 0) > 0 then
    perform public.record_credit_transaction(
      new.id, v_signup_credits, 'signup_grant'::public.credit_reason,
      'signup:' || new.id::text, null, null, 'Welcome credits'
    );
  end if;

  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step with the auth record.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- Credits (§16, §34)
-- ---------------------------------------------------------------------
-- The single entry point for changing a balance. Guarantees:
--   * the profile row is locked, so concurrent spends cannot interleave;
--   * a negative balance is impossible (raises `insufficient_credits`);
--   * replaying the same `p_idempotency_key` is a no-op that returns the
--     balance produced by the original call -- this is what prevents
--     double-charging on webhook or job retries.
create or replace function public.record_credit_transaction(
  p_owner_id        uuid,
  p_delta           integer,
  p_reason          public.credit_reason,
  p_idempotency_key text default null,
  p_story_id        uuid default null,
  p_job_id          uuid default null,
  p_note            text default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_existing integer;
begin
  if p_delta = 0 then
    raise exception 'credit delta must be non-zero' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select balance_after into v_existing
    from public.credit_transactions
    where idempotency_key = p_idempotency_key;

    if found then
      return v_existing;
    end if;
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_owner_id
  for update;

  if not found then
    raise exception 'profile % not found', p_owner_id using errcode = 'P0002';
  end if;

  v_balance := v_balance + p_delta;

  if v_balance < 0 then
    raise exception 'insufficient_credits' using
      errcode = 'P0001',
      detail = format('balance=%s requested=%s', v_balance - p_delta, p_delta);
  end if;

  insert into public.credit_transactions (
    owner_id, delta, reason, balance_after, story_id, job_id,
    note, metadata, idempotency_key, created_by
  )
  values (
    p_owner_id, p_delta, p_reason, v_balance, p_story_id, p_job_id,
    p_note, coalesce(p_metadata, '{}'::jsonb), p_idempotency_key, auth.uid()
  );

  update public.profiles set credit_balance = v_balance where id = p_owner_id;

  return v_balance;
exception when unique_violation then
  -- Lost the race against a concurrent identical request: the other
  -- transaction already applied it, so report its result.
  select balance_after into v_existing
  from public.credit_transactions
  where idempotency_key = p_idempotency_key;
  return coalesce(v_existing, (select credit_balance from public.profiles where id = p_owner_id));
end;
$$;

-- ---------------------------------------------------------------------
-- Job queue (§27)
-- ---------------------------------------------------------------------
-- `for update skip locked` is what makes several concurrent workers safe:
-- each claim transaction takes a disjoint set of rows.
create or replace function public.claim_generation_jobs(
  p_limit    integer default 3,
  p_worker   text default 'worker',
  p_types    public.job_type[] default null
)
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select j.id
    from public.generation_jobs j
    where j.status = 'queued'
      and j.run_after <= now()
      and (p_types is null or j.type = any (p_types))
    order by j.priority asc, j.created_at asc
    limit greatest(1, least(p_limit, 25))
    for update skip locked
  )
  update public.generation_jobs g
     set status     = 'running',
         attempts   = g.attempts + 1,
         locked_at  = now(),
         locked_by  = p_worker,
         started_at = coalesce(g.started_at, now())
   where g.id in (select id from claimed)
  returning g.*;
end;
$$;

-- Jobs whose worker died mid-run (serverless timeout, deploy) are
-- returned to the queue with exponential backoff, or dead-lettered.
create or replace function public.reap_stalled_jobs(p_stale_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stalled as (
    update public.generation_jobs g
       set status = case
                      when g.attempts >= g.max_attempts then 'dead_letter'::public.job_status
                      else 'queued'::public.job_status
                    end,
           locked_at = null,
           locked_by = null,
           run_after = now() + (interval '30 seconds' * power(2, least(g.attempts, 6))),
           error_message = coalesce(g.error_message, 'worker stalled')
     where g.status = 'running'
       and g.locked_at < now() - p_stale_after
    returning 1
  )
  select count(*) into v_count from stalled;
  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- Rate limiting (§17, §24)
-- ---------------------------------------------------------------------
-- Fixed-window counter. Returns the number of requests remaining after
-- this one; a negative result means the caller is over the limit.
create or replace function public.consume_rate_limit(
  p_bucket   text,
  p_subject  text,
  p_limit    integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, subject, window_start, count, expires_at)
  values (p_bucket, p_subject, v_window_start, 1,
          v_window_start + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket, subject, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup so the table cannot grow without bound.
  if random() < 0.01 then
    delete from public.rate_limits where expires_at < now();
  end if;

  return p_limit - v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Share links (§21)
-- ---------------------------------------------------------------------
-- Anonymous visitors never touch `stories`, `children` or `profiles`
-- directly. They call this function, which returns exactly the fields a
-- shared book needs and nothing about the child beyond a display name.
create or replace function public.get_shared_story(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link   public.share_links%rowtype;
  v_story  public.stories%rowtype;
  v_version_id uuid;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into v_link from public.share_links where token = p_token;
  if not found
     or not v_link.is_enabled
     or v_link.revoked_at is not null
     or (v_link.expires_at is not null and v_link.expires_at < now()) then
    return null;
  end if;

  select * into v_story from public.stories where id = v_link.story_id;
  if not found or v_story.deleted_at is not null or v_story.status <> 'ready' then
    return null;
  end if;

  v_version_id := coalesce(v_link.version_id, v_story.current_version_id);
  if v_version_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'share', jsonb_build_object(
      'allow_audio', v_link.allow_audio,
      'allow_download', v_link.allow_download,
      'allow_indexing', v_link.allow_indexing
    ),
    'story', jsonb_build_object(
      'id', v_story.id,
      'title', coalesce(sv.title, v_story.title),
      'subtitle', coalesce(sv.subtitle, v_story.subtitle),
      'summary', coalesce(sv.summary, v_story.summary),
      'dedication', v_story.dedication,
      'language_code', v_story.language_code,
      'theme_slug', v_story.theme_slug,
      'created_at', v_story.created_at,
      -- Only the child's display name is exposed -- never age, notes,
      -- interests, photo or profile id (§21).
      'child_display_name', nullif(btrim(coalesce(v_story.child_snapshot ->> 'display_name', '')), ''),
      'educational_takeaway', sv.educational_takeaway
    ),
    'version_id', sv.id,
    'cover', (
      select jsonb_build_object('storage_path', i.storage_path, 'width', i.width, 'height', i.height)
      from public.story_illustrations i
      where i.version_id = sv.id and i.is_cover and i.status = 'ready' and i.superseded_by is null
      order by i.created_at desc limit 1
    ),
    'pages', coalesce((
      select jsonb_agg(page_json order by page_number)
      from (
        select p.page_number,
               jsonb_build_object(
                 'id', p.id,
                 'page_number', p.page_number,
                 'text', p.text,
                 'layout', p.layout,
                 'illustration', (
                   select jsonb_build_object('storage_path', i.storage_path,
                                             'width', i.width, 'height', i.height)
                   from public.story_illustrations i
                   where i.page_id = p.id and i.status = 'ready' and i.superseded_by is null
                   order by i.created_at desc limit 1
                 )
               ) as page_json
        from public.story_pages p
        where p.version_id = sv.id
      ) pages
    ), '[]'::jsonb),
    'narration', case when v_link.allow_audio then (
      select jsonb_build_object('storage_path', n.storage_path,
                                'duration_seconds', n.duration_seconds,
                                'timings', n.timings)
      from public.narrations n
      where n.version_id = sv.id and n.scope = 'full_story' and n.status = 'ready'
      order by n.created_at desc limit 1
    ) else null end
  )
  into v_result
  from public.story_versions sv
  where sv.id = v_version_id;

  return v_result;
end;
$$;

-- View counting is a write, so it lives in its own function rather than
-- inside the stable read above.
create or replace function public.touch_share_link(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.share_links
     set view_count = view_count + 1,
         last_viewed_at = now()
   where token = p_token
     and is_enabled
     and revoked_at is null
     and (expires_at is null or expires_at > now());
$$;

-- ---------------------------------------------------------------------
-- Order numbers (§15)
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1000;

create or replace function public.next_order_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'NG-' || to_char(now(), 'YYMM') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------
-- Admin dashboard aggregates (§18)
-- ---------------------------------------------------------------------
-- Returned as a single jsonb document so the dashboard makes one round
-- trip instead of a dozen. Admin-only; enforced inside the function so
-- it is safe even if someone grants execute too broadly.
create or replace function public.admin_dashboard_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'window_days', greatest(1, least(p_days, 365)),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles where deleted_at is null),
      'new', (select count(*) from public.profiles where created_at >= v_since),
      'active', (select count(*) from public.profiles where last_seen_at >= v_since)
    ),
    'children', jsonb_build_object(
      'total', (select count(*) from public.children where not is_archived)
    ),
    'stories', jsonb_build_object(
      'total', (select count(*) from public.stories where deleted_at is null),
      'recent', (select count(*) from public.stories where created_at >= v_since),
      'failed', (select count(*) from public.stories where status = 'failed' and created_at >= v_since),
      'by_language', coalesce((
        select jsonb_object_agg(language_code, c)
        from (select language_code, count(*) c from public.stories
              where created_at >= v_since group by language_code) t
      ), '{}'::jsonb),
      'by_theme', coalesce((
        select jsonb_object_agg(theme_slug, c)
        from (select theme_slug, count(*) c from public.stories
              where created_at >= v_since group by theme_slug) t
      ), '{}'::jsonb)
    ),
    'assets', jsonb_build_object(
      'images', (select count(*) from public.story_illustrations
                 where status = 'ready' and created_at >= v_since),
      'narrations', (select count(*) from public.narrations
                     where status = 'ready' and created_at >= v_since),
      'pdfs', (select count(*) from public.story_pdfs
               where status = 'ready' and created_at >= v_since)
    ),
    'ai_cost', jsonb_build_object(
      'total_micro_usd', coalesce((select sum(estimated_cost_micro_usd)
                                   from public.usage_events where created_at >= v_since), 0),
      'by_operation', coalesce((
        select jsonb_object_agg(operation, total)
        from (select operation, sum(estimated_cost_micro_usd) total
              from public.usage_events where created_at >= v_since group by operation) t
      ), '{}'::jsonb)
    ),
    'jobs', jsonb_build_object(
      'queued', (select count(*) from public.generation_jobs where status = 'queued'),
      'running', (select count(*) from public.generation_jobs where status = 'running'),
      'failed', (select count(*) from public.generation_jobs
                 where status in ('failed', 'dead_letter') and created_at >= v_since)
    ),
    'moderation', jsonb_build_object(
      'flagged', (select count(*) from public.moderation_events
                  where outcome <> 'allowed' and created_at >= v_since)
    ),
    'commerce', jsonb_build_object(
      'revenue_minor', coalesce((select sum(amount) from public.payments
                                 where status = 'succeeded' and created_at >= v_since), 0),
      'active_subscriptions', (select count(*) from public.subscriptions
                               where status in ('active', 'trialing')),
      'credit_purchases', (select count(*) from public.credit_transactions
                           where reason = 'purchase' and created_at >= v_since),
      'orders', (select count(*) from public.orders where created_at >= v_since)
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Account deletion (§22)
-- ---------------------------------------------------------------------
-- Marks the account for deletion. The nightly purge job performs the
-- hard delete of `auth.users`, which cascades through every table.
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.profiles
     set deletion_requested_at = now()
   where id = auth.uid();

  update public.share_links
     set is_enabled = false, revoked_at = now()
   where owner_id = auth.uid() and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke all on function public.record_credit_transaction(uuid, integer, public.credit_reason, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_generation_jobs(integer, text, public.job_type[]) from public, anon, authenticated;
revoke all on function public.reap_stalled_jobs(interval) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.owns_story(uuid, uuid) to authenticated;
grant execute on function public.get_shared_story(text) to anon, authenticated;
grant execute on function public.touch_share_link(text) to anon, authenticated;
grant execute on function public.admin_dashboard_metrics(integer) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
