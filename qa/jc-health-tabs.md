# Contract: jc-health-tabs
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health

## Scope
Journey Coach Health becomes the single journey-coach screen with four top-level tabs:
1. Overall Summary (placeholder — content to be defined)
2. Onboarding (scaffold — Gross/Assured sales + Onboarding by product + intake pipeline next)
3. Ev. Preparation (placeholder — content to be defined)
4. Journey Planning = the existing coach-health screen, unchanged (default tab)

## User moves
1. Open the URL as a journey coach -> tab bar shows 4 tabs, Journey Planning active (testid: jx-tab-planning).
2. The existing screen (Summary / Participants / Coaches, Viewing, all cards) renders exactly as before.
3. Click Onboarding (testid: jx-tab-onboarding) -> Journey Planning content hides, Onboarding panel shows (testid: jx-panel-onboarding).
4. Click Journey Planning -> existing screen returns.

## Invariants
- Default tab is Journey Planning, so no existing behaviour is displaced.
- The existing coach-health markup is wrapped, not edited; every card, drill and the Summary/Participants/Coaches toggle remain.
- Exactly one top-level tab's content renders at a time.
- Viewing / coach dropdown still changes the Participants table (inside Journey Planning).

## Banned
- Removing or editing any existing coach-health element to make the tabs work.
- Production Firebase; secrets; participant PII in logs/commits.

## Hooks (literal)
- jx-tabbar, jx-tab-overall, jx-tab-onboarding, jx-tab-evprep, jx-tab-planning
- jx-panel-onboarding, jx-panel-evprep, jx-panel-overall

## Proof
- Check: qa/checks/jc-health-tabs.mjs
- Command: node qa/checks/jc-health-tabs.mjs
- Fail if reverted: yes
- Last run (2026-11-09): PATCHED 9/9 PASS; REVERTED 8 FAIL (TB9 completeness stays green); RESTORED PASS.
- Live (starlabs-test, :4300, 2026-11-09): PASS — tab bar renders; Journey Planning shows the full existing screen with live data; Onboarding tab swaps in its panel and hides Journey Planning.
