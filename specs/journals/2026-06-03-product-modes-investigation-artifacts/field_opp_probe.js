const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const refId=r=>r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null);
const tally=a=>{const t={};a.forEach(v=>{const k=(v===undefined||v===null||v==='')?'(none)':String(v);t[k]=(t[k]||0)+1;});return Object.entries(t).sort((x,y)=>y[1]-x[1]).slice(0,18).map(([k,c])=>`${k}:${c}`).join('  ');};
const ne=v=>v!==undefined&&v!==null&&v!=='';
(async()=>{
  const pmode={}; const invProducts=[];
  (await sl.collection('products').get()).forEach(d=>{const x=d.data(); pmode[d.id]=x.mode; if(x.mode==='Investment Mode') invProducts.push({id:d.id,name:x.product});});

  // #3 Investment Mode reality
  console.log('=== #3 Investment Mode product(s):', invProducts.map(p=>`${p.name}`).join(', '));
  let invEnroll=0; const ip=new Set(invProducts.map(p=>p.id));
  (await sl.collection('participantsproduct').where('deliverymode','==','Investment Mode').get()).forEach(()=>invEnroll++);
  console.log('   participantsproduct deliverymode=Investment Mode:', invEnroll);

  // #2 field opportunities: provider role fields on queue tokens
  console.log('\n=== #2 queue_token provider/role fields (stream all) ===');
  const provFields=['diagnosticperson','cwperson','diagnosticmentoring','diagnosticshadowing','cwmentoring','cwshadowing'];
  const cnt={}; provFields.forEach(f=>cnt[f]=0); let withPeople=0, n=0; const providerIds=new Set();
  for await (const d of sl.collection('queue_token').stream()){ const x=d.data(); n++;
    provFields.forEach(f=>{ if(ne(x[f])){cnt[f]++; if(typeof x[f]==='string')providerIds.add(x[f]);} });
    if(Array.isArray(x.people_involved)&&x.people_involved.length){ withPeople++; x.people_involved.forEach(p=>{const id=refId(p)||(typeof p==='string'?p:null); if(id)providerIds.add(id);}); }
  }
  console.log('   tokens:', n, '| with people_involved:', withPeople);
  console.log('   provider fields populated:', provFields.map(f=>`${f}:${cnt[f]}`).join('  '));
  console.log('   distinct provider ids collected:', providerIds.size);

  // arena participant stagerole / pairingmode
  console.log('\n=== arena participant: stagerole + pairingmode ===');
  const roles=[], pm=[]; (await sl.collection('arena participant').get()).forEach(d=>{const x=d.data(); if(Array.isArray(x.stagerole))x.stagerole.forEach(r=>roles.push(r)); pm.push(x.pairingmode);});
  console.log('   stagerole values:', tally(roles));
  console.log('   pairingmode:', tally(pm));

  // do providers hold a Big Mode product? (field opportunity = BIG participant delivering)
  console.log('\n=== are providers BIG-mode participants? (sample 70 provider ids) ===');
  const sample=[...providerIds].slice(0,70); let bigProv=0, anyProd=0; const provModeTally={};
  for(const pid of sample){
    const s=await sl.collection('participantsproduct').where('profileid','==',pid).limit(20).get();
    const modes=new Set(); s.forEach(d=>{const m=pmode[refId(d.data().productref)]; if(m)modes.add(m);});
    if(s.size) anyProd++; if(modes.has('Big Mode'))bigProv++;
    modes.forEach(m=>provModeTally[m]=(provModeTally[m]||0)+1);
  }
  console.log(`   of ${sample.length} providers: ${anyProd} have products, ${bigProv} hold a Big Mode product`);
  console.log('   provider product-mode spread:', Object.entries(provModeTally).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`${m}:${c}`).join('  '));
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
