// jb_probe1_purchase.js — READ-ONLY recon of the purchase/journey-entry data model.
// Production fir-sample-aae4a. ONLY .get()/.limit().get() are used. No writes, ever.
// Goal: the shape of a user's ENTRY — profile_data, participantjourneyproduct,
// participantsproduct, journeyproductpurchase — and the JOIN keys that link them.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const typeOf = (v) => {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (v && v._seconds !== undefined) return 'Timestamp';
  if (v && v.constructor && v.constructor.name === 'DocumentReference') return `ref->${v.path}`;
  if (v && typeof v === 'object') return `object{${Object.keys(v).slice(0, 6).join(',')}}`;
  return typeof v;
};
// Redact PII: never print real emails/names; print field names + value TYPES + a SAFE example.
const safeVal = (k, v) => {
  const t = typeOf(v);
  const lower = String(k).toLowerCase();
  const pii = ['email', 'name', 'phone', 'number', 'mobile', 'address', 'firstname', 'lastname'];
  if (pii.some((p) => lower.includes(p))) return `<redacted ${t}>`;
  if (t === 'string') return JSON.stringify(String(v).slice(0, 40));
  if (t.startsWith('ref->') || t === 'Timestamp' || t.startsWith('array') || t.startsWith('object')) return t;
  return JSON.stringify(v);
};
const dumpDoc = (label, id, data, onlyKeys) => {
  console.log(`  [${label}] id=${id}`);
  const keys = (onlyKeys || Object.keys(data)).sort();
  for (const k of keys) console.log(`     ${k}: ${typeOf(data[k])} = ${safeVal(k, data[k])}`);
};

(async () => {
  // 1) profile_data — the participant identity. Sample 5; show key fields only.
  console.log('=== profile_data (sample 5) — key entry fields ===');
  const pd = await db.collection('profile_data').limit(5).get();
  const PROFILE_KEYS = ['profileid', 'docid', 'email', 'name', 'participantmode', 'currentjourney',
    'currentjourneyref', 'role_ref', 'user_ref', 'number', 'countrycode', 'profileimg'];
  let firstProfileId = null;
  pd.forEach((d) => { if (!firstProfileId) firstProfileId = d.id; dumpDoc('profile_data', d.id, d.data(), PROFILE_KEYS); });

  // 2) participantjourneyproduct — the purchase record of truth. Sample 5 full docs.
  console.log('\n=== participantjourneyproduct (sample 5) — FULL field shape ===');
  const pjp = await db.collection('participantjourneyproduct').limit(5).get();
  pjp.forEach((d) => dumpDoc('PJP', d.id, d.data()));

  // 3) participantsproduct — the delivery/enrollment unit. Sample 5 full docs.
  console.log('\n=== participantsproduct (sample 5) — FULL field shape ===');
  const psp = await db.collection('participantsproduct').limit(5).get();
  psp.forEach((d) => dumpDoc('PSP', d.id, d.data()));

  // 4) journeyproductpurchase — per-purchase (carries the watson cross-key). Sample 5.
  console.log('\n=== journeyproductpurchase (sample 5) — FULL field shape ===');
  const jpp = await db.collection('journeyproductpurchase').limit(5).get();
  jpp.forEach((d) => dumpDoc('JPP', d.id, d.data()));

  // 5) For ONE real profile, JOIN end-to-end: profile -> PJP -> PSP. Proves the join keys.
  console.log('\n=== JOIN walk for one real profileid ===');
  // Pick a profileid that actually has a PJP (so the join is non-trivial).
  const pjpAny = await db.collection('participantjourneyproduct').limit(50).get();
  let joinProfile = null;
  pjpAny.forEach((d) => { if (!joinProfile && d.data().profileid) joinProfile = d.data().profileid; });
  console.log('  chosen profileid (from a PJP):', joinProfile);
  if (joinProfile) {
    const myPjp = await db.collection('participantjourneyproduct').where('profileid', '==', joinProfile).limit(10).get();
    console.log('  participantjourneyproduct for this profile:', myPjp.size);
    myPjp.forEach((d) => console.log(`     PJP ${d.id}: journeyref=${typeOf(d.data().journeyref)} journeystatus=${JSON.stringify(d.data().journeystatus)} onboarded=${d.data().onboarded} purchaseref=${typeOf(d.data().purchaseref)} participantproducts=${typeOf(d.data().participantproducts)}`));
    const myPsp = await db.collection('participantsproduct').where('profileid', '==', joinProfile).limit(50).get();
    console.log('  participantsproduct for this profile:', myPsp.size);
    myPsp.forEach((d, i) => { if (i < 6) console.log(`     PSP ${d.id}: productref=${typeOf(d.data().productref)} status=${JSON.stringify(d.data().status)} mode=${JSON.stringify(d.data().mode)} deliverymode=${JSON.stringify(d.data().deliverymode)}`); });
  }

  // 6) Counts for sizing the cohort.
  console.log('\n=== counts ===');
  for (const c of ['profile_data', 'participantjourneyproduct', 'participantsproduct', 'journeyproductpurchase']) {
    const cnt = await db.collection(c).count().get();
    console.log(`  ${c}: ${cnt.data().count}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
