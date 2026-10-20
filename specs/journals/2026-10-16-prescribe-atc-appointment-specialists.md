# 2026-10-16 — Prescribe ATC: specialists from the appointment

**Plan:** `specs/plans/2026-10-16-prescribe-atc-appointment-specialists.md`.

## What landed
- `ATC/prescribe-atc/appointment-specialists.ts` (pure) + spec: `appointmentSpecialistRows(appointment, mapping,
  bigactivities)` joins `appointments.hostRole` with `AppointmentType-To-Roles.atcrolemap`.
- `prescribe-atc.component.*`: `?appointmentid=` → `prefillFromAppointment()` fills `authorMap` / `observerMap` /
  `mentorMap` / `bulkAssignedSelection` / `additionalActivityMap` and shows a read-only **Specialists** card;
  **Edit** reveals the existing pickers.
- Specialist Appointment Studio: **Prescribe ATC** on Completed past sessions whose type has `atcrequired`
  (`svc.atcRequiredTypeIds()`, one cached query).

## Why each constraint
- **Fill the existing maps, don't add a save path.** The save already turns those maps into `author`,
  `observer`, `bigactivity{activityId:[ids]}` etc. on `atc_alpha` / `atc_to_validate`, so every reader of
  saved ATCs is unaffected and nothing new is written anywhere.
- **Order decides precedence, no flags.** The prefill runs after `setupData()` and before `onProfileSelect()`;
  the live-studio prefill and a draft the user opens (`applyDraftValue`) run later, overwrite the maps, and
  clear `appointmentSpecialists` so the card never shows stale names.
- **`bigActivityReady` promise.** The bigactivity load was fire-and-forget; the prefill must wait for both the
  lists (to route by `atcproperty`) and the empty maps that load creates.
- **`hostRole` key is the role PATH, `atcrolemap` key is the role ID.** The helper prefixes `eisroles/`.
  Host values may be refs (booking) or path strings (older writers) — both accepted, as `hostIdsOf` does.
- **`assigned_to` is preselected, not applied.** Procedures don't exist at load and Apply overwrites every
  procedure's agents, so it stays a user action.
- **Only the participant's own appointment.** If `bookedby` doesn't match `profileid`, nothing is prefilled.
- **Studio spec mock needed `atcRequiredTypeIds`.** 32 shell/home specs failed until the fake service got it.

## Verification
- Helper spec 6/6; studio + helper specs 107/107 (ChromeHeadless); `tsc` and `ng build` (development) green.
- Not yet exercised in a browser or e2e (atc suite, emulator only) — emulator ports are held by an orphaned
  `antanoharini-web` emulator; see the map-appointment-role ATC e2e item.

## Pending
- e2e in the `atc` suite: seed appointment + hostRole + mapping, open `/prescribeATC?appointmentid=…`,
  assert the card and the prefilled pickers, save, assert the app-written author/observer.

## 2026-10-20 — fallback without `appointmentid`
**Symptom (operator):** author/observer stayed empty. **Cause (reproduced on the emulator):** the page was
opened without `?appointmentid=`, so appointment mode never started — with the id the card and pickers filled.
**Change:** `latestAtcAppointment()` (pure, 3 specs) + `prefillFromLatestAppointment()` called from
`onProfileSelect()`. **Why there:** it covers both `?profileid=` and the dropdown (which locks after the first
pick), and it runs before the live-studio prefill and the draft picker, so their precedence is unchanged.
**Why "most recent attended, not cancelled, ATC type":** the operator's rule; the date in the card subtitle
makes a wrong pick obvious. **Why the console.info lines:** the earlier silent early-returns cost a long
diagnosis round; now the console says exactly which condition stopped the prefill.
**Verified:** helper 9/9; tsc + ng build green; emulator — p1 without id → card "Test Two-Role · 19 Oct 2026",
author eis0 / observer eis1 after Edit; p0 (no ATC appointment) → no card + console reason.

## 2026-10-20 — "Appointment found" header + role names from appointmentrole
**Operator:** show the role each specialist filled, from `appointments.appointmentrole` → `eisroles/{id}.role`,
with the header "Appointment found / Your appointment for this participant is found; specialists and change
agents come from its roles."
**Change:** rows carry `roleIds`; `appointmentRoleIds()` reads `appointmentrole` (refs or paths) and, when present,
only roles on the appointment produce rows (a type's `atcrolemap` may list roles this booking didn't use).
The component fetches each role's `role` name once per prefill; the card shows property · activity · role · names,
with type and date under the header. **Verified:** helper 11/11, tsc + build green; emulator card shows
"Primary Specialist" / "Secondary Specialist" under the two rows.
