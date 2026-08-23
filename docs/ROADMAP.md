# Roadmap

## Phase 1 — Functional MVP · **implemented**

| Requirement (§35) | State |
| --- | --- |
| Authentication | Password, magic link, Google. Reset, profile, export, delete. |
| Child profiles | Multiple children, full field set, archive. |
| Multilingual story generation | az-AZ, en-US, ru-RU, tr-TR, natively written. |
| Story library | Cover-led cards, favourites, rename, delete. |
| AI illustrations | Per-page and cover, consistent via a character sheet. |
| TTS narration | Current speech API, six voices, cached, page-following. |
| Digital book reader | Spread layout, page turns, fullscreen, keyboard, swipe. |
| PDF export | Print-quality, embedded fonts, digital and bleed variants. |
| Basic sharing | Unguessable tokens, revocable, expiring, `noindex` by default. |
| Basic admin | Metrics, cost breakdown, jobs, moderation, configuration. |
| Usage/cost tracking | Every call, in micro-USD, with the rates snapshotted. |

Also shipped: remix, retry of individual failed assets, credit ledger,
rate limiting, moderation at three points, audit log, four interface
translations.

### Definition of success (§39)

| # | Step | State |
| --- | --- | --- |
| 1 | Open the website | ✅ |
| 2 | Register | ✅ |
| 3 | Create a child profile | ✅ |
| 4 | Select az / en / ru / tr | ✅ |
| 5 | Choose a story theme | ✅ |
| 6 | Generate a personalised story | ✅ |
| 7 | Generate matching illustrations | ✅ |
| 8 | Read it as a digital book | ✅ |
| 9 | Press Listen and hear narration | ✅ |
| 10 | Save the story | ✅ automatic |
| 11 | Find it later in My Library | ✅ |
| 12 | Download a formatted PDF | ✅ |
| 13 | Share through a controlled link | ✅ |
| 14 | See usage in the admin area | ✅ |

Steps 6–9 and 12 require live OpenAI and Supabase credentials; everything
else runs without them.

## Phase 2 — Monetisation · **scaffolded, switched off**

Schema, service interfaces, admin configuration and the webhook endpoint
exist. `payments_enabled` is `false`.

| Item | Remaining work |
| --- | --- |
| Subscriptions | Stripe products and prices; checkout; portal; grant credits on `invoice.paid` guarded by `last_grant_period_start` |
| Credit packs | Checkout and grant-on-payment |
| Advanced analytics | Connect a provider; the event stream already exists |
| Premium styles | Gate `illustration_styles.is_premium` on the plan |
| Gifting | New flow; no schema change needed |

**Blocked on the owner:** actual prices and currencies.

## Phase 3 — Physical books · **schema and interface ready**

`printing_enabled` is `false`; `PRINT_PROVIDER=manual`.

| Item | Remaining work |
| --- | --- |
| Book configurator | UI over `products` where `kind = 'printed_book'` |
| Checkout | Reuse the Phase 2 payment path |
| Print-ready PDF | Done — `variant: 'print'` adds bleed and crop marks |
| Orders and shipping | Tables exist; admin fulfilment screen needed |
| Provider integration | Implement `PrintProvider` for the chosen partner |

**Blocked on the owner:** a printing partner and real production costs. The
figures in `ManualPrintProvider` are placeholders, marked as such.

## Phase 4 — Platform expansion · **architected for, not built**

Nothing below requires a rewrite of what exists:

| Ambition | What already supports it |
| --- | --- |
| Mobile app | All logic is server-side behind actions and endpoints |
| Family accounts | `profiles` and ownership are already separable from `auth.users` |
| Grandparents gifting | `orders` + `share_links` |
| Birthday and recurring books | The job queue plus a scheduled trigger |
| Teacher/school accounts | `user_role` enum extends; RLS is per-owner already |
| Character continuity across books | `character_bible` on the version — lift to the child |
| Series and bookshelves | A join table over `stories` |
| Multiple children in one story | `child_snapshot` becomes an array; the prompt takes a cast |
| Voice personalisation | `voices` is a table; consent gating exists |
| International print-on-demand | `PrintProvider` per region |

## Deliberately deferred

| Deferred | Why |
| --- | --- |
| Photo-based illustration | Consent, storage and legal review needed first. Description-based consistency works today. |
| Word-level narration highlighting | The API returns no word timings. Page-level is what a child follows anyway. |
| Real-time generation streaming | Polling costs one small request every 2.5s for a couple of minutes; a socket per waiting parent is not worth it on serverless. |
| Redis rate limiting | Postgres is sufficient at this volume; the interface allows swapping later. |
| A bespoke admin form per setting | JSON editing with schema validation covers occasional business edits. |
