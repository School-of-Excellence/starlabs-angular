# ATC media → signed URLs (2026-11-11)

Companion to `2026-11-04-storage-signed-urls.md`. That one covered avatars and the pilot;
this one is the ATC notes slice — the first real content migrated off download tokens.

Working design docs live outside the repo in `~/Documents/storage-signed-url-migration/`
(files 01–12). This records the decisions and the surprises.

---

## What landed

**Cloud function** — `functions/components/media_signed_url.js`
- `ALLOWED_PATHS` became `PREFIXES`, a table that is both the fence and the TTL rule
- added `ATC_Audio_Notes/`, `Uploaded ATC/`, `Online ATC Images/`
- refs may now be `{path, duration}` as well as bare strings (back-compatible)
- per-ref expiry, rounded to **that ref's own ttl** so the memo and browser cache still work
- 38 unit tests (was 23), all passing

**Angular**
- `shared/media-url.service.ts` — `resolve(ref, duration?)`, `prefetch(refs)`, per-ref expiry
- `shared/audio-duration.ts` — new; `measureAudioDuration`, `alignDurations`
- `ATC/atc-audio/` — new shared component owning resolve → play → renew → resume
- 3 upload screens store paths, not download URLs
- 7 playback screens use `app-atc-audio`; images resolve through the service
- `ng build` green

---

## Why these constraints

### TTL is per prefix, and audio's is `duration + 15 min`

Images get a flat 15 minutes. Audio cannot.

ATC notes are **uncompressed WAV at ~5 MB/minute** (RecordRTC `StereoAudioRecorder`,
`mimeType: "audio/wav"`, mono, AudioContext default sample rate). A 30-minute note is
~150 MB. The browser buffers ahead, **suspends**, then issues a fresh range request when the
buffer drains — and *that* request is what 403s on a dead URL. A flat 15-minute TTL would
stop a long note mid-sentence.

With `ttl = duration + 15 min`, continuous playback takes exactly `duration` and the URL
lives longer than that, so an uninterrupted listen can never outrun it. By construction.

The cost is a longer leak window for long audio, accepted deliberately: a signed URL is a
bearer credential, so a leaked audio link is live for its TTL. The mitigation is the rule
that a signed URL is **never logged, persisted or forwarded**.

### Duration is stored, and derived when it is not

New uploads measure it (`measureAudioDuration`, an offscreen `<audio>` + `loadedmetadata` —
exact, and immune to the 44.1k/48k device difference a size calculation would hit).

Legacy rows have none, and **there is no duration backfill**: the server derives it from the
size of the object it is already about to sign (`size / 88200`). The ±9% that costs is
absorbed entirely by the 15-minute pad. This is why `durationFromSize` exists.

### Duration is a PARALLEL array, not a shape change

`changeworkbrief_duration: number[]` beside `changeworkbrief: string[]`.

Deliberate: `changeworkbrief` keeps its `string[]` shape, so the reader screens that do not
care about duration needed no TS change at all. `alignDurations` pads older entries with
null so indices stay honest when new clips are appended to a note that predates the field.

### The client sends duration; the server clamps it

Needed because TTL must be **deterministic for a given path** — two users opening the same
note must get the same `expiresAt`, or they get different URL strings and the browser cache,
any CDN and the `path|expiresAt` signature memo all miss.

All clients read duration from the same document, so they agree. The clamp
(`MIN_TTL` 15 min, `MAX_TTL` 4 h) bounds what a tampered value can buy.

### One component, not nine implementations

All nine playback screens had the identical `*ngFor` + `<audio><source></audio>` block.
`app-atc-audio` collapses them, which also removes the two markup shapes — `[src]` on the
element versus a `<source>` child needing an explicit `load()` that zeroes `currentTime`.

It resolves **lazily on play**: a note nobody opens costs no signature, and the URL's clock
starts at playback rather than at page load.

### Renewal happens on user intent, not on failure

`(play)` and `(seeking)` call `ensureFresh()`; a timer swaps `RENEW_LEAD_MS` before expiry.
`(error)`/`(stalled)` are the fallback only.

Reacting to a 403 always means an audible hole mid-sentence. Renewing at the moment the
listener clicks puts the same delay where it is not an interruption. And the timer's best
case is firing **while paused**, where the swap is completely invisible.

Two ordering details that are easy to get wrong:
- **capture the expiry before `invalidate()`** — otherwise `expiryOf()` returns null after a
  failed refresh and the timer can never be re-armed for that element
- **resolve before pausing** — pausing first puts the round-trip inside the audible gap

---

## Surprises

1. **`edit-triple-atc` has no `<audio>` at all.** It merges `changeworkbrief` arrays forward
   but never uploads or plays audio — images only. Earlier notes said otherwise; corrected.

2. **`view-triple-atc`'s `getNotes()` is entirely commented out** (ts 349–367, and the whole
   notes block in the template). `mapATCnotes` is never populated, so its audio and image
   sections never render today. Wired up anyway so the template is correct if it is switched
   back on. **Worth deciding whether that screen should be retired.**

3. **Four screens had live snapshots and no `trackBy` on the audio loop** —
   `view-assigned-atc`, `review-flag-atc`, `view-triple-atc`, `dynamic-studio`. Any document
   change destroys and recreates the player, stopping playback mid-listen and losing the
   position. Pre-existing, made worse by lazy resolve. `trackBy` added.

4. **`dynamic-studio` / `dynamic-studio-v2` read `atc['cwbrief']`**, a pre-mapped array, not
   `notesData['changeworkbrief']`. Durations needed mapping there too
   (`cwbriefduration`).

5. **`atc_notes` has a `revision` subcollection** (`atc_notes/{id}/revision/{logid}`) that
   mirrors both media fields. Nothing reads it, but it roughly doubles what the path backfill
   must touch, and its URLs die when tokens are revoked.

6. Two self-inflicted build breaks, both the same shape: inserting a `/** */` JSDoc inside an
   existing `/* */` block, and an HTML `<!-- -->` inside an existing comment — each closed the
   outer comment early and exposed dead code. **Check whether the insertion point is already
   commented out.**

---

## Pending

- **`prescribe-atc` does not yet capture duration.** It stores paths correctly; its clips
  fall back to the server's size-derived length. Needs the same `measureAudioDuration` wiring
  as `edit-atc` (its upload path is a resumable task with progress plumbing, so it is a
  larger edit).
- **Path backfill script** — existing rows still hold download URLs. They keep working
  through `resolve()`'s passthrough until then. Must cover the `revision` subcollection and
  target the named DB `firestore-atc`.
- **Per-caller authorisation in the callable.** The fence is about *where*, not *who*: any
  signed-in user can currently sign any object under an allowed prefix.
- Nothing committed — `git add` was declined this session.
- Deploy target is **`starlabs-test` only**. Production untouched.
- Bucket CORS must be confirmed before signed URLs render behind `crossorigin="anonymous"`.

---

# Test log — same day, after the data migration

Run against `starlabs-test` in a signed-in browser, dev server on :4200, after the operator
applied and verified the URL→path migration. 19 cases run.

## Passed

| Case | What was exercised | Evidence |
|---|---|---|
| T0.1 | Billing restored | object read 200 (had been 402 "billing account … disabled in state delinquent") |
| T0.2 | Function deployed with the ATC fence | an `ATC_Audio_Notes/…` path resolves |
| — | Migration landed | 22 live notes hold paths, no `token=` |
| **T3.1** | **Batching** | **25 distinct refs → 1 callable call** |
| T3.3/3.4 | Signed URL shape | `storage.googleapis.com`, `X-Goog-Signature`, no token; 206 + `audio/wav` |
| T3.6 | Forged signature | 403 |
| T3.9 | Size-derived duration | all 25 clips land at **16–29 min**, the `duration+15min` rounded band |
| — | Cache hit | second resolve costs zero calls |
| **T4** | **Renewal + position restore** | new URL swapped in, 4.62s → 6.72s, still playing |
| T5.2 | "Play again" | one bounded attempt, then errors again |
| T5.5 / T8.2 | Fence | `call_recordings/` refused per-ref, no throw |
| T7.1 | `view-prescribed-atc` | `app-atc-audio` renders, **0 legacy `<audio>`** |

## Defects found and fixed

**1. `onFail` treated a successful re-sign as recovery.** `getSignedUrl` signs a PATH and
will sign one whose object was deleted, so a missing clip re-signed forever and the listener
was never told. T5.1 showed `failed:false`, no error UI, and 7 runaway calls. Now the
element's own failures are counted, which is the only signal that reflects reality.

**2. `renewals` was never declared.** Found by `tsc` while fixing #1 — so there was no retry
cap at all, which is what produced the 7 calls. The original build was green only because
the old `onFail` never referenced it. *A cap documented in a design doc is not a cap.*

**3. `expiresAt` was fractional** (`…628.4353`): size-derived duration is `bytes ÷ 88200`,
and the unrounded ttl propagated into the expiry and the memo key. Now `Math.round`ed.

**4. Error copy was wrong.** It said "This link expired" for a *deleted* object — telling
the listener to retry something that can never work. An `<audio>` error carries no HTTP
status, so expiry and deletion are indistinguishable at that point; the wording now says
"This clip could not be played."

After the fixes: T5.1 passes — error shown, retry offered, calls bounded 7 → 3.

## Open: what MAX_TTL_MS actually caps

`MAX_TTL_MS` (4 h) is both the ceiling on `duration + 15 min` and the fallback when the
length cannot be determined. Two findings:

- **It does not cap the lifetime.** Rounding makes real validity `ttl`..`2×ttl`, so 4 h means
  up to 8 h. Measured: a tampered `duration: 31536000` yielded **6.33 h**. A true 4 h ceiling
  needs the constant set to 2 h.
- **The fallback is backwards.** When duration is unknowable the code returns the *most
  permissive* value — and that branch fires precisely when something is wrong (it fired
  throughout the billing outage). Renewal is now proven to work, so `MIN_TTL_MS` is the safer
  default: 15 minutes, and let the client renew.

## Surprises

1. **Every clip in `starlabs-test` is 0.3–11.2 seconds.** The 150 MB / 30-minute case this
   whole TTL design exists for **does not exist in the test data** and cannot be exercised
   here. The mechanism is verified; its motivating extreme is not.
2. **No note carries `imagenotes`** — 22 of 79 have audio, none have images. The image path
   is untested.
3. **The bucket is still enumerable and readable with no credentials** — 9,783 objects walked
   anonymously, `ATC_Audio_Notes/` among them. The data migration protects nothing until the
   rules close. `allow list: if false` is one reversible deploy and depends on none of this.
4. `/previewATC` throws `Cannot read properties of undefined (reading 'indexOf')` in
   `getATC` when opened by direct URL — pre-existing, expects navigation state.
5. A dev server left running ~4 h silently stopped rebuilding. Two "the fix didn't work"
   results were stale bundles, not bad code. **Check what the page is actually running
   before believing a negative result** — `c.onFail.toString()` settled it in one call.

## Not run

P2 upload + draft patching · P6 two-tab snapshot · T3.2 (audio lazy on load) · T3.7
(cross-instance memo) · T4.3–4.5 (replay, mid-playback expiry, seek) · T5.3–5.4 (offline) ·
T8.1, T8.4–8.6.

---

# Test log 2 — 2026-11-12, option C, after the rules change

Design settled on **option C**: the function reads each clip's length from its own WAV
header. Nothing about duration is sent by the client or stored in Firestore.

Rules now `allow read: if false` / `allow write: if request.auth.uid != null`.

## The bug this run found

A note page asked for 25 clips in one call. **23 of them came back unmeasured** and fell to
the 30-minute fallback. Retried one at a time, every single one read correctly — 7.51s,
2.3s, 0.34s, 1.62s, 1.96s, 6.06s.

Two faults, both mine:

1. **25 concurrent ranged header reads** were too many; most failed.
2. **The failures were cached.** One transient error became a permanent wrong answer for
   that object, for the life of the instance.

Fixed with a 4-at-a-time throttle, and by not caching an unmeasurable result. Two
regression tests added — the first fails without the throttle. 29 tests pass.

**This is the lesson worth keeping: a cache that remembers failures turns a blip into a
permanent defect.** The signature cache had always avoided this deliberately; the duration
cache I added did not, and nothing caught it until real files were used.

## What the rules change proved

| | Before | After |
|---|---|---|
| Raw path, no credential | 206 | **403** |
| Raw path, **signed-in** user | 206 | **403** |
| Bucket enumeration | 200 (9,783 objects) | **403** |
| Signed URL | 206 | **206** |
| Upload | works | **works** |

So the signed URL is now the only way to read an object. That is the whole point of the
migration, and it is now true in `starlabs-test`.

⚠️ **92 files still call `getDownloadURL()`** outside ATC — avatars, notifications, chat,
content, workshops. Every one of those now throws `storage/unauthorized` after a successful
upload. Not caused by this work, but the rules change makes it live.

## Verified

Header duration matched the browser exactly (1.45 == 1.45). A caller asking for a
year-long URL got 19 minutes — the file's own length plus the pad. 25 refs still cost one
callable round-trip. A client that clears its cache gets the identical URL back, proving
the server is doing the sharing. Both halves of the renewal rule behaved: fully-buffered
clip with a nearly-dead link renews nothing; the same clip with buffering incomplete
renews. A missing object surfaces the error with a bounded number of attempts. A component
survives a note re-assignment with its position intact.

Upload was tested on the `/signedurltest` harness, **not** through `edit-atc`, to keep real
ATC documents untouched per the CLAUDE.md rule. Round trip confirmed: upload → path stored
with no download URL → signed URL → playback → record deleted.

## Still not covered

`edit-atc`'s own upload code path (harness used instead) · a genuinely long recording — the
longest clip in `starlabs-test` is 7.5 seconds, so the 150 MB / 30-minute case this design
exists for remains untested · images in ATC notes, because no note has any.
