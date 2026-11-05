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

## 2026-10-21 — ATC activities become a multi-select, saved as an array
**Operator:** "add atc activity multiselect and save this as array". Each required role's ATC activities picker is
now `multiple`; saved as `atcrolemap: { <eisroles id>: [<bigactivity id>, …] }` (still required: at least one per
role). Editing an older doc that stored a single id string loads it as a one-item list, and saving rewrites it as
an array. Also includes the operator's own subtitle edit (column hint text removed).

## 2026-10-21 — ATC model on the mapping
**Operator:** when ATC is ticked, ask for the ATC model (dropdown) and save it as an `atcmodel` string in the same
`AppointmentType-To-Roles` doc. Options = distinct `atc model.atcmodel` names (the list prescribeATC shows as
"What is the ATC given for?"). Required only while ATC is ticked; saved as `null` when unticked.
**Why:** prescribeATC now finds a participant's ATC appointment by the ATC model chosen on that screen
(`atcrequired == true && atcmodel == <chosen>`), so each ATC-enabled type must say which model it belongs to.

## 2026-10-21 — Required and Additional roles are mutually exclusive
**Operator:** "in required roles and additional roles show unique roles from both". Each picker hides the roles
picked in the other (`requiredRoleOptions` / `additionalRoleOptions`); a doc that lists a role in both opens with it
kept as required and dropped from additional (`dropRequiredFromAdditional`, also run on every required change).
The ATC activity grouping by atcproperty was considered and dropped (operator: "you already have the role id").

## 2026-10-21 — ATC rows for additional roles too
**Operator:** "the role is showing only required roles not additional roles". The ATC section now has a row per
required AND additional role (additional ones tagged "Additional"). Required-role rows still need at least one
activity; additional-role rows are optional (a booking may not use that role) and are saved into `atcrolemap` only
when an activity is picked. Reverses the 2026-10-15 "required roles only" decision above.

## 2026-10-21 — role pickers untouched; ATC rows unique
**Operator:** "in required roles additional roles don't change anything; in atc option alone show activity map unique".
The Required / Additional mutual-exclusion (4c67aaac) is undone: both pickers list every role again and nothing is
auto-removed. Only the ATC section dedupes: a role picked in both lists gets ONE row (treated as required) and one
`atcrolemap` entry.

## 2026-10-22 — "Update Role not working": dialog never scrolled; StarLabs Operations restyle
**Plan:** `specs/plans/2026-10-22-map-appointment-role-dialog-ui.md` (operator-approved).
**Reproduced on the Firebase emulator only** (starlabs-cicd, Firestore 8181 / Auth 9097, app on :4300 — never a real
DB). The save itself was fine: create, edit, removing a role (key really removed from `atcrolemap`) and saving an
old doc (`atcrequired:false, atcmodel:null, atcrolemap:{}`) all wrote correctly; empty ATC fields block with errors.
**Root cause:** the component never imported `MatDialogModule`, so `mat-dialog-title` / `mat-dialog-content` were
inert attributes — no `max-height`, no `overflow`. With two ATC role rows at 1024×768 the dialog was 819px tall and
Update sat at y=758–794, mostly off-screen; errors could also sit below the edge.
**Change:** import `MatDialogModule`; fixed header + scrolling body (`max-height: 90vh`) + fixed footer; StarLabs
Operations look (Geist, `#2563eb`, slate, 14/10px radii) via Material tokens scoped to the dialog; fluid widths,
stacking under 560px; `try/catch/finally` around the save with an inline message (`mard-save-error-9`) instead of a
silently stuck button; first invalid field scrolled into view. Opener gets `width 680px / maxWidth 95vw /
panelClass mard-dialog`; one `.mard-dialog` rule in `styles.css` rounds the surface. Load / validation /
`mergeFields` save untouched; all existing `mard-*` test ids kept.
**Verified (emulator):** tsc green; 3-role mapping at 1024×768 → body scrolls, Update visible, real click saves;
phone width → single column, no sideways overflow, Update visible.
**Pending:** operator's manual test; e2e spec in the `appointments` suite (ATC section, scroll, save error — also
covers the `mard-atc-*` gap above) before push; commit (git was blocked in the session).
**Mistake noted:** one early "save didn't close" result was my own — two dialogs were open and the save ran in the
hidden one. Lesson: count `.mat-mdc-dialog-container` before concluding a dialog didn't close.

## 2026-10-23 — e2e coverage, and the real "Update does nothing" bug it found
**Spec:** hub `appointments/map-appointment-role-atc.spec.ts` (hook prefix `mard`, opener `mar`), emulator only:
MARD-ATC-01 create (ATC model + activities for a required AND an additional role → `atcrolemap` arrays),
-02 required-field block (nothing written), -03 edit (role removed → its key leaves `atcrolemap`; untick →
`atcmodel: null`, `atcrolemap: {}`; `mergeFields` keeps foreign fields), -04 600px window: body scrolls, Update on
screen. Restores ATR2R / deletes the AT2 mapping afterwards (the scheduling suite books on them).
`mard-save-error-9` is credited only in `scheduling-addressable-dialogs.spec.ts` (the emulator never rejects a write).
Seed (`seed-appointments.js`): roles carry `id`; ATR2R gets `atcrequired/atcmodel/atcrolemap`; three `bigactivity`
docs with `atcproperty` (author / observer / assigned_to) + one without (must not be offered); `atc model` EI Solution
+ WiSH.

**MARD-ATC-01 fails — a real app bug, not a test problem (fix not applied; needs operator sign-off).**
`syncAtcRoles()` removes and re-creates EVERY control in the nested `atcrolemap` group on any role change. Angular
re-binds a `formControlName` to a replaced control only when the change happens on the ROOT form (FormGroupDirective
`_updateDomValue` is wired to the root's collection-change hook; a nested group created by FormBuilder keeps a no-op
hook). So: pick Required role → its row renders bound to control A; pick an Additional role → A is replaced by A′ but
the row's mat-select stays bound to A; the activities picked go into A; A′ stays `[]` → `required` fails, the form is
invalid, no field shows an error (the visible control is valid), `scrollToFirstError` finds nothing, Update does
nothing. Debug dump on the emulator: form + `atcrolemap` invalid, zero `mat-error`s. This is very likely the original
"submit not working" report; the 10-22 scroll fix was real but it was not the whole story — the operator's manual
test passed because activities were picked before the second role was chosen.
**Proposed fix (minimal, one function):** `syncAtcRoles()` keeps the existing control for every role still selected,
adds controls only for newly picked roles, removes only deselected ones, and switches the `required` validator when a
role moves between Required and Additional. Load / save / `mergeFields` untouched.

**Shared-emulator leak (hub):** the suites clean their data only BEFORE seeding, never after, and CI runs files
serially on one emulator. The appointments seed's ATC activities therefore linger; ATC's VATC-07 then maps a legacy
change agent to `appt_ba_ca` (it sorts first) instead of `atc_act_ca`. Clean after tearing down the appointments
seed: View Prescribed 9/9. Needs a hub decision (see PROGRESS).
**Fix applied (operator-approved 2026-10-23):** `syncAtcRoles()` now removes and re-adds the SAME control instance
for every role still selected (new `FormControl([])` only for a newly picked role), setting `Validators.required`
for Required roles and clearing it for Additional ones. Rows keep their order (required first) and stay bound to a
live control. MARD-ATC-01..04 4/4 on the emulator. The spec now compares `atcrolemap` arrays sorted: a multi-select
stores option-list order, not click order, and the order has no meaning.
**Scoped cleanup (operator-approved 2026-10-23), instead of suite-wide end-of-run teardown.** Checked first:
CI runs ONE suite per job on a fresh emulator, so cross-suite leaks happen only locally. Suite-wide end teardown
would cost post-failure inspection (seeded users + app writes deleted), an extra teardown per spec file under
run-isolated.sh, wipe manual `SKIP_SEED=1` worlds, still miss cancelled runs, and touch 12 suites' shared factory.
So only the leaking data moved: `seed-appointments.js` no longer seeds the dialog's ATC world; the spec calls
`seedDialogAtc()` in beforeAll and `removeDialogAtc()` + ATR2R snapshot restore + AT2-mapping delete in afterAll.
The ATC suite's own leak into appointments (its same-day appointments) is pre-existing and local-only: clear one
suite's data before running the other on a shared emulator.
