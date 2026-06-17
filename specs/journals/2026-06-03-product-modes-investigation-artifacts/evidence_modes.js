const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const refId=r=>r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null);
const toD=t=>t&&t.toDate?t.toDate():null;
(async()=>{
  const prod={}; (await sl.collection('products').get()).forEach(d=>{const x=d.data(); prod[d.id]={mode:x.mode, mf:Array.isArray(x.modeflow)?x.modeflow:[], name:x.product};});

  // 1) product mode config: what each MODE shows (widgets + modetips) — evidence of behavior
  console.log('=== product mode config: widgets + modetips per MODE ===');
  const byMode={}; (await sl.collection('product mode config').get()).forEach(d=>{const x=d.data(); const m=x.mode||'(none)'; (byMode[m]=byMode[m]||[]).push(x);});
  for(const [m,arr] of Object.entries(byMode)){
    const w=new Set(), tips=new Set();
    arr.forEach(x=>{(x.widgets||[]).forEach(v=>w.add(typeof v==='object'?JSON.stringify(v):String(v))); (x.modetips||[]).forEach(v=>tips.add((typeof v==='object'?JSON.stringify(v):String(v)).slice(0,80)));});
    console.log(`\n# ${m} (n=${arr.length})`);
    console.log('  widgets:', [...w].slice(0,8).join(' | ')||'(none)');
    console.log('  modetips:', [...tips].slice(0,3).join('  ||  ')||'(none)');
  }

  // 2) participantsproduct: mode/nextmode/nextmodedate/days + does nextmode follow modeflow?
  console.log('\n=== participantsproduct: mode→nextmode vs modeflow, nextmodedate timing (sample) ===');
  const snap=await sl.collection('participantsproduct').orderBy('subscriptionstart','desc').limit(400).get();
  let shown=0, follow=0, hasMode=0, nmFuture=0, nmPast=0, nmNull=0; const now=new Date();
  snap.forEach(d=>{const x=d.data(); if(!x.mode) return; hasMode++;
    const pm=prod[refId(x.productref)]; const mf=pm?pm.mf:[]; const idx=mf.indexOf(x.mode); const succ=idx>=0?mf[idx+1]:undefined;
    const ok = x.nextmode && succ && x.nextmode===succ; if(ok)follow++;
    const nd=toD(x.nextmodedate); if(nd==null)nmNull++; else if(nd>now)nmFuture++; else nmPast++;
    if(shown<14){shown++; console.log(`  mode="${x.mode}" next="${x.nextmode||'-'}" ${ok?'(=modeflow succ✓)':succ?`(modeflow succ="${succ}")`:''} nextdate=${nd?nd.toISOString().slice(0,10)+(nd>now?' future':' PAST'):'null'} days=${x.days??'-'} delivery=${x.deliverymode||'-'}`);}
  });
  console.log(`  with mode set: ${hasMode} | nextmode==modeflow-successor: ${follow}/${hasMode} | nextmodedate future:${nmFuture} past:${nmPast} null:${nmNull}`);

  // 3) rollup: participant metadata.participantmode vs the participant's participantsproduct.mode set
  console.log('\n=== participant metadata.participantmode vs per-product modes (6 profiles) ===');
  const pids=[...new Set(snap.docs.map(d=>d.data().profileid).filter(Boolean))].slice(0,6);
  for(const pid of pids){
    const meta=await sl.doc('participant metadata/'+pid).get();
    const pmMode=meta.exists?meta.data().participantmode:'(no meta)';
    const prods=await sl.collection('participantsproduct').where('profileid','==',pid).limit(30).get();
    const modes={}; prods.forEach(d=>{const m=d.data().mode||'(none)'; modes[m]=(modes[m]||0)+1;});
    console.log(`  ${pid}: participantmode="${pmMode}"  product-modes={${Object.entries(modes).map(([k,v])=>k+':'+v).join(', ')}}`);
  }
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
