# Journal — Queue Manager full-complexity e2e suite (2026-06-06)

Goal: a verified, reliable, **deterministic (no-LLM)** e2e suite that goes RED when a code
change (a) breaks the queue logic, (b) makes a screen unusable for any actor, or (c)
introduces a silent data gap — across all actors and all 9 variations. This journal records
what exists, how to run/recover it, and the honest gaps for the next agent.

## 1. Outcome (state at journal time)
- **21 tests green** (`e2e/playwright.queue.config.ts`):
  - 9 × closed-loop variation walks (start→finish + data-gap invariants) — `queue/closed-loop.spec.ts`
  - 5 × actor "usable" health checks (operator/specialist×2/BIG×2) — `queue/actors-health.spec.ts`
  - 3 × operator board (login → board → live queue → **Total Participants = 50** real-UI number) — `queue/operator.spec.ts`
  - 4 × oracle self-tests (test-the-test: detectors fire) — `queue/oracle-selftest.spec.ts`
- **Framework:** Playwright (TS). Deterministic pass/fail, exit code, list+html+junit reporters. No LLM at runtime.
- **Screenshot evidence:** `e2e/evidence/` (+ `EVIDENCE.md`). PASS shots of every actor screen + the operator board showing the right numbers; FAILURE shots from `e2e/demo-failures.sh` proving the suite goes RED on each break class (wrong numbers, actor-unusable access-denied, weakened-oracle logic break).

### Fixes that unblocked the real operator board (fresh-project gotchas, now in the seeder/config)
- Every app doc must store its own id as a **`docid` field** (app-wide convention) — without it the board's `doc(…, selectedQueue.docid)` threw and "Staging Queue…" hung forever.
- **Composite indexes** required (`firestore.indexes.json`, deployed via `firebase.test.json`): `queue_token (queueref, logdate)` and `queue generation (queueadmin CONTAINS, queuename)`.
- `queue_token` needs `tokenstatus:'Active'` (board counts only active) + `queue variation` needs `queueref`.
- Open Firestore rules on BOTH DBs (login reads `profile_data` pre-auth).

## 2. Environment / infra (all on a dedicated, disposable project)
- **Project:** `slabs-queue-e2e-exdcz` (personal account solar345). Billing: **AgenticDemo** (`01E2E0-43D942-983992`).
- **Databases:** `(default)` + `firestore-forms` (Native, asia-south1). Open Firestore rules deployed to BOTH (test-only; `firebase.test.json`).
- **Auth:** Email/Password enabled; users `…+<testrunid>@example.com` / `Test!1234`.
- **Web app + env:** `src/environments/environment*.ts` point `firebase` at the test project; `watson`/`salescrm` are dummy stubs (cross-project joins off-limits/stubbed). `ng serve` (development config) → http://localhost:4200.
- **Safety:** `e2e/lib/test-project.js` allowlist — only `slabs-queue-e2e-exdcz` is writable; prod/starlabs-test/watson/salescrm **hard-abort** (verified).
- **Worktree:** `/Users/antano/solarcode/ah/starlabs-angular-queue-e2e` branch `test/queue-e2e`. Nested repos (`starlabs-cloud-function`@`test/queue-e2e-deploy`, `breakthroughs-flutter`@`development`) copied in & excluded from the branch — see `WORKTREE-NOTES.md` (delete duplicates on merge).

## 3. Key architecture decisions (and why)
- **Participants are simulated at Level-1** (Admin SDK Firestore writes); operators/specialists/BIG use the **real Angular web app** (per requirement).
- **Both operator `nextstage` moves AND participant self-moves are plain client Firestore writes** (no cloud function): operator board `dynamic-queue-manager-clone.ts:3215-3222`; participant `breakthroughs-flutter AppServices.dart:1261-1314`. → The closed loop needs **no CF deploy**; `participant-sim.js` replicates the exact write (`queue_token` update + `queue stage log`).
- **Login/authorization model** (decoded): `profile_data`(email+number+`role_ref`+`user_ref`) → `users_roles` (role→bool) + `user_data`; route access gated by `dashboard` docs (roles[]/profileid[]). `phoneAuthentication()` is already stubbed (`return true`). The seeder builds this whole chain for staff.
- **Oracle = the flow-visualizer `build()`** (`e2e/lib/flow-model.js`) — same code is path source + assertion oracle. Confirms the 2 real config orphans (validated spec §8).

## 4. How to run / reproduce
```bash
# 0. one-time infra already done (project, billing, DBs, rules, web app, env files)
cd /Users/antano/solarcode/ah/starlabs-angular-queue-e2e
npm install --legacy-peer-deps          # Angular deps
cd e2e && npm install                   # @playwright/test + firebase-admin
# auth: firebase login + `gcloud auth application-default login` (Owner/Editor on the test project)

# 1. run the suite (globalSetup re-seeds; webServer reuses a running ng serve, else starts one)
cd e2e && npx playwright test --config playwright.queue.config.ts
# SKIP_SEED=1 to reuse the current seed; TESTRUNID=<id> to namespace
# teardown a run:  node fixtures/seed-test-project.js --teardown <testrunid>
```
Seed/oracle/paths are pure modules: `node fixtures/seed-test-project.js --plan` prints coverage (237/237 edges, 50 participants, 9 variations).

## 5. What catches each failure class
- **Logic break** → closed-loop landing assertions (mis-route lands on wrong stage) + oracle self-tests (dangling/orphan/unreachable-terminal go RED).
- **Unusable for an actor** → actor-health specs fail if a primary screen bounces to /login or throws an uncaught app error.
- **Silent data gap** → "one `queue stage log` per transition" invariant; oracle "every variation reaches a terminal"; (planned) count-conservation P0s below.

## 6. KNOWN GAPS / NEXT STEPS (honest — for recovery)
Ranked; the first block is what most limits goal coverage today.

**Coverage gaps**
- [ ] **Comprehensive collection seeding incomplete.** Seeded: queue generation/variation, queue_token, profile_data, participantjourneyproduct, participantsproduct, user_data, users_roles, dashboard. **Not yet seeded** (generator `e2e/lib/fake-data.js` + `specs/queue-collection-schemas.json` exist — wire them): `queue planning`, `queue studio pairing`, `studioinvitation`, `participant mode checklist`, `participantvideoask`, `arenavideoask`, `modes`, `journey`, `live assignment`, `arena participant`, and `firestore-forms`: `delivery forms`, `formsByClient`. The user asked for ALL feature collections — finish this.
- [ ] **Real-UI operator MOVE not driven.** Operator moves are validated via Level-1 replication of the identical write; a dedicated spec that drags/bulk-moves a token on the real board and asserts the landing is still TODO (use the board's **Bulk Move**, more reliable than drag-drop).
- [ ] **Exact per-stage UI numbers not asserted.** Operator board: only queue selection + render asserted. Add count assertions from `stage-count-panel`/`stagebox` (or assert the total token count) against the seeded distribution.
- [ ] **Specialist/BIG = render-health only.** No deep functional drive (open a real studio session from a `live assignment`, BIG assignment actions, "right numbers").
- [ ] **Forms / VideoAsk / slot flows** not exercised end-to-end (only the resulting `queue_token` move is replicated). Needs `firestore-forms` seed + form-stage walk.
- [ ] Only the **first token per variation** is walked; multi-participant concurrency/surge not driven.

**From the design-workflow completeness critique (`e2e/PLAN.md` §7), P0–P1 not yet implemented**
- [ ] P0 bulk-invite conservation: `count(studioinvitation) == count(selected tokens)`.
- [ ] P0 invitation-accept reconciles to `invitation.totalaccepted` (+1 per accept only).
- [ ] P0 operator queue-visibility: operator in `queueadmin` of 1 of 2 queues sees exactly 1 (the non-array-`queueadmin` bug, risk #7).
- [ ] P0 specialist monitor role-gate negative test (deny an eis-only specialist).
- [ ] P1 per-stage self-movable-vs-operator gate proven per variation; queue-creation-v3 authoring smoke; cross-DB count non-zero lower bounds.

**Infra/quality**
- [ ] Cloud functions NOT deployed (not needed for the move loop; needed only if asserting CF side-effects/mode engine/studio-session creation). Branch ready: `starlabs-cloud-function@test/queue-e2e-deploy`; only the 6 Zoom secrets (dummy) gate the queue engine.
- [ ] No auto-teardown after runs (manual). Consider `globalTeardown` gated by `TEARDOWN=1`.
- [ ] `playwright.config.ts` (old emulator one) still present alongside `playwright.queue.config.ts`.

## 7. Pointers
- Master plan + coverage matrix + ranked critique: `e2e/PLAN.md` (from the 19-agent design workflow).
- Participant action→code→Firestore map: `specs/queue-participant-app-map.md`.
- Redacted production schemas: `specs/queue-collection-schemas.json` (sampler: `e2e/fixtures/sample-prod-schemas.js`, read-only).
- Model/oracle/paths: `e2e/lib/{flow-model,path-generator,participant-sim,fake-data,test-project}.js`.
