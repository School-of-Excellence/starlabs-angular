// @ts-nocheck
/**
 * seed-events.js — stand up the Events, Arena & Calendar world on the dedicated disposable test
 * project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded
 * admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/recon-allcomp/events-arena.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every doc is tagged
 * {testrunid:'evt', _testdata:true}, and NO ATC collection is ever touched. Events are seeded with
 * atcmodel:null so the create-event / arena ATC branches stay dead (events-arena.md "ATC exclusions").
 *
 * Actors (custom roster — events are entirely route-config-driven via the `dashboard` collection,
 * auth.guard.ts:36; there are no component-level role checks in the core CRUD paths, so the single
 * super-admin granted EVERY events role admits all 11 routes. eventopportunitydashboard exposes a
 * developer-only delete button (eod.ts:129) — the admin carries `developer` so that control renders):
 *   admin+evt@example.com         roles {admin, ah, eventcoordinator, developer, floor, mentor}
 *   participant0+evt@example.com  roles {participant}  — has an approved EPR + a deliverable
 *   participant1+evt@example.com  roles {participant}  — has an approved EPR (e-ticket issuance target)
 *   participant2+evt@example.com  roles {participant}  — has a QR scan log row (attendance-log count)
 *
 * Usage:  node e2e/events/seed-events.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.EVT_RUNID || 'evt';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  EVENT1: `${TESTRUNID}_event_1`,         // event collection (past start, future end → QR admits)
  ARENAEVT1: `${TESTRUNID}_arenaevent_1`,  // arena events (sub-event under EVENT1)
  P1: `${TESTRUNID}_P1`,                   // products (atcmodel:null)
  EPR0: `${TESTRUNID}_epr_0`,              // event participation request — approved (mark-attended target)
  EPR1: `${TESTRUNID}_epr_1`,              // event participation request — approved (e-ticket issuance target)
  D0: `${TESTRUNID}_D0`,                   // deliverable linked to EPR0 via fileref (→ completed)
  ETLOG0: `${TESTRUNID}_etlog_0`,          // arena e-ticket log row (attendance-log count oracle)
  LAYER1: `${TESTRUNID}_layer_1`,          // arenalayers row (layers-screen render)
};

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
  p2: `${TESTRUNID}_pf_p2`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
  p2: `participant2+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    // super-admin granted EVERY events role so the data-driven authGuard admits all 11 routes.
    mk('admin', ['admin', 'ah', 'eventcoordinator', 'developer', 'floor', 'mentor'], 'admin'),
  ];
  const participants = [
    mk('p0', ['participant'], 'participant'),
    mk('p1', ['participant'], 'participant'),
    mk('p2', ['participant'], 'participant'),
  ];
  return { staff, operators: [], participants };
}

// Routes the events specs navigate to (each needs a dashboard route-config grant).
const ROUTES = [
  { route: '/create_event', label: 'Create Event' },
  { route: '/event_participation_approve', label: 'Event Participation Approve' },
  { route: '/arena_e_ticket_approve', label: 'Arena E-Ticket Approve' },
  { route: '/qr-scanner', label: 'QR Scanner' },
  { route: '/event_attendance_log', label: 'Event Attendance Log' },
  { route: '/videoask-display', label: 'VideoAsk Display' },
  { route: '/arena_space', label: 'Arena Space' },
  { route: '/layers-screen', label: 'Layers Screen' },
  { route: '/eventopportunitydashboard', label: 'Event Opportunity Dashboard' },
  { route: '/initiateeventproduct', label: 'Initiate Event Product' },
];

async function seedEvents() {
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

  // --- refs + date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const profileRef = (pf) => db.collection('profile_data').doc(pf);
  const productRef = (id) => db.collection('products').doc(id);
  const eventRef = db.collection('event collection').doc(ID.EVENT1);
  const eprRef = (id) => db.collection('event participation request').doc(id);
  const daysFromNow = (d) => T.fromMillis(Date.now() + d * 86400e3);

  // 3) PRODUCT (atcmodel:null so the ATC branches in create-event/initiate stay dead). The approve +
  //    e-ticket screens render `mapProduct[productref.id]` / `mapProducts[productref.id].product`, so
  //    the doc must exist with a `product` field; keyed by both `id` and the doc id (getProductMap maps
  //    by doc id, arena-e-ticket-approve maps by data['id']).
  await productRef(ID.P1).set({ id: ID.P1, docid: ID.P1, product: `TEST Event Product ${TESTRUNID}`, atcmodel: null, ...tag });

  // 4) EVENT — start in the PAST, end in the FUTURE (qr-scanner.ts:82 only admits events whose
  //    end_date >= now; event-list renders name/venue and calls start_date/end_date .toDate()).
  await eventRef.set({
    docid: ID.EVENT1, event_id: ID.EVENT1, name: `TEST Event ${TESTRUNID}`,
    venue: `TEST Venue ${TESTRUNID}`, address: 'Test Address',
    start_date: daysFromNow(-2), end_date: daysFromNow(7),
    hosts: [], atcmodel: null, notifyparticipants: false, addtocalendar: false,
    ...tag,
  });

  // 5) ARENA EVENT — sub-event under EVENT1 (initiateeventproduct reads productref/eventref/docid).
  await db.collection('arena events').doc(ID.ARENAEVT1).set({
    docid: ID.ARENAEVT1, title: `TEST Arena Event ${TESTRUNID}`,
    productref: productRef(ID.P1), eventref: eventRef,
    startdate: daysFromNow(-2), enddate: daysFromNow(7), heroevent: false, delete: false,
    ...tag,
  });

  // 6) EVENT PARTICIPATION REQUESTS — both status "approved" so they surface in the approve screen's
  //    "Mark Attendence" tab (status in [approved,unattended]) AND the e-ticket screen's
  //    (eventref==X && status==approved) query. profileid == the seeded profile_data doc id (the row's
  //    client name is mapProfileName[profileid]); productref → the seeded product (row's product cell);
  //    eventref → the event; arenaeventid set for the initiate flow.
  const mkEpr = (id, pf) => ({
    docid: id, profileid: PF[pf], eventref: eventRef, productref: productRef(ID.P1),
    arenaeventid: ID.ARENAEVT1, participantproductid: null, status: 'approved',
    initiatedfrom: 'web', ...tag,
  });
  await eprRef(ID.EPR0).set(mkEpr(ID.EPR0, 'p0'));
  await eprRef(ID.EPR1).set(mkEpr(ID.EPR1, 'p1'));

  // 7) DELIVERABLE linked to EPR0 via fileref (markAsAttended queries deliverables where fileref
  //    array-contains-any [EPRref] and flips status→"completed"). Starts "ongoing" — a PRECONDITION;
  //    the spec asserts the "completed" the APP writes, never this seeded value.
  await db.collection('deliverables').doc(ID.D0).set({
    docid: ID.D0, profileid: PF.p0, type: 'event', status: 'ongoing',
    fileref: [eprRef(ID.EPR0)], ...tag,
  });

  // 8) ARENA E-TICKET LOG row for the attendance-log count oracle (EVT-09). event-attendance-log
  //    streams `arena e-ticket log` where eventref==X and renders Unique-Participant count from the
  //    distinct profileids. One seeded row → the board computes 1; countWhere agrees independently.
  await db.collection('arena e-ticket log').doc(ID.ETLOG0).set({
    docid: ID.ETLOG0, profileid: PF.p2, eventref: eventRef,
    product: productRef(ID.P1), logdate: T.now(),
    eticketref: db.collection('arena e-ticket').doc(`${TESTRUNID}_eticket_ph`), ...tag,
  });

  // 9) ARENALAYERS row for the layers-screen render (EVT-12). layers-screen streams arenalayers where
  //    eventref==X and renders rows ordered by sequence; the row's title is asserted in the table.
  await db.collection('arenalayers').doc(ID.LAYER1).set({
    docid: ID.LAYER1, title: `TEST Layer ${TESTRUNID}`,
    description: ['Layer detail one', 'Layer detail two'],
    sequence: 1, eventref: eventRef, delete: false, ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL,
    counts: { events: 1, arenaEvents: 1, epr: 2, deliverables: 1, eticketLog: 1, layers: 1 },
  };
}

// Collections this seed writes (for teardown). Spaced names are Firestore strings — pass verbatim.
const SEEDED = [
  'products', 'event collection', 'arena events', 'event participation request',
  'deliverables', 'arena e-ticket log', 'arenalayers',
  // mutation-test outputs (so re-runs start clean): markAsAttended creates events_profiles; the e-ticket
  // issuance test creates `arena e-ticket`. Both are tagged via the merge/reset helpers in support/events.ts.
  'events_profiles', 'arena e-ticket',
  // auth-chain + dashboard (shared shape; testrunid-scoped so the queue 'run1' seed is untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownEvents() {
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

module.exports = { TESTRUNID, ID, PF, EMAIL, ROUTES, SEEDED, seedEvents, teardownEvents };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedEvents(); console.log('[seed-events] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownEvents(); console.log('[seed-events] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-events.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
