-- =====================================================================
-- Nagilai · database assertions
-- =====================================================================
-- Run by scripts/verify-migrations.sh. Every block raises on failure, so
-- psql's ON_ERROR_STOP turns a broken invariant into a non-zero exit.
--
-- What is protected here:
--   1. a parent can never read another family's children or stories
--   2. a parent can never promote themselves or mint credits
--   3. the same credit spend can never be applied twice
--   4. a balance can never go negative
--   5. a share link never leaks a child's personal information
--   6. two workers never claim the same generation job
-- =====================================================================

\set ON_ERROR_STOP on

\set uid_a '11111111-1111-1111-1111-111111111111'
\set uid_b '22222222-2222-2222-2222-222222222222'
\set uid_admin '33333333-3333-3333-3333-333333333333'
\set child_a 'aaaaaaaa-0000-4000-8000-000000000001'
\set child_b 'bbbbbbbb-0000-4000-8000-000000000001'
\set story_a 'aaaaaaaa-0000-4000-8000-00000000000a'
\set story_b 'bbbbbbbb-0000-4000-8000-00000000000b'
\set version_a 'aaaaaaaa-0000-4000-8000-0000000000c1'
\set page_a1 'aaaaaaaa-0000-4000-8000-0000000000d1'

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
begin;

delete from auth.users
 where email in ('parent-a@test.invalid', 'parent-b@test.invalid', 'admin@test.invalid');

insert into auth.users (id, email, raw_user_meta_data) values
  (:'uid_a',     'parent-a@test.invalid', '{"display_name":"Parent A"}'),
  (:'uid_b',     'parent-b@test.invalid', '{"display_name":"Parent B"}'),
  (:'uid_admin', 'admin@test.invalid',    '{"display_name":"Admin"}');

update public.profiles set role = 'admin' where id = :'uid_admin';

do $$
declare v_balance integer; v_rows integer;
begin
  select credit_balance into v_balance from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if v_balance is null then
    raise exception 'ASSERT FAILED: no profile was auto-created for the new auth user';
  end if;
  if v_balance <> 3 then
    raise exception 'ASSERT FAILED: expected the seeded signup grant of 3 credits, got %', v_balance;
  end if;

  select count(*) into v_rows from public.credit_transactions
   where owner_id = '11111111-1111-1111-1111-111111111111' and reason = 'signup_grant';
  if v_rows <> 1 then
    raise exception 'ASSERT FAILED: expected exactly one signup grant row, got %', v_rows;
  end if;
end $$;

insert into public.children (id, owner_id, name, age_years, preferred_language, parent_notes) values
  (:'child_a', :'uid_a', 'Miray', 6, 'az-AZ', 'Afraid of thunder'),
  (:'child_b', :'uid_b', 'Nils',  5, 'en-US', null);

insert into public.stories
  (id, owner_id, child_id, language_code, theme_slug, status, title, child_snapshot) values
  (:'story_a', :'uid_a', :'child_a', 'az-AZ', 'space', 'ready', 'Mirayın kosmik səyahəti',
   '{"display_name":"Miray","age_years":6,"interests":["ulduzlar"],"parent_notes":"CONFIDENTIAL"}'),
  (:'story_b', :'uid_b', :'child_b', 'en-US', 'animals', 'ready', 'Nils and the Fox', '{}');

insert into public.story_versions (id, story_id, version_number, title, status)
values (:'version_a', :'story_a', 1, 'Mirayın kosmik səyahəti', 'ready');

update public.stories set current_version_id = :'version_a' where id = :'story_a';

insert into public.story_pages (id, version_id, story_id, page_number, text)
values (:'page_a1', :'version_a', :'story_a', 1, 'Miray ulduzlara baxdı.');

commit;

-- ---------------------------------------------------------------------
-- 1. Cross-tenant isolation
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare v_children integer; v_stories integer; v_pages integer;
begin
  select count(*) into v_children from public.children;
  if v_children <> 1 then
    raise exception 'ASSERT FAILED: parent A sees % children, expected only their own', v_children;
  end if;

  select count(*) into v_stories from public.stories;
  if v_stories <> 1 then
    raise exception 'ASSERT FAILED: parent A sees % stories, expected only their own', v_stories;
  end if;

  select count(*) into v_pages from public.story_pages;
  if v_pages <> 1 then
    raise exception 'ASSERT FAILED: parent A sees % story pages across all tenants', v_pages;
  end if;

  if exists (select 1 from public.children where name = 'Nils') then
    raise exception 'ASSERT FAILED: parent A can read another family''s child record';
  end if;
end $$;
rollback;

-- An admin must NOT be able to read individual children either: staff see
-- aggregates only. This is a deliberate privacy decision (§24).
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare v_children integer;
begin
  select count(*) into v_children from public.children;
  if v_children <> 0 then
    raise exception 'ASSERT FAILED: an admin can read % child records directly', v_children;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 2. Privilege escalation and credit minting are impossible
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

update public.profiles
   set role = 'admin', credit_balance = 9999, display_name = 'Renamed'
 where id = '11111111-1111-1111-1111-111111111111';

do $$
declare v_role public.user_role; v_balance integer; v_name text;
begin
  select role, credit_balance, display_name into v_role, v_balance, v_name
    from public.profiles where id = '11111111-1111-1111-1111-111111111111';

  if v_role <> 'user' then
    raise exception 'ASSERT FAILED: a parent escalated their own role to %', v_role;
  end if;
  if v_balance <> 3 then
    raise exception 'ASSERT FAILED: a parent minted credits (balance now %)', v_balance;
  end if;
  if v_name <> 'Renamed' then
    raise exception 'ASSERT FAILED: the guard trigger also blocked a legitimate display-name edit';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 3 & 4. Credit ledger: idempotency and the non-negative invariant
-- ---------------------------------------------------------------------
begin;
do $$
declare v_first integer; v_second integer; v_rows integer; v_balance integer;
begin
  -- Same idempotency key applied twice -> one ledger row, one deduction.
  v_first := public.record_credit_transaction(
    '11111111-1111-1111-1111-111111111111', -1, 'story_text',
    'story:test-idempotency', null, null, 'first attempt');
  v_second := public.record_credit_transaction(
    '11111111-1111-1111-1111-111111111111', -1, 'story_text',
    'story:test-idempotency', null, null, 'retry after a timeout');

  if v_first <> 2 then
    raise exception 'ASSERT FAILED: expected balance 2 after the first spend, got %', v_first;
  end if;
  if v_second <> v_first then
    raise exception 'ASSERT FAILED: a retried spend changed the balance (% -> %)', v_first, v_second;
  end if;

  select count(*) into v_rows from public.credit_transactions
   where idempotency_key = 'story:test-idempotency';
  if v_rows <> 1 then
    raise exception 'ASSERT FAILED: % ledger rows written for one idempotency key', v_rows;
  end if;

  select credit_balance into v_balance from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if v_balance <> 2 then
    raise exception 'ASSERT FAILED: denormalised balance drifted from the ledger (%)', v_balance;
  end if;
end $$;

do $$
declare v_ok boolean := false;
begin
  begin
    perform public.record_credit_transaction(
      '11111111-1111-1111-1111-111111111111', -999, 'story_illustration',
      'story:test-overdraft');
  exception when others then
    if sqlerrm like '%insufficient_credits%' then
      v_ok := true;
    else
      raise;
    end if;
  end;

  if not v_ok then
    raise exception 'ASSERT FAILED: a spend larger than the balance was allowed';
  end if;

  if exists (select 1 from public.credit_transactions where idempotency_key = 'story:test-overdraft') then
    raise exception 'ASSERT FAILED: a rejected overdraft still wrote a ledger row';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 5. Share links leak nothing about the child
-- ---------------------------------------------------------------------
begin;
insert into public.share_links (story_id, owner_id, token, version_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-1111-1111-111111111111',
        'sharetoken-0123456789abcdef0123456789abcdef', 'aaaaaaaa-0000-4000-8000-0000000000c1');

do $$
declare v jsonb; v_text text;
begin
  v := public.get_shared_story('sharetoken-0123456789abcdef0123456789abcdef');
  if v is null then
    raise exception 'ASSERT FAILED: a valid share token resolved to nothing';
  end if;

  if (v -> 'story' ->> 'child_display_name') <> 'Miray' then
    raise exception 'ASSERT FAILED: the shared story lost the child display name';
  end if;

  v_text := v::text;
  if v_text like '%CONFIDENTIAL%' then
    raise exception 'ASSERT FAILED: parent notes leaked through a share link';
  end if;
  if v_text like '%age_years%' or v_text like '%interests%' then
    raise exception 'ASSERT FAILED: child profile details leaked through a share link';
  end if;
  if v_text like '%aaaaaaaa-0000-4000-8000-000000000001%' then
    raise exception 'ASSERT FAILED: the child record id leaked through a share link';
  end if;

  if jsonb_array_length(v -> 'pages') <> 1 then
    raise exception 'ASSERT FAILED: shared story returned % pages, expected 1',
      jsonb_array_length(v -> 'pages');
  end if;
end $$;

-- Revoked, disabled and expired links all resolve to nothing.
do $$
declare v jsonb;
begin
  update public.share_links set is_enabled = false
   where token = 'sharetoken-0123456789abcdef0123456789abcdef';
  v := public.get_shared_story('sharetoken-0123456789abcdef0123456789abcdef');
  if v is not null then
    raise exception 'ASSERT FAILED: a disabled share link still resolved';
  end if;

  update public.share_links set is_enabled = true, expires_at = now() - interval '1 day'
   where token = 'sharetoken-0123456789abcdef0123456789abcdef';
  v := public.get_shared_story('sharetoken-0123456789abcdef0123456789abcdef');
  if v is not null then
    raise exception 'ASSERT FAILED: an expired share link still resolved';
  end if;

  update public.share_links set expires_at = null, revoked_at = now()
   where token = 'sharetoken-0123456789abcdef0123456789abcdef';
  v := public.get_shared_story('sharetoken-0123456789abcdef0123456789abcdef');
  if v is not null then
    raise exception 'ASSERT FAILED: a revoked share link still resolved';
  end if;

  if public.get_shared_story('short') is not null then
    raise exception 'ASSERT FAILED: a too-short token was accepted';
  end if;
end $$;
rollback;

-- A parent may not create a share link pointing at somebody else's story.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.share_links (story_id, owner_id, token)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-1111-1111-111111111111',
            'stolen-token-0123456789abcdef0123456789');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'ASSERT FAILED: parent B created a share link owned by parent A';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 6. Job queue: a job is claimed exactly once
-- ---------------------------------------------------------------------
begin;
insert into public.generation_jobs (type, owner_id, story_id, idempotency_key)
values ('story_text', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-4000-8000-00000000000a', 'job:test-claim-once');

do $$
declare v_first integer; v_second integer; v_attempts integer;
begin
  select count(*) into v_first from public.claim_generation_jobs(10, 'worker-1');
  select count(*) into v_second from public.claim_generation_jobs(10, 'worker-2');

  if v_first < 1 then
    raise exception 'ASSERT FAILED: the first worker claimed no jobs';
  end if;
  if v_second <> 0 then
    raise exception 'ASSERT FAILED: a second worker re-claimed % already-running jobs', v_second;
  end if;

  select attempts into v_attempts from public.generation_jobs
   where idempotency_key = 'job:test-claim-once';
  if v_attempts <> 1 then
    raise exception 'ASSERT FAILED: attempts counter is % after one claim', v_attempts;
  end if;
end $$;

-- A stalled job returns to the queue with backoff rather than vanishing.
do $$
declare v_reaped integer; v_status public.job_status;
begin
  update public.generation_jobs set locked_at = now() - interval '1 hour'
   where idempotency_key = 'job:test-claim-once';

  v_reaped := public.reap_stalled_jobs(interval '10 minutes');
  if v_reaped < 1 then
    raise exception 'ASSERT FAILED: the stalled-job reaper found nothing';
  end if;

  select status into v_status from public.generation_jobs
   where idempotency_key = 'job:test-claim-once';
  if v_status <> 'queued' then
    raise exception 'ASSERT FAILED: a stalled job ended up as % instead of queued', v_status;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 7. Rate limiting counts down and then refuses
-- ---------------------------------------------------------------------
begin;
do $$
declare v1 integer; v2 integer; v3 integer;
begin
  v1 := public.consume_rate_limit('test-bucket', 'subject-1', 2, 60);
  v2 := public.consume_rate_limit('test-bucket', 'subject-1', 2, 60);
  v3 := public.consume_rate_limit('test-bucket', 'subject-1', 2, 60);

  if v1 <> 1 or v2 <> 0 then
    raise exception 'ASSERT FAILED: rate limit counted down as %, % (expected 1, 0)', v1, v2;
  end if;
  if v3 >= 0 then
    raise exception 'ASSERT FAILED: the third request was not refused (remaining %)', v3;
  end if;

  if public.consume_rate_limit('test-bucket', 'subject-2', 2, 60) <> 1 then
    raise exception 'ASSERT FAILED: rate-limit buckets are not isolated per subject';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 8. Schema invariants
-- ---------------------------------------------------------------------
begin;
do $$
declare v_missing text;
begin
  -- Every table in `public` must have RLS enabled. A new table that
  -- forgets it is a data leak, so fail the build instead.
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'ASSERT FAILED: tables without row level security: %', v_missing;
  end if;
end $$;

do $$
declare v_blocked boolean := false;
begin
  -- A photo may never be stored without a recorded consent timestamp.
  begin
    insert into public.children (owner_id, name, photo_storage_path)
    values ('11111111-1111-1111-1111-111111111111', 'NoConsent', 'x/y/z.png');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'ASSERT FAILED: a child photo was stored without consent';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
begin;
delete from auth.users
 where email in ('parent-a@test.invalid', 'parent-b@test.invalid', 'admin@test.invalid');
commit;

\echo 'database assertions passed'
