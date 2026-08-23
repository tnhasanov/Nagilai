# Nagilai

Personalised storybooks for families. A parent describes their child once;
Nagilai writes an original illustrated story in which that child is the
protagonist, narrates it aloud, keeps it in a private library, and turns it
into a print-quality book.

Four launch languages — **Azerbaijani, English, Russian and Turkish** — each
written natively rather than translated.

```
Landing → Sign up → Child profile → Story wizard → Generation →
Digital book → Listen → Library → PDF → Share
```

---

## Status

**Phase 1 (functional MVP) is implemented.** Authentication, child profiles,
multilingual story generation, AI illustrations, narration, the digital book
reader, PDF export, controlled sharing, the admin area and usage/cost
tracking are all in place.

Phase 2 (monetisation) and Phase 3 (physical books) have their schema,
service interfaces and admin configuration in place but are switched off by
feature flag. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Documentation

| Document | What it covers |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System shape, service boundaries, the generation pipeline |
| [Database](docs/DATABASE.md) | Schema, relationships, row level security |
| [User journeys](docs/USER-JOURNEYS.md) | The flows the product is built around |
| [Routes](docs/ROUTES.md) | Every page and endpoint, and who may reach it |
| [Security & privacy](docs/SECURITY-PRIVACY.md) | Children's data, threat model, what is enforced where |
| [Setup](docs/SETUP.md) | Supabase, OpenAI, Vercel, storage, local development |
| [Mobile & app stores](docs/MOBILE.md) | Hosting, the Play Store package, and what iOS actually needs |
| [Roadmap](docs/ROADMAP.md) | Phase 1–4 and what is deliberately deferred |
| [Decisions](docs/DECISIONS.md) | Architectural decisions, assumptions made, **and the calls that need the owner** |
| [Bubble migration](docs/BUBBLE-MIGRATION.md) | Mapping from the retired prototype |

**Start with [`docs/DECISIONS.md`](docs/DECISIONS.md)** — it lists the
business decisions that were assumed in order to make progress and which
need a real answer before launch (pricing, printing partner, children's
privacy posture, paid AI budget).

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local     # fill in Supabase + OpenAI

# 3. Apply the database schema
#    Paste supabase/migrations/*.sql in order into the Supabase SQL editor,
#    or: supabase db push
#    Full instructions: docs/SETUP.md

# 4. Run
npm run dev
```

Then open http://localhost:3000.

### Checks

```bash
npm run typecheck   # TypeScript, strict
npm test            # unit tests
npm run build       # production build
npm run check       # all three

# Database migrations and their SQL assertions, against a scratch Postgres
DATABASE_URL=postgres:///nagilai_test ./scripts/verify-migrations.sh
```

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, Radix primitives |
| Database | PostgreSQL via Supabase, row level security on every table |
| Auth | Supabase Auth — password, magic link, Google |
| Storage | Supabase Storage, private buckets, signed URLs only |
| AI | OpenAI, server-side only, behind provider interfaces |
| PDF | pdf-lib with embedded Latin/Latin-Ext/Cyrillic fonts |
| Jobs | Postgres queue drained by a Vercel cron worker |
| Payments | Stripe abstraction (Phase 2) |
| Printing | `PrintProvider` abstraction, manual fulfilment first (Phase 3) |
| Hosting | Vercel |
| Mobile | Installable PWA; Play Store via a Trusted Web Activity |

## Layout

```
src/
  app/            routes: (marketing) (auth) (app) share api
  components/     ui primitives, site chrome, reader, wizard, library, admin
  features/       per-domain queries, server actions and validation schemas
  services/       ai · images · audio · storage · pdf · payments · printing
                  jobs · credits · usage · safety · analytics · config · supabase
  lib/            errors, results, retry, logging, crypto, utilities
  i18n/           four interface dictionaries, key-parity enforced by types
  config/         environment schema and structural constants
  types/          generated database types + domain types
supabase/
  migrations/     schema, RLS, storage, seeded configuration
  tests/          SQL assertions for the security-critical invariants
docs/             architecture, database, security, setup, decisions
tests/            unit tests
scripts/          migration verification, type generation
```

## Principles

- **API keys never reach the browser.** All model calls are server-side.
- **The database is the security boundary.** Row level security, not a
  route guard, is what stops one family reading another's data.
- **Nothing expensive runs twice.** Illustrations, narration and PDFs are
  content-hashed and reused; credits are spent with idempotency keys.
- **Business configuration lives in the database**, not in code. Themes,
  languages, voices, models, prices and limits are editable by an admin
  without a deployment.
- **Providers sit behind interfaces.** Replacing the image or speech
  provider is a new class and one line in a registry.
