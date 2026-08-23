# Architecture

## The shape of the system

```
                    ┌─────────────────────────────────────────┐
   Browser  ────────▶  Next.js (Vercel)                       │
                    │                                          │
                    │   Server Components ──▶ features/*       │
                    │   Server Actions    ──▶ (queries +       │
                    │   Route Handlers    ──▶  mutations)      │
                    │                            │             │
                    │                            ▼             │
                    │                       services/*         │
                    │              ┌─────────────┴──────────┐  │
                    │              │  ai · images · audio   │  │
                    │              │  pdf · storage · jobs  │  │
                    │              │  credits · usage       │  │
                    │              │  safety · analytics    │  │
                    │              │  payments · printing   │  │
                    │              └─────────────┬──────────┘  │
                    └────────────────────────────┼─────────────┘
                                                 │
                    ┌────────────────────────────┼─────────────┐
                    │  Supabase                  ▼             │
                    │    PostgreSQL  (RLS on every table)      │
                    │    Auth        (password · link · Google)│
                    │    Storage     (private buckets)         │
                    └──────────────────────────────────────────┘
                                                 │
                    ┌────────────────────────────┼─────────────┐
                    │  OpenAI (server-side only) ▼             │
                    │    text · images · speech · moderation   │
                    └──────────────────────────────────────────┘
```

Nothing in the browser talks to a model provider, and nothing in the browser
holds a key that could. The anon key it does hold is safe precisely because
row level security is enforced in the database.

## Layers

| Layer | Path | Responsibility | May import |
| --- | --- | --- | --- |
| Routes | `src/app` | Rendering, routing, HTTP | features, components, i18n |
| Components | `src/components` | Presentation | ui, lib, i18n, types |
| Features | `src/features` | Per-domain reads, mutations, validation | services, lib, types |
| Services | `src/services` | Providers, jobs, storage, money, safety | lib, config, types |
| Lib | `src/lib` | Errors, retry, logging, crypto, formatting | nothing app-specific |

The rule that keeps this honest: **no component imports a service, and no
service imports a component.** A page asks a feature; a feature asks a
service; a service talks to the outside world.

## Provider abstraction

`src/services/ai/types.ts` defines four interfaces:

```ts
TextProvider          // generateStory(request, options) → GeneratedStory
IllustrationProvider  // generate(request, model)        → image bytes
SpeechProvider        // synthesise(request, model)      → audio bytes
ModerationProvider    // check(text, model, blocked)     → verdict
```

`src/services/providers.ts` is the only module that decides which
implementation backs each. The OpenAI SDK is imported in exactly four files
(`openai-client`, `openai-text`, `openai-moderation`, `openai-images`,
`openai-speech`) and nowhere else, so swapping a provider is a new class and
one line in the registry.

The same pattern applies to `PaymentProvider` (§16) and `PrintProvider`
(§15). Both ship with a working non-provider implementation — payments are
disabled, printing goes to a manual admin queue — so Phase 1 runs with
neither configured.

## The generation pipeline

Story creation is deliberately fast and does no model work:

```
POST createStory
  ├─ rate limit          (cheapest rejection first)
  ├─ moderate the parent's free text
  ├─ check affordability (before anything is written)
  ├─ snapshot the child  (redacted; frozen onto the story)
  ├─ INSERT story + story_version
  ├─ enqueue story_text job
  └─ nudge the worker, return the story id     ← parent is redirected here
```

The worker then runs:

```
story_text
  ├─ charge 1 credit   key: story:{id}:v{version}:text
  ├─ generate structured story (JSON schema, strict)
  ├─ moderate the generated text
  ├─ INSERT pages, UPDATE version + story
  └─ fan out: 1 × story_cover  +  N × story_illustration

story_cover / story_illustration   (concurrent)
  ├─ build prompt = style prefix + character sheet + scene
  ├─ fingerprint → reuse if an identical image already exists
  ├─ moderate the prompt
  ├─ charge 1 credit   key: illustration:{row id}
  ├─ generate → upload to private storage
  └─ recompute the story's status from all its assets

story_narration    (on demand, when a parent presses Listen)
story_pdf          (on demand, rendered inline — it is fast)
```

### Why status is derived, not assigned

Illustration jobs finish out of order. A handler that wrote `ready` when it
happened to be last would race with its siblings. Instead
`recomputeStatus()` reads the current state of every asset and derives the
answer, so concurrent callers converge. It is also what lets one failed
picture leave the book readable.

### Why a Postgres queue

- It is transactional with the rows the jobs are about.
- `FOR UPDATE SKIP LOCKED` gives correct multi-worker semantics.
- It needs no infrastructure on Vercel beyond a cron entry.

Three things drain it: the cron tick every minute, an inline nudge right
after enqueue (so the first page appears in seconds), and an operator
retrying a job from the admin area. All three call the same `runWorker()`.

A stalled-job reaper returns work whose serverless invocation died, with
exponential backoff, and dead-letters anything that exhausts its attempts.

## Not paying twice

§17 asks for safeguards against accidental repeated generation. Four
mechanisms, each enforced by a database constraint rather than by
convention:

| Asset | Key | Effect |
| --- | --- | --- |
| Illustration | `stableHash(prompt + model + size + quality + style)` | Identical request is a cache hit |
| Narration | `sha256(text + voice + speed)`, unique per version | Pressing Play never re-synthesises |
| PDF | Hash over version content + illustrations + variant | Second download re-serves the file |
| Credits | `idempotency_key` unique on the ledger | A retried job charges once |
| Jobs | `idempotency_key` unique on the queue | A double click enqueues once |

## Cost tracking

Every provider call writes a `usage_events` row: tokens in and out, cached
tokens, images, audio characters, duration, and an estimated cost in
**integer micro-USD** computed from the rate card in `app_settings`. The
rates in force are snapshotted onto the row, so editing the rate card does
not rewrite last month's reported margin.

## Configuration over deployment

Themes, languages, educational objectives, illustration styles, voices,
model ids, credit costs, rate limits, plan entitlements, safety categories
and feature flags all live in tables. The admin area edits them; a one-minute
cache means a change takes effect without a deploy (§18).

Compile-time constants are limited to the structural: bucket names, signed
URL lifetimes, hard upper bounds that exist for safety rather than for
business reasons.

## Internationalisation

Two separate concepts (§13):

- **Interface language** — a cookie plus a column on `profiles`. Four
  dictionaries typed against the English one, so a missing key is a compile
  error and a dropped `{placeholder}` is a test failure.
- **Story language** — a column on `stories`. Every downstream service —
  generation, narration, PDF furniture — reads it from the story row.

Per the specification's closing note, **no language code is ever passed in a
URL or a client request**. `requestNarrationAction` takes a story id and a
voice; the language comes from the story.

## Rendering

Marketing pages are cached and revalidated hourly. Everything behind
authentication is `force-dynamic` — a library page is per-user by
definition, and caching it would be a correctness bug before it was a
performance win. Private assets are never cached publicly: they are served
through short-lived signed URLs.
