# Contract: jc-overall-next30
Surface: /journey-coach-health -> Overall Summary tab -> Scheduled & completed
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4303
URL: http://localhost:4303/journey-coach-health (tab "Overall Summary")

## Requirement (operator-approved 2026-11-11, item 1)
Add "Next 30 days" to both schedule rows (Journey Coaching and Onboarding): booked sessions whose start is after
today and within 30 days of the end of today (days 1-30; includes the next 7; today excluded, like Next 7 days).
Rows become 4 tiles: Scheduled today / Next 7 days / Next 30 days / Completed in range.

## Source
jcPendingEvents (appointments journeycoach == true, already loaded), split by the onboarding flag, scoped to
rosterIds() (Viewing as). No new query.

## User moves
1. Open the URL, click Overall Summary (testid: jx-tab-overall).
2. Read JC Next 30 days (ov-jc-month) and Onboarding Next 30 days (ov-obs-month).
3. Click either tile: the native drill overlay lists exactly that many sessions, ascending by date.
4. Change Viewing as (ov-viewing-select): both tiles re-scope.

## Invariants
- Tile N == drill list length (ov-jc-month, ov-obs-month).
- Next 30 days >= Next 7 days for each row (superset).
- JC and Onboarding month buckets are disjoint (onboarding flag).
- Viewing as changes the counts (roster scope).

## Banned
- New Firestore query for this bucket
- New MatDialog (drill = existing ahd overlay)
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only)
- ov-jc-month -> JC Next 30 days tile
- ov-obs-month -> Onboarding Next 30 days tile

## Proof
- Spec path: qa/checks/jc-overall-next30.mjs
- Command: node qa/checks/jc-overall-next30.mjs
- Fail if reverted: yes (7 of 9 FAIL against HEAD~ sources)
- Last run: PASS 9/9
- Live 2026-11-11 (localhost:4303, starlabs-test): starlabs-test has 0 future JC sessions, so all tiles 0 == drill 0; with 4 in-memory sessions (+3d, +12d, +40d JC; +20d onboarding; nothing written) JC Next 7 = 1 == drill 1, JC Next 30 = 2 == drill 2 (+40d excluded), Onboarding Next 30 = 1 == drill 1 (disjoint).
