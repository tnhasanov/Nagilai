# Decisions

Two halves. The first is **what needs you** — business calls that were
assumed in order to keep building, and that need a real answer before
launch. The second is the technical record.

---

# Part 1 — Decisions that need the owner

The specification says to make sensible production-grade assumptions,
document them, and flag anything with meaningful business implications.
These are those.

## 1.1 Pricing — **blocked**

**Assumed:** three tiers (Free / Family / Premium) with these entitlements,
and a credit model of 1 credit per story, 1 per illustration, 1 per
narration. New accounts get 3 credits.

| Tier | Children | Stories/month | Premium styles |
| --- | --- | --- | --- |
| Free | 2 | 3 | no |
| Family | 5 | 30 | yes |
| Premium | 10 | 100 | yes |

**Not assumed:** any actual price. No monetary amount is written anywhere in
the codebase; `prices` is seeded empty and the paid tiers show "coming
soon".

**What we need from you:** the monthly price per tier, the currencies
(AZN, USD, EUR, TRY?), and whether credits are also sold as one-off packs.

**Why it matters commercially:** a medium illustrated story of ten pages
costs roughly **$0.45–0.55** at the seeded rate card — about 90% of that is
the ten images. That is the number a subscription price has to clear. The
admin cost dashboard reports actuals per operation; use it before pricing.

## 1.2 The rate card is an estimate — **verify**

`app_settings.ai_pricing` is seeded with plausible per-unit costs so the
cost dashboard is not blank. **They have not been verified against a current
provider price list.** Before using the margin figures for a pricing
decision, check them and update the row in the admin panel — no deployment
needed.

## 1.3 Illustrations dominate cost — **decide**

At the seeded rates, one image at medium quality costs roughly 30× a whole
story's text. Three levers exist, all configurable:

- generate fewer images (cover plus every other page);
- default to `low` quality and sell `high` as a premium feature;
- charge more credits per illustration than per story.

Currently every page gets a medium-quality image for one credit. **This is
the single biggest lever on unit economics** and is a business decision, not
a technical one.

## 1.4 Printing partner — **blocked**

`PrintProvider` is abstracted, and the MVP implementation queues orders for
manual fulfilment as the specification allows. The cost model inside it
(base cost per size and binding, per-page cost, shipping by country) is
**entirely placeholder**.

**What we need from you:** a printing partner — a local Azerbaijani printer,
Gelato, Lulu or Blurb — and their real production and shipping costs. Then
either the numbers go into the manual provider, or a provider class is
written against their API.

## 1.5 Children's privacy regime — **needs a legal answer**

The build takes the strictest reasonable posture: photo upload off, minimal
data, no training use, private by default, one-click export and erase.

**What we need from you:** which regime actually applies.

- Azerbaijan only → local data protection law.
- EU families → GDPR, and GDPR-K if children interact directly. Currently
  only adults have accounts, which helps.
- US families → COPPA, which has specific requirements around verifiable
  parental consent.

This affects the consent flow, the retention period, and where the Supabase
project should be hosted. It also gates §1.6.

## 1.6 Photograph upload — **recommend keeping off**

The specification allows optional photo upload "subject to appropriate
consent and safety controls". The schema, storage bucket, policies and a
consent-timestamp constraint all exist; the feature flag is `false`.

**Recommendation:** leave it off. Storing photographs of children changes
the risk profile of the whole product, and the appearance-description field
already gives illustrations page-to-page consistency. Turn it on only after
§1.5 is answered and a consent flow is designed.

## 1.7 Authentication — **confirm**

**Assumed:** email/password, magic link and Google. Apple sign-in is
architected for but not enabled (it needs a paid Apple developer account and
a review pass).

**What we need from you:** whether Apple sign-in is needed at launch, and
whether a phone/OTP option matters for the Azerbaijani market — where phone
numbers are often a more natural identifier than email.

## 1.8 Guest generation — **recommend against**

`guest_preview_enabled` exists as a flag but no guest path is implemented.
Letting an anonymous visitor generate a story is a direct, unbounded spend
by an unauthenticated party.

**Recommendation:** if a try-before-signup moment is wanted, ship a
pre-generated sample library rather than live generation.

## 1.9 Model selection — **confirm**

**Assumed:** `gpt-5` for text, `gpt-image-1` for illustration,
`gpt-4o-mini-tts` for narration, `omni-moderation-latest` for safety. All
four are rows in `app_settings.ai_models` and changeable from the admin panel
without a deployment.

**What we need from you:** whether to trade text quality for cost by moving
to a smaller model. Story quality is the product; this is where the trade-off
is most visible to a customer.

## 1.10 Data residency — **decided: Frankfurt (`eu-central-1`)**

The Supabase project lives in Central EU (Frankfurt). Chosen when the
project was created, and the right answer on both counts:

- **Latency.** Roughly 3,000 km from Baku, so ~60-80 ms round trip. Every
  signed-in page makes several database round trips, and a Singapore or
  Tokyo region would have tripled that.
- **It keeps §1.5 open.** Hosting Azerbaijani children's data inside the
  EU means that choosing GDPR alignment later requires no migration and no
  international-transfer story. The reverse — deciding on GDPR after
  storing the data elsewhere — is the expensive order to do it in.

The Vercel functions must be created in the same region. A function in the
US talking to a database in Frankfurt pays the distance on every one of
those round trips, which is the failure mode this choice exists to avoid.

Still open under §1.5: which regime actually governs the data. Frankfurt
makes that a decision rather than a constraint.

---

# Part 2 — Technical decisions

## 2.1 Next.js App Router with server actions

Server actions rather than a REST API for mutations, so most operations have
no HTTP surface to enumerate — there is no endpoint that lists children.
Route handlers are used only where a genuine HTTP contract is needed: the
cron worker, the progress poll, the analytics intake, the Stripe webhook.

## 2.2 Postgres job queue rather than a broker

Transactional with the rows the jobs concern, correct under concurrency via
`FOR UPDATE SKIP LOCKED`, and nothing to provision on Vercel. `claim`,
`complete` and `fail` are the only three functions an external queue would
need to replace.

**Trade-off:** it will not scale to very high throughput. At that point the
call sites do not change.

## 2.3 Status derived, not assigned

Illustration jobs finish out of order, so a handler writing `ready` when it
happens to be last would race with its siblings. `recomputeStatus()` derives
the answer from the current state of the assets, which is idempotent and
lets one failed picture leave the book readable.

## 2.4 Cost in integer micro-USD

Floating-point money is a bug waiting to be reported. Micro-USD keeps the
smallest real cost (a moderation call) as a whole number and the largest
monthly total inside a `bigint`.

## 2.5 Idempotency keys derived from the work

`story:{id}:v{version}:text`, not a fresh uuid. A random key would make
every retry a new charge, which is exactly the failure §34 asks to be
prevented.

## 2.6 A frozen child snapshot on the story

Reproducible regeneration, no join from a share page to `children`, and no
orphaned books when a profile is removed. It is the structural reason share
links cannot leak child data.

## 2.7 The character sheet is repeated, not remembered

Visual consistency comes from pasting the character description into every
illustration prompt rather than hoping the image model carries context. It
is why page nine draws the same child as page one.

## 2.8 pdf-lib, not headless Chrome

The specification is explicit that the PDF must not be a printed web page.
pdf-lib gives embedded subsetted fonts, full-bleed images, crop marks and a
correct trim box, and runs in a serverless function with no cold-start
browser. Literata and Nunito were chosen over prettier faces because they
cover Latin, Latin Extended **and** Cyrillic in one file — a missing glyph in
a printed book is not recoverable.

## 2.9 Interface locale in a cookie, not the URL

One URL per page, which matters for share links and for the SEO rules in
§31. The story's language is a separate column, and per the specification's
closing note it never travels in a URL.

## 2.10 Moderation fails open when the classifier is unreachable

Fail-closed on classified harm; fail-open on classifier *unavailability*.
Refusing every story during a provider outage is a worse product outcome
than one unclassified prompt, and the story system prompt already constrains
content heavily. The event is still recorded as flagged so it surfaces in the
admin area.

## 2.11 Share tokens stored in plaintext

Hashing them would mean a parent could never re-copy their own link. A
share token is a bearer capability with 256 bits of entropy, revocable and
expirable — the same model Google Docs uses. **Accepted risk:** a database
leak exposes live share links. Revocation is one click and retires the
token permanently.

## 2.12 Narration timings estimated from character counts

The speech API returns no word timings. Duration is apportioned across pages
by character count, and the reader highlights the current **page** rather
than the current word — the granularity a child actually follows, and
forgiving of a second's drift.

## 2.13 Admins cannot read children

Staff see aggregates through a `SECURITY DEFINER` function and have no read
policy on `children` at all. This costs support the ability to debug "my
story came out wrong" by looking at the profile. That is the intended
trade-off for a product about children, and it is asserted in the SQL tests
so it cannot be quietly relaxed.

## 2.14 Database types generated by introspection

`scripts/generate-db-types.mjs` reads a live database and emits
`src/types/database.ts`, including real foreign-key relationships. Generated
rather than hand-written so the types cannot drift from the migrations.

## 2.15 Tag lists truncate rather than reject

A parent who types fifteen interests has not made a mistake worth a form
error. The cap exists to bound the prompt, not to police them.

## 2.16 `src/` prefix on the specification's structure

§26 lists `/app`, `/components`, `/features`, `/lib`, `/services`, `/db`,
`/types`, `/config`. All of those exist under `src/`, which keeps the
repository root readable. `/db` is `supabase/migrations` plus
`src/types/database.ts`.
