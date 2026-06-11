# Cluster: Delivery Queue (participant queue + EIS screen)

## Overview
For the participant, this cluster is the in-app experience of being **inside a live "queue" deliverable** (a workshop/event run as a staged pipeline). When a participant has an active queue product delivery, the Home screen embeds the `QueueControl` card showing the current queue name, the current stage, a stage-specific description/waiting-time estimate, and a single context-aware action button (open a link, fill a form, answer VideoAsk questions, mark "ready for next stage", or just show queue position / "In Studio" status). Below it, an optional **slot-booking** widget lets the participant reserve a time slot for an upcoming stage (from `queue planning`). A full-screen **Process Timeline** (`QueueStageDetail`) shows the whole stage map and re-exposes the action button. A **stage chat** (`QueueStageChat`) lets the participant read/post messages tied to the current stage, including pinned messages. The `eisscreen.dart` file ("My EIT Education") is a **deprecated, orphaned** read-only stats screen that surfaces a profile's EIS/ATC role counts; it is not reachable in the live app and is ATC-coupled.

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| `QueueControl` (Home-embedded card) | `lib/Delivery Queue/queueControl.dart:15` | Current-stage card: queue name, stage name, description, context-aware action button, financial-lock notice, and slot-booking widget. Rendered inline on Home. |
| `QueueStageDetail` (fullscreen=true → Process Timeline page; fullscreen=false → inline timeline) | `lib/Delivery Queue/queueStageDetail.dart:16` | Full stage map (`QueueStageList`), current-stage detail, Support button, waiting-time description, and a second copy of the action button. |
| `ArenaListVideoAsk` | `lib/Delivery Queue/arenaListVideoAsk.dart:7` | List of VideoAsk question templates for the current stage; tap to answer each via `ArenaVideoAsk`; auto-advances the stage when all are completed (if `selfmove`). |
| `QueueStageChat` | `lib/Delivery Queue/queueStageChat.dart:11` | Chat thread for the current stage: read messages, toggle pinned-message view, send a new message (writes to `queue generation/{id}/stagechat`). |
| `QueueStudioChat` | `lib/Delivery Queue/queueStudioChat.dart:6` | **Stub** — `build()` returns `const Placeholder()` (line 22). No behaviour. |
| `EISScreen` ("My EIT Education") | `lib/eisscreen.dart:11` | **Deprecated/orphaned** read-only EIS+ATC stats (levels, ATCs given/shadowed/mentoring, implementations, field opportunities). Never instantiated. ATC-coupled. |

## Features

### View current queue stage card
- **What the user does:** Sees the active queue's name, current stage name, and a stage-specific description (or waiting-time estimate / queued message) on Home.
- **Nav/entry:** Home screen embeds `QueueControl()` inline when `appService.queueDeliveryData["queuemode"] != null` (`lib/Main Screen/homeContent.dart:7877`). The card body is built at `queueControl.dart:384` (`build`), stage name carries key `e2e-stage-status` (`queueControl.dart:436`), description at `descriptionBox()` (`queueControl.dart:347`).
- **Reads:** Renders from in-memory `appService.queueDeliveryData["queuemode"]` (a merge of `queue_token` token data + `queue generation` queue doc). Source listeners live in `lib/home.dart`: `queue_token` (`home.dart:883`, by `fileref.first.path`), the queue doc via `tokendata["queueref"]` snapshot (`home.dart:894`), `queue variation/{variationid}` for stage list when variation set (`home.dart:905`), `queue studio pairing` (`home.dart:928`). Fields consumed: `queuename`, `currentstage`, `stageproperty[stage]` (`stageexplanation`, `compulsoryactivity`, `minwatingminutes`, `maxwatingminutes`, `calltoaction`, `actiontype`, `actionresource`, `selfmovable`, `checkfinance`), `status`, `queueposition`, `queuestartdate`, `waitingmessage`, `queuedmessage`, `preassigned`.
- **Writes:** None (display only).
- **Endpoints:** None.
- **Config flags:** None (no RemoteConfig).
- **Journey stage:** delivery
- **e2e-testability:** Yes — seed a `queue_token` + `queue generation` + `participant metadata` so `queuemode` is non-null; assert stage name via key `e2e-stage-status`. No ATC.

### Take stage action — open external link
- **What the user does:** Taps the action button when the stage `actiontype == "link"`; opens `actionresource` URL in an external browser.
- **Nav/entry:** Action button `e2e-queue-action` (`queueControl.dart:194`); `case "link"` (`queueControl.dart:198-206`). Mirrored in `queueStageDetail.dart:98-106`.
- **Reads:** `stageProperty[currentStage]["actionresource"]` (the URL), `["calltoaction"]` (label).
- **Writes:** None.
- **Endpoints:** `url_launcher` → external app/browser (`launchUrl(..., LaunchMode.externalApplication)`); URL is operator-configured per stage, not a fixed CF/HTTP endpoint.
- **Config flags:** Gated by `stageproperty[stage].actiontype == "link"`.
- **Journey stage:** delivery
- **e2e-testability:** Partial — button tap is testable; the external browser handoff leaves the app and is not assertable in-app. No ATC.

### Take stage action — fill a form
- **What the user does:** Taps the action button when `actiontype == "form"`; opens `FillForm` for the stage's form; on submit, if the stage is `selfmovable`, the queue auto-advances.
- **Nav/entry:** `case "form"` (`queueControl.dart:207-235`); mirrored at `queueStageDetail.dart:107-132`. Pushes `FillForm` (other cluster: Delivery Form).
- **Reads:** `stageProperty[currentStage]["actionresource"].path` (form path), `appService.queueDeliveryData["tokendata"]["queueref"]`/`["docid"]` for metadata.
- **Writes (indirect):** `FillForm` writes the submitted form (Delivery Form cluster). On non-null return + `selfmovable`, `appService.moveQueueStage(context, formref:)` updates `queue_token/{docid}` and appends to `queue stage log/{logdocid}` (`AppServices.dart:1293-1310`), embedding `formref`.
- **Endpoints:** Uses a **named Firestore database** `firestore-forms` (`FirebaseFirestore.instanceFor(... databaseId: "firestore-forms")`, `queueControl.dart:196`, `queueStageDetail.dart:96`) to build the metadata refs (`queueref` doc + `queue_token` doc). Default DB is used for the actual stage move.
- **Config flags:** Gated by `actiontype == "form"`; auto-advance gated by `stageproperty[stage].selfmovable == true`.
- **Journey stage:** delivery
- **e2e-testability:** Yes — seed a form-stage queue; assert navigation to FillForm and (for selfmovable) that `queue_token.currentstage` advanced and a `queue stage log` doc was written. Note the `firestore-forms` named DB. No ATC.

### Take stage action — answer VideoAsk questions (list)
- **What the user does:** Taps the action button when `actiontype == "videoask"`; opens `ArenaListVideoAsk` — a list of question templates; answers each (records video answer); when all are answered and stage is `selfmovable`, the queue auto-advances.
- **Nav/entry:** `case "videoask"` (`queueControl.dart:236-270`) → pushes `ArenaListVideoAsk(videoaskList: array, eventPath/eventRef: queue generation/{docid}, selfmove: stageproperty.selfmovable)`. Each item tap → `ArenaVideoAsk` (Arena Elements cluster) at `arenaListVideoAsk.dart:165-203`.
- **Reads:** `stageProperty[currentStage]["actionresource"]` (a list of VideoAsk `DocumentReference`s). For each ref: `firestore.doc(item.path).snapshots()` live template (`arenaListVideoAsk.dart:66`). Completed-state derives from **local SQLite** `videoask` table via `appService.getVideoAskData()` (`AppServices.dart:1256`), filtered by `videoaskid` + `loggedinProfile.profileid` (`arenaListVideoAsk.dart:58-63, 84-92`).
- **Writes (indirect):** Answering is done by `ArenaVideoAsk` (other cluster). On all-completed + `selfmove`, `appService.moveQueueStage(context, videoask: widget.videoaskList)` updates `queue_token` + appends `queue stage log` with `videoaskref` (`arenaListVideoAsk.dart:186-195`).
- **Endpoints:** Local SQLite (`videoask` table) for completion state; VideoAsk recording handled downstream by `ArenaVideoAsk`.
- **Config flags:** Gated by `actiontype == "videoask"`; auto-advance gated by `selfmovable`.
- **Journey stage:** delivery
- **e2e-testability:** Partial — list render and completed-badge logic are testable; actual VideoAsk recording (camera) and the SQLite-backed completion are hard to drive in CI. No ATC.

### Take stage action — self-advance to next stage ("Ready for Next Stage")
- **What the user does:** Taps the action button when the stage is `selfmovable` (and not link/form/videoask); immediately advances the queue to the next stage.
- **Nav/entry:** `case "selfmovable"` (`queueControl.dart:298-300`) → `appService.moveQueueStage(context)`. Mirrored at `queueStageDetail.dart:164-166` (note: detail screen's `selfmovable` branch sets `type="selfmovalble"` (typo) at line 73 so its switch falls through to `default`/print — the **live self-advance path is `queueControl`**).
- **Reads:** `queueDeliveryData["queuestages"]`, `queuemode.currentstage` to compute next stage (`AppServices.dart:1263-1269`).
- **Writes:** `queue_token/{docid}.update({previousstage, currentstage, logdate, stagestatus:"Approved", ...})` (`AppServices.dart:1293-1300`); new doc in `queue stage log/{logdocid}` with full merged token+log payload (`AppServices.dart:1301-1310`).
- **Endpoints:** None (direct Firestore).
- **Config flags:** Gated by `stageproperty[stage].selfmovable == true`.
- **Journey stage:** delivery
- **e2e-testability:** Yes — seed a selfmovable stage with a next stage present; tap action; assert `queue_token.currentstage` advanced + `queue stage log` doc created. No ATC.

### View queue status / position / "In Studio" (compulsory-activity stages)
- **What the user does:** On stages with `compulsoryactivity` (no self-action), the button is informational only: shows "In Studio", "Queue Position N", "Awaiting" (status `ready`), or "In Queue". Tapping falls to `default` → opens the full stage detail.
- **Nav/entry:** `actionButton()` activity branch (`queueControl.dart:180-188`); default tap → `viewStageDetail()` (`queueControl.dart:314-315, 154-159`).
- **Reads:** `queuemode.status`, `queuemode.queueposition`, `queuemode.preassigned[stage]`, `queueDeliveryData["queuestudio"]` length (for waiting-time math in `descriptionBox`, `queueControl.dart:357-364`). `queuestudio` from `queue studio pairing` where `queueref == tokendata.queueref` & `checkin==true` & `studioin==true` (`home.dart:928`).
- **Writes:** None.
- **Endpoints:** None.
- **Config flags:** Gated by `(stageproperty[stage].compulsoryactivity ?? []).isNotEmpty`.
- **Journey stage:** delivery
- **e2e-testability:** Yes — seed status/queueposition variants and assert button label text. No ATC.

### View full Process Timeline (stage map)
- **What the user does:** Opens the full-screen stage map showing all stages and progress, plus the current-stage detail and a Support entry.
- **Nav/entry:** From `QueueControl` default action → `viewStageDetail()` pushes `QueueStageDetail(fullscreen: true)` (`queueControl.dart:154-159`). Fullscreen body at `queueStageDetail.dart:310-550`; inline (fullscreen=false) "Process Timeline" at `queueStageDetail.dart:551-598`. Stage map rendered by `QueueStageList(stageIndex:)` (`queueStageDetail.dart:392, 595` — widget defined in `lib/Widgets/queueStageList.dart`, outside this cluster).
- **Reads:** `queueDeliveryData["queuestages"]` (for `stageIndex`, `queueStageDetail.dart:39-41`), `queuemode.stageproperty`, `queuemode.currentstage`, `queuename`.
- **Writes:** None.
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** delivery
- **e2e-testability:** Yes — navigation + stage map render are assertable. No ATC.

### Contact Support from stage detail
- **What the user does:** Taps "Support" on the full-screen stage detail to open the support/chat home.
- **Nav/entry:** Support button (`queueStageDetail.dart:367-374`) → pushes `ChatHome()` (Main Screen / chat cluster).
- **Reads:** None in this cluster.
- **Writes:** None in this cluster (handled by ChatHome).
- **Endpoints:** None here.
- **Config flags:** None.
- **Journey stage:** support
- **e2e-testability:** Partial — button → ChatHome navigation is testable here; ticket creation belongs to the chat/ticket cluster. No ATC.

### Read stage chat & pinned messages
- **What the user does:** Opens the stage chat, reads messages for the current stage, and toggles a pinned-messages-only view.
- **Nav/entry:** `QueueStageChat` (`queueStageChat.dart:11`). Pinned toggle `showpinnedMessage` (`queueStageChat.dart:174-197`). **Note:** in-app navigation to `QueueStageChat` is currently **commented out** in both `queueStageDetail.dart:451-518` and `productDeliverySequence.dart:419` — the screen builds correctly but has no live entry button found in this pass (see open questions).
- **Reads:** `appService.queueDeliveryData["queuepinnedmessage"]` and `["queuemessage"]` (`queueStageChat.dart:110-111`), populated by the `queue generation/{docid}/stagechat` subcollection listener filtered by `stage == currentstage`, ordered by `date desc` (`home.dart:964`). Sender names from `appService.profiledataMap` (sourced from `profile_data` where `profileid whereIn ...`, `home.dart:985`).
- **Writes:** None for reading.
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** delivery
- **e2e-testability:** Yes (read path) — seed `stagechat` docs and assert rendering; but no current in-app nav button, so reach the screen directly in test. No ATC.

### Send a stage chat message
- **What the user does:** Types a message and taps send; the message is posted to the current stage's chat.
- **Nav/entry:** TextFormField + send IconButton (`queueStageChat.dart:221-267`).
- **Reads:** `queueDeliveryData["queuemode"]["docid"]` (queue generation id), `loggedinProfile.profileid`, `currentStage`.
- **Writes:** `queue generation/{docid}/stagechat/{autoId}.set({docid, date(now), message, pinned:false, queueref: queue generation/{docid} ref, senderprofileid, stage: currentStage})` (`queueStageChat.dart:249-259`).
- **Endpoints:** None (direct Firestore). On error → `appService.logException` writes to `app exception log` (`queueStageChat.dart:263`, `AppServices.dart:1364`).
- **Config flags:** None.
- **Journey stage:** delivery
- **e2e-testability:** Yes — drive the field + send and assert a new `stagechat` doc. No ATC.

### Book an upcoming-stage time slot (slot booking)
- **What the user does:** When upcoming planned slots exist for the next stage, sees "Book Your Slot — For {stage}", selects a radio slot, taps "Yes. I'm Coming →" to reserve it (or "Decide Later"). Once booked, sees a confirmation ("You're All Set…") with the selected slot and a "Contact Support" link; can also open a "Need Clarity?" dialog.
- **Nav/entry:** `slotbookingWidget(...)` rendered under the card (`queueControl.dart:501, 507`). Slot list built from `queuePlanning` via `RadioListTile` (`queueControl.dart:757-805`); confirm button (`queueControl.dart:807-866`); "Decide Later" sets `slotbooking['denied']` (`queueControl.dart:869-873`); "Need Clarity?" dialog (`queueControl.dart:897-936`).
- **Reads:** `queue planning` where `queueid == queuetoken.queueref.id` (`queueControl.dart:60`); `participant list` where `profilelist arrayContains loggedinProfile.profileid` to gather the participant's `segmentid`s (`queueControl.dart:63-67`); filters `planning[].segments[].slots[]` by variation/segment/stage with `enddate > now` and slot not full (`queueControl.dart:72-109`). Already-selected slot read from `queuemode.selectedstageslot[nextSlotStage]` (`queueControl.dart:395`).
- **Writes:** On confirm — transactional update of `queue planning/{queueplanid}` incrementing the matching slot's `usedslot` (`queueControl.dart:1010-1089`, `transaction.update(docRef,{planning})`); on success, `queue_token/{tokenid}.update({"selectedstageslot.{stage}": mySlot})` (`queueControl.dart:833-836`). (A symmetric un-book/decrement path exists in `updateSlotCount(..., increment:false)` but the cancel call site is commented out at `queueControl.dart:620-633`.)
- **Endpoints:** None (direct Firestore + transaction). Loading dialog via `WidgetService`.
- **Config flags:** Widget hidden when `appService.slotbooking['hide'] == true` or when no planning/next stage (`queueControl.dart:508`). `slotbooking` is an **in-memory** app-state map (`AppServices.dart:109`), reset on Home refresh (`homeContent.dart:7800/7805`, `home.dart:885`), not RemoteConfig.
- **Journey stage:** progression
- **e2e-testability:** Yes — seed `queue planning` + `participant list` (segments) so a slot appears; select + confirm; assert `queue planning.planning[..].usedslot` incremented and `queue_token.selectedstageslot.{stage}` set. No ATC.

### Contact Support about a booked slot
- **What the user does:** From the "You're All Set" booked-slot panel, taps "Contact Support" to open a pre-filled support ticket referencing the slot.
- **Nav/entry:** "Contact Support" GestureDetector (`queueControl.dart:616-675`) → pushes `RaiseTicket(category, subcategory:null, message:)` (Chat/Ticket cluster).
- **Reads:** `chat config` collection — first doc's `categories` filtered to `category == 'Events & Process'` and `messages` (`queueControl.dart:637-648`); appends a synthetic `slotmessage` describing the chosen slot.
- **Writes:** None in this cluster (ticket creation handled by `RaiseTicket`).
- **Endpoints:** None here.
- **Config flags:** None.
- **Journey stage:** support
- **e2e-testability:** Partial — requires a booked slot and a `chat config` doc with an 'Events & Process' category; reaches `RaiseTicket` (other cluster). No ATC.

### Financial-lock notice (gates queue action)
- **What the user does:** If the stage requires finance clearance (`stageproperty.checkfinance == true`) and the participant's `financialstatus == "locked"`, the action button is **replaced** by a black notice telling them to clear finance before proceeding (Diagnostics blocked).
- **Nav/entry:** Computed in `build` (`queueControl.dart:390-394`); notice rendered instead of `actionButton()` (`queueControl.dart:446-470`).
- **Reads:** `stageproperty.checkfinance`; `appService.usermetadata['financialstatus']` — `usermetadata` sourced from `participant metadata/{pid}` snapshot (`home.dart:488-491`).
- **Writes:** None.
- **Endpoints:** None.
- **Config flags:** Gated by `stageproperty[stage].checkfinance == true` + `participant metadata.financialstatus == "locked"`.
- **Journey stage:** delivery
- **e2e-testability:** Yes — set `participant metadata.financialstatus = "locked"` and a `checkfinance` stage; assert the lock notice replaces the action button. No ATC.

### [DEPRECATED/ORPHANED] View "My EIT Education" EIS/ATC stats
- **What the user does:** (Historically) views their EIS education levels and ATC participation counts — Changework/ATC/Installation levels, ATCs given/shadowed/mentoring, implementations done/mentored/shadowed, field opportunities; tapping some rows opened `ClientATC`.
- **Nav/entry:** `EISScreen` (`lib/eisscreen.dart:11`). **No live entry** — file is marked `// Depreciated` (line 1) and is **not imported/instantiated anywhere** in `lib/` (grep: only self-references). Rows tap into `ClientATC(... atcType: prescriber/fullchangework/selectivechangework)` (`eisscreen.dart:434, 521, 561`).
- **Reads:** `profile_data/{pid}` (`atc_level`, `installations_level`, `changework_level`, `name`) (`eisscreen.dart:55`); **`atc_alpha`** by `author`/`observer`/`initiatedby`/`implementationagent` (`eisscreen.dart:63,75,87,99`); **`atc_initiated`** by `initiatedto` (`eisscreen.dart:111`); `eisroles` (`eisscreen.dart:124,151`); `Roles-To-EIS` where `assigned_eis arrayContains profile_data/{pid}` (`eisscreen.dart:135,173`). User identity via `UserData().getUserData()`.
- **Writes:** None.
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** progression (education stats) — but dead.
- **e2e-testability:** **No** — `atcTouch=true`. Reads `atc_alpha`/`atc_initiated` and pushes `ClientATC`. ATC OFF-LIMITS — CI-excluded. Also dead/orphaned code.

## Firestore collections

### Read (with field / where notes)
- `queue_token` — token doc (read live in `home.dart:883` by `fileref.first.path`); fields `currentstage`, `variationid`, `queueref`, `docid`, `status`, `queueposition`, `selectedstageslot`, `preassigned`, `stageproperty` (merged into `queuemode`).
- `queue generation` (the "queue" doc) — read via `tokendata["queueref"]` snapshot (`home.dart:894`); fields `queuename`, `stages`, `stageproperty`, `queuestartdate`, `queueenddate`, `stagegroup`, `docid`. Also addressed directly by `docid` for VideoAsk `eventPath`/`eventRef` (`queueControl.dart:257-258`, `queueStageDetail.dart:148`).
- `queue generation/{docid}/stagechat` (subcollection) — read filtered `where stage == currentstage`, `orderBy date desc` (`home.dart:964`); fields `senderprofileid`, `pinned`, `message`, `date`, `links`, `stage`.
- `queue variation/{variationid}` — `stages` for the participant's variation (`home.dart:905`).
- `queue studio pairing` — `where queueref == tokendata.queueref` & `checkin==true` & `studioin==true` (`home.dart:928`) → `queuestudio` (for waiting-time math).
- `queue planning` — `where queueid == queuetoken.queueref.id` (`queueControl.dart:60`); doc fields `planning[]` (→ `segments[]` → `slots[]` with `stagename`, `startdate`, `enddate`, `usedslot`, `maxslot`, `title`, `description`), `docid`.
- `participant list` — `where profilelist arrayContains loggedinProfile.profileid` (`queueControl.dart:63`); field `segmentid`.
- `participant metadata/{pid}` — `financialstatus` (and `activejourney`) via snapshot (`home.dart:488`).
- `profile_data` — `where profileid whereIn [...]` for chat sender names (`home.dart:985`); plus `profile_data/{pid}` in dead EISScreen (`eisscreen.dart:55`).
- `chat config` — first doc `categories` (filter `Events & Process`) + `messages` (`queueControl.dart:637`).
- **[ATC — dead]** `atc_alpha`, `atc_initiated`, `eisroles`, `Roles-To-EIS` — EISScreen only (`eisscreen.dart`); OFF-LIMITS.

### Written (with field / when notes)
- `queue_token/{docid}` — `update` on stage move (`previousstage`, `currentstage`, `logdate`, `stagestatus:"Approved"`, plus `formref`/`videoaskref`) (`AppServices.dart:1293-1300`, via moveQueueStage); and `update` `"selectedstageslot.{stage}": slot` on slot booking (`queueControl.dart:833`).
- `queue stage log/{logdocid}` — `set` full merged token+log payload on every stage move (`AppServices.dart:1301-1310`).
- `queue generation/{docid}/stagechat/{autoId}` — `set` new message on send (`queueStageChat.dart:259`).
- `queue planning/{queueplanid}` — transactional `update` of `planning` (increments/decrements slot `usedslot`) on slot booking (`queueControl.dart:1068`).
- `app exception log` — `add` on chat-send / stage-move errors via `logException` (`AppServices.dart:1364`).

## Endpoints & external services
- **No HTTP/Dio/Cloud Functions/`httpsCallable`/Storage `.ref()` calls** in any cluster file (verified by grep).
- **Multi-database Firestore:** the form action uses a **named database** `firestore-forms` via `FirebaseFirestore.instanceFor(app: Firebase.app(), databaseId: "firestore-forms")` to build the `queueref`/`queue_token` metadata refs passed to `FillForm` (`queueControl.dart:196-219`, `queueStageDetail.dart:96-118`). All other reads/writes use the default database.
- **`url_launcher`** — opens operator-configured per-stage links externally (`queueControl.dart:201`, `queueStageDetail.dart:101`, `queueStageChat.dart:86`).
- **Local SQLite** — VideoAsk completion state via `appService.getVideoAskData()` → `db.query('videoask')` (`AppServices.dart:1256`); consumed by `ArenaListVideoAsk` (`arenaListVideoAsk.dart:58,85`).
- **3 Firebase projects:** not referenced in cluster code (no projectId literals).

## Config & feature flags
- **No RemoteConfig / Remote Config** usage anywhere in this cluster (verified by grep).
- **No FirebaseMessaging / PostHog / SharedPreferences** in cluster files. (Identity comes via `UserData().getUserData()` in dead EISScreen; the live queue uses `appService.loggedinProfile` / `usermetadata` populated upstream in `home.dart`.)
- **In-memory app-state "flags"** (not persisted, reset on Home refresh): `appService.slotbooking` map keys — `hide`, `denied` (`queueControl.dart:508,517,559,872`); plus `bighide/bigexpanded/bigintroaccepted/slothide/accpectedintro` used by sibling slot widgets outside this cluster.
- **Data-driven gating (per-stage `stageproperty`):** `actiontype` (`link`/`form`/`videoask`), `selfmovable`, `compulsoryactivity`, `checkfinance`, `calltoaction`, `actionresource`, `minwatingminutes`/`maxwatingminutes`, `stageexplanation`. These come from the `queue generation` / `queue variation` docs, not from a flag service.
- **e2e hooks present:** widget keys `e2e-queue-action` (`queueControl.dart:194`) and `e2e-stage-status` (`queueControl.dart:436`), plus `E2E-PUSH`/`E2E-FORMACTION` debug prints (`queueControl.dart:208,224,227`) — the queue card is already instrumented for e2e.

## Dead / clone / Old code
- **`lib/eisscreen.dart` (`EISScreen`)** — header `// Depreciated`; **orphaned** (no imports/instantiation anywhere in `lib/`, confirmed by grep). ATC-coupled (`atc_alpha`, `atc_initiated`, `ClientATC`). Map only; never seed/test.
- **`lib/Delivery Queue/queueStudioChat.dart` (`QueueStudioChat`)** — stub; `build()` returns `const Placeholder()` (line 22). No behaviour, no live nav found.
- **`queueStageDetail.dart` self-advance branch** — typo `type = "selfmovalble"` (`:73`) means its switch never hits `case "selfmovable"` (`:164`) and falls to `default`/print. The working self-advance path is in `queueControl.dart`. (Live but a latent dead-branch bug.)
- **Commented-out `QueueStageChat` navigation** — the in-app buttons that open stage/studio chat are commented out in `queueStageDetail.dart:451-518` and `productDeliverySequence.dart:419`. The chat screens build but have no discovered live entry button.
- **Large commented blocks in `queueControl.dart`** — alternate slot-planning loop (`:111-147`), legacy single-template VideoAsk push (`:271-296`), commented `case "activity"` alert dialogs (`:301-312`), the slot un-book/decrement call site (`:620-633`), and a whole legacy widget set `viewSteps/eventDate/openLink/fillForm/selfMovalble` (`:1100-1284`) — all dead.
- **`Themes.returnQueueControl`** (`lib/Widgets/Themes.dart:998`) — entire method body commented out; referenced only from a likewise-commented homeContent branch (`:8673`). Dead.
- **`queueStageDetail.dart` commented `case "activity"`** (`:167-179`) — dead.

## Notes & open questions
- **Entry condition:** The live queue card only renders when `appService.queueDeliveryData["queuemode"] != null` (`homeContent.dart:7877`), which requires an active product delivery of `type=="queue"` with status `initiated`/`ongoing` (`home.dart:870`) and `currentstage != "completed"` and now-before-`queueenddate`. e2e seeding must satisfy all of these.
- **QueueStageChat reachability:** I found no live in-app button that opens `QueueStageChat`/`QueueStudioChat` (all nav commented out). The send/read logic is fully functional, so e2e can exercise it by navigating to the widget directly, but in a real user journey it may currently be unreachable — worth confirming with the operator whether chat is intentionally hidden.
- **`firestore-forms` named DB:** form-stage metadata refs are built against database `firestore-forms`, while the stage-move write hits the default DB. Tests/seeders must target the correct database per write.
- **Slot un-book:** the decrement path (`updateSlotCount(increment:false)`) exists but its only caller is commented out — participants currently cannot release a booked slot from this UI.
- **Detail-screen self-advance bug:** because of the `selfmovalble` typo, tapping "Ready for Next Stage" from the full-screen `QueueStageDetail` does nothing; only the Home card advances. Likely a real bug (flagged separately).
- **ATC boundary:** Only `eisscreen.dart` (dead) touches ATC. The live Delivery Queue path is ATC-free and fully e2e-testable.
