const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const RX=/appoint|slot|avail|booking|calendar|schedul|coach/i;
(async()=>{
  const cols=await db.listCollections();
  const names=cols.map(c=>c.id);
  const hits=names.filter(n=>RX.test(n));
  console.log('=== ALL root collections ('+names.length+') ===');
  console.log(names.sort().join('\n'));
  console.log('\n=== appointment-related candidates ===');
  for(const c of hits){
    try{
      const agg=await db.collection(c).count().get();
      const s=await db.collection(c).limit(1).get();
      const keys=s.empty?[]:Object.keys(s.docs[0].data()).sort();
      console.log(`\n### "${c}" — ${agg.data().count} docs`);
      console.log('   keys:', keys.join(', ')||'(empty)');
    }catch(e){ console.log(`### "${c}" ERR ${e.message}`); }
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
