// Drill: for the recurring arc-mismatch pattern, reconstruct the HISTORICAL day-knobs from the
// per-mode statusdate timestamps and compare to the product's CURRENT knobs. READ-ONLY.
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const DAY = 86400000;
const toMs = (v) => v == null ? null : (v.toMillis ? v.toMillis() : (v.toDate ? v.toDate().getTime() : (v instanceof Date ? v.getTime() : null)));
const ymd = (v) => { const m = toMs(v); return m == null ? '—' : new Date(m).toISOString().slice(0, 10); };

// representative users with the mismatch (from mode_audit run)
const USERS = ['446C4lLw2gDOHProZE2P', 'J0A39MX1WjCdNk3Z8Isg', '8dS0yAL0EmGWQC80DKld'];

(async () => {
  for (const pid of USERS) {
    const snap = await db.collection('participantsproduct').where('profileid', '==', pid).where('status', '==', 'completed').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const prod = d.productref ? (await db.doc(d.productref.path).get()).data() : {};
      const I = prod.integrationdays, P = prod.performancedays, E = prod.extendedperformancedays;
      const comp = toMs(d.statusdate?.completed);
      if (!comp) continue;
      const dSince = Math.floor((Date.now() - comp) / DAY);
      const curSum = (I ?? 0) + (P ?? 0) + (E ?? 0);
      // only the interesting ones: terminal/Extended where the arc verdict was off
      if (!['After Extended Performance Mode', 'Extended Performance Mode'].includes(d.mode)) continue;
      const expected = dSince < I ? 'Integration' : dSince < I + P ? 'Performance' : dSince < I + P + E ? 'Extended' : 'AfterExt';
      if ((d.mode === 'After Extended Performance Mode' && expected === 'AfterExt') || (d.mode === 'Extended Performance Mode' && expected === 'Extended')) continue; // skip matches
      const sd = d.statusdate || {};
      // reconstruct historical intervals from per-mode entry timestamps
      const tI = toMs(sd.integrationmode), tP = toMs(sd.performancemode), tE = toMs(sd.extendedperformancemode), tA = toMs(sd.afterextendedperformancemode);
      const histI = (tI != null && tP != null) ? Math.round((tP - tI) / DAY) : null;
      const histP = (tP != null && tE != null) ? Math.round((tE - tP) / DAY) : null;
      const histE = (tE != null && tA != null) ? Math.round((tA - tE) / DAY) : null;
      console.log('─'.repeat(90));
      console.log(`${pid}  ${prod.product}  mode=${d.mode}  dSince=${dSince}  expected=${expected}`);
      console.log(`  CURRENT knobs  I/P/E = ${I}/${P}/${E}  (sum ${curSum})   product.modified=${ymd(prod.modified) }  product.created=${ymd(prod.created)}`);
      console.log(`  HISTORICAL intervals from statusdate = ${histI ?? '?'}/${histP ?? '?'}/${histE ?? '?'}  (sum ${[histI,histP,histE].every(x=>x!=null)?histI+histP+histE:'?'})`);
      console.log(`  statusdate: completed=${ymd(sd.completed)} integ=${ymd(sd.integrationmode)} perf=${ymd(sd.performancemode)} ext=${ymd(sd.extendedperformancemode)} afterext=${ymd(sd.afterextendedperformancemode)}`);
      console.log(`  *completeddate variants: integ=${ymd(sd.integrationcompleteddate)} perf=${ymd(sd.performancecompleteddate)} ext=${ymd(sd.extendedperformancecompleteddate)}`);
      console.log(`  nextmode=${d.nextmode} nextmodedate=${ymd(d.nextmodedate)}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
