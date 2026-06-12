// @ts-nocheck
/**
 * seed-appointments.cjs — Appointments & Calendar feature preconditions for the breakthroughs-flutter
 * e2e suite, EXTENDING the ≥200-user cohort (journey-cohort/seed-cohort.js) for the ONE driven user
 * `participant95+jrny@example.com` (profileid `jrny_profile_95`).
 *
 * The cohort baseline already provides for user 95: profile_data (participantmode 'Event Mode'),
 * the purchase quartet, the queue_token render chain, a COMPLETED past appointment (jrny_apt_95 →
 * History), ≥4 attended events, content, and a 2nd-journey upgrade. This seeder adds ONLY the
 * Appointments & Calendar feature preconditions the FEATURE-CATALOG §8 rows require ON TOP of that:
 *
 *   • appt-book-delivery  → the full bookable graph: AppointmentType-To-Roles + Roles-To-EIS + a
 *       FREE FUTURE `availability` slot keyed by the cohort appttype DOC id (jrny_AT), plus a
 *       standalone "ready" `deliverables` doc to enter BookAppointment from (pushed via navigatorKey).
 *   • appt-view-my-appointments / appt-cancel / appt-view-detail-sheet → a FUTURE, un-attended,
 *       un-cancelled `appointments` doc bookedby jrny_profile_95 (→ an Upcoming card with the cancel
 *       affordance enabled). The cohort's past jrny_apt_95 already covers the History side.
 *   • appt-mastercalendar-* → FUTURE `event collection` (end_date>=now), FUTURE `arena events`
 *       (full fields: startdate/enddate/type:'event'/eventref→event collection/productref→products),
 *       active `workshopconfiguration` (detailpage.{title,workshopStartDate,workshopEndDate}), so the
 *       month grid + carousel + workshops list + "Plan For N Months" CTA all render without the
 *       empty-`reduce` degradation (mastercalendar.dart:212).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the
 * test project slabs-queue-e2e-exdcz); every doc is tagged {testrunid:'jrny', _testdata:true}; NO ATC
 * collection is ever touched (every product/journey/event carries atcmodel:null so ATC branches stay
 * dead) and firestore-atc is never opened. Deterministic run-prefixed doc ids; idempotent (set/merge).
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-appointments.cjs --seed
 *   node flutter-suite/seed-appointments.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');
const { TEST_PROJECT_ID } = require('../lib/test-project');

// Same run id the cohort uses (we extend the SAME run so teardown stays unified and the cohort's
// jrny_AT / jrny_eisrole / jrny_pf_eis / jrny_P_appt ids resolve).
const RUN = process.env.JRNY_RUNID || 'jrny';

// The single Appointments-driven user (richest cohort user with ≥4 events + an upgrade; has an Auth
// account from the cohort's E2E_INDICES). Keep these in lockstep with seed-cohort.js's pidFor/emailFor.
const I = Number(process.env.APPT_USER_INDEX || 95);
const PID = `${RUN}_profile_${I}`;
const EMAIL = `participant${I}+${RUN}@example.com`;

// ── cohort ids we REUSE (must match seed-cohort.js CAT) ──────────────────────────────────────────
const COHORT = {
  appttype: `${RUN}_AT`,          // appointmenttype "Cohort Coaching <run>" (totalminutes 60)
  eisrole: `${RUN}_eisrole`,      // eisroles "Cohort Coach <run>"
  eisProfile: `${RUN}_pf_eis`,    // the host EIS profile_data
  productAppt: `${RUN}_P_appt`,   // the appointment-delivered product
  productQueue: `${RUN}_P_0`,     // a queue product (family 0 = uP! for user 95? i%4=3 → CPM; use _P_(i%4))
  productForUser: `${RUN}_P_${I % 4}`, // user 95's queue product family (i%4 = 3)
};

// ── this seeder's OWN run-prefixed ids (additive; never collide with cohort ids) ─────────────────
const ID = {
  // role graph for the cohort appttype
  atRole: `${RUN}_appt_ATR`,          // AppointmentType-To-Roles (AT → [eisrole])
  rte: `${RUN}_appt_RTE`,             // Roles-To-EIS (eisrole → [eisProfile])
  eis2Profile: `${RUN}_appt_pf_eis2`, // a SECOND distinct EIS so Roles-To-EIS yields a non-self host
  // a FREE future availability slot for the cohort appttype, owned by the 2nd EIS
  availBook: `${RUN}_appt_avail_book_${I}`,
  // standalone "ready" appointment delivery to enter BookAppointment from (pushed directly)
  deliverBook: `${RUN}_appt_deliv_book_${I}`,
  // a FUTURE un-attended appointment (Upcoming card + cancel affordance + detail sheet)
  apptFuture: `${RUN}_appt_future_${I}`,
  // ── Master-Calendar fixtures (future) ──
  calEvent: `${RUN}_appt_calevt`,         // event collection (end_date future) — upcoming list + month
  calArena: `${RUN}_appt_calarena`,       // arena events (full fields, future) — carousel + month + CTA
  calWorkshop: `${RUN}_appt_calws`,       // workshopconfiguration (active) — workshops list + month
  calProduct: `${RUN}_appt_calprod`,      // products for the arena color/note (atcmodel:null)
};

// Collections this seeder writes (run-scoped teardown). App-written booking docs (no tag) handled below.
const SEEDED = [
  'AppointmentType-To-Roles', 'Roles-To-EIS', 'availability', 'deliverables', 'appointments',
  'profile_data', 'event collection', 'arena events', 'workshopconfiguration', 'products',
];

async function seedBucket() {
  const admin = seed.initAdmin();               // HARD-ABORTS unless slabs-queue-e2e-exdcz
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);

  // date helpers (seed-time Node Date — same machine/TZ as the iOS sim the test runs on)
  const at = (dayOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return T.fromDate(d); };
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  const profileRef = (id) => ref('profile_data', id);
  const apptTypeRef = ref('appointmenttype', COHORT.appttype);
  const roleRef = ref('eisroles', COHORT.eisrole);

  console.log(`\n[seed-appointments] run=${RUN} user=${PID} (${EMAIL}) → ${TEST_PROJECT_ID}`);

  // ── 0) a SECOND EIS host profile (so Roles-To-EIS yields a host that is NOT the booking participant)
  //    The cohort's jrny_pf_eis is the availability OWNER in the cohort; here we use a dedicated 2nd EIS
  //    for the bookable slot so the merge's self-exclusion (element.id != profileid) keeps a real host.
  await ref('profile_data', ID.eis2Profile).set(
    { profileid: ID.eis2Profile, docid: ID.eis2Profile, name: `Appt EIS Two ${RUN}`, email: `apptseis2+${RUN}@example.com`, ...tag },
    { merge: true },
  );

  // ── 1) ROLE GRAPH for the cohort appointment type (jrny_AT) ──────────────────────────────────────
  //    BookAppointment reads AppointmentType-To-Roles (assigned_appttype_ref==AT, limit 1) → required_role[],
  //    then Roles-To-EIS (assigned_role_ref==role) → assigned_eis[] (excluding self). Shapes mirror the
  //    proven e2e/appointments/seed-appointments.js.
  await ref('AppointmentType-To-Roles', ID.atRole).set(
    { docid: ID.atRole, assigned_appttype_ref: apptTypeRef, required_role: [roleRef], additional_role: [], ...tag },
    { merge: true },
  );
  await ref('Roles-To-EIS', ID.rte).set(
    { docid: ID.rte, assigned_role_ref: roleRef, assigned_eis: [profileRef(ID.eis2Profile)], ...tag },
    { merge: true },
  );

  // ── 2) BOOKABLE FUTURE SLOT for the cohort appttype, owned by the 2nd EIS ─────────────────────────
  //    availability: profileref==eis2, appointments arrayContains AT, starttime a future-day window,
  //    and a field keyed by the appttype DOC id (jrny_AT) → a FREE slot {booked:false, available:true}.
  //    +5 days so the date picker's selectableDayPredicate offers exactly this date (no same-day trap).
  await ref('availability', ID.availBook).set({
    docid: ID.availBook, profileref: profileRef(ID.eis2Profile),
    starttime: at(5, 9), endtime: at(5, 17),
    appointments: [apptTypeRef],
    [COHORT.appttype]: [{ slotstart: at(5, 10), slotend: at(5, 11), booked: false, available: true, groupappointment: false }],
    weeklyhours: 20, ...tag,
  }, { merge: false });

  // ── 3) standalone "ready" appointment deliverable to ENTER BookAppointment from ──────────────────
  //    The test pushes BookAppointment(deliverablepath: this doc, appointment:{name,path: appttype},
  //    productid: appt product) directly via navigatorKey (only 4 named routes exist). On a successful
  //    booking the app updates THIS doc (fileref arrayUnion + status:'ongoing') — an extra app-write —
  //    while the primary anti-circular assertion is the NEW `appointments` doc the app adds.
  await ref('deliverables', ID.deliverBook).set({
    docid: ID.deliverBook, profileid: PID, type: 'appointment', status: 'ready',
    deliveryref: apptTypeRef, fileref: [], participantproductid: `${RUN}_pp_${I}_b`, ...tag,
  }, { merge: false });

  // ── 4) a FUTURE un-attended appointment (Upcoming card + cancel affordance + detail sheet) ────────
  //    MyAppointments streams appointments where bookedby==profile_data/{PID}, orderBy starttime desc,
  //    split Upcoming(starttime>now)/History. Cancel is enabled iff attended==false && cancelled==false
  //    && starttime>now. The cohort's jrny_apt_95 (past, attended) already populates History; this one
  //    populates Upcoming. hostRole keyed by the ROLE REF PATH (eisroles/jrny_eisrole).
  await ref('appointments', ID.apptFuture).set({
    docid: ID.apptFuture,
    appointment: apptTypeRef,
    appointmentrole: [roleRef],
    hostRole: { [roleRef.path]: [profileRef(COHORT.eisProfile)] },
    hosts: [profileRef(COHORT.eisProfile)],
    bookedby: profileRef(PID),
    starttime: at(7, 14), endtime: at(7, 15),
    attended: false, cancelled: false, journeycoach: false, onboarding: false,
    totalminutes: 60, productid: COHORT.productAppt,
    slotdata: [{ id: ID.availBook, index: 0 }],
    created: at(-1, 12), ...tag,
  }, { merge: false });

  // ── 5) MASTER-CALENDAR fixtures (all FUTURE so they render + avoid the empty-reduce path) ─────────
  //    a product for the arena color/note (mapProduct[productref.id] → atcmodel color + product name).
  await ref('products', ID.calProduct).set(
    { id: ID.calProduct, docid: ID.calProduct, product: `Calendar Arena Product ${RUN}`, atcmodel: null, mode: 'Event Mode', ...tag },
    { merge: true },
  );

  //    event collection — read by where end_date>=startDate; fields end_date,venue,name,image. FUTURE.
  await ref('event collection', ID.calEvent).set({
    id: ID.calEvent, docid: ID.calEvent, name: `Calendar Online Event ${RUN}`,
    end_date: future(14), start_date: future(12), venue: 'online', image: 'https://example.com/e2e-event.png',
    // getATCModelColor(eventData['atcmodel']) (mastercalendar.dart:1203) wants a non-null String — '' takes
    // the safe default-color else-branch; null throws "Null is not a String" in the upcoming-events card build.
    atcmodel: '', ...tag,
  }, { merge: true });

  //    arena events — read by where enddate>=startDate; needs eventref(→event collection), productref(→products),
  //    startdate,enddate (Timestamps), displayname/eventname, type:'event', delete:false. FUTURE so it lands in
  //    upcomingArenaEvents (carousel + the totalMonthEvents reduce) and the month grid.
  await ref('arena events', ID.calArena).set({
    id: ID.calArena, docid: ID.calArena,
    eventref: ref('event collection', ID.calEvent),
    productref: ref('products', ID.calProduct),
    startdate: future(12), enddate: future(14),
    displayname: `Calendar Exclusive Arena ${RUN}`, eventname: `Calendar Exclusive Arena ${RUN}`,
    venue: 'online', type: 'event', delete: false, image: 'https://example.com/e2e-arena.png', ...tag,
  }, { merge: true });

  //    workshopconfiguration — read by where active==true; detailpage.{title,workshopStartDate,workshopEndDate}.
  await ref('workshopconfiguration', ID.calWorkshop).set({
    docid: ID.calWorkshop, active: true,
    detailpage: { title: `Calendar Workshop ${RUN}`, workshopStartDate: future(20), workshopEndDate: future(21) },
    ...tag,
  }, { merge: true });

  // Book Appointment.onAppointmentSelect (Book Appointment.dart:171) does customer_eismapping/{PID}.eisroles
  // [rolesOfAppt] — it expects eisroles to be a MAP keyed by role-path Strings, but seed-journeyflow/seed-auth
  // wrote it as a LIST → "String is not int of index". Delete this user's doc so priorAssigned.exists==false
  // and onAppointmentSelect takes the safe Roles-To-EIS fallback (which IS seeded). (Idempotent; ok if absent.)
  await ref('customer_eismapping', PID).delete().catch(() => {});
  console.log(`  ✓ role graph (ATR + RTE + eis2) · bookable future slot · ready deliverable · cleared customer_eismapping/${PID}`);
  console.log(`  ✓ future appointment (Upcoming) for ${PID}`);
  console.log(`  ✓ calendar: event collection + arena events + workshopconfiguration + product (all future)`);
  console.log(`[seed-appointments] done. Teardown: node flutter-suite/seed-appointments.cjs --teardown`);
  return { RUN, PID, EMAIL, ID, SEEDED };
}

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();

  // 1) run-scoped sweep of every collection this seeder writes (tagged docs).
  const n = await seed.teardownCollections(db, SEEDED, RUN);

  // 2) APP-WRITTEN booking docs (the BookAppointment write carries NO testrunid) — sweep by the
  //    natural key bookedby==profile_data/{PID} AND appointment==appttype, EXCLUDING the seeded
  //    fixtures (jrny_apt_<I> from the cohort, ID.apptFuture from this seeder) which ARE tagged 'jrny'
  //    and were already removed in (1) / belong to the cohort teardown.
  let appDeleted = 0;
  const snap = await db.collection('appointments')
    .where('bookedby', '==', db.collection('profile_data').doc(PID))
    .where('appointment', '==', db.collection('appointmenttype').doc(COHORT.appttype))
    .get().catch(() => ({ docs: [] }));
  for (const d of snap.docs) {
    if (d.data().testrunid === RUN) continue; // tagged seed fixture — handled by run-scoped/cohort teardown
    await d.ref.delete().catch(() => {}); appDeleted++;
  }
  return n + appDeleted;
}

module.exports = { RUN, PID, EMAIL, ID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-appointments] seeded for', r.PID); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-appointments] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-appointments.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
