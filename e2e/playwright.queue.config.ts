import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Queue Manager full-complexity e2e suite.
 * Targets the served Angular app (development build -> test project slabs-queue-e2e-exdcz).
 * Participants are simulated via Admin SDK (Level 1); operators/specialists/BIG are driven here.
 */
export default defineConfig({
  testDir: './queue',
  testMatch: '**/*.spec.ts',
  globalSetup: require.resolve('./queue/support/global-setup.ts'),
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
  projects: [
    { name: 'operator-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Boots the test-wired Angular app; reuses an already-running dev server locally.
  // Lightweight static server of the prebuilt bundle (dev config -> test project). Far more
  // stable than `ng serve` (which gets OOM/SIGTERM-killed under the full run). Build once with
  // `ng build --configuration development`, then this serves dist with SPA fallback.
  webServer: {
    command: 'npx -y serve -s ../dist/atctranscription/browser -l 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
