// @ts-nocheck
/**
 * emulator-global-setup.ts — Playwright globalSetup for the HERMETIC emulator run.
 * Boots (or attaches to) the Firebase emulator with the queue Cloud Functions executing, points BOTH the
 * seeder AND the test workers' Admin SDK at the emulator, cleans any prior-run leftovers, then seeds it.
 * Used by playwright.queue.emulator.config.ts. Cloud runs keep using support/global-setup.ts instead.
 */
import { execSync } from 'child_process';
import { ensureEmulator, seedEmulator, PROJECT, FIRESTORE_HOST, AUTH_HOST, E2E_DIR } from './emulator-setup';

export default async function emulatorGlobalSetup() {
  const handle = await ensureEmulator();
  // Stash so globalTeardown can stop a spawned emulator (no-op if we attached to a reused one).
  (globalThis as any).__QUEUE_EMU_HANDLE__ = handle;

  // CRITICAL: point the TEST WORKERS' Admin SDK (e2e/lib/participant-sim.js, queue/support/firestore-admin.ts)
  // at the EMULATOR — not just the seeder. Playwright forks workers AFTER globalSetup, inheriting process.env,
  // so setting these here makes every worker's firebase-admin talk to the emulator. WITHOUT this, workers fall
  // back to the CLOUD project (test-project.js default slabs-queue-e2e-exdcz) and every admin query hits the
  // cloud → "FAILED_PRECONDITION: query requires an index". (The allowlist permits the demo- emulator id.)
  process.env.TEST_PROJECT = PROJECT;                      // demo-slabs-queue
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;    // localhost:8080
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;     // localhost:9099

  if (process.env.SKIP_SEED !== '1') {
    const testrunid = process.env.TESTRUNID || 'run1';
    const env = {
      ...process.env,
      FIREBASE_PROJECT: PROJECT,
      FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
      FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
    };
    // Clean leftovers from a prior run BEFORE re-seeding. A freshly booted emulator has nothing to remove
    // (no-op), but when reusing one (EMU_REUSE=1) this keeps counts deterministic — tests that create extra
    // tokens (OP-13 missing-profile, cf-sideeffects ready tokens) would otherwise accumulate and inflate the
    // seeded-population parity checks (e.g. OP-03 Total == seeded N).
    try {
      execSync(`node fixtures/seed-emulator.js --teardown ${testrunid}`, { cwd: E2E_DIR, stdio: 'inherit', env });
    } catch {
      /* first run / nothing tagged with this run id — fine */
    }
  }
  seedEmulator();
}
