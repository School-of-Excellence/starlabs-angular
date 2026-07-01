const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='L3rqCrqDBsshd7HM5YRn';
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const sp=qg.stageproperty||{};
 // variation id -> name
 const varName={};
 for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();if(s.exists)varName[id]=s.data().variationname;}
 const resolve=v=>{const id=typeof v==='string'?v:(v?.id||v?.path?.split('/').pop());return varName[id]||(typeof v==='string'?v:JSON.stringify(v)).slice(0,18);};
 console.log('=== RAW nextstage config per stage (the dynamic buttons) ===\n');
 (qg.stages||[]).forEach((st,i)=>{
   const p=sp[st]||{}; const ns=Array.isArray(p.nextstage)?p.nextstage:[];
   if(ns.length===0) return; // only stages with buttons
   console.log(`STAGE ${i}: ${st}`);
   ns.forEach(b=>{
     const vars=(b.variations&&b.variations.length)?b.variations.map(resolve).join(', '):'ALL variations';
     console.log(`   -> ${b.stage}${b.markascompleted?'  [marks DONE]':''}   cta="${(b.calltoaction||'').slice(0,28)}"   scope: ${vars}`);
   });
   console.log('');
 });
 // also dump one button's full keys to confirm schema
 const sample=(sp[(qg.stages||[]).find(s=>(sp[s]?.nextstage||[]).length)]||{}).nextstage[0];
 console.log('button schema keys:', Object.keys(sample||{}));
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
