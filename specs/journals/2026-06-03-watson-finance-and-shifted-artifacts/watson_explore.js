// READ-ONLY exploration of the Watson production project (purchase/payment). No writes. Key never printed.
const admin = require('firebase-admin');
const fs = require('fs');
function loadCred(){
  const raw = fs.readFileSync('/Users/solar/Downloads/watson_servicefile.json', 'utf8');
  // strip "Service Account for Watson Production: " prefix; normalize NBSP (char 160) indentation to real spaces
  const NBSP = String.fromCharCode(160);
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1).split(NBSP).join(' ');
  return JSON.parse(body);
}
const cred = loadCred();
admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();
function shape(o,d=0){ if(o===null)return'null'; if(Array.isArray(o))return`array[${o.length}]`; const t=typeof o; if(t!=='object'){ if(t==='string')return`str(${o.length})`; return t;} if(o._seconds!==undefined||o.toDate)return'ts'; if(o._path||o._firestore)return'ref'; if(d>1)return'obj'; return '{'+Object.keys(o).slice(0,30).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}'; }
(async()=>{
  console.log('PROJECT:', cred.project_id);
  console.log('\n=== ROOT COLLECTIONS ===');
  const cols = await db.listCollections();
  for (const c of cols) { let cnt='?'; try{ cnt=(await c.count().get()).data().count; }catch(e){} console.log(`  ${c.id}  (count=${cnt})`); }
  const cands = ['Participants','ParticipantPurchases','ParticipantPayments','Payment Schedule'];
  console.log('\n=== PURCHASE/PAYMENT COLLECTION SHAPES ===');
  for (const name of cands) {
    try { const snap = await db.collection(name).limit(2).get();
      if (snap.empty) { console.log(`\n## ${name}: (empty/missing)`); continue; }
      console.log(`\n## ${name}`); snap.forEach(d => console.log(`   [${d.id}] ${shape(d.data())}`));
    } catch(e){ console.log(`\n## ${name}: ERR ${e.message.slice(0,50)}`); }
  }
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
