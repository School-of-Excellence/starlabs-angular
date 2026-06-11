# Cluster: Auth & Journey Onboarding (login/register/forgot/terms/code/registration form/onboarding v1+v2/info request)

## Overview
This cluster is the participant's front door and first-run experience in the **breakthroughs-flutter** app. It covers credential auth (email/password login, self-service registration gated by a Watson allow-list verification, password reset, terms display), a "generate authorized code" utility, two profile-data intake surfaces (a legacy aspiration/registration form and a live profile-change-request flow), and the **Journey Onboarding** gate that locks a first-time, single-journey participant into a guided flow (welcome → orientation intro slides → time-compression learning → journey orientation detail with subscription/product overview → book an onboarding call → "Set Up My App" completion) before the normal 5-tab app is unlocked. There are TWO onboarding implementations in the tree: **JourneyOnboardingV2** (LIVE, wired from `home.dart`) and **JourneyOnboardingProcess** (DEAD legacy V1, referenced by nothing outside itself).

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| Login | `login.dart:21` | Email+password sign-in; pre-checks `profile_data` for account flags (deleted/blocked/enabled) before Firebase Auth sign-in |
| Register | `register.dart:19` | Self-service account creation; Watson allow-list CF check → FirebaseAuth create → write `user_data` |
| ForgotPassword | `forgotpassword.dart:12` | Send Firebase password-reset email (routed through `AppTheme().forgotpasswordwidget`) |
| TermsAndConditions | `termsandconditons.dart:5` | Static legal text + refund policy (no data) |
| GenerateCode | `generatecode.dart:7` | Generate a unique hex authorization key code via CF, dedupe, write `authorisation_key_code` |
| CustomerRegistrationForm | `customerRegistrationForm.dart:12` | **DEAD** legacy aspiration intake form → writes `aspiration_form` |
| ProfileInfoRequest | `profileinforequest.dart:29` | 3-step "Raise a Change Request" wizard; submits a support ticket (no direct profile write) |
| JourneyOnboardingHome | `JourneyOnboardingV2/journeyOnboardingHome.dart:15` | LIVE onboarding hub: welcome / main (book call + 2 nav boxes + explore) / completion screens |
| JourneyOrientationIntro | `JourneyOnboardingV2/journeyOrientationIntro.dart:6` | Intro carousel slides; on finish sets `orientationstatus:"initiated"` |
| TimeCompressionInfo | `JourneyOnboardingV2/timeCompressionInfo.dart:7` | 4-page "Science of Time Compression" + orientation video checklist + progress |
| JourneyOnboardingDetail | `JourneyOnboardingV2/journeyOnboardingDetail.dart:14` | 7-step journey orientation: intro video → overview → journey detail → subscription/products → experience (queue/event/other bottom sheets) → what-lies-ahead → congratulations |
| ScheduleOnboarding | `JourneyOnboardingV2/scheduleOnboarding.dart:12` | Book the onboarding call: EIS slot discovery across 5-day window, slot merge by role, write `appointments` + flag on journey |
| AppSettingUpStateV2 | `JourneyOnboardingV2/journeyOnboardingHome.dart:943` | "Setting up your app" loader; on finish writes `orientationstatus:"completed"` |
| journeyBoardingHome / journeyOrientation / journeyProductPlanning / orientationOnboarding | `JourneyOnboardingProcess/*` | **DEAD** legacy V1 onboarding (see Dead code) |

## Features

### Email/Password Login
- **What the user does:** Enters registered email + password, taps "Log In"; can toggle password visibility, go to Forgot Password, or go to Register.
- **Nav/entry:** App auth route `/login` (`main.dart:213`, `:435`); also pushed as `Login()` from register/forgot/logout paths. Default unauthenticated entry.
- **Reads:** `profile_data` where `email == <lowercased email>` limit 1 (`login.dart:116`); checks fields `user_ref`, `accountdeleted`, `enable`, `block`.
- **Writes:** `profile_data/{profileDoc}` merge `{last_login: serverTimestamp}` on success (`login.dart:343`). Also persists credentials to secure storage + user-ids via `UserData()` (`login.dart:84-91`).
- **Endpoints:** FirebaseAuth `signInWithEmailAndPassword` (`login.dart:341`). (Dead-coded email/phone OTP paths exist but are commented out — `sendEmailOTP` would hit `…/emailOTP` CF.)
- **Config flags:** none.
- **Journey stage:** onboarding (gateway).
- **e2e-testability:** Yes — needs a seeded `profile_data` doc with `email`, `user_ref`, `enable:true`, plus a matching Firebase Auth user in the test project. Cover deleted/blocked/disabled/unfound branches.

### Account flag enforcement on login
- **What the user does:** Receives an "Unauthorized"/"User Not Found" alert if the account is deleted/blocked/not-enabled/missing.
- **Nav/entry:** automatic inside `login()`.
- **Reads:** `profile_data` (same query as above) — `accountdeleted`, `block`, `enable` (`login.dart:120-128`).
- **Writes:** none on the blocked branches.
- **e2e-testability:** Yes — seed profile docs with each flag combination.

### Self-service Registration (Watson-gated)
- **What the user does:** Enters full name, email, optional phone (country-code picker), password + confirm; taps "Create Account"; can open Terms of Service or jump to Login.
- **Nav/entry:** `/register` route; "Create Account" button on Login (`login.dart:707`).
- **Reads:** none from Firestore (client-side `validateForm` only — email regex, password ≥6, confirm match — `register.dart:882`).
- **Writes:** `user_data/{uid}` set `{name, number, email}` after FirebaseAuth create (`register.dart:411`).
- **Endpoints:** Watson user-verification CF `starlabs_userverification?email=` — project-switched: prod `watsonproduction-becde`, test `watson-9878`, `starlabs-test`→`watson-test-19` (`register.dart:167-179`); FirebaseAuth `createUserWithEmailAndPassword` (`register.dart:409`). Must return `'true'` to proceed.
- **Config flags:** behaviour keyed on `Firebase.app().options.projectId`.
- **Journey stage:** onboarding (pre-account / purchase boundary — only pre-provisioned emails pass Watson).
- **e2e-testability:** Partial — the Watson CF is an EXTERNAL prod/test endpoint (firewall concern; see e2e notes). Account-creation + `user_data` write are testable against the test project if the Watson CF returns true for the seeded email; otherwise stub/allow-list.

### Password Reset
- **What the user does:** Enters email, taps "Reset Password"; gets a snackbar with a "Login Page" action.
- **Nav/entry:** `/forgotpassword` route; "Forgot Password ?" on Login (`login.dart:633`).
- **Reads:** none.
- **Writes:** none (FirebaseAuth side-effect only).
- **Endpoints:** FirebaseAuth `sendPasswordResetEmail` (`forgotpassword.dart:74`); UI flows through `AppTheme().forgotpasswordwidget` (`forgotpassword.dart:188`).
- **e2e-testability:** Yes (no-op assertion / snackbar). Email delivery itself is not assertable in-app.

### View Terms & Conditions
- **What the user does:** Reads static T&C + refund policy.
- **Nav/entry:** "Terms of Service" text on Register (`register.dart:556`).
- **Reads/Writes/Endpoints:** none.
- **e2e-testability:** Yes (pure static screen).

### Generate Authorized Code
- **What the user does:** Taps "Generate Code"; sees a generated hex code displayed.
- **Nav/entry:** "Generate Authorized Code" row in `MoreMenu.dart:75` (route `/generatecode`), passed `useruid`.
- **Reads:** `authorisation_key_code` where `code == <hex>` to dedupe (`generatecode.dart:55`).
- **Writes:** `authorisation_key_code` add `{user_ref: user_data/{useruid}, code, date_generated: serverTimestamp, used:false}` (`generatecode.dart:65`).
- **Endpoints:** CF `authorisation_key_code` (HARD-CODED PROD `us-central1-fir-sample-aae4a` — `generatecode.dart:43`) returns `{code:<int>}`.
- **Journey stage:** support / infra.
- **e2e-testability:** Partial — CF URL is hard-coded to PRODUCTION (firewall concern). The Firestore dedupe+write are testable if the CF is reachable/stubbed.

### Profile Change Request (3-step wizard)
- **What the user does:** Selects which fields to change (name/email/phone/DOB), enters new values + reason, reviews, submits. Submitting raises an In-App Support ticket; it does NOT directly mutate the profile (team processes it).
- **Nav/entry:** "Request Change →" on `profileimage.dart:481` (pushReplacement → `ProfileInfoRequest()`).
- **Reads:** none directly; current values come from in-memory `appService.loggedinProfile` (`name`, `email`, `number`, `dateofbirth`) (`profileinforequest.dart:62-83`). Indirectly `raiseTickets` reads `chat config` (`AppServices.dart:3653`).
- **Writes:** via `appService.raiseTickets(...)` (`profileinforequest.dart:228`) → `clientissue/{auto}` + `clientissue/{id}/messages/{auto}` batch (`AppServices.dart:3671-3708`), category "In-App Support".
- **Endpoints:** none HTTP (Firestore batch).
- **Journey stage:** support.
- **e2e-testability:** Yes — assert a `clientissue` doc + first `messages` doc are created with the formatted change-request body. Requires `appService.loggedinProfile['dateofbirth']` to be a Timestamp (calls `.toDate()` at `:82`).

### Onboarding gate / lock (entry into V2 flow)
- **What the user does:** (passive) On login, a first-time single-journey participant is locked out of the 5-tab app and shown `JourneyOnboardingHome` until orientation completes/cancels.
- **Nav/entry:** decided in `home.dart` `onBoarding()` (`home.dart:400-455`); rendered at `home.dart:2093` (`screens = onboardingJourney.isNotEmpty ? [JourneyOnboardingHome()] : …`), bottom-nav suppressed when locked (`home.dart:2192`).
- **Reads:** live snapshot `participantjourneyproduct` where `profileid == loggedinProfile.profileid` (`home.dart:404`); one-time `journeyonboardingdetail` where `journeyref == element.journeyref` (`home.dart:427`). Lock conditions: exactly 1 journey, `journeystatus ∈ {null,"initiated"}`, `journeyonboardingdetail` exists, `orientationstatus ∉ {"completed","cancelled"}`.
- **Writes:** none here (writes happen in child screens).
- **e2e-testability:** Yes — seed exactly one `participantjourneyproduct` for the profile with the lock-satisfying fields + a `journeyonboardingdetail` doc for the `journeyref`.

### Onboarding Home — Welcome / Main / Completion
- **What the user does:** Sees Welcome ("Let's Begin"→intro) when `orientationstatus==null`; the Main screen (book-call card, Time Compression + Journey Orientation nav boxes, "Explore While You Wait" content) otherwise; a Completion screen when `onboarded==true` with "Set Up My App".
- **Nav/entry:** rendered as the locked screen; internal pushes to Intro/Booking/TimeCompression/Detail (`journeyOnboardingHome.dart:80-114`).
- **Reads:** `classify` whereIn `["applockedcontent","paymentplan"]` (`:45`); then `content_urls` (general), `solar voice playlist`, `series` (eiflix) by the doc-ids listed in `applockedcontent.generalcontentplaylist/solarvoiceplaylist/eiflixplaylist` (`:55-66`). Booking card uses `onboardingJourney.paymentplan` + `classfiy.paymentplan.Onboardingpaymentmesage` to lock/unlock "Book a Call" (`:363-407`).
- **Writes:** on completion ("Set Up My App") `participantjourneyproduct/{docid}` update `{orientationstatus:"completed"}` (`:751`).
- **Endpoints:** none (content playback delegates to PlayRelatedVideo/episode/SolarVoicePlaylist screens — out of this cluster).
- **Journey stage:** onboarding.
- **e2e-testability:** Yes — drive all three states by seeding `orientationstatus` (null / set / `onboarded:true`) and `applockedcontent` classify doc. Note "Book a Call" is disabled when `paymentplan==null`.

### Orientation Intro slides
- **What the user does:** Pages through intro slides; on the last taps "Get Started".
- **Nav/entry:** "Let's Begin" on Welcome (`journeyOnboardingHome.dart:82`).
- **Reads:** `classify/journeyorientation` doc, uses `introduction` array (`journeyOrientationIntro.dart:26,33`).
- **Writes:** on finish `participantjourneyproduct/{docid}` merge `{orientationstatus:"initiated"}` (`:47`).
- **e2e-testability:** Yes — seed `classify/journeyorientation.introduction`; assert status flips to "initiated".

### Time Compression learning + orientation videos
- **What the user does:** Reads 4 pages on Time Compression; opens orientation videos from a checklist; sees % progress.
- **Nav/entry:** "Time Compression" nav box on Main (`journeyOnboardingHome.dart:576`).
- **Reads:** `classify` whereIn `["journeyorientation","timecompression"]` (`timeCompressionInfo.dart:44`); `content_urls` where `docid in <timecompression.contenturl ids>` (`:59`). Progress derived from `appService.lastWatchedVideo` via `appService.checkAnalytics(videoIDList)` (`:53`).
- **Writes:** none (final-complete write is commented out at `:460`; just pops).
- **Endpoints:** video playback via PlayRelatedVideo (`from:"journeyorientation"`).
- **e2e-testability:** Yes for the static pages + checklist render; video completion/progress depends on `content analytics` analytics state (seed `appService.lastWatchedVideo` or analytics docs).

### Journey Orientation Detail (7-step)
- **What the user does:** Watches intro video, journey overview video, reads journey description, subscription + product list, taps product cards (queue/event/other bottom sheets incl. "ATC Model" text), "What Lies Ahead", then "Congratulations → Go to Home Screen".
- **Nav/entry:** "Journey Orientation" nav box on Main (`journeyOnboardingHome.dart:590`).
- **Reads:** `journeyonboardingdetail` where `journeyref == onboardingJourney.journeyref` (`journeyOnboardingDetail.dart:70`); the `journeyref` doc itself (`:73`); **`atc model` where `atcmodel == journey.journey`** (`:77`); `content_urls` where `docid in [overviewvideo.id]` (`:88`); product docs via `subscriptionData()` reading the parent collection of `onboardingJourney.participantproducts[*].productref` whereIn doc-ids (`:131-141`). Uses `onboardingJourney.subscriptionstart/subscriptionend` for duration (`:470`).
- **Writes:** none.
- **Endpoints:** video playback via `appService.getContent` (BetterPlayer).
- **Config flags:** none.
- **Journey stage:** onboarding.
- **e2e-testability:** Yes (the `atc model` read is reference-only taxonomy, allowed). Requires seeded `journeyonboardingdetail`, journey doc, `content_urls`, products, and `onboardingJourney.subscriptionstart/end` Timestamps. NOTE: surfaces ATC-model copy text from `journeyonboardingdetail.queuedescripition.atcmodel` (config-driven string) and reads the reference `atc model` collection — map only, do NOT seed/test ATC data plane.

### Book Onboarding Call (ScheduleOnboarding)
- **What the user does:** Sees the onboarding appointment type pre-selected, picks a date (5-day window, day-after-tomorrow onward, filtered to dates with slots), picks a slot, "Make an Appointment", gets a confirmation; if no slots, "Request Slot" raises a ticket.
- **Nav/entry:** "Book a Call" / "Reschedule My Call" on Onboarding Home (`journeyOnboardingHome.dart:393,546`).
- **Reads:** `appointmenttype` (all, for name map — `scheduleOnboarding.dart:68`); `profile_data` orderBy name (host-name map — `:73`); `appointmenttype` where `onboardingcall==true` (`:81`); `AppointmentType-To-Roles` where `assigned_appttype_ref == <appt>` (`:104`); `customer_eismapping/{profileid}` (`:113`, field `eisroles`); `Roles-To-EIS` where `assigned_role_ref == <role>` (`:233`, field `assigned_eis`); `availability` where `profileref == <eis>` + `appointments array-contains <appt>` + starttime range (`:199`, `:263`, `:401`).
- **Writes:** `appointments` add (full appointment doc incl. `onboarding:true`, `journeycoach:true`, `bookedby`, `hosts`, `slotdata`, `journeyid`, `participantjourneyproductid` — `:481-503`); per-slot `availability/{id}` update (mark booked/available/totalbooked — `:469`); `participantjourneyproduct/{docid}` merge `{onboardingscheduled, onboardedby, appointmentid}` (`:507`). No-slot path: `appService.raiseTickets(category:"Journey Related")` → `clientissue` (`:723`).
- **Endpoints:** none HTTP (all Firestore).
- **Journey stage:** onboarding (delivery boundary — schedules first coach call).
- **e2e-testability:** Yes but data-heavy — requires the full appointment graph (`appointmenttype.onboardingcall`, `AppointmentType-To-Roles`, `Roles-To-EIS` or `customer_eismapping`, EIS `availability` docs with future bookable slots). Slot merge requires one bookable slot per required role at the same time. Shares the appointment/availability schema with the Appointments cluster.

## Firestore collections

### Read
- `profile_data` — login: where `email ==`, fields `user_ref/accountdeleted/enable/block`; schedule: orderBy `name` (host map).
- `participantjourneyproduct` — home gate: where `profileid ==` (snapshot), fields `journeystatus/orientationstatus/journeyref/paymentplan/onboardingscheduled/onreschedule/subscriptionstart/subscriptionend/participantproducts`.
- `journeyonboardingdetail` — where `journeyref ==` (gate existence check + detail content).
- `classify` — docs `applockedcontent`, `paymentplan`, `journeyorientation`, `timecompression`.
- `content_urls` — where `docid in […]` (general content / overview / orientation / time-compression videos).
- `solar voice playlist` — whereIn doc-ids (explore-while-you-wait).
- `series` — whereIn doc-ids (eiflix explore).
- `atc model` — where `atcmodel == journey.journey` (REFERENCE-ONLY taxonomy; safe per CLAUDE.md).
- `authorisation_key_code` — where `code ==` (dedupe).
- `appointmenttype` — all + where `onboardingcall == true`.
- `AppointmentType-To-Roles` — where `assigned_appttype_ref ==`, fields `required_role/additional_role`.
- `customer_eismapping/{profileid}` — field `eisroles`.
- `Roles-To-EIS` — where `assigned_role_ref ==`, field `assigned_eis`.
- `availability` — where `profileref ==` + `appointments array-contains` + `starttime` range; per-slot doc reads by id.
- `chat config` — (via `raiseTickets`) categories.
- *(DEAD V1 only, do not test):* `participant AEL`, `participantsproduct`, `products`, `participantdashboard`, `accelerated evolution level`, `content analytics` (journeyOrientation V1).

### Written
- `profile_data/{id}` — merge `{last_login}` (login success).
- `user_data/{uid}` — set `{name, number, email}` (registration).
- `authorisation_key_code` — add `{user_ref, code, date_generated, used}` (generate code).
- `participantjourneyproduct/{docid}` — merge/update `{orientationstatus}` (intro→"initiated", completion→"completed"); `{onboardingscheduled, onboardedby, appointmentid}` (booking).
- `appointments` — add full onboarding appointment doc.
- `availability/{id}` — update slot booked/available/totalbooked.
- `clientissue/{auto}` + `clientissue/{id}/messages/{auto}` — via `raiseTickets` (profile change request; no-slot request).
- *(DEAD legacy):* `aspiration_form/{profileid}` (CustomerRegistrationForm); `customer_registration_form/*` reads.
- *(Dead-coded, commented):* `generated_OTP` (login/register OTP verify paths).

## Endpoints & external services
- FirebaseAuth: `signInWithEmailAndPassword` (login), `createUserWithEmailAndPassword` (register), `sendPasswordResetEmail` (forgot), `verifyPhoneNumber`/`signInWithCredential` (dead-coded OTP).
- Watson user-verification CF `starlabs_userverification?email=` — project-switched (prod `watsonproduction-becde`, test `watson-9878`, `starlabs-test`→`watson-test-19`) — `register.dart:167`. EXTERNAL; gates registration.
- Authorization-code CF `authorisation_key_code` — **HARD-CODED PRODUCTION** `us-central1-fir-sample-aae4a` — `generatecode.dart:43`.
- Email-OTP CF `…/emailOTP?email=` — project-switched but **dead-coded/commented** in login + register.
- Video playback: BetterPlayer via `appService.getContent` / PlayRelatedVideo; Publit.io HLS URL is only in the DEAD V1 `orientationOnboarding.dart:549`.

## Config & feature flags
- No `RemoteConfig`, PostHog, or FCM usage in this cluster.
- Behaviour branches on `Firebase.app().options.projectId` (prod `fir-sample-aae4a`, `test-environment-841c3`, `starlabs-test`) for Watson/OTP CF URL selection.
- "Book a Call" enabled only when `onboardingJourney.paymentplan != null`; gated copy comes from `classify/paymentplan.Onboardingpaymentmesage` (data-driven, not a code flag).
- `flutter_secure_storage` used (via `UserData`) to persist login credentials/user-ids (`login.dart:11,84`).

## Dead / clone / Old code
- `loginOld.dart`, `registerOld.dart`, `forgotpasswordOld.dart` — **DEAD**, zero references outside their own files.
- **Entire `JourneyOnboardingProcess/` directory** (`journeyBoardingHome.dart`, `journeyOrientation.dart`, `journeyProductPlanning.dart`, `orientationOnboarding.dart`) — **DEAD legacy V1 onboarding**; referenced by nothing outside the directory (`home.dart` imports only `JourneyOnboardingV2/journeyOnboardingHome.dart`). V1 wrote `participantsproduct`/`participantdashboard`/`aspiration`-style flows and read `participant AEL`, `accelerated evolution level`, `content analytics`, and booked appointments itself — superseded by V2 + the home-screen schedule section. Map as existing; do not test.
- `customerRegistrationForm.dart` (`CustomerRegistrationForm`) — **DEAD**, referenced by nothing; legacy aspiration intake (`aspiration_form`, reads `customer_registration_form/{marriage,crisis,more questions,a Salaried Employee,a Business Owner,Others}`).
- Commented-out OTP flows in `login.dart` (`sendEmailOTP`, `getOTP`, `verifyEmailOTP`/`verifyFirebaseOTP`) and `register.dart` — not on the live path; the live path is direct email/password.
- `timeCompressionInfo.dart:460` final-complete Firestore write is commented out (just pops).

## Notes & open questions
- **ATC contact:** `journeyOnboardingDetail.dart:77` reads the `atc model` collection (reference taxonomy, safe) and renders ATC-model copy strings from `journeyonboardingdetail.queuedescripition.atcmodel`. This is config/reference text only — no ATC data-plane read/write. `atcTouch=true` is set on that feature for traceability but it remains e2e-testable (it does not touch the off-limits ATC collections).
- **Registration is effectively allow-list-only:** a participant can only self-register if the Watson CF returns `true` for their email (pre-provisioned by sales). E2E registration in the test project needs the `watson-test-19` (starlabs-test) CF to recognize the seeded email, or the CF stubbed/firewalled.
- **Prod-endpoint firewall risk:** `generatecode.dart` hard-codes the PROD CF host; the Watson CF for `fir-sample-aae4a` is prod. Per the e2e prod-endpoint firewall note, non-queue suites must block `*.cloudfunctions.net` prod hosts.
- **Onboarding gate is single-journey only:** users with >1 `participantjourneyproduct` bypass onboarding entirely (`home.dart:412`). Seeding for the locked flow must use exactly one journey doc.
- `ProfileInfoRequest` requires `appService.loggedinProfile['dateofbirth']` to be a Firestore Timestamp (`.toDate()` at `:82`) or it throws on load.
- The V2 status machine across screens: `null` → (intro) `initiated` → (booking) sets `onboardingscheduled` → (completion "Set Up My App") `completed`; `onboarded==true` short-circuits to the completion screen. TimeCompression and Detail do NOT advance `orientationstatus` (their advancing writes are commented out).
