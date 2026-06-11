#!/usr/bin/env node
/**
 * run-flutter-test.cjs — the Phase-3 Flutter e2e driver (generalized from e2e/queue/mobile/walk-lib.ts
 * driveFlutterSelfRun). Builds (once) + drives ONE integration_test on the booted iOS simulator and
 * captures a REAL per-step OS screenshot via `xcrun simctl io screenshot` on each `CAP marker:` the
 * robot prints (iOS integration_test binding.takeScreenshot is BLANK for this GPU/platform-view app).
 *
 * Env:
 *   TEST_TARGET   integration_test/<file>.dart   (required)
 *   E2E_EMAIL     seeded participant email       (required)
 *   E2E_LABEL     frame/evidence prefix          (default: derived from target)
 *   E2E_DEFINES   extra "--dart-define=K=V" pairs, comma-separated (optional)
 *   E2E_EVIDENCE  evidence subdir under breakthroughs-flutter/mobile-evidence (default: E2E_LABEL)
 *   SKIP_PUBGET=1 skip the prereq pub-get (faster re-runs once built)
 *
 * Exit 0 only if `flutter drive` exits 0 (the Dart test's expect()s passed). Prints the screenshot count.
 */
'use strict';
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FLUTTER_APP = path.resolve(__dirname, '../../breakthroughs-flutter');
const FLUTTER_BIN = process.env.FLUTTER_BIN || '/opt/homebrew/bin/flutter';
const E2E_BIN = path.join(os.homedir(), 'e2e-bin');           // no-op flutterfire stub (crashlytics phase)
const IDB = process.env.IDB_BIN || path.join(os.homedir(), 'Library/Python/3.9/bin/idb');
const EVIDENCE_ROOT = path.join(FLUTTER_APP, 'mobile-evidence');

const TARGET = process.env.TEST_TARGET;
const EMAIL = process.env.E2E_EMAIL;
const LABEL = process.env.E2E_LABEL || (TARGET ? path.basename(TARGET, '.dart') : 'run');
const EVIDENCE_DIR = path.join(EVIDENCE_ROOT, process.env.E2E_EVIDENCE || LABEL);
if (!TARGET || !EMAIL) { console.error('TEST_TARGET and E2E_EMAIL are required'); process.exit(2); }

const PUBSPEC_OVERRIDES = `dependency_overrides:
  win32: ^5.0.0
  google_mlkit_face_detection:
    path: packages/sim_stubs/google_mlkit_face_detection
  ffmpeg_kit_flutter_new:
    path: packages/sim_stubs/ffmpeg_kit_flutter_new
`;
const flutterEnv = () => ({ ...process.env, PATH: `${E2E_BIN}:${process.env.PATH ?? ''}` });

function ensurePrereqs() {
  const overrides = path.join(FLUTTER_APP, 'pubspec_overrides.yaml');
  if (!fs.existsSync(overrides)) fs.writeFileSync(overrides, PUBSPEC_OVERRIDES);
  // SKIP_PUBGET=1 → fast incremental re-run (the project is already built): skip the xcconfig/plugins
  // clear + pub get so only the changed --target recompiles. First build (no SKIP_PUBGET) clears the
  // stale Generated.xcconfig (a stale EXCLUDED_ARCHS forces x86_64; clean does NOT rewrite it) + pub get.
  if (process.env.SKIP_PUBGET !== '1') {
    for (const f of ['ios/Flutter/Generated.xcconfig', '.flutter-plugins', '.flutter-plugins-dependencies']) {
      const p = path.join(FLUTTER_APP, f);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
    execFileSync(FLUTTER_BIN, ['pub', 'get'], { cwd: FLUTTER_APP, stdio: 'inherit', timeout: 5 * 60_000, env: flutterEnv() });
  }
}

function bootedUdid() {
  if (process.env.E2E_SIM_UDID) return process.env.E2E_SIM_UDID;
  const out = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf8' });
  const m = out.match(/\(([0-9A-Fa-f-]{36})\)\s*\(Booted\)/);
  if (!m) throw new Error('no booted iOS simulator (xcrun simctl list devices booted)');
  return m[1];
}

function dismissIosNotificationPrompt(udid) {
  try {
    const raw = execFileSync(IDB, ['ui', 'describe-all', '--udid', udid], { encoding: 'utf8', timeout: 15_000 });
    const els = JSON.parse(raw);
    const btn = els.find((e) => e.role === 'AXButton' && ['Allow', "Don't Allow", 'Don’t Allow'].includes(e.AXLabel) && e.frame);
    if (!btn) return false;
    const cx = Math.round(btn.frame.x + btn.frame.width / 2), cy = Math.round(btn.frame.y + btn.frame.height / 2);
    execFileSync(IDB, ['ui', 'tap', String(cx), String(cy), '--udid', udid], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch { return false; }
}

const APP_BUNDLE_ID = process.env.APP_BUNDLE_ID || 'com.app.launchyourlegacy';

async function main() {
  ensurePrereqs();
  const udid = bootedUdid();
  // Clean sim state: terminate any stale app instance (e.g. a previous/killed run left it running) so
  // flutter drive launches FRESH and the vmservice connects to THIS run's isolate, not a zombie one.
  try { execFileSync('xcrun', ['simctl', 'terminate', udid, APP_BUNDLE_ID], { stdio: 'ignore', timeout: 15_000 }); } catch { /* not running — fine */ }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  // clear prior frames for this label
  for (const f of fs.readdirSync(EVIDENCE_DIR).filter((x) => x.endsWith('.png'))) fs.rmSync(path.join(EVIDENCE_DIR, f));

  const defines = ['--dart-define=QUEUE_E2E_TARGET=cloud', `--dart-define=E2E_EMAIL=${EMAIL}`, `--dart-define=E2E_LABEL=${LABEL}`];
  if (process.env.E2E_DEFINES) for (const d of process.env.E2E_DEFINES.split(',')) if (d.trim()) defines.push(`--dart-define=${d.trim()}`);
  const args = ['drive', '--driver=test_driver/integration_test.dart', `--target=${TARGET}`, '-d', udid, ...defines];

  const logPath = path.join(os.tmpdir(), `flutterdrive-${LABEL}.log`);
  const logFd = fs.openSync(logPath, 'w');
  console.log(`[run-flutter-test] ${LABEL} → ${TARGET} as ${EMAIL} on ${udid}`);
  const proc = spawn(FLUTTER_BIN, args, { cwd: FLUTTER_APP, env: flutterEnv(), stdio: ['ignore', logFd, logFd] });

  const seen = new Set();
  let promptDismissed = false, shots = 0;
  await new Promise((resolve, reject) => {
    const poll = setInterval(() => {
      if (!promptDismissed) promptDismissed = dismissIosNotificationPrompt(udid);
      let log = '';
      try { log = fs.readFileSync(logPath, 'utf8'); } catch { return; }
      for (const m of log.matchAll(/CAP marker: (.+)/g)) {
        const name = m[1].trim();
        if (seen.has(name)) continue;
        seen.add(name);
        const safe = `${name.replace(/[^A-Za-z0-9._-]+/g, '_')}.png`;
        try { execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', path.join(EVIDENCE_DIR, safe)], { stdio: 'ignore', timeout: 20_000 }); shots++; } catch {}
      }
    }, 700);
    const kill = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 15 * 60_000);
    proc.on('exit', (code) => {
      clearInterval(poll); clearTimeout(kill); try { fs.closeSync(logFd); } catch {}
      const tail = fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n');
      if (code === 0) { console.log(`[run-flutter-test] ✓ ${LABEL} PASSED · ${shots} screenshots → ${EVIDENCE_DIR}`); resolve(); }
      else { console.error(`[run-flutter-test] ✗ ${LABEL} exited ${code}. Tail:\n${tail}`); reject(new Error(`flutter drive ${LABEL} exited ${code}`)); }
    });
    proc.on('error', (e) => { clearInterval(poll); clearTimeout(kill); reject(e); });
  });
  // print the captured frames + sizes (quick blank-frame eyeball)
  for (const f of fs.readdirSync(EVIDENCE_DIR).filter((x) => x.endsWith('.png')).sort()) {
    console.log(`   frame ${f} (${fs.statSync(path.join(EVIDENCE_DIR, f)).size} bytes)`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
