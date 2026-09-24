# Contract: jc-health-na-reasons
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent)
Env: starlabs-test  (Firebase starlabs-test + watson-test-19 — never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/journey-coach-health

## User moves
1. Open the URL, switch to the **Participants** view
2. Look at the Priority cell of any flagged participant
3. Expect a chip per live needs-attention reason

## Invariants
- naReasonsFor() mirrors isNeedsAttention() trigger-for-trigger (no trigger without a label, no label without a trigger)
- Going-quiet and renewals are NOT reasons — they keep their own tiles
- A clean row produces no chips
- Ticket counts are pluralised; locked and defaulted are mutually exclusive labels

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only — no ${interpolation})
- (chips are .na-why / .na-chip in the Priority cell)

## Proof
- Spec path: qa/checks/jc-health-na-reasons.mjs
- Command: node qa/checks/jc-health-na-reasons.mjs
- Command: npx ng test --include "src/app/Journey Onboarding/journey-coach-health-dashboard/*.spec.ts" --ts-config tsconfig.spec.jc.json --watch=false --browsers=ChromeHeadless
- Fail if reverted: yes
- Last run: PASS — 2026-09-24
- Revert proof: drop the llCritical label -> FAIL NR7; drop the build-site assignment -> FAIL NR3; both exit 1

## Evidence (live, 2026-09-24)
- Env: starlabs-test (non-prod), Chrome, authenticated session
- URL: http://localhost:4200/journey-coach-health
- Reconcile: 40 of 53 rows on page 1 rendered a .na-why group (50 chips total);
  the remaining rows had no live trigger
- node qa/checks/jc-health-na-reasons.mjs -> 17/17 PASS
