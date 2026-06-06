#!/usr/bin/env node
/**
 * sample-prod-schemas.js — derive the FIELD SHAPE of every queue-feature collection
 * from production, READ-ONLY, copying NO values (everything redacted to a type token).
 *
 * Why: the test prompt requires replicating every Firestore collection the production
 * participant-queue feature touches, with FAKE data. To make the fake data structurally
 * faithful we sample the real schema — but production is read-only and off-limits for any
 * write, and we must never copy real PII. This script:
 *   - connects with the production service account (READ ONLY — only .get()/.limit()),
 *   - reads a few docs per collection (across the correct named DBs),
 *   - emits a redacted "schema skeleton" (key -> type, nested), NEVER raw values,
 *   - writes specs/queue-collection-schemas.json for the fake-data generator to consume.
 *
 * Guards: refuses to write anything to Firestore; only reads. PII keys are dropped to a
 * '<type>' token so no real names/emails/phones ever land on disk.
 *
 * Usage: node e2e/fixtures/sample-prod-schemas.js
 *   (requires ~/solarcode/serviceAccountKeyProduction.json — production read access)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const admin = require('firebase-admin');

const PROD_SA = process.env.PROD_SA || path.join(os.homedir(), 'solarcode', 'serviceAccountKeyProduction.json');
if (!fs.existsSync(PROD_SA)) {
  console.error(`production SA not found at ${PROD_SA}. Set PROD_SA=/path/to/serviceAccountKeyProduction.json`);
  process.exit(1);
}

// The queue-feature collections, grouped by named database (from queue-participant-app-map.md).
// db: '(default)' uses the default database; named dbs use getFirestore(app, dbId).
const MANIFEST = [
  // --- core queue (default DB) ---
  { col: 'queue generation', db: '(default)' },
  { col: 'queue variation', db: '(default)' },
  { col: 'queue_token', db: '(default)' },
  { col: 'queue stage log', db: '(default)' },
  { col: 'queue planning', db: '(default)' },
  { col: 'queue studio pairing', db: '(default)' },
  { col: 'studioinvitation', db: '(default)' },
  { col: 'live assignment', db: '(default)' },
  { col: 'arena participant', db: '(default)' },
  // --- participant / journey / mode (default DB) ---
  { col: 'profile_data', db: '(default)' },
  { col: 'participantsproduct', db: '(default)' },
  { col: 'participantjourneyproduct', db: '(default)' },
  { col: 'participant mode checklist', db: '(default)' },
  { col: 'participantvideoask', db: '(default)' },
  { col: 'arenavideoask', db: '(default)' },
  { col: 'modes', db: '(default)' },
  { col: 'journey', db: '(default)' },
  // --- auth / authorization chain (default DB) ---
  { col: 'user_data', db: '(default)' },
  { col: 'users_roles', db: '(default)' },
  { col: 'dashboard', db: '(default)' },
  // --- forms (named DB: firestore-forms) ---
  { col: 'delivery forms', db: 'firestore-forms' },
  { col: 'formsByClient', db: 'firestore-forms' },
];

const SAMPLE_N = Number(process.env.SAMPLE_N || 5);

// PII / secret key names → never even record the value's existence beyond a redaction token.
const REDACT_KEY = /(email|phone|mobile|name|address|password|otp|token|apikey|secret|signature|dob|aadhaar|pan|upi|account|card|whatsapp|fcm)/i;

/** Reduce a value to a type token; recurse into maps/arrays. Never returns raw scalars. */
function typeOf(v, depth = 0) {
  if (v === null || v === undefined) return '<null>';
  if (depth > 4) return '<deep>';
  // Firestore special types
  if (v instanceof admin.firestore.Timestamp) return '<timestamp>';
  if (v instanceof admin.firestore.GeoPoint) return '<geopoint>';
  if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'DocumentReference') {
    return `<ref:${v.path ? v.path.split('/')[0] : 'doc'}>`;
  }
  if (Array.isArray(v)) {
    if (!v.length) return ['<empty>'];
    return [typeOf(v[0], depth + 1)]; // representative element type
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = REDACT_KEY.test(k) ? '<redacted>' : typeOf(val, depth + 1);
    }
    return out;
  }
  return `<${typeof v}>`; // string|number|boolean
}

/** Merge multiple doc skeletons so optional fields across docs are captured. */
function mergeSkel(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) return a; // keep first array shape
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = mergeSkel(out[k], v);
    return out;
  }
  return a; // scalar tokens — keep first
}

(async () => {
  const sa = require(PROD_SA);
  admin.initializeApp({ credential: admin.credential.cert(sa) });

  const dbs = {}; // dbId -> Firestore
  const getDb = id => {
    if (!dbs[id]) dbs[id] = id === '(default)' ? admin.firestore() : admin.firestore(admin.app(), id);
    return dbs[id];
  };

  const schemas = {};
  for (const { col, db } of MANIFEST) {
    try {
      const snap = await getDb(db).collection(col).limit(SAMPLE_N).get();
      if (snap.empty) { schemas[col] = { _db: db, _samples: 0, fields: {} }; console.log(`  ${col.padEnd(28)} (${db})  0 docs`); continue; }
      let skel;
      snap.docs.forEach(d => { skel = mergeSkel(skel, typeOf(d.data())); });
      schemas[col] = { _db: db, _samples: snap.size, fields: skel };
      console.log(`  ${col.padEnd(28)} (${db})  ${snap.size} docs · ${Object.keys(skel || {}).length} fields`);
    } catch (e) {
      schemas[col] = { _db: db, _error: e.message };
      console.log(`  ${col.padEnd(28)} (${db})  ERROR: ${e.message.slice(0, 60)}`);
    }
  }

  const outPath = path.join(__dirname, '..', '..', 'specs', 'queue-collection-schemas.json');
  fs.writeFileSync(outPath, JSON.stringify(schemas, null, 2));
  console.log(`\n✓ wrote ${path.relative(process.cwd(), outPath)} (redacted skeletons only — no values copied)`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
