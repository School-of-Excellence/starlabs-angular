// jb_probe4_delivery.js — READ-ONLY: the delivery chain field shapes needed to seed a believable
// in-progress user — queue (queue_token / participantdeliverysequence / deliverables), appointments,
// and how delivery advances. Production fir-sample-aae4a. Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const keys = (d) => Object.keys(d).sort().join(', ');
const shape = (x) => Object.keys(x).sort().map((k) => {
  const v = x[k];
  let t;
  if (v === null) t = 'null';
  else if (Array.isArray(v)) t = 'array[' + v.length + ']';
  else if (v && v._seconds !== undefined) t = 'ts';
  else if (v && v.path) t = 'ref->' + v.path.split('/').slice(0, 1)[0];
  else if (v && typeof v === 'object') t = 'obj{' + Object.keys(v).slice(0, 5).join(',') + '}';
  else if (typeof v === 'string') t = 'str';
  else t = JSON.stringify(v);
  return k + ':' + t;
}).join(' | ');

(async () => {
  // 1) queue_token — participant state on the board. Sample shape + status distribution.
  console.log('=== queue_token ===');
  const qt = await db.collection('queue_token').limit(2).get();
  qt.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));
  const qtCount = await db.collection('queue_token').count().get();
  console.log('  count: ' + qtCount.data().count);

  // 2) participantdeliverysequence — the per-participant delivery ladder. Shape of the nested products[].delivery[].
  console.log('\n=== participantdeliverysequence ===');
  const pds = await db.collection('participantdeliverysequence').limit(2).get();
  pds.forEach((d) => {
    const x = d.data();
    console.log('  sample ' + d.id + ' top keys: ' + keys(x));
    const prods = x.products || [];
    console.log('    products.length=' + prods.length);
    if (prods[0]) {
      console.log('    products[0] keys: ' + Object.keys(prods[0]).sort().join(', '));
      const del = prods[0].delivery || [];
      console.log('    products[0].delivery.length=' + del.length);
      if (del[0]) console.log('    products[0].delivery[0]: ' + shape(del[0]));
      // distribution of delivery[].type + status across the first doc
      const tcount = {};
      prods.forEach((p) => (p.delivery || []).forEach((dd) => { const key = (dd.type || '?') + '/' + (dd.status || '?'); tcount[key] = (tcount[key] || 0) + 1; }));
      console.log('    delivery type/status across this doc: ' + JSON.stringify(tcount));
    }
  });
  const pdsCount = await db.collection('participantdeliverysequence').count().get();
  console.log('  count: ' + pdsCount.data().count);

  // 3) deliverables — the leaf delivery item (fileref points at the token/appt/EPR). Sample + status dist.
  console.log('\n=== deliverables ===');
  const del = await db.collection('deliverables').limit(3).get();
  del.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));
  const delCount = await db.collection('deliverables').count().get();
  console.log('  count: ' + delCount.data().count);
  // status distribution over a 1500-sample
  const delS = await db.collection('deliverables').limit(1500).get();
  const ds = {}, dt = {};
  delS.forEach((d) => { const x = d.data(); ds[x.status || '?'] = (ds[x.status || '?'] || 0) + 1; dt[x.type || '?'] = (dt[x.type || '?'] || 0) + 1; });
  console.log('  status dist (1500-sample): ' + JSON.stringify(ds));
  console.log('  type   dist (1500-sample): ' + JSON.stringify(dt));

  // 4) appointments — the scheduled-delivery session. Sample shape (already tallied in #5 doc; here for the seed shape).
  console.log('\n=== appointments ===');
  const ap = await db.collection('appointments').limit(2).get();
  ap.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));

  // 5) availability — specialist windows + nested per-type slot arrays. Top-level shape.
  console.log('\n=== availability (top-level keys of a sample) ===');
  const av = await db.collection('availability').limit(1).get();
  av.forEach((d) => {
    const x = d.data();
    const known = ['id', 'docid', 'starttime', 'endtime', 'profileref', 'appointments', 'weeklyhours'];
    const slotKeys = Object.keys(x).filter((k) => !known.includes(k));
    console.log('  top: ' + known.filter((k) => k in x).join(', '));
    console.log('  appt-type slot keys: ' + slotKeys.length);
    if (slotKeys[0]) { const s = x[slotKeys[0]]; console.log('  one slot: ' + JSON.stringify(Array.isArray(s) ? s[0] : s)); }
  });

  // 6) queue generation — the queue master (for the delivery rail). Top keys only (don't dump stageproperty).
  console.log('\n=== queue generation (top keys) ===');
  const qg = await db.collection('queue generation').limit(1).get();
  qg.forEach((d) => console.log('  keys: ' + keys(d.data())));
  const qgCount = await db.collection('queue generation').count().get();
  console.log('  count: ' + qgCount.data().count);

  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
