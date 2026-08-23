# Operations

How the generation queue is driven, and by what.

---

## The scheduler is a doorbell

Story generation runs on a Postgres-backed job queue. Something has to
wake the worker, but **nothing in the product knows or cares what that
something is.** The scheduler's only job is to call one endpoint. It has
no other role, holds no state, and is not part of any business rule.

That is a deliberate design property, not an accident, and three things
enforce it:

**Claiming is atomic.** `claim_generation_jobs` uses `FOR UPDATE SKIP
LOCKED`. Two schedulers firing at the same instant — or fifty — never hand
the same job to two runners. You can point a cron *and* an uptime pinger
*and* a GitHub Action at this endpoint simultaneously and the only cost is
some wasted HTTP requests.

**The worker chains itself.** When a run ends with jobs still *due*, it
wakes its own successor before returning, so a queue drains at its own pace
rather than at the scheduler's. One honest limit: a job that failed and is
backing off is queued but not yet due, so it does not extend the chain. It
waits for the next tick. Cadence therefore does not decide whether a book
finishes on the happy path — but it does decide how long a *retry* sits.

**Nothing is lost if a tick is missed.** Stalled jobs are reaped by
wall-clock age. Retries are scheduled by a `run_after` timestamp. Both are
absolute times, not tick counts, so a scheduler that goes down for six
hours costs six hours of latency and no work.

The practical consequence: **any of the options below is correct**, and the
choice is about how quickly a failure recovers, not whether it does.

---

## The contract

```
POST /api/jobs/worker
GET  /api/jobs/worker
```

Authenticated with `CRON_SECRET`, accepted three ways so that every
plausible trigger can satisfy it:

| How | Header / parameter | Notes |
| --- | --- | --- |
| Bearer token | `Authorization: Bearer <CRON_SECRET>` | The default. What Vercel Cron sends. |
| Custom header | `X-Cron-Secret: <CRON_SECRET>` | For schedulers that reserve `Authorization` for their own use. |
| Query string | `?token=<CRON_SECRET>` | **Off by default.** Set `CRON_ALLOW_QUERY_SECRET=true` to enable. A secret in a URL is a secret in an access log — use it only for a trigger that genuinely cannot set a header. |

Comparison is constant-time in every branch. With no `CRON_SECRET` set at
all the endpoint returns `503` and runs nothing: this endpoint spends
money, so refusing is safer than running unauthenticated.

Optional tuning, in the JSON body (`POST`) or the query string (`GET`):

| Field | Default | Meaning |
| --- | --- | --- |
| `maxJobs` | 12 | Jobs this invocation will claim before handing back |
| `timeBudgetMs` | 45000 | Wall-clock budget, capped by the host's function timeout |
| `batchSize` | 3 | Jobs run concurrently within one claim |
| `source` | `scheduled` | Recorded on claimed rows, so you can see what woke the worker |

The response reports what happened, which is worth logging:

```json
{
  "claimed": 12, "succeeded": 12, "failed": 0, "reaped": 0,
  "durationMs": 18422, "dueRemaining": 4, "queuedRemaining": 4,
  "stoppedBecause": "job-limit", "continuation": 0, "continued": true
}
```

`stoppedBecause` is the field to look at when a queue lags: `drained` means
there was nothing left, `job-limit` and `time-limit` mean the invocation
handed back deliberately.

---

## Option 1 — Vercel Cron

Configured in `vercel.json`, and deliberately set to **once a day**:

```json
{ "crons": [{ "path": "/api/jobs/worker", "schedule": "0 3 * * *" }] }
```

Daily because that is what Vercel's **Hobby** plan allows, and a
per-minute schedule in this file makes the deployment fail rather than
quietly downgrade. Vercel sends `Authorization: Bearer $CRON_SECRET`
automatically once `CRON_SECRET` is set as an environment variable.

**On Pro, change it to `* * * * *`.** Here is what the difference actually
costs, because "the worker self-continues so cadence does not matter" is
true of the *happy path* and not of the retry path:

| Situation | Daily cron | Per-minute cron |
| --- | --- | --- |
| Parent presses Create | Starts immediately — the app nudges the worker inline, and the run chains until the queue is drained | Same |
| An illustration fails and backs off 2 minutes | The chain stops, because only *due* work continues it. The retry waits for the next daily tick. | Retries about 2 minutes later |
| The queue stalled overnight with nobody using the app | Cleared at 03:00 | Cleared within a minute |

So on Hobby a parent whose picture failed sees a gap in the book until
either the daily tick or their own tap on the per-image retry button,
which enqueues immediately. That is survivable, not good. Twenty dollars a
month fixes it, and it is the first thing worth paying for.

---

## Option 2 — Supabase `pg_cron`

Schedules the trigger inside the same database that holds the queue, which
means one fewer service to depend on. Run once in the SQL editor:

```sql
-- Enable the two extensions (Supabase ships both).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the secret somewhere the job can read but PostgREST cannot.
-- Supabase Vault is the right home for this.
select vault.create_secret('<your CRON_SECRET>', 'nagilai_cron_secret');

select cron.schedule(
  'nagilai-drain-queue',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<your-domain>/api/jobs/worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nagilai_cron_secret'
      )
    ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 5000
  );
  $$
);
```

`net.http_post` is asynchronous: `pg_cron` fires and forgets, so a slow
worker never holds a database connection open. To stop it later:

```sql
select cron.unschedule('nagilai-drain-queue');
```

---

## Option 3 — GitHub Actions

Useful when the site is hosted somewhere without a scheduler of its own.
GitHub's minimum interval is five minutes and it is best-effort about
timing, which the self-continuation makes irrelevant.

```yaml
name: Drain generation queue
on:
  schedule: [{ cron: '*/5 * * * *' }]
  workflow_dispatch:
jobs:
  drain:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "$SITE/api/jobs/worker" \
            -H "Authorization: Bearer $CRON_SECRET" \
            -H 'Content-Type: application/json' \
            -d '{"source":"github-actions"}'
        env:
          SITE: ${{ vars.SITE_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

---

## Option 4 — anything else

A container's crontab, a systemd timer, a Cloudflare Worker on a cron
trigger, a Kubernetes `CronJob`, a Raspberry Pi in a cupboard:

```bash
curl -fsS -X POST https://your-domain/api/jobs/worker \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"source":"crontab"}'
```

An uptime monitor that can only issue a plain GET works too, once
`CRON_ALLOW_QUERY_SECRET=true` is set:

```
https://your-domain/api/jobs/worker?token=<CRON_SECRET>&source=uptime
```

---

## What the app does on its own

Independently of any scheduler, the app nudges the worker inline whenever
work is enqueued — a parent pressing "Create" should see their first page
in seconds, not at the next tick. That nudge is fire-and-forget and needs
`CRON_SECRET` to be set.

**A nudge is not a substitute for a scheduler.** It fires only when
something is enqueued, so it cannot recover a queue that stalled while
nobody was using the app, and it cannot retry a job whose backoff expires
an hour later. Run one of the options above.

If neither exists, generation silently never starts. `npm run check:env`
reports a missing `CRON_SECRET` as a failure for exactly this reason.

---

## Sizing the run

Defaults live in `WORKER_DEFAULTS` (`src/config/constants.ts`) and are
sized for Vercel's 60-second function limit. A host that allows longer
invocations can raise them per call:

```bash
curl -X POST https://your-domain/api/jobs/worker \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"maxJobs":60,"timeBudgetMs":240000,"batchSize":6}'
```

`timeBudgetMs` is clamped to ten seconds below the route's `maxDuration`,
so a request cannot ask for a budget the platform will kill it during.
Raising it beyond a minute means raising `maxDuration` in
`src/app/api/jobs/worker/route.ts` as well, and only on a host that
actually permits it.

`batchSize` is the concurrency knob that costs money: three illustration
jobs at once means three simultaneous image generations. Raise it to make
a book finish faster, and watch the OpenAI rate limits.

---

## Monitoring

- **`/admin/jobs`** — failed and dead-lettered work, with a requeue button.
- **`stoppedBecause`** in the worker response, if your scheduler logs it.
- **A queue that only ever reports `time-limit`** is a queue that needs a
  bigger budget or a faster host, not a more frequent cron.
- **`dueRemaining` that never falls** means jobs are failing and retrying.
  Check `/admin/jobs` rather than the scheduler.

---

## Push notifications

The worker is also what tells a parent their book is ready. That path is
described in `docs/MOBILE.md`; operationally the thing to know is that it
sends at most one notification per story no matter how many jobs finish,
enforced by a unique `dedupe_key` in `notification_deliveries` rather than
by timing.

Without push credentials the console provider runs instead: every
notification is logged and recorded as `skipped` with
`reason: provider_not_live`. Nothing reaches a phone, and nothing pretends
to have.
