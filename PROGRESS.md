# PROGRESS

## Current state
- **starlabs-angular** on `atc-development`: everything below is local and UNCOMMITTED. Git writes are blocked for Claude; the operator commits. Nothing is deployed. `origin/development` does not have the 10-15→10-21 appointment/ATC work.
- **starlabs-e2e-tests** on `main`, UNCOMMITTED: 4 new specs, 8 changed files (see the journal). Make a branch before committing.
- Local harness, still running:
  - emulators (Firestore 8181 / Auth 9097 / Storage 9199) via `scratchpad/emu/start.sh`;
  - `ng serve --configuration emulator` on :4300;
  - `scratchpad/proxy4200.js` (forwards :4200 → :4300 for the hub's webServer check).

## Last session changes (2026-10-22 → 23, incl. the overnight run)
- **Map Appointment Role dialog:**
  - MatDialogModule (scroll), restyle;
  - `syncAtcRoles()` fix: rows stayed bound to replaced controls, so Update silently did nothing.
- **Prescribe ATC:**
  - participant → product gating (also for AI entries);
  - WiSH/EI appointment prefill;
  - queue refs in the draft;
  - EI **Ask** and WiSH **outcomes** (`ask` / `outcomes`) and the WiSH directive look;
  - section and check order: directive → Ask/Outcomes;
  - AI section only for AI content;
  - spacing tweaks.
- **Edit ATC (overnight):** Prescribe design laid out as the prototypes:
  - read-only top card;
  - Ask/Outcomes, required on save;
  - save checks author → directive → ask/outcomes;
  - "Update changes in ATC" panel with "Saving creates version N" (from the `editedfrom` chain);
  - new-adjustment change-agent inheritance;
  - AI content rule.
- **View:** View Prescribed full ATC, /previewATC and Edit's pre-save preview show Ask / WiSH outcomes and the "Immediate outcome" label.
  - Fixed a View Prescribed freeze: looping over `atc.data()` re-rendered without end.
- **Tests:** final clean run atc 92/92, appointments 63 passed / 0 failed / 6 pre-existing skips; production build OK; readiness gate green.

## Pending
1. Operator review + manual test of Edit ATC and the View cards (morning).
2. Commit both repos (test repo on a branch); push only when asked.
3. Deploy the appointments composite index (`firestore.indexes.json`) before Prescribe goes live.
4. Open question: should the participant's own ATC view show Ask / outcomes? (Left unchanged by decision.)
5. Stop the local harness when done; restore `src/environments/environment.emulator.ts` from the scratchpad backup if it was edited.
