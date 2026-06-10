// playlist.spec.ts — Recommended Playlist: disable a group → delete:true cascade to the buffermix
// archive doc AND its linked recommended-mix-playlist docs (real slide-toggle → confirm → batch write).
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-16). The /recommendedplaylist screen
// (manage-recommended-playlist-component.ts) loads `buffermix archive` + `recommended mix playlist`
// for the default 3-month window. The "Group" tab (default) renders one row per buffermix group with a
// mat-slide-toggle in the Action column ([checked]="row.delete !== true"). Toggling it OFF calls
// onToggleGroupDelete(row,$event) → window.confirm → updateDoc('buffermix archive', row.docid,
// {delete:true}), then queries `recommended mix playlist where bufferdocref==<group ref>` and
// batch-updates each to {delete:true} (manage-recommended-playlist.ts:924-950).
//
// Anti-circularity: the test seeds the group + both linked docs at delete:false → asserts the APP wrote
// delete:true to the group AND to BOTH linked playlist docs (the cascade the product computed across
// the bufferdocref query). The seeded false is the precondition, never the asserted value. The linked
// docs are asserted by their seeded ids (their delete flips are the app's batch output).
import { test, expect } from '@playwright/test';
import { installModeStubs, loginAsModeAdmin, modeIds, modeContent, resetPlaylistGroupEnabled } from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

test.describe('Modes — Recommended Playlist (disable-group cascade → buffermix + linked playlist docs)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'recommended playlist: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // PM-16 — disabling a group writes delete:true to the buffermix doc AND its 2 linked playlist docs
  // ===========================================================================================
  test('PM-16 disabling a group cascades delete:true to the buffermix archive doc and its linked playlist docs', async ({ page }) => {
    // Precondition (anti-circular): the group + both linked docs start delete:false (date refreshed to
    // now so the group is inside the screen's default 3-month load window on re-runs).
    await resetPlaylistGroupEnabled(modeIds.BUF1, [modeIds.RMP1, modeIds.RMP2]);
    const beforeGroup = await getDoc('buffermix archive', modeIds.BUF1);
    expect(beforeGroup!.delete, 'PM-16: group starts delete:false (enabled)').not.toBe(true);
    for (const id of [modeIds.RMP1, modeIds.RMP2]) {
      const d = await getDoc('recommended mix playlist', id);
      expect(d!.delete, `PM-16: linked playlist ${id} starts delete:false`).not.toBe(true);
    }

    await loginAsModeAdmin(page);
    await page.goto('/recommendedplaylist', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/recommendedplaylist/, { timeout: 30_000 });

    // [REAL-UI] the Group tab is the default tab; loadData() populates groupDataSource. Find the seeded
    // group's row by its run-unique title, then toggle its Action-column slide toggle OFF (disable).
    // onToggleGroupDelete fires window.confirm("…disable this group?") → accept it BEFORE the click lands.
    const groupRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: modeContent.bufGroupTitle });
    await expect(groupRow, 'PM-16: the seeded group row must render in the Group tab').toBeVisible({ timeout: 30_000 });

    page.once('dialog', (d) => d.accept()); // onToggleGroupDelete confirm()
    // The mat-slide-toggle's clickable surface is the internal button/thumb. Click the toggle in the row.
    const toggle = groupRow.locator('mat-slide-toggle button, mat-slide-toggle').first();
    await expect(toggle, 'PM-16: the group enable/disable slide toggle must render').toBeVisible({ timeout: 10_000 });
    await toggle.click();

    // [ASSERT] the app's updateDoc wrote delete:true to the buffermix group doc. Polled — the value the
    // PRODUCT wrote (test seeded delete:false).
    await pollUntil(
      () => getDoc('buffermix archive', modeIds.BUF1),
      (d) => !!d && d.delete === true,
      { label: 'PM-16: buffermix archive group → delete:true', timeoutMs: 30_000 },
    );
    // [ASSERT] the batch cascade flipped BOTH linked recommended-mix-playlist docs (matched by
    // bufferdocref) to delete:true — the app's computed fan-out across the bufferdocref query.
    for (const id of [modeIds.RMP1, modeIds.RMP2]) {
      const after = await pollUntil(
        () => getDoc('recommended mix playlist', id),
        (d) => !!d && d.delete === true,
        { label: `PM-16: linked playlist ${id} → delete:true (cascade)`, timeoutMs: 30_000 },
      );
      expect(after!.delete, `PM-16: linked playlist ${id} disabled by the cascade`).toBe(true);
    }
  });
});
