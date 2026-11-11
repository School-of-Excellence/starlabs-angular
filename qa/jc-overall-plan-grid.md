# Contract: jc-overall-plan-grid
Surface: /journey-coach-health -> Overall Summary tab -> "Planned journey · next 6 months" (replaces Ready for SE)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4303
URL: http://localhost:4303/journey-coach-health (tab "Overall Summary")

## Requirement (operator-approved 2026-11-11, item 2)
Grid: rows = Solar Voice, EiFlix, General content, Workshops, then one row per planned product name; columns = the
next 6 months (current month first); cell = distinct participants with that item planned that month; click a cell ->
the existing native drill overlay listing who. Only for a specific Viewing coach; ALL / UNASSIGNED show
"Pick a coach to see plans". No explicit "Scope Enhancement" type exists; SE shows under its product name.

## Source
participantplanning (writer: src/app/Journey Onboarding/journeyplan/journeyplan.component.ts), one doc per participant
per month, id `${profileid}_${MM}_${YYYY}`; fields solarvoice[], eiflix[], generalcontent[], workshop[], products[]
(refs to products; name = products.product, fallback name). Read: where('profileid','in', chunk30(rosterIds())) —
no composite index, monthstartdate filtered client-side (doc-id fallback). Product names: products where
documentId() in chunk30, cached. No PII collection read.

## User moves
1. Open the URL, click Overall Summary (jx-tab-overall).
2. Viewing as = All: card shows "Pick a coach to see plans" (ov-plan-pick).
3. Viewing as = a coach (ov-viewing-select): grid renders (ov-plan-grid) with 6 month columns.
4. Click a non-zero cell (ov-plan-cell): overlay lists exactly that many participants.

## Invariants
- Cell N == drill list length.
- Changing Viewing coach changes the grid (roster-scoped read, cache per coach).
- Row order: 4 categories then products A-Z; products with the same name merge (distinct people).
- Docs outside the 6-month window are not counted.

## Banned
- Whole-collection getDocs of participantplanning or any PII collection
- New MatDialog (drill = existing ahd overlay)
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only)
- ov-plan -> card
- ov-plan-pick -> "Pick a coach" note (ALL / UNASSIGNED)
- ov-plan-grid -> grid table wrapper
- ov-plan-row -> grid row
- ov-plan-cell -> grid cell button
- ov-plan-error -> load error note

## Proof
- Spec path: qa/checks/jc-overall-plan-grid.mjs (row builder executed on fixtures)
- Command: node qa/checks/jc-overall-plan-grid.mjs
- Fail if reverted: yes (12 of 12 FAIL against the previous sources)
- Last run: PASS 12/12
- jc-overall-summary OV1/OV2/OV15 updated to the new section (approved replacement).
