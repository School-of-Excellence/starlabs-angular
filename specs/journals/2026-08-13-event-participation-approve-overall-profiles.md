# 2026-08-13 — event-participation-approve: overall profiles count on every tab

## What
Operator wanted an "overall profiles" number shown at the top of *every* tab of
the `event_participation_approve` screen (Approved, Mark Attendence, Attended,
Unattended, Revoke).

## How
- `event-participation-approve.component.ts`:
  - `distinctProfiles(list)` — count of **distinct** `profileid`s in the passed
    list. Distinct, not raw row count, because a profile can hold more than one
    request/product row and "profiles" means people.
  - `productProfileCounts(list)` — per-product breakdown: for each `product`
    (mapped name), the number of distinct `profileid`s, sorted by product name.
- `event-participation-approve.component.css`: `.overall-profiles` is an in-flow
  `flex:1` centering wrapper (was absolute-centered) hosting an `.op-pill`
  (blue rounded pill). `.product-counts` renders each product row as a
  `space-between` flex line (product name left, count right). In-flow so the
  taller pill grows downward and never overlaps the table.
- `event-participation-approve.component.html`: inside each tab's `.actionbox`,
  the pill now contains the Overall Profiles line **and** a `.product-counts`
  block (`*ngFor` over `productProfileCounts(<list>)`) below it. Each tab passes
  its own list: Approved→`approved`, Mark Attendence→`attendance`,
  Attended→`attended`, Unattended→`unattendedList`, Revoke→`revoked`.
  The Approved and Revoke tabs had no `.actionbox`, so their Filter field was
  wrapped in a new `.actionbox` to host the centered pill.

## Notes
- The count is **per-tab** (deduplicated by profileid within that tab's list),
  so it changes from tab to tab. The per-tab label counts (`approved.length`,
  etc.) are raw row counts and can be higher when a profile has multiple rows.
- Not verified in-browser — screen is Firebase-auth gated (see
  `project_preview-harness` memory). Change is template/getter only.
- Not committed (operator gates commits).

## Revert guide (per-screen)

### Screen — event-participation-approve (overall profiles banner)
1. `event-participation-approve.component.html`: delete the five
   `<div class="overall-profiles">…</div>` blocks (one inside each tab's
   `.actionbox`, each containing `.op-pill` → Overall Profiles line +
   `.product-counts`). For the Approved and Revoke tabs, also unwrap the
   `.actionbox` that was added around their Filter field (restore the bare
   `<mat-form-field>`).
2. `event-participation-approve.component.ts`: delete the `distinctProfiles`
   and `productProfileCounts` helpers.
3. `event-participation-approve.component.css`: delete the `.overall-profiles*`,
   `.op-pill`, and `.product-counts*` rules, and remove `position: relative`
   from `.actionbox`.
