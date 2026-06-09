# Events, Arena & Calendar — e2e recon

> Analyst: Claude Sonnet 4.6 | Date: 2026-06-10
>
> Source folders: `src/app/Events/` · `src/app/big/create-arena-space/` · `src/app/queue system/initiate-event-product/` · `src/app/queue system/event-opportunity-dashboard/`
>
> Routes analyzed: `create_event`, `event_participation_approve`, `arena_e_ticket_approve`, `qr-scanner`, `event_attendance_log`, `videoask-display`, `arena_space`, `layers-screen`, `createarenavideoasktemplate`, `eventopportunitydashboard`, `initiateeventproduct`

---

## Routes

| Path | Component file:line | Role/guard | ATC? |
|---|---|---|---|
| `create_event` | `src/app/Events/event-list/event-list.component.ts:31` (list) + opens `update-event-detail.component.ts:53` dialog | `canActivate:[authGuard]`; `authGuard` reads `dashboard` collection for `roles[]` config (auth.guard.ts:36) | ATC-ADJACENT: `update-event-detail.ts:360` reads `atc model` collection and `atcmodel` field is stored on `event collection` docs. **Guard only: config collection, not test-time data.** |
| `event_participation_approve` | `src/app/Events/event-participation-approve/event-participation-approve.component.ts:40` | `canActivate:[authGuard]` | **None** |
| `arena_e_ticket_approve` | `src/app/Events/arena-e-ticket-approve/arena-e-ticket-approve.component.ts:36` | `canActivate:[authGuard]` | **None** |
| `qr-scanner` | `src/app/Events/qr-scanner/qr-scanner.component.ts:29` | `canActivate:[authGuard]` | **None** |
| `event_attendance_log` | `src/app/Events/event-attendance-log/event-attendance-log.component.ts:42` | `canActivate:[authGuard]` | **None** |
| `videoask-display` | `src/app/Events/videoask-display/videoask-display.component.ts:38` | `canActivate:[authGuard]` | **None** |
| `arena_space` | `src/app/big/create-arena-space/create-arena-space.component.ts:39` | `canActivate:[authGuard]` | **None** |
| `layers-screen` | `src/app/Events/layers-screen/layers-screen.component.ts:45` | `canActivate:[authGuard]` | **None** |
| `createarenavideoasktemplate` | `src/app/content/arena-video-ask-input/arena-video-ask-input.component.ts` | `canActivate:[authGuard]` | **None** |
| `eventopportunitydashboard` | `src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard-v2/event-opportunity-dashboard-v2.component.ts` (v2 is active route at app.routes.ts:31) | `canActivate:[authGuard]`; developer-role exposes extra controls (eod.component.ts:129) | **None** |
| `initiateeventproduct` | `src/app/queue system/initiate-event-product/initiate-event-product.component.ts:67` | `canActivate:[authGuard]` | **None** |

`authGuard` implementation (auth.guard.ts:10): requires Firebase Auth user; then reads `dashboard` Firestore collection for per-route `roles[]` and `profileid[]` arrays. Guard is **route-config-driven**, not code-hardcoded. Guard gate file:line: auth.guard.ts:36–44.

Note: `eventopportunitydashboard` loads `EventOpportunityDashboardV2Component` (app.routes.ts:31), not the plain v1 component — the spec file in the plain component's folder is a stub.

---

## Firestore collections

| Collection | Read/Write | Used for | Notes |
|---|---|---|---|
| `event collection` | **both** | canonical event master record (name, dates, venue, hosts, atcmodel, bigmarathonref, notifyparticipants, addtocalendar) | Written by `update-event-detail.component.ts:501/800`; read by all 11 routes |
| `arena events` | **both** | per-product sub-event under an event (title, productref, startdate, enddate, deliveryref, docid, heroevent, image) | Written by `update-event-detail.component.ts:465/512/761/823`; read by `initiateeventproduct.ts:886` |
| `event participation request` | **both** | participant sign-up/approval/attendance record (profileid, eventref, status, productref, arenaeventid, participantproductid) | Read + updated by `event-participation-approve.ts:195/251/389`; updated by `initiateeventproduct.ts:504` |
| `events_profiles` | **write** | marks participant as attended at an event (event_ref, profile_ref, pseudo_name, token, eventrequest) | Written by `event-participation-approve.ts:255` (markAsAttended) |
| `arena e-ticket` | **both** | arena e-ticket per participant per event (profileid, eventref, producteligible, active, eventstartdate) | setDoc'd by `arena-e-ticket-approve.ts:170`; updated by :157 (toggle active), :183 (append product); read by `qr-scanner.ts:139` |
| `arena e-ticket log` | **write** | QR scan record per ticket use (docid=uniqueid, profileid, eventref, eticketref, product, logdate) | setDoc by `qr-scanner.ts:219` (afterProductSelect) |
| `arenalayers` | **both** | event-layer content records (title, description, sequence, eventref) | Read by `layers-screen.ts:100`; setDoc by `add-layers.component.ts:190` |
| `arenaspace` | **both** | arena space session records (participantslist, spaceid, mentor, pivottype, summary, eventref, cohortsid, date) | setDoc/writeBatch by `create-arena-space.ts:740/803/886`; read live by :172 |
| `participantvideoask` | **both** | participant video ask submissions (profileid, videoaskid, arenaevent, fileurl, uploaded, tags) | Read by `videoask-display.ts:202`; updateDoc by :353 (tag) |
| `arenavideoask` | **both** | VideoAsk template definitions (title, eventref, url) | Read by `videoask-display.ts:189`; setDoc by `arena-video-ask-input.ts:163` |
| `participant metadata` | **write** | participant tag denorm (profiletags array-union/remove) | updateDoc by `videoask-display.ts:369` |
| `participant tag logs` | **write** | tag change audit record | setDoc by `videoask-display.ts:373` |
| `participant tags` | read | tag master (tagsfor, isActive) used to filter video-ask tags | collectionData by `videoask-display.ts:152` |
| `participantsproduct` | **both** | participant product record (status, eventref, arenaeventid, deliverytype, queuevariationid) | Read + updated (status→"initiated") by `initiateeventproduct.ts:512/519` |
| `queue_token` | read | read for already-in-queue check in `initiateeventproduct` | getDocs by `initiateeventproduct.ts:313` |
| `queue generation` | read | event list combined with event collection in `initiateeventproduct.ts:216` | Also read by `event-opportunity-dashboard.ts:245` |
| `stage opportunity count` | **both** | custom stage group config for the opportunity dashboard (stagename, queuelist, stage[], sequence) | setDoc/updateDoc by `event-opportunity-dashboard.ts:931/945/966` |
| `queue activity log` | read | completed stage counts in opportunity dashboard | collectionData by `event-opportunity-dashboard.ts:277` |
| `arena highlights` | write | shared VideoAsk highlight (eventref, from, pinned) | setDoc by `videoask-display.ts:329` (onShareToHighlights) |
| `deliverables` | **both** | delivery record (fileref→event participation request, status) | Query + batch update (status→"completed") by `event-participation-approve.ts:265/414` |
| `productToDeliverySequence` | read | delivery sequence definition for initiate-event-product | getDocs by `initiateeventproduct.ts:310` |
| `A&H_Space_Name` | read | space name config for arena-space | getDocs by `create-arena-space.ts:146` |
| `A&H_Space_Type` | read | space type config | getDocs by `create-arena-space.ts:158` |
| `big cohorts` | read | cohort name/participantidlist for arena-space | getDocs by `create-arena-space.ts:367` |
| `event location` | read | venue list for create-event dialog | collectionData by `update-event-detail.ts:271` |
| `products` | read | product name map | getDocs by multiple components |
| `profile_data` | read | profile name/image map | getDocs by multiple components |
| `big assignment` | read | BIG assignment for non-live-event arena-space type | getDocs by `create-arena-space.ts:418` |
| `wati archive` | write | Wati broadcast archive (set by `initiateeventproduct.ts:1024`) | External comms — stub in tests |
| `email archive` | write | Email send archive (set by `initiateeventproduct.ts:1063`) | External comms — stub in tests |
| `dashboard` | read | route-config roles/profiles (authGuard reads this) | auth.guard.ts:36 |
| `atc model` | read | ATC model list read by `update-event-detail.ts:360` for the atcmodel dropdown | **Reference-only config; safe per CLAUDE.md "reference-only config is safe"** |

---

## Config drivers

| Config | Behavior driven | Where read | Notes |
|---|---|---|---|
| `event collection` → `end_date` | QR scanner only loads events whose `end_date >= now` (qr-scanner.ts:82) | qr-scanner.ts:82 | Test event must have a future `end_date` |
| `arena e-ticket` → `active` | toggle by `arena-e-ticket-approve.ts:157` (MatSlideToggle); QR scan denies if `active !== true` (qr-scanner.ts:179) | qr-scanner.ts:179 | Seed must set `active:true` for QR scan approval |
| `arena e-ticket` → `producteligible[]` | QR scanner shows product-select only for eligible products (qr-scanner.ts:191) | qr-scanner.ts:191 | Must be non-empty for a successful scan |
| `event collection` → `start_date`, `end_date` | QR scan returns "yet to start" / "event not active" states (qr-scanner.ts:177–186) | qr-scanner.ts:175–186 | Boundary condition for scan state machine |
| `arena e-ticket log` → `docid == uniqueid` | duplicate-scan guard (qr-scanner.ts:187) | qr-scanner.ts:187 | The map is keyed by `docid` (= uniqueid from QR payload) |
| `queue generation` → `queueenddate >= now` | event-opportunity-dashboard filters queues to active ones (eod.ts:245) | event-opportunity-dashboard.ts:245 | Seeded queue generation doc must have future `queueenddate` |
| `stage opportunity count` → `queuelist[]` | custom stage grouping (opportunity dashboard) only shows for selected queues (eod.ts:267) | event-opportunity-dashboard.ts:267–268 | Config doc is created/edited by the operator from the same screen |
| `productToDeliverySequence` | initiate-event-product requires a delivery sequence for the selected product | initiateeventproduct.ts:310, :422 | Must have at least one `deliveryoptions` entry for initiation |
| `atcmodel` on `event collection` | displayed in create-event form but **not enforced** in any test flow; `atc model` collection read only as reference | update-event-detail.ts:360 | See ATC exclusions section |

---

## Cloud Functions involved

The candidate CFs listed in the brief were checked. No CF source repo is present in `/Users/antano/solarcode/ah/` (only `starlabs-angular` and `starlabs-angular-queue-e2e` exist). Verification of deployment status is based on call-site evidence in the Angular components.

| CF name | Trigger (inferred from component evidence) | Side-effect a test can assert | Confidence |
|---|---|---|---|
| `onEventApprovalProductMode` | Likely triggered on `event participation request` write when `status` transitions to `"approved"` | Possible: participant product status update or deliverable status — not directly observed in Angular code; no direct call site found | LOW — not observed as a direct invocation in Angular components |
| `onEventDateChange` | Likely triggered on `event collection` update of `start_date`/`end_date` | Downstream token/invite refresh — not visible in Angular | LOW — speculative |
| `onEventOpenVidu` | Likely triggered on `event participation request` approval to provision an OpenVidu session | N/A for these routes (OpenVidu is for live studios, not event e-tickets) | LOW |
| `eventMode` | May be triggered when `participantsproduct.status` → `"initiated"` in `initiateeventproduct` batch | No direct assert target observed | LOW |
| `eventPreparationMode` | Similar to eventMode — product mode lifecycle | No direct assert target | LOW |
| `eventparticipationdata_to_pmd` | Likely triggers on `event participation request` create/update to denorm into `participant metadata` | CF may write to `participant metadata`; assertable if seeded correctly | MEDIUM — if deployed |
| `onBreakthroughsPosted` | Triggered on `arenaspace` create/update | May write to a secondary collection (e.g. touchpoints) — not confirmed | LOW |
| `participantsproductinitiated` | Triggered on `participantsproduct` update when `status → "initiated"` | May create a `queue_token` or set `deliverables`; testable against known count | MEDIUM — the most directly observable CF in this group |

**Test approach for CFs:** Use CF-SIDEEFFECT test type only for `participantsproductinitiated` (observable: count of tokens/deliverables created after initiating N participants from the UI). All others are LOW-confidence and excluded from candidate test cases until confirmed deployed.

---

## External services to stub

| Service | Call site file:line | Notes |
|---|---|---|
| Wati/WhatsApp | `initiateeventproduct.ts:1004` (opens `WatiInputComponent` dialog); `initiateeventproduct.ts:1034` (`http.post(sendWhatsAppBroadcast)`) | Must stub `WatiInputComponent` dialog and the outgoing HTTP POST |
| Email (Postmark/batch) | `initiateeventproduct.ts:1052` (opens `EmailInputComponent`); `initiateeventproduct.ts:1079` (`http.post(sendBatchEmail)`) | Must stub dialog and HTTP POST |
| FCM (app notifications) | `initiateeventproduct.ts:1097` (opens `AhNotificationComponent`); `authguard.saveNotificationRecord` writes to `notification_records` | Stub the AhNotification dialog |
| Firebase Storage (image upload) | `initiateeventproduct.ts:1137` (`uploadBytes` for notification image) | Stub storage upload |
| ZXing QR scanner camera | `qr-scanner.component.html:28` (`<zxing-scanner (scanSuccess)="onCodeResult($event)">`) | Camera access unavailable in headless Playwright; call `onCodeResult()` directly via `page.evaluate` to inject a synthetic QR payload |
| VideoAsk content URLs | `arena-video-ask-input.ts:148` (`content_urls` setDoc + external URL embed) | VideoAsk is a third-party embed; no external HTTP call in Angular code — only the `content_urls` collection write. No stub needed at network level; just verify the Firestore write. |

---

## Actors / roles

| Actor | Role required | Landing route | Role-gate file:line |
|---|---|---|---|
| Admin / A&H operator | `admin` or `ah` (dashboard config) | /EISDashboard (default) | auth.guard.ts:36–44; authguard.service.ts:320 (routeConfig reads `dashboard` collection) |
| Event coordinator | `eventcoordinator` (configured in `dashboard`) | /EISDashboard | Same guard |
| Floor / mentor | `floor`, `mentor` | /EISDashboard | Same guard |
| Developer | `developer` | Enables extra controls in `eventopportunitydashboard` (eod.ts:129) | eod.ts:129 |
| Any authenticated user | authenticated (authGuard basic check) | Blocked to /login if unauthenticated | auth.guard.ts:21 |

All event-group routes use the same `authGuard` + `dashboard` route-config pattern. There are no component-level role checks in the core CRUD paths — role enforcement is entirely via the route guard reading the `dashboard` Firestore collection. Exception: `eventopportunitydashboard` shows a developer-only delete button (eod.ts:129).

---

## Key user flows

### Flow 1: Create/Edit an Event and Arena Sub-Events

1. Operator navigates to `/create_event` → `EventListComponent` streams `event collection` ordered by `start_date desc` (event-list.ts:62–83). **No Firestore write.**
2. Operator clicks "New" or "Edit" → `UpdateEventDetailComponent` dialog opens (event-list.ts:85). On new: `eventDocID` = new auto-id from `collection(firestore,"event collection")`.
3. Operator fills form (name, dates, venue, hosts, products) and submits → batch writes:
   - `setDoc("event collection", eventid, {name, start_date, end_date, venue, address, hosts, atcmodel, notifyparticipants, addtocalendar, …}, {merge:true})` (update-event-detail.ts:501/736/800)
   - For each product row: `setDoc("arena events", docid, {title, productref, startdate, enddate, deliveryref, eventref, heroevent, …})` (update-event-detail.ts:465/512/761/823)
4. **Observable write:** `event collection/{eventid}` exists with correct name/dates; `arena events/{docid}` exists with `eventref == event collection/{eventid}`.

### Flow 2: Approve Event Participation Requests

1. Operator navigates to `/event_participation_approve` (or via `/create_event` → view participants link → opens URL with `?eventid=<id>`).
2. Component streams `event collection` (event-participation-approve.ts:118–131), then on event select queries `event participation request` where `eventref == selectedEvent` (ts:195–199). Displays 4 tabs: Requested / Approved / Mark Attendance / Attended.
3. Operator selects rows in "Requested" tab, clicks "Mark as Approved":
   - `batch.update("event participation request", docid, {status: "approved"})` (ts:389)
   - `batch.set("events_profiles", new-id, {event_ref, profile_ref, pseudo_name:null, token:null, eventrequest:ref})` (ts:393)
4. **Observable write:** `event participation request/{docid}.status == "approved"`; new `events_profiles` doc with `event_ref == eventref`.
5. Operator selects rows in "Mark Attendance" tab, clicks "Mark as Attended":
   - `batch.update("event participation request", docid, {status: "attended"})` (ts:250)
   - `batch.set("events_profiles", ...)` (ts:255)
   - Queries `deliverables` where `fileref array-contains-any [ref]`; `batch.update(deliverableDoc, {status:"completed"})` (ts:276)
6. **Observable write:** `event participation request/{docid}.status == "attended"`; `deliverables/{id}.status == "completed"`.

Note: `updateStatus()` method (ts:372) has its `batch.commit()` **commented out** (ts:420–427) — this means the bulk approve via that method is a silent no-op. The working path is `markAsAttended()` (ts:235). This is a **bug/risk** (see Risks section).

### Flow 3: Arena E-Ticket Issuance

1. Operator navigates to `/arena_e_ticket_approve`, selects an event.
2. Component queries `event participation request` (status=="approved") and `arena e-ticket` for the event (arena-e-ticket-approve.ts:130–143).
3. For a new e-ticket: Operator clicks "Submit" → `setDoc("arena e-ticket", docid, {createddate, docid, eventparticipationref, eventref, producteligible:[productref.id], profileid, active:true, eventstartdate, eventenddate})` (ts:170–180).
4. For an existing ticket: `updateDoc("arena e-ticket", docid, {producteligible: arrayUnion(productref.id)})` (ts:192).
5. Toggle active: `updateDoc("arena e-ticket", docid, {active: event.checked})` (ts:157).
6. **Observable write:** `arena e-ticket/{docid}` exists with `active:true`, `profileid`, `eventref`.

### Flow 4: QR Scan Attendance

1. Operator/venue staff navigates to `/qr-scanner`, selects event + product.
2. Component loads `arena e-ticket` for the event and the `arena e-ticket log` (full collection scan, qr-scanner.ts:97).
3. Camera scan activates (`<zxing-scanner>`). On scan result: component parses JSON QR payload `{profileid, uniqueid}`.
4. Validates: ticket active? event date range? uniqueid already used?
5. On valid scan + product select → `setDoc("arena e-ticket log", uniqueid, {docid:uniqueid, product, logdate:serverTimestamp(), profileid, eventref, eticketref})` (qr-scanner.ts:219).
6. **Observable write:** `arena e-ticket log/{uniqueid}` exists with `profileid`, `eventref`, `logdate`.

### Flow 5: Initiate Event Product (bulk participant initiation)

1. Operator navigates to `/initiateeventproduct`, selects an event/queue, then selects an arena event.
2. `onArenaEventSelect()` loads: delivery sequences, event participation requests, participantsproduct (status==null, productref==selected), queue_token for already-in-queue check (initiateeventproduct.ts:302–415).
3. Table displays eligible participants; operator selects N, picks delivery set (and variation if queue-type), clicks Initiate.
4. `initiateEventProduct()` runs in chunks of 20 with 5s delay between chunks:
   - For each participant: `batch.set("event participation request", id, {status:"approved", profileid, productref, arenaeventid, participantproductid, eventref, initiatedfrom:"web"}, {merge:true})` (ts:505)
   - `batch.update("participantsproduct", docid, {status:"initiated", eventref, arenaeventid, deliverytype, queuevariationid?, eventparticipationid, statusdate.initiated:serverTimestamp()})` (ts:519)
5. **Observable write:** `event participation request/{id}.status == "approved"`; `participantsproduct/{docid}.status == "initiated"` with `arenaeventid` set.

### Flow 6: Event Opportunity Dashboard (read-only monitoring)

1. Operator navigates to `/eventopportunitydashboard`, selects queues.
2. `getselectedStages()` streams `stage opportunity count` (custom stage groups) and `queue activity log` (eod.ts:267, :277).
3. `fetchQueueTokens()` streams `queue_token` for selected queues (eod.ts:986–1011).
4. `EventOpportunityComponent` child feeds `mapData` (live studio data) back via output event.
5. **Write:** operator can create/edit/delete `stage opportunity count` docs (eod.ts:931, :945, :966, :612–616).
6. Drag-and-drop reorder updates `sequence` on each `stage opportunity count` doc (eod.ts:965).
7. **Observable write:** `stage opportunity count/{docid}.sequence` updated; new doc for create.

### Flow 7: Create Arena Space

1. Operator navigates to `/arena_space`, chooses event type, event, imports Excel or adds manually.
2. For Excel import: validates participant/space/type names against Firestore, maps to IDs.
3. On "Upload All": `writeBatch` sets `arenaspace/{docid}` with `{participantslist, spaceid, mentor, pivottype, summary, eventref, cohortsid, date, validated:false, delete:false}` (create-arena-space.ts:886–915).
4. **Observable write:** `arenaspace/{docid}` exists with correct participant list and `eventref`.

### Flow 8: VideoAsk Display (tagging)

1. Operator navigates to `/videoask-display`, views `participantvideoask` table.
2. On tag add/remove: `updateDoc("participantvideoask", row.docid, {tags: arrayUnion/Remove(tagId)})` (videoask-display.ts:364); then `updateDoc("participant metadata", profileid, {profiletags: ...})` (ts:368); `setDoc("participant tag logs", logId, {...})` (ts:373).
3. **Observable write:** `participantvideoask/{docid}.tags` contains/excludes `tagId`; `participant tag logs/{logId}` exists.

---

## Seed requirements

Reuse patterns from `e2e/fixtures/seed-test-project.js`. New seeds needed:

1. **`event collection` doc** — `{name, start_date (past), end_date (future), venue, address, hosts:[], notifyparticipants:false, addtocalendar:false, testrunid}`. Deterministic ID: `<TESTRUNID>_event_1`. Need future `end_date` for QR scanner to admit the event.
2. **`arena events` doc** — linked to event via `eventref`, with `productref` pointing to a seeded product, `startdate/enddate`, `testrunid`. ID: `<TESTRUNID>_arenaevent_1`.
3. **`event participation request` docs (K=3)** — status `"requested"` initially. `{profileid: seeded-profile-id, eventref, productref, arenaeventid, participantproductid, status:"requested", testrunid}`. IDs: `<TESTRUNID>_epr_<idx>`.
4. **`arena e-ticket` doc** — `{profileid: seeded-profile-id, eventref, producteligible:[productref.id], active:true, eventstartdate, eventenddate, testrunid}`. ID: `<TESTRUNID>_eticket_1`.
5. **`participantsproduct` docs (K=3)** — `{profileid, productref, status:null, testrunid}` so `initiateeventproduct` finds them as uninitiated. ID: `<TESTRUNID>_pp_<idx>`.
6. **`products` doc** — reuse/reference existing product in test project, or seed: `{id: docid, product: "Test Product <TESTRUNID>"}`.
7. **`profile_data` docs** — K=3 participants with `name`, `email`, `profileid`. Reuse `participants` from existing seed.
8. **`stage opportunity count` doc** — `{stagename:"Test Stage", stage:[{queueid, stagename, status:null}], queuelist:[queueDocId], sequence:0, testrunid}`. ID: `<TESTRUNID>_soc_1`.
9. **Admin user** — roles: `['admin']` — reuse existing `admin+<run>@example.com` actor.
10. **Seeded `deliverables` doc** — `{fileref: [ref to event participation request], status:null, testrunid}` for the attendance-→deliverable-complete assertion.
11. **`arenavideoask` template doc** — `{title:"Test VideoAsk <TESTRUNID>", docid, testrunid}` for `videoask-display` filter tests.
12. **`participantvideoask` doc** — `{profileid, videoaskid:<arenavideoask docid>, uploaded:serverTimestamp(), testrunid}` for tag tests.
13. **`participant tags` doc** — `{tagsfor:["video ask"], isActive:true, testrunid}` tag master.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| EVT-01 | Login and land on create_event list (no bounce, guard admits admin) | REAL-UI | App-rendered `event collection` rows contain the seeded event name (stream-computed by component from Firestore) vs known seeded name | P0 |
| EVT-02 | Create a new event: `event collection` doc written with correct name, dates, and at least one `arena events` sub-event | REAL-UI | Read back `event collection/{docid}` and `arena events` docs after the REAL UI form submit; assert app-set `name`, `start_date`, `end_date` match the form values entered | P0 |
| EVT-03 | Approve event participation request: `event participation request` status flips to "approved" and `events_profiles` doc is created | REAL-UI | `event participation request/{docid}.status == "approved"` written by the component's writeBatch; `events_profiles` doc count +1 with correct `event_ref`. Assert against KNOWN seeded request count. | P0 |
| EVT-04 | Mark attendance: `event participation request` status flips to "attended" and linked `deliverables` doc status flips to "completed" | REAL-UI | `event participation request/{docid}.status == "attended"` and `deliverables/{id}.status == "completed"` — both written by the component's batch; assert against seeded deliverables linked via `fileref` | P0 |
| EVT-05 | Arena E-Ticket issuance: `arena e-ticket` doc created with `active:true` and correct `profileid`/`eventref` | REAL-UI | `arena e-ticket/{docid}` written by `onSubmit`; asserted against seeded `event participation request` row (known profileid). | P0 |
| EVT-06 | Arena E-Ticket active toggle: `arena e-ticket.active` flips from true to false via the slide toggle, and QR scanner then denies the scan | REAL-UI | Read back `arena e-ticket/{docid}.active` after toggle in the REAL UI; then drive the QR scan flow with the same profileid and assert "ticket denied" state (ticketdenied==true). | P1 |
| EVT-07 | QR scan approval: `arena e-ticket log` doc created with correct `profileid`, `eventref`, and a server timestamp `logdate` after a valid scan | REAL-UI | `arena e-ticket log/{uniqueid}` — written by `afterProductSelect`; assert against KNOWN seeded uniqueid from QR payload injected via `page.evaluate(() => component.onCodeResult(JSON.stringify({profileid, uniqueid})))`. Camera is bypassed. | P0 |
| EVT-08 | QR scan duplicate guard: second scan of the same uniqueid results in `usedticket==true` (no second `arena e-ticket log` write) | REAL-UI | After EVT-07 seeds the first log, inject the same uniqueid again; assert `arena e-ticket log` count for that uniqueid is still 1 (no new doc). App-computed state vs known count. | P1 |
| EVT-09 | Event attendance log renders the correct count of unique participants for a seeded event | REAL-UI | Component streams `arena e-ticket log` and shows `participants` count; assert == countWhere("arena e-ticket log", [["eventref","==", seededEventRef]]); both computed independently. | P1 |
| EVT-10 | Initiate event product (single participant): `participantsproduct.status` flips to "initiated" and `event participation request` created/updated with `status:"approved"` after real UI initiation | REAL-UI | `participantsproduct/{docid}.status == "initiated"` and `event participation request` count for `arenaeventid == seededArenaEventId` >= 1 with status `"approved"` — written by the component's chunked batch. Assert against KNOWN seeded count of initiated products. | P0 |
| EVT-11 | Initiate event product bulk (N=3): count of `participantsproduct` docs with `status=="initiated"` == N after initiating all 3 seeded participants | CF-SIDEEFFECT | After REAL UI batch initiation of N seeded participants, `countWhere("participantsproduct", [["arenaeventid","==",arenaEventId],["status","==","initiated"]]) == N`. N is the seeded count (anti-circular: seeded N, assert CF/batch produced exactly N). | P0 |
| EVT-12 | Layers screen: seeded `arenalayers` doc appears in the table after event selection | REAL-UI | Component renders rows from `arenalayers` stream; count of visible rows >= 1 with the seeded title. Assert against seeded title string vs app-rendered row text. | P2 |
| EVT-13 | Create arena space (manual): `arenaspace` doc written with correct `participantslist` and `eventref` | REAL-UI | `arenaspace/{docid}` written by `createArenaManually`; assert `participantslist` contains seeded profileid(s) and `eventref` matches the seeded event ref. | P1 |
| EVT-14 | VideoAsk tag add: `participantvideoask/{docid}.tags` contains the added tag after REAL UI tag click; `participant tag logs` doc created | REAL-UI | Read back `participantvideoask/{docid}.tags` (written by updateDoc); `countWhere("participant tag logs", [["profileid","==",seededProfileid],["type","==","added"]]) >= 1`. App output vs seeded profileid. | P1 |
| EVT-15 | Event opportunity dashboard: custom stage count doc created with correct `queuelist` and `stagename` after REAL UI form submit | REAL-UI | `stage opportunity count/{docid}` written by `submitStageOpportunity`; read back `docid.queuelist` and assert == seeded `selectedQueueList`. App-set value vs seeded queue docid. | P2 |
| EVT-16 | Event opportunity dashboard: total stage participant count rendered by the board matches Firestore `queue_token` count for the same stage | REAL-UI | Board calls `sumOfStageTokenCount` from its live `queue_token` stream; oracle = `countWhere("queue_token", [["queueref","==",seededQueueRef],["currentstage","==",stageName]])`. Two independent computations agree. | P1 |

---

## ATC exclusions within this group

1. **`atcmodel` field on `event collection`** — `update-event-detail.component.ts:115,199,401,738` stores and reads an `atcmodel` reference. The form dropdown lists models from the `atc model` collection (ts:360–362). **Action:** when seeding test events, seed with `atcmodel: null`; do not drive the atcmodel dropdown in any test case. The `atc model` collection is reference-only config per CLAUDE.md and the underlying `atcmodel` value is not asserted.
2. **`event collection` → `atcmodel` write path** — the save path (ts:401, :738) writes `atcmodel: value.atcmodel ?? null`. This is unavoidable in the create/edit flow but can be set to null by submitting a form with no atcmodel selection. Test seed and test case EVT-02 must not select an atcmodel.
3. No `src/app/ATC/**` component is involved in any of these 11 routes.
4. No ATC Firestore collections (`atc_alpha`, `atc_initiated`, etc.) are read or written by any component in this group.

---

## Risks / unknowns

1. **`updateStatus()` batch.commit() is commented out** (`event-participation-approve.ts:420–427`): The bulk approve via the "Mark as Approved" button in the Requested tab does NOT commit. Only `markAsAttended()` (ts:235) actually commits. EVT-03 must use `markAsAttended` path OR confirm with the operator which approval path is active. This is a **known bug** to surface explicitly in the test.
2. **No `data-testid` attributes on any element in this group**: All 11 components have zero `data-testid` attributes. Selectors must fall back to: `mat-select` (role + label), `mat-button`/button text, `mat-tab-label` text, `mat-checkbox`, CSS class + text. This significantly increases selector brittleness.
3. **ZXing QR camera cannot be used in headless Playwright**: `<zxing-scanner>` requires a real camera device. Tests must bypass the scanner by directly calling `component.onCodeResult(payload)` via Angular dev globals or `page.evaluate`. Requires the Angular component to be accessible via `ng.getComponent(element)` in dev mode, or inject via the DOM element. This is a test-infrastructure gap.
4. **`arena e-ticket log` full collection scan**: QR scanner loads ALL `arena e-ticket log` docs at init (qr-scanner.ts:97 — collectionData without filter). On a large test project this causes a full read. Confirm the cloud test project (`slabs-queue-e2e-exdcz`) has a bounded `arena e-ticket log` before running, or add a testrunid filter to the real component (out of scope for this plan).
5. **`event participation request` approval status visibility**: there are 4 tabs but only `markAsAttended()` is confirmed to commit. Tabs "Requested" and "Approved" show data but the write path for bulk approve is commented out (see risk #1). Individual row `onApprove()` is also commented out (ts:461–483). The only working write in the component is `markAsAttended()` and `markAsUnattendedAndCancelProduct()`.
6. **`initiateeventproduct` chunking**: INITIATE_CHUNK_SIZE=20, INITIATE_CHUNK_DELAY_MS=5000. For N=3 test participants this is one chunk. If the test project has more than 20 uninitiated participants for the same product, the chunk delay does not apply. But the 5s delay between chunks can make tests slow on larger sets.
7. **Cloud Functions not confirmed deployed to `slabs-queue-e2e-exdcz`**: None of the candidate CFs (`onEventApprovalProductMode`, `participantsproductinitiated`, etc.) are confirmed deployed to the e2e cloud project. `CF-SIDEEFFECT` test cases (EVT-11) should add `test.skip(!process.env.CF_EVENTS_DEPLOYED, ...)` guards, exactly as the queue suite does for `bulkReadyInvitation` (operator.spec.ts:615).
8. **`eventopportunitydashboard` route uses V2 component**: app.routes.ts:31 points to `event-opportunity-dashboard-v2` component. The v1 component (`event-opportunity-dashboard.component.ts`) folder was analyzed but is not the live route. EVT-15 and EVT-16 must target the V2 component. Selector research for v2 is outstanding.
9. **`arena_space` bulk-upload uses Excel file input**: `create-arena-space.ts:194` reads a file via `FileReader`. Playwright can inject a file via `page.locator('input[type=file]').setInputFiles(...)`. The manual entry flow (createArenaManually) is the simpler test path.
10. **`arena e-ticket log` uses `uniqueid` from QR payload as the Firestore docid**: if two scans use the same uniqueid, the second `setDoc` would silently overwrite the first (it's a setDoc, not addDoc). The duplicate guard (qr-scanner.ts:187) checks the in-memory `maplog` map, not a Firestore query, so it is only reliable within one component lifecycle. EVT-08 tests this correctly by asserting count remains 1.
11. **`VideoAsk embedding`**: `videoask-display` renders participant video-ask thumbnails but the actual VideoAsk embed is a third-party `<iframe>`. This iframe is not accessible in Playwright without real URLs. Tests in this group test the tagging/filtering behavior only, not the video playback.
