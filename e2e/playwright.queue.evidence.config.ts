// Evidence variant of the CLOUD config (playwright.queue.config.ts → slabs-queue-e2e-exdcz).
// Forces capture on EVERY test (not just failures) so the HTML report has one screenshot per test —
// that report IS the screenshot-evidence artifact required by
// specs/journals/2026-06-08-complete-all-tests-cloud-evidence.md.
import { defineConfig } from '@playwright/test';
import base from './playwright.queue.config';

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    screenshot: 'on',                 // a screenshot per test (pass AND fail)
    trace: 'on',                      // full trace per test (browsable in the report)
    video: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'results.xml' }],
  ],
});
