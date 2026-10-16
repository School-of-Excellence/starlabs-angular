# 2026-10-16 — Prescribe ATC: specialists auto-filled from the appointment

**Status:** approved by operator 2026-10-16 (recommended answers to all five open questions).
**Depends on:** `2026-10-15-map-appointment-role-atc.md` (`AppointmentType-To-Roles.atcrolemap`).

## Goal
When `/prescribeATC` is opened for a specific appointment, show a read-only **Specialists** card
(property · activity · specialist names) filled from the appointment's hosts, instead of asking the
specialist to pick people by hand. The existing pickers stay available behind **Edit**.

## Data join (all default Firestore, read-only)
```
appointments/{appointmentid}.appointment            → appointmenttype ref (typeId)
appointments/{appointmentid}.hostRole                { "eisroles/<roleId>": [profile_data ref | path] }
AppointmentType-To-Roles (assigned_appttype_ref == type).atcrequired, .atcrolemap { roleId: activityId }
bigactivity/{activityId}                             activity, atcproperty
users_roles (already loaded by the page)             profile_ref.path → name
```
For each `roleId → activityId` in `atcrolemap`: people = `hostRole["eisroles/" + roleId]` →
`"profile_data/<pid>"` paths → routed by `atcproperty`:
author → `authorMap`, observer → `observerMap`, mentoring → `mentorMap`,
assigned_to → `bulkAssignedSelection` (NOT auto-applied to procedures), other → `additionalActivityMap`.

## Decisions (operator, 2026-10-16)
1. Entry: `?appointmentid=` (+ `profileid`) from a **Prescribe ATC** button on Completed rows of the
   Specialist Appointment Studio past-sessions table, shown only when the type has `atcrequired`.
2. `assigned_to` (CA) prefills the "set for all procedures" picker only; the user clicks Apply.
3. One activity per role (`atcrolemap` shape unchanged).
4. A draft the user opens wins: `applyDraftValue` replaces the maps and hides the card.
   A live-studio (arena) prefill also wins over the appointment prefill and hides the card.
5. Labels: author → AUTHOR, observer → OBSERVER, mentoring → MENTOR, assigned_to → CA.

## Changes
- `ATC/prescribe-atc/appointment-specialists.ts` (new, pure): builds `{ activityId → paths[] }` + card rows.
- `prescribe-atc.component.ts`: read `appointmentid`; `bigActivityReady` promise; `prefillFromAppointment()`
  between `setupData()` and `onProfileSelect()`; card state; hide card in `applyDraftValue` and arena prefill.
- `prescribe-atc.component.{html,css}`: Specialists card + Edit toggle (pickers hidden until Edit in
  appointment mode; unchanged otherwise).
- `specialist-appointment.service.ts`: cached `atcRequiredTypeIds()` read.
- `specialist-appointment-studio.component.{ts,html}`: Prescribe ATC button.

## Not changed
Save path, ATC documents, the 4 existing `/prescribeATC` callers (no `appointmentid` → today's behavior),
the map dialog. Nothing new is written anywhere.

## Verification
- Unit spec for the helper (roles with 0/1/2 hosts, string vs ref hosts, non-ATC activity, atcrequired:false).
- `ng build` green.
- e2e: `atc` suite on the EMULATOR only (`/prescribeATC` is the sanctioned ATC test route).
