import { test, expect } from '@playwright/test';
import { login, goToRoute } from './_support/app';

// JOURNEY-LIFECYCLE.md happy path: participantjourneyproduct.journeystatus is the live state.
test.describe('Journey lifecycle', () => {
  test.skip(!process.env.BASE_URL, 'requires emulator-wired app + seeded fixtures (D-002)');

  test('participant purchase view shows the seeded ongoing journey', async ({ page }) => {
    await login(page, 'admin');
    await goToRoute(page, '/participantpurchase/prof-participant');
    await expect(page.getByText(/TEST Wellness Journey/i)).toBeVisible();
    await expect(page.getByText(/ongoing/i)).toBeVisible(); // journeystatus, NOT profile_data.currentjourney* (dead)
  });
});
