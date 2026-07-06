const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const rid=r=>r&&r.id?r.id:(r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null));
const fam=n=>{ n=(n||'').toLowerCase();
  if(/b!g|big|installation genius|accelerator/.test(n))return 'B!G';
  if(/up!|evolution prep|evolution mapping|mini up/.test(n))return 'uP!';
  if(/cpm|conversational programming/.test(n))return 'CPM';
  if(/ctd/.test(n))return 'CTD';
  if(/a&h|winning heart|legacy|leadership/.test(n))return 'A&H/Leadership';
  if(/prodig/.test(n))return 'Prodigies';
  return 'Other'; };
(async()=>{
  const prodName={}; (await db.collection('products').get()).forEach(d=>prodName[d.id]=d.data().product);
  const epr=await db.collection('event participation request').get();
  // journeyref non-null prevalence
  let withJ=0; epr.forEach(d=>{if(d.data().journeyref)withJ++;});
  console.log('journeyref non-null on',withJ,'of',epr.size,'requests ('+Math.round(withJ/epr.size*100)+'%) — confirms product-grain mapping');
  const F={};
  epr.forEach(d=>{const x=d.data(); const f=fam(prodName[rid(x.productref)]); const st=x.status;
    const o=F[f]||(F[f]={total:0,attended:0,unattended:0,requested:0,approved:0,prods:new Set()});
    o.total++; o.prods.add(prodName[rid(x.productref)]); if(o[st]!==undefined)o[st]++;});
  console.log('\n=== JOURNEY FAMILY → events participation ===');
  Object.entries(F).sort((a,b)=>b[1].total-a[1].total).forEach(([f,v])=>{
    console.log(`  ${f}: ${v.total} reqs · ${Math.round(v.attended/v.total*100)}% attended · ${Math.round(v.unattended/v.total*100)}% no-show · ${Math.round((v.requested+v.approved)/v.total*100)}% pending · ${v.prods.size} products`);
  });
  // event-type split: classify products as readiness-gate (low att) vs live-arena (high att)
  const prodStat={};
  epr.forEach(d=>{const x=d.data(); const p=prodName[rid(x.productref)]; const o=prodStat[p]||(prodStat[p]={t:0,a:0}); o.t++; if(x.status==='attended')o.a++;});
  const gates=[],arenas=[];
  Object.entries(prodStat).filter(([,v])=>v.t>=100).forEach(([p,v])=>{const r=v.a/v.t; (r<0.35?gates:arenas).push(`${p} (${Math.round(r*100)}%, n=${v.t})`);});
  console.log('\n=== EVENT-TYPE SPLIT (products n>=100) ===');
  console.log(' READINESS GATES (<35% attended — virtual funnel steps):'); gates.forEach(g=>console.log('   - '+g));
  console.log(' LIVE ARENAS (>=35% attended — the in-person destinations):'); arenas.forEach(a=>console.log('   - '+a));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
