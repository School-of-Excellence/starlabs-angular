# Journal — Fix the functions-emulator crash that kills long Queue-Manager e2e runs

> Branch `test/queue-e2e`, worktree `/Users/antano/solarcode/ah/starlabs-angular-queue-e2e`.
> Companion to the suite journal `2026-06-08-complete-all-tests-cloud-evidence.md` (which deferred this to
> "a separate chip"). This is that chip.

## The problem

Under a full ~194-test isolated run (`e2e/scripts/run-isolated.sh`, 22 spec files), the **Firebase functions
emulator (port 5001) crashed** ~4×: 5001 stopped listening while firestore(8080)/auth(9099) stayed up, leaving
orphaned `functionsEmulatorRuntime` node children. Restarting needs Java on PATH
(`/opt/homebrew/opt/openjdk/bin` — keg-only Homebrew openjdk; the Firestore/Auth emulators need a JRE).

## Root cause (read from firebase-tools 15.19.1 source)

`functionsRuntimeWorker.js` runs the worker pool in **AUTO** mode by default. In AUTO:
- every concurrent trigger invocation that finds no IDLE worker spawns a **new** `functionsEmulatorRuntime`
  child (`functionsEmulator.js:handleHttpsTrigger` → `startRuntime` → `pool.addWorker`), and
- after a request finishes the worker goes **IDLE but is NEVER reaped** — only a trigger *reload*
  (`pool.refresh()`) kills idle workers, and a plain reseed does not reload triggers.

The isolated runner does a `db.batch().commit()` teardown+reseed of run1 **between every spec file** (44 bursts
over a full run — `seed-emulator.js:195`). A batch commit fires a cascade of CF trigger events delivered
concurrently, so each burst spawns extra runtimes that then linger. Runtime count + RAM climb monotonically
across bursts until the hub/runtime exits ("JavaScript heap out of memory") → the observed 5001 death + orphans.

**Reproduced (AUTO control, reseed-only, 30 cycles):** runtimes 1→2→3, runtime RSS 171→341→513MB — a clean
monotonic climb. The real suite adds app-driven CF cascades on top, which is why it reached 5+ orphans and died.

## The fix (3 parts — no `src/**`, no assertion weakened)

1. **`e2e/scripts/deploy-cf-emulator.sh` — stop the leak at the source (reversible knobs):**
   - `--inspect-functions` (BARE flag) puts the functions emulator in **SEQUENTIAL** worker mode
     (`functionsEmulator.js`: `debugMode` ⇒ one REUSED runtime per codebase, `getKey()` → `~shared~`). Caps
     runtimes at **one**. The flag MUST be bare — `--inspect-functions=true` passes the *string* `"true"`,
     which `parseInspectionPort` runs through `Number("true")=NaN` and **aborts boot**; bare ⇒ boolean `true`
     ⇒ dynamic inspector port (no 9229 collision). Toggle off with `FB_EMU_FN_SEQUENTIAL=0`.
   - `NODE_OPTIONS=--max-old-space-size=4096` (override via `FN_MAXOLDSPACE`) — inherited by the hub AND every
     runtime (`functionsEmulator.js` spawns runtimes with `{...process.env}`), a bounded heap ceiling.
   - Prepend `/opt/homebrew/opt/openjdk/bin` to PATH if present, so the script boots a JRE-needing emulator on
     its own (and the runner's auto-restart inherits it).
   - The specs assert **final CF side-effect documents**, never concurrency/ordering, so serial execution
     changes no asserted output.

2. **`e2e/scripts/run-isolated.sh` — self-heal regardless (the guarantee):**
   - Before each spec file, `ensure_emulator_healthy` checks 8080/9099/5001. If unhealthy it reaps orphaned
     `functionsEmulatorRuntime` children + the hub/java, frees the ports, and restarts the emulator via
     `deploy-cf-emulator.sh` with openjdk on PATH, waiting for "All emulators ready". Also boots a cold box.
   - If the emulator dies **during** a file, that file is retried once on a fresh emulator (infra crash ≠ test
     failure). Knobs: `EMU_AUTORESTART`, `EMU_READY_TIMEOUT`, `FILE_RETRY`. Self-test hook:
     `SELFTEST_HEALTH=1 bash scripts/run-isolated.sh` exercises detect+restart with no spec/app.

3. **`e2e/scripts/run-isolated.sh` — serial-only lock (footgun fix):**
   - A second `run-isolated.sh` reseeds the same run1 and tears down the first's seed (same target) or
     collides on the shared app port :4200 (different target). An atomic `mkdir` lock
     (`$TMPDIR/queue-e2e-run-isolated.lock`) makes it **global** — one run at a time, period; a second aborts
     (exit 3); a stale lock from a dead PID is reclaimed.

## Evidence

- **SEQUENTIAL stress (the fix):** 44 back-to-back teardown+reseed cycles (= a full run's burst count, harsher
  — no think-time): 5001 up every cycle, **peak runtimes = 1**, hub RSS flat ~240MB, runtime RSS flat ~138MB.
  `died=0`.
- **AUTO control (counterfactual):** see root-cause above — monotonic climb, the pre-fix behavior.
- **Resilience:** smoke booted the emulator from fully-dead via the runner; the self-test reproduced the exact
  crash signature (5001+9099 DOWN, 8080 orphaned java) and the runner detected → reaped → restarted to all-up
  SEQUENTIAL. Lock: live holder → exit 3; dead holder → reclaimed.
- **FULL RUN TO COMPLETION (the acceptance check):** `EMU_REUSE=1 EMU_REUSE_APP=1 bash scripts/run-isolated.sh`
  on a quiet box, emulator app on :4200 — **22/22 files, 14:09→14:39 (~30 min, the exact window that killed it
  4× before), `emulator restarts: 0`, runtimes never exceeded 1, emulator still up at the end.** The functions
  emulator did NOT die; the resilient-restart net never had to fire. Tests: 183 passed · 5 failed · 6 skipped
  (skips = the documented `fixme` product findings). None of the 5 failures is a crash — two classes:
  (a) `cross-db-lowerbound` + `studio-core` forms-widget read the `firestore-forms` named DB as 0 even though
  the seed wrote 2 docs → app-side named-DB wiring, unrelated to this change; (b) `cf-sideeffects` ×2 +
  `operator` OP-09b assert a CF side-effect doc within a 30s poll and didn't see it → possibly SEQUENTIAL
  serializing the test's trigger behind the globalSetup reseed-drain (verify with FB_EMU_FN_SEQUENTIAL=0 if it
  matters; cloud — real parallel CFs — passes all 5). The emulator-target suite was never expected fully green
  locally (cloud is the green path, 188/194); the crash, not the green-up, was the mandate here.

## Surprises / gotchas

- **System Node is 26** (no nvm/brew node@22 on this box), so the deploy script's Node-22 check is a no-op and
  the runtimes run under Node 26. Stable in testing, but if instability recurs, pinning Node 22 for the
  emulator is the next lever.
- **The app on :4200 was the CLOUD build**, not the emulator build (`serve -s ../dist/...browser` ⇒
  `slabs-queue-e2e-exdcz`, no `demo-slabs-queue`). With `EMU_REUSE_APP=1` the emulator suite reused it and
  login timed out (cloud auth has no emulator test users) — the exact footgun the emulator config warns about.
  Build the emulator app with `ng build --configuration emulator` and serve THAT. With the emulator app,
  actors-health goes 2/5 → **5/5**.
- A **concurrent cloud run** (`report:cloud`) was holding :4200 during this work, so the full-run verification
  was done on an isolated **:4300** (emulator build via `--output-path dist-emulator`, throwaway config) to
  avoid disrupting it. emulator + cloud-Firestore are otherwise independent.

## Pending / next

- The standard local workflow still needs the **emulator app on :4200** (`npm run start:emulator`, or serve an
  `ng build --configuration emulator` dist). The cloud `report:cloud` path and the emulator `run-isolated`
  path cannot run at the same time (shared :4200) — the global lock + this note enforce/​document that.
- CI (`.github/workflows/queue-e2e.yml`) should pick up the same knobs (it already calls `run-isolated.sh`).
