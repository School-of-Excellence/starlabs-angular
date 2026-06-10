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
  // --- DEEP additions ----------------------------------------------------------------------------
  // p1 = a SECOND participant kept OFF p0 so the onboard/email-archive WRITE cases (JP-08/JP-09)
  // can't perturb the p0 render cases (JP-05/JP-07). Its single PJP carries paymentplan != null so
  // journeysupport renders the "Mark as Onboarded" button (gated off for p0 by paymentplan:null).
  PJP_ONB: `${TESTRUNID}_PJP_ONB`,  // participantjourneyproduct (journeyref J1, initiated, paymentplan set, NOT onboarded) — JP-08 + JP-09 (the single deterministic onboard target for p1)
  SL1: `${TESTRUNID}_SL1`,          // salesleads doc (status null) — JP-10 reject (test-project-only, no Watson)
  DF1: `${TESTRUNID}_DF1`,          // delivery forms doc with a formarray — formtemplate render (JP-16) + a deliverysequence-authoring activity option (JP-AUTH)
  APT1: `${TESTRUNID}_APT1`,        // appointmenttype doc — a second deliverysequence-authoring activity option
  EMT1: `${TESTRUNID}_EMT1`,        // email templates doc (active:true) — JP-09 onboarding email template
};

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  journeycoach: `${TESTRUNID}_pf_journeycoach`,
  integrator: `${TESTRUNID}_pf_integrator`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,   // DEEP: the onboard/email-archive participant (paymentplan set on its PJP)
  p2: `${TESTRUNID}_pf_p2`,   // DEEP: a CLEAN-slate participant (0 purchases) for the JP-06 purchase-save case
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  journeycoach: `journeycoach+${TESTRUNID}@example.com`,
  integrator: `integrator+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
  p2: `participant2+${TESTRUNID}@example.com`,
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
  const participants = [
    mk('p0', ['participant'], 'participant'),
    mk('p1', ['participant'], 'participant'),
    mk('p2', ['participant'], 'participant'),
  ];
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
  // DEEP routes
  { route: '/salesleads', label: 'Sales Leads' },             // JP-10 reject
  { route: '/productdelivery', label: 'Product Delivery' },   // product-delivery render + entry to deliverysequence authoring
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

  // 5) DEEP preconditions ===========================================================================

  //    p1 participant metadata — the onboard/email-archive participant. journeyplan reads this doc
  //    (parseInt pp_totalpaid UNGUARDED) so it must exist, same shape as p0's.
  await db.collection('participant metadata').doc(PF.p1).set({
    docid: PF.p1, profileid: PF.p1, name: `Journey Onboard User ${TESTRUNID}`, email: EMAIL.p1,
    pp_totalpaid: '0', pp_totalpurchasevalue: '0', customerstatus: 'active', financestatus: 'regular',
    activeproduct: [], consumedproducts: [], participantmode: null, ...tag,
  });

  //    p2 participant metadata — the CLEAN-slate purchase participant (JP-06). NO purchases seeded:
  //    the purchase form for p2 starts empty, so the save creates the FIRST PJP/JPP/PSP (0 -> 1 the
  //    anti-circular oracle). journey-product-purchase reads profile_data.name for the title.
  await db.collection('participant metadata').doc(PF.p2).set({
    docid: PF.p2, profileid: PF.p2, name: `Journey Purchase User ${TESTRUNID}`, email: EMAIL.p2,
    pp_totalpaid: '0', pp_totalpurchasevalue: '0', customerstatus: 'active', financestatus: 'regular',
    activeproduct: [], consumedproducts: [], participantmode: null, ...tag,
  });

  //    JP-08 / JP-09 onboard PJP (for p1). EXACTLY ONE initiated PJP for p1 so journeyplan's
  //    participantJourneyData (the first initiated journeyref PJP) is DETERMINISTIC — both the onboard
  //    flip (JP-08) and the email-archive submit (JP-09) act on THIS doc. paymentplan TRUTHY → the
  //    "Mark as Onboarded" button renders (journeyplan.html:521); onboarded:false is the PRECONDITION the
  //    app's updateDoc flips to true. participantproducts:[] (read .length UNGUARDED). NO salesleadsref
  //    (so the OnboardingRemark dialog skips the Watson/salesleads join entirely).
  await db.collection('participantjourneyproduct').doc(ID.PJP_ONB).set({
    docid: ID.PJP_ONB, profileid: PF.p1, journeyref: journeyRef(ID.J1), journeystatus: 'initiated',
    onboarded: false, paymentplan: 'EMI 3', purchaseref: null, participantproducts: [],
    opportunities: [], referral: null, appointmentid: null, onboardingscheduled: null,
    purchasedate: T.fromMillis(Date.now() - 2 * 86400e3), ...tag,
  });

  //    JP-10 salesleads doc (status NULL → the Reject button renders; saleslead.html:302). Reject is a
  //    test-project-only write (updateDoc status:'Rejected') — NO Watson, NO salescrm; the
  //    breakthroughapprovedleads HTTP CF it then calls is short-circuited by the prod firewall.
  await db.collection('salesleads').doc(ID.SL1).set({
    docid: ID.SL1, profileid: PF.p0, name: `Lead Reject Test ${TESTRUNID}`, email: EMAIL.p0,
    journey: ID.J1, journeytype: 'new', status: null, salespersonname: 'E2E Seeder',
    date: T.fromMillis(Date.now()), purchasedate: T.fromMillis(Date.now()),
    totalpurchasevalue: 1000, initialpayment: 100, installmentamount: 300, ...tag,
  });

  //    delivery forms doc with a formarray — formtemplate route (?id=DF1) builds the form from this
  //    (JP-16 render), and it is also a "Form" delivery activity option in the deliverysequence
  //    authoring screen (JP-AUTH). The formarray carries one short-text field whose label the
  //    formtemplate render asserts (app-computed from this doc).
  //    formarray uses the REAL formtemplate schema (formtemplate.html): a 'label' section field renders
  //    {{fieldname}}/{{fielddescription}}; a 'Text' field renders {{fieldname}} + a text input (and the
  //    component adds a FormControl for it). JP-16 asserts the Text field's fieldname renders.
  await db.collection('delivery forms').doc(ID.DF1).set({
    docid: ID.DF1, formname: `Test Delivery Form ${TESTRUNID}`,
    formarray: [
      { type: 'label', fieldname: `Onboarding Questionnaire ${TESTRUNID}`, fielddescription: 'Seeded section.' },
      { type: 'Text', fieldname: `Participant Goal ${TESTRUNID}`, required: false },
    ], ...tag,
  });

  //    appointmenttype doc — a second delivery activity option for the deliverysequence authoring.
  await db.collection('appointmenttype').doc(ID.APT1).set({
    docid: ID.APT1, appointmenttype: `Test Appt Type ${TESTRUNID}`, ...tag,
  });

  //    email templates doc (active:true) — the OnboardingRemark dialog loads active templates
  //    (onboarding-remark.ts:296 where active==true) and createEmailArchive writes one `email archive`
  //    doc from the selected template (JP-09). htmlbody carries {{name}} so the preview builds.
  await db.collection('email templates').doc(ID.EMT1).set({
    docid: ID.EMT1, templatename: `Test Onboarding Template ${TESTRUNID}`,
    templatealias: `test_onboarding_${TESTRUNID}`, active: true, postmarkstatus: 'approved',
    subject: `Welcome ${TESTRUNID}`, htmlbody: '<p>Hello {{name}}, welcome to {{journey}}.</p>',
    attachments: [], servername: null, postmarktemplateid: null, templateid: `test_onboarding_${TESTRUNID}`, ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, PID, PID_ONB: PF.p1,
    names: {
      journey1: `Test Journey ${TESTRUNID}`, journey2: `Test Journey Two ${TESTRUNID}`,
      product1: `Test Product ${TESTRUNID}`, product2: `Test Product Two ${TESTRUNID}`,
      package1: `Test Package ${TESTRUNID}`, salesLead: `Lead Reject Test ${TESTRUNID}`,
      deliveryForm: `Test Delivery Form ${TESTRUNID}`, apptType: `Test Appt Type ${TESTRUNID}`,
      emailTemplate: `Test Onboarding Template ${TESTRUNID}`, formField: `Participant Goal ${TESTRUNID}`,
    },
    counts: { journey: 2, products: 2, journeyToProduct: 1, participantjourneyproduct: 3 },
  };
}

// Collections this seed writes (for teardown). All testrunid-scoped so other runs are untouched.
const SEEDED = [
  'journey', 'products', 'package', 'journey-to-product', 'productToDeliverySequence',
  'participant metadata', 'participantjourneyproduct', 'participantsproduct', 'participantdeliverysequence',
  // DEEP collections
  'salesleads', 'delivery forms', 'appointmenttype', 'email templates',
  // auth-chain + dashboard (shared shape; testrunid-scoped so queue 'run1' is untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

// Profileids whose APP-WRITTEN docs (no testrunid tag) we must clean by natural key. The deep WRITE
// cases (JP-06 purchase save, JP-09 email-archive) write docs through the real product code, which
// does NOT stamp testrunid — so the testrunid teardown would miss them. We sweep these by profileid.
const APP_WRITE_PROFILEIDS = [PF.p0, PF.p1];

async function teardownJourney() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);

  // APP-written docs (no testrunid) — delete by their natural key (profileid). Covers JP-06's new
  // journeyproductpurchase / participant purchase logs and JP-09's email archive doc.
  let appDeleted = 0;
  for (const col of ['journeyproductpurchase', 'participant purchase logs', 'email archive']) {
    for (const pid of APP_WRITE_PROFILEIDS) {
      // email archive stores profileid as an ARRAY → array-contains; the others store a scalar string.
      const op = col === 'email archive' ? 'array-contains' : '==';
      const snap = await db.collection(col).where('profileid', op, pid).get().catch(() => ({ docs: [] }));
      for (const d of snap.docs) { await d.ref.delete().catch(() => {}); appDeleted++; }
    }
  }

  // Also delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n + appDeleted;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, PID, PID_ONB: PF.p1, ROUTES, SEEDED, seedJourney, teardownJourney };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedJourney(); console.log('[seed-journey] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownJourney(); console.log('[seed-journey] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-journey.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
