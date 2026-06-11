# Cluster: Services (AppServices/UserData/Background/CallKit/WidgetDeclaration/qualityLinks), shared Widgets, firebase_options/config, FCM/messaging, posthog, remote config

> Key: `services-infra-config` · Branch: `development` · Repo: `breakthroughs-flutter` (native Flutter participant app)
> Static code+config mapping pass — no build/run/Firestore queries. Read-only.

## Overview
This cluster is the **plumbing of the participant app**: the singleton `AppService` god-service that almost every screen depends on (it holds the logged-in profile/roles, the active journey-product, audio/video playback engines, content-analytics logging, media upload pipelines, FCM-token lifecycle, CallKit/studio-invitation handling, and dozens of Firestore helper writes), the `UserData` credential/preference store, the `BackgroundService` nightly SQLite-to-Storage sync, the `firebase_options.dart` test-harness config, and a large pool of **shared widgets** that other clusters render (post cards, continue-watching rail, pending-actions sheet, slot-booking cards, AEL goal-picker, quiz flow, live-stream player, appointment cards, countdown). For the participant these surface as: social feed interactions (like/comment), continue-watching, completing pending actions (forms/quizzes/video-asks/AEL), booking B!G opportunity & scope-enhancement slots, watching YouTube live streams, raising support tickets, and receiving studio-invitation calls. **Note on infra claims:** PostHog is entirely commented-out (no live analytics SDK), and there is **no Firebase Remote Config** anywhere in this cluster — "feature flags" are data-driven (Firestore config docs + in-memory `appService.slotbooking` toggles), not RC.

## Screens
This cluster is mostly services + embedded widgets, not full routes. The full-screen (`Scaffold`/route) widgets:

| Screen | file:line | Purpose |
|---|---|---|
| ActionPending | `Widgets/actionPending.dart:378` | Full-screen "pending actions" list: mandatory AEL/interim actions, pending forms, quizzes, video-asks, workshop action |
| Quiztocohort | `Widgets/quiztocohort.dart:43` | Full-screen quiz runner; submits responses → joins cohort + cohort chat |
| YoutubeStreamLive | `Widgets/youtubeStreamLive.dart:285` | Full-screen YouTube live-stream player + viewer-count registration |
| CountDown | `Widgets/countdown.dart` (Scaffold-less overlay, pushed as page) | Studio-invitation countdown timer; writes `clientresponse`; auto-pops on expiry |
| BackgroundService (no UI) | `Services/BackgroundService.dart:48` | Headless 30-min timer; nightly (22:00–22:30) SQLite DB upload to Storage |

Embedded widgets (rendered inside other clusters' screens): `ProductDeliverySequence`, `RequestBigOpportunities`, `RequestScopeEnhanment`, `ContinueWatch`, `Breakthroughsnewpost`, `PostItemWidget`, `GridViewPost`, `FillParticipantAEL`, `BigInvitation`, `AppointmentContainer`, `QueueStageList`, plus `AppTheme` (`Widgets/Themes.dart`) which is an 8,316-line shared theme + UI-builder hub.

## Features

### Like a post
- **What the user does:** taps the heart on a feed/profile post to like/unlike.
- **Nav/entry:** post cards (`PostItemWidget:751`, `Breakthroughsnewpost:172`) wherever the feed renders.
- **Reads:** `<postRef>/likes where uid==<uid>` (toggle check) — `AppServices.dart:637`.
- **Writes:** `<postRef>/likes` add `{liked_by,uid,profileid,time,postid}` + parent `likecount` increment/decrement — `AppServices.dart:642,655`. Post path base `Achievements/posts/postcollection/<postid>`.
- **Endpoints/Config flags:** none.
- **Journey stage:** social.
- **e2e-testable:** Yes — seed a post + auth user, tap heart, assert `likes` subcollection + `likecount`.

### Comment on a post
- **What the user does:** posts a text comment on a post.
- **Nav/entry:** comment sheet (`LikeAndCommentTab`, invoked from `Breakthroughsnewpost:481`).
- **Reads:** `<postRef>/comments` stream (count display).
- **Writes:** `<postRef>/comments` add `{postid,comment,commented_at,name,uid,profileid}` — `AppServices.dart:669`.
- **Journey stage:** social.
- **e2e-testable:** Yes.

### Delete a post (owner)
- **What the user does:** deletes own post (cascades likes/comments, flags draft).
- **Nav/entry:** post menu (owner).
- **Writes:** deletes `Achievements/posts/postcollection/<id>` + its `likes`/`comments`; updates `drafts/<id>` `{publish:false, version arrayUnion}` — `AppServices.dart:679`.
- **Journey stage:** social.
- **e2e-testable:** Yes.

### Continue Watching rail
- **What the user does:** sees a horizontal rail of last-watched general/eiflix/solarvoice content and resumes it.
- **Nav/entry:** `ContinueWatch` widget embedded on home/profile (`continueWatch.dart:35`).
- **Reads:** `content analytics where profileid==<pid> orderBy logdate desc limit 50`; then `solar voice playlist where id whereIn`, `content_urls where docid whereIn`, `series where id whereIn` + `episodes/<id>` — `continueWatch.dart:35,75,98,119,124`.
- **Writes:** none (read-only rail).
- **Journey stage:** content.
- **e2e-testable:** Yes — seed `content analytics` rows + matching playlist docs.

### Resume / track content playback (video) + analytics
- **What the user does:** plays general/eiflix content; position is restored and watch-time is logged.
- **Nav/entry:** `AppService.getContent(...)` called by content player screens (other clusters).
- **Reads:** `content analytics where profileid & videoid orderBy logdate desc limit 1` (last position) — `AppServices.dart:2611`. HLS via publit.io.
- **Writes:** local SQLite `db_analyics.db` (`contentanalytics`) every 3s; on sync → `content analytics/<docid>` (set/merge), `participant content analytics/<pid>` (arrayUnion of episode/series/audio/general refs), `series`/`solar voice playlist`/`recommended mix playlist` completion — `AppServices.dart:2343,2371,2427,2462,2495,2262`. Also `participant mode checklist/<docid>` + `participantplanning/<pid>_MM_YYYY` completion updates — `AppServices.dart:1444,1496`.
- **Endpoints:** `https://media.publit.io/file/<id>.m3u8` (HLS playback) — `AppServices.dart:2602`.
- **Journey stage:** content / progression.
- **e2e-testable:** Partial — playback timing + HLS streaming is hard to drive in CI; the analytics-write side is testable by invoking sync paths, but full video-completion is brittle. Mark as limited e2e.

### Play / track Solar Voice audio + analytics
- **What the user does:** plays a Solar Voice audio playlist (background audio, next/prev, completion).
- **Nav/entry:** `AppService.getAudioList` / audio player (Solar Voice cluster).
- **Reads:** `solar voice audios where documentId whereIn <sequence>` — `AppServices.dart:2858`.
- **Writes:** same analytics pipeline as video (`content analytics`, `participant content analytics`, `solar voice playlist` completion) + `updateparticipantplanning(type:solarvoice)` — `AppServices.dart:3115,3177`.
- **Endpoints:** audio `url` from doc; offline download via Dio.
- **Journey stage:** content.
- **e2e-testable:** Limited (audio playback timing) — same caveat as video.

### Download Solar Voice audio for offline
- **What the user does:** downloads an audio for offline listening; can cancel; can delete by playlist.
- **Nav/entry:** Solar Voice playlist download button → `AppService.downloadAudio`.
- **Reads:** none (downloads from `audiodata["url"]`).
- **Writes:** local SQLite `db_solarvoice_offline.db` (`solarvoiceoffline`); file to app docs dir — `AppServices.dart:3217,3303`.
- **Endpoints:** Dio GET on the audio `url` (Firebase Storage download URL).
- **Journey stage:** content.
- **e2e-testable:** No (local filesystem + network download on a real device); out of scope for headless e2e.

### Complete pending mandatory actions (AEL / interim / evolution / monthly report)
- **What the user does:** opens the "pending actions" sheet and completes Current/Previous AEL, Evolution Progress, or Monthly Interim Report.
- **Nav/entry:** `ActionPending` screen (`actionPending.dart:378`); each row routes to `RequestUPevent`/`PreviousAEL`/`EvolutionProgress`/`CrossOver`.
- **Reads:** `appactionpending/<pid>` snapshot; `static meta data/Interim Monthly Report`; `participant AEL where profileid & status==completed`; `interimreport log where profileid orderBy lastupdate desc limit 1` — `actionPending.dart:55,68,265,303`.
- **Writes:** `appactionpending/<pid>` set/merge (`mandatoryaction` arrayRemove, etc.) — `actionPending.dart:331`.
- **Config flags:** the `appactionpending/<pid>` doc itself is the data-driven gate (mandatoryaction/formspending/quiz/videoaskpending/workshopaction).
- **Journey stage:** progression / onboarding.
- **e2e-testable:** Yes — seed `appactionpending/<pid>` and assert rows render + clear.

### Complete pending delivery forms
- **What the user does:** fills a pending delivery form from the pending-actions sheet.
- **Nav/entry:** `ActionPending:535` → `FillForm`.
- **Reads:** `delivery forms where documentId whereIn <formIDs>` — `actionPending.dart:218`.
- **Writes:** `appactionpending/<pid>` `formspending` arrayRemove on submit — `actionPending.dart:343`.
- **Journey stage:** delivery.
- **e2e-testable:** Yes (form fill is a separate cluster; entry+removal testable here).

### Complete pending quizzes (cohort assignment)
- **What the user does:** answers a pending quiz; selection assigns them to a cohort + cohort chat.
- **Nav/entry:** `ActionPending:592` → `Quiztocohort`.
- **Reads:** `quiz where documentId whereIn <quizIDs>` (`actionPending.dart:200`); on submit `selectedcohort` doc + its `chatref` (`quiztocohort.dart:551`).
- **Writes:** `quizbyclients/<auto>` set `{profileid,quizref,quizData,selectedcohort,submittedIn:'breakthroughsapp',...}`; `<cohortref>.participantidlist` arrayUnion(profileid); `<chatref>.members` arrayUnion(user_ref.id); `appactionpending/<pid>` `quiz:[]` clear — `quiztocohort.dart:525,543,556`, `actionPending.dart:355`.
- **Journey stage:** progression / social.
- **e2e-testable:** Yes — seed `quiz` doc with `options[].cohortref`, answer, assert `quizbyclients` + cohort membership.

### Complete pending Arena Video-Asks
- **What the user does:** records/submits a pending video-ask from the pending-actions sheet.
- **Nav/entry:** `ActionPending:653` → `ArenaListVideoAsk`.
- **Reads:** `arenavideoask where documentId whereIn <ids>` — `actionPending.dart:236`.
- **Writes:** `appactionpending/<pid>` `videoaskpending:[]` clear — `actionPending.dart:367`. (Actual upload handled by video-ask SQLite pipeline below.)
- **Journey stage:** delivery / progression.
- **e2e-testable:** Partial (camera capture not headless).

### Complete pending workshop action (video-ask challenge)
- **What the user does:** taps the workshop action row → records a video-ask that finishes a workshop sub-challenge.
- **Nav/entry:** `ActionPending:440` → `ArenaVideoAsk`.
- **Reads/Writes:** updates `<participantWorkshopRef>.challenges[].status=finished/result` and clears `appactionpending/<pid>.workshopaction` — `actionPending.dart:128,146`.
- **Journey stage:** delivery.
- **e2e-testable:** Partial (camera).

### Choose AEL goals (Accelerated Evolution Level)
- **What the user does:** picks evolution categories + start/end levels for the journey ("Select Your Goals").
- **Nav/entry:** `FillParticipantAEL` widget (`fillParticipantAEl.dart:110`), embedded in onboarding/journey flow.
- **Reads:** `static meta data/Accelerator Evolution Cycle` (intro video); `atc model where atcmodel==<journeyname>` (**ATC**); `accelerated evolution level` — `fillParticipantAEl.dart:37,53,65`.
- **Writes:** `participant AEL/<id>` set; `interim crossover/<id>` set — `fillParticipantAEl.dart:337,341`.
- **Endpoints:** publit.io HLS for the intro video.
- **Config flags:** none.
- **Journey stage:** onboarding / progression.
- **e2e-testable:** **No — ATC OFF-LIMITS.** This widget reads the `atc model` collection to build the category list (`atcTouch=true`). Map that it EXISTS; CI-excluded — never seed/test the `atc model` read.

### Book B!G Opportunity slots (cohort queue planner)
- **What the user does:** confirms availability and selects multiple stage slots for an upcoming B!G opportunity.
- **Nav/entry:** `RequestBigOpportunities` widget (`requestBigOpportunities.dart:137`), embedded in journey dashboard.
- **Reads:** `cohorts queue planner where profileid & queueid` — `requestBigOpportunities.dart:36`.
- **Writes:** `cohorts queue planner/<docid>` set/merge `{profileid,selectedslots,queueid}` — `requestBigOpportunities.dart:117`.
- **Config flags:** in-memory `appService.slotbooking['bighide'|'bigintroaccepted'|'bigexpanded']` (UI gates, not persisted).
- **Journey stage:** purchase / delivery.
- **e2e-testable:** Yes — seed `queuePlanning.slots`; select; assert `cohorts queue planner` doc.

### Book Scope Enhancement / Orientation slot
- **What the user does:** books a single orientation/scope-enhancement slot (or registers interest when slots full).
- **Nav/entry:** `RequestScopeEnhanment` widget (`requestScopeEnhancement.dart:229`).
- **Reads:** none direct (slots passed in); transaction reads `queue planning/<docid>`.
- **Writes (transactional):** decrement slot in `queue planning/<docid>.planning[].segments[].slots[].usedslot`; `participantsproduct/<id>` update (status=initiated, requestedslot); `event participation request/<id>` set; when full → `queue planning/<docid>.slotinterest` arrayUnion(profileid) — `requestScopeEnhancement.dart:138,193,199,479`.
- **Config flags:** `appService.slotbooking['slothide'|'accpectedintro']`.
- **Journey stage:** purchase / delivery.
- **e2e-testable:** Yes — seed `queue planning` with available slots; book; assert `event participation request` + slot decrement.

### Respond to a B!G invitation (accept/deny)
- **What the user does:** accepts or denies a B!G event/queue invitation.
- **Nav/entry:** `BigInvitation` widget (`bigInvitation.dart:62`), shown as a dialog/sheet.
- **Writes:** `biginvitation/<docid>` update `{status: accepted|denied}` — `bigInvitation.dart:48`.
- **Journey stage:** delivery / progression.
- **e2e-testable:** Yes — seed `biginvitation` doc + matching event/queue doc; tap accept; assert status.

### Active delivery action (form / appointment / event / queue / view steps)
- **What the user does:** acts on the current active product-delivery step — fill form, request scheduling, view appointments, view upcoming events, or view all deliveries.
- **Nav/entry:** `ProductDeliverySequence` widget (`productDeliverySequence.dart:332`) on journey dashboard; reads `appService.profileJourneyProduct["activeproductdelivery"]`.
- **Reads:** `<sequenceref>` + `<deliveryref>` docs (appointment label) — `productDeliverySequence.dart:56,62`.
- **Writes:** `<sequenceref>` set `{requested:true}` after scheduling request — `productDeliverySequence.dart:103`.
- **Endpoints:** **HARDCODED PROD CF** `https://us-central1-fir-sample-aae4a.cloudfunctions.net/requestScheduling` (POST) — `productDeliverySequence.dart:83`. ⚠️ prod-endpoint firewall risk for non-queue e2e.
- **Journey stage:** delivery.
- **e2e-testable:** Yes for UI/routing, but the `requestScheduling` HTTP call hits a hardcoded prod Cloud Function — must firewall/stub in CI (test project safe otherwise).

### Cancel an appointment
- **What the user does:** opens an appointment card → cancels it.
- **Nav/entry:** `AppointmentContainer` widget (`appointmentContainer.dart:320`) in My Appointments.
- **Endpoints:** project-aware `requestApptCancel` CF chosen by `Firebase.app().options.projectId` — `appointmentContainer.dart:287`:
  - `fir-sample-aae4a` (PROD) → `.../requestApptCancel?appointmentid=`
  - `starlabs-test` (TEST) → test CF
  - `test-environment-841c3` (TEST) → test CF
- **Journey stage:** delivery.
- **e2e-testable:** Yes — this is one of the few endpoints that is **project-aware** (resolves to a test CF under test projects), so it is CI-safe if the app runs under `starlabs-test`/`test-environment-841c3`. (References all 3 project ids.)

### Watch YouTube live stream + register as viewer
- **What the user does:** opens the live-stream screen; if a stream is live, watches it and is added to the viewer list.
- **Nav/entry:** `YoutubeStreamLive` screen (`youtubeStreamLive.dart:285`).
- **Reads:** `applivestreaming where live==true limit 1`; `applivestreaming/livestreaming` (viewers array) — `youtubeStreamLive.dart:72,110`.
- **Writes:** `applivestreaming/livestreaming` `viewers` arrayUnion(profileid) — `youtubeStreamLive.dart:117`.
- **Endpoints:** YouTube Data API v3 — `https://www.googleapis.com/youtube/v3/videos` and `.../channels` with an `apiKey` passed in (`youtubeStreamLive.dart:150,222,235`).
- **Journey stage:** content / social.
- **e2e-testable:** Partial — Firestore read/write + viewer registration testable by seeding `applivestreaming`, but the YouTube Data API call + player are external and require a real live `videoid` + API key (mark live-playback as not-headless).

### Studio-invitation call (CallKit) accept/decline + countdown
- **What the user does:** receives an incoming "studio invitation" call (CallKit); accepting either plays an audio instruction (screen locked) or launches the app to `/home` (unlocked); a countdown screen shows time to join.
- **Nav/entry:** `AppService.initialize()` wires CallKit listeners + a MethodChannel `com.soe.launchyourlegacy/callkit` (`AppServices.dart:135,176,300`); `CountDown` widget shows the timer.
- **Reads:** `CountDown` streams `<invitationpath>` doc (`countdown.dart:54`).
- **Writes:** `<invitationpath>` update `{clientresponse: <response>}` — `countdown.dart:112`. Plays bundled audio `android/app/src/main/res/raw/studioinvitation.mp3`.
- **Config flags:** SharedPreferences `screen_locked`, `callkit_call_answered`, `pending_voip_call_data`; `main.dart callKitNavigationHandled` flag.
- **Journey stage:** delivery / live.
- **e2e-testable:** No — native CallKit / VoIP push / lock-screen state cannot be driven in headless Flutter integration tests; the `clientresponse` write could be unit-tested but the call lifecycle cannot.

### FCM token registration + login-log (Slack) + logout
- **What the user does:** (background) on login the device FCM/VoIP token is registered/updated and a login event is logged; on logout the token is deactivated/deleted and prefs cleared.
- **Nav/entry:** `AppService.updateFCMToken(...)` (login flow) and `AppService.logoutUser(...)` (`AppServices.dart:711,830`).
- **Reads:** `FCM_token where FCM_id==<token>`; `loginlog where profileid==<pid>` (7-day throttle) — `AppServices.dart:733,788`.
- **Writes:** `FCM_token` add/update `{FCM_id,voipToken,email,uid,user_ref,profile_ref,active,device_os,current_version,deviceinfo,...}`; `loginlog` add (if ≥7 days); on logout `FCM_token` delete by `FCM_id+uid` — `AppServices.dart:740,804,871`. Uses `FirebaseMessaging.instance.getToken()`.
- **Journey stage:** infra / support.
- **e2e-testable:** Partial — FCM token acquisition needs a real device/APNs; the Firestore `FCM_token`/`loginlog` writes are testable if a token is mocked, but headless CI can't obtain a real push token. Treat as infra (limited).

### Raise a support ticket (chat)
- **What the user does:** submits a support ticket (with optional media + YouTube links) and is dropped into the ticket chat.
- **Nav/entry:** `AppService.raiseTickets(...)` from chat/ticket UI (`AppServices.dart:3647`).
- **Reads:** `chat config` (category → assignto); `counters/ticketCounter` (transaction for next number) — `AppServices.dart:3653,3732`.
- **Writes:** `clientissue/<id>` set (issue doc) + `clientissue/<id>/messages/<id>` set (first message); media stored to local `db_chat_media.db` for async upload — `AppServices.dart:3671,3707`.
- **Journey stage:** support.
- **e2e-testable:** Yes — seed `chat config` + `counters`, raise ticket, assert `clientissue` + `messages` + `counters` increment.

### Move queue stage (participant-driven stage advance)
- **What the user does:** advances their queue token to the next stage (e.g. after a form/video-ask).
- **Nav/entry:** `AppService.moveQueueStage(...)` (queue delivery flow).
- **Reads:** in-memory `queueDeliveryData` (queuestages/queuemode).
- **Writes:** `queue_token/<docid>` update; `queue stage log/<logdocid>` set — `AppServices.dart:1294,1304`.
- **Journey stage:** delivery / progression.
- **e2e-testable:** Yes (overlaps the queue cluster).

### Send queue stage chat message
- **What the user does:** sends a message in the queue stage chat.
- **Nav/entry:** chat input inside `AppTheme.chatOption`/stage chat (`Themes.dart:1461`).
- **Writes:** `queue generation/<queueid>/stagechat/<docid>` set `{message,date,queueref,senderprofileid,stage,pinned}` — `Themes.dart:1490`.
- **Journey stage:** delivery / social.
- **e2e-testable:** Yes.

### Live ChangeWork QR (start procedure)
- **What the user does:** starts a live change-work procedure (scanned/initiated), routing to CompleteProcedure.
- **Nav/entry:** `AppService.livechangeworkqrdata(...)` — `AppServices.dart:3589`.
- **Writes:** `livechangework/<id>` set `{procedureref, beneficiaryid, doerid, procedurename, proceduretype:"atcprocedure", participantsinvolved,...}` — `AppServices.dart:3590,3612`.
- **Journey stage:** delivery.
- **e2e-testable:** **No — ATC-adjacent.** `proceduretype:"atcprocedure"` and the `syncATC` path (below) write to the dedicated `firestore-atc` database. Set `atcTouch=true`; CI-excluded. Map existence only.

### Add/remove content to "My List" (bookmark)
- **What the user does:** long-press/tap to favourite content (haptic).
- **Nav/entry:** `AppService.contentMylist(...)` from content cards.
- **Writes:** `participant metadata/<pid>` update `{<metadataKey>: arrayUnion/arrayRemove(docId)}` — `AppServices.dart:3639`.
- **Journey stage:** content.
- **e2e-testable:** Yes.

### Cast content to TV (screen_cast, partial)
- **What the user does:** opens cast options; if already casting, sees device status and can "logout"/stop.
- **Nav/entry:** `AppTheme.castOption` → `AppTheme.showQrScannerDialog` (`Themes.dart:133,4554`).
- **Reads:** `screen_cast_devices where profileid==<pid>` — `Themes.dart:4554`.
- **Writes:** on stop/logout `<screen_cast_devices doc>` update `{profileid:null, playing:false, videourl:null,...}` — `Themes.dart:4416`.
- **Endpoints:** publit.io HLS for the cast video URL.
- **Journey stage:** content.
- **e2e-testable:** Partial — the QR-scan *write* (`onQRViewCreated`, `Themes.dart:4698`) is **commented-out/dead**; only the status-read + logout-reset path is live and would need a seeded `screen_cast_devices` doc + camera (not headless). Mark limited.

### Notification-tap deep-link routing
- **What the user does:** taps a push notification and is routed to the right screen (ticket / AEL / content / eiflix / calendar / external URL).
- **Nav/entry:** `AppService.navigateOnNotificationTap(context, data)` — `AppServices.dart:3483`.
- **Reads/Writes:** none (pure routing on `data["type"]`/`landingpage`).
- **Journey stage:** infra.
- **e2e-testable:** Partial — routing logic is unit-testable by invoking with a fake payload, but the originating push is not headless.

### Background nightly SQLite → Storage sync
- **What the user does:** (invisible) nightly the app uploads local SQLite DBs (atc, videoask, chat, analytics) to Storage and records URLs.
- **Nav/entry:** `BackgroundService.onStart` 30-min timer; runs at 22:00–22:30 if online (`BackgroundService.dart:89`).
- **Reads:** SharedPreferences `userpid`.
- **Writes:** Storage `flutterSqlite/<pid>/<ts>_<db>`; Firestore `profiledb/<pid>` set/merge `{atc,videoask,chat,analytics,lastupdated}` — `BackgroundService.dart:150,183`.
- **Journey stage:** infra.
- **e2e-testable:** No — background-service + nightly timer + Storage upload of on-device SQLite files; not reproducible headless. (Includes `db_atcsync.db` → **ATC-adjacent**, `atcTouch=true`.)

### Media upload pipelines (video-ask / chat media)
- **What the user does:** (invisible/async) uploads captured video-asks and chat media to Storage, then writes Firestore.
- **Nav/entry:** `AppService.uploadVideoAsk` / `uploadMedia` (`AppServices.dart:1753,1984`), driven by local SQLite queues.
- **Writes:** Storage `<table>/videoask/...` & `<table>/media/...`; Firestore `participantvideoask/<docid>` set; chat `<message doc>.files` arrayUnion + parent `last_message` — `AppServices.dart:1864,2103,2118`. Compresses image/video before upload.
- **Journey stage:** delivery / social.
- **e2e-testable:** No (device file capture + compression + Storage upload).

### User credential & preference store
- **What the user does:** (invisible) stores uid/pid/email, Watson package, secure multi-user credentials, covid participant flag.
- **Nav/entry:** `UserData` (`UserData.dart`), called across auth flows.
- **Reads:** `profile_data where email & user_ref==user_data/<uid> limit 1` (to resolve pid) — `UserData.dart:41`.
- **Writes:** SharedPreferences (`useremail/useruid/userpid/watsonpackage/coviduser`); FlutterSecureStorage key `users` (JSON list of `{email,password,uid}`) — `UserData.dart:20,82`.
- **Journey stage:** infra / onboarding.
- **e2e-testable:** Partial — secure storage + prefs are device-local; the `profile_data` resolution query is testable.

### App exception logging
- **What the user does:** (invisible) runtime exceptions are written to Firestore.
- **Nav/entry:** `AppService.logException(...)` (called everywhere) — `AppServices.dart:1364`.
- **Writes:** `app exception log` add `{exception,stack,date,profileid,device_os,version}`.
- **Journey stage:** infra.
- **e2e-testable:** Yes (low value) — trivially assertable but not a user journey.

### Map/reference loaders (profile, product, journey, appointment-type, procedure, post-category, role)
- **What the user does:** (invisible) bulk-loads reference data used across screens.
- **Nav/entry:** `AppService.mapProfile/mapProduct/mapJourney/mapAppointment/mapProcedure/mapPostCategory/getUserRole` — `AppServices.dart:913,950,962,935,972,983,1240`.
- **Reads:** `profile_data` (orderBy name), `products`, `journey`, `appointmenttype`, `procedures`, `post_categories`, `profile_data/<pid>.role_ref` — respectively.
- **Journey stage:** infra.
- **e2e-testable:** Yes (data-loading correctness; seed each collection).

### Update delivery status (cascade product/journey status)
- **What the user does:** (invisible, triggered by form/appointment completion) recomputes delivery → product status.
- **Nav/entry:** `AppService.updateDeliveryStatus(...)` — `AppServices.dart:998`.
- **Reads/Writes:** `participantdeliverysequence/<pid>`, `participantsproduct/<id>` (status/statusdate) — `AppServices.dart:1004,1020,1071`. (A larger `participantJourneySequence` + `appointments` + `profile_data` cascade variant exists but is fully commented-out, `AppServices.dart:1091-1238`.)
- **Journey stage:** delivery / progression.
- **e2e-testable:** Yes (seed delivery sequence; trigger; assert status).

### Workshop task status update
- **What the user does:** (invisible) marks an eiflix-workshop task complete and readies the next.
- **Nav/entry:** `AppService.updateWorkshopTaskStatus(...)` — `AppServices.dart:1317`.
- **Writes:** `eiflix participant workshop/<docid>` update `taskproperty.<task>.status` — `AppServices.dart:1359`.
- **Journey stage:** delivery.
- **e2e-testable:** Yes.

## Firestore collections

### Read
- `profile_data` — by `documentId`(pid), `where email & user_ref`, `orderBy name`; also `.role_ref` follow.
- `user_data` — ref target only (FCM_token.user_ref, UserData resolution).
- `content analytics` — `where profileid (+videoid) orderBy logdate desc` (continue-watching, last-position).
- `solar voice playlist` / `solar voice audios` / `series` / `episodes` / `content_urls` — `where id|docid whereIn`, `documentId whereIn` (content resolution + completion).
- `recommended mix playlist` — `where profileid` (completion update).
- `appactionpending/<pid>` — snapshot (pending actions).
- `static meta data` — `Interim Monthly Report`, `Accelerator Evolution Cycle` docs.
- `participant AEL` — `where profileid & status==completed`.
- `interimreport log` — `where profileid orderBy lastupdate desc limit 1`.
- `delivery forms` / `arenavideoask` / `quiz` — `where documentId whereIn`.
- `atc model` — `where atcmodel==<journeyname>` — **ATC, OFF-LIMITS** (`fillParticipantAEl.dart:53`).
- `cohorts queue planner` — `where profileid & queueid`.
- `queue planning/<docid>` — transaction read (slot booking).
- `applivestreaming` — `where live==true limit 1`; `applivestreaming/livestreaming` (viewers).
- `chat config` — category config.
- `counters/ticketCounter` — transaction (ticket number).
- `screen_cast_devices` — `where profileid` (cast status).
- `FCM_token` — `where FCM_id (+uid)`.
- `loginlog` — `where profileid` (7-day throttle).
- `products`, `journey`, `appointmenttype`, `procedures`, `post_categories` — full reference loads.
- `participantdeliverysequence/<pid>`, `participantsproduct/<id>` — delivery-status cascade.
- `<postRef>/likes`, `<postRef>/comments` — like/comment state.
- `livechangework` — id alloc (write-target) — **ATC-adjacent**.
- `participant content analytics/<pid>` — read-modify-write during analytics sync.

### Written
- `<postRef>/likes` (+ parent `likecount`), `<postRef>/comments` — social interactions.
- `Achievements/posts/postcollection/<id>` (+ likes/comments cascade delete), `drafts/<id>` — post delete.
- `FCM_token` (add/update/delete) — token lifecycle.
- `loginlog` (add) — login event (Slack trigger).
- `content analytics/<docid>` (set/merge) — watch logs.
- `participant content analytics/<pid>` (set/update arrayUnion) — per-participant content completion.
- `series` / `solar voice playlist` / `recommended mix playlist` — `status:completed`/`completedcontent`/`completedplaylist`.
- `participant mode checklist/<docid>` — widget completion.
- `participantplanning/<pid>_MM_YYYY` — today-plan completion.
- `appactionpending/<pid>` (set/merge) — clear pending actions/forms/quiz/videoask/workshopaction.
- `participant AEL/<id>`, `interim crossover/<id>` (set) — AEL goal selection (read side is ATC).
- `quizbyclients/<auto>` (set); `<cohortref>.participantidlist`, `<chatref>.members` (arrayUnion) — quiz→cohort.
- `cohorts queue planner/<docid>` (set/merge) — B!G slot selection.
- `queue planning/<docid>` (transaction `usedslot`++ / `slotinterest` arrayUnion), `participantsproduct/<id>`, `event participation request/<id>` (set) — scope-enhancement booking.
- `biginvitation/<docid>` (update status) — invitation response.
- `<sequenceref>` (`requested:true`) — scheduling request.
- `applivestreaming/livestreaming` (`viewers` arrayUnion) — live viewer registration.
- `clientissue/<id>` + `clientissue/<id>/messages/<id>` (set); `counters/ticketCounter` (transaction++) — support ticket.
- `queue_token/<docid>`, `queue stage log/<logdocid>` — queue stage advance.
- `queue generation/<queueid>/stagechat/<docid>` (set) — stage chat.
- `livechangework/<id>` (set) — **ATC-adjacent** (`proceduretype:atcprocedure`).
- `participant metadata/<pid>` (arrayUnion/arrayRemove) — my-list.
- `screen_cast_devices/<doc>` (update reset) — stop cast.
- `participantvideoask/<docid>` (set); chat `<msg>.files` arrayUnion + `<chat>.last_message` — media uploads.
- `profiledb/<pid>` (set/merge) — background SQLite-URL sync (incl. `atc` field).
- `eiflix participant workshop/<docid>` (update taskproperty) — workshop task.
- `participantdeliverysequence/<pid>`, `participantsproduct/<id>` — delivery-status cascade.
- `app exception log` (add) — exception logging.
- **ATC DB (separate database `firestore-atc`):** `syncATC` writes `<path>` `{status, assigned_to:[profile_data/<doer>], last_activity, feedback}` via `FirebaseFirestore.instanceFor(databaseId:"firestore-atc")` — `AppServices.dart:1656,1674,1690`. **OFF-LIMITS.**

## Endpoints & external services
- **Cloud Functions:**
  - `requestScheduling` — **hardcoded PROD** `https://us-central1-fir-sample-aae4a.cloudfunctions.net/requestScheduling` (POST) — `productDeliverySequence.dart:83`. ⚠️ prod firewall risk.
  - `requestApptCancel` — **project-aware** (PROD `fir-sample-aae4a`, TEST `starlabs-test`, TEST `test-environment-841c3`) — `appointmentContainer.dart:287`. CI-safe under test projects.
- **publit.io** — HLS playback/thumbnails: `https://media.publit.io/file/<id>.m3u8` and `.../q_50/<id>.jpg` — `AppServices.dart:2602`, `Themes.dart:200,2598,4341,4709`.
- **YouTube Data API v3** — `https://www.googleapis.com/youtube/v3/videos|channels?...&key=<apiKey>` — `youtubeStreamLive.dart:150,222,235` (apiKey injected by caller).
- **Vimeo** — `https://player.vimeo.com/video/<id>/config` (progressive quality URLs) — `qualityLinks.dart:22`.
- **Firebase Storage** — `flutterSqlite/<pid>/...` (DB sync), `<table>/videoask/...`, `<table>/media/...`; download URLs consumed for playback/cast/offline.
- **Static Storage assets** (prod bucket `fir-sample-aae4a`) — default profile, event/solar covers, A&H logo — `Themes.dart:61,79,80,81`.
- **excellenceinstallation.com** — `https://excellenceinstallation.com/offers/` (offers link) — `Themes.dart:549` (one live ref; one commented).
- **CallKit MethodChannel** — `com.soe.launchyourlegacy/callkit` (`callKitAccepted`, `getPendingCallIntent`) — `AppServices.dart:135,176,195`.
- **Bundled audio** — `android/app/src/main/res/raw/studioinvitation.mp3` (locked-screen call instruction).

## Config & feature flags
- **Firebase Remote Config: NONE.** No `firebase_remote_config` / `RemoteConfig` anywhere in this cluster.
- **PostHog: NONE live.** The only `posthog.capture(...)` is commented out — `AppServices.dart:2774`. No active analytics SDK.
- **Firebase project (firebase_options.dart):** test-harness only — `slabs-queue-e2e-exdcz` (WEB/iOS/Android). The header comment states the file is `.gitignored`, never points at prod, and the integration test initialises Firebase first with a project-id guard; this file exists so the app compiles and a stray `flutter run` hits the disposable test project. (`firebase_options.dart:1-47`).
- **Three Firebase projects referenced in code** (`appointmentContainer.dart:287` switch): `fir-sample-aae4a`=production, `starlabs-test`=test, `test-environment-841c3`=test. (Note: CLAUDE.md names staging as `launch-your-legacy-development`; this widget instead references `test-environment-841c3` — both are non-prod.)
- **Data-driven gates (not RC):**
  - `appactionpending/<pid>` — drives the pending-actions screen (mandatoryaction / formspending / quiz / videoaskpending / workshopaction).
  - `chat config` — ticket category → assignee/subcategory.
  - `applivestreaming` doc booleans — `live`, `title`, `description`, `likeviewssubscribers`, `defaultfullscreen`, `manualTitleButton`/`manualDescriptionButton` (`youtubeStreamLive.dart`).
- **In-memory UI toggles (`appService.slotbooking{}`):** `bighide`, `bigintroaccepted`, `bigexpanded`, `slothide`, `accpectedintro` — control slot-booking widget states (not persisted).
- **SharedPreferences keys:** `useremail`, `useruid`, `userpid`, `watsonpackage`, `coviduser`, `screen_locked`, `callkit_call_answered`, `pending_voip_call_data`.
- **FlutterSecureStorage:** key `users` (JSON list of `{email,password,uid}` for multi-account).
- **Local SQLite DBs:** `db_atcsync.db` (atcsync — **ATC**), `db_videoask.db` (videoask), `db_chat_media.db` (chatmedia), `db_analyics.db` (contentanalytics), `db_solarvoice_offline.db` (solarvoiceoffline).
- **ATC second database:** `FirebaseFirestore.instanceFor(databaseId:"firestore-atc")` — `AppServices.dart:1656`. **OFF-LIMITS.**

## Dead / clone / Old code
- `Widgets/notificationlogold.dart` — **dead** (imported_by=0); legacy notification log (`Achievements`, `notifications`, `logs`, `supportdesk`, `commentlikes`). Do not present its features as live.
- `Widgets/postGridWidget.dart` — **dead** (imported_by=0); a near-clone of `postItemWidget.dart` (which is live, imported_by=7).
- `Widgets/notificationMessage.dart` — **dead** (imported_by=0); static notification row widget.
- `Widgets/unknownPage.dart` — **dead** (imported_by=0).
- `Widgets/webViewScreen.dart` — **dead** (imported_by=0, 0 bytes / empty file).
- `Services/callkitBackground.dart` — **entirely commented out** (the whole `firebaseMessagingBackgroundHandler` is a comment block); no live code.
- `AppServices.dart` large commented blocks: alternate `updateDeliveryStatus`/`profileCurrentData` cascade (1091–1238), FFmpeg `compressImage` (2180–2205), `playAudiofromURL` (2875–2977), the SQLite-DB-to-Storage upload-in-init blocks inside each `init*SQLite` (commented), and the posthog capture (2774).
- `Themes.dart` — `onQRViewCreated` screen-cast *write* (4698) is commented-out/dead; only the read+logout-reset cast path is live. Also a large commented `breakthroughsnewPost` builder (1976+) superseded by the standalone `breakthroughsnewPost.dart`.
- Covid flow (`gotoCovidSupport`, `UserData.covidParticipant`) — the navigation targets (`CovidDashboard`/`CovidRegistration`) are commented out; only the prefs read/write helpers remain (legacy).

## Notes & open questions
- **`AppService` is the central hub node** of the whole app — a 3,855-line singleton imported by virtually every screen. It mixes pure infra (auth/prefs/FCM) with feature logic (playback, analytics, uploads, ticket creation, slot/queue writes). Most "features" here are invisible service methods invoked by other clusters; the e2e value is in the *effects* (Firestore writes), not in standalone screens.
- **`Themes.dart` (`AppTheme`) is mis-named** — it's an 8,316-line shared UI-builder + helper class (≈50 widget builders) that also performs Firestore writes (stagechat, like/comment, screen_cast reset). Treat individual builders as belonging to whichever cluster renders them; only the data-writes are mapped here.
- **ATC surfaces flagged (CI-excluded, map-only):** `fillParticipantAEl.dart` reads `atc model`; `livechangeworkqrdata` writes `livechangework` with `proceduretype:atcprocedure`; `syncATC` + `db_atcsync.db` + `firestore-atc` database; BackgroundService syncs `db_atcsync.db`/`profiledb.atc`. Never seed/query ATC.
- **Prod-endpoint firewall:** `requestScheduling` is hardcoded to the prod CF host (`fir-sample-aae4a.cloudfunctions.net`) — consistent with the known "~41 files hardcode prod CF URLs" memory; non-queue e2e must firewall this host. `requestApptCancel` is the well-behaved counter-example (project-aware).
- **Open question:** `test-environment-841c3` appears as a recognised test project in `appointmentContainer.dart` but is not in the CLAUDE.md 3-project topology (which lists `launch-your-legacy-development` as staging). Confirm whether `test-environment-841c3` is an additional/renamed test project before seeding appointment-cancel e2e.
- **Open question:** `firebase_options.dart` points at `slabs-queue-e2e-exdcz` (the queue e2e harness project), which differs from `starlabs-test`/`test-environment-841c3` used by the appt-cancel switch. The active project at runtime depends on how `Firebase.initializeApp` is called (integration_test initialises first); confirm which test project the services-infra e2e suite should target.
- Audio/video playback, media capture/upload, offline download, CallKit, background sync, and FCM-token acquisition are **not headless-e2e-testable** (need real device/streaming/push); their Firestore side-effects are testable by invoking the service methods with seeded data.
