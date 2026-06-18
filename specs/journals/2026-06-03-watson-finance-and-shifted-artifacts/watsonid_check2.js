const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const toY=t=>(t&&t.toDate?t.toDate().getUTCFullYear():(typeof t==='string'&&t.length>=4?+t.slice(0,4):null));
const wk=o=>Object.keys(o).filter(k=>/watson/i.test(k));
const ne=v=>v!==undefined&&v!==null&&v!=='';
(async()=>{
  for(const col of ['journeyproductpurchase','salesleads']){
    let snap; try{ snap=await sl.collection(col).get(); }catch(e){ console.log(`${col}: ERR ${e.message.slice(0,40)}`); continue; }
    const byYear={}; const keyTally={}; let total=0, withW=0;
    snap.forEach(d=>{ const x=d.data(); total++; const ks=wk(x); const has=ks.some(k=>ne(x[k]));
      ks.forEach(k=>{keyTally[k]=keyTally[k]||{present:0,filled:0};keyTally[k].present++;if(ne(x[k]))keyTally[k].filled++;});
      if(has)withW++; const y=toY(x.date)||toY(x.purchasedate)||toY(x.created)||toY(x.subscriptionstart)||toY(x.salesdate)||0;
      const b=byYear[y]=byYear[y]||{t:0,w:0}; b.t++; if(has)b.w++; });
    console.log(`\n## ${col}: ${total} docs, ${withW} (${Math.round(100*withW/(total||1))}%) carry watson* ; keys: ${JSON.stringify(keyTally)}`);
    console.log('   recent years:', Object.keys(byYear).sort().slice(-5).map(y=>`${y}:${byYear[y].w}/${byYear[y].t}`).join('  '));
  }
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
