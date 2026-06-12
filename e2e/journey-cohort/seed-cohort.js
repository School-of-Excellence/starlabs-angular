// @ts-nocheck
/**
 * seed-cohort.js — the ≥200-user "sample journey" cohort for the Flutter e2e suite.
 *
 * Implements specs/journals/2026-06-11-flutter-full-map-and-e2e-artifacts/JOURNEY-DATA-BLUEPRINT.md
 * (Part B) on the disposable test project slabs-queue-e2e-exdcz. Models each user purchase → onboarding
 * → mode/journey → queue+appointment delivery → events → content → (for the upgraded/shifted slice) a
 * second journey purchase. The cohort is engineered so the VERIFIED invariants hold (verify-cohort.js):
 *   • median events-attended per user ≥ 4   (distribution: 40 Light·2 / 110 Core·4-6 / 40 Heavy·8-12 / 10 Power·15-20 → median 5)
 *   • median journey shift/upgrade count ≥ 1 (slices: 90 single / 80 upgraded / 30 shifted → 55% carry a 2nd purchase)
 *
 * A subset (E2E_INDICES, default 12 — all with ≥4 events) get real Firebase Auth accounts so the Flutter
 * app can drive them in Phase 3; the rest are data-only (the dataset + the medians only need profile_data).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the test
 * project allowlist); every doc carries {testrunid, _testdata:true}; NO ATC collection is ever touched
 * (journeys/products/events seeded atcmodel:null so every ATC branch stays dead).
 *
 * Usage (from the e2e/ dir):
 *   node journey-cohort/seed-cohort.js --seed          # seed N=200 (or COHORT_N)
 *   node journey-cohort/seed-cohort.js --teardown      # sweep this run
 *   COHORT_N=12 node journey-cohort/seed-cohort.js --seed   # small validation run
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

const RUN = process.env.JRNY_RUNID || 'jrny';
const N = Number(process.env.COHORT_N || 200);
// e2e-driven indices (Auth accounts). All chosen from the Core/Heavy event bands AND the upgrade/shift
// slices, so each has ≥4 events and a journey transition (richest users → best Phase-3 coverage).
const E2E_INDICES = (process.env.E2E_INDICES
  ? process.env.E2E_INDICES.split(',').map(Number)
  : [90, 91, 92, 93, 94, 95, 96, 97, 150, 151, 170, 171]).filter((i) => i < N);

// ── deterministic per-user dials (no RNG; the median is invariant to assignment order) ──────────────
const JOURNEYS = ['uP!', 'B!G', 'CTD', 'CPM'];
const MODE_ARC = ['Journey Planning Mode', 'Early Preparation Mode', 'Event Mode', 'Integration Mode',
  'Performance Mode', 'Extended Performance Mode'];
// the 15-mode prod catalog (ordered; engine rolls up lowest-sequence-wins) — blueprint A5
const MODES = ['Big Mode', 'Installation Event Mode', 'Event Mode', 'Integration Mode', 'Priority Mode',
  'Preparation Mode', 'Performance Mode', 'Journey Priority Planning Mode', 'Extended Performance Mode',
  'Early Preparation Mode', 'Journey Planning Mode', 'Exploration Mode', 'After Extended Performance Mode',
  'Snooze Mode', 'Investment Mode'];

/** events attended for user i — the exact multiset 40·2 / 110·(4,5,6) / 40·(8..12) / 10·(15..20). */
function eventCountFor(i, n) {
  // scale the 4 bands to n (default 200) so a small COHORT_N validation run still spans all buckets
  const light = Math.round(n * 0.20), core = Math.round(n * 0.55), heavy = Math.round(n * 0.20);
  if (i < light) return 2;
  if (i < light + core) return 4 + (i % 3);            // 4,5,6
  if (i < light + core + heavy) return 8 + (i % 5);    // 8..12
  return 15 + (i % 6);                                  // 15..20
}
/** journey transition for user i — 45% single / 40% upgraded / 15% shifted (→ 55% carry a 2nd purchase). */
function shiftTypeFor(i, n) {
  const single = Math.round(n * 0.45), upgraded = Math.round(n * 0.40);
  if (i < single) return 'none';
  if (i < single + upgraded) return 'upgrade';
  return 'shift';
}

// ── run-scoped catalog ids ──────────────────────────────────────────────────────────────────────
const CAT = {
  journey: (k) => `${RUN}_J_${k}`,            // k = 0..3 (family)
  product: (k) => `${RUN}_P_${k}`,            // k = 0..3 (per family queue product) ; _appt / _event extras below
  productAppt: `${RUN}_P_appt`,
  package: `${RUN}_PKG`,
  j2p: (k) => `${RUN}_J2P_${k}`,
  appttype: `${RUN}_AT`,
  eisrole: `${RUN}_eisrole`,
  availability: `${RUN}_avail`,
  queueGen: `${RUN}_QG`,
  deliveryEvent: `${RUN}_DE`,
  event: (k) => `${RUN}_EVT_${k}`,            // pool of events users attend
  eisProfile: `${RUN}_pf_eis`,
};
const EVENT_POOL = 24; // shared pool of events the cohort attends (each user picks a rotating subset)

const emailFor = (i) => `participant${i}+${RUN}@example.com`;
const pidFor = (i) => `${RUN}_profile_${i}`;
const uidFor = (i) => `${RUN}_u_${i}`;

async function seedCohort() {
  const admin = seed.initAdmin();          // hard-aborts unless the test project
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-cohort] run=${RUN} N=${N} e2eUsers=${E2E_INDICES.length} → ${seed.TEST_PROJECT_ID || 'test project'}`);

  // ── 1) CATALOG (run-scoped; atcmodel:null everywhere) ──────────────────────────────────────────
  const cat = db.bulkWriter();
  // journeys (4 families)
  JOURNEYS.forEach((j, k) => cat.set(ref('journey', CAT.journey(k)),
    { id: CAT.journey(k), journey: `${j} ${RUN}`, sequence: 900 + k, originalfee: 1000 * (k + 1), atcmodel: null, type: 'DFU', ...tag }));
  // products: one queue-delivered product per family + a shared appointment product
  JOURNEYS.forEach((j, k) => cat.set(ref('products', CAT.product(k)),
    { id: CAT.product(k), product: `${j} Core Product ${RUN}`, mode: 'Event Mode', minimumrequiredamount: 100, atcmodel: null, deliveryplanning: 'Standard', unlimited: false, originalfee: 100, ...tag }));
  cat.set(ref('products', CAT.productAppt),
    { id: CAT.productAppt, product: `Coaching Appointment ${RUN}`, mode: 'Priority Mode', minimumrequiredamount: 100, atcmodel: null, deliveryplanning: 'Standard', ...tag });
  cat.set(ref('package', CAT.package), { docid: CAT.package, package: `Cohort Package ${RUN}`, nonjourney: false, ...tag });
  JOURNEYS.forEach((j, k) => cat.set(ref('journey-to-product', CAT.j2p(k)),
    { journey: ref('journey', CAT.journey(k)), product: [ref('products', CAT.product(k)), ref('products', CAT.productAppt)], journeyrequiredjourneycoach: false, ...tag }));
  // modes catalog (ordered)
  MODES.forEach((m, s) => cat.set(ref('modes', `${RUN}_mode_${s}`), { mode: m, sequence: s, atcmodel: null, ...tag }));
  // appointment-delivery config
  cat.set(ref('appointmenttype', CAT.appttype), { docid: CAT.appttype, appointmenttype: `Cohort Coaching ${RUN}`, totalminutes: 60, ...tag });
  cat.set(ref('eisroles', CAT.eisrole), { docid: CAT.eisrole, role: `Cohort Coach ${RUN}`, ...tag });
  cat.set(ref('availability', CAT.availability), { docid: CAT.availability, profileref: ref('profile_data', CAT.eisProfile), starttime: past(30), endtime: future(30), appointments: [], weeklyhours: 20, ...tag });
  // a minimal queue generation (queue_token.queueref target; full stage machinery is Phase-3 driving).
  // The Flutter Home reads these UNGUARDED when building the queue card:
  //   home.dart:897/963/964 → queueenddate(.toDate, future) / queuestartdate(.toDate, past) / docid
  //   queueControl.dart:350/386 → stageproperty[currentstage].compulsoryactivity  (NoSuchMethodError [] if absent)
  // A 'default' action type (selfmovable:false, compulsoryactivity:[]) renders a benign "View All Stages"
  // card (no form/link/videoask resource, no driving) so EVERY cohort user's Home renders clean.
  const QSTAGES = ['Preparation', 'Performance', 'Integration', 'Completed'];
  const qStageProperty = {};
  QSTAGES.forEach((s) => { qStageProperty[s] = { compulsoryactivity: [], selfmovable: false, actiontype: 'default', calltoaction: 'View All Stages', stageexplanation: `${s} — cohort delivery stage`, minwatingminutes: '0', maxwatingminutes: '0' }; });
  cat.set(ref('queue generation', CAT.queueGen), { id: CAT.queueGen, docid: CAT.queueGen, queuename: `Cohort Queue ${RUN}`, stages: QSTAGES, stageproperty: qStageProperty, queuestartdate: past(7), queueenddate: future(60), queuevariation: [], arenaeventidlist: [], ...tag });
  // event delivery type + the shared event pool
  cat.set(ref('delivery events', CAT.deliveryEvent), { docid: CAT.deliveryEvent, eventname: `Cohort Event Type ${RUN}`, atcmodel: null, ...tag });
  for (let k = 0; k < EVENT_POOL; k++) {
    cat.set(ref('event collection', CAT.event(k)),
      // delete:false + atcmodel:'' (not null): the calendar screens (Mastercalendar:1203 getATCModelColor,
      // MastercalendarClone:169 if(element['delete'])) query events GLOBALLY and crash on null bool/String.
      { id: CAT.event(k), eventname: `Cohort Event ${k} ${RUN}`, eventtyperef: ref('delivery events', CAT.deliveryEvent), eventdate: past(60 - k), arenaeventid: `${RUN}_arena_${k}`, delete: false, atcmodel: '', ...tag });
    cat.set(ref('arena events', `${RUN}_ae_${k}`), { id: `${RUN}_ae_${k}`, eventref: ref('event collection', CAT.event(k)), eventname: `Cohort Arena ${k} ${RUN}`, ...tag });
  }
  // a host EIS profile (appointment hostRole / availability owner)
  cat.set(ref('profile_data', CAT.eisProfile), { profileid: CAT.eisProfile, docid: CAT.eisProfile, name: `Cohort EIS ${RUN}`, email: `eis+${RUN}@example.com`, ...tag });
  await cat.close();
  console.log(`  ✓ catalog: 4 journeys · 5 products · ${MODES.length} modes · ${EVENT_POOL} events · appt/eis/availability/queueGen`);

  // ── 2) AUTH chain for the e2e-driven subset (real Firebase Auth + the full profile_data chain) ──
  const e2eParticipants = E2E_INDICES.map((i) => ({ uid: uidFor(i), profileid: pidFor(i), email: emailFor(i), role: 'participant', roles: ['participant'] }));
  await seed.seedAuthChain(db, auth, RUN, { staff: [], participants: e2eParticipants });
  console.log(`  ✓ auth chain for ${e2eParticipants.length} e2e users (indices ${E2E_INDICES.join(',')})`);

  // ── 3) PER-USER cohort docs (BulkWriter) ───────────────────────────────────────────────────────
  const bw = db.bulkWriter();
  bw.onWriteError((err) => err.failedAttempts < 5); // retry transient
  const isE2E = new Set(E2E_INDICES);
  let totAttended = 0, totShift = 0, docCount = 0;
  const W = (r, d, opts) => { bw.set(r, d, opts || {}); docCount++; };

  for (let i = 0; i < N; i++) {
    const P = pidFor(i), email = emailFor(i), uid = uidFor(i);
    const fam = i % 4;                                   // journey family
    const J1 = CAT.journey(fam), PA = CAT.product(fam), PB = CAT.productAppt;
    const mode = MODE_ARC[i % MODE_ARC.length];
    const E = eventCountFor(i, N);                       // events attended
    const C = 2 + (i % 9);                               // content watched (2..10)
    const shiftType = shiftTypeFor(i, N);                // none|upgrade|shift
    const t0 = past(90);
    const ppA = `${RUN}_pp_${i}_a`, ppB = `${RUN}_pp_${i}_b`;
    const seqQ = `${RUN}_delq_${i}`, seqA = `${RUN}_dela_${i}`;

    // (1) identity — e2e users already have profile_data from seedAuthChain (merge journey fields);
    //     data-only users get a full profile_data here (verify keys cohort off profile_data.testrunid).
    // participantmode is the Flutter-home QUEUE-CARD render gate: it must match the active
    // participantsproduct.mode (=ppA, 'Event Mode') and products.mode, or the card never resolves.
    // (the rotated `mode` is kept only as cosmetic analytics realism on participant metadata.)
    const profileFields = { participantmode: 'Event Mode', profileimg: 'https://example.com/e2e.png', profile: 'https://example.com/e2e.png' };
    if (isE2E.has(i)) {
      W(ref('profile_data', P), profileFields, { merge: true });
    } else {
      W(ref('profile_data', P), { profileid: P, docid: P, email: email.toLowerCase(), name: `Cohort User ${i} ${RUN}`, number: '9999900000', countrycode: '+91', enable: true, block: false, ...profileFields, ...tag });
    }

    // (2) purchase quartet (Watson-join modeled as the watson* strings on JPP)
    W(ref('journeyproductpurchase', `${RUN}_jpp_${i}`), { profileid: P, journeyref: ref('journey', J1), participantjourneyproductref: ref('participantjourneyproduct', `${RUN}_pjp_${i}`), purchasetype: 'journey', watsonpurchaseid: `${RUN}_wp_${i}`, watsonpurchaselabel: `${JOURNEYS[fam]} Accelerate`, productref: [ref('products', PA), ref('products', PB)], ...tag });
    const j1status = shiftType === 'upgrade' ? 'upgraded' : (shiftType === 'shift' ? 'shifted' : (i % 3 === 0 ? 'completed' : 'ongoing'));
    W(ref('participantjourneyproduct', `${RUN}_pjp_${i}`), { docid: `${RUN}_pjp_${i}`, profileid: P, journeyref: ref('journey', J1), journeystatus: j1status, journeytype: 'new', onboarded: true, onboardedtime: past(88), subscriptionstart: t0, subscriptionend: future(90), purchaseref: ref('journeyproductpurchase', `${RUN}_jpp_${i}`), salesleadsref: ref('salesleads', `${RUN}_sl_${i}`), participantproducts: [ppA, ppB], productref: [ref('products', PA), ref('products', PB)], paymentplan: 'enach-icici', orientationstatus: 'completed', onreschedule: false, ...tag });
    W(ref('salesleads', `${RUN}_sl_${i}`), { docid: `${RUN}_sl_${i}`, profileid: P, journey: J1, journeytype: 'new', status: 'Approved', watsonpurchaseid: `${RUN}_wp_${i}`, ...tag });
    W(ref('participantsproduct', ppA), { docid: ppA, profileid: P, productref: ref('products', PA), packageref: ref('package', CAT.package), status: shiftType === 'shift' ? 'shifted' : 'ongoing', mode: 'Event Mode', deliverymode: 'Event Mode', statusdate: { ongoing: past(80) }, sequenceorder: 0, eventref: ref('queue generation', CAT.queueGen), instantiated: 'done', ...tag });
    W(ref('participantsproduct', ppB), { docid: ppB, profileid: P, productref: ref('products', PB), packageref: ref('package', CAT.package), status: 'ongoing', mode: 'Priority Mode', deliverymode: 'Priority Mode', sequenceorder: 1, ...tag });

    // (4) mode / journey assignment
    W(ref('participant mode checklist', `${RUN}_pmc_${i}`), { docid: `${RUN}_pmc_${i}`, profileid: P, mode: 'Event Mode', productref: ref('products', PA), participantproductid: ppA, aelid: null, widget: [], createddate: past(40), ...tag }); // docid REQUIRED: homeContent.dart:1800 batch.update(participant mode checklist/{docid}) → .doc(undefined) not-found without it
    W(ref('participant metadata', P), { docid: P, profileid: P, name: `Cohort User ${i} ${RUN}`, email: email.toLowerCase(), participantmode: 'Event Mode', activejourney: J1, customerstatus: 'active', financialstatus: 'regular', pp_totalpaid: '50000', pp_totalpurchasevalue: '100000', activeproduct: [PA, PB], consumedproducts: [], unconsumedproducts: [], productmode: ['Event Mode'], cosmeticmode: mode, ...tag });

    // (5) queue delivery + appointment delivery (the Flutter-home render chain + a completed appt)
    W(ref('queue_token', `${RUN}_tok_${P}`), { profile_id: P, profileid: P, queueref: ref('queue generation', CAT.queueGen), productref: ref('products', PA), currentstage: 'Performance', previousstage: 'Preparation', stagestatus: 'Yet to Start', tokenstatus: 'Active', tokennumber: i + 1, queueposition: i + 1, variationid: null, deliveryRef: ref('deliverables', seqQ), participantproductid: ppA, people_involved: [], ...tag });
    W(ref('deliverables', seqQ), { docid: seqQ, profileid: P, type: 'queue', status: 'ongoing', fileref: [ref('queue_token', `${RUN}_tok_${P}`)], participantproductid: ppA, participantjourneyid: `${RUN}_pjp_${i}`, ...tag });
    W(ref('appointments', `${RUN}_apt_${i}`), { docid: `${RUN}_apt_${i}`, appointment: ref('appointmenttype', CAT.appttype), hostRole: { [`eisroles/${CAT.eisrole}`]: [ref('profile_data', CAT.eisProfile)] }, hosts: [ref('profile_data', CAT.eisProfile)], bookedby: ref('profile_data', P), starttime: past(20), endtime: past(20), attended: true, cancelled: false, totalminutes: 60, participantproductid: ppB, slotdata: [], created: past(25), ...tag });
    W(ref('deliverables', seqA), { docid: seqA, profileid: P, type: 'appointment', status: 'completed', fileref: [ref('appointments', `${RUN}_apt_${i}`)], participantproductid: ppB, participantjourneyid: `${RUN}_pjp_${i}`, ...tag });
    // the delivery sequence (queue ongoing + appointment completed + the event leaves below)
    const eventDeliveries = [];

    // (6) ≥E events attended (the median-driving records)
    for (let k = 0; k < E; k++) {
      const ev = k % EVENT_POOL;
      const eprId = `${RUN}_epr_${i}_${k}`;
      W(ref('event participation request', eprId), { docid: eprId, profileid: P, eventref: ref('event collection', CAT.event(ev)), productref: ref('products', PA), eventtyperef: ref('delivery events', CAT.deliveryEvent), status: 'attended', arenaeventid: `${RUN}_arena_${ev}`, participantproductid: ppA, eventdate: past(60 - k), doccreateddate: past(65 - k), ...tag });
      W(ref('events_profiles', `${RUN}_ep_${i}_${k}`), { event_ref: ref('event collection', CAT.event(ev)), profile_ref: ref('profile_data', P), eventrequest: ref('event participation request', eprId), pseudo_name: `Cohort ${i}`, token: `${RUN}_etok_${i}_${k}`, ...tag });
      W(ref('event rsvp', `${RUN}_rsvp_${i}_${k}`), { profileid: P, eventref: ref('event collection', CAT.event(ev)), productref: ref('products', PA), participantresponse: 'yes', type: k % 2 ? 'queue' : 'event', ...tag });
      W(ref('arena e-ticket', `${RUN}_etk_${i}_${k}`), { profileid: P, eventref: ref('event collection', CAT.event(ev)), eventparticipationref: ref('event participation request', eprId), producteligible: [PA], active: true, eventstartdate: past(60 - k), eventenddate: past(60 - k), ...tag });
      const dele = `${RUN}_dele_${i}_${k}`;
      W(ref('deliverables', dele), { docid: dele, profileid: P, type: 'event', status: 'completed', fileref: [ref('event participation request', eprId)], participantproductid: ppA, ...tag });
      eventDeliveries.push({ type: 'event', status: 'completed', sequenceref: ref('deliverables', dele) });
      totAttended++;
    }

    // participantdeliverysequence (queue ongoing + appointment completed + every event leaf)
    W(ref('participantdeliverysequence', P), { docid: P, profileid: P, products: [
      { participantproductid: ppA, productref: ref('products', PA), delivery: [{ type: 'queue', status: 'ongoing', sequenceref: ref('deliverables', seqQ) }, ...eventDeliveries] },
      { participantproductid: ppB, productref: ref('products', PB), delivery: [{ type: 'appointment', status: 'completed', sequenceref: ref('deliverables', seqA) }] },
    ], ...tag });

    // (7) content consumption
    const caRefs = [];
    for (let n = 0; n < C; n++) {
      const type = ['solarvoice', 'eiflixcontent', 'generalcontent'][n % 3];
      const caId = `${RUN}_ca_${i}_${n}`;
      W(ref('content analytics', caId), { docid: caId, profileid: P, videoid: `${RUN}_vid_${n}`, videoname: `Cohort Content ${n}`, type, status: 'complete', totaltimespend: 600, totalruntime: 600, logdate: past(10 - (n % 10)), from: type, playlistid: `${RUN}_play`, ...tag });
      caRefs.push({ type, ref: ref('content analytics', caId) });
    }
    W(ref('participant content analytics', P), { docid: P, profileid: P,
      solarvoice: caRefs.filter((c) => c.type === 'solarvoice').map((c) => c.ref),
      eiflixcontent: caRefs.filter((c) => c.type === 'eiflixcontent').map((c) => c.ref),
      generalcontent: caRefs.filter((c) => c.type === 'generalcontent').map((c) => c.ref), ...tag });

    // (8) journey shift/upgrade — a SECOND purchase on a different family for the upgraded/shifted slice
    if (shiftType !== 'none') {
      const fam2 = (fam + 1) % 4, J2 = CAT.journey(fam2);
      const label = shiftType === 'upgrade' ? `${JOURNEYS[fam]} to ${JOURNEYS[fam2]} upgrade` : `${JOURNEYS[fam]} to ${JOURNEYS[fam2]}`;
      W(ref('journeyproductpurchase', `${RUN}_jpp2_${i}`), { profileid: P, journeyref: ref('journey', J2), participantjourneyproductref: ref('participantjourneyproduct', `${RUN}_pjp2_${i}`), purchasetype: 'journey', watsonpurchaseid: `${RUN}_wp2_${i}`, watsonpurchaselabel: label, ...tag });
      W(ref('participantjourneyproduct', `${RUN}_pjp2_${i}`), { docid: `${RUN}_pjp2_${i}`, profileid: P, journeyref: ref('journey', J2), journeystatus: 'ongoing', journeytype: shiftType, onboarded: true, subscriptionstart: past(20), purchaseref: ref('journeyproductpurchase', `${RUN}_jpp2_${i}`), participantproducts: [], onreschedule: false, ...tag });
      totShift++;
    }
  }
  await bw.close();
  console.log(`  ✓ ${N} users · ~${docCount} docs · ${totAttended} attended EPRs · ${totShift} users with a 2nd journey`);
  console.log(`\n[seed-cohort] done. Verify with: node journey-cohort/verify-cohort.js`);
  return { RUN, N, e2e: E2E_INDICES, totAttended, totShift, docCount };
}

// collections this seed writes (run-scoped teardown)
const SEEDED = [
  'journey', 'products', 'package', 'journey-to-product', 'modes', 'appointmenttype', 'eisroles', 'availability',
  'queue generation', 'delivery events', 'event collection', 'arena events',
  'profile_data', 'user_data', 'users_roles', 'dashboard',
  'journeyproductpurchase', 'participantjourneyproduct', 'salesleads', 'participantsproduct',
  'participant mode checklist', 'participant metadata', 'queue_token', 'participantdeliverysequence',
  'deliverables', 'appointments', 'event participation request', 'events_profiles', 'event rsvp',
  'arena e-ticket', 'content analytics', 'participant content analytics',
];

async function teardownCohort() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, RUN);
  // delete the e2e Auth users
  const auth = admin.auth();
  for (const i of E2E_INDICES) await auth.deleteUser(uidFor(i)).catch(() => {});
  return n;
}

module.exports = { RUN, N, E2E_INDICES, emailFor, pidFor, uidFor, CAT, SEEDED, seedCohort, teardownCohort };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedCohort(); console.log('[seed-cohort] seeded', JSON.stringify({ N: r.N, e2e: r.e2e.length, attended: r.totAttended, shift: r.totShift })); }
    else if (mode === '--teardown') { const n = await teardownCohort(); console.log('[seed-cohort] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-cohort.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
