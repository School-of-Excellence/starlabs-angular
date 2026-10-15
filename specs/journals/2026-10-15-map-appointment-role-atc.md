# 2026-10-15 — Map Appointment Role dialog: ATC section

**Plan:** `specs/plans/2026-10-15-map-appointment-role-atc.md`.
**Files:** `Scheduling/map-appointment-role-dialog/map-appointment-role-dialog.component.{ts,html,css}`.

## What landed
An "ATC" card in the dialog: a checkbox "An ATC is given in this appointment"; when ticked, one row per
**required** role with a single-select of `bigactivity` docs that have an `atcproperty`
(`activity · atcproperty`). Saved on `AppointmentType-To-Roles/{id}` as
`atcrequired: boolean` and `atcrolemap: { [eisroles id]: bigactivity id }`.

## Why each constraint
- **Single select, stored as role id → activity id.** One activity per role, so the inner value is the
  bigactivity id itself (operator chose this map shape over a 1-item array, 2026-10-15).
- **Required roles only.** Operator decision; additional roles get no ATC row, so `atcrolemap` keys are
  always a subset of `required_role`.
- **Every row required while ticked.** A ticked box with a role that fills no activity is
  ambiguous data; the form blocks Update until each row has a pick (`markAllAsTouched` on submit now
  surfaces errors, which previously failed silently).
- **`mergeFields` instead of `merge: true`.** `merge: true` deep-merges map fields, so a role removed
  from `atcrolemap` would have stayed in Firestore forever. `mergeFields: Object.keys(newData)` replaces
  each field this dialog owns whole and leaves any other field on the doc alone.
- **`appointmentforms` not written.** It appeared in the operator's sample but nothing owns it yet;
  writing `[]` from here would erase whatever a future forms screen stores.
- **Unticking disables the row group instead of deleting it.** Disabled controls don't validate and
  aren't in `form.value`, so the save writes `atcrolemap: {}`; re-ticking within the same dialog restores
  the picks.
- **Rows are rebuilt from `required_role.valueChanges`**, subscribed before the edit-mode `patchValue`,
  so editing an existing mapping builds the rows first and then fills them from the saved map.

## Blast radius checked
The dialog is the only writer of the collection; the 10 readers only use the role arrays. Existing docs
open unticked and save `atcrequired:false, atcrolemap:{}`.

## Verification
- `tsc -p tsconfig.app.json --noEmit` green; `ng build --configuration development` green.
- Not yet exercised in a browser (needs a signed-in admin) and no e2e spec yet.

## Pending
- e2e spec in `starlabs-e2e-tests` `appointments` suite (owns `src/app/Scheduling/**`) for the
  `mard-atc-*` hooks, against the emulator — required by CLAUDE.md before pushing.
- Optional: an "ATC" column on the list screen.
