// @ts-nocheck
/**
 * seed-journeyflow.cjs — preconditions for the END-TO-END journey-flow test (user idx 170).
 *
 * The journey-flow test walks ONE user purchase→onboarding→delivery→≥4 events→content→progression→shift.
 * The cohort wrote idx-170 in the POST-onboarding (shifted) state, so we FLIP it back to a first-run
 * ONBOARDING-LOCKED state (the home gate's 4 lock conditions — home.dart onBoarding()) and seed the
 * onboarding config the flow needs (journeyonboardingdetail + classify + the onboarding-call appointment
 * graph). The DOWNSTREAM steps (queue card, ≥4 events, content) reuse the cohort baseline idx-170 already
 * has; the journey shift step re-adds a 2nd purchase at the end (seeded data transition).
 *
 * Self-contained + idempotent. Test-project only (allowlist guard). atcmodel:null; NO ATC data plane.
 * Note: like seed-auth (idx-90), this flips a cohort "shifted" user to onboarding — the cohort median
 * shift stays ≥1 (110 → 108 after both flips, still > the 100-user median index). Run: --seed | --teardown.
 */
'use strict';
const { seed, TAG } = require('../lib/seed-common');

const RUN = process.env.JRNY_RUNID || 'jrny';
const IDX = 170;
const PID = `${RUN}_profile_${IDX}`;
const J = `${RUN}_J_${IDX % 4}`;          // 170 % 4 = 2 → CTD family journey jrny_J_2

const ID = {
  pjp: `${RUN}_pjp_${IDX}`, pjp2: `${RUN}_pjp2_${IDX}`,
  jod: `${RUN}_jf_jod`, atcModel: `${RUN}_jf_atcmodel`,
  apptType: `${RUN}_jf_onboardingcall`, eisRole: `${RUN}_jf_eisrole`,
  apptToRole: `${RUN}_jf_appttorole`, roleToEis: `${RUN}_jf_roletoeis`,
  eisProfile: `${RUN}_jf_eis`, availability: `${RUN}_jf_avail`,
  gen1: `${RUN}_jf_gen_1`, sv1: `${RUN}_jf_sv_1`, series1: `${RUN}_jf_series_1`,
};
const SEEDED = ['participantjourneyproduct', 'journeyonboardingdetail', 'atc model', 'classify',
  'content_urls', 'solar voice playlist', 'series', 'appointmenttype', 'eisroles',
  'AppointmentType-To-Roles', 'Roles-To-EIS', 'customer_eismapping', 'profile_data', 'availability', 'chat config'];

async function seedBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (c, id) => db.collection(c).doc(id);
  const past = (d) => T.fromMillis(Date.now() - d * 86400e3);
  const future = (d) => T.fromMillis(Date.now() + d * 86400e3);
  const writes = [];
  const W = (r, d, o) => writes.push(r.set(d, o || {})); // collect — MUST await before process.exit or writes are dropped

  // 1) FLIP idx-170 to onboarding-locked: exactly 1 PJP (delete the cohort's 2nd), initiated, orientationstatus null.
  await ref('participantjourneyproduct', ID.pjp2).delete().catch(() => {});
  W(ref('participantjourneyproduct', ID.pjp), {
    docid: ID.pjp, profileid: PID, journeyref: ref('journey', J),
    journeystatus: 'initiated', orientationstatus: null, onboarded: false,
    onboardingscheduled: null, onreschedule: false, paymentplan: 'enach-icici',
    subscriptionstart: past(2), subscriptionend: future(120), ...tag,
  }, { merge: true });

  // 2) journeyonboardingdetail + the SAFE reference `atc model` doc (config copy, not ATC data).
  W(ref('journeyonboardingdetail', ID.jod), {
    docid: ID.jod, journeyref: ref('journey', J), title: `Welcome to your CTD journey`,
    description: 'Your guided onboarding.', queuedescripition: { atcmodel: 'Reference copy (config only).' },
    // overviewvideo null (not {}): JourneyOnboardingDetail._loadData (:88) does overviewvideo!=null ? .id —
    // a Map passes the guard then throws "Map has no getter id". This jod shares journeyref jrny_J_2 with the
    // auth bucket's user, so its query returns THIS doc too; a Map here crashes the auth F12 render.
    overviewvideo: null, participantproducts: [], ...tag,
  });
  W(ref('atc model', ID.atcModel), { docid: ID.atcModel, atcmodel: `CTD ${RUN}`, model: 'CTD reference model', levels: [], ...tag });

  // 3) classify singletons the onboarding screens read (idempotent — same shape as seed-auth).
  W(ref('classify', 'journeyorientation'), { docid: 'journeyorientation', introduction: [
    { title: 'Welcome', description: 'Your journey starts here.' },
    { title: 'How it works', description: 'A guided path.' },
    { title: "Let's begin", description: 'Set up your app to get started.' },
  ], timecompression: { contenturl: [] }, ...tag });
  W(ref('classify', 'applockedcontent'), { docid: 'applockedcontent',
    generalcontentplaylist: [ref('content_urls', ID.gen1)], solarvoiceplaylist: [ref('solar voice playlist', ID.sv1)],
    eiflixplaylist: [ref('series', ID.series1)], ...tag });
  W(ref('classify', 'paymentplan'), { docid: 'paymentplan', Onboardingpaymentmesage: 'Complete your payment plan.', ...tag });
  W(ref('classify', 'timecompression'), { docid: 'timecompression', title: 'Time Compression',
    pages: [{ title: 'Compress a decade', body: 'Achieve in months what takes years.' }], contenturl: [], ...tag });
  W(ref('content_urls', ID.gen1), { docid: ID.gen1, name: `Orientation Intro ${RUN}`, description: 'Welcome.', videoUrl: 'https://example.com/e2e.m3u8', type: 'generalcontent', ...tag });
  W(ref('solar voice playlist', ID.sv1), { docid: ID.sv1, id: ID.sv1, name: `Solar Voice Welcome ${RUN}`, description: 'Audio.', ...tag });
  W(ref('series', ID.series1), { docid: ID.series1, id: ID.series1, seriesName: `Ei-Flix Welcome ${RUN}`, description: 'Watch.', imageUrl: 'https://example.com/e2e.png', ...tag });

  // 4) onboarding-call appointment graph (ScheduleOnboarding renders + best-effort book).
  W(ref('appointmenttype', ID.apptType), { docid: ID.apptType, appointmenttype: `Onboarding Call ${RUN}`, onboardingcall: true, totalminutes: 60, ...tag });
  W(ref('eisroles', ID.eisRole), { docid: ID.eisRole, role: `Onboarding Coach ${RUN}`, ...tag });
  W(ref('AppointmentType-To-Roles', ID.apptToRole), { docid: ID.apptToRole, assigned_appttype_ref: ref('appointmenttype', ID.apptType), required_role: [ref('eisroles', ID.eisRole)], additional_role: [], ...tag });
  W(ref('Roles-To-EIS', ID.roleToEis), { docid: ID.roleToEis, assigned_role_ref: ref('eisroles', ID.eisRole), assigned_eis: [ref('profile_data', ID.eisProfile)], ...tag });
  W(ref('customer_eismapping', PID), { docid: PID, profileid: PID, eisroles: [ref('eisroles', ID.eisRole)], ...tag });
  W(ref('profile_data', ID.eisProfile), { docid: ID.eisProfile, profileid: ID.eisProfile, name: `Onboarding EIS ${RUN}`, email: `jfeis+${RUN}@example.com`, number: '9999900000', countrycode: '+91', enable: true, block: false, ...tag });
  const slotStart = future(2);
  const slotEnd = T.fromMillis(slotStart.toMillis() + 60 * 60e3);
  W(ref('availability', ID.availability), { docid: ID.availability, profileref: ref('profile_data', ID.eisProfile),
    starttime: slotStart, endtime: slotEnd, appointments: [ref('appointmenttype', ID.apptType)], weeklyhours: 20,
    [ID.apptType]: [{ slotstart: slotStart, slotend: slotEnd, booked: false, available: true, id: `${RUN}_jf_slot_0` }], ...tag });

  // 5) chat config (the change-request / support paths read chat config.categories).
  W(ref('chat config', `${RUN}_jf_chatconfig`), { docid: `${RUN}_jf_chatconfig`, categories: ['In-App Support', 'Events & Process'], ...tag });

  await Promise.all(writes); // flush ALL writes before the caller process.exit()s (the flip must persist)
  console.log(`[seed-journeyflow] seeded ${PID} → onboarding-locked on ${J} (${admin.app().options.projectId})`);
  return { RUN, PID, journey: J };
}

async function teardownBucket() {
  const admin = seed.initAdmin();
  await seed.teardownCollections(admin.firestore(), SEEDED, RUN);
}

module.exports = { RUN, IDX, PID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-journeyflow] seeded', JSON.stringify(r)); }
    else if (mode === '--teardown') { await teardownBucket(); console.log('[seed-journeyflow] torn down for', RUN); }
    else { console.log('usage: seed-journeyflow.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
