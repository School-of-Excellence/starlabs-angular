# Plan — arm64 iOS-simulator build for e2e (upgrade ffmpeg + stub mlkit)

> Date 2026-06-09. Repo: `breakthroughs-flutter/` (branch `development`). Operator-approved via two
> decisions: "upgrade/replace the plugins" → then "stub mlkit for sim build".
> Companion journal: `specs/journals/2026-06-09-flutter-icons-dart3-unblock.md` (iOS section).

## Problem
After the Dart-deps fix, stock Flutter 3.44 builds the app — but **x86_64-only**, because two plugins
ship no arm64-iOS-simulator binary, so it can't install on the arm64 iOS-26 sim (`Failed to find matching
arch`). The two:
- `ffmpeg_kit_flutter_new` — **fixable**: latest 4.2.1 (within `^4.1.0`) declares `arm64-simulator`.
- `google_mlkit_face_detection` (+ transitive `google_mlkit_commons`) — **not fixable**: Google ships no
  arm64-sim GoogleMLKit; latest (FaceDetection 7.0.0) still lacks it; no drop-in replacement (only Apple
  Vision, a rewrite). Used by exactly ONE file (`lib/profileimage.dart`), NOT by the queue e2e.

## Approach
1. **ffmpeg**: `flutter pub upgrade ffmpeg_kit_flutter_new` → 4.2.1 (lockfile-only; arm64-sim slice).
   Good for ALL targets incl. device → safe to commit.
2. **mlkit**: pure-Dart no-op **stub package** `packages/mlkit_stubs/google_mlkit_face_detection/`
   mirroring the 5 symbols `profileimage.dart` uses (InputImage.fromFilePath, FaceDetector,
   FaceDetectorOptions, FaceDetectorMode, Face{headEulerAngleX/Y/Z}, processImage, close). No `flutter:
   plugin:` section ⇒ no native MLKit pod ⇒ commons + MLKitVision/MLImage/FaceDetection all drop out ⇒
   pure-arm64 build. `processImage` returns one neutral face so the profile-upload flow still passes on
   the sim.
3. **Apply the stub LOCALLY only** via a gitignored `pubspec_overrides.yaml` (must also re-list the
   existing `win32: ^5.0.0` override — pubspec_overrides REPLACES, not merges). Device/prod/CI builds
   (no overrides file) keep the REAL plugin. This is why the override is NOT in pubspec.yaml.

## Steps
1. Create the stub package (pubspec + lib/google_mlkit_face_detection.dart).
2. `pubspec_overrides.yaml` (gitignored) = win32 + mlkit→stub path. Add `pubspec_overrides.yaml` to
   `.gitignore`.
3. `flutter pub upgrade ffmpeg_kit_flutter_new`; `flutter pub get`; `flutter analyze lib/profileimage.dart`.
4. Rebuild `flutter build ios --simulator --debug` on stock 3.44 (back up + restore ios/ WIP first).
   Verify `lipo -archs Runner` → **arm64**, ffmpeg framework → arm64, NO MLKit frameworks present.
5. `xcrun simctl install booted` → success (proves it runs on the arm64 sim).
6. Commit the **stub package + ffmpeg lock bump + .gitignore line** on `development` (NOT
   pubspec_overrides.yaml; NOT the e2e WIP). Do not push. Journal. Restore ios/ WIP.

## Repeatability (for the e2e harness, out of scope to wire here)
The e2e orchestrator should write `pubspec_overrides.yaml` (stub) before the sim build and remove it
after — keeping prod/device builds clean. Documented in the journal.

## Rollback
Delete the stub package + `pubspec_overrides.yaml`; `flutter pub downgrade ffmpeg_kit_flutter_new` (or
leave 4.2.1 — it's strictly better). Nothing here touches the real plugin for device/prod.
