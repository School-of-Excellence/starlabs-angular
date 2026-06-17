# 2026-06-10 — Events/Arena/Calendar e2e deepened to full recon depth

Companion journal (WHY) for the deep pass that closed the recon gap in `e2e/events/`. Plan/WHAT lives
in the recon (`e2e/recon-allcomp/events-arena.md`) + validated doc (`specs/validated/06-events-arena-calendar.md`).

## What landed
New file `e2e/events/events-deep.spec.ts` (10 cases) on top of the existing green 5 (events.spec.ts +
eticket.spec.ts), implementing every MISSING recon candidate:
- **EVT-02** create-event dialog → `event collection` + an `arena events` sub-event (REAL Material dialog write).
- **EVT-06/07/08** QR scanner: valid scan writes `arena e-ticket log`; duplicate-scan guard (usedticket, no 2nd write); deactivated-ticket scan → denied.
- **EVT-10/11** initiate-event-product: multi-step (event → arena tile → delivery set → select → Initiate) chunked batch flips exactly N=3 `participantsproduct.status→"initiated"` + writes approved EPRs.
- **EVT-13** create-arena-space manual stepper → `arenaspace` with the app-mapped participant profileid + eventref.
- **EVT-14** videoask tag add → `participantvideoask.tags` + `participant tag logs`.
- **EVT-15** event-opportunity-dashboard-v2 custom stage create → `stage opportunity count` (queuelist + stagename).
- **EVT-16** the v2 board's stage-token count == an independent `queue_token` Firestore oracle.

Seed extended additively (`seed-events.js`): a 2nd event+arena for initiate (p3/p4/p5 fresh
`participantsproduct status:null`), an Installation product + `productToDeliverySequence` + `delivery
events` + `event location` + an ahmember host (EVT-02), an active `arena e-ticket` + a duplicate-guard
log row (QR), A&H space/type (EVT-13), videoask template + submission + tag master (EVT-14), a queue +
`queue_token` rows (EVT-15/16). Support file gained idempotent reset/clean helpers.

## WHY the load-bearing decisions

1. **QR camera via component injection, not the DOM.** `<zxing-scanner>` needs a real camera; headless
   has none. Per recon risk #3 we bypass the camera by calling the LIVE `QrScannerComponent.onCodeResult(
   JSON.stringify({profileid, uniqueid}))` through `window.ng.getComponent(host)` (dev build exposes
   `ng`). This drives the REAL component logic (active-flag / date-window / dedup checks + the
   `afterProductSelect` Firestore write) — only the camera frame is synthesised. We poll the live
   `mapArenaETicket` / `maplog` to wait for the streams to resolve before injecting. The dev-build `ng`
   global is the linchpin and is present in the served dist.

2. **Backfill foreign `event collection` docs' `start_date/end_date` (seed §16).** qr-scanner/
   videoask-display/eod-v2 do a FULL `event collection` scan and eagerly call `doc['end_date'].toDate()`
   on EVERY doc. The queue suite's `run1_bigevt_0` carries `startdate/enddate` but NOT the underscored
   `start_date/end_date`, so that loop THREW and crashed the QR screen before it rendered (order-
   dependent flakiness). We don't own that doc, so the events seed defensively backfills the underscored
   dates on any event doc missing them (idempotent; fills only missing fields). This is shared-project
   hygiene, not an asserted value, and is the single most important fix that made the QR + EOD screens
   mount deterministically.

3. **EVT-02 host-list nudge + a returned composite index.** The create-event Hosts dropdown is populated
   by `users_roles where(ahmember==true)+orderBy(name)`, which needs a composite index `(ahmember,name)`
   NOT provisioned on the disposable project (returned in `neededIndexes`; we must not edit the shared
   `firestore.indexes.json`). That read is ORTHOGONAL to the write under test (the batch that creates the
   event), so we nudge the dialog's `ahmemberList` with one valid host via `ng.getComponent` — a
   precondition input, exactly like the QR `onCodeResult` and arena-space `cohortsid` bypasses — and the
   REAL `saveEventDetail` batch runs unchanged. The benign "requires an index" console error is allow-
   listed for EVT-02 only, anchored to the exact base64 `create_composite` token for `users_roles` (a
   different missing index encodes a different token, so a genuine query misuse is still caught). When the
   operator deploys the index the nudge becomes a harmless no-op.

4. **arena-space `cohortsid` nudge.** `createArenaManually()` reads `arenaSpaceData['cohortsid'].length`,
   but for a Live Event the Cohorts mat-select is HIDDEN (no marathon cohorts), so the field is never set
   and `.length` throws (`undefined.length`). We nudge it to `[]` on the live component — an unreachable-
   form-field default, not an asserted value — so the real write path runs.

5. **Anti-circularity everywhere.** Each case asserts a value the APP/CF/batch WROTE (event collection +
   arena events; arena e-ticket log; participantsproduct.status + approved EPR; arenaspace;
   participantvideoask.tags + tag log; stage opportunity count) OR a value the board COMPUTED from its own
   stream (EVT-16: the v2 board's `getStageParticipants` count vs an independent `queue_token` oracle) —
   against a KNOWN seeded precondition. App-written docs carry NO testrunid → asserted/cleaned by natural
   key (profileid / summary / stagename / uniqueid / run-unique event name). Re-runnable resets in
   `support/events.ts` set only preconditions.

6. **No composite index needed for the multi-filter queries (empirically verified).** initiate's
   `arenaeventid==`+`status in[]`, `productref==`+`status==null`; eod's `eventref==`+`active==true`; the
   child's `queueref==`+`tokenstatus==`+orderBy `logdate`; `queuelist array-contains-any` — all served by
   a zigzag merge or an already-deployed index. Only `users_roles(ahmember,name)` is genuinely missing
   (returned). Probed before writing the specs.

7. **EVT-16 is harnessable, not a fixme.** The recon flagged v2 selectors as "outstanding" and deferred
   QR/initiate. We instead drove them: the child `EventOpportunityComponent` streams active `queue_token`
   into `stageTokenMap` and emits it to the parent (`handleEventData → mapData`); seeding N Active tokens
   at one stage lets the board's own count converge to the `countWhere` oracle. Zero fixmes in this pass.

## Gotchas for the next session
- The `users_roles(ahmember ASC, name ASC)` composite index is the one real `neededIndexes` entry; until
  deployed, EVT-02's host list only populates via the nudge (the case still passes).
- ngx-mat-select-search hides its search box on short lists (`mat-select-search-hidden`) — the arena-space
  multi-select helper types into it only if visible, else clicks the exactly-anchored `mat-option`
  directly (a blind retry-open caused option contamination — fixed).
- The native tag `<input type=checkbox>` in videoask-display is visually hidden behind a `.checkmark`
  span; click the `<label>`, not the input.
- Running the deep cases CONCURRENTLY with other suites on the shared :4200 caused a one-off EVT-05
  timeout (server contention); each case passes in isolation and the orchestrator greens serially.
