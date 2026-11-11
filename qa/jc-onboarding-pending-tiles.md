# Contract: jc-onboarding-pending-tiles
Surface: /journey-coach-health -> Onboarding tab (embedded journeycoach-dashboard, [embedOnboarding]="true")
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4307
URL: http://localhost:4307/journey-coach-health (click tab "2 Onboarding")

## Requirement (operator, 2026-11-11; plan signed off)
- Item 3: the embedded Gross Sales card keeps its count and gains a "Pending approval N" chip. N = getGrossPendingCount()
  (engine.countPending: status null / missing / '' / 'pending'). Clicking it opens the existing Gross Sales table with
  only the existing Status filter set to Pending. No new query.
- Item 4: the pipeline card's 4-tile row (repeat of the board column counts) is removed; the board column headers carry
  the tile subtitle and their count badge becomes the drill-down button (same testids). Caption + journey selector kept.

## User moves
1. Open the URL, click Onboarding (testid: jx-tab-onboarding).
2. Gross Sales card shows the count (jcd-embed-gross-count) and "Pending approval N" (jcd-embed-gross-pending).
3. Click the chip: the Gross Sales table opens below with Status = Pending and exactly N rows; the card click does not
   also fire (the table stays open, not toggled shut).
4. Pipeline card: no tile row; each column header shows title + subtitle + count button
   (jcd-pipe-notassured / jcd-pipe-ready / jcd-pipe-scheduled / jcd-pipe-onboarded). Click one: its table opens with
   that many rows and the button is highlighted (class on). Click again: table closes.
5. Open /JourneycoachDashboard-new: no chip; the Gross card legend still shows Pending/Assured/Not-assured.

## Invariants
- Chip N == rows in the opened Gross Sales table (count and the Status filter share engine.isPending) == the footer
  "of N" (the footer now counts the filtered rows; it used to count the unfiltered source, so any filter showed the wrong total).
- Each column count button N == rows of the table it opens (same originalData key).
- Pipeline drill-downs kept: four counts, four tables (nothing lost by removing the tiles).
- Gross count line unchanged (jc-onboarding-count-only CO1/CO6 green).
- Standalone dashboard unchanged apart from the Status filter predicate now matching its own Pending legend
  (a sale whose status is the literal "pending" now filters as Pending instead of Approved).
- JC pipeline vs Onboarding: this tab is Onboarding only; Journey Planning lists untouched.

## Banned
- New Firestore query / field; new component or MatDialog.
- Removing any card, metric, link or drill-down beyond the tile row.
- backdrop-filter / filter / transform on an ancestor of a position:fixed overlay.
- Production Firebase as a test target; participant PII in logs/commits.

## Hooks (literal strings only)
- jcd-embed-gross-pending -> Pending approval chip
- jcd-pipe-notassured, jcd-pipe-ready, jcd-pipe-scheduled, jcd-pipe-onboarded -> column header count buttons

## Proof
- Spec path: qa/checks/jc-onboarding-pending-tiles.mjs (+ updated jc-onboarding-pipeline PL2/PL14, jc-onboarding-board KB1)
- Command: node qa/checks/jc-onboarding-pending-tiles.mjs
- Fail if reverted: yes
- Last run (2026-11-11): PATCHED 10/10 PASS; REVERTED component files -> 9 FAIL (pending-tiles; PT8 caption-kept stays green),
  2 FAIL (pipeline PL2, PL14), 1 FAIL (board KB1); RESTORED -> all 16 qa/checks PASS.
- Live (starlabs-test, dev config, localhost:4301, 2026-11-11): PASS
  - Nov 2026: Gross 2, chip "Pending approval 1" -> Gross Sales table, Status = Pending, 1 row.
  - Apr 2026: Gross 31, chip 16 -> table 16 rows (2 pages), footer "of 16", legend Pending 16, chip highlighted;
    second chip click keeps the table open; Status All -> 31 rows, footer "of 31".
  - Before the footer fix the footer read "of 31" with 16 filtered rows (it counted the unfiltered source).
  - Pipeline: tile row gone; headers Not Assured 5 / Ready 1 / Scheduled 2 / Onboarded 0 with subtitles;
    each count opens its table with the same row count (5/1/2/0), button highlighted; second click closes.
  - Standalone /JourneycoachDashboard-new: no chip, no pipeline; legend Pending/Assured/Not-assured and Gross detail present.
  - Console: only the pre-existing FCM notification-permission error.
