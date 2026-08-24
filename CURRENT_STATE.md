# Current state

**Last verified:** 2026-08-24 · **Branch:** `main`
The build is merged to `main` and Vercel deploys from it.

Every claim below was checked by running something, not by remembering.
Where a thing cannot be verified without a credential or a live service, it
says so rather than assuming.

**The site is live** at `nagilai.vercel.app`, signed into and used: an
account was created, a child profile saved, and the story wizard reached.
Generation itself has not run, because no OpenAI key is in use yet — so
nothing below in §2 has moved.

**What live use found.** Two faults, both fixed and both worth recording
because neither was visible from any local check. The wizard quoted the
cost of a story's *first job* while the server checked the whole book, so
it said "this uses 1 credit" and then refused the story — the two sides
had been computing the price separately. And the child form asked a
parent to invent six lists of interests into six empty text boxes, which
is a form people abandon. There is now one costing function shared by
browser and server, and the common answers are one tap.

**A design pass followed**, run against the app in a real browser rather
than by reading markup, plus a fan-out audit of every signed-in surface.
Fixed: cards rendered with no padding in eleven places; the focus ring
was being deleted from every input in the app; inputs were 15.2px, so
iOS zoomed the page on every field; every call to action failed contrast
(3.0:1 light, 2.1:1 dark) and now uses a separate `--color-action` token;
the credit balance was hidden on phones; the "not enough credits" alert
sat *below* the button it disabled; five parts of the interface were
still hard-coded English, including the whole error screen and footer;
the sign-in page had no language switcher, so a wrong locale guess
trapped you there; a book still generating announced itself as "OPEN…"
on a ribbon unreadable in dark mode; narration never arrived because a
single six-second refresh was the only re-check; a permanently disabled
"Listen" button occupied the reader's primary slot; and the book
dead-ended at "The End" with nowhere to go.

Then a fan-out audit of every signed-in surface found 31 more, each
verified against the source before being acted on. Also fixed: the
wizard's theme list was age-filtered for `children[0]` and never
re-filtered when you switched child; story language defaulted to
catalogue order, so a Turkish parent got an Azerbaijani book;
`--color-ink-faint` was 3.16:1, which is every hint and caption in the
app; the waiting room's status line was English; the delete dialog had no
Cancel; icon buttons and the narration scrubber were under 44px; two
avatar colours were Tailwind's cold defaults; sage, plum and rose carried
white text that failed in dark mode; and adding a child mid-story
stranded you on the profile list. Two of the 31 were faults I had
introduced an hour earlier — a stale comment claiming a tap target it did
not meet, and an install banner landing on the new sticky Save bar.

**One of those changes the brand's appearance**: primary buttons are
visibly darker, because amber under white text was 3.0:1. The accent
colour itself is untouched — soft amber backgrounds, badges, borders and
selected states are exactly as they were. Worth a look before it goes
further.

**The Supabase project exists.** Region `eu-central-1` (Frankfurt), and the
full schema is applied to it: 31 tables, **0 without row-level security**,
16 themes seeded, 5 storage buckets. Confirmed by query against the real
project, not against a scratch container. That is the first thing in this
build that is real rather than proven-in-a-harness.

---

## What was actually run

| Check | Command | Result |
| --- | --- | --- |
| Web types | `npm run typecheck` | **exit 0** |
| Web lint | `npm run lint` | **exit 0** |
| Web tests | `npm test` | **207 passed**, 15 files |
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
decides when a book *starts* rather than whether it finishes; and retries
and reaping are keyed to absolute timestamps, so a missed tick costs latency
and no work. One honest caveat: a job backing off after a failure is not yet
*due*, so it does not extend the chain and waits for the next tick — cadence
decides how long a retry sits, which is why `vercel.json` ships a
Hobby-compatible daily schedule and `docs/OPERATIONS.md` says plainly what
that costs. The Vercel-shaped limits are request parameters clamped to the
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

**CI.** Three jobs: web (types, lint, 178 tests, build), database (ten
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
| 1 | Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project → Settings → API Keys | Vercel env vars | `npm run check:env -- --probe` |
| 2 | Supabase | `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` | Server-side only, never `NEXT_PUBLIC_` | Probe reports the schema is present and seeded |
| 3 | Supabase | `DATABASE_URL` | Project → Connect | Local tooling only; not needed to deploy | `npm run db:types` regenerates with no diff |
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
2. **The credit defaults do not work as a free tier — this is the live
   blocker.** The seeded settings grant a new parent **3** credits and
   charge **1** per image plus **1** for the text, so:

   | Story | Images | Cost | Affordable on 3? |
   | --- | --- | --- | --- |
   | Short (6 pages), illustrated | 7 | **8** | no |
   | Medium (10 pages), illustrated | 11 | **12** | no |
   | Long (16 pages), illustrated | 17 | **18** | no |
   | Any length, no pictures | 0 | **1** | yes |

   So the only book a new account can make today is a book with no
   pictures — which is not the product. The wizard now says this plainly
   and offers the text-only version rather than failing after the fact,
   but that is honesty about the problem, not a fix for it.

   Three separate dials, and **I have deliberately not touched any of
   them** (`app_settings.credits` and `app_settings.generation_limits`):

   - `signup_grant` — how many credits a new account starts with.
   - `story_illustration` — the per-image charge.
   - whether the free story is illustrated at all.

   Any one of them unblocks it; which one is a pricing decision, and it
   is worth answering *after* §2 measures what an image actually costs,
   because that is the number the charge should be anchored to. Changing
   a value is a row in `app_settings` — no deployment, no migration.
3. **Children's privacy regime** — Azerbaijan-only vs GDPR/UK-AADC vs
   US-COPPA. Changes consent flows, retention, and the legal pages.
4. **Photograph upload** — stays off until you say otherwise.
5. **Printing partner** — nothing about print cost or delivery is real until
   one is chosen.
6. **Verified AI rate card** — the current numbers are estimates.
7. **Illustration cost and default image count** — the largest lever on unit
   economics. At the seeded rate, a medium story is roughly $0.46 of images.
8. ~~**Data residency**~~ — **decided**: Frankfurt (`eu-central-1`). Vercel
   functions must be created in the same region.
9. **Store submission** — nothing will be submitted without your approval.

---

## 5b. Found by audit

A fan-out audit of every signed-in web surface produced 31 verified
findings; all but two are now fixed. What remains:

1. **Nothing in the signed-in app links to `/pricing`** — deliberately
   blocked on §5.1/§5.2: there is nothing to sell until pricing is
   decided.
2. **The content column width varies from page to page** under the
   fixed-width header — a judgement call, recorded rather than churned.

A second audit of the four signed-in **native** screens is running; its
verified findings (native reader narration polling, clipped story text
on small phones, dead child cards with no edit path, settings toggles
that fail silently) are the next block of work.

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
