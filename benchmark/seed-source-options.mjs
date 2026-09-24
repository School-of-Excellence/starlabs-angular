// One-time seed of the configurable lead-source list for the Sales Numbers dashboard.
// Writes classify/source_options = { sources: [{id, name}] } on the LIVE `starlabs-test`
// project (the disposable TEST project — never production). Matches the house shape used by
// classify/channelcategories ({ categories: [{id, name}] }).
//
// The dashboard READS this doc (SalesNumbersService.loadSourceOptions) and stores the entry
// `id` onto salesleads.source; it maps id -> name for display. To add / rename a source later,
// edit this doc in the Firebase console — no code change needed. Changing an existing `id`
// orphans leads already tagged with the old id, so only ever add new entries or rename `name`.
//
//   node benchmark/seed-source-options.mjs          # create/overwrite the doc
//   node benchmark/seed-source-options.mjs --merge  # add only missing sources, keep existing ids
//
// PRODUCTION: this same doc must be created on the production project before the feature ships there.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// starlabs-test (TEST project) web config — from environment.development.ts. NOT production.
const firebaseConfig = {
  apiKey: 'AIzaSyAeaYHkue2pxh6kDyTL8w6CSaF9LNbMZHc',
  authDomain: 'starlabs-test.firebaseapp.com',
  projectId: 'starlabs-test',
  storageBucket: 'starlabs-test.firebasestorage.app',
  messagingSenderId: '104127075029',
  appId: '1:104127075029:web:35e728b406ff4175d1485c',
};
const db = getFirestore(initializeApp(firebaseConfig, `seed-source-options-${Date.now()}`));
const MERGE = process.argv.includes('--merge');

// current source labels; id = stable slug so the stored value stays legible.
const LABELS = ['Ads', 'Organic', 'Campaigns', 'Referral', 'DFU', 'Revival', 'Workshop', 'Event', 'Lead Magnet'];
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const desired = LABELS.map((name) => ({ id: slug(name), name }));

const ref = doc(db, 'classify', 'source_options');
let sources = desired;

if (MERGE) {
  const snap = await getDoc(ref);
  const existing = (snap.exists() && Array.isArray(snap.data().sources)) ? snap.data().sources : [];
  const byId = new Map(existing.map((s) => [s.id, s]));
  for (const s of desired) if (!byId.has(s.id)) byId.set(s.id, s);
  sources = [...byId.values()];
}

await setDoc(ref, { sources }, { merge: false });
console.log(`classify/source_options written with ${sources.length} sources:`);
for (const s of sources) console.log(`  ${s.id}  ->  ${s.name}`);
process.exit(0);
