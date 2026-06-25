# 2026-06-02 — Phase 2 (graph linkage + diagrams) & Phase 3 (emulator fixtures + Playwright)

**Headline:** Completed the rollout's Phase 2 and Phase 3. Linked each subsystem doc to its graphify community, authored four ASCII diagrams, and produced the Tier-A emulator seed fixtures + Playwright happy-path specs — with a deliberate, documented prod-safety deviation on where the emulator config lives.

## Phase 2 — graph linkage & diagrams
- Linked each subsystem doc to its real graphify community wiki file (the GRAPH_REPORT uses `[[_COMMUNITY_x]]` wikilinks, but the on-disk files are `queue_system.md`, `big.md`, `authguard.md`, `Journey_Onboarding.md`, `content.md`, `Participants_Profile_Management.md`). Fixed the inline links to relative paths with node counts; noted `graphify-out/` is gitignored/regenerable.
- `specs/diagrams/`: `architecture.md` (config-driven engine + AuthguardService hub + 5 delivery modes), `queue-stage-machine.md`, `studio-assignment-flow.md`, `journey-lifecycle.md` (+ index README). All grounded in the verified `file:line` + worked examples.

## Phase 3 — test enablement (bridge to D-002)
- `e2e/fixtures/firestore-seed.json` — **synthetic** Tier-A seed (33 collections, 47 docs, no PII, **no ATC**): CONFIG docs that make a queue actually run (`queue generation` + `queue variation` + a `queue_token`), plus a happy path per subsystem. Validated: JSON parses, **zero dangling `_ref` targets**, **zero ATC collections**.
- `e2e/fixtures/seed-emulator.js` — loads the seed into the Firestore emulator; **refuses to run** unless `FIRESTORE_EMULATOR_HOST` is set and **aborts** on a production project id (verified: prints refusal, exit 1).
- Playwright: `playwright.config.ts` + `auth-nav/queue/scheduling/journey/content.spec.ts` + `_support/` (login helper, **ATC-excluded route guard** from `operator-screens.md §C`). Specs skip when `BASE_URL` is unset (no false passes pre-D-002).

## Surprise / decision — prod-safety deviation (load-bearing)
The plan said "add emulator config to `firebase.json`." But the deploy workflow runs a **bare `firebase deploy`** (not `--only hosting`), so a `firestore` block in `firebase.json` would **deploy Firestore rules/indexes to production** (`fir-sample-aae4a`) on the next push — a direct violation of the "production must stay untouched" constraint (CLAUDE.md). **Decision:** put all emulator config in a **separate `firebase.emulator.json`** (+ `firestore.rules` marked emulator-only, `firestore.indexes.json`), used only via `firebase emulators:start --config firebase.emulator.json`. `firebase.json` is left deploy-safe. This honors the plan's intent while respecting the overriding constraint.

## What remains for D-002 (documented in `e2e/README.md`)
1. Wire the Angular app to the Auth+Firestore emulator behind an env flag (`connectFirestoreEmulator`/`connectAuthEmulator`).
2. Create the Auth emulator users in the seeder.
3. Harden Playwright selectors against the real UI (`data-testid`s).
4. Wire `emulators:exec → seed → ng serve → playwright test` into CI and gate the deploy (closes TD-005).

## Artifacts
`specs/diagrams/*`, `e2e/*`, `firebase.emulator.json`, `firestore.rules`, `firestore.indexes.json`. Companion: `2026-06-02-config-and-data-model-docs.md`.

## Pending
Same gate (engineer lock). D-002 build is the next major effort; these fixtures/specs are its foundation.
