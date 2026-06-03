import { test, expect } from '@playwright/test';
import { login, goToRoute } from './_support/app';

// SCHEDULING-DELIVERY.md happy path: appointmenttype + availability config + a bookable slot.
test.describe('Scheduling & 1:1 delivery', () => {
  test.skip(!process.env.BASE_URL, 'requires emulator-wired app + seeded fixtures (D-002)');

  test('book-appointment surfaces the seeded appointment type and a free slot', async ({ page }) => {
    await login(page, 'admin');
    await goToRoute(page, '/bookappointment');
    await expect(page.getByText(/TEST Diagnostics/i)).toBeVisible();
    // seed availability avail-test-1 has one free slot on 2026-06-10 09:00 for appt-diag
    // TODO(D-002): select the participant + product, pick the slot, confirm an `appointments` doc is written
    //   and the availability slot flips booked:true (see book-appointment.ts:557-607).
  });
});
