# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-10 (new CICD Firebase standup)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-06-10-starlabs-cicd-firebase-standup.md` (this session's WHY + how to resume).

## Current state
- **A fresh, dedicated Firebase test project `starlabs-cicd` (Blaze) is fully stood up and queue-e2e-ready.** It replaces the prior `slabs-queue-e2e-exdcz` as the active cloud target on this machine.
  - Firestore `(default)` + named **`firestore-forms`** (nam5); open test rules + **63 composite indexes** deployed; Email/Password auth enabled.
  - **16 ATC-excluded Cloud Functions** (Node-22, gen2, us-central1) deployed from `Starlabs Functions/` via the filtered `functions/index.cicd.js` + `firebase.cicd.json`.
  - **Seeded** (run1): 67 auth users, 50 participants, queue config (30 stages / 9 variations), all collections incl. `firestore-forms` fixtures. CFs fire on seed (participant metadata = 67). ATC never touched.
  - Service-account key at repo root (git-ignored). Env files written (`src/environments/*`, git-ignored). Dev bundle built.
- **Smoke green:** `queue/actors-health.spec.ts` 5/5 (operator/specialist/BIG login + screen render) against starlabs-cicd. **Handed to testing EOD 2026-06-10.**

## Last session changes (2026-06-10) — why
- Built the new project end-to-end because the old project's env files + creds weren't on this machine (operator chose a fresh project over reusing). Full narrative + gotchas in the journal above.
- Gotchas that cost time (all resolved): `Bash(firebase *)` deny rule blocked the CLI (operator removed); Firestore-API/Auth enablement is console-gated without `gcloud`; first gen2 deploy hit the Eventarc service-agent propagation delay → **retry after ~180s** fixed it (all 16); Playwright's `npx -y serve` webServer failed (`ERR_CONNECTION_REFUSED`) → installed `serve` as an e2e devDep + started it manually, re-ran with `SKIP_SEED=1` → green.
- Clarified for operator: the "deleted collections" they saw = the teardown→reseed window of `global-setup.ts` (transient by design), not data loss.

## Pending / next
- Run the **full** queue suite (only the actors-health smoke is proven so far). One must-set var: `TEST_PROJECT=starlabs-cicd` + `GOOGLE_APPLICATION_CREDENTIALS=<repo-root SA json>`.
- (Recommended) webServer reliability fix: switch the `playwright.*.config.ts` `webServer.command` from `npx -y serve` to `node_modules/.bin/serve`.
- Commit the new artifacts (git + push are operator-gated): `Starlabs Functions/functions/index.cicd.js`, `Starlabs Functions/firebase.cicd.json`, the `.gitignore` SA guard, `e2e/package.json` (serve dep). Env files + SA key stay git-ignored.

_Last updated: 2026-06-12 (Flutter e2e suite — ALL 11 BUCKETS GREEN)_ · **New session? Read `specs/ORIENTATION.md` first**, then this + `specs/journals/2026-06-12-flutter-e2e-suite-all-green.md`.

## Current state

**The Flutter e2e suite is COMPLETE: all 11 buckets GREEN.** Standing 3-gate goal fully met — Gate 1
(265-feature catalog `specs/flutter-app/FEATURE-CATALOG.md`), Gate 2 (≥200-user cohort, median 5 events +
1 shift, on `slabs-queue-e2e-exdcz`), Gate 3 (this suite: ≥9 users, journey-flow + individual checks).

- **11/11 GREEN**, driven on the iPhone-17-Pro sim vs the disposable test project `slabs-queue-e2e-exdcz`
  (never prod): journey-flow(170) · auth(90) · shell(91) · journey(92) · queue(93) · forms(94) ·
  appointments(95) · events(96) · content(97) · workshops(150) · social(151).
- **171 real-UI screenshots** under `breakthroughs-flutter/mobile-evidence/<bucket>/`; ~30 anti-circular
  app-writes (each asserts the doc the APP wrote). Sim-blocked legs (real-media players, CallKit/push,
  camera/QR, OpenAI, external links) are render-asserted + labelled honestly — never fake-green.
- Tests: `breakthroughs-flutter/integration_test/{journey_flow_test.dart, features/<bucket>_test.dart}`.
  Harness: `e2e/flutter-suite/` (`seed-<bucket>.cjs`, `run-flutter-test.cjs`, `run-suite.cjs`, `RESULTS.md`).
- ~12 composite indexes in `firestore.indexes.json`, deployed to the test project (deploy with
  `--config firebase.indexes.json --project slabs-queue-e2e-exdcz` — the main `firebase.json` is hosting-only → PROD).

## Last session changes (2026-06-12) — why

Greened journey, appointments, auth, events, workshops, social, content (was ~4 green at start). Root causes:
- **Cross-run data pollution** — Mastercalendar/homeContent/Social query collections GLOBALLY, so old-run
  docs (`biz`/`evt`/`run1`) flowed into the current user's screens and crashed them. Fixed via one-time admin
  sweeps (event `atcmodel`/`delete`/`end_date`, mode-checklist `docid`, jod `overviewvideo`) + hardened seeds.
- **Real app bugs** worked around (documented, not faked): `raiseTickets` OverlayEntry double-remove (2nd
  ticket lost); `customer_eismapping.eisroles` List-vs-String-index; `hexToColor` 6-char-hex RangeError;
  `Social.dispose` null video-controller + navigator-Overlay corruption; `ViewHPC` List-as-Map; many
  unguarded `.toDate()`/`.id`-on-Map/`Text(List)` reads (seed must match the app's exact read shape).
- **Auth F1** rewritten to drive the REAL Login UI (programmatic signIn bypassed `login.dart`'s `last_login`);
  polled via `runAsync` so the CallKit/push-heavy post-login Home (which hangs the sim) is never pumped.
- **Re-run idempotency** — seeds now reset app-written docs (published post, `accountdeleted`, blacklistrows)
  at `--seed`, so anti-circular pre-states hold every run. Used dynamic Opus prescan workflows to front-load fixes.

Full detail: `specs/journals/2026-06-12-flutter-e2e-suite-all-green.md`. Earlier-session detail in
`specs/journals/2026-06-11-flutter-full-map-and-e2e.md`.

## Pending / next

1. **Optional consolidating run:** `e2e/flutter-suite/run-suite.cjs` (seeds cohort + all 11, runs serial,
   regenerates RESULTS) for one-shot evidence — all seeds/indexes are wired for it; greened individually this
   session for fast failure isolation.
2. `breakthroughs-flutter` is a NESTED git repo — commit test files with `git -C breakthroughs-flutter ...`;
   seeds/indexes/RESULTS commit to the parent.
3. Consider filing the app bugs upstream (raiseTickets overlay, hexToColor, eisroles shape).
4. **Setup:** sim = iPhone 17 Pro (UDID `F32D5A01-…`), must be booted; Flutter 3.44.1 `/opt/homebrew/bin/flutter`;
   re-seed before each run; `flutter analyze <test>` before each run (a compile error silently runs the LAST build).
</content>
