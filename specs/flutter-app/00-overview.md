# breakthroughs-flutter — 00 · App Shell & Cross-Cutting Infrastructure

> The architectural spine of the **breakthroughs-flutter** participant app (native Flutter, branch `development`): the app root, route table, auth gate, 5-tab shell, onboarding gate, Home's global listeners, the Services layer, FCM/notifications, PostHog, remote-config posture, deep-link handling, the 3-Firebase-project topology as it pertains to the app, and the **Flutter-home render chain**. Read this before the cluster docs — every other map hangs off this skeleton. Evidence is cited as `file:line` (the cluster docs carry the underlying line evidence; this overview consolidates from `clusters/shell-nav-mainscreen.md`, `clusters/auth-onboarding.md`, `clusters/services-infra-config.md`, and the `JOURNEY-DATA-BLUEPRINT.md`).

---

## 1. App root, routes, and the dead go_router

**`MyApp` / `MaterialApp` — `main.dart:405`.** The app root carries 38 locales, a global `navigatorKey`, and a **`MaterialApp.routes` table with `onUnknownRoute`** — **not** GoRouter. Only **4 named routes** exist:

| Route | Destination |
|---|---|
| `/login` | Login (`main.dart:213`, `:435`) |
| `/register` | Register |
| `/home` | Home (the 5-tab shell) |
| `/forgotpassword` | ForgotPassword |

**`main.dart` contains a large commented-out `GoRouter` block (lines 186–403) — DEAD.** The live app routes imperatively via `Navigator.push` everywhere; deep links are resolved **manually** in `home.dart` (see §7), not by a router. **e2e implication:** drive the app by **widget taps, not route names** — only the 4 named routes are addressable.

`firebase_options.dart` is a **test-harness file** (`firebase_options.dart:1-47`): it points at `slabs-queue-e2e-exdcz` (the queue-e2e harness project), is `.gitignored`, and exists so the app compiles and a stray `flutter run` hits a disposable test project — it is **never** pointed at prod, and the integration test initializes Firebase first with a project-id guard.

---

## 2. Splash → auth gate

**`MyHomePage` (splash) — `main.dart:466`.** A 2-second splash (logo + spinner), then `MyHomePage.initState` (`main.dart:483`) does a **`pushReplacement`** to either:
- **Home** (the 5-tab shell) if `auth.currentUser != null`, or
- **Login** otherwise.

It honors a `callKitNavigationHandled` flag so an incoming CallKit call doesn't double-navigate. **e2e seam:** seeded auth user → app opens to Home; no auth → Login (the cleanest deterministic gate; covered by the auth-gate test).

---

## 3. The 5-tab bottom-navigation shell

**`Home` — `home.dart:46`.** The shell owns `screenIndex`, the `BottomNavigationBar` (`home.dart:2192`), and ALL the global listeners (§4). Tabs (`bottomNavigator()` `home.dart:1955`; screens `availableScreens()` `home.dart:2090`):

| Index | Label | Screen | Cluster |
|---|---|---|---|
| 0 | Home | `HomeContent` (`Main Screen/homeContent.dart:53`, ~11k lines) | shell-nav-mainscreen |
| 1 | Explore | `ExploreSocial` (`Main Screen/exploreSocial.dart:23`) | shell-nav-mainscreen / social |
| 2 | Solar Voice | `SolarVoiceHome` (`Solar Voice/solarvoiceHome.dart`) | content-audio-hpc-surprise |
| 3 | Ei-Flix | `EIFlixHome` (`EIFlix/eiflixHome.dart`) | content-eiflix |
| 4 | My Journey | `MyProfileDashboard` (`Main Screen/myProfileDashboard.dart:36`) | shell / journey-dashboard-mode |

Re-tapping a tab scrolls it to top via `bottomTabNotifier`. The **AppBar action row** is shared across tabs (Themes helpers): bell → NotificationLog, `+` → AddPost, chat → ChatHome, `⋮` → bottom-sheet (Offers external link), avatar → ProfileImage (`Themes.dart:89/240/444/491/5078`).

---

## 4. The onboarding gate (first-run journey lock)

A first-time, **single-journey** participant is locked out of the 5-tab app and shown `JourneyOnboardingHome` until orientation completes/cancels. Decided in **`home.dart` `onBoarding()` (lines 400–455)**, rendered at **`home.dart:2093`** (`screens = onboardingJourney.isNotEmpty ? [JourneyOnboardingHome()] : …`), with the bottom-nav **suppressed** when locked (`home.dart:2192`).

**Four lock conditions** (all must hold): exactly 1 `participantjourneyproduct` for the profile, `journeystatus ∈ {null,"initiated"}`, a `journeyonboardingdetail` doc exists for the `journeyref`, and `orientationstatus ∉ {"completed","cancelled"}`. Users with **>1** `participantjourneyproduct` bypass onboarding entirely (`home.dart:412`).

The V2 status machine: `null` → (intro slides) `initiated` → (booking) sets `onboardingscheduled` → (completion "Set Up My App") `completed`; `onboarded==true` short-circuits to the completion screen. **TimeCompression and Journey-Detail do NOT advance `orientationstatus`** (their advancing writes are commented out). **`JourneyOnboardingV2` is LIVE; the entire `JourneyOnboardingProcess/` (V1) is DEAD.**

---

## 5. Home's global listeners (the live data spine)

`Home` wires the participant's entire live state at mount. The listeners (all in `home.dart`):

| Listener | Entry | Reads | Effect |
|---|---|---|---|
| **Profile / roles / system** | `userDataListener()` `home.dart:234` | `profile_data/<pid>`, `tier`, role doc via `role_ref` | hydrates `loggedinProfile`; **blocked/disabled → auto-logout** (`block==true || enable==false`); PostHog identify + "App Launched"; writes `notifications/<uid>` `{name}` merge |
| **Onboarding gate** | `onBoarding()` `home.dart:400` | `participantjourneyproduct` (profileid==), `journeyonboardingdetail` | locks/unlocks the shell (§4) |
| **Default app flow** | `_startDefaultAppFlow()` `home.dart:464` | `participant metadata`, `participantsproduct`, `products`, `participantdeliverysequence`, `journey`, `participantjourneyproduct` | derives the active **product mode** (Exploration/Big/Event/Installation Event), the delivery sequence, then **`queueMode()` + `eventMode()`** that power the Home-tab controls |
| **Queue chain** | inside default-app-flow | `queue_token` (`home.dart:883`), the queue doc via `tokendata.queueref` (`:894`), `queue variation/{id}` (`:905`), `queue studio pairing` (`:928`), `queue generation/{id}/stagechat` (`:964`) | builds `queueDeliveryData.queuemode` (the QueueControl card data) |
| **Event chain** | inside default-app-flow | `arena e-ticket`, `arenavideoask`, `participantvideoask`, `event collection` | builds `profileJourneyProduct.eventmode/arenaticket/arenavideoask` (the LiveEventControl/ArenaParticipantZone data) |
| **Recommended mix** | `loadRecommendedMix()` `home.dart:515` | `recommended mix playlist` (profileid==, date>now-2mo) | the Home recommended row + the cross-type mix |
| **Notification badges** | `userDataListener` `home.dart:304/320` | `notifications/<uid>` (read), `supportchat` (pendingcount) | the red dots on the bell + chat icons |
| **In-app sticky** | `inAppMessage()` `home.dart:1335` | `notifications/<uid>/logs` (sticky, read==false) | the modal sticky card; tap writes `{clicked:true,read:true}` |
| **Version / force-update** | `versioncheck()` `home.dart:1809` | `App Version/breakthroughs` | the "New Update Available" dialog (+ mandatory flag) |
| **FCM / push routing** | `setupNotification()` `home.dart:1367` | FCM + VoIP token | registers token (`updateFCMToken`); foreground push → local notif; tap → `navigateOnNotificationTap` |
| **Deep link** | `initDeepLinks()` `home.dart:112` | via target screens | resolves `https://breakthroughs.app/...` links (see §7) |
| **Profile-image gate** | `home.dart:474` | `profile_data.profileimg` | auto-pushes `ProfileImage` when `profileimg == null` (a soft onboarding lock) |

**e2e implication:** these listeners are why **seeding Firestore alone is insufficient** — the app must **log in and compute** `loggedinProfile`, `profileJourneyProduct.eventmode/arenaticket`, `participantProductList`, `usermetadata`, and `queueDeliveryData` from the seeded data during a real login. Plan a real login per e2e user.

---

## 6. The Services layer

`AppService` (`Services/AppServices.dart`, a **3,855-line singleton** — the central hub node) is imported by virtually every screen. It mixes pure infra with feature logic:

- **Identity / session:** `loggedinProfile`, `roles`, `usermetadata`, `profileJourneyProduct`, `participantProductList`, `participantModeChecklist`, `mappedProduct`; the reference-map loaders `mapProfile/mapProduct/mapJourney/mapAppointment/mapProcedure/mapPostCategory/getUserRole` (`AppServices.dart:913+`).
- **`UserData`** (`Services/UserData.dart`) — the credential/preference store: resolves `pid` from `profile_data` (email + `user_ref==user_data/{uid}`), persists `useremail/useruid/userpid/watsonpackage/coviduser` to SharedPreferences, and a multi-account `users` JSON list to `FlutterSecureStorage`. Cleared on logout.
- **Content engine:** `getContent(...)` (video, BetterPlayer + publit.io HLS) + `getAudioList`/audio player (Solar Voice, just_audio background) → buffers watch progress to local SQLite (`db_analyics.db`) every 3s, then syncs to `content analytics` + `participant content analytics` + playlist/checklist/planning completion.
- **Media upload pipelines:** `uploadVideoAsk`/`uploadMedia` (Storage + compression, driven by local SQLite queues).
- **Delivery writes:** `updateDeliveryStatus` (cascades `participantdeliverysequence`/`participantsproduct`), `moveQueueStage` (`queue_token`/`queue stage log`), `raiseTickets` (`clientissue` + `messages` + `counters/ticketCounter`), `contentMylist` (`participant metadata`), `updateFCMToken`/`logoutUser` (`FCM_token`/`loginlog`).
- **`BackgroundService`** (`Services/BackgroundService.dart:48`) — a headless 30-min timer that **nightly (22:00–22:30)** uploads local SQLite DBs (atc/videoask/chat/analytics) to Storage `flutterSqlite/<pid>/...` and records URLs at `profiledb/<pid>`. *(Includes `db_atcsync.db` → ATC-adjacent.)*
- **CallKit / studio-invitation:** `AppService.initialize()` wires CallKit listeners + a MethodChannel `com.soe.launchyourlegacy/callkit`; the `CountDown` widget writes `<invitationpath>.clientresponse` and plays a bundled audio (`studioinvitation.mp3`).

**Local SQLite DBs:** `db_atcsync.db` (atcsync — ATC), `db_videoask.db`, `db_chat_media.db`, `db_analyics.db` (contentanalytics), `db_solarvoice_offline.db`.

---

## 7. FCM / notifications, PostHog, Remote Config, deep links

- **FCM / notifications:** `setupNotification()` (`home.dart:1367`) handles `onMessage`/`onMessageOpenedApp`/`getInitialMessage` + local notifications (channel `channelId`, a custom studio-invitation sound). Token lifecycle is `updateFCMToken` (add/update `FCM_token`) / `logoutUser` (deactivate/delete). **Push delivery + OS permissions are not sim-automatable.**
- **PostHog:** the **only live** usage is `identify` + a few `screen(...)`/`capture("App Launched"/"App Launched by Deeplink")` events in the shell and a handful of content screens. In the Services layer the single `posthog.capture(...)` is **commented out** — there is **no active analytics SDK** in `AppService`.
- **Remote Config: NONE.** There is **no Firebase Remote Config anywhere in the app** (grep-confirmed across clusters). All "feature flags" are **data-driven**: Firestore config docs (`App Version/breakthroughs`, `static meta data` hpcConfig/Workshop Admin, `product mode config`, `participant mode checklist`, `classify/*`, per-doc booleans like `workshopconfiguration.active`/`eiflixbanner.enableapp`/`applivestreaming.live`) + in-memory `appService.slotbooking{}` toggles + `profile_data.block`/`.enable` + role-doc flags (`chatxadmin`/`eis`/`changeagent`/`ah`/`floor`/`admin`).
- **Deep links:** `initDeepLinks()`/`_handleIncomingLink()` (`home.dart:112/137`) via the **`app_links`** package (the GoRouter in `main.dart` is dead-commented). `DeeplinkNavigation` (`deeplinkNavigation.dart:14`) resolves `content/<type>/<docid>` → player/playlist/workshop; other handled deep links include `calendar` (→ Mastercalendar / EventPlanning), `recommendedmix/{bufferid}`, `?type=workshop&docid=`, and `/tv-auth?session_id=` (→ `TVAuthHandler`). OS-level URL open is not sim-automatable, but `DeeplinkNavigation` is testable by pushing it directly with seeded docs.

---

## 8. The 3-Firebase-project topology (as the app sees it)

The platform is **three Firebase projects** joined by **email** (`profile_data.email` ↔ Watson), but the *Flutter app* references a smaller set in code:

| Project | Role | In-app reference |
|---|---|---|
| **`fir-sample-aae4a`** | **production** — delivery, participants, content, mode engine | Storage bucket literals (A&H logo, default profile/event/solar covers), **hardcoded prod CFs** (`requestScheduling`, `authorisation_key_code`), the prod Watson verify CF, the prod `workshopAssignment` Slack CF |
| **`starlabs-test`** | test | project-switch branches (`requestApptCancel`, Watson verify, `workshopAssignment`), some Storage placeholder URLs, eiflix-workshop share URL |
| **`test-environment-841c3`** | test | a recognized test project in the `requestApptCancel` switch (`appointmentContainer.dart:287`) — *not* in the CLAUDE.md 3-project topology (which names `launch-your-legacy-development` as staging) |
| **`slabs-queue-e2e-exdcz`** | e2e harness | `firebase_options.dart` (disposable, `.gitignored`) — the project the **e2e build targets** |

**The e2e build targets the test project `slabs-queue-e2e-exdcz`** (per the blueprint); the seeder writes **only** there (the `lib/test-project.js` allowlist hard-aborts otherwise), tags every doc `{testrunid, _testdata:true}`, and sets `atcmodel:null` on every product/journey/event so ATC branches stay dead. **Watson is NOT a second project in the test environment** — the cross-join is modeled as the `watsonpurchaseid`/`watsonpurchaselabel` **strings** on `journeyproductpurchase` (any spec that drives a real Watson screen hits a tolerated `getApp("watson")` throw — keep Watson out of driven flows).

**Project-switch behaviour** keys on `Firebase.app().options.projectId`. **Prod-endpoint firewall (must block under non-queue e2e):** `requestScheduling`, `authorisation_key_code`, the Watson verify CF (prod), `workshopAssignment` (when on prod), the YouTube Data API, OpenAI, publit.io CDN, and the **`fir-sample-aae4a` Storage bucket** (post-create + profile uploads write there — redirect to test). The well-behaved counter-example is `requestApptCancel` (project-aware → test-safe). There are **two named Firestore databases**: `firestore-forms` (forms drafts/submissions, big-activity & workshop forms — **must be provisioned in the test project**) and `firestore-atc` (**OFF-LIMITS — never opened**).

---

## 9. The Flutter-home render chain (verbatim) — the load-bearing entrypoint

The Home screen's queue card requires this **exact** resolution chain (verbatim from `setup-mobile-fixture.cjs:98-144`, restated in `JOURNEY-DATA-BLUEPRINT.md` §A4):

```
profile_data.participantmode                                  (the LIVE mode — the headline)
  → participantsproduct  (mode == participantmode, status ongoing) .productref
    → products.mode
      → participantdeliverysequence/{profileid}
            .products[participantproductid == active]
            .delivery[type == 'queue', status ongoing].sequenceref
        → deliverables.fileref[0]
          → queue_token                                       (the QueueControl card data)
```

Restated as the dependency the cluster docs describe: `profile_data.participantmode → participantsproduct → products → participantdeliverysequence → deliverables → queue_token`. The card only renders when `appService.queueDeliveryData["queuemode"] != null` (`homeContent.dart:7877`), which requires an active product delivery of `type=="queue"` with status `initiated`/`ongoing`, `currentstage != "completed"`, and now-before-`queueenddate`.

**Crash-guards / quirks to respect when seeding** (so the home render doesn't throw or silently degrade):
- The mastercalendar bottom-bar does `.reduce(...)` over `upcomingArenaEvents` **without an isEmpty guard** (`mastercalendar.dart:212`) — seed **≥1 future arena event** (the outer try catches it, but `totalMonthEvents` degrades to 0).
- The countdown banner reads only the **single most-recent** `event collection` doc (orderBy `start_date` **desc**, limit 1) — if the newest event is in the **past**, the banner hides (it does NOT pick the next future event).
- `ProfileInfoRequest` requires `loggedinProfile['dateofbirth']` to be a **Timestamp** (`.toDate()`) or it throws on load.
- The profile-image gate auto-pushes `ProfileImage` when `profile_data.profileimg == null` — seed `profileimg` (and `profile`) to land on the shell.
- The mode engine's `participant metadata` / `participant mode checklist` are **CQRS projections** that deployed CFs (`*_to_pmd`, `participantmode.js`) may rewrite on the test project — seed them as **merge targets** and let assertions read the CF-written value where the CF is deployed (some CFs are NOT deployed to test).

**The render-chain data model (join keys), from the blueprint §A1:** the spine is the scalar `profileid` (== `profile_data` doc id), shared across `participantjourneyproduct` (PJP, the purchase-of-truth), `participantsproduct` (PSP, one per deliverable), and `journeyproductpurchase` (JPP, the Watson cross-join). `PJP.journeyref → journey`; `PSP.productref → products`; `PJP.participantproducts[]` enumerates the PSP delivery-unit ids; `JPP.watsonpurchaseid`/`watsonpurchaselabel` carry the Watson join + shift label. Delivery advances by flipping statuses up the chain (`PSP.status`, `deliverables.status`, `queue_token.currentstage`); a journey shift/upgrade manifests as `PJP.journeystatus ∈ {upgraded,shifted,downgraded}`, a 2nd PJP/JPP, `PSP.status="shifted"`, or a `watsonpurchaselabel` matching `/ to | upgrade/i`.

---

## 10. What this means for the e2e suite (one line)

The shell + render chain define the **seed precondition** (a logged-in `profile_data` with `participantmode`, a PJP/PSP purchase quartet, a `participantdeliverysequence`→`deliverables`→`queue_token` chain, plus the crash-guard fixtures above) under which **every cluster's features become reachable** — and the **anti-circular assertion** is always the doc the *app itself writes* on the action (see `FEATURE-CATALOG.md`'s `Writes = assertion target` column), never the seed doc.
