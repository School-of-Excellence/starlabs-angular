# Cluster: Shadow Opportunity

## Overview
"Shadow Opportunity" is a single-screen feature for participants who hold an **EIS (Emerging-In-Service / mentee) shadowing role**. It surfaces upcoming, not-yet-started, non-cancelled appointments whose appointment-type is linked (via the `Roles-To-EIS` → `AppointmentType-To-Roles` join chain) to a role the participant is assigned to AND that is flagged `experiencelevel == "Shadowing"`. For each such appointment the participant can **request to shadow** it (and later **cancel** that request), and see the live status of their request: Request → Pending → Accepted / Denied. It is a coaching-progression / professional-development surface: a learner asks to observe a real coach-client appointment they did not book themselves. Approval of the request happens elsewhere (admin/host side — out of this cluster); this screen only sends/cancels the request and reflects accepted/denied state.

## Screens

| Screen | file:line | Purpose |
|--------|-----------|---------|
| `ShadowRequest` (StatefulWidget) | `lib/Shadow Opportunity/shadowrequest.dart:11` | The whole cluster: lists shadow-eligible upcoming appointments for the logged-in EIS user and lets them request/cancel to shadow each, with status badge. |

Sub-UI within that single screen:
- App bar "Shadow Request" via `AppTheme().sliverAppBar` — `shadowrequest.dart:201`
- Empty / loading state ("Loading..." / "Appointments you can shadow will be listed here") — `shadowrequest.dart:204-215`
- Per-appointment card (`ListView.builder`) showing appointment-type name, host names, formatted start time, optional "Cancelled" tag, and the action/status widget — `shadowrequest.dart:216-425`

## Features

### Feature 1 — View shadow-eligible appointment opportunities
- **What the user does:** Opens the screen and sees a list of upcoming appointments they are allowed to shadow (appointment-type name, "Scheduled with {host names}", start datetime). If none, sees "Appointments you can shadow will be listed here". List updates live via a Firestore snapshot listener.
- **Nav/entry:** EIS Dashboard → `ListTile` titled **"Shadow Opportunities"** → `Navigator.push(MaterialPageRoute(... ShadowRequest()))` at `lib/BIG Dashboard/EIS Dashboard.dart:387-397` (entry import `EIS Dashboard.dart:9`, build `:393`). No named route / no bottom-nav tab / no deep link. `maintainState:false`.
- **Reads:**
  - `eisroles` where `experiencelevel == "Shadowing"` → collects `doc.reference.path` into `shadowRoles` — `shadowrequest.dart:46-55`
  - `Roles-To-EIS` where `assigned_eis` arrayContains `profile_data/{loggedinProfile}` (DocumentReference); keeps docs whose `assigned_role_ref.path` is in `shadowRoles` → `myShadowRoles` + `apptRoleRef` — `shadowrequest.dart:58-75`
  - `AppointmentType-To-Roles` where `additional_role` arrayContainsAny `apptRoleRef`; collects `assigned_appttype_ref.path` into `shadowAppointments`, and builds `mapAppointmentShadow[appttype.id] = shadowRole.path` for roles that are shadow roles — `shadowrequest.dart:83-105`
  - `appointments` **snapshot listener** where `appointment` whereIn `apptRef` (DocumentReferences built from `shadowAppointments` paths) AND `cancelled == false` AND `starttime >= DateTime.now()`. Per doc reads fields: `hosts` (list of profile refs), `bookedby` (profile ref), `appointment` (appttype ref), `starttime`, `endtime`, `requestedby`/`requestaccepted`/`requestdenied` (lists of profile refs). Excludes appointments where `bookedby.id == loggedinProfile` — `shadowrequest.dart:117-164`
  - Via `AppService().mapProfile()` → `profile_data` orderBy `name` (id→name map) — `AppServices.dart:913-932`, called `shadowrequest.dart:33-37`
  - Via `AppService().mapAppointment()` → `appointmenttype` orderBy `appointmenttype` (id→name map) — `AppServices.dart:935-947`, called `shadowrequest.dart:38-42`
  - Via `UserData().getUserData()` → SharedPreferences key `userpid` (fallback query `profile_data` where `email==` AND `user_ref == user_data/{uid}` limit 1) → `loggedinProfile` (`pid`) — `UserData.dart:29-56`, called `shadowrequest.dart:29-32`
- **Writes:** none for viewing.
- **Endpoints:** none (pure Firestore SDK; no CF/HTTP/Storage).
- **Config flags:** none.
- **Journey stage:** progression (coaching/EIS professional development).
- **e2e-testability:** **Yes (with heavy seeding).** Requires a logged-in profile with `userpid` set; an `eisroles` doc with `experiencelevel:"Shadowing"`; a `Roles-To-EIS` doc with `assigned_eis` containing that profile ref and `assigned_role_ref` pointing at the shadow role; an `AppointmentType-To-Roles` doc with `additional_role` containing that role and an `assigned_appttype_ref`; and an `appointments` doc of that appointment-type with `cancelled:false`, future `starttime`, `bookedby` = a *different* profile, plus `hosts`/`endtime`. Multi-collection join + reference-typed fields make seeding the heaviest part. No ATC.

### Feature 2 — Send a shadow request
- **What the user does:** Taps the **"Request"** action (send icon) on an appointment card where they have not yet requested/been accepted/denied. Adds themselves to that appointment's `requestedby`; badge flips to "Pending" via the live listener.
- **Nav/entry:** Per-card `InkWell` onTap `sendRequest(data)` — shown only when `!requestedby.contains(me) && !requestaccepted.contains(me) && !requestdenied.contains(me)` — `shadowrequest.dart:300-334`. Handler `sendRequest` — `shadowrequest.dart:167-178`.
- **Reads:** uses in-memory `doc["requestedby"]`, `doc["appointmentid"]`, `doc["shadowRole"]`, `mapAppointmentShadow`, and `loggedinProfile` (no new Firestore read).
- **Writes:** `appointments/{docid}.update({ "requestedby": [profile_data/{id} refs incl. me] })`; **also** sets `"shadowrole": firestore.doc(doc["shadowRole"])` (the eisroles role ref) when `mapAppointmentShadow[appointmentid] != null` — `shadowrequest.dart:167-178`. NOTE field name written is lowercase `shadowrole` (read key from map is `shadowRole`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** **Yes.** After seeding Feature 1's data, tap "Request" and assert the `appointments` doc's `requestedby` now contains the user's `profile_data` ref (and `shadowrole` set when applicable). No ATC.

### Feature 3 — Cancel a pending shadow request
- **What the user does:** Taps the **"Pending"** action (hourglass icon) on a card where they have already requested. Removes themselves from `requestedby`; badge reverts to "Request".
- **Nav/entry:** Per-card `InkWell` onTap `cancelRequest(data)` — shown when `requestedby.contains(me)` — `shadowrequest.dart:335-365`. Handler `cancelRequest` — `shadowrequest.dart:180-193`.
- **Reads:** in-memory `doc["requestedby"]`, `loggedinProfile` (no new Firestore read).
- **Writes:** `appointments/{docid}.update({ "requestedby": [refs minus me] })` — `shadowrequest.dart:190-192`. (Does NOT clear `shadowrole`.)
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** **Yes.** Seed an appointment with the user already in `requestedby`, tap "Pending", assert the ref is removed. No ATC.

### Feature 4 — See request status badge (Pending / Accepted / Denied)
- **What the user does:** Reads the live status of each request without acting: **Pending** (hourglass, in `requestedby`), **Accepted** (check-circle, in `requestaccepted`), **Denied** (cancel icon, in `requestdenied`). Accepted/Denied taps are no-ops (`onTap: () {}`).
- **Nav/entry:** Conditional widget tree per card — Accepted `shadowrequest.dart:366-394`, Denied `:395-418`, default `SizedBox` `:419`. Status driven by the `appointments` snapshot listener (Feature 1) re-reading `requestaccepted`/`requestdenied` (`shadowrequest.dart:146-156`).
- **Reads:** `appointments` doc fields `requestaccepted`, `requestdenied` (via the same live listener).
- **Writes:** none (acceptance/denial is performed by admin/host outside this cluster — not in these files).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** **Yes (display-only).** Seed `requestaccepted`/`requestdenied` arrays containing the user and assert the rendered badge; the accept/deny *action* is out of cluster. No ATC.

## Firestore collections

### Read
- `eisroles` — where `experiencelevel == "Shadowing"`; uses `doc.reference.path`. (`shadowrequest.dart:47-48`)
- `Roles-To-EIS` — where `assigned_eis` arrayContains DocumentReference `profile_data/{loggedinProfile}`; fields used: `assigned_role_ref` (DocumentReference, `.path`/`.id`). (`shadowrequest.dart:59-65`, `:70-72`)
- `AppointmentType-To-Roles` — where `additional_role` arrayContainsAny `apptRoleRef` (list of role DocumentReferences); fields used: `assigned_appttype_ref` (ref, `.path`/`.id`), `additional_role` (list of role refs). (`shadowrequest.dart:84-85`, `:91-102`)
- `appointments` — **snapshot listener**; where `appointment` whereIn list-of-refs AND `cancelled == false` AND `starttime >= now`; fields read: `appointment` (appttype ref), `hosts` (list of profile refs), `bookedby` (profile ref), `starttime`, `endtime`, `requestedby`, `requestaccepted`, `requestdenied` (lists of profile refs). (`shadowrequest.dart:117-157`)
- `profile_data` — orderBy `name`; id→`name` map (`AppService.mapProfile`, `AppServices.dart:919-922`). Also doc ref construction `profile_data/{pid}` used in queries/writes. Fallback lookup in `getUserData`: where `email ==` AND `user_ref == user_data/{uid}` limit 1 (`UserData.dart:41`).
- `appointmenttype` — orderBy `appointmenttype`; id→`appointmenttype` name map (`AppService.mapAppointment`, `AppServices.dart:937-945`).
- `user_data` — referenced as `user_data/{uid}` DocumentReference inside the `getUserData` fallback query only (`UserData.dart:41`).

### Written
- `appointments/{docid}` — `.update`:
  - `requestedby`: list of `profile_data` DocumentReferences (add self on send `shadowrequest.dart:174-177`; remove self on cancel `:190-192`).
  - `shadowrole`: DocumentReference `firestore.doc(doc["shadowRole"])` (the `eisroles` role path) — set on **send only**, when `mapAppointmentShadow[appointmentid] != null` (`shadowrequest.dart:175-176`).

(No collection in this cluster is created — only `.update` on existing `appointments` docs.)

## Endpoints & external services
- **None.** No Cloud Functions (`httpsCallable`/`cloudfunctions`), no HTTP/`Dio`, no Storage (`.ref(`), no FCM, no PostHog. The cluster is 100% Firestore SDK (`cloud_firestore`) + SharedPreferences (indirect via `UserData`).

## Config & feature flags
- **None.** No `remoteConfig`/`RemoteConfig` reads. No gating flags. Visibility is purely data-driven (must hold a `Shadowing` EIS role and there must be matching future appointments) and entry is purely via the EIS Dashboard tile.

## Dead / clone / Old code
- No `*Old.dart` clones; single live file.
- Commented-out / inert lines:
  - `import 'package:hexcolor/hexcolor.dart';` commented — `shadowrequest.dart:5`
  - `// alert("You don't have any shadow roles to continue.");` — the no-shadow-roles path silently sets `loading=false` with no user feedback — `shadowrequest.dart:78`
  - Several `print(...)` debug statements left in (`shadowRoles`, `myShadowRoles`, `shadowAppointments`) — `shadowrequest.dart:56, 76, 111`.

## Notes & open questions
- **Field-name mismatch (potential bug):** the card's "Cancelled" tag reads `data["cancelled"]` (`shadowrequest.dart:280, 287`) but the opportunity map built at `:132-157` never sets a `"cancelled"` key — and the query already filters `cancelled == false`, so the tag is effectively dead (always false). Flag, do not test as a feature.
- **Write key casing:** read map uses `"shadowRole"` (camel) while the Firestore write uses `"shadowrole"` (lower) — `:137` vs `:176`. Intentional? The downstream (admin) consumer must read `shadowrole`.
- **Approval side is out of cluster:** nothing here writes `requestaccepted`/`requestdenied`; this screen only reads them. The accept/deny flow lives elsewhere (admin/host dashboard) — needed to e2e the full Accepted/Denied lifecycle but is NOT part of this cluster.
- **Entry is admin-flavored:** the only reachable entry is `lib/BIG Dashboard/EIS Dashboard.dart` ("BIG Dashboard"). Confirm whether ordinary participants reach the EIS Dashboard or only EIS-role users/admins — affects which seeded test user can open the screen.
- **Self-exclusion:** appointments the user themselves booked (`bookedby.id == me`) are filtered out (`:131`) — a shadow user cannot shadow their own booking.
- **Join is reference-heavy:** four chained collections joined by DocumentReference equality (`.path`/`.id`). For e2e, the references must be real cross-collection refs, not strings.
