# PROGRESS — StarLabs (atctranscription)

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
