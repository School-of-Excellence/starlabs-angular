// @ts-nocheck
/**
 * seed-auth.cjs — Auth & Onboarding bucket (U1) precondition seeder for the breakthroughs-flutter
 * e2e suite. EXTENDS the ≥200-user cohort (journey-cohort/seed-cohort.js) for the ONE driven user of
 * this bucket — profileid `jrny_profile_90` / `participant90+jrny@example.com` — with the feature
 * preconditions the FEATURE-CATALOG.md §2 (auth-onboarding) rows require (their `Reads` + the e2e note).
 *
 * It does NOT duplicate the cohort. The cohort already gave idx 90: profile_data + the purchase quartet
 * + the queue render chain + ≥4 events + content + a 2nd-journey (upgrade slice). On TOP of that this
 * seeder adds ONLY what the auth-onboarding features need, and — crucially — FLIPS idx 90 into the
 * ONBOARDING-LOCKED state so the REAL home onboarding gate (home.dart onBoarding(), 4 lock conditions)
 * locks the shell to JourneyOnboardingHome for this user, which is the headline surface of this bucket:
 *   • the single PJP `jrny_pjp_90` → {journeystatus:'initiated', orientationstatus:null, onboarded:false}
 *   • the cohort's 2nd-journey docs (jrny_pjp2_90 / jrny_jpp2_90) are DELETED so the profile has EXACTLY
 *     ONE participantjourneyproduct (lock condition 1). (Cohort median-shift invariant stays ≥1: this
 *     drops the shift cohort from 110→109 of 200; sorted median index 99/100 is still 1. See notes.)
 *   • `journeyonboardingdetail` for the journeyref (lock condition 3) + the `classify` config the
 *     onboarding screens read (journeyorientation.introduction / applockedcontent / paymentplan /
 *     timecompression), the onboarding-call appointment graph, `chat config` for the change-request
 *     ticket, and `profile_data.dateofbirth` as a Timestamp (ProfileInfoRequest.loadFields :82 .toDate()).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the test
 * project allowlist, lib/test-project.js); every doc carries {testrunid:'jrny', _testdata:true} (TAG);
 * NO ATC collection is ever touched and `firestore-atc` is never opened. The reference `atc model` doc
 * seeded below is the SAFE reference taxonomy (CLAUDE.md) read by journeyOnboardingDetail — NOT ATC data.
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-auth.cjs --seed       # extend the cohort for the auth bucket
 *   node flutter-suite/seed-auth.cjs --teardown   # sweep this bucket's docs for the run
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

const RUN = process.env.JRNY_RUNID || 'jrny';

// ── the ONE driven user of this bucket (must match the cohort's E2E_INDICES + SUITE-PLAN U1) ──────────
const IDX = Number(process.env.AUTH_IDX || 90);
const PID = `${RUN}_profile_${IDX}`;                 // jrny_profile_90 (the cohort's idx-90 profile)
const EMAIL = `participant${IDX}+${RUN}@example.com`;
// idx 90 → cohort family = 90 % 4 = 2 → journey jrny_J_2, queue product jrny_P_2. The PJP we keep
// points at this journeyref; journeyonboardingdetail is seeded for the SAME journeyref.
const FAM = IDX % 4;
const J = `${RUN}_J_${FAM}`;                          // jrny_J_2 (the kept journey)

// ── this bucket's own run-scoped doc ids (idempotent re-seed) ─────────────────────────────────────
const ID = {
  pjp: `${RUN}_pjp_${IDX}`,                            // the cohort PJP we flip to onboarding-locked
  pjp2: `${RUN}_pjp2_${IDX}`,                          // the cohort 2nd-journey PJP we DELETE
  jpp2: `${RUN}_jpp2_${IDX}`,                          // the cohort 2nd-journey JPP we DELETE
  jod: `${RUN}_auth_jod`,                              // journeyonboardingdetail for J
  atcModel: `${RUN}_auth_atcmodel`,                    // SAFE reference taxonomy (atc model collection)
  apptType: `${RUN}_auth_onboardingcall`,              // appointmenttype onboardingcall:true
  apptToRole: `${RUN}_auth_AT2R`,                      // AppointmentType-To-Roles
  roleToEis: `${RUN}_auth_R2E`,                        // Roles-To-EIS
  eisRole: `${RUN}_auth_eisrole`,                      // an EIS role id
  eisProfile: `${RUN}_auth_eis`,                       // the host EIS profile (availability owner)
  availability: `${RUN}_auth_avail`,                   // EIS availability with future slots
  chatConfig: `${RUN}_auth_chatconfig`,                // chat config (categories incl. In-App Support)
  blockedProfile: `${RUN}_auth_blocked`,               // a BLOCKED profile for flag-enforcement (Login UI)
  blockedUserData: `${RUN}_auth_blocked_ud`,
  blockedRole: `${RUN}_auth_blocked_role`,
  gen1: `${RUN}_auth_gen_1`,                           // a general content_urls doc (applockedcontent)
  sv1: `${RUN}_auth_sv_1`,                             // a solar voice playlist doc (applockedcontent)
  series1: `${RUN}_auth_series_1`,                     // a series doc (applockedcontent eiflix)
};

// The blocked companion's email (login pre-checks profile_data flags BEFORE FirebaseAuth, so this
// profile needs NO Auth user — login.dart:118-128 alerts on block before signInWithEmailAndPassword).
const BLOCKED_EMAIL = `blocked+${RUN}@example.com`;

const SEEDED = [
  'journeyonboardingdetail', 'classify', 'atc model',
  'appointmenttype', 'AppointmentType-To-Roles', 'Roles-To-EIS', 'eisroles', 'customer_eismapping',
  'availability', 'chat config', 'content_urls', 'solar voice playlist', 'series',
  // companion auth-chain docs for the blocked-login profile
  'user_data', 'profile_data', 'users_roles',
];

async function seedBucket() {
  const admin = seed.initAdmin();                       // hard-aborts unless the test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-auth] run=${RUN} bucket=auth user=${PID} (${EMAIL}) journey=${J}`);

  const bw = db.bulkWriter();
  bw.onWriteError((err) => err.failedAttempts < 5);
  const W = (r, d, opts) => bw.set(r, d, opts || {});

  // ── 1) FLIP idx-90 into the onboarding-locked state (the gate's 4 lock conditions) ───────────────
  // The cohort wrote jrny_pjp_90 onboarded:true / orientationstatus:'completed'. Merge it back to a
  // first-run state: exactly-1 PJP (we delete the 2nd below), journeystatus 'initiated', journeyref set,
  // orientationstatus null (→ JourneyOnboardingHome welcome screen), paymentplan set (→ "Book a Call"
  // enabled), docid present (the intro/completion writes target onboardingJourney["docid"]).
  W(ref('participantjourneyproduct', ID.pjp), {
    docid: ID.pjp, profileid: PID, journeyref: ref('journey', J),
    journeystatus: 'initiated', orientationstatus: null, onboarded: false,
    onboardingscheduled: null, onreschedule: false, paymentplan: 'enach-icici',
    subscriptionstart: past(2), subscriptionend: future(120), ...tag,
  }, { merge: true });

  // ── 2) journeyonboardingdetail for the kept journey (lock condition 3 + the Detail screen content) ─
  // Minimal but renderable: queuedescripition.atcmodel is config copy (NOT ATC data); overviewvideo/
  // participantproducts kept tiny. atcmodel string is plain reference text per the cluster note.
  W(ref('journeyonboardingdetail', ID.jod), {
    docid: ID.jod, journeyref: ref('journey', J),
    title: `Welcome to your ${J} journey`,
    description: 'Your guided onboarding for the Excellence Installation.',
    queuedescripition: { atcmodel: 'Reference model copy (config text only — not ATC data).' },
    // overviewvideo MUST be null (not {}): JourneyOnboardingDetail._loadData (journeyOnboardingDetail.dart:88)
    // does `overviewvideo != null ? overviewvideo.id` — an empty Map passes the !=null guard then throws
    // "Map has no getter id" (it expects a content_urls DocumentReference). null skips the content-load branch.
    overviewvideo: null, participantproducts: [], ...tag,
  });

  // SAFE reference `atc model` doc (journeyOnboardingDetail.dart:77 reads `atc model` where
  // atcmodel == journey.journey). This is the reference taxonomy collection, allowed by CLAUDE.md —
  // it is NOT the off-limits firestore-atc data plane. Seeded so the reference read resolves cleanly.
  W(ref('atc model', ID.atcModel), {
    docid: ID.atcModel, atcmodel: `${J} ${RUN}`, model: `${J} reference model`,
    levels: [], ...tag,
  });

  // ── 3) classify config the onboarding screens read ──────────────────────────────────────────────
  // journeyorientation.introduction[] drives the intro-slides screen (auth-orientation-intro-slides);
  // the LAST slide's "Get Started" writes orientationstatus:'initiated' (the anti-circular target).
  W(ref('classify', 'journeyorientation'), {
    docid: 'journeyorientation',
    introduction: [
      { title: 'Welcome', description: 'Your journey to transformation starts here.' },
      { title: 'How it works', description: 'A guided path through your installation.' },
      { title: "Let's begin", description: 'Set up your app to get started.' },
    ],
    timecompression: { contenturl: [] },
    ...tag,
  });
  // applockedcontent — the "Explore While You Wait" lists on the onboarding main screen. We point the
  // general/solarvoice/eiflix lists at the minimal content docs seeded below (so the explore row renders).
  W(ref('classify', 'applockedcontent'), {
    docid: 'applockedcontent',
    generalcontentplaylist: [ref('content_urls', ID.gen1)],
    solarvoiceplaylist: [ref('solar voice playlist', ID.sv1)],
    eiflixplaylist: [ref('series', ID.series1)],
    ...tag,
  });
  // paymentplan — gated copy for the booking card when paymentplan==null (we keep paymentplan SET, so
  // this copy is not shown, but the doc is read in the whereIn and must exist to avoid a degraded read).
  W(ref('classify', 'paymentplan'), {
    docid: 'paymentplan',
    Onboardingpaymentmesage: 'Complete your payment plan to unlock booking.',
    ...tag,
  });
  // timecompression — TimeCompressionInfo reads classify whereIn ["journeyorientation","timecompression"];
  // a missing doc leaves timecompression.isEmpty → infinite spinner (never renders the page body).
  W(ref('classify', 'timecompression'), {
    docid: 'timecompression',
    title: 'The Science of Time Compression',
    pages: [
      { title: 'Compress a decade', body: 'Achieve in months what takes others years.' },
    ],
    contenturl: [],
    ...tag,
  });

  // minimal explore content the applockedcontent lists dereference (names render in the explore rows)
  W(ref('content_urls', ID.gen1), { docid: ID.gen1, name: `Orientation Intro ${RUN}`, description: 'Welcome video.', videoUrl: 'https://example.com/e2e.m3u8', type: 'generalcontent', ...tag });
  W(ref('solar voice playlist', ID.sv1), { docid: ID.sv1, id: ID.sv1, name: `Solar Voice Welcome ${RUN}`, description: 'Audio welcome.', ...tag });
  W(ref('series', ID.series1), { docid: ID.series1, id: ID.series1, seriesName: `Ei-Flix Welcome ${RUN}`, description: 'Watch while you wait.', imageUrl: 'https://example.com/e2e.png', ...tag });

  // ── 4) onboarding-call appointment graph (auth-book-onboarding-call render + best-effort book) ───
  // ScheduleOnboarding reads appointmenttype where onboardingcall==true (else `appointment` stays {}
  // → infinite spinner). The full slot-merge WRITE needs one bookable future slot per required role at
  // the same time; we seed a minimal graph + future availability so the SCREEN renders and a slot pick
  // is best-effort. (The authoritative appointment-booking coverage lives in the appointments bucket.)
  W(ref('appointmenttype', ID.apptType), {
    docid: ID.apptType, appointmenttype: `Onboarding Call ${RUN}`,
    onboardingcall: true, totalminutes: 60, ...tag,
  });
  W(ref('eisroles', ID.eisRole), { docid: ID.eisRole, role: `Onboarding Coach ${RUN}`, ...tag });
  W(ref('AppointmentType-To-Roles', ID.apptToRole), {
    docid: ID.apptToRole, assigned_appttype_ref: ref('appointmenttype', ID.apptType),
    required_role: [ref('eisroles', ID.eisRole)], additional_role: [], ...tag,
  });
  W(ref('Roles-To-EIS', ID.roleToEis), {
    docid: ID.roleToEis, assigned_role_ref: ref('eisroles', ID.eisRole),
    assigned_eis: [ref('profile_data', ID.eisProfile)], ...tag,
  });
  // customer_eismapping/{profileid} — the participant's EIS roster (ScheduleOnboarding :113 reads
  // customer_eismapping/{profileid}.eisroles); keyed by the DRIVEN user's profileid.
  W(ref('customer_eismapping', PID), {
    // eisroles MUST be a MAP keyed by role-path String, NOT a list: ScheduleOnboarding.onAppointmentSelect
    // (scheduleOnboarding.dart:116) does eisroles[rolesOfAppt] where rolesOfAppt is a role-path String — a
    // List throws "String is not int of index" (F13). A Map indexes by String safely; this key matches the
    // appointment's role path so the prior-assigned EIS resolves (value = list of profile refs, read by .path).
    docid: PID, profileid: PID, eisroles: { ['eisroles/' + ID.eisRole]: [ref('profile_data', ID.eisProfile)] }, ...tag,
  });
  // the host EIS profile + a future availability window with one slot per the onboarding-call type.
  W(ref('profile_data', ID.eisProfile), {
    docid: ID.eisProfile, profileid: ID.eisProfile, name: `Onboarding EIS ${RUN}`,
    email: `onboardingeis+${RUN}@example.com`, number: '9999900000', countrycode: '+91',
    enable: true, block: false, ...tag,
  });
  // availability: top-level profileref/starttime/endtime/appointments + a per-appointment-type-id key
  // holding the slot array (jb_probe4 shape). One bookable future slot (day-after-tomorrow, 10:00).
  const slotStart = future(2);
  const slotEnd = T.fromMillis(slotStart.toMillis() + 60 * 60e3);
  W(ref('availability', ID.availability), {
    docid: ID.availability, profileref: ref('profile_data', ID.eisProfile),
    starttime: slotStart, endtime: slotEnd,
    appointments: [ref('appointmenttype', ID.apptType)],
    weeklyhours: 20,
    [ID.apptType]: [{ slotstart: slotStart, slotend: slotEnd, booked: false, available: true, id: `${RUN}_auth_slot_0` }],
    ...tag,
  });

  // ── 5) chat config — raiseTickets (auth-profile-change-request) reads chat config.categories and
  // does `.where((e) => e['category'] == 'In-App Support')` UNGUARDED (AppServices.dart:3656); a missing
  // doc / missing `categories` array throws and NO clientissue is written. Seed it.
  W(ref('chat config', ID.chatConfig), {
    docid: ID.chatConfig,
    categories: [
      { category: 'In-App Support', subcategory: 'Profile Change', assignto: 'admin' },
      { category: 'Journey Related', subcategory: 'Onboarding', assignto: 'admin' },
    ],
    ...tag,
  });

  // ── 6) profile_data extras for the DRIVEN user (idx 90) ──────────────────────────────────────────
  // dateofbirth MUST be a Timestamp — ProfileInfoRequest.loadFields (:82) and ProfileImage (:647) call
  // .toDate() on it; ProfileInfoRequest's call is UNGUARDED → it crashes on load if dob is null/absent.
  // name/number/email are merged so the identity card + the change-request "Current:" rows render.
  W(ref('profile_data', PID), {
    profileid: PID, docid: PID, email: EMAIL.toLowerCase(),
    name: `Auth E2E User ${IDX}`, number: '9000000090', countrycode: '+91',
    dateofbirth: past(9000), // a fixed past Timestamp (~1999) so DateFormat renders deterministically
    enable: true, block: false, accountdeleted: false,
    ...tag,
  }, { merge: true });

  // ── 7) BLOCKED companion profile for auth-account-flag-enforcement (Login UI) ────────────────────
  // login.dart pre-checks profile_data flags BEFORE FirebaseAuth, so this needs the full auth-chain
  // shape (user_ref non-null is the gate at :118) but NO Auth user. block:true → "Unauthorized" alert,
  // and NO last_login write (the anti-circular check is the ABSENCE of last_login + the alert).
  W(ref('user_data', ID.blockedUserData), { name: BLOCKED_EMAIL, email: BLOCKED_EMAIL, number: '9999900001', ...tag });
  W(ref('users_roles', ID.blockedRole), { id: ID.blockedRole, name: BLOCKED_EMAIL, participant: true, profile_ref: ref('profile_data', ID.blockedProfile), ...tag });
  W(ref('profile_data', ID.blockedProfile), {
    docid: ID.blockedProfile, profileid: ID.blockedProfile, email: BLOCKED_EMAIL.toLowerCase(),
    name: 'Blocked Login User', number: '9999900001', countrycode: '+91',
    user_ref: ref('user_data', ID.blockedUserData), role_ref: ref('users_roles', ID.blockedRole),
    enable: true, block: true, accountdeleted: false, ...tag,
  });

  await bw.close();

  // ── 8) DELETE the cohort's 2nd-journey docs so the profile has EXACTLY ONE PJP (lock condition 1).
  // Done AFTER the bulk writer closes (deletes are not buffered there). Idempotent (missing = no-op).
  await ref('participantjourneyproduct', ID.pjp2).delete().catch(() => {});
  await ref('journeyproductpurchase', ID.jpp2).delete().catch(() => {});

  console.log('  ✓ flipped jrny_pjp_90 → onboarding-locked (initiated / orientationstatus:null / 1 PJP)');
  console.log('  ✓ journeyonboardingdetail + atc-model(ref) + classify(4) + appt-graph + chat config + dob');
  console.log('  ✓ blocked companion profile for flag-enforcement (blocked+jrny@example.com)');
  console.log('[seed-auth] done.');
  return { RUN, PID, EMAIL, J, BLOCKED_EMAIL, ID };
}

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // Sweep this bucket's tagged docs (testrunid-scoped). NOTE: profile_data/{PID} and the PJP are OWNED
  // by the cohort (same testrunid) — the cohort teardown reclaims them; we do NOT delete the driven
  // user here (only our own added docs are swept by the run tag across SEEDED).
  const n = await seed.teardownCollections(db, SEEDED, RUN);
  // App-written docs from the change-request feature have NO testrunid tag → sweep by the driven user's
  // profileid (clientid). Mirrors seed-journey.js's APP_WRITE sweep.
  let appDeleted = 0;
  const ci = await db.collection('clientissue').where('clientid', '==', PID).get().catch(() => ({ docs: [] }));
  for (const d of ci.docs) {
    const msgs = await d.ref.collection('messages').get().catch(() => ({ docs: [] }));
    for (const m of msgs.docs) { await m.ref.delete().catch(() => {}); appDeleted++; }
    await d.ref.delete().catch(() => {}); appDeleted++;
  }
  return n + appDeleted;
}

module.exports = { RUN, IDX, PID, EMAIL, J, BLOCKED_EMAIL, ID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-auth] seeded', JSON.stringify({ user: r.PID, journey: r.J })); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-auth] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-auth.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
