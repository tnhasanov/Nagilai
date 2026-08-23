# Publishing to the app stores

**The native app in [`../mobile`](../mobile) is the product on phones.** It
is Expo (React Native) against the same Supabase backend and the same
`/api/v1` as the website — one identity system, one database, one set of
row level security policies, and no business logic duplicated.

The website stays a first-class web app, and it remains installable from a
browser. But the installable website is a *web* capability, not the Android
strategy: a Trusted Web Activity is documented at the end of this file as an
optional extra, not as the route to Google Play.

**Sequence:** deploy the web app → build the native app on EAS → internal
testing on both stores → production.

---

## Where to host

**Vercel.** The repository is already shaped for it:

- `vercel.json` registers the every-minute cron that drains the generation
  queue. On Netlify or Cloudflare you would have to replace that with an
  external scheduler.
- Next 16 server actions, streaming and ISR work natively.
- The PDF route needs the Node runtime (pdf-lib + `fs` for the fonts).
  Cloudflare Workers would need that route rewritten.

Supabase hosts the database, auth and storage. Put the Vercel functions in
the region nearest the Supabase project — every request makes several
database round trips and cross-continent latency is felt in the reader.

Full walkthrough: [SETUP.md](SETUP.md).

---

## iOS and Android — the native app

This is the main path for both stores.

A PWA cannot be published to the App Store at all — iOS users can install
Nagilai from Safari (*Share → Add to Home Screen*), but that is not a store
listing. On Android a wrapper *is* publishable, and it is still the weaker
product: background audio, offline books and keychain-held sessions are
things a browser tab cannot do well, and they are exactly what a bedtime
story app needs.

The native app lives in [`../mobile`](../mobile) and owns the package name
`com.nagilai.app` on both platforms.

### Why it is not a wrapper

Apple's **guideline 4.2 (Minimum Functionality)** rejects apps that are
"simply a repackaged website". A Capacitor shell around this site would be
rejected. What the app does that a web view cannot:

| Capability | Why it clears 4.2 | Status |
| --- | --- | --- |
| Background audio | The story keeps playing with the screen locked, with system audio focus | built |
| Lock-screen controls | Play, pause and scrub from the lock screen, with the cover as artwork | built |
| Offline books | Assets copied to the device; a book reads with no connection | built |
| Keychain sessions | Tokens in the OS keystore rather than app storage | built |
| Native share sheet | System share UI for a book link | built |
| Push notifications | "Your story is ready" via APNs/FCM | built — needs credentials |
| Sign in with Apple | Required once you offer Google sign-in | built — needs credentials |

The first two are also simply a better product. A bedtime story that plays
with the screen off, from a book already on the phone, is the version
parents actually want.

### Building it

```bash
cd mobile
npm install
cp .env.example .env.local   # says which credentials each feature needs
npx expo start
```

Native modules need a development build rather than Expo Go:

```bash
npm i -g eas-cli
eas login
eas init                 # writes the real projectId into app.json
eas build --profile development --platform ios
eas build --profile development --platform android
```

**You do not need a Mac.** EAS builds iOS in the cloud. You do need an
Apple Developer account to sign the build.

### Shipping it

```bash
# Store builds
eas build --profile production --platform android    # → .aab
eas build --profile production --platform ios        # → .ipa

# Submit
eas submit --platform android
eas submit --platform ios
```

`eas.json` already carries the three profiles and the per-profile API URL.
Set the production URL before the first store build.

### iOS specifics

- `UIBackgroundModes: ["audio"]` is declared in `app.json`. Apple checks
  that an app claiming it genuinely plays audio in the background — this
  one does, and that is the point.
- Privacy nutrition labels: declare email and the child details a parent
  enters. Purpose is app functionality. Not linked to advertising, not
  used for tracking.
- **Sign in with Apple becomes mandatory** the moment you ship Google
  sign-in. Add it before submitting, not after a rejection.
- The **Kids Category** is optional and stricter: no third-party
  analytics, no external links without a parental gate, no behavioural
  advertising. Nagilai already meets most of it. Worth it for discovery
  once the app is stable — review is slower and rejections cost more.

### Android specifics

The native app is the Android product, and it claims `com.nagilai.app`.
Nothing else may use that package name.

If you also package the website as a TWA, give it its own package name
(`com.nagilai.twa`) so the two can coexist. Nothing has been uploaded to
Play yet, so this costs nothing to get right now and cannot be undone
later: a package name is bound permanently on first upload and cannot be
reused even after an app is unpublished.

### What is still missing

| Item | Effort |
| --- | --- |
| Remix, rename and delete in the app | small — the endpoints exist |
| Story PDF export to the share sheet | small — the endpoint exists |
| Per-page illustration retry in the app | small — the endpoint exists |
| Quiet-hours picker | small — the API accepts the values, the app only displays them |

---

## Credentials the app needs, and exactly where each one comes from

Everything below is **built and inert until its credential exists**. None
of them has a placeholder in this repository: a fake client id produces a
rejected token rather than a clearer error, so the app hides the control
instead.

### Expo / EAS

| What | Where | Goes in |
| --- | --- | --- |
| Project id | `eas init` inside `mobile/` | `mobile/app.json` → `extra.eas.projectId` |

Until this is real, `expoProjectId()` returns null, the app never asks for
notification permission, and no push token is ever requested. The
placeholder `00000000-…` committed here is recognised and treated as
absent, deliberately.

**Verify:** `eas build --profile preview --platform android` starts.

### Push notifications

| What | Where | Goes in |
| --- | --- | --- |
| APNs key (iOS) | developer.apple.com → Keys → new key with "Apple Push Notifications service" | `eas credentials` → iOS → Push Key |
| FCM service account (Android) | Firebase console → Project settings → Service accounts → Generate key | `eas credentials` → Android → FCM V1 |
| Server switch | — | `EXPO_PUSH_ENABLED=true` in the web app's environment |
| Expo access token *(optional)* | Expo dashboard → Account settings → Access tokens | `EXPO_ACCESS_TOKEN` |

Without `EXPO_PUSH_ENABLED`, the server runs the **console provider**:
every notification is composed, deduplicated, checked against the parent's
preferences and quiet hours, and then written to the log with
`reason: provider_not_live` instead of being sent. That is how the whole
path — registration, preferences, deep link, deduplication across twelve
illustration jobs — is testable today with no Apple or Google account.

There is also a feature flag, `push_notifications_enabled` in
`app_settings`, which defaults to **false**. The app asks the server
whether push is available before prompting, because iOS grants exactly one
permission prompt per install and spending it on a feature that cannot yet
deliver wastes it permanently.

**Verify:** with the console provider, generate a story and watch the
server log for `push (not sent: no provider configured)` carrying the
right title and `storyId`.

### Sign in with Google

Three OAuth **client ids** (public, they ship in the binary) plus one
client **secret** (private, Supabase only). All from Google Cloud Console
→ APIs & Services → Credentials, in one project:

| Client type | Configured with | Goes in |
| --- | --- | --- |
| Web application | Redirect URI `https://<project>.supabase.co/auth/v1/callback` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, **and** its id + secret into Supabase → Authentication → Providers → Google |
| iOS | Bundle ID `com.nagilai.app` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| Android | Package `com.nagilai.app` + SHA-1 from `eas credentials` | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` |

The web client id is required on **every** platform: Supabase validates
the id token against it, so an iOS-only configuration produces a token
Supabase then refuses.

**Verify:** the Google button appears on the sign-in screen. It is hidden
whenever this platform's ids are missing.

### Sign in with Apple

No environment variable. The entitlement is declared in `app.json`
(`ios.usesAppleSignIn`) and the app asks the OS at runtime whether the
capability is actually available, so a build without it hides the button
rather than throwing when it is pressed.

| What | Where |
| --- | --- |
| Apple Developer Program | developer.apple.com — $99/year |
| "Sign in with Apple" capability | developer.apple.com → Identifiers → `com.nagilai.app` |
| Services ID, key, team id | developer.apple.com, then Supabase → Authentication → Providers → Apple |

**These two ship together.** App Store guideline 4.8 requires an
equivalent private sign-in option wherever a third-party social login is
offered, so shipping Google on iOS without Apple is a rejection.
`socialSignInReady()` in `src/auth-providers.ts` reports on the pair for
exactly that reason.

### App Store Connect

| What | Where | Goes in |
| --- | --- | --- |
| App id (`ascAppId`) | App Store Connect, after creating the app record | `mobile/eas.json` → `submit.production.ios.ascAppId` |

---

## Android — Trusted Web Activity (optional)

**This is not the Android product.** The native app above is. This section
is kept because the website is a fully capable PWA and packaging it stays
available — for example as a quick internal-testing build, or if you ever
want a lightweight second listing.

Two rules if you use it:

1. **Use a different package name.** Google Play binds a package name to an
   app record permanently on first upload. The native app claims
   `com.nagilai.app`; a TWA must use something else, such as
   `com.nagilai.twa`. Publishing a TWA under `com.nagilai.app` would lock
   the native app out of its own identity forever.
2. **Do not let it become the roadmap.** Effort spent on the wrapper is
   effort not spent on the app parents will actually use.

A TWA is real Chrome, running your site full-screen with no address bar,
wrapped in an Android package. There is no second codebase: a deploy to
Vercel updates the installed app.

Everything the packager needs is already in the repository:

| Requirement | Where |
| --- | --- |
| Web app manifest | `src/app/manifest.ts` → `/manifest.webmanifest` |
| 512px icon, `any` **and** `maskable` | `public/icons/` |
| Service worker | `public/sw.js` |
| Offline screen | `src/app/offline/page.tsx` |
| Digital Asset Links | `src/app/.well-known/assetlinks.json/route.ts` |
| HTTPS | Vercel |

### 1. Deploy, then verify the manifest

```bash
curl https://your-domain/manifest.webmanifest
curl https://your-domain/.well-known/assetlinks.json     # → [] until step 4
```

Then run Lighthouse in Chrome DevTools (*Lighthouse → Progressive Web
App*). Fix anything it flags before packaging; the Play Console will not
tell you why a TWA shows an address bar, but Lighthouse will.

### 2. Register the app identity

Pick a package name you will never change — it is the app's permanent
identity on Google Play. It must **not** be the native app's:

```
com.nagilai.twa
```

Reverse-DNS of a domain you control. It cannot be changed after the first
upload, and it cannot be reused even if you unpublish.

### 3. Generate the package

**Easiest — PWABuilder** (a web form, no toolchain):

1. Open <https://www.pwabuilder.com> and enter your URL.
2. *Package for stores → Android → Options*:
   - Package ID: `com.nagilai.twa`
   - App name: `Nagilai`
   - Short name: `Nagilai`
   - Display mode: **Standalone**
   - Signing key: **Create new** — then **download and keep the keystore
     and its passwords**. Losing them means you can never update the app.
3. Download the zip. It contains `app-release-bundle.aab` (what you
   upload) and `assetlinks.json` (what step 4 needs).

**For CI — Bubblewrap** (Google's official CLI, what PWABuilder runs):

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://your-domain/manifest.webmanifest
bubblewrap build          # → app-release-bundle.aab
bubblewrap fingerprint list
```

### 4. Wire up Digital Asset Links

This is the step people miss, and the symptom is an address bar across the
top of your app.

Chrome verifies that the site and the package belong to the same publisher
by fetching `/.well-known/assetlinks.json`. Two fingerprints matter:

- your **upload key** (from step 3), and
- **Google's Play signing key** — Play re-signs your app, so this only
  exists after the first upload. Find it under
  *Play Console → Test and release → Setup → App signing*.

Set them in Vercel and redeploy:

```
ANDROID_PACKAGE_NAME=com.nagilai.twa
ANDROID_CERT_FINGERPRINTS=AA:BB:CC:...:FF,11:22:33:...:99
```

Both fingerprints, comma-separated. The route validates the format and
serves a well-formed empty array if a value is malformed, so a typo shows
up as "no statements" rather than as broken JSON.

Verify:

```bash
curl https://your-domain/.well-known/assetlinks.json
```

Then Google's own checker:
<https://developers.google.com/digital-asset-links/tools/generator>

The response is cached for five minutes, so adding the Play fingerprint
takes effect the same day.

### 5. Play Console

1. Create the app (Google Play Console, one-off **$25** registration).
2. Upload the `.aab` to **Internal testing** first. Install it on a real
   device and confirm there is **no address bar** — if there is, step 4 is
   wrong.
3. Complete the listing: short and full description, a 512×512 icon, a
   1024×500 feature graphic, and at least two phone screenshots.
4. Fill in the **Data safety** form. What Nagilai actually does:
   - Collects: email, name, and the child details a parent enters.
   - Purpose: app functionality only.
   - **Not** shared with third parties for advertising.
   - **Not** used to train models.
   - Encrypted in transit; users can request deletion in-app.
   - Deletion URL: `https://your-domain/settings`
5. Complete the **content rating** questionnaire (IARC).
6. Promote from internal testing → closed → production.

### Families policy — read this before you submit

Nagilai makes content **for** children, which puts it in scope of Google
Play's Families policy. The two things that matter:

- **Target audience.** If you declare children as a target audience you
  take on the full Families programme: an approved ads SDK (or none),
  stricter data rules, and a Families-specific review. Nagilai has no ads
  and no third-party SDKs, which makes this straightforward — but read
  <https://support.google.com/googleplay/android-developer/answer/9893335>
  before answering the questionnaire.
- **Account holder is an adult.** Only parents sign in; children never have
  accounts. Say so plainly in the listing and the privacy policy.

Have `docs/SECURITY-PRIVACY.md` open while filling in the Data safety
form — it lists exactly what is collected and what is never done.

---

## What is already handled

| Concern | Status |
| --- | --- |
| Installable manifest with a stable `id` | done |
| `any` + `maskable` icons at 192 and 512 | done |
| Service worker, offline screen, cached build assets | done |
| Offline reading of already-opened book media | done |
| Private pages never cached; media wiped on sign-out | done |
| iOS home-screen install (title, icon, full screen) | done |
| Digital Asset Links driven by configuration | done |
| Launcher shortcuts (New story, My library) | done |
| Safe-area padding for the reader's fixed controls | done |
| Native app interface in az/en/ru/tr | done — device language, then profile, then an in-app picker |
| Full child profile on the phone, matching the website | done |
| Push notifications end to end except the last hop | done — console provider until credentials exist |
| Lock-screen playback controls | done |
| Offline books verified against the filesystem, resumable, cleared on sign-out | done |
| Apple and Google sign-in | done — hidden until their client ids exist |
| Play Store `.aab` | needs your keystore |
| Native app for both stores | built in `mobile/` — needs an Apple account and an EAS project id |

## Costs

| Item | Cost |
| --- | --- |
| Google Play registration | $25 once |
| Apple Developer Program | $99 / year |
| Vercel | free to start; Pro $20/month when you need it |
| Supabase | free to start; Pro $25/month |
| OpenAI | usage-based — see [DECISIONS.md](DECISIONS.md) §1.1 |
