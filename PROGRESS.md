# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-11 (Flutter map + 200-user journey + e2e suite)_ · **New session? Read `specs/ORIENTATION.md` first**, then this + `specs/journals/2026-06-11-flutter-full-map-and-e2e.md`.

## Current state
- **Goal in flight:** map ALL `breakthroughs-flutter` functionality (data+code+config) → 200-user sample journey → full Flutter e2e suite (≥9 users, journey-flow + individual checks, screenshot+result evidence). See the 2026-06-11 journal.
- **Phase 1 ✅ DONE+committed** (`1467b1d`): `specs/flutter-app/` — 18 evidence-backed cluster maps + `FEATURE-CATALOG.md` (265 features · 235 e2e-testable · 18 ATC-excluded) + `00-overview.md` + `README.md`. Data blueprint: `specs/journals/2026-06-11-…-artifacts/JOURNEY-DATA-BLUEPRINT.md` (read-only prod recon).
- **Phase 2 ✅ DONE+committed+VERIFIED** (`41bcdcd`): `e2e/journey-cohort/seed-cohort.js` + `verify-cohort.js`. N=200 on the cloud test project `slabs-queue-e2e-exdcz` (PERSISTS): **median 5 events/user (≥4), median 1 shift/upgrade (≥1), 200/200 delivery seqs, 100% watson-join.** Evidence: `…-artifacts/COHORT_VERIFY_OUTPUT.txt`.
- **Phase 3 🟡 foundation green, iterate-to-green pending.** Render de-risk PASSED (real login → Home renders → real screenshot, `mobile-evidence/p90render/`). Suite authored: `e2e/flutter-suite/` (10 `seed-<bucket>.cjs` + `seed-journeyflow.cjs`, all run exit=0; `run-flutter-test.cjs` driver, `run-suite.cjs` orchestrator, `SUITE-PLAN.md`) + `breakthroughs-flutter/integration_test/{journey_flow_test.dart, features/<bucket>_test.dart}` (11 tests, all compile).

## Last session changes (2026-06-11) — why
- Built Phases 1+2 end-to-end via dynamic Opus workflows; verified the cohort medians (stored evidence).
- Phase 3: hit + fixed real issues by running on the REAL sim: (a) Home render chain needed `queue generation.{queueenddate,queuestartdate,docid,stageproperty}` + a `queue variation` doc (else QueueControl `toDate`/`[]`/`indexOf(-1)` crashes); (b) `participantmode` must = the product-chain mode (`Event Mode`); (c) tests' `runZonedGuarded` was swallowing their own `expect()` failures → added fail-fast `TestFailure` re-throw to all 11; (d) killed-suite left a zombie app → runner now `simctl terminate`s before each run; (e) my `journey_flow_test.dart` had a `find`-param shadow (compile error → `flutter drive` silently FELL BACK to the last build = queue) → fixed. **Lesson: every test must be `flutter analyze`-clean or the drive runs the WRONG test.**
- 1st full-suite run was killed (tests hung on the swallow bug). Now fixed; re-running individually.

## Pending / next (RESUME HERE)
1. **Confirm `journey_flow_test.dart` GREEN** (was re-running at laptop-close; just re-run it).
2. **Iterate each bucket to green** — serial on the sim, one at a time (proven order: queue, forms, shell first):
   `cd e2e/flutter-suite && node seed-<bucket>.cjs --seed && SKIP_PUBGET=1 TEST_TARGET=integration_test/features/<bucket>_test.dart E2E_EMAIL=participant<idx>+jrny@example.com E2E_LABEL=<bucket> E2E_EVIDENCE=<bucket> node run-flutter-test.cjs`
   (idx map in `SUITE-PLAN.md`: auth=90 shell=91 journey=92 queue=93 forms=94 appointments=95 events=96 content=97 workshops=150 social=151, journeyflow=170). Read `/var/folders/.../T/flutterdrive-<bucket>.log` tail for the failure; fix seed-shape/nav/assertion; re-run.
   - Known per-test fix needed: auth F1 (`auth-login` last_login) — programmatic `robot.signIn` bypasses the Login UI so the app never writes `last_login`; make it render-only OR drive the real Login screen.
3. **Then** `node run-suite.cjs --all` for the full green run → `RESULTS.md` + the `mobile-evidence/<bucket>/` screenshot gallery (the goal's evidence).
4. **Setup notes:** sim = iPhone 17 Pro (UDID `F32D5A01-…`), must be booted (`xcrun simctl boot`); Flutter 3.44.1 `/opt/homebrew/bin/flutter`; build is cached (incremental ~3-5 min/test). Cohort data persists in the cloud test project — re-run `seed-cohort.js --seed` only if changed. ATC OFF-LIMITS throughout.

_Earlier e2e workstream (Angular suites, queue/mobile) unchanged — see git history + `specs/journals/`._
</content>
