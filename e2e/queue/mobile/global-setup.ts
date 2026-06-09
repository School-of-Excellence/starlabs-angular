// @ts-nocheck
// Mobile-walk global setup: (re)seed the test project + apply the mobile fixture (actionresource on
// FORM stages, so FillForm renders). Idempotent. SKIP_SEED=1 reuses the existing run1 seed/fixture.
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const TESTRUNID = process.env.TESTRUNID || 'run1';
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') {
    console.log('[mobile global-setup] SKIP_SEED=1 — using existing seed + mobile fixture');
    return;
  }
  console.log(`[mobile global-setup] teardown+seed ${process.env.TEST_PROJECT || 'slabs-queue-e2e-exdcz'} (testrunid=${TESTRUNID}) + mobile fixture`);
  execSync(`TESTRUNID=${TESTRUNID} node fixtures/seed-test-project.js --teardown ${TESTRUNID}`, { cwd: e2eDir, stdio: 'inherit' });
  execSync(`TESTRUNID=${TESTRUNID} node fixtures/seed-test-project.js --seed`, { cwd: e2eDir, stdio: 'inherit' });
  execSync(`TESTRUNID=${TESTRUNID} node queue/mobile/setup-mobile-fixture.cjs`, { cwd: e2eDir, stdio: 'inherit' });
}
