const admin = require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
// studio-runtime collections only — NO ATC collections
const want=['live assignment','arena participant','studioZoomLink','studio','live studio','studio session','queue_token','queue stage log','arena event','arena participant log'];
(async()=>{
  for(const c of want){
    try{
      const agg=await db.collection(c).count().get();
      const n=agg.data().count;
      const s=await db.collection(c).limit(1).get();
      let keys=[];
      if(!s.empty){ keys=Object.keys(s.docs[0].data()).sort(); }
      console.log(`\n### "${c}" — ${n} docs`);
      console.log('   keys:', keys.join(', ') || '(empty/none)');
    }catch(e){ console.log(`\n### "${c}" — ERR ${e.message}`); }
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
