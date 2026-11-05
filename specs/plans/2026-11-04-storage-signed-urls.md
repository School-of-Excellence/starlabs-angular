# Plan — Storage signed URLs, pilot on /profilelist

**Status:** approved in chat 2026-11-04 (operator picked the screen scope).
**Journal:** `specs/journals/2026-11-04-storage-signed-urls.md`

## Problem

Every media URL in Firestore is a Firebase download URL carrying a `token` query param.
Those tokens have no TTL, cannot be expired, and bypass Storage Security Rules entirely.
A leaked row is therefore a permanent public handle on the object, and tightening rules
does nothing about it.

Measured on 2026-11-04:

- `starlabs-test.firebasestorage.app` answered an **unauthenticated** list request with
  200 and 88 top-level prefixes, ~35 of which are people's names. Objects returned 200 on
  a tokenless GET, and the listing handed out `downloadTokens` in metadata.
- `call_recordings/` holds **7,822** publicly downloadable objects.
- Neither app makes a single Storage `list` call (the 5 apparent `listAll` hits in Angular
  were substring false positives: `specialistAllSlots`, `MediaCacheService.listAll`).
- 5,733 tokenised URLs across 4 Firestore field names.

## Approved scope for THIS change

One collection, one field, one screen:

| | |
|---|---|
| Collection | `profile_data` |
| Field | `profile` |
| Screen | `/profilelist` (`Participants Profile Management/profilelist`) |
| Bucket | `starlabs-test` |

Chosen because the avatar is the only image on that template (so a regression is
unambiguous), the table pages 10–50 avatars at once (so batching, caching and the URL
window are all exercised by one page load), and it renders through the shared
`ProfilePictureComponent`.

## Design

1. **`getMediaUrls` callable** (`functions/components/media_signed_url.js`) —
   `{refs: string[]}` → `{expiresAt, results: [{ref, url, expiresAt} | {ref, error}]}`.
   - `onCall`, so the Firebase ID token is verified in transport before the body runs.
     That is both gates at once: authenticated caller, and a token minted by *this*
     project's Auth.
   - `parseRef` accepts `gs://`, a Firebase download URL, a `storage.googleapis.com` URL
     or a bare path, and **discards the token**. Accepting the legacy URL is what lets the
     rollout be incremental — screens migrate while the database still holds token URLs.
   - Fenced to `^[^/]+/profile/.+$`. Profile photos upload to
     `<profile name>/profile/<ts> <file>` (Flutter `profileimage.dart:133`), hence the
     leading wildcard segment. Every later screen widens this deliberately.
   - Rejects a foreign bucket, `..`, and any other prefix — per ref, as data, so one bad
     row cannot blank a table page.
   - Expiry snaps **up** to the next 15-minute boundary, so all callers in a window get a
     byte-identical URL string and the browser/CDN cache still works.
2. **`MediaUrlService`** (`src/app/shared/media-url.service.ts`) — `resolve(ref)` →
   signed URL or null. Coalesces calls within 16 ms into one round-trip, attaches a
   second caller for the same ref to the in-flight request, caches until 60 s before
   expiry, exposes `invalidate()` / `clear()` for the expiry re-request test. Built on
   `getFunctions(app, 'us-central1')` like `atc-firebase.service.ts`, so
   `app.config.ts` needs no `provideFunctions()`.
3. **`/profilelist` only** — the template passes `[src]`, which `ProfilePictureComponent`
   already honours by skipping its own `profile_data` query. So the shared component used
   by 69 templates is **not touched**. `resolveVisibleAvatars()` signs just the current
   page, re-running on data load, page change, sort and filter.

## Not in this change

- Write/delete path (uploading an avatar) — needs pid-matching, different screen.
- The other 68 Angular bypass sites and 87 Flutter reads across 33 files.
- The DB migration off token URLs, and the token-revocation metadata sweep.
- Emulator rules tests (`index.emulator.js` is a deliberately filtered, ATC-free
  entrypoint and does not export `getMediaUrls` yet).

## Gate before this can be tested

`roles/iam.serviceAccountTokenCreator` on the Functions runtime service account.
Without it every `getSignedUrl` returns `sign-failed: …signBlob…` — surfaced per ref
rather than as a 500, and unit-tested for that exact shape.

## Verification done

- `npx tsc --noEmit -p tsconfig.app.json` — clean.
- `npx ng build --configuration production` — exit 0.
- `npx jest test/unit` in the Functions repo — 15/15, covering the fence (other prefix,
  per-user sqlite, traversal, foreign bucket), window rounding, cross-caller URL
  identity, signature dedupe across two different token URLs for one object, and the
  signBlob-denial shape.
- `profiles/profilelist.spec.ts` asserts only the `pl-*` role-filter hooks, so existing
  coverage is unaffected.
