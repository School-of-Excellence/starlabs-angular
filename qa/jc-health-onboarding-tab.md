# Contract: jc-health-onboarding-tab
Surface: /journey-coach-health -> Onboarding tab (JourneyCoachHealthDashboardComponent)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health (click tab "2 Onboarding")

## Scope
The Onboarding tab of Journey Coach Health shows, top to bottom:
1. The Journey Experience date filter (Month / Range / days / Calendar) — it drives the numbers below.
2. Gross Sales and Assured Sales cards (side by side).
3. Onboarding · by product: To onboard / <=7 days / 7+ days / Not assured, Onboarded this month,
   OB calls / JC calls / Avg OB days / Avg purch days, the per-product table, Schedule and Pipeline.
4. (2026-11-11) The 4-stage onboarding pipeline card, then the table opened from any count — see jc-onboarding-pipeline.
   The former intake funnel (onboarding-pipeline component) was removed from this tab by operator decision.

All items are the EXISTING journeycoach-dashboard component embedded with [embedOnboarding]="true".
Nothing is duplicated.

## User moves
1. Open the URL, click Onboarding (testid: jx-tab-onboarding).
2. See the date filter, Gross Sales, Assured Sales, Onboarding by product with its product table.
3. Scroll: the intake pipeline (testid: jx-onboarding-pipeline) sits below the table.
4. Click "Pipeline ->" in the by-product card: the page scrolls to the pipeline (no new browser tab).
5. Click "Open table" on Gross Sales: its table opens (drill-downs preserved).
6. Open /JourneycoachDashboard-new: the standalone dashboard is unchanged (all 14 cards, brand, theme toggle).

## Invariants
- embedOnboarding defaults to false: the standalone Journey Experience dashboard is unchanged.
- In embed mode only AR Health, the rail, rows 3-4, the brand, Love pill and theme toggle are hidden;
  Gross, Assured, Onboarding by product, the table section and all dialogs remain (every drill-down works).
- The pipeline renders below the by-product table, never above.
- Reconcile: "To onboard" (by product) == pipeline "To Be Onboarded" + "To Be Onboarded · Welcome Call"
  (live 2026-11-09: 7 == 6 + 1).
- Embed CSS is scoped to .jcd-embed; the full-screen fixed loader becomes local; the sticky toolbar is static.

## Access scope — DECIDED (operator, 2026-11-10): coaches see it
/JourneycoachDashboard-new is protected by its own route-config roles; the component does not enforce them.
Embedding it here means everyone who can open /journey-coach-health sees org-wide Gross/Assured sales.
Operator decision: this is intended — journey coaches do onboarding and should see these figures. No extra
role gate on the Onboarding tab. Revisit only if the coach-health audience widens beyond journey coaches.

## Known limitations (follow-ups)
- Numbers are org-wide (as in the Journey Experience dashboard); they do not follow coach-health's Viewing coach selector.
- "Not assured" in the by-product card is month-filtered; the pipeline's Not Assured bucket is not (since 2025-01-01) — different scopes by design today.
- The embedded dashboard loads its full data set even though only three sections show.

## Banned
- Removing any element from the standalone Journey Experience dashboard.
- Duplicating the sales / onboarding logic into coach-health.
- Production Firebase as a test target; participant PII in logs/commits.

## Hooks (literal)
- jx-panel-onboarding, jx-onboarding-sales, jx-onboarding-pipeline (+ existing jcd-* hooks)

## Proof
- Check: qa/checks/jc-health-onboarding-tab.mjs
- Command: node qa/checks/jc-health-onboarding-tab.mjs
- Fail if reverted: yes
- Last run (2026-11-09): PATCHED 12/12 PASS; REVERTED 9 FAIL; RESTORED PASS. jc-health-tabs + jc-onboarding-decouple still PASS.
- Prod build (2026-11-10): `npx ng build --configuration production` on jc-health-tabs -> EXIT 0 (pre-existing CommonJS / bootstrap-selector warnings only; no budget errors).
- Live (starlabs-test, :4300, 2026-11-09): PASS — tab renders filter, Gross/Assured, by-product (To onboard 7; uP! 4, FTM 3) and the pipeline below; Pipeline link scrolls to the pipeline in-page; no console errors; standalone dashboard shows all 14 cards.
