# PROMPT / JOURNAL — Finish all Queue Manager e2e tests on REAL Firestore, with screenshot evidence

> Hand this whole file to a fresh Claude Code session (or an engineer). It is self-contained.
> Branch: **`test/queue-e2e`**, worktree **`/Users/antano/solarcode/ah/starlabs-angular-queue-e2e`**.
> Latest relevant commit: **`ada927e`** (round-3 green-up + the 72-forward-journey expansion, 121→194 tests).

---

## 0. The goal (acceptance criteria)

Get **all 194 tests green** running against the **real disposable cloud Firestore test project**
`slabs-queue-e2e-exdcz` (NOT the local emulator), and produce **screenshot evidence** — one screenshot
per test, browsable in the Playwright HTML report — proving each test drove the real app against real
Firestore. "Done" =
1. `cd e2e && npm run report:cloud` (defined below) exits 0 with **194 passed / 0 failed** (the few
   genuine product-bug tests stay `test.fixme` — see §6; they are *expected* skips, not failures).
2. `e2e/playwright-report/index.html` shows a **screenshot for every test**, each against
   `slabs-queue-e2e-exdcz`.
3. `specs/audit/COVERAGE-AUDIT.md` is updated with the final green count.

**Discipline (do not violate — this is the whole point of this suite):** a test passes by driving the
REAL app/CF and asserting real output OR a known seeded value. **Never weaken/loosen an assertion to go
green.** If a test fails because the PRODUCT is genuinely wrong, mark it `test.fixme(reason)` and record
it as a finding — do **not** edit `src/**` and do **not** fake it green.

---

## 1. Why cloud, not the emulator

The suite supports **two targets** (same specs, both already wired):
- **Emulator** (`playwright.queue.emulator.config.ts`) — hermetic, for CI. BUT on a developer box the local
  Firebase **functions emulator crashes under sustained load** (it died 4× during the build session; port
  5001 dies, orphaned `functionsEmulatorRuntime` children, needs Java on PATH to restart). A separate chip
  is fixing that. Until then it cannot complete a full 194-test pass locally.
- **Cloud** (`playwright.queue.config.ts`) — the **disposable** project `slabs-queue-e2e-exdcz`. **Stable**,
  no crash, real Firestore + real deployed Cloud Functions. **Use this to finish + capture evidence.**

`slabs-queue-e2e-exdcz` is a throwaway project created for this suite — it is NOT production. The allowlist
(`e2e/lib/test-project.js`) HARD-ABORTS on production / `starlabs-test` / Watson / SalesCRM, so the harness
physically cannot touch anything real.

---

## 2. Current state (what's already true — don't redo)

- **194 tests / 22 files**, non-circular (drive real UI / assert real app+CF output or known seeded values).
- The 9 **variation** specs walk **all 72 distinct forward journeys** (`e2e/lib/forward-journeys.js`,
  data-driven, one test per journey) + bounded-loop (≤2) cases.
- **Studio** specs validated green in clean windows (studio-core, studio-session) modulo the `fixme`
  product findings. **selfmovable-gate 18/18**, **operator ~11–13/15**, **big-core/analytics** mostly green.
- **4 PRODUCT FINDINGS** (left as findings — see §6).
- **CI gate**: `.github/workflows/queue-e2e.yml` (emulator target; needs `CF_REPO_TOKEN`).
- **Audit**: `specs/audit/` (CSVs + `COVERAGE-AUDIT.md` + `e2e/scripts/{coverage-report,count-paths}.js`).
- **Isolation runner**: `e2e/scripts/run-isolated.sh` — runs each spec file as its OWN invocation so specs
  can't pollute each other on the shared seed. **It is SERIAL-only** (running it from many processes at once
  makes them reseed the same `run1` and collide — do not parallelize it).

---

## 3. Prerequisites for the cloud run (one-time)

1. **Auth** (Owner/Editor on `slabs-queue-e2e-exdcz`):
   ```bash
   gcloud auth application-default login
   firebase login
   ```
2. **Deploy the queue Cloud Functions to the cloud project** (the CF-side-effect tests — `cf-sideeffects`,
   `OP-09b`, studio assign/zoom — need the triggers running). The CF repo is the nested
   `starlabs-cloud-function/` on branch `test/queue-e2e-deploy`:
   ```bash
   cd starlabs-cloud-function/functions && npm ci && cd ..
   # set the 6 dummy Zoom secrets (functions/.secret.local already lists them) then:
   firebase deploy --only functions --project slabs-queue-e2e-exdcz
   ```
   If you CANNOT deploy CFs, run with `SKIP_CF=1` (below) — the ~6 CF-side-effect tests will `test.skip`
   with a printed reason rather than fail; everything else still runs + captures evidence.
3. **Composite indexes** (the board/queries need them on real Firestore):
   ```bash
   firebase deploy --only firestore:indexes --project slabs-queue-e2e-exdcz   # firestore.indexes.json
   ```
4. **Firestore rules** permit the test users to read/write the seeded collections (test-only open rules
   are in `firestore.rules` / `firebase.test.json`).
5. `cd e2e && npm ci && npx playwright install chromium`.

---

## 4. Add the screenshot-evidence config (do this once)

Create **`e2e/playwright.queue.evidence.config.ts`** — same as `playwright.queue.config.ts` (the cloud
config) but force evidence capture on EVERY test:
```ts
import base from './playwright.queue.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...base,
  use: { ...base.use, screenshot: 'on', trace: 'on', video: 'retain-on-failure' }, // a shot per test
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['junit', { outputFile: 'results.xml' }]],
});
```
Playwright then writes a screenshot per test into `test-results/` and embeds them in
`playwright-report/index.html` — that HTML report IS the screenshot-evidence artifact.

Add to **`e2e/package.json`** scripts:
```json
"seed:cloud":   "TEST_PROJECT=slabs-queue-e2e-exdcz node fixtures/seed-test-project.js --seed",
"report:cloud": "TARGET=cloud EVIDENCE=1 bash scripts/run-isolated.sh"
```
And teach **`e2e/scripts/run-isolated.sh`** to honor the cloud target + evidence config:
- when `TARGET=cloud`, set `CONFIG=playwright.queue.config.ts` (or, when `EVIDENCE=1`,
  `playwright.queue.evidence.config.ts`) and DROP the `EMU_REUSE*` env (those are emulator-only);
- it already runs each spec file separately, so each gets a fresh cloud globalSetup reseed.

---

## 5. Run it + finish the green-up (the loop)

```bash
cd e2e
# 1. seed the cloud project (idempotent; allowlist-guarded to slabs-queue-e2e-exdcz only)
npm run seed:cloud
# 2. run every spec isolated against REAL Firestore, capturing a screenshot per test
npm run report:cloud            # add SKIP_CF=1 if CFs are not deployed
# 3. open the evidence
npx playwright show-report
```

For each spec file that still has failures: open its trace/screenshot in the report, diagnose against the
REAL component (`src/app/queue system/**`, `src/app/big/**`) + the recon maps (`e2e/queue/recon/*.md`),
and fix the **test wiring** (selector / seed precondition / timing) — never the assertion. Re-run just that
file: `TARGET=cloud npx playwright test --config=playwright.queue.config.ts queue/<file>.spec.ts`.

Most remaining failures will be the SAME classes already solved on the emulator (read the round-1..3
commit messages `git log e2e/`): missing `dashboard` route grant, a seed precondition the screen needs,
the `participantsactivity`/`pairing` studio shapes, the variation-id namespace. The cloud seeder
(`seed-test-project.js`) shares `DRIVEN_ROUTES` + helpers with the emulator seeder, so most fixes already
applied carry over.

---

## 6. Product findings — keep as `test.fixme`, DO NOT patch `src/**`

These are REAL product bugs the suite caught. The operator chose to leave them documented, not patched.
Keep the `test.fixme` + a one-line reason; record any new ones the same way.
1. `dynamic-studio.component.html:50` — `mapActivity[studio['participantsactivity'][participant]]` no
   null-guard → `TypeError` aborts change detection → studio screen freezes. (`participantsactivity?.[...]`)
2. `arenastudioactivity.component.html:46/58` — `item['pairing'].join(',')` no null-guard → monitor renders
   0 cards. (`pairing?.join(',')`)
3. `/arenastudioactivity` has no role gate — an `eis`-only specialist isn't denied. (add developer/admin/ah guard)
4. `participant-assignment-board.component.ts:319` `getPendingList()` — `marathonMap[ref.id].pending++` no
   existence guard → fatal on a dangling marathonref.

---

## 7. Per-file checklist (22 files / 194 tests)

| File | Tests | Notes to verify on cloud |
|---|---|---|
| operator.spec.ts | 15 | OP-09b needs CFs (bulkReadyInvitation); OP-08 sets developer role precondition |
| studio-core.spec.ts | ~9 | needs `/queue-web` route grant seeded (already in DRIVEN_ROUTES) + studio cohort |
| studio-session.spec.ts | ~11 | SS-15b fixme (finding #3); needs CFs for assign/zoom side-effects |
| big-core.spec.ts | ~13 | needs `seedBigCoreWorld` (marathon + Form/Video assignments); BIG-00b participant scope |
| big-analytics.spec.ts | ~10 | close the progression dialog scrim before row actions |
| cross-db-lowerbound.spec.ts | 1 | needs the firestore-forms SS-07 fixture |
| cf-sideeffects.spec.ts | 2 | **needs CFs deployed** (touchpoint + queueposition) |
| authoring.spec.ts | 1 | queue-creation-v3 stepper round-trips queueadmin array |
| watch-videos.spec.ts | 1 | needs a Video-type big assignment seeded |
| selfmovable-gate.spec.ts | 18 | oracle parity + no-op self-move (mostly green) |
| loop-bound-selftest, oracle-selftest, actors-health | 2/4/5 | pure/smoke (green) |
| variations/*.spec.ts (9 files) | ~9 each = ~72+ | **walk all forward journeys**; need variation-id namespace + studio shapes |

---

## 8. When green: update the audit + ship

- `node e2e/scripts/coverage-report.js` (regenerate CSVs), update `specs/audit/COVERAGE-AUDIT.md` §1/§3 with
  the final **194/194** number + a link to the evidence report.
- Commit the evidence report (or upload it as a CI artifact) so engineering can audit the screenshots.
- The CI gate (`.github/workflows/queue-e2e.yml`) then keeps it green on every PR (emulator target once the
  crash chip lands; or add a scheduled cloud job using `report:cloud`).
```
```
ENV NOTE: never point `TEST_PROJECT` at anything but `slabs-queue-e2e-exdcz` — the allowlist aborts, but
don't test the guard against production. The cloud project is disposable; teardown a run with
`node fixtures/seed-test-project.js --teardown <testrunid>`.
