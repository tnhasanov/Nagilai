# Publishing to the app stores

Nagilai is a web app. This document covers the two ways to get it onto a
phone, in the order they are worth doing.

**Recommended sequence:** ship the web app → publish the Android package
(a few hours) → decide on iOS once you have real usage.

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

## Android — Trusted Web Activity

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
identity on Google Play:

```
com.nagilai.app
```

Reverse-DNS of a domain you control. It cannot be changed after the first
upload, and it cannot be reused even if you unpublish.

### 3. Generate the package

**Easiest — PWABuilder** (a web form, no toolchain):

1. Open <https://www.pwabuilder.com> and enter your URL.
2. *Package for stores → Android → Options*:
   - Package ID: `com.nagilai.app`
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
ANDROID_PACKAGE_NAME=com.nagilai.app
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

## iOS — the honest version

**A PWA cannot be published to the App Store.** iOS users can install
Nagilai from Safari (*Share → Add to Home Screen*, which the layout is set
up for), but that is not a store listing.

For the App Store you need a native shell, and you need to clear
**guideline 4.2 (Minimum Functionality)** — Apple rejects apps that are
"simply a repackaged website". A TWA-equivalent will be rejected.

### What clears 4.2

Genuinely native capability the web cannot provide:

| Capability | Why it satisfies 4.2 | Effort |
| --- | --- | --- |
| **Offline library** — download a book to the device | Real local storage and file management | medium |
| **Native audio** — lock-screen controls, background playback, AirPlay | `MPNowPlayingInfoCenter`; a web audio element cannot do this | medium |
| **Push notifications** — "your story is ready" | Real APNs, not web push | small |
| **Share sheet** — send a book as a PDF | System integration | small |
| **Sign in with Apple** | Required anyway once you offer Google sign-in | small |

The first two are also genuinely better for the product: a bedtime story
that plays with the screen off, from a book already on the device, is the
version parents actually want.

### How to build it

**Expo (React Native)** against the existing Supabase backend. Not
Capacitor: a Capacitor wrapper around this site is exactly the "repackaged
website" 4.2 exists to reject.

The backend is already ready for it — Supabase Auth issues JWTs that a
native client can use directly, and RLS enforces the same rules whatever
the client is. What is missing is a REST surface: today most mutations are
Next.js server actions, which only a browser can call. A mobile client
needs endpoints for auth, children, story creation, generation status and
asset URLs.

Rough shape of the work:

1. Add the REST API layer (~1 week).
2. Expo app: auth, child profiles, wizard, reader, offline library, native
   audio (~4–6 weeks).
3. Apple Developer Program (**$99/year**), App Store listing, privacy
   nutrition labels, **App Store Kids Category** review if you opt into it.

### Kids Category

Optional, and stricter: no third-party analytics, no external links
without a parental gate, no behavioural advertising. Nagilai already meets
most of it. Worth it for discovery, but only once the app is stable —
review is slower and rejections are more expensive.

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
| Play Store `.aab` | needs your package name and keystore |
| App Store build | needs the native shell above |

## Costs

| Item | Cost |
| --- | --- |
| Google Play registration | $25 once |
| Apple Developer Program | $99 / year |
| Vercel | free to start; Pro $20/month when you need it |
| Supabase | free to start; Pro $25/month |
| OpenAI | usage-based — see [DECISIONS.md](DECISIONS.md) §1.1 |
