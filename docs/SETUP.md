# Setup

## 1. Prerequisites

- Node.js 20.9+
- A Supabase project
- An OpenAI API key
- (Optional) Vercel, Stripe, Resend, PostHog

## 2. Install

```bash
npm install
cp .env.example .env.local
```

## 3. Supabase

### Create the project

1. Create a project at supabase.com.
2. **Choose the region deliberately** — it is painful to change later, and
   it may be a legal question. See [DECISIONS.md](DECISIONS.md) §1.5, §1.10.
3. From *Project Settings → API*, copy into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The service role key **bypasses row level security**. Server-side only,
never prefixed `NEXT_PUBLIC_`, never logged.

### Apply the schema

Either the CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

…or paste each file from `supabase/migrations/` into the SQL editor **in
numerical order**. `0009` is idempotent and safe to re-run after every
deploy to pick up new reference data.

Verify against a scratch Postgres first if you like:

```bash
createdb nagilai_test
DATABASE_URL=postgres:///nagilai_test ./scripts/verify-migrations.sh
```

That applies the shim, all migrations, all migrations *again* to prove
idempotency, and then the security assertions.

### Configure Auth

*Authentication → Providers*:

- **Email** — on. Enable "Confirm email" for production.
- **Google** — on. Create OAuth credentials in Google Cloud Console with the
  redirect URI `https://<ref>.supabase.co/auth/v1/callback`.

*Authentication → URL Configuration*:

- Site URL: your deployed origin.
- Redirect URLs: `https://your-domain/auth/callback` and
  `http://localhost:3000/auth/callback`.

### Storage

Migration `0008` creates all five buckets and their policies. Confirm under
*Storage* that `child-photos`, `illustrations`, `narrations` and
`story-pdfs` are **private** and only `public-assets` is public.

### Make yourself an admin

After signing up once:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## 4. OpenAI

```
OPENAI_API_KEY=sk-...
```

Model ids are **not** environment variables by default — they live in
`app_settings.ai_models` so they can be changed from the admin panel. The
`OPENAI_*_MODEL` variables exist as an override for a single environment.

Set a monthly spend limit on the OpenAI account before going live. Nagilai
has its own credit and rate limits, but a provider-side cap is the backstop.

## 5. The background worker

```bash
# Generate a secret
openssl rand -hex 32
```

```
CRON_SECRET=<the value>
```

The worker endpoint **refuses to run without it** rather than running
unauthenticated. `vercel.json` already registers the cron entry:

```json
{ "crons": [{ "path": "/api/jobs/worker", "schedule": "* * * * *" }] }
```

Locally, drain the queue by hand:

```bash
curl -X POST http://localhost:3000/api/jobs/worker \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 6. Run

```bash
npm run dev        # http://localhost:3000
npm run check      # typecheck + tests + build
```

## 7. Deploy to Vercel

1. Import the repository.
2. Add every variable from `.env.example` under *Settings → Environment
   Variables*. `NEXT_PUBLIC_SITE_URL` may be omitted — it is derived from
   `VERCEL_PROJECT_PRODUCTION_URL`.
3. Deploy. The cron is registered from `vercel.json`; confirm it under
   *Settings → Cron Jobs*.
4. Add the deployed origin to Supabase's redirect URL list.

Regions: put the Vercel functions near the Supabase project. Every request
does several database round trips, and cross-continent latency is felt.

## 8. Optional integrations

### Stripe (Phase 2)

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

Add an endpoint at `https://your-domain/api/webhooks/stripe` for
`checkout.session.completed`, `customer.subscription.*` and `invoice.paid`.
Then set `payments_enabled` to `true` in the admin panel.

### Resend

```
RESEND_API_KEY=re_...
EMAIL_FROM="Nagilai <hello@your-domain>"
```

Without these, transactional email is a logged no-op. Supabase Auth still
sends its own sign-in and reset messages.

### PostHog

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Events are always written to `analytics_events`; this only adds forwarding.

## 9. After a schema change

```bash
DATABASE_URL=postgres://... node scripts/generate-db-types.mjs
npm run typecheck
```

The generated file is committed, so the types can never drift from the
migrations.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Invalid server environment configuration` | A required variable is missing; the message names it. |
| Stories stay `queued` | The worker is not running. Check `CRON_SECRET` and the Vercel cron. |
| `insufficient_credits` immediately after signup | `0009` was not applied, so no welcome grant exists. |
| Illustrations never appear | `illustrations_enabled` is off, or the image model id is wrong. Check `/admin/jobs`. |
| Images 404 in the reader | Signed URL expired. Reload — they are minted per request. |
| `permission denied for table` | Using the anon client where the service role is needed, or a missing RLS policy. |
| Admin area redirects to the library | The profile's `role` is not `admin` or `support`. |
