// @ts-nocheck
// Reproducible-from-scripts: teardown the prior auth run + reseed before the suite, so the run is
// self-contained and deterministic. Idempotent (deterministic doc ids; skips existing Auth users).
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') { console.log('[authroles global-setup] SKIP_SEED=1 — using existing seed'); return; }
  console.log('[authroles global-setup] teardown+seed auth/role-gate world on slabs-queue-e2e-exdcz');
  execSync('node authroles/seed-authroles.js --teardown', { cwd: e2eDir, stdio: 'inherit' });
  execSync('node authroles/seed-authroles.js --seed', { cwd: e2eDir, stdio: 'inherit' });
}
