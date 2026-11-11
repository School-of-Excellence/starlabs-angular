# Contract: jc-onboarding-count-only
Surface: /journey-coach-health -> Onboarding tab (embedded journeycoach-dashboard, [embedOnboarding]="true")
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health (click tab "2 Onboarding")

## Requirement (operator, 2026-11-11)
"Gross sales and assured sales, show me just the count, don't need so many details."
On the Onboarding tab each card shows its title, "Open table" and one number:
- Gross Sales = originalData['grosssale'].count (approved + pending gross sales in the date filter)
- Assured Sales = originalData['assuredsale'].count
Hidden on this tab only: rupee value, EMI / approved / pending line, New / Upgrade / Add-on,
Cancelled / Downgrade Old / Downgrade New, Pending / Assured / Not-assured legend, Avg days pill.

## User moves
1. Open the URL logged in as admin/coach, click Onboarding (testid: jx-tab-onboarding).
2. Gross Sales shows one number (testid: jcd-embed-gross-count); Assured Sales shows one number (testid: jcd-embed-assured-count).
3. Click "Open table" on Gross Sales (testid: jcd-lnk-gross-table): the Gross Sales table opens with that many rows.
4. Open /JourneycoachDashboard-new: both cards still show every detail.

## Invariants
- Embed mode: count only; no split / negatives / legend / avg pill render inside the two cards.
- Tile N == opened table rows (Gross Sales).
- Drill-down kept: card click and "Open table" still open the tables.
- Standalone dashboard unchanged: all 14 detail hooks (jcd-div-013..019, 021..027) and the legend render; no .jcd-embed-count.
- Count style scoped to .jcd-embed.

## Banned
- Deleting any detail element from the template (hidden in embed via *ngIf only).
- New component / dialog for the counts.
- Production Firebase as a test target; participant PII in logs/commits.

## Hooks (literal)
- jcd-embed-gross-count -> Gross Sales count (embed only)
- jcd-embed-assured-count -> Assured Sales count (embed only)

## Proof
- Check: qa/checks/jc-onboarding-count-only.mjs
- Command: node qa/checks/jc-onboarding-count-only.mjs
- Fail if reverted: yes
- Last run (2026-11-11): PATCHED 7/7 PASS; REVERTED 6 FAIL; RESTORED PASS. jc-health-onboarding-tab OT5 updated (cards ungated, bodies covered here) 12/12 PASS; jc-health-tabs, jc-onboarding-decouple, je-dashboard-jc-fixes PASS.
- Live (starlabs-test, :4300, 2026-11-11): PASS — Onboarding tab: Gross card text = "GROSS SALES / Open table / 2", Assured = "ASSURED SALES / Open table / 0"; 0 detail hooks in embed; Open table -> Gross table 2 rows (tile 2 == list 2; legend Pending 1 / Not assured 1). Standalone: 14/14 detail hooks, legend present, 0 embed counts, "1 approved · +1 pending" (= 2).
