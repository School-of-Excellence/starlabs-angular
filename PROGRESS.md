# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-10 (all-components e2e)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/plans/2026-06-10-all-components-e2e-plan.md` + `specs/journals/2026-06-10-allcomponents-e2e-COMPLETE.md`.

## Current state
- Angular 19 + Firebase PWA across 3 Firebase projects. The e2e app build targets the disposable cloud test project **`slabs-queue-e2e-exdcz`** (real Firestore + 16 deployed CFs).
- **Queue Manager / Studio / B!G** e2e suite green (`e2e/queue/`, 188/194) + the mobile-Flutter participant walk.
- **NEW: every non-ATC concept group now has its own GREEN, anti-circular Playwright suite** (branch `cicd`):
  appointments 7/7 · events 6/6 · modes 8/8 · content 9(+1 skip) · workshops 8/8 · support 10/10 ·
  profiles 12(+1 fixme) · comms 9(+1 skip) · evomap 8(+2 fixme) · authroles 11/11 · journey 8/8 · business 8/8.
  ~96 passing cases. Each: own `testrunid`, custom roster, idempotent seed, serial `e2e/playwright.<group>.config.ts`.
- Shared harness: `e2e/lib/seed-common.js` (dashboard route-grants on the proven seedAuthChain), `e2e/_shared/prod-firewall.ts` (blocks prod CF URLs), reusing queue `support/*` + `stubs/*`. Recon corpus: `e2e/recon-allcomp/*.md`.

## Last session changes (2026-06-10) — why
- **Recon workflow** (12 agents) mapped every non-ATC group; **authoring workflow** (11 Opus agents) drafted each suite from recon + the appointments exemplar; orchestrator greened each serially + committed per group.
- Composite indexes added + deployed: appointments `(cancelled,attended,starttime)`, delivery forms `(formfor,formname)`, supportchat `(isdelete,last_modification)`, expenseplanning `(delete,date)`.
- Recurring fixes: bounded smoke wait (networkidle hangs on camera/iframe/stream); app-written docs asserted by natural key (no testrunid); `mat-select` force-click past the floating label; search/label scoping for polluted collections (notificationrecord 10.8k, dashboard 100s); modes CF reset must `FieldValue.delete()` statusdate; console-guard gained an optional `extraIgnorable` (userprofile mega-dashboard tolerates index/ResourcePath noise on auxiliary queries).
- Honest skips/fixmes (documented in-file): CF-not-deployed cases (content buffermix, comms notifyMobileApp), complex multi-step/camera flows (events QR/initiate, evomap add-dialog), filter-builder screens (profiles analytics). ATC stayed OFF-LIMITS throughout (products seeded `atcmodel:null`).

## Pending / next
- Deepen the deferred TODO cases when their fragile flows get testids/harnessing (events EVT-02/06-16, appointments booking, profiles analytics filter-builder, evomap add-dialog).
- Push `cicd` to origin (operator-gated). Optionally add each `playwright.<group>.config.ts` to a CI matrix beside `queue-e2e.yml`.
