# Contract: je-dashboard-jc-fixes
Surface: /JourneycoachDashboard-new  (journeycoach-dashboard component — JE Dashboard)
Env: starlabs-test (non-prod)
App command: npx ng serve  (or preview "je-dashboard" on :4203)
URL: http://localhost:4203/JourneycoachDashboard-new

## User moves
1. Open the URL logged in as an A&H coach/admin.
2. Toggle the theme button (testid: jcd-btn-theme) to dark, open any drill table (e.g. Gross "Open table", testid: jcd-lnk-gross-table) — table rows must be readable.
3. In Participant Health, click "Health board" (testid: jcd-ph-healthboard) — opens the health board in a NEW browser tab.
4. In Participant Health, read the Tickets tile (testid: jcd-ph-tickets) — an open-tickets count; clicking it opens the health board.
5. In "Outreach · top", each row (testid: jcd-ph-needsattn-row) shows a reason string matching the JC-Health dashboard style ("driver + driver -> action").

## Invariants
- Dark mode: the drill table (.jcd-td / .jcd-th) renders legible text on a dark surface (was invisible before).
- The ATC collections (atc_alpha / atc_to_validate) are NOT read by this component (getAtcAlpha is never called).
- goToHealthBoard opens a NEW TAB (window.open), not an in-app navigation.
- Open-tickets tile count comes from a server-side getCountFromServer aggregation (open only) — no whole-collection clientissue fetch in the health loader.
- The Outreach reason equals priority.engine scorePriority(...).reason (the JC-Health reason), not the old hand-rolled statusLine.
- The health-loader appointments query filters journeycoach==true, attended==true, cancelled==false in the QUERY (server-side).
- JC pipeline / coach pending-due-overdue are Journey Coaching only; Onboarding stays its own column (unchanged by this chunk).

## Banned
- Whole-collection getDocs of PII collections to the client.
- ATC collections and src/app/ATC/** (this chunk REMOVES the ATC read).
- backdrop-filter/filter/transform/perspective on an ancestor of a position:fixed overlay.
- New MatDialog for a list that should be a native overlay.
- Production Firebase as a test target.

## Hooks (literal strings only)
- jcd-btn-theme          -> theme toggle button
- jcd-lnk-gross-table    -> Gross "Open table" link
- jcd-ph-healthboard     -> Participant Health "Health board" link (new tab)
- jcd-ph-tickets         -> Tickets tile (open-ticket count; click -> health board)
- jcd-ph-needsattn-row   -> Outreach·top row (shows reason)
- jcd-name-link          -> drill-table participant name link

## Proof
- Spec path: qa/checks/je-dashboard-jc-fixes.mjs
- Command: node qa/checks/je-dashboard-jc-fixes.mjs
- Fail if reverted: yes  (each assertion targets the exact changed source; reverting any of the 6 fixes fails its check)
- Build: npx ng build --configuration production -> exit 0
- Last run: PASS
- Note: the live app is auth-gated (login required), so on-screen "ran on real app" evidence for items 1 (dark table legibility) and 3 (new tab) is pending a logged-in check; the source-contract check + prod build are the runnable artifacts.
