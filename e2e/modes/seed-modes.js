// @ts-nocheck
/**
 * seed-modes.js — stand up the "Product Modes & App Engagement" world on the dedicated disposable
 * test project (slabs-queue-e2e-exdcz), reusing the proven queue/appointments primitives
 * (allowlist-guarded admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Recon: e2e/recon-allcomp/product-modes.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every doc is tagged
 * {testrunid:'mode', _testdata:true}, and NO ATC collection is ever touched (products are seeded
 * with atcmodel:null so the mode/ATC branches stay dead; the participant-ael route is excluded).
 *
 * Actors (custom roster — App-Engagement screens need a `developer` role for the wishlist-log
 * fullAccess column; the queue makeStaff roster lacks it, so we define our own here):
 *   admin+mode@example.com       roles {admin, ah}      — super-role, sees all mode screens
 *   developer+mode@example.com   roles {admin, developer} — unlocks wishlist-log Delete/Cancel column
 *   participant0+mode@example.com roles {participant}    — the seeded mode/wishlist subject
 *   participant1+mode@example.com roles {participant}    — 2nd subject (CF-completion participant)
 *
 * Usage:  node e2e/modes/seed-modes.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.MODE_RUNID || 'mode';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  // products
  P1: `${TESTRUNID}_P1`,            // CF-test product (PM-10/11): modeflow Integration+Performance, day-knobs set
  P2: `${TESTRUNID}_P2`,            // config-UI product (PM-04/05): modeflow Integration+Performance
  // product mode config
  PMC_P1_INTEG: `${TESTRUNID}_PMC_P1_integ`,   // (P1, Integration Mode) — CF checklist source (PM-10), 1 widget
  PMC_P2_INTEG: `${TESTRUNID}_PMC_P2_integ`,   // (P2, Integration Mode) — 2 widgets, PM-05 extends → 3
  // (P2, Performance Mode) has NO config doc on purpose — PM-04 saves a brand-new one
  // modes catalog (run-scoped; joins the shared `modes` collection, tagged for teardown)
  MODE_INTEG: `${TESTRUNID}_mode_integration`,
  MODE_PERF: `${TESTRUNID}_mode_performance`,
  MODE_PRIORITY: `${TESTRUNID}_mode_priority`,
  // participantsproduct rows
  PP1: `${TESTRUNID}_PP1`,          // CF-completion subject (participant1): status ongoing → completed
  // evolution wishlist log docs
  EWL_INIT: `${TESTRUNID}_ewl_initiated`,   // status:initiated  → PM-07 cancels it
  EWL_CANCEL: `${TESTRUNID}_ewl_cancelled`, // status:cancelled  → PM-06 re-initiates from it
  // test clock
  ATESTDATE: 'date',
};

// Actors. profileids run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  developer: `${TESTRUNID}_pf_developer`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  developer: `developer+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin', 'ah'], 'admin'),
    mk('developer', ['admin', 'developer'], 'developer'),
  ];
  const participants = [mk('p0', ['participant'], 'participant'), mk('p1', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the modes specs navigate to (each needs a dashboard route-config grant). The participant-ael
// route is INTENTIONALLY EXCLUDED (it reads the off-limits firestore-atc DB).
const ROUTES = [
  { route: '/modedashboard', label: 'Mode Dashboard' },
  { route: '/mode-dashboard-new', label: 'Mode Dashboard New' },
  { route: '/productmodeconfig', label: 'Product Mode Config' },
  { route: '/evolutionwishlistlog', label: 'Evolution Wishlist Log' },
  { route: '/interimreportlog', label: 'Interim Report Log' },
  { route: '/appactionpending', label: 'App Action Pending' },
  { route: '/recommendedplaylist', label: 'Recommended Playlist' },
  { route: '/bigwall', label: 'Bigwall Data Adding' },
];

// The two modeflow modes every seeded product carries. Both are post-completion arc modes the CF
// (calculateParticipantMode) advances into — and both are non-ATC standard mode names.
const MODEFLOW = ['Integration Mode', 'Performance Mode'];

async function seedModes() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). Reused verbatim from the queue seeder. NOTE: this also writes
  //    profile_data with participantmode UNSET → the profiledata_to_participantmetadata CF will fire
  //    during seeding (expected; it targets the test Watson, never prod — see blockers/notes).
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes.
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // --- refs ---
  const productRef = (id) => db.collection('products').doc(id);
  const pmcRef = (id) => db.collection('product mode config').doc(id);

  // 3) PRODUCTS — both carry the same modeflow + the three day-knobs the completion-arc CF needs
  //    (R2: calculateParticipantMode's else-branch requires integration/performance/extendedperformance
  //    days all non-null). atcmodel:null keeps the ATC widget branch dead. deliveryplanning controls the
  //    new-product mode default (not exercised here). Names are distinct + searchable for the config UI.
  await productRef(ID.P1).set({
    docid: ID.P1, product: `TEST Mode CF Product ${TESTRUNID}`, mode: 'Priority Mode',
    modeflow: MODEFLOW, integrationdays: 30, performancedays: 30, extendedperformancedays: 30,
    deliveryplanning: 'normal', atcmodel: null, ...tag,
  });
  await productRef(ID.P2).set({
    docid: ID.P2, product: `TEST Mode Config Product ${TESTRUNID}`, mode: 'Priority Mode',
    modeflow: MODEFLOW, integrationdays: 30, performancedays: 30, extendedperformancedays: 30,
    deliveryplanning: 'normal', atcmodel: null, ...tag,
  });

  // 4) MODES catalog (run-scoped). The CF (calculateParticipantMode:190) and both dashboards read the
  //    ENTIRE `modes` collection ordered by `sequence`; these two ensure "Integration Mode" /
  //    "Performance Mode" exist + are ordered for the CF rollup (lowest-sequence wins). High sequence
  //    numbers (900/901) keep them late in the shared catalog without disturbing the queue suite's
  //    low-sequence modes. atcmodel-free; pure config.
  await db.collection('modes').doc(ID.MODE_INTEG).set({ docid: ID.MODE_INTEG, mode: 'Integration Mode', sequence: 900, info: null, ...tag });
  await db.collection('modes').doc(ID.MODE_PERF).set({ docid: ID.MODE_PERF, mode: 'Performance Mode', sequence: 901, info: null, ...tag });
  // 'Priority Mode' must be in the catalog (sequence ABOVE Integration, per the production order
  // Integration<Priority) so the engine's rollup never treats it as indexOf==-1 (which would sort it
  // FIRST and let a transient Priority headline beat Integration in the multi-product rollup, PM-ROLLUP-MULTI).
  await db.collection('modes').doc(ID.MODE_PRIORITY).set({ docid: ID.MODE_PRIORITY, mode: 'Priority Mode', sequence: 902, info: null, ...tag });

  // 5) PRODUCT MODE CONFIG.
  //    PMC_P1_INTEG — (P1, Integration Mode), 1 widget. REQUIRED by the CF: the checklist/evolution-log
  //    creation at participantmode.js:247 only fires when a `product mode config` doc matches
  //    (productref==, mode==) — needs the composite index returned in neededIndexes. widgets[] is copied
  //    verbatim into the checklist's `widget` field.
  await pmcRef(ID.PMC_P1_INTEG).set({
    docid: ID.PMC_P1_INTEG, productref: productRef(ID.P1), mode: 'Integration Mode',
    widgets: [{ widgetid: 'cycleofevolution', title: 'Start Cycle of Evolution', reference: [], dos: [], donts: [], mandatory: false }],
    modetips: [], lastupdate: T.now(), ...tag,
  });
  //    PMC_P2_INTEG — (P2, Integration Mode), 2 widgets. PM-05 opens this in the edit dialog, adds a 3rd
  //    widget, saves → asserts widgets.length==3 (the value the APP wrote, not the seed's 2).
  await pmcRef(ID.PMC_P2_INTEG).set({
    docid: ID.PMC_P2_INTEG, productref: productRef(ID.P2), mode: 'Integration Mode',
    widgets: [
      { widgetid: 'cycleofevolution', title: 'Start Cycle of Evolution', reference: [], dos: [], donts: [], mandatory: false },
      { widgetid: 'impactstats', title: 'Impact & Non Impact Stats', reference: [], dos: [], donts: [], mandatory: false },
    ],
    modetips: [], lastupdate: T.now(), ...tag,
  });
  // (P2, Performance Mode) — NO doc. PM-04 saves the first config for it and asserts the APP wrote
  // lastupdate (serverTimestamp) + widgets.length==1.

  // 6) participantsproduct for the CF-completion subject (participant1). status:'ongoing' so the
  //    first write (status→completed, no statusdate.completed) hits the simple completion branch
  //    (participantmode.js:80) → mode:'Integration Mode'. mode/nextmode null so the CF's mode-changed
  //    branch fires on the transition. PRECONDITION ONLY — the spec asserts the CF-written checklist
  //    + profile_data.participantmode, never these seeded values (anti-circularity).
  await db.collection('participantsproduct').doc(ID.PP1).set({
    docid: ID.PP1, profileid: PF.p1, productref: productRef(ID.P1),
    mode: 'Priority Mode', nextmode: null, nextmodedate: null,
    deliverymode: 'Priority Mode', status: 'ongoing', statusdate: {}, sequenceorder: 0,
    aelid: null, ...tag,
  });

  // 7) participant metadata for participant1 — customerstatus:'active' so the CF rollup
  //    (participantmode.js:215) sets participantMode = lowest-sequence mode = "Integration Mode"
  //    (the single product's mode after completion). participantmode seeded null (the CF writes it).
  await db.collection('participant metadata').doc(PF.p1).set({
    profileid: PF.p1, name: EMAIL.p1, customerstatus: 'active', participantmode: null, ...tag,
  }, { merge: true });

  // 8) EVOLUTION WISHLIST LOG docs.
  //    EWL_INIT — status:'initiated' for participant0. PM-07 clicks Cancel → asserts the APP wrote
  //    status:'cancelled' + closedbeforeshare:true.
  await db.collection('evolutionwishlistlog').doc(ID.EWL_INIT).set({
    docid: ID.EWL_INIT, profileid: PF.p0, type: 'familyandpeers', status: 'initiated', created: T.now(), ...tag,
  });
  //    EWL_CANCEL — status:'cancelled' for participant1. PM-06 clicks Re-initiate (enabled because the
  //    row is cancelled) → the EvolutionWishlistLogComponent dialog opens (no confirm for cancelled
  //    rows) → pick type → Create → a NEW initiated doc is written. We assert countWhere(initiated)==1
  //    for participant1 (the doc the APP created; participant1 has no other initiated row).
  await db.collection('evolutionwishlistlog').doc(ID.EWL_CANCEL).set({
    docid: ID.EWL_CANCEL, profileid: PF.p1, type: 'familyandpeers', status: 'cancelled',
    closedbeforeshare: true, created: T.fromMillis(Date.now() - 3600e3), ...tag,
  });

  // 9) TEST CLOCK — pin calculateParticipantMode's "now" to a stable value (participantmode.js:12-17
  //    reads /Atestdate/date and uses it as currentDate). Set to NOW at seed time so the completion
  //    branch's date math is deterministic across the run. Not run-namespaced (the CF reads a fixed
  //    doc path); tagged + idempotent.
  await db.collection('Atestdate').doc(ID.ATESTDATE).set({ date: T.now(), ...tag }, { merge: true });

  return {
    TESTRUNID, ID, PF, EMAIL,
    counts: { products: 2, productModeConfig: 2, modes: 2, participantsproduct: 1, evolutionwishlistlog: 2 },
  };
}

// Collections this seed writes (for teardown). NOTE: `modes` and `Atestdate` are shared config
// collections — teardown removes ONLY this run's tagged docs (testrunid-scoped), leaving the queue
// suite's modes catalog and any real config untouched.
const SEEDED = [
  'products', 'product mode config', 'modes', 'participantsproduct', 'participant metadata',
  'evolutionwishlistlog', 'Atestdate',
  // CF-written collections (PM-10/11): clean up so re-runs start from zero checklist/evolution-log rows.
  'participant mode checklist', 'evolution log',
  // auth-chain + dashboard (shared shape; testrunid-scoped so queue 'run1' is untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownModes() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Also delete the Auth users (uids carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, ROUTES, MODEFLOW, SEEDED, seedModes, teardownModes };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedModes(); console.log('[seed-modes] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownModes(); console.log('[seed-modes] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-modes.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
