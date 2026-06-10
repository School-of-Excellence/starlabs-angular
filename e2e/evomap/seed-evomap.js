// @ts-nocheck
/**
 * seed-evomap.js — stand up the Evolution Mapping world on the dedicated disposable test project
 * (slabs-queue-e2e-exdcz), reusing the proven queue/appointments seed primitives (allowlist-guarded
 * admin init, the staff/participant auth chain, the dashboard route-grant doc shape).
 *
 * Recon: e2e/recon-allcomp/evolution-mapping.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every data doc is tagged
 * {testrunid:'evom', _testdata:true}, and NO ATC collection is ever touched (the Evolution Mapping
 * group references zero ATC collections/components; products are irrelevant here).
 *
 * Actors (custom roster — Evolution Mapping needs only an admin operator + participants):
 *   admin+evom@example.com            roles {admin}        — full CRUD on /evolutionmapping + /participant_videos_mapping
 *   participant-evo+evom@example.com  roles {participant}  — p0: self-completes Evolution Mapping (/participantevolution)
 *   participant-evo1+evom@example.com roles {participant}  — pLive: Make-Live target (admin-driven, EM-05/06)
 *   participant-evo2+evom@example.com roles {participant}  — pDel: deleteVideo target (admin-driven, EM-07)
 *
 * The three evolution routes are open to ANY role in route_config (auth.guard.ts reads dashboard
 * roles[]); we grant them to all roster roles incl. `participant` so p0 can mount /participantevolution.
 *
 * Usage:  node e2e/evomap/seed-evomap.js --seed | --teardown   (run from the e2e/ dir)
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.EVOM_RUNID || 'evom';

// Stable stage name the participant completes (must be a member of the seeded queue-variation stages,
// and NOT the last stage — so movetonextStage finds a nextStage). The app computes nextStage as the
// element AFTER currentstage in the variation `stages[]` (participant-evolution-mapping.ts:215-219).
const EVO_STAGE = 'Evolution Mapping Stage';
const NEXT_STAGE = 'Closing Stage';
const VARIATION_STAGES = ['Intro Stage', EVO_STAGE, NEXT_STAGE];

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  // queue generation + variation the participant token points at (Flow 6).
  QGEN: `${TESTRUNID}_qgen`,
  QVAR: `${TESTRUNID}_qvar`,
  // queue_token for p0 (the self-completion token). docid carried into queue-stage-log via spread.
  TOKEN: `${TESTRUNID}_tok_p0`,
  // evolutionmappingvideo catalogue rows. Per-participant so the serial cases don't contend:
  //   EV_L1/EV_L2  -> pLive (Make-Live EM-05/06)
  //   EV_D1        -> p0 catalogue (also used as the soft-delete target EM-04)
  //   EV_P1/EV_P2  -> p0 catalogue rows whose urls back p0's live videolist (participant view EM-08/09)
  //   EV_X1/EV_X2  -> pDel existing-live videolist (deleteVideo EM-07)
  EV_L1: `${TESTRUNID}_ev_L1`,
  EV_L2: `${TESTRUNID}_ev_L2`,
  EV_D1: `${TESTRUNID}_ev_D1`,
  EV_P1: `${TESTRUNID}_ev_P1`,
  EV_P2: `${TESTRUNID}_ev_P2`,
  EV_X1: `${TESTRUNID}_ev_X1`,
  EV_X2: `${TESTRUNID}_ev_X2`,
  // EV_E1 -> p0 catalogue EDIT target (EM-03 setDoc-merges a new title onto it; reset between runs).
  EV_E1: `${TESTRUNID}_ev_E1`,
  // EV_T1/EV_T2 -> pToggle catalogue rows backing its pre-seeded live videolist (EM-15 toggle-off).
  EV_T1: `${TESTRUNID}_ev_T1`,
  EV_T2: `${TESTRUNID}_ev_T2`,
  // participant videos source rows (the add/edit dialog selector reads these).
  PV_1: `${TESTRUNID}_pv_1`,  // p0 source (legacy; available to the add dialog for p0)
  PV_2: `${TESTRUNID}_pv_2`,  // p0 source (legacy)
  // PV_N -> pNew's SOLE source video; EM-02's add dialog filters to pNew and picks it.
  PV_N: `${TESTRUNID}_pv_N`,
  // PV_E -> p0 source video the EM-03 EDIT target (EV_E1) MIRRORS by title+url; the edit dialog
  // pre-selects the matching source video only when the catalogue row's title equals a source title.
  PV_E: `${TESTRUNID}_pv_E`,
  // PV_DEL -> a standalone participant-video row for pVdel the /participant_videos_mapping log
  // renders as a deletable card (EM-14 flips its delete:true). Reset to delete:false between runs.
  PV_DEL: `${TESTRUNID}_pv_del`,
};

// Run-unique video urls (stable; never fetched — the firewall/player stubs block media).
const URL = {
  L1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/live-pre.mp4?raw=1`,
  L2: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/live-post.mp4?raw=1`,
  D1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/delete-me.mp4?raw=1`,
  P1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/part-pre.mp4?raw=1`,
  P2: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/part-post.mp4?raw=1`,
  X1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/del-vid-1.mp4?raw=1`,
  X2: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/del-vid-2.mp4?raw=1`,
  // EM-02 source video the admin picks from the add dialog (becomes a NEW evolutionmappingvideo row).
  PV1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/source-interview.mp4?raw=1`,
  PV2: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/source-testimonial.mp4?raw=1`,
  // EM-03 edit-target catalogue row url.
  E1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/edit-me.mp4?raw=1`,
  // EM-15 pToggle existing-live videolist urls.
  T1: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/toggle-1.mp4?raw=1`,
  T2: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/toggle-2.mp4?raw=1`,
  // EM-14 standalone participant-video url for pVdel.
  PVDEL: `https://dl.dropboxusercontent.com/evomap/${TESTRUNID}/pvdel.mp4?raw=1`,
};

// Run-unique titles (the specs select MatTable rows by this UNIQUE seeded text — no data-testid).
const TITLE = {
  L1: `EVOM Live Pre ${TESTRUNID}`,
  L2: `EVOM Live Post ${TESTRUNID}`,
  D1: `EVOM Delete Target ${TESTRUNID}`,
  P1: `EVOM Participant Pre ${TESTRUNID}`,
  P2: `EVOM Participant Post ${TESTRUNID}`,
  X1: `EVOM DelVid One ${TESTRUNID}`,
  X2: `EVOM DelVid Two ${TESTRUNID}`,
  PV1: `EVOM Source Interview ${TESTRUNID}`,
  PV2: `EVOM Source Testimonial ${TESTRUNID}`,
  // EM-03 edit target: starts at E1_BEFORE; the spec edits the title to E1_AFTER and asserts the
  // app-stored title. Reset to E1_BEFORE between runs (idempotent).
  E1_BEFORE: `EVOM Edit Before ${TESTRUNID}`,
  E1_AFTER: `EVOM Edit After ${TESTRUNID}`,
  T1: `EVOM Toggle One ${TESTRUNID}`,
  T2: `EVOM Toggle Two ${TESTRUNID}`,
  PVDEL: `EVOM PVDel Standalone ${TESTRUNID}`,
};

// Actors. profileids run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  p0: `${TESTRUNID}_pf_p0`,    // logs in, self-completes
  pLive: `${TESTRUNID}_pf_pLive`,  // Make-Live target
  pDel: `${TESTRUNID}_pf_pDel`,   // deleteVideo target
  pNew: `${TESTRUNID}_pf_pNew`,   // EM-13 add-video target (/participant_videos_mapping)
  pVdel: `${TESTRUNID}_pf_pVdel`, // EM-14 delete-video target (/participant_videos_mapping log)
  pToggle: `${TESTRUNID}_pf_pToggle`, // EM-15 live-toggle target (Update an existing live mapping)
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  p0: `participant-evo+${TESTRUNID}@example.com`,
  pLive: `participant-evo1+${TESTRUNID}@example.com`,
  pDel: `participant-evo2+${TESTRUNID}@example.com`,
  pNew: `participant-evo3+${TESTRUNID}@example.com`,
  pVdel: `participant-evo4+${TESTRUNID}@example.com`,
  pToggle: `participant-evo5+${TESTRUNID}@example.com`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [mk('admin', ['admin'], 'admin')];
  const participants = [
    mk('p0', ['participant'], 'participant'),
    mk('pLive', ['participant'], 'participant'),
    mk('pDel', ['participant'], 'participant'),
    mk('pNew', ['participant'], 'participant'),
    mk('pVdel', ['participant'], 'participant'),
    mk('pToggle', ['participant'], 'participant'),
  ];
  return { staff, operators: [], participants };
}

// The three Evolution-Mapping routes. `participant:true` grants the `participant` role + every seeded
// participant profileid so p0 can mount /participantevolution (and the admin keeps access too).
const ROUTES = [
  { route: '/evolutionmapping', label: 'Evolution Mapping', participant: true },
  { route: '/participant_videos_mapping', label: 'Participant Videos Mapping', participant: true },
  { route: '/participantevolution', label: 'Participant Evolution', participant: true },
];

async function seedEvomap() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). profile_data/{profileid}.name = the email — that is the string the
  //    Name column renders (getProfileMap maps profile_data doc-id -> name) and the spec selects rows by.
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for the three evolution routes (participant-inclusive).
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  const now = () => T.now();
  const daysAgo = (d) => T.fromMillis(Date.now() - d * 86400e3);

  // 3) evolutionmappingvideo catalogue rows. EVERY doc carries deleted:false so the main table's
  //    where('deleted','!=',true) query returns it (Firestore != excludes missing-field docs).
  const evoRef = (id) => db.collection('evolutionmappingvideo').doc(id);
  const mkEvo = (id, pf, title, videourl, urllive, createdDaysAgo) => evoRef(id).set({
    docid: id, profileid: pf, title, videourl,
    recordeddate: daysAgo(createdDaysAgo), created: daysAgo(createdDaysAgo),
    deleted: false, urllive: !!urllive, ...tag,
  });
  // pLive catalogue: two NOT-yet-live rows the admin selects + makes live (EM-05/06).
  await mkEvo(ID.EV_L1, PF.pLive, TITLE.L1, URL.L1, false, 5);
  await mkEvo(ID.EV_L2, PF.pLive, TITLE.L2, URL.L2, false, 4);
  // p0 catalogue: one soft-delete target (EM-04) + two rows backing p0's live videolist (EM-08/09).
  await mkEvo(ID.EV_D1, PF.p0, TITLE.D1, URL.D1, false, 6);
  await mkEvo(ID.EV_P1, PF.p0, TITLE.P1, URL.P1, true, 3);
  await mkEvo(ID.EV_P2, PF.p0, TITLE.P2, URL.P2, true, 2);
  // pDel catalogue: two rows already published live (urllive:true) — deleteVideo flips one to false (EM-07).
  await mkEvo(ID.EV_X1, PF.pDel, TITLE.X1, URL.X1, true, 5);
  await mkEvo(ID.EV_X2, PF.pDel, TITLE.X2, URL.X2, true, 4);
  // p0 catalogue: the EM-03 EDIT target (urllive:false so its Edit FAB is available + it is not "Live").
  // Starts titled E1_BEFORE; the spec edits it to E1_AFTER and asserts the app-stored title.
  await mkEvo(ID.EV_E1, PF.p0, TITLE.E1_BEFORE, URL.E1, false, 7);
  // pToggle catalogue: two rows whose urls back its pre-seeded live videolist (EM-15 toggle-off).
  await mkEvo(ID.EV_T1, PF.pToggle, TITLE.T1, URL.T1, true, 5);
  await mkEvo(ID.EV_T2, PF.pToggle, TITLE.T2, URL.T2, true, 4);

  // 4) liveevolutionmapping precondition docs.
  //    p0: live:true with the two P-urls (the participant view + completion gate, EM-08/09/10).
  await db.collection('liveevolutionmapping').doc(PF.p0).set({
    docid: PF.p0, profileid: PF.p0, title: `EVOM p0 Live ${TESTRUNID}`,
    live: true, videolist: [URL.P1, URL.P2], lastupdated: now(), ...tag,
  });
  //    pDel: live:true with the two X-urls (existing live mapping deleteVideo operates on, EM-07).
  await db.collection('liveevolutionmapping').doc(PF.pDel).set({
    docid: PF.pDel, profileid: PF.pDel, title: `EVOM pDel Live ${TESTRUNID}`,
    live: true, videolist: [URL.X1, URL.X2], lastupdated: now(), ...tag,
  });
  //    pToggle: live:true with the two T-urls — EM-15 opens this in Update mode and toggles Live OFF.
  await db.collection('liveevolutionmapping').doc(PF.pToggle).set({
    docid: PF.pToggle, profileid: PF.pToggle, title: `EVOM pToggle Live ${TESTRUNID}`,
    live: true, videolist: [URL.T1, URL.T2], lastupdated: now(), ...tag,
  });
  //    pLive: NO doc on purpose — EM-05 asserts the app CREATES it with videolist.length == 2 exactly
  //    (makeLive unions into an existing doc, so the asserted count is only clean when none pre-exists).
  await db.collection('liveevolutionmapping').doc(PF.pLive).delete().catch(() => {});

  // 5) participant videos source rows for p0 (the add/edit dialog selector reads delete==false rows).
  //    The add dialog groups by `type`; give each a distinct run-unique type so EM-02 can pick one.
  const pvRef = (id) => db.collection('participant videos').doc(id);
  await pvRef(ID.PV_1).set({
    docid: ID.PV_1, profileid: PF.p0, title: TITLE.PV1, videourl: URL.PV1,
    type: `EVOMInterview ${TESTRUNID}`, recordeddate: daysAgo(10), delete: false,
    uploadedon: now(), uploadedby: PF.admin, remarks: [], ...tag,
  });
  await pvRef(ID.PV_2).set({
    docid: ID.PV_2, profileid: PF.p0, title: TITLE.PV2, videourl: URL.PV2,
    type: `EVOMTestimonial ${TESTRUNID}`, recordeddate: daysAgo(9), delete: false,
    uploadedon: now(), uploadedby: PF.admin, remarks: [], ...tag,
  });
  // PV_N — pNew's sole source video (EM-02 add dialog filters to pNew, picks the Interview type, then this).
  await pvRef(ID.PV_N).set({
    docid: ID.PV_N, profileid: PF.pNew, title: TITLE.PV1, videourl: URL.PV1,
    type: `EVOMInterview ${TESTRUNID}`, recordeddate: daysAgo(10), delete: false,
    uploadedon: now(), uploadedby: PF.admin, remarks: [], ...tag,
  });
  // PV_E — p0's edit source the EM-03 catalogue row (EV_E1) mirrors by title+url (so the edit dialog
  // pre-selects it). E1_BEFORE/URL.E1 are reused as BOTH this source row's title/url AND EV_E1's.
  await pvRef(ID.PV_E).set({
    docid: ID.PV_E, profileid: PF.p0, title: TITLE.E1_BEFORE, videourl: URL.E1,
    type: `EVOMEdit ${TESTRUNID}`, recordeddate: daysAgo(7), delete: false,
    uploadedon: now(), uploadedby: PF.admin, remarks: [], ...tag,
  });
  // EM-14 standalone video for pVdel — NO eventref so loadEventLog renders it as a standalone
  // "video" card with a delete button (type 'Interview' is a real videoTypeKey so the row resolves).
  await pvRef(ID.PV_DEL).set({
    docid: ID.PV_DEL, profileid: PF.pVdel, title: TITLE.PVDEL, videourl: URL.PVDEL,
    type: 'Interview', recordeddate: daysAgo(8), delete: false,
    uploadedon: now(), uploadedby: PF.admin, remarks: [], ...tag,
  });

  // 6) participant metadata rows (the /participant_videos_mapping list + summaryStats source). Three
  //    run-unique rows so the screen renders >= 3 and the stat is a real app-derived number (EM-12).
  const pmRef = (pf) => db.collection('participant metadata').doc(pf);
  await pmRef(PF.p0).set({ docid: PF.p0, profileid: PF.p0, name: `EVOM Meta p0 ${TESTRUNID}`, ...tag });
  await pmRef(PF.pLive).set({ docid: PF.pLive, profileid: PF.pLive, name: `EVOM Meta pLive ${TESTRUNID}`, ...tag });
  await pmRef(PF.pDel).set({ docid: PF.pDel, profileid: PF.pDel, name: `EVOM Meta pDel ${TESTRUNID}`, ...tag });
  // pNew (EM-13 add-video) + pVdel (EM-14 delete-video) — run-unique names so the /participant_videos_mapping
  // Filter Participants search narrows to exactly one row deterministically.
  await pmRef(PF.pNew).set({ docid: PF.pNew, profileid: PF.pNew, name: `EVOM Meta pNew ${TESTRUNID}`, ...tag });
  await pmRef(PF.pVdel).set({ docid: PF.pVdel, profileid: PF.pVdel, name: `EVOM Meta pVdel ${TESTRUNID}`, ...tag });
  await pmRef(PF.pToggle).set({ docid: PF.pToggle, profileid: PF.pToggle, name: `EVOM Meta pToggle ${TESTRUNID}`, ...tag });

  // 7) Participant completion preconditions (Flow 6): queue generation + variation + queue_token.
  const qgenRef = db.collection('queue generation').doc(ID.QGEN);
  await qgenRef.set({
    docid: ID.QGEN, queuename: `EVOM Queue ${TESTRUNID}`, stages: VARIATION_STAGES,
    queueadmin: [PF.admin], queuementor: [], created: now(), modified: now(), ...tag,
  });
  // queue variation the token's variationid points at; the app reads stages[] to compute nextStage.
  await db.collection('queue variation').doc(ID.QVAR).set({
    docid: ID.QVAR, variationname: `EVOM Variation ${TESTRUNID}`, stages: VARIATION_STAGES,
    atcmodel: null, queueref: qgenRef, ...tag,
  });
  // queue_token for p0: Approved + Active at EVO_STAGE so the completion gate renders. queueref is a
  // DocumentReference into queue generation; the participant component matches queueref.id === queueid.
  // This is a PRECONDITION only — the spec asserts the currentstage/stage-log the APP writes on the
  // real "Mark as Completed" click, never these seeded values (anti-circularity).
  await db.collection('queue_token').doc(ID.TOKEN).set({
    docid: ID.TOKEN, profile_id: PF.p0, profileid: PF.p0, profile_name: EMAIL.p0,
    queueref: qgenRef, variationid: ID.QVAR,
    currentstage: EVO_STAGE, previousstage: 'Intro Stage',
    stagestatus: 'Approved', tokenstatus: 'Active', status: 'queued',
    tokennumber: 1, queueposition: 1, delete: false,
    people_involved: [], liveassignmentid: null, manuallymoved: false,
    createdon: now(), logdate: now(), updatedAt: now(), ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, URL, TITLE, EVO_STAGE, NEXT_STAGE, VARIATION_STAGES,
    counts: { evolutionmappingvideo: 10, liveevolutionmapping: 3, participantVideos: 5, participantMetadata: 6, queueToken: 1 },
  };
}

// Collections this seed writes (for teardown). All default-DB.
const SEEDED = [
  'evolutionmappingvideo', 'liveevolutionmapping', 'participant videos', 'participant metadata',
  'queue generation', 'queue variation', 'queue_token', 'queue stage log',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownEvomap() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);

  // NATURAL-KEY cleanup of APP-WRITTEN docs (recon note 3): EM-02 (add-evolution) and EM-13 (add-video)
  // create docs through the real Angular UI, so they carry NO testrunid and the testrunid-scoped sweep
  // above misses them. Delete them by their natural key — the run's profileids — so they don't accumulate
  // across runs on the persistent test project. (The seeded ids are removed by the testrunid sweep; here
  // we additionally remove any extra profileid-matching docs the product wrote.)
  const runProfileIds = Object.values(PF);
  for (const coll of ['evolutionmappingvideo', 'participant videos']) {
    for (const pid of runProfileIds) {
      const snap = await db.collection(coll).where('profileid', '==', pid).get().catch(() => ({ docs: [] }));
      for (const d of snap.docs) await d.ref.delete().catch(() => {});
    }
  }

  // Also delete the Auth users (uids carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = {
  TESTRUNID, ID, PF, EMAIL, URL, TITLE, ROUTES, SEEDED,
  EVO_STAGE, NEXT_STAGE, VARIATION_STAGES, seedEvomap, teardownEvomap,
};

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedEvomap(); console.log('[seed-evomap] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownEvomap(); console.log('[seed-evomap] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-evomap.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
