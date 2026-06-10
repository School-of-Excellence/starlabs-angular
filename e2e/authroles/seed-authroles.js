// @ts-nocheck
/**
 * seed-authroles.js — stand up the Auth & Role-gated-navigation world on the dedicated disposable
 * test project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded
 * admin init, the staff/participant auth chain, the dashboard route-grant doc shape).
 *
 * Concept group: login (real form) + EISDashboard (main dashboard) + profile-role-access (admin screen).
 * The point of this suite is the DATA-DRIVEN authGuard (auth.guard.ts): a participant-only user is
 * DENIED a staff route (Access-denied ConfirmComponent dialog) while an admin is admitted — the
 * queue BIG-00b pattern, applied to the auth/role-gate concept group.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed-test-project.initAdmin() (hard-aborts
 * off the test project), every doc is tagged {testrunid:'auth', _testdata:true}, and NO ATC collection
 * is ever touched. The route ACLs we drive are all NON-ATC (/profile-role-access, /roster, /EISDashboard).
 *
 * Actors (custom roster — auth/role-gate needs a clean participant-only user + an `eis` staff role):
 *   admin+auth@example.com         roles {admin, ah}    — super-role: admitted to every gated route
 *   eis0+auth@example.com          roles {eis}          — staff dashboard role (granted /roster + /EISDashboard)
 *   participant0+auth@example.com  roles {participant}  — pure participant: DENIED the staff routes
 *
 * Usage:  node e2e/authroles/seed-authroles.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.AUTH_RUNID || 'auth';

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  eis0: `${TESTRUNID}_pf_eis0`,
  p0: `${TESTRUNID}_pf_p0`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  eis0: `eis0+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin', 'ah'], 'admin'),
    mk('eis0', ['eis'], 'eis'),
  ];
  const participants = [mk('p0', ['participant'], 'participant')];
  return { staff, participants };
}

// Routes this group's specs navigate to. Each gets a dashboard route-config grant whose `roles[]` is
// EXPLICIT so the data-driven authGuard deny/admit verdict is deterministic (independent of any other
// suite's seeded docs). Tagged + run-namespaced doc ids (`auth_dash_*`) so they never collide with the
// appointments suite's `appt_dash_*` docs nor the queue's `run1_dash_*`.
//   - /profile-role-access : the admin screen under test — granted ONLY to the admin role-set + staff
//                            profileids (NOT participant) → admin admitted (AR-03), participant denied (AR-04).
//   - /roster              : a generic staff route — granted to every staff role (admin+ah+eis) + staff
//                            profileids (NOT participant) → admin/eis admitted, participant denied (AR-02).
//   - /EISDashboard        : always-allowed by the guard (auth.guard.ts:28) but ALSO seeded so it appears
//                            in the role-filtered sidenav for the landing assertion (AR-01).
// `roles:[...]` is passed explicitly; seedDashboardRoutes unions it with the staff allRoles, so the
// resulting grant covers exactly the staff role-set (admin/ah/eis) and excludes participant.
const ROUTES = [
  { route: '/profile-role-access', label: 'Profile Role Access', roles: ['admin', 'ah'] },
  { route: '/roster', label: 'Auth Roster' },
  { route: '/EISDashboard', label: 'EIS Dashboard' },
  // /web-studio-invitation — a STAFF route the participant lacks (used by the deny-matrix AR-02b so the
  // participant deny verdict is proven on a SECOND distinct staff route, not only /roster). Granted to the
  // staff role-set (admin/ah/eis) + staff profileids only; participant has neither → guard denies.
  { route: '/web-studio-invitation', label: 'Auth Studio Invite', roles: ['admin', 'ah'] },
];

// ── NAV-TREE parent doc (the deepening fixture for AR-05/06/07) ────────────────────────────────────
// The live sidenav (`app.component.ts:filterNavItems`, :536-551) role-gates ONLY the CHILDREN of a
// dashboard parent — top-level docs are pushed unconditionally, and a child is kept iff
//   child.roles ∩ profileEligibleRoles ≠ ∅   OR   child.profileid includes the logged profileid   (:542-543)
// and added to the quick-access FAVOURITES iff child.favourites includes the logged profileid (:550).
// The `seedDashboardRoutes` ROUTES above are all childless top-level grants (they drive the GUARD ACL),
// so they cannot exercise the sidenav role-filter. This parent doc adds the missing depth: ONE run-
// namespaced parent (`auth_dash_navtree`, NO route → a clickable category) whose children encode a
// deterministic role × profileid matrix so the app's own nav computation is observable and anti-circular:
//   • NAV admin-only   roles:[admin]                       → admin SEES,  participant DENIED (role miss)
//   • NAV participant  roles:[participant]                 → admin DENIED, participant SEES (role miss for admin)
//   • NAV developer    roles:[developer]                   → BOTH DENIED  (neither actor has developer)
//   • NAV by-profile   roles:[] + profileid:[admin pf]     → admin SEES via the profileid OR-branch, participant DENIED
//   • NAV admin-fav    roles:[admin] + favourites:[admin pf] → a known FAVOURITE for the admin (AR-07 count)
// Labels are run-prefixed so the assertions are scoped to THIS run's children (never the live nav tree,
// which other suites/devs may mutate — risk #2 in the recon). showInSidenav:true on every child (the
// filter skips !showInSidenav children outright, :539). NO ATC routes (constraint).
const NAVTREE_DOC = `${TESTRUNID}_dash_navtree`;
const NAV = {
  parentLabel: `Auth Nav ${TESTRUNID}`,
  adminOnly: `Auth Nav Admin ${TESTRUNID}`,
  participant: `Auth Nav Participant ${TESTRUNID}`,
  developer: `Auth Nav Developer ${TESTRUNID}`,
  byProfile: `Auth Nav ByProfile ${TESTRUNID}`,
  adminFav: `Auth Nav Fav ${TESTRUNID}`,
};

function navChildren() {
  // Child `route`s are run-namespaced harmless paths; they exist ONLY to be rendered/role-filtered in the
  // sidenav (the specs assert presence/absence of the LABEL, they do not navigate to these child routes).
  const mk = (label, route, roles, profileid = [], favourites = []) => ({
    label, route, icon: 'star', showInSidenav: true, roles, profileid, favourites,
  });
  return [
    mk(NAV.adminOnly, `/auth-nav-admin-${TESTRUNID}`, ['admin']),
    mk(NAV.participant, `/auth-nav-participant-${TESTRUNID}`, ['participant']),
    mk(NAV.developer, `/auth-nav-developer-${TESTRUNID}`, ['developer']),
    mk(NAV.byProfile, `/auth-nav-byprofile-${TESTRUNID}`, [], [PF.admin]),
    mk(NAV.adminFav, `/auth-nav-fav-${TESTRUNID}`, ['admin'], [], [PF.admin]),
  ];
}

// classify/AHCRM_dashboard_access — the Business-Dashboard per-section access doc the
// profile-role-access AHCRM table renders (docData live stream, profile-based-access.component.ts:537).
// SHARED-DOC SAFETY: this is a SINGLETON doc path (not run-namespaced). The component's add/edit writes a
// FULL setDoc overwrite of it, so we NEVER drive those UI actions (they would clobber a shared doc — see
// blockers). We only seed ONE testrunid-scoped KEY into it via merge, assert the table RENDERS that key
// (read-only, anti-circular: the row text is what the app computed from its live stream), and remove just
// our key on teardown (FieldValue.delete) so the doc is left exactly as we found it.
const AHCRM_DOC = 'classify/AHCRM_dashboard_access';
const AHCRM_KEY = `${TESTRUNID} test dashboard`; // unique, lower-case (table capitalises via CSS only)

// ── LOGIN-EDGE profiles (the depth fixtures for the dologin() pre-auth gates) ──────────────────────
// dologin() (login.component.ts:127-176) walks three gates BEFORE signInWithEmailAndPassword, each of
// which alert()s and ABORTS without navigating. The happy path (AR-01) + the empty-profile path (AR-13)
// are covered; the deepening adds the two middle gates as PRECONDITION-only `profile_data` docs (NO Auth
// user, NO login success — the flow never reaches Firebase Auth):
//   • NONUM  profile_data with number:null  → alert "…mobile number is required…" (:147), no nav (:148)
//   • NOROLE profile_data with a valid number but a role_ref → a MISSING users_roles doc → roleDocSnap
//            .exists()===false → alert "Role data not found…" (:165), no nav. (The doc the ref points at
//            is intentionally never created.)
// Both are queried by `where email == lower(email)` so the email must be stored lower-case (login lowers
// the input). These docs are tagged + run-namespaced; the `profile_data` teardown sweep removes them.
const EDGE = {
  nonumEmail: `nonum+${TESTRUNID}@example.com`,
  nonumPf: `${TESTRUNID}_pf_nonum`,
  noroleEmail: `norole+${TESTRUNID}@example.com`,
  norolePf: `${TESTRUNID}_pf_norole`,
};

async function seedLoginEdgeProfiles(db, tag) {
  // NONUM — a profile that exists but carries no mobile number → the number-required gate.
  await db.collection('profile_data').doc(EDGE.nonumPf).set({
    docid: EDGE.nonumPf, profileid: EDGE.nonumPf, email: EDGE.nonumEmail.toLowerCase(), name: EDGE.nonumEmail,
    number: null, countrycode: '+91',
    // a role_ref is present but the number gate fires first, so it is never dereferenced here.
    role_ref: db.collection('users_roles').doc(`${TESTRUNID}_role_nonum_missing`), ...tag,
  });
  // NOROLE — number present, but role_ref → a users_roles doc that does NOT exist → "Role data not found".
  await db.collection('profile_data').doc(EDGE.norolePf).set({
    docid: EDGE.norolePf, profileid: EDGE.norolePf, email: EDGE.noroleEmail.toLowerCase(), name: EDGE.noroleEmail,
    number: '9999900000', countrycode: '+91',
    role_ref: db.collection('users_roles').doc(`${TESTRUNID}_role_norole_missing`), ...tag,
  });
}

async function seedAuthRoles() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const tag = TAG(TESTRUNID);

  const { staff, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles). The
  //    participant gets the FULL chain (user_ref + role_ref) so login.component / authguard.getRoles
  //    resolve a participant-ONLY role and the guard cleanly DENIES staff routes (Access-denied dialog),
  //    rather than throwing into the catch→/EISDashboard branch (seed-test-project.js:383-393).
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators: [], participants });

  // 2) Dashboard grants for THIS group's routes (run-namespaced docs, explicit role-sets).
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // 3) classify/AHCRM_dashboard_access — merge in ONE testrunid-scoped key (value = the seeded staff
  //    profileids). Read-only render fixture for AR-08b; never overwritten via the UI.
  await db.doc(AHCRM_DOC).set({ [AHCRM_KEY]: staffProfileIds }, { merge: true });

  // 4) NAV-TREE parent doc — the role × profileid child matrix the sidenav filter computes over (AR-05/06/07).
  //    NO `route` on the parent (so it renders as a clickable category, not a link); children carry the ACL.
  await db.collection('dashboard').doc(NAVTREE_DOC).set({
    label: NAV.parentLabel, icon: 'folder', showInSidenav: true, order: 1, children: navChildren(),
    roles: [], profileid: [], ...tag,
  });

  // 5) LOGIN-EDGE profiles — the number-required + role-not-found dologin gates (AR-LOGIN-NONUM/NOROLE).
  await seedLoginEdgeProfiles(db, tag);

  return {
    TESTRUNID, PF, EMAIL, AHCRM_KEY,
    routes: ROUTES.map((r) => r.route),
    counts: {
      staff: staff.length, participants: participants.length, routes: ROUTES.length,
      ahcrmKeys: 1, navChildren: navChildren().length, edgeProfiles: 2,
    },
  };
}

// Collections this seed writes (for teardown). The auth chain + dashboard are run-namespaced so the
// queue 'run1' / appointments 'appt' docs are untouched.
const SEEDED = ['user_data', 'profile_data', 'users_roles', 'dashboard'];

async function teardownAuthRoles() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);

  // Remove ONLY our testrunid-scoped key from the shared AHCRM doc (leave any other keys intact). If the
  // doc became empty (we created it), it is harmless to leave an empty doc; we delete our key surgically.
  await db.doc(AHCRM_DOC).set({ [AHCRM_KEY]: FieldValue.delete() }, { merge: true }).catch(() => {});

  // Delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, PF, EMAIL, ROUTES, SEEDED, AHCRM_KEY, NAV, NAVTREE_DOC, navChildren, EDGE, seedAuthRoles, teardownAuthRoles };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedAuthRoles(); console.log('[seed-authroles] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownAuthRoles(); console.log('[seed-authroles] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-authroles.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
