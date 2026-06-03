import { test, expect } from '@playwright/test';
import { login, goToRoute } from './_support/app';
import { ATC_EXCLUDED_ROUTES } from './_support/excluded-routes';

// AUTH-ROLES.md happy path: dashboard config (roles[]) drives which nav items render per role.
test.describe('Auth & config-driven navigation', () => {
  test.skip(!process.env.BASE_URL, 'requires emulator-wired app + Auth emulator users (D-002)');

  test('participant sees role-permitted nav, not admin-only items', async ({ page }) => {
    await login(page, 'participant');
    // seed: "Queue Web" roles:[admin,participant] -> visible; "Developer Settings" roles:[admin] -> hidden
    await expect(page.getByRole('link', { name: /queue web/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /developer settings/i })).toHaveCount(0);
  });

  test('admin reaches an admin-gated route', async ({ page }) => {
    await login(page, 'admin');
    await goToRoute(page, '/queuelist'); // dashboard ACL roles:[admin,capacityplanner]
    await expect(page).toHaveURL(/queuelist/);
  });

  test('guardrail: ATC-excluded routes are never exercised here', async () => {
    // Pure assertion that this suite's route list and the excluded list are disjoint.
    expect(ATC_EXCLUDED_ROUTES).toContain('/dynamicstudio');
    expect(ATC_EXCLUDED_ROUTES).not.toContain('/queuelist');
  });
});
