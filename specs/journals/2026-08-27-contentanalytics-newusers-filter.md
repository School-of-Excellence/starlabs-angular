# 2026-08-27 — /contentanalytics Analytics Table: "New users only" checkbox

## What was asked
Operator: the Analytics Table tab of `/contentanalytics` tags some rows
"(New User)" in the Name column; add a checkbox in the "Filter by" row to
show only those rows.

## What was done
`src/app/content/content-analytics/content-analytics.component.{ts,html}`:
- New `showNewUsersOnly = false` flag next to `showDuplicatesOnly`, wired
  the same way (outside `filterValue`, read directly by `customfilter()`,
  reset in `onClearFilterValue()`).
- `customfilter()` gained one clause:
  `(this.showNewUsersOnly ? !this.mapProfile[e['profileid']] : true)`.
- `mat-checkbox` ("New users only", color primary) added beside the
  Duplicates-only slide toggle; `MatCheckboxModule` imported.

## WHY these choices
- **Filter condition = the tag condition.** The Name column shows
  "(New User)" exactly when `mapProfile[row.profileid]` is falsy (the row
  then falls back to `mapProfileNew`, from the single new_user_data
  listener). The filter tests the same expression, so the checkbox
  selects precisely the rows the operator sees tagged — including logs
  whose profileid is in NEITHER map (blank name + tag), which
  `mapProfileNew[id]` truthiness would have missed.
- **Followed the Duplicates-only pattern** instead of putting the flag in
  `filterValue`: `MatTableDataSource.filter` is a plain-subject setter
  (no distinct-until-changed), so re-assigning the same JSON string still
  re-runs the predicate — the toggle already relies on this and works.
- Checkbox (not a second slide toggle) because the operator explicitly
  asked for a checkbox.
- Export follows automatically: `exportCSV()` reads
  `contentData.filteredData`.
- The summary strip (Unique Users etc.) is computed at fetch time and
  ignores client-side filters — same as the existing Duplicates toggle;
  unchanged on purpose.

## Status
Prod build passed. Not committed (operator commits manually), not
deployed.
