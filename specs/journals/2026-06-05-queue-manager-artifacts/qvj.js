const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='L3rqCrqDBsshd7HM5YRn';
const ms=v=>v?.toMillis?v.toMillis():0;
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const varName={};
 for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();if(s.exists)varName[id]=s.data().variationname;}
 // tokens
 const toks=(await db.collection('queue_token').where('queueref','==',db.collection('queue generation').doc(QID)).select('variationid','profile_id').get()).docs.map(d=>d.data());
 const pids=new Set(toks.map(t=>t.profile_id));
 // journeys
 const pjp=await db.collection('participantjourneyproduct').select('profileid','journeyref','journeystatus','purchasedate').get();
 const jbp={};const jrefIds=new Set();
 pjp.docs.forEach(d=>{const x=d.data();if(!pids.has(x.profileid))return;(jbp[x.profileid]=jbp[x.profileid]||[]).push(x);if(x.journeyref?.id)jrefIds.add(x.journeyref.id);});
 const jn={};
 await Promise.all([...jrefIds].map(async id=>{const s=await db.collection('journey').doc(id).get();if(s.exists)jn[id]=s.data().journey||s.data().journeyname||id;}));
 // group tokens by variation
 const byVar={};toks.forEach(t=>{(byVar[t.variationid??'none']=byVar[t.variationid??'none']||[]).push(t);});
 const order=Object.entries(byVar).sort((a,b)=>b[1].length-a[1].length);
 for(const [vid,vt] of order){
   const jc={};let ret=0,wh=0;
   vt.forEach(t=>{const h=jbp[t.profile_id]||[];if(h.length){wh++;
     const cur=h.slice().sort((a,b)=>ms(b.purchasedate)-ms(a.purchasedate))[0];
     const nm=jn[cur.journeyref?.id]||'(unknown)';jc[nm]=(jc[nm]||0)+1;
     if(h.some(e=>e.journeystatus==='completed'))ret++;}});
   const tops=Object.entries(jc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`${k}:${v}`).join(', ');
   console.log(`\n${varName[vid]||vid}  (${vt.length} ppl)`);
   console.log(`  journeys: ${tops}`);
   console.log(`  returning(>=1 completed journey): ${ret}/${wh} = ${wh?Math.round(100*ret/wh):0}%`);
 }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
