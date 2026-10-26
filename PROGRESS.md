# PROGRESS

## Current state
- **starlabs-angular `atc-development`** pushed at `6f510c73`. Deployed only to the branch preview channels
  ("branch channels (dev + prod)"); NOT merged into `development` / `production`.
- **starlabs-e2e-tests `main`** pushed at `4db2c27`.
- **CI "branch suites":** run 40215649769 (attempt 2) is green — all 15 suites; atc 98/98. Every suite runs on this
  branch because its diff carries auth guard files from the `development` merge.
- **Local test harness** stopped 2026-10-26: emulators, the app on :4300 and the :4200 pass-through.
  `src/environments/environment.emulator.ts` is restored to the standard ports (Firestore 8080, Auth 9099).

## Last session changes (2026-10-22 → 26)
- **Map Appointment Role dialog:**
  - it now scrolls (`MatDialogModule`) and has the new look;
  - `syncAtcRoles()` re-uses its controls — the screen rows had stayed bound to replaced controls, so Update silently
    did nothing.
- **Prescribe ATC:**
  - the participant → product order is enforced;
  - WiSH / EI Solution take specialists from the closest past appointment the logged-in specialist hosted;
    assigned_to hosts become "set for all procedures" (added 10-23);
  - the draft keeps the appointment and queue refs;
  - EI **Ask** and WiSH **outcomes** sections, and the WiSH directive look;
  - the AI section shows only when the ATC came from AI;
  - the micro ATC section is hidden for EI / WiSH.
- **Edit ATC:** the Prescribe design and the prototype layout:
  - Ask / outcomes are required on save;
  - the version line, worked out from the `editedfrom` chain;
  - a live subscription — the banner + disabled save when the ATC is upgraded or deleted elsewhere, and the new version
    is built on the live doc.
- **View Prescribed:** the prototype UI, nothing removed. A **Review log** for EI Solution — `reviewlog` array on the
  ATC doc; add / soft delete / undelete for involved specialists + mentor / admin / developer; live in Edit.
- **CI fixes, all in the hub:**
  - pinned `ubuntu-24.04` — `ubuntu-latest` went to 26.04, which Playwright 1.60 can't run on;
  - `ONNXRUNTIME_NODE_INSTALL: skip` — a CF dependency's GPU download timed out;
  - `fillEditorDialog` — a PATC-09 timing race on slow runners.
- **Mistakes and lessons:**
  - I first ran the readiness gate per file; run it like CI: `--base origin/development`;
  - I seeded data while a suite was running;
  - a View Prescribed freeze from `*ngFor` over `atc.data()` — rows are now cached per snapshot.

## Pending
1. **Flutter (Breakthroughs app):** show the new ATC sections to specialists. DRAFT plan with decisions D1–D6:
   `Flutter_Projects/Version_3.44.3/Breakthroughs-Achievement/specs/plans/2026-10-26-atc-wish-ei-specialist-view.md`.
   Key finding: the app has no live specialist ATC-detail screen on `firestore-atc` — only the participant
   `ParticipantATC`. `ClientATC` is deprecated and on the default DB. So "where" is decision D1 (specialist mode in
   ParticipantATC / a new view from "Diagnostics History" / rework ClientATC). No participant screen renders
   `reviewlog` today.
2. **Edit subscription UX** (operator: revisit) — what happens to an orphaned edit draft after an upgrade.
3. **Before Prescribe goes live:** deploy the appointments composite index (`firestore.indexes.json`).
   `reviewlog` sits on the participant-readable ATC doc — the accepted risk; rules can't hide one field — so no
   participant screen (web or Flutter) may render it.
4. **Merge** `atc-development` → `development` when approved (never `main` without approval).
5. **Optional:** upgrade `@playwright/test` to support Ubuntu 26.04, then unpin the runner.
6. **Uncommitted one-liner** in `prescribe-atc.component.ts:407` (`uid` → `this.loggedinUser`) — not from this
   session; review it before committing.
