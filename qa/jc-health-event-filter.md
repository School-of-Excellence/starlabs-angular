# Contract: jc-health-event-filter
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent)
Env: starlabs-test  (Firebase starlabs-test + watson-test-19 — never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/journey-coach-health

## User moves
1. Open the URL, switch to the **Participants** view
2. Open the **Filters** panel (tune icon)
3. Change **Event confirmation** (testid: event-status-filter) to Approved, then Approved + Requested
4. Expect the Participants table row count to change each time

## Invariants
- Changing the Event confirmation filter CHANGES the Participants table (never a no-op)
- Status comparison is case-insensitive (stored values are not normalised)
- A participant with no recent event request is excluded whenever any status is selected
- Clearing filters restores the unfiltered table

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only — no ${interpolation})
- event-status-filter -> Event confirmation mat-select (Participants filter panel)

## Proof
- Spec path: qa/checks/jc-health-event-filter.mjs
- Command: node qa/checks/jc-health-event-filter.mjs
- Command: npx ng test --include "src/app/Journey Onboarding/journey-coach-health-dashboard/*.spec.ts" --ts-config tsconfig.spec.jc.json --watch=false --browsers=ChromeHeadless
- Fail if reverted: yes
- Last run: PASS — 2026-09-24
- Revert proof: delete the row predicate -> FAIL EF4 + EF5, exit 1

## Evidence (live, 2026-09-24)
- Env: starlabs-test (non-prod), Chrome, authenticated session
- URL: http://localhost:4200/journey-coach-health
- Reconcile: no filter **53** rows -> Approved **41** -> Approved+Requested **42**
- node qa/checks/jc-health-event-filter.mjs -> 10/10 PASS
