# SCHEDULING-DELIVERY.md — Appointments, availability & 1:1 delivery

> Subsystem reference (data-first, config-aware, evidence-backed). This is the **1:1 (Priority) delivery engine**: a participant's purchased products resolve to a **delivery sequence** of appointment stages, each booked against a specialist's **availability** and recorded as a **deliverable**. The bookable stages, the appointment types, and the specialist-eligibility are **configuration**.
>
> Evidence: `specs/SCHEDULING-DELIVERY-evidence/evidence.json` + the 10 anonymised delivered-sequence timelines in `specs/evidence/journey_evidence_final.json`. Config model: `CONFIGURATION.md §3`. Purchase side: `JOURNEY-LIFECYCLE.md`. Graph communities: [Journey Onboarding](../graphify-out/wiki/Journey_Onboarding.md) (129 nodes) + [Participants Profile Management](../graphify-out/wiki/Participants_Profile_Management.md). Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Schedule and deliver a participant's journey as a series of **appointments** (Diagnostics, Implementation, Review, Experience Call, …) with the right specialist, against bookable **availability** slots, producing **deliverables** and feeding the journey's `journeystatus`. The catch (TD-009): **the purchased journey ≠ the delivered journey** — delivery runs on a *shared toolkit* of appointment types regardless of the package name.

## 2. Operator screens (from `operator-screens.md`)
- **Book / schedule:** `bookappointment` (`BookAppointmentComponent`) · `appointmentcalendar`/`mycalendar` · `appointmentstatuspending` · `appointment-status-update` · `roster` · `appointmentstudio`.
- **Availability / capacity:** `appointmentavailability` · `capacityutilization` · `teamdeliveryhours` · `offtime`/`approveofftime`.
- **Role/EIS mapping (CONFIG authoring):** `appointmentrole` · `eisappointmentrole` · `mapappointmentrole` · `mapclienteis` · `EISzoom` · `appointment-dashboard`.
- **Per-participant delivery:** `participantdeliverysequence/:pid` · `journeysupport/:pid` · `delivery-dashboard`.
- **Delivery config (Product Designer):** `deliverysequence` · `productdelivery` · `deliveryactivities` · `formtemplate`.

## 3. Collections by ROLE × reliability tier
| ROLE | Collection | Count | Note |
|---|---|---|---|
| **CONFIG** | `productToDeliverySequence` | 85 | product → `deliveryoptions[]` (the ordered delivery sequence) |
| **CONFIG** | `appointmenttype` | 108 | the stage/appointment definitions (`appointmenttype`, `duration`, `ischangeworkrequired`) |
| **CONFIG** | `modes` | 15 | the 5 delivery-mode definitions |
| **CONFIG** | `AppointmentType-To-Roles` (102), `Roles-To-EIS` (102) | — | appt-type → roles → eligible specialists |
| **CONFIG** | `delivery forms` (84), `delivery events` (42), `eisroles` (166) | — | form templates, event templates, **specialist role defs** |
| **RUNTIME-STATE** | `participantdeliverysequence` | 3,294 | the participant's materialized delivery sequence (doc id == profileid) |
| **RUNTIME-STATE** | `availability` | 20,782 | specialist slots (per-appointmenttype slot arrays) |
| **RUNTIME-STATE** | `deliverables` | 30,738 | per-delivery state (`type`, `status`, `fileref[]`) |
| **RUNTIME-STATE** | `offtime` | 125 | specialist time-off |
| **TRANSACTIONAL/R** | `appointments` | 10,312 | the booked sessions (real stage timing) |

## 4. Configuration model
*(Shapes + variants + full config→behavior table in `CONFIGURATION.md §3`.)*
- **`productToDeliverySequence` (85)** maps a `product` (ref) → `deliveryoptions[]`; the relevant option's `deliverysequence[]` is the ordered list of bookable stages. Read at [product-delivery.component.ts:139](../src/app/Product%20Designer/product-delivery/product-delivery.component.ts#L139); the dashboard uses `deliveryoptions.at(-1)` ([appointment-dashboard.component.ts:133-134](../src/app/appointment-dashboard/appointment-dashboard.component.ts#L133)). Live sample `0mQIrpSvydzfe9OPcgoh`: `product` ref + `deliveryoptions[1]` whose option keys are `[deliverysequence, deliverytype]`.
- **`appointmenttype` (108)** defines each stage. `ischangeworkrequired` (58%) flags stages that spawn changework. Read in booking [book-appointment.component.ts:225](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L225) and via `getAppointmentMap()` [authguard.service.ts:122](../src/app/authguard.service.ts#L122).
- **`AppointmentType-To-Roles` → `Roles-To-EIS`** is a two-hop eligibility lookup: appt-type ref → `required_role[]`/`additional_role[]` ([book-appointment.component.ts:224,228](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L224)) → for each role, `assigned_eis[]` ([:286-287](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L286)). `eisroles` (166) is the **specialist role catalog** (`role`/`experiencestage`/`experiencelevel`) — distinct from the auth roles in `users_roles` (`AUTH-ROLES.md`).

## 5. Dynamic assembly / the booking state machine
```
product (participantsproduct.productref)
   └─▶ productToDeliverySequence.deliveryoptions[].deliverysequence[]   = bookable stages (CONFIG)
        └─ materialized per participant ─▶ participantdeliverysequence.products[]  (RUNTIME, doc id==profileid)

book a stage (book-appointment.ts):
  read participantdeliverysequence (:168)               → which stage / deliverypath
  read appointmenttype (:225)                            → stage def + duration
  AppointmentType-To-Roles (:224) → required_role[]      → Roles-To-EIS (:286) → assigned_eis[]   (eligible specialists)
  query availability (:334)  where profileref==eis, appointments array-contains apptTypeRef, starttime in window
  pick a free slot (:506  booked==false && available==true)
  COMMIT (batch):
     set   appointments/{newid}      (:588,:607)   {starttime, endtime, appointment(ref), hosts, participantproductid, productid}
     update availability slot         (:566-567)   {available:false, booked:true}
     update participantdeliverysequence(:657)       mark delivery 'ongoing'
     update deliverables              (:661)        {fileref: arrayUnion(apptRef), status:'ongoing'}
```
The **slot model**: `availability/{id}` holds, per appointmenttype id, an array of `{slotstart, slotend, booked, available}`; booking flips one slot's flags ([book-appointment.component.ts:557-560](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L557)).

## 6. Data flow
`participantsproduct` (purchased product, `deliverymode`) → `productToDeliverySequence` resolves the stage list → `participantdeliverysequence` materializes it per participant → operator books each stage (`bookappointment`) → `appointments` + `deliverables` written, `availability` slot consumed → attended/cancelled tracked on `appointments` → feeds journey progress (`JOURNEY-LIFECYCLE.md`). Big/event modes route through the queue instead (`QUEUE-AND-BIG.md`).

## 7. Worked example — purchased ≠ delivered
**Concrete appointment:** `appointments/YJkhYjIPNyT7KJ6d9IBP` (attended), `appointment` ref resolves to appointmenttype **"Critical Support Implementation"** — i.e. a real booked, attended Critical-Support implementation session.

**Delivered sequence (anonymised real participant `P-4F5BB`, 45 appointments)** — the participant *purchased* journeys **"FTM with SLD CI"** and **"B!G"**, but was *delivered* via the shared appointment-type toolkit (months relative to t0):
```
0.93  Welcome To WiSH (1, att 1)
0.94  WiSH Diagnostics (1, att 1)
0.97  WiSH Experience Call (1, cancelled)
1.14  WiSH Implementation (2, att 2)
1.26  WiSH Diagnostics → Experience Call → Implementation (2) → Validation → Review …
4.48  WiSH Final Review Call
8.14  Critical Support Diagnostics (2) → Implementation (5) → Review (2)      ← Critical Support recurs mid-journey
13.2  Journey Coaching
17.8  Critical Support Diagnostics → Implementation (15, att 8, canc 7)        ← long Implementation tail, cancellation-prone
```
**Reading:** delivery is keyed off the *delivered appointment types* (WiSH / Critical Support / A&H Light / EI families), **not** the purchased package name. Journeys are iterative (many Implementation sessions), cancellation-prone, and Critical Support recurs as a mid-journey intervention. → **Document journeys by delivered sequence (TD-009).** (Nine more timelines spanning A&H Light, uP!, EI, Health, Custom Solutions, and an early-cancel churn case in `journey_evidence_final.json`.)

## 8. Known caveats
- **TD-009 — purchased ≠ delivered.** Appointments don't reliably carry the purchased `journeyref`; `appointments.journeyid` only 20% filled. Link delivery via `participantproductid`→`participantsproduct`, and analyze by *delivered appointment type*.
- `appointments.starttime` can be **future** (scheduled, not yet delivered) — filter by `attended` for delivered work.
- `deliverables` and `participantdeliverysequence` have **no write-timestamp** — confirm whether regenerated vs. appended (Open Q).
- `availability` extends forward (slots to 2026-06-17+); `subscriptionend` future-dating is normal.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| Product→delivery sequence is config | `productToDeliverySequence/0mQIrpSvydzfe9OPcgoh` (`deliveryoptions[1]`) | 85 | evidence.json `.traces.productToDeliverySequenceSample`; product-delivery.ts:139 |
| Booking resolves appt-type→roles→EIS | book-appointment.ts:224→286 | 102/102 | code audit |
| Real attended appointment | `appointments/YJkhYjIPNyT7KJ6d9IBP` → "Critical Support Implementation" | 10,312 | evidence.json `.traces.schedulingTrace` |
| Purchased≠delivered | `P-4F5BB`: purchased FTM/B!G, delivered WiSH+Critical Support (45 appts) | 10 timelines | journey_evidence_final.json |
| Slot model + booking write | availability slot flip + appointments set + deliverable ongoing | 20,782 / 30,738 | book-appointment.ts:557-663 |
| Appointment recency | `appointments` by `created` = 1,380/90d | 10,312 | evidence.json `.schema.appointments` |

## 10. Open questions (engineer validation)
1. Are `deliverables`/`participantdeliverysequence` regenerated each booking or appended? (No write-ts to tell.)
2. Should `appointments.journeyid` be backfilled so delivery links cleanly to the purchased journey (fixing TD-009)?
3. Is `availability` derived/regenerated from a weekly template (`weeklyhours` 49%), and safe to seed from a template in tests?
4. `modes` (5 delivery modes) — confirm the canonical mode list + which products map to Priority vs Event vs Big.
