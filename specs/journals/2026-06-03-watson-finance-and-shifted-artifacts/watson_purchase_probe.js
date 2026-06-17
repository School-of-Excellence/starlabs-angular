// READ-ONLY: Watson purchase/history model + locate "shifted". No writes. Key never printed.
const admin = require('firebase-admin');
const fs = require('fs');
const NBSP = String.fromCharCode(160);
const raw = fs.readFileSync('/Users/solar/Downloads/watson_servicefile.json','utf8');
const cred = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1).split(NBSP).join(' '));
admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();
function shape(o,d=0){ if(o===null)return'null'; if(Array.isArray(o))return`array[${o.length}]`; const t=typeof o; if(t!=='object'){ if(t==='string')return`str(${o.length})`; return t;} if(o._seconds!==undefined||o.toDate)return'ts'; if(o._path||o._firestore)return'ref'; if(d>1)return'obj'; return '{'+Object.keys(o).slice(0,40).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}'; }
const top=(o,k=15)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([v,c])=>`${v}:${c}`).join('  ');

async function statusScan(col, limit=900){
  const tally={}; const shiftHits=[];
  const snap=await db.collection(col).limit(limit).get();
  snap.forEach(d=>{ const x=d.data();
    for(const k of Object.keys(x)){
      const v=x[k];
      if(typeof v==='string'){
        if(/status|state|stage|type|action|change/i.test(k)){ const key=`${k}=${v}`; tally[key]=(tally[key]||0)+1; }
        if(/shift/i.test(v)) shiftHits.push(`${d.id}: ${k}="${v}"`);
      }
    }
  });
  return {n:snap.size, tally, shiftHits};
}
(async()=>{
  for(const c of ['ParticipantPurchases','ParticipantPurchases_history','Journey','addproduct']){
    const snap=await db.collection(c).limit(2).get();
    console.log(`\n## ${c}`); snap.forEach(d=>console.log(`   [${d.id}] ${shape(d.data())}`));
  }
  console.log('\n=== status-like field VALUES (sample 900) + any "shift*" value ===');
  for(const c of ['ParticipantPurchases','ParticipantPurchases_history','Journey']){
    const r=await statusScan(c);
    console.log(`\n# ${c} (n=${r.n})`);
    console.log('  status-like:', top(r.tally));
    console.log('  shift* hits:', r.shiftHits.length, r.shiftHits.slice(0,5).join(' | '));
  }
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
