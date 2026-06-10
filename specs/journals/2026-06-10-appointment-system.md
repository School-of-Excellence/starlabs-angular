# Journal — 2026-06-10 · #5 Appointment System (investigation → draft)

## What was done
Documented concept group #5 with the standard rigor: Explore code map (Angular `src/app/Scheduling/**` + CF `appointment.js`) leveraging the existing e2e recon (`e2e/recon-allcomp/appointments.md`), + two read-only production probes (`appt_discover.js`, `appt_runtime_probe.js`). Wrote `specs/validated/05-appointment-system.md` (DRAFT for sign-off).

## The model
The **scheduled-delivery rail** — a *sibling, independent* delivery mechanism to the Queue/Studio (#3/#4): **no `live assignment`**, an appointment is its own session object. Booking resolves a **config join-chain** (`appointmenttype → AppointmentType-To-Roles → Roles-To-EIS → eis`, with `customer_eismapping` for specialist continuity and `Journey/Product-To-AppointmentTypes` gating what's bookable). Availability comes from a weekly `deliverytime` template materialised by CF (`deliveryhoursCreate` → `availability` → `computeSlot` nested per-type slot arrays). Booking writes the appointment + flips the slot + **advances the delivery sequence** (`participantsproduct`/`participantdeliverysequence`/`deliverables` → `ongoing`). The state machine is two booleans (`attended`/`cancelled`); marking attended drives `deliverables.status → completed`.

## Evidence highlights (production, read-only)
- **appointments 10,458:** 76% attended · 23% cancelled · 34 upcoming · **only 24 past-unmarked** (high marking discipline).
- **Delivery linkage:** 75% carry `participantproductid`; journeycoach 9%, onboarding 4%.
- **Staffing:** 89% single-host, 11% two-role (multi-role types), 1 three-host outlier.
- **Video:** Zoom data on 84%; **`platform` (OpenVidu) on only ~1%** (140) — Zoom in practice, mirroring #4's LiveKit finding.
- **Types (108):** 10–300 min (mostly 30/120/60/180); `ischangeworkrequired` 20; `groupappointment` only 3.
- **Off-time (125):** 81 approved / 43 pending / 1 denied; CF `approveOfftime` deletes slots + cancels overlapping appointments.
- **availability 20,959:** per-type nested slot arrays `{slotstart,slotend,booked,available,id}` confirmed.

## Surprises / corrections vs the inferred code map
- The Explore map inferred `platform/zoomurl/zoomid` as appointment fields, but the **sampled doc didn't carry them**; data shows `platform` on ~1% and zoom data surfaced via `slotdata` (present 100%). Corrected in the doc.
- `appointmenttype.duration` spans 10–300 min — appointments aren't a fixed 30-min unit; group appointments are vanishingly rare (3 types).

## Pending
- Operator walkthrough of `05` §12 open questions (changework-dialog workflow w/o ATC data; the ~12% non-product bookings; group-appointment capacity; the commented-out `capacityutilization` guard — possible access gap like #4 §3a; OpenVidu-for-appointments intent).
- Later: doc↔e2e reconciliation pass for the `e2e/appointments/` suite (as done for #4 §11).
- **Next: #6 Events, Arena & Calendar.**

## Side note
The spawned `/arenastudioactivity` role-guard task (from the #4 reconciliation) **landed this day** — `role.guard.ts` + route wiring + SS-15b flipped green. `04` header/§3a updated to reflect the fix.
