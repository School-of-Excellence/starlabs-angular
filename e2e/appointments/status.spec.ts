// status.spec.ts — Appointment status marking (the CF-side-effect-style cases).
//
// APPT-04 renders the unmarked-appointments board; APPT-05/06 drive the REAL mark-status dialog and
// assert the value the APP WROTE: appointments.{attended|cancelled} AND the linked deliverable's
// status flipped by guard.updateDeliveryStatus (deliverables where fileref array-contains the appt).
// Anti-circular: the deliverable status is computed+written by the product (completed/ready); the
// test only seeds it "ongoing" as a precondition and asserts the product's transition.
//
// Needs the appointments composite index (cancelled,attended,starttime) — deployed in firestore.indexes.json.
import { test, expect } from '@playwright/test';
import {
  apptActors, installApptStubs, loginAsApptAdmin, resetAppointmentUnmarked,
} from './support/appt';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.APPT_RUNID || 'appt';

test.describe('Appointments — status marking (real mark-status dialog → deliverable transition)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installApptStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'appointment status: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // APPT-04 — the unmarked-appointments board renders the two seeded past appointments
  // ===========================================================================================
  test('APPT-04 status-pending renders the seeded unmarked appointments (both clients)', async ({ page }) => {
    // Precondition: ensure both appointments are unmarked so both appear (idempotent for re-runs).
    await resetAppointmentUnmarked(`${RUN}_AP1`, `${RUN}_D1`);
    await resetAppointmentUnmarked(`${RUN}_AP2`, `${RUN}_D2`);

    await loginAsApptAdmin(page);
    await page.goto('/appointmentstatuspending', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/appointmentstatuspending/, { timeout: 30_000 });

    // [REAL-UI] the board queries appointments(cancelled==false,attended==false,starttime<=now) and joins
    // the profile map to render each client name. Both seeded clients must appear as rows the app built.
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: apptActors.participant0 });
    const p1Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `participant1+${RUN}@example.com` });
    await expect(p0Row, 'APPT-04: AP1 (participant0) must render').toBeVisible({ timeout: 30_000 });
    await expect(p1Row, 'APPT-04: AP2 (participant1) must render').toBeVisible({ timeout: 30_000 });
    // Each row offers the Update action the mark tests drive.
    await expect(p0Row.getByRole('button', { name: /Update/i })).toBeVisible();
  });

  // ===========================================================================================
  // APPT-05 — mark ATTENDED → appointment.attended=true AND deliverable → "completed"
  // ===========================================================================================
  test('APPT-05 marking an appointment attended flips appointment.attended and the deliverable to "completed"', async ({ page }) => {
    await resetAppointmentUnmarked(`${RUN}_AP1`, `${RUN}_D1`);
    // Pre-state (anti-circular): deliverable D1 starts "ongoing", appointment AP1 unattended.
    expect((await getDoc('deliverables', `${RUN}_D1`))!.status, 'APPT-05: D1 starts ongoing').toBe('ongoing');

    await loginAsApptAdmin(page);
    await page.goto('/appointmentstatuspending', { waitUntil: 'domcontentloaded' });
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: apptActors.participant0 });
    await expect(p0Row).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the mark-status dialog; "Appointment Happened Successfully!" is checked by default
    // (attended=true), so just submit.
    await p0Row.getByRole('button', { name: /Update/i }).click();
    const submit = page.getByRole('button', { name: /Update Status/i });
    await expect(submit, 'APPT-05: mark-status dialog must open with the submit button').toBeVisible({ timeout: 20_000 });
    await submit.click();

    // [ASSERT] the app's updateDoc wrote attended:true (mark-appointment-status.component.ts:275)…
    await pollUntil(
      () => getDoc('appointments', `${RUN}_AP1`),
      (d) => !!d && d.attended === true && d.cancelled === false,
      { label: 'APPT-05: appointment AP1 → attended:true', timeoutMs: 30_000 },
    );
    // …and guard.updateDeliveryStatus flipped the linked deliverable (fileref array-contains AP1) to
    // "completed" (authguard.service.ts:889) — the product's computed transition, not a test write.
    await pollUntil(
      () => getDoc('deliverables', `${RUN}_D1`),
      (d) => !!d && d.status === 'completed',
      { label: 'APPT-05: deliverable D1 → status "completed"', timeoutMs: 30_000 },
    );
  });

  // ===========================================================================================
  // APPT-06 — mark CANCELLED → appointment.cancelled=true AND deliverable → "ready"
  // ===========================================================================================
  test('APPT-06 marking an appointment cancelled flips appointment.cancelled and the deliverable to "ready"', async ({ page }) => {
    await resetAppointmentUnmarked(`${RUN}_AP2`, `${RUN}_D2`);
    expect((await getDoc('deliverables', `${RUN}_D2`))!.status, 'APPT-06: D2 starts ongoing').toBe('ongoing');

    await loginAsApptAdmin(page);
    await page.goto('/appointmentstatuspending', { waitUntil: 'domcontentloaded' });
    const p1Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `participant1+${RUN}@example.com` });
    await expect(p1Row).toBeVisible({ timeout: 30_000 });

    await p1Row.getByRole('button', { name: /Update/i }).click();
    // [REAL-UI] uncheck "Appointment Happened Successfully!" → the cancellation-reason select appears.
    const happened = page.getByText('Appointment Happened Successfully!');
    await expect(happened).toBeVisible({ timeout: 20_000 });
    await happened.click(); // toggles attended → false
    // Pick a cancellation reason (mat-select → first option).
    const reasonSelect = page.getByRole('combobox', { name: /Select Reason/i });
    await expect(reasonSelect, 'APPT-06: cancellation reason select must appear when not attended').toBeVisible({ timeout: 10_000 });
    // force: the floating <mat-label> notched-outline overlays the combobox trigger and intercepts a
    // normal click; force dispatches the click that opens the mat-select panel.
    await reasonSelect.click({ force: true });
    await page.locator('mat-option').first().click();

    await page.getByRole('button', { name: /Update Status/i }).click();

    // [ASSERT] the app wrote cancelled:true + a cancelledreason…
    const after = await pollUntil(
      () => getDoc('appointments', `${RUN}_AP2`),
      (d) => !!d && d.cancelled === true && d.attended === false,
      { label: 'APPT-06: appointment AP2 → cancelled:true', timeoutMs: 30_000 },
    );
    expect(after!.cancelledreason, 'APPT-06: a cancellation reason must be recorded').toBeTruthy();
    // …and the deliverable reverted to "ready" (updateDeliveryStatus with status "ready").
    await pollUntil(
      () => getDoc('deliverables', `${RUN}_D2`),
      (d) => !!d && d.status === 'ready',
      { label: 'APPT-06: deliverable D2 → status "ready"', timeoutMs: 30_000 },
    );
  });
});
