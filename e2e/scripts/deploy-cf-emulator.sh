#!/usr/bin/env bash
#
# deploy-cf-emulator.sh — boot the Firebase emulator (firestore + auth + FUNCTIONS) with the StarLabs
# Cloud-Functions queue/big/participant triggers actually EXECUTING, so the CF-side-effect specs can pass.
#
# What it wires (see e2e/queue/recon/cf.md §6 "EMULATOR DEPLOY REQUIREMENTS"):
#   1. Materializes functions/.secret.local with the 6 dummy Zoom secrets (queue/big triggers defineSecret
#      them at module-eval; a v2 fn listing secrets won't boot in the emulator without resolvable values).
#   2. Points the functions emulator at functions/index.emulator.js (the FILTERED entry that re-exports ONLY
#      the asserted triggers and NEVER requires the ATC module — so the firestore-atc named DB is not needed).
#      firebase-tools resolves the entry from package.json "main", so we swap it for the run and RESTORE on exit.
#   3. Serves the default DB and (on demand) the firestore-forms named DB. firestore-atc is never touched.
#   4. Runs on a demo/test project id => service.js production=false => no prod credentials/bucket at load.
#
# Targets: EMULATOR ONLY. Never production/starlabs-test/Watson/SalesCRM.
#
# Usage:
#   e2e/scripts/deploy-cf-emulator.sh                 # foreground (Ctrl-C to stop). Default project demo-slabs-queue.
#   FIREBASE_PROJECT=demo-slabs-queue \
#   FB_EMU_EXTRA="--import .emu-state --export-on-exit .emu-state" \
#       e2e/scripts/deploy-cf-emulator.sh             # persist/restore emulator state across runs
#
# Env knobs:
#   FIREBASE_PROJECT   demo/test project id passed as --project (default: demo-slabs-queue). MUST NOT be prod.
#   CF_BRANCH          expected CF repo branch (default: test/queue-e2e-deploy). Checked, not forced.
#   SKIP_NODE_CHECK=1  skip the Node-22 engine check/nvm switch (CI images already pin Node 22).
#   FB_EMU_EXTRA       extra args appended to `firebase emulators:start` (e.g. --import/--export-on-exit).
#
set -euo pipefail

# --- resolve paths (absolute, independent of cwd) ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd)"   # .../starlabs-angular-queue-e2e
CF_DIR="$REPO_ROOT/starlabs-cloud-function/functions"
CONFIG="$REPO_ROOT/firebase.emulator.json"

FIREBASE_PROJECT="${FIREBASE_PROJECT:-demo-slabs-queue}"
CF_BRANCH="${CF_BRANCH:-test/queue-e2e-deploy}"

# --- safety: never a protected project ---------------------------------------------------------------------
case "$FIREBASE_PROJECT" in
  fir-sample-aae4a|watsonproduction-becde|salesleadcrm|starlabs-test|watson-test-19|salescrm-test-19)
    echo "🛑 HARD ABORT: FIREBASE_PROJECT='$FIREBASE_PROJECT' is a protected project. The emulator must use a demo id." >&2
    exit 2;;
esac

# --- sanity: filtered entry + config present ---------------------------------------------------------------
[ -f "$CF_DIR/index.emulator.js" ] || { echo "❌ missing $CF_DIR/index.emulator.js (the filtered emulator entry)" >&2; exit 1; }
[ -f "$CONFIG" ]                   || { echo "❌ missing $CONFIG" >&2; exit 1; }
[ -d "$CF_DIR/node_modules" ]      || echo "⚠️  $CF_DIR/node_modules missing — run (cd $CF_DIR && npm ci) first; the functions emulator needs deps installed."

# --- check the CF repo branch (warn, don't force — avoids surprising the operator) -------------------------
if command -v git >/dev/null 2>&1; then
  ACTUAL_BRANCH="$(git -C "$REPO_ROOT/starlabs-cloud-function" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  [ "$ACTUAL_BRANCH" = "$CF_BRANCH" ] || echo "⚠️  CF repo is on '$ACTUAL_BRANCH' (expected '$CF_BRANCH'). Triggers may differ."
fi

# --- Node 22 engine (functions/package.json engines.node == 22; the emulator refuses a mismatched runtime) -
if [ "${SKIP_NODE_CHECK:-0}" != "1" ]; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" != "22" ]; then
    if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
      # shellcheck disable=SC1090
      . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
      nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null 2>&1 || true
      NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    fi
    [ "$NODE_MAJOR" = "22" ] || echo "⚠️  Node $(node -v 2>/dev/null) != 22 (functions/package.json engines.node). The functions emulator may refuse the runtime; use Node 22 (nvm use 22) or set SKIP_NODE_CHECK=1 if your firebase-tools tolerates it."
  fi
fi

# --- 1) dummy Zoom secrets (idempotent; never real credentials) --------------------------------------------
SECRET_FILE="$CF_DIR/.secret.local"
if [ ! -f "$SECRET_FILE" ]; then
  cat > "$SECRET_FILE" <<'EOF'
# Dummy Zoom secrets for the functions emulator (firebase-tools reads .secret.local). NON-functional on purpose
# (cf.md §2: the CFs take their "Link Broken" fallback). NEVER real credentials. Gitignored (*.local).
ZOOM_ACCOUNTID=dummy
ZOOM_CLIENTID=dummy
ZOOM_CLIENTSECRET=dummy
ZOOM_SDK_CLIENTID=dummy
ZOOM_SDK_CLIENTSECRET=dummy
ZOOM_WEBHOOK_SECRET_TOKEN=dummy
EOF
  echo "✓ wrote $SECRET_FILE (6 dummy Zoom secrets)"
else
  echo "✓ $SECRET_FILE already present"
fi

# --- 2) repoint functions entry to the filtered emulator index, RESTORE on exit ----------------------------
PKG="$CF_DIR/package.json"
PKG_BACKUP="$(mktemp)"
cp "$PKG" "$PKG_BACKUP"
restore_pkg() { cp "$PKG_BACKUP" "$PKG"; rm -f "$PKG_BACKUP"; echo "↩︎ restored $PKG main"; }
trap restore_pkg EXIT INT TERM

# Use node (always present) to set "main" without depending on jq/sed quoting against folder-name spaces.
node -e '
  const fs=require("fs"), p=process.argv[1];
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  j.main="index.emulator.js";
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
' "$PKG"
echo "✓ functions entry -> index.emulator.js (will restore index.js on exit)"

# --- 2b) STABILITY: stop the functions emulator (port 5001) from OOMing / orphaning runtimes on a long run --
# The full ~194-test isolated run reseeds run1 between EVERY spec file (44 teardown+reseed bursts). Each burst
# is a `db.batch().commit()` that fires a cascade of CF triggers AT ONCE. In firebase-tools' default AUTO
# worker mode (functionsRuntimeWorker.js) every concurrent invocation that finds no idle worker spawns a fresh
# `functionsEmulatorRuntime` child, and after finishing it goes IDLE but is NEVER reaped (only a trigger
# *reload* calls pool.refresh()). So runtimes pile up across bursts until the box is under memory pressure and
# the hub/runtime dies — 5001 stops listening while firestore(8080)/auth(9099) stay up, leaving orphaned
# runtime children. Two reversible levers fix this at the source:
#
#   (1) NODE_OPTIONS heap ceiling. functionsEmulator.js spawns each runtime with {...process.env}, so a value
#       exported here is inherited by the emulator hub AND every runtime child. A bounded old-space keeps a
#       long run from exiting with "JavaScript heap out of memory". Default 4096 MB; override via FN_MAXOLDSPACE.
#
#   (2) --inspect-functions (BARE flag) => functions emulator runs in SEQUENTIAL worker mode
#       (functionsEmulator.js: debugMode -> one REUSED runtime per codebase, getKey() -> "~shared~"), instead
#       of a new-per-concurrent-invocation runtime that lingers IDLE. This caps runtime processes at ONE and is
#       the real memory fix. The flag MUST be bare: firebase-tools' parseInspectionPort treats a BOOLEAN true
#       (bare flag) as a dynamic inspector port, but a STRING ("--inspect-functions=true") goes through
#       Number("true")=NaN and ABORTS boot with "... is not a valid port". Bare => boolean true => dynamic port
#       (no fixed-9229 collision; the "multiple codebases on one port" guard only trips for a NUMERIC port, and
#       we have a single codebase anyway). The specs assert FINAL CF side-effect documents, never
#       concurrency/ordering, so serial execution changes no asserted output. Disable (back to AUTO/parallel)
#       with FB_EMU_FN_SEQUENTIAL=0.
FN_MAXOLDSPACE="${FN_MAXOLDSPACE:-4096}"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${FN_MAXOLDSPACE}"
echo "✓ NODE_OPTIONS=$NODE_OPTIONS  (heap ceiling for the emulator hub + every function runtime)"

FB_FN_FLAGS=""
if [ "${FB_EMU_FN_SEQUENTIAL:-1}" = "1" ]; then
  FB_FN_FLAGS="--inspect-functions"   # BARE flag (NOT =true) — see note above; dynamic inspector port
  echo "✓ functions emulator: SEQUENTIAL worker mode (--inspect-functions) — ONE reused runtime (set FB_EMU_FN_SEQUENTIAL=0 for AUTO/parallel)"
else
  echo "✓ functions emulator: AUTO worker mode (FB_EMU_FN_SEQUENTIAL=0)"
fi

# --- 2c) make Java findable. The Firestore/Auth emulators need a JRE; Homebrew's openjdk is keg-only, so a
# caller whose PATH lacks java (e.g. run-isolated.sh's auto-restart) would fail to boot 8080/9099. Prepend it
# here so the script is self-sufficient. No-op if java is already resolvable. -----------------------------------
if [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
  case ":$PATH:" in
    *":/opt/homebrew/opt/openjdk/bin:"*) : ;;
    *) export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; echo "✓ PATH += /opt/homebrew/opt/openjdk/bin (JRE for firestore/auth)";;
  esac
fi

# --- 3) boot the emulator (firestore + auth + functions). singleProjectMode is set in the config. ----------
# NOTE: not `exec` — we run in the foreground so the EXIT/INT/TERM trap restores package.json `main` when the
# emulator is stopped (Ctrl-C). The emulator is a long-running foreground process.
echo "🚀 firebase emulators:start --project $FIREBASE_PROJECT (firestore:8080 auth:9099 functions:5001 ui:4001)"
# shellcheck disable=SC2086
# FB_FN_FLAGS / FB_EMU_EXTRA are intentionally unquoted: they word-split into 0+ flags (no spaces in values).
firebase emulators:start \
  --project "$FIREBASE_PROJECT" \
  --config "$CONFIG" \
  --only firestore,auth,functions \
  ${FB_FN_FLAGS} \
  ${FB_EMU_EXTRA:-}
