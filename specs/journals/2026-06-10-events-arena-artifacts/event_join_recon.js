const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const show=(v)=>{ if(v&&v.path)return 'REF:'+v.path; if(v&&v._seconds)return 'TS'; return JSON.stringify(v); };
(async()=>{
  for(const c of ['event participation request','event rsvp','event participant zones','event zones','journey']){
    const s=await db.collection(c).limit(1).get();
    if(s.empty){console.log(c,'(empty)');continue;}
    const x=s.docs[0].data();
    console.log('### '+c+' sample:');
    Object.keys(x).sort().forEach(k=>console.log('   '+k+' = '+show(x[k])));
  }
  // journey name field
  const j=await db.collection('journey').limit(3).get();
  console.log('\njourney name candidates:'); j.forEach(d=>console.log('  ',d.id,'->',JSON.stringify(d.data().journeyname||d.data().name||d.data().journey||Object.keys(d.data()).slice(0,5))));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
