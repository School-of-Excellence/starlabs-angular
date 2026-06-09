# Journal — Implementing the REAL-mobile (Flutter) participant queue e2e

> Date 2026-06-09. Implements `specs/journals/2026-06-09-mobile-flutter-participant-e2e-handoff.md`.
> Plan: `specs/plans/2026-06-09-mobile-flutter-participant-e2e.md`. Branch `cicd`.
> WHY this exists: future sessions must not re-walk the toolchain gauntlet below — it cost hours.

## Goal
Replace the Admin-SDK participant stand-in (`e2e/lib/participant-sim.js`) with the REAL `breakthroughs`
Flutter app: each seeded participant advances its variation's **self-move** stages by tapping the real
action button; operator/auto hops stay on the real Angular board; assert the app's real writes via the
existing oracle + guards. Per-stage mobile screenshots. Target: cloud test project `slabs-queue-e2e-exdcz`.

## What was built (all complete)
- **Flutter harness** (in `breakthroughs-flutter/`, mostly gitignored or new):
  - `lib/firebase_options.dart` — TEST-project options (web+iOS). Gitignored. main() reuses it via `if (Firebase.apps.isEmpty)`.
  - `integration_test/support/e2e_firebase.dart` — init + **hard project-id guard** (refuses any non-test project) + emulator switch behind `--dart-define=QUEUE_E2E_TARGET`.
  - `integration_test/support/robot.dart` — the participant page-object (programmatic sign-in, `pumpWidget(MyApp())` boot [avoids main()'s runZonedGuarded zone-mismatch + mobile-only plugin inits], bounded pumping [SpinKit spinners hang `pumpAndSettle`], tap action, FillForm Preview→Confirm, poll the live token, best-effort screenshots).
  - `integration_test/smoke_test.dart`, `integration_test/walk_test.dart` (parameterized N self-moves via `--dart-define`).
  - `test_driver/integration_test.dart` — `flutter drive` driver; writes screenshots to `breakthroughs-flutter/mobile-evidence/`.
  - **Sanctioned widget keys** (the one allowed product touch, SEPARATE commit): `queueControl.dart:193` `Key('e2e-queue-action')`, `:430` `Key('e2e-stage-status')`; `FillForm.dart:2031` `Key('e2e-form-preview')`, `:2393` `Key('e2e-form-confirm')`.
- **Orchestrator (Node/Playwright)** under `e2e/queue/mobile/`:
  - `walk-lib.ts` — ports the proven `lyl-first-cycle.spec.ts` machinery (oracle `classifyForwardHop`, `driveBoardHop` with board-computed count-drift, the universal guards), and adds `driveFlutterSelfRun` (`flutter drive walk_test.dart`) + screenshot attach.
  - `mobile-walk.spec.ts` — per variation: reset token → drive hops (SELF run → one flutter drive; OP/AUTO → real board) → assert after each → terminal → attach mobile screenshots. 1 representative participant/variation (all 9); `VARIATIONS=` to subset.
  - `playwright.mobile.config.ts`, `global-setup.ts`, `setup-mobile-fixture.cjs`, `advance-to-form.cjs`, `probe-client-write.cjs`.

## Key model facts (validated)
- **Client writes ALLOWED** on the cloud test project for a signed-in participant (queue_token PATCH, queue stage log CREATE, formsByClient CREATE in `firestore-forms`) — proven via REST probe. No rules deploy needed.
- The **only** participant self-move kind across all 9 variations is the **FORM submit** (no variation uses videoask/slots; Triple-ATC's forward edge is an operator button). So the Flutter robot only automates FillForm.
- The exported `sample-queue-config.json` lost every stage's `actionresource` DocumentReference (refs don't JSON-serialize) → form stages would push `FillForm(formpath:null)` and crash. `setup-mobile-fixture.cjs` seeds a default-DB `delivery forms` template (one OPTIONAL field) and patches `queue generation.stageproperty.<formStage>.actionresource` to it. Fixture-only; the board doesn't read it.
- Anti-circularity: `moveQueueStage` writes NO `movedby`; the board writes `movedby = operator profileid`. `assertEveryMoveLogged(..,{minNonSelf=#boardHops})` proves the trail isn't satisfiable by self-writes alone.

## ⚠️ THE TOOLCHAIN GAUNTLET (the expensive part — read before touching the Flutter build here)
The machine has **bleeding-edge** Flutter 3.44 + **Xcode 26.5**; this app targets an OLDER toolchain. Web is impossible (mlkit/ffmpeg/callkit/etc. have no web impl). iOS-simulator path required, in order:
1. **Flutter 3.44 → 3.29.3 (Dart 3.7.2).** The app's deps fail on Dart 3.12: `google_fonts 6.2.1` (FontWeight const-keys) and `flutter_icons_null_safety 1.1.0` (`IconData` is `final` in newer Dart, no fix available). Installed `~/flutter-sdks/flutter` (3.29.3); use its `bin/flutter` for ALL flutter commands.
2. **google_fonts 6.2.1 → 6.3.3** (within `^6.2.1`; lockfile only).
3. **`lib/firebase_options.dart`** (gitignored/absent) — generated for the test project.
4. **`ios/Runner/GoogleService-Info.plist`** (gitignored/absent; FlutterFire/Crashlytics build phase requires it) — generated via `firebase apps:sdkconfig IOS <appId>` (registered a TEST-project iOS app `1:4035859533:ios:accc13ce303eadddd07804`).
5. **`flutterfire` CLI** missing in the Xcode "Run Script" phase → a **no-op stub** at `~/e2e-bin/flutterfire` (crashlytics symbol upload is irrelevant to e2e); prepend `~/e2e-bin` to PATH for builds.
6. **Xcode 26.5 rejects `-destination id=<udid>`** (lists only placeholder destinations) — Flutter 3.29.3 emits that form for `-d`. PATCHED the local SDK: `flutter_tools/lib/src/ios/mac.dart` (~:360) + `xcodeproj.dart` (~:211) to use a resolvable sim destination. NOTE: editing flutter_tools source does NOT auto-recompile the tool — must `rm bin/cache/flutter_tools.{snapshot,stamp}` to force it.
7. **Arch**: the generic sim destination builds **x86_64**, but host+sim are **arm64** (install fails "no matching arch"). Forcing `ARCHS=arm64` broke Flutter's framework-thinning. Fix: use `platform=iOS Simulator,name=$E2E_SIM_NAME` (resolves on 26.5 AND targets the specific arm64 sim → natural arm64 build). Run with `E2E_SIM_NAME="iPhone 17 Pro"`.

The canonical run incantation (sim must be booted + `open -a Simulator` so xcodebuild enumerates it):
```
open -a Simulator; xcrun simctl boot "iPhone 17 Pro"
cd breakthroughs-flutter
PATH="$HOME/e2e-bin:$HOME/flutter-sdks/flutter/bin:$PATH" E2E_SIM_NAME="iPhone 17 Pro" \
  flutter drive --driver=test_driver/integration_test.dart --target=integration_test/<test>.dart \
  -d <booted-udid> --dart-define=QUEUE_E2E_TARGET=cloud
```

## State / pending (as of writing)
- App **compiles + links + reaches install** with the 3.29.3 toolchain + patches. The arm64/`name=` fix is in its first full rebuild (the smoke). Operator board: builds + serves at :4200 (HTTP 200). Cloud seeded (`run1`, 50 participants) + mobile fixture applied.
- **Pending:** confirm the smoke (one real tap advances the real token) → run `mobile-walk.spec.ts` per variation (V1 first, then all 9) → merge mobile screenshots into the evidence report → commit (keys as a separate labelled commit) → update PROGRESS.
