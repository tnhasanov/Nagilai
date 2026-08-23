# Security and privacy

This is a commercial product that stores information about children. The
posture below is deliberate, and most of it is enforced by the database
rather than by application code — because application code is where the
mistakes happen.

## What we hold about a child

Only what a parent types: a name or nickname, an optional age, a preferred
language, interests, personality notes, an optional free-text appearance
description, and optional parent notes.

Deliberately **not** held:

- **Photographs.** `child_photo_upload_enabled` is `false`. The schema and
  storage policies exist so the feature can be switched on after a consent
  flow and legal review, and a check constraint makes it impossible to store
  a photo path without a recorded consent timestamp. Until then, the
  appearance *description* gives the illustrator the consistency it needs
  without holding a picture of a child.
- **Exact birth dates by default.** The field exists and derives age
  automatically when supplied, but the forms ask for an age.
- **Any identifier that would let a child be recognised off-platform.**

## Identified risks and what answers them

| Risk | Mitigation |
| --- | --- |
| One family reads another's children | RLS on `children`, owner-only, no admin read policy. Asserted in SQL tests. |
| A parent promotes themselves to admin | `BEFORE UPDATE` trigger restores `role`, `credit_balance`, `email`, `id`. Asserted. |
| A share link exposes child data | Anonymous readers call a `SECURITY DEFINER` function that returns a redacted document. Asserted that notes, age, interests and the child id do not appear. |
| A share link is guessed | 256 bits of CSPRNG entropy; a length constraint in the database. |
| A revoked link keeps working | Revocation retires the token; re-sharing mints a new one. Asserted. |
| A private book is indexed | `noindex` by default; `robots.txt` disallows `/library`, `/share`, `/children`, `/settings`, `/admin`; the sitemap lists marketing pages only. |
| An asset URL leaks | Private buckets, no public URLs, signed URLs expiring in 5 minutes to 2 hours. |
| An API key reaches the browser | `serverEnv()` throws if called client-side; the OpenAI SDK is imported in five server-only modules. |
| Prompt injection through a parent's free text | Structural heuristics before any paid call, plus moderation, plus a system prompt that names the child's details as *data*. |
| A model returns unsuitable content | Generated text is moderated **before** it is stored, not after it is shown. Blocked output refunds and never persists. |
| An illustration prompt smuggles content past us | Each scene prompt is moderated before it reaches the image model. |
| Runaway AI spend | Per-user rate limits, credit checks before generation, content-hash reuse, and a bounded worker. |
| A retried job charges twice | Idempotency keys derived from the work, unique-indexed on the ledger. Asserted. |
| Webhook redelivery grants a second month | Unique index on `(provider, provider_event_id)`. |
| An open redirect in the auth callback | `next` is validated as a same-site relative path. |
| An unauthenticated worker invocation | Bearer secret, constant-time comparison, refuses to run if unset. |
| Admin action without a trail | `admin_audit_log` with before/after, actor, IP and user agent. |

## Defence in depth

Ownership is checked in three independent places:

1. **The proxy** redirects an unauthenticated request away from a private
   route. This is routing, not security.
2. **The feature layer** filters by `owner_id` explicitly.
3. **The database** enforces RLS on the user-scoped client.

Layer 3 is the one that counts. A bug in 1 or 2 is a bug; a bug in 3 would
be a breach, which is why it is the layer with SQL assertions against it.

## Where the service role is used

`supabaseAdmin()` bypasses RLS. It is used only where the work genuinely
cannot be done as the user:

- background jobs writing generated pages, images and audio;
- minting signed URLs for private objects;
- the credit ledger, usage tracking and moderation log;
- admin aggregates and webhook handling.

Every one of those call sites establishes *who* the work is for first and
scopes its queries by that owner id by hand.

## Logging

`src/lib/logger.ts` redacts by key on the way out: authorization headers,
tokens, secrets, emails, `parent_notes`, `appearance_description`,
`photo_storage_path` and `child_snapshot` are replaced with `[redacted]`,
strings are truncated, and structures are depth-limited.

Moderation events store at most a 400-character excerpt, and nothing at all
for content that was allowed.

## Analytics

Events are written to our own table first and forwarded to a provider
second, so the funnel survives ad blockers and consent refusals. The
forwarder drops known-sensitive keys and passes only scalars, so a child's
name cannot reach a third party through a property bag.

## Content safety

Three moderation points (§7):

1. The parent's free-text request, before any paid call.
2. The generated story, before it is stored or shown.
3. Each illustration prompt, before it reaches the image model.

Fail-closed on classified harm. Fail-**open** only when the classifier
itself is unreachable — refusing every story during a provider outage is a
worse outcome than one unclassified prompt, and the story prompt already
constrains content heavily. An unreachable classifier is recorded as a
flagged event so it shows up in the admin area rather than passing silently.

## The parent's rights

- **Export.** One click in Settings produces a JSON document of everything.
- **Delete.** One click removes the account, every child profile, every
  story, every image, every audio file and every PDF, and revokes every
  share link. It is a genuine erase, not a flag.

## Before launch

- [ ] Legal review of the privacy policy and terms (both are marked draft).
- [ ] A decision on the children's-privacy regime that applies —
      Azerbaijani law, GDPR/GDPR-K if EU families are targeted, COPPA if
      the US is (see [DECISIONS.md](DECISIONS.md)).
- [ ] A data processing agreement with the model provider.
- [ ] Rotate every key that has been used in development.
- [ ] Confirm the Supabase project is in the intended region.
- [ ] Penetration test of the share-link and storage paths.
