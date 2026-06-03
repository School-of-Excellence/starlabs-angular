import { test, expect } from '@playwright/test';
import { login, goToRoute } from './_support/app';

// QUEUE-AND-BIG.md happy path: a seeded `queue generation` config makes a queue render & run.
// NOTE: /dynamicqueuemanager is ATC-excluded — we drive the queue via the non-ATC /queuelist + /queue-web.
test.describe('Queue (config-driven stage machine)', () => {
  test.skip(!process.env.BASE_URL, 'requires emulator-wired app + seeded fixtures (D-002)');

  test('seeded queue config appears in the queue list', async ({ page }) => {
    await login(page, 'admin');
    await goToRoute(page, '/queuelist');
    await expect(page.getByText('TEST Diagnostics & Consultation')).toBeVisible();
  });

  test('participant queue-web shows the config-resolved stages for their token', async ({ page }) => {
    await login(page, 'participant');
    await goToRoute(page, '/queue-web');
    // stages come from `queue generation.stages[]` (config), not the token — see QUEUE-AND-BIG.md §5
    await expect(page.getByText(/Diagnostics/i)).toBeVisible();
    // TODO(D-002): assert the current stage marker reflects queue_token.currentstage ("Yet to Start")
  });
});
