# Contract: jc-overall-summary
Surface: /journey-coach-health -> Overall Summary tab (tab 1)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4302
URL: http://localhost:4302/journey-coach-health (click tab "1 Overall Summary")

## Requirement (operator spec 2026-11-11; mockup approved; architecture option B approved)
Top: date range (Month / Range) + Viewing as. Then:
1. Sales by Journey — per journey: New / Upgrades / Add-ons / Overall (Gross, approved; Overall = N + U + A).
2. Onboarding status — To be onboarded, <= 7 days, 7+ days, Onboarded; Avg days from ASV to Onboarding.
3. Scheduled & completed — Journey Coaching and Onboarding rows: Scheduled today / Next 7 days / Completed in range.
4. Planned journey · next 6 months (replaced Ready for SE 2026-11-11, see jc-overall-plan-grid).
5. Participant health — Coach-set health renamed (Overall only), Active participants on Ecosystem products.
6. Ask A&H & Love Letter — the Journey Planning table, scoped by Viewing as.

## Sources
- 1-2: the shared embedded journeycoach-dashboard (ONE instance, mounted on Overall or Onboarding, hidden off the
  Onboarding tab). Org-wide. Its date range IS the Overall date range (one setting for both tabs).
  Sales: grossnewsale / grossupgradesale / grossaddonsale grouped by salesleads.journey.
  Onboarding: originalData all / last7DaysnotOnboarded / last15daysnotOnboarded / onboarded; avg = avgAssured
  (paymentplanassureddate -> onboardedtime, the existing "Avg OB days").
- 3: jcPendingEvents (same predicates as Planning's Schedule card) and attended appointments in range:
  JC = jcDoneEvents (unchanged), Onboarding = obDoneEvents (attended, onboarding === true — exactly the docs JC done drops).
- 5: fullIndex (paged views) or allRows, productType 'ecosystem', lifecycle 'active', coach-set health state.
- 6: the docs behind Planning's A&H table (180 days), filtered to rosterIds() unless Viewing = All.

## User moves
1. Open the URL, click Overall Summary (testid: jx-tab-overall).
2. Change the month (ov-date-prev / ov-date-month / ov-date-next) or switch to Range (ov-date-start / ov-date-end):
   Sales and Onboarded change; the Onboarding tab shows the same month.
3. Change Viewing as (ov-viewing-select): Scheduled & completed, Participant health and A&H change; Planning's Viewing
   and Participants table follow (same onCoachChange handler).
4. Click any number in sections 1, 3, 5, 6: the native drill overlay (ahd-overlay) lists exactly that many people.
5. Click an Onboarding status tile (ov-ob-tobe / ov-ob-le7 / ov-ob-gt7 / ov-ob-onboarded): the Onboarding tab opens
   with that table open.

## Invariants
- Tile N == drill list length (sales cells, schedule tiles, health states, A&H cells).
- Onboarding status tiles == the Onboarding tab's To onboard / <= 7 / 7+ / Onboarded for the same month.
- A&H at Viewing = All == Planning's A&H table.
- Changing Viewing as changes sections 3, 5, 6 (not a no-op) and the Planning Participants table scope.
- Changing the date range changes sections 1, 2 (Onboarded, avg) and 3 Completed.
- JC completed and Onboarding completed are disjoint (no appointment in both).
- Exactly one app-journeycoach-dashboard in the DOM.
- Completeness: nothing removed from Onboarding or Journey Planning; Planning keeps "Coach-set health".

## Banned
- Whole-collection getDocs of PII collections to the client (no new reads; Overall reuses loaded data)
- backdrop-filter / filter / transform / perspective on an ancestor of a position:fixed overlay
- New MatDialog / extra component for Overall drills (native ahd overlay only)
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only)
- jx-panel-overall -> Overall panel
- ov-date-month-mode, ov-date-range-mode, ov-date-prev, ov-date-month, ov-date-next, ov-date-start, ov-date-end, ov-date-label -> date controls
- ov-viewing-select -> Viewing as
- ov-sales, ov-sales-row, ov-sales-total -> Sales by Journey
- ov-onboarding, ov-ob-tobe, ov-ob-le7, ov-ob-gt7, ov-ob-onboarded, ov-ob-avg -> Onboarding status
- ov-schedule, ov-jc-today, ov-jc-week, ov-jc-done, ov-obs-today, ov-obs-week, ov-obs-done -> Scheduled & completed
- ov-plan, ov-plan-grid -> Planned journey (jc-overall-plan-grid)
- ov-health, ov-health-total -> Participant health
- ov-ah, ov-ah-needsattention-combined -> A&H

## Proof
- Spec path: qa/checks/jc-overall-summary.mjs
- Command: node qa/checks/jc-overall-summary.mjs
- Fail if reverted: yes (component reverted -> 17 of 19 FAIL; OV17 completeness and OV18 CSS guardrail hold either way)
- Last run: PASS 19/19 (2026-11-11)
- Live (starlabs-test, localhost:4302, admin):
  - Viewing Joshua Samuel, Nov 2026: Sales 1, Health 46, A&H Needs Attention 4. Viewing All: Health 115, A&H 5 (scope changes).
  - Apr 2026, All: Sales Total 14 (drill 14), uP! Overall 8 (drill 8); JC completed 22 (drill 22); Onboarding completed 6 (drill 6);
    Health 115 = sum of states (Not assessed drill 115); A&H Needs Attention 5 (drill 5) == Planning 5.
  - Onboarding status 7 / 0 / 7 / 0 == Onboarding tab To onboard 7, <= 7 0, 7+ 7, Onboarded 0; month 2026-04 shared.
  - 7+ days tile -> Onboarding tab, table open with 7 rows.
  - Gross Sales card 31 vs Sales Total 14: the card also counts pending sales (by design, noted on the card).
- Existing checks still green: jc-health-tabs (TB8 updated for the shared instance), jc-health-onboarding-tab,
  jc-onboarding-count-only, jc-onboarding-pipeline, jc-health-contract.
- Production build: `npx ng build --configuration production` -> EXIT 0 (2026-11-11, run outside the sandbox).
