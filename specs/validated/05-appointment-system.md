# 05 · Appointment System — OPERATOR-VALIDATED (draft for sign-off)

> **Status: DRAFT for operator sign-off, 2026-06-10** (concept group #5). Code + read-only production data investigated 2026-06-10 against `production` (Angular) + the CF repo on `development`; cross-checked with the existing e2e recon (`e2e/recon-allcomp/appointments.md`) and the green `e2e/appointments/` suite (7/7). Every quantitative claim carries a probe.
> Evidence (in-repo): probes + outputs in `specs/journals/2026-06-10-appointment-system-artifacts/`. Supersedes `specs/SCHEDULING-DELIVERY.md` for appointment mechanics.

## 1. What the Appointment System is
The **scheduled-delivery rail**: it books **time-boxed 1:1 (occasionally multi-role) sessions** between a participant and one or more specialists (EIS / changeagent / journey-coach), runs them over Zoom (default) or OpenVidu, and marks the outcome — which **advances the participant's delivery sequence**. It is a *parallel, independent* delivery mechanism to the Queue/Studio (#3/#4): there is **no `live assignment`** — an appointment is its own session object. Where the queue is a *pull* (specialist brings a waiting participant into a studio), an appointment is a *scheduled push* (a slot is booked ahead of time).

Components live under **`src/app/Scheduling/`** (+ `src/app/Offtime/`, `src/app/appointment-dashboard/`), routed in `app.routes.ts:132-149`. Backend = **`starlabs-cloud-function/functions/components/appointment.js`** (+ `appointmentZoomIntegraion.js`) on `development`. All Scheduling components are **LIVE** (no dead clones in this folder).

## 2. The role/type configuration model (the booking join-chain)
An appointment is typed and staffed through a **config chain**, not free-text:
- **`appointmenttype`** (108 docs) — the catalog: `appointmenttype` (name), **`duration`** (10–300 min; mostly 30/120/60/180), `ischangeworkrequired` (20/108), `groupappointment` (3/108).
- **`AppointmentType-To-Roles`** (102) — each type → `required_role[]` + `additional_role[]` (refs).
- **`Roles-To-EIS`** (+ `eisroles`) — each role → `assigned_eis[]` (the specialists who can host it).
- **`customer_eismapping`** — a participant's **preferred specialist per role** (so re-bookings keep continuity).
- **`Journey-To-AppointmentTypes`** (9) / **`Product-To-AppointmentTypes`** (20) — which appointment types a journey/product unlocks.

→ Booking resolves: *appointment type → required roles → eligible specialists → (preferred specialist if mapped) → that specialist's free slots.* **Multi-role appointments** (a type needing 2 roles) explain the **11% of appointments with 2 hosts** (89% have 1; one freak doc has 3).

## 3. Availability & slot generation
- **`deliverytime`** = a specialist's **weekly hours template** (per-day `{starttime,endtime}`). On write, CF **`deliveryhoursCreate`** materialises `availability` docs.
- **`availability`** (20,959 docs) — one per specialist per window: top fields `profileref`, `starttime`, `endtime`, `appointments[]`, plus **one key per appointment-type-id** holding a **slot array**: `{slotstart, slotend, booked, available, id}` (+ `groupappointment`/`maxbooking` for group types). CF **`computeSlot`** (on `availability` create) generates these 30-min-interval slots keyed by type.
- **Off-time** carves holes: see §6.

## 4. The booking flow (`book-appointment`, route `/bookappointment`)
A participant (self, next-day onward) or an admin/scheduler/AH (any participant via `?pid=`) books. On confirm, a **single batch** (`book-appointment.component.ts:479-628`) does:
1. **`availability/{slot}`** — flip the chosen slot `booked:true, available:false` (across all matching role slot-arrays).
2. **`appointments/{new}`** — create the session doc (schema below).
3. **Advance the delivery sequence** (`createJourneyRecord`): `participantsproduct.status → "ongoing"`, `participantdeliverysequence.products[].delivery[n].status → "ongoing"`, `deliverables.fileref arrayUnion(apptRef) + status → "ongoing"`.

Then CF **`appointmentbooked`** (on `appointments` create) emails participant + hosts (Postmark) with an ICS attachment. **75% of appointments carry a `participantproductid`** (tied to a delivery item); the other 25% are journey-coach (9%) / onboarding (4%) / ad-hoc.

## 5. The state machine
State is two booleans on the appointment — `attended` & `cancelled` — plus time:

| Derived state | condition | production count (of 10,458) |
|---|---|---|
| **Attended** | `attended:true` | **7,964 (76%)** |
| **Cancelled** | `cancelled:true` (+ `cancelledon`, `cancelledreason`) | **2,436 (23%)** |
| **Upcoming** | not marked, `starttime > now` | 34 |
| **Past-unmarked** (effective no-show) | not marked, `starttime ≤ now` | 24 |

Marking happens in `appointmentstudio` / `appointment-status-pending` → `MarkAppointmentStatus` (`:274-295`): writes `{attended, cancelled, appointmentstart, appointmentend, totalminutes}`, then **`guard.updateDeliveryStatus()`** (`authguard.service.ts:889-924`) queries `deliverables` where `fileref` array-contains the appt and sets **`status → "completed"` (attended) or `"ready"` (cancelled)** — i.e. attendance drives delivery-item completion. If `appointmenttype.ischangeworkrequired && attended`, a procedure dialog opens (ATC-adjacent — see §12). **Marking discipline is high:** only 24 past appointments are unmarked.

## 6. Off-time (`offtime` → CF `approveOfftime`)
Specialists request off-time (`offtime`: `date/starttime/endtime/fullday/status`); an admin approves at `/approveofftime`. On approve (`:162` sets `status:"approved"`, then GET `approveOfftime?offid=`), the **CF deletes `availability` slots in the window and `cancelled:true`-s overlapping `appointments`**. Production: **81 approved / 43 pending / 1 denied** (125 total).

## 7. The session runtime
- **`appointmentstudio`** (`/appointmentstudio`) — the specialist's live board for *today's* appointments: join the call, regenerate the link, mark status.
- **Video = Zoom by default.** `appointments` carries Zoom data on **84%** of docs (the CF/booking writes `zoomurl/zoomid/zoompassword`, surfaced via `slotdata` which is present on **100%**). The **`platform` (OpenVidu) field is set on only ~1% (140)** — OpenVidu is a rarely-used alternative (`appointment-studio` `joinRoom_Appointment` → `openviduroom`); the **Zoom Meeting SDK** path is `appointment-zoom-view` (`/openappointmentzoom/:id`). Mirrors #4's finding: the stack is multi-option in code but **Zoom in practice**.
- **`roster`** (today + 3 days, resend-email), **`appointmentcalendar`/`mycalendar`**, **`capacityutilization`** (booked/available hours per specialist).

## 8. Cloud Functions (`appointment.js` + `appointmentZoomIntegraion.js`, `development`)
| CF | Trigger | Effect |
|---|---|---|
| `computeSlot` | create `/availability/{id}` | generate 30-min slot arrays keyed by appt-type |
| `deliveryhoursCreate` | write `deliverytime` | materialise `availability` from the weekly template |
| `appointmentbooked` | create `/appointments/{id}` | email participant + hosts (Postmark) + ICS |
| `resentAppointmentEmail` | HTTP (roster resend) | re-send the confirmation email |
| `appointmentLinkRegenarate` | HTTP (studio) | refresh Zoom link/signature |
| `approveOfftime` | HTTP (approve) | delete slots + cancel appointments in window |
| `profileAvailability` | HTTP (offtime revoke) | regenerate a specialist's slots |
| `appointmentReminder` | scheduled (pre-start) | FCM + email reminder |
| `requestScheduling` | HTTP POST | post an appointment request to Slack |

## 9. Data model (appointment collections)
| Collection | Docs (2026-06-10) | Role |
|---|---|---|
| `appointments` | 10,458 | the session: `appointment`(ref), `appointmentrole[]`, `hostRole{}`, `hosts[]`, `bookedby`, `starttime/endtime`, `attended`, `cancelled`+`cancelledon`+`cancelledreason`, `participantproductid`, `slotdata`, `totalminutes` |
| `availability` | 20,959 | specialist windows + nested per-type slot arrays (`{slotstart,slotend,booked,available,id}`) |
| `appointmenttype` | 108 | catalog: `duration`, `ischangeworkrequired`, `groupappointment` |
| `AppointmentType-To-Roles` | 102 | type → required/additional roles |
| `Roles-To-EIS` · `eisroles` | — | role → eligible specialists; role catalog |
| `customer_eismapping` | — | participant → preferred specialist per role |
| `Journey-To-AppointmentTypes` · `Product-To-AppointmentTypes` | 9 · 20 | what types a journey/product unlocks |
| `deliverytime` | — | weekly hours template (→ availability) |
| `offtime` | 125 | off-time requests (approved 81 / pending 43 / denied 1) |
| `EISzoomcontact` · `zoomaccount` · `openviduroom` | — | video account/session plumbing |
| `appointment session` | 8 | session-name mapping |

## 10. Relationships / boundaries
- **Queue/Studio (#3/#4):** sibling delivery rail. **No `live assignment`**, no `queue_token`. The seam is clean — an appointment is its own session; a studio session is the queue's. (Both can run Zoom/OpenVidu; both mark a delivery item complete.)
- **Journey/Products (#1/#2):** appointments **advance the delivery sequence** (`participantdeliverysequence`/`deliverables`/`participantsproduct` → `ongoing` on book, `completed` on attend). Which types are bookable is gated by `Journey/Product-To-AppointmentTypes` and `products.mode` (e.g. `appointment-dashboard` shows Priority-Mode products).
- **Events/Arena/Calendar (#6):** the appointment calendar is **separate** from the events arena; the only calendar tie is the ICS export on booking.

## 11. Evidence log
| Claim | Evidence | Source |
|---|---|---|
| 10,458 appts; 76% attended / 23% cancelled; 24 unmarked | state tally | `appt_runtime_probe.js` |
| 75% carry participantproductid (delivery linkage) | field presence | `appt_runtime_probe.js` |
| 89% single-host, 11% two-role | `hosts`/`appointmentrole` size | `appt_runtime_probe.js` |
| Zoom 84%, OpenVidu/platform ~1%, slotdata 100% | field presence | `appt_runtime_probe.js` |
| types 10–300min, changework 20/108, group 3/108 | `appointmenttype` scan | `appt_runtime_probe.js` |
| availability = per-type nested slot arrays | sample doc | `appt_runtime_probe.js` / `appt_discover.js` |
| offtime 81 approved / 43 pending / 1 denied | status tally | `appt_runtime_probe.js` |
| booking advances delivery sequence | batch writes | `book-appointment.component.ts:479-628`, `authguard.service.ts:889-924` |
| no live-assignment link | code review | Explore map §E |

## 12. Open questions (operator walkthrough)
1. **`ischangeworkrequired` (20 types)** opens a procedure dialog on attend — ATC-adjacent. Confirm the *workflow* without touching ATC data.
2. **The 25% of appointments with no `participantproductid`** — journeycoach (9%) + onboarding (4%) account for ~13%; what is the remaining ~12% (ad-hoc/admin bookings)?
3. **Group appointments** (3 types, `maxbooking`) — which sessions are 1:many, and how does slot capacity work?
4. **`capacityutilization` guard is commented out** (loads for all) — intended, or an access gap like #4 §3a? (worth a quick check.)
5. **OpenVidu for appointments** (~1%) — dead experiment or specific use-case? (mirrors #4's LiveKit question.)

## 13. E2E coverage (the green `e2e/appointments/` suite — 7/7)
Covers booking (incl. slot-merge + 2-role), mark attended/cancelled (APPT-04…06), off-time approval, roster resend, capacity utilization; recon at `e2e/recon-allcomp/appointments.md` (18 candidate cases APPT-01…18). **Deferred** (per that suite's notes): the booking deep-path and ATC-procedure dialog (off-limits). Reconcile doc↔test in a later pass as we did for #4 (§11 there).
