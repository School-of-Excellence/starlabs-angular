// @ts-nocheck
/**
 * seed-journey.js — stand up the Journey & Products world on the dedicated disposable test project
 * (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded admin init,
 * the staff auth chain, the dashboard route-grant doc shape) via lib/seed-common.
 *
 * Covers the test-project-only Journey & Products screens (recon: e2e/recon-allcomp/journey-products.md):
 *   Product Designer catalog : /addjourney /addproduct /journeyproductmap /addpackage /deliverysequence
 *   Participant management    : /participantpurchase/:pid  /journeysupport/:pid  /participantproduct
 *                               /participantdeliverysequence/:pid
 *   Dashboards (render only)  : /productinitiated-dashboard
 *
 * WATSON / SALESCRM (GROUP NOTES): journey-product-purchase + journeyplan lazily init a SEPARATE
 * Firebase app via getApp("watson"); saleslead/onboarding-pipeline use getApp("salescrm"). In the test
 * build environment.ts carries NO `watson`/`salescrm` keys, so AuthguardService.initializeWatson()
 * SKIPS initializeApp and getApp("watson") THROWS. We NEVER drive a Watson/SalesCRM action; the silent
 * init failure is tolerated by the journey suite's console guard (see support/journey.ts JOURNEY_IGNORABLE).
 * NO Watson/SalesCRM doc is ever seeded. See README/blockers.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the test
 * project), every doc is tagged {testrunid:'jny', _testdata:true}, and NO ATC collection is ever touched
 * (journeys + products are seeded with atcmodel:null so every ATC branch stays dead).
 *
 * Actors (custom roster — Journey & Products needs an admin super-role + a journeycoach + integrator;
 * the queue makeStaff roster only carries admin/mentor/specialist/big, so we define our own here):
 *   admin+jny@example.com         roles {admin, ah}      — super-role: sees every catalog/participant screen
 *   journeycoach+jny@example.com  roles {journeycoach}    — /opportunities scope (render only)
 *   integrator+jny@example.com    roles {integrator}      — Product Designer catalog (gates commented out)
 *   participant0+jny@example.com  roles {participant}     — the :pid for purchase / support / delivery
 *
 * Usage:  node e2e/journey/seed-journey.js --seed | --teardown   (run from the e2e/ dir)
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.JNY_RUNID || 'jny';

// ---- deterministic doc ids (run-prefixed; idempotent re-seed) ----------------------------------
const ID = {
  // catalog
  J1: `${TESTRUNID}_J1`,        // journey "Test Journey <run>" (mapped to product, used as purchase journeyref)
  J2: `${TESTRUNID}_J2`,        // journey "Test Journey Two <run>" (UNMAPPED — JP-04 maps it fresh)
  P1: `${TESTRUNID}_P1`,        // products "Test Product <run>" (atcmodel:null)
  P2: `${TESTRUNID}_P2`,        // products "Test Product Two <run>"
  PKG1: `${TESTRUNID}_PKG1`,    // package "Test Package <run>"
  J2P1: `${TESTRUNID}_J2P1`,    // journey-to-product mapping (J1 -> [P1]) — seeded baseline (JP-17 render)
  PDS1: `${TESTRUNID}_PDS1`,    // productToDeliverySequence (P1)
  // participant runtime (the :pid participant's purchase/support/delivery preconditions)
  PJP1: `${TESTRUNID}_PJP1`,    // participantjourneyproduct (journeyref J1, initiated, NOT onboarded)
  PJP2: `${TESTRUNID}_PJP2`,    // participantjourneyproduct (journeyref J1, initiated) — 2nd row for count
  PP1: `${TESTRUNID}_PP1`,      // participantsproduct (P1, Priority Mode)
  PP2: `${TESTRUNID}_PP2`,      // participantsproduct (P2)
};

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  journeycoach: `${TESTRUNID}_pf_journeycoach`,
  integrator: `${TESTRUNID}_pf_integrator`,
  p0: `${TESTRUNID}_pf_p0`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  journeycoach: `journeycoach+${TESTRUNID}@example.com`,
  integrator: `integrator+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
};

// The :pid the purchase / journeysupport / delivery routes navigate to (the seeded participant's profileid).
const PID = PF.p0;

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin', 'ah'], 'admin'),
    mk('journeycoach', ['journeycoach', 'ahmember'], 'journeycoach'),
    mk('integrator', ['integrator'], 'integrator'),
  ];
  const participants = [mk('p0', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the journey specs navigate to (each needs a dashboard route-config grant so the data-driven
// authGuard admits the seeded staff; participant landing not needed — all screens are STAFF screens).
const ROUTES = [
  { route: '/addjourney', label: 'Add Journey' },
  { route: '/addproduct', label: 'Add Product' },
  { route: '/addpackage', label: 'Add Package' },
  { route: '/journeyproductmap', label: 'Journey Product Map' },
  { route: '/deliverysequence', label: 'Delivery Sequence' },
  { route: '/participantproduct', label: 'Participant Product' },
  { route: '/participantpurchase', label: 'Participant Purchase' },
  { route: '/journeysupport', label: 'Journey Support' },
  { route: '/participantdeliverysequence', label: 'Participant Delivery Sequence' },
  { route: '/productinitiated-dashboard', label: 'Product Initiation Dashboard' },
  { route: '/formtemplate', label: 'Form Template' },
];

async function seedJourney() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). Reused verbatim from the queue/appointments seeder.
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes.
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // --- refs ---
  const journeyRef = (id) => db.collection('journey').doc(id);
  const productRef = (id) => db.collection('products').doc(id);

  // 3) CATALOG (journey / products / package) — all atcmodel:null so ATC branches stay dead.
  //    journey: addjourney renders row.journey, orders by `sequence`; JourneyEntry writes `id`.
  await journeyRef(ID.J1).set({ id: ID.J1, journey: `Test Journey ${TESTRUNID}`, sequence: 990, originalfee: 1000, atcmodel: null, type: 'DFU', ...tag });
  await journeyRef(ID.J2).set({ id: ID.J2, journey: `Test Journey Two ${TESTRUNID}`, sequence: 991, originalfee: 2000, atcmodel: null, type: 'NDFU', ...tag });

  //    products: add-product reads with {idField:'id'} (so the DOC id is the id); renders row.product.
  await productRef(ID.P1).set({
    product: `Test Product ${TESTRUNID}`, minimumrequiredamount: 100, mode: 'online',
    atcmodel: null, deliveryplanning: 'Standard', unlimited: false, originalfee: 100, ...tag,
  });
  await productRef(ID.P2).set({
    product: `Test Product Two ${TESTRUNID}`, minimumrequiredamount: 200, mode: 'online',
    atcmodel: null, deliveryplanning: 'Standard', unlimited: false, originalfee: 200, ...tag,
  });

  //    package: purchase form maps by `docid` -> `package` name.
  await db.collection('package').doc(ID.PKG1).set({ docid: ID.PKG1, package: `Test Package ${TESTRUNID}`, nonjourney: false, ...tag });

  //    journey-to-product baseline mapping (J1 -> [P1]) — journeyproductmap renders mapJourney[journey.path]
  //    (JP-17 render). J2 is intentionally LEFT UNMAPPED so JP-04 can map it fresh and assert the new doc.
  await db.collection('journey-to-product').doc(ID.J2P1).set({
    journey: journeyRef(ID.J1), product: [productRef(ID.P1)], journeyrequiredjourneycoach: false, ...tag,
  });

  //    productToDeliverySequence (P1) — purchase form reads mapProductDeliveryType[product.id].
  await db.collection('productToDeliverySequence').doc(ID.PDS1).set({
    docid: ID.PDS1, product: productRef(ID.P1),
    deliveryoptions: [{ deliverytype: 'Standard Delivery' }], ...tag,
  });

  // 4) PARTICIPANT runtime preconditions for the :pid participant ----------------------------------
  //    participant metadata/{pid} — REQUIRED by journeyplan (journeyplan.ts:97-101 reads this doc and
  //    does parseInt(clientdata['pp_totalpaid']) UNGUARDED; a missing doc strands the screen).
  await db.collection('participant metadata').doc(PID).set({
    docid: PID, profileid: PID, name: `Journey Test User ${TESTRUNID}`, email: EMAIL.p0,
    pp_totalpaid: '0', pp_totalpurchasevalue: '0', customerstatus: 'active', financestatus: 'regular',
    activeproduct: [], consumedproducts: [], participantmode: null, ...tag,
  });

  //    participantjourneyproduct x2 — purchase form (JP-05) builds a row per PJP; journeysupport (JP-07)
  //    shows the first initiated journeyref. participantproducts:[] is REQUIRED (journey-product-purchase
  //    .ts:342 reads .length UNGUARDED). paymentplan:null + onboarded:false → journeysupport renders the
  //    "Payment plan not updated — cannot onboard yet" state (NO mark dialog → no Watson-coupled write).
  const mkPjp = (id) => ({
    docid: id, profileid: PID, journeyref: journeyRef(ID.J1), journeystatus: 'initiated',
    onboarded: false, paymentplan: null, purchaseref: null, participantproducts: [],
    purchasedate: T.fromMillis(Date.now() - 3 * 86400e3), ...tag,
  });
  await db.collection('participantjourneyproduct').doc(ID.PJP1).set(mkPjp(ID.PJP1));
  await db.collection('participantjourneyproduct').doc(ID.PJP2).set(mkPjp(ID.PJP2));

  //    participantsproduct x2 — participantproduct view + delivery-sequence baseline.
  await db.collection('participantsproduct').doc(ID.PP1).set({
    docid: ID.PP1, profileid: PID, productref: productRef(ID.P1), packageref: db.collection('package').doc(ID.PKG1),
    status: 'initiated', deliverymode: 'Priority Mode', minimumpayment: 100, sequenceorder: 0, ...tag,
  });
  await db.collection('participantsproduct').doc(ID.PP2).set({
    docid: ID.PP2, profileid: PID, productref: productRef(ID.P2), packageref: db.collection('package').doc(ID.PKG1),
    status: null, deliverymode: 'Priority Mode', minimumpayment: 200, sequenceorder: 1, ...tag,
  });

  //    participantdeliverysequence/{pid} — baseline for the delivery-sequence render.
  await db.collection('participantdeliverysequence').doc(PID).set({
    docid: PID, profileid: PID,
    products: [{ participantproductid: ID.PP1, productref: productRef(ID.P1), delivery: [] }], ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, PID,
    names: { journey1: `Test Journey ${TESTRUNID}`, journey2: `Test Journey Two ${TESTRUNID}`, product1: `Test Product ${TESTRUNID}`, product2: `Test Product Two ${TESTRUNID}` },
    counts: { journey: 2, products: 2, journeyToProduct: 1, participantjourneyproduct: 2 },
  };
}

// Collections this seed writes (for teardown). All testrunid-scoped so other runs are untouched.
const SEEDED = [
  'journey', 'products', 'package', 'journey-to-product', 'productToDeliverySequence',
  'participant metadata', 'participantjourneyproduct', 'participantsproduct', 'participantdeliverysequence',
  // auth-chain + dashboard (shared shape; testrunid-scoped so queue 'run1' is untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownJourney() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Also delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, PID, ROUTES, SEEDED, seedJourney, teardownJourney };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedJourney(); console.log('[seed-journey] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownJourney(); console.log('[seed-journey] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-journey.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
