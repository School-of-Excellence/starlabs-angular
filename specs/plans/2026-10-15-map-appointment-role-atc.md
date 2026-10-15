# 2026-10-15 — Map Appointment Role dialog: ATC section

**Status:** approved by operator 2026-10-15.
**Screen:** `/mapappointmentrole` → `Scheduling/map-appointment-role-dialog/` (`MapAppointmentRoleDialogComponent`).

## Goal
Let an admin record, per appointment type, whether an ATC is prescribed in the appointment and which
`bigactivity` each required role fills.

## UI
- New "ATC" card below Additional Role: title, subtitle, "New" badge, checkbox
  "An ATC is given in this appointment". Unticked → nothing else shows.
- Ticked → one row per **required** role (additional roles get no row). Each row has a **single-select**
  `mat-select` of `bigactivity` docs that have an `atcproperty`, labelled `activity · atcproperty`.
- Every row is required while the box is ticked ("Activity required"); Update is blocked until each
  required role has an activity.
- Ticked with no required role selected → hint "Select a Required Role above…".

## Data (`AppointmentType-To-Roles/{id}`, default Firestore)
New fields, alongside the unchanged `id`, `assigned_appttype_ref`, `required_role`, `additional_role`,
`assigned_role`:
```
atcrequired: boolean
atcrolemap:  { [eisroles id]: [bigactivity docid] }   // 1-item array per role; {} when unticked
```
- Array value (not a bare string) matches the operator's example and leaves room for several
  activities per role later without a data migration.
- `appointmentforms` is **not** written by this dialog (no owner yet; writing `[]` would erase it).
- Save switches from `setDoc(..., {merge: true})` to `{mergeFields: [...]}` listing the dialog's own
  fields, so `atcrolemap` is replaced whole (merge:true deep-merges maps and would keep removed role keys)
  while any other field on the doc stays untouched.

## Blast radius
- Only writer of the collection is this dialog. The 10 readers (booking service, studio, schedule /
  reschedule dialogs, delivery dashboard, appointment dashboard, availability, sas-logic) read only the
  role arrays; the new fields are additive.
- Existing docs have no ATC fields → open unticked → save as `atcrequired:false, atcrolemap:{}`.
- The list screen (`map-appointment-role`) is unchanged.

## Verification
1. New mapping with ATC → doc matches the shape above.
2. Edit: drop a required role → its key is gone from `atcrolemap` in Firestore.
3. Untick → `atcrequired:false`, `atcrolemap:{}`.
4. Booking / studio still resolve roles for the appointment type.
5. e2e: `appointments` suite (owns `src/app/Scheduling/**`) — spec against the emulator before push.
