# Nagilai — native app

A React Native app (Expo SDK 57) for iOS and Android, talking to the same
Supabase backend and the same `/api/v1` as the website.

This is a **native app**, not a wrapped website. That distinction is not
philosophical: Apple's guideline 4.2 rejects "repackaged websites", so the
things below are what make the app both better and shippable.

| Native capability | Why it matters | Where |
| --- | --- | --- |
| Background audio | The story keeps playing with the screen locked — what a bedtime story actually needs | `src/narration.ts` |
| Offline books | A downloaded book reads with no connection at all | `src/offline.ts` |
| Keychain-backed sessions | Tokens live in the OS keystore, not in app storage | `src/supabase.ts` |
| Native share sheet | Send a book from the system share UI | `app/story/[id].tsx` |

## Running it

```bash
cd mobile
npm install
cp .env.example .env.local     # point at your API and Supabase project
npx expo start                 # then press i / a, or scan with Expo Go
```

Only `EXPO_PUBLIC_*` variables reach the bundle, so everything in
`.env.local` is public by definition. The Supabase anon key belongs there
and is safe: every table is protected by row level security, exactly as on
the web.

For the native modules (audio, secure store, file system) you need a
development build rather than Expo Go:

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

## Checks

```bash
npm run typecheck                    # TypeScript, strict
npm run export:web                   # proves the whole app bundles
npx expo-doctor                      # dependency and config health
```

`export:web` is the useful one in CI — it runs Metro over every route and
fails on anything that will not resolve on a device.

## Layout

```
app/                     expo-router file-based routes
  _layout.tsx            session + splash + navigation theme
  index.tsx              boot: library or sign-in
  (auth)/sign-in.tsx     sign in and sign up
  (app)/_layout.tsx      tab bar
  (app)/library.tsx      the library, offline-aware
  (app)/create.tsx       three-step story wizard
  (app)/children.tsx     child profiles
  (app)/settings.tsx     account, downloads, data rights
  story/[id].tsx         reader · progress · narration · download · share
  child/new.tsx          add a child
src/
  api.ts                 typed client for /api/v1
  supabase.ts            auth, tokens in the device keystore
  session.tsx            session context + token refresh on foreground
  narration.ts           background audio, page-following
  offline.ts             download a book and rewrite its URLs to file://
  theme.ts               the palette, shared with the website
  components/ui.tsx      the shared visual vocabulary
```

## How it talks to the server

```
   App                     Supabase Auth            Nagilai API
    │                            │                       │
    ├── signInWithPassword ─────▶│                       │
    │◀────────── JWT ────────────┤                       │
    │                            │                       │
    ├── GET /api/v1/... ─────────┼──────────────────────▶│
    │   Authorization: Bearer …  │                       ├─ verifies the token
    │                            │                       ├─ queries as that user
    │◀───────────────────────────┼───────────────────────┤   (row level security)
```

The app never holds a service key and never calls a model provider. Every
AI operation happens server-side, as it does for the website.

## Before submitting

- Set the real API URL in `eas.json` per profile.
- Replace the placeholder `extra.eas.projectId` in `app.json` with the id
  from `eas init`.
- Bump `version` in `app.json`; build numbers auto-increment via
  `appVersionSource: remote`.

Store listing, review guidance and the Families/Kids policies are in
[`../docs/MOBILE.md`](../docs/MOBILE.md).
