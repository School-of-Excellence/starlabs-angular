# Journal — Removing the Dart 3 / Flutter 3.44 compile blockers from the `breakthroughs` Flutter app

> Date 2026-06-09. Repo: `breakthroughs-flutter/` (branch `development`, commit `b796cea`, NOT pushed).
> Plan: `specs/plans/2026-06-09-flutter-icons-vendor-patch.md`.
> Context it resolves: the "TOOLCHAIN GAUNTLET" in `2026-06-09-mobile-flutter-participant-e2e-IMPL.md`.

## What was asked
"What dependencies are blocking the Flutter app, and how to get rid of them." Then: do it.

## What was blocking (evidence-based)
Two deps **resolve** fine on stock Flutter 3.44.1 / Dart 3.12.1 but fail to **compile** — which is the
real reason the app was pinned to Flutter 3.29.3 / Dart 3.7.2 (and thus the whole Xcode 26.5 / arm64 /
patched-flutter_tools gauntlet):

1. **`flutter_icons_null_safety: ^1.1.0` (HARD).** Its `lib/src/flutter_icon_data.dart:4` declares
   `class FlutterIconData extends IconData`. Dart 3.0 made `IconData` a **`final class`** → cannot be
   extended outside its library. 1.1.0 is the latest version (stale/unmaintained). Used by 24 app files,
   ~66 icons, via 6 font classes (MaterialCommunityIcons 30, Entypo 15, FontAwesome 14, Ionicons 6,
   Feather 1, Octicons 1). Every icon is `static const IconData x = const FlutterIconData.<font>(cp)`,
   so that one illegal subclass underpins all of them.
2. **`google_fonts` (SOFT, lockfile-only).** Older versions use non-`const` `FontWeight` map keys that
   trip Dart 3.12. Lock was at 6.3.2; needed ≥6.3.3 — already inside the existing `^6.2.1` range.

## WHY vendor+patch (and not a replacement package)
- `flutter_vector_icons` has **identical class names** (would be a 24-import-line drop-in) BUT is
  Dart-2-only (`sdk: '>=2.12.0 <3.0.0'`, last published 2022) and carries the *same* `extends IconData`
  bug — it's the upstream ancestor of the null-safety fork. Dead end.
- `icons_plus` is Dart-3-safe but **lacks MaterialCommunityIcons / Entypo / Feather** and changes the
  API (suffix-style names) → partial coverage + 66 reworked call sites + glyph-matching risk (Entypo
  especially has no clean modern source).
- Vendor+patch = **zero call-site changes, identical glyphs, identical class names**, dep removed. Lowest
  risk to behavior and the fastest route back to Flutter 3.44.

## What was done
- Vendored pub-cache `flutter_icons_null_safety-1.1.0` → `breakthroughs-flutter/packages/flutter_icons_null_safety/`
  (lib + fonts + pubspec + license/readme/changelog; dropped `example/`, `test/`, unreferenced `glyphs/`).
- Mechanical rewrite (perl, 16 namedCtor→fontFamily rules copied verbatim from the original
  `flutter_icon_data.dart`): `const FlutterIconData.<font>(<dec>)` → `const IconData(<dec>,
  fontFamily:'<Family>', fontPackage:'flutter_icons_null_safety')`. Deleted `flutter_icon_data.dart`,
  dropped its imports. Hard assertion: **0** surviving `FlutterIconData`/`extends IconData` tokens.
- Raised the vendored pubspec `environment: sdk` `<3.0.0` → `<4.0.0`.
- App `pubspec.yaml`: `flutter_icons_null_safety: ^1.1.0` → `path: packages/flutter_icons_null_safety`.
- `flutter pub upgrade google_fonts` → 6.3.3 (lock only).

## Verified (stock Flutter 3.44.1 — no iOS gauntlet)
- `flutter analyze` of the vendored package: **0 errors** (only 2 harmless pre-existing lints in the
  app-unused `icon_toggle.dart` — a `withOpacity` deprecation + a null-check warning).
- `flutter build bundle`: **exit 0** — the entire app's Dart (24 icon files + patched package +
  google_fonts 6.3.3) compiles against Dart 3.12.1.

## What surprised us / gotchas for next time
- The breakage is literally **one line** (`extends IconData`); the per-font icon classes are plain const
  holders. The aggregate `FlutterIcons` class is used **0×** by the app (only the per-font classes are).
- `pub get` **succeeds** on 3.44 — resolution doesn't check source compilability. Only compilation fails.
  Don't trust a green `pub get` as "Dart-3 compatible."
- Second gotcha beyond the source fix: the vendored package's **own** `sdk: <3.0.0` cap would have failed
  `pub get` on Dart 3 even after fixing `extends IconData`. Had to raise it too.
- Kept `<4.0.0` (not `>=3.0.0`) deliberately: the patched package now compiles on **both** Dart 3.7.2
  (operator's current 3.29.3 build) and 3.12.1, so the existing build keeps working — this change is safe
  to land without flipping toolchains.

## iOS-sim build test on stock 3.44 — RESULT (the deeper blocker)
Ran `flutter build ios --simulator --debug` on stock Flutter 3.44.1 / Xcode 26.5 (flutterfire stub on
PATH; firebase_options.dart + GoogleService-Info.plist present; NO flutter_tools patches, NO 3.29.3).

- **Build SUCCEEDS — exit 0** (pod install 24s + Xcode build 410s → `Built …/Runner.app`). So the
  *toolchain-patch* half of the gauntlet is genuinely retired: stock 3.44 compiles+links the app with no
  patched `flutter_tools`, no `-destination` hack, no SDK downgrade.
- **BUT the artifact is x86_64-only** (`lipo -archs Runner` → `x86_64`; App.framework + ffmpegkit also
  x86_64). 3.44's new preflight names why: **`ffmpeg_kit_flutter_new`** and the **GoogleMLKit** pods
  (from `google_mlkit_face_detection` / `google_mlkit_commons`: MLKitFaceDetection, MLKitVision, MLImage,
  MLKitCommon) ship **no arm64-simulator slice**, so CocoaPods drops the whole app to x86_64.
- **x86_64 won't run on the arm64 iOS-26 sim** — confirmed empirically: `xcrun simctl install booted` →
  `rc=4`, *"Failed to find matching arch for input file: …/Runner.app/Runner … needs to be updated by
  the developer to work on this version of iOS."* Launch then fails (app never installed).

**Conclusion:** the real wall for *simulator* e2e is NOT Flutter version and NOT the Dart deps — it's two
plugins with no arm64-sim binaries. This is the SAME issue the 3.29.3 "arm64 fight" was about; that path
was never actually confirmed to run (the journal said the smoke was "pending"). Switching Flutter
versions cannot fix it; the plugin binaries must change or be removed for a sim build.

## arm64-sim RESOLVED — stub BOTH plugins (commit `71020fd`)
Operator chose "upgrade/replace" then "stub mlkit". During execution BOTH plugins turned out
un-upgradeable to arm64-sim:
- **google_mlkit_face_detection**: Google ships no arm64-sim GoogleMLKit (latest FaceDetection 7.0.0
  resolved; still none). Confirmed dead-end.
- **ffmpeg_kit_flutter_new**: pub.dev's "arm64-simulator" arch label was **misleading** — 4.2.1 vendors a
  plain `ffmpegkit.framework` (not an xcframework; its arm64 slice is *device*-only) and its podspec sets
  `EXCLUDED_ARCHS[sdk=iphonesimulator*] = 'i386 arm64'`. So upgrading ffmpeg did NOT help; it needed the
  same treatment.

**Fix applied (pure-Dart no-op stubs, committed):** `packages/sim_stubs/google_mlkit_face_detection`
(mirrors InputImage.fromFilePath / FaceDetector / FaceDetectorOptions / FaceDetectorMode / Face / 
processImage / close — used only by `lib/profileimage.dart`) and `packages/sim_stubs/ffmpeg_kit_flutter_new`
(mirrors FFmpegKit.execute / FFmpegSession.getReturnCode+getOutput / ReturnCode.isSuccess — used only by
`lib/HPC/hpc.dart`). No `flutter: plugin:` section ⇒ no native pod ⇒ the MLKit + ffmpeg pods (and their
arm64-sim exclusions) vanish ⇒ pure-arm64 build. Wired ONLY via a gitignored `pubspec_overrides.yaml`
(local-only; device/prod/CI keep the real plugins).

**⚠️ GOTCHA — stale `Generated.xcconfig`:** after stubbing, the build was STILL x86_64 because
`ios/Flutter/Generated.xcconfig` kept a stale `EXCLUDED_ARCHS[sdk=iphonesimulator*]=i386 arm64` from the
earlier real-plugin build. **`flutter clean` does NOT rewrite Generated.xcconfig.** Fix: `rm
ios/Flutter/Generated.xcconfig .flutter-plugins*` then `flutter pub get` — it regenerates with arm64
allowed (`=i386` only). Then build WITHOUT `flutter clean` (which reintroduces the stale file).

**VERIFIED on stock Flutter 3.44.1 / Xcode 26.5 / arm64 iPhone 17 Pro (iOS 26):**
`lipo -archs Runner` → `x86_64 arm64`; `xcrun simctl install booted` → **rc=0**; `simctl launch` → **rc=0**
(PID 21389); screenshot shows the live app's notification-permission dialog. The 3.29.3 gauntlet is fully
retired — stock 3.44 produces a runnable arm64 sim build end-to-end.

## How to toggle sim-e2e vs device/prod
- **Sim e2e (arm64):** ensure `pubspec_overrides.yaml` exists (stubs + win32) → `flutter pub get` →
  `rm ios/Flutter/Generated.xcconfig` → `flutter build ios --simulator` (PATH has the `~/e2e-bin/flutterfire`
  stub). The e2e orchestrator should create/remove `pubspec_overrides.yaml` around the sim build.
- **Device / production:** NO `pubspec_overrides.yaml` (it's gitignored, never shipped) → real plugins.
  `pubspec_overrides.yaml` is excluded via `.git/info/exclude` (local). For team-wide use, add it to the
  tracked `.gitignore`.

## Pending / next
- **Wire `pubspec_overrides.yaml` create/remove into the e2e orchestrator** so sim builds stub and
  device/prod don't. Then run the actual participant `mobile-walk` e2e on 3.44.
- Commits local-only, **NOT pushed** (operator-gated): `b796cea` (Dart deps) + `71020fd` (sim stubs) on
  `development`. Working tree left sim-e2e-ready: `pubspec.lock` shows the stub path overrides (uncommitted);
  ios/ WIP restored from `/tmp/ios-wip-backup`. `build/` + Pods are the arm64 sim build (gitignored).
- `PROGRESS.md` not yet rewritten (do at session end).
- Committed locally (`b796cea`), **not pushed** (push is operator-gated). `pubspec.yaml` carried the
  pre-existing `integration_test` dev-dep along (shared file). The committed `pubspec.lock` is the
  3.44 resolution; it self-reconciles if `pub get` is next run under 3.29.3.
- `PROGRESS.md` not yet rewritten (do at session end).
