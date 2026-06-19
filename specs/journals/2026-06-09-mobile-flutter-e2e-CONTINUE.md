# CONTINUE HERE — REAL-mobile (Flutter) participant queue e2e (new-session handoff)

> Date 2026-06-09. Self-contained continuation guide. Companions: the original brief
> `specs/journals/2026-06-09-mobile-flutter-participant-e2e-handoff.md`, the `-IMPL.md` journal (build
> narrative), the operator's `2026-06-09-flutter-3.44-xcode26-migration-handoff.md` (toolchain), the plan
> `specs/plans/2026-06-09-mobile-flutter-participant-e2e.md`, and the memory `mobile-flutter-e2e-toolchain`.
> **Plans tell WHAT; this journal tells WHY + HOW-to-continue.**

---

## 0. TL;DR — what state we're in
The participant half of the queue e2e now runs on the **REAL `breakthroughs` Flutter app** (iOS simulator),
replacing the Admin-SDK `participant-sim` stand-in. **All 9 variations walk entry→terminal GREEN** (`9 passed,
42.7m`): self-moves = real form taps in the app, operator/auto hops = the real Angular board, every transition
asserted by the existing oracle + guards on the app's **real Firestore writes** (anti-circular). **Clean
per-stage mobile screenshots** work (real device captures via `xcrun simctl` + `idb` to dismiss a system prompt).
Everything is **committed locally (NOT pushed — push is gated)** on `cicd` (this repo) and `development`
(the nested `breakthroughs-flutter` repo). A final "all-9 with clean screenshots" re-run was in progress at
handoff (V1–V4 ✓); it only refreshes the evidence report — the substance is already proven.

**Nothing about the queue/oracle/guards changed** — this is the desktop `lyl-first-cycle.spec.ts` walk with the
SELF hops swapped from `participant-sim.advance(by:'self')` to real Flutter taps. Same flow-model, same assertions.

---

## 1. HOW TO RUN IT (the most important section)

Prereqs (most are machine-local + gitignored — regenerate on a fresh machine, see §6): `/opt/homebrew/bin/flutter`
(3.44.1), Xcode 26.5, a booted "iPhone 17 Pro" sim, `~/e2e-bin/flutterfire` stub, `~/Library/Python/3.9/bin/idb`
(fb-idb), ADC for the cloud test project, `e2e/node_modules` (`cd e2e && npm install`), and the gitignored
config files in §6.

```bash
# 1. seed the cloud test project (idempotent; needs ADC + firebase-admin in e2e/)
cd e2e
TESTRUNID=run1 TEST_PROJECT=slabs-queue-e2e-exdcz node fixtures/seed-test-project.js --seed
# 2. mobile fixture: actionresource on form stages + Flutter-home queue chain + dashboard docs + neutralize
TESTRUNID=run1 node queue/mobile/setup-mobile-fixture.cjs
# 3. deploy the dashboard composite indexes (one-time; wait until READY)
cd .. && firebase deploy --only firestore:indexes --config firebase.indexes.json --project slabs-queue-e2e-exdcz
# 4. boot the sim so xcodebuild can enumerate it
xcrun simctl boot "iPhone 17 Pro"; open -a Simulator
# 5. run the walk (all 9, or VARIATIONS=<rawId|name,...> for a subset)
cd e2e && SKIP_SEED=1 FLUTTER_BIN=/opt/homebrew/bin/flutter \
  npx playwright test --config=playwright.mobile.config.ts
#    → e2e/playwright-report-mobile/index.html (board screenshots + attached mobile screenshots)
```
- `SKIP_SEED=1` reuses the existing seed+fixture (the mobile `global-setup.ts` otherwise does teardown+seed+fixture).
- The run is **strictly serial** (`workers:1`, shared `run1` seed, port 4200) and **slow**: ~12m for the first
  variation (pod install + first build), ~3–5m each after (build cached). All 9 ≈ 45m.
- A single-stage smoke: `flutter drive --driver=test_driver/integration_test.dart
  --target=integration_test/smoke_test.dart -d <udid> --dart-define=QUEUE_E2E_TARGET=cloud` (after
  `node queue/mobile/advance-to-form.cjs` parks p0 at a form stage). Run with `PATH="$HOME/e2e-bin:$PATH"`.

---

## 2. ARCHITECTURE — the pieces and WHY

**The walk (Node/Playwright, in `e2e/queue/mobile/`):**
- `mobile-walk.spec.ts` — one test per variation. Per variation: `resetToken` → `loginAsOperator` + board
  `selectQueue` → walk the oracle hops. **SELF hops → real Flutter taps** (`driveFlutterSelfRun`, batched: a
  contiguous run of form self-moves is one `flutter drive`); **OP/AUTO hops → the real Angular board**
  (`driveBoardHop`, the desktop machinery). After each hop: the guards. V9 (Prep-Hold) is degenerate (0 hops).
- `walk-lib.ts` — ported lyl-first-cycle machinery: oracle `classifyForwardHop`, `primaryJourney`
  (longest entry→Completed via `forwardJourneys`), `buildTargets` (1 representative participant per variation,
  index = first in that variation's seed range), `driveBoardHop` (board move + board-computed count-drift),
  `assertAfterHop` (no-orphan / no-skip / every-move-logged{minNonSelf} / loop-bound), `driveFlutterSelfRun`
  (spawns `flutter drive walk_test.dart` non-blocking, captures real per-stage screenshots — see §5),
  `ensureSimBuildPrereqs` (writes `pubspec_overrides.yaml`, clears the stale `Generated.xcconfig`, `pub get`).
- `playwright.mobile.config.ts` (testDir `./queue/mobile`, the board served at :4200), `global-setup.ts`
  (teardown+seed+fixture unless SKIP_SEED=1), `setup-mobile-fixture.cjs` (§4), `advance-to-form.cjs` (smoke
  precondition), `probe-client-write.cjs` (WIRE-step proof that client writes are allowed).

**The Flutter side (`breakthroughs-flutter/integration_test/` + `test_driver/`):**
- `support/e2e_firebase.dart` — init Firebase with the **test-project** options + a **HARD project-id guard**
  (throws on any non-test project) + emulator switch behind `--dart-define=QUEUE_E2E_TARGET`. WHY: the handoff
  requires the test-target switch to refuse prod; this is the single gate that makes a participant tap unable to
  ever hit production.
- `support/robot.dart` — the participant page-object: programmatic Firebase-Auth sign-in (a sanctioned helper);
  `bootApp` = `pumpWidget(MyApp())` (NOT `app.main()` — main()'s `runZonedGuarded` trips integration_test's zone
  check and HANGS `tester.pump()`); `dismissBlockingOverlays` (defer the studio-invitation overlay + pop the
  ProfileImage gate — see §4); bounded pumping (`pumpFor` — `pumpAndSettle` hangs on the app's continuous SpinKit
  animations); scroll-to-find the queue card (it's deep in the dashboard scroll); FillForm Preview→Confirm; poll
  the live token (read what the APP wrote). `screenshot()` is a NO-OP (iOS binding shots are blank — see §5).
- `smoke_test.dart`, `walk_test.dart` (parameterized N self-moves via `--dart-define`), `test_driver/integration_test.dart`.
- **Sanctioned widget keys (the ONLY product touch, separate commit `79fb846`):** `queueControl.dart`
  `Key('e2e-queue-action')` (:193) + `Key('e2e-stage-status')` (:430); `FillForm.dart` `Key('e2e-form-preview')`
  (:2031) + `Key('e2e-form-confirm')` (:2393, "Confirm & Submit"). NOTE: `queueControl.dart` is the home-card
  action button; `queueStageDetail.dart`'s copy has a `selfmovalble` typo making its self-move dead — don't use it.

---

## 3. TOOLCHAIN — stock 3.44 + Xcode 26.5 (and the dead end we abandoned)

WHY this matters: the machine's defaults (Flutter 3.44, Xcode 26.5) are NEWER than the app's old deps.
- **First approach (RETIRED):** I downloaded Flutter **3.29.3** (Dart 3.7, the app's `sdk: ^3.7.2` era) to dodge
  the Dart-3 incompatibilities, then hand-patched `flutter_tools` for Xcode 26.5 (`-destination id=<udid>` is
  rejected; only `generic`/`name=` resolve) and fought an x86_64-vs-arm64 build. **This whole gauntlet is dead.**
- **What we use (the operator's migration, `breakthroughs-flutter` `development` commits `b796cea`+`71020fd`):**
  stock **Flutter 3.44.1 / Dart 3.12.1**. The Dart-3 breakages were fixed at the dep level:
  `flutter_icons_null_safety 1.1.0` (`class … extends IconData`, illegal since IconData is `final`) → **vendored &
  patched** to plain `const IconData(...)` at `packages/flutter_icons_null_safety/` (path dep); `google_fonts`
  non-const FontWeight keys → **6.3.3**; `google_mlkit_face_detection` + `ffmpeg_kit_flutter_new` ship **no
  arm64-iOS-sim binary** → pure-Dart no-op **stubs** at `packages/sim_stubs/` applied via a gitignored
  `pubspec_overrides.yaml` (device/prod/CI have no overrides → real plugins). `Generated.xcconfig` GOTCHA:
  `flutter clean` does NOT rewrite it, and a stale `EXCLUDED_ARCHS` forces x86_64 → `ensureSimBuildPrereqs`
  deletes it before `pub get`.
- `~/e2e-bin/flutterfire` is a **no-op stub** — the Xcode "Run Script" Crashlytics phase calls `flutterfire`
  (not installed); symbol upload is irrelevant to e2e. Prepend `~/e2e-bin` to PATH for flutter commands.

---

## 4. SEED-COMPLETENESS — the long pole (operator chose this over a test-mode app guard)

WHY: the participant **Home is a full dashboard** that fires ~20 background queries on boot. The queue-minimal
seed (built for the Angular board, which reads `queue_token` directly) didn't satisfy them, so the dashboard
errored and the integration test aborted before the queue card was tappable. The operator chose to fix this with
**data only (no app edit)**. All of this lives in `setup-mobile-fixture.cjs` + `firestore.indexes.json` + one
`fake-data.js` line. Each fix, and WHY:
1. **~30 composite Firestore indexes** (`firestore.indexes.json`, deployed via `firebase.indexes.json`). The
   dashboard's `where+orderBy` / multi-`where` queries (participantsproduct, content analytics[logdate DESC],
   3minuteshpc, evolutionwishlistlog, interimreport log[profileid,lastupdate], livechangework[arrayContains],
   supportchat, postcollection, content_urls, studioinvitation, queue studio pairing, stagechat, …) each need a
   composite index — **even on empty collections** (the requirement is schema-level). Mapped exhaustively by
   reading `home.dart`+`homeContent.dart`.
2. **Flutter-home queue chain** (the reason the queue card renders): the Flutter Home resolves the queue via
   `profile_data.participantmode`(=Event Mode) → `participantsproduct`(mode==participantmode, status ongoing,
   real `productref`) → `products`(mode) → `participantdeliverysequence/{pid}.products[active].delivery[type==
   'queue'].sequenceref` → `deliverables.fileref[0]` → `queue_token`. The Angular-board seed never modelled this
   Flutter path, so the fixture seeds it for every participant (incl. `profileimg`, or `home.dart:472` pushes the
   ProfileImage "Verify Your Profile" screen over Home).
3. **Two uncaught-crash docs:** `applivestreaming/livestreaming` = `{participants:[]}` (`liveStream()` casts it to
   List, no onError) and `static meta data/HPC Config` = `{awards:{}}` (`homeContent.dart:643` does
   `hpcConfig!['awards']` unguarded).
4. **`fake-data.js` `queue planning` `stagecohort {}→[]`** (the app casts it to List in `checkBigCohortEvent`).
5. **Neutralize studio invitations** (`clientresponse:'deferred'`) so the "Your Turn Has Come!" accept/defer
   overlay doesn't cover the queue card (the first 3 seeded participants are the studio cohort), and **empty
   `queue planning.planning`**. The robot ALSO dismisses these at runtime as a backstop (defer overlay + pop
   ProfileImage via the app's `navigatorKey`).
These are FIXTURE data a real participant would have — the desktop studio specs re-seed fresh, so they're
unaffected. No app logic was touched (only the sanctioned keys).

---

## 5. SCREENSHOTS — blank binding → simctl + idb

WHY: iOS `IntegrationTestWidgetsFlutterBinding.takeScreenshot` returns a **BLANK white image** for this
GPU/platform-view app. So `robot.screenshot` is a no-op and the per-stage shots are captured at the **OS level**:
`driveFlutterSelfRun` spawns the drive non-blocking, polls its log for the robot's `WALK[...] hop N: at "<stage>"`
markers, and runs `xcrun simctl io <udid> screenshot`. But that caught the iOS **first-launch notification
permission prompt** (rendered in-sim by SpringBoard — osascript/simctl can't reach it), so we use **`idb`**
(`~/Library/Python/3.9/bin/idb ui describe-all` to find the Allow/Don't-Allow button + `ui tap` its frame center)
to dismiss it first. Result: clean per-stage captures of the real queue card ("Click to Fill Form" at each
stage). NOTE: the Python **3.14** idb is broken (asyncio); pin the 3.9 one (`IDB_BIN` override). The
**authoritative** mobile proof is the guards + the real Firestore trail + the per-hop tap logs — screenshots are
supplementary.

---

## 6. MACHINE-LOCAL, GITIGNORED files (regenerate on a fresh machine)
- `breakthroughs-flutter/lib/firebase_options.dart` — TEST-project web+iOS options (apiKey/appId from
  `firebase apps:sdkconfig WEB/IOS --project slabs-queue-e2e-exdcz`). NEVER prod.
- `breakthroughs-flutter/ios/Runner/GoogleService-Info.plist` — `firebase apps:sdkconfig IOS
  1:4035859533:ios:accc13ce303eadddd07804` (a TEST iOS app I registered). NEVER prod.
- `breakthroughs-flutter/pubspec_overrides.yaml` — the sim stubs (`ensureSimBuildPrereqs` writes it).
- `src/environments/environment.ts` + `environment.development.ts` — Angular board → test project web config
  (built via `ng build --configuration development` → `dist/atctranscription/browser`, served at :4200).
- `~/e2e-bin/flutterfire` (no-op stub); `~/Library/Python/3.9/bin/idb` (`pip install --user --break-system-packages
  fb-idb` under python 3.9).

---

## 7. ANTI-CIRCULARITY — why this is real proof
`moveQueueStage` (the participant self-move) writes **NO `movedby`**; the Angular board writes
`movedby = operator profileid`. So `assertEveryMoveLogged(token, n, {minNonSelf=#boardHops})` cannot be satisfied
by self-writes alone, and `assertNoStageSkipped`/`assertLoopBound`/`assertTerminalReached` read the REAL
`queue_token`/`queue stage log` the APP/board wrote (never a value the test wrote). The guards are themselves
self-tested (`e2e/queue/invariants-selftest.spec.ts`, `@oracle`) — they provably fire on a defect. Verified on
the real cloud trail: e.g. p0 ended at `Completed` with 15 log rows (5 self-move `movedby=<none>` + 10 board).

---

## 8. COMMIT STATE (local only — PUSH IS GATED, nothing pushed)
- `starlabs-angular` `cicd`: `b2f0a54` (harness + seed-completeness + indexes + plan/journals),
  `319d842`+`00b6f17` (docs/PROGRESS), `4e7c657` (simctl screenshots), `88673eb` (idb prompt-dismiss).
- `breakthroughs-flutter` `development` (atop the operator's migration `b796cea`/`71020fd`): `79fb846` (widget
  keys — separate, per the handoff mandate), `af16c74` (integration_test harness), `6a9c30d` (robot screenshot no-op).
- Do NOT push without operator approval. `main` (both repos) is off-limits.

## 9. OPEN / OPTIONAL FOLLOW-UPS
- The all-9 **clean-screenshot** run was finishing at handoff (V1–V4 ✓; check `/tmp/fullclean.log` or just re-run
  §1 step 5). It refreshes `e2e/playwright-report-mobile/` with clean per-stage shots — substance already green.
- Optional adversarial evidence audit (guards already self-tested).
- "All 50 participants" is the labelled STRETCH goal; we drove **1 representative per variation** (the handoff's
  "real mobile coverage of every flow"). `buildTargets` already takes a participant list — scale `VARIATIONS`/the
  index logic to drive more.
- Consider folding the seed-completeness (`setup-mobile-fixture.cjs` chain) awareness into the desktop seed docs.

## 10. GOTCHAS for the next session
- **cwd persists between Bash calls here** (contrary to old ORIENTATION lore) — but always use absolute `cd` for
  flutter (it builds the wrong/no project otherwise). The flutter SELF-run output goes to
  `/tmp/flutterdrive-<label>.log` (the spawn), NOT the playwright stdout.
- The sim must be **booted AND `open -a Simulator`** or `xcodebuild` only sees placeholder destinations.
- `flutter drive` output buffers if piped through `| tail` — redirect to a file and read it.
- Serial only — one walk at a time (shared `run1` seed + port 4200); the desktop `run-isolated.sh` lock applies.
- ATC stays OFF-LIMITS; the test target is ONLY `slabs-queue-e2e-exdcz`; never weaken an assertion; never edit
  `lib/**`/`src/**` beyond the sanctioned keys.
