# Plan — All-components e2e suite (every non-ATC concept group, queue-style)

> Approved goal (operator, 2026-06-10): "complete e2e test suite for all the components (except ATC)
> just like the queue system. Use dynamic workflows, don't cut scope, seed as much data as required,
> make best-judgment from config/data/logs, run until complete." This plan is the map; per-group
> journals tell the WHY. Companion: `specs/journals/2026-06-10-allcomponents-e2e-*.md`.

## Method (mirrors the queue suite)
1. **Recon** every non-ATC group with a dynamic workflow → `e2e/recon-allcomp/<group>.md` (routes→file:line,
   collections, CFs + assertable side-effects, externals to stub, actors, flows, anti-circular cases, seeds).
2. **Reusable non-queue harness** so each group is a thin add-on (see below).
3. **Author** each group's suite (dynamic workflow, one engineer/group) from recon + the appointments exemplar,
   reading real source for selectors/shapes; self-validate seed + compile.
4. **Green serially** (cloud is serial; one shared dev server) — orchestrator runs each suite, fixes, commits,
   journals. No faked greens; every assertion anti-circular (assert app-computed/app-written vs seeded).

## Target & safety
- Target = disposable cloud project **`slabs-queue-e2e-exdcz`** (real Firestore + deployed CFs), reached by
  the served dev build (`environment.firebase` → test project) and by firebase-admin (ADC, allowlist-guarded).
- **ATC OFF-LIMITS** — never seed/read/write any ATC collection; products seeded `atcmodel:null` keep ATC
  branches dead; `src/app/ATC/**` excluded.
- **Prod-endpoint firewall** (`e2e/_shared/prod-firewall.ts`) blocks hardcoded prod HTTPS CF URLs. **Watson /
  SalesCRM** are reached via separate `getApp('watson')/getApp('salescrm')` Firebase apps (gRPC, not firewalled)
  → journey-products avoids those write actions; test-project-only screens/reads instead.

## Shared harness
- `e2e/lib/seed-common.js` — `bootstrapGroup` / `seedDashboardRoutes` / `teardownGroup`, on the proven
  `seed-test-project` primitives. **Every driven route needs a `dashboard` route-grant** or the authGuard
  redirects to root.
- `e2e/_shared/prod-firewall.ts` — `installProdFirewall(page)`.
- Reused verbatim from queue: `queue/support/{console-guard,firestore-admin}`, `queue/stubs/*`, `queue/support/actors.loginAs`.
- Per group: `e2e/<key>/{seed-<key>.js, support/global-setup.ts, support/<key>.ts, *.spec.ts}` + `e2e/playwright.<key>.config.ts`.
- Each group: distinct `testrunid`, custom actor roster with the roles it needs, idempotent seed, serial config.

## Groups (12 incl. queue) — status
| Group | key / runid | Suite | Status |
|---|---|---|---|
| Queue Manager / Studio / B!G | queue / run1 | `e2e/queue/` (+mobile) | ✅ pre-existing GREEN (188/194) |
| Appointments & Scheduling | appointments / appt | `e2e/appointments/` | ✅ GREEN 7/7 (capacity, offtime ×2, status render, mark ×2, smoke) |
| Events, Arena & Calendar | events / evt | `e2e/events/` | ✅ GREEN |
| Content & Engagement | content / cont | `e2e/content/` | ✅ GREEN |
| Product Modes & App Engagement | modes / mode | `e2e/modes/` | ✅ GREEN |
| Workshops | workshops / wshop | `e2e/workshops/` | ✅ GREEN |
| Comms / Notifications / Chat | comms / comm | `e2e/comms/` | ✅ GREEN |
| Customer Support | support / sup | `e2e/support/` | ✅ GREEN |
| Participant Profiles & Analytics | profiles / prof | `e2e/profiles/` | ✅ GREEN |
| Evolution Mapping | evomap / evom | `e2e/evomap/` | ✅ GREEN |
| Auth & Role-gated nav | authroles / auth | `e2e/authroles/` | ✅ GREEN |
| Business Dashboard & Misc | business / biz | `e2e/business/` | ✅ GREEN |
| Journey & Products | journey / jny | `e2e/journey/` | ✅ GREEN (Watson/salescrm-careful) |

## Anti-circularity + gotchas (learned, reused by all groups)
- Assert the value the APP computed (rendered count/%, dropdown it built) or WROTE (Firestore doc) — never a
  value the test wrote. Seed = precondition only. Write-mutation tests get an idempotent precondition reset.
- No `data-testid` on most screens → MatTable rows filtered by SEEDED UNIQUE TEXT + role selectors.
- `mat-select` click is intercepted by its floating `<mat-label>` → `getByRole('combobox').click({force:true})`.
- Some component role-guards are commented out → access-control tests assert DATA visibility / the data-driven
  authGuard deny, not route blocks.
- Composite indexes added to `firestore.indexes.json` + deployed per need (e.g. appointments
  `(cancelled,attended,starttime)`); single-field ranges need none.

## Deployed Cloud Functions on the test project (determines CF-side-effect cases)
16 CFs deployed on `slabs-queue-e2e-exdcz`: CreateQueueActivityLogV2, biginvitationAccepted,
bulkReadyInvitation, **calculateParticipantMode**, createBigParticipantAssignment, invitationAccepted,
inviteToStudio, **journey_to_pmd**, onQueueStageChange, onQueueTokenCreateUpdateProductMode,
particpantFormSubmit_SlackIntegration, **productsdata_to_pmd**, **profiledata_to_participantmetadata**,
queueParticipantPositionUpdate, studioZoomLink, studioZoomLinkDeactivate.
- **CF-side-effect cases viable** for: modes (`calculateParticipantMode`, the `*_to_pmd` projection),
  journey/profiles (the `*_to_pmd` projection family).
- **NOT deployed** (→ assert the UI's own Firestore write, skip-guard the CF effect like queue OP-09b):
  appointment*, event*, content (HLS/buffermix/generalContentUpdate), workshop, comms/email, ticket CFs.

## Run
Per group: `cd e2e && NODE_OPTIONS=--max-old-space-size=4096 npx playwright test --config=playwright.<key>.config.ts`
(SKIP_SEED=1 to reuse an existing seed during iteration). Each config re-seeds its run in globalSetup.
