# 2026-06-11 — Flutter app: comprehensive functionality map + 200-user journey + full e2e suite

> **Goal (operator, this session):** (1) Map ALL functionality of the **breakthroughs-flutter** participant app
> comprehensively from data + code + configs. (2) Build a sample journey for **≥200 users** from purchase→current,
> the **median** user having attended **≥4 events** and **journey shifted/upgraded ≥once**. (3) ONLY THEN build an
> e2e suite for **all** Flutter functionality with **≥9 users**, tested automatically both as a **journey flow** and
> as **individual functionality checks**. Iterate to full scope, no scope cut, evidence = screenshots + stored
> results. Dynamic workflows + Opus subagents (Sonnet only if rate-limited; never Haiku).

## The pivot (why this is net-new)
All prior `specs/validated/` docs + the `e2e/<group>/` Playwright suites cover the **Angular web app**. The goal
targets the **Flutter participant app** (`breakthroughs-flutter/`, branch `development`). The ONLY existing Flutter
e2e is `e2e/queue/mobile/` — it covers the **queue self-move only** (9 variations green). So mapping *all* Flutter
functionality + the 200-user dataset + a full Flutter e2e suite is largely new work.

## Scale (measured)
- **250 Dart files, ~203K LOC, ~50 top-level feature areas.** pubspec: firestore/auth/messaging/remote-config/
  storage/crashlytics, mlkit-face, ffmpeg, callkit-incoming, video/audio players, QR scanner, syncfusion calendar,
  posthog, go_router (but see below), dio, share_plus, ~90 deps.
- **177 distinct Firestore collections** referenced (grep of `.collection('…')`). ATC collections appear
  (`atc_alpha`, `atc_initiated`, `atc model`, `upload atc`, `to_transcript`, `atc taxonomy`) → **OFF-LIMITS**:
  map existence only, never seed/test.
- Endpoints: publit.io media CDN, Firebase Storage (fir-sample-aae4a), Watson CFs (`startlabs_userverification`/
  `_userdata`), `emailOTP`, `requestApptCancel`, `workshopAssignment`, OpenAI chat completions, youtube data API.
- Local `breakthroughs-flutter/lib/firebase_options.dart` already points at the **test project**
  `slabs-queue-e2e-exdcz` (gitignored) — the e2e build is test-safe by construction.

## App shell (read directly — main.dart)
- `MyApp` = `MaterialApp`, `home: MyHomePage()` (2s splash) → `Home()` if `auth.currentUser != null` else `Login()`.
  Named routes `/login /register /forgotpassword /home`. **The `GoRouter` block is COMMENTED OUT** — deep links flow
  through `DeeplinkNavigation` + `app_links` + `onUnknownRoute`, NOT go_router. (Don't mis-document go_router as live.)
- `Home` (home.dart, 2385 lines) = the real nav hub; `MoreMenu.dart` = the feature index.

## Journey/products/shift model (validated/01 — grounds Phase 2)
- `participantjourneyproduct` (5,144) = purchase record of truth: `profileid`, `journeyref`, `subscriptionstart`(=t0),
  `onboarded`, `purchaseref`→`journeyproductpurchase`, `participantproducts[]`, **`journeystatus`** ∈ {initiated,
  ongoing, **upgraded**(1124), **shifted**(38), downgraded(344), cancelled(518), completed(1525)}.
- **Journey shift/upgrade** for the Phase-2 median = a 2nd `participantjourneyproduct` with status `upgraded`/`shifted`
  (33% of real profiles progress: uP!⇒B!G 200, B!G⇒B!G Continuity 157, CTD⇒uP! 117…). Shift = Watson new purchase
  `product="<A> to <B>"` + old→cancelled + carryover; StarLabs `journeystatus="shifted"`.
- Join key = `profileid` (StarLabs) ↔ Watson by email; catalog = journey(48)/products(104)/package(49).

## e2e harness pattern (read directly — grounds Phase 3)
- **`robot.dart`** (page-object): programmatic `signIn` (sanctioned helper), `bootApp` pumps `app.MyApp()` directly
  (NOT app.main() — runZonedGuarded zone mismatch hangs pump), bounded `pumpFor`/`pumpUntilFound` (continuous SpinKit
  → no `pumpAndSettle`), `dismissBlockingOverlays` (studio-invite + ProfileImage gate). **Anti-circular**: assert on
  what the APP wrote (`queue_token`/`queue stage log`), never a test-written value.
- **Screenshots**: iOS `binding.takeScreenshot` is BLANK for this GPU/platform-view app → robot prints
  `CAP marker: <name>` and the Node orchestrator (`driveFlutterSelfRun`) fires `xcrun simctl io screenshot` on it.
- **`walk_test.dart`**: parameterized via `--dart-define` (E2E_EMAIL, E2E_TOKEN_ID, E2E_SELF_HOPS, E2E_LABEL); boots
  once, loops actions, screenshots each, asserts the token advanced.
- **`walk-lib.ts`** (orchestrator): `ensureSimBuildPrereqs` (stub overrides + clear xcconfig + pub get),
  `bootedSimUdid`, `dismissIosNotificationPrompt` (idb), `attachAndAuditFrames` (**L1 imaging guard**: badframes =
  missing+blank; ≥3 → HARD FAIL — the "screenshot + stored-result" evidence mechanism).
- **Stable product Keys** as test affordances (`e2e-queue-action`, `e2e-form-confirm`…) — a separate labelled commit.
- **Flutter-home render chain** (setup-mobile-fixture.cjs): `profile_data.participantmode`+`profileimg` →
  `participantsproduct`(mode,ongoing,productref) → `products`(mode) → `participantdeliverysequence`→
  `deliverables.fileref[0]` → `queue_token`; + crash-guards (`applivestreaming`, `static meta data/HPC Config`,
  neutralize `queue planning`/`studioinvitation`/`adsplaylist`). Phase 1's per-feature read-chains extend this.

## Plan (3 phases, gated)
1. **Map (in progress).** 1A: dynamic workflow `flutter-functionality-map` (run `wf_d6687746-4aa`) — 17 Opus agents
   over MECE clusters → `specs/flutter-app/clusters/*.md` + a structured catalog row each → I assemble
   `specs/flutter-app/FEATURE-CATALOG.md` + `00-overview.md`. 1B: background recon agent (read-only prod) →
   `…-artifacts/JOURNEY-DATA-BLUEPRINT.md` (real events-per-user + shift distributions + the 200-user seed blueprint).
2. **200-user dataset.** Extend `setup-mobile-fixture.cjs` + `e2e/lib/seed-common.js` into a cohort seeder on the
   **test project**; verify median ≥4 events + ≥1 shift/upgrade with a read-only probe (store the output).
3. **Full Flutter e2e.** Extend robot/walk/orchestrator to all features × ≥9 users; journey-flow + individual checks;
   real-screen screenshots + audited stored results. ATC OFF-LIMITS throughout.

## Constraints honored
Production READ-ONLY (svstats harness, prod SA). Test users + all seeding on `slabs-queue-e2e-exdcz` only. ATC never
read/seeded/tested. Evidence discipline: every claim cites a probe output or code `file:line`.

## Status at journal write
Phase 1A workflow + Phase 1B recon agent launched and running. Grounding (above) done directly. Awaiting both to
assemble the catalog and seed blueprint.
