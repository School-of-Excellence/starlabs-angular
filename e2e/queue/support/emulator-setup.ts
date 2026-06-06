// @ts-nocheck
/**
 * emulator-setup.ts — boot / attach-to / seed the Firebase emulator (firestore + auth + FUNCTIONS) so the
 * Queue Manager suite can run HERMETICALLY (CI-gateable) with the real Cloud-Function queue triggers
 * EXECUTING. This is the emulator counterpart of the cloud path's global-setup.ts.
 *
 * The emulator is booted by e2e/scripts/deploy-cf-emulator.sh (which materializes the 6 dummy Zoom secrets,
 * repoints the functions entry to functions/index.emulator.js so the ATC named DB is never required, and runs
 * `firebase emulators:start --only firestore,auth,functions`). The functions emulator runs onQueueStageChange,
 * studioZoomLink(Deactivate), invite/bulk/invitationAccepted, biginvitationAccepted, position/activity-log,
 * createBigParticipantAssignment, + the §B upstream CFs — see e2e/queue/recon/cf.md.
 *
 * Ports (firebase.emulator.json): firestore 8080, auth 9099, functions 5001, UI 4001.
 *
 * Env knobs (resolved here, read by the playwright config + the seeder child process):
 *   EMU_REUSE=1        attach to an already-running emulator instead of spawning one (local dev: run
 *                      `npm run emu:up` in one terminal, then tests reuse it). Default off in CI.
 *   FIREBASE_PROJECT   demo/test project id (default demo-slabs-queue — MUST match environment.emulator.ts).
 *   FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST   overridable hosts (default localhost:8080/9099).
 *   SKIP_SEED=1        skip seeding (use existing emulator data).
 *   EMU_BOOT_TIMEOUT_MS  readiness timeout (default 120000).
 *
 * This module ONLY ever talks to the emulator. It never reads a production service account and the demo
 * project id makes the Admin SDK emulator-only.
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import * as net from 'net';
import * as path from 'path';

export const E2E_DIR = path.resolve(__dirname, '..', '..');          // .../e2e
export const REPO_ROOT = path.resolve(E2E_DIR, '..');                 // .../starlabs-angular-queue-e2e
export const DEPLOY_SCRIPT = path.join(E2E_DIR, 'scripts', 'deploy-cf-emulator.sh');

export const PROJECT = process.env.FIREBASE_PROJECT || 'demo-slabs-queue';
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
export const FUNCTIONS_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5001);

const PROTECTED = ['fir-sample-aae4a', 'watsonproduction-becde', 'salesleadcrm', 'starlabs-test', 'watson-test-19', 'salescrm-test-19'];

function splitHostPort(hostport: string): { host: string; port: number } {
  const [host, port] = hostport.split(':');
  return { host: host || 'localhost', port: Number(port) };
}

/** TCP probe: resolves true if something is listening on host:port. */
function isPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => { try { sock.destroy(); } catch { /* noop */ } resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, host);
  });
}

/** True once Firestore + Functions emulator ports both accept connections. */
export async function emulatorReady(): Promise<boolean> {
  const fs = splitHostPort(FIRESTORE_HOST);
  const au = splitHostPort(AUTH_HOST);
  const [okFs, okAuth, okFn] = await Promise.all([
    isPortOpen(fs.host, fs.port),
    isPortOpen(au.host, au.port),
    isPortOpen(fs.host, FUNCTIONS_PORT),
  ]);
  return okFs && okAuth && okFn;
}

async function waitForReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await emulatorReady()) return;
    if (Date.now() > deadline) throw new Error(`[emulator-setup] emulator not ready within ${timeoutMs}ms (firestore=${FIRESTORE_HOST}, auth=${AUTH_HOST}, functions:${FUNCTIONS_PORT})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export interface EmulatorHandle {
  proc: ChildProcess | null;            // null when attached to an external/reused emulator
  stop: () => Promise<void>;
}

/**
 * Ensure the emulator is up. If EMU_REUSE=1 (or the ports are already open) we attach to the running one and
 * do NOT spawn. Otherwise we spawn deploy-cf-emulator.sh and wait for readiness, returning a stop() that
 * tears the child down (which also restores functions/package.json `main` via the script's trap).
 */
export async function ensureEmulator(): Promise<EmulatorHandle> {
  if (PROTECTED.includes(PROJECT)) {
    throw new Error(`[emulator-setup] HARD ABORT: FIREBASE_PROJECT='${PROJECT}' is a protected project.`);
  }

  if (process.env.EMU_REUSE === '1' || (await emulatorReady())) {
    console.log(`[emulator-setup] attaching to already-running emulator (firestore=${FIRESTORE_HOST}, functions:${FUNCTIONS_PORT})`);
    return { proc: null, stop: async () => { /* external — leave running */ } };
  }

  console.log(`[emulator-setup] booting emulator via ${path.relative(REPO_ROOT, DEPLOY_SCRIPT)} (project=${PROJECT})`);
  const proc = spawn('bash', [DEPLOY_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, FIREBASE_PROJECT: PROJECT },
    stdio: 'inherit',
    detached: false,
  });
  proc.on('exit', (code) => { if (code && code !== 0) console.error(`[emulator-setup] emulator process exited with code ${code}`); });

  const timeoutMs = Number(process.env.EMU_BOOT_TIMEOUT_MS || 120000);
  await waitForReady(timeoutMs);
  console.log('[emulator-setup] emulator ready (firestore + auth + functions).');

  const stop = async () => {
    if (!proc || proc.killed) return;
    await new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
      // SIGINT lets the script's trap restore functions/package.json main, then the emulator shuts down.
      try { proc.kill('SIGINT'); } catch { resolve(); }
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* noop */ } resolve(); }, 15000);
    });
  };
  return { proc, stop };
}

/**
 * Seed the emulator with the queue fixtures (same collection coverage as the cloud seeder — see
 * fixtures/seed-emulator.js). Runs the seeder as a child with the emulator host env wired so the Admin SDK
 * inside it talks to the emulator. No-op if SKIP_SEED=1.
 */
export function seedEmulator(): void {
  if (process.env.SKIP_SEED === '1') { console.log('[emulator-setup] SKIP_SEED=1 — using existing emulator data'); return; }
  const fs = splitHostPort(FIRESTORE_HOST);
  const au = splitHostPort(AUTH_HOST);
  console.log(`[emulator-setup] seeding emulator project=${PROJECT}`);
  execSync('node fixtures/seed-emulator.js --seed', {
    cwd: E2E_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_PROJECT: PROJECT,
      // Coordinate the seed's run id with the specs (support/actors.ts defaults to 'run1'). Without this the
      // seeder mints a fresh timestamped id (seed-emulator.js:78) and every login/lookup targets a run that
      // was never seeded — the cloud path already does this in global-setup.ts:12.
      TESTRUNID: process.env.TESTRUNID || 'run1',
      FIRESTORE_EMULATOR_HOST: `${fs.host}:${fs.port}`,
      FIREBASE_AUTH_EMULATOR_HOST: `${au.host}:${au.port}`,
    },
  });
}
