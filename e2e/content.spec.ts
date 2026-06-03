import { test, expect } from '@playwright/test';
import { login, goToRoute } from './_support/app';

// CONTENT-ENGAGEMENT.md happy path: the content catalog (series/episodes) is config-authored.
test.describe('Content & engagement', () => {
  test.skip(!process.env.BASE_URL, 'requires emulator-wired app + seeded fixtures (D-002)');

  test('series dashboard shows the seeded series', async ({ page }) => {
    await login(page, 'admin');
    await goToRoute(page, '/seriesdashboard');
    await expect(page.getByText('TEST Series')).toBeVisible();
    // NOTE: `content analytics` is read-only in the web app (written by mobile/backend) — we do not assert writes here.
  });
});
