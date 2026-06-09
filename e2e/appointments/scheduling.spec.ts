// scheduling.spec.ts — Appointment & Scheduling: capacity utilization + offtime approval + route-mount
// smoke. These three exercise REAL screens with ANTI-CIRCULAR assertions and need NO composite index
// (single-field range queries only): they are the harness validators for the whole appointments suite.
//
// Recon: e2e/recon-allcomp/appointments.md (APPT-08 / APPT-09 / APPT-10).
// Anti-circularity: APPT-08 asserts the % the APP COMPUTED from the seeded availability (2h booked /
// 8h window = 25); APPT-09/10 assert the status the APP WROTE to `offtime` on a real approve/deny
// click — never a value the test wrote. The seed is the precondition, not the asserted value.
import { test, expect } from '@playwright/test';
import { apptActors, apptProfileIds, installApptStubs, loginAsApptAdmin } from './support/appt';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.APPT_RUNID || 'appt';

test.describe('Appointments — capacity & offtime (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installApptStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'appointments: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // APPT-08 — Capacity utilization computes the right % from seeded availability
  // ===========================================================================================
  test('APPT-08 capacity utilization renders the app-computed utilisation (2h booked / 8h = 25%)', async ({ page }) => {
    await loginAsApptAdmin(page);
    await page.goto('/capacityutilization', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/capacityutilization/, { timeout: 30_000 });

    // [REAL-UI] the component queries `availability` for today→+7 in its constructor and renders a
    // MatTable. The seeded eis0 window is 09:00–17:00 (8h) with one booked 10:00–12:00 slot (2h).
    // Wait for the eis0 row the APP rendered, then read the utilisation cell the APP computed.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: apptActors.eis0 });
    await expect(row, 'APPT-08: the seeded specialist row must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] utilisation = floor(2/8*100) = 25 — the value the component computed from its own
    // Firestore read (capacity-utilization.component.ts:156), NOT a value the test wrote.
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    expect(rowText, `APPT-08: utilisation cell must show 25% (computed). Row="${rowText}"`).toMatch(/\b25\b/);
    expect(rowText, 'APPT-08: utilisation column renders a percentage').toContain('%');
  });

  // ===========================================================================================
  // APPT-09 — Approving a seeded offtime writes status:'approved' + authorizedby (app-written)
  // ===========================================================================================
  test('APPT-09 approving a pending offtime writes status:"approved" + authorizedby (the admin pid)', async ({ page }) => {
    await loginAsApptAdmin(page);
    await page.goto('/approveofftime', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/approveofftime/, { timeout: 30_000 });

    // Pre-state (anti-circular): the seeded OT1 starts with NO status.
    const before = await getDoc('offtime', `${RUN}_OT1`);
    expect(before, 'APPT-09: seeded offtime OT1 must exist').toBeTruthy();
    expect(before!.status ?? null, 'APPT-09: OT1 starts un-approved').toBeNull();

    // [REAL-UI] select the eis0 (OT1) row's checkbox, then click "Approve Offtime" and accept confirm().
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: apptActors.eis0 });
    await expect(row, 'APPT-09: the eis0 offtime row must render').toBeVisible({ timeout: 30_000 });
    await row.locator('mat-checkbox, input[type="checkbox"]').first().click();

    page.once('dialog', (d) => d.accept()); // selectedOfftimeAction() opens window.confirm
    await page.getByRole('button', { name: /Approve Offtime/i }).click();

    // [ASSERT] the app's updateDoc wrote status:'approved' + authorizedby = the logged-in admin's
    // profileid (approve-offtime.component.ts:162). Polled — the value the PRODUCT wrote.
    const after = await pollUntil(
      () => getDoc('offtime', `${RUN}_OT1`),
      (d) => !!d && d.status === 'approved',
      { label: 'APPT-09: offtime OT1 → status "approved"', timeoutMs: 30_000 },
    );
    expect(after!.authorizedby, 'APPT-09: authorizedby must be the logged-in admin profileid').toBe(apptProfileIds.admin);
  });

  // ===========================================================================================
  // APPT-10 — Denying a seeded offtime writes status:'denied' (and never approved)
  // ===========================================================================================
  test('APPT-10 denying a pending offtime writes status:"denied"', async ({ page }) => {
    await loginAsApptAdmin(page);
    await page.goto('/approveofftime', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/approveofftime/, { timeout: 30_000 });

    const before = await getDoc('offtime', `${RUN}_OT2`);
    expect(before, 'APPT-10: seeded offtime OT2 must exist').toBeTruthy();
    expect(before!.status ?? null, 'APPT-10: OT2 starts un-approved').toBeNull();

    // [REAL-UI] select the eis1 (OT2) row, click "Deny Offtime", accept confirm.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: apptActors.eis1 });
    await expect(row, 'APPT-10: the eis1 offtime row must render').toBeVisible({ timeout: 30_000 });
    await row.locator('mat-checkbox, input[type="checkbox"]').first().click();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Deny Offtime/i }).click();

    const after = await pollUntil(
      () => getDoc('offtime', `${RUN}_OT2`),
      (d) => !!d && d.status === 'denied',
      { label: 'APPT-10: offtime OT2 → status "denied"', timeoutMs: 30_000 },
    );
    expect(after!.authorizedby, 'APPT-10: authorizedby must be the logged-in admin profileid').toBe(apptProfileIds.admin);
  });
});

// ===========================================================================================
// Route-mount smoke — every appointment route mounts for the super-role admin (guard admits,
// no bounce to /login, the screen renders a heading). Proves the dashboard route-grants seeded.
// ===========================================================================================
test.describe('Appointments — route-mount smoke (guard admits super-role admin)', () => {
  const ROUTES = [
    '/capacityutilization', '/approveofftime', '/appointmentstatuspending', '/appointmentavailability',
    '/roster', '/teamdeliveryhours', '/appointment-dashboard', '/EISzoom', '/mapclienteis',
  ];
  test('every seeded appointment route mounts (no /login bounce)', async ({ page }) => {
    await installApptStubs(page);
    await loginAsApptAdmin(page);
    const bounced: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Give the guard + lazy chunk a moment to resolve.
      await page.waitForLoadState('networkidle').catch(() => {});
      const url = page.url();
      if (/\/login/.test(url)) bounced.push(`${route} -> ${url}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
