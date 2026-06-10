// authroles.ts — actors, login, and the per-test external/prod stub installer for the Auth & Role-gate
// suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (FCM/Wati/email/
// Zoom/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so the login path can never
// hit a real production Cloud Function (Watson user-verification on the REGISTER path, prod FCM legacy
// push) or open a real window. FCM getToken fires on EVERY login (authguard.service.ts:1267) — the FCM
// stub suppresses the notification-permission prompt that would otherwise block the headless run.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.AUTH_RUNID || 'auth';
export const PASSWORD = 'Test!1234';

/** Seeded auth/role-gate actors (seed-authroles.js roster). */
export const authActors = {
  admin: `admin+${RUN}@example.com`,         // roles {admin, ah} — super-role (admitted everywhere)
  eis0: `eis0+${RUN}@example.com`,           // roles {eis} — staff dashboard role
  participant0: `participant0+${RUN}@example.com`, // roles {participant} — denied staff routes
};

/** Seeded profileids (for asserting the array the app WRITES on the profile-role-access edit dialog). */
export const authProfileIds = {
  admin: `${RUN}_pf_admin`,
  eis0: `${RUN}_pf_eis0`,
  participant0: `${RUN}_pf_p0`,
};

/** The testrunid-scoped AHCRM key the seeder merged into classify/AHCRM_dashboard_access. */
export const AHCRM_KEY = `${RUN} test dashboard`;

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installAuthStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsAuthAdmin(page: Page): Promise<void> {
  await loginAs(page, authActors.admin, PASSWORD);
}

/** Log in via the real Angular login form as the seeded pure participant. */
export async function loginAsParticipant(page: Page): Promise<void> {
  await loginAs(page, authActors.participant0, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset a seeded `dashboard` route-config doc's `profileid[]` back to a KNOWN precondition (staff
 * profileids only) so the profile-role-access edit-dialog test (AR-09) is order- and re-run-independent.
 * This is a PRECONDITION write only — the test asserts the array the APP writes on the real save click,
 * never this reset value (anti-circularity). Idempotent merge.
 * @param docId the seeded `dashboard` doc id (use dashDocId('/roster'))
 * @param profileIds the precondition profileid array (e.g. the staff profileids only)
 */
export async function resetDashboardProfileIds(docId: string, profileIds: string[]): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('dashboard').doc(docId).set({ profileid: profileIds }, { merge: true });
}

/** The seeded dashboard doc id for a route (mirrors seed-common.seedDashboardRoutes id scheme). */
export function dashDocId(route: string): string {
  return `${RUN}_dash_${route.replace(/\W+/g, '_')}`;
}
