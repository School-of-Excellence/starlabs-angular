# PROMPT / JOURNAL — Drive the 50 participants through the queue on the REAL mobile app (`breakthroughs-flutter`)

> Hand this whole file to a fresh Claude Code session. It is self-contained.
> Branch: **`cicd`** (consolidated; main working tree `/Users/antano/solarcode/ah/starlabs-angular`) or the
> `test/queue-e2e` worktree `/Users/antano/solarcode/ah/starlabs-angular-queue-e2e`.
> Read first (companions): `specs/queue-participant-app-map.md` (the participant action→code→Firestore map),
> `specs/journals/2026-06-08-complete-all-tests-cloud-evidence.md` (the desktop suite, cloud setup, A/B/C
> evidence levels, oracle + guards, safety + serial constraints, and the 2026-06-09 addenda: evidence audit,
> the @product/@oracle report split, and the invariants self-tests).
> **You MAY use a dynamic workflow** to both *wire* the harness and *complete* the test (see §7).

---

## 0. Goal (acceptance criteria)

Today the participant half of every queue test is driven by the **Admin-SDK stand-in** `e2e/lib/participant-sim.js`
(it writes the `queue_token` + `queue stage log` the participant app would write). **This task replaces that
stand-in with the REAL mobile app**: each of the **50 seeded participants** advances through its variation's
stages by **tapping the actual action buttons in `breakthroughs-flutter`** ("Ready for Next Stage" / "Click to
Fill Form"+submit / "Open VideoAsk"+complete / book a slot), exactly as a real participant on a phone would.

"Done" =
1. A **Flutter `integration_test`** harness drives the real `breakthroughs` app against the **disposable test
   Firestore** (cloud `slabs-queue-e2e-exdcz` or emulator `demo-slabs-queue`), logging in as each seeded
   participant and **tapping the real action button** at each self-move stage.
2. For **all 9 variations** (covering the 50 participants), each participant walks **entry → terminal**, with the
   **participant/self-move hops driven by real Flutter taps** and the **operator/compulsory hops driven by the
   real Angular board** (existing Playwright `queue-board.page.ts`). The two apps are orchestrated hop-by-hop.
3. Every transition is asserted against **real app output** (the `queue_token`/`queue stage log` the *Flutter app*
   wrote — never a value the test wrote) using the existing oracle + guards: `assertNoStageSkipped`,
   `assertEveryMoveLogged`, `assertLoopBound`, `assertTerminalReached`, `assertCountConserved`
   (`e2e/lib/assertions.ts`). Anti-circularity holds because **the test taps a button; the app performs the write**.
4. **Per-stage mobile screenshots** (Flutter `integration_test` screenshots) are captured as the mobile proof,
   alongside the existing desktop report. Green on the chosen test target.

**Discipline (unchanged):** never weaken/loosen an assertion; never edit `breakthroughs-flutter/lib/**` or
`src/**` to make a test pass. The **one sanctioned product touch** is adding test *affordances* — stable
`Key('…')` widget keys on the action buttons (they have none today) — and even that must be a separate,
clearly-labelled commit, not bundled with a "make it green" change. A real product bug → a finding, never a fake green.

---

## 1. The reality (correcting the original prompt)

The participant app is **native Flutter** (`breakthroughs`), NOT the Angular PWA. So **Playwright device
emulation cannot drive the participant side** — it can only drive the operator (Angular) board. The participant
side must be driven by a **Flutter** toolchain. (The earlier `2026-06-08-mobile-pwa-verification-handoff.md`
assumed Playwright/PWA — it is superseded by THIS doc for the participant half.)

App location: **`breakthroughs-flutter/`** (present in both worktrees; `pubspec.yaml` `name: breakthroughs`,
Flutter SDK ^3.7.2, `firebase_core` ^3.13 / `firebase_auth` ^5.5 / `cloud_firestore` ^5.6). A **`web/` target
exists** (Flutter web is buildable). There is **no `integration_test` set up yet** (only an empty `test/` dir).

## 2. How a participant moves a stage (from `queue-participant-app-map.md` — verify before wiring)

The action button is chosen by `stageproperty[currentstage]` in `lib/Delivery Queue/queueStageDetail.dart`
`actionButton()` (:56-91); the self-move write is `lib/Services/AppServices.dart` `moveQueueStage()` (:1261-1314):

| Stage kind | Button (default label) | Tap → effect |
|---|---|---|
| `actiontype:"form"` + `selfmovable` | "Click to Fill Form" | open `FillForm` → submit (`FillForm.dart` `submitform`, writes `formsByClient` in **`firestore-forms`**) → `moveQueueStage(formref)` |
| `actiontype:"videoask"` + `selfmovable` | "Open VideoAsk" | open `ArenaVideoAsk` → complete → `moveQueueStage(videoask)` |
| `selfmovable:true` (plain gate) | "Ready for Next Stage" | `moveQueueStage()` |
| slot-gated | (slot picker, `queueControl.dart` :806-832) | txn on `queue planning` (`usedslot++`) + `queue_token.selectedstageslot.{stage}` |
| `compulsoryactivity` (operator gate) | "Queue Position N" / "In Studio" (disabled) | **wait** — the OPERATOR moves them on the Angular board; app reflects it via a `queue_token` snapshot |
| `actiontype:"link"` | "Open Link" | `launchUrl` — **no queue_token write** |

`moveQueueStage()` writes (client-side, **no cloud function**): `queue_token.currentstage = variationStages[i+1]`,
`stagestatus:"Approved"`, `logdate`, optional `formref`/`videoaskref`, **and appends a `queue stage log` row**.
This is byte-for-byte what `participant-sim.advance()` replicates — so the *shape* the guards expect is already known.

**Implication:** the self-move half is fully exercisable by real taps with no CF. Only operator `nextstage`,
studio/mode side-effects need the deployed CFs (already deployed on the cloud test project).

## 3. The 50-participant scenario (what to drive)

The seed places 50 fake participants (`participantN+run1@example.com`, pw `Test!1234`, `e2e/queue/support/actors.ts`),
each token bound to a **variation** (V1…V9, `queue_token.variationid`). For each participant, walk its variation's
stage order (`flow-model.js` `outEdgesForVariation` is the oracle source of truth):
- at each **self-move** stage → drive the **real Flutter tap** (per §2) → assert the `queue_token` the app wrote
  advanced to the oracle's next stage, and exactly one new `queue stage log` row (movedby reflects the app, not 'self'-only where operator-driven);
- at each **operator/compulsory** stage → drive the **real Angular board** move (existing `queue-board.page.ts` +
  `loginAsOperator`), then assert the participant app *reflected* the change (its `queue_token` snapshot updated);
- at the **terminal** → `assertTerminalReached`.
After each hop run `assertNoStageSkipped` + `assertEveryMoveLogged` (count conservation) on the REAL trail.

Scale sensibly: cover **all 9 variations** (the existing variation specs enumerate the journeys). Driving all 50
individually is the stretch goal; a **representative cohort per variation** (≥1 participant per variation, each
walked entry→terminal by real taps) satisfies "real mobile coverage of every flow." Log what is sampled vs skipped.

## 4. Automation approach — recommended

**Driver: Flutter `integration_test`** (the official Flutter e2e harness — `tester.tap(find.byKey(...))`,
`pumpAndSettle`, real widgets, real Firebase). Run it on either:
- **Flutter web** (`web/` exists) via the integration_test web driver / `chromedriver` — no device needed, CI-friendly;
  caveat: prefer the HTML semantics path so finders are stable. **Recommended for CI parity with the desktop suite.**
- **an iOS/Android simulator** for true on-device fidelity (heavier; good for a final proof pass).

**Why not the alternatives:** replicating writes via Admin SDK = what `participant-sim.js` already does (NOT real
taps — defeats the goal). Driving Flutter-web canvas with Playwright DOM selectors is brittle (canvas renderer).
Appium is a heavy separate toolchain. `integration_test` is the lowest-friction way to tap *real* buttons + assert.

**Test target.** Start on the **cloud test project `slabs-queue-e2e-exdcz`** (real Firestore + the `firestore-forms`
named DB + deployed CFs — full fidelity, matches the desktop PROOF path). The hermetic **emulator `demo-slabs-queue`**
is the faster option once the emulator hook is wired (note: the firestore emulator needs **Java** — keg-only,
`PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`; start via `firebase emulators:start --only firestore --config
firebase.emulator.json --project demo-slabs-queue`).

## 5. Wiring checklist (the gaps to close — this is the "wire" half)

1. **`pubspec.yaml`:** add `integration_test: { sdk: flutter }` under `dev_dependencies`.
2. **Test-target switch (no emulator hook today):** `main.dart` calls `Firebase.initializeApp(options:
   DefaultFirebaseOptions.currentPlatform)` against ONE project, with no `useFirestoreEmulator`. Add a guarded hook:
   - cloud test project → a **test `FirebaseOptions`** for `slabs-queue-e2e-exdcz` selected behind a
     `--dart-define=QUEUE_E2E_TARGET=cloud` (NEVER the prod project `fir-sample-aae4a`), OR
   - emulator → `FirebaseFirestore.instance.useFirestoreEmulator('localhost',8080)` +
     `FirebaseAuth.instance.useAuthEmulator('localhost',9099)` behind `--dart-define=QUEUE_E2E_TARGET=emulator`.
   The named DB handle (`FirebaseFirestore.instanceFor(app, databaseId:"firestore-forms")`, `FillForm.dart:60`)
   must point at the same target — wire the emulator hook for the named instance too.
3. **Stable selectors:** the action buttons have **0 `Key()`** (`queueStageDetail.dart`, `queueControl.dart`). Add
   `Key('queue-action-button')` (+ a `Key('stage-status')` for the displayed stage) so taps/asserts are robust to
   `calltoaction` label overrides. Separate, labelled commit ("test: add e2e widget keys to participant queue actions").
4. **Login helper:** Firebase Auth sign-in with the seeded participant creds; resolve the participant's token the
   way the app does (`home.dart:883-885` deliverable → `queue_token`).
5. **A Flutter "robot"/page-object layer** for: open queue stage detail → read current stage → tap the action button →
   (form: fill+submit; videoask: complete; slot: pick) → wait for the `queue_token` snapshot to advance.
6. **Screenshot hook:** `IntegrationTestWidgetsFlutterBinding` → `binding.takeScreenshot('<participant>-<stage>')`
   after each hop (the mobile proof). On device, `convertFlutterSurfaceToImage()` first.
7. **Orchestration bridge:** a way for the Flutter test and the Angular/Playwright operator step to interleave on the
   SAME token (shared test project + a known `testrunid`/profileid). Simplest: a thin Node/Playwright "operator
   driver" the Flutter test triggers between hops (or run operator moves as a pre-staged step and have the participant
   tap when the app surfaces the next self-move). Decide the bridge during the wire phase.

## 6. Assert against REAL output (anti-circularity holds here)

Reuse `e2e/lib/assertions.ts` unchanged. The chain per token: after a real tap, poll the REAL `queue_token` +
`queue stage log` and assert: `assertNoStageSkipped(tokenId, MODEL, vid)` (every observed edge is a legal scoped
oracle edge), `assertEveryMoveLogged(tokenId, expectedHops, {minNonSelf})` (one row per hop; operator hops are
non-`self`), `assertLoopBound`, `assertTerminalReached`. These guards are themselves now self-tested
(`e2e/queue/invariants-selftest.spec.ts`, `@oracle`) — they provably fire on a defect, so a green walk is meaningful.
**The test never asserts "read == what I wrote"** — it taps a button and reads what the *app* wrote. That is the
anti-circularity win of using the real app over `participant-sim`.

## 7. Suggested dynamic-workflow shape (wire → complete)

You may run a dynamic workflow. A natural two-phase shape (read each phase's result before launching the next):

- **Phase WIRE (fan-out, then verify):** parallel agents for (a) pubspec + test-target switch + emulator/named-DB
  hooks, (b) widget Keys + login helper + Flutter robot layer, (c) stand up the test target and prove ONE participant
  can log in and tap ONE self-move stage end-to-end (the smoke), (d) the operator-bridge design. Barrier: all four
  must land before driving journeys. Adversarially verify the smoke (does the `queue_token` REALLY advance from the
  tap, not a stale read?).
- **Phase COMPLETE (pipeline, by variation):** one stage per variation (V1…V9) — drive its cohort entry→terminal with
  real taps + operator moves, assert via the guards, capture per-stage screenshots; loop-until-green per variation
  (the serial run discipline of `scripts/run-isolated.sh` still applies — one pass at a time, shared seed).
- **Synthesis:** merge the mobile screenshots into the evidence report; confirm the @product layer now includes
  real-mobile participant coverage; report which variations/participants were driven on real taps vs sampled.

Scale the fan-out to the request ("all 50" → larger; "prove the flow" → one cohort per variation). `log()` any cap.

## 8. Constraints (carry over — read `CLAUDE.md` + the cloud-evidence journal)

- **Test project `slabs-queue-e2e-exdcz` / emulator `demo-slabs-queue` ONLY.** Never the prod project
  `fir-sample-aae4a`. Fake `@example.com` users only. The Flutter test-target switch must HARD-REFUSE a non-test project.
- **ATC is OFF-LIMITS** — never drive ATC screens or touch the `firestore-atc` named DB (`CLAUDE.md`).
- **Anti-circularity / no weakening** — assert the app's real writes; never edit `lib/**` to force green (Keys-only exception, §0).
- **Serial discipline** — one walk pass at a time on the shared seed (`run-isolated.sh` lock).
- **`firestore-forms` named DB** is required on the test target to drive real *form* self-moves end-to-end
  (`FillForm.dart` writes there). For "Ready for Next Stage" self-moves, only `(default)` is needed.
- **Commit after every self-contained, green piece** (new `CLAUDE.md` rule); branch first; pushing stays gated;
  never merge/push to `main` without operator approval.

## 9. Pointers

- Participant action map: `specs/queue-participant-app-map.md`. Flutter screens: `breakthroughs-flutter/lib/Delivery
  Queue/queueStageDetail.dart` (`actionButton` :56-91), `lib/Services/AppServices.dart` (`moveQueueStage` :1261-1314),
  `lib/Delivery Form/FillForm.dart` (`submitform`), `lib/Arena Elements/arenaVideoAsk.dart` /
  `arenaListVideoAsk.dart`, `lib/Delivery Queue/queueControl.dart` (slots :806-832), `lib/main.dart` (Firebase init).
- The stand-in being REPLACED: `e2e/lib/participant-sim.js` (`advance`). Oracle: `e2e/lib/flow-model.js`. Guards +
  their self-tests: `e2e/lib/assertions.ts`, `e2e/queue/invariants-selftest.spec.ts` (`@oracle`). Operator board:
  `e2e/queue/pages/queue-board.page.ts`, `e2e/queue/support/auth.ts` (`loginAsOperator`). Variations:
  `e2e/queue/variations/*.spec.ts`. Seeders: `e2e/fixtures/seed-test-project.js`, `seed-emulator.js`. Actors:
  `e2e/queue/support/actors.ts`.
- Cloud setup, A/B/C evidence, safety, the report split: `specs/journals/2026-06-08-complete-all-tests-cloud-evidence.md`.

## Acceptance checklist
- [ ] `integration_test` wired into `breakthroughs-flutter`; test-target switch refuses prod; named-DB handle follows the target.
- [ ] Stable `Key('…')` on the participant action button(s) (separate commit) + login helper + Flutter robot layer.
- [ ] Each of the 9 variations walked entry→terminal with the **participant hops driven by REAL Flutter taps** and the **operator hops by the real Angular board**.
- [ ] Every transition asserted on the REAL `queue_token`/`queue stage log` the app wrote, via the oracle + guards (no circular reads).
- [ ] Per-stage **mobile screenshots** captured and merged into the evidence report.
- [ ] Green on `slabs-queue-e2e-exdcz` (and/or the emulator). What was driven vs sampled is logged. No prod, no ATC, no weakened assertions, no product edits beyond test Keys.
