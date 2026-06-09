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

## Pending
- **Full 9-variation walk IN PROGRESS** (`mobile-walk.spec.ts`): each variation entry→terminal, SELF hops via real Flutter taps, OP/AUTO via the real Angular board, asserted by the oracle + guards, per-stage mobile screenshots merged into the evidence report. Validating V1 end-to-end first, then all 9.
- Then: merge mobile screenshots into `e2e/playwright-report/`; final adversarial evidence audit; update the IMPL journal with results; decide on pushing the Flutter `development` commits (operator-gated).
