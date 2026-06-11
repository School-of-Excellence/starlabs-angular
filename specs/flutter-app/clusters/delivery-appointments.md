# Cluster: Scheduling / Appointments & Master Calendar

> Repo: `breakthroughs-flutter` (native Flutter participant app), branch `development`.
> Mapped files: `lib/Scheduling/Book Appointment.dart`, `lib/Scheduling/My Appointments.dart`, `lib/Scheduling/My Slots.dart`, `lib/mastercalendar.dart`.
> Supporting (shared, cited where load-bearing): `lib/Widgets/appointmentContainer.dart` (cancel action + detail sheet), `lib/Services/AppServices.dart` (map helpers + delivery-status writes).
> Static code+config pass only — no build/run/Firestore queries performed.

## Overview
This cluster is how a participant **books, views, and cancels delivery appointments** with their assigned specialists (EIS), and how they **see the master calendar of all upcoming opportunities** (live arena events, online events, hybrid workshops, B!G opportunities). Booking is the journey-delivery action: when a delivery item of `type == "appointment"` reaches `status == "ready"`, the participant picks an available date → an open slot (matching all required EIS roles for that appointment type) → confirms, which locks the slot, creates an `appointments` doc, and advances their delivery sequence to `ongoing`. `My Appointments` / `My Slots` list booked appointments split into Upcoming / History; cancellation is fired from the shared appointment card via an HTTP Cloud Function. The Master Calendar is a read-only monthly overview that aggregates four event sources into colored month cards and feeds the "Plan for this event" flow (EventPlanning, a separate cluster).

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| `BookAppointment` (StatefulWidget) | `Scheduling/Book Appointment.dart:13` | Book a delivery appointment: pick date from EIS availability, pick a merged-role slot, confirm → writes `appointments` + advances delivery. AppBar title "My Journey". |
| `MyAppointments` (StatefulWidget) | `Scheduling/My Appointments.dart:14` | Participant's own appointments (where `bookedby == me`), live stream, split Upcoming / History; each row is an `AppointmentContainer` with cancel enabled for future, un-cancelled, un-attended ones. |
| `MySlot` (StatefulWidget) | `Scheduling/My Slots.dart:11` | "My Delivery Appointment" — appointments where I am a **host** (where `hosts arrayContains me`); Upcoming / History; cancel disabled (`enableCancel: false`). Specialist/host-side view. |
| `Mastercalendar` (StatefulWidget) | `mastercalendar.dart:17` | "Calendar" tab/screen: arena-event carousel, event-type legend, up-to-6 month grid cards (`CalendarMonthCard`), upcoming workshops list, upcoming arena/event list, "Plan For Next N Months" CTA. Read-only aggregator. |
| `CalendarMonthCard` (StatelessWidget) | `mastercalendar.dart:1495` | One month mini-calendar; colors day cells by event color, taps open `showEventDetailsDialog`. |
| `showEventDetailsDialog` (fn) | `mastercalendar.dart:1338` | Modal listing that month's events (notes + date range), color-coded; close button only (no nav). |
| `AppointmentContainer` (shared widget) | `Widgets/appointmentContainer.dart:1` | Renders one appointment card (name, host(s), times, status badges); hosts the **cancel** bottom-sheet action and the read-only **detail** sheet (`appointmentDetail()`). Used by both `MyAppointments` and `MySlot`. |

## Features

### Book a delivery appointment (date → slot → confirm)
- **What the user does:** From a "ready" appointment delivery item, opens BookAppointment; the single appointment type is pre-selected (radio, read-only). Taps "Select Date" → date picker restricted to dates that have EIS availability. Picks a slot from the merged available-slots list (`HH:mm – HH:mm With <specialist names>`). Taps "Confirm Slot" → slot is locked, appointment created, success alert "Appointment Booked Successfully. Please check your email".
- **Nav/entry:** `Navigator.push` from `Journey Dashboard/participantDeliverySequence.dart:307` (when `sequence.type=="appointment"` & `sequence.status=="ready"`) and from `Main Screen/myjourney.dart:651` (when `nextdeliverystatus=="ready"`, button labeled "Book"). Requires params `deliverablepath`, `appointment{name,path}`, `productid`, (optional `productname`).
- **Reads:**
  - `appointmenttype` — all docs, `doc.id → appointmenttype` (`Book Appointment.dart:68`)
  - `profile_data` — `orderBy("name")`, `reference.path → name` (`Book Appointment.dart:73`)
  - `availability` — `where appointments arrayContains doc(selectedAppointment)`, `where starttime >= now` → distinct dates (`Book Appointment.dart:124`)
  - `AppointmentType-To-Roles` — `where assigned_appttype_ref == doc(selectedAppointment)` limit 1 → `required_role[]`, `additional_role[]` (`Book Appointment.dart:146`)
  - `customer_eismapping/{profileid}` — `eisroles[rolePath][] → assigned agent refs` (prior-assigned EIS) (`Book Appointment.dart:166`)
  - `Roles-To-EIS` — `where assigned_role_ref == doc(role)` → `assigned_eis[]` (fallback when no prior mapping; excludes self) (`Book Appointment.dart:221`)
  - `availability` (per EIS, on date select) — `where profileref == doc(eisProfile)` + `appointments arrayContains doc(appt)` + `starttime` between day-start/day-end; reads per-appointment slot array `data[apptId][a]` with fields `slotstart,slotend,booked,available,groupappointment,totalbooked,maxbooking` (`Book Appointment.dart:287`)
  - `availability/{slotDoc.id}` (re-read at confirm for race check) (`Book Appointment.dart:469`, `:518`)
- **Writes:**
  - `availability/{slotDoc.id}` — `update(...)`: marks overlapping slots `available=false`, sets chosen slot `booked=true`, increments `totalbooked` for group appointments (`Book Appointment.dart:560`)
  - `appointments` — `add(...)`: fields `starttime,endtime,appointment(ref),appointmentrole[refs],bookedby(profile_data ref),hosts[refs],slotdata,attended:false,cancelled:false,created:serverTimestamp,loggedid,hostRole{role→[refs]},productid` (`Book Appointment.dart:598`)
  - `<deliverablepath>` doc — `update fileref arrayUnion([apptRef]), status:"ongoing"` (`Book Appointment.dart:631`, in `updateJourney`)
  - via `appService.updateDeliveryStatus(deliverablepath, profileid, "ongoing")` → reads+writes `participantdeliverysequence/{profileid}` and `participantsproduct/{participantproductid}` to advance the sequence (`Book Appointment.dart:638` → `Services/AppServices.dart:998`)
- **Endpoints:** none (pure Firestore).
- **Config flags:** none. PostHog screen event `"Scheduling"` fired in `build()` (`Book Appointment.dart:697`).
- **Journey stage:** delivery.
- **e2e-testability:** Yes — core journey action, all Firestore. Heavy seed prerequisites: `appointmenttype`, `AppointmentType-To-Roles` (role refs), `Roles-To-EIS` and/or `customer_eismapping/{pid}`, `availability` docs (per-EIS, with the appointment-id keyed slot arrays + matching `profileref`/`appointments`), plus a `participantdeliverysequence`/`participantsproduct`/delivery-doc graph and a "ready" appointment delivery to enter from. Multi-role appointments require ≥1 overlapping slot per role across **distinct** EIS. Verify post-conditions on `appointments` (created) and slot `booked=true`. No ATC.

### View my appointments (Upcoming / History)
- **What the user does:** Sees their booked appointments, newest-first, split into "Upcoming" (starttime > now) and "History" (starttime < now); each card shows appointment name, host/specialist names, time range, product image, and cancelled/attended badges.
- **Nav/entry:** `Journey Dashboard/Journey Dashboard.dart:21` tab `{"name":"Appointments","screen":MyAppointments()}`; also pushed from `participantDeliverySequence.dart:317/419`, `myjourney.dart:658`, `productDeliverySequence.dart:183`, `Widgets/Themes.dart:651`.
- **Reads:**
  - `appointments` — live `snapshots()`, `where bookedby == profile_data/{profileid}`, `orderBy starttime desc` (`My Appointments.dart:37`)
  - `products` — `where id whereIn <productids>` (batched ≤10) → product image map (`My Appointments.dart:85`)
  - `profile_data` (via `AppService().mapProfile()`) → host/client names (`My Appointments.dart:101` → `AppServices.dart:919`)
  - `appointmenttype` (via `AppService().mapAppointment()`) → appointment names (`My Appointments.dart:106` → `AppServices.dart:935`)
- **Writes:** none directly (cancel is delegated to AppointmentContainer — see below).
- **Endpoints:** none in this screen.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed `appointments` docs with `bookedby==test pid`, plus `profile_data`/`appointmenttype`/`products`. Assert Upcoming vs History split and cancel-button enable rule (`attended==false && cancelled==false && starttime>now`).

### View my hosted slots (specialist/host side)
- **What the user does:** "My Delivery Appointment" — lists appointments where the logged-in profile is a **host**, Upcoming / History, read-only (no cancel; `enableCancel:false`).
- **Nav/entry:** `BIG Dashboard/EIS Dashboard.dart:292` returns `MySlot()` (specialist/EIS dashboard surface).
- **Reads:**
  - `appointments` — live `snapshots()`, `where hosts arrayContains profile_data/{profileid}`, `orderBy starttime desc` (`My Slots.dart:28`)
  - `profile_data` (`AppService().mapProfile()`, `My Slots.dart:65`)
  - `appointmenttype` (`AppService().mapAppointment()`, `My Slots.dart:70`)
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery (host/specialist-facing; participant only reaches this if they are also an EIS host).
- **e2e-testability:** Yes — seed `appointments` with `hosts arrayContains test pid`. Note this is a host-role view; a pure participant won't see it unless they host. No ATC.

### Cancel an appointment
- **What the user does:** On an eligible Upcoming appointment card (in `MyAppointments`), opens the card, taps cancel → confirmation dialog "Sure, Do you want to cancel this appointment?" → "Yes, Cancel" fires a request; spinner then dismiss.
- **Nav/entry:** From `AppointmentContainer` card surfaced by `MyAppointments` (cancel enabled only when `attended==false && cancelled==false && starttime>now`, `My Appointments.dart:242`). `MySlot` passes `enableCancel:false` so host view cannot cancel.
- **Reads:** none for the cancel call itself.
- **Writes:** no direct Firestore write from the client — performed server-side by the CF. (The `appointments.cancelled` flag the lists read is set by `requestApptCancel`.)
- **Endpoints:** HTTP GET to `requestApptCancel?appointmentid=<docid>`, project-switched (`Widgets/appointmentContainer.dart:281`):
  - prod `fir-sample-aae4a`: `https://us-central1-fir-sample-aae4a.cloudfunctions.net/requestApptCancel`
  - test `starlabs-test`: `https://us-central1-starlabs-test.cloudfunctions.net/requestApptCancel`
  - test `test-environment-841c3`: `https://us-central1-test-environment-841c3.cloudfunctions.net/requestApptCancel`
- **Config flags:** none (switch is on `Firebase.app().options.projectId`).
- **Journey stage:** delivery.
- **e2e-testability:** Yes, **conditionally** — UI + confirmation are testable; the actual cancel requires the deployed `requestApptCancel` CF in the **test** project. If only `fir-sample-aae4a` (prod) URL is reachable, the prod-endpoint firewall applies — must run against `starlabs-test`/`test-environment-841c3`. Assert UI flow up to request; verify `cancelled=true` only if the test-project CF is deployed. No ATC.

### View appointment detail (read-only sheet)
- **What the user does:** Taps an appointment card to open a detail bottom-sheet (`appointmentDetail()`) showing name, host(s), schedule, and status; includes the "* This appointment has been cancelled" note when cancelled.
- **Nav/entry:** tap any `AppointmentContainer` (`Widgets/appointmentContainer.dart:323`).
- **Reads:** none beyond the data already passed into the card (no extra Firestore query).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — pure UI off seeded `appointments`.

### Master Calendar — month overview grid
- **What the user does:** Opens the "Calendar" screen; greeted with active-journey name; sees an event-type color legend, then up to 6 month cards (current month onward) with day cells colored by event; taps a month card or a colored day → modal lists that month's events (notes + date range).
- **Nav/entry:** Deep link `calendar` (`home.dart:188`, length-1 → `Mastercalendar()`; length-3 → `EventPlanning`); pushed from `home.dart:1621`, `main.dart:354`, `notificationlog.dart:394`, `Services/AppServices.dart:3574`, `Widgets/Themes.dart:585/1615`, `BIG Dashboard/EIS Dashboard.dart:587`, `Main Screen/myProfileDashboard.dart:772`, `Main Screen/homeContent.dart:6999/7107`. (Reached as a home/profile surface and deep link; not its own bottom-nav tab in these files.)
- **Reads** (all `get()` once on init, gated `>= startDate = 1st of current month`):
  - `event collection` — `where end_date >= startDate`; fields `venue,end_date,name,image,docid`; upcoming if `now < end_date` (`mastercalendar.dart:162`)
  - `queue generation` — `where queueenddate >= startDate`; skips `delete==true`; `venue` map only (not rendered as cards) (`mastercalendar.dart:173`)
  - `arena events` — `where enddate >= startDate`; fields `eventref,productref,startdate,enddate,displayname/eventname,image,venue,type,delete,docid`; only `type=="event"` & parent `event collection` go to upcoming; **every** non-deleted arena event becomes a calendar `Appointment` (`mastercalendar.dart:187`)
  - `workshopconfiguration` — `where active == true`; `detailpage.{title,workshopStartDate,workshopEndDate}` → workshop cards + calendar appointments (`mastercalendar.dart:236`)
  - `products` (via `AppService().mapProduct()` in init) → product/`atcmodel`/`product` name for arena coloring & notes (`mastercalendar.dart:60` → `AppServices.dart:950`)
- **Writes:** none. (Calendar is read-only; the only write-ish code — `event participation request` delete — is **commented out**, `mastercalendar.dart:149`.)
- **Endpoints:** none. Uses `cached_network_image` for event images (Storage/CDN URLs stored in docs, not constructed here).
- **Config flags:** none. Event color derives from product `atcmodel` (`"big"/"b!g"` → purple) and venue `"online"` (`mastercalendar.dart:200`, `getATCModelColor` `:279`) — display-only; `atcmodel`/`atc taxonomy` here is **reference data, not the ATC pipeline** → not ATC-OFF-LIMITS.
- **Journey stage:** content / delivery (opportunity discovery).
- **e2e-testability:** Yes — seed `event collection`, `arena events`, `workshopconfiguration`, `products`; assert month cards render and the details modal lists the seeded events. `queue generation` read is non-fatal/non-rendered. No ATC pipeline touched.

### Master Calendar — arena-event carousel + "Plan for this Event"
- **What the user does:** Swipes an auto-playing carousel of upcoming arena events (image, "Exclusive Event" badge, title, date range, venue); taps "Plan for this Event" → opens `EventPlanning(eventid=docid, eventtype="arenaevent", ...)`.
- **Nav/entry:** carousel on `Mastercalendar` (`mastercalendar.dart:546`); CTA at `:724`.
- **Reads:** uses already-loaded `upcomingArenaEvents` + `eventMap` (from `arena events` / `event collection` above); no extra query.
- **Writes:** none here (planning writes happen in the EventPlanning cluster).
- **Endpoints:** none (image via `cached_network_image`).
- **Config flags:** none.
- **Journey stage:** content (opportunity discovery → planning hand-off).
- **e2e-testability:** Yes for the carousel render + navigation into EventPlanning; the actual plan write belongs to the EventPlanning cluster. No ATC.

### Master Calendar — upcoming workshops list
- **What the user does:** Horizontally scrolls "Upcoming Workshops" cards (title, "Online", date range + day count); taps → `EventPlanning(eventid=workshop.docid, eventtype="workshop", ...)`.
- **Nav/entry:** `mastercalendar.dart:1043` (cards), built from `workshopconfiguration` active docs.
- **Reads:** `workshopconfiguration` (loaded above).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed `workshopconfiguration active==true`; assert cards + nav.

### Master Calendar — upcoming arena/event collection list
- **What the user does:** Vertical list "Upcoming Arena Events" (name, description, venue, date range, colored by `atcmodel`); taps → `EventPlanning(eventid=event.docid, eventtype="event", ...)`.
- **Nav/entry:** `mastercalendar.dart:1182`, built from `upcomingEvents` (from `event collection`).
- **Reads:** `event collection` (loaded above); `atcmodel` field used only for color (`getATCModelColor`).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed `event collection end_date>=now`; assert list + nav. No ATC pipeline.

### Master Calendar — "Plan For Next N Months" bottom bar CTA
- **What the user does:** Sticky bottom bar ("You can plan whether you are coming…"); button "Plan For Next N Events/Months" → `EventPlanning(eventid=null, eventtype=null, arenaEvents/upcomingEvents/workshopevents…)` (full multi-event planning entry). Bar hides when scrolled to bottom.
- **Nav/entry:** `mastercalendar.dart:339` (`_buildBottomBar`).
- **Reads:** uses already-loaded lists; `totalMonthEvents` computed from arena event min/max dates (`mastercalendar.dart:212`).
- **Writes:** none here.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes for nav into EventPlanning. Note `totalMonthEvents` uses `.reduce(...)` over `upcomingArenaEvents` — **crashes if `upcomingArenaEvents` is empty** (no isEmpty guard before reduce, `mastercalendar.dart:212`); seed ≥1 arena event to avoid the throw (caught by surrounding try, so calendar still renders but bottom-bar month count may be wrong). See open questions.

## Firestore collections

### Read
- `appointments` — `My Appointments.dart:38` (`where bookedby == profile_data/{pid}`, `orderBy starttime desc`, live), `My Slots.dart:29` (`where hosts arrayContains profile_data/{pid}`, live). Key fields used: `starttime,endtime,bookedby(ref),hosts[refs],appointment(ref),created,cancelled,attended,productid`.
- `appointmenttype` — `Book Appointment.dart:68`; `AppServices.dart:938` (`mapAppointment`, `orderBy appointmenttype`). Field `appointmenttype`.
- `profile_data` — `Book Appointment.dart:73` (`orderBy name`); `AppServices.dart:920` (`mapProfile`, `orderBy name`). Field `name` (+ full doc).
- `availability` — `Book Appointment.dart:125` (`appointments arrayContains <apptRef>`, `starttime>=now`), `:288` (`profileref==<eisRef>` + `appointments arrayContains` + `starttime` between day bounds), `:469`/`:518` (`doc(id).get()`). Fields: `starttime`, `profileref`, `appointments[refs]`, and per-appointment-id arrays of `{slotstart,slotend,booked,available,groupappointment,totalbooked,maxbooking}`.
- `AppointmentType-To-Roles` — `Book Appointment.dart:147` (`assigned_appttype_ref == <apptRef>`, limit 1). Fields `required_role[]`, `additional_role[]`.
- `customer_eismapping/{profileid}` — `Book Appointment.dart:166` (doc get). Field `eisroles{rolePath → [agent refs]}`.
- `Roles-To-EIS` — `Book Appointment.dart:222` (`assigned_role_ref == <roleRef>`). Field `assigned_eis[refs]`.
- `products` — `My Appointments.dart:86` (`where id whereIn <ids>` batched); `AppServices.dart:952` (`mapProduct`, all). Fields `id,image,product,atcmodel`.
- `event collection` — `mastercalendar.dart:162` (`end_date >= startDate`). Fields `end_date,venue,name,image`.
- `queue generation` — `mastercalendar.dart:173` (`queueenddate >= startDate`, skip `delete==true`). Field `venue` (only mapped, not rendered).
- `arena events` — `mastercalendar.dart:187` (`enddate >= startDate`, skip `delete==true`). Fields `eventref(ref),productref(ref),startdate,enddate,displayname,eventname,image,venue,type,title`.
- `workshopconfiguration` — `mastercalendar.dart:236` (`active == true`). Field `detailpage{title,workshopStartDate,workshopEndDate}`.
- `participantdeliverysequence/{profileid}` — read in `updateDeliveryStatus` (`AppServices.dart:1004`).
- `participantsproduct/{participantproductid}` — read in `updateDeliveryStatus` (`AppServices.dart:1020`).

### Written
- `appointments` — `add(...)` on booking (`Book Appointment.dart:599`). Full field set listed in the Book feature above.
- `availability/{slotDoc.id}` — `update(...)` to lock slot / set `available=false`/`booked=true`/`totalbooked++` (`Book Appointment.dart:560`).
- `<deliverablepath>` (delivery doc, dynamic collection — e.g. a participant delivery item) — `update fileref arrayUnion, status:"ongoing"` (`Book Appointment.dart:631`).
- `participantdeliverysequence/{profileid}` — `update(...)` to set delivery status / advance sequence (`AppServices.dart`, within `updateDeliveryStatus`).
- `participantsproduct/{participantproductid}` — `update(...)` product status/statusdate as sequence advances (`AppServices.dart`, within `updateDeliveryStatus`).
- `appointments.cancelled` (server-side) — NOT a client write; set by the `requestApptCancel` CF (see endpoints). Client only fires the HTTP GET.

## Endpoints & external services
- **Cloud Function (HTTP GET):** `requestApptCancel?appointmentid=<docid>` — appointment cancellation. Project-switched URLs (`Widgets/appointmentContainer.dart:289-295`): prod `us-central1-fir-sample-aae4a`, test `us-central1-starlabs-test`, test `us-central1-test-environment-841c3`. Plain `HttpClient().getUrl` (no Dio, no httpsCallable).
- **PostHog:** screen event `"Scheduling"` on BookAppointment build (`Book Appointment.dart:697`). (No PostHog on the other three screens in this cluster.)
- **Image CDN/Storage:** `cached_network_image` renders event/product images from URLs stored in docs (`mastercalendar.dart:592`, arena/product images). No Storage `.ref()`/`getDownloadURL` constructed in-cluster.
- **Syncfusion calendar:** `syncfusion_flutter_calendar` provides `Appointment`/`CalendarDataSource` (`MeetingDataSource`) used as the in-memory event model (`mastercalendar.dart:12,1645`). No network.
- No RemoteConfig, no FirebaseMessaging, no SharedPreferences/localstorage references in this cluster.

## Config & feature flags
- **None.** No `remoteConfig`/feature-flag gating anywhere in the four files.
- Environment selection for the cancel CF is by `Firebase.app().options.projectId` (the 3 Firebase projects: `fir-sample-aae4a` prod, `starlabs-test` test, `test-environment-841c3` test) — `Widgets/appointmentContainer.dart:287`.
- Event coloring uses product `atcmodel` value + the hard-coded `eventType` legend list (`mastercalendar.dart:45-50`) and `getATCModelColor` (`:279`). This is presentation only; `atcmodel`/taxonomy here is reference config, **not** the ATC transcription pipeline.

## Dead / clone / Old code
- No `*Old.dart` / clone files in `lib/Scheduling/` (only the 3 live screens).
- `mastercalendar.dart:149` — commented-out `event participation request` query+batch-delete (dead).
- `mastercalendar.dart:257-268` — commented-out `appointments` read into the calendar (the calendar deliberately does NOT plot personal appointments today).
- `Book Appointment.dart:648-692` — large commented-out alternate `updateJourney` body (old `participantdeliverysequence`/`participantJourneySequence` paths); live path is the 3-line `update` + `appService.updateDeliveryStatus`.
- `Book Appointment.dart:722-738` — commented-out alternate SliverAppBar ("Book Appointment").
- `My Appointments.dart:125-166` — commented-out alternate SliverAppBar (journey/subscription header).
- `mastercalendar.dart:847-880, 1284-1320` — commented-out "Live events…" blurb and "and Many More Events" button.
- Visible typos in live UI strings (not dead, but notable): `"Book Appointmen"` (`Book Appointment.dart:745`), `"Book Appointmen"` again the productname is commented out so the literal is shown. The vertical list header in master calendar says "Upcoming Arena Events" but is built from `event collection`/`upcomingEvents` (`mastercalendar.dart:1165`).

## Notes & open questions
- **No ATC pipeline in this cluster.** `atcmodel` appears only as a color key for events/products. `atcTouch=false` for every feature. (Confirmed: no `atc_alpha`/`atc_initiated`/`uploadATC`/`to_transcript` etc.)
- **Booking is a heavy, multi-collection transaction** done client-side without a Firestore transaction — slot lock (`availability.update`) and `appointments.add` are separate awaited writes with a re-read race check (`Book Appointment.dart:469-624`). e2e must seed the full availability+roles graph; concurrent-booking correctness is a real risk worth a targeted test.
- **Multi-role slot merge** only supports 1, 2, or 3 required roles (`mergeEISslots`, `Book Appointment.dart:349-446`); 4+ roles yield no merged slots. Group appointments (`groupappointment==true`, `totalbooked<maxbooking`) are bookable without `booked==false`.
- **`updateJourney` has no `await` on the deliverable-doc update before the success alert in all paths** — and the participant-sequence advance depends on `participantdeliverysequence/{pid}` and `participantsproduct/*` existing; if absent, status advance silently no-ops.
- **`getDataFromFireStore` `reduce` on empty list** (`mastercalendar.dart:212-213`) throws if `upcomingArenaEvents` is empty; caught by the outer try (calendar still renders) but `totalMonthEvents` stays 0 and the bottom-bar label degrades. Seed ≥1 future arena event for clean calendar e2e.
- **Cancel CF dependency:** to e2e the cancel happy-path end-to-end, `requestApptCancel` must be deployed in the chosen **test** project; otherwise only the UI/confirmation is assertable and the prod URL must be firewalled.
- **`MySlot` is host/specialist-facing** (reached from EIS Dashboard) — a pure participant fixture won't surface it unless that participant also hosts appointments. Decide whether it's in the participant e2e scope.
- **`queue generation` read** is loaded but its venue map is not rendered as calendar cards (only arena/workshop/event-collection produce `Appointment`s) — likely vestigial in the calendar context.
