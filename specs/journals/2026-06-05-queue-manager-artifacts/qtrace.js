const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');const fs=require('fs');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='L3rqCrqDBsshd7HM5YRn';const ms=v=>v?.toMillis?v.toMillis():0;
const has=v=>v!=null&&!(Array.isArray(v)&&!v.length)&&v!=='';
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const sp=qg.stageproperty||{};
 // stage kind
 const kind={};(qg.stages||[]).forEach(s=>{const p=sp[s]||{};
   if(has(p.studiowidgets)||has(p.compulsoryactivity))kind[s]='spec';
   else if(['form','link','videoask','evolutionmapping'].includes(p.actiontype))kind[s]='self';
   else kind[s]='gate';});
 ['Self Evolution Report','In-person Completed','Completed'].forEach(s=>{if(kind[s]!=null)kind[s]='done';});
 // variations
 const varName={};for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();if(s.exists)varName[id]=s.data().variationname;}
 const rid=v=>typeof v==='string'?v:(v?.id||v?.path?.split('/').pop());
 // tokens + journeys
 const toks=(await db.collection('queue_token').where('queueref','==',db.collection('queue generation').doc(QID)).select('variationid','profile_id').get()).docs.map(d=>d.data());
 const pids=new Set(toks.map(t=>t.profile_id));
 const pjp=await db.collection('participantjourneyproduct').select('profileid','journeyref','purchasedate').get();
 const jbp={};const jref=new Set();
 pjp.docs.forEach(d=>{const x=d.data();if(!pids.has(x.profileid))return;(jbp[x.profileid]=jbp[x.profileid]||[]).push(x);if(x.journeyref?.id)jref.add(x.journeyref.id);});
 const jn={};await Promise.all([...jref].map(async id=>{const s=await db.collection('journey').doc(id).get();if(s.exists)jn[id]=s.data().journey||id;}));
 const byVar={};toks.forEach(t=>{(byVar[t.variationid]=byVar[t.variationid]||[]).push(t);});
 const out={stageKind:kind,order:qg.stages,variations:[]};
 for(const vid of Object.keys(byVar)){
   const vt=byVar[vid];const jc={};
   vt.forEach(t=>{const h=jbp[t.profile_id]||[];if(h.length){const cur=h.slice().sort((a,b)=>ms(b.purchasedate)-ms(a.purchasedate))[0];const nm=jn[cur.journeyref?.id]||'(unknown)';jc[nm]=(jc[nm]||0)+1;}});
   const edges=[];
   (qg.stages||[]).forEach(s=>{const ns=Array.isArray(sp[s]?.nextstage)?sp[s].nextstage:[];
     ns.filter(b=>!b.variations||!b.variations.length||b.variations.map(rid).includes(vid)).forEach(b=>{
       edges.push({from:s,to:b.stage,label:(b.calltoaction||'').slice(0,22),done:!!b.markascompleted,loop:b.stage===s});});});
   out.variations.push({id:vid,name:varName[vid]||vid,ppl:vt.length,
     journeys:Object.entries(jc).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({n,c})),edges});
 }
 out.variations.sort((a,b)=>b.ppl-a.ppl);
 fs.writeFileSync('qtrace_out.json',JSON.stringify(out));
 console.log('wrote qtrace_out.json ·',out.variations.length,'variations · stages',out.order.length);
 out.variations.forEach(v=>console.log(`  ${v.name} (${v.ppl}) edges=${v.edges.length} journeys=${v.journeys.map(j=>j.n+':'+j.c).join(',')}`));
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
