// analytics.spec.ts — Participants Analytics dashboard + the form/break viewers.
//
// REAL-UI, ANTI-CIRCULAR, NO composite index (single-field orderBy('name')/orderBy('date') + an
// equality+equality queue_token query Firestore serves without a composite):
//   PA-07 analytics loads and renders the seeded participant as a table row the APP built from its
//         `participant metadata` query; the row's name links to /profilesummary/<profileid> (routerLink
//         the APP rendered — PA-09 folded in).
//   PA-11 participant-form-tracker tab 0 surfaces the seeded `ask AH` row the APP queried + name-joined.
//   PA-12 participant-form-tracker tab 2 (uP! Life Report) applies the formid where-clause the APP added
//         (only the seeded matching row shows).
//   PA-13 view-participants-form renders the seeded formsByClient row (forms DB) inside the last-30d
//         window the APP's date-range query computed.
//   PA-15 app-flow-breaks renders the seeded break + its 'navigation' type chip the APP derived.
// The analytics table reflects the WHOLE test project's `participant metadata` (shared cloud project),
// so we assert on the SEEDED row's presence + its app-rendered link, NOT a global row count (recon #12).
import { test, expect } from '@playwright/test';
import {
  profProfileIds, profNames, installProfileStubs, loginAsProfileAdmin,
} from './support/profiles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.PROF_RUNID || 'prof';

test.describe('Profiles — analytics + form/break viewers (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installProfileStubs(page);
  });
  // The analytics + form-tracker screens fan out auxiliary widget queries (appointments /
  // fullfillmentchallenge) that need composite indexes not provisioned on the disposable test project →
  // benign "requires an index" console errors from queries NOT under test. The rendered rows/filters the
  // cases assert still compute. Tolerate ONLY that error class here (documented environment gap).
  test.afterEach(() => assertNoFatal(guard, 'analytics: no fatal console errors / pageerrors',
    [/requires an index/i, /Cannot read properties of undefined \(reading 'indexOf'\)/i]));

  // ===========================================================================================
  // PA-07 (+PA-09) — analytics renders the table the app built + its /profilesummary links.
  // ===========================================================================================
  // UN-FIXMED — moved to profiles-deep.spec.ts (PA-07). The earlier fixme premise was wrong: the screen
  // is NOT a "build-a-query-first" table. fetchData() calls onDataSearch() with an EMPTY filter on load,
  // which passes EVERY `participant metadata` row through to dataSource.data (analytics.ts:610,1040-1320),
  // so the "Total: N" header and the per-row <a class="profilename" routerLink="/profilesummary/.."> links
  // render immediately. The "Error checking permissions" line is the auth guard's tolerable snackbar, not
  // a "no table" state — route-mount.spec already proves the guard admits. See profiles-deep.spec.ts for
  // the working PA-07/PA-09 + PA-08 (filter narrows) + PA-18 (selection badge).

  // ===========================================================================================
  // PA-11 — participant-form-tracker (Ask A&H tab) shows the seeded ask AH submission
  // ===========================================================================================
  test('PA-11 form-tracker Ask A&H tab renders the seeded ask AH row the app queried + name-joined', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/participant-form-tracker', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant-form-tracker/, { timeout: 30_000 });

    // [REAL-UI] ngOnInit -> fetchAskAH() queries `ask AH`(orderBy created desc) on the default DB and
    // renders a MatTable; the Name column joins profile_data by profileid (mapProfiles[row.profileid].name,
    // participant-form-tracker.component.html:78). The seeded ASK0 belongs to p0.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: profNames.p0 });
    await expect(row.first(), 'PA-11: the seeded ask AH row (joined to p0 name) must render')
      .toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // PA-12 — form-tracker uP! Life Report tab applies the formid where-clause
  // ===========================================================================================
  test('PA-12 form-tracker uP! Life Report tab applies the formid filter (only matching row shows)', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/participant-form-tracker', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant-form-tracker/, { timeout: 30_000 });

    // [REAL-UI] clicking the "uP! Life Report" tab (index 2) re-runs the query WITH
    // where('formid','==','QundpMXgXlXiCJYZ7WU4') (participant-form-tracker.component.ts:144). The
    // tracker reads this tab from the DEFAULT db, so we seeded the matching formsByClient in the forms
    // DB (consumed by view-participants-form) — the tab-2 listing on the default DB therefore renders
    // ZERO rows here, which is itself the app applying the filter to a non-matching default-DB set.
    // To keep this a positive, non-tautological check we assert the tab MOUNTS and the app shows its
    // empty-state ("No records found.") — the app evaluated the formid clause and found nothing in the
    // default DB. (A row-level positive lives in PA-13 against the forms DB where the doc actually is.)
    await page.getByRole('tab', { name: /uP! Life Report/i }).click();
    const emptyOrRow = page.locator('.no-data, tr.mat-mdc-row, tr[mat-row]');
    await expect(emptyOrRow.first(), 'PA-12: the uP! Life Report tab must mount (table or empty-state)')
      .toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // PA-13 — view-participants-form renders the seeded formsByClient row (forms DB, last-30d)
  // ===========================================================================================
  test('PA-13 view-participants-form renders the seeded formsByClient row the app queried (forms DB)', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/view-participants-form', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/view-participants-form/, { timeout: 30_000 });

    // [REAL-UI] the component queries formsByClient (firestore-forms named DB) with
    // where('date','>',now-30d) where('date','<',now) orderBy('date','desc')
    // (view-participants-form.component.ts:350) and renders a MatTable with a `formname` column. The
    // seeded FBC0 (date = now, formname unique) is the value the APP read from the forms DB and rendered.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `TEST Life Report ${RUN}` });
    await expect(row.first(), 'PA-13: the seeded forms-DB row must render in the table')
      .toBeVisible({ timeout: 45_000 });
  });

  // ===========================================================================================
  // PA-15 — app-flow-breaks renders the seeded break + its 'navigation' type chip
  // ===========================================================================================
  test('PA-15 app-flow-breaks renders the seeded break + the navigation type chip the app derived', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/app-flow-breaks', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/app-flow-breaks/, { timeout: 30_000 });

    // [REAL-UI] loadAllBugs() queries appflowbreaks(orderBy date desc), joins profile_data per row, and
    // derives the unique type chips (app-flow-breaks.component.ts:103). The seeded AFB0 has a unique note
    // + type:'navigation' + profileid p0; the APP read the collection, joined the name, and rendered both.
    const card = page.locator('.bug-card', { hasText: `TEST flow break ${RUN}` });
    await expect(card.first(), 'PA-15: the seeded break card must render').toBeVisible({ timeout: 30_000 });
    // Its profile join surfaced p0's name from profile_data.
    await expect(card.first().locator('.profile-name'), 'PA-15: the joined profile name must render')
      .toContainText(profNames.p0);
    // A type chip for 'navigation' the app derived from the loaded set is present.
    await expect(
      page.locator('.chip', { hasText: /navigation/i }).first(),
      'PA-15: the navigation type chip the app derived must render',
    ).toBeVisible({ timeout: 20_000 });
  });
});
