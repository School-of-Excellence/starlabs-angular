// dashboards.spec.ts — Content & Engagement: read-path dashboards driven through the REAL Angular UI
// with ANTI-CIRCULAR assertions. Each case either asserts a value the APP COMPUTED/RENDERED from its
// own Firestore stream (row counts, filtered counts, the analytics only-solarvoice bucket) vs a KNOWN
// seeded number, or asserts the route mounts (guard admits). No case asserts a value the test wrote.
//
// Recon: e2e/recon-allcomp/content.md (CN-01, CN-02, CN-05, CN-08, CN-13-render + route-mount smoke).
// None of these queries needs a composite index (single-field range/orderBy only).
import { test, expect } from '@playwright/test';
import {
  contentActors, contentText, analyticsProfiles, installContentStubs, loginAsContentAdmin,
} from './support/content';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { countWhere, queryWhere } from '../queue/support/firestore-admin';

const ROW = 'tr.mat-mdc-row, tr[mat-row]';

test.describe('Content — read-path dashboards (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installContentStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'content: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CN-01 — auth-gated route: admin login lands on /audiodashboard (no bounce, no fatal console)
  // ===========================================================================================
  test('CN-01 admin login lands on /audiodashboard (guard admits, no /login bounce)', async ({ page }) => {
    await loginAsContentAdmin(page);
    await page.goto('/audiodashboard', { waitUntil: 'domcontentloaded' });
    // [REAL-UI] the app computed the route transition — the guard read the seeded dashboard grant and
    // admitted the admin. URL stays on audiodashboard (never bounced to /login).
    await expect(page).toHaveURL(/audiodashboard/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Audio Library/i })).toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // CN-02 — audio dashboard renders the seeded `solar voice audios`: app-rendered row count matches
  //          the Admin-SDK count (stream-computed table vs independent server count)
  // ===========================================================================================
  test('CN-02 audio dashboard rows == countWhere("solar voice audios") (app stream vs admin count)', async ({ page }) => {
    await loginAsContentAdmin(page);
    await page.goto('/audiodashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/audiodashboard/, { timeout: 30_000 });

    // The 3 seeded audios must each render as a row the app built from the collectionSnapshots stream.
    for (const i of ['1', '2', '3']) {
      const row = page.locator(ROW).filter({ hasText: `${contentText.audioNamePrefix}_${i}` });
      await expect(row, `CN-02: seeded audio ${i} must render`).toBeVisible({ timeout: 30_000 });
    }

    // [ASSERT] the app-rendered row count equals the independent Admin-SDK count of the collection.
    // The table paginates (pageSize 10); the seeded set is 3, so a render-count==admin-count check is
    // only safe when total <= page size. We assert the stronger run-scoped invariant instead: the
    // number of VISIBLE rows whose name carries this run's prefix equals the seeded audio count (3),
    // and that equals the admin count of those run-scoped docs.
    const seededRows = page.locator(ROW).filter({ hasText: contentText.audioNamePrefix });
    await expect(seededRows).toHaveCount(3, { timeout: 30_000 });
    const adminCount = await countWhere('solar voice audios', [['testrunid', '==', process.env.CONT_RUNID || 'cont']]);
    expect(adminCount, 'CN-02: admin-side count of run-scoped audios').toBe(3);
  });

  // ===========================================================================================
  // CN-05 — series dashboard renders the stream; the tier filter narrows rows to the app-computed set
  // ===========================================================================================
  test('CN-05 series tier filter "free" shows the free series and hides the exclusive one', async ({ page }) => {
    await loginAsContentAdmin(page);
    await page.goto('/seriesdashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/seriesdashboard/, { timeout: 30_000 });

    // Both seeded series render initially (stream-built rows).
    const freeRow = page.locator(ROW).filter({ hasText: contentText.seriesFree });
    const exclRow = page.locator(ROW).filter({ hasText: contentText.seriesExcl });
    await expect(freeRow, 'CN-05: free series renders').toBeVisible({ timeout: 30_000 });
    await expect(exclRow, 'CN-05: exclusive series renders').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] select the tier filter mat-select → "Free". The component's filterPredicate
    // (series-dashboard.component.ts:64) narrows visible rows to type==='free'. force: the floating
    // mat-label notched-outline overlays the trigger and intercepts a normal click.
    const tierSelect = page.locator('mat-select').first();
    await tierSelect.click({ force: true });
    await page.getByRole('option', { name: /^Free$/i }).click();

    // [ASSERT] after filtering the app shows the free series and HIDES the exclusive — the visible set
    // was computed by the app's filterPredicate from the SEEDED `type` values, not by the test. The
    // free/exclusive split was a seed precondition; the partition the app rendered is the assertion.
    await expect(freeRow, 'CN-05: free series still visible after filter').toBeVisible({ timeout: 20_000 });
    await expect(exclRow, 'CN-05: exclusive series filtered out').toBeHidden({ timeout: 20_000 });
  });

  // ===========================================================================================
  // CN-08 — content-analytics dashboard buckets seeded `solarvoice`-only profiles: the app-computed
  //          "SolarVoice" opportunity count (getProfilesOnlyWatchSolarVoice) includes the 3 seeded ones
  // ===========================================================================================
  test('CN-08 analytics "SolarVoice-only" count >= 3 seeded solarvoice-only profiles (app-computed)', async ({ page }) => {
    await loginAsContentAdmin(page);
    await page.goto('/content-analytics-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/content-analytics-dashboard/, { timeout: 30_000 });

    // The dashboard shows a loading overlay (*ngIf="isLoading") until BOTH the analytics stream and the
    // recommended-mix stream resolve. Wait for it to clear, then for the "SolarVoice" opportunity card.
    await expect(page.locator('.loading-overlay'), 'CN-08: loading overlay clears once streams resolve')
      .toHaveCount(0, { timeout: 60_000 });
    const svTitle = page.locator('.opp-title', { hasText: /^SolarVoice$/ });
    await expect(svTitle, 'CN-08: SolarVoice opportunity card must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the count tag next to "SolarVoice" is getProfilesOnlyWatchSolarVoice().length — profiles
    // whose activePlatforms set is exactly {solarvoice}. The app COMPUTED this from its own analytics
    // stream; we seeded 3 such profiles, so the rendered number must be >= 3 (lower bound, since the
    // shared test project may carry other untyped/legacy analytics rows). The seeded count is known.
    // Anchor on the card whose .opp-title is exactly "SolarVoice" (the Eiflix card's is "Eiflix"),
    // then read its .sm-tag count — avoids matching the emoji and the sibling Eiflix card.
    const svCard = page.locator('.card').filter({ has: page.locator('.opp-title', { hasText: /^SolarVoice$/ }) });
    const svCount = svCard.locator('.sm-tag').first();
    await expect(svCount).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => Number((await svCount.innerText()).trim()), {
        message: 'CN-08: app-computed SolarVoice-only count reaches >= 3 (the seeded solarvoice-only profiles)',
        timeout: 45_000,
      })
      .toBeGreaterThanOrEqual(3);

    // Independent cross-check (index-free: single-field equality on profileid, type filtered in JS):
    // the seeded solarvoice profiles really are solarvoice-only in Firestore — each has only
    // solarvoice-type analytics rows. The dashboard's bucket value is DERIVED from the stream, not
    // seeded, so this confirms the precondition without re-asserting the rendered number.
    for (const pf of analyticsProfiles.solarvoice) {
      const rows = await queryWhere('content analytics', [['profileid', '==', pf]]);
      const types = new Set(rows.map((r) => (r as any).type));
      expect(types.has('eiflixcontent'), `CN-08: ${pf} must have NO eiflix rows (so it stays solarvoice-only)`).toBe(false);
      expect(types.has('solarvoice'), `CN-08: ${pf} has solarvoice rows`).toBe(true);
    }
  });

  // ===========================================================================================
  // CN-13a — health stories dashboard renders the seeded story (stream-built row)
  // ===========================================================================================
  test('CN-13a health stories dashboard renders the seeded story row', async ({ page }) => {
    await loginAsContentAdmin(page);
    await page.goto('/healthstories', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/healthstories/, { timeout: 30_000 });

    // [REAL-UI] the seeded story renders as a row the app built from the `health stories` stream.
    const row = page.locator(ROW).filter({ hasText: contentText.health });
    await expect(row, 'CN-13a: seeded health story must render').toBeVisible({ timeout: 30_000 });
    // The row offers the edit action the mutation test drives.
    await expect(row.getByRole('button')).toBeVisible();
  });
});

// ===========================================================================================
// Route-mount smoke — every content route mounts for the admin (guard admits, no /login bounce).
// Proves the dashboard route-grants seeded for the whole group. Skips assertNoFatal (mount-only).
// ===========================================================================================
test.describe('Content — route-mount smoke (guard admits content admin)', () => {
  const ROUTES = [
    '/audiodashboard', '/playlistdashboard', '/seriesdashboard', '/videodashboard',
    '/category-dashboard', '/healthstories', '/playlistads', '/content-analytics-dashboard',
    '/tieraccessconfig', '/learningmaterial',
  ];
  test('every seeded content route mounts (no /login bounce)', async ({ page }) => {
    await installContentStubs(page);
    await loginAsContentAdmin(page);
    const bounced: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800); // bounded settle (networkidle hangs on camera/iframe/stream routes)
      const url = page.url();
      if (/\/login/.test(url)) bounced.push(`${route} -> ${url}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
