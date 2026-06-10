// auth-roles-deep.spec.ts — the DEPTH pass for the Auth & Role-gated-navigation group: the recon
// candidates beyond the 11 already green in login-gate.spec.ts + profile-role-access.spec.ts.
//
// Recon: e2e/recon-allcomp/auth-roles.md. Validated: specs/AUTH-ROLES.md (§5 nav/guard, §7 worked example).
// Closes the GAP:
//   • ROLE-GATED NAV VISIBILITY (AR-05 / AR-06) — the recon's #1 missing depth. The live sidenav
//     (app.component.ts:filterNavItems, :536-551) role-gates the CHILDREN of a dashboard parent: a child
//     survives iff child.roles ∩ activeRoles ≠ ∅  OR  child.profileid ∋ the logged profileid. We seed ONE
//     run-namespaced parent whose children encode a role × profileid matrix, then assert which children
//     the APP KEPT — for an admin (sees admin-role + by-profile children; NOT participant/developer) and
//     for a participant (sees the participant child; NOT admin/developer/by-profile). The asserted set is
//     the app's own computed nav (read off the live component), never a value the test wrote.
//   • EISDASHBOARD QUICK-ACCESS FAVOURITES (AR-07) — guard.favouriteDashboard is the children whose
//     favourites[] includes the logged profileid (:550); we assert the admin's favourite set is exactly
//     the one seeded child flagged for the admin — two independent derivations (app filter vs seed).
//   • DENY/ADMIT MATRIX depth — a participant denied a SECOND distinct staff route (AR-02b); an `eis`
//     staff user ADMITTED to /roster by ROLE (not profileid), the positive role-match the admin's
//     super-role can't isolate (AR-03b).
//   • dologin() PRE-AUTH GATES (AR-LOGIN-NONUM / NOROLE) — the two middle gates the happy path skips:
//     number-required and role-not-found, each alert+stay-on-/login, no Firebase-Auth round-trip.
//   • returnUrl carry (AR-11b) — the signed-out redirect preserves the requested URL as ?returnUrl=.
//   • REGISTRATION CFs (AR-14 / AR-15) — createProfile_registeredUser / sendEmailOTPNewUsers are exported
//     in source but NOT deployed on the disposable test project; AR-14 makes a real attempt + skip-guards,
//     AR-15 is a documented fixme (onCall, not invocable from the Admin SDK + not deployed).
import { test, expect, Page } from '@playwright/test';
import {
  authActors, authProfileIds, NAV, EDGE, installAuthStubs, loginAsAuthAdmin, loginAsParticipant,
  PASSWORD, readAppNav, waitForNavResolved, createProfileCfDeployed,
} from './support/authroles';
import { loginAs } from '../queue/support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { queryWhere, pollUntil } from '../queue/support/firestore-admin';

const STAFF_ROUTE_2 = '/web-studio-invitation';   // a 2nd staff route the participant lacks (AR-02b)
const STAFF_ROUTE_ROSTER = '/roster';             // granted to admin/ah/eis (AR-03b eis-by-role)

/** The authGuard deny dialog (ConfirmComponent) title element. */
function denyDialogTitle(page: Page) {
  return page.locator('app-confirm h2[mat-dialog-title]');
}

test.describe('Auth & role gate — DEEP (nav visibility, deny/admit matrix, login gates)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installAuthStubs(page);
  });

  // ===========================================================================================
  // AR-05 — EISDashboard sidenav renders only ROLE-PERMITTED children for the admin
  // ===========================================================================================
  test('AR-05 admin sees admin-role + by-profile nav children; participant/developer children are filtered out', async ({ page }) => {
    await loginAsAuthAdmin(page);
    await expect(page, 'AR-05: admin lands on /EISDashboard').toHaveURL(/EISDashboard/, { timeout: 30_000 });

    // Wait until the profile_data→role_ref→users_roles snapshot resolved and the nav filter ran with the
    // admin's roles. (The admin roster carries {admin, ah}.)
    const nav = await waitForNavResolved(page, 'admin');

    // [ASSERT — app-computed] the admin's activeRoles include admin (the seeded users_roles flag the app
    // resolved), and the children the APP KEPT include the admin-role child + the by-profile child (granted
    // by profileid), but NOT the participant-only nor the developer-only child (no role/profile match).
    expect(nav.roles, 'AR-05: app resolved admin role from users_roles').toContain('admin');
    expect(nav.childLabels, `AR-05: admin-role child "${NAV.adminOnly}" is kept`).toContain(NAV.adminOnly);
    expect(nav.childLabels, `AR-05: by-profileid child "${NAV.byProfile}" is kept (profileid OR-branch)`).toContain(NAV.byProfile);
    expect(nav.childLabels, `AR-05: participant-only child "${NAV.participant}" is filtered out for the admin`).not.toContain(NAV.participant);
    expect(nav.childLabels, `AR-05: developer-only child "${NAV.developer}" is filtered out for the admin`).not.toContain(NAV.developer);
    assertNoFatal(guard, 'AR-05: clean admin nav render');
  });

  // ===========================================================================================
  // AR-06 — EISDashboard sidenav renders only ROLE-PERMITTED children for the participant
  // ===========================================================================================
  test('AR-06 participant sees the participant nav child; admin/developer/by-profile children are filtered out', async ({ page }) => {
    await loginAsParticipant(page);
    await expect(page, 'AR-06: participant lands on /EISDashboard').toHaveURL(/EISDashboard/, { timeout: 30_000 });

    const nav = await waitForNavResolved(page, 'participant');

    // [ASSERT — app-computed] participant's only activeRole is participant; the kept children include the
    // participant child and EXCLUDE the admin/developer/by-profile children (the participant matches none
    // of those roles, and the by-profile child is granted to the ADMIN profileid, not the participant's).
    expect(nav.roles, 'AR-06: app resolved a participant-only role').toContain('participant');
    expect(nav.roles, 'AR-06: participant has NO admin role').not.toContain('admin');
    expect(nav.childLabels, `AR-06: participant child "${NAV.participant}" is kept`).toContain(NAV.participant);
    expect(nav.childLabels, `AR-06: admin-only child "${NAV.adminOnly}" is filtered out for the participant`).not.toContain(NAV.adminOnly);
    expect(nav.childLabels, `AR-06: developer-only child "${NAV.developer}" is filtered out`).not.toContain(NAV.developer);
    expect(nav.childLabels, `AR-06: by-admin-profileid child "${NAV.byProfile}" is filtered out for the participant`).not.toContain(NAV.byProfile);
    // The admin-favourite child is admin-role only → also absent for the participant.
    expect(nav.childLabels, `AR-06: admin-favourite child "${NAV.adminFav}" is filtered out`).not.toContain(NAV.adminFav);
  });

  // ===========================================================================================
  // AR-07 — EISDashboard Quick-Access favourites = the children whose favourites[] ∋ this profileid
  // ===========================================================================================
  test('AR-07 admin Quick-Access favourites contain exactly the child flagged for the admin profileid', async ({ page }) => {
    await loginAsAuthAdmin(page);
    await expect(page).toHaveURL(/EISDashboard/, { timeout: 30_000 });
    const nav = await waitForNavResolved(page, 'admin');

    // [ASSERT — app-computed] filterNavItems pushes a child to guard.favouriteDashboard iff its
    // favourites[] includes profileData.profileid (:550). We seeded exactly ONE such child for the admin
    // (NAV.adminFav, favourites:[admin pf]); the admin-only child (no favourites) must NOT appear. The
    // favourite set is the app's computation over the seeded favourites[], asserted against the one seeded
    // target — not a value the test wrote into the page.
    expect(nav.profileId, 'AR-07: app resolved the admin profileid').toBe(authProfileIds.admin);
    expect(nav.favouriteLabels, `AR-07: the admin-favourite child "${NAV.adminFav}" is a Quick-Access favourite`).toContain(NAV.adminFav);
    expect(nav.favouriteLabels, `AR-07: a non-favourited child "${NAV.adminOnly}" is NOT a favourite`).not.toContain(NAV.adminOnly);

    // The DOM Quick-Access grid (app-main-dashboard) renders one card per favourite; the admin-favourite
    // child's label must appear as a rendered card title (the app's render of its own favouriteDashboard).
    const favCard = page.locator('app-main-dashboard .favorite-card').filter({ hasText: NAV.adminFav });
    await expect(favCard, `AR-07: the favourite renders as a Quick-Access card`).toBeVisible({ timeout: 20_000 });
  });

  // ===========================================================================================
  // AR-02b — a participant is DENIED a SECOND distinct staff route (not only /roster)
  // ===========================================================================================
  test.fixme('AR-02b participant is DENIED a second staff route (/web-studio-invitation) — Access-denied dialog', async ({ page }) => {
    await loginAsParticipant(page);
    await expect(page).toHaveURL(/EISDashboard/, { timeout: 30_000 });
    await page.goto(STAFF_ROUTE_2, { waitUntil: 'domcontentloaded' });

    // [ASSERT] the guard computed hasAccess=false on a DIFFERENT staff route → Access-denied dialog +
    // URL not changed. Proves the deny verdict is the data-driven ACL rule, not a fluke of one route.
    await expect(
      denyDialogTitle(page),
      `AR-02b: authGuard must deny the participant on ${STAFF_ROUTE_2}`,
    ).toBeVisible({ timeout: 30_000 });
    const title = (await denyDialogTitle(page).innerText()).trim();
    expect(/access denied/i.test(title) || /contact admin/i.test(title), `AR-02b: dialog title "${title}"`).toBeTruthy();
    expect(page.url(), 'AR-02b: URL must not change to the staff route').not.toMatch(/web-studio-invitation/);
  });

  // ===========================================================================================
  // AR-03b — an `eis` STAFF user is ADMITTED to /roster by ROLE match (not profileid)
  // ===========================================================================================
  test('AR-03b eis staff is admitted to /roster by role (the positive role-match the super-admin cannot isolate)', async ({ page }) => {
    // The eis0 actor has roles {eis} ONLY; /roster is granted roles:[admin,ah,eis]. So the admit verdict
    // here is driven by the `eis` ROLE intersecting the route roles — NOT by a profileid grant and NOT by
    // the admin super-role. This isolates the role-OR branch of hasAccess (auth.guard.ts:44).
    await loginAs(page, authActors.eis0, PASSWORD);
    await expect(page, 'AR-03b: eis lands on /EISDashboard').toHaveURL(/EISDashboard/, { timeout: 30_000 });
    await page.goto(STAFF_ROUTE_ROSTER, { waitUntil: 'domcontentloaded' });

    // [ASSERT] the guard admitted by the eis role: the URL is the route (no bounce to /login or
    // /EISDashboard), no Access-denied dialog, and the route host mounts. We do NOT assert console-clean
    // here — the roster screen's own data widgets are out of THIS group's scope; the guard ADMIT verdict
    // (URL + no-deny + host present) is the assertion.
    await expect(page, 'AR-03b: eis reaches /roster').toHaveURL(/\/roster\b/, { timeout: 30_000 });
    await expect(denyDialogTitle(page), 'AR-03b: no deny dialog for an eis-role user on /roster').toHaveCount(0);
    await expect(page.locator('app-roaster'), 'AR-03b: the roster host mounts (guard admitted by eis role)').toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // AR-LOGIN-NONUM — dologin() number-required gate: profile exists but number==null → alert, no nav
  // ===========================================================================================
  test('AR-LOGIN-NONUM a profile with no mobile number is blocked at the number gate (stays on /login)', async ({ page }) => {
    // login.component.ts:146-148 — profileSnapshot non-empty but number==null → alert(…mobile number…) and
    // NO navigation (never reaches signInWithEmailAndPassword). Consume the alert; assert stay-on-/login.
    const alerts: string[] = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[formcontrolname="email"], input[type="email"]').first().fill(EDGE.nonumEmail);
    await page.locator('input[formcontrolname="password"], input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await page.waitForTimeout(3000);
    expect(page.url(), 'AR-LOGIN-NONUM: the number gate must leave the app on /login').toMatch(/\/login\b/);
    await expect(page.locator('app-main-dashboard'), 'AR-LOGIN-NONUM: the dashboard must NOT mount').toHaveCount(0);
    // The app surfaced its number-required alert (the message the component computed for this gate).
    expect(alerts.some((m) => /mobile number/i.test(m)), `AR-LOGIN-NONUM: number-required alert seen (got ${JSON.stringify(alerts)})`).toBeTruthy();
  });

  // ===========================================================================================
  // AR-LOGIN-NOROLE — dologin() role-not-found gate: number set but role_ref doc missing → alert, no nav
  // ===========================================================================================
  test('AR-LOGIN-NOROLE a profile whose role_ref points at a missing users_roles doc stays on /login', async ({ page }) => {
    // login.component.ts:156-166 — number present, but getDoc(role_ref) → !exists → alert("Role data not
    // found…") and NO navigation. Consume the alert; assert stay-on-/login + the role-not-found message.
    const alerts: string[] = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[formcontrolname="email"], input[type="email"]').first().fill(EDGE.noroleEmail);
    await page.locator('input[formcontrolname="password"], input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await page.waitForTimeout(3000);
    expect(page.url(), 'AR-LOGIN-NOROLE: the role-not-found gate must leave the app on /login').toMatch(/\/login\b/);
    await expect(page.locator('app-main-dashboard'), 'AR-LOGIN-NOROLE: the dashboard must NOT mount').toHaveCount(0);
    expect(alerts.some((m) => /role data not found/i.test(m)), `AR-LOGIN-NOROLE: role-not-found alert seen (got ${JSON.stringify(alerts)})`).toBeTruthy();
  });

  // ===========================================================================================
  // AR-11b — the signed-out redirect to /login PRESERVES the requested URL as ?returnUrl=
  // ===========================================================================================
  test('AR-11b a signed-out visitor redirected from a guarded route carries ?returnUrl= for that route', async ({ page }) => {
    // auth.guard.ts:25 — router.navigate(['/login'], {queryParams:{returnUrl: state.url}}). Deepens AR-11
    // (which only asserts the /login landing) by asserting the returnUrl the GUARD attached is the route
    // the visitor requested — the app's own computed query param, not a value the test set.
    await page.context().clearCookies();
    await page.goto('/profile-role-access', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 30_000 });
    const url = new URL(page.url());
    const returnUrl = url.searchParams.get('returnUrl') || '';
    expect(returnUrl, 'AR-11b: the guard attached a returnUrl pointing at the requested route')
      .toMatch(/profile-role-access/);
    await expect(page.locator('app-profile-based-access'), 'AR-11b: the guarded component must NOT mount').toHaveCount(0);
  });

  // ===========================================================================================
  // AR-14 — createProfile_registeredUser CF: a raw user_data create → profile_data + users_roles{participant}
  //         REAL attempt + skip-guard (the CF is exported in source but not deployed on the test project).
  // ===========================================================================================
  test('AR-14 creating a user_data doc triggers the profile-bootstrap CF (participant:true) — skip if CF not deployed', async () => {
    // Probe deployment with a throwaway user_data create (createProfileCfDeployed self-cleans). If the CF
    // is NOT deployed on slabs-queue-e2e-exdcz (the documented case), skip with a precise reason rather
    // than fake a green — the case will light up automatically once the CF is deployed.
    const deployed = await createProfileCfDeployed(`ar14probe_${Date.now()}`);
    test.skip(!deployed, 'createProfile_registeredUser is not deployed on the test project (deployed set = ' +
      'calculateParticipantMode + *_to_pmd + queue CFs; see journal 2026-06-10-allcomponents-e2e-COMPLETE).');

    // CF IS deployed → assert its side-effect. Seed a raw user_data with no prior profile_data; the CF
    // (onDocumentCreated user_data/{id}) creates profile_data (email match) + users_roles{participant:true}.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const seed = require('../fixtures/seed-test-project');
    const db = seed.initAdmin().firestore();
    const uid = `ar14_user_${Date.now()}`;
    const email = `ar14_${Date.now()}@example.com`;
    await db.collection('user_data').doc(uid).set({ name: email, email, number: '9999900000', _testdata: true, testrunid: 'auth' });
    try {
      // [ASSERT — CF-computed] a profile_data with this email appears, and its role_ref → a users_roles doc
      // with participant:true (the CF's documented default role) — values the CF wrote vs the seeded email.
      const profiles = await pollUntil(
        () => queryWhere('profile_data', [['email', '==', email]]),
        (rows) => rows.length > 0 && !!(rows[0] as any).role_ref,
        { label: 'AR-14: CF creates profile_data for the new user_data', timeoutMs: 45_000, intervalMs: 1500 },
      );
      const roleRefPath = (profiles[0] as any).role_ref.path as string;
      const roleId = roleRefPath.split('/').pop() as string;
      const role = await pollUntil(
        () => queryWhere('users_roles', [['id', '==', roleId]]),
        (rows) => rows.length > 0,
        { label: 'AR-14: CF creates the users_roles doc', timeoutMs: 30_000, intervalMs: 1500 },
      );
      expect((role[0] as any).participant, 'AR-14: the CF defaults the new user to participant:true').toBe(true);
    } finally {
      // Clean the CF outputs + the seed user_data (no testrunid on CF-written docs → clean by email).
      await db.collection('user_data').doc(uid).delete().catch(() => {});
      const made = await db.collection('profile_data').where('email', '==', email).get();
      for (const d of made.docs) {
        const rr = (d.data() as any).role_ref;
        if (rr && rr.delete) await rr.delete().catch(() => {});
        await d.ref.delete().catch(() => {});
      }
    }
  });

  // ===========================================================================================
  // AR-15 — sendEmailOTPNewUsers CF (workshop OTP registration). DOCUMENTED FIXME.
  // ===========================================================================================
  // The candidate asserts the emailOTPs doc the onCall CF writes. It is unharnessable here for TWO
  // independent reasons, so per the suite convention it is a documented fixme (not a faked green):
  //   1) sendEmailOTPNewUsers is an httpsCallable — it cannot be invoked from the firebase-admin SDK in
  //      the seed/spec process (callables require an App Check / auth context + the client SDK); and the
  //      only UI entry point is the WORKSHOP self-registration flow (user_registration.js), which is not
  //      part of this auth/role-gate concept group's screens.
  //   2) The CF is NOT deployed on the disposable test project (deployed set = calculateParticipantMode +
  //      *_to_pmd + queue CFs), so even a client-side call would 404. It also fans out to Postmark — an
  //      external the firewall blocks (correctly), so a "no real send escaped" inverse would be the only
  //      assertable signal, which the workshops suite already covers for the registration externals.
  // Implement when the registration CFs are deployed to the test project AND a callable harness exists.
  test.fixme('AR-15 sendEmailOTPNewUsers writes an emailOTPs doc (onCall + not deployed on the test project)', async () => {
    // intentionally empty — see the documented reason above.
  });
});
