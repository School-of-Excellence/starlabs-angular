# 2026-09-29 · Centralised appointment system (`/specialistappointmentstudio`)

Plan (WHAT): `specs/plans/2026-09-29-centralised-appointments.md`. This journal is the WHY.

## What was done
One role-aware screen replaces the need to hop between availability / booking / calendar / studio.
Built from the prototype `~/Downloads/starlabs-appointments-v2.html`, with every section's logic
dictated by the operator in plan-mode comments.

- **Roles (users_roles flags)**: A&H = admin, ah, ahmember, developer, tester, scheduler · Mentor = mentor ·
  CW = eis, journeycoach, changeagent. Priority Mentor > A&H > CW (highest wins, no switcher). Changed from A&H-first on the operator's call the same day: a mentor who also holds an A&H flag lands on the mentor view.
- **CW**: Home. **Mentor**: Home + My Team. **A&H**: Overview, Mentors, Utilisation, Book Session, Settings.
- Dropped on the operator's call: top bar, bell, Block time, notes, legend, reschedule, stages /
  Product Progress, the Products tab, the participant view (parked).

## Why each constraint landed
- **Reuse the existing collections and dialogs, not a new model.** `availability` + `appointments` are
  shared with the Flutter participant app and the Cloud Functions (emails, reminders, off-time). A new model
  would fork booking. So: `AppointmentDetailComponent` → `MarkAppointmentStatusComponent` for status,
  `guard.cancelAppointment()` for cancel, `BookAppointmentComponent` embedded unchanged for booking.
- **Available = window hours, not the sum of slot hours.** `computeSlot` cuts one slot every 30 min *per
  type*, so slots overlap; summing `available:true` slots overcounted ~3x. Booked time is the union of booked
  slots, counted once. Operator confirmed.
- **Utilisation = delivered ÷ available.** The operator wrote "available / delivered"; confirmed they meant
  the 0–100% reading.
- **No-show = `cancelled:true` + reason "Client didn't show up".** That is what `MarkAppointmentStatusComponent`
  already writes; no new field.
- **Static availability sets `fixed:true`; `computeSlot` then writes one slot per type (start→end).**
  The CF runs on every availability create, so a client-only flag would still get 30-min slots. Changed in
  `starlabs-cloud-function/functions/components/appointment.js` (computeSlot). Auto mode adds no flag.
- **Mentor team chain**: `users_roles.productowner` (atc model names, ticked in Profile list) →
  `products.atcmodel` → `productToDeliverySequence` → appointmenttype activities → `AppointmentType-To-Roles`
  (required + additional) → `Roles-To-EIS.assigned_eis`. Mirrors the existing product-owner query in
  appointment-studio (`fetchproductownerAppointments`).
- **Add-availability keeps the existing gate** (last finished appointment must have a status) and the
  existing overlap rule — same behaviour as `add-appointment-availability`.
- **`AppointmentDetailComponent` got a `disableCancel` flag** so CW/Mentor views don't show Cancel (A&H only).
  Backward compatible: absent flag = old behaviour everywhere else.
- **Styles are un-encapsulated and scoped** to `.sas-root` / `.sas-dialog` so the dialog (CDK overlay, outside
  the screen) gets them too. The dialog is opened with `viewContainerRef` so it sees the screen-scoped service.

## Found / surprised us
- `BookAppointmentComponent`'s admin path is `admin || scheduler || ah` only. An A&H user holding just
  `ahmember` / `developer` / `tester` gets the participant self-booking path inside Book Session. Not changed
  (embed unchanged was the decision) — flag for the operator.
- `graphify` Python module is not installed on this machine, so the graph rebuild was skipped.

## Verified
- `ng build --configuration production` clean (no warnings from the new files).
- `ng test` on the new folder: **30/30** (hours maths incl. overlap, role priority, computeSlot preview,
  add-availability validation, period bar, settings, shell nav).
- `node --check` on the changed CF file.
- Not yet: live browser run (needs a login in the preview pane + a `dashboard` ACL entry for the route).

## Pending
1. `dashboard` config entry for route `specialistappointmentstudio` (roles: all of the above), else the guard
   shows "Contact Admin".
2. Deploy `computeSlot` (starlabs-cloud-function) — until then Static availability still gets 30-min slots.
3. Live check on starlabs-test as a CW, a Mentor and an A&H user.
4. e2e suite + hooks registration in starlabs-e2e-tests before any push (hook prefixes below).
5. Commit — only on the operator's go-ahead.

## Hook prefixes (literal `data-testid`s)
`sas` shell · `sah` home · `saa` add availability · `sap` period bar · `stt` team table · `stm` my team ·
`smn` mentors · `sut` utilisation · `sst` settings.

## Revert guide (per screen)
| Screen / change | Revert |
|---|---|
| Whole new screen | delete `src/app/Scheduling/specialist-appointment-studio/` and the `specialistappointmentstudio` line in `app.routes.ts` |
| Cancel hidden for CW/Mentor in the detail dialog | remove the `disableCancel` check in `appointment-detail.component.ts` constructor |
| Static availability (fixed:true) | remove the `fixed` block at the top of `computeSlot` in `starlabs-cloud-function/functions/components/appointment.js` and redeploy; stop writing `fixed` in `sas-add-availability.component.ts` save() |

## Follow-up changes (same session, operator requests)
- **Mentor view needs a product.** `mentor` flag + a non-empty `users_roles.productowner` → Mentor view.
  A mentor with no product falls through: A&H flags → A&H view, otherwise → CW view. Why: a mentor without a
  product has no team to show, so the CW list view is the useful one.
- **My Team → Your products.** Each owned product expands to the appointment types in its delivery sequence
  (sequence order), each type's roles (required / additional) and the EIS on each role. The team is now the
  union of that breakdown (`productsFor()`), so the product list and the team table can never disagree.
- **Name search on My Team** filters the product breakdown (only matching EIS, matching products auto-open)
  and the team table (EIS name or any of their participants). Typing never re-queries Firestore.
- **Open time = bookable time.** Open this week / "still open to book" is now the union of free, future slots,
  not window length minus booked. Why: leftover minutes too short for any session, or past time, used to count
  as open, so a person could read "Fully booked" next to open time. Status now comes from the same rule:
  In session > Available (open time > 0) > Fully booked (windows, nothing bookable) > No availability (no windows).
- **Add availability dialog layout fix.** Material 19 sets `display: contents` on the dialog component host
  (`mat-mdc-dialog-component-host`), which silently dropped the width/padding/background put on it. The box
  now lives on an inner `.sas-dialog` wrapper.

## Follow-up changes, part 2 (same session)
- **View as** replaces the single automatic view: every view the user holds a role for (Mentor > A&H > CW order).
  Opens on the highest usable view; a mentor without a product opens elsewhere if they can, and the Mentor view
  itself says "No product owner is assigned to you". Why: people with several roles need all their screens.
- **Team table**: Available / Booked columns added (so Utilisation % can be checked by hand); No-shows and
  Open this week removed (operator); expanded row lists every availability window with its status
  (Completion pending > Completed > Cancelled/Unused > Partly booked/Open/Fully booked), each booking's
  start–end, type, participant and status, plus a status filter.
- **No-show is never shown**: stored as cancelled (reason "Client didn't show up"), so it reads and counts as
  Cancelled, and that reason text is hidden.
- **Past sessions lazy-load**: newest first on the existing hosts + endtime-desc index, ~10 per Load more.
- **Join** opens AppointmentZoomViewComponent (/openappointmentzoom/:id) in a new tab.
- **Static availability**: per-day slot lists (type + start, end = start + duration, several per day, Copy to all
  days), one fixed availability doc per slot. Why one doc per slot: every existing screen treats a doc as one
  continuous window; a doc holding 9:00 and 14:00 would count the gap as available. Side effect: a slot exactly
  one duration long already gets one slot from the undeployed computeSlot, so Static no longer waits on the CF.
- **Type dropdown** is a mat-select (native select in the Material dialog was reported not opening; could not
  reproduce — the native one did re-enable in tests), and never silently disabled.
- **A&H Overview calendar** shows all specialists (name on each window, bookings matched by specialist + time;
  month view shows counts).
- **Race fixed**: `load()` keeps only the latest call's result — an older load finishing late used to overwrite
  a newer period.
- **Loaders** on every screen (inline Material spinner; LoadingProgressComponent is dialog-only).

## Pushed without e2e coverage
Operator chose to push before the starlabs-e2e-tests suite exists (breaks the CLAUDE.md "e2e before push" rule for
this push). Hooks are in place; prefixes: sas, sah, saa, sap, sal, stt, stm, smn, sut, sst.
