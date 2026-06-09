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
import { execFileSync } from 'child_process';
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
      journey, hops,
    });
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
export async function driveBoardHop(board: QueueBoardPage, cardId: string, hop: Hop): Promise<void> {
  await waitForCardOnStage(board, cardId, hop.from);
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

/** Drive `count` contiguous form self-moves for one participant via a single `flutter drive`. */
export function driveFlutterSelfRun(t: VariationTarget, count: number, label: string): void {
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
  execFileSync(FLUTTER_BIN, args, { cwd: FLUTTER_APP, stdio: 'inherit', timeout: 12 * 60_000, env: flutterEnv() });
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
