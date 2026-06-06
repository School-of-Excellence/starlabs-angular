// @ts-nocheck
// Reproducible-from-scripts: (re)seed the test project before the suite runs, so the run
// is self-contained and deterministic. Idempotent — overwrites docs, skips existing users.
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const TESTRUNID = process.env.TESTRUNID || 'run1';
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') { console.log('[global-setup] SKIP_SEED=1 — using existing seed'); return; }
  // CLEAN SLATE each run (reliability): teardown stragglers from prior runs (tests create extra
  // tokens/invitations/live-assignments) BEFORE seeding, so counts reconcile to the seeded N exactly.
  console.log(`[global-setup] teardown+seed ${process.env.TEST_PROJECT || 'slabs-queue-e2e-exdcz'} (testrunid=${TESTRUNID})`);
  execSync(`TESTRUNID=${TESTRUNID} node fixtures/seed-test-project.js --teardown ${TESTRUNID}`, { cwd: e2eDir, stdio: 'inherit' });
  execSync(`TESTRUNID=${TESTRUNID} node fixtures/seed-test-project.js --seed`, { cwd: e2eDir, stdio: 'inherit' });
}
