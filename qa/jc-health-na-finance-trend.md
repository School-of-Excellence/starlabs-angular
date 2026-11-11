# Contract: jc-health-na-finance-trend
Surface: /journey-coach-health -> Journey Planning (Summary hero / tiles, Participants tile row, Participants table)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4303
URL: http://localhost:4303/journey-coach-health (tab "Journey Planning")

## Requirement (operator-approved 2026-11-11, item 6)
1. Payments locked AND defaulted leave Needs attention (isNeedsAttention / isNeedsAttentionLite, naReasonsFor,
   activeIssues 'financial'). Summary hero finance chips (jchd-hero-defaulted / jchd-hero-locked) stay.
2. Participants tile row: "Payment defaulted" tile right after Payments locked (count summary.defaulted, click
   goToDefaulted()); literal testids on all tiles; Needs Attention tooltip matches the rule; paged-mode NA count
   now excludes addressed participants like the list does.
3. Daily trend: first load per day per scope (coach profileid or ALL) setDoc
   healthtracker_activity/snap_${scope}_${YYYY-MM-DD} {type:'daily_snapshot', scope, date,
   counts:{needsAttention, goingQuiet, paymentsLocked, defaulted}, needsAttentionIds[], goingQuietIds[], timestamp}.
   No profileid (never in a participant timeline), no names/emails. Taken under the default summary filter (Active,
   all journeys), after every tile input has landed, so snapshot counts == the tiles. Last 14 read by id.
   UI: "+N new" vs yesterday's id list on Needs attention and Going quiet (both views), new rows highlighted
   (jchd-row-new) in the opened list; delta vs yesterday + 14-day sparkline on all four tiles (both views).
   Nothing shows until yesterday's snapshot exists, or when the summary filter is not the default.

## User moves
1. Open the URL, Journey Planning, Viewing = a coach (or All).
2. Summary: Needs attention hero no longer counts locked/defaulted-only participants; finance chips unchanged.
3. Participants: tiles jchd-mc-needs / -quiet / -locked / -defaulted / -renewing / -tickets / -flagged; click
   Payment defaulted -> list filtered to defaulted; tile N == list length.
4. First load of the day writes today's snapshot doc; second load does not rewrite it.
5. With yesterday's snapshot present: delta + sparkline on the four tiles; "+N new" = highlighted rows in the list.

## Invariants
- Needs attention ∩ (finance-only rows) = empty; Going quiet now includes quiet + locked/defaulted rows.
- Payment defaulted tile N == defaulted list length; Payments locked unchanged.
- Paged NA count == NA list length (addressed excluded in both).
- "+N new" == number of highlighted rows in the opened list.
- Snapshot counts == the tile values at write time (same sets).

## Banned
- Snapshot docs with profileid, names or emails
- Fake / placeholder trend numbers before yesterday's snapshot exists
- Composite-index queries for the snapshot read
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only)
- jchd-mc-needs, jchd-mc-quiet, jchd-mc-locked, jchd-mc-defaulted, jchd-mc-renewing, jchd-mc-tickets, jchd-mc-flagged -> Participants tiles
- jchd-sum-quiet -> Summary Going quiet tile
- jchd-trend, jchd-trend-delta, jchd-trend-spark -> trend inside a tile
- jchd-new-na, jchd-new-gq (Summary), jchd-mc-new-na, jchd-mc-new-gq (Participants) -> "+N new"
- jchd-row-new -> "New" pill on a highlighted table row

## Proof
- Spec path: qa/checks/jc-health-na-finance-trend.mjs (predicates + sparkline executed);
  updated: qa/checks/jc-health-na-reasons.mjs NR9/NR13, journey-coach-health-dashboard.needs-attention.spec.ts,
  journey-coach-health-dashboard.going-quiet.spec.ts (quiet + locked now in Going quiet)
- Command: node qa/checks/jc-health-na-finance-trend.mjs
- Fail if reverted: yes (17 of 18 FAIL against the previous sources; NF4 is a completeness guard)
- Last run: PASS 18/18
- Live 2026-11-11 (localhost:4303, starlabs-test): coach view NA 16 (old rule would be 37) == hero list 16 == mini tile list 16, 0 finance-only rows; Going quiet 4 == 4; Payments locked 28 == 28; Payment defaulted 1 == 1; ALL (paged) NA 19 == list 19 with 3 addressed excluded, defaulted 1 == 1. Snapshots written today: coach {NA 16, GQ 4, locked 28, defaulted 1; 16 + 4 ids}, ALL {19, 6, 78, 1} == tiles. No trend shown (no yesterday). With an in-memory yesterday (nothing written): deltas +2 / -1 / 0 / +1, 4 sparklines per view, '+2 new' == 2 highlighted rows, '+1 new' == 1 highlighted row; trend hidden when the summary filter is not the default.
- Not verified live: delta / sparkline / +N new on real data (needs yesterday's snapshot, first possible 2026-11-12; checked with an in-memory yesterday only); second-load-same-day no-rewrite (logic only); light mode (checked in dark only).
