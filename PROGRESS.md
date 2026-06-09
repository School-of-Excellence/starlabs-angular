# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-09 (mobile-Flutter participant e2e)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-06-09-mobile-flutter-participant-e2e-IMPL.md` + the memory `mobile-flutter-e2e-toolchain`.

## Current state
- Angular 19 + Firebase PWA across 3 Firebase projects; queue e2e suite green on the disposable cloud test project `slabs-queue-e2e-exdcz` (Admin-SDK participant stand-in for the desktop suite).
- **NEW: the participant half of the queue e2e now runs on the REAL native Flutter app** (`breakthroughs-flutter`) on an iOS simulator (stock Flutter 3.44 / Dart 3.12 + Xcode 26.5, via the 2026-06-09 migration: vendored `flutter_icons_null_safety`, `google_fonts` 6.3.3, pure-Dart `sim_stubs` for mlkit/ffmpeg behind a gitignored `pubspec_overrides.yaml`).
- **SMOKE GREEN (committed):** participant0 tapped the real "Click to Fill Form" button; the app advanced its real `queue_token` (`Accelerated Evolution Level Form → uP! Life Aspiration Report`, `movedby=<none>` — a genuine self-move, asserted on the app's own write). Anti-circularity holds: the test taps; the app writes; the unchanged guards read the real trail.
- Harness committed: `e2e/queue/mobile/` (walk-lib + mobile-walk + config + fixtures), Flutter `integration_test/` + `test_driver/` + the sanctioned widget keys (separate commit). Client writes are allowed on the test project (no rules deploy). Branch `cicd`; Flutter on `development` (commits local, not pushed).

## Last session changes (2026-06-09) — why
- **Toolchain migration to stock 3.44 + Xcode 26.5** (the machine's defaults; the app's old deps were Dart-3-incompatible). My initial 3.29.3 + patched-flutter_tools gauntlet was RETIRED in favour of the operator's vendored-package migration.
- **Seed-completeness (operator chose this over a test-mode app guard):** the participant Home is a full dashboard that errored on the queue-minimal seed. Fixed WITHOUT editing the app: ~30 composite Firestore indexes (the Home's dashboard queries), `fake-data.js` `stagecohort {}→[]`, and `setup-mobile-fixture.cjs` now seeds the **Flutter-home queue-resolution chain** (`profile_data.participantmode` + `participantsproduct`+`products` + `participantdeliverysequence`+`deliverables`→token), `applivestreaming`/`HPC Config` docs, `profileimg`, and neutralizes studio invitations + queue planning. The robot also dismisses the studio-invitation overlay + pops the ProfileImage ("Verify Your Profile") gate.

## ✅ DONE — full 9-variation walk GREEN (`9 passed`, 42.7m)
All 9 variations walked entry→terminal: SELF hops by REAL Flutter taps, OP/AUTO by the REAL Angular board, every transition asserted by the oracle + guards (no-orphan / no-skip / every-move-logged{minNonSelf} / loop-bound / terminal / count-conserved), anti-circular (real Firestore writes). Includes B!G-Next-Cycle (the 24-stage in-person/Triple-ATC flow). Run: `cd e2e && SKIP_SEED=1 npx playwright test --config=playwright.mobile.config.ts`.

## ✅ Mobile screenshots — CLEAN per-stage captures working
`xcrun simctl io screenshot` (iOS `binding.takeScreenshot` is blank for this app) + `idb ui tap` to dismiss the first-launch notification prompt (rendered in-sim, unreachable by osascript/simctl). **All-9 clean-screenshot run COMPLETE — `9 passed (41.1m)`** (full walk reproduced exactly; same hop counts as the 42.7m run): **37 unique clean per-stage PNGs** showing the real queue card ("Click to Fill Form" at each stage) merged into `e2e/playwright-report-mobile/`. (idb = fb-idb 3.9 CLI; `IDB_BIN` override.)

## Pending / follow-ups (optional)
- Adversarial evidence audit (the guards are already self-tested, `@oracle`); scale from 1 representative participant/variation to all 50 (labelled STRETCH); push the Flutter `development` + `cicd` commits (operator-gated, currently local only).
