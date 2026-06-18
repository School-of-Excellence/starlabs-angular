// jb_probe5_content.js — READ-ONLY: what marks content consumption + journey progression.
// content analytics / participant content analytics / watchedVideos; participant mode checklist /
// accelerated evolution level / participant metadata. Production fir-sample-aae4a. Only .get(). No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const PII = ['email', 'name', 'phone', 'number', 'mobile', 'address'];
const shape = (x) => Object.keys(x).sort().map((k) => {
  const v = x[k];
  let t;
  if (v === null) t = 'null';
  else if (Array.isArray(v)) t = 'array[' + v.length + ']';
  else if (v && v._seconds !== undefined) t = 'ts';
  else if (v && v.path) t = 'ref->' + v.path.split('/')[0];
  else if (v && typeof v === 'object') t = 'obj{' + Object.keys(v).slice(0, 5).join(',') + '}';
  else if (typeof v === 'string') t = PII.some((p) => k.toLowerCase().includes(p)) ? '<redacted str>' : 'str:' + JSON.stringify(v.slice(0, 24));
  else t = JSON.stringify(v);
  return k + ':' + t;
}).join(' | ');
const sampleColl = async (name, n = 1) => {
  try {
    const s = await db.collection(name).limit(n).get();
    if (s.empty) { console.log('  [' + name + '] EMPTY/absent'); return; }
    s.forEach((d) => console.log('  [' + name + '] ' + d.id + ': ' + shape(d.data())));
    const c = await db.collection(name).count().get();
    console.log('  [' + name + '] count: ' + c.data().count);
  } catch (e) { console.log('  [' + name + '] ERR ' + e.message); }
};

(async () => {
  console.log('=== CONTENT CONSUMPTION collections ===');
  await sampleColl('content analytics', 2);
  await sampleColl('participant content analytics', 2);
  await sampleColl('productconsumptionlog', 2);
  await sampleColl('solarvoice contentanalytics', 1);
  await sampleColl('recommended mix playlist', 1);

  console.log('\n=== JOURNEY PROGRESSION collections ===');
  await sampleColl('participant mode checklist', 2);
  await sampleColl('accelerated evolution level', 2);
  await sampleColl('participant AEL', 1);
  await sampleColl('modes', 2);

  console.log('\n=== participant metadata (the CQRS projection) ===');
  const pm = await db.collection('participant metadata').limit(2).get();
  pm.forEach((d) => console.log('  [participant metadata] ' + d.id + ': ' + shape(d.data())));
  const pmCount = await db.collection('participant metadata').count().get();
  console.log('  [participant metadata] count: ' + pmCount.data().count);

  // modes catalog — the ordered list the mode engine rolls up (need the names + sequence).
  console.log('\n=== modes catalog (ordered) ===');
  const modes = await db.collection('modes').get();
  const ml = [];
  modes.forEach((d) => { const x = d.data(); ml.push({ mode: x.mode, sequence: x.sequence }); });
  ml.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  console.log('  ' + JSON.stringify(ml));

  // content analytics: what fields mark "watched/completed"? distribution of `status` over a sample.
  console.log('\n=== content analytics status/type distribution (1000-sample) ===');
  const ca = await db.collection('content analytics').limit(1000).get();
  const cs = {}, ct = {};
  ca.forEach((d) => { const x = d.data(); cs[x.status || '?'] = (cs[x.status || '?'] || 0) + 1; ct[x.type || x.platform_name || '?'] = (ct[x.type || x.platform_name || '?'] || 0) + 1; });
  console.log('  status: ' + JSON.stringify(cs));
  console.log('  type/platform: ' + JSON.stringify(ct));

  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
