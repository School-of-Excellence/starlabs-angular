# 2026-10-15 — /workshops: Status counts every live switch, new Type filter

## What changed
- **Active** now means "not completed and live anywhere": the app switch, the web switch or the
  EiFlix mobile switch. Before, only the app switch counted, so a workshop live only on the web or
  only on EiFlix mobile showed up under Inactive.
- **Inactive** now means "not completed and all three switches off". Before, it was simply "app
  switch off", which also pulled in completed workshops.
- **Completed** and **All** are unchanged.
- New **Type** chip group: All / CP Workshop / Workshop / Evergreen Workshop. It filters on the same
  label the table's Type column shows (`workshopTypeLabel`): the root type field first, then the
  legacy Settings flags. A workshop with neither counts as Workshop, matching the column.
- Status and Type combine.

## Why it is shaped this way
- The rules live in exported pure functions (`isLiveAnywhere`, `filterWorkshops`,
  `workshopTypeLabel`) in workshops.component.ts, so the unit spec tests them without TestBed
  and the column and the filter cannot drift apart.
- A completed workshop is neither Active nor Inactive. That keeps the three status chips disjoint.

## Tests
- Unit: `workshops.filters.spec.ts`, 6/6.
- Hub (`workshops/workshops-list.spec.ts`):
  - WS-03's upper bound now counts any live switch (`countLiveNotCompletedWorkshops`).
  - New WS-64 seeds a web-only CP workshop, a mobile-only Evergreen workshop and a completed live
    workshop. They carry no testrunid, so WS-01's count of 3 still holds, and they are deleted
    afterwards.
  - WS-64 drives Active, Inactive, each Type and one combination.
  - WS-01, WS-03, WS-64 and WS-04 passed on the emulator.
  - Hub commit `ac2816e` is local and not pushed.

## Pending
- The operator pushes starlabs-angular. The hub has 4 local commits waiting for "push".

## Follow-up: completed workshops show "Completed" in place of the two toggles
- When the Completed switch is on, the Active and Web Active columns show a blue "Completed" pill
  in place of the toggle (`wor-completed-pill-active`, `wor-completed-pill-web`). This stops
  anyone switching a finished workshop back on from the list. The Completed switch itself stays,
  so turning it off brings the toggles back.
- WS-64 now checks the completed row has both pills and no toggles, and that a live row has
  toggles and no pill. WS-03, WS-64 and WS-04 pass. The hub commit is local and not pushed.

## Follow-up 2: one "Completed" label, not two
- The operator wanted a single label centred across both columns. A completed row's Active cell now
  spans two columns and the Web Active cell is hidden (`td.cell-merged`). The single hook is
  `wor-completed-pill`. WS-64 asserts one label with colspan 2. A screenshot confirmed it is centred.

## Follow-up 3: EiFlix Mobile toggle, all three toggles in one column
- The Active column now stacks three labelled switches: Active, Web and EiFlix Mobile. The new one,
  `onWorkshopMobileStatusChange`, writes `eiflixmobileactive` with the same confirm and snackbar
  pattern as Web. The separate Web Active column is gone.
- A completed workshop shows the one "Completed" label in that column, so the colspan merge from
  follow-up 2 is no longer needed and was removed.
- Each switch sits in a `<div>`, not a `<label>`. mat-slide-toggle already carries its own label, and
  a wrapping label could fire a second click.
- Active stays first in the cell, so WS-04's "first toggle in the row" still flips Active.
- Hub:
  - WS-64 checks the three switches share one cell and a completed row has none.
  - WS-65 flips EiFlix Mobile through the UI and polls Firestore for `eiflixmobileactive: false`.
    Active and Web stay untouched, and the row moves from Active to Inactive.
  - WS-01, WS-03, WS-04, WS-64, WS-65 and WDA-05 pass.
  - The hub commit is local and not pushed.

## Follow-up 4: compact switches, then the Active column hidden
- The operator found the stacked switches too tall. They now sit side by side, each with a small
  name above it, so the cell is one switch tall. The first one is renamed "Breakthroughs App".
- The operator then asked to hide the Active column, commenting it out rather than removing it:
  - In the template, the whole `matColumnDef="active"` block is inside an HTML comment.
  - In `displayedColumns`, `'active'` is commented out.
  - The CSS and `onWorkshopMobileStatusChange` stay.
  - To restore it, uncomment both.
  - The Status filter (Active / Inactive by any switch) is unaffected.
- The title `min-width` tried during the layout pass was reverted, since there is room without the
  column.
- Hub:
  - WS-64 and WDA-05 now assert the switches are absent.
  - WS-04 and WS-65 are `test.skip` with the reason. Their code is kept for when the column returns.
    While the column is hidden, a row's first switch is Completed, so WS-04 must not run.
  - WS-01, WS-03, WS-64 and WDA-05 pass; the two skipped cases show as skipped.
  - The hub commit is local and not pushed.

## Follow-up 5: green "Active" chip
- A green "Active" chip (`wor-active-chip`) sits under the workshop name for active workshops.
- It uses `isActiveWorkshop`, the same rule as the Active filter: any of the three switches on and
  not completed. That way the chip and the filter can never disagree.
- The row's green left border (`row-active`) still follows only the app switch. It was not
  changed, because that was not asked for, but web-only and mobile-only rows show the chip without
  the border.
- Unit tests: 7/7. WS-64 checks the chip is on the web-only, mobile-only and app-active rows and
  off the all-off and completed rows; it passes. The hub commit is local and not pushed.

## Follow-up 6: the green row line follows the same rule
- Asked for by the operator: `row-active` is now bound to `isActive(row)`, not to the app switch
  alone. The green left line, the chip and the Active filter now share one rule.
- A completed row keeps its blue line.
- WS-64 checks the line is on the web-only and mobile-only rows and off the all-off and completed
  rows; it passes. The hub commit is local and not pushed.
