# PROGRESS

## Current state
- **starlabs-angular `signedURL-media`**: HEAD `96022d8a`. Uncommitted: the `/participantvideoask` productref
  change (2 component files), its plan and journal, plus the operator's own earlier
  `product-delivery.component.ts` + `2026-11-24-product-delivery-mapped-only-fetch.md` (not from this session).
  Prod build exit 0. Not pushed, not deployed.
- **starlabs-e2e-tests `main`**: uncommitted PA-48..PA-50 (`profiles/participant-videoask*.spec.ts`,
  `profiles/seed-profiles.js`) alongside the operator's own uncommitted `journey/` edits.
- Carried over, NOT re-verified this session: `functions/package.json` may still point `main` at
  `index.emulator.js` (revert before any functions deploy); `starlabs-test` Storage still publicly listable;
  `getMediaUrls` blocked on the `serviceAccountTokenCreator` grant. See `specs/journals/2026-11-04-storage-signed-urls.md`.

## Last session changes (2026-11-24) — journal `specs/journals/2026-11-24-participant-videoask-productref.md`
- `/participantvideoask` gained a **Product** filter in the OR event group (`productref in …`). Its options are only
  products whose `productToDeliverySequence` has an `arenavideoask` activity: that is a full read plus an
  in-memory walk, because the nested arrays can't be queried.
- The Event cell now lists **every** ref on a row (arenaevent, queueref, workshopref, productref). A ref outside the
  loaded sets shows its raw id.
- Dropped during design: loading only related documents (operator: filters need the full lists) and the DFU-only rule.
- e2e: profiles suite PA-47..PA-50 + addressable spec **5/5 on the emulator**. The first run failed PA-49 because the
  spec expected a non-videoask product name. The app correctly showed the raw id, so the spec was fixed.
- `git commit` was refused by the session permission mode. Nothing from this session is committed.
- `graphify` python module is missing on this machine, so the graph was not rebuilt.

## Pending
1. Commit (app first: `src/app/participant-videoask/**` + plan + journal; then the e2e repo's three `profiles/` files).
   Push only on request.
2. Run the hub readiness gate / `hook-diff.py`. The `screen-e2e-coverage` skill is not present under `.claude/skills`
   on this machine.
3. PA-47's header comment says the suite seeds none of the screen's collections, which is now stale. Optional tidy-up.
4. Carried-over items (signed-URL rollout, Storage rules, slider migration, ATC local run) are unchanged; see the
   2026-11-04 and 2026-11-16/17 journals.
- **starlabs-angular `nanda-development`**: the operator committed **`c0d87746` "release workshop live"** (41 files). It holds:
  - the New Users details dialog;
  - the dashboard late-enrollee fix;
  - Manage tag;
  - the double-line fix;
  - dashboard colour option A;
  - Workshop Live;
  - their plans and journals.

  A merge of `origin/development` (`da26abf6`) is in progress. `PROGRESS.md` was the only conflict and is resolved here. `app.routes.ts` auto-merged and keeps `workshoplive/:id`. Not pushed, not deployed.
- **Uncommitted, for the operator to commit (2026-11-21 → 23):**
  - **Workshop completed date + New Sign-ups:** `workshops.component.ts` and `workshop-dashboard.component.{ts,html,css}`, `.glance.ts` and its unit spec, the plan and journal `2026-11-21-dashboard-new-signups`.
  - **Sale Achieved full-screen dialog:** the new folder `workshop-dashboard/sale-achieved-dialog/`, `watson-purchases.ts`, the dashboard component, the plan and journal `2026-11-23-sale-achieved-dialog`. ₹0 buyers are left out. The dialog is split into **New Sales**, **Funnel Sales** and **Upgrades**: the first sale is the person's first paid purchase ever, later purchases in the window by new customers are Funnel, and people who bought before the window are Upgrades. An "EiFlix New User" chip shows after the name of anyone in `new_user_data`, whether or not they have moved to existing. Only purchases on or after the person's enrolment day count. The header shows "Opt-in" (the registration start and end dates). The dialog lists every purchase in a Products column (no expand), and has filters for Product, Buyer type, Amount per purchase and Repeat buyers.
- **starlabs-e2e-tests `main`**: **6 local commits, not pushed:** `89757d3` (WSU New Sign-ups), `5e51dbe` (WSD Sale Achieved dialog; its cases moved from the side panel), `da84451` (WSD New / Funnel / Upgrades hooks) `3b3e449` (WSD EiFlix New User chip) `ba1cbd0` (WSD-01 header Opt-in) and `1e32ffd` (WSD-02 products in the row + filters). Before that, pushed through `97033dd` (2026-11-20).
  - The full workshops suite passed: 275/0/33 (308 tests in 37 files).
  - The gate was MATCHED over all 27 app files.
  - The NUD, WDC-LATE, WPT and WLV cases match the committed branch.
- **Clean-up:** test servers are stopped and the cloud-function repo is clean. The e2e scripts are backed up in `~/.claude/projects/-Users-nanda-Documents-Development-starlabs-angular/e2e-scripts/`, because the scratchpad gets wiped.

## Last session changes (2026-11-18 → 20)
- **New Users details dialog** with a **Delivery on hold** toggle. Each flip writes `deliveryonhold` and `deliveryonholdby {time, user}`.
- **Dashboard:**
  - **"Unknown · No login yet" fix.** Late enrollees are now looked up on their own, and older snapshots no longer overwrite newer ones.
  - **Manage tag** in the person menu, for the `clearworkshop` list only (segment tags, add and remove).
  - **Double-line fix** under the People cards.
  - **Light colour, option A.** The operator first picked D, then switched to A.
- **Workshop Live:**
  - **Live button** on active rows of /workshops, opening `/workshoplive/:id` in a new tab: a live feed of completed sub challenges, newest first.
  - **Pagination and search.** 20 per page, with search on name, phone and email. This is browser-side: server-side paging would need a new collection and a Cloud Function, which the operator declined.
  - **Journey and Customer status columns.** Both read "New User" for still-new users, using the dashboard's rule.
- **Decision:** one enrolment per user per workshop, so the Top tags dedupe question is closed.
- **Failures:**
  - Sessions ended mid-run twice, and the scratchpad was wiped each time. The scripts were recreated and are now backed up.
  - Killing the emulator left `functions/package.json` on `index.emulator.js`. It was restored each time.

## Pending
1. **Operator:** commit the New Sign-ups and Sale Achieved dialog files. **Hub:** push `89757d3`, `5e51dbe`, `da84451`, `3b3e449`, `ba1cbd0` and `1e32ffd` when asked, after the full workshops suite.
2. **Before deploying Workshop Live, Manage tag and Delivery on hold to production:**
   - add a `/workshoplive` route-config entry (via /routeconfiguration) with the same roles as /workshops, or everyone gets "Contact Admin";
   - fill `static meta data/Workshop Admin.clearworkshop`;
   - confirm the rules allow updates to `newusertags`, `new_user_data` and `tags` on `workshop participant enrolled`.
3. **Open decisions:**
   - Manage tag: should a clear-list member without the participant progress right get the menu?
   - Delivery on hold: is it stored only? Should delivery honour it?
4. **Small fixes:**
   - the app header overflows at 390px (`app.component.html`, every screen);
   - rename `workshop-access.model.spec.ts` to `.unit.spec.ts` so CI runs it.
5. **Left as is:**
   - a dashboard panel opened before a late joiner is identified stays stale;
   - a user converted while the page is open stays "New" until a refresh;
   - Sale Achieved has no e2e (Watson-only);
   - `/workshoplive` loads the whole workshop, which is fine at about 1,000 people; revisit if workshops grow a lot.
6. **Email template:** build the sender for `workshopsettings/{id}.mail`. Also add load-time marks.
7. **From the development branch's notes** (the ATC storage signed-URL stream; details in `specs/journals/2026-11-04-storage-signed-urls.md`):
   - **Signed URLs are blocked** until `roles/iam.serviceAccountTokenCreator` is granted. Then deploy `getMediaUrls` to `starlabs-test` and test the `/profilelist` pilot.
   - ⚠️ **`starlabs-test` Storage is wide open:** unauthenticated list and tokenless GETs both work, and `call_recordings/` alone holds about 7.8k objects. `allow list: if false` is verified safe but not yet deployed.
   - ⚠️ **Never deploy functions while `functions/package.json` has `"main": "index.emulator.js"`.**
   - **Slider migration:** answers before 2026-11-03 are 1-based and need a one-shot `value - 1`. `form-based-submission` (B!G) is still 1-based.
   - **The ATC suite has not run locally.** A Flutter app binding `[::1]:8080` clashes with the emulator.
8. **Carried over:**
   - the EiFlix Confirmed repair (needs approval);
   - `/engagementdashboardv2` needs a route entry and `authGuard`;
   - EiFlix consumers must read `showtext`, and the learner app `allowedit`;
   - the ATC slider items;
   - `graphify` is not installed, and the `screen-e2e-coverage` skill is missing on this machine.
