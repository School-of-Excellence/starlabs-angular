// @ts-nocheck
/**
 * seed-business.js — stand up the "Business Dashboard & Misc" world on the dedicated disposable
 * test project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives
 * (allowlist-guarded admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Concept group routes: /expense-planner/:tab, /ads-entry, /eventzonemanagement, /hpc, /quiz,
 * /viewquiz, /participanttouchpoint. Recon: e2e/recon-allcomp/business-misc.md.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed-test-project.initAdmin() (hard-aborts
 * off the test project), every doc is tagged {testrunid:'biz', _testdata:true}, and NO ATC collection is
 * ever touched. There is NO ATC branch in any of these screens — confirmed by the recon.
 *
 * Actors (custom roster — this group only needs an `admin` super-role; the recon shows authGuard admits
 * by role intersection with the seeded `dashboard` route-config, and admin is granted every route here):
 *   admin+biz@example.com       roles {admin}          — primary actor for ALL business/admin screens
 *   participant0+biz@example.com roles {participant}   — owns the seeded HPC / touchpoint / quiz-response data
 *
 * Anti-circularity: every seeded doc is a PRECONDITION. The specs assert a value the APP COMPUTED/RENDERED
 * from its own Firestore stream (zone/quiz/HPC counts, touchpoint rows) OR a value the APP WROTE on a real
 * UI action (expense add/soft-delete, ads add+log) — never a value the test itself just wrote.
 *
 * Usage:  node e2e/business/seed-business.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.BIZ_RUNID || 'biz';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  EVT: `${TESTRUNID}_bizevt_0`,        // event collection doc (zone management + viewquiz event name)
  COH1: `${TESTRUNID}_bizcoh_0`,        // big cohorts doc #1 (eventref → EVT)
  COH2: `${TESTRUNID}_bizcoh_1`,        // big cohorts doc #2 (eventref → EVT)
  ZONE1: `${TESTRUNID}_bizzone_0`,      // event zones doc #1 (eventref → EVT)
  ZONE2: `${TESTRUNID}_bizzone_1`,      // event zones doc #2 (eventref → EVT)
  EXP_PAST: `${TESTRUNID}_bizexp_past`, // expenseplanning doc in current month (NOT today) → BM-03 soft-delete
  ADS_PAST: `${TESTRUNID}_bizads_past`, // adsinvestment doc in current month (NOT today) → list baseline
  HPC: (i) => `${TESTRUNID}_bizhpc_${i}`,
  QUIZ: `${TESTRUNID}_bizquiz_0`,       // quiz doc (type withoutResponse, active) → BM-14
  QRESP: (i) => `${TESTRUNID}_bizqresp_${i}`,
  TP: (i) => `${TESTRUNID}_biztp_${i}`, // participant touchpoint docs → BM-15
};

// Actors. profileids are run-prefixed; emails follow actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  p0: `${TESTRUNID}_pf_p0`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [mk('admin', ['admin'], 'admin')];
  const participants = [mk('p0', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the business specs navigate to (each needs a dashboard route-config grant). The authGuard
// matches by the FIRST path segment only (cleanUrl = '/' + url.split('/')[1], auth.guard.ts:35), so
// /expense-planner/home is granted by '/expense-planner'.
const ROUTES = [
  { route: '/expense-planner', label: 'Expense Planner' },
  { route: '/ads-entry', label: 'Ads Entry' },
  { route: '/eventzonemanagement', label: 'Event Zone Management' },
  { route: '/hpc', label: 'HPC' },
  { route: '/quiz', label: 'Quiz' },
  { route: '/viewquiz', label: 'View Quiz' },
  { route: '/participanttouchpoint', label: 'Participant Touchpoint' },
];

// HPC seed counts (BM-10): 2 completed + 2 in-progress, all owned by p0 so we can search by p0's name.
const HPC_COMPLETED = 2;
const HPC_INPROGRESS = 2;
// Quiz-response seed count (BM-14).
const QUIZ_RESPONSES = 4;
// Touchpoint seed count (BM-15) — owned by p0, within the default last-7-day window.
const TOUCHPOINTS = 5;

async function seedBusiness() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). Reused verbatim from the queue seeder.
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes (the gate every route here passes through).
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // --- date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const now = new Date();
  // A day in the CURRENT month that is NOT today (so the "add" dialog's dateExist() never collides with
  // the seeded baseline doc, and the seeded doc still falls inside the month-filter window).
  const otherDayThisMonth = () => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 15 ? 14 : 15, 12, 0, 0, 0);
    return d;
  };
  const daysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };

  // --- refs ---
  const eventRef = db.collection('event collection').doc(ID.EVT);
  const quizRef = db.collection('quiz').doc(ID.QUIZ);
  const cohRef1 = db.collection('big cohorts').doc(ID.COH1);
  const cohRef2 = db.collection('big cohorts').doc(ID.COH2);

  // 3) EVENT + COHORTS + ZONES (BM-07 zone read reconciliation). eventref is a DocumentReference into
  //    `event collection` (the component builds doc(...,'event collection', selectedEvent.docid) and
  //    queries event zones / big cohorts where eventref == that ref).
  await eventRef.set({
    docid: ID.EVT, name: `BIZ Test Event ${TESTRUNID}`,
    end_date: T.fromDate(daysAgo(1)), start_date: T.fromDate(daysAgo(30)), ...tag,
  });
  // big cohorts: name (for sort + viewquiz cohort name), cohortCategory (bucketing), participantidlist.
  // Only seeded profile ids appear in participantidlist (recon risk #5: zone-mgmt reads
  // mapProfileData[pid]['email'] without a null guard — keep every pid resolvable in profile_data).
  await cohRef1.set({ docid: ID.COH1, name: `BIZ Cohort A ${TESTRUNID}`, cohortCategory: 'operational', eventref: eventRef, participantidlist: [PF.p0], ...tag });
  await cohRef2.set({ docid: ID.COH2, name: `BIZ Cohort B ${TESTRUNID}`, cohortCategory: 'educational', eventref: eventRef, participantidlist: [PF.p0], ...tag });
  // event zones: zonename (for sort + render), eventref ref, cohorts array (empty → unassigned baseline),
  // status. zonesCreated == count of these docs (app renders eventZoneList.length).
  await db.collection('event zones').doc(ID.ZONE1).set({ docid: ID.ZONE1, zonename: `BIZ Zone One ${TESTRUNID}`, eventref: eventRef, cohorts: [], status: 'active', ...tag });
  await db.collection('event zones').doc(ID.ZONE2).set({ docid: ID.ZONE2, zonename: `BIZ Zone Two ${TESTRUNID}`, eventref: eventRef, cohorts: [], status: 'active', ...tag });

  // 4) EXPENSE baseline (BM-03 soft-delete). One doc in the current month but NOT today, delete:false.
  //    Unique item name so the rendered row is uniquely selectable. lastupdatedby seeded as a sentinel
  //    so the test can later assert the APP overwrote it with the admin pid on delete (anti-circular).
  await db.collection('expenseplanning').doc(ID.EXP_PAST).set({
    docid: ID.EXP_PAST, date: T.fromDate(otherDayThisMonth()), totalpaid: 0, delete: false,
    lastupdatedtime: T.now(), lastupdatedby: '__seed__', entryby: '__seed__',
    description: [{ name: `BIZ Seeded Expense ${TESTRUNID}`, amount: 4321, paid: false }], ...tag,
  });

  // 5) ADS baseline (BM-05 list baseline only — the add flow creates its OWN doc for today). One doc in
  //    the current month but NOT today + its single initial log row (mirrors the app's writeBatch shape).
  const adsRef = db.collection('adsinvestment').doc(ID.ADS_PAST);
  await adsRef.set({
    docid: ID.ADS_PAST, date: T.fromDate(otherDayThisMonth()), campaigns: 7, amount: 1500,
    entrytime: T.now(), lastupdated: T.now(), entryby: '__seed__', ...tag,
  });
  await adsRef.collection('logs').doc(`${ID.ADS_PAST}_log0`).set({
    docid: `${ID.ADS_PAST}_log0`, editedby: '__seed__', updatedtime: T.now(), campagins: 7, amount: 1500, ...tag,
  });

  // 6) HPC sessions (BM-10). getDocs orders by createdAt desc (single-field, no composite index). All
  //    owned by p0 → searchable by p0's mapped name. completedCount == status=='completed' count.
  for (let i = 0; i < HPC_COMPLETED; i++) {
    await db.collection('3minuteshpc').doc(ID.HPC(`c${i}`)).set({
      docid: ID.HPC(`c${i}`), profileid: PF.p0, status: 'completed', multiple: false,
      achievementfrom: `BIZ HPC done ${i}`, createdAt: T.fromDate(daysAgo(2 + i)),
      completedAt: T.fromDate(daysAgo(1 + i)), ...tag,
    });
  }
  for (let i = 0; i < HPC_INPROGRESS; i++) {
    await db.collection('3minuteshpc').doc(ID.HPC(`p${i}`)).set({
      docid: ID.HPC(`p${i}`), profileid: PF.p0, status: 'in-progress', multiple: false,
      achievementfrom: `BIZ HPC wip ${i}`, createdAt: T.fromDate(daysAgo(4 + i)), ...tag,
    });
  }
  // classify/3minuteshpc is MISSING on the test project — safe to create (HPC contrast-prompt admins gate).
  await db.collection('classify').doc('3minuteshpc').set({ admins: [PF.admin], prompt: `BIZ test prompt ${TESTRUNID}`, ...tag }, { merge: true });

  // 7) QUIZ + RESPONSES (BM-14). One ACTIVE quiz with type 'withoutResponse' and a UNIQUE question, plus
  //    QUIZ_RESPONSES quizbyclients responses carrying that exact question + type. The viewquizcohort
  //    auto-selects the latest active quiz and filters responses by r.question === selectedQuiz.question,
  //    so filteredResponses.length == the seeded response count (no other quiz shares this question text).
  const QUESTION = `BIZ Which mode do you prefer? ${TESTRUNID}`;
  const OPTIONS = [
    { text: 'Option Alpha', explanation: '', isCorrect: true, cohortref: cohRef1 },
    { text: 'Option Beta', explanation: '', isCorrect: false, cohortref: cohRef1 },
  ];
  await quizRef.set({
    docid: ID.QUIZ, docId: ID.QUIZ, question: QUESTION, type: 'withoutResponse', active: true,
    options: OPTIONS, eventref: eventRef, productref: null, createdAt: T.now(), ...tag,
  });
  // Distribute responses across the two options (so optionBreakdown has >1 bucket; percentages sum ~100).
  for (let i = 0; i < QUIZ_RESPONSES; i++) {
    const pick = i % 2; // alternate Alpha / Beta
    const quizData = OPTIONS.map((o, idx) => ({ ...o, isSelected: idx === pick }));
    await db.collection('quizbyclients').doc(ID.QRESP(i)).set({
      docid: ID.QRESP(i), profileid: PF.p0, question: QUESTION, type: 'withoutResponse',
      submittedIn: 'test', date: T.fromDate(daysAgo(i)), eventref: eventRef, productref: null,
      quizref: quizRef, selectedcohort: i % 2 === 0 ? cohRef1 : cohRef2, quizData, ...tag,
    });
  }

  // 8) PARTICIPANT TOUCHPOINTS (BM-15). Owned by p0, within the default last-7-day window. The
  //    collection holds 17k+ pre-existing docs (prior queue/appointments runs) all sharing the four
  //    stock touchpoint types, and the screen orders touchpointdate ASC with a paginator — so our rows
  //    would be buried pages deep and total-count reconciliation is impossible. Instead we tag every
  //    seeded touchpoint with a RUN-UNIQUE `touchpoint` TYPE that no pre-existing doc carries, and add
  //    that type to classify/touchpoint.touchpointlist so it is a selectable filter option. The spec
  //    then de-selects the stock types and selects ONLY our unique type → the component filters its own
  //    stream (calculateTimeDelay: dataSource.data = filterTouchPoint.includes(touchpoint)) down to
  //    EXACTLY our seeded rows, which it renders on page one. touchpointdate range is single-field
  //    (>= && <=, orderBy same field) → no composite index.
  const TP_TYPE = `BIZ Touch ${TESTRUNID}`;
  for (let i = 0; i < TOUCHPOINTS; i++) {
    await db.collection('participant touchpoint').doc(ID.TP(i)).set({
      docid: ID.TP(i), profileid: PF.p0, touchpoint: TP_TYPE,
      label: `BIZ TP label ${i}`, notes: `BIZ_TP_NOTE_${TESTRUNID}_${i}`,
      touchpointdate: T.fromDate(daysAgo((i % 5) + 1)), ...tag,
    });
  }
  // Make the unique type a selectable option in the touchpoint filter multi-select. arrayUnion is
  // idempotent and additive (never drops the stock types other suites/agents rely on). NOT testrunid-
  // tagged on this shared config doc — teardown removes our type explicitly (see teardownBusiness).
  await db.collection('classify').doc('touchpoint').set(
    { touchpointlist: admin.firestore.FieldValue.arrayUnion(TP_TYPE) }, { merge: true },
  );

  return {
    TESTRUNID, ID, PF, EMAIL,
    counts: {
      events: 1, cohorts: 2, zones: 2, expense: 1, ads: 1,
      hpc: HPC_COMPLETED + HPC_INPROGRESS, hpcCompleted: HPC_COMPLETED, hpcInProgress: HPC_INPROGRESS,
      quiz: 1, quizResponses: QUIZ_RESPONSES, touchpoints: TOUCHPOINTS,
    },
    QUESTION, TP_TYPE,
  };
}

/** The run-unique touchpoint type (BM-15 filter key). Mirrors the seeder's TP_TYPE. */
const TP_TYPE = `BIZ Touch ${TESTRUNID}`;

// Collections this seed writes (for teardown). The `logs` subcollection is swept implicitly when its
// parent adsinvestment doc is deleted by teardownCollections (best-effort) — we also sweep the run-tagged
// parents; orphaned subdocs (if any) are harmless on a disposable project and re-seeding overwrites them.
const SEEDED = [
  'event collection', 'big cohorts', 'event zones', 'expenseplanning', 'adsinvestment',
  '3minuteshpc', 'quiz', 'quizbyclients', 'participant touchpoint', 'classify',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownBusiness() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // Best-effort: delete the adsinvestment logs subcollection docs we seeded before sweeping parents.
  try {
    const logs = await db.collection('adsinvestment').doc(ID.ADS_PAST).collection('logs').get();
    for (const d of logs.docs) await d.ref.delete().catch(() => {});
  } catch (_) { /* parent may not exist on a fresh project */ }
  // Remove our run-unique touchpoint type from the SHARED classify/touchpoint.touchpointlist (additive
  // arrayUnion on seed → arrayRemove on teardown; leaves the stock types intact for other suites).
  try {
    await db.collection('classify').doc('touchpoint').set(
      { touchpointlist: admin.firestore.FieldValue.arrayRemove(TP_TYPE) }, { merge: true },
    );
  } catch (_) { /* classify/touchpoint may be absent on a pristine project */ }
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Also delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, ROUTES, SEEDED, TP_TYPE, seedBusiness, teardownBusiness };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBusiness(); console.log('[seed-business] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownBusiness(); console.log('[seed-business] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-business.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
