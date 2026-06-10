#!/usr/bin/env node
/**
 * seed-test-project.js — stand up the sample queue + fake users/data on the dedicated,
 * disposable test project `slabs-queue-e2e-exdcz` (resolved from lib/test-project.js).
 *
 * Adapted from seed-emulator.js, but targets a REAL Firebase project
 * (full complexity: deployed cloud functions, named DBs, real FCM) — NEVER the emulator,
 * NEVER production, NEVER the shared `starlabs-test`. Seeds the exact L3rqCr config
 * (30 stages, 9 variations) from `sample-queue-config.json`, ~50 fake participants
 * distributed across the 9 variations mirroring the real journey×cycle mix
 * (see path-generator.js), plus operators/specialists. All users are `@example.com`.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION (lib/test-project.js allowlist):
 *   - HARD-ABORTS unless the resolved project id is exactly the dedicated test project.
 *   - Denylists prod (`fir-sample-aae4a`), the shared `starlabs-test`, and Watson/Sales-CRM —
 *     they abort even if TEST_PROJECT is (mis)pointed at them.
 *   - ATC collections are denylisted (defence in depth) — never seeded.
 *   - Every doc + Auth user is tagged with a `testrunid` for clean teardown.
 *
 * Auth (no service-account file needs to be hand-supplied):
 *   - Application Default Credentials — run `gcloud auth application-default login` once, OR
 *   - GOOGLE_APPLICATION_CREDENTIALS=/path/to/test-project-sa.json
 *
 * Usage:
 *   node e2e/fixtures/seed-test-project.js --plan            # dry-run: guards + plan, NO creds needed
 *   node e2e/fixtures/seed-test-project.js --seed            # create users + data (needs creds)
 *   node e2e/fixtures/seed-test-project.js --teardown <id>   # delete everything tagged testrunid
 */
'use strict';
const path = require('path');
const { oracle } = require('../lib/flow-model');
const { generatePlan } = require('../lib/path-generator');
const { TEST_PROJECT_ID, assertWritable } = require('../lib/test-project');
const { buildDoc } = require('../lib/fake-data');

// ---------------------------------------------------------------------------
// SAFETY GUARD FIRST (before any Firebase dependency) — refuse cleanly anywhere.
// Allowlist: only the dedicated, disposable test project is writable.
// ---------------------------------------------------------------------------
const TEST_PROJECT = TEST_PROJECT_ID;
const assertNotProduction = assertWritable;

// ATC denylist (the prompt excludes ATC entirely) — never create these collections.
const ATC_DENY = [/\batc\b/i, /atc_/i, /triple ?atc/i, /queue_atc_generation/i, /atc_alpha/i];
const isATC = name => ATC_DENY.some(re => re.test(name));
function assertNoATC(collection) {
  if (isATC(collection)) {
    console.error(`🛑 ABORT: attempted to write ATC collection "${collection}" — denied.`);
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Config + plan (pure — no creds)
// ---------------------------------------------------------------------------
const cfg = require('./sample-queue-config.json');
const QUEUE_ID = process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn'; // the real L3rqCr docid
// SECOND queue: same config, but the test operator (admin) is NOT in its `queueadmin`.
// OP-02b asserts the operator's queue dropdown shows queue 1 and is ABSENT of this one
// (the `queueadmin` not-array / visibility bug, PLAN risk #7). Filtered by `queueadmin
// array-contains profileid` (dynamic-queue-manager-clone.ts:1546) + index §C.
const QUEUE_ID_2 = process.env.QUEUE_ID_2 || 'Z9negVis0OP02bQUEUE2'; // operator-excluded queue
const TOTAL_PARTICIPANTS = Number(process.env.TOTAL_PARTICIPANTS || 50);

// The named-DB id for the two forms collections (delivery forms / formsByClient). The app
// reaches them via getFirestore("firestore-forms") (dynamic-studio.component.ts:758,1652);
// firebase.test.json provisions this database for the test project (schemas.md §0.6).
const FORMS_DB = 'firestore-forms';

// Reference-data doc ids the seeded refs point at. These docs are seeded into the EMULATOR by
// firestore-seed.json; on the CLOUD test project they may not exist, but the app only DEREFS
// the ones it actually reads (a missing ref still stores fine — Firestore refs are just paths).
// Keep these ids in sync with firestore-seed.json so emulator runs resolve the refs (coordinated
// with the emulator seeder, task #13). The `_ph` ids are harmless placeholders never dereferenced.
const REF_IDS = {
  'products': 'prod-test-1',
  'package': 'pkg-test-1',
  'event collection': 'event-test-1',
  'solar voice playlist': 'svp-test-1',
  'journey': 'journey-test-1',
  'eiflix workshop': 'eiflix-ws-ph',          // placeholder — app never derefs in test
  'journeyproductpurchase': 'jpp-ph',
  'salesleads': 'lead-test-1',
  'deliverables': 'delv-test-1',
};

function newTestRunId() {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `tr_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the fake STAFF roster (operators/admins, specialists, BIG providers) for a run.
 * Each carries a profileid for the auth chain (user_data -> profile_data -> users_roles).
 * Exported so the per-variation seed builders (fixtures/variation-seeds/*) seed the SAME
 * staff with the SAME email convention `actors.ts` logs in with — never duplicate this list.
 * @param {string} testrunid
 * @returns {{operators:object[], specialists:object[], bigProviders:object[], staff:object[]}}
 */
function makeStaff(testrunid) {
  const mk = (kind, i, roles) => ({
    uid: `${testrunid}_${kind}_${i}`,
    profileid: `${testrunid}_pf_${kind}_${i}`,
    email: `${kind}${i}+${testrunid}@example.com`,
    role: kind,
    roles, // users_roles booleans to set true
  });
  const operators = [
    { ...mk('admin', 0, ['admin']), email: `admin+${testrunid}@example.com` },
    { ...mk('mentor', 0, ['admin', 'eventcoordinator']), email: `mentor+${testrunid}@example.com` },
  ];
  const specialists = Array.from({ length: 10 }, (_, i) => mk('specialist', i, ['admin', 'changeagent']));
  const bigProviders = Array.from({ length: 4 }, (_, i) => mk('big', i, ['admin', 'eventcoordinator']));
  // EIS-ONLY specialist: holds the `changeagent` EIS role but NONE of developer/admin/ah. Used by the
  // SS-15b negative role-gate test: authGuard ADMITS this actor (the `/arenastudioactivity` dashboard
  // grant includes `changeagent` + every staff profileid), so the NEW roleGuard(['developer','admin','ah'])
  // is provably the gate that denies it. The other seeded specialists carry `admin` and are (correctly)
  // admitted to the monitor, so they cannot demonstrate the denial.
  const eisOnly = Array.from({ length: 1 }, (_, i) => mk('eisonly', i, ['changeagent']));
  const staff = [...operators, ...specialists, ...bigProviders, ...eisOnly];
  return { operators, specialists, bigProviders, eisOnly, staff };
}

/** Build the full seed plan: oracle verdict + per-variation paths + participant roster. */
function planSeed(testrunid) {
  const verdict = oracle(cfg);
  const plan = generatePlan(cfg, TOTAL_PARTICIPANTS);

  const { operators, specialists, bigProviders, staff } = makeStaff(testrunid);

  const participants = [];
  let n = 0;
  for (const v of plan.variations) {
    for (let k = 0; k < v.participants; k++) {
      const idx = n++;
      participants.push({
        uid: `${testrunid}_p_${idx}`,
        profileid: `${testrunid}_profile_${idx}`,
        email: `participant${idx}+${testrunid}@example.com`,
        variationid: v.id,
        variationname: v.variationname,
        firststage: v.backbone[0] || cfg.stages[0],
      });
    }
  }
  return { verdict, plan, operators, specialists, bigProviders, staff, participants };
}

// Routes the e2e drives in the real Angular app, each needs a `dashboard` route-config doc
// granting access (by role and by the staff profileids). cleanUrl = '/' + path.
const DRIVEN_ROUTES = [
  { route: '/dynamicqueuemanager', label: 'Queue Manager' },
  { route: '/queuebigplanner', label: 'Queue BIG Planner' },
  { route: '/dynamicstudio', label: 'Dynamic Studio' },
  { route: '/arenastudioactivity', label: 'Arena Studio Activity' },
  { route: '/big-dashboard', label: 'BIG Dashboard' },
  { route: '/particiant_assignment_board', label: 'Participant Assignment Board' },
  { route: '/bigcohorts', label: 'BIG Cohorts' },
  { route: '/EISDashboard', label: 'EIS Dashboard' },
  // Every other screen a spec navigates to. The authGuard matches by the FIRST path segment only
  // ('/' + state.url.split('?')[0].split('/')[1], auth.guard.ts:35), so dynamic routes like /joinroom/:id
  // are granted by their base '/joinroom', and the queue-creation-v3 authoring STEPPER is a dialog within
  // /queuelist (no own route). Without a `dashboard` doc per screen the guard shows "No roles or profiles
  // configured for screen: X" and redirects to root — this was the root cause of OP-02 and most BIG cases.
  { route: '/queuelist', label: 'Queue List' },
  { route: '/manualassignment', label: 'Manual Assignment' },
  { route: '/formbasedsubmission', label: 'Form Based Submission' },
  { route: '/validateParticipantAssignments', label: 'Validate Participant Assignments' },
  { route: '/bigactivity', label: 'BIG Activity' },
  { route: '/biglevel', label: 'BIG Level' },
  { route: '/modellevelconfig', label: 'ATC Model Level Config' },
  { route: '/arena_space', label: 'Arena Space' },
  { route: '/big_aggregate', label: 'BIG Aggregate' },
  { route: '/bigaggregateeventlevel', label: 'BIG Aggregate Event Level' },
  { route: '/bigactivitymonitor', label: 'BIG Activity Monitor' },
  { route: '/bigactivitylog', label: 'BIG Activity Log' },
  { route: '/bigProfile', label: 'BIG Profile' },
  { route: '/zoommeeting_bigparticipants', label: 'Zoom Meeting (BIG)' },
  { route: '/joinroom', label: 'Join Room (OpenVidu)' },
  { route: '/web-studio-invitation', label: 'Web Studio Invitation' },
  // /queue-web (QueueWebVersion1Component, app.routes.ts:319) is the PARTICIPANT landing route
  // (LANDING_ROUTES.bigParticipant) that hosts the <app-web-studio-invitation> accept/deny overlay
  // (studio SS-05/06/08). It is the ONLY driven participant screen with no dashboard grant — the
  // authGuard resolves its allowed roles/profileids from `dashboard` (routeConfig('/queue-web'),
  // authguard.service.ts) and, with NO doc, returns EMPTY roles+profiles → denies every seeded
  // participant and the overlay never mounts. The other DRIVEN_ROUTES are STAFF screens, so they are
  // granted to staff roles+profileids only; this one carries `participant: true` so the seedAuthChain
  // dashboard loop ALSO grants the `participant` role + every seeded participant's profileid. (Makes
  // web-invitation.page.ts ensureQueueWebRouteGrant() an idempotent no-op — the grant is now native.)
  { route: '/queue-web', label: 'Queue Web', participant: true },
];

// ---------------------------------------------------------------------------
// --plan : print guards + plan, NO credentials required
// ---------------------------------------------------------------------------
function runPlan() {
  console.log('── seed plan (dry-run, no writes) ──────────────────────────────');
  console.log(`target project : ${TEST_PROJECT}`);
  assertNotProduction(TEST_PROJECT);
  console.log('prod guard     : ✓ passed (not production)');

  const testrunid = process.env.TESTRUNID || newTestRunId();
  const { verdict, plan, operators, specialists, participants } = planSeed(testrunid);

  console.log(`testrunid      : ${testrunid}`);
  console.log(`queue          : ${QUEUE_ID}  (${cfg.stages.length} stages, ${cfg.queuevariation.length} variations)`);
  console.log('\nstatic oracle  :', verdict.ok ? '✓ clean' : '⚠ issues (matches validated spec §8):');
  verdict.issues.forEach(i => console.log('   •', i));
  console.log('\nusers          :', `${operators.length} operators, ${specialists.length} specialists, ${participants.length} participants`);
  console.log('coverage       :', `${plan.summary.coveredEdges}/${plan.summary.totalEdges} edges, ${plan.summary.totalPaths} paths`);
  console.log('\ndistribution (mirrors production journey×cycle mix):');
  plan.variations.forEach(v => console.log(
    `   ${String(v.participants).padStart(2)}p · ${v.variationname.padEnd(22)} edges ${v.covered}/${v.edgeCount}`,
  ));

  // Collections the --seed pass writes (the full no-scopecut feature surface). Grouped by DB.
  const studioCohort = Math.min(3, participants.length);
  console.log('\ncollections    : (default DB)');
  console.log('   queue generation×2 (queue 1 + operator-excluded queue 2 for OP-02b)');
  console.log(`   queue variation×${cfg.queuevariation.length + 1}, queue_token×${participants.length}, queue planning×${cfg.queuevariation.length}`);
  console.log('   profile_data, participantjourneyproduct, participantsproduct (per participant)');
  console.log(`   participant mode checklist×${participants.length}, participantvideoask×${participants.length}`);
  console.log(`   queue studio pairing×1, studioinvitation×${studioCohort}, live assignment×${studioCohort}, arena participant×${studioCohort}`);
  console.log('   modes×5, journey×1, arenavideoask×1');
  console.log('   delivery forms×1 (default-DB, BIG-06), big participants assignments×1 (default-DB, BIG-06)');
  console.log('   user_data, users_roles, dashboard (staff auth chain + route grants)');
  console.log('                 (firestore-forms named DB)');
  console.log('   delivery forms×1, formsByClient×2  (SS-07 positive lower-bound, forms half)');
  console.log('   NOTE: NO ATC collections — firestore-atc is off-limits & not provisioned (SS-07 ATC reads 0 by design).');

  console.log('\nnext: `--seed` (needs ADC or GOOGLE_APPLICATION_CREDENTIALS for', TEST_PROJECT + ')');
  console.log('────────────────────────────────────────────────────────────────');
}

// ---------------------------------------------------------------------------
// Lazy Firebase Admin init (only when actually writing)
// ---------------------------------------------------------------------------
function initAdmin() {
  assertNotProduction(TEST_PROJECT);
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    // Uses ADC or GOOGLE_APPLICATION_CREDENTIALS; projectId pins the target explicitly.
    admin.initializeApp({ projectId: TEST_PROJECT });
  }
  const resolved = admin.app().options.projectId || TEST_PROJECT;
  assertNotProduction(resolved); // belt-and-suspenders after init
  return admin;
}

const TAG = testrunid => ({ testrunid, _testdata: true });

/** Stable doc-id for the queue-generation doc of a run (the variation builders share this). */
const queueGenDocId = testrunid => `${testrunid}_${QUEUE_ID}`;
/** Stable doc-id for the SECOND (operator-excluded) queue's generation doc. */
const queueGenDocId2 = testrunid => `${testrunid}_${QUEUE_ID_2}`;
/** Stable doc-id for a queue_token, keyed by participant profileid. */
const tokenDocId = (testrunid, profileid) => `${testrunid}_tok_${profileid}`;
/** Stable doc-id for the run's single `arena events` doc (B!G Planner onQueueSelect 'in' query). */
const arenaEventDocId = testrunid => `${testrunid}_arenaevt_0`;
// BIG-core world (big-core BIG-03/04 + watch-videos) stable doc-ids. The PAB the big-core specs drive
// logs in as the index-1 BIG provider (run1_pf_big_1; big-core.spec.ts PAB_ADMIN_INDEX = 1), so the
// big participants assignments are owned by that profileid. Ids are run-namespaced + distinct from the
// analytics-spec BIG world (fixtures/big-seed.ts uses `_bigm_0`/`_biga_0`/`_bigp_*`), so the two worlds
// coexist on a shared emulator without colliding.
const BIG_CORE_ADMIN_INDEX = 1;
const bigCoreAdminProfileId = testrunid => `${testrunid}_pf_big_${BIG_CORE_ADMIN_INDEX}`;
const bigCoreMarathonId = testrunid => `${testrunid}_bigcore_marathon_0`;

/**
 * Deep-clone `sample-queue-config.json`'s `stageproperty` and remap every
 * `stageproperty[*].nextstage[*].variations` entry from the RAW sample-config variation id
 * (e.g. 'K9PRd4PfWDWtaO0vSxy3') to the PREFIXED seeded-doc form (`${testrunid}_<rawId>`) — the SAME
 * `${testrunid}_` prefix the `queue variation` docs get (seedQueueAndVariations below).
 *
 * WHY: the dynamic-studio move-next button (dynamic-studio.html:527) renders only when BOTH
 * `queueVariation[token.variationid].includes(stage)` (queueVariation is keyed by the PREFIXED variation
 * DOC id — onStudioSelect/onQueueSelect ts:382) AND `config.variations.includes(token.variationid)`
 * (config = this seeded stageproperty's nextstage). With raw ids in `variations` those two key-spaces
 * never intersect, so the button can't render (studio SS-12/SS-13). Aligning the seeded queue's
 * nextstage `variations` to the prefixed ids closes the gap.
 *
 * SAFE: returns a DEEP CLONE — the in-memory `cfg.stageproperty` (which flow-model.js / path-generator.js
 * / the oracle read against the RAW `cfg.queuevariation[*].id`) is NEVER mutated. The operator board does
 * NOT read nextstage `variations` (it moves via columns), so the remap is invisible to it.
 * @param {object} stageproperty cfg.stageproperty
 * @param {string} testrunid
 * @returns {object} a remapped deep clone
 */
function remapStagePropertyVariations(stageproperty, testrunid) {
  const clone = JSON.parse(JSON.stringify(stageproperty));
  for (const stage of Object.keys(clone)) {
    const nextstage = clone[stage] && clone[stage].nextstage;
    if (!Array.isArray(nextstage)) continue;
    for (const btn of nextstage) {
      if (Array.isArray(btn.variations)) {
        btn.variations = btn.variations.map(rawId => `${testrunid}_${rawId}`);
      }
    }
  }
  return clone;
}

/**
 * The firestore-forms named-DB handle. Memoized per process. Uses the MODULAR
 * `getFirestore(app, databaseId)` (firebase-admin/firestore, ≥11.x) — the namespaced
 * `admin.firestore()` does NOT take a databaseId, so a named DB is only reachable via the
 * modular accessor. App reaches the same DB via getFirestore("firestore-forms") in-app (§0.6).
 */
let _formsDb = null;
function getFormsDb(admin) {
  if (!_formsDb) {
    const { getFirestore } = require('firebase-admin/firestore');
    _formsDb = getFirestore(admin.app(), FORMS_DB);
  }
  return _formsDb;
}

/**
 * Build the generator `ctx` the fake-data.buildDoc factory consumes. Wires the §0 invariant
 * helpers: queueref-as-ref (default DB), queueref-as-ref (firestore-forms DB), token refs in
 * both DBs, and `refFor` → reference-data ids (REF_IDS). The seeder spreads collection-specific
 * fields (docid, profileid, …) onto the returned object before calling buildDoc.
 * @param {object} admin firebase-admin
 * @param {object} db    admin.firestore() (default DB)
 * @param {string} testrunid
 * @param {string} [queueDocId] the queue this doc is scoped to (defaults to queue 1)
 */
function makeCtx(admin, db, testrunid, queueDocId) {
  const T = admin.firestore.Timestamp;
  const qid = queueDocId || queueGenDocId(testrunid);
  const formsDb = getFormsDb(admin);
  return {
    testrunid,
    queueDocId: qid,
    now: () => T.now(),
    future: () => T.fromMillis(Date.now() + 30 * 86400e3),
    past: () => T.fromMillis(Date.now() - 7 * 86400e3),
    geopoint: () => new admin.firestore.GeoPoint(0, 0),
    // queueref §0.2 — a DocumentReference into `queue generation` (default DB).
    queueGenRef: (q) => db.collection('queue generation').doc(q || qid),
    // formsByClient.queueref is a ref created with the firestore-forms handle (named-DB caveat).
    queueGenRefForms: (q) => formsDb.collection('queue generation').doc(q || qid),
    tokenRef: (tok) => db.collection('queue_token').doc(tok),
    tokenRefForms: (tok) => formsDb.collection('queue_token').doc(tok),
    // out-of-scope reference collections → seeded ids (REF_IDS) or a harmless placeholder.
    refFor: (col) => db.collection(col).doc(REF_IDS[col] || `${col.replace(/\W+/g, '_')}_ph`),
  };
}

/**
 * Seed the STAFF auth chain (Auth user + user_data + profile_data + users_roles) and the
 * `dashboard` route-config so staff can log in and pass the route guard. Idempotent.
 * Reused verbatim by the per-variation seed builders so their specs can `loginAs` the SAME
 * operator/specialist/BIG emails `actors.ts` expects. Participants get only an Auth user here
 * (their profile_data/token are written per-token by `seedParticipantToken`).
 * @param {object} db   admin.firestore()
 * @param {object} auth admin.auth()
 * @param {string} testrunid
 * @param {{staff:object[], operators:object[], participants?:object[]}} roster
 */
async function seedAuthChain(db, auth, testrunid, roster) {
  const { staff, participants = [] } = roster;

  // Auth users for everyone (staff + any participants), all @example.com, tagged.
  for (const u of [...staff, ...participants]) {
    await auth.createUser({ uid: u.uid, email: u.email, password: 'Test!1234', displayName: u.email })
      .catch(async e => { if (e.code === 'auth/uid-already-exists') return; throw e; });
    await auth.setCustomUserClaims(u.uid, { testrunid, role: u.role || 'participant' });
  }

  // AUTH CHAIN for STAFF: user_data/{uid} <- profile_data.user_ref ; profile_data.role_ref -> users_roles/{id}
  // (login needs profile_data by email + non-null number + valid role_ref; guard needs roles/profileid)
  for (const s of staff) {
    const roleId = `${testrunid}_role_${s.uid}`;
    const userDataRef = db.collection('user_data').doc(s.uid);
    const profileRef = db.collection('profile_data').doc(s.profileid);
    const roleRef = db.collection('users_roles').doc(roleId);
    await userDataRef.set({ name: s.email, email: s.email, number: '9999900000', ...TAG(testrunid) });
    const roleFlags = {}; (s.roles || ['admin']).forEach(r => { roleFlags[r] = true; });
    await roleRef.set({ id: roleId, name: s.email, participant: false, profile_ref: profileRef, ...roleFlags, ...TAG(testrunid) });
    await profileRef.set({
      profileid: s.profileid, email: s.email.toLowerCase(), name: s.email,
      number: '9999900000', countrycode: '+91',
      user_ref: userDataRef, role_ref: roleRef, ...TAG(testrunid),
    });
  }

  // AUTH CHAIN for PARTICIPANTS (participant-ONLY role) so they can LOG IN and then be correctly DENIED
  // the management screens (big-core BIG-00b / BIG-05). WHY the FULL chain (not just role_ref):
  //   • login.component.ts:157 derefs profileDocData['role_ref']['path'] → TypeError on an absent role_ref
  //     ⇒ participant stranded on /login (realLogin's waitForURL times out).
  //   • authguard.getRoles() (authguard.service.ts:311) resolves the logged-in profile by
  //     where('user_ref','==', user_data/{uid}); with NO user_ref it returns undefined, and auth.guard.ts:38
  //     `Object.keys(currentRoles)` THROWS → the catch REDIRECTS to /EISDashboard (auth.guard.ts:82-88) —
  //     NOT the "Access denied" ConfirmComponent dialog BIG-00b asserts. So profile_data MUST carry user_ref
  //     → user_data/{uid} so getRoles resolves a participant-only role; then hasAccess is false on a BIG
  //     route (no staff role, profileid not granted) → the clean "Access denied" dialog (auth.guard.ts:64).
  // Roles are participant-only (no BIG/staff flag) so the data-driven guard still DENIES BIG routes.
  for (const p of participants) {
    if (!p.uid) continue; // need the Auth uid for the user_ref ↔ user_data link
    const roleId = `${testrunid}_role_${p.uid}`;
    const userDataRef = db.collection('user_data').doc(p.uid);
    const profileRef = db.collection('profile_data').doc(p.profileid);
    const roleRef = db.collection('users_roles').doc(roleId);
    await userDataRef.set({ name: p.email, email: p.email, number: '9999900000', ...TAG(testrunid) });
    await roleRef.set({ id: roleId, name: p.email, participant: true, profile_ref: profileRef, ...TAG(testrunid) });
    await profileRef.set({
      docid: p.profileid, profileid: p.profileid, email: p.email.toLowerCase(), name: p.email,
      number: '9999900000', countrycode: '+91',
      user_ref: userDataRef, role_ref: roleRef, ...TAG(testrunid),
    });
  }

  // dashboard route-config: grant every driven route to the staff roles + profileids.
  const staffProfileIds = staff.map(s => s.profileid);
  const allRoles = [...new Set(staff.flatMap(s => s.roles || ['admin']))];
  // Participant landing routes (those flagged `participant:true`, e.g. /queue-web) ALSO grant the
  // `participant` role + every seeded participant's profileid — otherwise authGuard denies the seeded
  // participants that screen and its overlay never mounts (studio SS-05/06/08). Staff screens keep the
  // staff-only grant so the BIG-00b/BIG-05 deny assertions on management routes still hold.
  const participantProfileIds = participants.map(p => p.profileid).filter(Boolean);
  for (const r of DRIVEN_ROUTES) {
    const roles = r.participant ? [...new Set([...allRoles, 'participant'])] : allRoles;
    const profileid = r.participant ? [...staffProfileIds, ...participantProfileIds] : staffProfileIds;
    await db.collection('dashboard').doc(`${testrunid}_dash_${r.route.replace(/\W+/g, '_')}`).set({
      route: r.route, label: r.label, roles, profileid,
      showInSidenav: true, order: 0, children: [], ...TAG(testrunid),
    });
  }
}

/**
 * Seed `queue generation` + the requested `queue variation` docs (exact L3rqCr config from
 * sample-queue-config.json). Two-pass so the queue's `queuevariation` ref-array resolves.
 * Reused by the per-variation builders, which pass only the ONE variation id they exercise
 * (the board fetches a token's variation by `getDoc(doc('queue variation', token.variationid))`,
 * so only that variation's doc must exist for the spec under test). Idempotent.
 * @param {object} db admin.firestore()
 * @param {object} admin firebase-admin (for Timestamp)
 * @param {string} testrunid
 * @param {object} operators makeStaff().operators (for queueadmin/queuementor profileids)
 * @param {{variationIds?:string[]}} [opts] subset of variation ids to seed (default: all 9)
 * @returns {{queueGenRef:object, varRefs:object[]}}
 */
async function seedQueueAndVariations(db, admin, testrunid, operators, opts = {}) {
  const T = admin.firestore.Timestamp;
  const ts = () => T.now();
  const past = T.fromMillis(Date.now() - 7 * 86400e3);   // queue already started
  const future = T.fromMillis(Date.now() + 30 * 86400e3); // registration/end open

  const wanted = opts.variationIds
    ? cfg.queuevariation.filter(v => opts.variationIds.includes(v.id))
    : cfg.queuevariation;

  const queueGenRef = db.collection('queue generation').doc(queueGenDocId(testrunid));
  const varRefs = [];
  for (const v of wanted) {
    const vref = db.collection('queue variation').doc(`${testrunid}_${v.id}`);
    // board queries `queue variation` by queueref (dynamic-queue-manager-clone.ts:1814)
    // every app doc stores its own id as `docid` (app-wide convention) — required by the board
    await vref.set({ docid: vref.id, variationname: v.variationname, stages: v.stages, atcmodel: null, queueref: queueGenRef, ...TAG(testrunid) });
    varRefs.push(vref);
  }
  // One `arena events` doc the B!G Planner's onQueueSelect 'in' query needs (see queue gen
  // arenaeventidlist below). productref is a DocumentReference (the planner reads `.productref.id`).
  const arenaEventId = arenaEventDocId(testrunid);
  await db.collection('arena events').doc(arenaEventId).set({
    docid: arenaEventId, productref: db.collection('products').doc(REF_IDS['products']),
    name: `TEST Arena Event ${testrunid}`, ...TAG(testrunid),
  });
  await queueGenRef.set({
    docid: queueGenDocId(testrunid),
    queuename: `TEST ${cfg.stages.length}-stage L3rqCr`,
    // queueadmin/queuementor hold PROFILEIDs, NOT auth uids: the board filters non-admins by
    // `this.profileid = roles.profile_ref.id` (:1531) via `array-contains` (:1546), and the prod
    // creation form stores `profile.id == profile_ref.id` into both fields (queue-creation-v3 html:62/44).
    queueadmin: operators.filter(o => o.role === 'admin').map(o => o.profileid),
    queuementor: operators.filter(o => o.role === 'mentor').map(o => o.profileid),
    stages: cfg.stages,
    // stageproperty with nextstage `variations` remapped to the PREFIXED variation-doc ids so the studio
    // move-next button can render (studio SS-12/SS-13); deep clone — cfg.stageproperty is left untouched.
    stageproperty: remapStagePropertyVariations(cfg.stageproperty, testrunid),
    queuevariation: varRefs,
    // arenaeventidlist MUST be a NON-EMPTY array of `arena events` docids: BigPlannerComponent.onQueueSelect
    // (big-planner.component.ts:376) runs where('docid','in', selectedQueue['arenaeventidlist']); undefined
    // or [] throws "non-empty array required for in filters" and aborts the queue_token stream subscription
    // that computes completedToken/stageTokenMap (OP-12). The operator board does NOT read it (0 refs).
    arenaeventidlist: [arenaEventId],
    // eventid MUST be a NON-EMPTY string: BigPlannerComponent's queue subscribe reads
    // selectedEvent = selectedQueue['eventid'] then calls doc(firestore,'event collection', selectedEvent)
    // UNCONDITIONALLY (big-planner.component.ts:226-228). With eventid absent, selectedEvent is undefined and
    // ResourcePath.fromString throws "Cannot read properties of undefined (reading 'indexOf')" — the exact
    // pageerror that fails OP-12's console guard and leaves completedToken/stageTokenMap at 0. Production
    // queues always carry an eventid; we point it at the run's seeded `arena events` doc id (a real,
    // non-empty string) so the planner's queue_token stream computes. (The downstream `big cohorts`
    // collectionData at :229 just returns empty and is handled — no further read of this id is asserted.)
    eventid: arenaEventId,
    zoomlinkrequired: true,
    iscommunicationsdisabled: true, // externals stubbed — no real comms in test
    queuestartdate: past, queueenddate: future, lastregistrationdate: future,
    created: ts(), modified: ts(),
    ...TAG(testrunid),
  });
  return { queueGenRef, varRefs };
}

/**
 * Seed ONE participant's preconditions at a given stage: profile_data + participantjourneyproduct
 * + participantsproduct + queue_token. The token is the heart of the board (currentstage bucketing).
 * This is a PRECONDITION write only — specs assert the value the APP/CF computes after a move,
 * never this seeded value (anti-circularity). Idempotent (overwrites by deterministic doc ids).
 * @param {object} db admin.firestore()
 * @param {object} admin firebase-admin (for Timestamp)
 * @param {string} testrunid
 * @param {object} p {profileid, email, variationid, stage, queueposition}
 * @param {object} queueRef the `queue generation` DocumentReference (queueref §0.2)
 * @returns {string} the queue_token doc id
 */
async function seedParticipantToken(db, admin, testrunid, p, queueRef) {
  const ts = () => admin.firestore.Timestamp.now();
  // profile_data merged (NOT overwritten) so the participant auth chain seedAuthChain wrote
  // (role_ref + user_ref — the bits login.component.ts:157 / authguard.getRoles need) is preserved.
  // seedAuthChain runs FIRST (runSeed + _common.ts both call it before the token loop), so a plain
  // set() here would clobber role_ref and strand the participant on /login (BIG-00b / BIG-05).
  await db.collection('profile_data').doc(p.profileid).set({
    docid: p.profileid, profileid: p.profileid, email: p.email, name: p.email,
    number: '9999900000', countrycode: '+91', ...TAG(testrunid),
  }, { merge: true });
  await db.collection('participantjourneyproduct').doc(`${testrunid}_pjp_${p.profileid}`).set({
    profileid: p.profileid, journeyref: null, purchasedate: ts(), ...TAG(testrunid),
  });
  await db.collection('participantsproduct').doc(`${testrunid}_pp_${p.profileid}`).set({
    profileid: p.profileid, mode: null, ...TAG(testrunid),
  });
  const id = tokenDocId(testrunid, p.profileid);
  // VARIATION-ID NAMESPACE (§0.4): the token's `variationid` MUST equal the `queue variation` DOC id,
  // which seedQueueAndVariations writes PREFIXED as `${testrunid}_${rawId}` (line ~425). The board keys
  // `mapVariation[document.id]` (dynamic-queue-manager-clone.ts:1817) and scopes a token's move-dropdown
  // via `mapVariation[token.variationid]` (checkAvailablestages:2784); the studio keys `queueVariation[doc.id]`
  // (dynamic-studio.ts:383) and gates its move-next button on BOTH `queueVariation[token.variationid]` AND
  // `config.variations.includes(token.variationid)` (dynamic-studio.html:527, config.variations = the
  // PREFIXED nextstage.variations remapStagePropertyVariations:263 writes). With a RAW token.variationid
  // every one of those lookups MISSES → the board falls back to the full 30-stage queue list (:2788) and
  // the studio move-next button never renders. So we write the PREFIXED form here (the single source for
  // seed-emulator.js:108 + _common.ts:136 + the per-variation builders, which all funnel through here).
  // The flow-model ORACLE keeps reading the RAW `cfg.queuevariation[*].id`, so callers must continue to
  // pass the RAW id into outEdgesForVariation/assertions — only this live token FIELD becomes prefixed.
  const tokenVariationId = p.variationid && !String(p.variationid).startsWith(`${testrunid}_`)
    ? `${testrunid}_${p.variationid}`   // raw → prefixed (the common case: callers pass the raw cfg id)
    : p.variationid;                    // already prefixed (idempotent: never double-prefix)
  // queue_token = participant state; seeded at `p.stage` (the variation's first stage). The CF/app
  // advances it; the spec reads the resulting currentstage/stage-log — never this seeded value.
  await db.collection('queue_token').doc(id).set({
    docid: id,
    // BOTH profile_id (board) AND profileid (some CFs read afterData['profileid'] inconsistently —
    // cf.md §1 GOTCHA, e.g. onQueueStageChange); seeding both removes that documented foot-gun so a
    // CF reading profileid gets the same value the board reads from profile_id.
    profile_id: p.profileid, profileid: p.profileid, profile_name: p.email, queueref: queueRef, variationid: tokenVariationId,
    currentstage: p.stage, previousstage: null, status: 'queued', stagestatus: 'Yet to Start',
    tokenstatus: 'Active', tokennumber: p.queueposition, delete: false, // board counts tokenstatus==='Active' & !delete
    queueposition: p.queueposition, people_involved: [],
    liveassignmentid: null, manuallymoved: false,
    createdon: ts(), logdate: ts(), updatedAt: ts(), ...TAG(testrunid),
  });
  return id;
}

// ---------------------------------------------------------------------------
// Feature-collection seeders (the no-scopecut expansion). Each builds its body via
// fake-data.buildDoc(collection, ctx) so the field SHAPE is owned in ONE place (lib/fake-data.js)
// and the emulator seeder mirrors it exactly (coordination, task #13). All idempotent: written
// at deterministic doc ids and tagged with testrunid/_testdata for teardown.
// ---------------------------------------------------------------------------

/**
 * Reference data with NO per-participant dependency: `journey`, `modes`, `arenavideoask`,
 * `delivery forms` (named DB). Seeded once per run, tagged for teardown. `delivery forms`
 * templates are referenced by `formsByClient.formid` (the SS-07 forms fixture) and by stage
 * `actionresource` refs; `modes` drives the ordered mode list; `arenavideoask` is the Video-Ask
 * question template (orderBy('title')). ALSO seeds the BIG-06 default-db preconditions (a `delivery forms`
 * template + a `big participants assignments` row — both in the DEFAULT db, see inline note). Returns the
 * ids other seeders reference.
 * @returns {{deliveryFormId:string, arenaVideoAskId:string, bigCoreFormId:string, bigCorePaId:string}}
 */
async function seedReferenceData(db, admin, testrunid) {
  const ctx = makeCtx(admin, db, testrunid);
  const formsDb = getFormsDb(admin);

  // modes — the 5 production modes, ordered (sequence REQUIRED for orderBy).
  const MODES = ['Priority', 'Event Mode', 'Installation Event', 'Big', 'Investment'];
  for (let i = 0; i < MODES.length; i++) {
    const docid = `${testrunid}_mode_${i}`;
    await db.collection('modes').doc(docid).set(buildDoc('modes', { ...ctx, docid, mode: MODES[i], sequence: i + 1 }));
  }

  // journey — one catalog entry (uses `id`, not `docid`); participantjourneyproduct.journeyref → here.
  const journeyId = `${testrunid}_journey_0`;
  await db.collection('journey').doc(journeyId).set(buildDoc('journey', {
    ...ctx, id: journeyId, journey: 'TEST Journey', sequence: 1, originalfee: 1000,
  }));

  // arenavideoask — one Video-Ask question template (the "Video Ask" stage actionresource).
  const arenaVideoAskId = `${testrunid}_ava_0`;
  await db.collection('arenavideoask').doc(arenaVideoAskId).set(buildDoc('arenavideoask', {
    ...ctx, docid: arenaVideoAskId, title: `TEST Video Ask ${testrunid}`,
  }));

  // delivery forms — one FORM TEMPLATE in the named DB. Referenced by formsByClient.formid.
  const deliveryFormId = `${testrunid}_form_0`;
  await formsDb.collection('delivery forms').doc(deliveryFormId).set(buildDoc('delivery forms', {
    ...ctx, docid: deliveryFormId, formname: `TEST Delivery Form ${testrunid}`,
  }));

  // AWS_System/instance_status — the SINGLETON infra-status doc InstanceStatusService.getStatus()
  // reads (docData('AWS_System/instance_status'), instance-status.service.ts:65). The /joinroom
  // prejoin gate (join-openvidu-call.component.ts checkServer ts:190-214) only calls
  // prepareParticipant() (→ renders the prejoin container) when master.state=='running' &&
  // media.instanceStates.healthy>0; without this doc it never resolves and SS-11b times out.
  // FIXED doc path (not run-namespaced) — a Firestore doc, not an HTTP CF, so a page.route stub
  // cannot supply it. Tagged + idempotent; content is identical across runs (healthy single state).
  await db.collection('AWS_System').doc('instance_status').set({
    master: { state: 'running' },
    media: { instanceStates: { healthy: 1, unhealthy: 0, pending: 0, terminating: 0, total: 1 } },
    lastUpdated: ctx.now(), ...TAG(testrunid),
  }, { merge: true });

  // BIG-06 (FormBasedSubmissionComponent, route /formbasedsubmission) PRECONDITIONS — both in the DEFAULT
  // db (`this.afs`), NOT firestore-forms. The legacy screen reads BOTH unconditionally in ngAfterViewInit:
  //   • getDoc(doc(afs,'delivery forms', queryParams.id))           (form-based-submission.component.ts:170)
  //       → snap.data().formarray drives the dynamic-control builder (:177-198) and flips showcontent=true
  //         (host becomes visible, [data-testid=form-submit] renders). A MISSING template throws
  //         "Cannot read properties of undefined (reading 'formarray')".
  //   • getDoc(doc(afs,'big participants assignments', participantAssignmentId)) (:164-166)
  //       → res.data()['status']; a MISSING doc throws "...(reading 'status')".
  // The existing firestore-forms `delivery forms` seed above does NOT satisfy the FIRST read (wrong DB), so
  // we seed a DEFAULT-db template here. Ids match the BIG-06 spec's pre-wired drive
  // (/formbasedsubmission?id=run1_bigform_0&participantAssignmentId=run1_bigpa_form_0); with TESTRUNID=run1
  // these resolve to run1_bigform_0 / run1_bigpa_form_0. Tagged + idempotent.
  const bigCoreFormId = `${testrunid}_bigform_0`;
  await db.collection('delivery forms').doc(bigCoreFormId).set(buildDoc('delivery forms', {
    ...ctx, docid: bigCoreFormId, formname: `TEST BIG-06 Form ${testrunid}`,
    // explicit non-empty formarray (one plain text field) so the control-builder loop runs and showcontent flips.
    formarray: [{ fieldname: 'Notes', type: 'text', required: false, options: [], array: [] }],
  }));
  // `big participants assignments` row the screen reads by participantAssignmentId. Field shape mirrors the
  // BIG fixture convention (big-seed.ts:290): docid + status + assignmenttype + profileid + the *ref fields.
  // profileid → the SAME index-1 BIG admin the PAB specs log in as (bigCoreAdminProfileId == _pf_big_1).
  // marathonref MUST point at a SEEDED `big marathon` (NOT the wrong `marathon` collection, and NOT a
  // never-seeded doc): the PAB's getPendingList does `marathonMap[bpa.marathonref.id].pending++` with NO
  // existence guard (participant-assignment-board.component.ts:305), and marathonMap is keyed ONLY by
  // seeded `big marathon` doc ids (ts:134-142). A marathonref into an unseeded/wrong collection => the
  // lookup is undefined => "Cannot read properties of undefined (reading 'pending')" crash on PAB mount
  // for this admin. Pointing it at the seeded BIG-core marathon (seedBigCoreWorld below) makes the lookup
  // resolve and lets the index-1 PAB mount with a real, non-zero pending badge. assignmentref/cohortsref
  // are harmless placeholders (the FormBasedSubmission screen reads only `status` off this doc).
  const bigCorePaId = `${testrunid}_bigpa_form_0`;
  await db.collection('big participants assignments').doc(bigCorePaId).set({
    docid: bigCorePaId, status: 'ongoing', assignmenttype: 'Form', profileid: bigCoreAdminProfileId(testrunid),
    assignmentref: db.collection('big assignment').doc(`${testrunid}_bigassign_ph`),
    cohortsref: db.collection('big cohorts').doc(`${testrunid}_bigcohort_ph`),
    marathonref: db.collection('big marathon').doc(bigCoreMarathonId(testrunid)),
    ...TAG(testrunid),
  });

  return { deliveryFormId, arenaVideoAskId, bigCoreFormId, bigCorePaId };
}

/**
 * Per-participant feature docs: `participant mode checklist`, `participantvideoask`, and a
 * minimal `queue planning` row for the participant's variation. Preconditions only.
 * @param {object} p {profileid, variationid}
 * @param {{arenaVideoAskId:string}} ref ids from seedReferenceData
 */
async function seedParticipantFeatureDocs(db, admin, testrunid, p, ref) {
  const ctx = makeCtx(admin, db, testrunid);

  const checklistId = `${testrunid}_pmc_${p.profileid}`;
  await db.collection('participant mode checklist').doc(checklistId).set(buildDoc('participant mode checklist', {
    ...ctx, docid: checklistId, profileid: p.profileid, mode: 'Event Mode',
  }));

  const videoAskId = `${testrunid}_pva_${p.profileid}`;
  await db.collection('participantvideoask').doc(videoAskId).set(buildDoc('participantvideoask', {
    ...ctx, docid: videoAskId, profileid: p.profileid, videoaskid: ref.arenaVideoAskId,
  }));
}

/**
 * One `queue planning` row per variation under test (slot/segment plan). Most variations don't
 * need it (only stages with planned slots read it), so we seed it minimally per variation id so
 * the doc exists if a spec dereferences a `queueplanid`. Idempotent by variation id.
 * @param {string[]} variationIds
 */
async function seedQueuePlanning(db, admin, testrunid, variationIds) {
  const ctx = makeCtx(admin, db, testrunid);
  for (const variationId of variationIds) {
    const docid = `${testrunid}_plan_${variationId}`;
    await db.collection('queue planning').doc(docid).set(buildDoc('queue planning', {
      ...ctx, docid, variationId,
    }));
  }
}

/**
 * Studio/arena flow PRECONDITIONS for a small set of participants (the studio specs drive a few
 * tokens into a room — they don't need all 50). Seeds: `queue studio pairing` (the room, surfaced
 * on the board with studioin+checkin true), `studioinvitation` (a pending invite, future expiry),
 * `live assignment` (a live session record, queueid as STRING), `arena participant` (enrolment).
 * These stand in for state the app/CF would otherwise create; specs assert the app-computed
 * end-state (token↔live-assignment↔pairing triangle, SS-06), never these seeded values directly.
 * @param {object[]} cohort up to N participants {profileid, variationid}
 */
async function seedStudioFlowPreconditions(db, admin, testrunid, cohort, opts = {}) {
  const ctx = makeCtx(admin, db, testrunid);
  const studioId = `${testrunid}_studio_0`;
  const stagename = 'Diagnostics'; // the studio engine stage (enablezoom; flow-config §V1 row 9)
  const profileids = cohort.map(p => p.profileid);
  // The dynamic-studio screen surfaces a pairing only when the LOGGED-IN SPECIALIST'S profileid is in
  // `participants` (where('participants','array-contains',specialist.profileid), dynamic-studio.ts:314) AND
  // its `queueref` is an ongoing queue (where('queueref','in',...), :315). So the room must include the
  // specialist(s) the studio specs log in as — not only the cohort — and carry the run1 queue ref.
  const { specialistProfileids = [], queueDocId } = opts;
  const roomMembers = [...new Set([...specialistProfileids, ...profileids])];

  // LINCHPIN for the whole studio surface (studio.md SS-03..SS-13): dynamic-studio.onStudioSelect
  // (ts:645-671) only adds a stage to `studioStage` when Object.values(participantsactivity)
  // .sort().join(',') EQUALS one of that stage's compulsoryactivity combos. With `{}` studioStage is
  // empty, the token query (ts:695, gated by studioStage.length) never runs, and the waiting-list /
  // live-panel cards never render. We pin a map whose single value 'HFWFwv7YFPTNtcwkwAGK' join-matches
  // the Diagnostics compulsoryactivity combo '8' (=['HFWFwv7YFPTNtcwkwAGK'], sample-queue-config.json),
  // keyed on the FIRST logged-in specialist's profileid (the studio specs log in as specialist 0).
  // `atcmodel: null` makes the waiting-list eligibility filter (ts:808) short-circuit before touching
  // the seeded tokens' (absent) productref.id (else it throws); null — NOT [] — is required.
  const diagnosticsSpecialist = specialistProfileids[0] || profileids[0];
  const participantsactivity = { [diagnosticsSpecialist]: 'HFWFwv7YFPTNtcwkwAGK' };

  // one room holding the specialist(s) + the cohort, scoped to the run1 queue
  const pairingId = `${testrunid}_pair_0`;
  await db.collection('queue studio pairing').doc(pairingId).set(buildDoc('queue studio pairing', {
    ...ctx, docid: pairingId, queueDocId, participants: roomMembers, studioin: true, checkin: true,
    participantsactivity, atcmodel: null,
  }));

  // AVAILABLE pairing for OP-05 (and any operator move INTO an Activity stage). The board's board-side
  // studio assignment (dynamic-queue-manager-clone.ts:3011-3023) builds `availableStudio` from
  // `queueStudioList` (already filtered to studioin==true && checkin==true at :1753) keeping ONLY pairings
  // whose `status == null` (:3015) AND whose Object.values(participantsactivity).sort().join(',') is a
  // substring of the dropped Activity stage's compulsoryactivity parse (:3019). The cohort's `_pair_0` is
  // a LIVE room consumed by OP-06 (its `live assignment` is status 'live'), and OP-05 must NOT depend on
  // it staying status==null across the serial run — so we seed a DEDICATED, always-available room here:
  // status:null (builder default — NOT overridable, exactly what availableStudio requires) + a
  // participantsactivity whose single value 'HFWFwv7YFPTNtcwkwAGK' join-equals Diagnostics
  // compulsoryactivity combo[8] (=['HFWFwv7YFPTNtcwkwAGK'], sample-queue-config.json), so it is offered
  // as an enabled AssignQueueStudio option (else aqs-studio-select has zero mat-options and pickMatOption
  // times out, queue-board.page.ts:791). Keyed on the first seeded specialist so the room is a real one.
  const availPairingId = `${testrunid}_pair_avail_0`;
  await db.collection('queue studio pairing').doc(availPairingId).set(buildDoc('queue studio pairing', {
    ...ctx, docid: availPairingId, queueDocId, participants: [diagnosticsSpecialist],
    studioin: true, checkin: true, participantsactivity, atcmodel: null,
  }));

  // per-participant: a pending invitation + a live-assignment + arena enrolment
  for (const p of cohort) {
    const tok = tokenDocId(testrunid, p.profileid);

    const invId = `${testrunid}_inv_${p.profileid}`;
    await db.collection('studioinvitation').doc(invId).set(buildDoc('studioinvitation', {
      ...ctx, docid: invId, studioId, tokenDocId: tok, profileid: p.profileid,
      stage: stagename, invitedstudio: [studioId], specialistpairing: [],
    }));

    const laId = `${testrunid}_la_${p.profileid}`;
    await db.collection('live assignment').doc(laId).set(buildDoc('live assignment', {
      ...ctx, docid: laId, studioId, stagename, participantid: p.profileid,
      status: 'live', pairing: profileids,
    }));

    const apId = `${testrunid}_arena_${p.profileid}`;
    await db.collection('arena participant').doc(apId).set(buildDoc('arena participant', {
      ...ctx, docid: apId, profileid: p.profileid,
    }));
  }
  return { studioId };
}

/**
 * SS-07 POSITIVE LOWER-BOUND fixture (forms half). Seeds a KNOWN non-zero count of submitted
 * forms (`formsByClient`, named DB firestore-forms) for one participant, so the studio "Forms
 * submitted by the Participant" widget shows that EXACT non-zero number. This catches the
 * secondary-DB-empty failure mode (if the firestore-forms handle fails to init, the widget reads
 * 0 and a parity-with-also-empty-read still passes — PLAN P1 #7 / studio.md SS-07 anti-circularity).
 *
 * ATC NOTE (hard constraint): the SS-07 ATC widgets (triple-ATC, alpha/validation ATC) read the
 * `firestore-atc` database — which is OFF-LIMITS (CLAUDE.md) and is NOT provisioned for the test
 * project (firebase.test.json has only `(default)` + `firestore-forms`). We therefore seed NO ATC
 * docs. The ATC widgets will read 0 in test by design; SS-07's positive lower-bound is asserted on
 * the FORMS count (the in-scope cross-DB widget). See IMPL_SCHEMA "SS-07 / ATC" for the contract.
 *
 * @param {object} p the participant whose token the forms attach to {profileid}
 * @param {string} deliveryFormId the `delivery forms` template id (from seedReferenceData)
 * @param {number} [count=2] how many submitted forms to seed (the asserted lower bound)
 * @returns {{profileid:string, formCount:number}}
 */
async function seedFormsFixture(db, admin, testrunid, p, deliveryFormId, count = 2) {
  const formsDb = getFormsDb(admin);
  const ctx = makeCtx(admin, db, testrunid);
  const tok = tokenDocId(testrunid, p.profileid);
  const stagename = 'Diagnostics';
  for (let i = 0; i < count; i++) {
    const docid = `${testrunid}_fbc_${p.profileid}_${i}`;
    await formsDb.collection('formsByClient').doc(docid).set(buildDoc('formsByClient', {
      ...ctx, docid, formid: deliveryFormId, profileid: p.profileid,
      stagename, tokenDocId: tok,
    }));
  }
  return { profileid: p.profileid, formCount: count };
}

/**
 * /queue-web (WebInvitationPage) PRECONDITION chain for the studio cohort (studio.md SS-05..SS-08).
 * QueueWebVersion1Component.loadProfileJourneyProduct (queue-web-version1.component.ts:123-160) resolves
 * the participant's live token by walking: participantsproduct (where profileid==X && mode=='Event Mode'
 * && status=='ongoing') → its doc id is the `participantproductid` → deliverables (where participantproductid
 * == that id && type=='queue' && status=='ongoing') → fileref[last] (a queue_token DocumentReference) →
 * queuetoken.queueref. None of that is wired by seedParticipantToken (it writes participantsproduct with
 * mode:null and NO deliverables), so the web overlay queries queueref==undefined and accept()/deny() time
 * out. This seeds, per cohort participant: (a) the participantsproduct flipped to Event Mode/ongoing, and
 * (b) a deliverables doc whose fileref array-contains the participant's queue_token ref (also array-contains
 * queried at queue-web ts:246). PRECONDITION only — the spec asserts the app/CF accept/deny result.
 * Applied ONLY to the studio cohort, so non-studio participants keep mode:null (other specs unaffected).
 * @param {object[]} cohort up to N participants {profileid}
 */
async function seedQueueWebChain(db, admin, testrunid, cohort) {
  const ts = () => admin.firestore.Timestamp.now();
  for (const p of cohort) {
    const ppId = `${testrunid}_pp_${p.profileid}`;       // == the doc seedParticipantToken created
    const tokRef = db.collection('queue_token').doc(tokenDocId(testrunid, p.profileid));
    // (a) flip the participant's product to the Event-Mode/ongoing the /queue-web query requires.
    await db.collection('participantsproduct').doc(ppId).set({
      docid: ppId, profileid: p.profileid, mode: 'Event Mode', status: 'ongoing', ...TAG(testrunid),
    }, { merge: true });
    // (b) the deliverables row keyed by participantproductid, fileref → the participant's token.
    const delvId = `${testrunid}_delv_${p.profileid}`;
    await db.collection('deliverables').doc(delvId).set({
      docid: delvId, participantproductid: ppId, type: 'queue', status: 'ongoing',
      profileid: p.profileid, fileref: [tokRef], createdAt: ts(), ...TAG(testrunid),
    });
  }
}

/**
 * SECOND queue for OP-02b (negative visibility). Same config, but `queueadmin` does NOT include
 * any test operator's profileid — it lists a DIFFERENT (decoy) admin profileid. `queueadmin` is a
 * proper ARRAY (§A; the board filters `array-contains profileid`, :1546). The non-admin operator's
 * dropdown must show queue 1 and be ABSENT of this queue. Reuses seedQueueAndVariations' write shape
 * but pins a distinct docid + queueadmin so both queues coexist for the same run. Idempotent.
 * @returns {{queueGenRef2:object, decoyAdminProfileId:string}}
 */
async function seedSecondQueue(db, admin, testrunid) {
  const T = admin.firestore.Timestamp;
  const ts = () => T.now();
  const past = T.fromMillis(Date.now() - 7 * 86400e3);
  const future = T.fromMillis(Date.now() + 30 * 86400e3);
  const decoyAdminProfileId = `${testrunid}_pf_admin_DECOY`; // a profileid NO seeded operator has — excludes the test op

  const queueGenRef2 = db.collection('queue generation').doc(queueGenDocId2(testrunid));
  // seed the LYL-FC variation for queue 2 so it is a valid (selectable-by-its-own-admin) queue.
  const v = cfg.queuevariation[0];
  const vref = db.collection('queue variation').doc(`${testrunid}_q2_${v.id}`);
  await vref.set({ docid: vref.id, variationname: v.variationname, stages: v.stages, atcmodel: null, queueref: queueGenRef2, ...TAG(testrunid) });
  await queueGenRef2.set({
    docid: queueGenDocId2(testrunid),
    queuename: `TEST Q2 (operator-excluded) ${testrunid}`,
    queueadmin: [decoyAdminProfileId],   // ARRAY, but WITHOUT any test operator's profileid (the negative case)
    queuementor: [decoyAdminProfileId],
    stages: cfg.stages,
    stageproperty: cfg.stageproperty,
    queuevariation: [vref],
    // non-empty so a B!G-Planner onQueueSelect on queue 2 would not throw on the 'in' filter (reuses the
    // run's shared arena-events doc, seeded in seedQueueAndVariations). OP-02b only checks dropdown
    // visibility, but keeping the shape valid avoids a latent FAILED_PRECONDITION if a spec selects it.
    arenaeventidlist: [arenaEventDocId(testrunid)],
    // eventid (non-empty) so a planner load on queue 2 would not crash at big-planner.component.ts:228
    // (doc('event collection', undefined) → 'indexOf' throw). Same shared arena-events id as queue 1.
    eventid: arenaEventDocId(testrunid),
    zoomlinkrequired: true,
    iscommunicationsdisabled: true,
    queuestartdate: past, queueenddate: future, lastregistrationdate: future,
    created: ts(), modified: ts(),
    ...TAG(testrunid),
  });
  return { queueGenRef2, decoyAdminProfileId };
}

/**
 * BIG-CORE populated world (big-core BIG-03/BIG-04 + watch-videos P3#13). The BASE queue seed has NO
 * BIG-domain docs, so those cases can only assert empty-state / skip. This seeds a SELF-CONTAINED BIG
 * world owned by the index-1 BIG provider the PAB specs log in as (bigCoreAdminProfileId == _pf_big_1):
 *   • one `big marathon` (the PAB auto-selects bigMarathonList[0]; surfaces a `pab-marathon-btn`),
 *   • one Form-type `big assignment` (a generic Σ-badge/perform-action card for BIG-03/BIG-04),
 *   • one Video-type `big assignment` (assignmenttype === 'Video' — the literal PAB type-badge text)
 *     with a non-empty `selectedvideos` array of `arena video`-doc DocumentReferences — the ONLY product
 *     path that opens WatchVideosComponent (PAB performAction on a Video card → OpenVideos → dialog;
 *     watch-videos.component.ts:71 iterates data.activity['selectedvideos']),
 *   • a `big participants assignments` row per assignment, owned by the PAB admin, status 'ongoing'.
 *
 * DATE SHAPE (load-bearing): the PAB card is built by spreading the `big assignment` doc
 * (loadParticipantAssignments ts:213-227), and BOTH the template (html:215 reads `activity.startdate.seconds`
 * UNCONDITIONALLY) and `checkActivityStart`/`categorizeActivities` (ts:254/305 call `.toDate()`) require
 * `startdate`/`enddate` to be present Firestore Timestamps ON THE ASSIGNMENT. For the card to land in the
 * `myactivities` bucket AND render an ENABLED perform-action button we need startdate IN THE PAST and
 * enddate IN THE FUTURE (now ∈ [start,end]) with the participant-assignment status NOT completed/rework/review.
 *
 * ANTI-CIRCULARITY: PRECONDITION only — BIG-03/04 assert the count/status the PAB RECOMPUTES after a real
 * marathon-select / perform-action; watch-videos asserts the videos.length / playedVideos.size the dialog
 * COMPUTES from its own `selectedvideos` fetch. Idempotent (deterministic ids; overwrites on re-run).
 * Coexists with fixtures/big-seed.ts's analytics world (distinct ids + a distinct owner profileid).
 * @param {object} db admin.firestore()
 * @param {object} admin firebase-admin (for Timestamp)
 * @param {string} testrunid
 * @returns {{marathonId:string, adminProfileId:string, videoAssignmentId:string, formAssignmentId:string}}
 */
async function seedBigCoreWorld(db, admin, testrunid) {
  const T = admin.firestore.Timestamp;
  const now = () => T.now();
  const past = T.fromMillis(Date.now() - 7 * 86400e3);     // started a week ago (perform-action enabled)
  const future = T.fromMillis(Date.now() + 30 * 86400e3);  // ends in a month (lands in `myactivities`)
  const adminProfileId = bigCoreAdminProfileId(testrunid);

  // 1. marathon — the PAB streams `big marathon` orderBy('startdate','desc') and auto-selects index 0
  //    (ts:134-145). It is also the doc the BIG-06 precondition's marathonref points at (above), so the
  //    index-1 PAB's getPendingList finds it in marathonMap and does not crash.
  const marathonId = bigCoreMarathonId(testrunid);
  const marathonRef = db.collection('big marathon').doc(marathonId);
  await marathonRef.set({
    docid: marathonId, title: `TEST BIG-core Marathon ${testrunid}`, name: `TEST BIG-core Marathon ${testrunid}`,
    color: '#374151', startdate: past, enddate: future, status: 'live', ...TAG(testrunid),
  });

  // 2. video docs the Video assignment's `selectedvideos` refs point at. WatchVideosComponent pushes
  //    snap.data() (with id) into `videos` and renders `videos.length` in the footer (ts:71-77 / html:114),
  //    so each needs at least a `title`. Collection `arena video` (the app's video catalog).
  const VIDEO_COL = 'arena video';
  const videoRefs = [0, 1].map(i => {
    const vid = `${testrunid}_bigcore_video_${i}`;
    return { id: vid, ref: db.collection(VIDEO_COL).doc(vid) };
  });
  for (let i = 0; i < videoRefs.length; i++) {
    await videoRefs[i].ref.set({
      docid: videoRefs[i].id, title: `TEST BIG-core Video ${i}`, description: `fake video ${i}`,
      url: 'https://example.test/v.mp4', ...TAG(testrunid),
    });
  }

  // 3a. Form-type `big assignment` — a generic card for BIG-03 (Σ-badge conservation) / BIG-04
  //     (perform-action write). mapAssignments is keyed by `big assignment` doc id and only includes
  //     status ∈ ['initiated','ongoing','completed'] (ts:116-117). startdate/enddate present (see header).
  const formAssignmentId = `${testrunid}_bigcore_assign_form`;
  const formAssignmentRef = db.collection('big assignment').doc(formAssignmentId);
  await formAssignmentRef.set({
    docid: formAssignmentId, title: `TEST BIG-core Form Assignment ${testrunid}`, assignmenttype: 'Form',
    marathonref: marathonRef, cohortsref: null, status: 'ongoing',
    startdate: past, enddate: future, ...TAG(testrunid),
  });

  // 3b. Video-type `big assignment` — assignmenttype === 'Video' (the literal type-badge text the
  //     watch-videos spec matches) with a non-empty `selectedvideos` ref array (the OpenVideos→dialog path).
  const videoAssignmentId = `${testrunid}_bigcore_assign_video`;
  const videoAssignmentRef = db.collection('big assignment').doc(videoAssignmentId);
  await videoAssignmentRef.set({
    docid: videoAssignmentId, title: `TEST BIG-core Video Assignment ${testrunid}`, assignmenttype: 'Video',
    marathonref: marathonRef, cohortsref: null, status: 'ongoing',
    selectedvideos: videoRefs.map(v => v.ref),    // DocumentReferences → WatchVideos iterates these
    startdate: past, enddate: future, ...TAG(testrunid),
  });

  // 4. one `big participants assignments` row per assignment, OWNED by the PAB admin, in a NON-terminal
  //    status so the card lands in `myactivities` (categorizeActivities ts:253-267). loadParticipantAssignments
  //    requires assignmentref.id to be a key of mapAssignments (the `big assignment` above) — ts:208-211.
  const paRows = [
    { suffix: 'form', assignmentRef: formAssignmentRef },
    { suffix: 'video', assignmentRef: videoAssignmentRef },
  ];
  for (const { suffix, assignmentRef } of paRows) {
    const paId = `${testrunid}_bigcore_pa_${suffix}`;
    await db.collection('big participants assignments').doc(paId).set({
      docid: paId, profileid: adminProfileId, assignmentref: assignmentRef, cohortsref: null,
      marathonref: marathonRef, status: 'ongoing', assignmenttype: suffix === 'video' ? 'Video' : 'Form',
      startdate: past, enddate: future, ...TAG(testrunid),
    });
  }

  return { marathonId, adminProfileId, videoAssignmentId, formAssignmentId };
}

async function runSeed() {
  const testrunid = process.env.TESTRUNID || newTestRunId();
  const admin = initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const { verdict, plan, operators, specialists, bigProviders, staff, participants } = planSeed(testrunid);

  console.log(`🌱 seeding ${TEST_PROJECT}  testrunid=${testrunid}`);
  if (!verdict.ok) console.log('   (note: config has known oracle issues — see validated spec §8):', verdict.issues.join('; '));

  // 1. Auth + chain + dashboard route-config (staff log in; participants get Auth users).
  await seedAuthChain(db, auth, testrunid, { staff, operators, participants });
  console.log(`   ✓ ${staff.length + participants.length} auth users + auth chain for ${staff.length} staff + ${DRIVEN_ROUTES.length} dashboard routes`);

  // 2. The sample queue: `queue generation` + all 9 `queue variation` docs (exact L3rqCr config).
  const { queueGenRef, varRefs } = await seedQueueAndVariations(db, admin, testrunid, operators);
  console.log(`   ✓ queue generation + ${varRefs.length} queue variation docs`);

  // 2b. SECOND queue — operator NOT in queueadmin (OP-02b negative visibility).
  await seedSecondQueue(db, admin, testrunid);
  console.log('   ✓ second queue (operator-excluded, for OP-02b)');

  // 2c. BIG-core populated world (marathon + Form/Video `big assignment` + owner participant-assignments)
  //     so big-core BIG-03/BIG-04 + watch-videos exercise the POPULATED PAB path (not empty-state/skip),
  //     and the BIG-06 precondition's marathonref resolves in the PAB marathonMap (no mount crash).
  const bigCore = await seedBigCoreWorld(db, admin, testrunid);
  console.log(`   ✓ BIG-core world (marathon ${bigCore.marathonId} + Form/Video assignments) for ${bigCore.adminProfileId}`);

  // 3. Reference data (no per-participant dep): modes, journey, arenavideoask, delivery forms (named DB).
  const ref = await seedReferenceData(db, admin, testrunid);
  console.log('   ✓ reference data (modes, journey, arenavideoask, delivery forms)');

  // 3b. queue planning — one row per variation (slot/segment plan; minimal).
  await seedQueuePlanning(db, admin, testrunid, cfg.queuevariation.map(v => v.id));
  console.log(`   ✓ queue planning (${cfg.queuevariation.length} variation rows)`);

  // 4. Per-participant: token + journey/product, then feature docs (mode checklist, videoask).
  let pos = 0;
  for (const p of participants) {
    await seedParticipantToken(db, admin, testrunid,
      { profileid: p.profileid, email: p.email, variationid: p.variationid, stage: p.firststage, queueposition: ++pos },
      queueGenRef);
    await seedParticipantFeatureDocs(db, admin, testrunid, p, ref);
  }
  console.log(`   ✓ ${participants.length} participants (token + mode checklist + participantvideoask)`);

  // 5. Studio/arena flow preconditions for a small cohort (studio specs drive a few tokens).
  const studioCohort = participants.slice(0, Math.min(3, participants.length));
  if (studioCohort.length) {
    await seedStudioFlowPreconditions(db, admin, testrunid, studioCohort, {
      specialistProfileids: [0, 1, 2].map((i) => `${testrunid}_pf_specialist_${i}`),
      queueDocId: queueGenRef.id,
    });
    console.log(`   ✓ studio preconditions (pairing[+specialists] + invitation + live assignment + arena) for ${studioCohort.length}`);
    // 5b. /queue-web chain (participantsproduct Event Mode/ongoing + deliverables→token) so the REAL
    // participant accept/deny overlay (SS-05..SS-08) resolves its queueref.
    await seedQueueWebChain(db, admin, testrunid, studioCohort);
    console.log(`   ✓ /queue-web chain (participantsproduct + deliverables) for ${studioCohort.length}`);
  }

  // 6. SS-07 positive lower-bound: KNOWN non-zero forms count (named DB) for the first participant.
  if (studioCohort.length) {
    const { profileid, formCount } = await seedFormsFixture(db, admin, testrunid, studioCohort[0], ref.deliveryFormId, 2);
    console.log(`   ✓ SS-07 forms fixture: ${formCount} formsByClient docs for ${profileid} (firestore-forms)`);
    console.log('     (ATC widgets read firestore-atc which is OFF-LIMITS + not provisioned in test — 0 by design)');
  }

  console.log(`\n✅ seed complete. testrunid=${testrunid}`);
  console.log(`   teardown: node ${path.relative(process.cwd(), __filename)} --teardown ${testrunid}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --teardown <testrunid> : delete everything tagged with that run id
// ---------------------------------------------------------------------------
// Default-DB collections written by this seeder (+ `queue stage log` written by the CF /
// participant-sim, also testrunid-tagged). Every entry is testrunid-filtered on teardown.
const SEEDED_COLLECTIONS = [
  'queue generation', 'queue variation', 'queue_token', 'queue stage log',
  'queue planning', 'queue studio pairing', 'studioinvitation',
  'live assignment', 'arena participant',
  'profile_data', 'participantjourneyproduct', 'participantsproduct', 'deliverables',
  'participant mode checklist', 'participantvideoask',
  'arenavideoask', 'modes', 'journey', 'arena events', 'AWS_System',
  'user_data', 'users_roles', 'dashboard',
  // BIG-06 default-db preconditions (seedReferenceData): a `delivery forms` template in the DEFAULT db
  // (distinct from the firestore-forms one torn down below — same name, different database handle, each
  // testrunid-filtered) and the `big participants assignments` row. All testrunid-tagged.
  'delivery forms', 'big participants assignments',
  // BIG-core populated world (seedBigCoreWorld): marathon + Form/Video `big assignment` + the video
  // catalog docs. (`big participants assignments` is already listed above.) All testrunid-tagged.
  'big marathon', 'big assignment', 'arena video',
];
// Named-DB (firestore-forms) collections — torn down via the firestore-forms handle.
const SEEDED_COLLECTIONS_FORMS = ['delivery forms', 'formsByClient'];

/** Delete all testrunid-tagged docs in `cols` of `database`, in batches. Returns the count. */
async function teardownCollections(database, cols, testrunid) {
  let docs = 0;
  for (const col of cols) {
    assertNoATC(col);
    const snap = await database.collection(col).where('testrunid', '==', testrunid).get();
    // chunk deletes at 450 (< Firestore's 500/commit cap) for the larger collections.
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = database.batch();
      snap.docs.slice(i, i + 450).forEach(d => { batch.delete(d.ref); docs++; });
      await batch.commit();
    }
  }
  return docs;
}

/**
 * Sweep `live assignment` docs the APP/CF created for THIS run's queue but that carry NO testrunid tag
 * (so the testrunid-filtered teardownCollections leaves them). The dynamic-studio open-session path
 * (studio-core SS-05/06) creates `live assignment` docs via the CF WITHOUT a testrunid, and they
 * ACCUMULATE on the persistent shared emulator — breaking SS-10's single-live-assignment invariant and
 * SS-15's bijective-card assertion across runs. They are keyed by `queueid` == the queue-generation
 * DOC-ID STRING (schemas.md §0.5; dynamic-studio filters `where('queueid','==',ongoingQueue.docid)`),
 * which is ITSELF run-namespaced (`${testrunid}_${QUEUE_ID}`), so every LA with that queueid belongs to
 * THIS run regardless of tag — safe to delete. We scope strictly to this run's two queue doc-ids; we
 * NEVER touch ATC and NEVER delete LAs for any other run's queue. Returns the count deleted.
 * @param {object} db admin.firestore() (default DB)
 * @param {string} testrunid
 */
async function sweepUntaggedLiveAssignments(db, testrunid) {
  const queueIds = [queueGenDocId(testrunid), queueGenDocId2(testrunid)];
  let docs = 0;
  for (const qid of queueIds) {
    const snap = await db.collection('live assignment').where('queueid', '==', qid).get();
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = db.batch();
      snap.docs.slice(i, i + 450).forEach(d => { batch.delete(d.ref); docs++; });
      await batch.commit();
    }
  }
  return docs;
}

async function runTeardown(testrunid) {
  if (!testrunid) { console.error('teardown requires a testrunid argument'); process.exit(1); }
  const admin = initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  console.log(`🗑️  tearing down testrunid=${testrunid} on ${TEST_PROJECT}`);

  let docs = await teardownCollections(db, SEEDED_COLLECTIONS, testrunid);
  docs += await teardownCollections(getFormsDb(admin), SEEDED_COLLECTIONS_FORMS, testrunid);
  // ALSO sweep CF-created `live assignment` docs for THIS run's queue that the CF wrote WITHOUT a
  // testrunid tag (scoped by the run-namespaced queueid) — else they accumulate on the shared emulator
  // and break SS-10/SS-15 across runs.
  const sweptLa = await sweepUntaggedLiveAssignments(db, testrunid);
  if (sweptLa) { docs += sweptLa; console.log(`   ✓ swept ${sweptLa} untagged CF live-assignment doc(s) for this run's queue`); }

  // Auth users: iterate and delete those whose custom claim matches.
  let users = 0;
  let pageToken;
  do {
    const list = await auth.listUsers(1000, pageToken);
    const victims = list.users.filter(u => u.customClaims && u.customClaims.testrunid === testrunid);
    if (victims.length) { await auth.deleteUsers(victims.map(u => u.uid)); users += victims.length; }
    pageToken = list.pageToken;
  } while (pageToken);

  console.log(`   ✓ deleted ${docs} docs, ${users} auth users`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Exports — the per-variation seed builders (fixtures/variation-seeds/*) reuse these
// helpers so they NEVER duplicate the auth-chain / queue / token write logic.
// ---------------------------------------------------------------------------
module.exports = {
  // config + ids
  cfg, QUEUE_ID, QUEUE_ID_2, FORMS_DB, REF_IDS, DRIVEN_ROUTES, TAG, newTestRunId,
  queueGenDocId, queueGenDocId2, tokenDocId,
  // firebase init (allowlist-guarded — only ever the dedicated test project) + named-DB handle
  initAdmin, getFormsDb, makeCtx,
  // roster + plan
  makeStaff, planSeed,
  // seed primitives — auth/queue/token
  seedAuthChain, seedQueueAndVariations, seedParticipantToken,
  // seed primitives — feature collections (no-scopecut expansion)
  seedReferenceData, seedParticipantFeatureDocs, seedQueuePlanning,
  seedStudioFlowPreconditions, seedQueueWebChain, seedFormsFixture, seedSecondQueue,
  // seed primitives — BIG-core populated world (big-core BIG-03/04 + watch-videos)
  seedBigCoreWorld, bigCoreMarathonId, bigCoreAdminProfileId,
  // teardown helpers (+ the untagged CF live-assignment sweep)
  teardownCollections, sweepUntaggedLiveAssignments, SEEDED_COLLECTIONS, SEEDED_COLLECTIONS_FORMS,
};

// ---------------------------------------------------------------------------
// CLI — only when run directly (`node seed-test-project.js …`), never on require().
// ---------------------------------------------------------------------------
if (require.main === module) {
  const [, , mode, arg] = process.argv;
  (async () => {
    switch (mode) {
      case '--plan': return runPlan();
      case '--seed': return runSeed();
      case '--teardown': return runTeardown(arg);
      default:
        console.log('usage: seed-test-project.js --plan | --seed | --teardown <testrunid>');
        process.exit(1);
    }
  })().catch(e => { console.error('FAILED:', e.message || e); process.exit(1); });
}
