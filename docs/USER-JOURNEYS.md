# User journeys

## 1. First story (the journey the product is judged on)

```
Landing
  └─▶ Sign up                     email + password, magic link, or Google
        └─▶ 3 welcome credits granted automatically by a database trigger
  └─▶ Add a child                 name, age, language, interests
        └─▶ entered once; never asked for again
  └─▶ Create a story
        Step 1  Who is it for?    child tile; their language pre-fills
        Step 2  What kind?        language, theme, optional learning goal
        Step 3  Finishing touches art style, length, own request, dedication
        └─▶ Create                redirected in under a second
  └─▶ Generation
        "Writing the story"       ~15–40s
        "Painting the pictures"   N images, concurrent, counted as they land
        └─▶ the parent may leave; the work continues
  └─▶ The book
        cover → pages → the end
        Listen · Download PDF · Share · Make another version
```

**Design intent.** The wizard collects *intent*, never configuration. No
model, no token budget, no image size, no separate narration language.
Everything technical is resolved on the server from the story row and from
admin configuration.

**Failure is not a dead end.** A failed story refunds and offers a retry; a
single failed illustration leaves the book readable and offers to redraw
just that picture.

## 2. Returning parent

```
Sign in ─▶ Library ─▶ open a story ─▶ Listen
```

The library leads with covers, because that is how anyone recognises a book
they have read before. Narration is generated once and cached: pressing Play
on a story narrated last week is instant and costs nothing.

## 3. Listening together

```
Listen ─▶ (first time) narration is queued, ~10–30s
       ─▶ play · pause · restart · scrub · speed
       ─▶ the book turns its own pages as the voice reaches them
```

Page-level timings are apportioned from the audio duration by character
count. Page granularity — not word — is deliberate: it is the granularity a
child actually follows, and it is forgiving of a second's drift.

## 4. A book you can hold

```
Download PDF ─▶ rendered server-side ─▶ signed URL ─▶ saved
```

Cover, title page, dedication, illustrated pages with page numbers, a
closing page with a note for the grown-ups, and the Nagilai mark. Not a
printout of a web page: a real PDF with embedded subsetted fonts. A `print`
variant adds 3 mm bleed and crop marks for a commercial printer.

## 5. Sharing with family

```
Share ─▶ create link ─▶ choose: audio? download? indexable?
      ─▶ optional expiry ─▶ copy ─▶ send
```

Private by default. The link carries 256 bits of entropy, is `noindex`
unless the parent deliberately opts in, and can be revoked — after which the
old URL is dead for everyone.

A visitor sees the book and the child's **display name**. Nothing else about
the child exists in that page's data.

## 6. Another version

```
Make another version
  ├─ a different ending      ├─ a shorter version
  ├─ a new adventure         ├─ a longer version
  ├─ a different lesson      ├─ in another language
  └─ a different art style
```

Always creates a new story. The original is untouched.

## 7. Managing the family

```
Children ─▶ add · edit · remove
Settings ─▶ name · interface language · password
         ─▶ export everything as JSON
         ─▶ delete the account and everything in it
```

Removing a child archives the profile; stories already made keep their
frozen snapshot. Deleting the account is a genuine erase, including every
stored file.

## 8. Running the business (admin)

```
Admin
  ├─ Overview      users · children · stories by language and theme ·
  │                images · narrations · AI spend · revenue · failures
  ├─ Jobs          failed and dead-lettered work, with the real error, requeue
  ├─ Moderation    what was flagged or blocked, and why
  └─ Configuration credits · models · rate limits · plans · flags · safety
```

Every configuration change is written to an audit log with before and after.
No screen in the admin area shows an individual child's profile or the text
of somebody's story — enforced by RLS, not by the absence of a page.

## Phase 2 and 3 journeys (scaffolded, switched off)

```
Pricing ─▶ Choose a plan ─▶ Stripe checkout ─▶ credits granted monthly
Story   ─▶ Order printed book ─▶ size · binding · quantity · address
        ─▶ quote ─▶ checkout ─▶ admin fulfilment queue ─▶ shipped
```

The schema, service interfaces and admin configuration for both exist. What
is missing is deliberately missing: prices, a printing partner, and the legal
review those need. See [DECISIONS.md](DECISIONS.md).
