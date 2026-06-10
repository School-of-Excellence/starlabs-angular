// @ts-nocheck
/**
 * seed-profiles.js — stand up the Participant Profiles & Analytics world on the dedicated disposable
 * test project (slabs-queue-e2e-exdcz), reusing the proven queue/appointments seed primitives
 * (allowlist-guarded admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Recon: e2e/recon-allcomp/profiles-analytics.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every doc is tagged
 * {testrunid:'prof', _testdata:true}, and NO ATC collection is ever touched (products seeded with
 * atcmodel:null so the analytics/profile ATC branches stay dead; the participant-report ATC link is
 * never clicked, the AEL/evolution-summary routes are out of scope).
 *
 * Actors (custom roster — profiles need an `admin`/`ah` super-role that sees fullAccess + the
 * customer-status editor; the queue makeStaff admin only carries `admin`):
 *   admin+prof@example.com   roles {admin, ah, developer} — super-role: fullAccess, status editor
 *   p0..p3 + prof@example.com roles {participant}         — the seeded participant profiles
 *
 * The CF-driven cases (PA-CF-*) rely on the deployed Cloud Functions on the test project:
 *   profiledata_to_participantmetadata (profile_data write -> participant metadata sync)
 *   journey_to_pmd                     (participantjourneyproduct write -> customerstatus)
 *   productsdata_to_pmd                (participantsproduct write -> activeproduct[])
 *
 * Usage:  node e2e/profiles/seed-profiles.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.PROF_RUNID || 'prof';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  J1: `${TESTRUNID}_J1`,             // journey reference doc (journeyref target)
  P1: `${TESTRUNID}_P1`,             // products reference doc (productref target, atcmodel:null)
  PKG1: `${TESTRUNID}_PKG1`,          // package reference doc
  PJP0: `${TESTRUNID}_PJP0`,          // participantjourneyproduct for p0 (ongoing -> customerstatus active)
  PP0: `${TESTRUNID}_PP0`,            // participantsproduct for p0 (ongoing -> activeproduct[])
  ASK0: `${TESTRUNID}_ASK0`,          // ask AH submission for p0 (form-tracker tab 0)
  ASK1: `${TESTRUNID}_ASK1`,          // ask AH submission for p1 (form-tracker participant-filter narrowing)
  LL0: `${TESTRUNID}_LL0`,            // love letter submission for p0 (form-tracker tab 1)
  FBC0: `${TESTRUNID}_FBC0`,          // formsByClient row (forms DB) for view-participants-form + tracker tab 2
  AFB0: `${TESTRUNID}_AFB0`,          // appflowbreaks row (app-flow-breaks viewer)
  AFB1: `${TESTRUNID}_AFB1`,          // a SECOND appflowbreaks row of a DIFFERENT type (chip-filter case)
  // CF-only product: a participantsproduct we drive through statuses to assert productsdata_to_pmd
  // projections (completed -> consumedproducts[], the productcount map) on a DEDICATED profile so the
  // p0 render cases keep their single ongoing product.
  PPCF: `${TESTRUNID}_PP_cf`,
  P2: `${TESTRUNID}_P2`,             // a SECOND products ref doc (productcount-map case needs 2 product ids)
  // CF-only profile: a profile_data whose name we MUTATE at test time to assert the metadata sync CF
  CFPF: `${TESTRUNID}_cfprofile`,
  // A dedicated profile for the productsdata_to_pmd projection cases (kept off p0/p1 so its
  // activeproduct/consumedproducts arrays are fully owned by these CF cases).
  PRODPF: `${TESTRUNID}_prodprofile`,
};

// The uP! Life Report formid the form-tracker tab-2 query filters by (participant-form-tracker.ts:144).
const UP_LIFE_REPORT_FORMID = 'QundpMXgXlXiCJYZ7WU4';

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
  p2: `${TESTRUNID}_pf_p2`,
  p3: `${TESTRUNID}_pf_p3`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
  p2: `participant2+${TESTRUNID}@example.com`,
  p3: `participant3+${TESTRUNID}@example.com`,
};

// Stable, recognisable display names (seeded UNIQUE text the specs filter table rows by).
const NAME = {
  p0: `Profile Test User Zero ${TESTRUNID}`,
  p1: `Profile Test User One ${TESTRUNID}`,
  p2: `Profile Test User Two ${TESTRUNID}`,
  p3: `Profile Test User Three ${TESTRUNID}`,
};

function roster() {
  const mk = (key, roles, role, name) => ({
    uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles, name,
  });
  const staff = [mk('admin', ['admin', 'ah', 'developer'], 'admin', `Profiles Admin ${TESTRUNID}`)];
  const participants = [
    mk('p0', ['participant'], 'participant', NAME.p0),
    mk('p1', ['participant'], 'participant', NAME.p1),
    mk('p2', ['participant'], 'participant', NAME.p2),
    mk('p3', ['participant'], 'participant', NAME.p3),
  ];
  return { staff, participants };
}

// Routes the profiles specs navigate to (each needs a dashboard route-config grant so the data-driven
// authGuard admits the seeded staff). The authGuard matches by FIRST path segment only.
const ROUTES = [
  { route: '/userprofile', label: 'User Profile' },
  { route: '/profilesummary', label: 'Profile Summary' },
  { route: '/participants-analytics', label: 'Participants Analytics' },
  { route: '/participant-form-tracker', label: 'Participant Form Tracker' },
  { route: '/view-participants-form', label: 'View Participants Form' },
  { route: '/app-flow-breaks', label: 'App Flow Breaks' },
  { route: '/ProfileScreen', label: 'Profile Screen' },
  // deep cases reach the evolution-summary route directly (it is normally a menu-button navigation from
  // analytics). The data-driven authGuard needs a dashboard grant or it shows "Contact Admin" and bounces.
  { route: '/participant-evolution-summary', label: 'Participant Evolution Summary' },
];

async function seedProfiles() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  // The firestore-forms named DB (formsByClient lives here for view-participants-form + the tracker
  // tab-2 detail). Reached via the modular getFirestore(app, databaseId) accessor.
  const { getFirestore } = require('firebase-admin/firestore');
  const formsDb = getFirestore(admin.app(), 'firestore-forms');

  const { staff, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles).
  //    Reused verbatim from the queue/appointments seeders. NOTE: this writes profile_data for EVERY
  //    actor (name = the email) — we OVERWRITE the participants' profile_data below with our friendly
  //    NAME + the fields the profile screens read (number/participantmode/customerstatus).
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators: [], participants });

  // 2) Dashboard grants for THIS group's routes.
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // --- refs / helpers ---
  const profileRef = (pf) => db.collection('profile_data').doc(pf);
  const journeyRef = (id) => db.collection('journey').doc(id);
  const productRef = (id) => db.collection('products').doc(id);
  const packageRef = (id) => db.collection('package').doc(id);
  const future = T.fromMillis(Date.now() + 90 * 86400e3);   // subscription open
  const past = T.fromMillis(Date.now() - 7 * 86400e3);       // purchase already happened
  const nowTs = () => T.now();

  // 3) REFERENCE DATA (non-ATC). journey + product + package the profile/analytics screens deref.
  await journeyRef(ID.J1).set({ id: ID.J1, docid: ID.J1, journey: `TEST Journey ${TESTRUNID}`, sequence: 1, originalfee: 1000, ...tag });
  await productRef(ID.P1).set({ id: ID.P1, docid: ID.P1, product: `TEST Product ${TESTRUNID}`, mode: 'Priority Mode', atcmodel: null, ...tag });
  await productRef(ID.P2).set({ id: ID.P2, docid: ID.P2, product: `TEST Product Two ${TESTRUNID}`, mode: 'Priority Mode', atcmodel: null, ...tag });
  await packageRef(ID.PKG1).set({ docid: ID.PKG1, package: `TEST Package ${TESTRUNID}`, ...tag });

  // 4) PARTICIPANT PROFILES — overwrite the auth-chain profile_data with the fields the screens read.
  //    profile_data drives the CF profiledata_to_participantmetadata; the screens render the resulting
  //    `participant metadata` (userprofile.userData / profile-summary / analytics row). We seed BOTH:
  //      • profile_data (CF source of truth + form-tracker name dropdown + app-flow-breaks join)
  //      • participant metadata (what userprofile/profile-summary/analytics actually RENDER) so the
  //        render-only specs do not race the CF. profileid is BOTH the doc id and the `profileid` field
  //        (recon risk #2 — userprofile updateCustomerStatus targets metadata.doc(userData['profileid'])).
  const seedProfile = async (key, opts = {}) => {
    const pf = PF[key];
    // profile_data: merge so the auth-chain role_ref/user_ref survive (login + getRoles need them).
    await profileRef(pf).set({
      docid: pf, profileid: pf, name: NAME[key], email: EMAIL[key].toLowerCase(),
      number: opts.number || '9999000001', countrycode: '+91',
      participantmode: opts.participantmode || 'Discovery Mode', address: 'Test Address', ...tag,
    }, { merge: true });
    // participant metadata: the denormalised doc the dashboards render (keyed by profileid).
    await db.collection('participant metadata').doc(pf).set({
      docid: pf, profileid: pf, name: NAME[key], email: EMAIL[key].toLowerCase(),
      phonenumber: opts.number || '9999000001', countrycode: '+91',
      participantmode: opts.participantmode || 'Discovery Mode',
      customerstatus: opts.customerstatus ?? 'active',
      financialstatus: opts.financialstatus ?? 'paid',
      activejourney: opts.activejourney ?? null,
      activeproduct: opts.activeproduct ?? [],
      consumedproducts: [], unconsumedproducts: [],
      atccount: null, atcmodel: null, // display-only columns — null so ATC branches stay dead
      ...tag,
    });
  };
  // p0 = active (the journey/customer-status workhorse); p1/p2 = active (analytics filter majority);
  // p3 = "non active" (so the customerstatus filter has a distinguishable minority).
  await seedProfile('p0', { customerstatus: 'active', activejourney: ID.J1, activeproduct: [ID.P1] });
  await seedProfile('p1', { customerstatus: 'active' });
  await seedProfile('p2', { customerstatus: 'active' });
  await seedProfile('p3', { customerstatus: 'non active', participantmode: 'Exploration Mode' });

  // 5) JOURNEY + PRODUCT for p0 — the CF inputs (journey_to_pmd / productsdata_to_pmd) AND the
  //    userprofile Journey-tab render. ONE journey doc only (the CF's "active" path requires exactly
  //    one ongoing journey, 0 cancelled, 0 completed — participantmetadata.js:348).
  await db.collection('participantjourneyproduct').doc(ID.PJP0).set({
    docid: ID.PJP0, profileid: PF.p0, journeyref: journeyRef(ID.J1), journeystatus: 'ongoing',
    purchasedate: past, subscriptionstart: past, subscriptionend: future, onboarded: false, ...tag,
  });
  await db.collection('participantsproduct').doc(ID.PP0).set({
    docid: ID.PP0, profileid: PF.p0, productref: productRef(ID.P1), packageref: packageRef(ID.PKG1),
    status: 'ongoing', mode: 'Priority Mode', sequenceorder: 1, ...tag,
  });

  // 6) ask AH submission (participant-form-tracker tab 0 — read from the DEFAULT db, orderBy created
  //    desc). name + askah render in the merged/individual overlay; the row's Name column joins
  //    profile_data by profileid.
  await db.collection('ask AH').doc(ID.ASK0).set({
    docid: ID.ASK0, profileid: PF.p0, name: NAME.p0, askah: `TEST ask question ${TESTRUNID}`,
    installationaskah: null, created: nowTs(), ...tag,
  });
  // A SECOND ask AH for p1 so the participant-select filter (where profileid==selected) has something to
  // narrow AWAY: filtering to p0 must show p0's row and HIDE p1's row (the app's where-clause at work).
  await db.collection('ask AH').doc(ID.ASK1).set({
    docid: ID.ASK1, profileid: PF.p1, name: NAME.p1, askah: `TEST ask question one ${TESTRUNID}`,
    installationaskah: null, created: nowTs(), ...tag,
  });

  // 6b) love letter submission (participant-form-tracker tab 1 — read from the DEFAULT db, orderBy
  //     created desc). The Name column joins profile_data by profileid; loveletter is the content field.
  await db.collection('love letter').doc(ID.LL0).set({
    docid: ID.LL0, profileid: PF.p0, name: NAME.p0, loveletter: `TEST love letter ${TESTRUNID}`,
    created: nowTs(), ...tag,
  });

  // 7) formsByClient (FORMS DB) — one uP! Life Report submission within the last-30d window
  //    (view-participants-form default range; date > now-30d). formid == the tab-2 filter id so the
  //    form-tracker tab 2 surfaces it too. queueref/workshopref null (no cross-DB deref).
  await formsDb.collection('formsByClient').doc(ID.FBC0).set({
    docid: ID.FBC0, profileid: PF.p0, formid: UP_LIFE_REPORT_FORMID,
    formname: `TEST Life Report ${TESTRUNID}`, date: nowTs(), created: nowTs(),
    queueref: null, workshopref: null, liked: false, flag: false, opportunity: false,
    formarray: [{ fieldname: 'Notes', type: 'text', value: 'seeded answer' }], ...tag,
  });

  // 8) appflowbreaks rows (app-flow-breaks viewer — orderBy date desc; type chips derived from the set).
  //    AFB0 = type 'navigation'; AFB1 = a DIFFERENT type ('playback') so the type-chip FILTER has two
  //    classes to switch between (clicking the 'playback' chip must hide the 'navigation'-only card).
  await db.collection('appflowbreaks').doc(ID.AFB0).set({
    docid: ID.AFB0, profileid: PF.p0, date: nowTs(), log: ['step1', 'step2'],
    note: `TEST flow break ${TESTRUNID}`, type: 'navigation', ...tag,
  });
  await db.collection('appflowbreaks').doc(ID.AFB1).set({
    docid: ID.AFB1, profileid: PF.p1, date: nowTs(), log: ['stepA'],
    note: `TEST playback break ${TESTRUNID}`, type: 'playback', ...tag,
  });

  // 9) CF-only profile for the metadata-sync assertion (PA-CF-01). profile_data with an ORIGINAL name;
  //    the spec mutates name -> a NEW value and asserts the CF wrote it through to participant metadata.
  //    No participant metadata seeded here (the CF creates/merges it). number present so the CF's change
  //    guard has prior values; name unique per run so the change actually fires (recon gotcha #8).
  await profileRef(ID.CFPF).set({
    docid: ID.CFPF, profileid: ID.CFPF, name: `CF Origin Name ${TESTRUNID}`,
    email: `cfprofile+${TESTRUNID}@example.com`, number: '9999000099', countrycode: '+91',
    participantmode: 'Discovery Mode', ...tag,
  });

  // 10) PRODUCT-CF profile (PA-CF-04/05): a dedicated profile whose participantsproduct we drive through
  //     statuses to assert productsdata_to_pmd projections — completed -> consumedproducts[], and the
  //     productcount map (one product seeded twice across two rows). participant metadata MUST exist for
  //     the CF (it aborts with "no profile exist" otherwise — participantmetadata.js:514). The product
  //     row (PPCF) starts ONGOING so the test's flip to 'completed' is a real status change the CF reacts
  //     to (participantmetadata.js:495). atccount/atcmodel null (ATC branches dead).
  await profileRef(ID.PRODPF).set({
    docid: ID.PRODPF, profileid: ID.PRODPF, name: `Product CF Profile ${TESTRUNID}`,
    email: `prodprofile+${TESTRUNID}@example.com`, number: '9999000077', countrycode: '+91',
    participantmode: 'Discovery Mode', ...tag,
  });
  await db.collection('participant metadata').doc(ID.PRODPF).set({
    docid: ID.PRODPF, profileid: ID.PRODPF, name: `Product CF Profile ${TESTRUNID}`,
    email: `prodprofile+${TESTRUNID}@example.com`, customerstatus: 'active',
    activeproduct: [], consumedproducts: [], unconsumedproducts: [], productcount: {},
    atccount: null, atcmodel: null, ...tag,
  });
  await db.collection('participantsproduct').doc(ID.PPCF).set({
    docid: ID.PPCF, profileid: ID.PRODPF, productref: productRef(ID.P1), packageref: packageRef(ID.PKG1),
    status: 'ongoing', mode: 'Priority Mode', sequenceorder: 1, ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, NAME, UP_LIFE_REPORT_FORMID,
    counts: {
      profiles: participants.length, journeys: 1, products: 2, askAH: 2, loveLetter: 1,
      formsByClient: 1, appflowbreaks: 2, productCfProducts: 1,
    },
  };
}

// Collections this seed writes (for teardown). formsByClient lives in the forms DB — swept separately.
const SEEDED = [
  'journey', 'products', 'package',
  'profile_data', 'participant metadata', 'participantjourneyproduct', 'participantsproduct',
  'ask AH', 'love letter', 'appflowbreaks',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched)
  'user_data', 'users_roles', 'dashboard',
];
const SEEDED_FORMS_DB = ['formsByClient'];

async function teardownProfiles() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  let n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Forms DB sweep (named-DB handle).
  const { getFirestore } = require('firebase-admin/firestore');
  const formsDb = getFirestore(admin.app(), 'firestore-forms');
  for (const col of SEEDED_FORMS_DB) {
    const snap = await formsDb.collection(col).where('testrunid', '==', TESTRUNID).get();
    const batch = formsDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) { await batch.commit(); n += snap.size; }
  }
  // Also delete the participant metadata the CF may have created for the CF-only profile.
  await db.collection('participant metadata').doc(ID.CFPF).delete().catch(() => {});
  // Delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, NAME, ROUTES, SEEDED, UP_LIFE_REPORT_FORMID, seedProfiles, teardownProfiles };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedProfiles(); console.log('[seed-profiles] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownProfiles(); console.log('[seed-profiles] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-profiles.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
