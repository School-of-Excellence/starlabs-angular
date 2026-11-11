# Contract: jc-onboarding-board
Surface: /journey-coach-health -> Onboarding tab -> Onboarding pipeline card (embedded journeycoach-dashboard)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health (click tab "2 Onboarding")

## Requirement (operator, 2026-11-11)
"When I say pipeline, I want to see and move cards." A card board (Sources-board style) inside the pipeline card (the 4 count tiles were folded into its column headers 2026-11-11),
one column per stage (Not Assured / Ready for Onboarding / Scheduled for Onboarding / Onboarded).
Decisions: moves open the existing flow; forward only; keep tiles + table; card buttons Schedule/Re-schedule,
Mark Onboarded, Journey Plan, Notes.

## User moves
1. Open the Onboarding tab; scroll to the pipeline. Board (testid: jcd-pipe-board) shows 4 columns
   (jcd-pipe-col-notassured / -ready / -scheduled / -onboarded) of cards (jcd-pipe-card).
2. Drag a Ready card onto Scheduled: the existing Schedule Appointment dialog opens; save -> card lands in Scheduled.
3. Drag a Scheduled card whose call time has passed onto Onboarded: the existing Onboard Remark dialog opens.
4. Drag a Not Assured card anywhere, or any card backwards: card snaps back with a message.
5. Card buttons: jcd-pipe-card-schedule, jcd-pipe-card-onboard, jcd-pipe-card-plan, jcd-pipe-card-notes.
6. Journey selector filters the board as well as the counts.

## Invariants
- Column card count == its count tile == its table rows (same originalData set).
- Forward only; Not Assured blocked; Scheduled -> Onboarded blocked while the call is upcoming (same rule as the table's Mark Onboarded).
- The drop handler never writes Firestore; only the existing dialogs do. Cancelled dialog = no change.
- Onboarded cards are not draggable.
- Standalone /JourneycoachDashboard-new unchanged; board CSS scoped to .jcd-embed.

## Banned
- New component / dialog / package for the board (uses CDK drag-drop already in the repo).
- Direct Firestore writes on drop; backward stage moves.
- Production Firebase as a test target; participant PII in logs/commits.

## Known limitations
- No paging inside a column (columns scroll); fine for current volumes.
- Org-wide; does not follow the Viewing coach selector.

## Hooks (literal)
- jcd-pipe-board, jcd-pipe-col-notassured, jcd-pipe-col-ready, jcd-pipe-col-scheduled, jcd-pipe-col-onboarded,
  jcd-pipe-card, jcd-pipe-card-schedule, jcd-pipe-card-onboard, jcd-pipe-card-plan, jcd-pipe-card-notes

## Proof
- Check: qa/checks/jc-onboarding-board.mjs (runs the real pipelineMove rules + template/scope asserts)
- Command: node qa/checks/jc-onboarding-board.mjs
- Fail if reverted: yes
- Last run (2026-11-11): PATCHED 13/13 PASS; REVERTED 13 FAIL; RESTORED PASS. jc-onboarding-pipeline, jc-health-onboarding-tab, jc-onboarding-count-only, jc-health-tabs, je-dashboard-jc-fixes PASS.
- Prod build (2026-11-11): `npx ng build --configuration production` -> EXIT 0 (pre-existing CommonJS warnings only).
- Live (starlabs-test, :4300, 2026-11-11, Apr 2026): PASS
  - Cards per column 5 / 1 / 2 / 0 == tiles 5 / 1 / 2 / 0.
  - Drag Not Assured -> Ready: snaps back, "Not Assured needs a payment plan before onboarding."
  - Drag Scheduled -> Ready: snaps back, "Cards move forward only..."
  - Drag Ready -> Scheduled: Schedule Appointment dialog opened; closed without saving -> board unchanged 5/1/2/0.
  - Drag Scheduled (call passed) -> Onboarded: Onboard Remark dialog opened; closed without submitting -> unchanged.
  - Card buttons: Schedule opens Schedule Appointment; Notes opens Add Note; Not Assured card has Notes only;
    Scheduled card has Schedule, Mark Onboarded, Journey Plan, Notes.
  - Journey FTM: board 1/0/0/0 (only FTM badges); All restores 5/1/2/0. No table opened by the board.
  - Drag tested with touch events (CDK ignores synthetic mouse events); a real mouse drag lifted the card in the browser.
