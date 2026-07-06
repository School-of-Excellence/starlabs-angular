# E2E — the folder-layout ↔ suites-manifest contract

> Companion to the hub's `suites-manifest.json` (starlabs-e2e-tests @ main) and the master plan
> `specs/plans/2026-07-02-test-orchestration-cf-rollout-architecture.md` (hub repo).

## How this repo's folders drive test routing

The release console's **Test Run dialog** decides which e2e suites are MANDATORY for a branch by
diffing the branch against `development` and matching the changed files against per-suite globs in
the hub's **`suites-manifest.json`**. The gate workflow's fallback routing uses the same manifest.

That means **the globs are a contract with this repo's folder layout**:

| Suite | Locked when files change under |
|---|---|
| queue | `src/app/queue system/**` |
| journey | `src/app/Journey Onboarding/**`, `src/app/journey-onboarding-detail/**` |
| business | `src/app/Business Dashboard/**`, `src/app/main-dashboard/**` |
| comms | `src/app/Communication Center/**`, `src/app/Channel Communication/**`, `src/app/in-app-message-input/**` |
| content | `src/app/content/**`, `src/app/content-upload-version2/**`, `src/app/video-player/**` |
| evomap | `src/app/EvolutionMapping/**` |
| modes | `src/app/participant-touchpoint/**`, `src/app/Participants Profile Management/**` |
| authroles | `src/app/login/**`, `src/app/exceptionalrouting/**`, `src/app/route-configuration/**` |
| workshops | `src/app/Workshop/**`, `src/app/New-Workshop/**`, `src/app/Scheduling/**` |
| **ALL suites** | cross-cutting: `src/app/**/*.guard.ts`, `src/app/shared/**`, `src/app/app.routes.ts`, `src/app/app.config.ts`, `angular.json`, `package.json` |

**RULE: if you move or rename one of these folders, update `suites-manifest.json` in the hub in the
same change set.** A stale glob doesn't break the build — it silently stops locking the right suite,
which means a tester can sign off code the routing never tested.

## The gate workflow (`.github/workflows/preview-e2e.yml`)

- **Console path**: dispatched with `suites` (JSON array) + `cf_repo`/`cf_branch` → one matrix job
  per suite via the hub's reusable `web-e2e.yml`. Report mode is always on (failure-only artifacts;
  `report.json` for the in-console Report screen).
- **Fallback path** (no `suites` input): dorny/paths-filter area routing vs `development` —
  studio/operator/big subsets or the full queue suite. The area→spec map is mirrored in the
  manifest's `suites.queue.areas`; keep both in sync.
- **CF source**: the emulator loads `cf_repo`@`cf_branch` (default `starlabs-cloud-function`
  @`development`) — pick the paired CF feature branch in the dialog when testing a cross-repo change.

## Local

The hub repo (`starlabs-e2e-tests`) owns the engine, seeds, and emulator scripts — see its
`SUITES.md` (generated catalogue) and `CLAUDE.md`. This repo only carries the thin callers
(`preview.yml`, `preview-e2e.yml`, per-suite `*-e2e.yml`) and `npm run start:emulator`.
