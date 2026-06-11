# Cluster: EIFlix Workshop (old + new) & Mentoring

> Static code+config map of the **breakthroughs-flutter** participant app, branch `development`.
> Source dirs: `lib/EIFlix Workshop/` (OLD, dead), `lib/EIFlix Workshop New/` (LIVE), `lib/Mentoring/` (dead, ATC, admin).
> Evidence cited as `file:line`. No app was run / no Firestore queried.

## Overview

This cluster is the participant's **structured cohort/workshop experience** inside the "EiFlix" content area — distinct from on-demand content. A participant discovers a workshop (carousel banner on the EiFlix "All" tab, or a dedicated "Workshop" tab, or a `breakthroughs.app/...?type=workshop` deep link), lands on a rich **enrollment/sales page** (title video, curriculum/"Workshop Flow", sneak-peek, FAQ, testimonials, commitments, price, live-call countdown), and **enrolls**. After enrollment they enter a **challenge runner**: a sequenced flow of sub-activities (video, audio, VideoAsk, form, quiz, evolution-mapping, resource download, note, offer/reward, Zoom live-call) presented one at a time with Next gating, plus a **Q&A discussion tab** and an **Assignments tab**. Assignments can be uploaded (files → Storage) or answered as text, optionally routed for coach review; submissions ping a Slack Cloud Function. Eligibility is gated by many config flags (test mode, journey, tier, subscription/"active participants", new-users-only, category/focus-group selection, cohort/facilitator roles). The **OLD** `EIFlix Workshop/` implementation (a different `eiflix workshop` data model with `tasks`/`taskproperty`) is **deprecated and unreachable** — its only entry point (a carousel fed by `workshopList`) is fully commented out. The **Mentoring** folder is an **ATC** diagnostic tool for coaches/admins (initiate/validate ATC), is marked `// Depreciated`, and its dashboard entry is commented out — it is **OFF-LIMITS** and never part of the participant journey.

---

## Screens

### LIVE — `EIFlix Workshop New/`
| Screen | file:line | Purpose |
|---|---|---|
| WorkshopListView | `EIFlix Workshop New/workshop_list_view.dart:12` | Grid of workshop cards ("Ongoing"/"Completed"), shown on the EiFlix **Workshop** tab. Reads config + enrolment to badge Enrolled/Test/Completed; taps route to challenges or enrollment. |
| WorkshopCard | `EIFlix Workshop New/workshop_list_view.dart:353` | Animated card (thumbnail, date range, badges) inside the list. |
| EiFlixWorkshop (enrollment/detail) | `EIFlix Workshop New/workshopenrollment.dart:22` | Workshop sales/landing page + enrollment engine. All eligibility checks, category/focus-group dialog, "Let's begin" dialog, facilitator welcome, live-call countdown, curriculum accordion, enroll button. |
| WorkshopChallenges (challenge runner) | `EIFlix Workshop New/workshopchallenges.dart:36` | Core experience: 3 tabs (Challenges / Q&A / Assignments). Sequenced sub-activity player + status state machine + completion recap. |
| QATabContent | `EIFlix Workshop New/Tabs/qa_tab_content.dart:10` | Workshop discussion: ask question, reply, tag, delete; "Your questions" vs "Others Asked". |
| AssignmentsTabContent | `EIFlix Workshop New/Tabs/assignments_tab_content.dart:5` | Lists completed assignment sub-challenges grouped by challenge (pure UI; data passed in). |
| WorkshopQuizScreen | `EIFlix Workshop New/workshopwidgets/workshopquiz.dart:7` | Multi-question quiz player; writes results + back-writes to participant doc. |
| ThumbnailVideoPlayer | `EIFlix Workshop New/workshopwidgets/VideoPlayerWidget.dart:5` | Tap-thumbnail → BetterPlayer inline player (sales-page videos). Pure UI. |
| CountdownTimerWidget / CompactCountdownTimer / ZoomUnit | `EIFlix Workshop New/workshopwidgets/countdown.dart:6,348,254` | Live-call countdown timers. Pure UI. |
| WorkshopDetailWidgets (static) | `EIFlix Workshop New/workshopwidgets/enrollmentpage.dart:8` | Static builders: sneak-peek, know-info/commitments, testimonials, FAQ, bonus/included, enrollment shimmer. Pure UI. |
| workshopWidget / VideoThumbnailWidget / VideoPlayerDialog | `EIFlix Workshop New/workshopwidgets/workshopscreenwidget.dart:9`, `testimonial.dart:5,95` | Shared buttons, share icon, offer card, star image, MIME helpers; testimonial video dialog. Pure UI. |

### DEAD — `EIFlix Workshop/` (legacy, unreachable)
| Screen | file:line | Purpose (legacy) |
|---|---|---|
| WorkshopEnrolment (OLD) | `EIFlix Workshop/workshopEnrolment.dart:28` | Legacy enrollment + task list. Only inbound ref is `EIFlix/eiflixHome.dart:1617`, fed by `workshopList`, which is populated **only** inside a commented-out block (`eiflixHome.dart:84-113`). |
| WorkshopChallenge (OLD) | `EIFlix Workshop/workshopChallenge.dart:17` | Legacy challenge/task screen; navigates to OLD video player / evolution VA. |
| EiflixVideoPlayer (OLD) | `EIFlix Workshop/eiflixVideoPlayer.dart:12` | Legacy content video player (publit.io HLS), PostHog capture, `content analytics` write. |
| EvolutionMappingVA (OLD) | `EIFlix Workshop/evolutionMappingVA.dart:15` | Legacy evolution-mapping video player; `participantvideoask` write. |
| LivecallWorkshop (OLD) | `EIFlix Workshop/livecallWorkshop.dart:6` | Legacy live-call countdown display. Pure UI (no Firestore/launch). |
| WorkshopReward (OLD) | `EIFlix Workshop/workshopReward.dart:9` | Legacy group-challenge reward claim. Writes `workshop reward claimed`. |
| WorkshopStart (OLD) | `EIFlix Workshop/workshopStart.dart:5` | Legacy "start" splash. |
| _WorkshopVideoPlayer (testvideo) | `EIFlix Workshop New/testvideo.dart:9` | Standalone workshop video player; referenced ONLY in a commented line (`workshopchallenges.dart:6387`) → DEAD. |

### DEAD — `Mentoring/` (ATC, admin/coach, OFF-LIMITS)
| Screen | file:line | Purpose |
|---|---|---|
| DiagnosticsMentoring | `Mentoring/diagnosticMentoring.dart:13` | Lists `atc_initiated`; admin/coach tool. Marked `// Depreciated`. Entry at `BIG Dashboard/EIS Dashboard.dart:442` is commented out. |
| InitiateATC | `Mentoring/initiateATC.dart:8` | Form to initiate an ATC (writes `atc_initiated`). |
| ValidateATC | `Mentoring/validateATC.dart:11` | Reads `atc_alpha`/`corrections`/`procedures` to validate an ATC. |

---

## Features

### LIVE — discovery & enrollment

### View workshop list (Workshop tab)
- **What the user does:** Browses available workshops as cards under "Ongoing" and "Completed", sees Enrolled / Test Mode / Completed badges and date ranges.
- **Nav/entry:** EiFlix home → "Workshop" tab (`EIFlix/eiflixHome.dart:1171,1218-1219` → `WorkshopListView`). Tab itself only shows when `showWorkshop` is true (`eiflixHome.dart:1160,197`).
- **Reads:** `workshopconfiguration` where `active==true OR testmode==true OR workshopcompleted==true` (live snapshot) `workshop_list_view.dart:60-65`; `workshop participant enrolled` where `profileid==me` `:84-87`. Client-side filter: test-mode workshops require `me ∈ testusers` `:272-276`.
- **Writes:** none.
- **Endpoints:** placeholder image from `firebasestorage…/starlabs-test…` `:706`.
- **Config flags:** `active`, `testmode`, `testusers`, `workshopcompleted`; gate `static meta data/Workshop Admin.showworkshopinapp`.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed `workshopconfiguration` docs + enrolment docs in test project; assert list/badges.

### Open a workshop (route by enrollment status)
- **What the user does:** Taps a card; if already enrolled (status `enrolled`) goes straight to the challenge runner, otherwise to the enrollment page.
- **Nav/entry:** `WorkshopCard.onTap` → `navigateToWorkshop()` `workshop_list_view.dart:167-199`.
- **Reads:** `workshop participant enrolled` where `profileid==me AND workshopref==<config doc ref>` `:171`.
- **Writes:** none (navigation only). Pushes `WorkshopChallenges` (`participantworkshopref` from enrolment doc) or `EiFlixWorkshop`.
- **Journey stage:** content.
- **e2e-testability:** Yes.

### Open a workshop via deep link
- **What the user does:** Opens `…?type=workshop&docid=<id>`; app routes to challenges (if enrolled) or enrollment page.
- **Nav/entry:** `deeplinkNavigation.dart:127-175` (`widget.type == "workshop"`).
- **Reads:** `workshopconfiguration/<docid>` `deeplinkNavigation.dart:130`; `workshop participant enrolled` where `profileid==me AND workshopref==ref` limit 1 `:134`.
- **Writes:** none.
- **Journey stage:** content / onboarding (re-entry).
- **e2e-testability:** Partial — deep-link plumbing is hard in Flutter e2e; the destination screens are testable directly.

### View workshop sales/detail page
- **What the user does:** Reads title, short description, plays title video, expands "Workshop Flow" curriculum, sees sneak-peek, commitments, "who is this for", testimonials, FAQ, bonus/included, price, and a live-call countdown if a Zoom call is upcoming.
- **Nav/entry:** `EiFlixWorkshop` build → `buildGradientSection`/`buildMobileLayout` `workshopenrollment.dart:2286-2311,1153-1402`. Also reachable from the "All" tab hero carousel (`eiflixHome.dart:1224-1291`).
- **Reads:** `workshopconfiguration/<workshopId>` live `:114`; `participant metadata/<profileid>` live `:80`; `episodes` (all, for durations) `:98`; `workshopcategory` (all) `:67`; `big cohorts` whereIn `cohortsforthisworkshop` `:227`.
- **Writes:** none on view.
- **Endpoints:** title/sneak/testimonial videos via `ThumbnailVideoPlayer` (network URLs from config; publit.io/Storage). `renderHtml` for rich text.
- **Config flags (display):** `detailpage.*` (title/description/whyworkshop/sneakpeak/knowinfo/joinus/testimonialmap/faq/enablebonus/price/pricestriked/day/workshopoverview/registration+workshop dates), `challenges`, `cohortsforthisworkshop`, `facilitator`/`facilitatorprofiles`.
- **Journey stage:** purchase (sales page) / content.
- **e2e-testability:** Yes — seed a full `workshopconfiguration` doc with `detailpage` + `challenges`.

### Enroll in a workshop (eligibility-gated)
- **What the user does:** Taps the enroll button (label from `detailpage.enrollbuttonname`); passes eligibility checks; gets "Congratulations / Let's begin"; enters challenges (or focus-group selection first).
- **Nav/entry:** enroll button → `enrollWorkshop()` `workshopenrollment.dart:261,1745-1749`.
- **Reads (eligibility):** `participant metadata` (`activejourney`, `tier`, `customerstatus`) `:80,307,319,334`; `loggedinProfile` (`workshoponly`, `profileid`).
- **Writes:**
  - `participant workshop` (new doc): `docref,profileid,workshopref(→workshopconfiguration),challenges,detailpage,created,evergreenWorkshop` `:382-391`.
  - `workshop participant enrolled` (new doc): `profileid,workshopref,participantworkshopref,enrollmentdate,status(="enrollednotstarted" if categorybased else "enrolled"),workshopStartedAt,evergreenWorkshop` `:392-401`.
  - back-update `participant workshop.workshopparticipantenrolledRef` `:402-404`.
  - `supportchat/<selectedgroup>` arrayUnion member (auto-join group) `:992-1019`.
- **Eligibility gates (config-driven):** `newusersonly` → requires `loggedinProfile.workshoponly==true` `:278`; registration window (`registrationStartDate/EndDate`) unless `evergreenWorkshop` `:284-297`; `challenges` must exist `:299`; `journeybased`+`selectedjourneys` vs `activejourney` `:305`; `tierbased`+`selectedtiers` vs `participant.tier` `:317`; `activeparticipants` → `customerstatus=='active'` `:332-334`.
- **Config flags:** `categorybased`, `newusersonly`, `evergreenWorkshop`, `journeybased`, `tierbased`, `activeparticipants`, `selectedgroup`, `evergreenWorkshopMeta`.
- **Journey stage:** purchase / onboarding.
- **e2e-testability:** Yes — high value. Seed eligible participant + config; assert the two new docs + group membership.

### Select focus-group / category (category-based workshops)
- **What the user does:** Watches a category video, picks a focus group via radio, taps "Start Immersing"; status flips to `enrolled` with chosen `workshopcategory`.
- **Nav/entry:** auto-dialog after enroll when `categorybased==true` & not cohort/facilitator `workshopenrollment.dart:199-217,441`.
- **Reads:** `workshopcategory` (names/descriptions) `:67`; config `categoriesforthisworkshop`, `categorythumbnail`, `categoryVideo`.
- **Writes:** `workshop participant enrolled/<docid>` and its `participantworkshopref` → `{status:'enrolled', workshopStartedAt, workshopcategory, categorybased:true}` `:933-963`. Cohort participants get `cohortcategoriesforthisworkshop[0]`+`cohortparticipant`; facilitators just `categorybased:true` `:945-956`.
- **Journey stage:** onboarding.
- **e2e-testability:** Yes (category-based config).

### Facilitator / cohort-participant welcome
- **What the user does:** Facilitators / above-diagnostics cohort members see a custom HTML welcome (`cpwelcomemessage`) then "Start Immersing".
- **Nav/entry:** `showFacilitatorWelcomeDialog()` `:819`; role computed at `:150` (`facilitator==true && me ∈ facilitatorprofiles`) and cohort at `:230` (me ∈ cohort `participantidlist`).
- **Reads:** `big cohorts` (participant lists) `:227`; config `cpwelcomemessage`.
- **Config flags:** `facilitator`, `facilitatorprofiles`, `cohortsforthisworkshop`, `cohortcategoriesforthisworkshop`.
- **Journey stage:** onboarding (role-specific).
- **e2e-testability:** Partial — needs facilitator/cohort fixtures; lower priority.

### LIVE — challenge runner (`workshopchallenges.dart`)

### Auto-resume to current activity
- **What the user does:** On entering the runner, the app auto-selects the first incomplete visible sub-activity (respecting category/facilitator visibility).
- **Nav/entry:** `WorkshopChallenges` initState → `getParticipantWorkshopData()` + `autoSelectCurrentActivity()` `:116,121,329`.
- **Reads:** `participantworkshopref` doc live snapshot `:122`; `workshopconfiguration/<workshopId>` (via `configWorkshopData`); `episodes` for durations `:169`.
- **Writes:** none (selection only).
- **Journey stage:** content/progression.
- **e2e-testability:** Yes.

### Watch a video / audio sub-activity
- **What the user does:** Plays the activity's content; on completion it auto-marks finished and the Next button advances.
- **Nav/entry:** `buildVideoBlock` + `getContent()` `:6262,7250` (via shared `AppService.getContent`, BetterPlayer).
- **Reads:** content doc via `contentref` (DocumentReference, e.g. `episodes/...`); `episodes` durations.
- **Writes:** on complete → `participant workshop.challenges[..]` sub-status `finished` via `updateResultNotMove(null,false)` `:7262,1167`. (Analytics `content analytics` write happens inside `AppService.getContent` with `videoFrom:"eiflixworkshop"`, `saveAnalytics:true` — outside this cluster's files.)
- **Endpoints:** publit.io HLS (commented fallback `media.publit.io/file/<id>.m3u8` `:7277`); actual playback via AppService.
- **Journey stage:** content/progression.
- **e2e-testability:** Partial — video playback/`onComplete` is hard to drive in e2e; the resulting status write is assertable if triggered.

### Answer a VideoAsk
- **What the user does:** Records/answers a VideoAsk question; submission is saved and the activity marked finished.
- **Nav/entry:** `buildVideoask` → `openVideoaskScreen()` → pushes `ArenaVideoAsk` `:7036,7181-7233`.
- **Reads:** VideoAsk question doc via `firestore.doc(VAQPath).get()` `:7195`.
- **Writes:** `updateResultNotMove(submissionRef,false)` stores the returned submission ref + status `finished` `:7246-7248`. (The actual VideoAsk answer doc is written by `ArenaVideoAsk`, outside this cluster; `eventPath = workshopref.path`.)
- **Journey stage:** content/progression.
- **e2e-testability:** Partial (depends on ArenaVideoAsk recording).

### Fill a form
- **What the user does:** Completes a delivery form; submission ref saved; activity finished (or routed to review).
- **Nav/entry:** `buildForm` → `openFormScreen()` → pushes `FillForm` `:7643,7788-7804`.
- **Reads/Writes:** form lives in the **`firestore-forms`** named DB (`FirebaseFirestore.instanceFor(... databaseId:"firestore-forms")`) `:7794`; metadata passes `workshopref` `:7800`. On return: if `reviewassignemnt==true` → `updateResult(ref,true)` (status `inreview`), else `updateResultNotMove(ref,false)` (status `finished`) `:7816-7821`.
- **Journey stage:** content/progression.
- **e2e-testability:** Partial — cross-screen (FillForm) + separate Firestore DB.

### Take a quiz
- **What the user does:** Answers each quiz question; sees correct/incorrect; quiz completes when all answered.
- **Nav/entry:** `buildQuiz` → `openQuizScreen()` → pushes `WorkshopQuizScreen` `:7510-7530`.
- **Reads:** each `quizref` DocumentReference (`options`, `isCorrect`) `workshopquiz.dart:55`; restores prior `quizResults` from participant doc `:79-122`.
- **Writes:** `quizbyclients/<id>` per answer (`quizid,quizref,profileid,selectedAnswer,isCorrect,answeredAt,submittedIn:"workshop",workshopref,participantWorkshopRef,quizData`) `workshopquiz.dart:140-163`; back-writes participant `challenges[..].quizResults[i]`=ref, `quizAnswered:true`, and on all-done sets sub `status:'completed'` (+ challenge completed if `markChallengeCompletedOnFinish`) `:183-222`.
- **Config flags:** sub-challenge `quizref` (list).
- **Journey stage:** content/progression.
- **e2e-testability:** Yes — seed quiz docs; drive the quiz screen; assert `quizbyclients` + participant writeback.

### View evolution-mapping (before/after)
- **What the user does:** Watches their own "before" then "after" recorded videos (2/2) for an evolution-mapping step.
- **Nav/entry:** `buildEvolutionMapping` + `playEvolutionVideo` `:6490,6574`; content loaded by `ensureEvolutionContentLoaded()` `:260`.
- **Reads:** resolves `finalevolution`/`finalevolutiontype` sub-challenge `result` DocumentReferences and fetches them (`fileurl`,`docid`) `:266-310`.
- **Writes:** completion via `updateResult(null,false)`/`moveToNextChallenge`.
- **Journey stage:** content/progression.
- **e2e-testability:** Partial (depends on pre-existing evolution video docs).

### Download a resource
- **What the user does:** Downloads an attached resource file; activity marked finished.
- **Nav/entry:** resource block → `downloadResource()` `:6214`.
- **Writes:** `updateResultNotMove(null,false)` after enqueue `:6249`. Uses `FlutterDownloader` + storage permission `:6179,6238`.
- **Journey stage:** content.
- **e2e-testability:** Partial (native download + permission).

### Submit an assignment (upload or text) + optional review
- **What the user does:** Uploads file(s) or types a text answer for an assignment sub-challenge; optionally submitted for coach review (status `inreview`/`rework` flow).
- **Nav/entry:** assignment block; `uploadAssignment()` (pick) `:628`, `submitAssignment(review)` `:664`, text via `updateResultNotMove`/`updateResult`.
- **Reads:** sub-challenge config (`uploadtype`, `submissionformat`, `assignmenttype`, `reviewassignemnt`).
- **Writes:**
  - Files → **Storage** `workshopassignment/<ts>_<name>` `:732-745`.
  - participant `challenges[..]`: `assignmentresult`=urls + status (`finished` if no review, else `inreview` with `reviewid`/`reviewed`, or re-submit `inreview`+`resubmissionCount` from `rework`) `:930-964`.
  - **Slack CF** ping when `workshopConfigData.active==true` (`sendSlackMessage`) `:969-981,1216-1226`.
- **Endpoints:** Storage; CF `workshopAssignment` (prod `us-central1-fir-sample-aae4a`, test `us-central1-starlabs-test`) `:791-811`.
- **Config flags:** `active` (gates Slack), sub `uploadtype/submissionformat/assignmenttype/reviewassignemnt`.
- **Journey stage:** content/progression (+ support via review).
- **e2e-testability:** Yes for the Firestore/Storage write; the Slack CF is an external side-effect (firewall in test; `active==false` test configs skip it). NOTE: CF URL hardcodes the **prod** functions host for prod project — keep test configs on `starlabs-test`.

### Join a Zoom live-call
- **What the user does:** Taps to join a scheduled Zoom live-call; can mark it attended/completed.
- **Nav/entry:** `buildZoomCallPreview` `:7979`; `zoomCallNavigation(zoomLink)` `launchUrl` external `:4141`; `acceptOffer` also launches links `:572`.
- **Reads:** challenge item `zoomcall` (`duedate`,`duetime`,`zoomlink`,`headicon`,`startlivecall`).
- **Writes:** `updateZoomResult()` sets challenge `status:'completed'` `:4109-4123`.
- **Journey stage:** delivery (live session).
- **e2e-testability:** Partial — external `launchUrl`; the status write is assertable.

### Claim an offer / reward (in-flow)
- **What the user does:** On an "offer" sub-activity, taps "Claim Now" to open a reward link.
- **Nav/entry:** `buildOfferPreview` → `acceptOffer(rewardlink)` `:7889-7949,572`.
- **Writes:** none in-cluster (link launch). Journey: content.
- **e2e-testability:** Partial (external link).

### Advance / complete the workshop
- **What the user does:** Presses Next through activities; sees a completion recap; can share an experience + star rating.
- **Nav/entry:** `moveToNextChallenge()` `:423`; recap `buildAllChallengesCompletedRecap` `:4243`; `submitExperience()` `:184`.
- **Writes:** `participant workshop` `challenges[..]` status transitions (`completed`/`finished`); on final step of an **evergreen** workshop writes a `notificationrecord` doc `:1301-1316,230`; experience → `participant workshop.{sharedexperience,starrating}` `:184-195`.
- **Config flags:** `evergreenWorkshop`, `evergreenWorkshopMeta.lastChallengeMessage`.
- **Journey stage:** progression / content completion.
- **e2e-testability:** Yes.

### "Clear mobile action" (web-camera handoff)
- **What the user does:** Clears a pending mobile recording action so they can record via web camera instead.
- **Nav/entry:** `clearWorkshopAction()` `:862`.
- **Writes:** `appactionpending/<profileid>` merge `{lastupdate, workshopaction: delete()}` `:864-867`; resets sub-challenge status.
- **Journey stage:** infra/support.
- **e2e-testability:** Yes (Firestore write).

### Workshop Q&A — ask / reply / delete
- **What the user does:** Posts a question, replies (optionally tagging a user), deletes own items; sees "Your questions" vs "Others Asked"; A&H Team answers are badged.
- **Nav/entry:** "Q & A" tab → `QATabContent` (gated by config `qanda`) `workshopchallenges.dart:2219-2222`, `qa_tab_content.dart:831`.
- **Reads:** `workshopQA` where `workshopId==<config id> AND replyid==null AND isdelete==false` orderBy date `:62-68`; replies where `replyid==<qid>` `:519-523`; name maps from `profile_data` + `new_user_data` (all docs) `:89-90`.
- **Writes:** `workshopQA/<auto>` for question `:160-169` and reply (`tag`,`replyid`) `:202-219`; soft delete `workshopQA/<id>.isdelete=true` `:135-138`.
- **Config flags:** `qanda` (bool).
- **Journey stage:** social/support.
- **e2e-testability:** Yes — high value; seed config `qanda:true`; post/reply/delete; assert `workshopQA`. (Reads ALL `profile_data`+`new_user_data` — large in prod, fine in test.)

### Assignments tab (review completed)
- **What the user does:** Browses their completed assignment sub-challenges grouped by challenge; tapping is wired via callback (selection).
- **Nav/entry:** "Assignments" tab → `AssignmentsTabContent` (data passed from participant doc) `assignments_tab_content.dart:5`.
- **Reads/Writes:** none directly (derives from `participantWorkshopData.challenges`). NOTE: in the primary build (`workshopchallenges.dart:2223-2238`) the Assignments tab is rendered as an empty `Column` placeholder; `AssignmentsTabContent` is imported and wired in an alternate build path (`:5725`).
- **Journey stage:** content.
- **e2e-testability:** Yes (UI-only, derived).

### DEAD / legacy — `EIFlix Workshop/` (map only, do NOT test)

### (DEAD) Legacy workshop enrollment + tasks
- **What it did:** Enroll into `eiflix workshop`; create `eiflix participant workshop` (`tasks`,`taskproperty`,`groupchallenge`) + `eiflix participant enrolled`; create a support-chat group; run tasks (form/videoask/video/audio/evolution/livecall), claim rewards, see WorkshopStart.
- **Why dead:** sole entry `eiflixHome.dart:1617` is fed by `workshopList`, populated only in the commented `eiflix workshop` block (`eiflixHome.dart:82-114`); the deep-link OLD branch is also commented (`deeplinkNavigation.dart:176-200`).
- **Reads/Writes (legacy):** `eiflix workshop`, `eiflix participant enrolled` `workshopEnrolment.dart:628-642`, `eiflix participant workshop` (set `:609-623`, update `:682`), `eiflix workshop challenges`, `workshop reward claimed` `workshopReward.dart:71`, `supportchat`(+`messages`) `:499-573`, `content analytics` `eiflixVideoPlayer.dart:203-208` / query `workshopEnrolment.dart:271`, `participantvideoask` `evolutionMappingVA.dart:57,204`.
- **Endpoints:** publit.io HLS (`eiflixVideoPlayer.dart:172`, `evolutionMappingVA.dart:120,157,326`); PostHog `capture` `eiflixVideoPlayer.dart:223`; share link `breakthroughs.app/generalcontent/<docid>` `:381`.
- **e2e-testability:** No — unreachable legacy code; do not seed `eiflix *` collections.

### Mentoring — ATC (OFF-LIMITS)

### (ATC, dead) Diagnostics Mentoring / Initiate ATC / Validate ATC
- **What it did:** Coaches/admins list initiated ATCs, initiate a new ATC for a client/specialist/product, and validate an ATC.
- **Reads:** `atc_initiated` (admin: all; else where `initiatedby==profile_data/<pid>`) `diagnosticMentoring.dart:42-54`; `products` orderBy `atcmodel`, `users_roles` `initiateATC.dart:44,56`; `atc_alpha/<id>` + `corrections`/`procedures` subcollections `validateATC.dart:41,170,219`.
- **Writes:** `atc_initiated/<id>` `initiateATC.dart:80-90`.
- **Entry:** `BIG Dashboard/EIS Dashboard.dart:442` — **commented out**; files marked `// Depreciated`.
- **ATC flag:** **atcTouch=true**, e2eTestable=**false**, "ATC OFF-LIMITS — CI-excluded". Map that it exists; never seed/test.
- **Journey stage:** support/infra (coach/admin tool, not participant).

---

## Firestore collections

### Read (LIVE cluster)
- `workshopconfiguration` — by id and via `or(active,testmode,workshopcompleted)`; fields: `active,testmode,testusers,workshopcompleted,detailpage{...},challenges[],categorybased,categoriesforthisworkshop,categorythumbnail,categoryVideo,cohortsforthisworkshop,cohortcategoriesforthisworkshop,facilitator,facilitatorprofiles,cpwelcomemessage,newusersonly,evergreenWorkshop,evergreenWorkshopMeta,journeybased,selectedjourneys,tierbased,selectedtiers,activeparticipants,selectedgroup,qanda`.
- `workshop participant enrolled` — where `profileid==me` (+ `workshopref==`, `status==`); fields: `profileid,workshopref,participantworkshopref,status,enrollmentdate,workshopStartedAt,workshopcategory,categorybased,cohortparticipant,evergreenWorkshop`.
- `participant workshop` — via `participantworkshopref` live snapshot; fields: `docref,profileid,workshopref,challenges[],detailpage,sharedexperience,starrating,workshopparticipantenrolledRef`.
- `participant metadata/<profileid>` — `activejourney,tier,customerstatus`.
- `episodes` — all (duration map); also content via `contentref`.
- `workshopcategory` — all (name/description).
- `big cohorts` — whereIn `cohortsforthisworkshop` (`participantidlist`).
- `workshopQA` — where `workshopId==<id>`, `replyid`(null/eq), `isdelete==false`.
- `profile_data`, `new_user_data` — all (display-name maps in Q&A).
- quiz refs (`quizref` → quiz docs), evolution `result` refs, VideoAsk `VAQPath`, group `supportchat/<selectedgroup>`.

### Written (LIVE cluster)
- `participant workshop` (created at enroll; updated for every activity status, `assignmentresult`, `quizResults`, `sharedexperience`/`starrating`).
- `workshop participant enrolled` (created at enroll; updated on category start).
- `supportchat/<selectedgroup>` (arrayUnion `members`, `last_modification`).
- `workshopQA` (questions, replies, soft-delete `isdelete`).
- `quizbyclients` (one per quiz answer).
- `notificationrecord` (evergreen final-step message).
- `appactionpending/<profileid>` (clear mobile action).
- **Storage:** `workshopassignment/<ts>_<name>` (assignment uploads).

### DEAD/legacy written (do NOT seed): `eiflix workshop`, `eiflix participant enrolled`, `eiflix participant workshop`, `eiflix workshop challenges`, `workshop reward claimed`, `content analytics`(legacy), `participantvideoask`, `supportchat`/`messages`(legacy).

### ATC (OFF-LIMITS, read+write): `atc_initiated` (R/W), `atc_alpha`+`corrections`+`procedures` (R), `products`,`users_roles`,`profile_data` (R).

---

## Endpoints & external services
- **Cloud Function `workshopAssignment`** (Slack notify): prod `https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopAssignment`, test `https://us-central1-starlabs-test.cloudfunctions.net/workshopAssignment` (`workshopchallenges.dart:796-799`). Project-switched via `Firebase.app().options.projectId`.
- **Firebase Storage** — assignment uploads (`workshopassignment/…`); many hardcoded `firebasestorage.googleapis.com` image URLs from both `starlabs-test.firebasestorage.app` and `fir-sample-aae4a.appspot.com` (UI assets) — see `qa_tab_content.dart:450,637`, `workshop_list_view.dart:706`, `workshopchallenges.dart:2560,4330,…`, `workshopscreenwidget.dart:338,449,493`.
- **Firestore named DB `firestore-forms`** — form submissions for the form sub-activity (`workshopchallenges.dart:7794`).
- **BetterPlayer / publit.io HLS** — video playback (`media.publit.io/file/<id>.m3u8`) via shared `AppService.getContent`; legacy direct refs in OLD files.
- **`launchUrl` (url_launcher)** — Zoom links, offer/reward links (`workshopchallenges.dart:4145,576`).
- **FlutterDownloader** — resource downloads (`workshopchallenges.dart:6238`).
- **PostHog** — capture in OLD `eiflixVideoPlayer.dart:223` only (dead); no PostHog in LIVE cluster files.
- **3 Firebase projects referenced:** prod `fir-sample-aae4a`, test `starlabs-test` (both in CF switch + Storage URLs); staging `launch-your-legacy-development` not referenced here.

---

## Config & feature flags
- **Gate (Firestore-backed flag):** `static meta data/Workshop Admin.showworkshopinapp` → shows the EiFlix "Workshop" tab (`eiflixHome.dart:197,1160`); same doc holds `sharemessage`.
- **Per-workshop config flags** (all on `workshopconfiguration`): `active`, `testmode`+`testusers`, `workshopcompleted`, `categorybased`, `newusersonly`, `evergreenWorkshop`(+`evergreenWorkshopMeta`), `journeybased`+`selectedjourneys`, `tierbased`+`selectedtiers`, `activeparticipants`, `facilitator`+`facilitatorprofiles`, `cohortsforthisworkshop`+`cohortcategoriesforthisworkshop`, `categoriesforthisworkshop`, `qanda`, `selectedgroup`, `enableshare`/`heromobile`/`heroImageMobile` (carousel on All tab).
- **Participant flags consumed:** `loggedinProfile.workshoponly`, `participant metadata.activejourney/tier/customerstatus`.
- **No Firebase Remote Config** is used in any cluster file (grep for `remoteConfig`/`RemoteConfig` returned nothing).

---

## Dead / clone / Old code
- **Entire `EIFlix Workshop/` folder (OLD)** — deprecated `eiflix workshop` model. Unreachable: `workshopList` carousel source is commented (`eiflixHome.dart:82-114`); OLD deep-link branch commented (`deeplinkNavigation.dart:176-200`). Files: `workshopEnrolment.dart`, `workshopChallenge.dart`, `eiflixVideoPlayer.dart`, `evolutionMappingVA.dart`, `livecallWorkshop.dart`, `workshopReward.dart`, `workshopStart.dart`.
- **`EIFlix Workshop New/testvideo.dart`** (`_WorkshopVideoPlayer`) — referenced only in a commented line (`workshopchallenges.dart:6387`).
- **`Mentoring/` folder** — `// Depreciated` + ATC + admin/coach; dashboard entry commented (`EIS Dashboard.dart`). OFF-LIMITS.
- **Large commented blocks** inside live files: alternate `buildGradientSection` (`workshopenrollment.dart:2235-2284`), commented category-name rendering in curriculum, commented `getAnalytics`/old `getParticipantWorkshopData` in challenges, inline `getContent` fallback (`workshopchallenges.dart:7272-7299`). These are not live behavior.

---

## Notes & open questions
- **LIVE vs OLD is unambiguous:** the NEW system writes `participant workshop` / `workshop participant enrolled` with a `challenges[]` array; the OLD system writes `eiflix participant *` with `tasks`/`taskproperty`. Tests must target the NEW collections only.
- **Slack CF & prod host:** assignment submit calls a prod Cloud Functions URL when on the prod project; the code branches by `projectId`, so test-project configs route to `starlabs-test`. Still, gate test runs with `active==false` (Slack only fires when `active==true`) to avoid external Slack noise. (Matches the e2e prod-endpoint-firewall guidance in memory.)
- **Q&A reads all of `profile_data` + `new_user_data`** to resolve display names — acceptable in test, heavy in prod; not a correctness issue.
- **Forms use a separate Firestore database** (`firestore-forms`) — any form-submission assertions must point at that DB, not `(default)`.
- **`AppService.getContent`** (outside this cluster) owns actual video playback + the `content analytics` analytics write with `videoFrom:"eiflixworkshop"`. The video `onComplete` is what advances status; driving real completion in e2e is the main testability gap for video/VideoAsk/form/evolution activities.
- **Assignments tab placeholder:** the live primary build renders the Assignments tab as an empty column (`workshopchallenges.dart:2233-2235`) while a second build path wires `AssignmentsTabContent` (`:5725`). Unclear which path is active at runtime — confirm before asserting assignment-tab content. (`unclear`)
- **`cohortcategoriesforthisworkshop[0]`** is assumed non-empty for cohort participants (`workshopenrollment.dart:953`); malformed configs could throw — edge case for seeding.
