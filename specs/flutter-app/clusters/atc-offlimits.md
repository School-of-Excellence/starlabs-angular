# Cluster: ATC client features (OFF-LIMITS — map existence only, e2eTestable=false)

> **CI/CD STATUS: OFF-LIMITS.** Every feature in this cluster touches ATC Firestore data
> (`atc_alpha`, `to_transcript`, `upload atc`, ATC procedure/correction subcollections). Per
> `CLAUDE.md` Critical Constraints, ATC data is OFF-LIMITS for all automated testing and seeding.
> This cluster is mapped for **existence only**. Do NOT seed, write, run, or e2e-test any of it.
> `e2eTestable=false` and `atcTouch=true` for every feature below.

## Overview

ATC ("Activities To Complete" / prescription-style action lists) is the participant-facing
read/track surface for a coaching prescription model: a participant is *prescribed* an ATC by
authors, the ATC contains adjustments, each adjustment contains procedures, and the participant
tracks/completes procedures (generating a one-time share code so a co-participant can mark a
procedure done). Two of the five files are **explicitly marked `// Depreciated`** at the top
(`atctimeline.dart`, `clientATC.dart`) yet are still wired into live navigation. The other two
upload screens (`uploadATC.dart`, `atcUploadPending.dart`) are **staff/admin-gated** (roles
`ah`/`floor`/`admin`) ATC image-intake tools, not participant features. `addatclist.dart` is a
fully **orphaned** QR-scan-then-upload screen with no references anywhere in `lib/` and a stubbed
`scan()` — dead code.

## Screens

| Screen | file:line | Purpose |
|--------|-----------|---------|
| `AtcTimeLine` ("My ATC") | `lib/atctimeline.dart:22` (build `:243`) | Participant's own ATC list timeline; expand each ATC → adjustments → procedures; complete-procedure code generation. Marked `// Depreciated` (`:1`). Live in nav. |
| `ClientATC` (multi-mode ATC timeline) | `lib/clientATC.dart:14` (build `:67`) | Read-only ATC timeline for any profile in 4 modes (`client`/`prescriber`/`fullchangework`/`selectivechangework`). Marked `// Depreciated` (`:1`). Reached from BIG/EIS dashboards & profile summary. |
| `UploadATC` (staff ATC image intake) | `lib/uploadATC.dart:10` (build `:137`) | Staff captures/picks ATC photos, picks specialist(s) + client + ATC date, writes to `upload atc/{clientid}`. Live but **role-gated**. |
| `ATCuploadPending` (staff upload queue) | `lib/atcUploadPending.dart:7` (build `:88`) | Staff worklist: per-client ATC-image upload progress (`atccount/3`) for the most recent queue's tokens; entry to `UploadATC`. Live but **role-gated**. |
| `AddAtcList` ("QR Scanner") | `lib/addatclist.dart:11` (build `:116`) | Orphaned: scan QR → upload prescribed-ATC-list image → write `to_transcript`. **DEAD** (no refs; `scan()` empty `:57`). |

## Features

### View my ATC timeline (My ATC)
- **What the user does:** Opens "My ATC", sees their prescribed ATCs (newest first), expands an ATC tile to reveal authors, adjustment/procedure counts, each adjustment's procedures with status, recommended-to, and assigned-to people.
- **Nav/entry:** Journey Dashboard tab "My ATC" (`lib/Journey Dashboard/Journey Dashboard.dart:22`); ATC home button "ATC" → `AtcTimeLine()` (`lib/ActionsToTake.dart:681`). AppBar "My ATC" (`lib/atctimeline.dart:285`).
- **Reads:** `atc_alpha` where `isdelete==false` & `profileid==userPreference["pid"]`, orderBy `prescription_date` desc (`:298-302`); per-ATC subcollection `corrections` where `isdelete==false` (`:518-520`); per-adjustment subcollection `procedures` where `isdelete==false` (`:572-576`); `profile_data` orderBy `name` (name map, `:92`); doc `content_urls/welcome_atc` (intro video url, `:68`); `procedureData["recommended_to"]` doc ref snapshot (`:764`). Also `AppService().mapProcedure()` (`:76`) and `UserData().getUserData()` (`:81`) for the pid.
- **Writes:** none on view (read-only timeline).
- **Endpoints:** Firebase Storage / network video via `VideoPlayerController.network(content_urls/welcome_atc.url)` (`:70`). No CF/HTTP.
- **Config flags:** none (no RemoteConfig).
- **Journey stage:** delivery / progression (tracking prescribed actions).
- **e2e-testability:** No — ATC OFF-LIMITS, CI-excluded (reads `atc_alpha` + ATC subcollections). File marked `// Depreciated`. `atcTouch=true`.

### Complete a procedure via shared code (generate token)
- **What the user does:** On a "YET TO COMPLETE" procedure, taps the red button → app generates/looks up a 6-digit code and shows a dialog telling the user to share the code with a co-participant to update the procedure.
- **Nav/entry:** Button inside an expanded ATC procedure card (`lib/atctimeline.dart:706-735`, `onPressed`→`generateCode(procedureData.reference)` `:730`).
- **Reads:** `procedureCode` where `procedureref==procedure` (`:117-119`); `procedurecode` where `code==generate` (uniqueness loop, `:126-130`).
- **Writes:** NONE currently — the `procedurecode.add({...})` write is **commented out** (`:135-141`), so this path only reads/derives a code; the persisted-code branch returns an existing code (`:146`).
- **Endpoints:** none (Firestore only).
- **Config flags:** none.
- **Journey stage:** progression (peer-verified completion).
- **e2e-testability:** No — ATC OFF-LIMITS (procedure under `atc_alpha`); also write is disabled. `atcTouch=true`.

### Add / edit a note on an adjustment (My ATC)
- **What the user does:** (Defined helper `addnote()` — opens a dialog to type/update a note; on update, writes the note and timestamps it, archiving the prior note into a revision subcollection.)
- **Nav/entry:** `addnote()` is **declared** (`lib/atctimeline.dart:161`) but **not invoked** from any widget in the build tree (no caller in-file) — effectively dormant UI.
- **Reads:** reads the adjustment doc's existing `note`/`note added` (`:199-200`).
- **Writes:** sets `note`, `note added` (serverTimestamp) on the adjustment doc (merge) (`:186-189`, `:204-207`); adds `{note, updated}` to subcollection `note_revision` (`:197-201`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression / support (coaching notes).
- **e2e-testability:** No — ATC OFF-LIMITS (writes to ATC adjustment subdoc); also currently unreachable. `atcTouch=true`.

### View any profile's ATC timeline — 4 modes (ClientATC)
- **What the user does:** Views a read-only ATC timeline for a chosen profile, in one of four modes: `client` (that person's prescribed ATCs), `prescriber` (ATCs they authored), `fullchangework` / `selectivechangework` (ATCs where they are the implementation agent). Expands ATC → adjustments → procedures (status shown; complete button is inert here, `onPressed: () {}` `:370`).
- **Nav/entry:** Pushed from EIS Dashboard (`lib/BIG Dashboard/EIS Dashboard.dart:495,541`), ATC accelerator (`lib/BIG Dashboard/atc accelerator.dart:55,85,111,127`), EIS screen (`lib/eisscreen.dart:434,521,561`), Profile Summary (`lib/profileSummary.dart:504`). AppBar title varies by `atcType` (`lib/clientATC.dart:74-82`). Takes `profileid` + `atcType` (+ optional `hideAppbar`).
- **Reads (mode-dependent, all `atc_alpha` where `isdelete==false`):** `client`: `profileid==personPID` (`:86`); `prescriber`: `author` arrayContains `profile_data/{pid}` (`:87`); `fullchangework`: `implementationagent==[personPID]` (`:89`); `selectivechangework`: `implementationagent` arrayContains `personPID` (`:91`); fallback `dummy=="dummy"` (empty, `:92`); all orderBy `prescription_date` desc. Subcollection `corrections` — CW modes filter `implementationagent` arrayContains `personPID` (`:263`) else `isdelete==false` (`:264`). Subcollection `procedures` — CW modes filter `assigned_to` arrayContains `profile_data/{pid}` (`:301`) else `isdelete==false` (`:302`); procedure `name` doc-ref snapshot (`:331`), `recommended_to` doc-ref snapshot (`:381`). `profile_data` orderBy `name` for the name map (`:50`).
- **Writes:** none (read-only).
- **Endpoints:** none (Firestore only).
- **Config flags:** none.
- **Journey stage:** delivery / progression (coach/agent review of ATCs).
- **e2e-testability:** No — ATC OFF-LIMITS (reads `atc_alpha` + subcollections across modes). File marked `// Depreciated`. `atcTouch=true`.

### Upload ATC images for a client (staff intake)
- **What the user does:** (Staff role) takes ATC photos (camera) or multi-picks from gallery, removes any image, selects specialist(s) (add/remove rows), selects a client, sets an ATC date, then uploads — images go to Storage and an `atcimages` entry is appended to that client's `upload atc` doc.
- **Nav/entry:** "Upload ATC Images" button in `ATCuploadPending` (`lib/atcUploadPending.dart:160-167` → `UploadATC()`). `ATCuploadPending` itself is reached from Profile (`lib/profile.dart:838`) gated by `userRoles["ah"] || userRoles["floor"] || userRoles["admin"]` (`lib/profile.dart:798-800`). AppBar "Upload ATC" (`lib/uploadATC.dart:139`). **NOTE:** the specialist/client `DropdownSearch` widgets are **commented out** (`:253-293`, `:329-362`), so `selectedSpecialist` stays `[null]` and `selectedClient` stays `null` in the live build — the upload form is effectively broken/incomplete as shipped.
- **Reads:** `users_roles` orderBy `name` (`lib/uploadATC.dart:32`); flags `eis`/`changeagent` decide who is a "specialist" (`:38`); `upload atc/{selectedClient}` existence check before write (`:101-105`).
- **Writes:** Storage `ref().child("Upload ATC {image.name} {modified}")` putFile (`:85-88`). Firestore `upload atc/{selectedClient}`: if exists → `update` `atcimages` arrayUnion(`{imagelist, atcdate, specialist, uploadtime}`) + `modified` serverTimestamp (`:107-110`); else `set` `{clientid, created(serverTimestamp), atcimages:[imagedata]}` (`:112-116`).
- **Endpoints:** Firebase Storage. No CF/HTTP.
- **Config flags:** none (RemoteConfig); behaviour gated by Firestore role flags `ah`/`floor`/`admin` (entry) and `eis`/`changeagent` (specialist filter).
- **Journey stage:** delivery / infra (ATC content intake — staff side).
- **e2e-testability:** No — ATC OFF-LIMITS (writes `upload atc` + ATC images to Storage). Staff-gated, not a participant journey. `atcTouch=true`.

### ATC upload-pending worklist (staff)
- **What the user does:** (Staff role) sees, for the most recent queue, each enrolled participant and how many ATC images have been uploaded for them out of 3 (`{name} - {count}/3`), sorted ascending by count; can search clients by name; can jump to the upload screen.
- **Nav/entry:** Profile button "ATC Upload Pending" (`lib/profile.dart:838`), gated by `userRoles["ah"]||["floor"]||["admin"]` (`:798-800`). AppBar "ATC Upload Pending" (`lib/atcUploadPending.dart:93`).
- **Reads:** `queue generation` orderBy `queueenddate` desc limit 1 (most-recent queue, `:30-35`); `upload atc` (all docs; count per `clientid`, `:39`,`:51-58`); `queue_token` where `queueref==recentqueue.reference` (enrolled profiles, `:41-44`); profile-name map via `AppService().mapProfile()` (`:22-23`).
- **Writes:** none (read-only worklist).
- **Endpoints:** none (Firestore only).
- **Config flags:** none (RemoteConfig); entry gated by Firestore role flags.
- **Journey stage:** delivery / infra (staff ATC-intake tracking).
- **e2e-testability:** No — ATC OFF-LIMITS (reads `upload atc`; ATC-intake worklist). Staff-gated. `atcTouch=true`.

### Scan QR + upload prescribed ATC list image (DEAD)
- **What the user does:** (Intended) scan a QR code carrying prescriber/author/status metadata, upload a photo of the prescribed ATC list, pick a prescription date+time, submit → creates a `to_transcript` request. In practice `scan()` is empty (`lib/addatclist.dart:57`) so `barcodedata` is never populated and the upload UI never shows.
- **Nav/entry:** **NONE** — `AddAtcList` has zero references in `lib/` (orphaned). AppBar "QR Scanner" (`:119`).
- **Reads:** none.
- **Writes (intended):** Storage `ref().child(name).child("atc list").child(docID)` putFile (`:90`); Firestore `to_transcript/{docID}`: `{prescriber_type: doc(prescribed_by), author:[doc refs], prescription_date, prescription_image:url, uploader: user_data/{uid}, status}` (`:94-101`).
- **Endpoints:** Firebase Storage. No CF/HTTP.
- **Config flags:** none.
- **Journey stage:** delivery / infra (ATC intake — legacy).
- **e2e-testability:** No — ATC OFF-LIMITS (writes `to_transcript`). Also DEAD/orphaned with stub scanner. `atcTouch=true`.

## Firestore collections

### Read
- `atc_alpha` — where `isdelete==false`; filters: `profileid==pid` (`atctimeline.dart:298`, `clientATC.dart:86`), `author` arrayContains `profile_data/{pid}` (`clientATC.dart:87`), `implementationagent==[pid]` / arrayContains `pid` (`clientATC.dart:89,91`); orderBy `prescription_date` desc. **OFF-LIMITS.**
- `atc_alpha/{id}/corrections` (adjustments) — where `isdelete==false` (`atctimeline.dart:520`, `clientATC.dart:264`) or `implementationagent` arrayContains `pid` (`clientATC.dart:263`). **OFF-LIMITS.**
- `atc_alpha/{id}/corrections/{id}/procedures` — where `isdelete==false` (`atctimeline.dart:574`, `clientATC.dart:302`) or `assigned_to` arrayContains `profile_data/{pid}` (`clientATC.dart:301`); also `isdelete==false & status=="completed"` in `totalProcedureCompleted` helper (`atctimeline.dart:232-234`, unused by build). **OFF-LIMITS.**
- `procedureCode` — where `procedureref==procedure` (`atctimeline.dart:117-119`).
- `procedurecode` — where `code==generate` (uniqueness, `atctimeline.dart:126-130`).
- `profile_data` — orderBy `name`; key `name` (name map; `atctimeline.dart:92`, `clientATC.dart:50`).
- `content_urls` (doc `welcome_atc`) — key `url` (intro video; `atctimeline.dart:68`).
- `users_roles` — orderBy `name`; keys `name`, `profile_ref`, `eis`, `changeagent` (`uploadATC.dart:32-38`).
- `upload atc` — all docs, key `clientid` (count per client; `atcUploadPending.dart:39`) and existence check by doc id (`uploadATC.dart:101-105`). **ATC-intake, OFF-LIMITS.**
- `queue generation` — orderBy `queueenddate` desc limit 1; key `queueenddate` (`atcUploadPending.dart:30-35`).
- `queue_token` — where `queueref==recentqueue.reference`; key `profile_id` (`atcUploadPending.dart:41-44`).

### Written
- `to_transcript/{autoId}` — `{prescriber_type, author[], prescription_date, prescription_image, uploader, status}` (`addatclist.dart:94-101`). **OFF-LIMITS; DEAD path.**
- `upload atc/{clientid}` — create `{clientid, created, atcimages[]}` or update `atcimages` arrayUnion + `modified` (`uploadATC.dart:107-116`). **ATC-intake, OFF-LIMITS; staff-only.**
- `atc_alpha/{id}/corrections/{id}` — `note`, `note added` (merge) (`atctimeline.dart:186-189,204-207`). **OFF-LIMITS; dormant (addnote uncalled).**
- `atc_alpha/{id}/corrections/{id}/note_revision/{autoId}` — `{note, updated}` (`atctimeline.dart:197-201`). **OFF-LIMITS; dormant.**
- `procedurecode` — `add({procedureref, created, used, generatedby, procedurename})` is **commented out** (`atctimeline.dart:135-141`) → no live write.

## Endpoints & external services
- **Firebase Storage (no CF):**
  - `uploadATC.dart:85-88` — `storage.ref().child("Upload ATC {name} {modified}").putFile(...)` then `getDownloadURL()`.
  - `addatclist.dart:90-92` — `storage.ref().child(name).child("atc list").child(docID).putFile(...)` then `getDownloadURL()` (DEAD).
- **Network video:** `atctimeline.dart:70` — `VideoPlayerController.network(<content_urls/welcome_atc.url>)`.
- **No** `httpsCallable` / `cloudfunctions.net` / `Dio` / raw `http` calls in any of the five files. No prod-CF-URL firewall concern for this cluster.

## Config & feature flags
- **No RemoteConfig / `remoteConfig` references** in any of the five files.
- **No FirebaseMessaging / PostHog / SharedPreferences / localStorage** in these files. (`atctimeline.dart` instantiates `FlutterSecureStorage()` at `:54` but never reads/writes it — dead field.)
- Behavioural gating is via **Firestore role flags**, not feature flags:
  - `ATCuploadPending` / `UploadATC` entry gated by `userRoles["ah"] || userRoles["floor"] || userRoles["admin"]` (`profile.dart:798-800`).
  - "Specialist" filter in `UploadATC` gated by `users_roles.eis || users_roles.changeagent` (`uploadATC.dart:38`).
- **3 Firebase projects:** not referenced in these files (no projectId strings); all use the default `FirebaseFirestore.instance` / `FirebaseStorage.instance`.

## Dead / clone / Old code
- **`lib/addatclist.dart` (`AddAtcList`)** — fully orphaned: zero references in `lib/`; `scan()` is an empty stub (`:57`) so the upload UI is never reached. Entire file is DEAD.
- **`lib/atctimeline.dart`** — header `// Depreciated` (`:1`), yet still wired into live nav (Journey Dashboard `:22`, ActionsToTake `:681`). `addnote()` declared but never called; `totalProcedureCompleted()` declared but never called; the `procedurecode.add(...)` write is commented out (`:135-141`); large commented AppBar/video blocks (`:246-358`); `FlutterSecureStorage` field unused.
- **`lib/clientATC.dart`** — header `// Depreciated` (`:1`), still wired into BIG/EIS dashboards & profile summary. Procedure "complete" button is inert (`onPressed: () {}` `:370`); commented "Given To" block (`:180-192`).
- **`lib/uploadATC.dart`** — both `DropdownSearch` selectors (specialist & client) are commented out (`:253-293`, `:329-362`), so live builds submit with `selectedSpecialist=[null]` and `selectedClient=null` → form is incomplete/broken as shipped; `atcnotes` field commented out throughout.
- Sibling non-cluster dead/clone files seen in grep (not in this cluster, listed for context): `lib/Main Screen/myprofiledashboardold.dart`, `lib/Delivery Event/mastercalendar-clone.dart`, `lib/Mode Widget/reviewATC.dart.dart` (double `.dart`).

## Notes & open questions
- **Entire cluster is OFF-LIMITS for e2e/seeding** per `CLAUDE.md`. Mapped for existence only.
- **Replacement surface exists:** `lib/Main Screen/participantATC.dart` and `lib/Main Screen/myProfileDashboard.dart` also read `atc_alpha` and look like the *current* participant ATC surfaces; the two `// Depreciated` files here appear to be the legacy versions still reachable via older nav paths. (Confirm with the owner which ATC screen is canonical — out of scope to test either way.)
- **Two distinct collections with same intent:** `procedureCode` (camelCase) vs `procedurecode` (lowercase) are both queried in `atctimeline.dart` (`:117` vs `:126`) — likely a latent bug/legacy split; not testable (ATC-adjacent + write disabled).
- **`to_transcript`** is written only by the dead `addatclist.dart`; treat as legacy ATC-intake, OFF-LIMITS.
- Participant-vs-staff split: only `AtcTimeLine`/`ClientATC` are participant-read surfaces; `UploadATC`/`ATCuploadPending` are staff intake tools (role-gated). None are e2e-testable here.
