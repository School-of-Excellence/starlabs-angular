# 2026-10-22 — Map Appointment Role dialog: StarLabs Operations UI, scrolling, visible save errors

**Status:** approved by operator 2026-10-22 ("Implement").
**Screen:** `/mapappointmentrole` → `Scheduling/map-appointment-role-dialog/` (`MapAppointmentRoleDialogComponent`).
**Out of scope:** appointment forms (`appointmentforms`) — later.

## Problem (reproduced on the Firebase emulator, starlabs-cicd, 2026-10-22)
- "Update Role not working": the save itself works (create / edit / remove role / old doc all write correctly),
  but the dialog does not scroll. At 1024×768 with two ATC role rows the dialog is 819px tall and the Update
  button sits at y=758–794, mostly off-screen; validation errors can also land below the edge.
- Root cause: the component never imports `MatDialogModule`, so `mat-dialog-title` / `mat-dialog-content`
  are plain attributes — no `max-height`, no `overflow: auto`.
- Also: `onformsubmit` has no try/catch — a failed write leaves `loading = true` (button stuck, no message).

## Change
- `.ts`: import `MatDialogModule`; `try / catch / finally` around the save with an inline error message; on an
  invalid submit, scroll the first invalid field into view. Load, validation, `atcrolemap` building and the
  `mergeFields` save are unchanged.
- `.html` / `.css`: StarLabs Operations look (Geist, Electric Blue `#2563eb`, slate text, 14px card / 10px
  field radius) in three bands — fixed header, scrolling body, fixed footer with Cancel / Update role. Fluid
  widths; role columns and ATC rows stack under ~560px. Every existing `data-testid` kept; new literal hook
  `mard-save-error-9`.
- Opener `map-appointment-role.component.ts`: `width: '680px'`, `maxWidth: '95vw'`, `panelClass: 'mard-dialog'`.
- `styles.css`: one rule block scoped to `.mard-dialog` (surface radius, 90vh height cap).

## Blast radius
Only opener of the dialog is the list screen. No data change; `AppointmentType-To-Roles` readers unaffected.
Global CSS is scoped to `.mard-dialog`. Existing e2e (`scheduling-addressable-dialogs.spec.ts`) uses
`mard-close-1` / `mard-onformsubmit-2` — kept.

## Verification
Emulator only: scroll at 1024×768 and 375×812 with 3+ ATC roles; the four saves; invalid submit scrolls to the
error; a failed write shows the message and re-enables the button; `tsc` + `ng build`.
e2e spec in the `appointments` suite (ATC section, scroll, save error) is required before push — pending.
