# Appointment & Scheduling System — e2e recon

> Key: `appointments` | Generated: 2026-06-10 | Source: specs/SCHEDULING-DELIVERY.md + code audit

---

## Routes (path -> component file:line, role/guard, ATC? note)

| Route | Component file | Auth guard | Role(s) | ATC? |
|---|---|---|---|---|
| `bookappointment` | `src/app/Scheduling/book-appointment/book-appointment.component.ts:41` | `authGuard` | participant self-books (non-super: next-day+ only); admin/scheduler/ah super-role can book for any pid via `?pid=<profileid>` query param | NO — reads `products`, `deliverables`, `participantdeliverysequence`, `availability`; ATC not involved in booking flow |
| `appointmentcalendar` | `src/app/Scheduling/appointment-calendar/appointment-calendar.component.ts:57` | `authGuard` | admin/scheduler/ah = all appointments; non-super = own only | NO |
| `mycalendar` | same component as `appointmentcalendar` | `authGuard` | specialist's own calendar view | NO |
| `appointmentavailability` | `src/app/Scheduling/appointment-availability/appointment-availability.component.ts:45` | `authGuard` | admin/ah/scheduler = all; others = own | NO |
| `appointmentstatuspending` | `src/app/Scheduling/appointment-status-pending/appointment-status-pending.component.ts:33` | `authGuard` | admin/ah/developer/scheduler = all; eis/changeagent = own host | NO |
| `appointment-status-update` | `src/app/Scheduling/appointment-zoom-view/appointment-status-update/appointment-status-update.component.ts:34` | `authGuard` | POST-Zoom landing page — reads appointmentid from URL query param `?data=<JSON>` | NO — reads `products` for `atcmodel` field to pre-fill procedure dialog; the atcmodel lookup is CONFIG only, test with non-atc products |
| `appointmentrole` | `src/app/Scheduling/appointment-roles/appointment-roles.component.ts:34` | `authGuard` | integrator/admin/ah | NO — reads/writes `eisroles` |
| `eisappointmentrole` | `src/app/Scheduling/eis-appointment-role/eis-appointment-role.component.ts` | `authGuard` | integrator/admin/ah | NO — reads/writes `Roles-To-EIS` |
| `mapappointmentrole` | `src/app/Scheduling/map-appointment-role/map-appointment-role.component.ts` | `authGuard` | integrator/admin/ah | NO — reads/writes `AppointmentType-To-Roles` |
| `mapclienteis` | `src/app/Scheduling/map-client-eis/map-client-eis.component.ts:34` | `authGuard` | integrator/admin/ah/scheduler | NO — reads/writes `customer_eismapping` |
| `teamdeliveryhours` | `src/app/Scheduling/team-delivery-hours/team-delivery-hours.component.ts:36` | `authGuard` | admin/scheduler/ah/capacityplanner/integrator = all; eis/changeagent = own | NO — reads/writes `deliverytime` |
| `offtime` | `src/app/Offtime/offtime-list/offtime-list.component.ts` | `authGuard` | authenticated — list own off-time | NO |
| `approveofftime` | `src/app/Offtime/approve-offtime/approve-offtime.component.ts:39` | `authGuard` | admin/scheduler/ah/capacityplanner/integrator | NO — writes `offtime`; triggers `approveOfftime` CF via HTTP |
| `capacityutilization` | `src/app/Scheduling/capacity-utilization/capacity-utilization.component.ts:52` | `authGuard` | admin/ah/capacityplanner (guard commented out — page loads for all) | NO — reads `availability` only |
| `appointmentstudio` | `src/app/Scheduling/appointment-studio/appointment-studio.component.ts:30` | `authGuard` | eis/changeagent (own host); productowner; developer (super) | PARTIAL — `fetchproductownerAppointments` reads `products.atcmodel` field for productowner role filter; test with non-ATC products/appointments; see ATC exclusions below |
| `appointment-dashboard` | `src/app/appointment-dashboard/appointment-dashboard.component.ts:44` | `authGuard` | authenticated — reads Priority Mode products and their appointment types | NO |
| `roster` | `src/app/Scheduling/roaster/roaster.component.ts:40` | `authGuard` | admin/scheduler/ah = all; others = own | NO |
| `openappointmentzoom/:id` | `src/app/Scheduling/appointment-zoom-view/appointment-zoom-view.component.ts:25` | `authGuard` | eis/changeagent | EXTERNAL — launches real Zoom SDK; must stub fully |
| `EISzoom` | `src/app/Scheduling/eis-zoom-account/eis-zoom-account.component.ts:32` | `authGuard` | scheduler/admin/ah/developer | NO — reads/writes `EISzoomcontact` |

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

| Collection | R/W | Purpose | Named DB |
|---|---|---|---|
| `appointments` | both | Booked sessions; written on booking commit (batch.set) and status update (updateDoc); queried for pending/roster/studio | default |
| `availability` | both | Specialist slots — written by add-availability dialog (batch.set), flipped booked/available on booking commit; queried for slot display | default |
| `participantdeliverysequence` | both | Per-participant materialized delivery sequence; updated on booking (delivery item status -> "ongoing") | default |
| `deliverables` | both | Per-delivery state records; `fileref: arrayUnion(apptRef)` + `status: "ongoing"` written on booking; `status: "completed"/"ready"` written on `updateDeliveryStatus` call | default |
| `participantsproduct` | both | `status` field updated to "ongoing" on booking (`createJourneyRecord`) | default |
| `appointmenttype` | read | Stage definitions — read by booking (guard.getAppointmentMap), availability add dialog | default |
| `AppointmentType-To-Roles` | read | Appt-type → required/additional roles; queried in booking (:224) and dashboard (:204) | default |
| `Roles-To-EIS` | read | Role → assigned specialist refs; queried in booking (:286) and availability add (:151) | default |
| `eisroles` | both | Specialist role catalog (role/experiencestage/experiencelevel) — displayed and CRUD at `appointmentrole` | default |
| `customer_eismapping` | both | Per-participant preferred specialist map (`eisroles` nested map); read in booking (:241) to use prior assigned EIS; CRUD at `mapclienteis` | default |
| `offtime` | both | Specialist time-off requests; created by add-offtime dialog; status updated by approveofftime | default |
| `deliverytime` | both | Specialist weekly delivery hours template; displayed at `teamdeliveryhours`, edited via dialog | default |
| `products` | read | Product catalog — read by dashboard (mode == 'Priority Mode') and by status-update to look up `atcmodel` | default |
| `productToDeliverySequence` | read | Product → delivery sequence config — read by dashboard (:113) | default |
| `profile_data` | read | Profile lookup (name, profileid) — used by capacity utilization, roster, pending | default |
| `users_roles` | read | Specialist/changeagent discovery — queried in add-offtime (:70-72) by `eis==true OR changeagent==true` | default |
| `EISzoomcontact` | both | Zoom account details for EIS — CRUD at `EISzoom` | default |
| `zoomaccount` | both | Active zoom session tracking — `inuse: false` reset in appointment-status-update cleanup (:239) | default |
| `openviduroom` | both | OpenVidu session room — created/updated in appointment-studio `joinRoom_Appointment` (:647) | default |
| `appointment session` | read | Session-name mapping used in roster component (:101) | default |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config item | Where read | Behavioral effect |
|---|---|---|
| `appointmenttype.ischangeworkrequired` | `mark-appointment-status.component.ts:162`, `appointment-status-update.component.ts:159` | If true + attended: opens `MarkAppointmentProcedureComponent` before status write |
| `appointmenttype.duration` | `add-appointment-availability.component.ts:80-88` | Sets minimum slot duration validation (end time must be ≥ max duration of selected appt types) |
| `products.mode == 'Priority Mode'` | `appointment-dashboard.component.ts:105-112` | Dashboard ONLY shows Priority-Mode products in the slot finder |
| `deliveryoptions.at(-1)` | `appointment-dashboard.component.ts:133` | Dashboard uses LAST delivery option's sequence |
| `environment.firebase.projectId` | `roaster.component.ts:230-236`, `appointment-studio.component.ts:490-497`, `approve-offtime.component.ts:170-180`, `authguard.service.ts:1141-1150` | Selects production vs. test CF endpoint URLs |
| `users_roles.eis / .changeagent` | `add-offtime.component.ts:70-72` | Determines who appears in the specialist dropdown |
| `availability` slot: `booked`, `available` | `book-appointment.component.ts:344` | A slot is shown only when `booked==false && available==true` |
| `appointments.platform` | `appointment-studio.component.ts:180,194,638,640` | `'openvidu'` vs default (`zoom`) determines which video path is taken |

---

## Cloud Functions involved (name -> trigger -> side-effect a test can assert)

| CF name | Trigger | Assertable side-effect |
|---|---|---|
| `appointmentbooked` | Firestore `appointments` CREATE (or HTTP) | Sends confirmation email to participant + specialist (Postmark); `appointments/{id}.emailsent = true` or logs row (verify in cloud) |
| `appointmentcancelled` | `appointments` UPDATE where `cancelled` flips to `true` | Notification sent; downstream cleanup |
| `appointmentremainder` | Scheduled — fires before starttime | Reminder email/FCM to participant + hosts |
| `requestApptCancel` | HTTP from participant-facing cancel flow | Updates `appointments.cancelled=true`, triggers cancellation downstream |
| `requestScheduling` | HTTP — participant requests appointment | Writes pending request; triggers scheduler notification |
| `computeSlot` | Firestore trigger or HTTP | Recomputes available slots in `availability` collection |
| `availabilityScheduler` | Scheduled cron | Auto-generates `availability` slots from `deliverytime` weekly templates |
| `approveOfftime` | HTTP — called from `approve-offtime.component.ts:168` after `offtime.status` update | ASSERT: availability docs in window are deleted AND conflicting appointments get `cancelled=true` — both assertable via admin read after CF completes |
| `profileAvailability` | HTTP — called from `authguard.service.ts:generateSpecialistSlot(:1138)` after offtime revoke | Regenerates `availability` slots for specialist; ASSERT: new slots appear in `availability` for specialist's profile |
| `resentAppointmentEmail` | HTTP GET — called from `roaster.component.ts:227` | Re-sends confirmation email; ASSERT: CF invocation logged (network-level stub) |
| `appointmentLinkRegenarate` | HTTP GET — called from `appointment-studio.component.ts:493` | ASSERT: `appointments/{id}.zoomdata` updated with new Zoom credentials / `appointments/{id}.signature` refreshed |
| `deliveryhoursCreate` | Firestore trigger on `deliverytime` CREATE/UPDATE | Materializes `availability` slots from weekly template |

---

## External services to stub (call sites file:line)

| Service | Call site | Stub mechanism |
|---|---|---|
| **Zoom Web SDK** (`@zoom/meetingsdk`) | `appointment-zoom-view.component.ts:5` — `ZoomMtg.init()` + `ZoomMtg.join()` at :87-132 | `page.route` on Zoom SDK CDN URLs (`source.zoom.us/*`) + `installNoRealWindowGuard`. Route `openappointmentzoom/:id` MUST be navigated to only in tests that stub Zoom; otherwise skip this route |
| **Zoom CF (HTTP GET)** — `resentAppointmentEmail` | `roaster.component.ts:227,231` | `page.route` on `**/resentAppointmentEmail**` — return `{ success:true }` |
| **Zoom CF (HTTP GET)** — `appointmentLinkRegenarate` | `appointment-studio.component.ts:493,497` | `page.route` on `**/appointmentLinkRegenarate**` — return `{ success:true, zoomdata:{...} }` |
| **approveOfftime CF (HTTP GET)** | `approve-offtime.component.ts:172,176,180` | `page.route` on `**/approveOfftime**` — return `{ success:true }` |
| **profileAvailability CF (HTTP GET)** | `authguard.service.ts:1143,1147,1151` (via `generateSpecialistSlot`) | `page.route` on `**/profileAvailability**` — return `{ success:true }` |
| **OpenVidu** | `appointment-studio.component.ts:638-694` (createOpenViduRoom via authguard) | `installOpenViduStub(page)` from `e2e/queue/stubs/index.ts` — already available |
| **Postmark/email** | CF `appointmentbooked`/`resentAppointmentEmail` — NOT a direct browser call | Stub via `page.route` on CF URL + `installEmailStub(page)` from `e2e/queue/stubs/index.ts` |
| **FCM** | CF `appointmentremainder` — NOT a direct browser call; also in shared `guard.sendFCM()` | `installFcmStub(page)` from `e2e/queue/stubs/index.ts` |
| **html2canvas** | `appointment-zoom-view.component.ts:188` — screenshot capture during Zoom session | Only called inside the Zoom route; stub by not navigating there, or mock `html2canvas` via window injection |

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role flags in `users_roles` | Can do | Key routes |
|---|---|---|---|
| **Admin / AH** | `admin:true` or `ah:true` | Book for any participant, see all availability/roster/pending, approve offtime, manage config | `bookappointment`, `appointmentavailability`, `appointmentstatuspending`, `roster`, `teamdeliveryhours`, `approveofftime`, `capacityutilization`, `appointmentrole`, `eisappointmentrole`, `mapappointmentrole`, `mapclienteis`, `EISzoom` |
| **Scheduler** | `scheduler:true` | Same as admin for most booking/roster/availability; also approves offtime | Same as admin set |
| **EIS (specialist)** | `eis:true` | Own availability, own studio, own pending appointments | `appointmentavailability`, `appointmentstudio`, `appointmentstatuspending`, `teamdeliveryhours` (own), `offtime` |
| **Changeagent** | `changeagent:true` | Same as EIS for scheduling purposes | same |
| **Participant (self-book)** | authenticated, no role flags | Book own appointments (next-day minimum), view own calendar | `bookappointment`, `mycalendar` |
| **Product Owner** | `productowner: [atcmodel,...]` | View upcoming appointments for products they own in studio | `appointmentstudio` — fetchproductownerAppointments (:201) |
| **Developer** | `developer:true` | Super-role: see all pending + extra studio actions | `appointmentstatuspending`, `appointmentstudio` |
| **Integrator** | `integrator:true` | Manage role config, offtime approval | `appointmentrole`, `eisappointmentrole`, `mapappointmentrole`, `mapclienteis`, `approveofftime` |
| **Capacity Planner** | `capacityplanner:true` | Approve offtime, view team delivery hours | `approveofftime`, `teamdeliveryhours` |

Role-gate patterns: `guard.getRoles().then(...)` checks in each component constructor (e.g. `appointment-status-pending.component.ts:49`, `appointment-availability.component.ts:69`, `roaster.component.ts:79`). Many guards are commented-out in production code (guards left as comments with `// if(...)` blocks) — in practice ALL authenticated users can reach these routes; the visible data is filtered by role.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1 — Specialist creates availability slot

1. EIS navigates to `/appointmentavailability`; app reads `availability` collection (own profile filter).
2. Clicks "Add Daily Availability" — opens `AddAppointmentAvailabilityComponent`.
3. Selects profile (admin only), selects appointment types + date + time range; submits.
4. **Firestore write:** `availability/{newID}` set with `{id, starttime, endtime, profileref, appointments:[refs]}` — batch.set at `add-appointment-availability.component.ts:333`.
5. `deliveryhoursCreate` CF may trigger and back-fill slot arrays — not triggered by UI directly.

### Flow 2 — Operator/participant books an appointment

1. Navigate to `/bookappointment`; super-role may pass `?pid=<participantID>`.
2. App fetches participant's `participantdeliverysequence` and `deliverables` to list bookable stages (:168-208).
3. User selects appointment type; app resolves `AppointmentType-To-Roles` → `Roles-To-EIS` to get eligible specialists (:224-287).
4. User selects date; app queries `availability` for free slots, merges multi-role slots (:334-471).
5. User selects slot and confirms.
6. **Firestore batch write** (`book-appointment.component.ts:479-628`):
   - `availability/{slotDocId}` updated — slot's `booked=true`, `available=false` (flipping multiple slot arrays)
   - `appointments/{newID}` set with full booking record (starttime, endtime, appointment ref, hosts, hostRole, slotdata, attended:false, cancelled:false, created:serverTimestamp)
7. `createJourneyRecord()` runs:
   - `participantsproduct/{participantproductid}` updated `status: "ongoing"` (:642)
   - `participantdeliverysequence/{profileid}` updated products array with `delivery[n].status="ongoing"` (:657)
   - `deliverables/{deliverypath}` updated `{fileref: arrayUnion(apptRef), status:"ongoing"}` (:661)
8. CF `appointmentbooked` fires on `appointments` CREATE — sends confirmation email.

### Flow 3 — Specialist marks appointment attended/cancelled

1. EIS navigates to `/appointmentstudio` — sees today's upcoming appointments (own host filter).
2. Clicks "Mark Status" on a past (endtime <= now) appointment — opens `MarkAppointmentStatusComponent`.
3. Selects attended/cancelled; if `ischangeworkrequired && attended`, the `MarkAppointmentProcedureComponent` dialog is shown first.
4. **Firestore writes** (`mark-appointment-status.component.ts:274-295`):
   - `appointments/{bookingid}` updated `{attended, cancelled, cancelledon, cancelledreason, appointmentstart, appointmentend, totalminutes}`
   - `guard.updateDeliveryStatus(apptPath, "completed"/"ready")` → finds deliverables `where("fileref", "array-contains", apptRef)` → batch.update each `{status: "completed"/"ready"}` (`authguard.service.ts:889-924`)
   - If completedProcedure: batch.update each procedure doc `{status:"completed", autogenralized}` (:287-295)

### Flow 4 — Admin approves offtime

1. Admin navigates to `/approveofftime`; app streams `offtime` collection.
2. Selects pending rows; clicks "Approve".
3. **Firestore write:** `offtime/{docid}` updated `{status:"approved", authorizedby:profileid}` (`approve-offtime.component.ts:162`).
4. HTTP GET to `approveOfftime?offid=<docid>` CF fires.
5. **CF side-effect (assertable):** `availability` docs in offtime window deleted (if any); conflicting `appointments` docs updated `{cancelled:true}`.

### Flow 5 — Roster / email resend

1. Admin navigates to `/roster`; app streams `appointments where(cancelled==false)`.
2. App displays appointments filtered to today + next 3 days by default.
3. Admin clicks resend-email icon on a row.
4. HTTP GET to `resentAppointmentEmail?appointmentid=<id>` CF fires.
5. CF sends email — no Firestore side-effect visible to test; assert CF invocation count (stub).

### Flow 6 — Capacity utilization report

1. Admin navigates to `/capacityutilization`; selects date range (default: today → +7d).
2. App reads `availability` for the range, computes `totalHours` / `usedHours` per specialist from `booked` slot arrays.
3. Renders table with `utility = floor((consumed/given) * 100)`.
4. **No writes** — pure read + computation. Anti-circular assertion: seed N slots for specialist (known hours); assert app-rendered utility% matches expected formula.

---

## Seed requirements (exact docs/users/refs to seed)

```
USERS (Firebase Auth + users_roles + profile_data)
  - admin-appt@example.com  → users_roles.{admin:true, ah:true}
  - scheduler@example.com   → users_roles.{scheduler:true}
  - eis1@example.com        → users_roles.{eis:true}       // specialist / host
  - eis2@example.com        → users_roles.{eis:true}       // 2nd specialist for 2-role appts
  - participant@example.com → users_roles.{}               // self-booking participant

CONFIG (reuse or create minimal stubs):
  - appointmenttype/{AT1}  {appointmenttype:"Test Diagnostic", duration:60, ischangeworkrequired:false}
  - appointmenttype/{AT2}  {appointmenttype:"Test Implementation", duration:90, ischangeworkrequired:true}
  - eisroles/{R1}          {role:"Primary Specialist", experiencestage:"S1", experiencelevel:"L1"}
  - Roles-To-EIS/{RTE1}    {assigned_role_ref: ref(eisroles/R1), assigned_eis:[ref(profile_data/eis1)]}
  - AppointmentType-To-Roles/{ATR1}  {assigned_appttype_ref: ref(appointmenttype/AT1), required_role:[ref(eisroles/R1)], additional_role:[]}
  - products/{P1}          {product:"Test WiSH", mode:"Priority Mode", atcmodel:null}  // non-ATC
  - productToDeliverySequence/{PDS1} {product: ref(products/P1), deliveryoptions:[{deliverysequence:[{activity: ref(appointmenttype/AT1)}]}]}

RUNTIME STATE:
  - participantsproduct/{PP1}  {profileid:"<participant-pid>", productref:ref(products/P1), status:"initiated"}
  - participantdeliverysequence/{participant-pid}  {profileid:"...", products:[{participantproductid:"PP1", productref:ref(P1), delivery:[{type:"appointment", status:"ready", sequenceref:ref(deliverables/D1)}]}]}
  - deliverables/{D1}  {profileid:"<participant-pid>", participantproductid:"PP1", type:"appointment", status:"ready", deliveryref:ref(appointmenttype/AT1), fileref:[]}
  - availability/{AV1}  {profileref:ref(profile_data/eis1), appointments:[ref(appointmenttype/AT1)], starttime: TOMORROW_9AM, endtime: TOMORROW_5PM, AT1:[{slotstart:TOMORROW_10AM, slotend:TOMORROW_11AM, booked:false, available:true}]}

OFFTIME SEED (for Flow 4):
  - offtime/{OT1}  {profileid:"<eis1-pid>", date:FUTURE_DATE, starttime:..., endtime:..., fullday:false, status:null, docid:"OT1"}
```

Reuse `e2e/lib/participant-sim.js` for db() handle; use `e2e/lib/test-project.js` allowlist guard.  
Do NOT reuse the queue suite's `seed-test-project.js` directly — build a parallel `seed-appointments.js` using the same helper pattern.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| APPT-01 | Availability list renders seeded specialist slot | REAL-UI | App fetches `availability` collection and renders row; assert app-rendered specialist name + appointment type matches seeded `AV1`; seeded data is precondition, not asserted directly | P0 |
| APPT-02 | Booking commits all 4 Firestore writes atomically | CF-SIDEEFFECT | After UI book: read `appointments` (app-written `attended:false, cancelled:false`), `availability[AT1][0].booked==true`, `participantdeliverysequence[].delivery[0].status=="ongoing"`, `deliverables[D1].status=="ongoing"` — ALL seeded from known state; assert APP-written values not test-written values | P0 |
| APPT-03 | Slot is hidden after booking (no double-booking) | REAL-UI | After APPT-02 commits, navigate to `/bookappointment?pid=<participant2>` for same slot; app should show ZERO available slots for that time window — app computed this from the booked flag it wrote | P0 |
| APPT-04 | Pending appointments list shows past unattended bookings | REAL-UI | Seed an `appointments` doc with `starttime` in the past, `attended:false, cancelled:false`; navigate to `/appointmentstatuspending`; assert app renders the row (client name, appointment type — values app built from its own Firestore read + mapProfile/mapAppointment joins) | P0 |
| APPT-05 | Mark attended writes `attended:true` and deliverable becomes `completed` | CF-SIDEEFFECT | From `/appointmentstatuspending`, open mark-status dialog, select attended, submit; then read `appointments/{id}.attended` (app-written) == true, `deliverables/{D1}.status` (updateDeliveryStatus-written) == "completed"; seeded attendee count = 0 before, assert 1 after | P0 |
| APPT-06 | Mark cancelled writes `cancelled:true` and deliverable reverts to `ready` | CF-SIDEEFFECT | Same flow as APPT-05 but select cancelled + reason; assert `appointments.cancelled==true`, `deliverables.status=="ready"` — values written by app, asserted against known pre-state | P0 |
| APPT-07 | Roster renders today's appointments and supports date filter | REAL-UI | Seed 2 appointments: one today, one 10 days away; navigate to `/roster`; assert app table shows today's appointment but not the future one (app filters in component); click "Get All" and assert both appear — counts the app computed | P1 |
| APPT-08 | Capacity utilization computes correct percentage from seeded slots | REAL-UI | Seed specialist with 8h availability window (AV1) containing exactly 2h booked slots; navigate to `/capacityutilization` within that date range; assert app renders `utility` column = 25 (=floor(2/8*100)) — value the app computed from its Firestore read, not a value the test wrote | P0 |
| APPT-09 | Offtime approval writes status and calls approveOfftime CF | CF-SIDEEFFECT | Seed OT1 with `status:null`; navigate to `/approveofftime`; select row, click approve; assert: `offtime/{OT1}.status=="approved"` (app-written); assert `approveOfftime` CF stub was invoked exactly once with `offid=OT1` | P1 |
| APPT-10 | Offtime deny writes `status:denied` without calling CF | CF-SIDEEFFECT | Same setup; click deny; assert `offtime/{OT1}.status=="denied"` (app-written); assert CF stub invocation count == 0 (deny does NOT call CF per approve-offtime.component.ts:133) | P1 |
| APPT-11 | Team delivery hours table renders all specialists | REAL-UI | Seed 2 `deliverytime` docs for eis1 and eis2; navigate to `/teamdeliveryhours` as admin; assert table has 2 rows with correct specialist names — app-joined from profile map | P2 |
| APPT-12 | appointmentstudio shows today's upcoming appointments for EIS host | REAL-UI | Seed an appointment with `hosts:[eis1_ref]`, `starttime=TODAY_FUTURE`, `cancelled:false, attended:false`; navigate to `/appointmentstudio` as eis1; assert app renders the appointment card with correct client name and appointment type (app-computed from mapProfile + mapAppointment joins) | P0 |
| APPT-13 | appointmentstudio regenerateZoomLink stub returns success message | REAL-UI | Navigate to `/appointmentstudio` as eis1; click "Regenerate Zoom Link" on appointment; stub `appointmentLinkRegenarate` CF to return `{success:true}`; assert app renders success feedback (NOT the CF response itself — the UI feedback the app computed from the response) | P1 |
| APPT-14 | appointment-dashboard shows slots for Priority Mode product appointment types | REAL-UI | Seed AV1 (with AT1 free slot); navigate to `/appointment-dashboard`; assert app renders the appointment type name and non-zero slot count badge — values the app assembled from productToDeliverySequence + appointmenttype + availability reads | P1 |
| APPT-15 | mapclienteis shows participant-specialist mapping | REAL-UI | Seed `customer_eismapping/{participant-pid}` with eis1 assigned to role R1; navigate to `/mapclienteis` as admin; assert table row shows participant name and role-specialist mapping — values app joined from profile/role maps | P2 |
| APPT-16 | EISzoom page renders zoom account rows | REAL-UI | Seed `EISzoomcontact/{Z1}` with name/email/zoomid; navigate to `/EISzoom`; assert table renders expected email — app rendered from Firestore stream | P2 |
| APPT-17 | Cancel reason required: submit disabled without cancellation reason | REAL-UI | Open mark-status dialog for an appointment; uncheck attended; assert submit button is disabled / form invalid until `cancelledReason` is selected — pure UI state check, no Firestore write needed | P1 |
| APPT-18 | Booking slot merge: 2-role appointment shows intersecting slots only | REAL-UI | Seed AV1 (eis1, AT1, 10-11am) and AV2 (eis2, AT1 as additional role, 10-11am); configure AT1 as 2-role appointment; navigate to `/bookappointment?pid=<participant>`; assert merged slots list contains exactly 1 entry at 10am combining both specialists — app computed the intersection | P1 |

---

## ATC exclusions within this group

The following ATC touchpoints exist in this group and MUST be excluded from all test cases:

1. **`appointment-studio.component.ts:204-211`** — `fetchproductownerAppointments()` reads `products.atcmodel` to filter appointments for `productowner` role users. In tests: do NOT seed any products with a non-null `atcmodel`. Seed `products/{P1}.atcmodel = null`. This ensures the productowner filter path is either empty or routes via the `atcmodel == null` branch and never touches ATC collections.

2. **`mark-appointment-status.component.ts:69-79`** — `ngOnInit` reads `products` collection and checks if `productData.atcmodel.trim().length != 0` to set `this.productType`. In tests: seed `products.atcmodel = null`/`""` so `productType` stays null and the `MarkAppointmentProcedureComponent` ATC procedure dialog is never opened for AT1 (ischangeworkrequired=false). For AT2 (ischangeworkrequired=true), only test the procedure skip path by ensuring `ischangeworkrequired:false` in seed.

3. **`appointment-status-update.component.ts:117-136`** — same `atcmodel` lookup pattern. Same mitigation: seed products without atcmodel.

4. The following collections are ATC-gated and must never be read/written/seeded: `atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary(_backup)`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `atc assignment`, `big assignment atc_alpha`, `big assignment_*`, `big temporary_ATC`, `0 atcinvolved issue`.

5. `src/app/ATC/**` components — excluded entirely from scope.

---

## Risks / unknowns

1. **Guard commenting-out** — most role checks in Scheduling components are commented out (e.g. `appointment-availability.component.ts:71-78`, `book-appointment.component.ts:96-120`). In practice ALL authenticated users reach these routes; role filtering is data-only (query filter). Tests cannot rely on 403 redirects for role gates — design access-control tests around DATA visibility, not route block.

2. **`ischangeworkrequired` procedure dialog** — `MarkAppointmentProcedureComponent` opens a secondary dialog when `ischangeworkrequired==true && attended`. This reads ATC-adjacent `products.atcmodel` for context. Mitigation: seed AT1 with `ischangeworkrequired:false` to keep all P0 status tests in the simple path. Test AT2 (ischangeworkrequired=true) path separately as P2, seeded with `atcmodel:null`.

3. **Slot availability time-sensitivity** — booking requires `starttime >= mindate` (tomorrow for participants, today for super-role). Seed `AV1.starttime` at least 2 days in the future for non-super-role booking tests, and inject frozen date via `page.clock.setFixedTime()` if needed.

4. **`appointments` batch write atomicity** — the batch at `book-appointment.component.ts:608` includes availability flip and appointment set. The test must poll via `firestore-admin` `pollUntil` (from `e2e/queue/support/firestore-admin.ts`) for `appointments.created != null` before reading side-effects.

5. **`updateDeliveryStatus` calls `where("fileref", "array-contains", apptRef)`** — the `deliverables/{D1}.fileref` must contain the appointment ref BEFORE this query can find it. In the seeded state, `fileref` starts empty; it is only populated during booking (`createJourneyRecord`). For APPT-05/06 tests the full booking flow (APPT-02) must run first OR seed `D1.fileref = [ref(appointments/AP1)]` directly.

6. **`approveOfftime` CF URL selection** — the component checks `environment.firebase.projectId`; on the cloud test project `slabs-queue-e2e-exdcz` neither branch matches (projectId is not `starlabs-test` or `fir-sample-aae4a`). The `url` variable remains `undefined` and the HTTP call fails silently. The Firestore write (`status:"approved"`) DOES happen. Design APPT-09 to assert the Firestore write (assertable) and mark the CF stub assertion as conditional on a proper environment config fix.

7. **No `data-testid` attributes** in Scheduling/Offtime HTML templates — zero found in the codebase. All selectors must use: `mat-table` row text content, `mat-select` option text, button labels, `mat-form-field` labels. Note selector fragility risk; add `data-testid` attributes in follow-up.

8. **`appointment-zoom-view` (route `openappointmentzoom/:id`)** — imports and inits the real Zoom Meeting SDK. Any navigation to this route in tests REQUIRES complete Zoom SDK CDN stubbing via `page.route` on `source.zoom.us/**` AND `installNoRealWindowGuard`. Recommend skipping this route in the initial suite (P2 only).

9. **`appointment-status-update` (route `appointment-status-update`)** — receives meeting data as URL query param `?data=<JSON-encoded>`. Navigation requires constructing a valid JSON-encoded meeting data string. No direct UI navigation path; landing URL must be built programmatically.

10. **`openviduroom` write in `joinRoom_Appointment`** — only triggered when `appointment.platform == 'openvidu'`. Default platform is `zoom`. Seed appointments with no `platform` field (defaults to zoom path) to avoid OpenVidu room creation in booking tests.
