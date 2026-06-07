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
# Bonus: because each invocation is short, it also dodges the long-run reaping that kills a single 30-min
# full run. Used both locally and by .github/workflows/queue-e2e.yml. Exit code = number of spec files
# that had >=1 failing test (0 = whole suite green), so it works as a CI gate.
#
# Usage (emulator + app already up — `npm run emu:up` and `npm run start:emulator`):
#   EMU_REUSE=1 EMU_REUSE_APP=1 bash scripts/run-isolated.sh
#   ONLY='queue/studio-core.spec.ts queue/studio-session.spec.ts' bash scripts/run-isolated.sh   # subset
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # -> e2e
export EMU_REUSE="${EMU_REUSE:-1}" EMU_REUSE_APP="${EMU_REUSE_APP:-1}" TESTRUNID="${TESTRUNID:-run1}"
CONFIG=playwright.queue.emulator.config.ts

SPECS="${ONLY:-$(find queue -name '*.spec.ts' | sort)}"
total_pass=0; total_fail=0; total_skip=0; bad_files=0; report=""

for f in $SPECS; do
  echo "──────── $f ────────"
  out="$(npx playwright test --config="$CONFIG" "$f" --reporter=line 2>&1)"
  echo "$out" | grep -E "[0-9]+ (passed|failed|skipped)|Error:" | tail -4
  p="$(printf '%s' "$out" | grep -oE '[0-9]+ passed'  | grep -oE '[0-9]+' | tail -1)"; p="${p:-0}"
  fl="$(printf '%s' "$out" | grep -oE '[0-9]+ failed'  | grep -oE '[0-9]+' | tail -1)"; fl="${fl:-0}"
  sk="$(printf '%s' "$out" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+' | tail -1)"; sk="${sk:-0}"
  total_pass=$((total_pass + p)); total_fail=$((total_fail + fl)); total_skip=$((total_skip + sk))
  if [ "$fl" -gt 0 ]; then bad_files=$((bad_files + 1)); report="${report}
  FAIL(${fl}) ${f}"; fi
done

echo ""
echo "════════ ISOLATED SUITE SUMMARY ════════"
echo "  tests: ${total_pass} passed · ${total_fail} failed · ${total_skip} skipped"
echo "  spec files with >=1 failure: ${bad_files}"
[ -n "$report" ] && printf '%s\n' "$report"
exit "$bad_files"
