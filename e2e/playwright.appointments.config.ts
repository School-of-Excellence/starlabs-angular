import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Appointment & Scheduling e2e suite.
 * Same shape as playwright.queue.config.ts: serves the dev-build app (-> test project
 * slabs-queue-e2e-exdcz) and drives the real Angular screens. Serial (shared seed state).
 */
export default defineConfig({
  testDir: './appointments',
  testMatch: '**/*.spec.ts',
  globalSetup: require.resolve('./appointments/support/global-setup.ts'),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-appointments' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'appointments-desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx -y serve -s ../dist/atctranscription/browser -l 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
