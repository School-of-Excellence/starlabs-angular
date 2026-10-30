# PROGRESS

## Current state
- **starlabs-angular `atc-development`**: last commit `d358aa58` (ATC model image). Everything from 2026-10-27 → 29 is
  **uncommitted** — ATC forms (ATC model config, View ATC forms, form screen Fill / Edit + video fix, Edit ATC WiSH
  rule, review-log access, delivery-form delete flag + Restore). Not pushed or deployed.
- **starlabs-e2e-tests `main`**: pushed at `4db2c27`; the new forms specs + seed changes are **uncommitted**.
- **Flutter `Breakthroughs-Achievement` `atc-feature`**: the participant forms plan + journal, **uncommitted**.
- **Local harness running:** emulators (8080 / 9099 / 9199), the emulator app on :4300, a scratch :4200 pass-through.
  Stop them when done.
- **Last full atc suite on the final code: 114 / 114 green** (local emulator, 2026-10-29).

## Last session changes (2026-10-27 → 29) — journal `specs/journals/2026-10-29-atc-forms.md`
- **ATC model (`/atcmodel`):** `forms: [{formid, filledby}]` config in the dialog (no default, name order, active forms
  only, no template functions); the table shows form names (read by document id).
- **View Prescribed ATC:**
  - "X of N forms submitted" on validated ATCs;
  - on open, a Forms card — rows from `formsubmitted` + a live `atc_form_requests` listener (profileid + this ATC's ids
    incl. earlier versions);
  - Fill / View / Edit for specialist forms, Send / Revoke / Resend for participant forms;
  - soft-deleted / missing forms handled; View = the participant forms overlay.
  - First version froze → rebuilt inline with lookup maps + trackBy.
- **Form screen (`/formtemplate`):**
  - Fill with an ATC check + one transaction for `formsubmitted`, then the tab closes;
  - Edit / resubmit = the B!G `onUpdate` (log the old answer, update the same doc);
  - **video bug fixed** — a SafeResourceUrl was saved to Firestore, so drafts / submits failed and videos never played.
- **Edit ATC:** newly picked WiSH procedures are mandatory (same as Prescribe).
- **Access:** no role check on Forms or the review log (View + Edit). The list query already scopes who sees an ATC;
  Edit keeps only the retired-version guard. `canWrite` removed.
- **Delivery forms:** every save writes `delete` (false / kept true); **Restore form** added.
- **Forms card redesign** (approved mockup): two groups, summary line, status pill + explanation + only that state's
  buttons (View answer / Edit answer / Fill form / Send to participant / Ask to update / Withdraw), Withdraw confirms.
  Forms spec 17/17 after the redesign.
- **Aligned with the Flutter session:** requests carry `formstatus` ('sent' / 'submitted') and are kept after submit;
  **one request doc per ATC + form across ATC versions** (a Resend after an edit rewrites the original doc); a pending
  soft-deleted form keeps Revoke. Atc suite with the Flutter session's web changes: 115/115; **final full atc run on the aligned code: 116/116**.
- **Lessons:**
  - I implemented before confirming; the operator wants sign-off on every detail first.
  - The tests seeded the simplest form shape and missed the video bug — seed real field types.
  - Two tabs on the HTTP/1.1 emulator exhaust Chrome's 6 connections (a harness-only hang).
- **Tests:** atc spec `view-prescribed-atc-forms` 15 cases; journey `atcmodel-forms` 4 + `delivery-form-delete` 1;
  EATT-09 new; EATT-06 / PTPL-06 updated. Full atc suite 112–114 green across runs (ATE-03 c050 flake).
  **Final run on the last code: 114 / 114 green** (2026-10-29).

## Pending
1. **Commit** all three repos (operator). Push only when asked.
2. **Before push:** run the queue (owns formtemplate) and workshops (owns update-delivery) suites; journey only partly
   run. The View ATC "should create" unit stub fails (no Firebase providers) — pre-existing.
3. **Add `delete:false` to the existing `delivery forms`** (real DB — operator), then switch the ATC model dialog to
   query active forms only.
4. **Production Firestore rules:** `atc_form_requests` create/delete, `atc_alpha.formsubmitted` update,
   `formsByClient log` create (+ participant writes later).
5. **Number fields save as text** (`formtemplate.component.html:179, 496`, ts :663) — operator to review.
6. **Flutter participant forms:** a new session; plan `Breakthroughs-Achievement/specs/plans/2026-10-29-atc-participant-forms.md`,
   D2–D6 open (D1 decided).
7. **Deferred:**
   - template function cleanup (View ATC);
   - B!G rework submit on `/formtemplate`;
   - additional forms (parked plan);
   - request notifications;
   - the AddPendingAction save bug;
   - the older Flutter specialist-view plan (2026-10-26, D1–D6).
8. **Carried over:**
   - Edit subscription UX (orphaned draft after an upgrade);
   - the appointments composite index before Prescribe goes live;
   - merge `atc-development` → `development` when approved.
