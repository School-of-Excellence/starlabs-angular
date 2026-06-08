// Evidence variant of the EMULATOR config (playwright.queue.emulator.config.ts → hermetic emulator).
// Forces a screenshot + trace on EVERY test (pass AND fail), so `npm run report:emulator` produces the
// SAME browsable, screenshot-per-test report as the cloud path — just on the fast hermetic backend.
// (Selected automatically by scripts/run-isolated.sh when TARGET=emulator EVIDENCE=1.)
import { defineConfig } from '@playwright/test';
import base from './playwright.queue.emulator.config';

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    screenshot: 'on',                 // B & C: a screenshot per test (pass AND fail) — not only-on-failure
    // Trace is the expensive bit (per-action recording + large artifacts), so it is the A/B/C lever:
    //   default (B, "cheap receipts"): on-first-retry → no recording tax on green tests, just screenshots
    //   TRACE=full (C, "full proof"):  on → record + keep a full trace for EVERY test (slower + large)
    trace: process.env.TRACE === 'full' ? 'on' : 'on-first-retry',
    video: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'results.xml' }],
  ],
});
