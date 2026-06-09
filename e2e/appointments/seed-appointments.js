// @ts-nocheck
/**
 * seed-appointments.js — stand up the Appointment & Scheduling world on the dedicated disposable
 * test project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives
 * (allowlist-guarded admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/queue/recon-... + e2e/recon-allcomp/appointments.md. PRODUCTION-SAFE BY CONSTRUCTION:
 * every write goes through seed-test-project.initAdmin() (hard-aborts off the test project), every
 * doc is tagged {testrunid:'appt', _testdata:true}, and NO ATC collection is ever touched (products
 * are seeded with atcmodel:null so the appointment-status / studio ATC branches are never entered).
 *
 * Actors (custom roster — appointments need an `eis` specialist role the queue roster lacks):
 *   admin+appt@example.com      roles {admin, ah}     — super-role: sees all appts/availability/offtime
 *   scheduler+appt@example.com  roles {scheduler}
 *   eis0+appt@example.com       roles {eis}           — specialist / appointment host
 *   eis1+appt@example.com       roles {eis}           — 2nd specialist
 *   participant0+appt@example.com roles {participant} — books / is booked
 *
 * Usage:  node e2e/appointments/seed-appointments.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.APPT_RUNID || 'appt';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  AT1: `${TESTRUNID}_AT1`,            // appointmenttype "Test Diagnostic" (ischangeworkrequired:false)
  AT2: `${TESTRUNID}_AT2`,            // appointmenttype "Test Implementation"
  R1: `${TESTRUNID}_R1`,             // eisroles "Primary Specialist"
  RTE1: `${TESTRUNID}_RTE1`,          // Roles-To-EIS
  ATR1: `${TESTRUNID}_ATR1`,          // AppointmentType-To-Roles
  P1: `${TESTRUNID}_P1`,             // products (Priority Mode, atcmodel:null)
  PDS1: `${TESTRUNID}_PDS1`,          // productToDeliverySequence
  PP1: `${TESTRUNID}_PP1`,            // participantsproduct
  AV1: `${TESTRUNID}_AV1`,            // availability (8h window, 2h booked → 25% utility)
  OT1: `${TESTRUNID}_OT1`,            // offtime to APPROVE (eis0)
  OT2: `${TESTRUNID}_OT2`,            // offtime to DENY    (eis1)
  AP1: `${TESTRUNID}_AP1`,            // appointment to mark ATTENDED (past, unmarked)
  AP2: `${TESTRUNID}_AP2`,            // appointment to mark CANCELLED (past, unmarked)
  D1: `${TESTRUNID}_D1`,             // deliverable linked to AP1 (→ completed)
  D2: `${TESTRUNID}_D2`,             // deliverable linked to AP2 (→ ready)
  EZ1: `${TESTRUNID}_EZ1`,            // EISzoomcontact
  DT1: `${TESTRUNID}_DT1`,            // deliverytime (eis0 weekly hours)
  CEM1: `${TESTRUNID}_CEM1`,          // customer_eismapping (participant0)
};

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  scheduler: `${TESTRUNID}_pf_scheduler`,
  eis0: `${TESTRUNID}_pf_eis0`,
  eis1: `${TESTRUNID}_pf_eis1`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  scheduler: `scheduler+${TESTRUNID}@example.com`,
  eis0: `eis0+${TESTRUNID}@example.com`,
  eis1: `eis1+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin', 'ah'], 'admin'),
    mk('scheduler', ['scheduler'], 'scheduler'),
    mk('eis0', ['eis'], 'eis'),
    mk('eis1', ['eis'], 'eis'),
  ];
  const participants = [mk('p0', ['participant'], 'participant'), mk('p1', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the appointment specs navigate to (each needs a dashboard route-config grant).
const ROUTES = [
  { route: '/appointmentstatuspending', label: 'Appointment Status Pending' },
  { route: '/capacityutilization', label: 'Capacity Utilization' },
  { route: '/approveofftime', label: 'Approve Offtime' },
  { route: '/appointmentavailability', label: 'Appointment Availability' },
  { route: '/roster', label: 'Roster' },
  { route: '/teamdeliveryhours', label: 'Team Delivery Hours' },
  { route: '/appointmentstudio', label: 'Appointment Studio' },
  { route: '/appointment-dashboard', label: 'Appointment Dashboard' },
  { route: '/bookappointment', label: 'Book Appointment' },
  { route: '/mapclienteis', label: 'Map Client EIS' },
  { route: '/EISzoom', label: 'EIS Zoom' },
  { route: '/appointmentrole', label: 'Appointment Role' },
  { route: '/eisappointmentrole', label: 'EIS Appointment Role' },
  { route: '/mapappointmentrole', label: 'Map Appointment Role' },
  { route: '/offtime', label: 'Offtime' },
  { route: '/appointmentcalendar', label: 'Appointment Calendar' },
  { route: '/mycalendar', label: 'My Calendar' },
];

async function seedAppointments() {
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

  // --- refs ---
  const profileRef = (pf) => db.collection('profile_data').doc(pf);
  const apptTypeRef = (id) => db.collection('appointmenttype').doc(id);
  const roleRef = (id) => db.collection('eisroles').doc(id);
  const productRef = (id) => db.collection('products').doc(id);
  const apptRef = (id) => db.collection('appointments').doc(id);

  // --- date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const at = (dayOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return T.fromDate(d); };
  const hoursAgo = (h) => T.fromMillis(Date.now() - h * 3600e3);

  // 3) CONFIG (appointment types, roles, mappings, products) — all non-ATC.
  await apptTypeRef(ID.AT1).set({ docid: ID.AT1, appointmenttype: 'Test Diagnostic', duration: 60, ischangeworkrequired: false, ...tag });
  await apptTypeRef(ID.AT2).set({ docid: ID.AT2, appointmenttype: 'Test Implementation', duration: 90, ischangeworkrequired: false, ...tag });
  await roleRef(ID.R1).set({ docid: ID.R1, role: 'Primary Specialist', experiencestage: 'S1', experiencelevel: 'L1', ...tag });
  await db.collection('Roles-To-EIS').doc(ID.RTE1).set({ docid: ID.RTE1, assigned_role_ref: roleRef(ID.R1), assigned_eis: [profileRef(PF.eis0), profileRef(PF.eis1)], ...tag });
  await db.collection('AppointmentType-To-Roles').doc(ID.ATR1).set({ docid: ID.ATR1, assigned_appttype_ref: apptTypeRef(ID.AT1), required_role: [roleRef(ID.R1)], additional_role: [], ...tag });
  await productRef(ID.P1).set({ docid: ID.P1, product: 'Test WiSH Priority', mode: 'Priority Mode', atcmodel: null, ...tag });
  await db.collection('productToDeliverySequence').doc(ID.PDS1).set({
    docid: ID.PDS1, product: productRef(ID.P1),
    deliveryoptions: [{ deliverysequence: [{ activity: apptTypeRef(ID.AT1) }] }], ...tag,
  });

  // 4) RUNTIME: participant product + delivery sequence + the two unmarked appointments + deliverables.
  await db.collection('participantsproduct').doc(ID.PP1).set({ docid: ID.PP1, profileid: PF.p0, productref: productRef(ID.P1), status: 'initiated', ...tag });
  await db.collection('participantdeliverysequence').doc(PF.p0).set({
    docid: PF.p0, profileid: PF.p0,
    products: [{ participantproductid: ID.PP1, productref: productRef(ID.P1), delivery: [
      { type: 'appointment', status: 'ready', sequenceref: db.collection('deliverables').doc(ID.D1) },
    ] }], ...tag,
  });

  // hostRole is keyed by the ROLE REF PATH (status-pending reads hostRole[role.path]).
  const rolePath = roleRef(ID.R1).path; // "eisroles/appt_R1"
  const mkAppt = (id, bookedPf) => ({
    docid: id,
    appointment: apptTypeRef(ID.AT1),
    appointmentrole: [roleRef(ID.R1)],
    hostRole: { [rolePath]: [profileRef(PF.eis0)] },
    hosts: [profileRef(PF.eis0)],
    bookedby: profileRef(bookedPf),
    starttime: hoursAgo(2), endtime: hoursAgo(1),
    cancelled: false, attended: false,
    journeycoach: false, onboarding: false,
    ...tag,
  });
  // AP1 booked by p0 (→ mark ATTENDED, APPT-05); AP2 booked by p1 (→ mark CANCELLED, APPT-06).
  // Distinct clients make the two status-pending rows distinguishable in the UI.
  await apptRef(ID.AP1).set(mkAppt(ID.AP1, PF.p0));
  await apptRef(ID.AP2).set(mkAppt(ID.AP2, PF.p1));

  // Deliverables linked to each appointment via fileref (updateDeliveryStatus targets fileref
  // array-contains apptRef). NO participantproductid → mark-status's last-delivery extension prompt
  // loop `continue`s (no extra dialog). status starts "ongoing".
  await db.collection('deliverables').doc(ID.D1).set({ docid: ID.D1, profileid: PF.p0, type: 'appointment', status: 'ongoing', deliveryref: apptTypeRef(ID.AT1), fileref: [apptRef(ID.AP1)], ...tag });
  await db.collection('deliverables').doc(ID.D2).set({ docid: ID.D2, profileid: PF.p0, type: 'appointment', status: 'ongoing', deliveryref: apptTypeRef(ID.AT1), fileref: [apptRef(ID.AP2)], ...tag });

  // 5) AVAILABILITY for capacity utilization (APPT-08): 8h window today (09:00–17:00), one 2h booked
  //    slot (10:00–12:00) → utility = floor(2/8*100) = 25%. The slot array is keyed by the appt-type
  //    DOC id (capacity reads doc[appointments[j].id]).
  await db.collection('availability').doc(ID.AV1).set({
    docid: ID.AV1, profileref: profileRef(PF.eis0),
    starttime: at(0, 9), endtime: at(0, 17),
    appointments: [apptTypeRef(ID.AT1)],
    [ID.AT1]: [{ slotstart: at(0, 10), slotend: at(0, 12), booked: true, available: false }],
    ...tag,
  });

  // 6) OFFTIME — two future requests, status:null. OT1(eis0) approved, OT2(eis1) denied.
  await db.collection('offtime').doc(ID.OT1).set({ docid: ID.OT1, profileid: PF.eis0, date: at(3, 0), starttime: at(3, 9), endtime: at(3, 11), fullday: false, status: null, ...tag });
  await db.collection('offtime').doc(ID.OT2).set({ docid: ID.OT2, profileid: PF.eis1, date: at(4, 0), starttime: at(4, 9), endtime: at(4, 11), fullday: false, status: null, ...tag });

  // 7) Misc config for later cases (EISzoom / mapclienteis) — best-effort shapes.
  await db.collection('EISzoomcontact').doc(ID.EZ1).set({ docid: ID.EZ1, name: `Zoom EIS0 ${TESTRUNID}`, email: EMAIL.eis0, zoomid: '999-000-111', profileref: profileRef(PF.eis0), ...tag });
  await db.collection('customer_eismapping').doc(PF.p0).set({ docid: PF.p0, profileid: PF.p0, eisroles: { [ID.R1]: profileRef(PF.eis0) }, ...tag });

  return { TESTRUNID, ID, PF, EMAIL, counts: { appointments: 2, availability: 1, offtime: 2 } };
}

// Collections this seed writes (for teardown).
const SEEDED = [
  'appointmenttype', 'eisroles', 'Roles-To-EIS', 'AppointmentType-To-Roles', 'products',
  'productToDeliverySequence', 'participantsproduct', 'participantdeliverysequence', 'deliverables',
  'appointments', 'availability', 'offtime', 'EISzoomcontact', 'customer_eismapping',
  // auth-chain + dashboard (shared shape; testrunid-scoped so queue 'run1' is untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownAppointments() {
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

module.exports = { TESTRUNID, ID, PF, EMAIL, ROUTES, SEEDED, seedAppointments, teardownAppointments };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedAppointments(); console.log('[seed-appointments] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownAppointments(); console.log('[seed-appointments] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-appointments.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
