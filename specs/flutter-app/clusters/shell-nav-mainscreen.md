# Cluster: App shell, navigation & Main Screen (timeline/explore/dashboards/actions)

## Overview
This cluster is the participant app's skeleton: the boot/splash + auth gate, the global Firebase/notification/audio/deeplink bootstrap, the 5-tab bottom-navigation shell (`Home`, `Explore`, `Solar Voice`, `Ei-Flix`, `My Journey`), and the AppBar action row (notifications, post, chat, menu) shared across tabs. The **Home tab** (`homeContent.dart`, ~11k lines) is a dynamic, server-config-driven feed that surfaces today's priority content, queue/event/BiG controls, scope-enhancement requests, HPC tools, quizzes, surveys, evolution/interim-report prompts, recommended mixes, a hero video and an infinite timeline of ads/health-stories/breakthroughs/community-posts. The **Explore tab** is the breakthroughs social grid + content search. **My Journey tab** (`myProfileDashboard.dart`) is the participant's profile/journey dashboard (roadmap, products, playlists, workshops, saved content, breakthroughs). The shell also owns notification routing, deeplink handling, in-app sticky messages, support-chat unread badges, and force-update version checks. It is the navigation hub from which nearly every other cluster is launched.

## Screens
| Screen | file:line | Purpose |
|---|---|---|
| MyApp / MaterialApp | main.dart:405 | Root app, locales (38), named routes (`/login` `/register` `/home` `/forgotpassword`), navigatorKey, splash `MyHomePage` |
| MyHomePage (splash) | main.dart:466 | 2s splash → auth gate: pushReplacement to `Home` (logged in) or `Login` |
| Home (5-tab shell) | home.dart:46 | Bottom-nav (`screenIndex`), onboarding gate, all global listeners (profile/metadata/queue/event/delivery/support/version/deeplink) |
| HomeContent (Home tab) | Main Screen/homeContent.dart:53 | Dynamic home feed (today priority, queue/event/BiG, HPC, quiz, survey, recommended, hero video, timeline) |
| ExploreSocial (Explore tab) | Main Screen/exploreSocial.dart:23 | Breakthroughs social grid + search entry + snippet list |
| ExploreSearch | Main Screen/exploreSearch.dart:16 | Taxonomy-tag content search across General Content / Solar Voice / Ei-Flix |
| SolarVoiceHome (tab 3) | (external `Solar Voice/solarvoiceHome.dart`) | Bottom-nav tab — other cluster |
| EIFlixHome (tab 4) | (external `EIFlix/eiflixHome.dart`) | Bottom-nav tab — other cluster |
| MyProfileDashboard (My Journey tab) | Main Screen/myProfileDashboard.dart:36 | Profile header, journey roadmap, products, playlists, workshops, saved lists, breakthroughs |
| Timeline | Main Screen/timeline.dart:15 | Vertical scroll of breakthrough posts (opened from grids) |
| ChatHome | Main Screen/chathome.dart:17 | Chat list + support-ticket FAB (Raise/My Tickets) |
| NotificationLog | notificationlog.dart:14 | Grouped notification inbox (Today/Yesterday/30d), tap-routes by type |
| AHupdate | ahupdates.dart:6 | "A&H Updates" feed (notifications/logs where type==ahupdate) |
| DeeplinkNavigation | deeplinkNavigation.dart:14 | Resolves `content/<type>/<docid>` deeplinks → routes to player/playlist/workshop |
| SearchBar (people) | searchbar.dart:7 | Profile/people search (recent searches in prefs) |
| MoreMenu | MoreMenu.dart:5 | Static menu (Profile, Generate Code; other rows are stubs) |
| FloatingButtonWithOptions | Main Screen/floating_button_with_options.dart:4 | Reusable expandable FAB (used by ChatHome) |
| MarkProcedureCode | Main Screen/markProcedureCode.dart:11 | Enter code to log a procedure/breakthrough-implementation complete |
| MarkProcedureQrCode | Main Screen/markProcedureQrCode.dart:13 | QR-scan to log a Breakthrough Implementation complete |
| AddPost | Main Screen/addpost.dart:24 | Create a breakthrough post (text + images → Storage + Firestore) |
| ExpandPost | Main Screen/expandPost.dart:18 | Full post view w/ likes & comments |
| ExpandedVideo | Main Screen/expandvideo.dart:8 | Fullscreen video player widget (no Firestore) |
| AddSignificanceConsequence | Main Screen/addSignificanceConsequence.dart:9 | Add significance/consequence to a post |
| ShareMajorBreakthrough | Main Screen/shareMajorBreakthrough.dart:10 | Share/flag a post as major breakthrough |
| ParticipantATC | Main Screen/participantATC.dart:21 | **ATC OFF-LIMITS** — ATC timeline (uses `firestore-atc` DB) |

## Features

### Boot, Firebase init & global error handling
- **What the user does:** Launches the app; sees splash logo + spinner.
- **Nav/entry:** App cold start (`main()`).
- **Reads:** none directly at boot.
- **Writes:** none.
- **Endpoints:** Firebase.initializeApp; JustAudioBackground; FlutterDownloader; FlutterCallkitIncoming; FCM init. `AppService.logException` on errors.
- **Config flags:** Firestore persistence enabled + unlimited cache (main.dart:83). `DefaultFirebaseOptions.currentPlatform`.
- **Journey stage:** infra.
- **e2e-testability:** No — pure bootstrap; observable only via the splash → next-screen transition (covered by auth-gate test).

### Auth gate / splash routing
- **What the user does:** After 2s splash, lands on Home (if authed) or Login.
- **Nav/entry:** `MyHomePage.initState` (main.dart:483) pushReplacement; honors `callKitNavigationHandled`.
- **Reads:** `auth.currentUser`.
- **Writes:** none.
- **Journey stage:** onboarding/infra.
- **e2e-testability:** Yes — seeded auth user → app opens to Home; no auth → Login.

### Bottom-navigation shell (5 tabs)
- **What the user does:** Switches between Home / Explore / Solar Voice / Ei-Flix / My Journey; re-tapping a tab scrolls it to top (`bottomTabNotifier`).
- **Nav/entry:** `BottomNavigationBar` (home.dart:2192); items in `bottomNavigator()` (home.dart:1955); screens in `availableScreens()` (home.dart:2090).
- **Reads:** drives child tabs; `appService.onboardingJourney` decides shell-vs-onboarding render.
- **Writes:** none (nav state only).
- **Config flags:** When `onboardingJourney` non-empty → renders `JourneyOnboardingHome` and hides nav bar (home.dart:2093/2192).
- **Journey stage:** infra/onboarding.
- **e2e-testability:** Yes — tap each tab, assert each tab's root widget renders.

### Onboarding gate (first-time journey lock)
- **What the user does:** First-time user with a single not-yet-oriented journey is locked into `JourneyOnboardingHome` until orientation completes/cancels.
- **Nav/entry:** `onBoarding()` live snapshot (home.dart:400); 4 conditions (single journey, status null/initiated, `journeyonboardingdetail` exists, orientation not done).
- **Reads:** `participantjourneyproduct` where profileid==; `journeyonboardingdetail` where journeyref==.
- **Writes:** none here.
- **Journey stage:** onboarding.
- **e2e-testability:** Yes — seed a single initiated journey + journeyonboardingdetail → assert onboarding home; flip orientationstatus=completed → assert 5-tab shell.

### Profile gate + roles + system tracking
- **What the user does:** (passive) profile loads; blocked/disabled users are auto-logged-out; PostHog identity set.
- **Nav/entry:** `userDataListener()` (home.dart:234) listens `profile_data/<pid>`.
- **Reads:** `tier` (orderBy order); `profile_data/<pid>`; role doc via `role_ref` path.
- **Writes:** `notifications/<uid>` set `{name}` merge (home.dart:316).
- **Endpoints:** PostHog identify + capture "App Launched".
- **Config flags:** `profile.block==true || profile.enable==false` → logout; role flags `chatxadmin`, `eis`, `changeagent`.
- **Journey stage:** infra.
- **e2e-testability:** Partial — login + assert Home renders; blocked-user auto-logout is testable by seeding `block:true`.

### Default app flow: products / delivery / queue / event chain
- **What the user does:** (passive) Home derives active product mode (Exploration/Big/Event/Installation Event), delivery sequence, queue and event modes that power Home-tab controls.
- **Nav/entry:** `_startDefaultAppFlow()` (home.dart:464) → `fetchParticipantProducts` → `participantdeliverysequence` → `queueMode()` + `eventMode()`.
- **Reads:** `participant metadata/<pid>`; `participantsproduct` where profileid== orderBy sequenceorder; `products` where id whereIn; `participantdeliverysequence/<pid>`; `journey/<activejourney>`; `participantjourneyproduct`; queue: `queue variation/<id>`, `queue studio pairing`, `queue generation/<id>/stagechat`, `studioinvitation`; event: `arena e-ticket`, `arenavideoask`, `participantvideoask`, `event collection`.
- **Writes:** none (read/derive only).
- **Journey stage:** delivery.
- **e2e-testability:** Partial — heavy state machine; assert mode/banner derivation via seeded products+delivery; deep queue/event behavior belongs to queue/event clusters.

### Recommended mix listener
- **What the user does:** (passive) recommended general/eiflix/solarvoice content collected for Home.
- **Nav/entry:** `loadRecommendedMix()` (home.dart:515).
- **Reads:** `recommended mix playlist` where profileid== and date > now-2mo (filters delete/expiredate).
- **Writes:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed recommended-mix docs → assert recommended row renders on Home.

### Notification badges (general + support chat)
- **What the user does:** Sees red dots on the notification & chat AppBar icons when unread.
- **Nav/entry:** listeners in `userDataListener` (home.dart:304/320).
- **Reads:** `notifications/<uid>` (`read` field); `supportchat` where members arrayContains uid & isdelete==false (`pendingcount[uid]`).
- **Writes:** none (read flags).
- **Journey stage:** support/social.
- **e2e-testability:** Yes — seed unread notification/support doc → assert badge dot visible.

### In-app sticky message dialog
- **What the user does:** Sees a modal card (image/title/subtitle/message) with "Open →"/"Close"; tap routes via notification handler.
- **Nav/entry:** `inAppMessage()` (home.dart:1335) listens `notifications/<uid>/logs` where sticky==true & read==false limit 1; renders `displayMessage()`.
- **Reads:** `notifications/<uid>/logs`.
- **Writes:** `updateClicked()` sets log `{clicked:true, read:true}` (home.dart:1489).
- **Endpoints:** `appService.navigateOnNotificationTap`.
- **Journey stage:** support.
- **e2e-testability:** Yes — seed a sticky unread log → assert dialog appears.

### Force-update version check
- **What the user does:** Sees a (optionally mandatory) "New Update Available" dialog linking to the store.
- **Nav/entry:** `versioncheck()` (home.dart:1809).
- **Reads:** `App Version/breakthroughs` (`android`/`ios`, `androidmandatory`/`iosmandatory`).
- **Writes:** none.
- **Endpoints:** App Store / Play Store URLs (home.dart:1855/1868); `PackageInfo.fromPlatform`.
- **Config flags:** version compare + mandatory flag.
- **Journey stage:** infra.
- **e2e-testability:** Yes — seed `App Version` with a higher version → assert update dialog.

### FCM token registration & push routing
- **What the user does:** (passive) receives/opens push notifications; foreground pushes become local notifications; tapping routes to target.
- **Nav/entry:** `setupNotification()` (home.dart:1367); `onMessage`/`onMessageOpenedApp`/`getInitialMessage`; local-notif `onDidReceiveNotificationResponse`.
- **Reads:** FCM token + VoIP token.
- **Writes:** `appService.updateFCMToken(...)` (email, token, voip, uid, pid).
- **Endpoints:** FirebaseMessaging; FlutterLocalNotifications (channel `channelId`, studio-invitation custom sound).
- **Journey stage:** infra/support.
- **e2e-testability:** No — push delivery + OS notification permissions are not automatable on simulator.

### Deeplink handling
- **What the user does:** Opens `https://breakthroughs.app/...` links → routed into the app (content, eiflix, workshop, calendar, recommended, tv-auth).
- **Nav/entry:** `initDeepLinks()/_handleIncomingLink()` (home.dart:112/137) via `app_links`; also commented GoRouter in main.dart:187 (DISABLED).
- **Reads:** indirectly via target screens (`DeeplinkNavigation` reads `adsplaylist`, `recommended mix playlist`, `solar voice playlist`, `workshopconfiguration`, `workshop participant enrolled`).
- **Writes:** none.
- **Endpoints:** PostHog "App Launched by Deeplink"; `TVAuthHandler.handleTVAuthDeepLink`.
- **Journey stage:** content/infra.
- **e2e-testability:** Partial — `DeeplinkNavigation` screen testable with seeded docs by pushing it directly; OS-level URL open not automatable.

### AppBar action row (shared across tabs)
- **What the user does:** Taps notification bell → NotificationLog; post (+) → AddPost; chat → ChatHome; menu (⋮) → bottom-sheet (Offers external link, etc.); avatar (Home) → ProfileImage.
- **Nav/entry:** Themes helpers — `notificationAction` (Themes.dart:89→NotificationLog), `postOption` (Themes.dart:240→AddPost), `chatOption` (Themes.dart:444→ChatHome), `menuOption` (Themes.dart:491 bottom-sheet), `impactCreate` (Themes.dart:5078→ProfileImage avatar + AddPost), `procedureQrCode`/`procedurecode` (Themes.dart:290/273→MarkProcedureQrCode/MarkProcedureCode).
- **Reads:** badge flags `appService.notificationAvailable`, `appService.newMessage`.
- **Writes:** none.
- **Endpoints:** menu "Offers" → `https://excellenceinstallation.com/offers/` (external).
- **Journey stage:** infra/navigation.
- **e2e-testability:** Yes — tap each AppBar action, assert destination screen.

### Home tab — today's priority content
- **What the user does:** Sees today's priority Ei-Flix/Solar Voice/General content; taps to play.
- **Nav/entry:** `todayprioritywidget()` rendered in build (homeContent.dart:7873); `todayPriority()` polled every 5min.
- **Reads:** content collections (`content_urls`, etc.) per priority lists in appService.
- **Writes:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed today-priority lists → assert the row + open target player.

### Home tab — queue/event/BiG/installation controls
- **What the user does:** Sees QueueControl, ArenaParticipantZone, Bigactivity, LiveEventControl, ProductDeliverySequence when in the relevant mode.
- **Nav/entry:** build() (homeContent.dart:7868–8576) gated on `appService.queueDeliveryData["queuemode"]`, `profileJourneyProduct["eventmode"]`, etc.
- **Reads:** driven by home.dart product/delivery/queue/event chain (above).
- **Writes:** none in this file (delegated to those widgets/clusters).
- **Journey stage:** delivery/progression.
- **e2e-testability:** Partial — presence of each control is assertable given seeded mode; control internals belong to queue/event/BiG clusters.

### Home tab — request scope enhancement (self queue booking)
- **What the user does:** Sees a "Request Scope Enhancement" / queue-slot selection card when eligible; submitting marks a flow break.
- **Nav/entry:** `checkScopeEnhancement()` (homeContent.dart ~768) → `RequestScopeEnhanment` widget (build:7896).
- **Reads:** `participantsproduct`, `products`, `arena events`, `queue planning`, `cohorts queue planner`, `queue generation` (eligibility computation).
- **Writes:** `appflowbreaks/requestscopeenhancement - <profileid>` set (homeContent.dart:1024).
- **Journey stage:** progression/purchase.
- **e2e-testability:** Partial — eligibility is a deep computation; the card render + submit-writes-appflowbreaks is assertable with a fully seeded eligible state.

### Home tab — request BiG opportunities
- **What the user does:** Sees "Request BiG Opportunities" card (studio availability) when eligible.
- **Nav/entry:** `checkBigCohortEvent()` → `RequestBigOpportunities` (build:7912).
- **Reads:** `big cohorts`, `cohorts queue planner`, `queue generation`, `queue planning`.
- **Writes:** `appflowbreaks/requestbigopportunity - <profileid>` set (homeContent.dart:1165).
- **Journey stage:** progression.
- **e2e-testability:** Partial — same as scope enhancement.

### Home tab — HPC tools (Success Multiplier & Group HPC)
- **What the user does:** Logs/resumes a Health-Point-Check ("Log New Achievement"/"Resume") and group HPC.
- **Nav/entry:** `successMultiplierContainer()`/`groupHPCcontainer()` (build:7922/7928) → `HPC()` / `ViewHPC()` screens.
- **Reads:** `static meta data` (hpcConfig: `allow`, `accessfor`, `multipleprofiles`, `singlerecordbutton`) via `threeminhpcconfig()`.
- **Writes:** delegated to HPC cluster.
- **Config flags:** hpcConfig gates `allowHpc`/`showGroupHpc` (homeContent.dart:7747-7752).
- **Journey stage:** progression.
- **e2e-testability:** Partial — visibility gating testable via hpcConfig seed; HPC internals are a separate cluster.

### Home tab — quiz of the day / daily quiz / quiz-to-cohort
- **What the user does:** Answers the daily quiz; sees success view.
- **Nav/entry:** `quizData()` (homeContent.dart:1418); `quizui()`/`dailyquiz()`/`quiztocohort()` in build (8387/8393).
- **Reads:** `quiz of the day`; `survey`; participant responses.
- **Writes:** `onQuizCompleted()` (homeContent.dart:3114) records quiz response (quiz response docs).
- **Journey stage:** content/progression.
- **e2e-testability:** Yes — seed `quiz of the day` → answer → assert success view + response write.

### Home tab — survey
- **What the user does:** Completes an inline survey card.
- **Nav/entry:** `surveyui()` (homeContent.dart:3354).
- **Reads:** `survey`.
- **Writes:** survey response (set/add in survey flow).
- **Journey stage:** content/support.
- **e2e-testability:** Yes — seed survey → submit → assert response.

### Home tab — evolution wishlist & interim report prompts
- **What the user does:** Opens evolution-wishlist (self/family) and interim-report prompts.
- **Nav/entry:** `evolutionWishList()`/`checkMonthlyInterim()` (initState); `OpenEvolution`/`OpenInterimReport` in build (7931/7934); also `widgetPlaceholder` → `EvolutionWishlistFamily`/`EvloutionWishlistSelf`/`DoDont` (homeContent.dart:4071-4092).
- **Reads:** `evolutionwishlistlog`; `interimreport log`; `participant mode checklist`.
- **Writes:** delegated to those screens.
- **Journey stage:** progression.
- **e2e-testability:** Partial — card render + navigation assertable; form internals belong to evolution/report cluster.

### Home tab — YouTube live banner
- **What the user does:** Taps a "Live" banner → `YoutubeStreamLive`.
- **Nav/entry:** build (homeContent.dart:7937).
- **Reads:** `applivestreaming` (via `liveStream()`).
- **Writes:** none.
- **Endpoints:** YouTube Data API key embedded (homeContent.dart:7943) — `AIzaSy...` (hardcoded).
- **Journey stage:** content.
- **e2e-testability:** Partial — banner render assertable with seeded `applivestreaming`; YouTube player not assertable.

### Home tab — mode tips / mode general content / product level box / mode checklist
- **What the user does:** Sees mode-specific tips, a general-content row, an ALE/product-level box, and a mode checklist of tasks.
- **Nav/entry:** `modeTips()` (6034), `returnModeGeneralContent()`, `returnProductLevelBox()`, `ModeChecklist()` in build (8340-8365); `getParticipantModeTaskList()` in initState.
- **Reads:** `product mode config`, `product mode playlist`, `participant mode checklist`, `modes`, `appactionpending`, `participant AEL`.
- **Writes:** `appactionpending/<profileid>` set (homeContent.dart:1347) for action-pending tracking.
- **Journey stage:** progression/content.
- **e2e-testability:** Yes — seed product-mode config + checklist → assert tips/checklist render; checklist item tap → target screen.

### Home tab — continue watching / hero video / ads playlist / recommended mix
- **What the user does:** Resumes last-watched, plays hero video, opens ads playlist, sees recommended mix.
- **Nav/entry:** `ContinueWatch()`, `generalContentPlayerBox()`, `localTheme.adsplaylist()`, `Recommenedmixplaylist(fullscreen:false)` (build:8381-8403).
- **Reads:** `content_urls`, `ads`, `adsplaylist`, `content analytics`, `Video_Screen_Cast`, `screen_cast_devices`.
- **Writes:** `screen_cast_devices/<code>` update (homeContent.dart:507) for casting; content analytics writes.
- **Endpoints:** `https://media.publit.io/file/...` (video CDN); `https://breakthroughs.app/generalcontent/<id>` (share); `https://breakthroughsnew.page.link/solarvoice...` (dynamic link).
- **Journey stage:** content.
- **e2e-testability:** Yes — seed content/hero/ads → assert rows render + open player (player playback itself may be flaky).

### Home tab — content timeline (ads / health stories / breakthroughs / community posts)
- **What the user does:** Scrolls an infinite mixed feed; lazy-loads more.
- **Nav/entry:** `fetchNewTimeline()`; `SliverList` in build (homeContent.dart:8416); `scrollListener()` lazy load.
- **Reads:** `community post`; `health stories`; `Achievements/posts/postcollection`; `did you know`; `ads`/`adsplaylist`; `profile_data`; `post_categories`.
- **Writes:** none (read feed).
- **Journey stage:** content/social.
- **e2e-testability:** Yes — seed timeline docs → assert mixed cards render + lazy-load.

### Explore tab — breakthroughs social grid
- **What the user does:** Browses a 2-col grid of community breakthrough posts; taps a card → Timeline; taps Search box → ExploreSearch.
- **Nav/entry:** ExploreSocial build (exploreSocial.dart:357); search box (exploreSocial.dart:504→ExploreSearch); grid tile (exploreSocial.dart:582→Timeline); `SnippetList`.
- **Reads:** `Achievements/posts/postcollection` where private==false orderBy created; `profile_data` whereIn; `post_categories` whereIn.
- **Writes:** none here (likes/comments handled in expanded views).
- **Endpoints:** PostHog screen "breakthroughs".
- **Journey stage:** social.
- **e2e-testability:** Yes — seed public posts → assert grid + open Timeline.

### Explore tab — content search (taxonomy)
- **What the user does:** Searches by tag/keyword; browses results by type tabs (General/Ei-Flix/Solar Voice); opens content.
- **Nav/entry:** ExploreSearch (exploreSearch.dart:16); autocomplete + chips + tabs.
- **Reads:** `atc taxonomy` (SAFE reference config — NOT ATC data); `content analytics` where profileid==; `content_urls` (available + tags/keywords filter); `solar voice playlist`; `series`.
- **Writes:** none to Firestore; recent searches → SharedPreferences (`exploreRecentSearches`).
- **Journey stage:** content.
- **e2e-testability:** Yes — seed taxonomy + content → search → assert result rows + open player. Note: `atc taxonomy` is reference-only & explicitly CI-safe.

### My Journey tab — profile dashboard
- **What the user does:** Views profile (image/name/journey validity/email), Edit Profile → ProfileImage, Calendar → Mastercalendar, My Breakthroughs → Timeline, journey roadmap, products, playlists, workshops, saved lists.
- **Nav/entry:** MyProfileDashboard build (myProfileDashboard.dart:552); avatar/Edit Profile (671/733→ProfileImage); Calendar (772→Mastercalendar); View All (829→Timeline); roadmap/product/playlist/workshop/myList sections (2148-3323); checklist `widgetPlaceholder` (2998) → EvolutionWishlistFamily/EvloutionWishlistSelf/DoDont; ParticipantATC entry (**ATC OFF-LIMITS**).
- **Reads:** `participantdeliverysequence/<pid>`; `participantjourneyproduct`; `participantsproduct`; `journey`; `products`(via package); `package`; `series`; `workshopconfiguration`; `participantplanning`; `participant AEL`; `procedures`; `queue generation`; `event collection`; `profile_data`; `Achievements/posts/postcollection`; `participantvideoask`; `classify`; **`atc_alpha`** (3× — ATC OFF-LIMITS).
- **Writes:** profile/journey-related set/update (21 write sites; mostly local list building, some checklist/planning updates).
- **Endpoints:** `https://eiflix.com/workshop`, `https://eiflix-workshop.web.app/workshop` (share links); profile default image on `fir-sample-aae4a` storage.
- **Config flags:** none (RemoteConfig not used).
- **Journey stage:** progression/onboarding.
- **e2e-testability:** Yes (non-ATC parts) — seed journey/products/posts → assert dashboard sections + nav. The `atc_alpha` stat/section is ATC OFF-LIMITS (CI-excluded); map it as existing only.

### Timeline (post detail scroll)
- **What the user does:** Scrolls breakthrough posts; likes/comments via expand.
- **Nav/entry:** Timeline (timeline.dart:15) from Explore grid / My Journey / notifications.
- **Reads:** `Achievements/posts/postcollection`; `profile_data`; `likes`; `comments`.
- **Writes:** like/comment writes (4 sites) via appService.
- **Journey stage:** social.
- **e2e-testability:** Yes — seed posts → assert scroll + like/comment.

### Chat home + support tickets
- **What the user does:** Opens chat list; raises a ticket / views tickets via FAB; admins can create groups.
- **Nav/entry:** ChatHome (chathome.dart:17); FAB options (484-491→TicketCategories / ClientTicket); `createNewGroup` (admins → AddNewPeople).
- **Reads:** role (`chatxadmin`); `clientissue` where clientid== + sub `messages` where pending arrayContains user; `supportchat` (group existence check).
- **Writes:** group creation flow (via AddNewPeople); ticket creation (TicketCategories cluster).
- **Journey stage:** support.
- **e2e-testability:** Yes — open ChatHome, assert list + FAB; raise-ticket nav assertable (ticket internals = support cluster).

### Notification inbox + routing
- **What the user does:** Views grouped notifications (Today/Yesterday/30d); taps to route (like/comment/ahupdate/supportticket/ael/queue/etc.).
- **Nav/entry:** NotificationLog (notificationlog.dart:14); `buildNotificationItem` tap → `appService.navigateOnNotificationTap`.
- **Reads:** `notifications/<uid>/logs` where date>=30d orderBy date limit 150.
- **Writes:** `notifications/<uid>` update `{read:true}` (notificationlog.dart:97); per-item `{clicked:true, read:true}` (210).
- **Journey stage:** support/social.
- **e2e-testability:** Yes — seed logs → assert grouping + tap routes + read flag set.

### A&H updates feed
- **What the user does:** Views A&H broadcast updates.
- **Nav/entry:** AHupdate (ahupdates.dart:6) from notification routing / MoreMenu-style entries.
- **Reads:** `notifications/<uid>/logs` where type==ahupdate orderBy date.
- **Writes:** none.
- **Endpoints:** AH logo on `fir-sample-aae4a` storage.
- **Journey stage:** content/support.
- **e2e-testability:** Yes — seed ahupdate logs → assert list.

### People search
- **What the user does:** Searches profiles by name; opens a `User` profile; recent searches persisted.
- **Nav/entry:** SearchBar (searchbar.dart:7).
- **Reads:** `profile_data` (orderBy name; role gating via `ah`/availableusers); role via `role_ref`.
- **Writes:** none to Firestore; recent searches → SharedPreferences (`searches`).
- **Journey stage:** social.
- **e2e-testability:** Yes — seed profiles → search → assert results + open user.

### Create breakthrough post
- **What the user does:** Writes a post (category + text + images), saves draft or publishes.
- **Nav/entry:** AddPost (addpost.dart:24) from postOption/impactCreate.
- **Reads:** `post_categories`; `drafts`.
- **Writes:** images → FirebaseStorage `.ref()` (addpost.dart:427); `Achievements/posts/postcollection` set (442/486); `drafts` writes.
- **Journey stage:** social.
- **e2e-testability:** Yes — fill + publish → assert post doc written (image upload may be stubbed).

### Mark procedure complete (code / QR)
- **What the user does:** Enters a code or scans a QR to log a Breakthrough Implementation as complete.
- **Nav/entry:** MarkProcedureCode (markProcedureCode.dart:11) / MarkProcedureQrCode (markProcedureQrCode.dart:13) from `procedurecode`/`procedureQrCode` AppBar helpers.
- **Reads:** `procedurecode`; `profile_data` (markProcedureCode).
- **Writes:** procedure-complete write (CompleteProcedure flow).
- **Journey stage:** delivery/progression.
- **e2e-testability:** Partial — code entry path testable; QR camera scan not automatable on simulator.

### Post engagement (expand / significance / share)
- **What the user does:** Opens a post full-screen, likes/comments, replies to comments, adds significance/consequence, shares major breakthrough.
- **Nav/entry:** ExpandPost (expandPost.dart:18); AddSignificanceConsequence (addSignificanceConsequence.dart:9); ShareMajorBreakthrough (shareMajorBreakthrough.dart:10).
- **Reads:** `Achievements/posts/postcollection`; `comments`; `commentlikes`; `likes`; `profile_data`.
- **Writes:** like/comment/commentlike/significance writes (expandPost 7 sites; addSig/share write to postcollection).
- **Journey stage:** social.
- **e2e-testability:** Yes — seed a post → like/comment/add-significance → assert sub-collection writes.

### ParticipantATC (ATC OFF-LIMITS)
- **What the user does:** Views ATC timeline.
- **Nav/entry:** ParticipantATC (participantATC.dart:21) from myProfileDashboard / myjourney(dead).
- **Reads/Writes:** uses a separate database `FirebaseFirestore.instanceFor(databaseId:"firestore-atc")` (participantATC.dart:32); `atc_alpha`, `classify`, `corrections`, `bigactivity`, `livechangework`, `procedurecode`, `procedures`, `profile_data`.
- **atcTouch:** true. **e2e-testability:** No — ATC OFF-LIMITS, CI-excluded. Mapped as existing only; never seed/test.

## Firestore collections

### Read
- `profile_data` (doc `<pid>`; where profileid whereIn for feeds; orderBy name in search) — primary profile gate
- `tier` (orderBy `order`)
- `participantjourneyproduct` (where profileid==, where journeyref==) — onboarding + journey status
- `journeyonboardingdetail` (where journeyref==) — onboarding lock condition
- `participant metadata` (doc `<pid>`; `activejourney`, subscription dates)
- `participantsproduct` (where profileid== orderBy sequenceorder; `status`,`mode`,`productref`,`docid`)
- `products` (where id whereIn; `mode`,`product`)
- `participantdeliverysequence` (doc `<pid>`; `products[].delivery[]`)
- `journey` (doc `<activejourney>`; `journey`,`description`,`immersive`,`learning`)
- `modes` (orderBy sequence)
- `recommended mix playlist` (where profileid== & date>now-2mo; `type`,`expiredate`,`delete`)
- `notifications` (doc `<uid>` read flag; sub `logs` where sticky/type/date)
- `supportchat` (where members arrayContains uid & isdelete==false; `pendingcount[uid]`,`members`)
- `App Version` (doc `breakthroughs`; android/ios + mandatory)
- queue chain: `queue variation` (doc), `queue studio pairing` (where queueref/checkin/studioin), `queue generation` (doc + sub `stagechat`), `studioinvitation` (where profileid/clientresponse/queueref/expirydate), `queue planning`, `queue_token`, `cohorts queue planner`, `big cohorts`
- event chain: `arena e-ticket` (where profileid/eventref/active), `arenavideoask` (where active/eventref), `participantvideoask` (where profileid/arenaevent/created), `event collection`/`event rsvp`/`arena events`, `events_profiles`
- Home feed: `content_urls`, `ads`, `adsplaylist`, `content analytics`, `community post`, `health stories`, `did you know`, `Video_Screen_Cast`, `applivestreaming`, `Achievements/posts/postcollection`, `post_categories`
- mode/checklist: `participant mode checklist`, `product mode config`, `product mode playlist`, `appactionpending`, `appflowbreaks`, `participant AEL`, `static meta data`, `survey`, `quiz of the day`
- evolution/report: `evolutionwishlistlog`, `interimreport log`, `plantogether`, `livechangework`, `participant list`, `participantplanning`, `package`, `series`, `workshopconfiguration`, `workshop participant enrolled`, `eiflix workshop`, `eiflix participant enrolled`, `solar voice playlist`, `procedures`, `procedurecode`
- social: `likes`, `comments`, `commentlikes`, `drafts`
- search reference: **`atc taxonomy`** (SAFE — reference config, CI-allowed)
- chat: `clientissue` (+ sub `messages`)
- **ATC OFF-LIMITS (mapped, never seed/test):** `atc_alpha`, `classify`, `corrections` (participantATC + myProfileDashboard stat; via `firestore-atc` DB)

### Written
- `notifications/<uid>` set `{name}` merge; update `{read:true}`
- `notifications/<uid>/logs/<id>` update `{clicked:true, read:true}`
- `appflowbreaks/requestscopeenhancement - <profileid>` set
- `appflowbreaks/requestbigopportunity - <profileid>` set
- `appactionpending/<profileid>` set
- `screen_cast_devices/<code>` update (casting)
- `Achievements/posts/postcollection` set (AddPost; significance/share); sub `comments`/`likes`/`commentlikes` adds
- `drafts` (AddPost draft save)
- quiz/survey response writes (onQuizCompleted / surveyui)
- `participant mode checklist` / `participantplanning` updates (myProfileDashboard)
- FCM token via `appService.updateFCMToken` (writes to profile/user docs)
- **ATC OFF-LIMITS:** any `firestore-atc` writes in ParticipantATC — never seed/test.

## Endpoints & external services
- **Firebase:** Auth, Firestore (default DB + separate `firestore-atc` DB for ATC — OFF-LIMITS), Storage (`fir-sample-aae4a.appspot.com`), FCM, FlutterCallkitIncoming (VoIP).
- **PostHog:** identify + capture ("App Launched", "App Launched by Deeplink", screen events). `Posthog` instance global.
- **HTTP / CDN:** `https://media.publit.io/file/...` (video CDN); App Store `id1450187620` / Play Store `com.soe.launchyourlegacy` (update links); dynamic links `https://breakthroughsnew.page.link/solarvoice`; share `https://breakthroughs.app/generalcontent/<id>`; `https://eiflix.com/workshop`, `https://eiflix-workshop.web.app/workshop`; `https://excellenceinstallation.com/offers/` (menu Offers).
- **YouTube Data API:** hardcoded key in `YoutubeStreamLive` call (homeContent.dart:7943).
- **Watson (deprecated):** `https://us-central1-watsonproduction-becde.cloudfunctions.net/startlabs_userdata` — only in deprecated `ActionsToTake.dart`.
- **Audio:** JustAudioBackground; **Downloads:** FlutterDownloader.
- No `httpsCallable`/Dio in this cluster (HTTP is raw `HttpClient` only in deprecated ActionsToTake; everything else is Firestore SDK + `url_launcher`).

## Config & feature flags
- **No Firebase Remote Config anywhere in the repo** — feature gating is Firestore-config-driven:
  - `App Version/breakthroughs` → force-update + mandatory flags.
  - `static meta data` (hpcConfig) → `allow`, `accessfor[]`, `multipleprofiles[]`, `singlerecordbutton` gate HPC tools.
  - `product mode config` / `participant mode checklist` → which Home-tab mode widgets/tasks render.
  - `profile_data.block` / `.enable` → force logout.
  - role doc flags: `chatxadmin`, `eis`, `changeagent`, `ah` → admin/search capabilities.
  - `participantmode` (`null`→Exploration, `Big Mode`, `Event Mode`, `Installation Event Mode`) → home control set.
- **Local persistence (SharedPreferences):** `searches` (people search), `exploreRecentSearches`, `timelinecache`/`lastpost`/`mapimagecache`/`lastcontent`/`newshuffle` (Explore/Home image+post caches).
- **Local SQLite:** videoask DB (`appService.initVideoAskSQLite`); BackgroundService (`syncLocalDB`).
- **Firestore settings:** persistence enabled, unlimited cache (main.dart:83).
- **3 Firebase projects:** code references production storage bucket `fir-sample-aae4a` (AH logo, default profile images, notification images) — production project. Test/staging projects not referenced in this cluster's code.

## Dead / clone / Old code
- `Main Screen/exploreSocialOld.dart` — older ExploreSocial; NOT imported anywhere → DEAD.
- `Main Screen/myprofiledashboardold.dart` — older dashboard; NOT imported → DEAD (refs `https://excellenceinstallation.com/`).
- `Main Screen/myjourney.dart` — header `// Depreciated` (line 1); the live "My Journey" tab is `MyProfileDashboard`, not `MyJourney`. DEAD/superseded (still imports ParticipantATC, BIGVideo).
- `ActionsToTake.dart` — header `// Depreciated` (line 1); also reads ATC (`atc_alpha`) + Watson CF. DEAD + ATC.
- `main.dart` — large commented-out `GoRouter` block (lines 186-403): the app uses `MaterialApp.routes`+`onUnknownRoute`, NOT GoRouter. Dead code, not active routing.
- `home.dart` — commented `onNotificationTap` (1525-1698) and `ongoingQueue` bottom-sheet (2226-2386): DEAD; live path is `onOpenAppByNotification` + `navigateOnNotificationTap`.
- `homeContent.dart` — large commented blocks (eiflix-share carousel, significant-achievement-of-the-day, cached-image prefetch in initState, old SliverList): DEAD; do not treat as live features.
- `Themes.dart` — commented `castOption`/old `chatOption`/`menuOption` variants: DEAD.

## Notes & open questions
- **ATC firewall:** `participantATC.dart` and `ActionsToTake.dart` (dead) are the only ATC touchpoints here; `myProfileDashboard.dart` also reads `atc_alpha` for a stat count. All must be CI-excluded. `atc taxonomy` (in ExploreSearch) is the SAFE reference config per CLAUDE.md and is fine to seed/use.
- **`homeContent.dart` is enormous (~11k lines)** and is a config-driven aggregator: most "features" are conditional sub-widgets owned by other clusters (queue, event, BiG, HPC, evolution, content). This map captures their Home-tab entry points + the data that gates them; deep behavior belongs to those clusters' maps.
- **Prod-endpoint firewall:** several hardcoded prod URLs (publit.io CDN, eiflix.com, page.link, excellenceinstallation.com, YouTube API key) — per the e2e prod-endpoint firewall memory, non-queue suites should firewall outbound prod CF/HTTP; these are mostly read-only media/share links.
- **Routing model:** Navigation is imperative `Navigator.push` everywhere (no router); only 4 named routes exist (`/login`,`/register`,`/home`,`/forgotpassword`). Deeplinks resolved manually in `home.dart` (GoRouter is dead-commented). e2e should drive via widget taps, not route names.
- **e2e seams:** the cleanest deterministic e2e targets are: auth-gate, 5-tab nav, AppBar actions → destinations, NotificationLog grouping+routing, ExploreSocial grid → Timeline, ExploreSearch results, AddPost publish, version-update dialog, in-app sticky dialog, recommended-mix row. Push delivery, QR camera scan, and OS URL-open are not simulator-automatable.
- **Open question:** the centre bottom-nav tab labelled "Solar Voice" maps to `SolarVoiceHome` (index 2) but the icon set also references addpost — confirm whether a "+" FAB path (commented in homeContent build:7757) is intended to return; currently posting is via AppBar `postOption`/`impactCreate` only.
