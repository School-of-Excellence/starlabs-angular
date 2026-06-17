# Prompt — Queue Manager full-complexity test environment (paste to a new session)

> Draft for review. Copy the block below into a fresh Claude Code session in the `starlabs-angular` folder once finalized.

---

Build a **full test environment + Playwright e2e suite** that proves the **Queue Management system works as designed**, against a **sample queue modelled exactly from production**, with fake users and fake data — never touching production.

## Decided stack (do not re-litigate)
- **e2e framework: Playwright** (multi-browser-context — simulate operator + participants + specialists concurrently). Unit tests stay Karma/Jasmine (separate; make them real later).
- **Backend: the `starlabs-test` Firebase project** (NOT the local emulator — we need full complexity: real deployed cloud functions, named DBs, cross-project joins, real FCM).
- **Mobile: Playwright device emulation** (Pixel/iPhone) — the participant "mobile app" is the Angular **PWA** (no Capacitor/Ionic/native), so the same framework covers it.
- **Coverage: model-based** — generate test paths from the queue config graph (reuse the flow-visualizer `build()`), exercising **every variation's backbone + every operator `nextstage` edge + every self-move + studio steps**, with loops bounded (each loop ≤2 traversals). Not brute-force permutations (loops → infinite).
- **ONE orchestrated suite** — the operator configures the queue *in the browser*, then **the same run** drives all participants + specialists through it (web + mobile) and verifies. Do **not** split into separate "config authoring" and "participant journey" suites; it's a single end-to-end suite covering config → run → assert.

## 🚫 Hard guardrails (read `CLAUDE.md`)
- **Production `fir-sample-aae4a` is OFF-LIMITS** — read-only, never written/seeded. The test harness must **hard-abort** if the target project id is `fir-sample-aae4a`. All fake users/data live in `starlabs-test` (Watson → `watson-test-19`, Sales-CRM → `salescrm-test-19`).
- **ATC is excluded** — don't exercise `src/app/ATC/**` or the ATC collections (`atc_alpha`, `triple atc`, `queue_atc_generation`, …). At ATC-authoring stages, **stub** the studio-widget action and assert the *stage advances* / the widget renders — don't drive real ATC.
- **Test users (incl. admin) only in `starlabs-test`.** Namespace fake data (e.g. a `testrunid` tag) and **tear it down** after runs — `starlabs-test` is shared/persistent.

## Read first (validated truth + reusable assets)
- `specs/validated/03-queue-manager.md` — the model: **two transition types** (operator `nextstage` + self-move/auto-advance on form submit), variation = journey-family × cycle, the session-series, the studio/ATC workflow, config model, provider join (`live assignment.queueid`).
- `specs/queue-flow-visualizer/prototype.html` + `BRIEF.md` — the `build()` that turns a queue config into a graph; **reuse it as the model-based test-path generator + oracle** (every edge / per-variation paths / orphan+dangling+reachability checks).
- `specs/journals/2026-06-05-queue-manager-artifacts/qexport.js` — exports the real **`L3rqCr`** queue config (30 stages, 9 variations) into a clean `FlowConfig`; use it to **seed the sample queue modelled exactly from production**.
- The existing **`e2e/`** scaffold (Playwright config + `seed-emulator.js` + stub specs incl. `queue.spec.ts`) — extend it; re-point from emulator → `starlabs-test`.
- Backend code: `starlabs-cloud-function/functions/components/` on **`development`** (`queuesystem.js` = the queue engine; `participantmode.js`/`participantmetadata.js` = modes).

## Phase 0 — DEPLOY + stand up the environment on `starlabs-test` (this is real setup, not a verify)
1. **Deploy the cloud functions** from `starlabs-cloud-function` (`development`) to **`starlabs-test`** — e.g. `firebase deploy --only functions -P starlabs-test` (confirm the project alias targets `starlabs-test`, **never** `fir-sample-aae4a`). They drive every transition; without them the queue doesn't move. Configure required function secrets/config (Zoom/FCM/Slack can be dummy values since stubbed). Confirm the `*-test-19` cross-project webhooks (`watson-test-19`, `salescrm-test-19`) resolve.
2. Stand up the cross-project **test instances** as needed (`watson-test-19`, `salescrm-test-19`) so mode/finance joins don't error.
3. Add an Angular **`starlabs-test` environment + build configuration**, deploy/serve that build (`BASE_URL` for Playwright), and confirm Firestore/Auth security rules permit the test flows.
4. Write a `seed-test-project.js` (adapt `e2e/fixtures/seed-emulator.js`) pointed at `starlabs-test` with the **prod-block guard** (`fir-sample-aae4a` → hard abort) and a `testrunid` namespace.

## Phase 1 — fake users + fake data (`@example.com`)
- **Users (Auth):** ~2 operators/admins, **50 participants**, ~10 specialists/BIG providers, all `@example.com`. Create via Admin SDK against `starlabs-test`.
- **Reference data:** the products/journeys/`modes`/`product mode config`/`delivery forms`/`queue studio pairing` the sample queue needs.
- **The sample queue:** seed the **exact `L3rqCr` config** via `qexport.js` → `queue generation` + the 9 `queue variation` docs (each with its `stages[]`). **Distribute the 50 participants across the 9 variations mirroring the real journey×cycle mix** (proportional to the real counts: B!G-Next ≈14, uP!-First ≈14, uP!-Next ≈9, then LYL First/Next, Prodigies First/Next, uP!-3rd-Cycle, uP!-Prep-Hold for the remainder) — **multiple per variation** so concurrency/surge is real. Seed `participantsproduct`, `participantjourneyproduct`, `profile_data`, and let the CF create `queue_token`s (or seed them).
- Namespace everything with a `testrunid`.

## Phase 2 — the Playwright harness
- **`playwright.config.ts`:** projects = `chromium` (operator, desktop) + `Pixel`/`iPhone` (participants, mobile). `webServer` boots the `starlabs-test`-wired app + runs the seed.
- **Page objects:** `queue-creation-v3` (configure the queue in-browser), `dynamic-queue-manager-clone` (the live operator board — the routed/LIVE one), the participant PWA views (forms, slot booking, self-move).
- **Multi-actor orchestration:** one test spins up concurrent **browser contexts** — operator drives moves; participants (mobile contexts) submit forms / self-advance / book slots; specialists "deliver."
- **Async assertions:** transitions are **cloud-function-driven + eventually consistent** — after each action, **poll `starlabs-test` Firestore** (Admin SDK) for the expected `queue_token.currentstage` / `participantsproduct.mode` before asserting. Build a `waitForStage(profileid, expected)` helper.
- **Stub externals:** Zoom/OpenVidu room creation, FCM/WhatsApp/email sends, ATC-authoring. Use the **`/Atestdate/date`** test-clock doc to drive cron/day-arc transitions deterministically; trigger scheduled functions on demand.

## Phase 3 — model-based coverage (the core)
1. Load the sample queue config → run the flow-visualizer `build()` → get the graph (nodes, operator edges, self-move edges, per-variation membership).
2. **Generate test paths:** for each of the 9 variations, a path covering its backbone + every operator `nextstage` edge scoped to it + the self-move auto-advances; bound loops to ≤2. Also assert the static oracle first (no dangling/orphans; every variation reaches a terminal).
3. **Drive each path** end-to-end on web (operator + participant) and the participant steps on mobile; after every transition assert the participant landed exactly where the config says (operator button vs self-move-on-submit), the right studio widgets show, and the mode/`nextstage` side-effects fired.
4. Verify the **peak/parallel** case: multiple participants in one specialist stage concurrently (model the real surge).

## Acceptance criteria
- [ ] Environment reproducible from scripts; **cannot** target production (guard proven).
- [ ] Sample queue is the real `L3rqCr` config (30 stages, 9 variations), seeded from `qexport`.
- [ ] Every variation × every configured transition (operator + self-move) exercised, web + mobile, all green.
- [ ] Async/CF-driven transitions asserted via Firestore polling (no flakey fixed sleeps).
- [ ] Externals stubbed; ATC excluded; fake data torn down after the run.
- [ ] The model-based generator + oracle is a reusable module (feeds CI).

## Stretch
- Wire into CI (GitHub Actions) as the missing test gate (TD-005). Later: the "self-healing/zero-bug" layer on top of this deterministic base.
