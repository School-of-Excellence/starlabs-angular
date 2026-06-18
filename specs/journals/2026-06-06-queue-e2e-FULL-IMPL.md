# 2026-06-06 — Queue Manager full e2e implementation (recon → infra → specs), HONEST status

> WHY this journal exists: a prior pass produced an **all-green coverage matrix that was not true** — cells
> were checked aspirationally, before the tests behind them existed. This run actually built the tests and then
> rewrote `e2e/PLAN.md` §2 cell-by-cell against re-derived ground truth. This journal is the trust anchor: it
> records exactly what compiles, what is non-circular, what self-skips, what is a *finding* vs a *pass*, and —
> critically — **what is "verified-compiling" but NOT yet "observed-green"** because that needs a live target.
> A future agent must NOT re-promote any cell to ✅-green on the strength of this document alone; it must run
> the suite against the emulator or cloud first.

Worktree: `/Users/antano/solarcode/ah/starlabs-angular-queue-e2e` (branch of `starlabs-angular`).
All paths below are absolute-from-worktree-root unless noted; specs live under `e2e/queue/**`.

---

## 0. Ground truth (re-derived this session, not trusted from the prior pass)

Commands run and their actual output:

- `cd e2e && npx playwright test --config=playwright.queue.config.ts --list` → **`Total: 121 tests in 22 files`**.
- `cd e2e && npx playwright test --config=playwright.queue.emulator.config.ts --list` → **`Total: 121 tests in 22 files`** (identical set; same `testDir: ./queue`, `testMatch: **/*.spec.ts`).
- `cd e2e && npx tsc --noEmit --skipLibCheck --esModuleInterop --moduleResolution bundler --module ES2022 --target ES2022 --experimentalDecorators --types node $(find queue lib -name '*.ts')` → **exit 0** (specs + `lib/` typecheck clean, not merely Playwright-transpile clean).
- `grep -rn "test.only|describe.only" e2e/queue/` → **none** (no silently-narrowed runs).

So **"compile ok = true" and "121 tests listed" are independently confirmed.** What that does and does NOT mean is in §4.

Per-file test count (cloud config `--list`, sums to 121 across 22 files):

```
 18  selfmovable-gate.spec.ts            5  actors-health.spec.ts          2  loop-bound-selftest.spec.ts
 15  operator.spec.ts                    4  oracle-selftest.spec.ts        2  cf-sideeffects.spec.ts
 13  big-core.spec.ts                    3  variations/up-prep-hold        2  variations/prodigies-first-cycle
 11  studio-session.spec.ts              3  variations/up-next-cycle       2  variations/lyl-next-cycle
 10  big-analytics.spec.ts               3  variations/up-first-cycle      1  watch-videos.spec.ts
  9  studio-core.spec.ts                 3  variations/up-3rd-cycle        1  cross-db-lowerbound.spec.ts
  7  variations/big-next-cycle.spec.ts   3  variations/prodigies-next-cycle 1 authoring.spec.ts
                                         3  variations/lyl-first-cycle
```

---

## 1. What was built, in order (recon → infra → specs)

### 1a. RECON FIRST (read the product before writing a selector)
Seven recon maps under `e2e/queue/recon/` (≈2,934 lines total) were produced/consumed before any spec:
`operator.md` (377), `studio.md` (436), `big.md` (505), `cf.md` (517), `schemas.md` (447),
`flow-config.md` (412), `testids.md` (240). Selectors in specs come from `testids.md` (the `data-testid`
attributes added to the operator/studio/BIG templates) — not invented. CF read-back shapes and the ATC-off-limits
boundary come from `cf.md`.

### 1b. INFRA (two runnable targets, anti-circular foundations)
- **Universal invariants:** `e2e/lib/assertions.ts` (≈20 KB) — `assertCountConserved`, `assertEveryMoveLogged`
  (with `minNonSelf≥1`, the anti-circularity teeth), `readLogRows`, loop-bound helpers. The silent-data-gap
  invariants read APP/CF **output** (a board-recomputed count, a product-written `queue stage log` row), never a
  value the test wrote.
- **Oracle / model:** `e2e/lib/flow-model.js`, `e2e/lib/path-generator.js`, `e2e/lib/participant-sim.js`
  (the documented Flutter-self-move stand-in, preconditions-only), `e2e/lib/test-project.js` (the **allowlist**:
  only `slabs-queue-e2e-exdcz` or a demo emulator id is writable; production/`starlabs-test`/Watson/SalesCRM hard-abort).
- **Seeders:** `e2e/fixtures/seed-test-project.js` (cloud), `e2e/fixtures/seed-emulator.js` (emulator),
  `e2e/fixtures/big-seed.ts`, `e2e/fixtures/variation-seeds/`, `e2e/fixtures/authoring-precondition.js`.
- **Cloud target:** `e2e/playwright.queue.config.ts` (`globalSetup: queue/support/global-setup.ts` re-seeds
  `slabs-queue-e2e-exdcz`; `webServer: npm --prefix .. start`). Project id is read from env, never hardcoded in a spec.
- **Emulator target (CI-gateable, hermetic):** `e2e/playwright.queue.emulator.config.ts`
  (`globalSetup: queue/support/emulator-global-setup.ts` → `ensureEmulator()` + `seedEmulator()`;
  `globalTeardown` stops a spawned emulator; `webServer: npm --prefix .. run start:emulator`). See §3 for the wiring.
- **Stubs:** `e2e/queue/stubs/{zoom,openvidu,wati,email,fcm}.stub.ts` (+ `index.ts`, `stub-util.ts`) so media/comms
  externals don't make real calls.
- **Page objects:** `e2e/queue/pages/*.page.ts` (board, queue-list, queue-creation, studio, arena-monitor,
  join-room, web-invitation, and the `big-*` boards). Support: `e2e/queue/support/*` (auth, console-guard,
  firestore-admin, delivery-status-spy, both global setups, emulator-setup).

### 1c. SPECS (22 files, 121 tests)
Operator OP-01…OP-13 (`operator.spec.ts`), Studio SS-00…SS-08 (`studio-core.spec.ts`) + SS-09…SS-16 + SS-15b
(`studio-session.spec.ts`), BIG-00…BIG-11 (`big-core.spec.ts` + `big-analytics.spec.ts`), the 9 closed-loop
**variation** walks (`queue/variations/*`), CF side-effects (`cf-sideeffects.spec.ts`), cross-DB lower bound
(`cross-db-lowerbound.spec.ts`), authoring create (`authoring.spec.ts`), WatchVideos smoke (`watch-videos.spec.ts`),
and the KEPT self-tests `selfmovable-gate.spec.ts`, `oracle-selftest.spec.ts`, `loop-bound-selftest.spec.ts`,
`actors-health.spec.ts`.

---

## 2. What was converted from circular → real-UI / known-seeded

The whole point of the rebuild. Representative conversions:

- **CF-01** (`e2e/queue/cf-sideeffects.spec.ts:103`): `participant-sim.advance` is used ONLY as a precondition
  stand-in (reposition a token to Review; explicitly *not asserted*). The asserted move is a **REAL board click**
  (`QueueBoardPage.moveToken`). Assertions read APP/CF output: the board re-renders src−1/dst+1
  (`board.readAllColumnCounts`, two app-computed snapshots), the product wrote exactly one new
  `queue stage log` row with `movedby !== 'self'`, and `onQueueStageChange` wrote a NEW "Queue Stage Moved"
  `participant touchpoint` whose `parentreference` is `queue_token/{T}` (a ref the **CF** set, not the test).
  Inline comment: *"We do NOT read back what we wrote."*
- **CF-02** (`cf-sideeffects.spec.ts:173`): asserts the **CF-computed** `queueposition` (1..M) against a
  **known seeded** ready-count — a value the app/CF computed vs a number the test knew in advance, never `read==write`.
- **The 9 variation walks** (`queue/variations/*`): replace the old single circular `closed-loop.spec.ts`.
  `participant-sim` stands in for the Flutter self-move (tagged `by:'self'`) for *self-movable* hops only; every
  operator/specialist hop is a real board/studio drive. After every hop the silent-data-gap invariants run on
  product output (board counts + product-written stage-log rows), with `assertEveryMoveLogged(..., {minNonSelf≥1})`
  proving the trail cannot be satisfied by self-writes alone.
- **AUTH-01** (`authoring.spec.ts`): drives the REAL queue-creation-v3 stepper (open → fill step-0 required fields →
  add a stage → real Submit) and asserts the doc the **component** wrote — the app-generated `docid` equals the
  Firestore snapshot id, `queueadmin` is a non-empty ARRAY containing the UI-selected admin (the exact shape the
  board's `array-contains` query needs), the added stage round-trips. Not a test-authored write read back.

---

## 3. CF-deploy + emulator wiring, and the EXACT run commands for BOTH targets

### CF / emulator wiring (verified present this session)
- `e2e/scripts/deploy-cf-emulator.sh` boots `firebase emulators:start --project demo-slabs-queue --config
  firebase.emulator.json` with the queue/big/participant **triggers executing**. It (1) materializes
  `starlabs-cloud-function/functions/.secret.local` with 6 **dummy** Zoom secrets (the v2 fns `defineSecret` at
  module-eval and won't boot without resolvable values; dummies force the deterministic "Link Broken" fallback —
  `cf.md §2`), (2) repoints `functions/package.json` `main` → `index.emulator.js` for the run and **restores on exit**,
  (3) hard-aborts on any protected project id. `index.emulator.js` (`starlabs-cloud-function/functions/`,
  present, 5,645 B) re-exports ONLY the asserted triggers and **never requires the ATC module**, so the
  `firestore-atc` named DB is never needed/touched.
- `firebase.emulator.json` is kept **separate from `firebase.json`** on purpose: the deploy workflow runs a bare
  `firebase deploy`, so a firestore/functions block in `firebase.json` would push to PRODUCTION. Emulator ports:
  **auth 9099, firestore 8080, functions 5001, UI 4001**, `singleProjectMode: true`.
- Angular emulator build: `src/environments/environment.emulator.ts` + the `emulator` configuration in
  `angular.json` + root script `start:emulator = ng serve --configuration emulator` (the app connects to the
  emulator ports). The cloud build uses plain `start = ng serve`.
- Both Playwright configs set `testDir: ./queue`, `testMatch: **/*.spec.ts`, `workers: 1`, `fullyParallel: false`
  (shared queue state, serialized for determinism), and read `baseURL`/target from env — **no project id is
  hardcoded in any spec** (anti-circularity + safety guardrail).

### Run commands — EMULATOR (hermetic, CI-gateable)
```bash
# one terminal, fully hermetic (boots emulator+CF, boots emulator-wired app, seeds, runs):
cd e2e && npm run test:emu          # = TARGET=emulator playwright test --config=playwright.queue.emulator.config.ts

# OR reuse an emulator you started yourself:
cd e2e && npm run emu:up            # terminal 1: scripts/deploy-cf-emulator.sh (Node 22 required; engines.node==22)
cd e2e && npm run emu:seed          # seed the running emulator (FIRESTORE_EMULATOR_HOST=localhost:8080 ...)
cd e2e && EMU_REUSE=1 npm run test:emu   # terminal 2
```

### Run commands — CLOUD (`slabs-queue-e2e-exdcz`, triggers deployed)
```bash
cd e2e && npm run seed              # node fixtures/seed-test-project.js --seed   (allowlist-guarded)
cd e2e && npm run test:cloud        # = TARGET=cloud playwright test --config=playwright.queue.config.ts
# SKIP_SEED=1 reuses an existing seed; TESTRUNID=<id> namespaces a run.
```
Safety: `e2e/lib/test-project.js` allows ONLY `slabs-queue-e2e-exdcz` (or a `demo-*` emulator id); production,
`starlabs-test`, Watson, SalesCRM all hard-abort. `deploy-cf-emulator.sh` has the same denylist.

---

## 4. Verified-COMPILING vs. observed-GREEN (read this before trusting any ✅)

**Verified this session (high confidence):** all 121 tests parse, transpile, and **typecheck** clean; both configs
enumerate them; no `test.only`. The page objects, `lib/`, stubs, seeders, and both global-setups compile.

**NOT verified this session (must be run to claim green):** I did **not** boot the emulator or hit the cloud
project in this session, so **no test was observed passing end-to-end**. The matrix ✅/⚠️ marks describe *what each
test does and whether it is non-circular* — they are **not** a green run. Anything depending on a live
`collectionData` stream, a deployed CF read-back, or a seeded precondition is "compiles + is correct-by-construction",
pending an actual run. Concretely, to turn ✅ into observed-green:
- CF read-backs (CF-01/CF-02, studio Zoom/invite side-effects) need a **CF-bearing** target (emulator `index.emulator.js`
  or the cloud project) — a UI-only run produces no touchpoint/position doc.
- The variation walks, studio session tests, and BIG count invariants need the matching **seed** present.

### Runtime-gated tests (they `test.skip` / `test.fixme` THEMSELVES — never a false green)
These are real and non-circular but will SKIP (with a printed reason) unless their precondition exists on the seed,
so they do not contribute green by default:
- `operator.spec.ts:397` — **OP-06** skips unless the first cohort token is seeded WITH a live-assignment.
- `studio-core.spec.ts:617` — **SS-08** skips unless `stageproperty.validateael` is on for the seeded studio stage.
- `studio-session.spec.ts:425` — **SS-13** skips unless the move-next button renders for the seeded stage.
- `big-core.spec.ts:269/316/334` — **BIG-03 / BIG-04** skip unless the seed has a `big marathon` + startable card
  (the default queue seed seeds **no** `big marathon` / `big participants assignments`).
- `watch-videos.spec.ts:103/131` — **WatchVideos (P3 #13)** skips unless a **Video-type** `big participants assignments`
  is seeded (default seed does not) → the dialog is currently **unreachable** through the product; the board's honest
  empty state is the observed result.
- `cross-db-lowerbound.spec.ts:162` — skips if the `firestore-forms` secondary DB precondition is absent.
- `variations/prodigies-first-cycle.spec.ts:253/348` and `variations/up-3rd-cycle.spec.ts:521` — an individual hop
  skips if its REAL UI control / move-dropdown does not render on the seeded variation.

### Standalone-green (no UI, no Firestore — pure model unit tests)
`oracle-selftest.spec.ts` (4) and `loop-bound-selftest.spec.ts` (2) exercise the flow-model oracle and
`assertLoopBound` directly; these should pass on any machine that can run Playwright, independent of target/seed.
`selfmovable-gate.spec.ts` (18) mixes oracle config-parity (standalone) with REAL-board operator-gate checks
(target-dependent). `actors-health.spec.ts` (5) is per-actor login smoke (target-dependent).

---

## 5. Honest remaining gaps (still ❌ / ⚠️ / findings)

Mirrors `e2e/PLAN.md §2.6` (rewritten this session). Summary:

**Still NOT covered (❌):**
- Queue authoring **EDIT/rework** of an existing queue (CREATE is covered by AUTH-01).
- **BIG screens with no spec behind them** — `/bigactivity`, `/arena_space`, `/bigactivitylog`, `/bigProfile` were
  aspirational ✅ in the pre-run matrix; **no test navigates them**. Now ❌ in `PLAN.md §2.3`.
- CF **`biginvitationAccepted`** and **`CreateQueueActivityLogV2`** — no direct assertion.
  (`queueParticipantPositionUpdate` and `onQueueStageChange` are now directly asserted by CF-02 / CF-01.)
- **Aggregate / AEL chart render** (the AEL *count* invariant BIG-10a is covered; the chart/canvas is not).
- **Cross-project CF coupling** (Watson / SalesCRM webhooks) — out of scope (external projects, never written).

**Covered but PARTIAL / runtime-gated (⚠️):** see §4 skip list, plus `/biglevel`, `/modellevelconfig`,
`/big_aggregate` are crash-smoke + finite-count only (BIG-09a/b/c, no state/gap invariant), and `/joinroom` asserts
routing only (LiveKit/OpenVidu deep room state — track grid, active speaker, blur — is stubbed, not asserted).

**FINDING (product gap, recorded — not a test gap):** `/arenastudioactivity` has **no role gate** beyond
authGuard. An `eis`-only specialist is NOT denied (`studio-session.spec.ts:572` is a `test.fixme` for the intended
denial; `:583` documents the actual permissive behaviour and that the cards render for a non-privileged user).
Action: add a `developer`/`admin`/`ah` route guard (PLAN P0 #4).

---

## 6. `closed-loop.spec.ts` supersede/delete — status

The brief required deleting `e2e/queue/closed-loop.spec.ts` **iff** the variation specs supersede it. Confirmed this
session: the 9 superseding specs exist under `e2e/queue/variations/` (in the 121-test set), and
`e2e/queue/closed-loop.spec.ts` is **already absent** — not on disk (`test -f` → absent), not tracked
(`git ls-files` empty), nothing staged (`git status --porcelain` empty). It was removed earlier in this rebuild.
**No deletion action was needed; nothing was fabricated.** If a future merge reintroduces it, delete it — its walk
is fully replaced by `queue/variations/*`.

---

## 7. Pointers for the next agent
- Trust `e2e/PLAN.md §2` (post-run) over any older green matrix.
- To make ✅ cells *observed-green*: run `cd e2e && npm run test:emu` (hermetic) — fix any real failure, never by
  weakening an invariant or adding a blanket skip. The honest skips already in place print a reason; do not convert
  them to silent passes.
- To close the biggest real gaps: seed a `big marathon` + a Video-type `big participants assignments` (unblocks
  BIG-03/04 and WatchVideos), seed a live-assignment on the first token (unblocks OP-06), and add the
  `/arenastudioactivity` role guard (flips the SS-15b `fixme` to a real pass).
- Files touched this session: `e2e/PLAN.md` (§2 rewritten), this journal. No spec/source code was modified.
