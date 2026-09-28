# Contract: delivery-dashboard-days-waiting
Surface: /delivery-dashboard -> Participants tab -> Awaiting Initiation / Stuck Cases
Env: starlabs-test   (never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/delivery-dashboard

## User moves
1. Open the URL logged in as an admin on starlabs-test
2. Open the Participants tab (testid: pm-tab-awaiting)
3. Read the DAYS WAITING column (testid: pm-days-waiting)
4. Expect real elapsed days per row, never a blanket "0 DAYS"
5. Expect an em dash where no onboarding date exists, not "0 DAYS"
6. Expect each participant to appear at most once

## Root cause
onboardedtime lives on the `participantjourneyproduct` collection, not on
`participant metadata`. populateActionableCohorts() read it from mapMetaData
(sourced from `participant metadata`), so `onboarded` was always null and
daysSinceTs() returned 0 for every row. Separately, allMatchedProductsRaw is keyed
by participantsproduct doc id, so a participant holding N products produced N
identical awaiting rows (the awaiting row shape carries no product column).

## Invariants
- DAYS WAITING is derived from participantjourneyproduct.onboardedtime, not from
  'participant metadata' (revert => every row reads 0)
- A missing onboarding date yields null and renders "-", never "0 DAYS"
  (a participant with no date must be distinguishable from one onboarded today)
- Awaiting Initiation contains at most one row per profileid
- Ready to Start contains at most one row per profileid
- When collapsing duplicates the earliest onboarded (longest waiting) row survives
- Awaiting Initiation and Ready to Start are disjoint by profileid
- Tile N == list length: originalData[bucket].count === originalData[bucket].data.length
  for awaitingInitiation, readyForInitiation and stuckCases
- Two different participants are never merged

## Out of scope (unchanged by this chunk)
- Initiated - Not Consuming and Stuck Cases keep one row per product: a stall is
  product-specific there, and those row shapes do carry a PRODUCT column.
- The PRIORITY column keeps its existing thresholds. It becomes meaningful again
  only as a consequence of DAYS WAITING being real.

## Banned
- Whole-collection getDocs of PII collections to the client
  (participantjourneyproduct is read roster-scoped, chunked 30 at a time, cached)
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only - no interpolation)
- pm-tab-awaiting        -> Awaiting Initiation tab label
- pm-tab-awaiting-count  -> Awaiting Initiation count badge
- pm-tab-idle            -> Initiated - Not Consuming tab label
- pm-tab-idle-count      -> Initiated - Not Consuming count badge
- pm-tab-stuck           -> Stuck Cases tab label
- pm-tab-stuck-count     -> Stuck Cases count badge
- pm-row                 -> each participant row in the PM table
- pm-days-waiting        -> the DAYS WAITING badge in a row
- pm-row-info            -> "Showing X to Y of N entries" footer

## Proof
- Spec path: src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-days-waiting.spec.ts
- Command: npx ng test --ts-config=tsconfig.spec.scoped.json --include='**/delivery-dashboard-days-waiting.spec.ts' --watch=false --browsers=ChromeHeadless
- Fail if reverted: yes
- Revert evidence: reverting the journeyProductMap lookup, the null return in
  daysSinceTs and the dedupe call => TOTAL: 6 FAILED, 4 SUCCESS
- Last run: PASS (TOTAL: 10 SUCCESS)

## Evidence (real app, starlabs-test, 2026-09-28)
- Env: starlabs-test (non-prod) · URL http://localhost:4200/delivery-dashboard
- Ran: npx ng test --ts-config=tsconfig.spec.scoped.json --include='**/delivery-dashboard-days-waiting.spec.ts' --watch=false --browsers=ChromeHeadless -> TOTAL: 10 SUCCESS
- Revert run: same command with the three fix hunks reverted -> TOTAL: 6 FAILED, 4 SUCCESS
- Production build: npx ng build --configuration production -> exit 0
- Dedupe: Awaiting Initiation went 12 -> 8 rows; 8 unique row keys, 0 duplicates on page
- Reconcile: tile 8 == rendered rows 8 == "Showing 1 to 8 of 8 entries"
- Stuck Cases: tile 22 == "Showing 1 to 10 of 22 entries"; DAYS WAITING renders real
  values (67, 75, 87, 121, 143, 167, 193, 194, 363) where a date exists
- Unknown dates: the 8 awaiting rows have no onboardedtime in participantjourneyproduct
  on starlabs-test and now render "-" instead of the previous misleading "0 DAYS"
- Console: no Firestore errors (only a pre-existing FCM service-worker 404 in dev)
- Completeness: nothing removed - no card, metric, badge, link or drill-down deleted
- Revert: git revert <sha>

## Note on the scoped tsconfig
The repo-wide spec suite is pre-broken with two errors unrelated to this chunk:
  src/app/content/content-analytics/content-analytics.component.ts:8  TS2307 import from 'console'
  src/app/content/series-dashboard/assigncategorydialog/assigncategorydialog.component.spec.ts:3  TS2724 wrong export name
tsconfig.spec.scoped.json compiles only this spec and what it imports, so the
contract runs in isolation without editing unrelated files.
