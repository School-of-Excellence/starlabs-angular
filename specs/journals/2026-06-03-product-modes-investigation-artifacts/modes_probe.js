// READ-ONLY: Product Modes model — modes catalog, products.mode/modeflow, deliverymode, delivery sequences. No writes.
const admin = require('firebase-admin');
const sl = admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) }).firestore();
function shape(o,d=0){ if(o===null)return'null'; if(Array.isArray(o))return`array[${o.length}]`; const t=typeof o; if(t!=='object'){ if(t==='string')return`str(${o.length})`; return t;} if(o._seconds!==undefined||o.toDate)return'ts'; if(o._path||o._firestore)return'ref'; if(d>2)return'obj'; return '{'+Object.keys(o).slice(0,40).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}'; }
const top=(o,k=30)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([v,c])=>`${v}:${c}`).join('  ');
(async()=>{
  // 1) modes catalog (all)
  console.log('=== modes catalog (all docs) ===');
  (await sl.collection('modes').get()).forEach(d=>{const x=d.data(); console.log(`  [${d.id}] mode="${x.mode}" sequence=${x.sequence} info=${x.info===null?'null':JSON.stringify(x.info).slice(0,40)}`);});

  // 2) products.mode + modeflow
  console.log('\n=== products: mode tally + modeflow presence (all 104) ===');
  const ps = await sl.collection('products').get();
  const modeTally={}; let withModeflow=0, withMode=0; const sampleModeflow=[]; const keysUnion=new Set();
  ps.forEach(d=>{const x=d.data(); Object.keys(x).forEach(k=>keysUnion.add(k));
    const m = x.mode!==undefined&&x.mode!==null&&x.mode!==''?String(x.mode):'(none)'; modeTally[m]=(modeTally[m]||0)+1; if(m!=='(none)')withMode++;
    if(x.modeflow!==undefined&&x.modeflow!==null){ withModeflow++; if(sampleModeflow.length<3) sampleModeflow.push({id:d.id, mode:x.mode, modeflow:x.modeflow}); }
  });
  console.log('  products with mode:', withMode, '/ with modeflow:', withModeflow);
  console.log('  mode values:', top(modeTally));
  console.log('  product field union:', [...keysUnion].join(', '));
  console.log('  modeflow samples:'); sampleModeflow.forEach(s=>console.log(`    [${s.id}] mode="${s.mode}" modeflow=${shape(s.modeflow)}`));
  // 2 full product shapes
  console.log('  product shapes (2):'); ps.docs.slice(0,2).forEach(d=>console.log(`    [${d.id}] ${shape(d.data())}`));

  // 3) participantsproduct.deliverymode (sample 3000 recent)
  console.log('\n=== participantsproduct.deliverymode tally (3000 recent by subscriptionstart) ===');
  const pp = await sl.collection('participantsproduct').orderBy('subscriptionstart','desc').limit(3000).get().catch(async()=>await sl.collection('participantsproduct').limit(3000).get());
  const dmTally={}; pp.forEach(d=>{const v=d.data().deliverymode; const k=(v===undefined||v===null||v==='')?'(none)':String(v); dmTally[k]=(dmTally[k]||0)+1;});
  console.log('  deliverymode:', top(dmTally));

  // 4) product mode config + product mode playlist
  for(const c of ['product mode config','product mode playlist']){
    try{ const s=await sl.collection(c).limit(2).get(); const cnt=(await sl.collection(c).count().get()).data().count;
      console.log(`\n=== ${c} (count=${cnt}) ===`); s.forEach(d=>console.log(`  [${d.id}] ${shape(d.data())}`)); }catch(e){ console.log(`\n${c}: ERR ${e.message.slice(0,40)}`);}
  }

  // 5) productToDeliverySequence deliveryoptions deep
  console.log('\n=== productToDeliverySequence — deliveryoptions structure (2) ===');
  const pds = await sl.collection('productToDeliverySequence').limit(2).get();
  pds.forEach(d=>{const x=d.data(); console.log(`  [${d.id}] product=${x.product&&x.product.path?x.product.path:x.product} deliveryoptions=${shape(x.deliveryoptions)}`);
    if(Array.isArray(x.deliveryoptions)&&x.deliveryoptions[0]) console.log('     option[0]:', shape(x.deliveryoptions[0]));});
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
