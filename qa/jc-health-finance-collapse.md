# Contract: jc-health-finance-collapse
Surface: /journey-coach-health (JourneyCoachHealthDashboardComponent, Summary view)
Env: starlabs-test emulator (never production)
App command: npm run start:emulator  (ng serve --configuration emulator, served on :4300)
URL: http://localhost:4300/journey-coach-health

## User moves
1. Open the URL logged in as a journeycoach; Viewing = All participants
2. See the Needs-attention hero with a FINANCE breakdown row beneath it: Defaulted + Payments locked chips (testid: jchd-hero-finance)
3. The KPI tile row no longer shows standalone Defaulted / Payments locked tiles (now 5 tiles: Going quiet, Missed, Renewing 90d, People with tickets, Flagged)
4. Click the Defaulted chip (testid: jchd-hero-defaulted) -> drills into the Participants view filtered to defaulted (via goToDefaulted(), unchanged)

## Invariants
- RELOCATION, not removal: Defaulted and Payments locked move from the KPI tile row INTO the Needs-attention hero as finance chips. Both stay visible, keep their live counts (summary.defaulted / summary.paymentsLocked), and keep their original drills (goToDefaulted / goToPaymentsLocked).
- The standalone ios2-tile buttons for Defaulted / Payments locked no longer exist.
- The pre-existing Participants-view finance filter mini-cards (which also call goToPaymentsLocked) are untouched.
- Every other element of the dashboard is unchanged (completeness).
- Works in both light and dark themes (chips use the shared tokens).

## Banned
- Deleting the goToDefaulted / goToPaymentsLocked handlers or the summary.defaulted / summary.paymentsLocked counts.
- Removing any other KPI tile, hero, card, or drill.
- Production Firebase as a test target.

## Hooks (literal strings only)
- jchd-needs-attention  -> the Needs-attention hero button
- jchd-hero-finance      -> the finance breakdown row in the hero
- jchd-hero-defaulted    -> Defaulted chip (goToDefaulted)
- jchd-hero-locked       -> Payments locked chip (goToPaymentsLocked)

## Proof
- Check: qa/checks/jc-health-finance-collapse.mjs (static source assertions)
- Command: node qa/checks/jc-health-finance-collapse.mjs
- Fail if reverted: yes
- Last run (2026-11-09): PATCHED 10/10 PASS (exit 0); REVERTED 8 FAIL (exit 1); RESTORED PASS.
- Live (emulator :4300, 2026-11-09): PASS — finance chips render under the hero in light AND dark; KPI row shows 5 tiles; clicking Defaulted drills to the Participants view (goToDefaulted fired); no console errors from the change (only pre-existing FCM permission-blocked noise).
