const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
(async()=>{
  console.log('=== modes catalog — full INFO (intent), sorted by sequence ===');
  const ms=[]; (await sl.collection('modes').get()).forEach(d=>ms.push({...d.data(),_id:d.id}));
  ms.sort((a,b)=>(a.sequence??99)-(b.sequence??99)).forEach(m=>console.log(`\n[seq ${m.sequence}] ${m.mode}\n   info: ${m.info?String(m.info).replace(/\n/g,' '):'(none)'}`));

  console.log('\n\n=== product day-duration fields (the pacing knobs), by mode ===');
  const ps=await sl.collection('products').get();
  const dayKeys=new Set(); ps.forEach(d=>Object.keys(d.data()).forEach(k=>{if(/days|duration/i.test(k))dayKeys.add(k);}));
  console.log('  duration field names found:', [...dayKeys].join(', '));
  const byMode={};
  ps.forEach(d=>{const x=d.data(); const m=x.mode||'(none)'; (byMode[m]=byMode[m]||[]).push(x);});
  for(const [m,arr] of Object.entries(byMode)){
    const s=arr[0];
    const vals=[...dayKeys].map(k=>`${k}=${s[k]}`).join('  ');
    console.log(`  ${m} (n=${arr.length}) sample: ${vals}`);
  }
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
