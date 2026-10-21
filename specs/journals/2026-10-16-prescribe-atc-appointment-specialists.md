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

## 2026-10-20 — participant-scoped reads; a role covers its whole property
**Operator:** don't read whole collections — only the selected participant's appointment; take the roles from
`appointmentrole` (eisroles refs), map role → bigactivity, and if that activity is an author activity, put the
role's specialist on ALL author activities.
**Change:**
- Fallback reads `appointments where bookedby == participant`, then only each completed appointment's own
  type mapping (newest first, `mappingFor()` caches per type) until one has `atcrequired` — the
  `AppointmentType-To-Roles where atcrequired == true` collection query is gone.
- Rows are one per `appointmentrole` (`roleId` → `atcrolemap` → `bigactivity.atcproperty`, + `hostRole` people).
- `specialistsByProperty()` pools people per property; author → every `bigActivityAuthor`, observer → every
  observer, mentoring → every mentor, assigned_to → every "set for all procedures" picker (not applied).
- Card shows property · role name · people (no activity column — the person covers the whole section).
**Verified:** helper 8/8; tsc + build green; emulator: one author role filled BOTH author activities
(appt_BA1 and appt_BA3), observer role filled the observer activity.

## 2026-10-20 — date rule for the fallback: today counts
**Operator:** "take if it is today date also". `completedNewestFirst(appts, now)`: not cancelled, typed, dated, and
`starttime` before tomorrow; past days must be `attended`, **today's count even before the status is updated**
(prescribing right after the session); future days never count, even if marked attended (hand-edited data).
**Verified:** helper 10/10; build green; emulator — a today, not-yet-attended appointment was picked over
yesterday's attended one (card "Test Two-Role · 20 Oct 2026", swapped hosts).

## 2026-10-21 — roles from hostRole keys; names from profile_data
**Operator:** take the latest appointment, read the roles from `hostRole` (`eisroles/<id>` keys → role id), map
them through `AppointmentType-To-Roles.atcrolemap` to the activity, and show each host's name from its own
`profile_data` doc.
**Change:** `hostRoleIds()`; `appointmentSpecialistRows` takes roles from hostRole keys (fallback
`appointmentrole`, then every `atcrolemap` role). The component reads `profile_data/{id}.name` for just the
appointment's hosts (`appointmentPeopleNames`, used first by `specialistName`) and adds hosts missing from
`specialistList` (users_roles with a specialist flag) via `withAppointmentPeople()` — also re-applied when the
users_roles stream emits — so a prefilled mat-select can always display its value.
**Verified:** helper 11/11; tsc + build green. NOT re-run on the emulator (it had been stopped); the name
read is one getDoc per host.

## 2026-10-21 — only your shared appointment; fill only its activities
**Operator:** "if the logged-in person and the participant already have an appointment, patch and display based on
the existing activity specialist; leave the remaining for manual entry" (the property-wide fill was wrong).
**Change:** the fallback keeps only the participant's appointments where the logged-in specialist is a host
(`appointmentHostIds()` = hostRole people + hosts[]). Each role's host goes ONLY into the activity that role maps
to (`atcrolemap`), and only if that picker is still empty; every other activity is left for manual entry.
`specialistsByProperty()` removed. The card lists property · activity (role beneath) · specialist.
An explicit `?appointmentid=` is unchanged (bookedby check only).
**Verified:** helper 12/12; tsc + build green. Not run live yet.

## 2026-10-21 — card removed; activity arrays
**Operator:** don't show the "Appointment found" card. The card and the Edit wrapper are gone — the AUTHORS /
OBSERVERS / MENTORS sections always show, with the prefilled values (prefill logic unchanged). The helper reads
`atcrolemap` values as arrays (`activityIdsOf`, single strings from older docs still accepted) and yields one row
per (role, activity), so a role mapped to several activities fills each of them (only if empty).
**Verified:** helper 14/14; tsc + build green.
