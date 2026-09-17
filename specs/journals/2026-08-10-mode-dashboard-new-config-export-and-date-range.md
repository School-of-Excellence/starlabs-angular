# 2026-08-10 — mode-dashboard-new: config-list exports + configured date-range filter

## What
On the `mode-dashboard-new` screen (Mode Dashboard, route `mode-dashboard-new`) added:
1. **Export** buttons on both the **Review Configured** and **Configuration Missing** cards.
   Columns: **Product | Mode | Configured On** (plus a leading Serial No, matching the existing
   participant export style). Exports the currently-filtered list, not a page slice.
2. A **date-range filter** on the **Review Configured** card only, filtering by the *configured
   date* (`lastupdate`). Implemented as a **Material `mat-date-range-picker`** (single range field
   with a calendar toggle) + a "Clear" button.
   > Note: originally shipped as two native `<input type="date">` fields; the operator asked for the
   > Material range picker, so that is the final state. The revert guide below reflects the picker.

## Why / how the data maps
`filterModesConfig()` builds two arrays from `product mode config`:
- `configuredModes` — items `{ productid, mode, lastupdate }` (has a Firestore Timestamp
  `lastupdate` = when the mode config was last saved). Master copy in `tempConfiguredModes`.
- `notConfiguredModes` — items `{ productid, mode }` (no `lastupdate`; config missing or has 0
  widgets). Master copy in `tempNotConfiguredModes`.

So "Configured On" = `lastupdate.toDate()` for the configured list, and `'NA'` for the missing
list. Product name = `mapProducts[productid].product`.

## The change
`mode-dashboard-new.component.ts`:
- `@Component` now imports `MatDatepickerModule` and adds `providers: [provideNativeDateAdapter()]`
  (from `@angular/material/core`) so the range picker has a DateAdapter. (`mat-form-field` /
  `mat-label` were already available transitively via `MatSelectModule`, which re-exports
  `MatFormFieldModule`.)
- New FormGroup field `configuredDateRange` = `{ start: [null], end: [null] }` (built in the
  constructor next to `configuredform`). Holds `Date | null` from the picker.
- `configuredFilter(value)` extended: still filters by product + mode (multi-select), and now also
  by the date range. Reads `configuredDateRange.value.start/end`, normalizes them to **local**
  start-of-day / end-of-day, then an item passes only if `lastupdate` exists and falls within
  `[start, end]`. Either bound may be empty (open-ended). Items with no `lastupdate` are excluded
  once any bound is set. Filtering always runs off the `tempConfiguredModes` master, so it composes
  with the product/mode filters and is reversible.
- `clearConfiguredDateRange()` — `configuredDateRange.reset()` + re-runs the filter.
- `exportConfiguredToExcel()` / `exportNotConfiguredToExcel()` — build the row array and call the
  shared private `downloadModeSheet(data, filename, sheetName)` (uses the already-imported `XLSX`,
  same pattern as `exportToExcel`). Files: `Review_Configured.xlsx` / `Configuration_Missing.xlsx`.

`mode-dashboard-new.component.html`:
- Review Configured `.title-section`: added `<button class="export-btn" (click)="exportConfiguredToExcel()">`.
- Review Configured `.search-section`: added `.config-date-range` block — a
  `mat-form-field` with `mat-date-range-input [formGroup]="configuredDateRange"
  [rangePicker]="configuredPicker"` (two `matStartDate`/`matEndDate` reactive inputs, each with
  `(dateChange)="configuredFilter(configuredform.value)"`), a `mat-datepicker-toggle`, the
  `mat-date-range-picker #configuredPicker`, and a conditional "Clear" button.
- Configuration Missing `.title-section`: added `<button class="export-btn" (click)="exportNotConfiguredToExcel()">`.

`mode-dashboard-new.component.css`:
- Added `.config-date-range` (flex row) and `.clear-date-btn` (+`:hover`). The range field itself
  uses the existing `.medium-dropdown` width. Reused the pre-existing `.export-btn` style (green pill).

No ATC collections touched. `npx ng build --configuration development` → succeeds (output emitted);
no error/warning references `mode-dashboard-new`.

## Revert guide (per-screen)
All three files are `src/app/AppEngagement/mode-dashboard-new/mode-dashboard-new.component.{ts,html,css}`.

To fully revert:
1. **.ts** — remove `MatDatepickerModule` from `imports`, remove `provideNativeDateAdapter` from the
   imports + the `providers: [...]` line, and drop the `MatDatepickerModule` /
   `@angular/material/core` import statements; delete the `configuredDateRange` field and its
   constructor `formbuilder.group(...)`; restore `configuredFilter` to its original
   product+mode-only body (drop the `startVal`/`endVal`/`start`/`end` locals and the `dateMatch`
   block, return the product&&mode match); delete `clearConfiguredDateRange`,
   `exportConfiguredToExcel`, `exportNotConfiguredToExcel`, and the private `downloadModeSheet`.
2. **.html** — remove the two `.export-btn` buttons from the Review Configured and Configuration
   Missing `.title-section`s, and remove the `.config-date-range` block (the `mat-form-field` range
   picker + Clear button) from the Review Configured `.search-section`.
3. **.css** — delete the `.config-date-range` and `.clear-date-btn` (+`:hover`) rules added right
   after `.export-btn:hover`. (Leave `.export-btn` itself — it pre-existed.)

To revert only the **date filter** (keep exports): do step 1's datepicker/date-range items (leave
the export methods) + step 2's `.config-date-range` removal + step 3. To revert only the **exports**
(keep date filter): remove the two export methods + `downloadModeSheet`, and the two `.export-btn`
buttons.

## Follow-up (same day) — member-count columns + export-window dialog
Operator wants the Review Configured + Configuration Missing exports to also show, per product-mode
row: how many members are in the current mode, and how many are coming into that mode
(nextmode == mode). Mirrors the dashboard's "members going to which mode in N days". After a couple
of iterations the final shape is:

Final export columns (appended after "Configured On"):
- **Members in Current Mode** — participantsproduct where `productref.id == productid` and `mode == row.mode` (global, not date-limited).
- **Members Coming to Mode (till &lt;cutoff&gt;)** — participantsproduct where `productref.id == productid` and `nextmode == row.mode` **AND** `nextmodedate` within `[today, cutoff]` (window chosen in the dialog). The column **header carries the cutoff/to-date** (`toLocaleDateString`), built as a computed object key in `buildModeExportRow` (constant across all rows in one export, so it's a single column).
- ~~Next Mode Date~~ — added then removed at operator request.
- ~~Days From Now~~ — added then removed at operator request.

Final columns: Serial No | Product | Mode | Configured On | Members in Current Mode | Members Coming to Mode (till &lt;cutoff&gt;).

**Export-window dialog:** clicking either Export button no longer downloads immediately — it opens a
small dialog asking how far ahead to count "coming" members: either **N months from today**
(default 3) or **a specific date**. Confirm builds the cutoff and downloads.

Implementation:
- `.ts`:
  - Field `modeStatsByProductMode: { [productid+mode]: { currentCount, comingDates: Date[] } }` —
    stores the *raw* nextmodedates so the window can be applied at export time.
  - `fetchModeMemberStats()` — reads the **whole** `participantsproduct` collection. **[Updated
    later same day → lazy `getDocs`; see the lazy-load follow-up below.]** Pushes each coming
    member's `nextmodedate` into `comingDates`; increments `currentCount` for current-mode membership.
  - Dialog state: `showExportDialog`, `exportTarget ('configured'|'notconfigured')`,
    `exportRangeMode ('months'|'date')`, `exportMonths (=3)`, `exportSpecificDate`.
  - `openExportDialog(target)` / `closeExportDialog()` / `confirmExport()`. `confirmExport` computes
    `today` (start of day) and `cutoff` (today + N months, or the picked date; both end-of-day),
    picks the source list, maps rows via `buildModeExportRow(item, index, today, cutoff)`, and calls
    `downloadModeSheet`.
  - `buildModeExportRow` filters `comingDates` to `[today, cutoff]` for the count + soonest date.
  - `downloadModeSheet` `!cols` = 7 widths.
- `.html`: the two Export buttons call `openExportDialog('configured'|'notconfigured')`; added an
  export-options `.modal-overlay` / `.export-dialog` (radio month/date inputs + Cancel/Export).
- `.css`: added `.export-dialog*`, `.export-option`, `.btn-cancel`, `.btn-export` (reuses the
  existing `@keyframes slideIn`).

Note: loads the entire `participantsproduct` collection (the source `fetchModes()` was designed to
read). Current-mode counts are global; coming counts are windowed by the dialog. Coming members with
**no** `nextmodedate` are excluded (can't be windowed). "Next Mode Date" is the earliest in-window
date for the group (a group can have many members / dates).

Revert follow-up: in `mode-dashboard-new.component.ts` remove the `modeStatsByProductMode` field,
`fetchModeMemberStats()` + its `ngOnInit` call, the export-dialog state fields, `openExportDialog` /
`closeExportDialog` / `confirmExport` / `buildModeExportRow`, and the `subscription['modestats']`
(auto-cleaned by `ngOnDestroy`); restore simple `exportConfiguredToExcel()` /
`exportNotConfiguredToExcel()` that build rows inline with only the 4 original columns, and shrink
`downloadModeSheet` `!cols` to the first 4 widths. In `.html` revert the two Export buttons to
`(click)="exportConfiguredToExcel()"` / `exportNotConfiguredToExcel()` and delete the export-options
overlay. In `.css` delete the `.export-dialog*` / `.export-option` / `.btn-cancel` / `.btn-export` rules.

## Follow-up (same day) — Event/Queue Filter limited to active statuses
Operator: the Event/Queue Filter section (the per-mode badges shown after picking an event or queue)
should only count participants whose `participantsproduct.status` is **initiated / ongoing /
completed** — excluding `cancelled`, `null`, etc.

Data path (pre-existing): selecting an event → `updateEventData()`; a queue → `updateQueueData()`;
both `collectionData(participantsproduct where eventref == <ref>)`, grouped by `mode` into
`mapEventData` → rendered as badges. (`event collection` / `queue generation` docs themselves carry
no status; the status lives on `participantsproduct`, values initiated/ongoing/completed/cancelled/null.)

Change (`.ts` only): added `readonly eventQueueStatuses = ['initiated','ongoing','completed']` and, in
both `updateEventData()` and `updateQueueData()`, changed `let productDocs = events/queues;` to
`.filter((p) => this.eventQueueStatuses.includes(p['status']))` **before** grouping by mode. Done
client-side (not a `where("status","in",...)` clause) to avoid needing a composite
`eventref ==` + `status in` Firestore index; the eventref-scoped set is already small.

Revert follow-up: in `mode-dashboard-new.component.ts` delete the `eventQueueStatuses` field and
change the two `let productDocs = ....filter(...)` lines back to `let productDocs = events;` /
`let productDocs = queues;`.

## Follow-up (same day) — Event/Queue popup: dedupe count + group-by toggle
Operator: in the Event/Queue Filter section the badge count double-counted profiles (a profile in N
products counted N times). Wanted: **outside** = distinct profiles; **inside** (the popup) a toggle to
**Group by Product** or **Group by Profile**. Scope: `tableView === 'event'` only — no other popup.

Changes:
- `.ts`:
  - `eventGroupBy: 'product' | 'profile' = 'product'`; reset to `'product'` in `openModeDialog` when `view === 'event'`.
  - `uniqueProfileCount(list)` — distinct `profileid` count (used by the badge + popup header).
  - `getEventProductGroups(list)` → `[{ productId, productName, profiles: [{profileid,name,email}] }]`, profiles deduped **within** each product.
  - `getEventProfileGroups(list)` → `[{ profileid, name, email, products: string[] }]`, one row per distinct profile with its product names in this mode.
  - `exportToExcel()` `case 'event'` now builds from `getEventProfileGroups` (deduped): columns Serial No | Participant Name | Email | Products (comma-joined). (Other export cases unchanged.)
- `.html`:
  - Badge count: `event.value.length` → `uniqueProfileCount(event.value)`.
  - Generic participants table gated `activeTab === 'participants' && tableView !== 'event'`.
  - New `tableView === 'event'` block: header (count = `uniqueProfileCount`) + Export, a `.event-group-toggle` (two buttons), and two `ng-container`s — product-grouped tables / profile-grouped product lists.
- `.css`: appended `.event-group-toggle` (+`.active`), `.event-group`, `.event-group-header`, `.event-product-list` at end of file.

Note: per-product `(n)` sums can exceed the header (same person under 2 products) — intended. Groups
operate on `selectedMode` = the status-filtered `mapEventData` value (so the initiated/ongoing/completed
filter still applies).

Revert follow-up: `.ts` — delete `eventGroupBy` (field + the `openModeDialog` reset), `uniqueProfileCount`,
`getEventProductGroups`, `getEventProfileGroups`, and restore `case 'event'` to the old flat
Serial/Name/Email map over `selectedMode`. `.html` — badge back to `{{event.value.length || 0}}`,
remove the `tableView === 'event'` block, and change the participants-table ngIf back to
`activeTab === 'participants'`. `.css` — delete the appended Event/Queue popup block.

## Follow-up (same day) — searchable dropdowns + dialog profile-name search
Operator: add search to all the mat-select dropdowns, and a profile-name search inside the popups.

Dropdowns — reused the already-installed **`ngx-mat-select-search`** (dependency present; used in
create-watson-profile / in-app-message-input). Added `NgxMatSelectSearchModule` to the component
`imports`. Each of the 7 selects got a first `<mat-option>` wrapping
`<ngx-mat-select-search [(ngModel)]="<term>" [ngModelOptions]="{standalone:true}" ngDefaultControl>`
and its `*ngFor` now iterates a filtered getter:
- Events List → `eventSearch` / `filteredEventsList()` (by `name`)
- Queue List → `queueSearch` / `filteredQueuesList()` (by `queuename`)
- Event section Filter by Product → `eventProductSearch` / `filteredEventProducts()`
- Review Configured Product/Mode → `configuredProductSearch` / `filteredConfiguredProducts()`, `configuredModeSearch` / `filteredConfiguredModes()`
- Configuration Missing Product/Mode → `notConfiguredProductSearch` / `filteredNotConfiguredProducts()`, `notConfiguredModeSearch` / `filteredNotConfiguredModes()`
All back a shared private `filterByText(list, term, key?)` (key omitted for the string `modesList`).
The standalone ngModel keeps the search box out of the reactive `configuredform`/`notconfiguredform`.

Dialog name search — new `dialogSearch` field (reset in `openModeDialog` and `closeDialog`), plus a
`.dialog-search` input in the modal body (above `.table-section`, all views). Wiring:
- Generic table `*ngFor` now iterates `getDialogParticipants()` (filters `selectedMode` /
  `selectedMode.participantproduct` by `mapProfile[...]` name), and its count badge uses that length.
- Event grouped views: `getEventProductGroups` / `getEventProfileGroups` now skip profiles failing
  `matchesDialogSearch(name)` (product groups with 0 matches are dropped).
- `matchesDialogSearch(name)` = case-insensitive substring; empty term ⇒ all.
`.css`: appended `.dialog-search*` block.

Revert follow-up: `.ts` — remove `NgxMatSelectSearchModule` import+usage, the 7 `*Search` fields +
`dialogSearch`, `filterByText` + the 7 `filtered*` getters, `matchesDialogSearch`,
`getDialogParticipants`, the `openModeDialog`/`closeDialog` `dialogSearch=''` resets, and the
`matchesDialogSearch`/empty-group filters inside the two `getEvent*Groups`. `.html` — drop each
`<ngx-mat-select-search>` mat-option and revert every `filtered*()` back to its raw list
(`eventsList`/`queueList`/`productList`/`modesList`), remove the `.dialog-search` block, and revert the
generic table `*ngFor` + count badge to `(tableView == 'transition' ? selectedMode.participantproduct
: selectedMode)` / `selectedMode.participantproduct?.length || selectedMode.length`. `.css` — delete
the appended `.dialog-search*` block.

## Follow-up (same day) — member stats: lazy one-time getDocs (was eager live listener)
Operator: the full `participantsproduct` read shouldn't run on screen open — it only feeds the export
columns. Made it lazy + one-time.
- Removed `this.fetchModeMemberStats()` from `ngOnInit`.
- `fetchModeMemberStats()` is now `async` and uses **`getDocs(collection(... "participantsproduct"))`**
  (one-time, not `collectionData().subscribe()`); dropped `subscription['modestats']`.
- `openExportDialog()` is now `async`: opens the dialog, sets `exportStatsLoading = true`, `await`s
  `fetchModeMemberStats()`, then clears the flag (+`cdr.detectChanges()`).
- `.html`: export dialog footer shows "Loading member counts…" and the Export button is
  `[disabled]="exportStatsLoading"` (+ label flips to "Loading…"). `.css`: `.export-loading`,
  `.btn-export:disabled`.
Net: the whole-collection read happens once per export-dialog open, not on every screen visit, and
no longer holds a live listener.
Revert: re-add `this.fetchModeMemberStats()` to `ngOnInit`, revert the method body to
`this.subscription['modestats'] = collectionData(...).subscribe(...)`, make `openExportDialog` sync
(drop the loading block), remove `exportStatsLoading` + the footer loading UI/CSS.

## Follow-up (same day) — "Clear Filters" wherever a filter exists
Added a clear control to each filter cluster (dialog name-search already had its ✕).
- `.ts`: `eventProductFilter` model (bound on the Event-section product select so it can be reset);
  `hasEventQueueFilter()`/`clearEventQueueFilter()` (resets event+queue+product selects, the 3 event
  search terms, and empties `mapEventData`/`mapEventDataOriginal`); `hasConfiguredFilter()`/
  `clearConfiguredFilters()` (`configuredform.reset({product:[],mode:[]})` + `configuredDateRange.reset()`
  + search terms, then re-filter); `hasNotConfiguredFilter()`/`clearNotConfiguredFilters()` (same for
  the not-configured form).
- `.html`: `[(ngModel)]="eventProductFilter"` on the event product select; a `.clear-filters-btn`
  (`*ngIf="has*Filter()"`) in each of the three sections. The Review-Configured date range keeps its
  own inner "Clear" too.
- `.css`: `.clear-filters-btn` (+`:hover`).
Revert: delete the 3 `has*`/`clear*` method pairs + `eventProductFilter`, remove the three
`.clear-filters-btn` buttons and the `[(ngModel)]` on the event product select, and delete the
`.clear-filters-btn` CSS.

## Follow-up (same day) — fix: Event/Queue "Filter by Product" did nothing
Root cause (pre-existing bug, surfaced now): `updateEventData`/`updateQueueData` stored the reset
baseline as `mapEventDataOriginal = JSON.parse(JSON.stringify(productMap))`. That deep clone strips
the Firestore `productref` (a `DocumentReference` whose `.id` is a getter, not an own enumerable
prop), so on the cloned data `participant.productref?.id` is `undefined`. `filterEventQueueByProduct`
matches `productref?.id === productId` against that → zero matches → badges vanish, i.e. filter "not
working."
Fix: use a **shallow copy** (`{ ...productMap }`) for `mapEventDataOriginal` in both update methods,
and `{ ...this.mapEventDataOriginal }` in the reset branch of `filterEventQueueByProduct`. Arrays are
never mutated (filtering builds new maps), so shallow is safe and preserves the real productref.
Revert: restore the three `JSON.parse(JSON.stringify(...))` calls (re-introduces the bug).

## Pending / caveats
- Not verified in-browser: route is Firebase-auth gated with live Firestore, so the preview can't
  exercise it. Verified by a clean `ng build` + logic review only.
- Export writes the currently-filtered `configuredModes` / `notConfiguredModes` (respects the
  product/mode/date filters on screen). If "export everything regardless of filter" is wanted later,
  switch the exports to the `temp*` master arrays.
- The date filter deliberately drops configured items lacking `lastupdate` once a bound is set
  (they have no configured-on date to match against).
