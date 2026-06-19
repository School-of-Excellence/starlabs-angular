// READ-ONLY probe of the Queue Manager personalization model (concept group #3).
// Validates: which per-participant personalization dimensions are actually populated,
// the stage-config knobs in use, and shows real participants differing at each stage.
// NO writes. Stays out of ATC (atc_*, queue_atc_generation).
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
const has = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && v && Object.keys(v).length === 0) && v !== '';

(async () => {
  // ---------- 1. queue generation (config) ----------
  const qgSnap = await db.collection('queue generation').get();
  console.log('=== queue generation (config) ===');
  console.log('total queues:', qgSnap.size);
  // stageproperty knob usage across all stages of all queues
  const knobCount = {}; let totalStages = 0; const stageCountDist = [];
  let withVariation = 0, withPkgElig = 0, commsDisabled = 0;
  qgSnap.docs.forEach(d => {
    const x = d.data();
    const stages = x.stages || [];
    stageCountDist.push(stages.length);
    const sp = x.stageproperty || {};
    if (has(x.queuevariation)) withVariation++;
    if (has(x.packageeligibility)) withPkgElig++;
    if (x.iscommunicationsdisabled) commsDisabled++;
    Object.values(sp).forEach(p => {
      totalStages++;
      Object.keys(p || {}).forEach(k => { if (has(p[k])) knobCount[k] = (knobCount[k] || 0) + 1; });
    });
  });
  stageCountDist.sort((a, b) => a - b);
  console.log('stages per queue: min', stageCountDist[0], 'median', stageCountDist[Math.floor(stageCountDist.length / 2)], 'max', stageCountDist[stageCountDist.length - 1]);
  console.log('queues with variations:', withVariation, '| with packageeligibility:', withPkgElig, '| comms-disabled:', commsDisabled);
  console.log('stageproperty knob usage (of', totalStages, 'stage-property blocks):');
  Object.entries(knobCount).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ', k.padEnd(24), c, pct(c, totalStages)));

  // ---------- 2. queue variation ----------
  const qvSnap = await db.collection('queue variation').get();
  let qvAtc = 0; const qvStageLens = [];
  qvSnap.docs.forEach(d => { const x = d.data(); if (has(x.atcmodel)) qvAtc++; if (x.stages) qvStageLens.push(x.stages.length); });
  console.log('\n=== queue variation ===');
  console.log('total variations:', qvSnap.size, '| with atcmodel override:', qvAtc, pct(qvAtc, qvSnap.size));

  // ---------- 3. queue_token field population (the personalization dimensions) ----------
  const qtSnap = await db.collection('queue_token')
    .select('profile_id', 'queueref', 'variationid', 'currentstage', 'status', 'tokenstatus', 'stagestatus',
      'queueposition', 'preassigned', 'selectedstageslot', 'avtest', 'notes', 'tags', 'people_involved',
      'stagerole', 'liveassignmentid', 'studioid').get();
  console.log('\n=== queue_token (', qtSnap.size, 'tokens) — personalization-field population ===');
  const N = qtSnap.size;
  const f = { variationid: 0, preassigned: 0, selectedstageslot: 0, avtest: 0, notes: 0, tags: 0, people_involved: 0, stagerole: 0, liveassignmentid: 0, queueposition: 0, studioid: 0 };
  const statusDist = {}, tokenStatusDist = {}, stageDist = {};
  const byQueue = {};
  qtSnap.docs.forEach(d => {
    const x = d.data();
    for (const k of Object.keys(f)) if (has(x[k])) f[k]++;
    statusDist[x.status ?? 'null'] = (statusDist[x.status ?? 'null'] || 0) + 1;
    tokenStatusDist[x.tokenstatus ?? 'null'] = (tokenStatusDist[x.tokenstatus ?? 'null'] || 0) + 1;
    stageDist[x.currentstage ?? 'null'] = (stageDist[x.currentstage ?? 'null'] || 0) + 1;
    const qid = x.queueref?.id; if (qid) { byQueue[qid] = byQueue[qid] || []; byQueue[qid].push(x); }
  });
  console.log('field population:');
  Object.entries(f).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ', k.padEnd(18), c, pct(c, N)));
  console.log('status dist:', JSON.stringify(statusDist));
  console.log('tokenstatus dist:', JSON.stringify(tokenStatusDist));
  console.log('top currentstage values:', JSON.stringify(Object.entries(stageDist).sort((a, b) => b[1] - a[1]).slice(0, 12)));

  // ---------- 4. pick the queue with the most tokens; show personalization variety ----------
  const topQueue = Object.entries(byQueue).sort((a, b) => b[1].length - a[1].length)[0];
  if (topQueue) {
    const [qid, toks] = topQueue;
    const qg = qgSnap.docs.find(d => d.id === qid)?.data() || {};
    console.log('\n=== SAMPLE QUEUE:', (qg.description || qid).slice(0, 50), '(', toks.length, 'tokens ) ===');
    console.log('stages:', JSON.stringify((qg.stages || []).slice(0, 12)));
    // variation spread
    const varSpread = {}; toks.forEach(t => varSpread[t.variationid ?? 'none'] = (varSpread[t.variationid ?? 'none'] || 0) + 1);
    console.log('variation spread across participants:', JSON.stringify(varSpread));
    // show 5 participants' per-stage personalization
    console.log('5 participants — how their stage experience differs:');
    for (const t of toks.slice(0, 5)) {
      const slots = t.selectedstageslot ? Object.keys(t.selectedstageslot) : [];
      const pre = t.preassigned ? Object.keys(t.preassigned) : [];
      console.log(`  ${String(t.profile_id).slice(0, 10)} | stage=${t.currentstage} | var=${t.variationid ?? 'none'} | status=${t.status ?? 'null'} | pos=${t.queueposition ?? '-'} | slots=[${slots.join(',')}] | preassigned=[${pre.join(',')}] | avtest=${t.avtest ?? '-'} | tags=${has(t.tags) ? (t.tags || []).join('/') : '-'}`);
    }
  }

  // ---------- 5. arena participant (stagerole / pairingmode — open question) ----------
  try {
    const apSnap = await db.collection('arena participant').select('stagerole', 'pairingmode').limit(8000).get();
    const roleDist = {}, pairDist = {};
    apSnap.docs.forEach(d => { const x = d.data(); roleDist[x.stagerole ?? 'null'] = (roleDist[x.stagerole ?? 'null'] || 0) + 1; pairDist[x.pairingmode ?? 'null'] = (pairDist[x.pairingmode ?? 'null'] || 0) + 1; });
    console.log('\n=== arena participant (', apSnap.size, ') — stagerole / pairingmode ===');
    console.log('stagerole:', JSON.stringify(Object.entries(roleDist).sort((a, b) => b[1] - a[1]).slice(0, 10)));
    console.log('pairingmode:', JSON.stringify(pairDist));
  } catch (e) { console.log('arena participant probe skipped:', e.message); }

  // ---------- 6. live assignment (activities / atcmodel) ----------
  try {
    const laSnap = await db.collection('live assignment').select('participantsactivity', 'bonusactivity', 'atcmodel', 'status').limit(8000).get();
    let pa = 0, ba = 0, atc = 0; const laStatus = {};
    laSnap.docs.forEach(d => { const x = d.data(); if (has(x.participantsactivity)) pa++; if (has(x.bonusactivity)) ba++; if (has(x.atcmodel)) atc++; laStatus[x.status ?? 'null'] = (laStatus[x.status ?? 'null'] || 0) + 1; });
    console.log('\n=== live assignment (', laSnap.size, ') ===');
    console.log('with participantsactivity (mandatory):', pa, pct(pa, laSnap.size), '| bonusactivity:', ba, pct(ba, laSnap.size), '| atcmodel:', atc, pct(atc, laSnap.size));
    console.log('status dist:', JSON.stringify(laStatus));
  } catch (e) { console.log('live assignment probe skipped:', e.message); }

  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
