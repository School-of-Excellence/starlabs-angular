# 2026-10-22 — Prescribe ATC: participant → draft → product check (appointment for WiSH / EI Solution)

**Status:** approved by operator 2026-10-22. **Supersedes** `2026-10-16-prescribe-atc-appointment-specialists.md`
and `2026-10-20-prescribe-atc-ei-solution-asks.md` (both reverted; the Ask card will be rebuilt later).

## Revert first
`prescribe-atc` (.ts/.html/.css) and the Specialist Appointment Studio's Prescribe ATC button
(`specialist-appointment-studio` .ts/.html/.spec + `specialist-appointment.service.ts`) restored to
`origin/development`. The diff was checked line by line: only the 10-16 → 10-21 appointment prefill, the Ask
card and the Studio button/`atcRequiredTypeIds()` were removed. The map-appointment-role dialog is kept
(the flow needs `atcrequired`, `atcmodel`, `atcrolemap`).

## Flow
1. Participant → draft check (unchanged picker). The rest of the screen shows after that (unchanged).
2. "What is the ATC given for?" locks once chosen (`[disabled]="product != null"`). Everything below it shows only
   when a product is set.
3. On the user's product pick (`runProductCheck`), skipped for directive assignments:
   - `product.toLowerCase()` is `"wish"` or `"ei solution"` → appointment flow (skipped in BIG-assignment mode,
     where the specialist sections are hidden). No queue check.
   - anything else → the existing live-queue flow, unchanged, moved from participant select into `checkLiveQueue()`
     (it still overwrites the product from the queue token).
4. Appointment flow (`prefillFromAppointment`):
   - `AppointmentType-To-Roles` where `atcrequired == true` and `atcmodel == product` → `assigned_appttype_ref`s.
   - `appointments`, one direct query (operator, 2026-10-22 — the earlier "all of the participant's appointments,
     filter in code" read was too large): `bookedby == profile_data/<participant>`, `hosts array-contains
     profile_data/<you>`, `appointment in [types]` (chunks of 30), `cancelled == false`, `starttime <= now`,
     `orderBy starttime desc`, `limit 1` → the start closest to now. Needs the composite index
     `bookedby ↑, cancelled ↑, appointment ↑, hosts CONTAINS, starttime ↓` (recorded in `firestore.indexes.json`;
     create it in the test and production consoles).
   - `hostRole["eisroles/<roleId>"]` → `atcrolemap[roleId]` → `bigactivity.atcproperty`: author / observer /
     mentoring / other activity get the role's hosts (those activities are set); `assigned_to` is left for the user.
   - Nothing found → no message, manual entry.
5. Draft saves `appointmentid`, `queueid`, `stagename`, `liveassignmentid`, `queuename`. Opening a draft patches
   them back with no re-check; `liveassignmentid` restores queue mode (submit's queue name, changework brief on the
   live assignment, return to `/dynamicstudio`).
6. Final ATC: `alphaData["appointmentid"]`, next to the existing `queueid` / `stagename` / `liveassignmentid`.

## Verification
`tsc` green; the running dev server compiles the template. The operator tests the screen by hand (Claude does not
run ATC screens).
