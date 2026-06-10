// wishlist.spec.ts — Evolution Wishlist Log: cancel an initiated row + re-initiate a cancelled row
// (real MatTable action → Firestore write).
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-07, PM-06). The /evolutionwishlistlog screen streams
// `evolutionwishlistlog` orderBy('created','desc'); each row carries the participant name (from
// profile_data) and Cancel / Re-initiate action buttons.
//   • Cancel  → cancelInitiated(): confirm() then updateDoc({ closedbeforeshare:true, status:'cancelled' })
//     (evolution-wishlist-log-screen.component.ts:226-229).
//   • Re-initiate (on a cancelled row) → resendAfterCancel(): opens the EvolutionWishlistLogComponent
//     dialog WITHOUT confirm; createLog() batch-writes a NEW { status:'initiated' } doc
//     (evolution-wishlist-log.component.ts:72-80).
//
// Anti-circularity: PM-07 seeds status:'initiated' → asserts the APP wrote 'cancelled'. PM-06 seeds a
// cancelled row → asserts the APP CREATED a new initiated doc (count==1 for that participant). External
// Wati/Postmark are CF-side and only fire on status=='sent' (never written here), so no real send.
import { test, expect } from '@playwright/test';
import {
  installModeStubs, loginAsModeAdmin, modeActors, modeIds,
  resetWishlistInitiated, resetReinitiateSubject,
} from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.MODE_RUNID || 'mode';

test.describe('Modes — Evolution Wishlist Log (real action → Firestore write, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'evolution wishlist log: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // PM-07 — cancelling an initiated row writes status:'cancelled' + closedbeforeshare:true
  // ===========================================================================================
  test('PM-07 cancelling an initiated wishlist row writes status:"cancelled"', async ({ page }) => {
    // Precondition (anti-circular): the seeded row starts status:'initiated'.
    await resetWishlistInitiated(modeIds.EWL_INIT, `${RUN}_pf_p0`);
    const beforeDoc = await getDoc('evolutionwishlistlog', modeIds.EWL_INIT);
    expect(beforeDoc!.status, 'PM-07: seeded row starts initiated').toBe('initiated');

    await loginAsModeAdmin(page);
    await page.goto('/evolutionwishlistlog', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionwishlistlog/, { timeout: 30_000 });

    // [REAL-UI] locate participant0's row (Profile Name cell == the participant email), click its
    // Cancel button, accept the confirm() dialog. The Cancel fab carries aria-label="delete icon"
    // (its mat-icon ligature is "cancel"; the accessible name is the aria-label — verified live).
    // Scope to the INITIATED p0 row by requiring the Cancel ("delete icon") button — the new
    // wishlist-FORM seed docs (PM-08/09) add other p0 rows (status 'sended') that would make a plain
    // participant0 filter ambiguous; only an initiated row carries the cancel affordance.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]')
      .filter({ hasText: modeActors.participant0 })
      .filter({ has: page.getByRole('button', { name: /delete icon/i }) });
    await expect(row.first(), 'PM-07: participant0 initiated wishlist row must render').toBeVisible({ timeout: 30_000 });
    page.once('dialog', (d) => d.accept()); // cancelInitiated opens window.confirm
    await row.first().getByRole('button', { name: /delete icon/i }).click();

    // [ASSERT] the app's updateDoc wrote status:'cancelled' + closedbeforeshare:true. Polled — the value
    // the PRODUCT wrote (test seeded 'initiated').
    const after = await pollUntil(
      () => getDoc('evolutionwishlistlog', modeIds.EWL_INIT),
      (d) => !!d && d.status === 'cancelled',
      { label: 'PM-07: EWL_INIT → status "cancelled"', timeoutMs: 30_000 },
    );
    expect(after!.closedbeforeshare, 'PM-07: closedbeforeshare set by the app').toBe(true);
  });

  // ===========================================================================================
  // PM-06 — re-initiating a cancelled row creates a NEW initiated doc for that participant
  // ===========================================================================================
  test('PM-06 re-initiating a cancelled row creates a new status:"initiated" doc', async ({ page }) => {
    // Precondition (anti-circular): participant1 has ONLY the seeded cancelled row, NO initiated row.
    await resetReinitiateSubject(modeIds.EWL_CANCEL, `${RUN}_pf_p1`);
    const before = await countWhere('evolutionwishlistlog', [['profileid', '==', `${RUN}_pf_p1`], ['status', '==', 'initiated']]);
    expect(before, 'PM-06: participant1 has 0 initiated wishlists before re-initiate').toBe(0);

    await loginAsModeAdmin(page);
    await page.goto('/evolutionwishlistlog', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionwishlistlog/, { timeout: 30_000 });

    // [REAL-UI] locate participant1's cancelled row, click Re-initiate (fab aria-label="reinitiate icon",
    // enabled because the row is cancelled). A cancelled row opens the EvolutionWishlistLogComponent
    // dialog directly (no confirm).
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: modeActors.participant1 });
    await expect(row, 'PM-06: participant1 cancelled row must render').toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: /reinitiate icon/i }).click();

    // The dialog: pick "Family and Peers", then "Send Evolution Wishlist" (createLog).
    await expect(page.getByText('Evolution Wish List'), 'PM-06: re-initiate dialog must open').toBeVisible({ timeout: 20_000 });
    const typeSelect = page.getByRole('combobox', { name: /Select Wishlist Type/i });
    await expect(typeSelect, 'PM-06: type select must render').toBeVisible({ timeout: 10_000 });
    await typeSelect.click({ force: true }); // floating mat-label intercepts a normal click
    await page.getByRole('option', { name: /Family and Peers/i }).click();
    await page.getByRole('button', { name: /Send Evolution Wishlist/i }).click();

    // [ASSERT] the app's batch.set created exactly ONE new initiated doc for participant1. Polled — the
    // COUNT the server computed (test seeded 0 initiated docs for this participant).
    await pollUntil(
      () => countWhere('evolutionwishlistlog', [['profileid', '==', `${RUN}_pf_p1`], ['status', '==', 'initiated']]),
      (n) => n === 1,
      { label: 'PM-06: participant1 gains exactly 1 initiated wishlist', timeoutMs: 30_000 },
    );
  });
});
