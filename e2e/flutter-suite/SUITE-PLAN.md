# Flutter e2e suite — execution plan (Phase 3)

> The full e2e suite for **breakthroughs-flutter**, driven on the booted iOS simulator against the
> disposable test project `slabs-queue-e2e-exdcz`. Two modes: a **journey-flow** test (one user walks the
> end-to-end arc) + **individual-functionality** checks (10 user buckets covering all 235 e2e-testable
> features in `specs/flutter-app/FEATURE-CATALOG.md`). Evidence = real-screen screenshots (`xcrun simctl io
> screenshot` on CAP markers) + stored pass/fail results. Anti-circular (assert the doc the APP writes).
> ATC OFF-LIMITS (18 features mapped existence-only, never driven).

## Harness (built)
- `run-flutter-test.cjs` — builds once + drives ONE `integration_test/<file>.dart` as one seeded user; captures a real OS screenshot on each `CAP marker:` the robot prints. Env: `TEST_TARGET`, `E2E_EMAIL`, `E2E_LABEL`, `E2E_DEFINES`.
- `../journey-cohort/seed-cohort.js` (200-user cohort, Phase 2) + `mobile-guards.cjs` (home crash-guards).
- `breakthroughs-flutter/integration_test/support/robot.dart` — page-object (signIn/bootApp/pumpUntilFound/screenshot/readToken/waitTokenAdvanced/…); extend with per-bucket helpers in `integration_test/features/` (NOT by editing robot.dart, to avoid conflicts).
- Existing proven queue harness to reuse for U4/U5: `e2e/queue/mobile/{setup-mobile-fixture,seed-real-forms}.cjs`, `walk_test.dart`.

## Driven users (the cohort's 12 Auth users → buckets)
The Phase-2 cohort seeded Firebase Auth for indices **90-97, 150, 151, 170, 171** (`participant<i>+jrny@example.com`, pw `Test!1234`). Assignment:

| User | email idx | Bucket | Feature scope (catalog clusters) |
|---|---|---|---|
| U1 | 90 | Auth & Onboarding | auth-onboarding (13) + shell-auth-gate/onboarding-gate |
| U2 | 91 | Shell & Home feed | shell-nav-mainscreen (34) |
| U3 | 92 | Journey dashboard & Mode | journey-dashboard-mode (20) |
| U4 | 93 | Queue delivery | delivery-queue (13) |
| U5 | 94 | Forms | delivery-forms (12) |
| U6 | 95 | Appointments & Calendar | delivery-appointments (9) |
| U7 | 96 | Events & Arena | delivery-events-arena (19) |
| U8 | 97 | Content (EiFlix+SolarVoice+HPC) | content-eiflix (11) + content-audio-hpc (11) |
| U9 | 150 | Workshops | content-workshops (21) |
| U10 | 151 | Social/BIG/Shadow/Reports | social (21)+big (4)+shadow (4)+reports-evolution (12)+profile (9) |
| JF | 170 | **Journey-flow** (special pre-onboarding seed) | the 15-step backbone end-to-end |
| spare | 171 | overflow / services-infra standalone items | services-infra-config (22) non-overlapping |

## Journey-flow backbone (the end-to-end test — user JF / idx 170)
Needs a SPECIAL seed (pre-onboarding state, NOT the cohort baseline): 1 initiated PJP + `journeyonboardingdetail`, `orientationstatus` null. Steps:
1. login → auth gate → Home
2. onboarding gate (locked) → intro slides (orientationstatus null→initiated) → book onboarding call (`appointments` write) → "Set Up My App" (orientationstatus=completed) → 5-tab shell
3. default-app-flow derives mode/delivery → know-your-journey / mode-checklist render
4. queue card → fill stage form (`formsByClient`) → self-move (`queue_token.currentstage` advanced)
5. book a delivery appointment (`appointments`)
6. RSVP + attend events → confirm ≥4 attended `event participation request`
7. consume content (eiflix + solarvoice → `content analytics`)
8. publish a social post (`postcollection`)
9. progression (interim crossover / participant AEL) + the 2nd-journey shift (seeded data transition)

## Individual-functionality buckets (U1–U10)
Per the synthesis 9-user split. Each bucket = `integration_test/features/<bucket>_test.dart` + `e2e/flutter-suite/seed-<bucket>.cjs` (extends the cohort with that bucket's feature preconditions). Drive each catalog feature to its **anti-circular assertion** (the `Writes = assertion target` column); for sim-blocked legs (camera/QR/CallKit/video-completion/push/OpenAI) drive-to-screen + assert-render only (honestly logged, never claimed as full coverage).

## Orchestrator (`run-suite.cjs`, to build)
1. seed cohort (`seed-cohort.js --seed`) + `mobile-guards.cjs` + per-bucket `seed-<bucket>.cjs`.
2. run `journey_flow_test.dart` (JF) then `features/<bucket>_test.dart` ×10 serially via `run-flutter-test.cjs` (single sim).
3. collect screenshots per user → a gallery; write `RESULTS.md` (per-bucket pass/fail + feature coverage + honest blocked list) + audit blank/missing frames (≥3 bad = fail, per the proven L1 imaging guard).

## Build order (risk-managed)
1. **Render de-risk** (running): prove U-any renders Home. ← gate
2. Prove **U4 Queue** end-to-end (proven Keys/path) → the runnable template.
3. Parallel-author U1–U3, U5–U10 seeds+tests (workflow) using the U4 template + catalog sections; add product `Key('e2e-…')` affordances centrally where the catalog flags them.
4. Journey-flow test (JF).
5. Orchestrator + full evidence run + RESULTS.md; iterate to green.
