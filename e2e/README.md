# e2e/ — Tier-A emulator fixtures + Playwright happy-path specs (Phase 3 → D-002 bridge)

Phase 3 of the documentation rollout turns each subsystem's **documented config + happy path** into **Firebase Emulator seed fixtures** and **Playwright specs**. This is the scaffold the test stack (decision **D-002**) will run; building/wiring the full stack is D-002's job, not this phase.

## Hard safety rules (non-negotiable — CLAUDE.md)
- **Production is never touched.** All test data targets the **emulator** (or `starlabs-test`), never `fir-sample-aae4a`.
  - `seed-emulator.js` **refuses to run** unless `FIRESTORE_EMULATOR_HOST` is set and **aborts** if the project id is production.
  - Emulator config lives in **`firebase.emulator.json`** (NOT `firebase.json`). Reason: the deploy workflow runs a bare `firebase deploy`, so a `firestore` block in `firebase.json` would deploy rules/indexes to prod. `firestore.rules` here is **emulator-only** — never wire it into `firebase.json`.
- **ATC is excluded.** Fixtures contain **no ATC collections**; specs never navigate ATC-integrating routes (`e2e/_support/excluded-routes.ts`, from `specs/operator-screens.md §C`). `seed-emulator.js` has an ATC denylist guard as defence-in-depth.
- **Tier-A only.** Seeded collections are the locked/trusted set (`specs/data-reliability.md`, `specs/DATA-MODEL.md`).

## What's here
| File | Purpose |
|---|---|
| `fixtures/firestore-seed.json` | Synthetic Tier-A seed (no PII). CONFIG docs that make a queue run + a happy path per subsystem. Markers `{_ts}`/`{_ref}`. |
| `fixtures/seed-emulator.js` | Loads the seed into the Firestore emulator (prod-safe guards). |
| `playwright.config.ts` | Playwright config; `baseURL` = the emulator-wired app. |
| `_support/app.ts` | `login()` / `goToRoute()` helpers + test users (match the seed). |
| `_support/excluded-routes.ts` | The ATC-excluded route denylist + `assertNotExcluded()` guard. |
| `*.spec.ts` | Happy-path smoke per subsystem: `auth-nav`, `queue`, `scheduling`, `journey`, `content`. |
| `../firebase.emulator.json`, `../firestore.rules`, `../firestore.indexes.json` | Emulator runtime config (prod-safe, separate from `firebase.json`). |

## Run (once D-002 wires the app to the emulator)
```bash
npm i -D @playwright/test && npx playwright install chromium      # not yet in devDeps
firebase emulators:start --config firebase.emulator.json          # terminal 1
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_PROJECT=demo-starlabs \
  node e2e/fixtures/seed-emulator.js                              # terminal 2 — seed
BASE_URL=http://localhost:4200 npx playwright test -c e2e/playwright.config.ts
```
Without `BASE_URL` the specs **skip** (they don't falsely pass), so they're safe to commit pre-D-002.

## The D-002 hand-off (what remains)
1. **App ↔ emulator wiring:** add an `emulator` build configuration that calls `connectFirestoreEmulator`/`connectAuthEmulator` behind an env flag (`environment.useEmulator`). Today the app only talks to live Firebase.
2. **Auth emulator users:** create the `admin@example.test` / `participant@example.test` users in the Auth emulator (extend `seed-emulator.js` to use the Auth Admin SDK) so `login()` works.
3. **Selector hardening:** the specs use role/text selectors as documented happy paths; confirm against the real UI and add `data-testid`s where brittle (marked `TODO(D-002)`).
4. **CI gate:** wire `emulators:exec → seed → ng serve(emulator) → playwright test` into a CI job, then gate the deploy (closes TD-005). Keep ATC screens out of the job.

> These fixtures encode the **documented** Tier-A happy paths; if a subsystem doc's config shape changes, update `firestore-seed.json` with it.
