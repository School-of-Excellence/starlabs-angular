# 2026-07-20 — Revoke for requested participants + read-only Revoke tab

Branch: `dynamic-studio-update` (pulled `development` at start of session).

## What
Two independent screen changes, both around participation **revoke**:

1. **Event Participation Confirmation** screen (`ProductFunnelComponent`,
   `src/app/Events/event-participation-confirmations/product-funnel.component.*`)
   — added a **Revoke** option for still-**requested** participants. It is a
   *lightweight, status-only* revoke: it flips the `event participation request`
   doc `status -> 'revoked'` and records `revoked_by` + `revoked_date`, and
   **nothing else**.

2. **event_participation_approve** screen (`EventParticipationApproveComponent`,
   `src/app/Events/event-participation-approve/event-participation-approve.component.*`)
   — added a new **"Revoke"** tab that lists participants whose request
   `status == 'revoked'`. **Read-only: no checkboxes, no action buttons.**

## Why
Operator request. Requested people (not yet approved) had no way to be revoked
on the confirmation screen — the only existing revoke (`markRevoked()`) is the
*heavy* approved-path revoke that also cancels the product, deletes the
`events_profiles` record, and clears `deliverables`. A requested participant has
none of those yet (no initiated product / event profile / deliverables), so
reusing `markRevoked()` would fail. Hence a separate status-only method.

The approve screen needed a place to *see* revoked participants; operator asked
for a plain tab with no row actions.

## Files touched
- `src/app/Events/event-participation-confirmations/product-funnel.component.ts`
  - New getter `selectedToRevokeRequested` — selected rows that have a request
    doc (`requestData.docid`) and are not yet approved.
  - New method `markRevokedRequested(rows)` — confirm dialog → progress dialog →
    one `writeBatch` of `update(event participation request/{docid}, {status:
    'revoked', revoked_by, revoked_date: serverTimestamp()})` → snackbar →
    `loadData()`. Reuses `this.guard.loggedinProfile['profileid']` for
    `revoked_by`, exactly like the approved-path `markRevoked()`.
- `src/app/Events/event-participation-confirmations/product-funnel.component.html`
  - Added a `Revoke {{ selectedToRevokeRequested.length }}` **bulk** button
    (class `sx-danger`, `block` icon) in the `selectionMode==='approve'` action
    bar, right after the `Approve` button (only visible in the `eligible`
    action bar).
  - Added a **per-row** `Revoke` button (class `sx-mark-danger`) in the row
    status cell, shown for BOTH requested and approved rows outside attend mode:
    `(row.isApproved && row.approvedRequestId) || (row.isRequested &&
    !row.isApproved && row.requestData?.docid)`. It calls a single dispatcher
    `revoke(row)` which routes approved rows to the heavy `markRevoked([row])`
    (cancel product + delete event profile + clear deliverables) and requested
    rows to the light `markRevokedRequested([row])` (status-only).
- `product-funnel.component.ts` also gained the `revoke(row)` dispatcher.
  - Commented out (kept in source, wrapped in `<!-- -->`) the **Mark attended**
    and **Not attended** buttons — both the bulk pair in the `attend` action bar
    and the per-row pair in the attendance status cell. Revoke buttons and the
    Attended / No-show status text are untouched. Operator request.
- `src/app/Events/event-participation-approve/event-participation-approve.component.ts`
  - New state: `revoked = []`, `displayedColumns4 = ['sno','clientname','product','status']`,
    `dataSource4`, `@ViewChild paginator4`/`sort4`, `applyFilterD4()`.
  - `onEventSelect()` loop: reset `this.revoked = []`; push rows where
    `status == 'revoked'`.
  - `ngAfterViewInit()`: wire `dataSource4` (data/sort/paginator).
- `src/app/Events/event-participation-approve/event-participation-approve.component.html`
  - New `<mat-tab label="Revoke">` with a filter box + table
    (sno / clientname / product / status). No action column, no checkboxes.

## Notes / surprises
- `product-funnel` `selectionMode` is `'approve'` only for the `eligible` /
  `notRequested` segments. `notRequested` rows have **no** `requestData`, so the
  getter guards on `requestData?.docid` — nothing to revoke for those.
- The status-only revoke intentionally does **not** touch `participantsproduct`,
  `events_profiles`, or `deliverables` (requested participants have none).
- `revoked_by` / `revoked_date` field names match the approved-path revoke, so
  both feed the same "Revoked" segment display (`revokedBy` / `revokedDate`).
- Build: `ng build --configuration development` compiles clean (no errors in
  either changed file; only pre-existing unrelated CSS/import warnings).
- Not committed (operator gates commits/pushes).

## Revert guide (per-screen)

### Screen A — product-funnel (requested revoke)
1. `product-funnel.component.ts`: delete the `selectedToRevokeRequested` getter
   and the whole `markRevokedRequested()` method.
2. `product-funnel.component.html`: delete the bulk
   `Revoke {{ selectedToRevokeRequested.length }}` `<button>` in the
   `selectionMode==='approve'` action bar, AND the per-row `Revoke` button in
   the row status cell (guarded by `row.isRequested && !row.isApproved`).
   (Any `status:'revoked'` docs already written are harmless — they simply show
   in the existing Revoked segment.)
3. To restore Mark attended / Not attended: delete the `<!-- ... -->` wrappers
   around those buttons (bulk pair in the `attend` action bar; per-row pair in
   the status cell). The `markAttended` / `markUnattended` methods were left
   intact, so uncommenting is all that's needed.

### Screen B — event-participation-approve (Revoke tab)
1. `event-participation-approve.component.html`: delete the
   `<mat-tab label="Revoke">` block.
2. `event-participation-approve.component.ts`: delete the `// Revoke` state
   block (`revoked`, `displayedColumns4`, `dataSource4`, `paginator4`, `sort4`);
   remove `this.revoked = []` reset; remove the `else if (status == 'revoked')`
   push; remove the `dataSource4` wiring in `ngAfterViewInit()`; delete
   `applyFilterD4()`.
