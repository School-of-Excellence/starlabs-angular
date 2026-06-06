import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the HERMETIC emulator run of the Queue Manager suite (CI-gateable).
 *
 * Difference vs playwright.queue.config.ts (the CLOUD target slabs-queue-e2e-exdcz):
 *   - globalSetup BOOTS (or attaches to) the Firebase emulator with the queue Cloud Functions EXECUTING,
 *     then seeds it (support/emulator-global-setup.ts). globalTeardown stops a spawned emulator.
 *   - webServer serves the EMULATOR-targeted Angular build (`npm run start:emulator` ->
 *     ng serve --configuration emulator -> environment.emulator.ts -> connects to the emulator ports).
 *   - target/baseURL come from env; the project id is NEVER hardcoded in specs (anti-circularity + safety).
 *
 * Same testDir/testMatch as the cloud config: every spec under e2e/queue/**\/*.spec.ts runs unchanged
 * against the emulator. The CF read-backs in recon/cf.md are identical on both targets (assert the openVidu
 * "Link Broken" zoomdata path for determinism since dummy Zoom secrets are used — cf.md §2).
 *
 * Run:
 *   # one-shot, fully hermetic (boots emulator + app, seeds, runs):
 *   npm --prefix e2e run test:emu
 *   # or reuse an emulator you started yourself in another terminal:
 *   npm --prefix e2e run emu:up          # terminal 1
 *   EMU_REUSE=1 npm --prefix e2e run test:emu   # terminal 2
 */
export default defineConfig({
  testDir: './queue',
  testMatch: '**/*.spec.ts',
  globalSetup: require.resolve('./queue/support/emulator-global-setup.ts'),
  globalTeardown: require.resolve('./queue/support/emulator-global-teardown.ts'),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,        // shared queue state — serialize for determinism
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['junit', { outputFile: 'results.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  metadata: { target: 'emulator', project: process.env.FIREBASE_PROJECT || 'demo-slabs-queue' },
  projects: [
    { name: 'operator-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Boots the EMULATOR-wired Angular app; reuses an already-running dev server locally.
  webServer: {
    command: 'npm --prefix .. run start:emulator',
    url: 'http://localhost:4200',
    // Must NOT reuse a foreign server: a stale CLOUD `ng serve`/`serve -s dist` on :4200 would be silently
    // reused and the suite would drive the cloud project against emulator-seeded data. Always start (and own)
    // the emulator-wired build. Set EMU_REUSE_APP=1 only if you deliberately started start:emulator yourself.
    reuseExistingServer: process.env.EMU_REUSE_APP === '1',
    timeout: 240_000,
  },
});
