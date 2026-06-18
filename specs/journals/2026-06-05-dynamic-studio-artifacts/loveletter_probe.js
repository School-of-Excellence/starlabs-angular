const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
(async()=>{
  for(const c of ['love letter','ask AH']){
    const agg=await db.collection(c).count().get();
    const s=await db.collection(c).limit(1).get();
    const keys=s.empty?[]:Object.keys(s.docs[0].data()).sort();
    console.log(`"${c}": ${agg.data().count} docs | keys: ${keys.join(', ')}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
