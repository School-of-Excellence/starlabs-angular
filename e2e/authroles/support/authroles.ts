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

// ── Nav-tree fixture labels (from seed-authroles.js NAV) ───────────────────────────────────────────
// The run-namespaced sidenav child labels the app's filterNavItems() role-filters. Re-exported so the
// nav-visibility specs assert against the SAME strings the seed wrote (single source of truth).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedMod = require('../seed-authroles');
export const NAV = seedMod.NAV as {
  parentLabel: string; adminOnly: string; participant: string; developer: string; byProfile: string; adminFav: string;
};
/** Login-edge actors (number-null / role-not-found `profile_data` fixtures — no Auth user). */
export const EDGE = seedMod.EDGE as { nonumEmail: string; nonumPf: string; noroleEmail: string; norolePf: string };

/** The shape the app's nav computation exposes on the live `app-root` component instance. */
export interface AppNavState {
  /** activeRoles the app derived from the logged-in user's users_roles flags (app.component.ts:263). */
  roles: string[];
  /** the logged-in profileid the nav filter ORs against child.profileid (app.component.ts:543). */
  profileId: string;
  /** labels of EVERY child the app KEPT across all parents after the role/profileid filter (:536-548). */
  childLabels: string[];
  /** labels the app added to guard.favouriteDashboard (child.favourites ∋ profileId, :550). */
  favouriteLabels: string[];
}

/**
 * Read the LIVE nav state the app computed, straight off the Angular `app-root` component instance via
 * the dev-build `window.ng.getComponent` global (the same camera-bypass idiom events-deep uses). This is
 * the anti-circular oracle for AR-05/06/07: `filterNavItems()` is the APP's own computation over the
 * seeded `dashboard` children — we read its OUTPUT (which children survived, which became favourites),
 * never a value the test wrote. (We read component state rather than the DOM because children only render
 * in the drawer when their parent is expanded; the computed arrays are populated regardless.)
 */
export async function readAppNav(page: Page): Promise<AppNavState> {
  return page.evaluate(() => {
    const ng = (window as any).ng;
    if (!ng || !ng.getComponent) throw new Error('window.ng.getComponent unavailable (need a dev build)');
    const root = document.querySelector('app-root');
    if (!root) throw new Error('app-root not found');
    const c: any = ng.getComponent(root);
    const filtered: any[] = c.filteredDashboard || [];
    const childLabels: string[] = [];
    for (const item of filtered) for (const ch of (item.children || [])) childLabels.push(ch.label);
    const favouriteLabels: string[] = ((c.guard && c.guard.favouriteDashboard) || []).map((f: any) => f.label);
    return {
      roles: (c.profileEligibleRoles || []) as string[],
      profileId: (c.profileData && c.profileData.profileid) || '',
      childLabels,
      favouriteLabels,
    };
  });
}

/**
 * Wait until the app has resolved the logged-in user's roles AND the LIVE `dashboard` snapshot carrying
 * our run-namespaced nav-tree parent has arrived + been filtered, so `readAppNav` reflects the live
 * (not the IndexedDB-cached) nav. The app runs filterNavItems() TWICE — once on the 10-min IDB cache,
 * then again on the live Firestore onSnapshot which OVERRIDES it (app.component.ts:240-263, fetchNav).
 * The cached pass could populate filteredDashboard with a STALE nav (missing this run's children) and
 * already carry `expectedRole`, so we additionally gate on the run's nav-tree PARENT being present in
 * filteredDashboard — proof the live snapshot (with our seeded parent) has landed (risk #9: stale cache).
 */
export async function waitForNavResolved(page: Page, expectedRole: string): Promise<AppNavState> {
  const parentLabel = NAV.parentLabel;
  await page.waitForFunction(([role, parent]) => {
    const ng = (window as any).ng;
    const root = document.querySelector('app-root');
    if (!ng || !ng.getComponent || !root) return false;
    const c: any = ng.getComponent(root);
    const roles: string[] = c.profileEligibleRoles || [];
    const filtered: any[] = c.filteredDashboard || [];
    const parentPresent = filtered.some((it) => it.label === parent);
    return roles.includes(role) && parentPresent;
  }, [expectedRole, parentLabel], { timeout: 30_000 });
  return readAppNav(page);
}

// ── Registration-CF deployment probe (AR-14) ───────────────────────────────────────────────────────
// `createProfile_registeredUser` (onDocumentCreated user_data/{id}) is EXPORTED in the cloud-function
// source but is NOT among the CFs deployed to the disposable test project slabs-queue-e2e-exdcz (the
// deployed set is calculateParticipantMode + the *_to_pmd family + the queue CFs — journal
// 2026-06-10-allcomponents-e2e-COMPLETE §"Deployed CFs"). The AR-14 spec makes a REAL attempt (seed a raw
// user_data doc, poll for the CF's profile_data output) and skip-guards on absence with this probe so the
// case lights up automatically if/when the CF is later deployed — never a faked green.
export async function createProfileCfDeployed(probeUid: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const email = `cfprobe_${probeUid}@example.com`;
  const ref = db.collection('user_data').doc(probeUid);
  await ref.set({ name: email, email, number: '9999900000', _testdata: true, testrunid: RUN });
  // Poll briefly for the CF to create a matching profile_data (createProfile_registeredUser writes it).
  const deadline = Date.now() + 15_000;
  let deployed = false;
  for (;;) {
    const snap = await db.collection('profile_data').where('email', '==', email).limit(1).get();
    if (!snap.empty) { deployed = true; break; }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Clean the probe user_data + any CF-created profile_data.
  await ref.delete().catch(() => {});
  const made = await db.collection('profile_data').where('email', '==', email).get();
  for (const d of made.docs) await d.ref.delete().catch(() => {});
  return deployed;
}
