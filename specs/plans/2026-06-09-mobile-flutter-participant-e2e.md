# Plan — Drive the queue participants through REAL Flutter taps (mobile e2e)

> Approved scope for the handoff `specs/journals/2026-06-09-mobile-flutter-participant-e2e-handoff.md`.
> Branch `cicd`. Author: Claude (2026-06-09). Companion journal will record WHY at the end.

## Goal (acceptance, verbatim from the handoff)
Replace the Admin-SDK participant stand-in (`e2e/lib/participant-sim.js`) with the **real `breakthroughs` Flutter app**: each participant advances its variation's **self-move** stages by tapping the real action button, while **operator/compulsory/auto** hops are driven by the real Angular board. Every transition asserted on the **app's real writes** via the existing oracle + guards. Per-stage mobile screenshots. Green on the test target. No weakened assertions; no `lib/**`/`src/**` edits except sanctioned test **Key()** affordances.

## Decisions (with rationale)
1. **Target = cloud test project `slabs-queue-e2e-exdcz`** (acceptance allows "and/or emulator"). Chosen because the Angular env files are gitignored/absent (must be authored either way), and cloud needs **no emulator daemon** (no Java babysitting), gives higher fidelity, and matches the desktop PROOF. The Flutter **emulator switch is still wired** (`--dart-define=QUEUE_E2E_TARGET=emulator`) for parity/fallback. Hard project-id guard refuses any non-test project.
2. **Driver = Flutter `integration_test` on Chrome web** (only set-up target: `web/` exists, no `macos/` runner, iPhone unpaired). `flutter drive` + chromedriver; `onScreenshot` writes per-stage PNGs.
3. **The only participant self-move kind is the FORM submit.** Confirmed empirically: no variation backbone uses videoask (camera-gated) or slots; the Triple-ATC `link` hop's forward edge is an operator button. So the Flutter robot only has to automate **FillForm** (two-step Preview→Confirm, writes `formsByClient` in `firestore-forms`, then `moveQueueStage(formref)` advances the token in `(default)`).
4. **The walk = the existing variation-spec walk with SELF hops swapped** from `participant-sim.advance(by:'self')` to a real Flutter tap. Operator/compulsory/AUTO hops stay on the real Angular board (`QueueBoardPage.moveToken`). Same oracle (`flow-model.js`), same guards (`assertions.ts`), same RAW-vs-prefixed variation-id contract.
5. **Orchestration = Node-orchestrated, strictly serial** (the `run-isolated.sh` lock + shared `run1` seed + port 4200 forbid parallelism). An outer Node script owns the oracle hop sequence; for a contiguous run of SELF hops it invokes one `flutter drive` (the Flutter robot loops the forms until it hits a non-self stage); for OP/AUTO/compulsory hops it drives `QueueBoardPage`. Assertions run after every hop. → A parallel dynamic workflow is **not** useful for the drive itself; it IS used for (a) the understanding fan-out [done] and (b) a final adversarial evidence audit.
6. **Scope = all 9 variations, ≥1 participant each, entry→terminal by real taps** (the handoff's defined "real mobile coverage of every flow" / no-cut bar). Driving all 50 is the labelled stretch — the orchestrator takes a participant list so it scales; what is sampled vs driven is logged.

## Anti-circularity (preserved)
The test taps a button; the **app** performs the write. `moveQueueStage` writes NO `movedby`; the Angular board writes `movedby = operator profileid`. So `assertEveryMoveLogged(..,{minNonSelf})` with `minNonSelf = #operator hops` proves the trail can't be satisfied by self-writes alone. The log row carries `docid == tokenId`, so `assertions.ts` reads the real trail. RAW variation id → oracle/guards; PREFIXED (`run1_<raw>`) → the live `queue_token.variationid` field only.

## Known gaps to close (the WIRE work)
- **W0 Rules probe** — does a signed-in participant client write `queue_token`/`queue stage log`/`formsByClient` on the cloud test project? If blocked → deploy the repo's permissive `firestore.rules` to BOTH databases of **`slabs-queue-e2e-exdcz` only** (hard-gated). (`firestore.rules` is the existing emulator/test permissive file.)
- **W1 Flutter compile** — create `breakthroughs-flutter/lib/firebase_options.dart` (gitignored/absent) → **test project** options (so the app compiles; main reuses the test init via `if (Firebase.apps.isEmpty)`).
- **W2 pubspec** — add `integration_test: {sdk: flutter}`; `flutter pub get`.
- **W3 test-target switch + guard** — `integration_test/support/e2e_firebase.dart`: init with test web options, **assert projectId ∈ {test ids}** else throw; emulator redirect (default + `firestore-forms`) behind `QUEUE_E2E_TARGET=emulator`. Neutralize the prod `firebaseConfig` in `web/index.html` for the e2e build (test-scoped).
- **W4 widget keys (SEPARATE commit)** — `Key('queue-action-button')` on `queueControl.dart:193`; `Key('stage-status')` on `queueControl.dart:430`; login keys on `login.dart` (email/password/submit); `Key('form-preview')`/`Key('form-confirm')` on `FillForm.dart` (Preview / Confirm&Submit); optional `Key('form-field-<name>')`.
- **W5 seed enhancement** — inject `actionresource` (a `(default)`-DB `delivery forms` ref, e.g. a dedicated trivial template with one OPTIONAL field) onto the form stages' `stageproperty` in seeded `queue generation`, so `FillForm(formpath:…)` resolves a template (today `actionresource` is `undefined` → `firestoreDefault.doc(null)` crash). Fixture-only; the board doesn't read it, so desktop specs are unaffected.
- **W6 login + robot layer** — Dart helpers: sign in seeded participant; open home; FillForm robot (handle the form → Preview → Confirm); read current stage; wait for token snapshot to advance.
- **W7 chromedriver** — install matching Chrome 148; `test_driver/integration_test.dart` with `onScreenshot`.
- **W8 SMOKE** — admin-advance one token to a form stage → Flutter signs in → taps the real form → asserts the **app** advanced the token + appended one `queue stage log` row (poll the real values, never read-what-we-wrote). Adversarially verify (is the advance real, not a stale read?).
- **W9 operator board** — `npm install --legacy-peer-deps` (root); author `src/environments/environment.ts` + `environment.development.ts` → test project web config; `ng build`/serve at :4200; reuse `QueueBoardPage`/`loginAsOperator`.

## COMPLETE phase
- Node orchestrator per variation: reset token → walk oracle hops (SELF→Flutter batch, else→board) → assert after each hop → `assertTerminalReached`. Capture Flutter per-stage screenshots; board screenshots already in the report.
- Merge mobile PNGs into the evidence report (`e2e/playwright-report/`) via a Playwright `testInfo.attach` blob shard dropped into `e2e/.report-blobs/`.
- Final **adversarial verification workflow**: independent agents audit each variation's evidence (screenshots real? guards fired? no weakening? no prod/ATC writes?).

## Hard constraints (carry-over)
Test project only (prod `fir-sample-aae4a` hard-refused both sides). ATC off-limits (`firestore-atc` never touched). Serial discipline. Commit after each self-contained green piece; branch `cicd`; pushing gated; never merge/push `main`.
