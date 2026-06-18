const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
function shape(o,d=0){if(o===null)return'null';if(Array.isArray(o))return`array[${o.length}]`;const t=typeof o;if(t!=='object'){if(t==='string')return`"${o.length>30?o.slice(0,30)+'…':o}"`;return t;}if(o._seconds!==undefined||o.toDate)return'ts';if(o._path||o._firestore)return'ref';if(d>2)return'obj';return '{'+Object.keys(o).slice(0,30).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}';}
(async()=>{
  for(const c of ['participant mode checklist','participant mode','mode checklist','participantmodechecklist']){
    try{ const cnt=(await sl.collection(c).count().get()).data().count; const s=await sl.collection(c).limit(3).get();
      console.log(`\n## "${c}"  count=${cnt}`); s.forEach(d=>console.log(`   [${d.id}] ${shape(d.data())}`)); }
    catch(e){ console.log(`\n## "${c}"  ERR ${e.message.slice(0,40)}`); }
  }
  process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
