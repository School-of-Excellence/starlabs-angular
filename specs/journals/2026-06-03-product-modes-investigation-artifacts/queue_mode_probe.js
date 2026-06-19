const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const refId=r=>r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null);
(async()=>{
  const pmode={}; (await sl.collection('products').get()).forEach(d=>pmode[d.id]=d.data().mode||'(none)');
  // which product MODES generate queue tokens? (queue = "queue-in-event" delivery)
  const byMode={}; let n=0, noref=0;
  for await (const d of sl.collection('queue_token').stream()){ const x=d.data(); n++;
    const m = pmode[refId(x.productref)] || (x.productref?'(unknown-product)':'(no productref)'); if(!x.productref)noref++;
    byMode[m]=(byMode[m]||0)+1; }
  console.log('queue_token total:', n, '| no productref:', noref);
  console.log('queue tokens by PRODUCT MODE:');
  Object.entries(byMode).sort((a,b)=>b[1]-a[1]).forEach(([m,c])=>console.log(`  ${String(c).padStart(5)}  ${m}`));
  // appointments: which modes? appointments link via productid sometimes
  console.log('\nappointments by product mode (sample 2000):');
  const am={}; const asnap=await sl.collection('appointments').limit(2000).get();
  asnap.forEach(d=>{const x=d.data(); const m=pmode[refId(x.productid)]||(x.productid?'(unknown)':'(no productid)'); am[m]=(am[m]||0)+1;});
  Object.entries(am).sort((a,b)=>b[1]-a[1]).forEach(([m,c])=>console.log(`  ${String(c).padStart(5)}  ${m}`));
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
