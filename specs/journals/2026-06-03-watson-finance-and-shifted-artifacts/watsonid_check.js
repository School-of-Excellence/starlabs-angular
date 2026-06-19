// READ-ONLY: is an explicit watson id still written on recent records, or abandoned (email-only)? No writes.
const admin = require('firebase-admin');
const slcred = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
const sl = admin.initializeApp({ credential: admin.credential.cert(slcred) }).firestore();
const toY = t => (t&&t.toDate ? t.toDate().getUTCFullYear() : (typeof t==='string'&&t.length>=4 ? +t.slice(0,4) : null));
const watsonKeys = o => Object.keys(o).filter(k=>/watson/i.test(k));
const nonEmpty = v => v!==undefined && v!==null && v!=='' ;

async function analyze(col, dateField){
  const snap = await sl.collection(col).get();
  const byYear = {}; // year -> {total, withWatson}
  const keyTally = {};
  let total=0, withWatson=0;
  snap.forEach(d=>{ const x=d.data(); total++;
    const wk = watsonKeys(x); const has = wk.some(k=>nonEmpty(x[k]));
    wk.forEach(k=>{ keyTally[k]=keyTally[k]||{present:0,filled:0}; keyTally[k].present++; if(nonEmpty(x[k])) keyTally[k].filled++; });
    if(has) withWatson++;
    const y = toY(x[dateField]) || toY(x.subscriptionstart) || toY(x.purchasedate) || 0;
    const b = byYear[y] = byYear[y] || {total:0, withWatson:0};
    b.total++; if(has) b.withWatson++;
  });
  return {col,total,withWatson,keyTally,byYear};
}
(async()=>{
  for (const [col,df] of [['participantjourneyproduct','subscriptionstart'],['participantsproduct','subscriptionstart']]) {
    const r = await analyze(col, df);
    console.log(`\n## ${r.col}: ${r.total} docs, ${r.withWatson} (${Math.round(100*r.withWatson/r.total)}%) carry a watson* field`);
    console.log('   watson keys:', Object.entries(r.keyTally).map(([k,v])=>`${k} present=${v.present}/filled=${v.filled}`).join('  ') || '(none)');
    console.log('   by year (withWatson/total):');
    Object.keys(r.byYear).sort().forEach(y=>{ const b=r.byYear[y]; console.log(`     ${y||'?'}: ${b.withWatson}/${b.total} (${Math.round(100*b.withWatson/b.total)}%)`); });
  }
  // also: does profile_data carry a stable watson id?
  const pd = await sl.collection('profile_data').limit(200).get();
  let pdw=0; const pdkeys={}; pd.forEach(d=>{ const wk=watsonKeys(d.data()); if(wk.length){pdw++; wk.forEach(k=>pdkeys[k]=(pdkeys[k]||0)+1);} });
  console.log(`\n## profile_data (200 sample): ${pdw} carry watson* field; keys: ${JSON.stringify(pdkeys)}`);
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
