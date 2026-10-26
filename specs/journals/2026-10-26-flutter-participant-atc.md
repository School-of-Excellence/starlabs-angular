# 2026-10-26 — WiSH / EI Solution parts + ATC model image in the app's participant ATC screen

Plan: `specs/plans/2026-10-26-flutter-participant-atc-wish-ei.md`.
App repo: `Breakthroughs-Achievement`, branch `atc-feature` (base `27a0ec0`). All changes uncommitted.

## How the scope landed
- **Started as a specialist view.** The first draft (`Breakthroughs-Achievement/specs/plans/2026-10-26-atc-wish-ei-specialist-view.md`)
  assumed the app had to show specialists the new fields, Review log included, and listed six decisions (where, which
  ATCs, sections, Review log writes, roles, tests).
- **Operator: the app is participant-only.** `ClientATC` is deprecated; `ParticipantATC` is the only valid ATC screen.
  That removed most of the decisions: same screen, same query, no Review log, no roles. The specialist draft was
  deleted at the operator's request; leave all other existing ATC code as it is.
- **Participants now see Ask / Outcomes.** A change from the web, where the participant view stayed unchanged
  (2026-10-23). Appointment link skipped.
- **Directive label: added, then removed.** First agreed "Immediate outcome" (WiSH) / "ATC directive" (others); the
  operator then chose to keep the directive exactly as today, with no label.
- **ATC model image (new ask).** From the `image` field of `atc model` (default DB). No image → show nothing (no
  placeholder). 1:1, cropped to fill (BoxFit.cover). Same image for every ATC of a model, mapped once at setup.
  I asked about "duplicates" meaning two `atc model` docs with the same name (the web de-duplicates them); the operator
  said there are none, so no tie-break rule.
- **Testing:** tests only feed data; ATC may be tested against the emulator only, mirroring the web's 2026-10-13 rule.
  The widget tests here need no database at all.
- The design was shown as a mockup (two revisions: drop the directive label, drop the "new" annotation chips) before
  building.

## What was built
- `lib/Main Screen/atcTemplateSections.dart` (new; imports only Flutter + google_fonts, so tests load without Firebase):
  - helpers: `isWishATC` / `isEiSolutionATC` (lowercase + trimmed `product`), `atcOutcomeRows`, `atcAskRows`
    (complete rows only, `askedby` capitalised), `atcModelImageFor`;
  - `AtcModelImage`: 42px, 1:1, radius 10, cover; builds nothing when missing, while loading, or on a load error, so
    the title row is unchanged without an image;
  - `AtcTemplateSections`: "WiSH outcomes" (01, 02, …) or "Ask · area of focus" (1, 2, …) in a `#f2f2f2` panel; nothing
    for other models or when no row is complete. Never reads `reviewlog`.
- `lib/Main Screen/participantATC.dart`: `mapATCModelImage` filled in `initState` from `atc model` (key: lowercase +
  trimmed `atcmodel`, non-empty `image` only); image left of "{product} ATC"; sections after the directive. Query,
  directive and adjustments untouched.
- `test/atc_template_sections_test.dart`: 11 tests, fake maps. Includes the participant guard (an EI map with
  `reviewlog` renders none of it) and the image fallbacks.

## Small calls made while building (flagged to the operator)
- Nothing shows while the image loads, so a card can shift slightly when it appears.
- Panel colour `#f2f2f2` (already in the screen) instead of the mockup's near-identical grey; row detail text in the
  app's `#687684`.

## Results
- `flutter test`: 17/17 (11 new + 6 existing), run twice.
- `flutter analyze` on the changed files: 0 errors; only info-level hints (2 new `use_super_parameters`, matching the
  screen's existing `Key? key` style).
- Not run on a device: needs a logged-in participant with WiSH / EI ATCs.

## Side finding: `ios/Runner.xcodeproj/project.pbxproj` shows modified
Not touched by this work. Rewritten at 18:14 together with `ios/Podfile.lock` (same second), i.e. by a `pod install`
(CocoaPods 1.16.2, run by `flutter run` / `flutter build ios`). The diff is format-only: `objectVersion` 60 → 54, the
local Swift package reference's comment shortened (its `relativePath` unchanged), empty `inputPaths` / `outputPaths`
removed. Left out of this change.

## Pending
- Optional emulator test (wire `firestore-atc` in `integration_test/support/e2e_firebase.dart`).
- Plan step 5: app docs (`docs/flutter-app/README.md` firewall line, `clusters/atc-offlimits.md`).
- Commit on `atc-feature` when the operator asks.

## Update: block moved into the full ATC (later 2026-10-26)
- The operator committed the first version, then asked for the Ask / Outcomes block to sit **inside the full ATC**
  (the part opened by "View Full ATC ↓"), not in the closed card. Two mockups were shown before building (WiSH, then
  EI Solution's Ask on request).
- Confirmed: the model image stays in the title row; the grey panel stays. The block is the first item of the full
  ATC, a white strip matching the adjustment strips, holding the `#f2f2f2` panel.
- Code: `AtcTemplateSections` now builds the white strip itself (so an empty block leaves no blank strip);
  `ParticipantATC` renders it only when `expandedAdjustment[index]` is true, before the adjustments list.
- Tests: +1 (white strip holding the grey panel) → 12 ATC tests; full suite 18/18. Open/closed gating lives in
  `ParticipantATC`, which needs Firebase, so it isn't covered by a widget test; not checked on a device yet.

