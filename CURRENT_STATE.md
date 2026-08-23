# Current state

**Audit date:** 2026-08-23 · **Branch:** `claude/old-website-reference-0rjnyp` · **HEAD:** `6b33fad`
**Working tree:** clean · **`main`:** still at the initial commit — nothing here has been merged.

This file is an *audit*, not a status report written from memory. Every claim
below was re-verified against the repository in this session by running the
build, the tests, the migrations and the bundler. Where something could not be
verified without a credential or a live service, it says so rather than
assuming success.

Nothing was deleted or rewritten to produce this document.

### Resolved since the audit ran (commit `f412845`)

The audit itself is unchanged below; these items were fixed immediately
afterwards and are marked **fixed** where they appear.

- Story creation now pre-checks the **whole** book's credit cost, so a
  parent can no longer start a story that dies partway through. The credit
  *values* remain yours to set.
- The TWA and the native app no longer share a package name.
- CI added and **green on its first run**: types, lint, tests, build,
  migrations + SQL assertions, and the Metro bundle — none of it needing a
  credential.
- `npm run check:env` added: validates a real environment, and with
  `--probe` confirms each service answers, without printing a value.
- `docs/LAUNCH-READINESS.md` added.
- Three broken or stale npm scripts fixed (`db:migrate` pointed at a
  non-existent file, `lint` used the removed `next lint`, the type
  generator had no entry).
- `docs/MOBILE.md` reordered to native-first; `docs/ROUTES.md` now covers
  `/api/v1`; `.env.example` documents `DATABASE_URL`.

---

## 0. What was actually run

| Check | Command | Result |
| --- | --- | --- |
| Web types | `npx tsc --noEmit` | **exit 0** |
| Web lint | `npx eslint .` | **exit 0** |
| Web tests | `npx vitest run` | **151 passed**, 10 files |
| Web build | `npx next build` | **succeeds**, 47 app routes |
| Database | 9 migrations on a scratch Postgres 16 | **apply clean**, and **again idempotently** |
| Database assertions | `supabase/tests/0001_security_and_credits.test.sql` | **"database assertions passed"** |
| Mobile types | `npx tsc --noEmit` (in `mobile/`) | **exit 0** |
| Mobile bundle | `npx expo export --platform web` | **bundles**, 915 modules, 15 routes |

Schema introspected after migration: **29 tables, 29 with RLS enabled, 43
policies, 18 enums, 101 indexes**. Seeds: 4 languages, 16 themes, 15 learning
objectives, 6 illustration styles, 6 voices, 9 `app_settings` rows, 7 products.

Size: 151 TypeScript files / 19,536 lines (web), 18 files / 3,008 lines
(mobile), 11 SQL files / 3,105 lines, 10 test files plus a shared helper /
1,671 lines.

---

## 1. Verified working

Proven in this session by execution, not by inspection.

**Database and security.** All nine migrations apply from empty and are
re-runnable. Every public table carries RLS. The SQL assertion suite proves,
against a live database: cross-tenant isolation on stories and children;
that **admins read zero children** (deliberate — staff support does not need a
child's name or appearance); that a non-admin cannot escalate `role`,
`credit_balance` or `email` by updating their own profile row; that
`record_credit_transaction` returns the original balance on an idempotency-key
replay instead of double-crediting; that an overdraft is refused with
`insufficient_credits`; that `get_shared_story` returns a redacted payload
without an anonymous visitor ever touching `stories`, `children` or
`profiles`; that a job can be claimed exactly once under concurrency; and that
rate limiting counts correctly.

**Web application.** Typechecks under `strict` plus `noUncheckedIndexedAccess`,
lints clean, and builds. 47 routes: 8 public/marketing, 4 auth, 7 signed-in,
4 admin, 4 pre-existing API routes, 13 `/api/v1`, plus manifest, sitemap,
robots, the offline page, Digital Asset Links and the two framework error
routes.

**Unit-tested logic.** 151 tests over cost arithmetic and credit rules, the
`/api/v1` handler layer, error classification, the four locale dictionaries,
narration timing, the PDF renderer, prompt construction, PWA/asset-links
behaviour, story-privacy serialisation, and input validation.

**Shared business logic, not duplicated.** `src/features/stories/operations.ts`
holds the single implementation of every story mutation. `actions.ts` (server
actions, used by the web) and the `/api/v1` routes (used by the native app) are
both thin wrappers over it. The mobile app reproduces **no** authorization and
**no** charging logic — verified by reading `mobile/src/api.ts`, which only
issues HTTP calls.

**Secrets discipline.** `src/config/env.ts` splits a client schema (only
`NEXT_PUBLIC_*`) from a lazy `serverEnv()` that throws if it is ever reached
from a browser. The OpenAI SDK is imported in five server-only modules. No
secret appears in the repository; `.env.local` contains placeholders only.

**Photo upload is off.** `child_photo_upload_enabled` defaults to `false`, no
upload UI exists in web or mobile, `photo_storage_path` is stripped by the
child serialiser and redacted by the logger, and the privacy and FAQ pages
state plainly that photographs are not held. This matches the standing
instruction and has not been changed.

**Mobile app compiles and bundles.** Expo SDK 57 / React Native 0.86.2 /
React 19.2.3, 15 routes, expo-router typed routes, background audio declared,
SecureStore session chunking, offline download of *bytes* rather than signed
URLs.

---

## 2. Implemented but never run against a live service

The code exists and is unit-tested against fakes. It has **never** executed
against real OpenAI, real Supabase, or real storage. Treat every item here as
unproven in production.

| Area | What is unproven |
| --- | --- |
| Story text generation | The Responses API call with a strict `json_schema`, the fallback model path, output moderation, and page splitting |
| Illustrations | `gpt-image-1` calls, the character-sheet consistency approach, content-hash reuse, storage upload |
| Narration | `gpt-4o-mini-tts` output, and whether estimated per-page timings track real audio closely enough to follow pages |
| PDF export | Rendering runs in tests, but never over *real* generated illustrations at print resolution |
| Job worker | Claim/retry/dead-letter under real concurrency and real provider latency |
| Auth flows | Sign-up, magic link, password reset and OAuth callback against a real Supabase project |
| Storage | Bucket policies, signed-URL TTLs, and the delete-account sweep |
| Mobile end-to-end | Sign-in → create → read → narrate → offline, against a real backend, on a real device |
| Cost accounting | Recorded micro-USD has never been compared against a real OpenAI invoice |

---

## 3. Incomplete

Real work, deliberately unfinished, not blocked by anyone else.

- **No deployment of any kind.** No `.vercel` link, no CI, no hosted URL. The
  application has never been served anywhere but localhost. `vercel.json`
  declares a `* * * * *` worker cron, which needs a paid Vercel plan — the
  Hobby tier restricts cron frequency. Confirm against Vercel's current plan
  limits when the project is created.
- **No CI.** ~~No `.github/` directory.~~ **Fixed and green** —
  `.github/workflows/ci.yml` runs types, lint, tests, build, the migrations
  with their SQL assertions, and the Metro bundle. All three jobs passed on
  their first run ([run 32652573597](https://github.com/tnhasanov/Nagilai/actions/runs/32652573597)),
  so the migrations are now proven against a stock `postgres:16` container as
  well as against the local harness.
- **Mobile is English-only.** The four locale dictionaries exist on the web;
  the native app hardcodes English strings and only forwards a `locale` to the
  catalogue endpoint. Azerbaijani is the primary market.
- **Mobile child form is thinner than the web one.** It collects name,
  nickname, age, language, interests, animals, colour, appearance and notes,
  but omits `gender`, `favouriteActivities`, `personalityTraits` and
  `learningInterests` — all of which the API and database accept and the story
  prompt uses. Profiles created on mobile therefore produce less personalised
  stories.
- **No push notifications.** `expo-notifications` is not a dependency.
  Generation takes minutes; there is currently no way to tell a parent their
  book is ready unless the app is open.
- **Only email/password sign-in on mobile.** No Google, no Apple. (Adding
  Google without Apple would breach App Store guideline 4.8, so these ship
  together or not at all.)
- **No story-quality evaluation.** Nothing checks that generated stories are
  age-appropriate, in the right language, or actually good. For a children's
  product this is the highest-value missing test.
- ~~**`docs/MOBILE.md` leads with the Trusted Web Activity.**~~ **Fixed** —
  reordered so the native app is the primary path and the TWA is an optional
  extra at the end.
- ~~**`docs/ROUTES.md` predates the mobile API.**~~ **Fixed** — all 13
  `/api/v1` endpoints are documented, with the bearer-token and CORS
  reasoning.
- ~~**`.env.example` omits `DATABASE_URL`.**~~ **Fixed.**
- **Three npm scripts were broken or stale** — `db:migrate` pointed at a file
  that does not exist, `lint` used the `next lint` command Next 16 removed,
  and the type generator had no entry. **Fixed**, and `check` now runs lint.

---

## 4. Placeholder or mock

Present so the shape is right, but not real.

| Thing | Current value | Why it matters |
| --- | --- | --- |
| `mobile/app.json` → `extra.eas.projectId` | `00000000-0000-0000-0000-000000000000` | No EAS build can run until `eas init` writes a real id |
| `mobile/eas.json` → API URLs | `https://nagilai.com`, `https://staging.nagilai.com` | Neither host exists yet |
| `app_settings.ai_pricing` | Estimated rate card, self-labelled "VERIFY before relying on these figures" | Every cost figure and margin in the product derives from it |
| Stripe webhook | Verifies the signature and records the event; **grants no credits or entitlements** | Correct for now — deliberately not wired ahead of a pricing decision |
| Print provider | `PRINT_PROVIDER=manual`; orders land in an admin queue | No printer has been chosen; no real costs or SLAs are claimed anywhere |
| `products` seed | 7 rows with placeholder prices | Prices are the owner's decision, not an assumption to make |
| Legal pages | `/privacy` and `/terms` are drafts written from the architecture | Not reviewed by anyone qualified |
| `ANDROID_PACKAGE_NAME` example | ~~`com.nagilai.app`~~ → `com.nagilai.twa` | **Fixed** — the collision would have let the wrapper permanently claim the native app's identity |

---

## 5. Blocked

### 5.1 Blocked on credentials

Each entry states the service, the value, where to get it, where to put it, and
how to confirm it works without printing the secret.

| # | Service | Value | Where to obtain it | Where it goes | Verify without exposing it |
| --- | --- | --- | --- | --- | --- |
| 1 | Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project → Settings → API | `.env.local`, then Vercel project env | `npm run dev` and load `/login`; a bad key throws at boot |
| 2 | Supabase | `SUPABASE_SERVICE_ROLE_KEY` | Same page, "service_role" | Server-side env **only** — never `NEXT_PUBLIC_` | Run the worker endpoint; it needs admin access to claim a job |
| 3 | Supabase | `DATABASE_URL` (pooler connection string) | Project → Connect | Local shell only | `npm run db:types` regenerates `src/types/database.ts` with no diff |
| 4 | OpenAI | `OPENAI_API_KEY` | platform.openai.com → API keys | Server-side env only | Create one story; `ai_usage_events` gains a row with a non-zero cost |
| 5 | Worker | `CRON_SECRET` | `openssl rand -hex 32` | Server env + Vercel Cron header | `GET /api/jobs/worker` without it returns 401; with it, 200 |
| 6 | Vercel | Account + project link | vercel.com | `vercel link` | A deployment URL exists and serves `/` |
| 7 | Expo | EAS project id | `eas init` in `mobile/` | `mobile/app.json` → `extra.eas.projectId` | `eas build --profile preview --platform android` starts |
| 8 | Apple | Developer Program membership ($99/yr) | developer.apple.com | EAS credentials | `eas credentials` lists a signing identity |
| 9 | Google Play | Developer account ($25 once) | play.google.com/console | Play Console | The app record accepts an internal-testing upload |
| 10 | Stripe *(later)* | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Server env | Webhook test event returns 200 and inserts one `payments` row |

Note on this environment: `eas init` and `npx expo-doctor` cannot run here —
the agent proxy returns 403 for the Expo endpoints. They must be run from a
machine with normal network access.

### 5.2 Blocked on your decision

These are yours, not mine. They are catalogued in `docs/DECISIONS.md` Part 1
and are **not** being guessed at.

1. **Customer pricing** — plan prices, credit bundles, free-tier size.
2. **Children's privacy regime** — Azerbaijan-only vs GDPR/UK-AADC vs
   US-COPPA. This changes consent flows, retention, and the legal pages.
3. **Photograph upload** — stays off until you decide otherwise.
4. **Printing partner** — nothing about print cost or delivery is real until
   one is chosen.
5. **Verified AI rate card** — the current numbers are estimates.
6. **Illustration cost and default image count** — see gap #2 below; this is
   the single biggest lever on unit economics.
7. **Data residency** — which Supabase region.
8. **Store submission** — nothing will be submitted without your approval.

---

## 6. Prioritized gap list

Ordered by *what blocks the next real step*, not by size.

### P0 — blocks everything downstream

**1. Nothing is deployed.** No live URL means no live AI test, no cost
measurement, no beta, no store submission, no asset-links verification. Every
other checkpoint depends on this one. *Needs: credentials 1–6.*

**2. The default credit economics are internally inconsistent.** *(symptom
fixed; the values are still yours)*
`story_illustration` is charged **per image**, and a story generates one image
per page **plus** a cover. With the seeded defaults a "medium" story is
10 pages → 11 images → **1 + 11 = 12 credits**, while `signup_grant` is **3**.
`create.ts` pre-checks only the *text* cost, so a new parent's first book
would generate its text, produce two illustrations, and then fail the
remaining nine jobs permanently — `insufficient_credits` is non-retryable, so
those jobs dead-letter. The parent is left with a broken book.

At the seeded (unverified) rate card, `medium` quality `gpt-image-1` is
$0.042/image, so those 11 images cost roughly **$0.46 per story** before text
or narration. This is the material cost issue you asked to be flagged.

Two separable fixes:
- *Mine, no pricing implication:* **done.** Story creation now pre-checks the
  full estimated cost (`estimateStoryCost`, covered by four tests), so a
  parent is refused up front instead of receiving a half-generated book.
- *Yours, still open:* the actual `signup_grant`, per-image cost, and default
  image count. With today's values a new parent still cannot afford their
  first illustrated story — they will now be told so cleanly rather than
  discovering it through failed jobs, but the free tier does not work until
  you set these. See `docs/LAUNCH-READINESS.md`.

**3. Package-name collision between the TWA and the native app.** **Fixed.**
Both claimed `com.nagilai.app`; Play binds a package name permanently on first
upload, so publishing the TWA under it would have blocked the native app
forever. The native app keeps the name, the TWA example is now
`com.nagilai.twa`, and `npm run check:env` fails if the collision is
reintroduced. Nothing has been uploaded to Play, so this was caught in time.

### P1 — blocks a trustworthy beta

**4. No live AI integration test.** Nothing has ever called OpenAI. Model IDs,
the strict `json_schema` shape, image quality, TTS voices and real latency are
all unverified. *Needs: credential 4.*

**5. No measured unit economics.** Cost reporting is wired end to end, but
every number in it comes from an estimated rate card. Real prices come from
generating real stories and comparing recorded micro-USD against the invoice.
This is a prerequisite for any pricing conversation — and pricing is your
decision, so I will bring measurements, not proposals.

**6. No story-quality evaluation.** The one test that matters most for a
children's product does not exist: are the stories age-appropriate, actually
in the requested language, free of the banned phrasings, and good? Needs a
small graded corpus run against live generation.

**7. No CI.** **Fixed and verified green.** `.github/workflows/ci.yml` runs
types, lint, tests, build, the migrations with their SQL assertions, and the
Metro bundle — none of it needing a credential. First run: all three jobs
passed, web in 1m14s, database in 47s, mobile in 1m04s.

### P2 — native completeness before store submission

**8. Push notifications** — generation is minutes long; parents need to be
told when a book is ready.
**9. Apple and Google Sign In** — together, per guideline 4.8.
**10. Mobile localisation** — Azerbaijani, Russian and Turkish; the
dictionaries already exist on the web and can be shared.
**11. Mobile child form parity** — gender, activities, traits, learning
interests.
**12. Generation-status UX on mobile** — a real waiting room with per-page
progress, matching the web.

### P3 — documentation and hygiene

**13.** ~~Re-order `docs/MOBILE.md`~~ — **done**.
**14.** ~~Document `/api/v1` in `docs/ROUTES.md`~~ — **done**.
**15.** ~~Add `DATABASE_URL` to `.env.example`~~ — **done**.
**16.** Decide the Vercel plan, or change the worker cron to a schedule the
Hobby plan allows. *Still open — it depends on the plan you buy.*

### P4 — gated on your decisions

**17.** Monetization wiring (gap: pricing approval).
**18.** Physical books (gap: printer selection).
**19.** Legal pages and consent flows (gap: privacy regime).
**20.** Store submission (gap: your explicit approval).

---

## 7. What I did not do

- I did not start over, scaffold a second architecture, or replace any working
  component.
- I did not change pricing, credit values, image counts, or image quality.
- I did not enable photo upload, public discovery, or any additional
  retention.
- I did not invent a printing partner, a printer cost, or an SLA.
- I did not claim any deployment exists. None does.
