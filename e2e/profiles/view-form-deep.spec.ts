// view-form-deep.spec.ts — PA-14: the view-participants-form LIKE toggle is a real Firestore write to
// the FORMS DB (firestore-forms). The app's toggleLike() calls updateDoc(getFirestore("firestore-forms"),
// 'formsByClient', docid, { liked:true, likedetails:{...} }) (view-participants-form.component.ts:785-793).
//
// This is the suite's named-DB write-mutation case: a REAL Material-styled icon-button click drives a
// cross-DB write, and we assert the value the APP wrote by reading formsByClient back through the SAME
// named-DB admin handle the app writes to (seeder.getFormsDb) — never a value the test wrote. Idempotent:
// we reset liked->false as a PRECONDITION first, so the case is order- and re-run-independent.
import { test, expect } from '@playwright/test';
import { profProfileIds, profDocIds, installProfileStubs, loginAsProfileAdmin, getFormDoc, resetFormLike } from './support/profiles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.PROF_RUNID || 'prof';
const TOLERATE = [/requires an index/i, /Cannot read properties of undefined \(reading 'indexOf'\)/i];

test.describe('Profiles — view-participants-form like toggle (deep, forms-DB write)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installProfileStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'view-form-deep: no fatal console errors / pageerrors', TOLERATE));

  // ===========================================================================================
  // PA-14 — like toggle writes liked:true to formsByClient (forms DB)
  // ===========================================================================================
  test('PA-14 clicking the like button writes liked:true to formsByClient (the app wrote to the forms DB)', async ({ page }) => {
    // Precondition (anti-circular): reset the seeded row's `liked` to a KNOWN baseline (false) in the
    // forms DB, and verify it — the value we then assert is what the APP writes on the real click.
    await resetFormLike(profDocIds.FBC0, false);
    const before = await getFormDoc(profDocIds.FBC0);
    expect(before, 'PA-14: the seeded forms-DB row must exist').toBeTruthy();
    expect(before!.liked, 'PA-14: baseline liked is false').toBe(false);

    await loginAsProfileAdmin(page);
    await page.goto('/view-participants-form', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/view-participants-form/, { timeout: 30_000 });

    // [REAL-UI] the component queries formsByClient (forms DB, last-30d window) and renders a MatTable; the
    // seeded FBC0 row's formname is unique, so locate that row and click its like icon-button (the
    // `favorite_border` icon while unliked). toggleLike() flips it + updateDoc()s the forms DB.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `TEST Life Report ${RUN}` });
    await expect(row.first(), 'PA-14: the seeded forms-DB row must render in the table').toBeVisible({ timeout: 45_000 });
    // the like button is the icon-button whose mat-icon reads favorite_border (unliked) within this row.
    const likeBtn = row.first().locator('button:has(mat-icon:text-is("favorite_border"))');
    await expect(likeBtn, 'PA-14: the (unliked) like button must render in the row').toBeVisible({ timeout: 15_000 });
    await likeBtn.click();

    // [ASSERT] the app's updateDoc wrote liked:true to the forms DB (named-DB handle, NOT the default DB).
    // Polled — the value the PRODUCT wrote, read back through the same named DB it writes to.
    const after = await pollUntil(
      () => getFormDoc(profDocIds.FBC0),
      (d) => !!d && d.liked === true,
      { label: 'PA-14: formsByClient.liked -> true (forms DB)', timeoutMs: 30_000, intervalMs: 1000 },
    );
    expect(after!.liked, 'PA-14: the app wrote liked:true to the forms DB').toBe(true);
    // likedetails.user is the logged-in admin's profileid the APP stamped (extra app-write proof).
    expect((after!.likedetails as { user?: string } | null)?.user, 'PA-14: the app stamped the liking user')
      .toBe(profProfileIds.admin);

    // Clean up so re-runs / other cases start from liked:false again (precondition write only).
    await resetFormLike(profDocIds.FBC0, false);
  });
});
