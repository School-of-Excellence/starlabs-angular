#!/usr/bin/env node
/**
 * Seed the Firebase Firestore EMULATOR with synthetic Tier-A fixtures (firestore-seed.json).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION:
 *   - Refuses to run unless FIRESTORE_EMULATOR_HOST is set (admin SDK only talks to the emulator then).
 *   - Uses a demo project id; HARD-ABORTS if the project id looks like production (fir-sample-aae4a).
 *   - Never reads a production service account; the emulator needs no credentials.
 *   - Contains NO ATC collections (none are in firestore-seed.json; an allowlist guard double-checks).
 *
 * Usage:
 *   firebase emulators:start --config firebase.emulator.json    # in one terminal
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_PROJECT=demo-starlabs node e2e/fixtures/seed-emulator.js
 */
const fs = require('fs');
const path = require('path');

// --- PROD-SAFETY GUARDS FIRST (before any dependency), so the script can refuse cleanly anywhere ---
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT || 'demo-starlabs';
const PROD_IDS = ['fir-sample-aae4a']; // production — must never be targeted

if (!EMU) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. This script only seeds the emulator, never a live project.');
  process.exit(1);
}
if (PROD_IDS.includes(PROJECT)) {
  console.error(`REFUSING TO RUN: project "${PROJECT}" is production. Use a demo/test project id (e.g. demo-starlabs).`);
  process.exit(1);
}

const admin = require('firebase-admin');

// ATC denylist guard (defence in depth — the seed file contains none).
const ATC_SAFE = new Set(['atc taxonomy', 'atc model', 'atcmodel level config']);
const isATC = (name) => { const n = name.toLowerCase(); return !ATC_SAFE.has(name) && (/\batc\b/.test(n) || n.includes('atc_') || n.includes('tripleatc') || n.includes('triple atc') || n.includes('atcinvolved')); };

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

// Marker conversion: {_ts:iso} -> Timestamp, {_ref:"col/id"} -> DocumentReference, recursively.
function convert(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(convert);
  if ('_ts' in v) return admin.firestore.Timestamp.fromDate(new Date(v._ts));
  if ('_ref' in v) return db.doc(v._ref);
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = convert(val);
  return out;
}

(async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore-seed.json'), 'utf8'));
  let cols = 0, docs = 0;
  for (const [collection, documents] of Object.entries(seed)) {
    if (collection.startsWith('_')) continue; // _README
    if (isATC(collection)) { console.error(`ABORT: ATC collection "${collection}" in seed — denied.`); process.exit(1); }
    const batch = db.batch();
    for (const [id, data] of Object.entries(documents)) { batch.set(db.collection(collection).doc(id), convert(data)); docs++; }
    await batch.commit();
    cols++;
    console.log(`  seeded ${collection} (${Object.keys(documents).length})`);
  }
  console.log(`\nDONE → ${PROJECT} @ ${EMU}: ${docs} docs across ${cols} collections.`);
  process.exit(0);
})().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1); });
