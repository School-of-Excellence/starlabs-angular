# 2026-08-17 — salesleads export: all rows, all columns

Screen: `/salesleads` → `src/app/Journey Onboarding/saleslead/saleslead.component.ts`
Complaint: "in the export I'm not getting all data."

## What was wrong

Three independent causes, all of which shrink the exported file:

### 1. Leads without a `date` field never loaded at all (biggest)
The realtime subscription was:
```ts
query(salesleadsRef, orderBy('date', 'desc'))
```
Firestore **silently omits every document that does not have the ordered field**. Any
salesleads doc written without `date` was therefore missing from the table *and* from the
export — invisible, with no error. This is the one that loses whole rows.

### 2. Export ignored the quick-search box
`exportToExcel()` iterated `this.tableData.data`. On a `MatTableDataSource`, `.data` is the
**unfiltered backing array**; the rendered set once a search term is typed is `.filteredData`.
So with a search active the export did not match the screen. (The dropdown/date filters were
fine — `applyFilters()` assigns `.data` directly.)

### 3. A bad date type aborted the whole export
`row.date.toDate()` and the `else` branch of the purchasedate block assumed a Firestore
`Timestamp`. Rows carry a mix of `Timestamp`, JS `Date`, ISO string and epoch millis, and
`.toDate()` on a non-Timestamp throws **inside `.map()`** — killing the entire export, not
just that cell. A single bad row meant no file (or a stale/partial one).

Also: the export carried only 12 columns while the docs hold far more (money fields,
billing, payment plan, ids) — so "all data" was short in the column direction too, and
`!cols` had 10 width entries for 12 columns, mis-sizing the tail.

## The change

`saleslead.component.ts`:
- **Query**: dropped the server `orderBy('date','desc')`; fetch the full collection and sort
  client-side descending by date with undated leads last. `orderBy` is still imported/used for
  the `products` / `journey` / `package` lookups.
- **New `toJsDate(value)` helper** — normalises Timestamp | Date | ISO string | epoch millis |
  `{seconds}` to a `Date`, returning `undefined` for anything unparseable instead of throwing.
  Used by both the new sort and the export.
- **`exportToExcel()`**:
  - Source rows are now `this.tableData.filter ? filteredData : data` — exports exactly what is
    on screen, search included.
  - All date cells go through `toJsDate`, so a bad value blanks one cell rather than aborting.
  - Columns expanded from 12 to 29: added Pre Sales Person, Initial Payment, Initial Payment
    Status (the `initialpaymentapproved` tri-state that the table shows as an icon), Total
    Purchase Value, Original Fee, Balance Amount, Payment Plan, Installment Amount, Installment
    Start Date, Payment Plan Assured Date, Purchase Label, Billing Email, Billing Address,
    GST No, Payment Id, Profile Id, Lead Id.
  - Header list passed explicitly to `json_to_sheet(data, { header })` so column order is fixed
    and no column is dropped when the first row happens to be missing a field.
  - `!cols` derived from the header list, so widths can no longer drift out of sync.
  - Empty result now shows a snackbar instead of downloading a header-only file.

Product/journey id→name lookups fall back to the raw id when the map has no entry (previously
rendered `undefined`).

No ATC collections touched. `npx tsc --noEmit -p tsconfig.app.json` → 0 errors.

## Revert guide (per-screen)

All in `src/app/Journey Onboarding/saleslead/saleslead.component.ts`:
1. **Query**: replace the `collectionSnapshots(query(salesleadsRef))…sort(…)` block with
   `const salesleadsQuery = query(salesleadsRef, orderBy('date', 'desc'))` +
   `collectionSnapshots(salesleadsQuery)` and drop the trailing `.sort((a, b) => …)`.
2. **Export**: restore `const data = this.tableData.data.map(...)` with the original 12-key
   object, the inline `typeof === 'string'` / `.toDate()` date handling, the hardcoded 10-entry
   `wscols`, `json_to_sheet(data)` without the `header` option, and delete the empty-data
   snackbar guard.
3. Delete the `toJsDate()` helper (nothing else uses it once 1 and 2 are reverted).

No template or CSS change was made — `(click)="exportToExcel()"` is untouched.

## Follow-up (same day) — dashboard cards lied when a filter matched zero rows

Flagged during the export fix, then fixed on operator request.

`updateJourneyTypeCounts()`, `getPercentage()`, `getFilteredPercentage()` and the "Total Sales
Captured" card all used the shape `filteredData.length > 0 ? filteredData : data` /
`filteredData?.length || data.length`. When a filter matched **zero** rows, the falsy-zero
fallback kicked in and every card reported the **full unfiltered** counts — the table showed
"No data matching the filter" while the cards showed the whole base.

The fallback was never needed. Confirmed against
`node_modules/@angular/material/fesm2022/table.mjs`: `MatTableDataSource` assigns `filteredData`
in `_filterData()`, which runs from the constructor's `_updateChangeSubscription()` and
synchronously on every `data`/`filter` set. With no filter, `filteredData === data`. So
`filteredData` is *always* the rendered set and is never undefined for this component.

Fix — one getter, used everywhere:
```ts
get visibleData(): any[] { return this.tableData.filteredData ?? []; }
```
- `updateJourneyTypeCounts()` iterates `this.visibleData` (the `currentData` local is gone).
- `getPercentage()` / `getFilteredPercentage()` take their count from `this.visibleData.length`.
- Template card (line ~83) is `{{visibleData.length}}` instead of the inline `||` expression.
- `exportToExcel()` also switched from `this.tableData.filter ? filteredData : data` to
  `this.visibleData`, so export, card and table can no longer disagree.

`npx tsc --noEmit -p tsconfig.app.json` → 0 errors; `ng build --configuration development` →
success (only pre-existing CSS-nesting warnings in `journey-onboarding-detail`).

### Revert guide (follow-up)
1. `saleslead.component.html` line ~83: restore
   `{{tableData.filteredData?.length || tableData.data.length}}`.
2. `saleslead.component.ts`: restore `const currentData = this.tableData.filteredData.length > 0 ?
   this.tableData.filteredData : this.tableData.data;` in `updateJourneyTypeCounts()` (and iterate
   `currentData`); restore `this.tableData.filteredData?.length || this.tableData.data.length` in
   `getPercentage()` and `getFilteredPercentage()`; set the export's `rows` back to
   `this.tableData.filter ? this.tableData.filteredData : this.tableData.data`.
3. Delete the `visibleData` getter.

## Pending / caveats

- **Not verified in-browser**: `/salesleads` is Firebase-auth gated over live production
  Firestore, so the preview can't exercise it. Verified by clean typecheck + logic review only.
  Worth a real-data spot check: confirm the row count in the exported sheet equals the count
  card at the top of the screen, and that previously-missing undated leads now appear.
- **Read volume**: removing the server `orderBy` does not change how many docs are read — it
  was already an unbounded collection subscription — but it now returns *more* docs (the
  undated ones). If `salesleads` grows large, this screen will need real pagination; the
  ordering is now client-side, so a future server-side page must re-introduce an indexed field
  that is guaranteed present on every doc (not `date`).
- The zero-match card bug noted here originally as "not fixed" **is now fixed** — see Follow-up
  above.
