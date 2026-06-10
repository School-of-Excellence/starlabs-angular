// login-gate.spec.ts — Auth & Role-gated navigation: the REAL login form + the data-driven authGuard
// admit/deny/redirect verdicts. This is the heart of the concept group (the queue BIG-00b pattern,
// applied to login + role-gated nav).
//
// Recon: e2e/recon-allcomp/auth-roles.md (AR-01..AR-04, AR-11..AR-13).
// Anti-circularity: every assertion is a value the APP computed/routed — the post-login URL the guard
// admitted to (EISDashboard bypass), the Access-denied dialog the guard RENDERED + the URL it REFUSED to
// change for a participant on a staff route, the /login redirect the guard chose for a signed-out visitor,
// and the stay-on-/login state after a Firebase-Auth failure. The seeded roster/route-ACLs are the
// PRECONDITION; the assertion is always the app's own access decision, never a value the test wrote.
import { test, expect, Page } from '@playwright/test';
import { authActors, installAuthStubs, loginAsAuthAdmin, loginAsParticipant } from './support/authroles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const STAFF_ROUTE = '/roster';                 // granted to staff roles+profileids only (NOT participant)
const ADMIN_SCREEN = '/profile-role-access';   // granted to [admin, ah] + staff profileids only

/** The authGuard deny dialog (ConfirmComponent, selector `app-confirm`) — title "Access denied"
 *  (role/profile mismatch) or "Contact Admin" (no roles+profiles configured). Mirrors the queue
 *  big-core helper + the ConfirmComponent template (`<h2 mat-dialog-title>{{data.title}}</h2>`). */
function denyDialogTitle(page: Page) {
  return page.locator('app-confirm h2[mat-dialog-title]');
}

test.describe('Auth & role gate — login form + data-driven authGuard (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installAuthStubs(page);
  });

  // ===========================================================================================
  // AR-01 — Admin logs in via the real form and lands on /EISDashboard (guard bypass, no bounce)
  // ===========================================================================================
  test('AR-01 admin logs in via the real form and lands on /EISDashboard (guard admits, no bounce)', async ({ page }) => {
    await loginAsAuthAdmin(page); // drives the real Angular login form, waits until routed off /login

    // [ASSERT] the app routed to /EISDashboard (login.component.ts:191) and the guard let it stand
    // (auth.guard.ts:28-29 bypass). URL is where the APP landed — not a test navigation target.
    await expect(page, 'AR-01: admin lands on /EISDashboard after login').toHaveURL(/EISDashboard/, { timeout: 30_000 });
    // The main-dashboard component mounted (guard did not hold/redirect the page).
    await expect(page.locator('app-main-dashboard'), 'AR-01: MainDashboard must mount on landing').toBeVisible({ timeout: 30_000 });
    // No deny dialog (the access decision the app computed was ALLOW).
    await expect(denyDialogTitle(page), 'AR-01: no Access-denied dialog on the landing route').toHaveCount(0);
    assertNoFatal(guard, 'AR-01: clean admin login + landing');
  });

  // ===========================================================================================
  // AR-02 — Participant logs in (lands on EISDashboard); a staff route is DENIED (dialog, URL unchanged)
  // ===========================================================================================
  test('AR-02 participant is DENIED a staff route — Access-denied dialog, URL stays off the staff route', async ({ page }) => {
    await loginAsParticipant(page);
    await expect(page, 'AR-02: participant also lands on /EISDashboard (guard bypass)').toHaveURL(/EISDashboard/, { timeout: 30_000 });

    // Navigate to a STAFF route the participant has neither role nor profileid for.
    await page.goto(STAFF_ROUTE, { waitUntil: 'domcontentloaded' });

    // [ASSERT] the guard computed hasAccess=false (rolesArray ∌ route roles, profileid ∉ route profiles)
    // → it RENDERED the Access-denied ConfirmComponent dialog (auth.guard.ts:64) and returned false.
    await expect(
      denyDialogTitle(page),
      `AR-02: authGuard must open the Access-denied dialog for a participant on ${STAFF_ROUTE}`,
    ).toBeVisible({ timeout: 30_000 });
    const title = (await denyDialogTitle(page).innerText()).trim();
    expect(/access denied/i.test(title) || /contact admin/i.test(title), `AR-02: dialog title was "${title}"`).toBeTruthy();

    // The route component never mounted, and the URL did not become the staff route (the guard refused
    // the activation — returns false WITHOUT a redirect, auth.guard.ts:78). Both are app-computed.
    await expect(page.locator('app-roaster'), 'AR-02: the staff route component must NOT mount for a denied participant').toHaveCount(0);
    expect(page.url(), 'AR-02: URL must not have changed to the staff route').not.toMatch(/\/roster\b/);
  });

  // ===========================================================================================
  // AR-03 — Admin navigates to /profile-role-access; guard ADMITS (no dialog, route mounts)
  // ===========================================================================================
  test('AR-03 admin navigates to /profile-role-access — guard admits (no dialog, screen mounts)', async ({ page }) => {
    await loginAsAuthAdmin(page);
    await page.goto(ADMIN_SCREEN, { waitUntil: 'domcontentloaded' });

    // [ASSERT] the guard read the /profile-role-access ACL (roles:[admin,ah]) and computed hasAccess=true
    // against the seeded admin roles → the route mounts, URL is the route, NO deny dialog.
    await expect(page, 'AR-03: admin reaches /profile-role-access').toHaveURL(/profile-role-access/, { timeout: 30_000 });
    await expect(page.locator('app-profile-based-access'), 'AR-03: the admin screen must mount (guard admitted)').toBeVisible({ timeout: 30_000 });
    await expect(denyDialogTitle(page), 'AR-03: no deny dialog for the admin').toHaveCount(0);
    assertNoFatal(guard, 'AR-03: clean admin admit to /profile-role-access');
  });

  // ===========================================================================================
  // AR-04 — Participant direct-navigates to /profile-role-access; guard DENIES (dialog, host absent)
  // ===========================================================================================
  test('AR-04 participant direct-nav to /profile-role-access — Access-denied dialog, screen absent', async ({ page }) => {
    await loginAsParticipant(page);
    await page.goto(ADMIN_SCREEN, { waitUntil: 'domcontentloaded' });

    await expect(
      denyDialogTitle(page),
      'AR-04: authGuard must open the Access-denied dialog for a participant on /profile-role-access',
    ).toBeVisible({ timeout: 30_000 });
    const title = (await denyDialogTitle(page).innerText()).trim();
    expect(/access denied/i.test(title) || /contact admin/i.test(title), `AR-04: dialog title was "${title}"`).toBeTruthy();

    await expect(page.locator('app-profile-based-access'), 'AR-04: the admin screen must NOT mount for a participant').toHaveCount(0);
    expect(page.url(), 'AR-04: URL must not have changed to the admin screen').not.toMatch(/profile-role-access/);
  });

  // ===========================================================================================
  // AR-11 — Unauthenticated direct-nav to a guarded route redirects to /login (no-user branch)
  // ===========================================================================================
  test('AR-11 a signed-out visitor is redirected to /login from a guarded route', async ({ page }) => {
    await page.context().clearCookies();
    // Fresh, signed-out context → the authGuard requires a Firebase user; without one it routes to
    // /login (auth.guard.ts:21-26) carrying a returnUrl. The redirect is the app's own decision.
    await page.goto(ADMIN_SCREEN, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 30_000 });
    expect(page.url(), 'AR-11: unauthenticated nav to a guarded route must land on /login').toContain('/login');
    await expect(page.locator('app-profile-based-access'), 'AR-11: the guarded component must NOT mount for a signed-out visitor').toHaveCount(0);
    // The login form itself rendered.
    await expect(page.locator('input[formcontrolname="email"], input[type="email"]').first(), 'AR-11: the login form must render').toBeVisible();
  });

  // ===========================================================================================
  // AR-12 — Wrong password: stays on /login, no navigation (post-Firebase-Auth-failure state)
  // ===========================================================================================
  test('AR-12 login with a wrong password stays on /login (no navigation off the form)', async ({ page }) => {
    // dologin() resolves profile_data (exists) then signInWithEmailAndPassword REJECTS → the catch
    // alert()s and the app NEVER navigates (login.component.ts:188-195). Consume the alert so it can't
    // block the run; assert the app stayed on /login (its own post-failure state).
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[formcontrolname="email"], input[type="email"]').first().fill(authActors.admin);
    await page.locator('input[formcontrolname="password"], input[type="password"]').first().fill('WrongPassword!9999');
    await page.getByRole('button', { name: /login/i }).click();

    // Give the (stubbed) auth round-trip time; the app must NOT route to /EISDashboard.
    await page.waitForTimeout(4000);
    expect(page.url(), 'AR-12: a wrong password must leave the app on /login').toMatch(/\/login\b/);
    await expect(page.locator('app-main-dashboard'), 'AR-12: the dashboard must NOT mount on a failed login').toHaveCount(0);
  });

  // ===========================================================================================
  // AR-13 — Login with an email that has no profile_data: alert shown, stays on /login
  // ===========================================================================================
  test('AR-13 login with an unknown email (no profile_data) stays on /login', async ({ page }) => {
    // profileSnapshot.size === 0 → the app alert()s "No Profile found…" and never navigates
    // (login.component.ts:143-145). Consume the alert; assert the stay-on-/login state.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[formcontrolname="email"], input[type="email"]').first().fill(`nobody+${Date.now()}@example.com`);
    await page.locator('input[formcontrolname="password"], input[type="password"]').first().fill('Test!1234');
    await page.getByRole('button', { name: /login/i }).click();

    await page.waitForTimeout(3000);
    expect(page.url(), 'AR-13: an unknown email must leave the app on /login').toMatch(/\/login\b/);
    await expect(page.locator('app-main-dashboard'), 'AR-13: the dashboard must NOT mount for an unknown email').toHaveCount(0);
  });
});
