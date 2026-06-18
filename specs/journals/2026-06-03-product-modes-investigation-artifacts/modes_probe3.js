const admin=require('firebase-admin');
const sl=admin.initializeApp({credential:admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json'))}).firestore();
(async()=>{
  const ps=await sl.collection('products').get();
  const rows=[]; ps.forEach(d=>{const x=d.data(); if(Array.isArray(x.modeflow)&&x.modeflow.length) rows.push({mode:x.mode, mf:x.modeflow});});
  console.log('products with modeflow:', rows.length);

  // Q1: is modeflow[0] == products.mode ?
  const head=rows.filter(r=>r.mf[0]===r.mode).length;
  console.log(`\nQ1  modeflow[0] == products.mode : ${head}/${rows.length}`);
  const mism=rows.filter(r=>r.mf[0]!==r.mode).slice(0,5);
  if(mism.length) mism.forEach(r=>console.log(`   mismatch: mode="${r.mode}" head="${r.mf[0]}"`));

  // Q2: distinct FULL modeflow patterns
  const full={}; rows.forEach(r=>{const k=r.mf.join(' > '); (full[k]=full[k]||{n:0,modes:new Set()}); full[k].n++; full[k].modes.add(r.mode);});
  console.log(`\nQ2  distinct FULL modeflow patterns: ${Object.keys(full).length}`);
  Object.entries(full).sort((a,b)=>b[1].n-a[1].n).forEach(([k,v])=>console.log(`   (${v.n}x) modes={${[...v.modes].join(', ')}}  :: ${k}`));

  // Q3: distinct TAIL patterns (modeflow[1:]) — is the engagement sequence shared regardless of A?
  const tail={}; rows.forEach(r=>{const k=r.mf.slice(1).join(' > '); (tail[k]=tail[k]||{n:0,heads:new Set()}); tail[k].n++; tail[k].heads.add(r.mf[0]);});
  console.log(`\nQ3  distinct TAIL (modeflow[1:]) patterns: ${Object.keys(tail).length}`);
  Object.entries(tail).sort((a,b)=>b[1].n-a[1].n).forEach(([k,v])=>console.log(`   (${v.n}x) heads={${[...v.heads].join(', ')}}  :: ${k.slice(0,120)}`));

  // Q4: per delivery-mode A -> set of distinct modeflow patterns
  console.log('\nQ4  per delivery mode (A) -> # distinct modeflow patterns:');
  const byMode={}; rows.forEach(r=>{(byMode[r.mode]=byMode[r.mode]||new Set()).add(r.mf.join(' > '));});
  Object.entries(byMode).forEach(([m,set])=>console.log(`   ${m}: ${set.size} distinct pattern(s) across products`));
  console.log('\nDONE');process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
