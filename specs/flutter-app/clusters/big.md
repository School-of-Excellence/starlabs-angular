# Cluster: BIG Dashboard (cohort BIG mode)

> Static code+config map of `breakthroughs-flutter/lib/BIG Dashboard/` on branch `development`. Read-only pass — no build/run/Firestore query performed. Evidence cited as `file:line` relative to that directory unless noted.

## Overview
"B!G" (the "B!G Accelerator" / "Breakthroughs to Impact Gamification") is the cohort-progression rail of the participant app. A participant who is enrolled in the B!G journey sees a **gamified level-up dashboard**: for each ATC model (CTD / SMP / uP! / LYL / B!G / SIRT) the app shows their current B!G level, a "Predictive Intelligence Progress" bar chart, per-activity progress bars (regular / validation / stabilization / warm-up / booster / special activities), an optional "Fast Track" path, locked future levels, and archived (already-achieved) levels. All of this is **read-only display of pre-computed aggregates** that a backend writes into the `big aggregate level` collection; the Flutter app itself performs **no Firestore writes** in this cluster. The only user write path is a "Request B!G Acceleration Opportunities" button that raises a support ticket (via `AppService.raiseTickets`, writing to `clientissue` outside this cluster). A large second sub-tree (`Big dashboard.dart` + `EIS Dashboard.dart` + `Big accelerator.dart` + `atc accelerator.dart`) is an **EIS / change-agent operator dashboard** that is explicitly marked `// Depreciated` and is no longer wired into navigation; it also reads ATC-OFF-LIMITS collections (`atc_alpha`, `atc model`).

## Screens
| Screen | file:line | Purpose |
|---|---|---|
| **BigGamefication** (collapsed + fullscreen) | `bigGamefication.dart:11` (`build` `:1891`; fullscreen branch `:1943`; collapsed branch `:2048`) | **LIVE.** The participant B!G level-up gamification view. Collapsed (`fullScreen:false`) embeds the bar-chart + "View More"; fullscreen (`fullScreen:true`) shows the full per-ATC-model activity breakdown. |
| **BIGVideo** | `BIGVideo.dart:9` (`build` `:71`) | **LIVE.** B!G intro/marketing screen: plays the `demovideos/bigdashboard` promo video + "Request B!G Acceleration Opportunities" support-ticket button. Reached from the "B!G" tile in My Journey. |
| BigGameficationLive | `bigGameficationLive.dart:9` (`build` `:118`) | **DEAD/event-clone.** Alternate gamification view with hardcoded "Big Accelerator -2024 / 16th–22nd Nov / Day:03" event header (`:140`,`:147`); never referenced outside the cluster. |
| BiGDashboard | `Big dashboard.dart:14` (`build` `:95`) | **DEPRECATED** (`// Depreciated` `:1`). 3-tab EIS/change-agent shell (Dashboard / B!G Accelerator / ATC). Never instantiated anywhere in the app. |
| EISDashboard | `EIS Dashboard.dart:15` (`build` `:176`) | **DEPRECATED** (`:1`). EIS change-agent home: mastery levels, delivery appointments, shadow opportunities, end-to-end / selective changework counts. Reads ATC. Only used as tab 0 of the dead BiGDashboard. |
| BIGAccelerator | `Big accelerator.dart:5` (`build` `:143`) | Change-agent "Current Accelerators" (Mastering / Apprenticing / Shadowing role lists). Only used as tab 1 of the dead BiGDashboard; no external refs. |
| ATCAccelerator | `atc accelerator.dart:6` (`build` `:28`) | **DEPRECATED** (`:1`). Expand/collapse Diagnostics + Changework ATC lists (embeds `ClientATC`). Only tab 2 of the dead BiGDashboard. **ATC OFF-LIMITS.** |

## Features

### View B!G level-up gamification (collapsed bar chart)
- **What the user does:** Sees, embedded in their profile/impact screen, a "My Predictive Intelligence Progress" panel with one bar column per ATC model (CTD/SMP/uP!/LYL/B!G/SIRT), each column filled to the participant's level index, plus a "View More ->" link.
- **Nav/entry:** Embedded `BigGamefication(fullScreen:false)` inside the live participant dashboard `Main Screen/myProfileDashboard.dart:1552` and the product Impact screen `productLevel/impact.dart:804`. (Live dashboard is instantiated at `Main Screen/home.dart:2109`.)
- **Reads:** `biglevel` (orderBy `sequence` desc; builds level→index map keyed by `docid`, fields `level`,`sequence`,`docid` — `bigGamefication.dart:61-76`); `bigactivity` (id→`activity` label map — `:78-87`); `big aggregate level` (**snapshot listener**, `where profileid == loggedinProfile.profileid`; fields `levelupcount`,`atcmodel`,`level`(ref) — `:89-118`); `atc model` (**ATC reference config — read-only, allowed** — `:135-141`).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** **Yes** — seed `biglevel`, `bigactivity`, and a `big aggregate level` doc for the test profileid; assert the bar columns render. Reads `atc model` (reference config) but does NOT touch ATC delivery data, so e2e-safe.

### View full B!G gamification (per-ATC-model activity breakdown)
- **What the user does:** Opens the fullscreen gamification screen and pages through each ATC model (back/forward arrows `bigGamefication.dart:465`,`:490`), seeing: current level + "Fast Tracked" badge, "What's Next" target level + overall progress bar, **Regular** activity progress bars (`completed/metric`), **Validation** & **Stabilization** phases (Fast-Track only), **Warm ups** / **Boosters** / **Special** activity tallies, **Locked Levels**, and **Achieved Levels** (archives). An info dialog ("Fast Track Activities – How It Works") explains the phases (`infofasttrack` `:243`).
- **Nav/entry:** (1) App drawer ListTile "B!G Gamification" → `BigGamefication(fullScreen:true)` `Widgets/Themes.dart:667`; (2) "View More ->" tap in the collapsed embed `bigGamefication.dart:2051-2060`; (3) "Contact Support" on the empty-state pushes `BIGVideo()` `:1926`.
- **Reads:** same four collections as above, plus `big aggregate level archives` (`where profileid ==`; `get()`; provides `bigArchives` of achieved levels — `bigGamefication.dart:120-133`). Per-model `data` doc fields consumed: `atcmodel`, `level`(ref), `levelupcount`, `fasttrack[]`, `regular[]`, `warmup[]`, `booster[]`, `special[]`, each activity row = `{activity:ref, completed, metric}`; fasttrack rows nest `validation[]` and `stabilization[]`.
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** **Yes** — needs a richly-populated `big aggregate level` doc (with `regular`/`fasttrack`/`warmup`/`booster`/`special` arrays referencing seeded `bigactivity` docs) + `big aggregate level archives` for the achieved-levels section. Empty-state ("not yet part of the B!G Community") is testable by seeding zero aggregate docs.

### Empty-state / Contact Support (not in B!G community)
- **What the user does:** If the participant has no `big aggregate level` docs, the fullscreen view shows "Unfortunately, you are not yet part of the B!G Community…" with a **Contact Support** button.
- **Nav/entry:** `bigGamefication.dart:1901-1941` (only renders when `dataMap.isEmpty && fullScreen`). Button → `BIGVideo()` `:1926`.
- **Reads:** `big aggregate level` (the empty result triggers this branch).
- **Writes:** none directly (the button navigates to BIGVideo).
- **Journey stage:** progression / support.
- **e2e-testability:** **Yes** — seed a profile with no `big aggregate level` doc; assert empty-state text + button.

### Watch B!G intro video & request acceleration opportunities (BIGVideo)
- **What the user does:** On the B!G marketing screen, watches the promo video (tap-to-play/pause, scrub bar) and reads the intro text; if already enrolled, taps **Request** to raise a support ticket "B!G Accelerator Request for B!G Accelerator Opportunities!".
- **Nav/entry:** "B!G" ListTile (title + trailing arrow) in My Journey → `BIGVideo()` `Main Screen/myjourney.dart:731` and `:751`; also the gamification empty-state Contact-Support button (above).
- **Reads:** `profile_data/{value["profile_ref"].id}` (whole profile doc, gates the Request button on `profiledata.isEmpty` — `BIGVideo.dart:30-36`); `demovideos/bigdashboard` (fields `videoholder`=video URL, `textholder`=intro text — `:38-47`). `AppService().getUserRole()` resolves the profile ref.
- **Writes (indirect):** the **Request** button calls `appService.raiseTickets(message:…, chatCategoryname:'Journey Related', …)` `BIGVideo.dart:240-247` → in `Services/AppServices.dart:3647` this **reads `chat config`** and **writes `clientissue` + `clientissue/{id}/messages`** (batch, with a ticket number). The write is outside this cluster's files but is the user-facing effect.
- **Endpoints:** the promo video is streamed via `VideoPlayerController.network(eitcontent["videoholder"])` `:45,:58` — a Firebase Storage / CDN URL stored in Firestore (URL value unclear from code; not hardcoded here).
- **Config flags:** none.
- **Journey stage:** content (video) + support (ticket).
- **e2e-testability:** **Yes** — seed `demovideos/bigdashboard` with a `videoholder` URL + `textholder`; assert text + video widget. The Request button's ticket write is testable but exercises the ticket/chat system (collection `clientissue`); coordinate with the chat cluster's seed. Not ATC.

### [DEAD] BigGameficationLive — 2024 event-day gamification clone
- **What the user does:** (would) See a pie-chart (`DChartPieO`) of level-ups under a hardcoded "Big Accelerator -2024 / 16th–Nov–22nd Nov / Day:03" event header, then the same per-ATC-model activity bars.
- **Nav/entry:** **none** — `BigGameficationLive` has zero references outside this cluster (grep). Dead.
- **Reads:** `biglevel`, `bigactivity`, `big aggregate level` (`where profileid ==`) — `bigGameficationLive.dart:61,73,84`.
- **Writes:** none.
- **Journey stage:** progression (event mode).
- **e2e-testability:** **No** — dead code, never reachable; hardcoded 2024 event copy. Do not test.

### [DEPRECATED] EIS change-agent dashboard (BiGDashboard → EISDashboard)
- **What the user does:** (legacy operator/change-agent) View CW Mastery / Installation / ATC Wisdom levels; see last 3 hosted **Delivery Appointments** ("view more" → `MySlot`); open **Shadow Opportunities** (→ `ShadowRequest`), **End to End Changework** & **Selective Changework Assigned** counts (→ `ClientATC`), **Up Coming Events** (→ `Mastercalendar`), and "ATC You have access to" (switches BiGDashboard to tab 2).
- **Nav/entry:** Only inside `BiGDashboard` (tab 0), which is `// Depreciated` (`Big dashboard.dart:1`) and **never instantiated anywhere** — fully dead.
- **Reads:** `atc_alpha` ×3 (`where isdelete==false & implementationagent==[pid]`; `arrayContains pid`; `where initiatedby==pid` — `EIS Dashboard.dart:50,60,132`) — **ATC OFF-LIMITS**; `profile_data/{pid}` + its `role_ref` snapshot (`:70,:90`); `eisroles` (`:104`); `Roles-To-EIS` (`where assigned_eis arrayContains profileref` — `:115`); `appointments` (`where hosts arrayContains profile_data/{pid}`, orderBy starttime desc, limit 3 — `:145`).
- **Writes:** none.
- **Journey stage:** delivery / progression (operator).
- **e2e-testability:** **No** — deprecated + unreachable, and reads `atc_alpha` (ATC OFF-LIMITS, CI-excluded). `atcTouch=true`.

### [DEPRECATED] BIGAccelerator — change-agent "Current Accelerators"
- **What the user does:** (legacy) See their Mastering / Apprenticing / Shadowing role lists, derived by joining `eisroles` experience levels with their assigned roles.
- **Nav/entry:** Only tab 1 of the dead `BiGDashboard`; no external refs.
- **Reads:** `profile_data/{pid}` (`Big accelerator.dart:35`); `eisroles` (all, partition by `experiencelevel` — `:42`); `Roles-To-EIS` (`where assigned_eis arrayContains profile_data/{pid}` — `:64`).
- **Writes:** none.
- **Journey stage:** progression (operator).
- **e2e-testability:** **No** — unreachable (dead parent). No ATC collection here, but not user-reachable, so excluded.

### [DEPRECATED] ATCAccelerator — Diagnostics / Changework ATC lists
- **What the user does:** (legacy) Expand "Diagnostics" / "Changework" to embed `ClientATC` lists.
- **Nav/entry:** Only tab 2 of the dead `BiGDashboard`.
- **Reads:** none directly; embeds `ClientATC(profileid, atcType:"prescriber"|"selectivechangework")` `atc accelerator.dart:55,85` which reads ATC data.
- **Writes:** none.
- **Journey stage:** delivery (operator, ATC).
- **e2e-testability:** **No** — **ATC OFF-LIMITS** (`clientATC`) + deprecated/unreachable. `atcTouch=true`.

## Firestore collections

### Read (live features)
- **`biglevel`** — level catalog. `orderBy("sequence", descending:true)`; keyed by field `docid` (live) or doc id (Live clone). Fields: `level` (name), `sequence`, `docid`. `bigGamefication.dart:61`, `bigGameficationLive.dart:61`.
- **`bigactivity`** — activity-id → label map. `get()` all. Field: `activity`. `bigGamefication.dart:78`, `bigGameficationLive.dart:73`.
- **`big aggregate level`** — per-participant per-ATC-model progress (**the central data doc**). `where("profileid", isEqualTo: loggedinProfile.profileid)`, `.snapshots()` live listener. Fields: `profileid`, `atcmodel` (string CTD/SMP/uP!/LYL/B!G/SIRT), `level` (DocumentReference into `biglevel`), `levelupcount`, and activity arrays `regular[]`, `fasttrack[]`, `warmup[]`, `booster[]`, `special[]`; each row `{activity:ref→bigactivity, completed, metric}`; fasttrack rows nest `validation[]`,`stabilization[]` and a `level` ref. `bigGamefication.dart:89`, `bigGameficationLive.dart:84`.
- **`big aggregate level archives`** — already-achieved levels. `where("profileid", isEqualTo: …)`, `get()`. Fields: `atcmodel`, `level` (ref). `bigGamefication.dart:120`.
- **`atc model`** — **ATC reference/taxonomy config (READ-ONLY, explicitly allowed by constraints)**, loaded into `atcmodel` list but not obviously consumed in the rendered UI. `bigGamefication.dart:135`.
- **`profile_data/{profileid|profile_ref.id}`** — participant profile doc (name, `user_ref`, gates Request button). `BIGVideo.dart:30`, `Big dashboard.dart:38`, and (deprecated) `EIS Dashboard.dart:70`, `Big accelerator.dart:35`.
- **`demovideos/bigdashboard`** — B!G promo content. Fields: `videoholder` (video URL), `textholder` (intro text). `BIGVideo.dart:38`, `Big dashboard.dart:48`.
- **`chat config`** — read by `raiseTickets` (in AppServices) to resolve the ticket category. `Services/AppServices.dart:3654`.

### Read (DEPRECATED / ATC OFF-LIMITS — map only, do NOT seed/test)
- **`atc_alpha`** — `EIS Dashboard.dart:50,60,132` (where `implementationagent`/`initiatedby`). **OFF-LIMITS.**
- **`eisroles`** — `EIS Dashboard.dart:104`, `Big accelerator.dart:42`.
- **`Roles-To-EIS`** — `EIS Dashboard.dart:115`, `Big accelerator.dart:64` (where `assigned_eis` arrayContains profileref).
- **`appointments`** — `EIS Dashboard.dart:145` (where `hosts` arrayContains profile ref, orderBy starttime, limit 3).
- ATC data read indirectly via `ClientATC` in `atc accelerator.dart`. **OFF-LIMITS.**

### Written
- **None from this cluster's own code.** Indirect: the BIGVideo / Big dashboard **Request** button → `AppService.raiseTickets` writes **`clientissue`** + subcollection **`clientissue/{id}/messages`** (batch, ticket number) — `Services/AppServices.dart:3647+`.

## Endpoints & external services
- **Video streaming:** `VideoPlayerController.network(<demovideos.bigdashboard.videoholder URL>)` — `BIGVideo.dart:45,58`, `Big dashboard.dart:83`. URL comes from Firestore (likely Firebase Storage / CDN); not hardcoded here.
- **No HTTP / Dio / Cloud Functions / httpsCallable / direct Storage `.ref()` calls** anywhere in this cluster (grep returned nothing). The only Storage usage is inside `AppService.raiseTickets` media handling (outside this cluster).
- Charts: `package:percent_indicator` (LinearPercentIndicator) and `package:d_chart` (`DChartPieO`, only in the dead Live clone) — pure client rendering.

## Config & feature flags
- **No RemoteConfig / Firebase Remote Config, no FirebaseMessaging, no PostHog, no SharedPreferences/localStorage** referenced in this cluster (grep returned nothing). Profile id comes from `AppService.loggedinProfile["profileid"]` / `UserData().getUserData()["pid"]` (in-memory session, populated elsewhere).
- **Role gating (deprecated path only):** `Big dashboard.dart:47,129` branches on `roles["changeagent"]` / `roles["eis"]` (from `AppService.getUserRole()`); non-change-agents saw the BIGVideo-style promo, change-agents saw the EIS tabs. Since `BiGDashboard` is dead, this gating is no longer active.
- The 6 ATC-model labels + colors are **hardcoded** in `bigGamefication.dart:34-41,52-59` (`CTD,SMP,uP!,LYL,B!G,SIRT`) and `_getColorForLabel` `:2092`.

## Dead / clone / Old code
- **`Big dashboard.dart`** — `// Depreciated` (`:1`); class `BiGDashboard` is **never instantiated** in the app (grep). Its big "Request" `onPressed` body is mostly commented-out legacy chat-navigation; the live call is `raiseTickets` (`:311`). DEAD.
- **`EIS Dashboard.dart`** — `// Depreciated` (`:1`); only used as a tab of the dead BiGDashboard. Contains a large commented-out "ATC Mentoring" block (`:432-488`). Reads ATC. DEAD + ATC.
- **`Big accelerator.dart`** — not marked deprecated but only referenced as a tab of the dead BiGDashboard; no external refs. Effectively DEAD.
- **`atc accelerator.dart`** — `// Depreciated` (`:1`); commented-out `ExpansionTile` alt impl (`:98-131`). DEAD + ATC.
- **`bigGameficationLive.dart`** — no external references; hardcoded 2024 event copy ("Big Accelerator -2024", "16th – Nov – 22nd Nov Day:03" `:140,:147`). Appears to be an event-week clone of `bigGamefication.dart`. DEAD/CLONE.
- Within the LIVE `bigGamefication.dart`: `calculation()` `:234` is also called per-row; the `// import syncfusion_charts` / `material_design_icons` are commented out (`:7,:9`). Live otherwise.
- Old sibling (outside cluster): `Main Screen/myprofiledashboardold.dart` references `BigGamefication` + `BIGVideo` but is the OLD dashboard (the live one is `myProfileDashboard.dart`, instantiated at `home.dart:2109`).

## Notes & open questions
- **Who writes `big aggregate level` / `…archives`?** Not the Flutter app — it only listens. Presumably a Cloud Function / operator tool computes B!G level-ups from arena/event participation (the copy references "B!G arena infield experiences"). Source unclear from this cluster; relevant for e2e seeding (must pre-seed these docs to exercise the UI).
- **`atc model` read (`bigGamefication.dart:135`)** loads into `atcmodel` but I did not find it consumed in the rendered widgets — possibly vestigial. It is reference config (allowed), not ATC delivery data.
- **`level` is a DocumentReference**, not a string — seeding `big aggregate level` for tests requires a real `biglevel` doc ref. The live code keys `biglevelmap` by the `docid` *field* (`:70`), while the dead Live clone keys by doc **id** (`:65`) — a subtle divergence to watch.
- **Empty-state copy** ("not yet part of the B!G Community") is the default for any participant without aggregate docs, so most non-B!G users see nothing or that message — confirm expected behavior with operator before treating an empty bar chart as a failure.
- The 3 Firebase projects are not referenced by name in this cluster; it uses the default `FirebaseFirestore.instance` (StarLabs project `fir-sample-aae4a` per app config).
- **ATC exclusion:** `EIS Dashboard.dart` (`atc_alpha`) and `atc accelerator.dart` (`ClientATC`) are mapped as EXISTING but flagged ATC OFF-LIMITS / CI-excluded; they are also deprecated/unreachable, so doubly excluded.
