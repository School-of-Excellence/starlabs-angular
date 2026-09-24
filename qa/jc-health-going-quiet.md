# Contract: jc-health-going-quiet
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent)
Env: starlabs-test  (Firebase starlabs-test + watson-test-19 — never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/journey-coach-health

## User moves
1. Open the URL logged in as a coach/admin
2. Click the **Needs Attention** lever, note the paginator total
3. Click the **Going quiet** lever, note the paginator total
4. Expect no participant to appear under both

## Invariants
- A participant is in EXACTLY ONE of Needs Attention / Going Quiet (Needs Attention wins)
- Needs Attention set ∩ Going Quiet set = empty
- Lever tile N == paginator total for that lever (tile == list)
- The raw goingQuiet flag still drives the base-wide coverage metric (it measures contact, not attention)

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only — no ${interpolation})
- (levers are text-labelled; no new testid required)

## Proof
- Spec path: qa/checks/jc-health-going-quiet.mjs
- Command: node qa/checks/jc-health-going-quiet.mjs
- Command: npx ng test --include "src/app/Journey Onboarding/journey-coach-health-dashboard/*.spec.ts" --ts-config tsconfig.spec.jc.json --watch=false --browsers=ChromeHeadless
- Fail if reverted: yes
- Last run: PASS — 2026-09-24
- Revert proof: route one call site back to `r.goingQuiet` -> FAIL GQ6, exit 1

## Evidence (live, 2026-09-24)
- Env: starlabs-test (non-prod), Chrome, authenticated session
- URL: http://localhost:4200/journey-coach-health
- Reconcile: Needs Attention tile 92 == paginator "1 – 50 of 92";
  Going quiet tile 1 == paginator "1 – 1 of 1"
- Disjointness: intersection of the two participant sets = **0**
- node qa/checks/jc-health-going-quiet.mjs -> 16/16 PASS
