# Contract: jc-health-dark-mode
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent)
Env: starlabs-test  (Firebase starlabs-test + watson-test-19 — never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/journey-coach-health

## User moves
1. Open the URL, click the theme toggle in the header
2. Expect the dashboard to switch between dark and light
3. Reload the page — expect the chosen theme to persist
4. Open the A&H drill and a participant slide-over in dark — expect both themed

## Invariants
- data-theme on .jchd-wrap drives the whole dashboard's tokens
- The stylesheet READS the dark tokens (var(--...)) — defining tokens nothing reads is a no-op
- The choice persists across a reload (localStorage jchd-theme)
- prefers-color-scheme is the default; an explicit light choice overrides it
- Every CDK overlay that renders OUTSIDE .jchd-wrap carries the jchd-overlay-dark panelClass:
  slide-over, its log composer, log-call dialog, set-health dialog
- No visible element inside .jchd-wrap keeps a near-white background in dark

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only — no ${interpolation})
- (header toggle is .jchd-theme-toggle; overlay panelClass jchd-overlay-dark)

## Proof
- Spec path: qa/checks/jc-health-dark-mode.mjs
- Command: node qa/checks/jc-health-dark-mode.mjs
- Command: npx ng test --include "src/app/Journey Onboarding/journey-coach-health-dashboard/*.spec.ts" --ts-config tsconfig.spec.jc.json --watch=false --browsers=ChromeHeadless
- Fail if reverted: yes
- Last run: PASS — 2026-09-24
- Revert proof: drop the log-call panelClass -> FAIL DM9; drop [attr.data-theme] -> FAIL DM5; both exit 1

## Evidence (live, 2026-09-24)
- Env: starlabs-test (non-prod), Chrome, authenticated session
- URL: http://localhost:4200/journey-coach-health
- dark:  .jchd-wrap background rgb(14,14,17), colour rgb(245,245,247)
- light: .jchd-wrap background rgb(242,242,247), colour rgb(28,28,30)
- Persistence: survives a full page reload (localStorage jchd-theme)
- Light leaks: **0** near-white backgrounds across every visible element in .jchd-wrap
- A&H drill in dark: overlay rgb(27,27,32), 7 rows, mat-dialog-container count 0
- Slide-over in dark: panelClass jchd-overlay-dark applied, surface rgb(27,27,32), 0 light leaks
- node qa/checks/jc-health-dark-mode.mjs -> 17/17 PASS (incl. DM12b: 51 tokens defined, 49 read)
