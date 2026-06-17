// READ-ONLY probe of config-driven collections (queue + dynamic studio + general config). No ATC. No writes.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();
function shape(o,d=0){ if(o===null)return'null'; if(Array.isArray(o))return`array[${o.length}]`; const t=typeof o; if(t!=='object'){ if(t==='string')return`str(${o.length})`; return t; } if(o._seconds!==undefined||o.toDate)return'ts'; if(o._path||o._firestore)return'ref'; if(d>1)return'obj'; return '{'+Object.keys(o).slice(0,30).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}'; }
const COLS=['queue_token','queue generation','queue variation','queue stage log','queue studio pairing','cohorts queue planner','arenaspace','arena space','arena participant','live assignment','openviduroom','modes','classify','dashboard','productToDeliverySequence','procedures','tier access config'];
(async()=>{
  for(const c of COLS){
    try{
      const cnt=(await db.collection(c).count().get()).data().count;
      console.log(`\n## "${c}"  count=${cnt}`);
      const snap=await db.collection(c).limit(2).get();
      let i=0; snap.forEach(d=>{ if(i++<2){ console.log(`   [${d.id}] ${shape(d.data())}`); } });
    }catch(e){ console.log(`\n## "${c}"  ERR ${e.message.slice(0,50)}`); }
  }
  // queue_token deeper: the stage config that drives the dynamic queue
  console.log('\n=== queue_token deep sample (the runtime state machine) ===');
  const qt=(await db.collection('queue_token').limit(3).get());
  qt.forEach(d=>{ const x=d.data(); console.log(`  [${d.id}] currentstage=${JSON.stringify(x.currentstage)?.slice(0,60)} queuemode=${x.queuemode} stages=${Array.isArray(x.queuestages)?x.queuestages.length:typeof x.queuestages}`);
    if(Array.isArray(x.queuestages)&&x.queuestages[0]) console.log('     stage[0]:', shape(x.queuestages[0])); });
  console.log('\nDONE');
  process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
