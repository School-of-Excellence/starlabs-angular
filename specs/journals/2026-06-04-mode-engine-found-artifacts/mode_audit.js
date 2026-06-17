// READ-ONLY audit of the participant-mode engine tables (validated/02 §7e) against production logs.
// Picks >=10 recent users with >=5 consumed products, replays the day-arc math, rollup, and F3 check.
// NO writes. Stays entirely out of ATC collections.
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
const fs = require('fs');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DAY = 1000 * 60 * 60 * 24;
const ARC = ['Integration Mode', 'Performance Mode', 'Extended Performance Mode', 'After Extended Performance Mode'];
const EVENT_MODES = ['Event Mode', 'Installation Event Mode', 'Big Mode'];

const toMs = (v) => v == null ? null : (v.toMillis ? v.toMillis() : (v instanceof Date ? v.getTime() : (v.toDate ? v.toDate().getTime() : (typeof v === 'number' ? v : null))));
const toDate = (v) => { const m = toMs(v); return m == null ? null : new Date(m); };
const ymd = (v) => { const d = toDate(v); return d ? d.toISOString().slice(0, 10) : '—'; };

(async () => {
  // 0. engine reference clock: /Atestdate/date overrides "now" if present (engine :12-17)
  let NOW = new Date();
  let clockNote = 'real now';
  const atest = await db.doc('/Atestdate/date').get();
  if (atest.exists && atest.data().date) { NOW = toDate(atest.data().date); clockNote = 'Atestdate override'; }

  // 1. modes sequence (engine :190)
  const modeSeq = (await db.collection('modes').orderBy('sequence').get()).docs.map(d => d.data().mode);

  // 2. read participantsproduct (selected fields), group by profile
  console.log('Reading participantsproduct…');
  const ppSnap = await db.collection('participantsproduct')
    .select('profileid', 'productref', 'mode', 'nextmode', 'nextmodedate', 'status', 'statusdate', 'deliverymode', 'deliveryplanning', 'participanttentativedate', 'sequenceorder')
    .get();
  console.log('  total rows:', ppSnap.size);
  const byProfile = {};
  ppSnap.docs.forEach(d => {
    const x = d.data(); if (!x.profileid) return;
    (byProfile[x.profileid] = byProfile[x.profileid] || []).push({ id: d.id, ...x });
  });

  const recency = (list) => Math.max(0, ...list.flatMap(p => [
    ...Object.values(p.statusdate || {}).map(toMs).filter(Boolean),
    toMs(p.participanttentativedate) || 0,
  ]));
  const consumed = (list) => list.filter(p => ['initiated', 'ongoing', 'completed'].includes(p.status)).length;

  const candidates = Object.entries(byProfile)
    .map(([id, list]) => ({ id, n: list.length, consumed: consumed(list), recent: recency(list) }))
    .filter(c => c.consumed >= 5)
    .sort((a, b) => b.recent - a.recent)
    .slice(0, 12);

  console.log(`\nUsers with >=5 consumed products: picking top ${candidates.length} by recency. Engine clock = ${clockNote} (${NOW.toISOString().slice(0,10)})\n`);

  // 3. fetch product knobs for all referenced products
  const prodIds = new Set();
  candidates.forEach(c => byProfile[c.id].forEach(p => { if (p.productref) prodIds.add(p.productref.id); }));
  const prodMap = {};
  await Promise.all([...prodIds].map(async pid => {
    const s = await db.collection('products').doc(pid).get();
    if (s.exists) { const d = s.data(); prodMap[pid] = { product: d.product, mode: d.mode, deliveryplanning: d.deliveryplanning, I: d.integrationdays, P: d.performancedays, E: d.extendedperformancedays }; }
  }));

  // expected arc mode from days-since-completion (engine :106-133)
  const expectedArc = (daysSince, I, P, E) => {
    if ([I, P, E].some(v => v == null)) return null; // engine no-op
    if (daysSince < I) return 'Integration Mode';
    if (daysSince < I + P) return 'Performance Mode';
    if (daysSince < I + P + E) return 'Extended Performance Mode';
    return 'After Extended Performance Mode';
  };
  const cumEnd = (mode, I, P, E) => ({ 'Integration Mode': I, 'Performance Mode': I + P, 'Extended Performance Mode': I + P + E, 'After Extended Performance Mode': null }[mode]);

  const report = [];
  const tally = { arcChecked: 0, MATCH: 0, LAG: 0, MISMATCH: 0, knobsMissing: 0, f3: 0, rollupChecked: 0, rollupMatch: 0, rollupMismatch: 0 };

  for (const c of candidates) {
    const list = byProfile[c.id];
    const pd = (await db.collection('profile_data').doc(c.id).get()).data() || {};
    const pm = (await db.collection('participant metadata').doc(c.id).get()).data() || {};
    const rows = [];

    for (const p of list) {
      const prod = prodMap[p.productref?.id] || {};
      const r = { product: prod.product || p.productref?.id || '?', status: p.status ?? 'null', mode: p.mode ?? 'null', nextmode: p.nextmode ?? 'null', nextmodedate: ymd(p.nextmodedate), knobs: `${prod.I ?? '·'}/${prod.P ?? '·'}/${prod.E ?? '·'}`, verdict: '' };
      // F3 check
      if (EVENT_MODES.includes(p.mode) && p.nextmode === 'Integration Mode' && toMs(p.nextmodedate) && toMs(p.nextmodedate) < NOW.getTime()) { r.verdict = 'F3-STUCK'; tally.f3++; }
      // arc audit (only completed rows)
      if (p.status === 'completed' && p.statusdate?.completed) {
        const compMs = toMs(p.statusdate.completed);
        const daysSince = Math.floor((NOW.getTime() - compMs) / DAY);
        r.daysSince = daysSince;
        const exp = expectedArc(daysSince, prod.I, prod.P, prod.E);
        if (exp == null) { r.verdict = r.verdict || 'knobs-missing'; tally.knobsMissing++; }
        else if (ARC.includes(p.mode)) {
          tally.arcChecked++;
          r.expected = exp;
          // cron-lag tolerance: if within 1 day of a window boundary, allow
          const boundaries = [prod.I, prod.I + prod.P, prod.I + prod.P + prod.E];
          const nearBoundary = boundaries.some(b => Math.abs(daysSince - b) <= 1);
          if (p.mode === exp) { r.verdict = 'MATCH'; tally.MATCH++; }
          else if (nearBoundary) { r.verdict = `LAG(exp ${exp.split(' ')[0]})`; tally.LAG++; }
          else { r.verdict = `MISMATCH(exp ${exp.split(' ')[0]})`; tally.MISMATCH++; }
          // nextmodedate check
          const end = cumEnd(p.mode, prod.I, prod.P, prod.E);
          if (end != null && compMs) { const expNmd = new Date(compMs + end * DAY); r.expNmd = expNmd.toISOString().slice(0, 10); }
        }
      }
      rows.push(r);
    }

    // rollup check (engine :201-228): sort present modes by sequence -> headline by customerstatus
    const present = [...new Set(list.map(p => p.mode).filter(m => m != null && m !== undefined))];
    const sorted = present.slice().sort((a, b) => modeSeq.indexOf(a) - modeSeq.indexOf(b));
    const cs = pm.customerstatus;
    let expHeadline;
    if (cs === 'active') expHeadline = sorted.length ? sorted[0] : 'Journey Planning Mode';
    else if (cs === 'non active') expHeadline = 'Exploration Mode';
    else if ([null, undefined, '', 'discontinued'].includes(cs)) expHeadline = null;
    else expHeadline = null; // none/banned/late fall-through
    const actualHeadline = pd.participantmode ?? null;
    tally.rollupChecked++;
    const rollupOk = (expHeadline ?? null) === (actualHeadline ?? null);
    if (rollupOk) tally.rollupMatch++; else tally.rollupMismatch++;

    report.push({ profileid: c.id, name: pd.name || pm.name || '?', consumed: c.consumed, total: c.n, customerstatus: cs ?? 'null', profile_participantmode: actualHeadline, pm_participantmode: pm.participantmode ?? null, expectedHeadline: expHeadline ?? null, rollup: rollupOk ? 'OK' : 'MISMATCH', sortedModes: sorted, rows });
  }

  // ---- print ----
  for (const u of report) {
    console.log('═'.repeat(100));
    console.log(`${u.name}  [${u.profileid}]  consumed ${u.consumed}/${u.total} products  ·  customerstatus=${u.customerstatus}`);
    console.log(`  headline: profile_data=${u.profile_participantmode}  participant metadata=${u.pm_participantmode}  expected=${u.expectedHeadline}  → ROLLUP ${u.rollup}`);
    console.log(`  sorted modes (by sequence): [${u.sortedModes.join(', ')}]`);
    console.log('  ' + 'product'.padEnd(26) + 'status'.padEnd(11) + 'mode'.padEnd(28) + 'I/P/E'.padEnd(12) + 'dSince'.padEnd(8) + 'verdict');
    for (const r of u.rows) {
      console.log('  ' + String(r.product).slice(0, 25).padEnd(26) + String(r.status).padEnd(11) + String(r.mode).slice(0, 27).padEnd(28) + String(r.knobs).padEnd(12) + String(r.daysSince ?? '—').padEnd(8) + r.verdict + (r.expNmd && r.nextmodedate !== r.expNmd ? `  [nmd actual ${r.nextmodedate} vs exp ${r.expNmd}]` : ''));
    }
  }
  console.log('═'.repeat(100));
  console.log('\n=== AUDIT TALLY ===');
  console.log(JSON.stringify(tally, null, 2));
  console.log(`\nArc accuracy: ${tally.MATCH} exact + ${tally.LAG} within-1-day-of-boundary out of ${tally.arcChecked} arc rows checked; ${tally.MISMATCH} true mismatches.`);
  console.log(`Rollup accuracy: ${tally.rollupMatch}/${tally.rollupChecked} users' headline matches the customerstatus rule.`);
  console.log(`F3 (stuck event-mode rows, nextmode=Integration & nextmodedate in past): ${tally.f3}.`);

  fs.writeFileSync('/Users/solar/Downloads/svstats/mode_audit_output.json', JSON.stringify({ clockNote, now: NOW.toISOString(), tally, report }, null, 2));
  console.log('\nWrote mode_audit_output.json');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
