# Migrating from the Bubble prototype

§36 of the specification: do **not** copy Bubble's technical architecture,
but preserve the product concepts, and document a mapping so existing
records can be migrated later.

## What was preserved

The concepts, not the shapes: dynamically generated stories, a story
language, child information, a generated story, a story theme, narration,
story display, and a story library. Every one exists in the new domain
model — as normalised tables rather than as fields on one thing.

## What was deliberately not carried over

| Bubble pattern | Why not |
| --- | --- |
| One flat "Story" thing holding everything | §23: no giant JSON blob. Text, pages, images, audio and PDFs are separate tables with their own lifecycles. |
| `generated_story` as a single long string | §5: structured output. A story has pages; a page has text, a scene summary and an illustration prompt. |
| Google TTS | §10: explicitly replaced with the current OpenAI speech API. |
| Language passed around as a parameter | The closing architectural note: the story owns its language. |
| Client-side API calls | §5, §24: every model call is server-side. |
| Workflow-based generation | §27: a durable job queue with retry, backoff and dead-lettering. |
| Privacy by obscurity | §21, §24: row level security, private buckets, redacted share reads. |

## Field mapping

### User → `profiles`

| Bubble | Nagilai | Note |
| --- | --- | --- |
| `email` | `profiles.email` | Identity moves to `auth.users`; the profile mirrors it |
| `name` | `profiles.display_name` | |
| `language` | `profiles.ui_locale` | Interface language only |
| (none) | `profiles.credit_balance` | New |
| (none) | `profiles.role` | New |

### Child → `children`

| Bubble | Nagilai |
| --- | --- |
| `child_name` | `children.name` |
| `child_age` | `children.age_years` |
| `child_gender` | `children.gender` |
| `interests` (text) | `children.interests` (`text[]`) — split on commas |
| `favourite_animal` | `children.favourite_animals` (`text[]`) |
| `notes` | `children.parent_notes` |
| (none) | `children.preferred_language` — default from the user's language |

### Story → `stories` + `story_versions` + `story_pages`

| Bubble | Nagilai | Note |
| --- | --- | --- |
| `unique id` | `stories.legacy_bubble_id` | Unique-indexed, so an import is re-runnable |
| `title` | `stories.title` and `story_versions.title` | |
| `story_language` | `stories.language_code` | Normalise `az` → `az-AZ` etc. |
| `story_theme` | `stories.theme_slug` | Map to a `themes` slug; unknown → `custom` |
| `generated_story` | **split into `story_pages`** | See below |
| `created_date` | `stories.created_at` | |
| `image_url` | `story_illustrations.storage_path` | Re-host; do not hotlink Bubble |
| `audio_url` | `narrations.storage_path` | Re-synthesise, see below |
| `child` | `stories.child_id` + `stories.child_snapshot` | Snapshot rebuilt from the child record |

## Migration procedure

Not implemented — the mapping exists so it can be, once you decide whether
the old records are worth carrying.

1. **Export** the Bubble Users, Children and Stories tables as CSV or via
   the Data API.
2. **Users.** Do not import passwords. Invite each address through Supabase
   Auth so the account is created by the normal trigger, granting welcome
   credits and a profile.
3. **Children.** Insert with `owner_id` from the invited user. Split
   comma-separated interest strings into arrays.
4. **Stories.** For each record:
   - insert a `story` with `legacy_bubble_id`, `status = 'ready'`;
   - insert one `story_version` (`version_number = 1`);
   - split `generated_story` into pages — on `\n\n` if it is paragraphed, or
     into 40–110 word chunks if it is one block;
   - rebuild `child_snapshot` from the child record using the same shape
     `redactChild()` produces;
   - point `stories.current_version_id` at the version.
5. **Images.** Download each Bubble URL, upload into the `illustrations`
   bucket under `{owner}/{story}/{version}/…`, insert a
   `story_illustration` row with `status = 'ready'`. Do not keep pointing at
   Bubble: those URLs will disappear.
6. **Audio.** Do not migrate. The old files are Google TTS; re-synthesise on
   demand the first time a parent presses Listen. Imported stories therefore
   start with no narration, which is correct.
7. **Verify.** For a sample of imported stories, open the reader, download
   the PDF and confirm the pages read correctly.

### Idempotency

`stories.legacy_bubble_id` is unique. Insert with
`on conflict (legacy_bubble_id) do nothing`, so a failed import can simply
be re-run.

### What imported stories will not have

- A character bible, so **regenerating illustrations will not match** the
  originals. Migrated images are the originals; new ones would differ.
- Page-level illustration prompts.
- Structured educational takeaways or discussion questions.
- Usage and cost history.

These are acceptable: the migrated books stay readable, printable and
shareable, which is what a family cares about.

## Recommendation

Migrate only if there is a real body of paying or engaged users on the
prototype. Otherwise offer existing users a fresh start with their welcome
credits — the new stories will be materially better, and a clean domain
model is worth more than a handful of imported records.
