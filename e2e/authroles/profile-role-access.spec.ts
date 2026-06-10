// profile-role-access.spec.ts — the admin "Screen Access" management screen: it RENDERS the dashboard
// route-ACL docs (filtered to those with a non-empty profileid[]) and the AHCRM access doc, and its edit
// dialog WRITES a dashboard doc's profileid[] back to Firestore.
//
// Recon: e2e/recon-allcomp/auth-roles.md (AR-08 / AR-09 / AR-10) + route-mount smoke.
// Anti-circularity:
//   AR-08  the Screen-Access row is what the APP rendered from its `dashboard` collection stream after
//          filtering to non-empty-profileid docs (profile-based-access.component.ts:146-159) — the seed
//          is the precondition, the rendered row is the app's computation.
//   AR-09  after the admin SAVES the edit dialog, we read `dashboard/{docid}.profileid` via the Admin SDK
//          and assert it now CONTAINS the participant the dialog added — the array the APP WROTE
//          (openEditDialog.afterClosed → updateDoc, ts:498), vs the staff-only PRECONDITION the test reset.
//   AR-10  the AHCRM row is what the APP rendered from its `classify/AHCRM_dashboard_access` live stream
//          (ts:537) — a read-only render of a seeded key (we never drive the AHCRM edit; it full-overwrites
//          a shared singleton doc — see the suite's blockers note).
import { test, expect, Page } from '@playwright/test';
import {
  authActors, authProfileIds, AHCRM_KEY, installAuthStubs, loginAsAuthAdmin,
  resetDashboardProfileIds, dashDocId,
} from './support/authroles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const ADMIN_SCREEN = '/profile-role-access';
const ROSTER_DOC = dashDocId('/roster');               // auth_dash__roster
const ROSTER_PRECONDITION = [authProfileIds.admin, authProfileIds.eis0]; // staff-only

/** Open the Screen-Access screen as the admin and wait for the component + table to render. */
async function openScreen(page: Page): Promise<void> {
  await loginAsAuthAdmin(page);
  await page.goto(ADMIN_SCREEN, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/profile-role-access/, { timeout: 30_000 });
  await expect(page.locator('app-profile-based-access'), 'the admin screen must mount').toBeVisible({ timeout: 30_000 });
}

test.describe('profile-role-access — Screen Access render + edit-dialog write (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installAuthStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'profile-role-access: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // AR-08 — the Screen-Access table renders the seeded route-ACL rows (non-empty profileid filter)
  // ===========================================================================================
  test('AR-08 the Screen Access table renders the seeded route rows the app filtered from `dashboard`', async ({ page }) => {
    await openScreen(page);

    // [REAL-UI] the component subscribes to the full `dashboard` collection and keeps only docs whose
    // profileid[] is non-empty (ts:156-158), rendering each as a row: <code class="route-path">{{route}}</code>
    // + a Screen-Name cell {{label}}. Our seeded /roster + /profile-role-access docs both qualify, so the
    // app's rendered table MUST contain them (the row is the app's computed output, not the seed echoed).
    // Scope by the run-unique Screen Name "Auth Roster" — the shared /roster route is ALSO seeded by the
    // appointments suite ("Roster"), so a `/roster` filter is ambiguous (strict-mode 2-row match).
    const rosterRow = page.locator('table.access-table tbody tr').filter({ hasText: 'Auth Roster' });
    await expect(rosterRow, 'AR-08: the seeded /roster route must render as a Screen-Access row').toBeVisible({ timeout: 30_000 });
    await expect(rosterRow, 'AR-08: the /roster row must show its seeded Screen Name "Auth Roster"').toContainText('Auth Roster');

    const selfRow = page.locator('table.access-table tbody tr').filter({ hasText: '/profile-role-access' });
    await expect(selfRow, 'AR-08: the seeded /profile-role-access route must also render as a row').toBeVisible({ timeout: 30_000 });

    // The route-path cell is rendered inside a <code class="route-path"> — confirm the app used that
    // template (proves these are real Screen-Access rows, not an incidental text match elsewhere).
    await expect(rosterRow.locator('code.route-path'), 'AR-08: route path renders in <code class="route-path">').toHaveText('/roster');
  });

  // ===========================================================================================
  // AR-09 — the edit dialog writes the dashboard doc's profileid[] in Firestore (app-written array)
  // ===========================================================================================
  test('AR-09 the edit dialog writes the added profile into dashboard/{docid}.profileid', async ({ page }) => {
    // PRECONDITION (anti-circular): reset the /roster grant to staff-only so the test is re-run stable
    // and the participant is provably ABSENT before the UI adds it. This is a precondition write — the
    // assertion is the array the APP writes on Save, never this reset value.
    await resetDashboardProfileIds(ROSTER_DOC, ROSTER_PRECONDITION);
    const before = await getDoc('dashboard', ROSTER_DOC);
    expect(before, 'AR-09: seeded /roster dashboard doc must exist').toBeTruthy();
    expect(before!.profileid as string[], 'AR-09: precondition — participant absent from /roster grant')
      .not.toContain(authProfileIds.participant0);

    await openScreen(page);

    // Open the edit dialog on the /roster row (openEditDialog → mat-dialog with a Profiles mat-select
    // pre-populated with editRoute.profileid).
    // Scope by the run-unique Screen Name "Auth Roster" — the shared /roster route is ALSO seeded by the
    // appointments suite ("Roster"), so a `/roster` filter is ambiguous (strict-mode 2-row match).
    const rosterRow = page.locator('table.access-table tbody tr').filter({ hasText: 'Auth Roster' });
    await expect(rosterRow).toBeVisible({ timeout: 30_000 });
    await rosterRow.locator('button[mattooltip="Edit"], button:has(mat-icon:text-is("edit"))').first().click();

    // The dialog mounts (title "Edit Screen Access"); the Profiles mat-select is inside it.
    const dialog = page.locator('.mat-mdc-dialog-container, mat-dialog-container');
    await expect(dialog.getByText('Edit Screen Access'), 'AR-09: the edit dialog must open').toBeVisible({ timeout: 20_000 });

    // [REAL-UI] open the Profiles mat-select and ADD the participant. Options display the profile NAME
    // (seedAuthChain sets name == email), so we pick the participant by its email text. Material gotcha:
    // the floating <mat-label> intercepts a normal click on the trigger → force the click.
    const profileSelect = dialog.locator('mat-select');
    await profileSelect.click({ force: true });
    const panel = page.locator('.mat-mdc-select-panel, .cdk-overlay-pane mat-option').first();
    await expect(panel, 'AR-09: the profile option panel must open').toBeVisible({ timeout: 10_000 });
    // The participant's option (text = participant email). exact:false — the option also renders initials.
    await page.locator('mat-option').filter({ hasText: authActors.participant0 }).first().click();
    // Close the multi-select overlay so the Save button is hittable.
    await page.keyboard.press('Escape');

    // Save → [mat-dialog-close]="editRoute" → afterClosed() runs updateDoc(dashboard/{docid}, {...}).
    await dialog.getByRole('button', { name: /^Save$/i }).click();

    // [ASSERT] the app WROTE the participant into the doc's profileid[] — polled, the value the PRODUCT
    // wrote (vs the staff-only precondition). Two independent derivations: UI add → app write → SDK read.
    const after = await pollUntil(
      () => getDoc('dashboard', ROSTER_DOC),
      (d) => !!d && Array.isArray(d.profileid) && (d.profileid as string[]).includes(authProfileIds.participant0),
      { label: `AR-09: dashboard/${ROSTER_DOC}.profileid must include the added participant`, timeoutMs: 30_000 },
    );
    // The staff ids the dialog kept must still be present (the app merged, not replaced wholesale).
    expect(after!.profileid as string[], 'AR-09: the original staff admin profileid must be preserved').toContain(authProfileIds.admin);
  });

  // ===========================================================================================
  // AR-10 — the AHCRM Dashboard Access table renders the seeded classify key (read-only render)
  // ===========================================================================================
  test('AR-10 the AHCRM Dashboard Access table renders the seeded classify key', async ({ page }) => {
    await openScreen(page);

    // [REAL-UI] the second table renders getAhcrmAccess = Object.keys(classify/AHCRM_dashboard_access)
    // from a live docData stream (ts:535-555). Our seeded testrunid-scoped key MUST appear as a row —
    // the row text is what the app computed from its classify stream, not a value this test wrote in-page.
    // (We do NOT drive the AHCRM add/edit dialog: it does a FULL setDoc overwrite of the shared singleton
    // doc — see the suite's blockers. This is a render-only assertion.)
    const ahcrmRow = page.locator('table.access-table tbody tr').filter({ hasText: AHCRM_KEY });
    await expect(ahcrmRow, `AR-10: the seeded AHCRM key "${AHCRM_KEY}" must render as a row`).toBeVisible({ timeout: 30_000 });
  });
});

// ===========================================================================================
// Route-mount smoke — /profile-role-access mounts for the admin (guard admits, no /login bounce).
// Proves the seeded route-grant + auth chain let the admin reach the screen.
// ===========================================================================================
test.describe('profile-role-access — route-mount smoke (guard admits admin)', () => {
  test('the admin screen mounts (no /login bounce)', async ({ page }) => {
    await installAuthStubs(page);
    await loginAsAuthAdmin(page);
    await page.goto(ADMIN_SCREEN, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800); // bounded settle (networkidle hangs on camera/iframe/stream routes)
    expect(page.url(), 'route must not bounce to /login (admin has the seeded grant)').not.toMatch(/\/login\b/);
    await expect(page.locator('app-profile-based-access'), 'the admin screen must mount').toBeVisible({ timeout: 30_000 });
  });
});
