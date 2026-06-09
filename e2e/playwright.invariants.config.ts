import { defineConfig } from '@playwright/test';

/**
 * Minimal, hermetic config for invariants-selftest.spec.ts ONLY — no webServer (the guards drive no
 * app/CF) and no global-setup/seed (the INV2/INV3 cases write their own `queue stage log` rows by a
 * unique self-test docid). Point it at a firestore-only emulator via FIRESTORE_EMULATOR_HOST.
 * For the merged evidence report the spec also runs under the normal emulator/cloud configs unchanged.
 */
export default defineConfig({
  testDir: './queue',
  testMatch: /invariants-selftest\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list']],
});
