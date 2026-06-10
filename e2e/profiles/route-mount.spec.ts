// route-mount.spec.ts — every profiles route mounts for the super-role admin (the data-driven
// authGuard admits, no bounce to /login). Proves the dashboard route-grants seeded for this group.
// A route-mount smoke skips assertNoFatal (the heavy analytics screen logs benign Watson/transport
// noise on cold boot) and only asserts the route does NOT redirect to /login.
import { test, expect } from '@playwright/test';
import { profProfileIds, installProfileStubs, loginAsProfileAdmin } from './support/profiles';

test.describe('Profiles — route-mount smoke (guard admits super-role admin)', () => {
  test('every seeded profiles route mounts (no /login bounce)', async ({ page }) => {
    await installProfileStubs(page);
    await loginAsProfileAdmin(page);

    // :id / :profileid routes are exercised with the seeded p0 profileid; the guard matches by the
    // FIRST path segment only, so the dashboard grant for '/userprofile' covers '/userprofile/<id>'.
    const ROUTES = [
      `/userprofile/${profProfileIds.p0}`,
      `/profilesummary/${profProfileIds.p0}`,
      '/participants-analytics',
      '/participant-form-tracker',
      '/view-participants-form',
      '/app-flow-breaks',
      '/ProfileScreen',
    ];
    const bounced: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Give the guard + lazy chunk a moment to resolve.
      await page.waitForTimeout(800); // bounded settle (networkidle hangs on camera/iframe/stream routes)
      const url = page.url();
      if (/\/login/.test(url)) bounced.push(`${route} -> ${url}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
