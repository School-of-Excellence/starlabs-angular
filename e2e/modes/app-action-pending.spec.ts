// app-action-pending.spec.ts — App Action Pending: the table shows ONLY participants whose pending-
// action arrays are non-empty (real UI → app-computed filter).
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-17). The /appactionpending screen
// (app-action-pending.component.ts) streams the whole `appactionpending` collection (onSnapshot) and
// pushes a row ONLY when formspending / videoaskpending / quiz / mandatoryaction is non-empty
// (:126-133). Each row is keyed by the doc id (== profileid) and its profilename is joined from
// getProfileMap() (profile_data.name).
//
// Anti-circularity: the test seeds TWO docs — one with a non-empty formspending[] (must render) and one
// all-empty (must be filtered out). The visible/hidden split is COMPUTED by the component; the test
// only seeds the known action arrays. We assert page-position-independently by the two run-unique
// participant profile names (the screen reads the whole collection, so we never assert a row index).
import { test, expect } from '@playwright/test';
import { installModeStubs, loginAsModeAdmin } from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.MODE_RUNID || 'mode';

test.describe('Modes — App Action Pending (non-empty-action filter, anti-circular oracle)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'app action pending: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // PM-17 — only the participant with a non-empty pending action renders a row
  // ===========================================================================================
  test('PM-17 the pending-actions table renders the non-empty participant and hides the all-empty one', async ({ page }) => {
    await loginAsModeAdmin(page);
    await page.goto('/appactionpending', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/appactionpending/, { timeout: 30_000 });

    // The two seeded docs are keyed by participant0 (formspending[]→ renders) and participant1
    // (all-empty → filtered out). Their profilenames are the run-unique seeded emails.
    const nonEmptyRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `participant0+${RUN}@example.com` });
    const emptyRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `participant1+${RUN}@example.com` });

    // [ASSERT] the non-empty participant's row IS rendered (the app's filter kept it).
    await expect(nonEmptyRow, 'PM-17: participant0 (non-empty formspending) must render a row').toBeVisible({ timeout: 30_000 });
    // [ASSERT] the all-empty participant's row is NOT rendered (the app's :126-133 filter dropped it).
    // It loaded into the same onSnapshot batch, so by the time the non-empty row is visible the empty
    // doc has been processed; assert it produced zero rows.
    await expect(emptyRow, 'PM-17: participant1 (all-empty actions) must be filtered out (no row)').toHaveCount(0);
  });
});
