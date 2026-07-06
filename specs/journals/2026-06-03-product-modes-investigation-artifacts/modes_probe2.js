const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const top=(o,k=20)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([v,c])=>`${v}:${c}`).join('  ');
(async()=>{
  console.log('=== modeflow[] contents (2 products) ===');
  const ps=await sl.collection('products').limit(6).get();
  let shown=0; ps.forEach(d=>{const x=d.data(); if(Array.isArray(x.modeflow)&&x.modeflow.length&&shown<2){shown++; console.log(`  product mode="${x.mode}" modeflow=`, JSON.stringify(x.modeflow).slice(0,400));}});
  console.log('\n=== participant metadata.participantmode tally (2500 sample) ===');
  const pm=await sl.collection('participant metadata').limit(2500).get();
  const t={}; pm.forEach(d=>{const v=d.data().participantmode; const k=(v===undefined||v===null||v==='')?'(none)':String(v); t[k]=(t[k]||0)+1;});
  console.log('  participantmode:', top(t));
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
