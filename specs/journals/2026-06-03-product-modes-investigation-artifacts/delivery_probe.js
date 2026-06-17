const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
const refId=r=>r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null);
function shape(o,d=0){if(o===null)return'null';if(Array.isArray(o))return`array[${o.length}]`;const t=typeof o;if(t!=='object'){if(t==='string')return`"${o}"`;return t;}if(o._seconds!==undefined||o.toDate)return'ts';if(o._path||o._firestore)return'ref';if(d>2)return'obj';return '{'+Object.keys(o).slice(0,25).map(k=>`${k}:${shape(o[k],d+1)}`).join(', ')+'}';}
const tally=a=>{const t={};a.forEach(v=>{const k=(v===undefined||v===null||v==='')?'(none)':String(v);t[k]=(t[k]||0)+1;});return Object.entries(t).sort((x,y)=>y[1]-x[1]).map(([k,c])=>`${k}:${c}`).join('  ');};
(async()=>{
  const ps=await sl.collection('products').get();
  const pmode={}, names={};
  const dt=[], dp=[], cross={};
  ps.forEach(d=>{const x=d.data(); pmode[d.id]=x.mode; names[d.id]=x.product;
    dt.push(x.deliverytype); dp.push(x.deliveryplanning);
    const key=`${x.mode} | plan=${x.deliveryplanning||'-'} | type=${x.deliverytype||'-'}`; cross[key]=(cross[key]||0)+1;});
  console.log('=== products.deliverytype:', tally(dt));
  console.log('=== products.deliveryplanning:', tally(dp));
  console.log('\n=== cross-tab  mode | deliveryplanning | deliverytype  (count) ===');
  Object.entries(cross).sort((a,b)=>b[1]-a[1]).forEach(([k,c])=>console.log(`  ${c.toString().padStart(3)}  ${k}`));

  console.log('\n=== productToDeliverySequence: deliverytype values + sequence content ===');
  const pds=await sl.collection('productToDeliverySequence').get();
  const dts=[]; const seqShapes={};
  pds.forEach(d=>{const x=d.data(); (x.deliveryoptions||[]).forEach(o=>{ dts.push(o.deliverytype); });});
  console.log('  deliveryoptions.deliverytype:', tally(dts));
  let shown=0; pds.forEach(d=>{const x=d.data(); if(shown<3 && Array.isArray(x.deliveryoptions)&&x.deliveryoptions[0]){shown++;
    const o=x.deliveryoptions[0]; console.log(`  product=${names[refId(x.product)]||refId(x.product)} mode=${pmode[refId(x.product)]} deliverytype="${o.deliverytype}" seq[0]=${shape((o.deliverysequence||[])[0])}`);}});

  // which products are queue-delivered? queue generation references journeys/events, not products directly — check its product/mode linkage
  console.log('\n=== queue generation: does it reference products/modes? (sample keys) ===');
  const qg=await sl.collection('queue generation').limit(3).get();
  qg.forEach(d=>{const x=d.data(); const k=Object.keys(x).filter(k=>/product|mode|journey|atc|arena|event/i.test(k)); console.log(`  [${d.id}] ${k.map(kk=>`${kk}=${Array.isArray(x[kk])?'array['+x[kk].length+']':JSON.stringify(x[kk]).slice(0,30)}`).join('  ')}`);});
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
