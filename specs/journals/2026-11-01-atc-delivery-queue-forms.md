# 2026-11-01 — Delivery and queue forms on View ATC

Plan: `specs/plans/2026-11-01-atc-delivery-queue-forms.md` (approved 2026-11-01).

## What landed
- **Flutter** (`Breakthroughs-Achievement`, `atc-feature`): the home delivery card's FILL button
  (`lib/Widgets/productDeliverySequence.dart`) now passes the step doc's own `participantproductid` in `metadata`
  (was the app's `activeparticipantproductid`). `FillForm` merges `metadata` into the `formsByClient` answer.
- **Prescribe ATC**: `prefillFromAppointment()` looks up the `deliverables` step whose `fileref` holds the found
  appointment and keeps its `participantproductid` — saved in the draft, patched back, cleared with `appointmentId`,
  written on the ATC next to `appointmentid`.
- **View ATC**: the Forms card has three parts — Delivery activities (`participantproductid`), Queue activities
  (`queueid` → `queueref`), ATC forms (unchanged logic; a "These open once the ATC is validated" note when the model
  has forms but the ATC isn't validated). Loaded once on open; every answer, newest first; View answer reuses the
  existing overlay.

## Why it is shaped this way
- **The purchase, not the product, is the key.** A participant can buy WiSH twice; `appointment.productid` is the
  catalogue product and the same for both. `participantproductid` names one purchase. The link already existed:
  ATC → `appointmentid` → the delivery step whose `fileref` holds that appointment → `participantproductid`
  (the same reverse lookup `mark-appointment-status` uses).
- **Found while prescribing, not at submit.** A draft can be submitted offline; the lookup needs the network, and
  so does finding the appointment, so both happen in the same place and travel in the draft.
- **Queue ATCs keep only `queueid`.** Verified: a queue-prescribed ATC saves `queueid`, `stagename`,
  `liveassignmentid` and no purchase. Queue answers already store `queueref` (`queue generation/{id}`, forms DB) on
  web and app, so the queue part queries that. Most queue tokens do carry `participantproductid` (Cloud Function
  `participantproduct.js`, queue transfer) — left unused by decision.
- **One Flutter entry point.** The journey screens' `FillForm` calls (`participantDeliverySequence.dart:336`,
  `participantJourneySequence.dart:1112/1212/1278`) are inside `/* … */` blocks — dead code. Only the home FILL
  button fills delivery-sequence forms, and it already reads the step doc right before opening the form.
- **No extra conditions (operator).** No de-duplication, no fallback id, no participant re-check. If a form shows
  twice, it stays visible so the cause can be traced and the flow iterated.
- **Decided, not covered:** answers saved without `participantproductid` (before 2026-05-14 `ca37bf7`, or from the old
  journey screens) are not shown; ATCs with neither id show no delivery / queue part.

## Findings
- App drafts go to the app's draft collection and web drafts to `temporary_forms` — never `formsByClient`, so
  half-filled forms can't appear in either part.
- The answer overlay needs the `delivery forms/{formid}` template doc; an answer whose template is gone opens empty.
- `VATCF-03` changed meaning: an unvalidated ATC whose model has forms now shows the Forms card with the locked note.

## Tests (emulator only)
- Hub (`starlabs-e2e-tests`): `atc/seed-atc.js` phase 3 gets the delivery steps holding `apPast` / `apOlder` (two
  purchases); phase 7 is the tfp world (two WiSH purchases, a queue ATC, four negative controls) plus tfm's app form
  step. New `atc/view-prescribed-atc-activities.spec.ts` (VATCA-01..04); PTPL-02/03/05 assert `participantproductid`;
  VATCF-03 now expects the locked note. Run: prescribe-atc-templates + view-prescribed-atc-forms +
  view-prescribed-atc-activities + view-prescribed-atc → **37/37 passed** (3.5 min). Readiness: MATCHED, 331 selectors.
- Flutter: `integration_test/features/delivery_form_purchase_test.dart` — the app's active purchase is set to a
  different id; the answer the app wrote carries the step's `participantproductid`, the step is completed and points at
  it → **passed** on the iOS simulator (settings swap approved by the operator, both files restored, checksums match).

## What went wrong on the way
- Flutter run 1: the seeded participant had no `profileverified`, so the app opened Profile Verification (and that
  screen threw on a missing `assets/data/phone_validation.json`). Phase 7 now sets `enable` / `profileverified` on tfm
  and seeds `static meta data/HPC Config` (the home null-checks it).
- Flutter run 2: my test injected the delivery list as a typed `List<Map<String, Object>>`; the card's
  `firstWhere(orElse: () => null)` needs the dynamic list Firestore gives. Test fixed — not an app bug.
- `git commit` was denied by permission (as on 2026-10-30): everything is uncommitted in all three repos.

## Pending
- Commit (operator), in three repos: starlabs-angular, starlabs-e2e-tests, Breakthroughs-Achievement.
- Production Firestore rules must allow specialists to run list queries on `formsByClient` (already on the list).
