# Current state

**Last verified:** 2026-08-23 · **Branch:** `claude/old-website-reference-0rjnyp`
**`main`:** still at the initial commit — nothing here has been merged.

Every claim below was checked by running something, not by remembering.
Where a thing cannot be verified without a credential or a live service, it
says so rather than assuming.

**Nothing is deployed.** No hosted URL, no Supabase project, no OpenAI key in
use. That remains the single blocker in front of everything commercial.

---

## What was actually run

| Check | Command | Result |
| --- | --- | --- |
| Web types | `npm run typecheck` | **exit 0** |
| Web lint | `npm run lint` | **exit 0** |
| Web tests | `npm test` | **171 passed**, 11 files |
| Web build | `npm run build` | **succeeds**, 48 routes |
| Database | 10 migrations on a scratch Postgres 16 | **apply clean**, and **again idempotently** |
| Database assertions | `npm run db:verify` | **"database assertions passed"** |
| Mobile types | `npm run typecheck` in `mobile/` | **exit 0** |
| Mobile tests | `npm test` in `mobile/` | **20 passed** |
| Mobile bundle | `npx expo export` | **bundles**, 1028 modules, 15 routes |
| Mobile lockfile | `npm ci --dry-run` in `mobile/` | **exit 0** |
| Expo config | `npx expo config --type public` | **resolves**, all 8 plugins |
| CI | GitHub Actions, 3 jobs | **green** |

The web suite was also run with `mobile/node_modules` deleted — the
condition CI actually runs under — and passes. The two packages have
separate test runners because their dependencies are separate; a test
that imported across the boundary passed locally and failed in CI, which
is the whole reason CI exists.

Schema after migration: **31 tables, all with RLS, 46 policies**.
Seeds: 4 languages, 16 themes, 15 objectives, 6 styles, 6 voices,
9 `app_settings` rows, 7 products.

---

## 1. Production-ready

Complete, tested, and needing nothing further from anyone. Still unproven
against live services — see §2 — but nothing about them is waiting on a
decision or a key.

**Database and security.** Ten migrations apply from empty and re-run
cleanly. Every public table carries RLS. The SQL assertion suite proves,
against a live database: cross-tenant isolation; that **admins read zero
children**; that a non-admin cannot escalate `role`, `credit_balance` or
`email`; that `record_credit_transaction` is idempotent under a replayed
key; that overdrafts are refused; that `get_shared_story` redacts without an
anonymous visitor touching `stories`, `children` or `profiles`; that a job is
claimed exactly once under concurrency; and that rate limiting counts.

**One implementation per rule.** `src/features/stories/operations.ts` and
`src/features/account/operations.ts` hold the only implementation of every
mutation. Server actions (web) and `/api/v1` routes (mobile) are both thin
wrappers. The mobile app reproduces **no** authorization and **no** charging
logic — verified by reading `mobile/src/api.ts`, which only issues HTTP.

**The job queue is scheduler-agnostic.** Nothing in the worker knows what
woke it. Vercel Cron, Supabase `pg_cron` via `pg_net`, a GitHub Action, a
container crontab and an uptime pinger all satisfy the same contract, and
`docs/OPERATIONS.md` carries working configuration for each. Three
properties make that real rather than aspirational: claiming is atomic, so
any number of simultaneous triggers is harmless; a run that ends with work
still due wakes its own successor, bounded at twenty links, so cadence
decides when a book *starts* and never whether it finishes; and retries and
reaping are keyed to absolute timestamps, so a missed tick costs latency and
no work. The Vercel-shaped limits are request parameters clamped to the
host's own timeout, not constants in the code path.

**Full-cost pre-check on story creation.** Illustrations are charged per
image and a story fans out to one per page plus a cover, so checking only
the text cost let a parent start a book that died partway through. Creation
now estimates the whole book. Four tests cover it.

**Push notifications, everything except the last hop.** Device registration
keyed so a shared tablet cannot keep notifying the previous family; a unique
`dedupe_key` so twelve finishing illustration jobs produce one notification,
not twelve; preferences and quiet hours, including the window that wraps
past midnight. Delivery is behind a provider interface, and without
credentials the console provider composes, dedupes, checks preferences and
logs — recording the delivery as `skipped` with `reason: provider_not_live`.
Nothing reaches a phone and nothing pretends to.

**The native app in four languages.** Azerbaijani, English, Russian and
Turkish, resolved from the in-app choice, then the profile, then the phone.
Interface language and story language stay separate. The negotiation rules
and dictionaries live in `mobile/src/i18n/locales.ts`, which imports nothing
from React or Expo, and 20 tests cover them: key parity, placeholder
survival, no locale being English pasted across, and the two-pass tag search
that makes a phone listing `ru-KZ, az-AZ` get Azerbaijani exactly rather
than Russian by approximation.

**Full child profiles on the phone**, matching the website field for field —
gender, favourite activities, personality traits and learning interests were
accepted by the API and silently missing from the form.

**Photo upload is off.** `child_photo_upload_enabled` defaults to `false`,
no upload UI exists on either surface, `photo_storage_path` is stripped by
the serialiser and redacted by the logger, and the privacy page and the
mobile child form both say plainly that no photograph is held.

**Offline books that survive a real phone.** The index is verified against
the filesystem rather than believed, a partial download says so and resumes
instead of being recorded as complete, and sign-out deletes the lot.

**Lock-screen playback.** Title and cover artwork on the lock screen — which
on Android is also what stops the OS killing background audio after three
minutes.

**Secrets discipline.** `src/config/env.ts` splits a client schema from a
lazy `serverEnv()` that throws if reached from a browser. The OpenAI SDK is
imported in five server-only modules. No secret is in the repository.
`npm run check:env` validates a real environment, and with `--probe` calls
each service once, without printing a value.

**CI.** Three jobs: web (types, lint, 171 tests, build), database (ten
migrations, an idempotent replay, and the RLS/credit/job-queue assertions
against a stock `postgres:16` container), and mobile (types, 20 tests, the
Metro bundle). None of it needs a credential.

---

## 2. Built, but never run against a live service

The code exists and is unit-tested against fakes. It has **never** executed
against real OpenAI, real Supabase, or real storage. Treat every item here
as unproven in production.

| Area | What is unproven |
| --- | --- |
| Story text | The Responses API call with a strict `json_schema`, the fallback model, output moderation, page splitting |
| Illustrations | `gpt-image-1` calls, the character-sheet consistency approach, content-hash reuse, storage upload |
| Narration | `gpt-4o-mini-tts` output, and whether estimated per-page timings track real audio closely enough to follow pages |
| PDF export | Renders in tests, never over *real* illustrations at print resolution |
| Job worker | Claim, retry and dead-letter under real concurrency and real provider latency |
| Auth flows | Sign-up, magic link, password reset, OAuth callback against a real Supabase project |
| Storage | Bucket policies, signed-URL lifetimes, the delete-account sweep |
| Mobile end to end | Sign-in → create → read → narrate → offline, on a real device |
| Cost accounting | Recorded micro-USD has never been compared against a real OpenAI invoice |
| Push delivery | Everything up to the provider call is exercised; APNs and FCM are not |

---

## 3. Blocked on credentials

Each row: the service, the value, where to get it, where it goes, and how to
confirm it without printing the secret.

### 3.1 Needed to deploy at all

| # | Service | Value | Where to obtain it | Where it goes | Verify |
| --- | --- | --- | --- | --- | --- |
| 1 | Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project → Settings → API | `.env.local`, Vercel | `npm run check:env -- --probe` |
| 2 | Supabase | `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` | Server-side only, never `NEXT_PUBLIC_` | Probe reports the schema is present and seeded |
| 3 | Supabase | `DATABASE_URL` | Project → Connect | Local shell only | `npm run db:types` regenerates with no diff |
| 4 | OpenAI | `OPENAI_API_KEY` | platform.openai.com → API keys | Server-side only | Probe reports "key accepted" |
| 5 | Worker | `CRON_SECRET` | `openssl rand -hex 32` | Server env + scheduler | `/api/jobs/worker` returns 401 without, 200 with |
| 6 | Vercel | Account + project link | vercel.com | `vercel link` | A deployment URL serves `/` |

**Also required, and not a credential:** *some* scheduler must call
`/api/jobs/worker`. Any of the four in `docs/OPERATIONS.md` will do. With
none, generation silently never starts.

### 3.2 Needed for the native app

| # | Service | Value | Where | Goes in |
| --- | --- | --- | --- | --- |
| 7 | Expo | EAS project id | `eas init` in `mobile/` | `mobile/app.json` → `extra.eas.projectId` |
| 8 | Apple | Developer Program, $99/yr | developer.apple.com | EAS credentials |
| 9 | Google Play | Developer account, $25 once | play.google.com/console | Play Console |
| 10 | Apple | APNs key | developer.apple.com → Keys | `eas credentials` → iOS → Push Key |
| 11 | Firebase | Service account JSON | Firebase → Service accounts | `eas credentials` → Android → FCM V1 |
| 12 | Server | `EXPO_PUSH_ENABLED=true` | — | Web app environment |
| 13 | Google Cloud | Three OAuth client ids + one secret | Console → Credentials | `mobile/.env.example` names each one; the secret goes to Supabase only |
| 14 | Apple | Services ID, key, team id | developer.apple.com | Supabase → Auth → Providers → Apple |
| 15 | App Store Connect | App id | After creating the app record | `mobile/eas.json` → `submit.production.ios.ascAppId` |

`docs/MOBILE.md` has the full walkthrough for 7–15.

Note on this environment: `eas init` and `expo-doctor` cannot run here — the
agent proxy blocks Expo's endpoints. Run them from your own machine.

### 3.3 Needed later

| # | Service | Value | For |
| --- | --- | --- | --- |
| 16 | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments, and **only after pricing is decided** |
| 17 | Resend | `RESEND_API_KEY` | Transactional email; a logged no-op without it |

---

## 4. Placeholder or unverified

| Thing | Current value | Why it matters |
| --- | --- | --- |
| `mobile/app.json` → `extra.eas.projectId` | `00000000-…` | Recognised as absent: no push token is requested, no permission prompt appears |
| `mobile/eas.json` → API URLs | `nagilai.com`, `staging.nagilai.com` | Neither host exists |
| `mobile/eas.json` → `ascAppId` | `REPLACE_WITH_…` | Needed only at submission |
| `app_settings.ai_pricing` | Estimated rate card, self-labelled "VERIFY" | Every cost figure derives from it |
| Stripe webhook | Verifies and records; **grants no entitlements** | Correct for now — deliberately not wired ahead of a pricing decision |
| Print provider | `manual`; orders land in an admin queue | No printer chosen; no real costs or SLAs are claimed |
| `products` seed | 7 rows, placeholder prices | Yours to set |
| Legal pages | `/privacy` and `/terms` are drafts | Not reviewed by anyone qualified |

---

## 5. Blocked on your decision

Catalogued in `docs/DECISIONS.md` Part 1, and **not** being guessed at.

1. **Customer pricing** — plan prices, credit bundles, free-tier size.
2. **The credit defaults do not work as a free tier.** A new parent gets 3
   credits; an illustrated ten-page story costs 12 (one for text, eleven for
   images). They are now told cleanly up front instead of receiving a broken
   book, but they still cannot make one. Needs: the signup grant, the
   per-image cost, and whether the free story includes illustrations at all.
   Best answered after §2 gives measured costs.
3. **Children's privacy regime** — Azerbaijan-only vs GDPR/UK-AADC vs
   US-COPPA. Changes consent flows, retention, and the legal pages.
4. **Photograph upload** — stays off until you say otherwise.
5. **Printing partner** — nothing about print cost or delivery is real until
   one is chosen.
6. **Verified AI rate card** — the current numbers are estimates.
7. **Illustration cost and default image count** — the largest lever on unit
   economics. At the seeded rate, a medium story is roughly $0.46 of images.
8. **Data residency** — which Supabase region, chosen before real users.
9. **Store submission** — nothing will be submitted without your approval.

---

## 6. Still to build

Not blocked, not started.

**Before a trustworthy beta**

- **Story-quality evaluation.** The most valuable missing test for a
  children's product: are stories age-appropriate, actually in the requested
  language, free of the banned phrasings, and good? Needs live generation to
  write.
- **Measured unit economics.** Cost reporting is wired end to end; every
  number in it comes from an estimated rate card.
- **A real support address** on `/contact`.

**Native completeness, remaining**

- Remix, rename and delete in the app — the endpoints exist.
- PDF export to the share sheet — the endpoint exists.
- Per-page illustration retry — the endpoint exists.
- A quiet-hours picker — the API accepts the values, the app only displays
  them.

**Operational**

- Decide the Vercel plan, or change the worker cron to a schedule it allows.
  (`vercel.json` asks for per-minute; the Hobby tier restricts frequency.
  The self-continuation makes a slower tick correct, only less immediate.)

---

## 7. What I have not done

- Not started over, scaffolded a second architecture, or replaced a working
  component.
- Not changed pricing, credit values, image counts, or image quality.
- Not enabled photo upload, public discovery, or additional retention.
- Not invented a printing partner, a printer cost, or an SLA.
- Not put a fake credential anywhere in the repository — every feature that
  needs one hides itself instead.
- Not claimed a deployment exists. None does.
