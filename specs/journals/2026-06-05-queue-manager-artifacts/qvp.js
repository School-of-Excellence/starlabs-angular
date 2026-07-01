const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');const fs=require('fs');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='vuvS7eBgTxLKufnesLQT';
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const base=qg.stages||[];
 // participant counts per variation (from tokens)
 const toks=(await db.collection('queue_token').where('queueref','==',db.collection('queue generation').doc(QID)).select('variationid').get()).docs.map(d=>d.data());
 const vc={};toks.forEach(t=>vc[t.variationid??'none']=(vc[t.variationid??'none']||0)+1);
 const vars=[];
 for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();if(!s.exists)continue;const d=s.data();
   vars.push({id,name:d.variationname,participants:vc[id]||0,stages:d.stages||[]});}
 vars.sort((a,b)=>b.participants-a.participants);
 fs.writeFileSync('qvp_out.json',JSON.stringify({base,vars},null,2));
 console.log('BASE STAGES ('+base.length+'):');base.forEach((s,i)=>console.log('  '+i+' '+s));
 console.log('\nVARIATION PATHS (col indices into base; * = stage not in base):');
 vars.forEach(v=>{const idx=v.stages.map(st=>{const i=base.indexOf(st);return i<0?st+'*':i;});console.log(`  [${String(v.participants).padStart(3)}] ${v.name.padEnd(28)} -> ${idx.join(' > ')}`);});
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
