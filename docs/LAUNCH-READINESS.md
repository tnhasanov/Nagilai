# Launch readiness

**Nothing is deployed.** There is no hosted URL, no Supabase project, and no
OpenAI key in use. This document is the shortest honest path from that state
to a working deployment, and it separates what only you can do from what I
can finish once you have.

Current state of every component: [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

---

## The short version

| # | Step | Who | Blocks |
| --- | --- | --- | --- |
| 1 | Create a Supabase project | you | everything |
| 2 | Apply the migrations | either | everything |
| 3 | Create an OpenAI key with a spend cap | you | all generation |
| 4 | Create the Vercel project and set env vars | you | the live site |
| 5 | First deploy | either | live AI testing |
| 6 | Live smoke test | me | beta |
| 7 | Measure real unit costs | me | your pricing decision |
| 8 | EAS project + store accounts | you | store builds |
| 9 | Native completeness (push, Apple/Google sign-in, az/ru/tr) | me | submission |
| 10 | Submit | you approve, I prepare | — |

Steps 1, 3, 4 and 8 need an account or a card and are yours. Everything
between them is mine.

---

## What you must provide

Each row says where to get the value, where it goes, and how to confirm it
works **without ever printing the secret**.

`npm run check:env` validates the shape of everything below and never prints a
value. `npm run check:env -- --probe` additionally calls each service once and
reports only whether it answered.

### 1. Supabase

| Value | Where to get it | Where it goes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project → Settings → API | `.env.local` and Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, **anon** | `.env.local` and Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, **service_role** | server-side only |
| `DATABASE_URL` | Project → Connect | your shell only, never hosting |

Choose the region **before** creating the project — moving later means
migrating real family data. See `docs/DECISIONS.md` §1.10.

The service role key bypasses row level security completely. It must never
carry a `NEXT_PUBLIC_` prefix, never be pasted into the mobile app, and never
appear in a log.

**Verify:** `npm run check:env -- --probe` reports *"Supabase service role
reads app_settings: schema present and seeded"* and *"Anonymous reads are
blocked by RLS"*.

### 2. Apply the schema

```bash
DATABASE_URL='postgres://...' npm run db:verify   # against a scratch database first
```

Then against the real project, either by pasting `supabase/migrations/*.sql`
in order into the SQL editor, or with `supabase db push`. Full walkthrough in
[SETUP.md](SETUP.md).

`db:verify` applies all nine migrations, applies them **again** to prove they
are idempotent, and then runs the SQL assertions that prove tenant isolation,
credit idempotency, overdraft refusal, share-link redaction and single-claim
job locking. It has been run and passes; run it against your own database so
you have seen it too.

**Verify:** 29 tables, all with RLS. `select count(*) from public.app_settings`
returns 9.

### 3. OpenAI

| Value | Where |
| --- | --- |
| `OPENAI_API_KEY` | platform.openai.com → API keys |

**Set a hard monthly spend limit before you use it.** Illustrations dominate
cost — see the warning below — and a runaway job queue against an uncapped key
is the one mistake here that costs real money.

**Verify:** `npm run check:env -- --probe` reports *"OpenAI: key accepted"*.

### 4. Worker secret

```bash
openssl rand -hex 32
```

Goes in `CRON_SECRET`, server-side, and in the Vercel Cron configuration. The
worker endpoint spends money, so it **refuses to run** when this is unset
rather than running unauthenticated.

**Verify:** `curl -i https://<your-domain>/api/jobs/worker` returns 401
without the header, 200 with it.

### 5. Vercel

- Create the project and link this repository.
- Put the Functions region **nearest your Supabase region** — every request
  makes several database round trips.
- Set the environment variables above in *Project → Settings → Environment
  Variables*.
- `vercel.json` registers a `* * * * *` cron for the queue worker. **Confirm
  your plan allows per-minute crons** — the Hobby tier restricts cron
  frequency. If it does not, either upgrade or change the schedule and accept
  slower generation.

**Verify:** the deployment URL serves `/`, and `/manifest.webmanifest`
returns JSON.

### 6. Later — stores

| Value | Where | Cost |
| --- | --- | --- |
| EAS project id | `eas init` inside `mobile/` | free |
| Apple Developer Program | developer.apple.com | $99/year |
| Google Play Console | play.google.com/console | $25 once |

`mobile/app.json` currently carries a placeholder project id
(`00000000-0000-0000-0000-000000000000`); `eas init` replaces it. Note that
`eas init` and `expo-doctor` cannot run from this environment — the proxy
blocks the Expo endpoints — so these are run from your machine.

---

## What I do once you have

**Immediately after step 5:**

1. A live smoke test end to end: sign up, create a child, generate a story,
   watch the queue drain, read it, narrate it, export the PDF, share it,
   revoke the share, delete the account and confirm the storage sweep.
2. Verify the generated database types match the deployed schema
   (`npm run db:types` should produce no diff).
3. Confirm the storage buckets, their policies and the signed-URL lifetimes.
4. Confirm the worker cron actually fires and drains.

**Then, and this is the one that matters commercially:**

5. Generate a representative set of stories and compare the micro-USD the
   application recorded against the real OpenAI invoice. The seeded rate card
   in `app_settings.ai_pricing` is an estimate and is labelled as one. Until
   that comparison exists, every margin number is a guess.

I will bring you **measurements**, not a pricing proposal. Pricing is yours.

---

## Before real families, not just before deploy

- **Story quality evaluation.** Nothing currently checks that a story is
  age-appropriate, actually in the requested language, and good. For a
  children's product this is the most valuable missing test, and it needs
  live generation to write.
- **The credit defaults do not add up.** See below.
- **Legal pages.** `/privacy` and `/terms` are drafts written from the
  architecture. They need review by someone qualified in whichever regime you
  choose (`docs/DECISIONS.md` §1.5).
- **A real support address** on `/contact`.

---

## Two things to look at before spending anything

### Illustrations dominate cost

A story generates **one image per page plus a cover**. At the seeded (and
unverified) rate card, `gpt-image-1` at `medium` quality is $0.042 per image:

| Length | Pages | Images | Images cost |
| --- | --- | --- | --- |
| Short | 6 | 7 | ~$0.29 |
| Medium | 10 | 11 | ~$0.46 |
| Long | 16 | 17 | ~$0.71 |

Text and narration are on top. Three levers exist — image count, image
quality, and story length — and all three are configuration in
`app_settings`, changeable from the admin panel without a deploy. **I have
not changed any of them**, because they are unit-economics decisions.

### The seeded credit defaults are inconsistent

`story_illustration` is charged **per image**, so a medium story costs
`1 + 11 = 12` credits, while `signup_grant` is `3`.

I have fixed the half-broken-book symptom: story creation now pre-checks the
**whole** estimated cost, so a parent is told up front rather than receiving a
story whose images fail one by one. That is a correctness fix and changes no
price.

The values themselves are yours:

- How many free credits does a new parent get?
- What does an illustrated story cost in credits?
- Does the free tier include illustrations at all, or is the first free story
  text-only?

Answer those and the free tier stops being an accident of two settings that
were never compared.
