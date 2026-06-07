#!/usr/bin/env node
/**
 * seed-emulator.js — seed the Firebase EMULATOR with the SAME queue fixtures the cloud seeder writes, so the
 * Queue Manager suite runs HERMETICALLY (CI-gateable) with the real Cloud-Function triggers executing.
 *
 * COLLECTION-COVERAGE PARITY (task #13): this seeder REUSES the write functions exported by
 * fixtures/seed-test-project.js (planSeed / seedAuthChain / seedQueueAndVariations / seedParticipantToken /
 * seedReferenceData / seedParticipantFeatureDocs / seedQueuePlanning / seedStudioFlowPreconditions /
 * seedFormsFixture / seedSecondQueue + teardown helpers). The doc SHAPES live in ONE place (lib/fake-data.js
 * via buildDoc) and are owned by the cloud seeder — this file never duplicates them, it just points the same
 * writers at the emulator. So emulator == cloud in both collection set AND field shape, which is what makes the
 * recon/cf.md CF read-backs identical on both targets.
 *
 * Coverage (mirrors seed-test-project.js runSeed): queue generation×2 (incl. the OP-02b operator-excluded
 * queue), queue variation×N, queue_token, queue planning, profile_data / participantjourneyproduct /
 * participantsproduct, participant mode checklist, participantvideoask, modes/journey/arenavideoask,
 * user_data/users_roles/dashboard (staff auth chain), + the studio cohort preconditions (queue studio pairing,
 * studioinvitation, live assignment, arena participant) and the SS-07 forms fixture in the firestore-forms
 * named DB. NO ATC collections (firestore-atc is off-limits and never provisioned).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION:
 *   - REFUSES to run unless FIRESTORE_EMULATOR_HOST is set (the Admin SDK then only talks to the emulator).
 *   - Uses a demo project id; HARD-ABORTS if it looks like production (fir-sample-aae4a) or any protected id.
 *   - Never reads a production service account; the emulator needs no credentials.
 *   - Does NOT call seed-test-project.js's initAdmin() (that is allowlisted to the CLOUD project) — it inits
 *     its OWN emulator-pinned admin app and passes db/admin/auth into the shared writers.
 *
 * Usage (one terminal boots the emulator first):
 *   e2e/scripts/deploy-cf-emulator.sh                                  # terminal 1: emulator + functions
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *     FIREBASE_PROJECT=demo-slabs-queue node e2e/fixtures/seed-emulator.js --seed
 *   # legacy broad synthetic seed (non-queue subsystems, from firestore-seed.json):
 *   ... node e2e/fixtures/seed-emulator.js --legacy
 *   # teardown a run:
 *   ... node e2e/fixtures/seed-emulator.js --teardown <testrunid>
 */
'use strict';
const fs = require('fs');
const path = require('path');

// --- PROD-SAFETY GUARDS FIRST (before any dependency), so the script can refuse cleanly anywhere ----------
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT || 'demo-slabs-queue';
const PROTECTED = ['fir-sample-aae4a', 'watsonproduction-becde', 'salesleadcrm', 'starlabs-test', 'watson-test-19', 'salescrm-test-19'];

if (!EMU) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. This script only seeds the emulator, never a live project.');
  process.exit(1);
}
if (PROTECTED.includes(PROJECT)) {
  console.error(`REFUSING TO RUN: project "${PROJECT}" is protected/production. Use a demo project id (e.g. demo-slabs-queue).`);
  process.exit(1);
}

const admin = require('firebase-admin');

// ATC denylist guard (defence in depth — neither the shared writers nor the legacy seed file contain ATC).
const ATC_SAFE = new Set(['atc taxonomy', 'atc model', 'atcmodel level config']);
const isATC = (name) => { const n = name.toLowerCase(); return !ATC_SAFE.has(name) && (/\batc\b/.test(n) || n.includes('atc_') || n.includes('tripleatc') || n.includes('triple atc') || n.includes('atcinvolved')); };

/** Init the EMULATOR admin app (demo project; emulator host env makes it emulator-only). Idempotent. */
function initEmulatorAdmin() {
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
  return admin;
}

// ---------------------------------------------------------------------------------------------------------
// --seed : full queue coverage, reusing the cloud seeder's exported write functions against the emulator.
// ---------------------------------------------------------------------------------------------------------
async function runSeed() {
  initEmulatorAdmin();
  const db = admin.firestore();
  const auth = admin.auth();

  // Reuse the cloud seeder's writers (required AFTER admin init; its CLI is require.main-guarded so this is
  // side-effect free and does NOT trigger the cloud-pinned initAdmin()).
  const seed = require('./seed-test-project');
  const testrunid = process.env.TESTRUNID || seed.newTestRunId();
  const { verdict, plan, operators, staff, participants } = seed.planSeed(testrunid);

  console.log(`🌱 seeding EMULATOR project=${PROJECT} @ ${EMU}  testrunid=${testrunid}`);
  if (!verdict.ok) console.log('   (config has known oracle issues — see validated spec §8):', verdict.issues.join('; '));

  // 1. Auth + chain + dashboard route-config (staff log in; participants get Auth users).
  await seed.seedAuthChain(db, auth, testrunid, { staff, operators, participants });
  console.log(`   ✓ ${staff.length + participants.length} auth users + auth chain for ${staff.length} staff + dashboard routes`);

  // 2. The sample queue + all variations (exact L3rqCr config).
  const { queueGenRef, varRefs } = await seed.seedQueueAndVariations(db, admin, testrunid, operators);
  console.log(`   ✓ queue generation + ${varRefs.length} queue variation docs`);

  // 2b. SECOND queue — operator NOT in queueadmin (OP-02b negative visibility).
  await seed.seedSecondQueue(db, admin, testrunid);
  console.log('   ✓ second queue (operator-excluded, for OP-02b)');

  // 2c. BIG-core populated world (marathon + Form/Video `big assignment` + owner participant-assignments)
  //     — same shared writer as the cloud seeder, so big-core BIG-03/04 + watch-videos exercise the
  //     populated PAB path on the emulator too (and the BIG-06 marathonref resolves in marathonMap).
  const bigCore = await seed.seedBigCoreWorld(db, admin, testrunid);
  console.log(`   ✓ BIG-core world (marathon ${bigCore.marathonId} + Form/Video assignments) for ${bigCore.adminProfileId}`);

  // 3. Reference data (modes, journey, arenavideoask, delivery forms in firestore-forms).
  const ref = await seed.seedReferenceData(db, admin, testrunid);
  console.log('   ✓ reference data (modes, journey, arenavideoask, delivery forms)');

  // 3b. queue planning — one row per variation.
  await seed.seedQueuePlanning(db, admin, testrunid, seed.cfg.queuevariation.map((v) => v.id));
  console.log(`   ✓ queue planning (${seed.cfg.queuevariation.length} variation rows)`);

  // 4. Per-participant: token + journey/product, then feature docs (mode checklist, videoask).
  let pos = 0;
  for (const p of participants) {
    await seed.seedParticipantToken(db, admin, testrunid,
      { profileid: p.profileid, email: p.email, variationid: p.variationid, stage: p.firststage, queueposition: ++pos },
      queueGenRef);
    await seed.seedParticipantFeatureDocs(db, admin, testrunid, p, ref);
  }
  console.log(`   ✓ ${participants.length} participants (token + mode checklist + participantvideoask)`);

  // 5. Studio/arena flow preconditions for a small cohort.
  const studioCohort = participants.slice(0, Math.min(3, participants.length));
  if (studioCohort.length) {
    await seed.seedStudioFlowPreconditions(db, admin, testrunid, studioCohort, {
      specialistProfileids: [0, 1, 2].map((i) => `${testrunid}_pf_specialist_${i}`),
      queueDocId: queueGenRef.id,
    });
    console.log(`   ✓ studio preconditions (pairing[+specialists] + invitation + live assignment + arena) for ${studioCohort.length}`);
    // 5b. /queue-web chain (participantsproduct Event Mode/ongoing + deliverables→token) for SS-05..SS-08.
    await seed.seedQueueWebChain(db, admin, testrunid, studioCohort);
    console.log(`   ✓ /queue-web chain (participantsproduct + deliverables) for ${studioCohort.length}`);
    // 6. SS-07 positive lower-bound: KNOWN non-zero forms count (named DB) for the first participant.
    const { profileid, formCount } = await seed.seedFormsFixture(db, admin, testrunid, studioCohort[0], ref.deliveryFormId, 2);
    console.log(`   ✓ SS-07 forms fixture: ${formCount} formsByClient docs for ${profileid} (firestore-forms)`);
  }

  console.log(`\n✅ emulator seed complete. testrunid=${testrunid}`);
  console.log(`   teardown: FIRESTORE_EMULATOR_HOST=${EMU} FIREBASE_PROJECT=${PROJECT} node ${path.relative(process.cwd(), __filename)} --teardown ${testrunid}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------
// --teardown <testrunid> : delete everything tagged with that run id (default DB + firestore-forms), reusing
// the cloud seeder's teardown helper + collection lists.
// ---------------------------------------------------------------------------------------------------------
async function runTeardown(testrunid) {
  if (!testrunid) { console.error('teardown requires a testrunid argument'); process.exit(1); }
  initEmulatorAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const seed = require('./seed-test-project');
  console.log(`🗑️  tearing down testrunid=${testrunid} on EMULATOR ${PROJECT}`);

  let docs = await seed.teardownCollections(db, seed.SEEDED_COLLECTIONS, testrunid);
  docs += await seed.teardownCollections(seed.getFormsDb(admin), seed.SEEDED_COLLECTIONS_FORMS, testrunid);
  // ALSO sweep CF-created `live assignment` docs for this run's queue written WITHOUT a testrunid tag
  // (they accumulate on the persistent emulator and break SS-10/SS-15 across runs). Shared writer.
  const sweptLa = await seed.sweepUntaggedLiveAssignments(db, testrunid);
  if (sweptLa) { docs += sweptLa; console.log(`   ✓ swept ${sweptLa} untagged CF live-assignment doc(s) for this run's queue`); }

  let users = 0;
  let pageToken;
  do {
    const list = await auth.listUsers(1000, pageToken);
    const victims = list.users.filter((u) => u.customClaims && u.customClaims.testrunid === testrunid);
    if (victims.length) { await auth.deleteUsers(victims.map((u) => u.uid)); users += victims.length; }
    pageToken = list.pageToken;
  } while (pageToken);

  console.log(`   ✓ deleted ${docs} docs, ${users} auth users`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------
// --legacy : the ORIGINAL broad synthetic seed (firestore-seed.json) for NON-queue subsystems (appointments,
// content, events, tiers, …). Kept for the non-queue smoke fixtures; the queue path uses --seed above.
// ---------------------------------------------------------------------------------------------------------
function convert(db, v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => convert(db, x));
  if ('_ts' in v) return admin.firestore.Timestamp.fromDate(new Date(v._ts));
  if ('_ref' in v) return db.doc(v._ref);
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = convert(db, val);
  return out;
}

async function runLegacy() {
  initEmulatorAdmin();
  const db = admin.firestore();
  const seedDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore-seed.json'), 'utf8'));
  let cols = 0, docs = 0;
  for (const [collection, documents] of Object.entries(seedDoc)) {
    if (collection.startsWith('_')) continue; // _README
    if (isATC(collection)) { console.error(`ABORT: ATC collection "${collection}" in seed — denied.`); process.exit(1); }
    const batch = db.batch();
    for (const [id, data] of Object.entries(documents)) { batch.set(db.collection(collection).doc(id), convert(db, data)); docs++; }
    await batch.commit();
    cols++;
    console.log(`  seeded ${collection} (${Object.keys(documents).length})`);
  }
  console.log(`\nDONE (legacy) → ${PROJECT} @ ${EMU}: ${docs} docs across ${cols} collections.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------
const [, , mode, arg] = process.argv;
(async () => {
  switch (mode) {
    case '--seed':
    case undefined:               // default to the full queue seed
      return runSeed();
    case '--legacy': return runLegacy();
    case '--teardown': return runTeardown(arg);
    default:
      console.log('usage: seed-emulator.js [--seed] | --legacy | --teardown <testrunid>   (FIRESTORE_EMULATOR_HOST required)');
      process.exit(1);
  }
})().catch((e) => { console.error('SEED FAILED:', e.message || e); process.exit(1); });
