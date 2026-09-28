# 2026-07-21 — Arena E-Ticket Approve: stale subscription, event search, start-date sort

Branch: `dynamic-studio-update`.
Screen: **Arena E-Ticket Approve** (`ArenaETicketApproveComponent`,
`src/app/Events/arena-e-ticket-approve/arena-e-ticket-approve.component.*`).

## What
Three fixes to the single "Select Event → approve arena e-tickets" screen:

1. **Stale subscription on event change.** Switching the selected event left the
   previous event's live Firestore listeners running, so the old event's rows /
   e-ticket state kept flowing into the table and maps.
2. **Search in the "Select Event" dropdown.** The main event picker had no
   search — added `ngx-mat-select-search`.
3. **Sort events by start date.** Event lists were ordered by `end_date`.
4. **Loader after selecting an event.** Show a spinner from the moment an event
   is picked until its approved-participation data arrives.
5. **Clickable summary cards.** Top-of-page cards counting Venue Fee Paid/Not
   Paid, Contract Signed/Not Signed, E-Ticket Approved/Not Approved; clicking a
   card filters the table to that bucket (click again to clear).
6. **Default sort: Name ascending.** Table opens sorted A→Z by participant name.
7. **Removed the redundant "Filter By → Event" dropdown.** The top "Select Event"
   picker already scopes the whole table to one event, so every row shares the
   same `eventref` — filtering that single-event dataset by event was a no-op.
8. **Profile filter is now multi-select with a clear button.** Pick several
   participants at once; an `x` suffix button clears the whole selection.
9. **Doc ID column.** Added a leading "Doc ID" column showing each row's
   `event participation request` doc id (`row.docid`).

## Why
Operator request. On (1), `onEventSelect()` created three
`collectionData(...).subscribe()` listeners piped only through
`takeUntil(this.destroy$)`. `destroy$` fires only on component destroy, so a
second event selection *added* listeners on top of the first — the old
subscriptions never completed and `dataSource.data` / `mapArenaETicket` /
`mapEligibility` kept being overwritten by both events' snapshots ("old
subscription still active").

## Files touched
- `arena-e-ticket-approve.component.ts`
  - Added `private eventChange$ = new Subject<void>()` — a per-selection teardown
    subject, separate from `destroy$`.
  - Constructor query: `orderBy("end_date","desc")` → `orderBy("start_date","desc")`.
    This orders both `eventList` (used by the dropdowns) and load order.
  - `onEventSelect()`: at the top now calls `this.eventChange$.next()` (completes
    the prior event's listeners) and resets `mapArenaETicket = {}`,
    `mapEligibility = {}`, `dataSource.data = []`. All three `collectionData`
    subscriptions now pipe `takeUntil(this.eventChange$)` **and**
    `takeUntil(this.destroy$)`. The arena e-ticket subscribe also resets its map
    inside the callback so a live snapshot fully replaces (not accumulates).
  - `ngOnDestroy()`: also `next()`/`complete()` `eventChange$`.
  - New field `selectEventSearch = ""` and method `filterSelectEvents()` (filters
    `eventList` by name; list is already start_date-sorted).
  - Loader: new field `loading = false`; imported/added `MatProgressSpinnerModule`.
    `onEventSelect()` sets `loading = true` up front; the approved-participation
    subscription callback sets `loading = false` when the first snapshot arrives.
    Because the table (and its `@ViewChild` paginator/sort) now sits inside an
    `*ngIf="!loading"` block, the `ngAfterViewInit()` re-wire in that callback is
    deferred via `setTimeout(...)` so the ViewChild refs exist when it runs.
  - Summary cards: new state `cardFilter` (one active bucket or null), `summary`
    counts object, and `filterForm.card`. Classification helpers
    `isVenuePaid`/`isContractSigned`/`isETicketApproved` **reuse the exact table-
    column logic** (`getVenueFeeStatus(row)==='Paid'`,
    `getContractStatus(row)==='completed'`, `mapArenaETicket[profileid]!=undefined`)
    so cards and columns can never disagree. `matchesCard()` maps a bucket id to a
    predicate and is AND-ed into `customfilter()`. `computeSummary()` recounts over
    `dataSource.data`. `toggleCard()` sets/clears the active card and re-filters.
    `computeSummary()` + `onFilter()` are re-run in the arena-e-ticket and
    eligibility subscriptions too (those maps arrive after the row data, so the
    counts/filter must refresh when they land). `onEventSelect()` resets the card
    filter.
- `arena-e-ticket-approve.component.html`
  - "Select Event" `<mat-select>`: replaced `*ngFor over (mapEvents | keyvalue)`
    with a leading `ngx-mat-select-search` option (bound to `selectEventSearch`)
    plus `*ngFor over filterSelectEvents()`, `[value]="option.docid"`. `docid`
    equals the old `keyvalue` key, so `selectedEvent` semantics are unchanged.
  - Added a `*ngIf="loading"` spinner block (`<mat-spinner [diameter]="48">` +
    "Loading event data…") above the data section; the data `<div>` guard changed
    from `selectedEvent != null` to `selectedEvent != null && !loading`.
  - Added a `.summary-cards` block at the top of the data `<div>` — three groups
    (Venue Fee / Contract / E-Ticket), each with two clickable `<button>` cards
    bound to `toggleCard(...)` and highlighted via `[class.active]`.
  - Table `matSort` now defaults to `matSortActive="profileid"`
    `matSortDirection="asc"` (Name A→Z on open).
- `arena-e-ticket-approve.component.ts` (`ngOnInit`)
  - Added `dataSource.sortingDataAccessor`: the `profileid` (Name) column sorts by
    the resolved `mapProfile[profileid].name` (lowercased) instead of the raw id;
    other columns fall back to the row value (lowercased if a string).
- Redundant event filter removed: dropped the `event:[]` key on `filterForm`, the
  `filterEvent` field, the `filterEvents()` method, the `value['event']` clause in
  `customfilter()`, and the "Event" `<mat-form-field>` in the template. `eventList`
  + `filterSelectEvents()` stay (they power the top "Select Event" search).
- Profile filter → multi-select: `filterForm.profileid:null` became
  `profileids:[]`; the Profile `<mat-select>` gained `multiple`; the `value['profileid']
  === e.profileid` predicate clause became `value['profileids'].includes(e.profileid)`
  (skipped when the array is empty); dropped the `[value]="null">None` option. New
  `clearProfileFilter($event)` (stops propagation, empties `profileids`, re-filters)
  wired to a `matSuffix` `mat-icon-button` (`close`) shown only when a selection exists.
- Doc ID column: prepended `"docid"` to `displayedColumns` and added a
  `matColumnDef="docid"` (`mat-sort-header`, cell `{{row.docid}}`) as the first
  table column.
- `arena-e-ticket-approve.component.css`
  - Added `.summary-cards` / `.summary-group` / `.summary-card` styles. Neutral,
    professional look (operator asked for no colour): each metric is a bordered
    group panel with an uppercase header and two clickable halves split by a
    hairline; full width via `flex:1 1 …`. Active card = subtle grey fill +
    inset dark top bar (`box-shadow: inset 0 2px 0 0 #374151`). No green/red.

## Notes / surprises
- `orderBy("start_date", …)` assumes every event doc has `start_date`. Safe here:
  the template already dereferences `mapEvents[selectedEvent]['start_date'].toDate()`
  with no null guard (line ~55), so start_date is a hard assumption on this screen.
- The filter-by "Event" multi-select dropdown already had search
  (`filterEvents()` / `filterEvent`); untouched. Only the top picker lacked one.
- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` → exit 0, no errors.
- Not committed (operator gates commits/pushes).

## Revert guide (per-screen)

### Screen — Arena E-Ticket Approve
1. `arena-e-ticket-approve.component.ts`:
   - Remove `private eventChange$ = new Subject<void>()`.
   - Restore query: `orderBy("start_date","desc")` → `orderBy("end_date","desc")`.
   - In `onEventSelect()`: delete the top teardown/reset block
     (`this.eventChange$.next()` + the three map/data resets); change each
     subscription's pipe back from
     `takeUntil(this.eventChange$),takeUntil(this.destroy$)` to just
     `takeUntil(this.destroy$)`; remove the `this.mapArenaETicket = {}` reset
     added inside the arena e-ticket callback.
   - In `ngOnDestroy()`: remove the two `eventChange$` lines.
   - Delete field `selectEventSearch` and method `filterSelectEvents()`.
   - Loader: remove field `loading`, the `MatProgressSpinnerModule` import + array
     entry, the `this.loading = true` line in `onEventSelect()`, and revert the
     approved-participation callback back to a direct `this.ngAfterViewInit()`
     (drop the `this.loading = false` line and the `setTimeout` wrapper).
   - Summary cards: delete `cardFilter`, `summary`, the `card` key on `filterForm`;
     delete helpers `isVenuePaid`/`isContractSigned`/`isETicketApproved`,
     `matchesCard`, `computeSummary`, `toggleCard`; remove the
     `&& this.matchesCard(...)` clause from `customfilter()`; remove the
     `computeSummary()`/`onFilter()`/`cardFilter` reset calls added to
     `onEventSelect()` and the three subscription callbacks.
   - Name sort: delete the `dataSource.sortingDataAccessor` assignment in
     `ngOnInit()`.
2. `arena-e-ticket-approve.component.html`: restore the "Select Event"
   `<mat-select>` body to the single line
   `<mat-option *ngFor="let option of mapEvents | keyvalue" [value]="option.key">{{option.value['name']}}</mat-option>`
   (remove the `ngx-mat-select-search` option and the `filterSelectEvents()` loop).
   Delete the `*ngIf="loading"` spinner block and change the data `<div>` guard
   back from `selectedEvent != null && !loading` to `selectedEvent != null`.
   Delete the `.summary-cards` block. Remove `matSortActive="profileid"`
   `matSortDirection="asc"` from the `<table … matSort>` to drop the default sort.
   Doc ID column: remove `"docid"` from `displayedColumns` (ts) and delete the
   `matColumnDef="docid"` `<ng-container>` (html).
3. `arena-e-ticket-approve.component.css`: delete the `.summary-*` rules (leave
   the original `table{ width:100% }`).
