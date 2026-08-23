# Routes

`ƒ` server-rendered on demand · `○` static

## Public

| Route | Purpose | Indexed |
| --- | --- | --- |
| `/` | Landing (§20) | yes |
| `/pricing` | Plans and credit costs, read from configuration | yes |
| `/faq` | Questions parents actually ask | yes |
| `/about` | Why the product exists | yes |
| `/contact` | Support address | yes |
| `/privacy` | What is stored and what is never done | yes |
| `/terms` | Terms of use | yes |
| `/share/[token]` | A shared book | **no**, unless the owner opted in |
| `/robots.txt`, `/sitemap.xml` | Crawler policy | — |

Marketing pages revalidate hourly. `/share/[token]` is dynamic and generates
its own metadata per link, including the robots directive.

## Authentication

| Route | Purpose |
| --- | --- |
| `/login` | Password, magic link, or Google |
| `/signup` | Create an account |
| `/forgot-password` | Request a reset link |
| `/auth/callback` | Exchange the OAuth or email code for a session |

All `noindex`. The callback validates its `next` parameter as a same-site
relative path — an unchecked redirect target here would be an open redirect
handed to anyone who can craft a sign-in link.

## Signed in

| Route | Purpose |
| --- | --- |
| `/library` | Every story, cover-led |
| `/library/[storyId]` | The reader, or the generation waiting room |
| `/create` | The three-step story wizard |
| `/children` | Child profiles |
| `/children/new`, `/children/[childId]` | Add and edit |
| `/settings` | Profile, password, data export, account deletion |

All `noindex` and `force-dynamic`. Guarded twice: the proxy redirects an
unauthenticated request to `/login?next=…`, and every query runs through
the user-scoped Supabase client so RLS enforces ownership regardless.

## Admin

| Route | Purpose |
| --- | --- |
| `/admin` | Aggregate metrics and AI cost breakdown |
| `/admin/jobs` | Failed and dead-lettered work; requeue |
| `/admin/moderation` | Flagged and blocked content |
| `/admin/settings` | Business configuration (admin only, audited) |

Staff (`admin` or `support`) may read; only `admin` may write configuration.
Checked in the page, again in the feature layer, and again inside
`admin_dashboard_metrics()` in the database.

## API

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/jobs/worker` | GET, POST | `Bearer CRON_SECRET` | Drain the job queue |
| `/api/stories/[storyId]/progress` | GET | Session | Generation progress poll |
| `/api/analytics` | POST | Optional session | Client-side event intake |
| `/api/webhooks/stripe` | POST | Stripe signature | Payment events (Phase 2) |

The worker endpoint spends money, so it **refuses to run** when
`CRON_SECRET` is unset rather than running unauthenticated. Comparison is
constant-time.

Analytics accepts only the event names the product defines, so it cannot be
used as an open write endpoint.

The Stripe handler verifies the signature against the **raw** body before
parsing anything, and records each event under a unique index on the Stripe
event id — so a redelivery updates a row rather than granting a second month
of credits.

## `/api/v1` — the native app's API

The Expo app in `mobile/` talks to these. They are **thin wrappers** over
`src/features/stories/operations.ts` and the same feature layer the website's
server actions use — the same ownership checks, the same rate limits, the
same charging. No business logic is reimplemented for mobile, and the app
never decides what a parent may do or what it costs.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/v1/me` | GET | Profile, credit balance, feature flags |
| `/api/v1/catalogue` | GET | Languages, themes, objectives, styles, voices for a locale |
| `/api/v1/children` | GET, POST | List and create child profiles |
| `/api/v1/children/[childId]` | GET, PATCH, DELETE | Read; update; archive |
| `/api/v1/stories` | GET, POST | Library; start a story |
| `/api/v1/stories/[storyId]` | GET, PATCH, DELETE | Read; rename or favourite; delete |
| `/api/v1/stories/[storyId]/progress` | GET | Generation progress poll |
| `/api/v1/stories/[storyId]/narration` | POST | Queue narration |
| `/api/v1/stories/[storyId]/pdf` | POST | Build or fetch a PDF |
| `/api/v1/stories/[storyId]/share` | GET, POST, DELETE | Read, create/update, revoke a share link |
| `/api/v1/stories/[storyId]/remix` | POST | Remix into a new story |
| `/api/v1/stories/[storyId]/retry` | POST | Retry a failed story |
| `.../illustrations/[illustrationId]/retry` | POST | Retry one failed image |

Every route also answers `OPTIONS` for the CORS preflight.

Authentication is a **bearer token**, not a cookie: `Authorization: Bearer
<supabase access token>`. The token is verified *with Supabase on every
request* rather than decoded locally, so a revoked session or a deleted
account stops working immediately rather than at the next expiry.

Because auth is a bearer token and never an ambient cookie, CORS can be
permissive without opening a cross-site request forgery hole — a hostile page
cannot make a browser attach a token it does not have.

Every handler runs through `src/services/api/handler.ts`, which turns a Zod
failure into a field-keyed error map, an `AppError` into its own status code
(`402` for insufficient credits, `429` for a rate limit), and anything else
into a `500` that reveals nothing.

## Server actions

Most mutations are server actions rather than endpoints, so no HTTP surface
exists to enumerate.

| Area | Actions |
| --- | --- |
| Children | create · update · archive |
| Stories | create · remix · narrate · pdf · retry story · retry illustration · favourite · rename · delete |
| Sharing | create/update link · revoke |
| Account | update profile · set locale · export data · delete account |
| Auth | sign up · sign in · magic link · reset · update password · Google · sign out |
| Admin | update setting · toggle theme · requeue job |

Every action re-establishes the caller from the session and never trusts an
owner id from the client. Errors are returned as a serialisable
`ActionResult` so the form can show a parent-friendly message rather than
React's redacted server error.
