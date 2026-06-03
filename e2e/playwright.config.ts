import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for StarLabs Tier-A happy-path E2E (the D-002 bridge).
 * Runs against an app instance wired to the Firebase EMULATOR (never production).
 * Set BASE_URL to the emulator-wired app (e.g. http://localhost:4200) to enable the specs;
 * without it the suites skip (see each spec's test.skip guard) so CI never fails spuriously pre-D-002.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // TODO(D-002): add a `webServer` that boots the emulator + seeds fixtures + serves the emulator-wired app:
  //   firebase emulators:exec --config firebase.emulator.json \
  //     "node e2e/fixtures/seed-emulator.js && ng serve --configuration emulator"
});
