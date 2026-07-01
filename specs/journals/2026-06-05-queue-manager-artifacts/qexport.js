const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');const fs=require('fs');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID='L3rqCrqDBsshd7HM5YRn';
const rid=v=>typeof v==='string'?v:(v?.id||v?.path?.split('/').pop()||String(v));
(async()=>{
 const qg=(await db.collection('queue generation').doc(QID).get()).data();
 const variations=[];
 for(const vid of (qg.queuevariation||[])){const id=typeof vid==='string'?vid:vid?.id;if(!id)continue;
   const s=await db.collection('queue variation').doc(id).get();
   variations.push({id,variationname:s.exists?s.data().variationname:id,stages:s.exists?(s.data().stages||[]):[]});}
 const sp=qg.stageproperty||{};const stageproperty={};
 (qg.stages||[]).forEach(st=>{const p=sp[st]||{};
   stageproperty[st]={
     selfmovable:!!p.selfmovable,
     actiontype:p.actiontype??null,
     studiowidgets:Array.isArray(p.studiowidgets)?p.studiowidgets:[],
     compulsoryactivity:(p.compulsoryactivity&&typeof p.compulsoryactivity==='object')?p.compulsoryactivity:null,
     participantform:Array.isArray(p.participantform)?p.participantform:[],
     enablezoom:!!p.enablezoom,
     nextstage:(Array.isArray(p.nextstage)?p.nextstage:[]).map(b=>({stage:b.stage,calltoaction:b.calltoaction||'',markascompleted:!!b.markascompleted,variations:(b.variations||[]).map(rid)}))
   };});
 const cfg={stages:qg.stages||[],queuevariation:variations,stageproperty};
 const P='/Users/solar/solarcode/ah/starlabs-angular/specs/queue-flow-visualizer/prototype.html';
 let html=fs.readFileSync(P,'utf8');const before=html.length;
 // robust: from `const SAMPLE = ` to the `;` that precedes the model-section comment
 html=html.replace(/const SAMPLE = [\s\S]*?;(\s*\/\* -+ model)/, 'const SAMPLE = '+JSON.stringify(cfg)+';$1');
 if(html.length===before){console.error('!! SAMPLE block not replaced');process.exit(1);}
 fs.writeFileSync(P,html);
 const nx=Object.values(stageproperty).reduce((a,p)=>a+p.nextstage.length,0);
 const selfmv=Object.values(stageproperty).filter(p=>p.selfmovable).length;
 console.log('injected:',cfg.stages.length,'stages ·',variations.length,'variations (with stage paths) ·',nx,'operator transitions ·',selfmv,'self-movable stages');
})().catch(e=>{console.error(e);process.exit(1);});
