# Cluster: Delivery Event, Arena Elements, Arena Start CW, Pre-Event Tweets, Post-Event Achievements, Event Countdown

> Static code+config map of the `delivery-events-arena` cluster of the **breakthroughs-flutter** participant app (branch `development`).
> Repo path: `/Users/antano/solarcode/ah/starlabs-angular/breakthroughs-flutter/lib/`.
> Read-only mapping pass — no app build, no Firestore queries. Evidence cited as `file:line`.

## Overview
This cluster is the participant's **live-event lifecycle**: discovering upcoming Arena events / D&I dates / queues, RSVPing or requesting participation, planning their next months, and — during a live Arena event — using an on-site hub (Highlights, My ATC, Start Change Work, E-Ticket QR, Video Ask) plus a participant-zone display. It also covers two journeys' commitment flows: the **uP!/Accelerated-Evolution** multi-step request wizard (writes `participant AEL` + `interim crossover`) and the **B!G activity board** (assignments → Form/Video/Zoom/ATC). Pre-event it offers per-product "tweet walls"; post-event it offers an "Achievements" social feed + post-creation pipeline ("Share my Breakthrough"). A countdown banner ticks to the next event. **Change Work completion touches the dedicated `firestore-atc` database and is OFF-LIMITS for e2e.**

## Screens
| Screen | file:line | Purpose |
|---|---|---|
| Eventcount (countdown banner) | `eventcountdown.dart:7` | Live countdown to the most-recent `event collection` start_date; confetti on end |
| AvailableEvents (RSVP) | `Delivery Event/availableEvents.dart:12` | "Are You Coming?" RSVP for Event-Mode / Installation-Event products (events + queues) |
| EventsByProducts (RSVP, Big Mode) | `Delivery Event/eventbyproducts.dart:7` | "Plan Your Immediate Journey Ahead" RSVP widget for Big-Mode product deliveries |
| ArenaEventRequest (RSVP, arena) | `Delivery Event/arenaEventRequest.dart:11` | Upcoming `arena events` list with Yes-I'm-In / Revert RSVP per product |
| Viewupcomingopportunities | `Delivery Event/viewupcomingopportunities.dart:11` | B!G-journey upcoming arena events; "Yes, I'm Coming" → participation request |
| EventPlanning | `Delivery Event/eventPlanning.dart:15` | "Next N Months Plan For YOU" — events/arena/workshops, request participation (batch), B!G ad, workshop enroll |
| MastercalendarClone (Calendar) | `Delivery Event/mastercalendar-clone.dart:15` | "Calendar / Upcoming Marathon" — month grids + live-event carousel (read-only) |
| RequestUPevent (uP! wizard) | `Delivery Event/requestUPevent.dart:15` | 5-step uP! Accelerated-Evolution request: pick D&I+live, watch trailer, set evolution goal, confirm |
| Bigactivity (B!G activity board) | `Delivery Event/bigactivity.dart:15` | "My B!G Activity" — assignments by status; Form/Video/Zoom/ATC actions |
| LiveEventControl (Arena hub) | `Delivery Event/liveEventControl.dart:19` | In-event 4-button strip: Highlights, My ATC, Start CW (QR), E-Ticket QR / Video Ask |
| ImpactPeopleVideo | `Delivery Event/impactPeopleVideo.dart:9` | "See How other Peoples Value" video list (publit.io playback) |
| ArenaExplore | `Arena Elements/arenaExplore.dart:11` | "Explore Arena" — arena layers carousel; Mark Attended toggle |
| ArenaHighlights | `Arena Elements/arenaHighlights.dart:16` | "Highlights" feed of arena highlights (achievement/communitypost/participantreports) + add-post FAB |
| ParticipantReports | `Arena Elements/participantsReport.dart:12` | Participant's own arena reports; "Share To Community" anonymity toggle |
| ArenaParticipantZone | `Arena Elements/arenaParticipantZone.dart:9` | "You are in <cohort>. Please go to <zone>" live zone assignment banner |
| ArenaVideoAsk | `Arena Elements/arenaVideoAsk.dart:19` | Record a video answer (camera, ≥15s), store local SQLite, upload to `participantvideoask` |
| ParticipantVideoAsk (story player) | `Arena Elements/participantVideoAsk.dart:8` | Full-screen swipeable story/video-ask player (publit.io HLS→mp4) |
| PostStories | `Arena Elements/postStories.dart:10` | Single report rendered as a shareable "story" card (share code commented out) |
| AddTweets | `PreEvent - Tweets/addTweets.dart:10` | Post a product "tweet" to `{productCollection}` (CTD/WiSH/uP!/FastTrack wall) |
| PersonalTweets | `PreEvent - Tweets/personal_tweets.dart:16` | "My <product> Tweets" — own tweets list/grid |
| SocialTweets | `PreEvent - Tweets/social_tweets.dart:15` | "<product> Social" — all tweets wall |
| NoProductTweets | `PreEvent - Tweets/noProductTweets.dart:5` | Fallback when no tweet wall for product (Covid-banner leftover) |
| Achievements (social feed) | `PostEvent - Achievements/achievements.dart:19` | Post timeline from `user_relevant_timeline`; report/delete; trending |
| Mycelebration | `PostEvent - Achievements/mycelebration.dart:26` | "My Celebration" — user's own posts wall; trending; navigate to CreatePost |
| CreatePost | `PostEvent - Achievements/createpost.dart:17` | Compose post: message + images; today/yesterday availability; → PostTags |
| PostTags | `PostEvent - Achievements/createpostTags.dart:10` | Pick post category (`post_categories`), significance/consequence → PreviewPost |
| PreviewPost | `PostEvent - Achievements/previewpost.dart:13` | Preview + publish: writes `drafts` + `Achievements/posts/postcollection`, uploads images |
| Social (DEAD clone) | `PostEvent - Achievements/social.dart:26` | Near-duplicate of Achievements; **no external caller** |
| ChooseProcedure (DEPRECATED) | `arena Start CW/chooseProcedure.dart:10` | (Depreciated) ATC adjustment/procedure picker — reads `atc_alpha` |
| StartCWOption (DEPRECATED) | `arena Start CW/startcwOption.dart:12` | (Depreciated) Beneficiary/Doer QR chooser — QR code commented out |
| CompleteProcedure (ATC) | `arena Start CW/completeProcedure.dart:16` | Live Change Work completion; **writes `firestore-atc` DB + `livechangework`** |

## Features

### Event countdown banner
- **What the user does:** Sees a live days/hours/min/sec countdown to the nearest event; confetti fires when it hits zero.
- **Nav/entry:** Embedded widget (home/dashboard); not a route.
- **Reads:** `event collection` (orderBy start_date desc, limit 1) `eventcountdown.dart:24`.
- **Writes:** none.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed one `event collection` doc with a future `start_date`; assert banner + timer render. Not ATC.

### RSVP to an Event/Queue delivery (Event Mode)
- **What the user does:** For each upcoming event/queue tied to their Event-Mode / Installation-Event-Mode products, taps YES / NO / Revert ("Are You Coming?").
- **Nav/entry:** `AvailableEvents` screen/embedded (`screenMode` flag) `availableEvents.dart:12`.
- **Reads:** `products` (id; mode in Event Mode/Installation Event Mode) `:75,:85`; `participantsproduct` (profileid) `:1912,:460`; `deliverables` (participantproductid, type) `:1944,:1965`; `event collection` (start_date>now) `:1994,:2447`; `queue generation` (queuestartdate>now) `:2001,:2479`; `delivery events`/`delivery queue` (documentId in) `:2011,:2456,:2488`; `event rsvp` (eventref/eventtyperef/profileid) `:2030,:2053`.
- **Writes:** `event rsvp` — docid, eventtyperef→`delivery events|queue`, eventref→`event collection|queue generation`, type, profileid, productref, participantresponse, teamresponse=null `availableEvents.dart:334,:2142`.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed product (Event Mode) + delivery + future event + participantsproduct; assert YES writes `event rsvp`. Not ATC.

### RSVP to Big-Mode product events/queues
- **What the user does:** "Plan Your Immediate Journey Ahead" card — taps Yes/No per upcoming Big-Mode event/queue.
- **Nav/entry:** `EventsByProducts` embedded widget `eventbyproducts.dart:7`.
- **Reads:** `participantsproduct` (profileid, status null) `:43`; `products` (mode in Big Mode) `:47`; `event collection` `:83`; `queue generation` `:90`; `delivery events`/`delivery queue` `:100`; `event rsvp` `:117,:140`.
- **Writes:** `event rsvp` (same shape as above) `eventbyproducts.dart:171`.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — analogous to AvailableEvents with Big-Mode product. Not ATC.

### RSVP to upcoming Arena events (per product)
- **What the user does:** Browses upcoming `arena events`, taps "Yes, I'm In!" / "Revert Choice"; sees team approval/denial messages.
- **Nav/entry:** `ArenaEventRequest` (screen or embedded via `screenMode`) `arenaEventRequest.dart:11`.
- **Reads:** `products` (id) `:38`; `arena events` (delete=false, startdate>=now) `:40`; `event rsvp` (profileid) `:65`.
- **Writes:** `event rsvp` — adds `arenaeventid`, eventtyperef←`deliveryref`, eventref, productref, participantresponse `arenaEventRequest.dart:790`.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed `arena events` (future, delete=false) for a product; assert RSVP write. Not ATC.

### Request participation in B!G upcoming opportunities
- **What the user does:** B!G-journey participant sees "Upcoming Events", taps "Yes, I'm Coming!" to request participation.
- **Nav/entry:** `Viewupcomingopportunities` screen `viewupcomingopportunities.dart:11`.
- **Reads:** `journey` (documentId in journeyids; atcmodel=="B!G") `:36`; `products` (atcmodel="B!G") `:42`; `arena events` (delete=false, startdate>=now, productref in) `:48`; `event participation request` (arenaeventid in, profileid) `:57`.
- **Writes:** `event participation request` — arenaeventid, eventref, productref, profileid, status="requested" `viewupcomingopportunities.dart:226`.
- **Endpoints/Config:** none. Gated by B!G journey (`atcmodel=="B!G"`).
- **Journey stage:** delivery.
- **e2e-testability:** Yes (B!G journey user) — seed journey atcmodel B!G + B!G product + future arena event; assert participation-request write. Not ATC.

### Plan next-months events + request participation (batch)
- **What the user does:** "Next N Months Plan For YOU" — reviews events/arena/workshops; checks optional arena events; taps "Confirm My Participation" / "Request Participation"; (non-B!G) sees a B!G upsell ad; enrolls in a workshop.
- **Nav/entry:** `EventPlanning` screen (args eventid/eventtype/arenaEvents/upcominigEvents/activeWorkshop) `eventPlanning.dart:15`.
- **Reads:** `journey/{activejourney}` (atcmodel) `:82`; `classify/bigads` doc `:94`; `products` `:105`; `atc model` (reference config — model image) `:112`; `participantsproduct` (profileid, status null) `:121`; `event collection` (end_date>=today) `:138`; `arena events` (enddate>=today, type=event) `:155`; `workshopconfiguration` (active) `:171`; `workshop participant enrolled` (profileid, workshopref) `:509`; `event participation request` (eventref in, profileid) `:244`.
- **Writes:** `event participation request` (batch.set: arenaeventid, eventref, productref, profileid, status="requested") `eventPlanning.dart:1423`.
- **Endpoints/Config:** External URL launch for B!G ad clicklink `:622-624` (`url_launcher`). Navigates to `WorkshopChallenges`/`EiFlixWorkshop` (other cluster).
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed journey + products + future event/arena/workshop; assert batch participation-request writes. `atc model` read is reference-only (safe). Not ATC-write.

### Calendar / Upcoming Marathon (read-only)
- **What the user does:** Views month-grid calendars with color-coded event types and a live-event carousel; legend of event types. (Plan buttons are non-functional — see Dead code.)
- **Nav/entry:** `MastercalendarClone` screen (likely a bottom-nav/dashboard tab) `mastercalendar-clone.dart:15`.
- **Reads:** `products` `:79`; `event collection` (start_date>=month start) `:166`; `arena events` (startdate>=month start, type=event) `:188`; `queue generation` (queuestartdate>=month start) `:213`; `workshopconfiguration` (active) `:241`.
- **Writes:** none (Plan buttons have empty/commented onTap `:568,:920`).
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes (read-only) — seed events/arena/queues/workshops; assert calendar + carousel render. Not ATC.

### uP! Accelerated-Evolution request wizard
- **What the user does:** 5 steps — (1) choose D&I dates+location & live event + watch uP! trailer, (2) learn AEC, (3) set evolution goal (advanced per-category or single), (4)… (5) Congratulations. Submits an Accelerated Evolution commitment.
- **Nav/entry:** `RequestUPevent` screen `requestUPevent.dart:15`. Active steps: up/multievent/acceleratorEvolutionCycle/evolutionGoal/congratulations `:74-86`.
- **Reads:** `atc model` (atcmodel="uP!" — reference config) `:88`; `content_urls` (trailer ids) `:101`; `products` (atcmodel in B!G/LYL/uP!) `:117`; `arena events` (enddate>=now) `:149`; `event collection` doc via eventref path `:178`; `event rsvp` (profileid, eventref in queue refs) `:251`; `accelerated evolution level` `:314`; `static meta data` (Accelerator Evolution Cycle / Extending Years / Situation Ship) `:322`.
- **Writes:** `participant AEL` — docid, productref[], arenaevents[], atcmodel="uP!", evolutiontype, category, crossovermetric, profileid, tentativestart/end, reallifesituation `:463`; `interim crossover` — docid, aelid, metric, profileid `:474`; `event rsvp` (merge, with aelid) for live + D&I events `:531`.
- **Endpoints/Config:** publit.io HLS playback for trailers `:556`. Navigates to `ImpactPeopleVideo` `:1345`.
- **Journey stage:** progression (commitment/goal-setting).
- **e2e-testability:** Yes (uP! journey user) — seed uP! `atc model`, uP! product, future live+D&I arena events; drive wizard; assert `participant AEL`/`interim crossover`/`event rsvp` writes. `atc model` is reference-only (safe), NOT the OFF-LIMITS atc_alpha collections.

### B!G activity board (assignments)
- **What the user does:** Views B!G assignments grouped by status (My/Rework/Review/Missed/Completed), filters by type; opens a Form (fills it), watches a Video, sees Zoom-call join window. ATC/Triple-ATC assignments show a "web only" notice.
- **Nav/entry:** `Bigactivity` (embedded teaser `fullscreen:true` + full screen `fullscreen:false`) `bigactivity.dart:15`.
- **Reads:** `big assignment` (participantidlist arrayContains profileid) `:60`; `big participants assignments` (profileid) `:73`; `content_urls` (documentId in selectedvideos) `:1193` for Video activities.
- **Writes:** `big participants assignments` — status→"ongoing" then "review"+activityref `:1082,:1105`. Form path writes go through `FillForm` (separate Delivery Form cluster).
- **Endpoints/Config:** Uses second Firestore DB **`firestore-forms`** for the Form deliverable (`big participants assignments` ref passed to FillForm) `:1086`. Navigates to `FillForm`, `PlayRelatedVideo`.
- **Journey stage:** progression.
- **e2e-testability:** Partial — Form/Video/Zoom assignments are testable (seed `big assignment` + `big participants assignments`); **ATC / Triple ATC assignments are explicitly web-only** (dialog "available only on the web" `:1153`) — map only, do not seed/test the ATC path.
- **ATC note:** This screen references assignment types "ATC"/"Triple ATC" but only shows a web-redirect notice; it does NOT read/write ATC collections here.

### Arena live-event hub (Highlights / My ATC / Start CW / E-Ticket)
- **What the user does:** During a live event taps one of four tiles. Highlights→feed; My ATC→participant ATC; Start CW→Beneficiary (select adjustment) or Doer (scan beneficiary QR); E-Ticket→shows a QR e-ticket (or, if locked, the Video Ask).
- **Nav/entry:** `LiveEventControl` embedded strip (Arena dashboard) `liveEventControl.dart:19`.
- **Reads:** uses in-memory `appService.profileJourneyProduct` (eventmode/arenaticket/arenavideoask); generates a new `arena e-ticket log` doc id for the QR payload `:356` (id only, no write here).
- **Writes:** none directly in this file. Start-CW Doer scan calls `appService.livechangeworkqrdata(...)` `:64` (livechangework — ATC-adjacent, in AppServices).
- **Endpoints/Config:** Camera/QR (`qr_code_scanner_plus`, `qr_flutter`). Navigates to `ArenaHighlights`, `ParticipantATC(atcType:"participant")` `:184,:537`, `ArenaVideoAsk` `:619`.
- **Journey stage:** delivery (live event).
- **e2e-testability:** Partial — Highlights / E-Ticket QR display are testable; **My ATC and Start CW open ATC components / livechangework** — ATC OFF-LIMITS, CI-excluded.
- **ATC note:** "My ATC" & "Start CW" route into `ParticipantATC` and `livechangeworkqrdata`; do not seed/test.

### Arena E-Ticket QR
- **What the user does:** Opens an animated QR e-ticket (event name, date, venue) to show the team for entry; if the arena ticket is "locked", routes to the Video Ask instead.
- **Nav/entry:** E-Ticket tile in `LiveEventControl` `liveEventControl.dart:604`.
- **Reads:** `appService.profileJourneyProduct["arenaticket"]` (in-memory); new doc id from `arena e-ticket log` `:356`.
- **Writes:** none in-file (QR payload only; the `uniqueid` is generated client-side).
- **Endpoints/Config:** `qr_flutter` QR render.
- **Journey stage:** delivery.
- **e2e-testability:** Partial — requires seeded in-memory `profileJourneyProduct.arenaticket` (set elsewhere at login); QR render assertable. Not ATC.

### Arena Video Ask (record & upload)
- **What the user does:** Watches the prompt (video/image), opens front camera, records ≥15s, previews, optionally "Share to Snippet Highlights", submits.
- **Nav/entry:** `ArenaVideoAsk` (from LiveEventControl E-Ticket-locked path, or arena flow) `arenaVideoAsk.dart:19`.
- **Reads:** prompt passed in (`askQuestion`); generates `participantvideoask` doc id `:215`.
- **Writes:** local **SQLite** `videoask` table (filename/path/arenaevent/profileid/videoaskid/addtohighlights) `:216`; then `appService.uploadVideoAsk(...)` uploads to `participantvideoask` `:231`; pops with `participantvideoask/{id}` path `:243`.
- **Endpoints/Config:** Camera+mic permissions (`permission_handler`, `image_picker`); publit.io for prompt playback; Firebase Storage via AppService upload; `sqflite`.
- **Journey stage:** content/social (in-event capture).
- **e2e-testability:** No (reliable) — requires real camera recording on device; permission + media capture not automatable in headless e2e. Map as exists. Not ATC.

### Arena story / video-ask player
- **What the user does:** Swipes through full-screen video-ask "stories" (progress bars, left/right tap, close).
- **Nav/entry:** `ParticipantVideoAsk(videoAskList,type)` (pushed from arena/story surfaces) `participantVideoAsk.dart:8`.
- **Reads:** none (list passed in); plays `fileurl` or publit.io HLS→mp4 `:112,:170,:195`.
- **Writes:** none.
- **Endpoints/Config:** `https://media.publit.io/file/h_480/{hls.id}.mp4`; `video_player`, `wakelock_plus`.
- **Journey stage:** content.
- **e2e-testability:** Partial — needs a seeded list with a reachable video URL; player render assertable, playback flaky. Not ATC.

### Explore Arena (layers) + Mark Attended
- **What the user does:** Scrolls arena "layers" (image carousels + bullet descriptions), expands View More, toggles "Mark Attended".
- **Nav/entry:** `ArenaExplore` screen `arenaExplore.dart:11`.
- **Reads:** `arenalayers` (eventref==profileJourneyProduct.eventmode.eventref, delete=false) `:25`.
- **Writes:** `arenalayers/{docId}` — `attended` arrayUnion/arrayRemove(profileid) `:49`.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed `arenalayers` for the event + set in-memory eventmode; assert attended toggle write. Not ATC.

### Arena Highlights feed (+ add post)
- **What the user does:** Reads arena highlights (renders achievement posts, community-manager posts, participant reports); taps + FAB to add a post.
- **Nav/entry:** `ArenaHighlights` screen (from LiveEventControl Highlights) `arenaHighlights.dart:16`.
- **Reads:** `arena highlights` (eventref==eventmode.eventref) `:35`; `post_categories` `:48`.
- **Writes:** none here (FAB → `AddPost`, other surface).
- **Endpoints/Config:** none. Embeds `SnippetList`, `Breakthroughsnewpost`.
- **Journey stage:** content/social.
- **e2e-testability:** Yes — seed `arena highlights` for the event; assert feed renders by `from` type. Not ATC.

### Participant Reports (+ share to community)
- **What the user does:** Views their own arena reports; toggles "Share To Community" (anonymity flag).
- **Nav/entry:** `ParticipantReports` screen `participantsReport.dart:12`.
- **Reads:** `arena highlights` (eventref, profileid, from=="participantreports") `:31`.
- **Writes:** `arena highlights/{docid}` — `anonymous` toggle `:277`.
- **Endpoints/Config:** none.
- **Journey stage:** content/social.
- **e2e-testability:** Yes — seed `arena highlights` (from=participantreports, profileid); assert anonymity toggle write. Not ATC.

### Arena Participant Zone banner
- **What the user does:** Sees "You are in <cohort>. Please go to <zone>" with coordinators/mentors and start time, during a live event.
- **Nav/entry:** `ArenaParticipantZone(eventRef)` embedded `arenaParticipantZone.dart:9`.
- **Reads:** `event participant zones` (profileid, eventref) `:32`; `event zones/{selectedzone}` `:39`; `big cohorts` (docid in, status=active) `:49`; `profile_data` (profileid in mentors+coordinators) `:64`.
- **Writes:** none.
- **Endpoints/Config:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed `event participant zones` + open `event zones` + `big cohorts`; assert banner. Not ATC.

### See How other Peoples Value (impact videos)
- **What the user does:** Taps video thumbnails to watch reference impact videos inline.
- **Nav/entry:** `ImpactPeopleVideo` screen (from uP! wizard) `impactPeopleVideo.dart:9`.
- **Reads:** `static meta data` doc "See How other Peoples Value" (videoUrl) `:26`.
- **Writes:** none.
- **Endpoints/Config:** publit.io playback via `appService.getContent` / `better_player_plus`; `https://media.publit.io/file/{id}.m3u8`.
- **Journey stage:** content.
- **e2e-testability:** Partial — seed `static meta data` doc; thumbnails assertable, playback flaky. Not ATC.

### Product tweet wall — post a tweet
- **What the user does:** Writes and posts a short "tweet" to a product wall (CTD / WiSH / uP! / FastTrack Membership).
- **Nav/entry:** `AddTweets(productName, productCollection)` from PersonalTweets/SocialTweets FAB `addTweets.dart:10`.
- **Reads:** `profile_data/{pid}` (name) `:128`; pid from `UserData()` service.
- **Writes:** `{productCollection}/{id}` — profileid, name, tweet, time `addTweets.dart:186`. (Collection name is the dynamic product code, e.g. `CTD`/`WiSH`/`uP!`.)
- **Endpoints/Config:** none.
- **Journey stage:** social (pre-event).
- **e2e-testability:** Yes — pass productCollection="CTD"; assert tweet doc written. Not ATC.

### Product tweet wall — my tweets / social wall
- **What the user does:** Browses own tweets ("My <product> Tweets") or all tweets ("<product> Social") in list/grid; + FAB to add.
- **Nav/entry:** `PersonalTweets` `personal_tweets.dart:16` / `SocialTweets` `social_tweets.dart:15`.
- **Reads:** `{productCollection}` (PersonalTweets: where profileid, orderBy time; SocialTweets: orderBy time) `personal_tweets.dart:49,:130`, `social_tweets.dart:42,:133`; `profile_data` (snapshot/name) `personal_tweets.dart:63`, `social_tweets.dart:55`.
- **Writes:** none (FAB → AddTweets).
- **Endpoints/Config:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes — seed tweets in `{productCollection}`; assert list/grid. Not ATC.

### Achievements social feed (timeline / report / delete)
- **What the user does:** Scrolls their relevant post timeline (paginated 15), reports a post, deletes own post, opens search/trending.
- **Nav/entry:** `Achievements` screen (imported by `ActionsToTake.dart`) `achievements.dart:19`.
- **Reads:** `user_relevant_timeline/{pid}` (postids, co_participants_ids) `:134`; `Achievements/posts/postcollection/{postid}` `:169`; `Achievements/trendingposts` (postids) `:201`; `profile_data/{pid}` `:91`.
- **Writes:** `Achievements/blacklist/blacklistrows` (report: postid, owner, reportedby, date) `:217`; delete via `AppService().deletePost`.
- **Endpoints/Config:** `SharedPreferences`, `UserData()`, `PackageInfo` (about app). No RemoteConfig/posthog/FCM.
- **Journey stage:** social (post-event).
- **e2e-testability:** Partial — seed `user_relevant_timeline/{pid}` + posts; feed render assertable. NOTE legacy `.document()`/`.documents` API at `:781,:879,:910` may not compile on current cloud_firestore — verify before relying. Not ATC.

### My Celebration (own posts wall)
- **What the user does:** Views their own published posts; sees trending; navigates to CreatePost to "Add" a post.
- **Nav/entry:** `Mycelebration` screen (imported by `ActionsToTake.dart`) `mycelebration.dart:26`.
- **Reads:** `user_data/{uid}/trending/userposts` (postids) `:97`; `Achievements/posts/postcollection` (uid==..., orderBy created) `:584,:970`; `profile_data` (email/user_ref lookup) `:359`.
- **Writes:** `profile_data` doc updateData (number — profile-edit path) `:363`.
- **Endpoints/Config:** legacy old API; navigates to `CreatePost` `:575`.
- **Journey stage:** social.
- **e2e-testability:** Partial — seed own posts + trending; render assertable. Legacy `.document()`/`.documents`/`.updateData` API — verify compile. Not ATC.

### Create / tag / preview / publish a post ("Share my Breakthrough")
- **What the user does:** Composes a post (text + up to several images, today/yesterday option), picks a category + significance/consequence, previews, then publishes (or saves draft / replaces today's post).
- **Nav/entry:** `CreatePost` `createpost.dart:17` → `PostTags` `createpostTags.dart:10` → `PreviewPost` `previewpost.dart:13`. Entered from Mycelebration/Social/changework-completion (`AddPost` is a related but separate Main-Screen widget).
- **Reads:** `profile_data/{pid}` `createpost.dart:55`; `Achievements/posts/postcollection` (uid, created today/yesterday — availability) `:81,:104`; `post_categories` (orderBy type) `createpost.dart:982`, `createpostTags.dart:161`; `drafts` `previewpost.dart:191,:235`.
- **Writes:** `drafts/{id}` (postcategory, postmessage, significance, consequence, private, uid, profileid, postimagelist, publish, predate) `createpost.dart:567,:594`, `previewpost.dart:193,:237`; `Achievements/posts/postcollection/{id}` (published post) `createpost.dart:629`, `previewpost.dart:302`; image uploads to **Firebase Storage** `createpost.dart:587`, `previewpost.dart:214`.
- **Endpoints/Config:** Firebase Storage (`putFile`/`getDownloadURL`); `image_picker`/crop; bucket `fir-sample-aae4a.appspot.com` literal default profile image `createpost.dart:425`. **NOTE: bucket `fir-sample-aae4a` = PRODUCTION** — e2e must point Storage at the test project, never write to prod.
- **Journey stage:** social.
- **e2e-testability:** Partial — text-only post publish is testable against test project; image upload needs Storage + file picker (harder). Legacy `.document()`/`.setData()` API in createpost — verify compile. Not ATC, but PROD-bucket firewall required.

### Live Change Work completion (Beneficiary/Doer) — ATC
- **What the user does:** After a changework is started, marks their side (beneficiary/doer) complete/incomplete, logs hours, adds feedback, then optionally shares the breakthrough to the community.
- **Nav/entry:** `CompleteProcedure(livechangeworkdata)` (from `localTheme.listLiveChangework` / Start-CW flow) `completeProcedure.dart:16`.
- **Reads (default DB):** `livechangework/{docid}` (snapshot) `:63`; `procedures/{procedureid}` `:86`; `profile_data` (beneficiaryid/doerid) `:94`. **Reads (`firestore-atc`):** adjustment ref doc `:70`.
- **Writes (default DB):** `livechangework/{docid}` (beneficiarystatus/doerstatus/procedurestatus/hours) `:236,:268,:302,:1010`. **Writes (`firestore-atc` DB):** `procedures` doc (status=completed, assigned_to, feedback) `:126,:149`. Local **SQLite** `atcsync` + `appService.syncATC` `:107,:138`.
- **Endpoints/Config:** Second Firestore DB **`firestore-atc`** `:29`. Navigates to `AddPost` to share breakthrough `:184`.
- **Journey stage:** progression (changework).
- **e2e-testability:** **No — ATC OFF-LIMITS, CI-excluded.** Writes to `firestore-atc` database + `livechangework` + ATC sync. Map only; never seed/test.
- **ATC note:** `atcTouch=true`.

### (DEPRECATED) Choose Procedure / Start CW Option
- **What the user does:** (Historically) picked an ATC adjustment/procedure (ChooseProcedure) or chose Beneficiary/Doer role via QR (StartCWOption).
- **Nav/entry:** Not wired — both files are headed `// Depreciated` and their navigation/QR is commented out `chooseProcedure.dart:1`, `startcwOption.dart:1`.
- **Reads:** `bigactivity` `:67`, `atc_alpha` (isdelete=false, profileid, orderBy prescription_date) `:77`, subcollections `corrections` `:102` / `procedures` `:136` (ChooseProcedure only).
- **Writes:** none active.
- **e2e-testability:** **No — dead AND ATC (`atc_alpha`).** OFF-LIMITS regardless. `atcTouch=true`.

## Firestore collections

### Read
- `event collection` — start_date / end_date / delete; latest for countdown, future for RSVP/calendar/planning.
- `queue generation` — queuestartdate / queueenddate / queuedates; future queues.
- `arena events` — startdate / enddate / delete / type(event|queue) / productref / eventref / heroevent.
- `delivery events`, `delivery queue` — documentId in; events[]/queue/queuelist, eventname/queuename.
- `event rsvp` — profileid + eventref/eventtyperef (+ arenaeventid); existing RSVP state.
- `event participation request` — eventref/arenaeventid + profileid; request status.
- `products` — id / mode / atcmodel / deliverytype / image / product.
- `participantsproduct` — profileid (+ status null / sequenceorder); owned products.
- `deliverables` — participantproductid + type(queue|event).
- `journey` (+ `journey/{activejourney}`) — atcmodel (B!G gating).
- `workshopconfiguration` (active), `workshop participant enrolled` (profileid+workshopref).
- `classify/bigads` (doc) — B!G upsell ad image/clicklink.
- `atc model` — atcmodel (uP!/B!G); **reference config only (model image/category/videourl), explicitly SAFE per CLAUDE.md.**
- `content_urls` — documentId/docid in; video metadata (publit.io ids).
- `static meta data` — docs "See How other Peoples Value", "Accelerator Evolution Cycle", "Extending Your Impactful Life Years", "Situation Ship".
- `accelerated evolution level` — uP! evolution levels.
- `arenalayers` — eventref + delete; arena explore layers (images/description/attended).
- `arena highlights` — eventref (+ profileid/from); highlights feed & participant reports.
- `event participant zones` (profileid+eventref), `event zones/{id}`, `big cohorts` (docid in, status=active).
- `profile_data` — by pid/profileid/email; name/profile/number/email.
- `post_categories` — type; post category list.
- `Achievements/posts/postcollection` — uid/created/private; published posts. `Achievements/trendingposts` (postids).
- `user_relevant_timeline/{pid}` — postids, co_participants_ids. `user_data/{uid}/trending/userposts` — postids.
- `drafts` — post drafts.
- `{productCollection}` (CTD/WiSH/uP!/FastTrack…) — profileid/tweet/time; product tweet walls.
- `big assignment` (participantidlist arrayContains profileid), `big participants assignments` (profileid).
- **`firestore-atc` DB:** adjustment refs, `profile_data` (completeProcedure). **`atc_alpha` + `corrections`/`procedures` (chooseProcedure — DEAD).** — OFF-LIMITS.

### Written
- `event rsvp` — RSVP responses (availableEvents, eventbyproducts, arenaEventRequest, requestUPevent; +aelid).
- `event participation request` — participation requests (viewupcomingopportunities, eventPlanning batch).
- `participant AEL` — uP! Accelerated Evolution commitment (requestUPevent).
- `interim crossover` — uP! crossover metrics (requestUPevent).
- `big participants assignments` — status ongoing/review + activityref (bigactivity).
- `arenalayers/{id}` — attended arrayUnion/arrayRemove (arenaExplore).
- `arena highlights/{id}` — anonymous toggle (participantsReport).
- `participantvideoask` — uploaded video-ask (arenaVideoAsk, via AppService + local SQLite).
- `{productCollection}/{id}` — product tweet (addTweets).
- `drafts/{id}` + `Achievements/posts/postcollection/{id}` — post draft & publish (createpost, previewpost).
- `Achievements/blacklist/blacklistrows` — reported post (achievements).
- `profile_data` — number update (mycelebration profile-edit path).
- **`firestore-atc` DB `procedures` doc** + default-DB `livechangework/{docid}` — changework completion (completeProcedure). **OFF-LIMITS.**

## Endpoints & external services
- **publit.io video CDN:** `https://media.publit.io/file/{id}.m3u8` (impactPeopleVideo `:63`, requestUPevent `:556`) and `…/h_480/{hls.id}.mp4` (participantVideoAsk `:112`). Playback via `better_player_plus` / `video_player`.
- **Firebase Storage:** image upload `putFile`/`getDownloadURL` (createpost `:587`, previewpost `:214`); video-ask upload via `appService.uploadVideoAsk`. Default-bucket literals reference **`fir-sample-aae4a.appspot.com` = PRODUCTION** (createpost `:425,:748`).
- **External URL launch:** B!G ad `clicklink` via `url_launcher` (eventPlanning `:624`).
- **Local SQLite (`sqflite`):** `videoask` table (arenaVideoAsk) and `atcsync` table (completeProcedure) for offline upload/sync.
- **Camera / QR:** `image_picker` + `permission_handler` (video-ask record); `qr_code_scanner_plus` + `qr_flutter` (Start-CW scan / E-Ticket render).
- No CF `httpsCallable` / Dio / hardcoded `cloudfunctions.net` URLs found in this cluster.
- **Multiple Firestore databases:** default + **`firestore-forms`** (bigactivity Form deliverable `:1086`) + **`firestore-atc`** (completeProcedure `:29` — OFF-LIMITS).

## Config & feature flags
- **No RemoteConfig, posthog, FirebaseMessaging/FCM, or FirebaseAnalytics usage** anywhere in this cluster (verified by grep — empty).
- Behavioural gates are data-driven, not flags:
  - B!G-journey gating via `journey.atcmodel == "B!G"`/`"big"` (viewupcomingopportunities, eventPlanning, requestUPevent).
  - Product `mode` ("Event Mode"/"Installation Event Mode"/"Big Mode") selects which RSVP screen path runs.
  - `arenaticket.lock` (in-memory) toggles E-Ticket vs Video-Ask (liveEventControl `:613`).
  - Firebase projects referenced in code: **`fir-sample-aae4a` = PRODUCTION** (Storage bucket literals) — e2e must firewall/redirect to the test project.

## Dead / clone / Old code
- `PostEvent - Achievements/social.dart` — **DEAD clone of `achievements.dart`** (class `_Social`); no external caller (only self-references; `listGridSocial.dart` is unrelated). Uses legacy `.document()`/`.collection().document()` API.
- `arena Start CW/chooseProcedure.dart` — **DEPRECATED** (file header `// Depreciated`); navigation to CompleteProcedure commented out `:388-405`. Touches `atc_alpha` — ATC, dead.
- `arena Start CW/startcwOption.dart` — **DEPRECATED** (`// Depreciated`); QR scan/render commented out; superseded by the in-file `showStartCWDialog` in `liveEventControl.dart`.
- `Delivery Event/mastercalendar-clone.dart` — filename says "clone" but it **IS live** (real Calendar screen). Its "Plan for this Event" / "Plan For Next 4 Months" buttons are **non-functional** (empty/commented onTap `:568,:920`) — display-only.
- Legacy pre-v0.13 cloud_firestore API (`.document()`/`.setData()`/`.updateData()`/`.documents`) in `achievements.dart`, `createpost.dart`, `mycelebration.dart` (and `social.dart`) — **likely will not compile on current cloud_firestore**; treat these post-screens as stale until verified.
- Large commented-out blocks (alt UI variants) in `availableEvents.dart`, `arenaEventRequest.dart`, `requestUPevent.dart`, `liveEventControl.dart` (the `_AnimatedStartCWDialog`/`_AnimatedETicketDialog` classes are fully commented out).
- `requestUPevent.dart` dormant wizard steps not in active `stepFunctions`: `processTitle`, `extendingYourImpactfulLifeYears`, `situationship`, `worth`, `impactValue`, `validationForm` (defined but unreachable).
- `arenaVideoAsk.dart` / `participantVideoAsk.dart` / `impactPeopleVideo.dart` — large commented-out direct-BetterPlayer blocks (now routed through `appService.getContent`).

## Notes & open questions
- **ATC OFF-LIMITS surfaces in this cluster (map-only, never seed/test):** `completeProcedure.dart` (writes `firestore-atc` + `livechangework` + atcsync); `liveEventControl.dart` "My ATC"/"Start CW" tiles → `ParticipantATC` / `appService.livechangeworkqrdata`; `chooseProcedure.dart` (`atc_alpha`, DEAD); `bigactivity.dart` ATC/Triple-ATC assignment types (web-only notice, no ATC collection access here). `atc model` reads (eventPlanning, requestUPevent) are reference-config and **safe**.
- **Production-bucket risk:** `createpost.dart`/`previewpost.dart` upload to Firebase Storage; default-bucket literals are `fir-sample-aae4a` (PROD). e2e Storage must be redirected to the test project.
- Many screens depend on **in-memory `appService` state** populated at login (`loggedinProfile`, `profileJourneyProduct.eventmode/arenaticket/arenavideoask`, `participantProductList`, `usermetadata.activejourney`). e2e seeding alone is insufficient for arena hub / video-ask / explore — the app must compute these from seeded data during a real login. Open question: exact source of `profileJourneyProduct.eventmode.eventref` (set in AppServices, outside this cluster).
- `pid`/`uid` for tweets & posts come from the `UserData()` service (SharedPreferences-backed), not directly from `appService.loggedinProfile` — confirm both are populated post-login.
- Countdown banner reads only the single most-recent `event collection` doc (orderBy start_date **descending**, limit 1) — if the newest event is in the past, `start_date` is past and the banner hides; it does NOT pick the next future event. Possible logic quirk to flag.
- `arena e-ticket log` doc id is generated client-side for the QR `uniqueid` but no write to that collection happens in-cluster — the scan/redeem side is server/admin (out of cluster).
