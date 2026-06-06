# MASTER E2E TEST PLAN — Queue Manager (project `slabs-queue-e2e-exdcz`)

> Stack: Playwright (REAL Angular web app) + Level-1 participant simulation (direct Firestore
> writes via `firebase-admin`) against a dedicated, disposable Firebase project.
> Firebase EMULATOR is the default target for CI; the named cloud test project
> `slabs-queue-e2e-exdcz` is the integration target. **Never production.**
>
> Existing scaffolding this plan builds on:
> - `e2e/lib/{flow-model.js, path-generator.js, fake-data.js, test-project.js}`
> - `e2e/fixtures/{seed-test-project.js, seed-emulator.js, sample-queue-config.json, sample-prod-schemas.js, firestore-seed.json}`
> - `e2e/_support/{app.ts, excluded-routes.ts}`
> - `e2e/playwright.config.ts`
> - Variation flow oracle: `src/app/queue system/queue-flow-visualizer/queue-flow.model.ts` (`buildFlow()`, `validateFlow()`)

---

## 1. ACTOR INVENTORY + LOGIN / ROLE

| # | Actor | Login flow | Role gate / access control | Primary routes |
|---|-------|-----------|---------------------------|----------------|
| A1 | **OPERATOR (Queue Manager)** | Firebase Auth `signInWithEmailAndPassword`. Post-login `authGuard` → `AuthguardService.getRoles()` → `routeConfig()` lookup in `classify` collection. | Needs `operator`/`admin`/`ah`/`floor` for `/dynamicqueuemanager`. Queue visibility filtered by `queueadmin` array (non-admin sees only queues where `profileid ∈ queueadmin`). `profileid` = `roles.profile_ref.id`. | `/login`, `/dynamicqueuemanager`, `/queuelist`, `/queuebigplanner` |
| A2 | **Excellence Installation Specialist (EIS) / Change Agent / AH Specialist** | Firebase Auth (uid). `getRoles()` reads `profile_data.role_ref` (`eis`/`changeagent`/`ah`/`mentor`/`developer`). `profileid` from `profile_ref.id`. authguard against `dashboard` collection. | Conditional studio features gated in-code by role; monitor view needs `developer`/`admin`/`ah`. | `/dynamicstudio`, `/arenastudioactivity`, `/joinroom/:id`, studio invitation overlay, Zoom start |
| A3 | **BIG Participant / Provider** | Firebase Auth (email/password). `authGuard` checks roles `big_participant`/`big_provider`/`admin`/`developer`. `developer` unlocks dev-only controls. | `big_participant` sees only own assignments unless `developer`; admin/coordinator see management screens. | `/big-dashboard`, `/particiant_assignment_board`, `/bigcohorts`, `/validateParticipantAssignments`, + ~18 BIG routes |
| A4 | **Participant (Level-1 simulated)** | NO real UI login in Playwright. Simulated via `firebase-admin` Firestore writes to `queue_token` + `queue stage log`. (Real app is Flutter; out of Playwright scope.) | n/a — simulation writes assume an authenticated `profileid` already resolved. | n/a (Firestore writes) |
| A5 | **cloudfunctions (backend triggers)** | No login. Firestore-trigger side-effects. | n/a | n/a (assert via DB side-effects / network traces) |

**Auth fixtures required** (seed once per run): one user per role flavour —
`operator@e2e`, `specialist@e2e` (eis+changeagent+ah), `bigadmin@e2e` (admin+big_provider+developer),
`bigparticipant@e2e` (big_participant). Each MUST have a matching `profile_data` doc whose
`profile_ref.id == profileid` (silent gap: blank `profileid` ⇒ all per-participant counts read `undefined`).

---

## 2. COVERAGE MATRIX

> **POST-IMPLEMENTATION TRUTH (2026-06-06).** This matrix was rewritten cell-by-cell after the full
> implementation run to reflect **actual** state, not the original aspirations. Ground truth, re-derived
> by `npx playwright test --config=playwright.queue.config.ts --list` and `tsc --noEmit` on `queue/**` +
> `lib/**`: **121 tests in 22 spec files, all transpile/typecheck clean (compile ok = true)**. A ✅ here
> means *a real, non-circular, COMPILING test exists for that surface* — it does **not** by itself mean the
> test has been observed green against a live target (see the journal `specs/journals/2026-06-06-queue-e2e-FULL-IMPL.md`
> §"verified-compiling vs. observed-green" for what still needs a live emulator/cloud run, and §"runtime-gated"
> for the cells whose tests `test.skip(...)`/`test.fixme(...)` themselves when a precondition or product feature
> is absent). No cell is left aspirational: a surface with only a crash-smoke is ⚠️, a `fixme`/unreachable
> path is ❌ or ⚠️ with the reason, and the negative role-gate that the product does not implement is recorded
> as a **finding**, not a pass.

Legend: ✅ covered (real non-circular compiling test exists) · ⚠️ partial (smoke-only, runtime-gated, or shallow assert) · ❌ NOT covered (explicit gap) · n/a not applicable.
Columns: **Cov** = a real case drives it · **Assert** = landing/state assertion present (not just a crash-smoke) · **Gap** = silent-data-gap invariant present.

### 2.1 OPERATOR screens

| Screen / Route | Case(s) | Cov | Assert | Gap |
|---|---|---|---|---|
| Login `/login` | OP-01 | ✅ | ✅ | ✅ (zero console errors, no redirect-bounce) |
| Queue List `/queuelist` | OP-02 | ✅ | ✅ | ✅ (row count vs Firestore, date render) |
| Live Queue Board `/dynamicqueuemanager` | OP-03 | ✅ | ✅ | ✅ (Total = Σ columns, per-column, chip recompute) |
| Token Move → non-Activity | OP-04 | ✅ | ✅ | ✅ (token+log both written, count migrate, studio fields cleared) |
| Token Move → Activity (open studio) | OP-05 | ✅ | ✅ | ✅ (single live-assignment, pairing flip, stale-status) |
| Drag OUT of Activity (close studio) | OP-06 | ⚠️ | ✅ | ⚠️ (stale-studio/zombie live-assignment asserted; **runtime-gated** — `test.skip` unless the first cohort token is seeded WITH a live-assignment, operator.spec.ts:397) |
| Final stage → delivery completed | OP-07 | ✅ | ✅ | ✅ (`updateDeliveryStatus` call fired) |
| Complete Queue (bulk) | OP-08 | ✅ | ✅ | ✅ (call count == token count) |
| Comms sidebar | OP-09 | ✅ | ✅ | ✅ (count parity, disabled-on-empty-selection) |
| Filters / search | OP-10 | ✅ | ✅ | ✅ (badge drift, restore exact total) |
| Export CSV | OP-11 | ✅ | ✅ | ✅ (row count == total, headers) |
| B!G Planner `/queuebigplanner` | OP-12 | ✅ | ✅ | ✅ (completedToken, stageTokenMap, profileStudioCount) |
| Empty/health-negative | OP-13 | ✅ | ✅ | ✅ (0 not NaN, token w/ missing profile still counted) |
| Queue Creation/Authoring (queue-creation-v3) | AUTH-01 | ⚠️ | ✅ | ✅ (CREATE path now covered — `authoring.spec.ts` drives the REAL stepper: open → fill step-0 required fields → add a stage → real Submit → asserts the doc the COMPONENT wrote: `docid` self-id == snapshot id, `queueadmin` is a non-empty ARRAY containing the UI-selected admin, stage round-trips. Non-circular. ⚠️ **EDIT/rework of an existing queue still NOT covered**; see §6) |

### 2.2 SPECIALIST / STUDIO screens

| Screen / Route | Case(s) | Cov | Assert | Gap |
|---|---|---|---|---|
| My Arena `/dynamicstudio` login+load | SS-00 | ✅ | ✅ | ✅ (queue-card count vs Firestore, no-active-queue alert) |
| Studio select / counts / live_tv | SS-01 | ✅ | ✅ | ✅ (button count, live_tv parity, name/activity map) |
| Check-in toggle + log | SS-02 | ✅ | ✅ | ✅ (checkin↔log parity, on-hold bypass) |
| Waiting-list filtering | SS-03 | ✅ | ✅ | ✅ (preassign/atcmodel/liveassignment filters) |
| Bring To Studio → invite | SS-04 | ✅ | ✅ | ✅ (no-op, dup-invite, 2-min expiry, grouping) |
| Participant accept/deny (overlay) | SS-05 | ✅ | ✅ | ✅ (CF status drift, expiry ignored, deny rollback) |
| Assign studio → open session | SS-06 | ✅ | ✅ | ✅ (token↔live-assignment↔pairing↔stage-log) |
| Live panel widgets / numbers | SS-07 | ✅ | ✅ | ✅ (widget gating, ATC/form counts cross-DB) |
| Validate AEL writes | SS-08 | ⚠️ | ✅ | ⚠️ (interim crossover doc + flag flip asserted; **runtime-gated** — `test.skip` if `stageproperty.validateael` is not on for the seeded studio stage, studio-core.spec.ts:617) |
| Mark procedures complete | SS-09 | ✅ | ✅ | ✅ (persistence on reload, row count) |
| Invite More Participant | SS-10 | ✅ | ✅ | ✅ (session not torn down, cancel = no commit) |
| Zoom / OpenVidu join | SS-11 | ✅ | ✅ | ✅ (broken-link guard, regen feedback, joinroom resolve) |
| Move to next stage (complete) | SS-12 | ✅ | ✅ | ✅ (stage-log, close studio, final delivery) |
| Move next (review path) | SS-13 | ⚠️ | ✅ | ⚠️ (cancel = no-partial-move asserted; **runtime-gated** — skips if the move-next button is not rendered for the seeded variation/stage, studio-session.spec.ts:425) |
| Other Studio join | SS-14 | ✅ | ✅ | ✅ (visibility leak, dead-click alert) |
| Arena Studio Activity Monitor `/arenastudioactivity` | SS-15 | ✅ | ✅ | ⚠️ (card count == seeded live, bijective participant map, close propagation — all covered & non-circular. BUT the SS-15b **negative role gate is NOT covered**: the intended "eis-only specialist is denied the monitor" assertion is a `test.fixme` because the product has **no role gate** beyond authGuard — a companion test DOCUMENTS this as a FINDING, studio-session.spec.ts:572/583. See §2.6) |
| No-studio empty state | SS-16 | ✅ | ✅ | ✅ (banner, ghost-render, empty subscriptions) |
| Web Studio Invitation overlay | SS-05 | ✅ | ✅ | ✅ (covered within SS-05) |
| OpenVidu Room `/joinroom` | SS-11 | ⚠️ | ✅ | ⚠️ (join routing asserted; **LiveKit track/grid layout deep state NOT asserted** — externals stubbed, see §5) |
| Zoom Meeting Start | SS-11 | ✅ | ✅ | ✅ (broken-link + regen) |

### 2.3 BIG screens

| Screen / Route | Case(s) | Cov | Assert | Gap |
|---|---|---|---|---|
| Login `/login` | BIG-00 | ✅ | ✅ | ✅ (getRoles non-empty, single auth token) |
| Big Dashboard `/big-dashboard` | BIG-01 | ✅ | ✅ | ✅ (Total/Filtered/cohort/ATC/AEL drift) |
| Dashboard health/empty | BIG-02 | ✅ | ✅ | ✅ (no NaN/undefined, no TypeError) |
| Participant Assignment Board `/particiant_assignment_board` | BIG-03 | ⚠️ | ✅ | ⚠️ (Σ status badges == total, card==badge — real & non-circular; **runtime-gated** — `test.skip` if the seed has no `big marathon` to select, big-core.spec.ts:269. PAB cards/filters render only behind a selected marathon) |
| PAB perform-action write | BIG-04 | ⚠️ | ✅ | ⚠️ (status→ongoing persisted, single write, conservation — real REAL-UI drive & non-circular; **runtime-gated** — 3× `test.skip` if no marathon / no startable card on the seed, big-core.spec.ts:316/334. The default queue seed seeds no `big marathon`/`big participants assignments`) |
| Manual Assignment submit `/manualassignment` | BIG-05 | ✅ | ✅ | ✅ (manual doc, activityref, 100% only at completion) |
| Form-Based Submission `/formbasedsubmission` | BIG-06 | ✅ | ✅ | ✅ (field count parity, status changed) |
| Validate Participant Assignments `/validateParticipantAssignments` | BIG-07 | ✅ | ✅ | ✅ (move persist, conservation, empty-selection no-write) |
| Big Cohorts `/bigcohorts` | BIG-08 | ✅ | ✅ | ✅ (audit log, no dup/leftover, net-zero move) |
| Big Activity `/bigactivity` | — | ❌ | ❌ | ❌ **GAP: no test navigates `/bigactivity`** (was aspirational ✅; save-reflected-in-list flow not covered) |
| Big Level `/biglevel` | BIG-09a | ⚠️ | ⚠️ | ❌ (crash-smoke only: mounts + renders ≥ seeded rows, no fatal — big-analytics.spec.ts:316. No state/gap invariant) |
| ATC Model Level Config `/modellevelconfig` | BIG-09b | ⚠️ | ⚠️ | ❌ (crash-smoke only: renders ≥ seeded config rows, no fatal — big-analytics.spec.ts:329) |
| Arena Space `/arena_space` | — | ❌ | ❌ | ❌ **GAP: no test navigates `/arena_space`** (was aspirational ✅) |
| Big Aggregate `/big_aggregate` | BIG-09c | ⚠️ | ⚠️ | ❌ (mounts + finite Total ATC-Model count ≥ 0, no fatal — big-analytics.spec.ts:339. Finite-count smoke, not an active==ongoing invariant) |
| Aggregate Event Level `/bigaggregateeventlevel` | BIG-10a | ✅ | ✅ | ✅ (AEL analytics count == Firestore collection size AND ≥ seeded floor — real no-silent-drop invariant, big-analytics.spec.ts:355) |
| Monitor Activity Log `/bigactivitymonitor` | BIG-10b | ✅ | ✅ | ✅ (monitor "Participants" count == app-filtered live-token count — real no-silent-drop invariant, big-analytics.spec.ts:387) |
| Big Activity Log `/bigactivitylog` | — | ❌ | ❌ | ❌ **GAP: no test navigates `/bigactivitylog`** (was aspirational ✅; ordering/count not covered) |
| Big Profile `/bigProfile` | — | ❌ | ❌ | ❌ **GAP: no test navigates `/bigProfile`** (was aspirational ✅; level-name mapping not covered) |
| Zoom Meeting `/zoommeeting_bigparticipants` | BIG-11 | ✅ | ✅ | ✅ (mounts gracefully for an assignment with no zoomdata, no fatal, no real window — big-analytics.spec.ts:436) |
| Watch Videos `/watchvideos` | P3 #13 | ⚠️ | ⚠️ | ⚠️ (crash-smoke exists — `watch-videos.spec.ts` drives the REAL PAB and opens the WatchVideos dialog from the Video action; but **`test.skip` unless a Video-type `big participants assignments` is seeded**, which the default seed does NOT do — so on a fresh seed it skips with reason at watch-videos.spec.ts:103/131. Dialog-mount assertion is present but currently unreachable; the board's honest empty state is the observed result) |
| Big Aggregate Event Level (charts) | — | ❌ | ❌ | ❌ **GAP: chart-render not asserted** (the AEL count invariant BIG-10a above does NOT assert any chart/canvas render) |

### 2.4 The 9 queue VARIATIONS (closed-loop walkforward)

All 9 variation specs exist under `queue/variations/` and are in the 121-test compile set (they replace the
deleted `closed-loop.spec.ts`). They follow the non-circular contract: `participant-sim.advance` is used ONLY
to set preconditions / stand in for the Flutter participant self-move (tagged `by:'self'`); every asserted
*operator/specialist* hop is driven through the REAL board/studio page objects, and invariants read APP/CF
output (board-recomputed column counts, the product-written `queue stage log` rows with `minNonSelf≥1`, CF
touchpoints) — never a value the test just wrote. **Status caveat:** ✅ below = the walk + invariants are
implemented and compile; none has yet been *observed green* end-to-end against a live emulator/cloud target
(that requires the wiring in the journal's run-commands section). Two specs additionally `test.skip(true, …)`
an individual hop **at runtime** if the real UI control for that leg does not render on the seeded variation
(honest skip-with-reason, never a false green) — flagged ⚠️ in the Assert column.

| # | Variation (id) / queue | Case(s) | Cov | Assert | Gap |
|---|---|---|---|---|---|
| V1 | **LYL - First Cycle** (`K9PRd4PfWDWtaO0vSxy3`) / `L3rqCrqDBsshd7HM5YRn` | LYL-FC-WF-01/02/03 | ✅ | ✅ | ✅ (orphan, every-move-logged, no-skip, terminal, loop≤2) |
| V2 | **LYL - Next Cycle** (`41KiwsFl4dZ6JhtfPemA`) / `BhQgc9dU9Q27skitBCUD` | LYL-NC-WF-01 | ✅ | ✅ | ✅ (full invariant set + form-write integrity) |
| V3 | **B!G - Next Cycle** (`BIGNC`) | BIGNC-00…06 | ✅ | ✅ | ✅ (live-assignment integrity, terminal, loop≤2) |
| V4 | **Prodigies - Next Cycle** (`zvFQgmYarx1NKubIP70R`) / `L3rqCr…` | PNC-WF-01/02/03 | ✅ | ✅ | ✅ (backbone-divergence flag, loop≤2, final sweep) |
| V5 | **Prodigies first cycle** (`zUuoZoJHHDQnPTA6Ap68`) / `vuvS7eBgTxLKufnesLQT` | PFC-WF-01 | ✅ | ⚠️ | ✅ (cohort N, conservation, studio-return integrity; a hop `test.skip`s if its REAL UI control / move-dropdown does not render — prodigies-first-cycle.spec.ts:253/348) |
| V6 | **uP! - First Cycle** (`M2wSxXnHYzvBRcpIlXYJ`) / `L3rqCr…` | UPFC-HAPPY/LOOP/GAP | ✅ | ✅ | ✅ (DRC loop, Consultation back-loop, oracle parity) |
| V7 | **uP! - Next Cycle** (`hdxaoI8zASDEk56OVIrk`) / `L3rqCr…` | WF-uPNextCycle-001 | ✅ | ✅ | ✅ (link-stage no-write, Diagnostics loop≤2) |
| V8 | **uP! - 3rd Cycle** (`XmCS5togakPzWjfQvEe3`) / `L3rqCr…` | UP3-WF-01 | ✅ | ⚠️ | ✅ (variation-scoped edges, loop≤2, formref presence; a specialist studio hop `test.skip`s if its REAL control does not render — up-3rd-cycle.spec.ts:521) |
| V9 | **uP! - Prep Hold** (`PJQVQf9HU0PxSCIbH5re`) / `L3rqCr…` | UPH-00/01/02 | ✅ | ✅ | ✅ (single-stage terminal == entry, no-move/no-log invariant) |

### 2.5 cloudfunctions (asserted via DB side-effects)

> CF read-backs only fire where the triggers are deployed: the **emulator** target (functions emulator runs
> `index.emulator.js`) or the **cloud** target `slabs-queue-e2e-exdcz` (triggers deployed). On a UI-only run
> with no CF runtime these read-backs would not be produced — another reason the CF cells are "verified-compiling,
> observed-green requires a CF-bearing target" (see journal).

| Trigger | Where asserted | Cov |
|---|---|---|
| `onQueueStageChange` | **CF-01 (direct: real board move → "Queue Stage Moved" touchpoint, cf-sideeffects.spec.ts:103)**; OP-04 + WF cases (stage-log + metadata, indirect) | ✅ (direct + indirect) |
| `queueParticipantPositionUpdate` | **CF-02 (direct: CF-computed queueposition 1..M vs known seeded ready-count, cf-sideeffects.spec.ts:173)** | ✅ (direct) |
| `studioZoomLink` | SS-06, SS-11 (zoomdata populated / broken-link fallback) | ✅ (indirect) |
| `studioZoomLinkDeactivate` | SS-12 (live-assignment completed) | ✅ (indirect) |
| `inviteToStudio` | SS-04 (invitation created) | ✅ (indirect) |
| `bulkReadyInvitation` | OP-09b (bulk invite fan-out conserves) | ⚠️ partial |
| `invitationAccepted` | SS-05 (status→ready) | ✅ (indirect) |
| `createBigParticipantAssignment` | BIG-04/05 | ⚠️ partial (BIG-04 itself is runtime-gated on a seeded marathon — §2.3) |
| `updateDeliveryStatus` (callable) | OP-07, OP-08, WF terminals | ✅ |
| `CreateQueueActivityLogV2` | — | ❌ **GAP: activity-log aggregation not directly asserted** |
| `biginvitationAccepted` | — | ❌ **GAP: not covered** |

### 2.6 Explicit NOT-COVERED + PARTIAL summary (no silent gaps — rewritten post-run)

**Still NOT covered (❌):**
1. ❌ **Queue authoring EDIT/rework** of an *existing* queue. (The CREATE path IS now covered — AUTH-01, §2.1.)
2. ❌ **BIG screens with no test behind them**: `/bigactivity`, `/arena_space`, `/bigactivitylog`, `/bigProfile`
   were aspirational ✅ in the pre-run matrix; **no spec navigates them**. Now marked ❌ in §2.3.
3. ❌ **CF `biginvitationAccepted`** and **`CreateQueueActivityLogV2`** — no direct assertion.
   (`queueParticipantPositionUpdate` IS now directly asserted by CF-02; `onQueueStageChange` directly by CF-01.)
4. ❌ **Aggregate / AEL chart-render** (canvas/graph). The AEL **count** invariant (BIG-10a) is covered; the chart is not.
5. ❌ **Cross-project CF coupling** (Watson / SalesCRM webhooks) — out of scope (external projects, never written).

**Covered but PARTIAL / runtime-gated (⚠️) — the test exists, compiles, is non-circular, but self-skips or only smokes:**
6. ⚠️ **Watch Videos** (P3 #13) — REAL-UI crash-smoke exists, but `test.skip`s unless a Video-type `big participants assignments` is seeded (default seed does not). Currently unreachable through the product on a fresh seed.
7. ⚠️ **PAB / BIG-03 / BIG-04** — real, but `test.skip` unless the seed has a `big marathon` + startable card (the default queue seed seeds neither).
8. ⚠️ **OP-06** (close-studio), **SS-08** (validate AEL), **SS-13** (move-next review path) — real, but each `test.skip`s unless its precondition/widget is present on the seeded variation/stage.
9. ⚠️ **`/biglevel`, `/modellevelconfig`, `/big_aggregate`** — crash-smoke + finite-count only (BIG-09a/b/c); no state/gap invariant.
10. ⚠️ **OpenVidu/LiveKit deep room state** (track grid, active-speaker, blur) — `/joinroom` routing asserted only; media externals stubbed.
11. ⚠️ **V5 / V8 variation walks** — a single hop `test.skip`s if its REAL UI control does not render on the seeded variation.

**FINDINGS surfaced by the tests (product gaps, recorded — not test gaps):**
12. 🔎 **`/arenastudioactivity` has no role gate** beyond authGuard — an `eis`-only specialist is NOT denied (SS-15b). The negative-gate assertion is a `test.fixme`; a companion test documents the actual permissive behaviour. Tighten the route guard (PLAN P0 #4).

**Whole-suite status caveat:** all 121 tests across 22 files **transpile + typecheck clean** (`tsc --noEmit` on `queue/**`+`lib/**` exits 0; both Playwright configs `--list` 121 tests). "✅"/"⚠️" above describe *what the test does and whether it is non-circular*, NOT that it has been observed green against a live target. End-to-end green requires the emulator (or cloud) wiring + seed — see `specs/journals/2026-06-06-queue-e2e-FULL-IMPL.md`.

---

## 3. ORDERED TEST CASES

> Step markers: **[REAL-UI]** = Playwright action against the live Angular app ·
> **[SIM]** = Level-1 Firestore write via `firebase-admin` ·
> **[ASSERT]** = poll/read assertion · **[GAP]** = silent-data-gap invariant.

### 3.A OPERATOR group (`/dynamicqueuemanager` walkforward)

#### OP-01 — Login & role-gated route
- **Pre:** Auth user w/ operator role; `profile_data` w/ `profile_ref.id==profileid`; `classify.routeConfig` grants route; ≥1 queue w/ `queueadmin ∋ profileid`.
- **Steps:** [REAL-UI] nav `/login` → fill email/password → click Login → nav `/dynamicqueuemanager`.
- **[ASSERT]** URL leaves `/login`; queue selector renders; direct nav to `/dynamicqueuemanager` does not bounce.
- **[GAP]** zero error-level console logs during login; authGuard pass (no silent role gap).

#### OP-02 — Queue List
- **Pre:** logged in; ≥1 `queue generation` doc.
- **Steps:** [REAL-UI] nav `/queuelist`; read rows; filter by name fragment; open row `more_vert`.
- **[ASSERT]** row count == non-soft-deleted queue count; date cells render real range; B!G Planner link present.
- **[GAP]** table row count == direct Firestore `where delete != true` count (catch dropped query result); no `undefined` date cell.

#### OP-03 — Queue Manager load & counts
- **Pre:** queue selected; `queue_token` seeded across `currentstage`/`status`.
- **Steps:** [REAL-UI] pick queue; read Total Participants; per-column header counts; stage-count chips.
- **[ASSERT]** Total == Σ columns (excl Unattended); each column == `queue_token` count for that `currentstage`; chip == `getIndividualStageCount` recompute.
- **[GAP]** per-column (not just total) parity; chip drift; ≥1 `.stagename` column renders; no console error after live stream resolves.

#### OP-04 — Move token → non-Activity (writes log) [+A5]
- **Pre:** token T in S; target D non-Activity; specialistList resolvable.
- **Steps:** [REAL-UI] click `.move-btn` → pick D → confirm PeopleInvolved → commit.
- **[ASSERT]** `queue_token/{T}`: `currentstage==D`, `previousstage==S`, `stagestatus=='Approved'`, `manuallymoved==true`, derived `status`.
- **[GAP]** exactly ONE new stage-log doc (`movedby`, `movedthrough=='queue manager'`); source−1/dest+1, Total unchanged; `liveassignmentid`/`studioid` cleared.

#### OP-05 — Move → Activity (opens studio) [+A5]
- **Pre:** target D `type=='Activity'`; pairing doc selectable; token resolves atcmodel.
- **Steps:** [REAL-UI] move → pick Activity D → AssignQueueStudio select → confirm.
- **[ASSERT]** token `liveassignmentid`+`studioid` set; ONE new `live assignment`; pairing `status=='live'`.
- **[GAP]** stale-status (no missing link); pairing-flip; ONE stage-log; single-live invariant (prior live → completed).

#### OP-06 — Drag OUT of Activity (closes studio) [+A5]
- **Pre:** token in Activity w/ live-assignment + studio.
- **Steps:** [REAL-UI] move → pick non-Activity → confirm.
- **[ASSERT]** pairing `status==null`; live-assignment `status=='completed'` + `updated`; token studio fields null.
- **[GAP]** stale-studio; zombie live-assignment; ONE stage-log; instudio chip−1, dest+1, Total unchanged.

#### OP-07 — Final stage completes delivery [+A5]
- **Pre:** target D final (`dropIndex+1==len`); `event participation request` approved.
- **Steps:** [REAL-UI] move to final.
- **[ASSERT]** `guard.updateDeliveryStatus('/queue_token/{T}','completed')` invoked; stage-log appended; token at final.
- **[GAP]** completion call fired (network/CF trace); Total unchanged.

#### OP-08 — Complete Queue (bulk) [+A5]
- **Steps:** [REAL-UI] click `cloud_done` on stage.
- **[ASSERT]** one completion call per token.
- **[GAP]** call count == token count (catch partial bulk); no console error; counts consistent.

#### OP-09 — Comms sidebar & counts
- **Steps:** [REAL-UI] open comms; read Participants(N); confirm disabled w/o selection; Select All.
- **[ASSERT]** sidebar N == board column count; buttons enable on selection.
- **[GAP]** sidebar/board divergence; send-enabled-with-zero-recipients.

#### OP-10 — Filters & search
- **Steps:** [REAL-UI] open filter; apply tag; clear.
- **[ASSERT]** badge == distinct active groups; columns reflect tag; clear restores exact Total.
- **[GAP]** badge drift; filter permanently dropping tokens.

#### OP-11 — Export CSV
- **Steps:** [REAL-UI] Export CSV; inspect file.
- **[ASSERT]** header + one row per token.
- **[GAP]** row count == Total (no truncation); required headers present.

#### OP-12 — B!G Planner
- **Steps:** [REAL-UI] nav `/queuebigplanner?queueid=`; read pairing table + metrics.
- **[ASSERT]** table renders; counts match Firestore.
- **[GAP]** `completedToken` vs Firestore; `stageTokenMap` sum == token total; `profileStudioCount` recompute.

#### OP-13 — Empty / health-negative
- **Steps:** [REAL-UI] select empty queue; open comms; Export CSV; select queue w/ token missing profile.
- **[ASSERT]** Total renders 0; columns 0; CSV header-only.
- **[GAP]** 0 not NaN/blank; missing-profile token still counted; zero uncaught console errors across all sub-steps.

---

### 3.B SPECIALIST / STUDIO group (`/dynamicstudio` walkforward)

> SS-00 → SS-16 ordered. Full detail per the designed case group; key markers below.

| Case | Title | REAL/SIM | Core assertion | Silent-gap invariant |
|---|---|---|---|---|
| SS-00 | Login + My Arena load | REAL-UI | queue-card count == Firestore pairing count | zero console errors; no false "No Active Queue" alert |
| SS-01 | Studio select / counts / live_tv | REAL-UI | button count == studioList; live_tv parity | name/activity map (no raw ids) |
| SS-02 | Check-in toggle + log | REAL-UI | pairing.checkin flip + ONE checkin-log row | log/flag parity; on-hold not bypassed |
| SS-03 | Waiting-list counts | SIM seed + REAL-UI | only eligible tokens shown | preassign/atcmodel/liveassignment filters honored |
| SS-04 | Bring To Studio → invite | REAL-UI | studioinvitation created, expiry ≈ +2min | no-op fail; dup-invite block; grouping completeness |
| SS-05 | Participant accept/deny | SIM (overlay) + CF | accept → token.status `ready`; deny rollback | CF status drift; expiry ignored; deny leaves no live-assignment |
| SS-06 | Assign studio → open session | REAL-UI + CF | token `instudio` + live-assignment + pairing `live` + stage-log | dangling token; pairing-not-flipped; missing stage-log; cross-ref mismatch; double-assign |
| SS-07 | Live panel widgets / numbers | REAL-UI (cross-DB) | counts == Firestore (atc/forms/triple) | widget gating drift; cross-DB truncation; raw-id render |
| SS-08 | Validate AEL writes | REAL-UI | interim-crossover doc + flag `validated` | audit gap; updated flag; gate-bypass on completion |
| SS-09 | Mark procedures complete | REAL-UI | status persists on reload | optimistic-only; row-count; cross-DB hydrate errors |
| SS-10 | Invite More Participant | REAL-UI | session not torn down | cancel = no commit |
| SS-11 | Zoom / OpenVidu join | REAL-UI (stubbed) | broken-link guard; `/joinroom` routes | regen feedback; joinroom resolves openviduroom |
| SS-12 | Move next (complete) | REAL-UI + CF + A4 | token→next, close studio, stage-log, final delivery | missing stage-log; stale live/pairing; status drift; dangling refs |
| SS-13 | Move next (review path) | REAL-UI | hold-confirm before close | cancel = no partial move; stale-studio after close |
| SS-14 | Other Studio join | REAL-UI | bonus-activity buttons render; join routes | visibility leak; dead-click alert |
| SS-15 | Arena Monitor | REAL-UI + CF | card count == live-assignment count | close propagation; dup-pairing flag; raw-id |
| SS-16 | No-studio empty state | REAL-UI | banner shows; no crash | empty-state detection; ghost render |

---

### 3.C BIG group (`/big-dashboard` + ~18 routes)

| Case | Title | REAL/SIM | Core assertion | Silent-gap invariant |
|---|---|---|---|---|
| BIG-00 | Login + role gate | REAL-UI | lands on dashboard; signed-out redirects | getRoles non-empty; single auth token |
| BIG-01 | Dashboard counts | REAL-UI | Total/Filtered/cohort/assignment/ATC/AEL == seed | `data.length` == returned rows; TotalAEL == current+completed; ATC non-blank when present |
| BIG-02 | Dashboard health/empty | REAL-UI | zero-states render | no `undefined`/`NaN`; no TypeError on `.length` |
| BIG-03 | PAB status counts | REAL-UI | badges == per-status counts; cards == badge | Σ badges == total; UI/count drift |
| BIG-04 | PAB perform-action write | REAL-UI | status→ongoing persisted | single updateDoc; conservation |
| BIG-05 | Manual submit | REAL-UI | progress 100%; manual doc + status review | orphan-review; activityref; premature 100% |
| BIG-06 | Form submit | REAL-UI | status advances | field-count parity; status actually changed |
| BIG-07 | Validate move | REAL-UI | accept/reject/rework persist | conservation; src−1==dst+1; empty-selection no-write |
| BIG-08 | Cohorts manage | REAL-UI | size updates + audit log | audit gap; no dup/leftover; net-zero move |
| BIG-09 | Config screens health | REAL-UI | load + create no error | save reflected in live list |
| BIG-10 | Analytics & monitor | REAL-UI | metrics consistent | active==ongoing; live count fresh; completion% exact |
| BIG-11 | Zoom activity | REAL-UI (stubbed) | both docs ongoing | split-brain status; missing-zoomdata graceful |

---

### 3.D VARIATION walkforwards (closed-loop, first stage → terminal)

> Each variation case enforces the **universal invariant set**:
> **ORPHAN** (exactly one token), **EVERY-MOVE-LOGGED** (1 stage-log per transition),
> **NO-STAGE-SKIPPED** (each `prev→curr` is a config edge), **TERMINAL-REACHED**
> (`currentstage==Completed`, `nextstage==[]`), **COUNT-DRIFT** (src−1/dst+1, Σ conserved),
> **LOOP-BOUND** (each back-edge ≤2), plus form/studio integrity where applicable.

#### V1 — LYL - First Cycle (`K9PRd4PfWDWtaO0vSxy3` / `L3rqCrqDBsshd7HM5YRn`)
- **LYL-FC-WF-01** Happy path 16 transitions (Evolution Prep Orientation → Completed). Mix: [REAL-UI] operator gates + [SIM] participant form self-moves + [REAL-UI] specialist studio stages (Scope Enhancement, Diagnostics, ATC Preparation/Briefing, Consultation, uP! Readiness Changework).
- **LYL-FC-WF-02** Bounded loop: Scope Enhancement self-loop ≤2 → converge to Guided Self ATC → continue to terminal.
- **LYL-FC-WF-03** Bounded loop: Diagnostics ↔ Diagnostics Readiness Changework round-trip ≤2. **Backbone-divergence flag:** DRC's only forward edge is back to Diagnostics; assert no illegal `DRC→ATC Preparation` skip; legal exit via Diagnostics.

#### V2 — LYL - Next Cycle (`41KiwsFl4dZ6JhtfPemA` / `BhQgc9dU9Q27skitBCUD`)
- **LYL-NC-WF-01** 11-stage backbone + Scope Enhancement Send-Back loop (1). Asserts Next-Cycle edge (`Evolution Mapping Activity`, NOT `Guided Pre ATC Orientation`/`Completed`). Final operator move triggers `updateDeliveryStatus`. Form-write integrity on 4 selfmovable stages. Studio-stage closure clean.

#### V3 — B!G - Next Cycle (`BIGNC`, 5-stage: Re-Engagement Form → Diagnostics → ATC Briefing → Scope Enhancement → Completed)
- **BIGNC-00** Seed + board load. **BIGNC-01** [SIM] form self-move. **BIGNC-02** [REAL-UI] operator Diagnostics→ATC Briefing. **BIGNC-03** [REAL-UI] operator into Activity (live-assignment created). **BIGNC-04** [REAL-UI] specialist close. **BIGNC-05** [REAL-UI] operator terminal + delivery completion. **BIGNC-06** bounded back-edge ≤2 (if config defines one; else SKIP — explicit).

#### V4 — Prodigies - Next Cycle (`zvFQgmYarx1NKubIP70R` / `L3rqCr…`)
- **PNC-WF-01** 16-stage backbone, mixed actors, Diagnostics↔DRC loop. **PNC-WF-02** bounded loop coverage (Scope self-loop, Diagnostics↔DRC, uP!RCW→Consultation, Review→uP!RCW), each ≤2. **PNC-WF-03** data-gap final sweep (orphan, log-parity, backbone subsequence, terminal, monotonic logdate, board consistency).

#### V5 — Prodigies first cycle (`zUuoZoJHHDQnPTA6Ap68` / `vuvS7eBgTxLKufnesLQT`)
- **PFC-WF-01** 5-stage cohort (N≥2) walkforward. Stages: Evolution Prep Orientation → AEL Form → ATC Orientation Form → Scope Enhancement → Completed. [REAL-UI] operator T1, [SIM] participant T2/T3 forms, [REAL-UI] specialist Scope Enhancement studio + Move-Back loop (≤2). Cohort conservation (Σ == N); studio-return integrity; blank-name guard.

#### V6 — uP! - First Cycle (`M2wSxXnHYzvBRcpIlXYJ` / `L3rqCr…`)
- **UPFC-HAPPY** canonical 17-stage forward (no loops). **UPFC-LOOP** DRC loop ×2 + Consultation back-loop ×2 → terminal. **UPFC-GAP** oracle parity sweep (`buildFlow`/`validateFlow`): log/currentstage parity, edge legality 100%, terminal node, orphan invariant, board↔Firestore count reconciliation, no leaked live-assignment.

#### V7 — uP! - Next Cycle (`hdxaoI8zASDEk56OVIrk` / `L3rqCr…`)
- **WF-uPNextCycle-001** 18-stage backbone. [REAL-UI] operator gates, [SIM] participant forms, [REAL-UI] specialist Diagnostics/ATC Briefing. Next-Cycle edge (`Evolution Mapping Activity`). Link stage (`In Evolution Mapping Activity`) = **no-write assertion**. Diagnostics↔DRC loop ≤2. Variation-scoping: ATC Briefing must NOT offer Consultation.

#### V8 — uP! - 3rd Cycle (`XmCS5togakPzWjfQvEe3` / `L3rqCr…`)
- **UP3-WF-01** happy path with Diagnostics self-loop + Diagnostics↔DRC loop (≤2). Variation-scoped edge assertions (move-dropdown must NOT offer other-variation edges). formref presence on all selfmovable form moves. Studio side-effect consistency.

#### V9 — uP! - Prep Hold (`PJQVQf9HU0PxSCIbH5re` / `L3rqCr…`)
- **UPH-00** [SIM] seed token at sole stage `uP! Prep Process - Hold` + [REAL-UI] board count==1. **UPH-01** terminal assertion: entry IS terminal — `buildFlow` shows backbone length 1, `nextstage==[]`, move-dropdown EMPTY, `selfmovable==false` (no participant CTA). **UPH-02** no-move/no-log invariant: count stable, 0 stage-log docs, vacuous every-move-logged (0==0), `validateFlow` reaches==true (entry==declaredEnd).

---

## 4. PROPOSED PLAYWRIGHT FILE / PAGE-OBJECT STRUCTURE

```
e2e/
├─ playwright.config.ts                 # existing — add webServer (emulator + seed + ng serve)
├─ PLAN.md                              # this file
├─ _support/
│  ├─ app.ts                            # existing app harness
│  ├─ excluded-routes.ts               # existing
│  ├─ auth.ts                          # NEW: loginAs(role) helpers (operator/specialist/bigadmin/bigparticipant)
│  ├─ console-guard.ts                 # NEW: assert zero error-level console logs per page
│  └─ firestore-admin.ts              # NEW: firebase-admin client for SIM writes + DB read assertions
├─ pages/                               # NEW: page objects
│  ├─ login.page.ts
│  ├─ queue-board.page.ts              # /dynamicqueuemanager: moveToken(), readColumnCount(), openComms(), openFilters(), exportCsv()
│  ├─ queue-list.page.ts
│  ├─ big-planner.page.ts
│  ├─ studio.page.ts                   # /dynamicstudio: selectStudio(), checkin(), bringToStudio(), nextStage()
│  ├─ arena-monitor.page.ts
│  ├─ big-dashboard.page.ts
│  ├─ big-assignment-board.page.ts
│  ├─ big-validate.page.ts
│  ├─ big-cohorts.page.ts
│  └─ join-room.page.ts                # OpenVidu /joinroom (stubbed media)
├─ lib/                                 # existing oracle libs
│  ├─ flow-model.js                    # existing — mirror of queue-flow.model.ts buildFlow/validateFlow
│  ├─ path-generator.js                # existing — bounded-loop path enumeration (≤2)
│  ├─ fake-data.js                     # existing
│  ├─ test-project.js                  # existing
│  └─ assertions.ts                    # NEW: universal invariant helpers (assertNoOrphan, assertEveryMoveLogged,
│                                      #       assertNoStageSkipped, assertTerminalReached, assertCountConserved, assertLoopBound)
├─ fixtures/                            # existing seeders
│  ├─ seed-test-project.js             # existing (cloud project)
│  ├─ seed-emulator.js                 # existing (emulator)
│  ├─ sample-queue-config.json         # existing
│  ├─ sample-prod-schemas.js           # existing
│  └─ variation-seeds/                 # NEW: per-variation token + config seed builders
│     ├─ lyl-first-cycle.ts ... up-prep-hold.ts
├─ stubs/                               # NEW: external stubs (route interception)
│  ├─ zoom.stub.ts                     # studioZoomLinkRegenerate / zoomdata
│  ├─ openvidu.stub.ts                 # LiveKit token + room
│  └─ fcm.stub.ts                      # push notifications
└─ specs/                               # NEW: test specs (one per group)
   ├─ operator.spec.ts                 # OP-01…OP-13
   ├─ specialist-studio.spec.ts        # SS-00…SS-16
   ├─ big.spec.ts                      # BIG-00…BIG-11
   └─ variations/
      ├─ lyl-first-cycle.spec.ts       # LYL-FC-WF-01/02/03
      ├─ lyl-next-cycle.spec.ts        # LYL-NC-WF-01
      ├─ big-next-cycle.spec.ts        # BIGNC-00…06
      ├─ prodigies-next-cycle.spec.ts  # PNC-WF-01/02/03
      ├─ prodigies-first-cycle.spec.ts # PFC-WF-01
      ├─ up-first-cycle.spec.ts        # UPFC-HAPPY/LOOP/GAP
      ├─ up-next-cycle.spec.ts         # WF-uPNextCycle-001
      ├─ up-3rd-cycle.spec.ts          # UP3-WF-01
      └─ up-prep-hold.spec.ts          # UPH-00/01/02
```

**Conventions**
- Every page object exposes a `readColumnCount(stageKey)` reading `[data-stage-key='…']` header so count assertions are uniform.
- SIM writes go through `firestore-admin.ts`; every SIM transition writes BOTH `queue_token` and a `queue stage log` doc to honor EVERY-MOVE-LOGGED.
- Poll-with-timeout (`expect.poll`) for all DB-driven UI assertions (live `collectionData` streams are async).
- `assertions.ts` invariant helpers are called at the end of every variation step block.
- `console-guard.ts` attached in `beforeEach` to fail on any error-level console output.

---

## 5. EXTERNALS TO STUB + ATC EXCLUSIONS

### Stub (intercept via Playwright `page.route` / emulator function stubs)
| External | Why | Stub behavior |
|---|---|---|
| **Zoom** (`studioZoomLink`, `studioZoomLinkRegenerate`, Zoom Web SDK) | No real Zoom account in test project; real link gen flaky | Return synthetic `zoomdata {start_url, join_url, id, password}`; for broken-link test return `'Link Broken'`/null; assert UI guard, do NOT open real windows |
| **OpenVidu / LiveKit** (`createOpenViduRoom`, token CF, `/joinroom` SDK) | Media server + egress not provisioned | Stub `openviduroom` doc + token; assert routing to `/joinroom/:id` and local preview controls render; **do NOT assert deep track/grid/active-speaker state** |
| **FCM / push notifications** | `onQueueStageChange` push side-effects | Stub/no-op the FCM send; assert Firestore touchpoint/log writes instead of device delivery |
| **Wati / WhatsApp broadcast** (`sendWhatsAppBroadcast`) | External messaging | No-op stub; assert button enable/disable + selection gating only |
| **sendBatchEmail** | External email | No-op stub; assert invocation count, not delivery |

### ATC EXCLUSIONS (out of scope for assertion depth)
- **`firestore-atc` secondary DB content correctness** (alpha ATC validation logic, triple-ATC scoring, prescription math) is NOT validated. Tests only assert **counts/list-length parity** and **render-without-raw-id** for ATC widgets (SS-07/08/09).
- **ATC generation cloud functions** (`queue_atc_generation`) are not exercised; ATC docs are **seeded**, not generated.
- **`firestore-forms` secondary DB** is **seeded** (form templates pre-created); form-submission writes only assert `formref` non-null, not form-payload schema.
- Cross-project ATC/CRM/Watson coupling (`watson-test-19`, `salescrm-test-19`) is explicitly excluded.

---

## 6. OPEN GAPS / RISKS (for future agents)

> **STALENESS NOTE (2026-06-06):** §6 and §7 below are the *pre-implementation* planning/critique prose and are
> kept as the historical record of WHY the suite was shaped this way. After the full implementation run, **§2 is the
> source of truth for actual coverage** — several items called "no test / uncovered" here were subsequently built
> (e.g. authoring CREATE via AUTH-01, the WatchVideos crash-smoke, direct CF assertions for `onQueueStageChange`
> and `queueParticipantPositionUpdate`). Where §6/§7 and §2 disagree, trust §2 and the journal
> `specs/journals/2026-06-06-queue-e2e-FULL-IMPL.md`.

### Coverage gaps (un-implemented, intentionally flagged) — see staleness note; reconciled in §2.6
1. **Queue Creation / Authoring** (queue-creation-v3): _(UPDATE: CREATE is now covered by AUTH-01 — §2.1; EDIT/rework still uncovered.)_ Phase-1 scope was read-only board operation. **Risk:** authoring-edit regressions invisible. *Future:* extend `authoring.spec.ts` with an edit case.
2. **Watch Videos** BIG assignment type: _(UPDATE: a runtime-gated crash-smoke now exists — `watch-videos.spec.ts`, §2.3; skips unless a Video assignment is seeded.)_ *Future:* seed a Video `big participants assignments` so the dialog mount actually exercises.
3. **CF direct assertions** for `biginvitationAccepted`, `queueParticipantPositionUpdate`, `CreateQueueActivityLogV2`: only indirect/none. *Future:* add CF-trace assertions or emulator function logs.
4. **OpenVidu/LiveKit deep room state**: media stubbed; grid/spotlight/blur/quality untested.
5. **Big Activity Log count invariant** & **analytics chart rendering**: render-only.

### Environmental / data-precondition risks
6. **Fresh project = empty collections** → empty columns/0 counts. Every variation case REQUIRES seeding (`queue generation`, `queue_token`, `profile_data`, `queue studio pairing`, form templates). OP-13/SS-16/BIG-02 explicitly cover empty-state, but other cases will false-fail without seed.
7. **`queueadmin` not array / missing** → operator sees all queues (access-control bypass). Seed must set arrays correctly.
8. **Firestore security rules** blocking `queue_token` query → `collectionData()` empty SILENTLY. COUNT-DRIFT/board-reconciliation invariants are the catch; ensure rules permit test-user reads.
9. **Missing `profile_data`** → blank names (token still counted). Blank-name guard in V5/OP-13.
10. **`stageproperty` undefined** in selected queue → financial/activity checks skip silently. Seed full `stageproperty`.

### Flow-config divergence risks (config oracle is authority)
11. **Backbone vs operator-path divergence**: V3 (Diagnostics→DRC dead-forward), V4/V6/V8 DRC loops, V7 link-stage no-write. The documented backbone array is NOT always the legal edge set — **`buildFlow()` scoped edges are the oracle.** Future agents MUST re-run `validateFlow()` against the live config before trusting any backbone ordering; a config change can silently invalidate hard-coded stage sequences in specs.
12. **Variation-scoped move buttons**: a stage's move-dropdown must only offer edges scoped to the token's `variationid` (or ALL). UP3/uP!-Next-Cycle assert this; other variations should adopt the same negative assertion.
13. **Loop bounds**: harness must enforce ≤2 traversals and FAIL on a 3rd; an unbounded loop would otherwise mask a stuck token.

### Timing / race risks
14. **Operator nextstage race** (`queue_token` write vs participant snapshot): SIM writes + `expect.poll` mitigate, but real-app concurrent operator+participant timing is not stress-tested.
15. **Live-assignment status window**: `assignStudio()` sets `liveassignmentid` then `instudio` separately — a transient window exists; SS-06 asserts end-state only.

### Infra / build risks
16. **`playwright.config.ts` has no `webServer`** (TODO D-002). Specs currently skip without `BASE_URL`. Future: wire `firebase emulators:exec → seed → ng serve --configuration emulator`.
17. **`--legacy-peer-deps`** required for installs (per project memory). CI must use it.
18. **Cloud vs emulator parity**: CF triggers (`onQueueStageChange` etc.) behave differently between emulator and `slabs-queue-e2e-exdcz`. Indirect CF assertions assume triggers are deployed in the chosen target.

---

## 7. Completeness Critique

Adversarial review against the goal: *"a suite that fails when any actor's flow breaks, when the app becomes unusable for any actor, or when a silent data gap is introduced."* The plan is strong on the operator/studio/variation core, but the gaps below are concrete holes where a broken flow, an unusable screen, or a silent data drop would pass green. Ranked by blast radius (how many actors/flows a regression would silently break).

### P0 — would let a real flow break silently

1. **Bulk-invite flow (`bulkReadyInvitation` → `studioinvitation` fan-out) has no real assertion.** The operator board surface exposes a `Bulk Move` / bulk-invite control and §2.5 marks `bulkReadyInvitation` ⚠️ partial, OP-09 only checks comms-sidebar enable/disable. A regression that creates `queue_token.status='invited'` for N tokens but writes only M<N `studioinvitation` docs would pass. **Close:** add OP-09b asserting `count(studioinvitation created) == count(tokens bulk-selected)` AND each token flips to `invited`, with a conservation check (no token left un-invited). This is the canonical silent-fan-out data gap.

2. **`invitationAccepted` round-trip is asserted only at the participant overlay, never reconciled to the bulk counter.** Surface lists `bulk invitation.totalaccepted` counter updated by the CF. SS-05 checks token→`ready` but not the `totalaccepted` increment. A broken counter silently breaks the operator's "how many accepted" number. **Close:** assert `bulk invitation.totalaccepted` increments by exactly 1 per accept and never on deny/expiry.

3. **Operator queue-visibility access-control is never negatively asserted.** Risk #7 names the exact bug (`queueadmin` not-array ⇒ operator sees ALL queues), and A1 says non-admin sees only queues where `profileid ∈ queueadmin`. No case logs in a non-admin operator and asserts a queue they are NOT in `queueadmin` for is **absent** from the dropdown. This is a security/data-isolation gap that current coverage cannot catch. **Close:** add OP-02b — seed 2 queues, operator in `queueadmin` of only one; assert dropdown shows exactly that one. Same negative test for B!G Planner (`/queuebigplanner` filters by role identically).

4. **Specialist role-gating on the monitor is not negatively tested.** A2 says `/arenastudioactivity` needs `developer`/`admin`/`ah`. SS-15 covers the happy monitor view but no case asserts a plain `eis`-only specialist is **denied** (or sees a gated view). A loosened guard = silent data exposure across all studios. **Close:** add a negative-auth case for the monitor route (and for the BIG management routes vs `big_participant`, see #8).

### P1 — would let a screen become unusable for an actor without failing

5. **Queue Creation / Authoring (queue-creation-v3) is entirely uncovered (✅-acknowledged in §2.6/#6.1).** Acknowledged is not covered. This is a full authoring screen with `setDoc('queue generation')` + `arena events` writes — the very data every other test depends on. A break here makes the operator unable to create/edit a queue (flow break) and is invisible. At minimum add a **smoke** case: open stepper, fill `queuename`/`queueadmin`/dates/one stage, save, assert the `queue generation` doc round-trips with the `queueadmin` array intact. Without it, the suite cannot claim "operator flow" coverage.

6. **Participant variation coverage does not prove the *self-movable vs operator-move* gate per stage.** A4 surface distinguishes form stages (self-move write), link stages (no-write), gate stages (Ready button), and compulsory/operator-move stages (no participant CTA, must wait). The variation cases assert terminal + loop-bound + no-skip, but only V7/V9 explicitly assert the **no-write** / **no-CTA** negative. A regression that makes a compulsory stage self-movable (participant skips an operator gate) would pass for V1–V6, V8. **Close:** for every variation, assert each stage's `selfmovable` flag matches the config oracle and that a SIM self-move on a non-self-movable stage is rejected / produces no `queue_token` write.

7. **Cross-DB count widgets (ATC / forms / triple-ATC) assert parity but not the *silent-empty* failure mode.** SS-07 asserts counts == Firestore, but the surface risk is "secondary DB not initialized ⇒ `collectionData()` returns empty silently." If the `firestore-forms` / `firestore-atc` handle fails to init, every count reads 0 and parity-with-(also-broken-read) still passes. **Close:** seed a known non-zero ATC/form fixture and assert the widget shows that exact non-zero number (a positive lower-bound), not just "== whatever the query returned."

8. **BIG management routes are not negatively gated against `big_participant`.** A3 says participant sees only own assignments; admin sees management screens. BIG-00 checks signed-out redirect but no case asserts a `big_participant` is **blocked** from `/big-dashboard` / `/validateParticipantAssignments` / `/bigcohorts`, nor that PAB shows only their own rows (not all participants'). Data-leak + access-control gap. **Close:** add BIG-00b participant-scope negative case.

### P2 — number-with-no-assertion and stub-absence gaps

9. **Several displayed numbers have no assertion (silent-data-gap risk by the plan's own definition):**
   - **B!G Planner** `profilePairCount`, `studioAssignmentMap`, `stageTokenMap` per-stage — OP-12 asserts `completedToken` + `stageTokenMap` sum + `profileStudioCount` but not `profilePairCount` or per-stage `stageTokenMap` breakdown. A per-stage miscount is masked by an aggregate-sum check.
   - **My Arena** `queueStudioCounts[queueid]` and `stageTokenList[i].tokenlist.length` — SS-00/SS-01 assert queue-card count; the per-stage waiting-list length is described but no explicit numeric invariant.
   - **Arena Monitor** `mapParticipantToToken` 1-to-1 — SS-15 asserts card count but not that the participant↔token map is bijective (a duplicate/missing mapping = wrong person shown).
   **Close:** add explicit equality assertions for each, sourced from a seeded known value.

10. **`updateDeliveryStatus` is asserted as "called," but its *argument correctness* (path + status + eventRequestRef) is not.** OP-07 asserts the call fires; the surface shows the path is `'/queue_token/{T}'` and options carry `eventRequestRef`. A call with the wrong path/ref completes delivery on the wrong record — a silent data corruption. **Close:** assert call arguments, not just invocation.

11. **FCM / push and touchpoint side-effects of `onQueueStageChange` are stubbed but the *Firestore* side-effects (`participant metadata` touchpoints, `queue activity log`) are not asserted on the move cases.** §5 says "assert Firestore touchpoint/log writes instead of device delivery," but no case in §3 actually reads `participant metadata` after a move. This is the primary observable proof the CF ran. **Close:** after OP-04/SS-06, assert the `participant metadata`/touchpoint doc updated.

12. **`queueParticipantPositionUpdate` / `CreateQueueActivityLogV2` / `biginvitationAccepted` (§2.6/#6.3) — fully uncovered.** `queueParticipantPositionUpdate` drives `queueposition`, a number shown per token on the board. If position aggregation breaks, every token shows a stale/wrong position and nothing fails. **Close:** assert `queue_token.queueposition` recomputes after a move (at least one variation case).

### P3 — acknowledged-and-acceptable, but tighten the wording

13. **OpenVidu/LiveKit deep state, Watch Videos, Big Activity Log count, analytics charts** are explicitly flagged (§2.6 #4–5, #6.1–2). Acceptable for Phase-1, but each is a screen an actor uses; recommend at least a **render-without-error + zero-console-error** smoke for Watch Videos and the OpenVidu `/joinroom` local-preview so a *crash* (vs deep-state) regression still fails. The console-guard (`console-guard.ts`) already exists — wiring it into these routes converts "uncovered" into "unusable-detectable" cheaply.

14. **Loop-bound enforcement (≤2) is asserted as an invariant but there is no positive test that a 3rd traversal actually FAILS the harness.** Risk #13 depends on this. Add one deliberately-unbounded SIM path and assert the suite reports failure (test-the-test).

### Summary of must-add cases to meet the goal
- OP-02b (queue-visibility access control, negative)
- OP-09b (bulk-invite fan-out conservation) + `totalaccepted` counter
- SS-15b / BIG-00b (negative role gating: monitor + BIG management/participant-scope)
- Per-variation `selfmovable` gate + no-write negative
- SS-07 positive non-zero cross-DB count lower-bound
- `updateDeliveryStatus` argument assertion
- `participant metadata` / `queueposition` CF side-effect read-back
- queue-creation-v3 smoke (round-trip `queueadmin` array)
