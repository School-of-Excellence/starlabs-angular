# Plan — Vendor & patch `flutter_icons_null_safety` to unblock Flutter 3.44 / Dart 3.12

> Date 2026-06-09. Repo: `breakthroughs-flutter/` (branch `development`). Approved by operator.
> Companion journal (WHY): `specs/journals/2026-06-09-flutter-icons-dart3-unblock.md` (written on completion).

## Problem
The `breakthroughs` Flutter app is pinned to the OLD toolchain (Flutter 3.29.3 / Dart 3.7.2) — see
`specs/journals/2026-06-09-mobile-flutter-participant-e2e-IMPL.md` "TOOLCHAIN GAUNTLET". The pin exists
because two deps fail to **compile** on the machine's stock Flutter 3.44 / Dart 3.12.1 (they *resolve*
fine; they break at compile):

1. **`flutter_icons_null_safety: ^1.1.0` (HARD).** `lib/src/flutter_icon_data.dart:4` does
   `class FlutterIconData extends IconData`. Dart 3.0 made `IconData` a `final class` → cannot be
   extended outside its library. 1.1.0 is the latest version (stale). Used by 24 app files / ~66 icons
   via 6 font classes (MaterialCommunityIcons 30, Entypo 15, FontAwesome 14, Ionicons 6, Feather 1,
   Octicons 1). `FlutterIcons`/`FlutterIconData` are referenced 0 times by the app (only the per-font
   classes are).
2. **`google_fonts` (SOFT, lockfile-only).** Older versions use non-`const` `FontWeight` map keys that
   trip Dart 3.12. Lock is at 6.3.2; need ≥6.3.3, already inside the existing `^6.2.1` range.

Removing these unblocks Flutter 3.44 natively, retiring the entire gauntlet (SDK downgrade, patched
`flutter_tools`, x86_64/arm64 sim fight, Xcode 26.5 `-destination` workaround) — all of which exist
*only* because of the 3.29.3 pin.

## Why vendor+patch (not replace)
- `flutter_vector_icons` has identical class names but is Dart-2-only (`sdk <3.0.0`, same `extends
  IconData` bug) → not a drop-in.
- `icons_plus` is Dart-3-safe but lacks MaterialCommunityIcons/Entypo/Feather and changes the API.
- Migrating 66 call sites across a mix of packages risks glyph mismatches (esp. Entypo). 
- Vendor+patch = **zero call-site changes, identical glyphs, identical class names**, dep removed.

## Steps
1. **Vendor** pub-cache `flutter_icons_null_safety-1.1.0` → `breakthroughs-flutter/packages/flutter_icons_null_safety/`.
   Copy only `lib/`, `fonts/`, `pubspec.yaml`, `LICENSE`, `README.md`, `CHANGELOG.md`. Exclude
   `example/`, `test/`, `glyphs/` (unreferenced), `.iml`, `package.json`.
2. **Patch the source (mechanical):** in every `lib/src/*.dart` (incl. the aggregate `flutter_icons.dart`),
   rewrite each `const FlutterIconData.<namedCtor>(<dec>)` → `const IconData(<dec>, fontFamily:'<Family>',
   fontPackage:'flutter_icons_null_safety')` using the namedCtor→family map from the original
   `flutter_icon_data.dart`. Then delete `lib/src/flutter_icon_data.dart` and drop its `import` lines.
   Assert no `FlutterIconData` token remains. (All codepoints are decimal — verified.)
3. **Raise the vendored pubspec** `environment: sdk:` from `>=2.12.0 <3.0.0` to `>=2.12.0 <4.0.0`
   (must work on BOTH the operator's current 3.29.3 build AND 3.44).
4. **Wire the app:** in `breakthroughs-flutter/pubspec.yaml` replace `flutter_icons_null_safety: ^1.1.0`
   with `flutter_icons_null_safety:\n    path: packages/flutter_icons_null_safety`. Bump `google_fonts`
   to ≥6.3.3 (within `^6.2.1`). `flutter pub get` on **stock 3.44**.
5. **Verify on 3.44 (decisive, no iOS gauntlet):**
   - `dart analyze packages/flutter_icons_null_safety` → no `extends IconData` / no errors.
   - `flutter build bundle` → compiles ALL app Dart (incl. the 24 icon files + patched pkg) against
     Dart 3.12. Success ⇒ the compile blockers are gone end-to-end.
   - (`flutter analyze lib` for residual icon/google_fonts errors.)
6. **Commit** on `development` (do NOT sweep unrelated e2e WIP; the new `packages/` dir as one commit,
   pubspec wiring as another). **Do not push.** Write the journal. Update `PROGRESS.md` at session end.

## Rollback
The change is additive + lockfile. Revert = restore `pubspec.yaml`/`pubspec.lock` and delete
`packages/flutter_icons_null_safety/`. The operator's 3.29.3 build keeps working throughout (the
vendored pkg compiles on Dart 3.7.2 too).

## Out of scope
The iOS native build / e2e run on 3.44 (separate follow-up). This plan only removes the *dependency*
compile blockers and proves the app's Dart compiles on 3.44.
