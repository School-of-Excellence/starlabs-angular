# PROGRESS

## Current state
- **starlabs-angular `atc-development`**: the storage signed-URL pilot is **committed locally,
  not pushed**. `ng build --configuration production` exit 0; `tsc --noEmit` clean.
- **starlabs-cloud-function `development`**: `getMediaUrls` callable **committed locally, not
  pushed, NOT deployed**. `npx jest test/unit` 15/15.
- ⚠️ `functions/package.json` still has `"main": "index.emulator.js"` (leftover emulator state,
  not from this session). A bare `firebase deploy --only functions` in this state deploys the
  FILTERED 17-export emulator set. **Revert before any deploy.**
- ⚠️ `starlabs-test` Storage is still wide open: an unauthenticated list returns 200 with 88
  prefixes (~35 are people's names), tokenless object GETs return 200, and `call_recordings/`
  holds 7,822 publicly downloadable objects. No rule has been changed yet.
- Blocked on one IAM grant: `roles/iam.serviceAccountTokenCreator` on the Functions runtime
  service account. Until it is granted every signed-URL request returns `sign-failed`.

## Last session changes (2026-11-04) — journal `specs/journals/2026-11-04-storage-signed-urls.md`
- **`getMediaUrls` onCall** (`functions/components/media_signed_url.js`, exported in `index.js`):
  `{refs}` → V4 signed read URLs. Accepts `gs://`, a Firebase download URL, a
  `storage.googleapis.com` URL or a bare path, and **discards the download token** — that is what
  lets screens migrate while the database still holds token URLs. Fenced to `<name>/profile/**`;
  a foreign bucket, `..`, and every other prefix are refused per ref as data, so one bad row
  cannot blank a table page. Expiry rounds UP to a 15-min boundary so all callers in a window get
  a byte-identical, cacheable URL.
- **`MediaUrlService`** (`src/app/shared/media-url.service.ts`): `resolve(ref)` → URL or null.
  Coalesces 16 ms of callers into one round-trip, dedupes in-flight refs, caches until 60 s before
  expiry, exposes `invalidate()`/`clear()` for the expiry re-request test.
- **`/profilelist` only**: the template passes `[src]`, which `ProfilePictureComponent` already
  honours by skipping its own `profile_data` query — so the shared component used by **144 avatars
  across 69 templates is untouched**. `[src]` binds `… ?? ''` deliberately: null would fall through
  to that query and render the token URL, hiding the very thing under test.
  `resolveVisibleAvatars()` signs only the current page, re-running on load, paging, sort, filter.
- **Measured, for later phases**: only **35 of 237** Angular `getDownloadURL` calls persist their
  URL to Firestore (183 are transient display) — so the write-side migration is ~35–50 sites, not
  237. Angular also has 68 direct bypasses in 26 files; Flutter has 87 live reads in 33 files and
  **no** shared avatar widget.
- **Correction to an earlier finding**: the 14 test-bucket tokenless URLs return 404 (objects
  deleted), not 402. Only 5 production `eiflix_images` 403s were rule-caused, and those screens
  are deprecated — so the earlier rule change broke nothing.

## Pending
1. **Grant `roles/iam.serviceAccountTokenCreator`**, then deploy `getMediaUrls` to `starlabs-test`
   and test the pilot. Nothing can be verified before this.
2. **Deploy `allow list: if false` to `starlabs-test`** — verified to break nothing: neither app
   makes a single Storage list call (the 5 apparent Angular `listAll` hits were substring false
   positives — `specialistAllSlots`, `MediaCacheService.listAll`).
3. **e2e for `/profilelist`**: the screen changed, so the e2e rule binds before push. Currently
   nothing is red (`profiles/profilelist.spec.ts` asserts only the `pl-*` role-filter hooks), but
   the new avatar behaviour is uncovered. Needs `getMediaUrls` added to `index.emulator.js`, which
   must stay ATC-free — it is, the module requires only `firebase-admin` + `firebase-functions`.
4. Then, in order: write/delete path with pid-matching (read stays `auth != null`, or the social
   feed goes blank); remaining screens; DB rewrite off token URLs; **token-revocation sweep**.
   Removing a URL from Firestore does NOT revoke its token — that needs a separate Admin SDK pass.
5. **Migration — slider answers written before 2026-11-03 are 1-based** and display one option
   high. Needs `value - 1` over `formsByClient` + `temporary_forms`, floored at 0, for `slider`
   fields and each `flippingquestion.value`. Not idempotent: needs a marker or a one-shot snapshot.
6. **`form-based-submission` (B!G) is still 1-based and stores the option label, not the index.**
   Deferred: `/formbasedsubmission` is registered but nothing navigates to it (the B!G board opens
   `/formtemplate`). Related trap: `form-assignment.component.ts:478-480` has the same
   label-writing `onSliderValueChange`, harmless only because its template call is commented out
   at `:236` — delete it.
7. **The ATC suite still has not run locally.** A running Flutter app (`Runner`, GCDWebServer)
   binds `[::1]:8080` while the Firestore emulator binds only `127.0.0.1:8080`, and `localhost`
   resolves to `::1` first — so the browser talks to the app, not the emulator. Stop the simulator
   app, or point the emulator host at `127.0.0.1`.
8. **Required sliders** — Flutter auto-answers on render; the web's flipping slider never evaluates
   `required`; neither can select the first option without moving away and back.
9. Carried over: `atc-development` is not a deploy branch, so the appointment prefill is still
   unreleased.
