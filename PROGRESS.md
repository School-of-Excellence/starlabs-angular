# PROGRESS

## Current state
- **starlabs-angular `nanda-development`**: HEAD `f1124b66`. Everything since 2026-11-12 is **local and
  uncommitted**: 17 modified files and 9 new ones (2 unit specs, 1 plan, 6 journals). Not merged, not deployed.
- **starlabs-e2e-tests `main`**: pushed through `69bd71c`. The full workshops suite ran first: 169 passed /
  0 failed / 33 skipped. The new spec files are gated on hooks that ship with the uncommitted app changes, so
  CI skips them until those land.
- Unit tests:
  - `workshop-dashboard.export.spec.ts` 15/15, `newusersprofile.columns.spec.ts` 5/5,
    `workshop-access.model.spec.ts` 7/7.
  - The dashboard folder has 197 passing and 1 failing; the failure is the old empty "should create" stub.
- The test servers are stopped and the cloud-function `functions/package.json` is restored.
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

## Last session changes (2026-11-12 → 11-16)
- **Workshop dashboard, Total Enrolled.**
  - The export adds Enrollment Date (with time) and Tags.
  - The side filter is All / New / Exist. People in `movedtoexist` count as Exist everywhere, which also fixes
    the "New" tags.
  - Cards show tag names. There is a Tag filter, and a sort that opens newest-enrolled first.
  - Participant Data shows the enrollment's tags.
  - Journals: `2026-11-12-total-enrolled-*`, `-new-exist-and-export-tags`, `2026-11-13-total-enrolled-sort-and-pd-tags`.
- **Clear button.** Only `Workshop Admin.clearworkshop` or that workshop's own Clear tick grants it; full
  dashboard access no longer does.
  - Fixed along the way: the access editor's save deep-merged the grants map, so removing someone or pressing
    None kept their stored actions. It now uses `mergeFields`.
  - Journal: `2026-11-12-clear-button-access`.
- **New Users screen (`/newusersprofile`).**
  - Manage tags can rename a tag. Before, clicking a tag in that mode did nothing.
  - Column chooser: Name, Phone, Email, Created and Tags by default, saved per browser.
  - Layout:
    - a two-row toolbar;
    - a sticky header;
    - a selection bar under the table instead of the side panel that squeezed it;
    - real loading and no-match states;
    - full tag names;
    - a Created filter that matches the other filters.
  - A two-reviewer pass found 10 small bugs; all are fixed and tested (NUS-06..11).
  - Plan `specs/plans/2026-11-12-new-users-screen.md`; journal `2026-11-12-new-users-screen`.
- **EiFlix home config, Upcoming Workshops.** Confirmed now counts the responses, the same set View lists,
  instead of the number stored on the widget. The stored number is untouched, and EiFlix still shows it.
  Journal: `2026-11-13-eiflix-confirmed-vs-responses`.
- **Failures and their root causes.**
  - WS-40 timed out once in the full suite. It passed on a rerun and nothing touches it, so it was a flake.
  - WNE-07's first negative control used p1, who is "enrolled, not started" and so has no progress row.
    Switched to p0, untagged.
  - Behaviour-only changes need a new hook. The hub-ahead guard only skips a spec file that references a hook
    the branch lacks; otherwise older branches would go red.
  - A session cut-off left one e2e rerun unrun. It ran later, with the follow-up work.

## Pending
1. **Operator: commit all the angular files above together.** The pushed hub specs key on their hooks.
2. **Before deploying to production:**
   - put the right profile ids in `static meta data/Workshop Admin.clearworkshop` (full-access people lose
     Clear on deploy);
   - confirm the Firestore rules allow **updating** `newusertags`, or renames will fail with "Could not
     rename the tag".
3. **EiFlix Confirmed**: the stored `confirmed` can still differ from the real responses. Option 3, a one-off
   repair, is not done; it needs approval and an approved way into production.
4. **New Users audit, not done:**
   - three-state chips in bulk tag edit;
   - search inside the filter menus;
   - debounced search;
   - a load-error state;
   - collapsing the filters on narrow screens.
5. **Known, left as is:**
   - a full-access person's hidden per-workshop Clear tick still grants Clear;
   - a failed admin-lists read can let the editor save empty lists.
6. `graphify` isn't installed here, so the graph-rebuild step was skipped.
7. Carried over:
   - `/engagementdashboardv2` needs a route-config entry and `authGuard`;
   - EiFlix consumers must read `showtext`, and the learner app `allowedit`.
   - Older ATC slider items: see `specs/journals/2026-11-03-participant-view-and-slider-contract.md`.
## Last session changes (2026-11-03) — journal `specs/journals/2026-11-03-participant-view-and-slider-contract.md`
- **`participantview` on ATC model forms** — a "Participant can view" checkbox per form row; the participant
  app shows a form only when it is true. Absent reads false (old models expose nothing); a row added in the
  dialog starts true. Covered by hub `journey/atcmodel-forms.spec.ts` AMF-06.
- **ATC model dialog** — the forms list became a labelled grid with a stacked fallback under 760px, and the
  dialog went from a fixed 540px to 920px capped at 95vw. The checkbox had squeezed the form-name column to
  one character per line.
- **Flipping answers now render in both previews** (`form-overlay-view`, `form-template-preview`). They had
  never been rendered at all — zero flipping code in either.
- **Slider contract: a 0-based index into `options`**, both apps, both slider kinds. Web moved to
  `[min]="0"` / `[max]="options.length - 1"` and now shows the option label instead of the number; the
  hardcoded `[max]="10"` on the flipping slider is gone. `sliderPosition` clamps every read in both repos.
  This fixed a `RangeError` that took the app down on the flipping slider and, more quietly, on the last
  option of every plain slider.
- **Time contract: `"HH:mm"`**, 24-hour, zero-padded, converted at each UI boundary (`time-value.ts`;
  `FillForm.dart`). The web had been storing a Timestamp that the app could not read. No migration needed —
  reads accept all four shapes.
- **Failure mid-session**: the fill screens were switched to labels while the previews still showed raw
  indices, so every slider read one apart between a form and its preview. Fixed. A reported app-side `+1`
  turned out to be a stale build.
