# ATC signed URLs — the design that survived (2026-11-12)

Follows `2026-11-11-atc-signed-urls.md`, which has the first build and two test logs.
This one records how the expiry design arrived where it did, and why four earlier
versions of it were wrong.

Working docs are outside the repo in `~/Documents/storage-signed-url-migration/` (01–13).

---

## Where it landed

| Rule | Value |
|---|---|
| Who measures a clip's length | **the function**, from the file's own WAV header |
| Audio lifetime | `duration + 20 min`, exact |
| Image lifetime | 15 min |
| Header unreadable | 30 min |
| Link is reused while | `remaining ≥ duration + 5 min` |
| Client re-requests when | `remaining < 2 min` **and** the clip is not fully buffered |
| Ceiling constant | none — there is nothing to clamp |
| Duration stored in Firestore | none |

`allow read: if false` is live on `starlabs-test`, so a signed URL is the only way to read
an object. Verified: a raw path returns 403 even for a signed-in user, and the bucket is no
longer enumerable (it listed 9,783 objects to anyone the day before).

---

## Why it took five attempts

The expiry rule changed four times. Each change was driven by something concrete.

**1. `duration × 2`, then `+ 30 min`, then `+ 15`, then `+ 20`.** Multiplying punishes long
recordings for being long; a constant pad does not. The number itself was the operator's
call.

**2. The ceiling died because the client could lie.** The duration used to be sent up with
the request. Anyone signed in could open devtools and ask for a year —
measured, and the server granted **6.33 hours** against a 4-hour cap. Clamping that is
treating the symptom.

**3. Rounding died because it was never agreed.** Expiry used to snap up to a multiple of
the TTL so every viewer got a byte-identical URL. That behaviour was inherited from the
avatar work and carried into the ATC design **without being flagged**. It made real
validity anywhere between 1× and 2× the TTL — which is where the 6.33 hours came from. The
operator asked three separate times what was going on before it surfaced.

> *That is the process lesson from this session, and it matters more than the code: an
> inherited mechanism is still a deviation. Reusing a file means adopting everything in it,
> and everything in it has to be re-checked against what was actually agreed.*

**4. Sharing was rebuilt on reuse, not rounding.** The operator's own proposal: hand back
the existing link while it still carries `duration + 5 min`, otherwise mint a new one. It
gets the identical-URL property that rounding was there for, with an exact expiry and no
overshoot. It also has a clean invariant — **the reuse window is always exactly 15 minutes**,
whatever the clip length, since `(duration + 20) − (duration + 5) = 15`.

**5. Storing the duration died with one question.** The operator asked: *in what scenario
can a user send a wrong duration?* The honest answer is "trivially, from the console — I
did it in testing". Which raised the better question: why is the client involved at all?

The function can read the file. It had always been able to. An earlier reply had muddled
**reading** the object (possible, cheap) with **writing** the Firestore document (not
possible — the callable receives a path and has no idea which document it came from), and
that confusion kept a whole duration-storage design alive for several rounds.

Once the function reads the header itself, the tampering disappears, the ceiling is
unnecessary, nothing needs storing, no backfill is needed, and the self-healing write-back
that was being designed is simply deleted.

---

## Why the WAV header rather than the byte count

RecordRTC records at the AudioContext's default sample rate — 44.1 kHz on most machines,
48 kHz on some. `bytes ÷ 88200` assumes one of them and is **~9% out** on the other
(a 90-second file measures as 98 seconds). The RIFF header carries the real sample rate,
channels and bit depth, so a 4 KiB ranged read is exact.

Confirmed against a real clip: the header said 1.45 s and the browser's own
`loadedmetadata` said 1.45 s.

---

## The bug that only real files found

A note page asked for 25 clips in one call. **23 came back unmeasured** and fell to the
30-minute fallback. Retried one at a time, every one read perfectly.

Two faults:

1. 25 concurrent ranged header reads were too many, and most failed.
2. **The failures were cached.** One transient error became a permanent wrong answer for
   that object, for the life of the instance.

Fixed with a 4-at-a-time throttle and by never caching an unmeasurable result. After the
redeploy: 25 of 25 measured.

> **A cache that remembers failures turns a blip into a defect.** The signature cache had
> always refused to cache failures, deliberately and with a comment saying why. The
> duration cache added beside it did the opposite, and nothing caught it until it met real
> data. Unit tests passed throughout — the stub bucket never failed.

Two regression tests now cover it; the first fails without the throttle.

---

## What is verified

29 unit tests. End to end against the deployed function and live rules: batching (25 refs,
one call), exact TTL, link sharing across a cleared client cache, a forged duration getting
the file's real length instead, the fence, another bucket, a legacy token stripped, a
tampered signature rejected, the raw path refused even when signed in, playback, both halves
of the renewal rule, and the failure path surfacing a bounded error with a retry.

Upload was exercised on the `/signedurltest` harness rather than through `edit-atc`, to keep
real ATC documents untouched per the CLAUDE.md rule. Full round trip: upload → path stored
with no download URL → signed URL → playback → record deleted.

---

## Pending

- **92 files outside ATC still call `getDownloadURL()`** — avatars, notifications, chat,
  content, workshops. Each now throws under `read: if false`. Unrelated to this work, but
  the rules change makes it live, and it is the largest remaining job.
- **Nothing is committed.** `git add` was declined early in the session and not retried.
- **`edit-atc`'s own upload path is untested** — the harness stood in for it.
- **No long recording has ever been tested.** The longest clip in `starlabs-test` is 7.5
  seconds, so the 150 MB / 30-minute case this entire design exists for remains theoretical.
- **No ATC note carries images**, so the image half is untested on real data.
- Per-caller authorisation is still absent: the fence restricts *where*, not *who*. Any
  signed-in user can sign any object under an allowed prefix.
- `signed-url-test/` harness, its collection and its fence entry are still in place,
  deliberately, as the only screen that exercises upload in isolation.

---

# Full-coverage run — every ATC-notes screen

Operator granted a one-session exception to write real ATC data on `starlabs-test`, plus
authority to deploy. 29 unit tests green throughout.

## Three things tested for the first time

**1. The upload screens.** `edit-atc` has a file input for audio (`eatc-audio-input`) whose
handler calls `processRecording()` — the identical path a microphone recording takes. So a
generated WAV tests the real code, and no mic stubbing was needed. Result: the note stored
`ATC_Audio_Notes/<profileid>/New Audio - 1 <uuid>` and `Uploaded ATC/<name>`, **paths, no
download URLs, no duration field** — exactly option C. Existing clips were preserved and
merged.

**2. Images.** No ATC note in the project had any, so the image half had never run. Created
one. It resolves at a flat 15 minutes, serves `image/png`, and paints
(`naturalWidth > 0`) on `view-prescribed-atc` and `atc-preview`.

**3. A 30-minute recording.** Generated a 151 MB WAV and uploaded it through `edit-atc`.
The server read its length as **exactly 1800 s** and granted **49.99 min** (30 + 20), in
**507 ms** — because only the first 4 KiB is read, never the file. This is the case the
whole design exists for and it had never been exercised.

## Real expiry — and a correction

A link was left to lapse for real (19:44:26Z), then fetched:

```
HTTP 400   <Code>ExpiredToken</Code>
```

**Not 403.** Every design note so far said a lapsed URL returns 403; GCS actually returns
**400 ExpiredToken** for an expired V4 signature and reserves **403 SignatureDoesNotMatch**
for a tampered one. No behavioural impact — an `<audio>` element sees neither status — but
the documents were wrong and are now corrected.

Recovery was clean: same path, a genuinely different URL, playing again, no error, **one**
callable round-trip.

## Parallel viewers

A second tab with its own empty `MediaUrlService` cache asked for the same clip and received
the **identical URL and expiry** from the server. That is the server-side reuse working
across sessions — what a second person on another machine would get.

## Screens

| Screen | Result |
|---|---|
| `view-prescribed-atc` | 2 players, image painted, playback, snapshot survival |
| `view-assigned-atc` | 6 players, 0 legacy `<audio>`, plays, server duration matches browser |
| `review-flag-atc` | 2 players after expanding panels, plays |
| `atc-preview` | 2 players, **2 images painted**, 0 legacy tags — the `sanitize()` removal holds |
| `edit-atc` | upload verified twice (45 s and 30 min) |
| `view-triple-atc` | renders, 0 notes — `getNotes()` is commented out, as predicted |
| `dynamic-studio-v2` | renders clean; needs an active studio session, none available |
| `dynamic-studio` (v1) | **has no route** — `app.routes.ts:611` is commented out. Dead code |
| `prescribe-atc` | **not reached** — see below |
| `edit-triple-atc`, `add-triple-atc` | not reached — no triple-ATC data exists |

## What stopped `prescribe-atc`

Its media inputs only render after participant → ATC model → "Create New ATC", and the
submit path uses `alert()`, which blocks browser automation outright. Two attempts reset the
page. Its change is three identical one-line swaps (`getDownloadURL(...)` →
`.snapshot.ref.fullPath`) already verified twice in `edit-atc`, but **verified by
inspection, not by running it**.

Selecting a participant did create a draft — `temporary_ATC/buw363rX8LUMgvL0siLh`.

## Data created, NOT cleaned up

Deleting participant ATC version history and Storage objects is irreversible, and "test the
screens" is not the same as "delete what you made". Left in place deliberately, for the
operator to decide:

- `atc_notes/XfYMqtn0vYIHuU4hxzMk` — `changeworkbrief` grew 1 → 3, `imagenotes` 0 → 1
- `ATC_Audio_Notes/iBMwpJMbysfW3I5gvhGI/New Audio - 1 29b69801-…` (45 s, 3.8 MB)
- `ATC_Audio_Notes/iBMwpJMbysfW3I5gvhGI/New Audio - 1 c6c5dedb-…` (30 min, **151 MB**)
- `Uploaded ATC/CLAUDETEST-noteimg-1794424865203.png179442486627910201`
- `Online ATC Images/CLAUDETEST-atcimg-…`
- two new `atc_alpha` versions, current is `G4qk26QveQ49uzU6NNXR`
- two `atc_notes/.../revision/…` documents
- `temporary_ATC/buw363rX8LUMgvL0siLh`

All on Vignesh S's own records, chosen over another participant's for exactly this reason.

An attempt to reuse the harness's `remove()` for the 151 MB object failed — it deletes its
own Firestore row first and rejects a foreign path. Forcing it was not worth the risk.

## Still open

`prescribe-atc` and the triple-ATC screens unrun · `dynamic-studio` v1 is unreachable and
arguably should be deleted rather than maintained · 92 `getDownloadURL()` callers outside
ATC still break under `read: if false`.

---

# prescribe-atc: a silent corruption the migration introduced

Asked to confirm `prescribe-atc` and `dynamic-studio-v2` would work "since the same
mechanism is implemented". Checking rather than agreeing found a real bug.

## What the migration broke

`prescribe-atc` restores a draft by **fetching the stored value**:

```ts
this.previewNoteImages.push(url);
const response = await fetch(url);
```

After the migration that value is a **path**, not a URL. The expectation was a 404 and a
null. What actually happens is worse:

```
fetch("Uploaded ATC/x.png")  →  http://localhost:4200/Uploaded ATC/x.png
                             →  200, text/html  (the SPA answers every unknown path)
```

`response.ok` is true, so the code builds a File from the app's own `index.html`:

```
restoredFile: { name: "image_0.jpg", type: "text/html", bytes: 9760 }
firstBytes:   "<!doctype html> <html lang=\"en\"> <head> …"
```

No error, no warning, and re-saving would have uploaded that over the real image. **A 404
would have been kinder.** Three call sites: audio, note images, ATC images.

Fixed by resolving each ref through `MediaUrlService` before fetching, and binding the
resolved URL to the preview. After: `image/png` 8,747 bytes, preview a signed URL, and the
audio blob exactly 1,587,644 bytes — 18 s × 88,200 + 44 header.

**The lesson: a fetch against a relative path does not fail in a single-page app, it
succeeds with the wrong thing.** Any code that fetches a stored media value is suspect
after a URL→path migration, and the symptom is corruption rather than an error.

## Two corrections to the screen model

**The edit screens never play saved clips.** Both `edit-atc` and `prescribe-atc` bind
`*ngFor="let audio of audioBlobURL"` — local blob URLs from the current session and the
offline cache. They display what you just added, never what is stored. An earlier worklist
called them "upload and listen"; that was wrong, and it means neither ever needed
`app-atc-audio`.

**`dynamic-studio` (v1) has no route.** `app.routes.ts:611` is commented out; only v2 is
reachable at `/dynamicstudio`. v1 was modified for nothing and is a deletion candidate.

## prescribe-atc, now tested

Reached the media section by selecting participant then ATC model — **not** "Create New
ATC", which is a reset and was what wiped two earlier attempts. Its submit path uses
`alert()`, which blocks browser automation, so the three upload methods were driven
directly:

| | Stored value | Verified |
|---|---|---|
| audio | `ATC_Audio_Notes/<pid>/Audio - 1 <uuid>` | 18 s, TTL 20.29 min, `audio/wav` |
| note image | `Uploaded ATC/CLAUDE-patc-note-…png` | TTL 14.98 min, `image/png` |
| ATC image | `Online ATC Images/CLAUDE-patc-atc-…png` | TTL 14.99 min, `image/png` |

All paths, no tokens, all serving.

## dynamic-studio-v2 — confident, still unproven

Its binding is `<app-atc-audio [path]="audio">` over `atc['cwbrief']`, which the loader
fills from `notesdata["changeworkbrief"]` — identical to four verified screens, and the only
line changed there was the duration mapping being removed. It renders clean.

But the block sits behind `isATCExpanded('cw-' + a)` inside a live studio session, and no
queue had one. Injecting `cwATClist` directly did not render it. **So: confident by
construction, not by test.**

One observation, pre-existing: that loop uses `trackByDocId`, which on an array of path
strings falls through to the index. Identity by position survives a snapshot, so the player
is preserved — but removing a clip would shift players onto neighbouring paths.

---

# Does `allow read: if false` stop a download URL? Measured.

Asked directly, so it was measured against `starlabs-test` with the rule live, rather than
reasoned about. A known object and its real token:

| Request | Credentials | Result |
|---|---|---|
| `?alt=media&token=<valid>` | **none** | **206, 100 bytes, `video/mp4`** |
| `?alt=media` (no token) | none | 403 |
| `?alt=media&token=<wrong>` | none | 403 |
| metadata `GET /v0/b/…/o/<path>` | none | 403 |
| `GET /v0/b/…/o?maxResults=1` (list) | none | 403 |

And at the SDK level, signed in:

```
getDownloadURL(ref(storage, path))
  →  throws  storage/unauthorized
     "User does not have permission to access 'signed-url-test/…'"
```

## So, precisely

**`allow read: if false` does NOT stop an existing download URL.** A valid
`firebaseStorageDownloadTokens` value still serves the object to anyone, with no account and
no credentials. The rule blocks every other way in — bare path, wrong token, metadata,
listing — but a token is checked *before* rules and overrides them.

What the rule *does* close is the ability to **mint a new one**: `getDownloadURL()` performs
exactly that metadata read, gets 403, and throws.

## Why this matters for the rollout

Two consequences, pulling in opposite directions:

1. **The rules change alone protects nothing already leaked.** Every download URL issued
   before today still works, forever. Only the token sweep closes that, and it is the one
   irreversible step in the whole plan. Rules are the lock on the front door; the tokens are
   keys already handed out.

2. **It breaks 92 files immediately.** Every `getDownloadURL()` caller outside ATC — avatars,
   notifications, chat, content, workshops, EiFlix — now throws after a successful upload.
   On `starlabs-test` that is acceptable collateral. In production it is an outage for
   everything except ATC.

This is why the rule cannot ship to production ahead of the work on those 92 callers, and
why the token sweep still has to happen afterwards regardless.

---

# Coverage check before any production talk

**Angular** — 15 files touch `changeworkbrief` / `imagenotes` / `prescription_image` /
`cwbrief`. A scripted sweep for raw refs bound to an element, and for the
fetch-a-stored-value bug class, found only false positives:

- `[src]="imageUrl"` ×3 — the `*ngIf="noteImageUrls[image] as imageUrl"` bindings, resolved
- `fetch(url)` ×3 in prescribe-atc — the fixed versions, which resolve first
- `fetch(url)` in `live-event-dashboard-v3` — a Firestore REST call with a bearer token
- `[src]="expandedImage"` ×2 in the studios — fed from `profileimg`, so **avatars**, not ATC.
  Out of scope here, but it will break when avatars migrate

**Cloud Functions** — exactly one file touches ATC media: `media_signed_url.js`.
`communication.js`, `user_registration.js` and `service.js` mention download URLs but have
zero ATC references. Stale comment to fix: `index.js:333` still says "fenced to
`<name>/profile/**`".

So the ATC-notes slice is **completely covered**. What is not ready is everything around it:
nothing committed, production unmigrated, tokens never revoked anywhere, and the 92 callers
outstanding.

---

## Companion journal in the Cloud Functions repo

The server side has its own entry, written for whoever opens `media_signed_url.js` without
ever seeing this repo:

`Firebase Functions/Starlabs Functions/docs/journals/2026-11-12-getmediaurls-atc-signed-urls.md`

It carries the contract, the four mistakes not to repeat (client-supplied duration, rounding
the expiry, caching a failed header read, mistaking the fence for authorisation), and the
measured Storage Rules behaviour.
