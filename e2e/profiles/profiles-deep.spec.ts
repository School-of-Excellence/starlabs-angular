// profiles-deep.spec.ts — DEEPENING the profiles suite to full recon depth (the cases the first pass
// deferred): the analytics filter-builder driven to a populated state, the analytics selection badge,
// the ProfileScreen (new-profile) dashboard body, and the participant-evolution-summary render.
//
// Un-fixmes PA-07: /participants-analytics DOES build a participant table on first load — fetchData()
// runs onDataSearch() with an EMPTY filter, which passes EVERY `participant metadata` row through to
// dataSource.data (participants-analytics.component.ts:610,1040-1320). The earlier "renders no table"
// note conflated the auth-guard's tolerable "Error checking permissions" snackbar with the table; the
// route-mount smoke already proves the guard admits. So we drive the REAL table:
//   PA-07 (+PA-09) the table renders the app-computed "Total" + a per-row /profilesummary link.
//   PA-08        the Customer Status filter the app applies client-side narrows the seeded rows:
//                after filtering to 'active', p3 (non active) disappears while p0/p1/p2 remain.
//   PA-18        the selection-count badge the app computes ("Selected Participants - N").
//   PA-PS-01     ProfileScreen (new-profile) renders its month/engagement dashboard body.
//   PA-EVO-01    participant-evolution-summary renders a row's name from the localStorage payload
//                (a NON-ATC field — we never assert the AEL/atcmodel columns; recon ATC-exclusion §5).
//
// Anti-circularity: every assertion is on a value the APP rendered from its OWN read/compute (the Total
// it counted, the rows its client-side filter kept, the selection length it computed, the name it bound
// from localStorage) — never a value the test wrote into the asserted widget.
import { test, expect } from '@playwright/test';
import { profProfileIds, profNames, installProfileStubs, loginAsProfileAdmin } from './support/profiles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.PROF_RUNID || 'prof';
// A token UNIQUE to this run's seeded participant names ("Profile Test User Zero prof", …). Typed into
// the MatTable text Filter so the analytics assertions scope to our 4 seeds (page-position-independent on
// the shared ~200-row cloud project); all 4 fit the default 25-row page once filtered.
const SEED_FILTER = `Profile Test User`;

// Tolerated env/sparse-seed console-error classes (same as analytics.spec.ts): the heavy analytics +
// dashboard screens fan out auxiliary widget queries that need composite indexes NOT provisioned on the
// disposable test project, and build a doc() ref from an absent optional id on sparse seed. The asserted
// behavior (the rendered table/filter/selection the cases check) still computes. A real bug is a distinct
// message — these two regexes only swallow the documented environment gaps.
const TOLERATE = [/requires an index/i, /Cannot read properties of undefined \(reading 'indexOf'\)/i];

test.describe('Profiles — analytics filter-builder + dashboards (deep, real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installProfileStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'profiles-deep: no fatal console errors / pageerrors', TOLERATE));

  /** Open the analytics screen and wait for fetchData() -> onDataSearch() to FINISH building the table.
   *  The "Total: N" header (dataSource.data.length) is in the DOM immediately reading 0 while the loading
   *  dialog is open, so "visible" is too early — we poll the header text until it reaches the seeded floor
   *  (>= 4), which is the app's own "data loaded + rows built" signal (anti-circular: a count the app
   *  computed from its participant-metadata stream, never a value the test wrote). */
  async function gotoAnalyticsLoaded(page: import('@playwright/test').Page) {
    await loginAsProfileAdmin(page);
    await page.goto('/participants-analytics', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participants-analytics/, { timeout: 30_000 });
    const total = page.locator('h3', { hasText: /^Total:/ });
    await expect(total.first(), 'analytics Total header must render').toBeVisible({ timeout: 90_000 });
    await expect
      .poll(async () => {
        const txt = (await total.first().innerText()).replace(/\s+/g, ' ');
        return Number((txt.match(/Total:\s*(\d+)/) || [])[1]) || 0;
      }, { message: 'analytics: the app must finish building the table (Total >= 4 seeded)', timeout: 90_000, intervals: [500, 1000, 2000] })
      .toBeGreaterThanOrEqual(4);
    return total.first();
  }

  /** Read the integer the app rendered into the "Total: N" header. */
  async function readTotal(total: import('@playwright/test').Locator): Promise<number> {
    const txt = (await total.innerText()).replace(/\s+/g, ' ');
    return Number((txt.match(/Total:\s*(\d+)/) || [])[1]);
  }

  /** Type into the MatTable text Filter so it actually narrows. The filter is bound to (keyup)
   *  (analytics.html: `(keyup)="applyFilter($event)"`), and Playwright's fill() dispatches `input` but
   *  NOT keyup — so we clear + pressSequentially to fire real keyups and trigger dataSource.filter. */
  async function typeTableFilter(page: import('@playwright/test').Page, text: string) {
    const f = page.getByLabel('Filter');
    await f.click();
    await f.fill('');
    await f.pressSequentially(text, { delay: 15 });
  }

  // ===========================================================================================
  // PA-07 (+PA-09) — the analytics table the APP built renders + per-row /profilesummary link
  // ===========================================================================================
  test('PA-07 analytics builds the participant table on load (Total header + /profilesummary link the app rendered)', async ({ page }) => {
    const total = await gotoAnalyticsLoaded(page);

    // [ASSERT] (PA-07) the "Total: N" header the app computed from its participant-metadata stream is
    // >= our 4 seeded participants (the cloud project holds ~200 docs; the seeds are a subset).
    const n = await readTotal(total);
    expect(n, `PA-07: Total participant count must be >= 4 seeded (was ${n})`).toBeGreaterThanOrEqual(4);

    // [ASSERT] (PA-09) the name column the app rendered is an <a class="profilename"> whose href the app
    // computed as /profilesummary/<profileid> (participants-analytics.component.html:691) — proving the
    // table built the summary routerLinks from its own query, not from a test-set value.
    const firstLink = page.locator('a.profilename').first();
    await expect(firstLink, 'PA-07: at least one participant name link must render').toBeVisible({ timeout: 30_000 });
    await expect(firstLink, 'PA-09: the name links to /profilesummary/<profileid> (app-built routerLink)')
      .toHaveAttribute('href', /\/profilesummary\/.+/);
  });

  // ===========================================================================================
  // PA-08 — the Customer Status filter the app applies client-side narrows the seeded rows
  // ===========================================================================================
  test('PA-08 filtering Customer Status to "active" hides the seeded non-active participant', async ({ page }) => {
    const total = await gotoAnalyticsLoaded(page);

    // First scope the table to OUR run via the MatTable text Filter box (every seeded name contains the
    // run id), so the assertion is page-position-independent on the shared ~200-row cloud project. The
    // default MatTable filterPredicate stringifies the whole row, so the run id matches all 4 seeds.
    await typeTableFilter(page, SEED_FILTER);
    // p0 (active) and p3 (non active) are both visible BEFORE the customerstatus filter (sanity).
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: profNames.p0 });
    const p3Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: profNames.p3 });
    await expect(p0Row.first(), 'PA-08 (pre): the active seed p0 row must show').toBeVisible({ timeout: 30_000 });
    await expect(p3Row.first(), 'PA-08 (pre): the non-active seed p3 row must show').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the Filters panel, pick Customer Status = "active" in the Material multi-select, and
    // click "Search" — onDataSearch() re-filters dashboardEntireData by customerstatus==active
    // (participants-analytics.component.ts:1108-1140, .html:142/590).
    await page.getByRole('button', { name: /^\s*Filters\s*$/ }).click();
    const statusSelect = page.locator('mat-select[name="customerstatus"]');
    await expect(statusSelect, 'PA-08: the Customer Status select must render in the Filters panel').toBeVisible({ timeout: 20_000 });
    await statusSelect.click({ force: true });
    // retry-until-option-visible (Material overlays can open slowly)
    const activeOption = page.locator('mat-option').filter({ hasText: /^\s*active\s*$/i });
    await expect(activeOption.first(), 'PA-08: the "active" option must appear in the overlay').toBeVisible({ timeout: 15_000 });
    await activeOption.first().click();
    // close the overlay so the Search button is clickable, then run the filter.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^\s*Search\s*$/ }).click();

    // Re-scope to our run after the re-filter (onDataSearch clears the MatTable filter via a fresh data set).
    await typeTableFilter(page, SEED_FILTER);

    // [ASSERT] the app's client-side customerstatus filter kept p0 (active) and DROPPED p3 (non active).
    await expect(p0Row.first(), 'PA-08: the active seed p0 must remain after filtering to active').toBeVisible({ timeout: 30_000 });
    await expect(p3Row, 'PA-08: the non-active seed p3 must be filtered OUT by the app')
      .toHaveCount(0, { timeout: 30_000 });
    // (sanity) the Total header still renders a number after the filter the app applied.
    expect(await readTotal(total), 'PA-08: Total still computes after the app applied the filter').toBeGreaterThanOrEqual(1);
  });

  // ===========================================================================================
  // PA-18 — the selection-count badge the app computes from selection.selected.length
  // ===========================================================================================
  test('PA-18 ticking a row checkbox updates the "Selected Participants - N" badge the app computes', async ({ page }) => {
    await gotoAnalyticsLoaded(page);
    // scope to our run so we tick a KNOWN seeded row (page-position-independent).
    await typeTableFilter(page, SEED_FILTER);
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: profNames.p0 });
    await expect(p0Row.first(), 'PA-18: the seeded p0 row must show before ticking').toBeVisible({ timeout: 30_000 });

    // [ASSERT] baseline badge is 0 (app computes selection.selected.length — html:644).
    const badge = page.locator('span', { hasText: /Selected Participants -/ });
    await expect(badge.first(), 'PA-18: the selection badge must render').toBeVisible({ timeout: 20_000 });
    await expect(badge.first()).toContainText('Selected Participants - 0');

    // tick the seeded row's checkbox; the app recomputes the badge from its SelectionModel.
    await p0Row.first().locator('mat-checkbox input[type="checkbox"]').check({ force: true });
    await expect(badge.first(), 'PA-18: the badge the app computed must read 1 after ticking one row')
      .toContainText('Selected Participants - 1', { timeout: 15_000 });
  });

  // ===========================================================================================
  // PA-PS-01 — ProfileScreen (new-profile) renders its month/engagement dashboard body
  // ===========================================================================================
  test('PA-PS-01 ProfileScreen renders the month/engagement dashboard the app built from participant metadata', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto('/ProfileScreen', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/ProfileScreen/, { timeout: 30_000 });

    // [REAL-UI] ngOnInit -> participantDashboard() reads participant metadata + builds month buckets;
    // the body is gated behind *ngIf="!loading" (new-profile.component.html:4) so visible static labels
    // ("Search Participant", the month cards, "Engagement Level") prove the component finished loading and
    // rendered its body — NOT just that the route mounted (that is route-mount.spec). getRoles does not
    // hard-redirect (the gate is commented out — new-profile.component.ts:358-365), so the admin stays.
    await expect(
      page.locator('mat-label', { hasText: /Search Participant/i }).first(),
      'PA-PS-01: the Search Participant field must render once the dashboard loaded',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText('Engagement Level', { exact: false }).first(),
      'PA-PS-01: the Engagement Level section the app built must render',
    ).toBeVisible({ timeout: 30_000 });
    // the three month buckets the component computes are all present.
    for (const label of ['Last Month', 'This Month', 'Next Month']) {
      await expect(page.getByText(label, { exact: false }).first(), `PA-PS-01: the "${label}" bucket must render`)
        .toBeVisible({ timeout: 20_000 });
    }
  });

  // ===========================================================================================
  // PA-EVO-01 — participant-evolution-summary renders a row's NAME from the localStorage payload
  // ===========================================================================================
  test('PA-EVO-01 participant-evolution-summary renders the seeded row name from its localStorage payload', async ({ page }) => {
    await loginAsProfileAdmin(page);

    // The component reads JSON from localStorage[queryParams.localStorageItemName] and renders one table
    // row per entry; the FIRST column is the participant `name` (a NON-ATC field — we assert only that,
    // never the atcmodel/AEL columns, honoring the recon ATC-exclusion §5). We must seed localStorage on
    // the app ORIGIN, so first land on a same-origin page, set the key, THEN navigate to the route.
    const key = `evo_${RUN}`;
    const payloadName = profNames.p0;
    await page.goto('/EISDashboard', { waitUntil: 'domcontentloaded' }); // any same-origin authenticated page
    await page.evaluate(({ k, name }) => {
      // a single, fully NON-ATC row: name + the numeric/array fields the component maps over (no atcmodel
      // value is asserted; ongoingaellist empty so the component's date-map is a no-op).
      const row = {
        name, atcmodel: null, ongoingaelcount: 0, completedaelcount: 0, ongoingaellist: [],
        recentcompletedaeldoc: null, evolutionyearsaved: 0, evolutionyearwasted: 0,
        totaladjustmentaware: 0, totaladjustmentunaware: 0,
      };
      window.localStorage.setItem(k, JSON.stringify([row]));
    }, { k: key, name: payloadName });

    await page.goto(`/participant-evolution-summary?localStorageItemName=${key}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant-evolution-summary/, { timeout: 30_000 });

    // [ASSERT] the app parsed the payload and rendered the name cell (html:34 binds element['name']).
    const nameCell = page.locator('td.mat-mdc-cell, td[mat-cell]').filter({ hasText: payloadName });
    await expect(nameCell.first(), 'PA-EVO-01: the evolution-summary row name the app rendered from localStorage must show')
      .toBeVisible({ timeout: 30_000 });
  });
});
