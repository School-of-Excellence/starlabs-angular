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

## Deepening pass (same day) — personalization & actual-data verification → `05` §14
Operator pushed "give all the variations/combinations/intricate decisions, personalized" then "verify with actual appointment data." Extracted the full decision tree (agent over `book-appointment`/`mark-appointment-status`/`add-appointment-availability` + CF `appointment.js`) and verified against the 10,468 real records (`appt_combos_probe.js`, `appt_verify.js`, `appt_grounding.js`). Added `05` §14. Key findings + corrections:
- **~90% operator-mediated booking** (`loggedid≠bookedby` 9,419/9,562) — the dominant reality; participant self-book rules bind only ~10%. Reframed §4. (Lead-time data: ~38% booked <24h, consistent with admins' *today* floor.)
- **Two non-equivalent booking engines** (BAC deliverable-driven vs DASH Priority-Mode-driven) — undocumented in-app; can yield different bookable sets.
- **Continuity engine is WiSH-specific, not generic** (CORRECTION): hardcoded type IDs resolve to "WiSH Diagnostics" (writes a 5-role `customer_eismapping`) and "WiSH Final Review Call" (deletes them). Delete verified 90% (36/40 bookers); write side ~63%. Earlier code-read had wrong role names + over-generalized it.
- **86%** of appts run their configured duration; **89%** of 2-role appts have distinct specialists.
- **Group-capacity gap:** booking ignores `maxbooking`; capacity only decrements on cancel.
- **Evidence-tier honesty:** §14 is *artifact-verified* (persisted CF effects: `customer_eismapping`, `email archive`, `participant touchpoint`), NOT GCP-execution-log-verified — that tier needs Cloud Logging access (§12-Q6). **When data disagreed with code-inference, data won.**

## Side note
The spawned `/arenastudioactivity` role-guard task (from the #4 reconciliation) **landed this day** — `role.guard.ts` + route wiring + SS-15b flipped green. `04` header/§3a updated to reflect the fix.
