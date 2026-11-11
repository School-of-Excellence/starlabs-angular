# Contract: jc-onboarding-pipeline
Surface: /journey-coach-health -> Onboarding tab (embedded journeycoach-dashboard, [embedOnboarding]="true")
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health (click tab "2 Onboarding")

## Requirement (operator, 2026-11-11; mockup v3 approved)
The Onboarding tab is the onboarding workspace, top to bottom, all driven by the Journey Experience date filter:
1. Gross Sales / Assured Sales counts (jc-onboarding-count-only).
2. Onboarding · by product (unchanged).
3. Onboarding pipeline: Not Assured (Gross Sales) / Ready for Onboarding (Assured Sales) /
   Scheduled for Onboarding / Onboarded, with a Journey selector.
4. The table, opened only when a count is clicked (pipeline sits above it).
The 5-bucket intake funnel (incl. Welcome Call buckets) is removed from this tab (operator chose
"Replace, drop Welcome Call"); /onboarding-pipeline is unchanged.

## Stage rules (participantjourneyproduct, same sets the by-product card uses)
- Not Assured: paymentplan == null (the 'notassured' set), purchase date in range.
- Ready for Onboarding: paymentplan set, not onboarded, no onboardingscheduled, purchase date in range.
- Scheduled for Onboarding: paymentplan set, not onboarded, onboardingscheduled set, purchase date in range.
- Onboarded: onboarded == true, onboarded date in range (= the existing 'onboarded' set / "Onboarded this month").

## User moves
1. Open the URL, click Onboarding (testid: jx-tab-onboarding). No table is open.
2. Pipeline (testid: jcd-pipe) shows 4 counts: jcd-pipe-notassured, jcd-pipe-ready, jcd-pipe-scheduled, jcd-pipe-onboarded.
3. Click a stage count: its table opens below with that many rows; actions are the existing Schedule / Mark Onboarded / Journey Plan.
4. Click a journey (testid: jcd-pipe-journey-opt): stage counts and the open table change; "All" (jcd-pipe-journey-all) restores.
5. Click To onboard (jcd-div-035): table shows Schedule, Action, Journey Plan together; mobile + email under the
   name (jcd-name-contact); delayed days colour-coded; rows needing a call first.
6. Open /JourneycoachDashboard-new: no pipeline; table columns and order unchanged.

## Invariants
- Tile N == opened table rows for every stage.
- Stages are pairwise disjoint (no participantjourneyproduct doc in two stages).
- Changing the Journey selector changes the stage counts and the open table (not a no-op).
- Changing the date filter changes the stage counts.
- Table opens only from a count click.
- Export keeps every column (display order only changes in embed).
- Standalone dashboard unchanged; all embed CSS scoped to .jcd-embed.
- JC pipeline vs Onboarding: this tab is Onboarding only; Journey Planning tab lists are untouched.

## Banned
- New component / MatDialog for the pipeline (it is a card + the existing table section).
- New Firestore queries or fields (reuses the existing participantjourneyproduct subscriptions).
- Removing any element from the standalone Journey Experience dashboard.
- Production Firebase as a test target; participant PII in logs/commits.

## Known limitations
- Not Assured (pipeline) will not always equal the Gross Sales count: Gross comes from salesleads; a pending sale may have no journey product yet.
- Org-wide; does not follow coach-health's Viewing coach selector.
- Welcome Call is visible only on /onboarding-pipeline now.

## Hooks (literal)
- jcd-pipe, jcd-pipe-notassured, jcd-pipe-ready, jcd-pipe-scheduled, jcd-pipe-onboarded,
  jcd-pipe-journey, jcd-pipe-journey-all, jcd-pipe-journey-opt, jcd-name-contact

## Proof
- Check: qa/checks/jc-onboarding-pipeline.mjs
- Command: node qa/checks/jc-onboarding-pipeline.mjs
- Fail if reverted: yes
- Last run (2026-11-11): PATCHED 14/14 PASS; REVERTED 13 FAIL; RESTORED PASS. jc-health-onboarding-tab (OT8/OT10/OT12 updated), jc-onboarding-count-only, jc-health-tabs, jc-onboarding-decouple, je-dashboard-jc-fixes PASS.
- Prod build (2026-11-11): `npx ng build --configuration production` -> EXIT 0 (pre-existing selector warnings only; covers the count-only commit too).
- Live (starlabs-test, :4300, 2026-11-11): PASS
  - Nov 2026: stages 0/0/0/0; raw sets have no Nov purchases (reconciled per month from component data).
  - Apr 2026: Not Assured 5 / Ready 1 / Scheduled 2 / Onboarded 0 == raw month counts (na 5, open 3 of which scheduled 2).
  - Tile == list: Scheduled 2 -> 2 rows, Ready 1 -> 1, Not Assured 5 -> 5.
  - Disjoint: 8 docs across 4 stages, 0 duplicates.
  - Journey FTM: 1/0/0/0 and the open Not Assured table dropped to 1 row; All restores 5/1/2/0.
  - No table open on load; To onboard table: 7 rows, headers Name, Journey, Purchase Date, ENACH Date, Delayed Days, Sales Person, Schedule, Action, Journey Plan, Schedule For, Payment Plan, Sale Notes, Notes, +; contact line 7/7; delayed-days colour 7/7; unbooked rows first.
  - Standalone /JourneycoachDashboard-new: no pipeline; headers keep Mobile, EMail and the original order; no contact line or colour; Gross/Assured details present.
  - Console: no new errors (only the pre-existing FCM notification-permission error).
