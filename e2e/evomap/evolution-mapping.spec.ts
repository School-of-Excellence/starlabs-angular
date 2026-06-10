// evolution-mapping.spec.ts — Evolution Mapping admin catalogue: table render, add-via-dialog,
// soft-delete, Make-Live publish, urllive side-effect, and deleteVideo-from-live. Every case drives the
// REAL /evolutionmapping Angular screen and asserts a value the APP COMPUTED/RENDERED from its Firestore
// stream OR the value the APP WROTE on a real click — compared to a KNOWN seeded number, never a value
// the test itself wrote (anti-circularity). The seed is the precondition, never the assertion.
//
// Recon: e2e/recon-allcomp/evolution-mapping.md (EM-01/02/04/05/06/07).
import { test, expect } from '@playwright/test';
import {
  evoProfileIds, evoIds, evoTitles, evoUrls,
  installEvomapStubs, loginAsEvoAdmin,
  resetMakeLivePreconditions, resetDeleteVideoPreconditions, resetDeleteTargetRow,
  countNonDeletedFor, countUrlliveTrueFor,
} from './support/evomap';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, queryWhere, pollUntil } from '../queue/support/firestore-admin';

// A MatTable row (Angular Material renders either tr.mat-mdc-row or tr[mat-row]).
const ROW = 'tr.mat-mdc-row, tr[mat-row]';

test.describe('Evolution Mapping — admin catalogue (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvomapStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'evolution-mapping: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EM-01 — the main table renders the seeded (non-deleted) rows for a participant
  // ===========================================================================================
  test('EM-01 /evolutionmapping renders the seeded catalogue rows (app-queried from Firestore)', async ({ page }) => {
    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionmapping/, { timeout: 30_000 });

    // [REAL-UI] getEvolutionMapping() queries evolutionmappingvideo (where deleted!=true) and builds the
    // table. Wait for the pLive "Live Pre" row the APP rendered (selected by UNIQUE seeded title text).
    const l1Row = page.locator(ROW).filter({ hasText: evoTitles.L1 });
    await expect(l1Row, 'EM-01: the seeded pLive catalogue row must render').toBeVisible({ timeout: 30_000 });
    // A few more seeded titles must be present (across participants — the table is global).
    await expect(page.locator(ROW).filter({ hasText: evoTitles.L2 })).toBeVisible();
    await expect(page.locator(ROW).filter({ hasText: evoTitles.D1 })).toBeVisible();

    // [ASSERT] the count the ADMIN reads back for pLive (same non-deleted filter the table applies)
    // equals the KNOWN seeded count (2 pLive rows) — not a test-written value. (Index-free helper:
    // single-equality profileid query + JS deleted!=true filter, so no composite index is required.)
    const pLiveCount = await countNonDeletedFor(evoProfileIds.pLive);
    expect(pLiveCount, 'EM-01: pLive has exactly its 2 seeded non-deleted catalogue rows').toBe(2);
  });

  // EM-02 (add-evolution 4-step dialog) + EM-03 (edit) now live in evomap-deep.spec.ts — implemented to
  // full depth there (the recon's deferred dialog flow). This file keeps the read-path / soft-delete /
  // make-live cases. Do not re-add EM-02 here.

  // ===========================================================================================
  // EM-04 — Soft-delete a row → it disappears from the table AND deleted==true in Firestore
  // ===========================================================================================
  test('EM-04 deleting a row writes deleted:true (app updateDoc) and drops it from the table', async ({ page }) => {
    // Precondition (idempotent): ensure the delete-target row is present + not deleted, so the case is
    // re-run-stable. This is a PRECONDITION write — the assertion is on the value the APP writes on click.
    await resetDeleteTargetRow();

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    const delRow = page.locator(ROW).filter({ hasText: evoTitles.D1 });
    await expect(delRow, 'EM-04: the delete-target row must render before deletion').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] click the row's Delete FAB and accept the window.confirm.
    page.once('dialog', (d) => d.accept());
    await delRow.getByRole('button', { name: /delete icon/i }).click();

    // [ASSERT] the app's updateDoc wrote deleted:true (evolution-mapping.component.ts:496) — polled.
    await pollUntil(
      () => getDoc('evolutionmappingvideo', evoIds.EV_D1),
      (d) => !!d && d.deleted === true,
      { label: 'EM-04: EV_D1.deleted -> true', timeoutMs: 30_000 },
    );
    // And getEvolutionMapping() re-queried (where deleted!=true) → the row is gone from the table.
    await expect(page.locator(ROW).filter({ hasText: evoTitles.D1 }),
      'EM-04: the deleted row must disappear from the re-queried table').toHaveCount(0, { timeout: 15_000 });
  });

  // ===========================================================================================
  // EM-05 — Make Live publishes liveevolutionmapping/{pLive} with live:true + videolist.length == 2
  // EM-06 — …and flips urllive:true on exactly the two selected catalogue rows
  // ===========================================================================================
  test('EM-05/06 Make-Live publishes the live doc (live:true, videolist=2) and flips urllive on the selected rows', async ({ page }) => {
    // Precondition (anti-circular): NO live doc for pLive yet, and both pLive rows urllive:false.
    await resetMakeLivePreconditions();
    expect(await getDoc('liveevolutionmapping', evoProfileIds.pLive), 'EM-05: pLive starts with no live doc').toBeNull();

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    const l1Row = page.locator(ROW).filter({ hasText: evoTitles.L1 });
    const l2Row = page.locator(ROW).filter({ hasText: evoTitles.L2 });
    await expect(l1Row, 'EM-05: pLive row 1 must render').toBeVisible({ timeout: 30_000 });
    await expect(l2Row, 'EM-05: pLive row 2 must render').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] select both pLive rows (same participant — selection allows it), then click Make Live.
    await l1Row.locator('mat-checkbox input, mat-checkbox, input[type="checkbox"]').first().click();
    await l2Row.locator('mat-checkbox input, mat-checkbox, input[type="checkbox"]').first().click();
    const makeLiveFab = page.locator('[aria-label="make live"]');
    await expect(makeLiveFab, 'EM-05: Make-Live FAB appears once rows are selected').toBeVisible({ timeout: 15_000 });
    await makeLiveFab.click();

    // In the dialog, set a mandatory title then click Make Live.
    const titleInput = page.locator('input[placeholder="Enter a title"]');
    await expect(titleInput, 'EM-05: the live-mapping dialog title input must render').toBeVisible({ timeout: 20_000 });
    await titleInput.fill(`EVOM Published ${process.env.EVOM_RUNID || 'evom'}`);
    await page.getByRole('button', { name: /^\s*Make Live\s*$/i }).click();

    // [ASSERT] the app setDoc'd liveevolutionmapping/{pLive} with live:true and a videolist of exactly the
    // two selected urls — N==2 is the KNOWN seeded selection size, the app computed+wrote these fields.
    const live = await pollUntil(
      () => getDoc('liveevolutionmapping', evoProfileIds.pLive),
      (d) => !!d && d.live === true && Array.isArray((d as any).videolist) && (d as any).videolist.length === 2,
      { label: 'EM-05: liveevolutionmapping/pLive -> live:true, videolist.length==2', timeoutMs: 30_000 },
    );
    expect((live as any).videolist.sort(), 'EM-05: videolist holds exactly the two selected urls').toEqual([evoUrls.L1, evoUrls.L2].sort());

    // EM-06 [CF-SIDEEFFECT-style] makeLive batch-updated urllive:true on each selected catalogue row.
    await pollUntil(
      () => getDoc('evolutionmappingvideo', evoIds.EV_L1),
      (d) => !!d && d.urllive === true,
      { label: 'EM-06: EV_L1.urllive -> true', timeoutMs: 30_000 },
    );
    await pollUntil(
      () => getDoc('evolutionmappingvideo', evoIds.EV_L2),
      (d) => !!d && d.urllive === true,
      { label: 'EM-06: EV_L2.urllive -> true', timeoutMs: 30_000 },
    );
    // Exactly the two selected rows are now live for pLive (app-written count vs KNOWN selection size).
    // Index-free: single-equality profileid query + JS urllive==true filter (no composite index).
    const liveCount = await countUrlliveTrueFor(evoProfileIds.pLive);
    expect(liveCount, 'EM-06: exactly the 2 selected pLive rows are urllive:true').toBe(2);
  });

  // ===========================================================================================
  // EM-07 — Remove a video from an existing live mapping → videolist shrinks AND urllive flips false
  // ===========================================================================================
  test('EM-07 deleteVideo shrinks liveevolutionmapping.videolist by 1 and flips that row urllive:false', async ({ page }) => {
    // Precondition: pDel has a live mapping of EXACTLY 2 urls, both catalogue rows urllive:true.
    await resetDeleteVideoPreconditions();
    const beforeDoc = await getDoc('liveevolutionmapping', evoProfileIds.pDel);
    expect((beforeDoc as any)?.videolist?.length, 'EM-07: pDel live mapping starts with 2 videos').toBe(2);

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionmapping/, { timeout: 30_000 });

    // [REAL-UI] open the Live Evolution Mapping tab, click the pDel row → opens the live dialog (Update mode).
    await page.getByRole('tab', { name: /Live Evolution Mapping/i }).click();
    const pDelLiveRow = page.locator(ROW).filter({ hasText: `EVOM pDel Live` });
    await expect(pDelLiveRow, 'EM-07: pDel live row must render in the Live tab').toBeVisible({ timeout: 30_000 });
    await pDelLiveRow.locator('td').first().click();

    // The live dialog renders one MatTable row per video with a Delete FAB. Delete the FIRST video row.
    const dialogDeleteBtn = page.locator('[aria-label="delete icon"]').first();
    await expect(dialogDeleteBtn, 'EM-07: the live dialog must render a per-video delete button').toBeVisible({ timeout: 20_000 });
    await dialogDeleteBtn.click();

    // [ASSERT] the app updateDoc'd liveevolutionmapping/{pDel}.videolist via arrayRemove → length 2 -> 1.
    const afterDoc = await pollUntil(
      () => getDoc('liveevolutionmapping', evoProfileIds.pDel),
      (d) => !!d && Array.isArray((d as any).videolist) && (d as any).videolist.length === 1,
      { label: 'EM-07: pDel videolist length 2 -> 1', timeoutMs: 30_000 },
    );
    // The removed url's catalogue row had urllive flipped to false by the app (deleteVideo step 2).
    const remainingUrl = (afterDoc as any).videolist[0];
    const removedUrl = remainingUrl === evoUrls.X1 ? evoUrls.X2 : evoUrls.X1;
    const removedRow = await queryWhere('evolutionmappingvideo', [['videourl', '==', removedUrl]]);
    expect(removedRow.length, 'EM-07: the removed url maps to a catalogue row').toBeGreaterThanOrEqual(1);
    expect(removedRow[0].urllive, 'EM-07: the app flipped the removed row urllive:false').toBe(false);
  });
});
