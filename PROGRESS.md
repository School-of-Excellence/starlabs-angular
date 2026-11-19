# PROGRESS

## Current state
- **starlabs-angular `nanda-development`**: HEAD `76cca177`, committed by the operator, 1 ahead of origin. It holds
  the New Users redesign port plus the earlier dashboard, EiFlix and docs work.
  - **4 files are still uncommitted**: the review fixes in `newusersprofile.component.{ts,html,css}` and
    `newusersprofile.redesign.spec.ts`.
  - This journal and PROGRESS are uncommitted too.
  - Also uncommitted: the workshop Settings **email template mapping** (2026-11-17). That is 3 changed
    `workshop-settingsv2.component.*` files, plus new `mail-template-map.ts` and `.spec.ts`, its plan and its journal.
  - Also uncommitted: the **workshop dashboard redesign port** in `workshop-dashboard.component.{html,css,ts}`,
    together with the earlier tag chips, renames and full width, plus the **At a glance cards** and **side-panel
    person menu**: `workshop-dashboard.engine.ts` + its unit spec changed; new `workshop-dashboard.glance.ts` +
    `.glance.unit.spec.ts`.
  - Not merged, not deployed.
- **starlabs-e2e-tests `main`**: **pushed through `3d6b1d5`** (2026-11-18, 14:13). Nothing is local. That is 14 commits rebased onto
  upstream `6fa1b71`, whose 5 new commits only touch `journey/`. The 14 commits are: WNE-08..11, UCC-03, NUR-01..18,
  WMT-01..17, WDL-01/02, WDR-01..05, WDG-01..10 and WDP-01..06. Hashes changed in the rebase (e.g. `d7739f2` is now
  `05524ca`).
- **Checks on the final tree:**
  - build clean;
  - New Users folder unit tests 78/78;
  - readiness gate MATCHED against `origin/development`;
  - the 4 New Users hub files 50/0/0;
  - dashboard set (13 files) 110/0, gate MATCHED 181/181 (2026-11-17);
  - **full workshops suite 231/0/33** on 2026-11-18 (no app change since; only the side-person spec changed after,
    3/3 green runs).
- The test servers are stopped, the cloud-function `functions/package.json` is clean, and port 4200 was untouched.
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

## Last session changes (2026-11-16 → 11-17)
- **Workshop config → Settings → Mail template → Email template** (2026-11-17). Journal
  `2026-11-17-workshop-mail-template-mapping`.
  - You pick an active, approved `email templates` doc (with search), then choose a source for each variable:
    Name, Workshop name, Workshop URL, or Static value with a text box.
  - It saves `mail: {templateid, emailData: {<variable>: {type[, value]}}}` to `workshopsettings/{id}` with its own
    Save button. The operator chose this shape over the flat map.
  - A review found two medium issues, both fixed:
    - a saved mapping that has drifted from its template now shows as out of date;
    - templates with no recorded variables can't be saved.
  - Tests: unit 24/24; hub WMT-01..17; targeted run 50/0; gate MATCHED.
  - **Nothing sends this email yet.**
- **Workshop dashboard redesign: designed and developed** (2026-11-17). Journal
  `2026-11-17-workshop-dashboard-redesign`; mockups in the matching folder.
  - A deep check found 96 gaps between the design and the code, and all were handled. Examples: `#` links would
    leave the route, the sticky index needed `overflow-x: clip`, and index items follow their sections' rights.
  - UI only: the template and CSS were rewritten, the TS got `ViewEncapsulation.None` and 6 unused Material modules
    were removed. No logic changed.
  - All 152 hooks are kept, and there are 7 new `wdash-nav-*` hooks.
  - **Tests:**
    - build clean; unit 262/268 (the 6 are the baseline empty stubs);
    - dashboard e2e 94/0/0, including the new WDR-01..05;
    - gate MATCHED 159/159.
  - Three hub locators now accept `button.metric-card`.
  - The full run took about 1 h 45 min (9 agents).
  - The operator then answered the open questions:
    - keep "Purchase";
    - Share Claimed now reads **"Referred:"**;
    - New Users cards show tag chips.
    - Results: dashboard set 96/0, gate MATCHED 161/161.
  - **At a glance, six new cards: developed.** Workshop timeline, Joined recently, Started but stuck, Completed,
    Inactive 3+ days, Top tags (full tag names, no ellipsis). Rules in `workshop-dashboard.glance.ts`.
  - **Side panel:** no `/userprofile` link any more; clicking a name opens a menu → **View participant data**
    (closes the panel, opens that person's Participant Data; disabled with a reason when there's no progress row).
  - Review: 1 high ("Day 12of 24", Angular dropped the space) and 1 medium (Sale Achieved hover card covered the
    menu), both fixed, plus 5 lows fixed. One low skipped (below).
  - Tests: dashboard set 110/0, unit 288/294 (6 baseline stubs), gate MATCHED 181/181. About 66 min.
- **Workshop dashboard, renames and full width** (2026-11-17):
  - cards now read **Existing Participants** and **New Users**, and the panel headings and titles match (the
    titles used to show raw keys such as "Existusersenrolled");
  - the dashboard fills the screen: the 1400px cap is gone and the edges are 16px.
  - Hub: WDL-01 in a gated file; WDC-01 accepts either wording.
- **Workshop dashboard: Exist Users Enrolled cards show tag chips** (2026-11-17), like Total Enrolled. No new reads.
  The chips have their own hook, `wd-side-exist-tag`. Hub WNE-10 is in a new gated file; 10/0 alongside WNE-01..09.
- **New Users redesign: developed.** Journal `2026-11-16-new-users-redesign-development`; plan
  `specs/plans/2026-11-16-new-users-redesign-dev.md`.
  - The approved Heritage Ledger design is ported, with the tag dialog rebuilt in Manage, Assign and bulk Edit
    modes.
  - Every one of the 71 existing hooks is kept, and 157 new ones are added.
  - **Load fixes:**
    - referrer names are read only for the ids present, only when needed;
    - the workshop list loads on first need;
    - listeners close on destroy;
    - the filter is parsed once, with a 200ms debounce and `trackBy`;
    - xlsx and the dialogs load on first use;
    - the page shell paints at once.
  - **Hub:** NUR-01..18 in a new gated file. WS-56 moved in as NUR-01, and the NUS count regex now allows "1,284".
  - **Tests:** the full workshops suite passed 189/0/33 **before** the review fixes. The fixes were re-checked
    only on the 4 New Users files.
  - **Review:** 15 findings, none high. 14 were fixed. The skipped one is in `app.component.html`: the header
    overflows below about 480px.
  - **Root causes worth remembering:**
    - a new hook-less `*.component.ts` fails the gate permanently, so `nx-icon.component.ts` became `nx-icon.ts`;
    - NUR-04's one failure was our own wrong expectation, not the app.
- **New Users redesign: design.** Journal `2026-11-16-new-users-redesign`, with the HTML mockups in the matching
  folder.
- Earlier in this session: the Tag and enrollment-date filters on the workshop dashboard and the EiFlix Responses
  dialog. Both are in journal `2026-11-16-enrolled-date-range-and-responses-dialog`.

## Pending
1. **Operator: commit:**
   - the 4 remaining New Users files;
   - the email-template files: the 3 settings component files plus `mail-template-map.ts/.spec.ts`;
   - `workshop-dashboard.component.html/.ts/.css` (Exist Users tag chips, renamed cards, full width, **redesign**,
     glance cards, person menu), `workshop-dashboard.engine.ts` + `.engine.unit.spec.ts`, and the new
     `workshop-dashboard.glance.ts` + `.glance.unit.spec.ts`;
   - both new journals, the plan, and PROGRESS.
2. **Hub:** pushed through `3d6b1d5`.
   - The full workshops suite before the push: 235 passed, 1 failed (WS-40 EiFlix Home config, a timeout), 33 skipped.
   - WS-40's file re-run alone: 7/7. It is a known-flaky test, unrelated to this work.
   - Before the next push, run the full suite again if the app changes.
3. **New Users panel "moved person": not an app bug** (2026-11-18). It was my own test-order mistake in WDL-01,
   now fixed. Follow-ups, all uncommitted in `workshop-dashboard/`:
   - New Users lists each person once;
   - **the dashboard no longer waits for `new_user_data`.**
     - Only Existing Participants, New Users and New Users Not Enrolled show a loading bar and are disabled
       until it lands. The New/Exist filter is disabled too.
     - On failure they show "—". The read is retried twice and gives up after 60s.
     - Open panels fill in place.
     - The read uses Firestore Lite (new `workshop-dashboard.new-user-data.ts`, +14 kB gzip in the dashboard
       chunk), so it doesn't share the live-read channel.
   - Hub WNU-01..05; dashboard set 117/0; unit 305 (+6 baseline stubs); build OK; gate MATCHED 185/185.
   - Optional, not done: a "retry" button on the "—" state.
4. **Workshop dashboard redesign:**
   - the operator should look at it on 4200;
   - decide: should a Top tags click list each person once in Total Enrolled (it lists one card per enrolled doc)?
   - Sale Achieved purchases card: **left without e2e (operator, 2026-11-18)**. Its rows come only from Watson, which
     the emulator build has off; the side-person spec header records why;
   - phones: the Sale Achieved purchases card covers the next row until you tap elsewhere (pre-existing);
   - watch the cost of the index's Participants count on big category-based cohorts.
5. **Email template follow-ups:**
   - build the sender that reads `workshopsettings/{id}.mail`;
   - decide whether to fill in `templatemodel` for templates created without it (the Communication component's
     create path never writes it);
   - emulator cloud functions don't load: firebase-functions v7 dropped `functions.config()`.
6. **Load time, next step:**
   - add performance marks first; no before/after timing exists yet;
   - then the shared guard and role-check speed-up, and Firestore persistence. Both touch every screen and need an
     all-suites regression.
7. **App header overflow at 390px** (`app.component.html`): an account-chip ellipsis, or the avatar only.
8. **Before deploying to production:**
   - fill `static meta data/Workshop Admin.clearworkshop`;
   - confirm the rules allow **updating** `newusertags`, or tag renames fail.
9. **EiFlix Confirmed:** the option 3 repair of the stored `confirmed` needs approval and an approved way into
   production.
10. **Known, left as is:**
   - a full-access person's hidden per-workshop Clear tick still grants Clear;
   - a failed admin-lists read can let the editor save empty lists.
11. Carried over:
   - `/engagementdashboardv2` needs a route entry and `authGuard`;
   - EiFlix consumers must read `showtext`, and the learner app `allowedit`;
   - the ATC slider items (`2026-11-03-participant-view-and-slider-contract`);
   - `graphify` is not installed.
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
