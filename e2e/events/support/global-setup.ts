// @ts-nocheck
// Reproducible-from-scripts: teardown the prior events run + reseed before the suite, so the run is
// self-contained and deterministic. Idempotent (deterministic doc ids; skips existing Auth users).
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const e2eDir = path.resolve(__dirname, '..', '..'); // .../e2e
  if (process.env.SKIP_SEED === '1') { console.log('[events global-setup] SKIP_SEED=1 — using existing seed'); return; }
  console.log('[events global-setup] teardown+seed events world on slabs-queue-e2e-exdcz');
  execSync('node events/seed-events.js --teardown', { cwd: e2eDir, stdio: 'inherit' });
  execSync('node events/seed-events.js --seed', { cwd: e2eDir, stdio: 'inherit' });
}
