import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Communication Center / Notifications / Chat e2e suite.
 * Same shape as playwright.appointments.config.ts: serves the dev-build app (-> test project
 * slabs-queue-e2e-exdcz) and drives the real Angular screens. Serial (shared seed state).
 */
export default defineConfig({
  testDir: './comms',
  testMatch: '**/*.spec.ts',
  globalSetup: require.resolve('./comms/support/global-setup.ts'),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-comms' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'comms-desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx -y serve -s ../dist/atctranscription/browser -l 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
