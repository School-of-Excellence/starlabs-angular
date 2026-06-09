// dashboard.spec.ts — Mode Dashboard render + auth guard + route-mount smoke.
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-01, PM-18, route-mount).
// Anti-circularity: PM-01 asserts the DOM order the APP rendered from its own `modes` orderBy('sequence')
// query MATCHES an INDEPENDENT admin read of the same catalog (the app's job is to fetch+sort+render;
// the test never writes the asserted order). PM-18 asserts the guard's redirect (no value asserted).
import { test, expect } from '@playwright/test';
import { installModeStubs, loginAsModeAdmin } from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { queryWhere } from '../queue/support/firestore-admin';

test.describe('Modes — Mode Dashboard render (real UI, anti-circular oracle)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'mode dashboard: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // PM-01 — the modes catalog renders, in sequence order, matching an independent admin read
  // ===========================================================================================
  test('PM-01 Mode Dashboard renders the modes catalog in sequence order (app-sorted == admin-read)', async ({ page }) => {
    await loginAsModeAdmin(page);
    await page.goto('/modedashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/modedashboard/, { timeout: 30_000 });

    // [REAL-UI] getModes() reads `modes` orderBy('sequence','asc') and renders each as <p class="mode">.
    // Wait for the list the APP built.
    const modeEls = page.locator('p.mode');
    await expect(modeEls.first(), 'PM-01: the modes catalog must render at least one mode').toBeVisible({ timeout: 30_000 });

    // [ORACLE] read the SAME catalog independently via the Admin SDK, ordered by sequence — this is the
    // expected order the APP should have produced. (Read here, AFTER the page rendered, so both views
    // see the same catalog snapshot for this serial run.)
    const catalog = await queryWhere('modes', [], { orderBy: 'sequence', orderDir: 'asc' });
    const expectedOrder = catalog.map((m) => String((m as Record<string, unknown>).mode));
    expect(expectedOrder.length, 'PM-01: the seeded catalog must be non-empty').toBeGreaterThan(0);

    // [ASSERT] the DOM order the APP rendered equals the admin-read sequence order. The seeded modes
    // ("Integration Mode" / "Performance Mode") MUST appear (they were seeded into the catalog).
    const rendered = (await modeEls.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    expect(rendered, 'PM-01: app-rendered mode order must equal the admin-read orderBy(sequence)').toEqual(expectedOrder);
    expect(rendered, 'PM-01: the seeded Integration Mode must be in the rendered catalog').toContain('Integration Mode');
    expect(rendered, 'PM-01: the seeded Performance Mode must be in the rendered catalog').toContain('Performance Mode');
  });
});

// ===========================================================================================
// PM-18 — the authGuard redirects an UNAUTHENTICATED visitor away from /modedashboard.
// (No console-guard assertion: a guard bounce can log benign auth noise.)
// ===========================================================================================
test.describe('Modes — auth guard', () => {
  test('PM-18 unauthenticated visit to /modedashboard does not stay on the screen (guard redirects)', async ({ page }) => {
    await installModeStubs(page);
    // No login. Navigate straight to the guarded screen.
    await page.goto('/modedashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800); // bounded settle (networkidle hangs on camera/iframe/stream routes)
    // authGuard (auth.guard.ts:21-26) checks Firebase Auth state; an unauthenticated user is redirected
    // (to /login). The key anti-circular fact: the app does NOT leave an unauthenticated user on the
    // guarded dashboard route.
    await expect
      .poll(() => page.url(), { timeout: 30_000, message: 'PM-18: must not remain on /modedashboard while logged out' })
      .not.toMatch(/\/modedashboard/);
  });
});

// ===========================================================================================
// Route-mount smoke — every seeded modes route mounts for the super-role admin (guard admits,
// no bounce to /login). Proves the dashboard route-grants seeded. A route-mount smoke skips
// assertNoFatal and only asserts the route does not bounce to /login.
// The participant-ael route is EXCLUDED (reads the off-limits firestore-atc DB).
// ===========================================================================================
test.describe('Modes — route-mount smoke (guard admits super-role admin)', () => {
  const ROUTES = [
    '/modedashboard', '/mode-dashboard-new', '/productmodeconfig', '/evolutionwishlistlog',
    '/interimreportlog', '/appactionpending', '/recommendedplaylist', '/bigwall',
  ];
  test('every seeded modes route mounts (no /login bounce)', async ({ page }) => {
    await installModeStubs(page);
    await loginAsModeAdmin(page);
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
