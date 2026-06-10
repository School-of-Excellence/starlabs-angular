// @ts-nocheck
// Reproducible-from-scripts: teardown the prior profiles run + reseed before the suite, so the run is
// self-contained and deterministic. Idempotent (deterministic doc ids; skips existing Auth users).
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') { console.log('[profiles global-setup] SKIP_SEED=1 — using existing seed'); return; }
  console.log('[profiles global-setup] teardown+seed profiles world on slabs-queue-e2e-exdcz');
  execSync('node profiles/seed-profiles.js --teardown', { cwd: e2eDir, stdio: 'inherit' });
  execSync('node profiles/seed-profiles.js --seed', { cwd: e2eDir, stdio: 'inherit' });
}
