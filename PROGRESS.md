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
