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
  AT2R: `${TESTRUNID}_AT2R`,          // appointmenttype "Test Two-Role" (2 required roles → slot merge)
  R1: `${TESTRUNID}_R1`,             // eisroles "Primary Specialist"
  R2: `${TESTRUNID}_R2`,             // eisroles "Secondary Specialist" (for the 2-role appt)
  RTE1: `${TESTRUNID}_RTE1`,          // Roles-To-EIS (R1 → eis0, eis1)
  RTE2: `${TESTRUNID}_RTE2`,          // Roles-To-EIS (R2 → eis1)
  ATR1: `${TESTRUNID}_ATR1`,          // AppointmentType-To-Roles (AT1 → [R1])
  ATR2R: `${TESTRUNID}_ATR2R`,        // AppointmentType-To-Roles (AT2R → [R1, R2])
  P1: `${TESTRUNID}_P1`,             // products (Priority Mode, atcmodel:null)
  PROSTER: `${TESTRUNID}_PROSTER`,    // products — DISTINCT name so the roster filter isolates APROSTER/APFUTURE
  PDS1: `${TESTRUNID}_PDS1`,          // productToDeliverySequence
  PP1: `${TESTRUNID}_PP1`,            // participantsproduct (p0)
  PP2: `${TESTRUNID}_PP2`,            // participantsproduct (p1 — the BOOKING subject)
  AV1: `${TESTRUNID}_AV1`,            // availability (eis0, 8h window, 2h booked → 25% utility)
  AVDASH: `${TESTRUNID}_AVDASH`,      // availability (eis1, TODAY, one FREE AT1 slot → dashboard count)
  AVBOOK: `${TESTRUNID}_AVBOOK`,      // availability (eis1, +2d, one FREE AT1 slot → booking commit)
  AVM1: `${TESTRUNID}_AVM1`,          // availability (eis0, +20d, FREE AT2R slot @10am → 2-role merge)
  AVM2: `${TESTRUNID}_AVM2`,          // availability (eis1, +20d, FREE AT2R slot @10am → 2-role merge)
  OT1: `${TESTRUNID}_OT1`,            // offtime to APPROVE (eis0)
  OT2: `${TESTRUNID}_OT2`,            // offtime to DENY    (eis1)
  AP1: `${TESTRUNID}_AP1`,            // appointment to mark ATTENDED (past, unmarked)
  AP2: `${TESTRUNID}_AP2`,            // appointment to mark CANCELLED (past, unmarked)
  APSTUDIO: `${TESTRUNID}_APSTUDIO`,  // appointment hosted by eis0 TODAY-future (→ studio card)
  APROSTER: `${TESTRUNID}_APROSTER`,  // appointment TODAY (→ roster default view; has `created`)
  APFUTURE: `${TESTRUNID}_APFUTURE`,  // appointment +10d (→ roster: hidden by default, shown on Get All)
  D1: `${TESTRUNID}_D1`,             // deliverable linked to AP1 (→ completed)
  D2: `${TESTRUNID}_D2`,             // deliverable linked to AP2 (→ ready)
  DB: `${TESTRUNID}_DB`,             // deliverable for p1 (→ flips ongoing on BOOKING commit)
  EZ1: `${TESTRUNID}_EZ1`,            // EISzoomcontact
  DT1: `${TESTRUNID}_DT1`,            // deliverytime (eis0 weekly hours)
  DT2: `${TESTRUNID}_DT2`,            // deliverytime (eis1 weekly hours — 2nd row)
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
  const hoursFromNow = (h) => T.fromMillis(Date.now() + h * 3600e3);

  // 3) CONFIG (appointment types, roles, mappings, products) — all non-ATC.
  //    NB: `id` mirrors the doc id — the dashboard reads activityData['id'] as the appointment-type id
  //    (appointment-dashboard.component.ts:157), and capacity reads doc[appointments[j].id]; both need it.
  await apptTypeRef(ID.AT1).set({ docid: ID.AT1, id: ID.AT1, appointmenttype: 'Test Diagnostic', duration: 60, ischangeworkrequired: false, ...tag });
  await apptTypeRef(ID.AT2).set({ docid: ID.AT2, id: ID.AT2, appointmenttype: 'Test Implementation', duration: 90, ischangeworkrequired: false, ...tag });
  // AT2R — a TWO-required-role appointment type (R1+R2): used by the slot-merge case (APPT-18). Its own
  // product/delivery is NOT seeded (dashboard must keep showing exactly one type for P1), so it never
  // appears on the dashboard; it is reached only via /bookappointment for p1 (no customer_eismapping).
  await apptTypeRef(ID.AT2R).set({ docid: ID.AT2R, id: ID.AT2R, appointmenttype: 'Test Two-Role', duration: 60, ischangeworkrequired: false, ...tag });
  await roleRef(ID.R1).set({ docid: ID.R1, role: 'Primary Specialist', experiencestage: 'S1', experiencelevel: 'L1', ...tag });
  await roleRef(ID.R2).set({ docid: ID.R2, role: 'Secondary Specialist', experiencestage: 'S2', experiencelevel: 'L1', ...tag });
  await db.collection('Roles-To-EIS').doc(ID.RTE1).set({ docid: ID.RTE1, assigned_role_ref: roleRef(ID.R1), assigned_eis: [profileRef(PF.eis0), profileRef(PF.eis1)], ...tag });
  // R2 → ONLY eis1, so the 2-role appt resolves R1→{eis0,eis1}, R2→{eis1}; the only same-time pair that
  // survives the merge's `eisprofile != eisprofile` filter is (eis0 as R1, eis1 as R2) → exactly 1 slot.
  await db.collection('Roles-To-EIS').doc(ID.RTE2).set({ docid: ID.RTE2, assigned_role_ref: roleRef(ID.R2), assigned_eis: [profileRef(PF.eis1)], ...tag });
  await db.collection('AppointmentType-To-Roles').doc(ID.ATR1).set({ docid: ID.ATR1, assigned_appttype_ref: apptTypeRef(ID.AT1), required_role: [roleRef(ID.R1)], additional_role: [], ...tag });
  await db.collection('AppointmentType-To-Roles').doc(ID.ATR2R).set({ docid: ID.ATR2R, assigned_appttype_ref: apptTypeRef(ID.AT2R), required_role: [roleRef(ID.R1), roleRef(ID.R2)], additional_role: [], ...tag });
  await productRef(ID.P1).set({ docid: ID.P1, product: 'Test WiSH Priority', mode: 'Priority Mode', atcmodel: null, ...tag });
  // Distinct product whose name appears ONLY on the two roster appointments (APROSTER/APFUTURE), so the
  // roster Search box isolates exactly them — the past AP1/AP2 carry P1 and won't match this filter.
  // NOT 'Priority Mode' → it never appears on the appointment-dashboard (which would change APPT-14's count).
  await productRef(ID.PROSTER).set({ docid: ID.PROSTER, product: 'Test Roster Only', mode: 'Event Mode', atcmodel: null, ...tag });
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

  // 4b) BOOKING SUBJECT (p1): a SECOND participant product + delivery sequence whose bookable appointment
  //     (AT1, status "ready") drives the keystone booking flow (APPT-02/03/18). p1 deliberately has NO
  //     customer_eismapping → booking falls through to Roles-To-EIS (eis0+eis1 for R1). Reset helper
  //     `resetBookingSubject()` restores this precondition so the write-mutation cases are re-runnable.
  await seedBookingSubject(db, T, { productRef, apptTypeRef });

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
    // `created` + `productid` + `slotdata` are required by the roster stream (it reads created.toDate()
    // for EVERY cancelled==false appointment, incl. these past ones); without them the roster subscribe
    // throws and renders nothing (APPT-07). They are inert for the status-pending screen (APPT-04/05/06).
    productid: ID.P1, created: T.now(), slotdata: [{ id: ID.AV1, index: 0 }],
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
  //    DOC id (capacity reads doc[appointments[j].id]). KEEP THIS the only eis0 TODAY window so the
  //    25% assertion stays exact (free slots for the other cases live on eis1 / future dates).
  await db.collection('availability').doc(ID.AV1).set({
    docid: ID.AV1, profileref: profileRef(PF.eis0),
    starttime: at(0, 9), endtime: at(0, 17),
    appointments: [apptTypeRef(ID.AT1)],
    [ID.AT1]: [{ slotstart: at(0, 10), slotend: at(0, 12), booked: true, available: false }],
    ...tag,
  });

  // 5b) DASHBOARD slot (APPT-14): eis1, +1 day, a 09:00–17:00 window with one FREE AT1 slot. The dashboard
  //     component never sets superRole (it stays false), so its lower bound for the slot query is the
  //     WINDOW starttime >= rangeStart, where rangeStart for a NON-today date is that date at 00:00. So we
  //     place the window on +1d (window start 09:00 ≥ +1d-00:00) and the spec drives the date range to +1d.
  //     This sidesteps the "today → rangeStart=now" trap that hides a same-day window once now passes its
  //     start. eis0's +1d has no AT1 window, so the AT1 chip count == this single free slot.
  await db.collection('availability').doc(ID.AVDASH).set({
    docid: ID.AVDASH, profileref: profileRef(PF.eis1),
    starttime: at(1, 9), endtime: at(1, 17),
    appointments: [apptTypeRef(ID.AT1)],
    [ID.AT1]: [{ slotstart: at(1, 14), slotend: at(1, 15), booked: false, available: true }],
    ...tag,
  });

  // 5c) BOOKING slot (APPT-02/03): eis1, +2 days, one FREE AT1 slot. Super-role admin can book from
  //     today; we pick +2d in the spec. eis0 has NO availability that day, so the slot list contains
  //     exactly this single eis1 slot. APPT-02 books it (slot flips booked:true); APPT-03 re-opens the
  //     booking screen for the same date and asserts ZERO free slots. `resetBookingSlot()` restores it.
  await seedBookingSlot(db, T, profileRef, apptTypeRef);

  // 5d) 2-ROLE MERGE slots (APPT-18): eis0 (as R1) and eis1 (as R2), +3 days, BOTH free at 10:00–11:00
  //     for AT2R. The merge intersects same-start slots from distinct specialists → exactly 1 entry
  //     "10:00 with <eis0>, <eis1>". Read-only (the case asserts the merged list; it does not book).
  await db.collection('availability').doc(ID.AVM1).set({
    docid: ID.AVM1, profileref: profileRef(PF.eis0),
    starttime: at(20, 9), endtime: at(20, 17),
    appointments: [apptTypeRef(ID.AT2R)],
    [ID.AT2R]: [{ slotstart: at(20, 10), slotend: at(20, 11), booked: false, available: true }],
    ...tag,
  });
  await db.collection('availability').doc(ID.AVM2).set({
    docid: ID.AVM2, profileref: profileRef(PF.eis1),
    starttime: at(20, 9), endtime: at(20, 17),
    appointments: [apptTypeRef(ID.AT2R)],
    [ID.AT2R]: [{ slotstart: at(20, 10), slotend: at(20, 11), booked: false, available: true }],
    ...tag,
  });

  // 6) OFFTIME — two future requests, status:null. OT1(eis0) approved, OT2(eis1) denied.
  await db.collection('offtime').doc(ID.OT1).set({ docid: ID.OT1, profileid: PF.eis0, date: at(3, 0), starttime: at(3, 9), endtime: at(3, 11), fullday: false, status: null, ...tag });
  await db.collection('offtime').doc(ID.OT2).set({ docid: ID.OT2, profileid: PF.eis1, date: at(4, 0), starttime: at(4, 9), endtime: at(4, 11), fullday: false, status: null, ...tag });

  // 6b) STUDIO card (APPT-12): an appointment hosted by eis0 with endtime in the FUTURE (so the studio's
  //     `endTime >= now` filter keeps it) and not cancelled/attended. starttime today+future. p0 is the
  //     client (p0 has a `participant metadata` doc → the studio's activejourney lookup won't crash).
  await apptRef(ID.APSTUDIO).set({
    docid: ID.APSTUDIO,
    appointment: apptTypeRef(ID.AT1),
    appointmentrole: [roleRef(ID.R1)],
    hostRole: { [rolePath]: [profileRef(PF.eis0)] },
    hosts: [profileRef(PF.eis0)],
    bookedby: profileRef(PF.p0),
    starttime: at(0, 23), endtime: hoursFromNow(26), // start late today, end ~tomorrow → always future
    cancelled: false, attended: false, journeycoach: false, onboarding: false,
    created: T.now(), slotdata: [{ id: ID.AVDASH, index: 0 }],
    ...tag,
  });

  // 6c) ROSTER (APPT-07): roster streams appointments(cancelled==false) and DEFAULT-filters to
  //     today→+3d; "Get All" lifts the window. Seed one TODAY (visible by default) + one +10d (hidden
  //     by default, revealed by Get All). Both need `created` (roster reads created.toDate()) and the
  //     same product P1 so the run-unique product name "Test WiSH Priority" identifies our rows.
  const mkRoster = (id, dayOffset) => ({
    docid: id,
    appointment: apptTypeRef(ID.AT1),
    appointmentrole: [roleRef(ID.R1)],
    hostRole: { [rolePath]: [profileRef(PF.eis0)] },
    hosts: [profileRef(PF.eis0)],
    bookedby: profileRef(PF.p0),
    starttime: at(dayOffset, 13), endtime: at(dayOffset, 14),
    // attended:true keeps these in the roster (which streams cancelled==false, ignoring attended) but
    // EXCLUDES them from the status-pending board (cancelled==false && attended==false && starttime<=now)
    // — otherwise APROSTER (p0, today-past) becomes a 2nd participant0 row and breaks APPT-04/05 (strict mode).
    cancelled: false, attended: true, journeycoach: false, onboarding: false,
    productid: ID.PROSTER, created: T.now(), slotdata: [{ id: ID.AVDASH, index: 0 }],
    ...tag,
  });
  await apptRef(ID.APROSTER).set(mkRoster(ID.APROSTER, 0));   // today → default roster view
  await apptRef(ID.APFUTURE).set(mkRoster(ID.APFUTURE, 10));  // +10d → only via "Get All"

  // 7) Misc config (EISzoom / mapclienteis / team-delivery-hours).
  await db.collection('EISzoomcontact').doc(ID.EZ1).set({ docid: ID.EZ1, name: `Zoom EIS0 ${TESTRUNID}`, email: EMAIL.eis0, zoomid: '999-000-111', profileref: profileRef(PF.eis0), ...tag });

  // mapclienteis (APPT-15) reads customer_eismapping and renders ONLY docs with a non-empty `roles[]`:
  //   profilename = mapProfile[doc.profile_ref.id]; eisrole = roles.map(r => mapRole[r.id] + " - " +
  //   eisroles[r.path].map(s => mapProfile[s.id])). So this doc needs profile_ref (a ref), roles (role
  //   refs), and eisroles keyed by ROLE PATH. (Keyed by id — used elsewhere by booking — is NOT read here.)
  await db.collection('customer_eismapping').doc(PF.p0).set({
    docid: PF.p0, profileid: PF.p0,
    profile_ref: profileRef(PF.p0),
    roles: [roleRef(ID.R1)],
    eisroles: { [roleRef(ID.R1).path]: [profileRef(PF.eis0)] },
    ...tag,
  });

  // team-delivery-hours (APPT-11): two `deliverytime` rows (eis0 + eis1) → the table renders 2 named
  //   rows (name joined from the profile map). Weekday keys are lowercase (template reads row[day]).
  const dtDays = { monday: [{ starttime: '09:00', endtime: '17:00' }], wednesday: [{ starttime: '09:00', endtime: '17:00' }] };
  await db.collection('deliverytime').doc(ID.DT1).set({ docid: ID.DT1, profileid: PF.eis0, ...dtDays, ...tag });
  await db.collection('deliverytime').doc(ID.DT2).set({ docid: ID.DT2, profileid: PF.eis1, ...dtDays, ...tag });

  return { TESTRUNID, ID, PF, EMAIL, counts: { appointments: 5, availability: 5, offtime: 2, deliverytime: 2 } };
}

/** Seed (or reset) the p1 booking subject: participantsproduct(ongoing) + participantdeliverysequence
 *  with a single AT1 delivery item (status "ready") + its deliverable (status "ready", empty fileref).
 *  PRECONDITION only — APPT-02 asserts the values the APP writes on commit, never these. */
async function seedBookingSubject(db, T, { productRef, apptTypeRef }) {
  await db.collection('participantsproduct').doc(ID.PP2).set(
    { docid: ID.PP2, profileid: PF.p1, productref: productRef(ID.P1), status: 'initiated', ...TAG(TESTRUNID) }, { merge: false },
  );
  await db.collection('participantdeliverysequence').doc(PF.p1).set({
    docid: PF.p1, profileid: PF.p1,
    products: [{ participantproductid: ID.PP2, productref: productRef(ID.P1), delivery: [
      { type: 'appointment', status: 'ready', sequenceref: db.collection('deliverables').doc(ID.DB) },
    ] }], ...TAG(TESTRUNID),
  }, { merge: false });
  await db.collection('deliverables').doc(ID.DB).set(
    { docid: ID.DB, profileid: PF.p1, participantproductid: ID.PP2, type: 'appointment', status: 'ready', deliveryref: apptTypeRef(ID.AT1), fileref: [], ...TAG(TESTRUNID) }, { merge: false },
  );
}

/** Seed (or reset) the +2-day eis1 booking slot to FREE. PRECONDITION only. */
async function seedBookingSlot(db, T, profileRef, apptTypeRef) {
  const at = (dayOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return T.fromDate(d); };
  await db.collection('availability').doc(ID.AVBOOK).set({
    docid: ID.AVBOOK, profileref: profileRef(PF.eis1),
    starttime: at(2, 9), endtime: at(2, 17),
    appointments: [apptTypeRef(ID.AT1)],
    [ID.AT1]: [{ slotstart: at(2, 10), slotend: at(2, 11), booked: false, available: true }],
    ...TAG(TESTRUNID),
  }, { merge: false });
}

// Collections this seed writes (for teardown).
const SEEDED = [
  'appointmenttype', 'eisroles', 'Roles-To-EIS', 'AppointmentType-To-Roles', 'products',
  'productToDeliverySequence', 'participantsproduct', 'participantdeliverysequence', 'deliverables',
  'appointments', 'availability', 'offtime', 'EISzoomcontact', 'customer_eismapping', 'deliverytime',
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

/** Re-runnable precondition resets for the booking write-mutation cases (APPT-02/03). Restores the p1
 *  subject (product/sequence/deliverable → "ready", empty fileref) AND the +2d eis1 slot → FREE, so the
 *  booking can be performed again. Anti-circular: these are SETUP writes; the test asserts only the
 *  values the APP writes on commit. */
async function resetBookingSubject() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const productRef = (id) => db.collection('products').doc(id);
  const apptTypeRef = (id) => db.collection('appointmenttype').doc(id);
  await seedBookingSubject(db, T, { productRef, apptTypeRef });
  await seedBookingSlot(db, T, (pf) => db.collection('profile_data').doc(pf), apptTypeRef);
  // Clear ONLY the app-created bookings a prior run made for p1 (no testrunid). Keyed by bookedby+AT1,
  // but EXCLUDING the seeded fixtures that share that key (AP2 is bookedby p1 + AT1 → must survive for
  // the APPT-06 cancel case). App-written docs carry no testrunid, so exclude anything tagged 'appt'.
  const seededIds = new Set([ID.AP1, ID.AP2, ID.APSTUDIO, ID.APROSTER, ID.APFUTURE]);
  const snap = await db.collection('appointments')
    .where('bookedby', '==', db.collection('profile_data').doc(PF.p1))
    .where('appointment', '==', apptTypeRef(ID.AT1)).get();
  for (const d of snap.docs) {
    if (seededIds.has(d.id) || d.data().testrunid === TESTRUNID) continue;
    await d.ref.delete().catch(() => {});
  }
  // Also clear any AT2R booking a prior APPT-18 run created for p1 + the on-the-fly DB2R deliverable.
  const snap2 = await db.collection('appointments')
    .where('bookedby', '==', db.collection('profile_data').doc(PF.p1))
    .where('appointment', '==', apptTypeRef(ID.AT2R)).get();
  for (const d of snap2.docs) { if (d.data().testrunid !== TESTRUNID) await d.ref.delete().catch(() => {}); }
}

module.exports = {
  TESTRUNID, ID, PF, EMAIL, ROUTES, SEEDED, seedAppointments, teardownAppointments, resetBookingSubject,
};

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedAppointments(); console.log('[seed-appointments] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownAppointments(); console.log('[seed-appointments] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-appointments.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
