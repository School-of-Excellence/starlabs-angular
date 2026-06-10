import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the REAL-mobile participant walk (mobile-walk.spec.ts). The OPERATOR side is
 * the same served Angular board (development build → test project slabs-queue-e2e-exdcz); the
 * PARTICIPANT side is driven by `flutter drive` of the breakthroughs app on a booted iOS simulator
 * (orchestrated inside the spec). Strictly serial — one walk at a time on the shared run1 seed.
 */
export default defineConfig({
  testDir: './queue/mobile',
  testMatch: 'mobile-walk.spec.ts',
  globalSetup: require.resolve('./queue/mobile/global-setup.ts'),
  // Snapshot each run's report into a rotating keep-last-10 archive so a new run doesn't wipe old
  // screenshots (playwright-report-mobile-archive/<stamp>/). Tune with MOBILE_REPORT_KEEP, off with MOBILE_REPORT_ARCHIVE=0.
  globalTeardown: require.resolve('./queue/mobile/archive-report.cjs'),
  timeout: 25 * 60_000,            // a full walk runs several flutter drives (app boots each time)
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,                      // a retry would re-run an expensive multi-minute walk — surface instead
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-mobile' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure', // board hops are now captured explicitly per-hop (see mobile-walk.spec);
                                   // mobile frames are attached from the flutter run. (Avoids the empty end-of-test auto-shot.)
    video: 'off',
  },
  projects: [
    { name: 'operator-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx -y serve -s ../dist/atctranscription/browser -l 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
