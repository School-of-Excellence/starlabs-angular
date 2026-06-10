// @ts-nocheck
/**
 * walk-lib.ts — shared helpers for the REAL-mobile participant walk (mobile-walk.spec.ts).
 *
 * This is the lyl-first-cycle.spec.ts walk machinery, generalized to ALL variations, with ONE
 * substitution: SELF hops are driven by REAL Flutter taps (a `flutter drive` of walk_test.dart on the
 * breakthroughs app), NOT participant-sim. OP/AUTO hops stay on the REAL Angular board. Every assertion
 * reads PRODUCT output (the token/log the app or board wrote) via the unchanged guards — anti-circular.
 */
import { Page, expect, TestInfo } from '@playwright/test';
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { QueueBoardPage } from '../pages/queue-board.page';

// CommonJS libs (the oracle + guards + distribution — identical sources the desktop suite uses).
const cfg = require('../../fixtures/sample-queue-config.json');
const { build, outEdgesForVariation } = require('../../lib/flow-model');
const { forwardJourneys } = require('../../lib/forward-journeys');
const { generatePlan } = require('../../lib/path-generator');
const sim = require('../../lib/participant-sim');
const {
  assertNoOrphan, assertEveryMoveLogged, assertNoStageSkipped,
  assertTerminalReached, assertCountConserved, assertLoopBound, observedTransitions,
} = require('../../lib/assertions');

export const MODEL = build(cfg);
export const TERMINAL = 'Completed';
export const TESTRUNID = process.env.TESTRUNID || 'run1';
const FLUTTER_APP = path.resolve(__dirname, '../../../breakthroughs-flutter');
// Stock Flutter 3.44 (the 2026-06-09 migration to Xcode-26.5-compatible toolchain). NOT the old
// hand-patched ~/flutter-sdks/flutter 3.29.3 — that gauntlet is retired.
const FLUTTER_BIN = process.env.FLUTTER_BIN || '/opt/homebrew/bin/flutter';
const E2E_BIN = path.join(os.homedir(), 'e2e-bin'); // holds the no-op `flutterfire` stub (crashlytics build phase)
const EVIDENCE_DIR = path.join(FLUTTER_APP, 'mobile-evidence');
// Blank-frame detection (L1): keep the screenshots a TRUSTWORTHY quick-scan — a silently blank/missing
// capture must not slip through a green test. A real capture is hundreds of KB and has high grayscale
// variance; a uniform/white/"loading" screen is tiny and ~0 stddev. ImageMagick gives the stddev; if it
// is absent the check degrades to size-only (still catches the classic ~4KB blank). Override via MAGICK_BIN.
const MAGICK = process.env.MAGICK_BIN || '/opt/homebrew/bin/magick';
const MIN_FRAME_BYTES = 10_000; // a real capture is >>10KB; a truncated/empty file is tiny
const MIN_FRAME_STDDEV = 0.01;  // normalized grayscale stddev; uniform/white ≈ 0, real frames > 0.1

/** The iOS-simulator stub overrides (mlkit + ffmpeg ship no arm64-sim binary). LOCAL/gitignored —
 *  device/prod/CI builds must NOT have this file (they use the real plugins). */
const PUBSPEC_OVERRIDES = `dependency_overrides:
  win32: ^5.0.0
  google_mlkit_face_detection:
    path: packages/sim_stubs/google_mlkit_face_detection
  ffmpeg_kit_flutter_new:
    path: packages/sim_stubs/ffmpeg_kit_flutter_new
`;

/** Env for flutter subprocesses: prepend ~/e2e-bin so the crashlytics build phase finds the stub. */
function flutterEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${E2E_BIN}:${process.env.PATH ?? ''}` };
}

/** One-time sim-build prereqs (stock 3.44): apply the stub overrides, clear the stale
 *  Generated.xcconfig (clean does NOT rewrite it; a stale EXCLUDED_ARCHS forces x86_64), pub get. */
export function ensureSimBuildPrereqs(): void {
  const overridesPath = path.join(FLUTTER_APP, 'pubspec_overrides.yaml');
  if (!fs.existsSync(overridesPath)) fs.writeFileSync(overridesPath, PUBSPEC_OVERRIDES);
  for (const f of ['ios/Flutter/Generated.xcconfig', '.flutter-plugins', '.flutter-plugins-dependencies']) {
    const p = path.join(FLUTTER_APP, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  execFileSync(FLUTTER_BIN, ['pub', 'get'], { cwd: FLUTTER_APP, stdio: 'inherit', timeout: 5 * 60_000, env: flutterEnv() });
}

export type HopKind = 'OP' | 'SELF' | 'AUTO';
export interface Hop { from: string; to: string; kind: HopKind; }

// ── oracle classification (the flow-config authority, NOT the backbone) ──────────────────────────
/** Classify a single legal FORWARD hop from→to (excludes loop/back edges); throws if illegal. */
export function classifyForwardHop(from: string, to: string, vid: string): Hop {
  const edges = outEdgesForVariation(MODEL, from, vid).filter((e: any) => e.to === to && !e.loop && !e.back);
  if (edges.length !== 1) {
    const legal = outEdgesForVariation(MODEL, from, vid).map((e: any) => `${e.to}[${e.type}]`);
    throw new Error(`[mobile-walk] forward hop "${from}"→"${to}" not a single legal scoped edge (matched ${edges.length}). Legal: ${JSON.stringify(legal)}`);
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/** The primary entry→Completed forward journey for a variation (longest reaching the terminal). */
export function primaryJourney(vid: string): string[] {
  const journeys: string[][] = forwardJourneys(cfg, vid);
  if (!journeys.length) return [];
  const toCompleted = journeys.filter((j) => j[j.length - 1] === TERMINAL);
  const pool = toCompleted.length ? toCompleted : journeys;
  return pool.slice().sort((a, b) => b.length - a.length)[0];
}

/** Variation metadata + the representative participant (first index in that variation's seed range). */
export interface VariationTarget {
  vid: string; name: string; firstStage: string; terminal: string;
  participantIndex: number; email: string; profileid: string; tokenId: string;
  journey: string[]; hops: Hop[];
  label: string;        // frame/evidence prefix — `vid-pIDX` (primary) or `vid-pIDX-jN` (all-paths)
  journeyIndex: number; // which forward journey of this variation (0 = primary)
  journeyCount: number; // total forward journeys for this variation
}

/** Build the per-variation targets (1 representative participant each) from the seed distribution. */
export function buildTargets(only?: string[]): VariationTarget[] {
  const plan = generatePlan(cfg, Number(process.env.TOTAL_PARTICIPANTS || 50));
  const targets: VariationTarget[] = [];
  let base = 0; // cumulative global participant index (planSeed assigns indices in this order)
  for (const v of plan.variations) {
    const idx = base; base += v.participants; // first participant of this variation
    if (only && only.length && !only.includes(v.id) && !only.includes(v.variationname)) continue;
    const journey = primaryJourney(v.id);
    const hops = journey.slice(0, -1).map((from, i) => classifyForwardHop(from, journey[i + 1], v.id));
    targets.push({
      vid: v.id, name: v.variationname,
      firstStage: journey[0] || v.backbone?.[0] || cfg.stages[0],
      terminal: journey[journey.length - 1] || (journey[0] ?? cfg.stages[0]),
      participantIndex: idx,
      email: `participant${idx}+${TESTRUNID}@example.com`,
      profileid: `${TESTRUNID}_profile_${idx}`,
      tokenId: `${TESTRUNID}_tok_${TESTRUNID}_profile_${idx}`,
      journey, hops, label: `${v.id}-p${idx}`, journeyIndex: 0, journeyCount: 1,
    });
  }
  return targets;
}

/** Build a target PER forward journey (the full 72 paths), assigning participants so EVERY path AND
 *  EVERY seeded participant is covered: walks = max(participants, journeys) per variation. Frames are
 *  namespaced by journey via `label` (vid-pIDX-jN). The spec uses these when ALL_PATHS=1. */
export function buildAllJourneyTargets(only?: string[]): VariationTarget[] {
  const plan = generatePlan(cfg, Number(process.env.TOTAL_PARTICIPANTS || 50));
  const targets: VariationTarget[] = [];
  let base = 0;
  for (const v of plan.variations) {
    const pStart = base; base += v.participants;
    if (only && only.length && !only.includes(v.id) && !only.includes(v.variationname)) continue;
    const journeys: string[][] = forwardJourneys(cfg, v.id);
    if (!journeys.length) continue;
    const walks = Math.max(v.participants, journeys.length); // cover all paths AND all participants
    for (let k = 0; k < walks; k++) {
      const jIdx = k % journeys.length;
      const journey = journeys[jIdx];
      const idx = pStart + (k % Math.max(1, v.participants));
      const hops = journey.slice(0, -1).map((from, i) => classifyForwardHop(from, journey[i + 1], v.id));
      targets.push({
        vid: v.id, name: `${v.variationname} · path ${jIdx + 1}/${journeys.length}`,
        firstStage: journey[0] || v.backbone?.[0] || cfg.stages[0],
        terminal: journey[journey.length - 1] || (journey[0] ?? cfg.stages[0]),
        participantIndex: idx,
        email: `participant${idx}+${TESTRUNID}@example.com`,
        profileid: `${TESTRUNID}_profile_${idx}`,
        tokenId: `${TESTRUNID}_tok_${TESTRUNID}_profile_${idx}`,
        journey, hops, label: `${v.id}-p${idx}-j${jIdx}`, journeyIndex: jIdx, journeyCount: journeys.length,
      });
    }
  }
  return targets;
}

// ── token preconditions (allowed setup; never an assertion target) ──────────────────────────────
export async function resetToken(tokenId: string, stage: string): Promise<void> {
  const db = sim.db();
  const existing = await db.collection('queue stage log').where('docid', '==', tokenId).get();
  const batch = db.batch();
  existing.docs.forEach((d: any) => batch.delete(d.ref));
  if (existing.size) await batch.commit();
  await db.collection('queue_token').doc(tokenId).set(
    { currentstage: stage, previousstage: null, status: 'queued', stagestatus: 'Yet to Start',
      liveassignmentid: null, studioid: null, delete: false, tokenstatus: 'Active' },
    { merge: true });
}

// ── board readiness + operator/auto hop (REAL board move + board-computed count-drift) ───────────
async function waitForCardOnStage(board: QueueBoardPage, cardId: string, stage: string): Promise<void> {
  await expect.poll(async () => board.revealTokenCard(cardId),
    { timeout: 25_000, message: `board never rendered card "${cardId}"` }).toBe(true);
  await expect.poll(async () => { try { await board.readColumnCount(stage); return true; } catch { return false; } },
    { timeout: 25_000, message: `board never rendered a column for "${stage}"` }).toBe(true);
}

async function resolveStageKeyForCount(board, stageName, before, after, expectDelta): Promise<string> {
  const candidates = await board.stageKeysForName(stageName);
  for (const key of candidates) {
    if ((Number(after[key] || 0) - Number(before[key] || 0)) === expectDelta) return key;
  }
  if (expectDelta > 0) for (const key of candidates) if (!(key in before) && Number(after[key] || 0) === expectDelta) return key;
  return board.resolveStageKeyPublic(stageName);
}

/** Drive ONE operator/auto hop through the REAL board, asserting the board's recomputed count-drift. */
export async function driveBoardHop(board: QueueBoardPage, cardId: string, hop: Hop, shot?: { label: string; seq: number }): Promise<void> {
  await waitForCardOnStage(board, cardId, hop.from);
  // IMAGING: the card is now guaranteed rendered at hop.from (waitForCardOnStage polled for it) —
  // capture it on the real board BEFORE the move, so every operator hop has a visible-card frame.
  if (shot) await captureBoardCard(board, cardId, shot.label, shot.seq, hop.from);
  const beforeSrc = await board.readColumnCount(hop.from);
  const beforeAll = await board.readAllColumnCounts();
  await board.moveToken(cardId, hop.to);
  await expect.poll(async () => board.readColumnCount(hop.from),
    { timeout: 25_000, message: `count-drift: "${hop.from}" did not drop after ${hop.from}→${hop.to}` }).toBe(beforeSrc - 1);
  const afterAll = await board.readAllColumnCounts();
  const srcKey = await resolveStageKeyForCount(board, hop.from, beforeAll, afterAll, -1);
  const dstKey = await resolveStageKeyForCount(board, hop.to, beforeAll, afterAll, +1);
  assertCountConserved(beforeAll, afterAll, { src: srcKey, dst: dstKey });
}

/** IMAGING: capture the participant's card on the REAL board at `stage`, into the evidence dir (so it
 *  is attached alongside the mobile frames). Best-effort — never throws into the walk. */
export async function captureBoardCard(board: QueueBoardPage, tokenSel: string, label: string, seq: number, stage: string): Promise<void> {
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const safe = `${label}-board-${String(seq).padStart(2, '0')}-at-${stage.replace(/[^A-Za-z0-9]+/g, '_')}.png`;
  try { await board.captureTokenCardShot(tokenSel, path.join(EVIDENCE_DIR, safe)); } catch { /* best-effort */ }
}

// ── the universal guards after every hop (read PRODUCT output) ───────────────────────────────────
export async function assertAfterHop(tokenId: string, vid: string, logged: number, minNonSelf: number): Promise<void> {
  await expect.poll(async () => (await observedTransitions(tokenId)).length,
    { timeout: 30_000, message: `EVERY-MOVE-LOGGED: rows for ${tokenId} did not reach ${logged}` }).toBe(logged);
  await assertNoOrphan(tokenId);
  await assertEveryMoveLogged(tokenId, logged, { minNonSelf });
  await assertNoStageSkipped(tokenId, MODEL, vid);
  await assertLoopBound(tokenId, 2);
}

// ── the REAL Flutter self-run: tap the form button(s) for a contiguous run of SELF hops ──────────
export function bootedSimUdid(): string {
  if (process.env.E2E_SIM_UDID) return process.env.E2E_SIM_UDID;
  const out = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf8' });
  const m = out.match(/\(([0-9A-Fa-f-]{36})\)\s*\(Booted\)/);
  if (!m) throw new Error('no booted iOS simulator found (xcrun simctl list devices booted)');
  return m[1];
}

// idb CLI (fb-idb) for tapping in-sim system dialogs that osascript/simctl can't reach. The Python
// 3.14 install is broken (asyncio), so pin the 3.9 one; override via IDB_BIN.
const IDB = process.env.IDB_BIN || path.join(os.homedir(), 'Library/Python/3.9/bin/idb');

/** Dismiss the iOS first-launch "…Would Like to Send You Notifications" prompt (rendered in-sim by
 *  SpringBoard) so the per-stage screenshots show the real queue card. Returns true once dismissed. */
function dismissIosNotificationPrompt(udid: string): boolean {
  try {
    const raw = execFileSync(IDB, ['ui', 'describe-all', '--udid', udid], { encoding: 'utf8', timeout: 15_000 });
    const els = JSON.parse(raw);
    const btn = els.find((e: any) => e.role === 'AXButton' &&
      ['Allow', "Don't Allow", 'Don’t Allow'].includes(e.AXLabel) && e.frame);
    if (!btn) return false;
    const cx = Math.round(btn.frame.x + btn.frame.width / 2);
    const cy = Math.round(btn.frame.y + btn.frame.height / 2);
    execFileSync(IDB, ['ui', 'tap', String(cx), String(cy), '--udid', udid], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch { return false; }
}

/** Drive `count` contiguous form self-moves for one participant via a single `flutter drive`, and
 *  capture a REAL per-stage mobile screenshot via `xcrun simctl io screenshot` (the OS-level screen)
 *  each time the robot reaches a stage. (iOS integration_test `binding.takeScreenshot` returns a BLANK
 *  image for this GPU/platform-view app, so we screenshot the simulator screen instead.) The robot
 *  prints `WALK[label] hop N: at "<stage>"` then pumps through dismiss+scroll before tapping, giving a
 *  window where the queue card (with the action button) is on screen — we shoot on that marker. */
/** Shared-project defense: the test project's `adsplaylist` (a null-`adsthumbnail` doc) crashes the
 *  home's HomeContent and erases the queue card (see setup-mobile-fixture). A CONCURRENT session can
 *  re-enable it mid-suite, so re-neutralize right before every app boot. Best-effort. */
export async function neutralizeAds(): Promise<void> {
  try {
    const db = sim.db();
    const ads = await db.collection('adsplaylist').where('available', '==', true).get();
    if (!ads.size) return;
    const b = db.batch();
    ads.docs.forEach((d: any) => b.update(d.ref, { available: false }));
    await b.commit();
  } catch { /* best-effort */ }
}

export async function driveFlutterSelfRun(t: VariationTarget, count: number, label: string): Promise<void> {
  await neutralizeAds(); // shared-project defense: the home ads section must not crash this boot
  const udid = bootedSimUdid();
  const args = [
    'drive',
    '--driver=test_driver/integration_test.dart',
    '--target=integration_test/walk_test.dart',
    '-d', udid,
    '--dart-define=QUEUE_E2E_TARGET=cloud',
    `--dart-define=E2E_EMAIL=${t.email}`,
    `--dart-define=E2E_TOKEN_ID=${t.tokenId}`,
    `--dart-define=E2E_SELF_HOPS=${count}`,
    `--dart-define=E2E_LABEL=${label}`,
  ];
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const logPath = path.join(os.tmpdir(), `flutterdrive-${label}.log`);
  const logFd = fs.openSync(logPath, 'w');
  const proc = spawn(FLUTTER_BIN, args, { cwd: FLUTTER_APP, env: flutterEnv(), stdio: ['ignore', logFd, logFd] });
  const seen = new Set<string>();
  let promptDismissed = false;
  await new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      // clear the iOS first-launch notification prompt (rendered in-sim) before any screenshot
      if (!promptDismissed) promptDismissed = dismissIosNotificationPrompt(udid);
      let log = '';
      try { log = fs.readFileSync(logPath, 'utf8'); } catch { return; }
      // Capture on each CAP marker the robot emits (queue card / open FillForm / advanced card /
      // parked terminal). The marker text is the full frame name (carries hop index + a|b|c tag + stage).
      for (const m of log.matchAll(/CAP marker: (.+)/g)) {
        const name = m[1].trim();
        if (seen.has(name)) continue;
        seen.add(name);
        const safe = `${name.replace(/[^A-Za-z0-9._-]+/g, '_')}.png`;
        try { execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', path.join(EVIDENCE_DIR, safe)], { stdio: 'ignore', timeout: 20_000 }); } catch { /* best-effort */ }
      }
    }, 700);
    const kill = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 12 * 60_000);
    proc.on('exit', (code) => {
      clearInterval(poll); clearTimeout(kill); try { fs.closeSync(logFd); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`flutter drive (${label}) exited ${code}. Tail:\n` +
        fs.readFileSync(logPath, 'utf8').split('\n').slice(-25).join('\n')));
    });
    proc.on('error', (e) => { clearInterval(poll); clearTimeout(kill); reject(e); });
  });
}

/** Attach all PNGs the Flutter run wrote to the Playwright report, then clear them for the next run. */
export async function attachMobileScreenshots(testInfo: TestInfo, prefix: string): Promise<void> {
  if (!fs.existsSync(EVIDENCE_DIR)) return;
  for (const f of fs.readdirSync(EVIDENCE_DIR).filter((x) => x.endsWith('.png')).sort()) {
    await testInfo.attach(`${prefix}/${f}`, { path: path.join(EVIDENCE_DIR, f), contentType: 'image/png' });
  }
}
export function clearMobileScreenshots(): void {
  if (!fs.existsSync(EVIDENCE_DIR)) return;
  for (const f of fs.readdirSync(EVIDENCE_DIR).filter((x) => x.endsWith('.png'))) fs.rmSync(path.join(EVIDENCE_DIR, f));
}

/** Normalized grayscale stddev of a PNG via ImageMagick (0 = uniform/blank). -1 if it can't be measured. */
function frameStddev(absPath: string): number {
  try {
    const out = execFileSync(MAGICK, [absPath, '-colorspace', 'Gray', '-format', '%[fx:standard_deviation]', 'info:'],
      { encoding: 'utf8', timeout: 15_000 }).trim();
    const v = Number.parseFloat(out);
    return Number.isFinite(v) ? v : -1;
  } catch { return -1; } // magick absent/errored → caller falls back to the size-only check
}

/** A frame is "blank" if it is tiny OR (measurably) near-uniform (a white / still-loading screen). */
function classifyFrame(absPath: string): { blank: boolean; bytes: number; stddev: number } {
  let bytes = 0;
  try { bytes = fs.statSync(absPath).size; } catch { /* missing */ }
  const stddev = frameStddev(absPath);
  const blank = bytes < MIN_FRAME_BYTES || (stddev >= 0 && stddev < MIN_FRAME_STDDEV);
  return { blank, bytes, stddev };
}

/**
 * Attach every captured frame to the report AND guard the imaging as a real signal (L1) — so a silently
 * blank or missing capture cannot slip through a green test (the quick-scan stays trustworthy). Policy
 * (operator directive): per test, badCount = missing + blank; 0 → clean (info annotation), 1-2 → report
 * WARNING (stays green, transient-capture cushion), >=3 → HARD FAIL. `expected` = frames the walk should
 * have produced (3 per self-move [card/form/after] + 1 per board hop; 1 for a 0-hop parked terminal).
 */
export async function attachAndAuditFrames(testInfo: TestInfo, prefix: string, expected: number): Promise<void> {
  const files = fs.existsSync(EVIDENCE_DIR)
    ? fs.readdirSync(EVIDENCE_DIR).filter((x) => x.endsWith('.png')).sort() : [];
  const blanks: string[] = [];
  for (const f of files) {
    const p = path.join(EVIDENCE_DIR, f);
    await testInfo.attach(`${prefix}/${f}`, { path: p, contentType: 'image/png' });
    const { blank, bytes, stddev } = classifyFrame(p);
    if (blank) blanks.push(`${f} (bytes=${bytes}, stddev=${stddev.toFixed(3)})`);
  }
  const missing = Math.max(0, expected - files.length);
  const badCount = missing + blanks.length;
  const summary = `imaging: ${files.length}/${expected} frames present, ${blanks.length} blank, ${missing} missing`;
  if (badCount === 0) {
    testInfo.annotations.push({ type: 'imaging', description: `${summary} — all present & non-blank` });
  } else if (badCount < 3) {
    testInfo.annotations.push({ type: 'warning', description: `IMAGING WARNING — ${summary}. blanks: [${blanks.join('; ')}]` });
  } else {
    throw new Error(`IMAGING FAIL — ${badCount} bad frames (>=3): ${summary}. blanks: [${blanks.join('; ')}]`);
  }
}
