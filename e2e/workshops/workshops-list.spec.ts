// workshops-list.spec.ts — Workshops list + workshop-configuration: list render, active-status filter,
// the activate slide-toggle WRITE, and the detail-page title SAVE. All drive REAL Angular screens with
// ANTI-CIRCULAR assertions and need NO composite index (the workshops list reads the whole
// `workshopconfiguration` collection client-side; the toggle/save are single-doc updates).
//
// Recon: e2e/recon-allcomp/workshops.md (WS-01 / WS-03 / WS-04 / WS-05).
// Anti-circularity:
//   • WS-01: the app renders rows from its own collectionData stream; we lower-bound the visible count
//     against a Firestore countWhere — never assert a row the test wrote.
//   • WS-04: assert the value the APP wrote to workshopconfiguration.active on a real toggle+confirm
//     (polled from Firestore), starting from a seeded inactive precondition.
//   • WS-05: assert workshopconfiguration.detailpage.title === the title we TYPED, read back from
//     Firestore (app output vs known input) — the seed only supplies the pre-existing doc.
import { test, expect } from '@playwright/test';
import {
  wsActors, wsIds, installWshopStubs, loginAsWshopAdmin, resetWorkshopInactive,
} from './support/wshop';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.WSHOP_RUNID || 'wshop';

test.describe('Workshops — list + configuration (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installWshopStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'workshops list/config: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // WS-01 — authenticated admin lands on /workshops (no /login bounce) and the seeded workshop renders
  // ===========================================================================================
  test('WS-01 /workshops renders the live workshopconfiguration stream (seeded workshop appears)', async ({ page }) => {
    await loginAsWshopAdmin(page);
    await page.goto('/workshops', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/workshops/, { timeout: 30_000 });

    // [REAL-UI] the component subscribes to collectionData('workshopconfiguration') and renders one
    // MatTable row per doc. Wait for the seeded "Dashboard Workshop" title the app drew from its stream.
    const dashRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Dashboard Workshop ${RUN}` });
    await expect(dashRow, 'WS-01: the seeded workshop row must render from the live stream').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the visible row count is a lower bound on the Firestore collection count: the app shows
    // every doc it streamed (all=no filter), so renderedRows >= the count of OUR seeded run docs (3).
    // We compare the app-rendered table to an INDEPENDENT Firestore count — never to a value we wrote.
    const seededCount = await countWhere('workshopconfiguration', [['testrunid', '==', RUN]]);
    expect(seededCount, 'WS-01: precondition — 3 seeded workshops for this run').toBe(3);
    const renderedRows = await page.locator('table.workshops-table tr.mat-mdc-row, table.workshops-table tr[mat-row]').count();
    expect(renderedRows, `WS-01: app rendered ${renderedRows} rows; must be >= ${seededCount} seeded`).toBeGreaterThanOrEqual(seededCount);
  });

  // ===========================================================================================
  // WS-03 — the 'active' status filter shows only active workshops; visible <= Firestore active count
  // ===========================================================================================
  test('WS-03 active-status filter never shows more rows than the live count of active workshops', async ({ page }) => {
    await loginAsWshopAdmin(page);
    await page.goto('/workshops', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/workshops/, { timeout: 30_000 });

    // Wait for the table to populate before filtering.
    await expect(page.locator('tr.mat-mdc-row, tr[mat-row]').first()).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] click the "Active" filter chip; applyAllFilters() keeps only w.active && !completed.
    await page.getByRole('button', { name: /^Active$/ }).click();

    // The seeded inactive workshop must DISAPPEAR (the filter is the app computing over its stream).
    await expect(
      page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Inactive Workshop ${RUN}` }),
      'WS-03: the inactive workshop must be filtered out of the active view',
    ).toHaveCount(0, { timeout: 15_000 });

    // [ASSERT] the app's active view shows no MORE rows than Firestore's independent count of active
    // (non-completed) workshops. Upper-bound only — the stream may lag, but it can't invent actives.
    const firestoreActive = await countWhere('workshopconfiguration', [['active', '==', true], ['workshopcompleted', '==', false]]);
    const visibleActive = await page.locator('table.workshops-table tr.mat-mdc-row, table.workshops-table tr[mat-row]').count();
    expect(visibleActive, `WS-03: visible active rows (${visibleActive}) must be <= Firestore active count (${firestoreActive})`).toBeLessThanOrEqual(firestoreActive);
    // And the active workshop we seeded should be present (sanity that the filter didn't nuke everything).
    await expect(page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Active Workshop ${RUN}` })).toBeVisible({ timeout: 15_000 });
  });

  // ===========================================================================================
  // WS-04 — toggling a workshop inactive→active WRITES active:true to Firestore (not just optimistic UI)
  // ===========================================================================================
  test('WS-04 activating a workshop via the slide-toggle writes active:true to Firestore', async ({ page }) => {
    // Precondition (anti-circular): force the pivot workshop back to inactive (idempotent re-runs).
    await resetWorkshopInactive();
    const before = await getDoc('workshopconfiguration', wsIds.W_INACTIVE);
    expect(before, 'WS-04: seeded inactive workshop must exist').toBeTruthy();
    expect(before!.active, 'WS-04: starts inactive').toBe(false);

    await loginAsWshopAdmin(page);
    await page.goto('/workshops', { waitUntil: 'domcontentloaded' });

    // [REAL-UI] find the inactive workshop's row, accept the confirm(), flip its Active slide-toggle.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Inactive Workshop ${RUN}` });
    await expect(row, 'WS-04: the inactive workshop row must render').toBeVisible({ timeout: 30_000 });
    page.once('dialog', (d) => d.accept()); // onWorkshopStatusChange() opens window.confirm
    // The Active column is the first cell; its mat-slide-toggle's clickable button toggles state.
    await row.locator('mat-slide-toggle button, mat-slide-toggle input[type="checkbox"], mat-slide-toggle').first().click();

    // [ASSERT] the app's updateDoc wrote active:true (workshops.component.ts:199). Polled — the value the
    // PRODUCT wrote on the real toggle, not the value the test wrote (the test only reset it to false).
    const after = await pollUntil(
      () => getDoc('workshopconfiguration', wsIds.W_INACTIVE),
      (d) => !!d && d.active === true,
      { label: 'WS-04: workshopconfiguration.active → true', timeoutMs: 30_000 },
    );
    expect(after!.active, 'WS-04: active flipped to true').toBe(true);
  });

  // ===========================================================================================
  // WS-05 — workshop-config detail-page save WRITES detailpage.title to Firestore (output vs input)
  // ===========================================================================================
  test('WS-05 workshopconfig detail-page save writes the typed title to Firestore', async ({ page }) => {
    // /workshopconfig/:id is UNGUARDED — but we log in anyway so the component's guard.getRoles()
    // profile-map calls in the constructor resolve a real profile.
    await loginAsWshopAdmin(page);
    await page.goto(`/workshopconfig/${wsIds.W_INACTIVE}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`workshopconfig/${wsIds.W_INACTIVE}`), { timeout: 30_000 });

    // The detail-page form is on the default "Enrollment Page" tab. Wait for the title input the app
    // patched from the seeded doc (detailPageForm.patchValue, ts:1151), then type a NEW known title.
    const titleInput = page.locator('input[formcontrolname="title"]');
    await expect(titleInput, 'WS-05: the detail-page title input must render').toBeVisible({ timeout: 30_000 });
    await expect(titleInput).toHaveValue(/Inactive Workshop/, { timeout: 15_000 }); // patched from Firestore

    const newTitle = `WS05 Renamed ${RUN} ${Date.now()}`;
    await titleInput.fill(newTitle);

    // [REAL-UI] click the floating Save FAB for the detail page. Its accessible name is the aria-label
    // "Save Enrollment" (workshop-configuration.html:354, (click)="saveDetailPage()") — NOT "Save Detail Page".
    await page.getByRole('button', { name: /Save Enrollment/i }).click();

    // [ASSERT] the app's updateDoc wrote { detailpage: { ..., title: newTitle } } (ts:1518). Read it back
    // from Firestore and compare to the KNOWN typed input — app output vs known input (anti-circular).
    const after = await pollUntil(
      () => getDoc('workshopconfiguration', wsIds.W_INACTIVE),
      (d) => !!d && (d as any).detailpage?.title === newTitle,
      { label: 'WS-05: detailpage.title === typed title', timeoutMs: 30_000 },
    );
    expect((after as any)!.detailpage.title, 'WS-05: the app persisted the typed title').toBe(newTitle);
  });
});
