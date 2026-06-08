#!/usr/bin/env bash
# run-isolated.sh — TEST ISOLATION for the shared single-worker emulator.
#
# The suite runs workers:1 against ONE shared emulator seed (run1), so specs can pollute each other's
# state (a check-in toggled off, a malformed pairing seeded by a variation spec, a token moved) — which
# makes full-suite results non-monotonic and is the root cause of "fixing one spec breaks another".
#
# This script removes that coupling WITHOUT touching any spec: it runs each spec FILE as its OWN
# Playwright invocation. Each invocation's globalSetup (queue/support/emulator-global-setup.ts) does a
# teardown+reseed of run1, so every file starts from a clean, identical seed and cannot be polluted by a
# file that ran before it. It reuses an already-running emulator + emulator-wired app (EMU_REUSE /
# EMU_REUSE_APP), so per file it is just "reseed + run that file" (no recompile).
#
# RESILIENCE (emulator target only — the functions-emulator crash, see specs/journals/2026-06-08-*): the
# functions emulator (port 5001) can die under a long run — 5001 stops listening while firestore(8080)/
# auth(9099) stay up and orphaned `functionsEmulatorRuntime` children linger. deploy-cf-emulator.sh now caps
# that at the source (SEQUENTIAL worker mode + heap ceiling), but REGARDLESS this runner self-heals: before
# each spec file it health-checks the emulator and, if unhealthy, reaps orphans + restarts it via
# deploy-cf-emulator.sh (with Homebrew openjdk on PATH so the Firestore/Auth JRE is found), waits for
# "All emulators ready", then continues. If the emulator dies DURING a file, that file is retried once on a
# fresh emulator so an infra crash is not miscounted as a test failure. The app on :4200 is owned by
# Playwright's webServer (reuseExistingServer) — started/reused per invocation — so this runner only manages
# the emulator. (None of this applies to TARGET=cloud, which has no local emulator.)
#
# SERIAL-ONLY (footgun fix): two copies of this script CANNOT run at once — they would both reseed the same
# run1 and tear down each other's seed (and fight over the single emulator on fixed ports). An atomic
# machine-wide lock (LOCK_DIR below) enforces this; a second invocation aborts with a clear message. A stale
# lock left by a dead PID is reclaimed automatically.
#
# Bonus: because each invocation is short, it also dodges the long-run reaping that kills a single 30-min
# full run. Used both locally and by .github/workflows/queue-e2e.yml. Exit code = number of spec files
# that had >=1 failing test (0 = whole suite green), so it works as a CI gate. (Exit 3 = could not acquire
# the serial lock; exit 4 = could not bring the emulator up.)
#
# Usage (emulator + app already up — `npm run emu:up` and `npm run start:emulator`):
#   EMU_REUSE=1 EMU_REUSE_APP=1 bash scripts/run-isolated.sh
#   ONLY='queue/studio-core.spec.ts queue/studio-session.spec.ts' bash scripts/run-isolated.sh   # subset
#   TARGET=cloud EVIDENCE=1 bash scripts/run-isolated.sh          # disposable cloud project + screenshots
#
# Two paths × three evidence levels (the npm scripts wrap these):
#   PATH:  TARGET=emulator (quick, hermetic)  |  TARGET=cloud (actual Firestore + CFs — the "proof" path)
#   LEVEL: A lean      EVIDENCE=0             screenshot only-on-failure, no merged report  → test:emu / test:cloud
#          B receipts  EVIDENCE=1 (DEFAULT)   screenshot EVERY test + on-first-retry trace  → report:emulator / report:cloud
#          C full      EVIDENCE=1 TRACE=full  screenshot EVERY test + FULL trace per test    → report:*:full
#   (B is the default report level — a shot per test, no per-action trace tax; C adds full traces: slower + large.)
# Env knobs (resilience, emulator target only):
#   EMU_AUTORESTART=0   disable the health-check/restart (fail fast if the emulator is down).
#   EMU_READY_TIMEOUT   seconds to wait for a restarted emulator to report ready (default 200).
#   FILE_RETRY=0        do not retry a file even if the emulator crashed during it.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # -> e2e
export TESTRUNID="${TESTRUNID:-run1}"
# Seed-OOM guard: globalSetup's teardown+seed subprocess (66 Auth users + hundreds of docs via
# firebase-admin) gets SIGKILL'd under the default Node heap on heavier files. Give children 4GB.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

# Target selection: emulator (default, CI) or the disposable CLOUD project slabs-queue-e2e-exdcz.
# Cloud uses the real Firestore + deployed Cloud Functions; EMU_REUSE* are emulator-only and must be
# dropped so the cloud config's webServer/globalSetup behave correctly. EVIDENCE=1 swaps in the
# screenshot-per-test config for the browsable HTML evidence report.
# CONFIG may be overridden in the environment (advanced — e.g. to drive the emulator suite against an app on a
# non-default port so it does not collide with a concurrent cloud run on :4200); the target still decides the
# resilience/EMU_REUSE behavior, so keep TARGET consistent with the config you pass.
if [ "${TARGET:-emulator}" = "cloud" ]; then
  IS_EMULATOR=0
  if [ "${EVIDENCE:-0}" = "1" ]; then
    CONFIG="${CONFIG:-playwright.queue.evidence.config.ts}"
  else
    CONFIG="${CONFIG:-playwright.queue.config.ts}"
  fi
  unset EMU_REUSE EMU_REUSE_APP
  echo "[run-isolated] TARGET=cloud  CONFIG=$CONFIG  TESTRUNID=$TESTRUNID  SKIP_CF=${SKIP_CF:-0}"
else
  IS_EMULATOR=1
  export EMU_REUSE="${EMU_REUSE:-1}" EMU_REUSE_APP="${EMU_REUSE_APP:-1}"
  if [ "${EVIDENCE:-0}" = "1" ]; then
    CONFIG="${CONFIG:-playwright.queue.emulator.evidence.config.ts}"
  else
    CONFIG="${CONFIG:-playwright.queue.emulator.config.ts}"
  fi
  echo "[run-isolated] TARGET=emulator  CONFIG=$CONFIG  TESTRUNID=$TESTRUNID  EVIDENCE=${EVIDENCE:-0}"
fi

# Evidence mode (EVIDENCE=1): each spec file emits a per-file Playwright BLOB report — which embeds a
# screenshot + trace for EVERY test (the *.evidence config sets use.screenshot:'on'/trace:'on') — and
# after the loop they merge into ONE browsable playwright-report. run-isolated runs each file as its own
# invocation, so a plain html reporter would OVERWRITE per file; blob+merge is the only way to get a
# single complete report. Lean runs (EVIDENCE=0) keep the fast line reporter + only-on-failure shots.
EVIDENCE="${EVIDENCE:-0}"
BLOBS_DIR="${BLOBS_DIR:-.report-blobs}"
if [ "$EVIDENCE" = "1" ]; then rm -rf "$BLOBS_DIR" blob-report playwright-report; mkdir -p "$BLOBS_DIR"; fi

FIREBASE_PROJECT="${FIREBASE_PROJECT:-demo-slabs-queue}"
DEPLOY_SCRIPT="scripts/deploy-cf-emulator.sh"
OPENJDK_BIN="/opt/homebrew/opt/openjdk/bin"
EMU_RESTART_LOG="$PWD/.emu-restart.log"     # gitignored; tail this if a restart fails
EMU_AUTORESTART="${EMU_AUTORESTART:-1}"
EMU_READY_TIMEOUT="${EMU_READY_TIMEOUT:-200}"
FILE_RETRY="${FILE_RETRY:-1}"
restarts=0; retried=0   # resilience counters (used by ensure_emulator_healthy — init before any call, incl. self-test)

# ──────────────── serial-only lock (footgun fix) ────────────────
# Atomic (mkdir is atomic on POSIX). GLOBAL (not per-target): two run-isolated.sh of the SAME target reseed
# the same run1 and tear each other's seed down; two of DIFFERENT targets (emulator vs cloud) still collide on
# the shared app port :4200 (each config's webServer serves a different build there). So only ONE may run at a
# time, period. A second invocation aborts; a stale lock from a dead PID is reclaimed.
LOCK_DIR="${TMPDIR:-/tmp}/queue-e2e-run-isolated.lock"
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$LOCK_DIR/pid"; return 0
  fi
  local holder; holder="$(cat "$LOCK_DIR/pid" 2>/dev/null || echo '')"
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    echo "🛑 another run-isolated.sh is already running (pid $holder)." >&2
    echo "   This suite is SERIAL-ONLY: two runs share the same run1 seed (and, on emulator, the single" >&2
    echo "   emulator) and would corrupt each other. Wait for it to finish, or kill pid $holder." >&2
    echo "   (lock: $LOCK_DIR)" >&2
    return 1
  fi
  echo "↻ reclaiming stale lock (holder pid ${holder:-?} is dead): $LOCK_DIR" >&2
  rm -rf "$LOCK_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then echo "$$" > "$LOCK_DIR/pid"; return 0; fi
  echo "🛑 could not acquire lock $LOCK_DIR" >&2; return 1
}
acquire_lock || exit 3
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

# ──────────────── emulator health / restart helpers (no-op on cloud) ────────────────
port_up() { lsof -ti tcp:"$1" >/dev/null 2>&1; }
# Healthy == the three ports the specs depend on are all listening (functions is the one that dies).
emulator_healthy() { port_up 8080 && port_up 9099 && port_up 5001; }

emu_state() {
  printf 'functions:5001=%s firestore:8080=%s auth:9099=%s' \
    "$(port_up 5001 && echo up || echo DOWN)" \
    "$(port_up 8080 && echo up || echo DOWN)" \
    "$(port_up 9099 && echo up || echo DOWN)"
}

kill_emulator() {
  # Reap orphaned function runtimes + the emulator hub/java + any prior backgrounded deploy script. These
  # patterns never match this runner ("run-isolated.sh") nor the app ("ng serve"), so they are safe.
  pkill -f functionsEmulatorRuntime          2>/dev/null || true
  pkill -f "deploy-cf-emulator.sh"           2>/dev/null || true
  pkill -f "emulators:start"                 2>/dev/null || true
  pkill -f "cloud-firestore-emulator"        2>/dev/null || true
  # Free emulator ports (NOT 4200 — the app is Playwright's). 4400/4500/9150 are hub/logging/eventarc.
  local p pids
  for p in 5001 8080 9099 4001 4400 4500 9150; do
    pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"; [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  sleep 1
  pkill -9 -f functionsEmulatorRuntime 2>/dev/null || true
  for p in 5001 8080 9099 4001; do
    pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"; [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
  # Wait (up to ~10s) for the load-bearing ports to actually free so the relaunch can bind them.
  local i
  for i in $(seq 1 20); do
    port_up 8080 || port_up 9099 || port_up 5001 || break
    sleep 0.5
  done
}

# Boot the emulator via deploy-cf-emulator.sh in the background with Java on PATH; wait until it reports
# "All emulators ready" (and the three ports are up). Returns non-zero on timeout / early exit.
start_emulator() {
  : > "$EMU_RESTART_LOG"
  echo "   ↻ starting emulator via $DEPLOY_SCRIPT (project=$FIREBASE_PROJECT, log: $EMU_RESTART_LOG)"
  PATH="$OPENJDK_BIN:$PATH" FIREBASE_PROJECT="$FIREBASE_PROJECT" SKIP_NODE_CHECK="${SKIP_NODE_CHECK:-1}" \
    nohup bash "$DEPLOY_SCRIPT" >>"$EMU_RESTART_LOG" 2>&1 &
  local emu_pid=$!
  local deadline=$(( SECONDS + EMU_READY_TIMEOUT ))
  while :; do
    if grep -q "All emulators ready" "$EMU_RESTART_LOG" 2>/dev/null && emulator_healthy; then
      sleep 3   # small grace so trigger discovery finishes before the next file's reseed fires CFs
      echo "   ✓ emulator healthy ($(emu_state))"
      return 0
    fi
    if ! kill -0 "$emu_pid" 2>/dev/null; then
      echo "   ✗ emulator process exited early — last lines of $EMU_RESTART_LOG:" >&2
      tail -n 15 "$EMU_RESTART_LOG" >&2 || true
      return 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "   ✗ emulator not ready within ${EMU_READY_TIMEOUT}s ($(emu_state)) — last lines of $EMU_RESTART_LOG:" >&2
      tail -n 15 "$EMU_RESTART_LOG" >&2 || true
      return 1
    fi
    sleep 2
  done
}

# Guarantee a healthy emulator before running a file. Boots one if none is up; restarts a half-dead one.
# No-op on cloud (no local emulator).
ensure_emulator_healthy() {
  [ "$IS_EMULATOR" = "1" ] || return 0
  emulator_healthy && return 0
  [ "$EMU_AUTORESTART" = "1" ] || { echo "🛑 emulator unhealthy ($(emu_state)) and EMU_AUTORESTART=0" >&2; return 1; }
  echo "⚠️  emulator unhealthy ($(emu_state)) — reaping orphans + restarting"
  restarts=$(( restarts + 1 ))
  kill_emulator
  start_emulator
}

# ──────────────── self-test hook: exercise the lock + health-check/restart with NO spec / NO app (:4200) ──
# Lets CI / a maintainer verify the resilience path in isolation: kill the functions emulator (or all of it),
# then `SELFTEST_HEALTH=1 bash scripts/run-isolated.sh` should detect the unhealthy emulator and restart it.
if [ "${SELFTEST_HEALTH:-0}" = "1" ]; then
  echo "[selftest] target=${TARGET:-emulator} pre-state: $(emu_state)"
  if ensure_emulator_healthy; then echo "[selftest] ensure_emulator_healthy OK — post-state: $(emu_state)"; exit 0
  else echo "[selftest] ensure_emulator_healthy FAILED — $(emu_state)"; exit 4; fi
fi

# ──────────────── run one spec file (sets globals: p / fl / sk) ────────────────
run_file() {
  local f="$1" out base z
  if [ "$EVIDENCE" = "1" ]; then
    # blob = the evidence artifact (a screenshot + trace for every test); line = the tally we parse below.
    rm -rf blob-report
    out="$(npx playwright test --config="$CONFIG" "$f" --reporter=blob,line 2>&1)"
    base="$(echo "$f" | tr '/' '_')"
    if [ -f blob-report/report.zip ]; then mv blob-report/report.zip "$BLOBS_DIR/$base.zip"
    else z="$(ls blob-report/*.zip 2>/dev/null | head -1)"; [ -n "$z" ] && mv "$z" "$BLOBS_DIR/$base.zip"; fi
  else
    out="$(npx playwright test --config="$CONFIG" "$f" --reporter=line 2>&1)"
  fi
  echo "$out" | grep -E "[0-9]+ (passed|failed|skipped)|Error:" | tail -4
  p="$(printf '%s' "$out"  | grep -oE '[0-9]+ passed'  | grep -oE '[0-9]+' | tail -1)"; p="${p:-0}"
  fl="$(printf '%s' "$out" | grep -oE '[0-9]+ failed'  | grep -oE '[0-9]+' | tail -1)"; fl="${fl:-0}"
  sk="$(printf '%s' "$out" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+' | tail -1)"; sk="${sk:-0}"
}

# ──────────────── main loop ────────────────
SPECS="${ONLY:-$(find queue -name '*.spec.ts' | sort)}"
total_pass=0; total_fail=0; total_skip=0; bad_files=0; report=""

# Ensure a healthy emulator before the first file (boots one if the box is cold; no-op on cloud).
if ! ensure_emulator_healthy; then
  echo "🛑 could not bring the emulator up — aborting (see $EMU_RESTART_LOG)." >&2
  exit 4
fi

for f in $SPECS; do
  echo "──────── $f ────────"
  ensure_emulator_healthy || { echo "🛑 emulator down and unrecoverable before $f — aborting." >&2; exit 4; }

  run_file "$f"

  # If the file had failures AND the functions emulator died during it, that is an INFRA crash, not a test
  # failure: restart on a fresh emulator and retry the file once before counting it.
  if [ "$IS_EMULATOR" = "1" ] && [ "$fl" -gt 0 ] && [ "$FILE_RETRY" = "1" ] && ! emulator_healthy; then
    echo "   ↻ emulator died during $f ($(emu_state)) — restarting and retrying this file once"
    retried=$(( retried + 1 ))
    if ensure_emulator_healthy; then run_file "$f"; fi
  fi

  total_pass=$((total_pass + p)); total_fail=$((total_fail + fl)); total_skip=$((total_skip + sk))
  if [ "$fl" -gt 0 ]; then bad_files=$((bad_files + 1)); report="${report}
  FAIL(${fl}) ${f}"; fi
done

echo ""
echo "════════ ISOLATED SUITE SUMMARY ════════"
echo "  tests: ${total_pass} passed · ${total_fail} failed · ${total_skip} skipped"
echo "  spec files with >=1 failure: ${bad_files}"
[ "$IS_EMULATOR" = "1" ] && echo "  emulator restarts: ${restarts} · files retried after a crash: ${retried}"
[ -n "$report" ] && printf '%s\n' "$report"

# Evidence mode: merge the per-file blob reports into ONE browsable report (screenshot + trace per test).
if [ "$EVIDENCE" = "1" ]; then
  shards="$(ls "$BLOBS_DIR"/*.zip 2>/dev/null | wc -l | tr -d ' ')"
  echo ""
  echo "  merging ${shards} blob report(s) → playwright-report (a screenshot + trace for EVERY test) ..."
  npx playwright merge-reports --reporter=html "$BLOBS_DIR" 2>&1 | tail -2
  echo "  📸 evidence report → e2e/playwright-report/index.html   (open: npx playwright show-report)"
fi
exit "$bad_files"
