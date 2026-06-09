// @ts-nocheck
// Reproducible-from-scripts: teardown the prior content run + reseed before the suite, so the run is
// self-contained and deterministic. Idempotent (deterministic doc ids; skips existing Auth users).
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') { console.log('[content global-setup] SKIP_SEED=1 — using existing seed'); return; }
  console.log('[content global-setup] teardown+seed content world on slabs-queue-e2e-exdcz');
  execSync('node content/seed-content.js --teardown', { cwd: e2eDir, stdio: 'inherit' });
  execSync('node content/seed-content.js --seed', { cwd: e2eDir, stdio: 'inherit' });
}
