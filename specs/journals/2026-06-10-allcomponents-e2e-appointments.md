# 2026-06-10 — All-components e2e: recon + the non-queue pattern, Appointments suite GREEN

> Goal (operator): "complete e2e test suite for all the components (except ATC) just like the queue
> system. Use dynamic workflows, don't cut scope, seed as much data as required." This journal covers
> the foundation: a 12-group recon fan-out, the reusable non-queue harness, and the first green suite
> (Appointments). Companion plan: `specs/plans/2026-06-10-all-components-e2e-plan.md`.

## What was done

1. **Recon fan-out (dynamic workflow, 12 Sonnet agents, ~15 min, 1.6M tok).** One analyst per non-ATC
   concept group → `e2e/recon-allcomp/<group>.md` (routes→component file:line, Firestore collections
   read/written, config drivers, CFs + assertable side-effects, external services to stub, actors/roles,
   key flows with the write each step produces, **anti-circular** candidate test cases, seed shapes, ATC
   exclusions, risks). These are the build specs for every group's suite.
2. **Reusable non-queue harness** (so each group is a thin add-on, not a rebuild):
   - `e2e/lib/seed-common.js` — `bootstrapGroup()` / `seedDashboardRoutes()` / `teardownGroup()`,
     all built on the proven queue primitives (`seed-test-project.initAdmin/makeStaff/seedAuthChain/
     teardownCollections`). The load-bearing bit is the **`dashboard` route-grant per driven route** —
     without it the data-driven `authGuard` (auth.guard.ts:35) redirects every screen to root.
   - `e2e/_shared/prod-firewall.ts` — `installProdFirewall(page)` short-circuits any request to a
     production endpoint (`*-fir-sample-aae4a.cloudfunctions.net`, Watson, SalesCRM) with an empty 200.
     SAFETY: the data plane is already test-project-only (environment.firebase → slabs-queue-e2e-exdcz),
     but ~41 source files hardcode prod HTTPS CF URLs; new screens reach those buttons, so we firewall.
   - Group suites reuse the queue `support/{console-guard,firestore-admin}` + `stubs/*` + `actors.loginAs`
     verbatim (cross-dir relative import).
3. **Appointments suite — GREEN (7/7 from a fresh seed, 1.3m).** `e2e/appointments/` + config
   `e2e/playwright.appointments.config.ts`, seeded by `seed-appointments.js` (custom roster with a real
   `eis` specialist role the queue roster lacks: admin/scheduler/eis0/eis1 + participant0/1).
   - APPT-08 capacity utilisation — asserts the **app-computed 25%** (2h booked / 8h window) it derived
     from the seeded `availability` (anti-circular: computed, not written by the test).
   - APPT-09 / APPT-10 offtime approve/deny — asserts the **status the app WROTE** to `offtime` + the
     `authorizedby` profileid on a real approve/deny click.
   - APPT-04 status-pending board renders both seeded unmarked appointments (real UI join).
   - APPT-05 / APPT-06 mark attended/cancelled — real mark-status dialog → asserts `appointments.{attended
     |cancelled}` AND the **linked deliverable's status the app transitioned** (completed / ready) via
     `guard.updateDeliveryStatus` (fileref array-contains the appt).
   - Route-mount smoke — all 9 appointment routes admit the super-role admin (dashboard grants work).

## What surprised us / WHY decisions landed

- **No `data-testid` anywhere in Scheduling/Offtime** → selectors are MatTable rows filtered by seeded
  text + `getByRole('button'/'combobox')`. Robust enough because the seeded names are run-unique.
- **`mat-select` click is intercepted by the floating `<mat-label>` notched outline** → use
  `getByRole('combobox').click({ force: true })`. (Recorded so every group with a Material select reuses it.)
- **`approveOfftime` CF URL matches NO branch on the test project** (component checks
  `projectId == 'test-environment-841c3' | 'starlabs-test' | 'fir-sample-aae4a'`; ours is none) → the
  HTTP call is a swallowed no-op. So APPT-09 asserts the **Firestore write** (which DOES happen), not a
  CF effect. This is a faithful test of the product behaviour on this project, not a weakened one.
- **mark-status's ATC procedure dialog never opens**: `data.appointmenttype` is a STRING (status-pending
  sets it from `getAppointmentMap().map[id]`), so `data.appointmenttype.ischangeworkrequired ?? false`
  is `undefined ?? false` = false → simple path always taken. Seeding products with `atcmodel:null` keeps
  the ATC branch dead regardless. (ATC stays untouched — hard constraint honoured.)
- **Composite index**: status-pending queries `appointments(cancelled==,attended==,starttime<=)` → added
  `(cancelled,attended,starttime)` + a `hosts array-contains` variant to `firestore.indexes.json` and
  deployed to the test project. Capacity/offtime are single-field ranges (no composite).

## Pending / next

- Deepen Appointments to the remaining recon cases (booking flow APPT-01/02/03 — the keystone multi-step
  UI, slot-merge APPT-18; roster APPT-07; team-hours APPT-11; studio APPT-12; dashboard APPT-14). Booking
  is deferred as the most fragile (multi-step, time-sensitive).
- Build the other 11 group suites from their recon docs, same pattern. **journey-products needs care**:
  several screens read/write **Watson + SalesCRM via separate `getApp('watson')`/`getApp('salescrm')`
  Firebase apps** (gRPC, NOT blocked by the HTTP firewall) — must verify those apps' config in the test
  build before driving those actions, or restrict to the test-project-only reads.
