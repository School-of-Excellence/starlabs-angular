const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='L3rqCrqDBsshd7HM5YRn';
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const sp=qg.stageproperty||{};
 const varName={},varList=[];
 for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();if(s.exists){varName[id]=s.data().variationname;varList.push({id,name:s.data().variationname});}}
 const rid=v=>typeof v==='string'?v:(v?.id||v?.path?.split('/').pop());
 // participant counts
 const toks=(await db.collection('queue_token').where('queueref','==',db.collection('queue generation').doc(QID)).select('variationid').get()).docs.map(d=>d.data());
 const vc={};toks.forEach(t=>vc[t.variationid]=(vc[t.variationid]||0)+1);
 varList.sort((a,b)=>(vc[b.id]||0)-(vc[a.id]||0));
 // build per-variation transitions
 for(const v of varList){
   console.log(`\n========== ${v.name}  (${vc[v.id]||0} ppl) ==========`);
   (qg.stages||[]).forEach(st=>{
     const ns=Array.isArray(sp[st]?.nextstage)?sp[st].nextstage:[];
     const avail=ns.filter(b=>!b.variations||b.variations.length===0||b.variations.map(rid).includes(v.id));
     if(avail.length===0)return;
     const outs=avail.map(b=>{const loop=b.stage===st;return `${loop?'↺ ':''}${b.stage}${b.markascompleted?'✓':''}`;});
     console.log(`  ${st}  →  ${outs.join('  |  ')}`);
   });
 }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
