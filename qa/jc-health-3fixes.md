# Contract: jc-health-3fixes
Surface: /journey-coach-health (Journey Coach Health dashboard — Summary + Participants)
Env: starlabs-test (never production)
App command: ng serve   (dev server on http://localhost:4201)
URL: http://localhost:4201/journey-coach-health

## User moves
1. Open the URL logged in as a coach/admin.
2. On Summary or Participants, change the "Viewing" coach (testid: viewing-coach-select).
3. Expect the Participants table (testid: participants-table) to re-scope to the chosen coach (rows change; header count changes).
4. On Summary → Schedule, read the Journey Coaching column (testid: sched-jc-col) and the Onboarding column (testid: sched-ob-col).
5. Expect onboarding calls only under Onboarding, coach calls only under Journey Coaching (open the overdue tiles: sched-jc-overdue / sched-ob-overdue).
6. On the A&H card, click the "Needs Attention · combined" cell (testid: ah-needsattention-combined).
7. Expect a native in-page overlay (testid: ahd-overlay), NOT a Material dialog; its rows (testid: ahd-row) equal the cell count; clicking a row opens that participant's slide-over.

## Invariants
- Changing viewing-coach-select re-scopes participants-table (NOT a no-op).                              [Fix 1]
- onCoachChange no-ops only when the coach is unchanged; otherwise it reloads the base.                  [Fix 1]
- The coach select is one-way [ngModel] (two-way [(ngModel)] would pre-write the model and no-op).      [Fix 1]
- The JC schedule set and the Onboarding schedule set are DISJOINT.                                      [Fix 2]
- A legacy onboarding appointment with no onboarding/journeyid/pjp markers is kept OUT of Journey Coaching by its appointmenttype.onboardingcall type-ref. [Fix 2]
- The A&H drill is the native ahd-overlay; AhFlagListDialogComponent does not exist.                     [Fix 3]
- ahd-overlay row count == the clicked A&H cell count (tile == list).                                    [Fix 3]
- Clicking an ahd-row opens the participant slide-over (openJcParticipant).                              [Fix 3]

## Banned
- `[(ngModel)]="selectedCoachId"` two-way binding on the coach select (defeats the onCoachChange guard).
- A new MatDialog / extra component for the A&H drill list (must be the native in-page overlay).
- Whole-collection getDocs of PII collections to the client.
- `backdrop-filter` on an ancestor of a `position: fixed` overlay.
- Production Firebase as a test target. ATC collections and `src/app/ATC/**`.

## Hooks (literal strings only — no ${interpolation})
- viewing-coach-select        -> Summary/Participants coach <select>
- participants-table          -> Participants mat-table
- sched-jc-col                -> Schedule Journey Coaching column
- sched-ob-col                -> Schedule Onboarding column
- sched-jc-overdue            -> JC overdue count tile
- sched-ob-overdue            -> Onboarding overdue count tile
- ah-needsattention-combined  -> A&H "Needs Attention · combined" cell
- ahd-overlay                 -> native A&H drill overlay panel
- ahd-row                     -> A&H drill overlay row

## Proof
- Spec path: src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.contract.spec.ts  (Karma — logic invariants: isOnboardingAppt disjoint/legacy, openAhDrill signal-not-dialog, pickAhDrill, onCoachChange guard)
- Spec path: qa/checks/jc-health-contract.mjs  (Node — template/structural invariants: one-way binding, onboardingcall discriminator, native overlay, no dialog component)
- Command: npx ng test --include "src/app/Journey Onboarding/journey-coach-health-dashboard/*.spec.ts" --ts-config tsconfig.spec.jc.json --watch=false --browsers=ChromeHeadless
- Command: node qa/checks/jc-health-contract.mjs
- Fail if reverted: yes
- Last run: PASS (Karma, 45/45) | PASS (Node) — 2026-09-24
- Note: --ts-config ALONE does not scope the karma run (the builder globs every *.spec.ts);
  --include scopes what runs, --ts-config scopes the TS program. Both are required.
