# Database

PostgreSQL via Supabase. 29 tables, 18 enums, row level security on every
one. Migrations live in `supabase/migrations/` and are applied in order.

```
0001  extensions and enumerated types
0002  identity, children, admin-editable configuration
0003  stories, versions, pages, illustrations, narration, PDFs, share links
0004  background jobs, AI usage, credits, moderation, analytics, rate limits
0005  commerce — products, prices, subscriptions, orders, payments, print jobs
0006  functions: authorisation, credits, job queue, share resolution, metrics
0007  row level security policies
0008  storage buckets and object policies
0009  reference data and business configuration (idempotent, re-runnable)
```

`supabase/tests/0001_security_and_credits.test.sql` asserts the invariants
that matter. `./scripts/verify-migrations.sh` applies everything to a scratch
database, applies it a second time to prove idempotency, then runs the
assertions.

## The story domain

```
profiles ──┬── children
           │
           └── stories ──┬── story_versions ──┬── story_pages ── story_illustrations
                         │                    ├── narrations
                         │                    └── story_pdfs
                         ├── share_links
                         └── generation_jobs
```

**Story** is the recipe: which child, which language, which theme, which
length, the parent's instructions, and a redacted snapshot of the child.

**StoryVersion** is a generated realisation of that recipe. Regenerating
creates a new version and moves `stories.current_version_id`, so earlier
versions stay readable.

**Remix** (§12) never mutates the original. It creates a *new story* with
`remixed_from_story_id` set, which is what "preserve the original story"
means structurally rather than by convention.

### Why a child snapshot

`stories.child_snapshot` is a frozen, redacted copy of the child's details
at generation time. It exists for three reasons:

1. Regeneration stays reproducible after the parent edits the profile.
2. A share page can render "a story for Miray" without ever joining to
   `children` — so there is no query for a bug to widen.
3. Deleting a child profile does not orphan the books already made.

It deliberately excludes the child's record id, birth date and photo path.
`tests/story-privacy.test.ts` asserts those absences.

## Money and credits

All money is **integer minor units** plus an ISO-4217 code. All AI cost is
**integer micro-USD**. No floats anywhere in a financial column.

`credit_transactions` is an append-only ledger and the source of truth.
`profiles.credit_balance` is a denormalised copy maintained inside
`record_credit_transaction()` for cheap reads.

That function is the only way a balance changes. It:

- locks the profile row, so concurrent spends cannot interleave;
- refuses to go negative (`insufficient_credits`);
- is idempotent on `idempotency_key` — replaying returns the original
  balance and writes no second row.

The keys are **derived from the work**, never random:

```
story:{storyId}:v{versionId}:text
illustration:{illustrationRowId}
narration:{narrationRowId}
refund:{jobId}:text
```

That is what makes a retried job safe (§34: duplicate charging prevention).

## Row level security

Enabled on all 29 tables. The posture:

| Table group | Policy |
| --- | --- |
| `children` | Owner only. **No admin read policy at all.** |
| `stories` + descendants | Owner reads; the service layer writes generated content |
| `share_links` | Owner manages; readers use a function, never the table |
| Config tables | Everyone reads active rows; admin writes |
| `credit_transactions`, `usage_events`, `generation_jobs` | Owner reads; service writes |
| `moderation_events`, `analytics_events`, `admin_audit_log` | Staff read; service writes |
| `rate_limits` | No policy — service role only |
| Commerce | Owner reads own; admin manages catalogue |

A table with **no policy** is reachable only by the service role, which is
the deliberate way of saying "server-side only".

### Two guards worth naming

**Privilege escalation.** RLS is per row, not per column, so a policy alone
cannot stop a parent updating their own `role` to `admin`. A
`BEFORE UPDATE` trigger restores `id`, `role`, `credit_balance`, `email` and
`deleted_at` for any non-admin caller. A parent can still rename themselves;
they cannot promote themselves or mint credits. Asserted in the SQL tests.

**Admins cannot read children.** Staff see aggregates through
`admin_dashboard_metrics()` and nothing else. The SQL tests assert that an
admin session reads *zero* rows from `children`.

## Sharing without exposure

An anonymous visitor never queries `stories`, `children` or `profiles`. They
call `get_shared_story(token)`, a `SECURITY DEFINER` function that:

- verifies the link is enabled, unrevoked and unexpired;
- verifies the story is `ready` and not deleted;
- returns a hand-built document containing page text, illustration paths and
  at most the child's **display name**.

The SQL tests assert that parent notes, ages, interests and the child's
record id do not appear in the returned JSON.

Tokens are 32 random bytes base64url — 256 bits of entropy. A check
constraint rejects anything shorter than 32 characters.

## The job queue

```sql
select ... from generation_jobs
 where status = 'queued' and run_after <= now()
 order by priority, created_at
 limit n
 for update skip locked
```

`SKIP LOCKED` is what makes concurrent workers safe: each claim transaction
takes a disjoint set of rows. The SQL tests assert that a second worker
claims zero already-running jobs.

`reap_stalled_jobs()` returns work whose invocation died, with exponential
backoff, and dead-letters anything past its attempt budget rather than
losing it.

## Storage

Five buckets, four private:

```
child-photos/{owner}/{child}/{uuid}.ext      private  (feature-flagged off)
illustrations/{owner}/{story}/{version}/…    private
narrations/{owner}/{story}/{version}/…       private
story-pdfs/{owner}/{story}/{version}/…       private
public-assets/…                              public   (marketing imagery)
```

The first path segment is always the owner's user id, and the storage
policies match on it. A path built incorrectly therefore fails closed rather
than exposing another family's asset. Reads are short-lived signed URLs
minted server-side.

## Generated types

`src/types/database.ts` is generated by introspecting a live database:

```bash
DATABASE_URL=postgres://… node scripts/generate-db-types.mjs
```

Generated rather than hand-written so the types cannot drift from the
migrations. Regenerate after every schema change; the file is committed.

## Indexes

Every foreign key used in a filter is indexed, plus:

- partial indexes on the hot paths (`stories` by owner where not deleted,
  `generation_jobs` where queued);
- partial **unique** indexes that express business rules — one active
  illustration per (version, page, style), one narration per (version,
  voice, speed, text hash);
- unique indexes on every provider id and webhook event id, which is what
  makes webhook redelivery safe.
