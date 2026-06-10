// @ts-nocheck
/**
 * seed-workshops.js — stand up the Workshops world on the dedicated disposable test project
 * (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded admin init,
 * the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/recon-allcomp/workshops.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes through
 * seed-test-project.initAdmin() (hard-aborts off the test project), every doc is tagged
 * {testrunid:'wshop', _testdata:true}, and NO ATC collection is ever touched. The taxonomy picker the
 * workshop-configuration screen reads (`atc taxonomy`) is reference-only config (CLAUDE.md "safe"); we
 * seed NO selectedTaxonomies so that dropdown stays inert.
 *
 * Actors (custom roster — the workshop dashboard's manual-move button is gated by a HARDCODED set of
 * production profileids (workshop-dashboard.component.ts:1688), so the move-next actor must carry one):
 *   admin+wshop@example.com   roles {admin, ah}                 — list/config/dashboard render (super-role)
 *   mover+wshop@example.com   roles {admin, ah}, pid 3LVxK…     — drives the manual move-next write (WS-12)
 *   participant0..2+wshop@example.com roles {participant}        — enrolled into the dashboard workshop
 *
 * Usage:  node e2e/workshops/seed-workshops.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.WSHOP_RUNID || 'wshop';

// The workshop dashboard's manual move-to-next action only renders/runs for a HARDCODED allow-list of
// production profileids (workshop-dashboard.component.ts:1688). To drive WS-12 (a real app-WRITE of
// manualcompletion:true) we make the "mover" actor's profileid EXACTLY one of those ids. This is an
// opaque doc id on a disposable test project — it couples only this one actor to the magic string, and
// nothing in prod is touched. The general "admin" actor keeps a run-namespaced profileid.
const MOVER_PID = '3LVxKXuyxldYoRDEpx5s';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  W_INACTIVE: `${TESTRUNID}_W_inactive`,   // workshopconfiguration active:false (toggle/detail-save pivot)
  W_ACTIVE: `${TESTRUNID}_W_active`,       // workshopconfiguration active:true  (active-filter floor)
  W_DASH: `${TESTRUNID}_W_dash`,           // workshopconfiguration with challenges[] (dashboard pivot)
  ENR_A: `${TESTRUNID}_enr_a`,             // workshop participant enrolled — status 'enrolled'  (p0)
  ENR_B: `${TESTRUNID}_enr_b`,             // workshop participant enrolled — status 'enrollednotstarted' (p1)
  PW_A: `${TESTRUNID}_pw_a`,               // participant workshop for p0 (1 of 2 sub-challenges complete = 50%)
  PW_B: `${TESTRUNID}_pw_b`,               // participant workshop for p1
};

// Actors. profileids are run-prefixed except the mover (see MOVER_PID). Emails follow actors.ts'
// `<role>+<run>@example.com` convention.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  mover: MOVER_PID,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
  p2: `${TESTRUNID}_pf_p2`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  mover: `mover+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
  p2: `participant2+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin', 'ah'], 'admin'),
    mk('mover', ['admin', 'ah'], 'admin'),
  ];
  const participants = [
    mk('p0', ['participant'], 'participant'),
    mk('p1', ['participant'], 'participant'),
    mk('p2', ['participant'], 'participant'),
  ];
  return { staff, operators: [], participants };
}

// Routes the workshop specs navigate to (each needs a dashboard route-config grant for authGuard).
// /create-workshop and /workshopconfig/:id are UNGUARDED (app.routes.ts:260-261) — granted anyway for
// uniformity; the guard simply isn't consulted there.
const ROUTES = [
  { route: '/workshops', label: 'Workshops' },
  { route: '/create-workshop', label: 'Create Workshop' },
  { route: '/workshopconfig', label: 'Workshop Configuration' },
  { route: '/workshop_dashboard', label: 'Workshop Dashboard' },
  { route: '/engagementdashboard', label: 'Engagement Dashboard' },
  { route: '/bigengagementdashboard', label: 'Capacity / BIG Engagement Dashboard' },
  { route: '/productpageworkshop', label: 'Workshop Products' },
  { route: '/formtemplateworkshop', label: 'Form Template Workshop' },
  { route: '/workshop_image_upload', label: 'Workshop Image Upload' },
  // Legacy eiflix Workshop/* routes — granted so the deep-suite legacy route-mount smoke can reach them.
  { route: '/workshopchallengecreation', label: 'Workshop Challenge Creation' },
  { route: '/enrollment_config_view', label: 'Enrolment Config View' },
  { route: '/workshopchallengeparticipantdashboard', label: 'Workshop Challenge Participant Dashboard' },
];

// A two-curriculum challenge structure shared by the workshop-config doc AND the seeded participant
// workshop docs. Curriculum[0] has 2 sub-challenges (1 completed on p0 = 50%); the manual move-next
// (WS-12) marks the FIRST not-completed sub-challenge of the current curriculum completed.
function workshopChallenges() {
  return [
    {
      type: 'challenge',
      challengeid: `${TESTRUNID}_ch0`,
      heading: 'Module One',
      subheading: 'Foundations',
      challenges: [
        { type: 'video', challengeid: `${TESTRUNID}_ch0_s0`, heading: 'Intro Video', status: '' },
        { type: 'video', challengeid: `${TESTRUNID}_ch0_s1`, heading: 'Deep Dive', status: '' },
      ],
    },
  ];
}

async function seedWorkshops() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). Reused verbatim from the queue seeder.
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes.
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // --- refs / helpers ---
  const wsRef = (id) => db.collection('workshopconfiguration').doc(id);
  const at = (dayOffset, h = 9, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return T.fromDate(d); };

  // 3) participant metadata for every enrolled profile — the dashboard progress table renders the
  //    participant NAME via mapProfile[profileid].name (workshop-dashboard.html:779); a missing name
  //    map throws on row render and trips the console guard. name/email/phonenumber are the fields the
  //    dashboard + comms paths read.
  const meta = (pf, name) => db.collection('participant metadata').doc(pf).set({
    docid: pf, profileid: pf, name, email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.com`,
    phonenumber: '9999900000', countrycode: '+91', customerstatus: 'active', ...tag,
  });
  await meta(PF.p0, `WS Alpha ${TESTRUNID}`);
  await meta(PF.p1, `WS Bravo ${TESTRUNID}`);
  await meta(PF.p2, `WS Charlie ${TESTRUNID}`);

  // 4) WORKSHOP CONFIG DOCS. Every app doc stores its own id as `docid` (app-wide convention) — the
  //    workshops list toggles/duplicates key off workshop.docid (workshops.component.ts:198,241), NOT
  //    the idField. atcmodel:null keeps any ATC branch dead.
  // 4a) inactive, not-completed — pivot for the activate toggle (WS-04) + detail-page save (WS-05).
  await wsRef(ID.W_INACTIVE).set({
    docid: ID.W_INACTIVE, active: false, workshopcompleted: false, categorybased: false, atcmodel: null,
    created: at(-10), detailpage: {
      type: 'workshop', title: `Inactive Workshop ${TESTRUNID}`, shortdescription: 'seeded inactive',
      workshopStartDate: at(2), workshopEndDate: at(9),
      registrationStartDate: at(-5), registrationEndDate: at(1),
    }, ...tag,
  });
  // 4b) active — counted by the active-filter floor (WS-03).
  await wsRef(ID.W_ACTIVE).set({
    docid: ID.W_ACTIVE, active: true, workshopcompleted: false, categorybased: false, atcmodel: null,
    created: at(-8), detailpage: {
      type: 'workshop', title: `Active Workshop ${TESTRUNID}`, shortdescription: 'seeded active',
      workshopStartDate: at(1), workshopEndDate: at(8),
      registrationStartDate: at(-6), registrationEndDate: at(0),
    }, ...tag,
  });
  // 4c) dashboard pivot — carries challenges[] so the participant-workshop progress + move-next align.
  await wsRef(ID.W_DASH).set({
    docid: ID.W_DASH, active: true, workshopcompleted: false, categorybased: false, atcmodel: null,
    created: at(-6), detailpage: {
      type: 'workshop', title: `Dashboard Workshop ${TESTRUNID}`, shortdescription: 'seeded dashboard',
      workshopStartDate: at(-1), workshopEndDate: at(6),
      registrationStartDate: at(-7), registrationEndDate: at(-2),
    },
    challenges: workshopChallenges(), ...tag,
  });

  // 5) ENROLLMENT for the dashboard workshop. The dashboard reads `workshop participant enrolled` where
  //    workshopref==ref (status-agnostic for totalEnrolled), but the progress table only includes
  //    status==='enrolled' rows (rebuildProgressFromMap, ts:841). So p0 is 'enrolled' (shows progress +
  //    move-next), p1 is 'enrollednotstarted' (counted in totalEnrolled only).
  const dashRef = wsRef(ID.W_DASH);
  const pwARef = db.collection('participant workshop').doc(ID.PW_A);
  const pwBRef = db.collection('participant workshop').doc(ID.PW_B);

  await db.collection('workshop participant enrolled').doc(ID.ENR_A).set({
    docid: ID.ENR_A, profileid: PF.p0, status: 'enrolled', workshopref: dashRef,
    participantworkshopref: pwARef, enrollmentdate: at(-5), ...tag,
  });
  await db.collection('workshop participant enrolled').doc(ID.ENR_B).set({
    docid: ID.ENR_B, profileid: PF.p1, status: 'enrollednotstarted', workshopref: dashRef,
    participantworkshopref: pwBRef, enrollmentdate: at(-4), ...tag,
  });

  // participant workshop docs. p0: curriculum[0] has 2 sub-challenges, the FIRST completed → the app
  // computes progressPercentage = 1/2*100 = 50 (calculateParticipantProgress, ts:987). This is the
  // KNOWN precondition WS-11 asserts the RENDERED value against; WS-12 then drives the real move-next
  // and asserts the app WROTE manualcompletion:true on sub-challenge[1].
  const pwChallengesP0 = [
    {
      type: 'challenge', challengeid: `${TESTRUNID}_ch0`, heading: 'Module One',
      challenges: [
        { type: 'video', challengeid: `${TESTRUNID}_ch0_s0`, heading: 'Intro Video', status: 'completed' },
        { type: 'video', challengeid: `${TESTRUNID}_ch0_s1`, heading: 'Deep Dive', status: '' },
      ],
    },
  ];
  await pwARef.set({
    docid: ID.PW_A, profileid: PF.p0, workshopref: dashRef, workshopparticipantenrolledRef: db.collection('workshop participant enrolled').doc(ID.ENR_A),
    challenges: pwChallengesP0, created: at(-5), ...tag,
  });
  await pwBRef.set({
    docid: ID.PW_B, profileid: PF.p1, workshopref: dashRef, workshopparticipantenrolledRef: db.collection('workshop participant enrolled').doc(ID.ENR_B),
    challenges: workshopChallenges(), created: at(-4), ...tag,
  });

  // 6) PRODUCT PAGE doc — the productpageworkshop screen reads the SINGLE fixed-id doc
  //    `static meta data/Product Page` and renders products[] into a mat-table (product-page.component
  //    .ts:194-198). It does NOT exist on the test project (verified), and no other e2e suite seeds it,
  //    so we own it: seed a KNOWN products[] (run-tagged) and delete the doc in teardown. The product-page
  //    deep case asserts the app rendered exactly these product names (app read → table rows).
  await db.collection('static meta data').doc('Product Page').set({
    docid: 'Product Page',
    products: [
      { productname: `WS Product Alpha ${TESTRUNID}`, shortdescription: 'seeded product one', claimlink: 'https://example.com/a', buttonname: 'Claim A', productimage: '' },
      { productname: `WS Product Bravo ${TESTRUNID}`, shortdescription: 'seeded product two', claimlink: 'https://example.com/b', buttonname: 'Claim B', productimage: '' },
    ],
    ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL,
    counts: { workshops: 3, enrolled: 2, participantWorkshops: 2, participantMeta: 3, products: 2 },
  };
}

// Collections this seed writes (for teardown). The testrunid-scoped sweep catches our run-tagged docs
// (including the fixed-id `static meta data/Product Page` we seeded with this run's tag).
const SEEDED = [
  'workshopconfiguration', 'workshop participant enrolled', 'participant workshop', 'participant metadata',
  'static meta data',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownWorkshops() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Belt-and-suspenders: the Product Page doc is a single fixed-id doc WE own on the test project
  // (verified absent before our run). Delete it explicitly so re-seeds start clean even if the
  // testrunid-scoped sweep ever changes. Guarded: only delete if it still carries OUR run tag.
  const pp = await db.collection('static meta data').doc('Product Page').get();
  if (pp.exists && (pp.data() || {}).testrunid === TESTRUNID) {
    await db.collection('static meta data').doc('Product Page').delete().catch(() => {});
  }
  // Clean any enrollment docs the WS-08 enroll test created (app-written → NO testrunid; key by the
  // dashboard workshopref + the p2 profile that only the enroll test ever enrolls).
  const dashRef = db.collection('workshopconfiguration').doc(ID.W_DASH);
  for (const col of ['workshop participant enrolled', 'participant workshop']) {
    const snap = await db.collection(col).where('workshopref', '==', dashRef).where('profileid', '==', PF.p2).get().catch(() => ({ docs: [] }));
    for (const d of snap.docs) await d.ref.delete().catch(() => {});
  }
  // Also delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, ROUTES, SEEDED, MOVER_PID, seedWorkshops, teardownWorkshops };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedWorkshops(); console.log('[seed-workshops] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownWorkshops(); console.log('[seed-workshops] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-workshops.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
