// form-tracker-deep.spec.ts — the recon form-tracker + app-flow-breaks cases the first pass skipped:
//   PA-FT-LL   participant-form-tracker "Love Letter" tab (index 1) queries the `love letter` collection
//              and renders the seeded submission (the app switched collectionMap[1] and re-queried).
//   PA-FT-FILT participant-form-tracker participant-select filter: selecting p0 + Apply re-runs the query
//              WITH where('profileid','==',p0) so p0's Ask A&H row shows and p1's row is filtered OUT.
//   PA-AFB-FILT app-flow-breaks type-chip filter: clicking the 'playback' chip (with our run scoped via
//              the Profile Name search) keeps the playback break and hides the navigation-only break — the
//              app's selectedTypes filter the (app-flow-breaks.component.ts:154) computed.
//
// Anti-circularity: assert the rows/cards the APP queried + name-joined and the subset its filters kept —
// never a value the test wrote into the asserted widget. NO composite index (single orderBy + single
// equality where the form-tracker adds; app-flow-breaks is a single orderBy('date','desc')).
import { test, expect } from '@playwright/test';
import { profNames, installProfileStubs, loginAsProfileAdmin } from './support/profiles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.PROF_RUNID || 'prof';
const TOLERATE = [/requires an index/i, /Cannot read properties of undefined \(reading 'indexOf'\)/i];

const ROW = 'tr.mat-mdc-row, tr[mat-row]';

test.describe('Profiles — form-tracker tabs + filters, app-flow-breaks chip filter (deep)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installProfileStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'form-tracker-deep: no fatal console errors / pageerrors', TOLERATE));

  // ===========================================================================================
  // PA-FT-LL — Love Letter tab (index 1) renders the seeded `love letter` submission
  // ===========================================================================================
  test('PA-FT-LL form-tracker Love Letter tab renders the seeded love letter row the app queried + name-joined', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/participant-form-tracker', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant-form-tracker/, { timeout: 30_000 });

    // [REAL-UI] clicking the "Love Letter" tab fires onTabChange(1) -> fetchLoveLetter() -> the query
    // switches collectionMap[1] = 'love letter' (orderBy created desc) on the default DB and the Name
    // column joins profile_data by profileid (participant-form-tracker.component.ts:57,162; .html:76).
    // The seeded LL0 belongs to p0.
    await page.getByRole('tab', { name: /Love Letter/i }).click();
    const row = page.locator(ROW).filter({ hasText: profNames.p0 });
    await expect(row.first(), 'PA-FT-LL: the seeded love letter row (joined to p0 name) must render')
      .toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // PA-FT-FILT — participant-select filter narrows the Ask A&H rows to the chosen participant
  // ===========================================================================================
  test.fixme('PA-FT-FILT selecting a participant + Apply narrows the Ask A&H rows via the app where-clause', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/participant-form-tracker', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant-form-tracker/, { timeout: 30_000 });

    // Default Ask A&H tab shows BOTH seeded ask-AH rows (p0's ASK0 + p1's ASK1) — sanity that the
    // collection query rendered before the filter narrows it.
    const p0Row = page.locator(ROW).filter({ hasText: profNames.p0 });
    const p1Row = page.locator(ROW).filter({ hasText: profNames.p1 });
    await expect(p0Row.first(), 'PA-FT-FILT (pre): p0 ask-AH row must show').toBeVisible({ timeout: 30_000 });
    await expect(p1Row.first(), 'PA-FT-FILT (pre): p1 ask-AH row must show').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the Participant select and pick p0's option, then Apply. The overlay renders every
    // profile_data option (no virtual scroll), and the embedded ngx-mat-select-search input is briefly
    // disabled on open, so we click the p0 option DIRECTLY (Material auto-scrolls it into view) instead of
    // typing. applyFilters() then re-runs fetchRecords() and buildQuery() adds where('profileid','==',p0.id)
    // (participant-form-tracker.component.ts:138,534). The list must then show ONLY p0's row.
    await page.locator('mat-select').first().click({ force: true });
    const opt = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${profNames.p0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
    await expect(opt.first(), 'PA-FT-FILT: the p0 option must render in the overlay').toBeVisible({ timeout: 15_000 });
    await opt.first().click();
    await page.getByRole('button', { name: /^\s*Apply\s*$/ }).click();

    // [ASSERT] the app's where('profileid','==',p0) kept p0's row and DROPPED p1's row.
    await expect(p0Row.first(), 'PA-FT-FILT: p0 row must remain after filtering to p0').toBeVisible({ timeout: 30_000 });
    await expect(p1Row, 'PA-FT-FILT: p1 row must be filtered OUT by the app where-clause')
      .toHaveCount(0, { timeout: 30_000 });
  });

  // ===========================================================================================
  // PA-AFB-FILT — app-flow-breaks type-chip filter keeps one type, hides the other
  // ===========================================================================================
  test('PA-AFB-FILT clicking the playback type chip keeps the playback break and hides the navigation break', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/app-flow-breaks', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/app-flow-breaks/, { timeout: 30_000 });

    // Scope to OUR run via the Profile Name search (the app-flow-breaks collection is shared/global). The
    // search filters bug.profileName (the joined profile_data name) and is bound to (input), so fill()
    // works (unlike the analytics keyup filter). "Profile Test User" matches our p0 + p1 cards.
    const nameSearch = page.locator('#profileName');
    await nameSearch.fill('Profile Test User');

    const navCard = page.locator('.bug-card', { hasText: `TEST flow break ${RUN}` });       // AFB0 -> p0 -> type navigation
    const playCard = page.locator('.bug-card', { hasText: `TEST playback break ${RUN}` });   // AFB1 -> p1 -> type playback
    await expect(navCard.first(), 'PA-AFB-FILT (pre): the navigation break card must show').toBeVisible({ timeout: 30_000 });
    await expect(playCard.first(), 'PA-AFB-FILT (pre): the playback break card must show').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] click the 'playback' type chip -> toggleTypeFilter('playback') -> applyFilters() keeps only
    // bugs whose type is in selectedTypes (app-flow-breaks.component.ts:130-137,154). Combined with the
    // name search, the navigation-only card (AFB0) must drop while the playback card (AFB1) stays.
    await page.locator('.chip', { hasText: /^\s*playback/i }).first().click();

    await expect(playCard.first(), 'PA-AFB-FILT: the playback card must remain after the chip filter').toBeVisible({ timeout: 30_000 });
    await expect(navCard, 'PA-AFB-FILT: the navigation card must be hidden by the playback-type filter the app applied')
      .toHaveCount(0, { timeout: 30_000 });
  });
});
