# Journal — 2026-06-10 · Security fix: `/arenastudioactivity` role gate (SS-15b gap closed)

## What this is
Closing the **🔴 authorization leak on the live-studio monitor** surfaced by the doc↔e2e reconciliation earlier today (journal `2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md` §Direction-1 #1; `04` §3a; PLAN P0 #4; e2e SS-15b). The monitor `/arenastudioactivity` exposes **every live studio across queues — participant identities + Zoom host emails** and previously had **no role gate beyond the generic `authGuard`**: the component's intended `if(developer)` / `admin||ah||integrator` gate around its data subscriptions was commented out, and only the force-close *button* was `*ngIf="developer"`.

## What changed
1. **New hardcoded route guard** — `src/app/role.guard.ts` exports `roleGuard(allowedRoles: string[]): CanActivateFn`. It reads `AuthguardService.getRoles()` and bounces a logged-in user holding none of `allowedRoles` to `/EISDashboard` with an "Access denied" dialog (mirrors `auth.guard.ts`'s dialog + redirect pattern). Defensive `!user` → `/login` in case guard ordering changes.
2. **Route wired** — `app.routes.ts`: `/arenastudioactivity` is now `canActivate:[authGuard, roleGuard(['developer','admin','ah'])]`.
3. **Component data gate re-enabled** — `arenastudioactivity.component.ts` constructor: the `queue generation` / `zoomaccount` (and downstream `live assignment` via `onQueueSelect`) subscriptions now run only when `developer||admin||ah||integrator`. **Defense in depth** — even if a non-privileged user reaches the component, the studio reads never fire. `this.developer` (force-close button) is unchanged.
4. **E2E SS-15b flipped** (`e2e/queue/studio-session.spec.ts`) from `test.fixme` + a "no role gate" documenting `test()` → a real **negative** test + a **positive** test:
   - negative: a seeded **eis-only** actor (`changeagent`, none of developer/admin/ah) is **DENIED** the monitor.
   - positive: an **admin** specialist is **admitted** and the cards render (the gate still admits privileged staff).

## The load-bearing decision — why a new seeded actor (not just flip the fixme)
The fixme as written logged in as `loginAsSpecialist(0)` and asserted denial. **But seeded specialists carry `['admin','changeagent']`** (`seed-test-project.js:113`), and the fix *intentionally* admits `admin`. So specialist 0 is (correctly) **not** denied — a naive flip would fail. The only actor that can demonstrate the *new* guard's denial is one that `authGuard` **admits** but `roleGuard` **rejects**: a `changeagent`-only actor (no admin). The `/arenastudioactivity` `dashboard` route-config grants `changeagent` (in the staff-roles union) **and** every staff profileid, so `authGuard` lets it through — making `roleGuard` provably the gate that denies it.

→ Added **`eisOnly`** staff (`mk('eisonly', i, ['changeagent'])`) to `makeStaff` in `seed-test-project.js` (flows into `staff`, so it gets the full auth chain + route grants automatically), an `actors.eisOnly(i)` accessor, and a `loginAsEisOnly()` helper (lands on `/EISDashboard`, the always-admitted default route).

## What surprised us
- **"Plain specialist" is a misnomer in the seed** — the e2e "specialist" is an **admin**. The original SS-15b comment even conceded "no eis-ONLY actor is seeded" and argued *any* non-developer reaching the monitor proved the *missing* gate. That logic held for proving absence, but the *denial* assertion needs a genuinely non-privileged actor — hence the new seeded kind.
- **Two guards, two roles.** `authGuard` is **data-driven** (allowed roles come from the `dashboard` doc) and therefore only as tight as that config; `roleGuard` is **hardcoded** defense in depth. The eis-only actor is the clean wedge between them.

## Verification
- `npx tsc --noEmit -p tsconfig.app.json` → clean (route guard + component compile).
- `node --check` on the seeder + `tsc --noEmit` on `auth.ts`/`actors.ts` → clean. esbuild transpile of the spec → no errors.
- **NOT run:** the Playwright SS-15b cases — they need a **re-seed** of the test project/emulator (to create the new `eisonly0` actor) + the gated cloud/emulator e2e harness, which isn't executed from this session. The negative test goes green only after the next seed+run.

## Pending / next
- **Re-seed + run** the queue e2e (`playwright.queue.*`) so SS-15b (negative + positive) executes against the new `eisonly` actor — confirm GREEN, then the gap is closed end-to-end, not just code-complete.
- **Operator confirm (04 §10-Q7):** is `developer/admin/ah` (plus `integrator` at the component layer) the right privileged set for the monitor? Should `eventcoordinator` ever see it?
- Consider applying `roleGuard` to other sensitive ops screens that currently rely on `authGuard` + a (possibly broad) `dashboard` grant.
