// READ-ONLY: pull the real journey/product/stage taxonomy to ground user-journey mapping. No ATC. No writes.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();
const ATC_DENY = ['atc_alpha','atc_initiated','atc_notes','atc_to_validate','ai_generated_atc_summary','triple atc','temporary_tripleatc','atc assignment'];

async function listNames(col, field) {
  try {
    const snap = await db.collection(col).get();
    const names = [];
    snap.forEach(d => { const v = d.data()[field]; if (v) names.push(typeof v === 'string' ? v : JSON.stringify(v)); });
    return { count: snap.size, names };
  } catch (e) { return { count: 0, names: [], err: e.message }; }
}
async function tally(col, fields, limit) {
  const t = {}; fields.forEach(f => t[f] = {});
  let n = 0;
  try {
    const snap = await db.collection(col).limit(limit).get();
    snap.forEach(d => { n++; const x = d.data(); fields.forEach(f => { const v = x[f]; const k = (v === undefined || v === null) ? '(none)' : (typeof v === 'object' ? '(obj)' : String(v)); t[f][k] = (t[f][k]||0)+1; }); });
  } catch (e) { return { n, t, err: e.message }; }
  return { n, t };
}
const top = (obj, k=12) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([v,c])=>`${v}:${c}`).join('  ');

(async () => {
  const journeys = await listNames('journey', 'journey');
  console.log('=== JOURNEYS (' + journeys.count + ') ===');
  console.log(journeys.names.sort().join(' | '));

  const products = await db.collection('products').get();
  console.log('\n=== PRODUCTS (' + products.size + ') ===');
  const prod = []; products.forEach(d => { const x=d.data(); prod.push((x.product||x.name||d.id) + (x.mode?` [${x.mode}]`:'')); });
  console.log(prod.sort().join(' | '));

  const appt = await listNames('appointmenttype', 'appointmenttype');
  console.log('\n=== APPOINTMENT TYPES (' + appt.count + ') ===');
  console.log(appt.names.sort().join(' | '));

  const pcount = await db.collection('profile_data').count().get();
  console.log('\n=== profile_data total: ' + pcount.data().count + ' ===');
  const pt = await tally('profile_data', ['currentjourney','currentjourneystatus','currentproductstatus'], 4000);
  console.log('(sampled ' + pt.n + ' profiles)');
  console.log('currentjourney      :', top(pt.t.currentjourney));
  console.log('currentjourneystatus:', top(pt.t.currentjourneystatus));
  console.log('currentproductstatus:', top(pt.t.currentproductstatus));

  console.log('\n=== participantjourneyproduct sample (fields/shape) ===');
  const pjp = await db.collection('participantjourneyproduct').limit(3).get();
  pjp.forEach(d => console.log('  keys:', Object.keys(d.data()).join(', ')));

  console.log('\n=== participantdeliverysequence sample (stage sequence) ===');
  const pds = await db.collection('participantdeliverysequence').limit(2).get();
  pds.forEach(d => { const x=d.data(); const seqKey = Object.keys(x).find(k=>Array.isArray(x[k])); console.log('  keys:', Object.keys(x).join(','), '| seqLen:', seqKey?x[seqKey].length:'?'); });
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
