# 2026-10-01 · Specialist Appointment Studio — testing report round 1

Plan: `specs/plans/2026-10-01-specialist-studio-testing-round1.md`. Earlier history:
`specs/journals/2026-09-29-centralised-appointments.md`.

## What was done
Each item in the testing report was gone through with the operator one at a time. Built: 2, 3, 4+5, 7, 8, 9, 10, 11, 12,
plus two new requests: a product + appointment-type filter (Home and Book Session) and a
Booked / Not booked filter (Home). Parked: 1 (responsive), 6 (edit), E1 (pre-assign specialists), E2 (participant tracker).

## Why each constraint landed
- **Edit availability parked:** `computeSlot` is `onDocumentCreated` only, so updating a doc in place
  would leave stale slots. The operator's rule is no edit at all: delete an unbooked window and add a
  new one.
- **Hours under a type filter come from the matching slots** (`scopeWindow` trims the window to the span of
  those slots). An auto window's hours can't be split between its types, and the operator chose "show only
  matching slots" over counting the whole window.
- **Booked / Not booked leaves the stats alone:** with "Booked", Available would equal Booked and utilisation
  would mean nothing. It narrows the calendar only; "Not booked" means future open slots and also hides
  sessions.
- **Day columns hide blocked and past-unbooked slots** (option a): auto windows cut a start every 30
  minutes, so showing blocked overlaps made the list long, which was the tester's complaint.
- **Cancelled sessions are left out of Day columns:** a cancellation frees the slot again, and Past
  sessions still lists them.
- **Today switches to Day mode only on calendar screens** (`allowDay`). My Team, Mentors and
  Utilisation keep Week and Month, as the operator asked.
- **The Join clock runs outside the Angular zone:** an in-zone `setInterval` keeps the zone busy forever,
  so `whenStable` never settles (it hung the specs, and would do the same for SSR or e2e waits).
- **`book-appointment` filter inputs default to null**, so `/bookappointment` is unchanged. Only the
  studio's Book Session passes them.
- **The filter bar loads options per role:** A&H sees every product and type. Mentor sees owned
  products and the types they can give. CW sees products holding a type they can give. Picking a
  product ticks its delivery-sequence types. With no type ticked, the product's own types apply, which
  can be none (filters to nothing, with a note).
- **Bulk delete re-checks** `canDelete` at click time and writes in batches of 400.

## Found / surprised us
- Issue 3's root cause was CSS specificity: `:hover:not(:disabled)` beat `.is-edge` / `.is-in`, so the
  selected colour only showed after mouse-out.
- `products` without an `atcmodel` are not in the filter's product list (`productsFor` keys on atcmodel).

## Verified
- Development build is clean. 78/78 studio specs pass (new: logic round-1 block, filter bar, window
  details, Home filters/Day/bulk, Join timing, period bar Day).
- Live screen not checked: localhost:4200 redirects to login.

## Pending
- Live check as CW, Mentor and A&H; e2e suite (now also prefixes `saf`, `saw`).
- Parked: responsive layout, edit, pre-assign specialists, participant tracker.

## Hook prefixes added
`saf` (filter bar), `saw` (availability details). New `sah` hooks: `sah-day-*`, `sah-avail-*`, `sah-day-open`.
New `sap` hook: `sap-day`.

## Revert guide (per change)
| Change | Files | How to revert |
|---|---|---|
| Time format | `sas-logic.ts` `fmtHours` | restore the decimal version (`Math.round(min/6)/10 + ' hrs'`) |
| Range-calendar hover | `specialist-appointment-studio.component.css` `.sas-rc-d:hover…` | drop the two `:not(.is-in):not(.is-edge)` |
| Settings label | shell `NAV`, `sas-settings` `<h1>` | rename back to Settings |
| Day mode | `sas-logic.ts` period block, `sas-period-bar` (`allowDay`), Home `gotoDay` / day branch | remove `'day'`; `gotoDay` → `gotoWeek` |
| Day columns | `sas-logic.ts` `dayColumns`, Home template day branch, CSS `.sas-dcols` | delete the branch and the function |
| Window details | `sas-window-detail/`, Home `openWindow`, `matTooltip` on `sah-window` | delete the folder; remove the click/tooltip |
| Product/type/booked filter | `sas-filter-bar/`, `filterOptions` in the service, Home `apply`/`onFilter`, `scopeWindow`/`apptMatches`/`windowMatchesBooked` | remove `<app-sas-filter-bar>` and call `apply()` with `NO_FILTER` |
| Book Session filter | shell template + `bookFilter`; `book-appointment` `filterProductId`/`filterTypeIds`, `shownProducts`/`shownAppointments`, `ngOnChanges` | drop the inputs; template back to `journey.products` / `product.appointment` |
| Bulk delete | Home `sah-avail` section, `canDelete`/`toggleAll`/`deleteSelected` | delete the section and methods |
| Join timing | `joinOpen` in logic; Home `clock`, `canJoin`, `joinTip`, guard in `join()` | remove the guard and the `[disabled]` |

## Next: testing report round 2 (2026-10-05)
See `specs/journals/2026-10-05-specialist-studio-testing-round2.md`.
