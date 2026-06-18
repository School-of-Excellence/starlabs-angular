// READ-ONLY exploration to (1) list recently-USED queues with participant counts,
// (2) reverse-engineer the live assignment -> queue/stage/specialists join,
// (3) dump schemas so the full study can compute peak specialists/studio per stage.
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const ms = (v) => v?.toMillis ? v.toMillis() : 0;
const ymd = (v) => v?.toDate ? v.toDate().toISOString().slice(0, 10) : '—';

(async () => {
  // ---- 1. queues with token counts + recency ----
  const qg = await db.collection('queue generation').get();
  const meta = {};
  qg.docs.forEach(d => { const x = d.data(); meta[d.id] = { name: (x.description || x.introdescription || d.id), start: ms(x.queuestartdate), startY: ymd(x.queuestartdate), endY: ymd(x.queueenddate), stages: (x.stages || []).length, vars: (x.queuevariation || []).length }; });
  const qt = await db.collection('queue_token').select('queueref').get();
  const cnt = {};
  qt.docs.forEach(d => { const q = d.data().queueref?.id; if (q) cnt[q] = (cnt[q] || 0) + 1; });
  const rows = Object.entries(cnt).map(([id, c]) => ({ id, c, ...meta[id] })).filter(r => r.name);
  console.log('=== queues sorted by START DATE (most recent first), with participant counts ===');
  rows.sort((a, b) => (b.start || 0) - (a.start || 0)).slice(0, 18).forEach(r => {
    console.log(`  ${String(r.c).padStart(4)} ppl | start ${r.startY} end ${r.endY} | ${r.stages}st ${r.vars}var | ${String(r.name).slice(0, 46)}  [${r.id}]`);
  });
  console.log('\n=== queues with >100 participants (candidates), by size ===');
  rows.filter(r => r.c > 100).sort((a, b) => b.c - a.c).forEach(r => console.log(`  ${String(r.c).padStart(4)} ppl | start ${r.startY} | ${r.stages}st ${r.vars}var | ${String(r.name).slice(0, 46)}  [${r.id}]`));

  // ---- 2. live assignment schema + join fields ----
  console.log('\n=== live assignment — sample doc field map (to find queue/stage/specialist join) ===');
  const la = await db.collection('live assignment').limit(4).get();
  la.docs.forEach((d, i) => {
    const x = d.data();
    const keys = Object.keys(x);
    console.log(`  doc${i} keys: ${keys.join(', ')}`);
    const pa = x.participantsactivity || {};
    console.log(`     stage=${x.stage} studioid=${x.studioid} queueref=${x.queueref?.id || x.queueid || '—'} status=${x.status}`);
    console.log(`     participantsactivity keys (specialists): ${Object.keys(pa).length}  sample=${JSON.stringify(Object.keys(pa).slice(0, 3))}`);
    console.log(`     participants/profile fields: ${keys.filter(k => /profile|participant|token|queue|studio|specialist|changeagent|person|date|time|stage/i.test(k)).map(k => k + '=' + (typeof x[k] === 'object' ? '{obj}' : String(x[k]).slice(0, 24))).join(' | ')}`);
  });

  // ---- 3. how to link a live assignment to a queue: try queue_token.liveassignmentid + queue stage log ----
  console.log('\n=== link test: queue stage log schema (has liveassignmentid + queueref + stage?) ===');
  const qsl = await db.collection('queue stage log').limit(2).get();
  qsl.docs.forEach((d, i) => console.log(`  qsl${i} keys: ${Object.keys(d.data()).join(', ')}`));

  // ---- 4. arena participant schema (the provider/BIG roster per stage) ----
  console.log('\n=== arena participant — sample (provider roster / stagerole) ===');
  const ap = await db.collection('arena participant').limit(3).get();
  ap.docs.forEach((d, i) => { const x = d.data(); console.log(`  ap${i} keys: ${Object.keys(x).join(', ')}`); console.log(`     stagerole=${x.stagerole} pairingmode=${x.pairingmode} studioid=${x.studioid || '—'} queue/event=${x.queueref?.id || x.eventref?.id || '—'}`); });

  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
