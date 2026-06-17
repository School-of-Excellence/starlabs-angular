const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const rid=r=>r&&r.id?r.id:(r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null));
const ms=t=>t&&t.toMillis?t.toMillis():(t&&t._seconds?t._seconds*1000:0);
const T=(o,k)=>{k=k==null?'(none)':k;o[k]=(o[k]||0)+1;};
(async()=>{
  // ---- preload name maps ----
  const evName={}, evDate={};
  (await db.collection('event collection').get()).forEach(d=>{evName[d.id]=d.data().name;evDate[d.id]=ms(d.data().start_date);});
  const prodName={}, prodJourney={};
  (await db.collection('products').get()).forEach(d=>{const x=d.data();prodName[d.id]=x.product; if(x.journeyref)prodJourney[d.id]=rid(x.journeyref); if(x.journey)prodJourney[d.id]=rid(x.journey);});
  const jName={};
  (await db.collection('journey').get()).forEach(d=>{jName[d.id]=d.data().journey||d.data().journeyname;});
  // journey-to-product fallback for product->journey
  try{(await db.collection('journey-to-product').get()).forEach(d=>{const x=d.data(); const j=rid(x.journeyref||x.journey); const ps=x.products||x.productlist||[]; (Array.isArray(ps)?ps:[]).forEach(p=>{const pid=rid(p); if(pid&&j&&!prodJourney[pid])prodJourney[pid]=j;});});}catch(e){}
  const zoneName={};
  (await db.collection('event zones').get()).forEach(d=>{zoneName[d.id]=d.data().zonename;});
  const journeyOf=pref=>{const pid=rid(pref); const j=prodJourney[pid]; return j?(jName[j]||j):('product:'+(prodName[pid]||pid));};

  // ---- 1. JOURNEY -> EVENTS flow (via participation requests) ----
  const epr=await db.collection('event participation request').get();
  const byJourney={}; // journey -> {events:Set, attended, total}
  const byEvent={};   // event -> {journeys:{}, status:{}}
  epr.forEach(d=>{const x=d.data();
    const jn=journeyOf(x.productref);
    const ev=evName[rid(x.eventref)]||rid(x.eventref);
    const st=x.status||'(none)';
    const J=byJourney[jn]||(byJourney[jn]={events:new Set(),attended:0,total:0,status:{}});
    J.events.add(ev); J.total++; if(st==='attended')J.attended++; T(J.status,st);
    const E=byEvent[ev]||(byEvent[ev]={journeys:{},status:{},total:0}); E.total++; T(E.journeys,jn); T(E.status,st);
  });
  console.log('=== JOURNEY → EVENTS (participation requests, top 14 journeys) ===');
  Object.entries(byJourney).sort((a,b)=>b[1].total-a[1].total).slice(0,14).forEach(([j,v])=>{
    console.log(`  ${j}: ${v.total} reqs · ${v.events.size} distinct events · ${Math.round(v.attended/v.total*100)}% attended`);
  });
  console.log('\n=== TOP EVENTS by participation (top 12) — dominant journey + attendance ===');
  Object.entries(byEvent).sort((a,b)=>b[1].total-a[1].total).slice(0,12).forEach(([e,v])=>{
    const topJ=Object.entries(v.journeys).sort((a,b)=>b[1]-a[1])[0];
    const att=v.status['attended']||0;
    console.log(`  "${e}": ${v.total} · top journey ${topJ[0]} (${topJ[1]}) · ${Math.round(att/v.total*100)}% attended`);
  });

  // ---- 2. ARENA ZONES: which cohorts/zones at the big in-person events ----
  const epz=await db.collection('event participant zones').get();
  const zoneByEvent={};
  epz.forEach(d=>{const x=d.data(); const ev=evName[rid(x.eventref)]||rid(x.eventref); const z=zoneName[rid(x.selectedzone)]||rid(x.selectedzone);
    const E=zoneByEvent[ev]||(zoneByEvent[ev]={}); T(E,z);});
  console.log('\n=== ARENA ZONES — assignment by event (events with zone usage) ===');
  Object.entries(zoneByEvent).sort((a,b)=>Object.values(b[1]).reduce((x,y)=>x+y,0)-Object.values(a[1]).reduce((x,y)=>x+y,0)).slice(0,6).forEach(([e,zs])=>{
    const tot=Object.values(zs).reduce((x,y)=>x+y,0);
    console.log(`  "${e}" (${tot} assigned): ${Object.entries(zs).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([z,n])=>z+'='+n).join(', ')}`);
  });

  // ---- 3. REAL PARTICIPANT TIMELINES through events ----
  const byProf={};
  epr.forEach(d=>{const x=d.data(); const p=x.profileid; (byProf[p]||(byProf[p]=[])).push({d:ms(x.eventdate)||ms(x.doccreateddate),ev:evName[rid(x.eventref)]||rid(x.eventref),j:journeyOf(x.productref),st:x.status});});
  const multi=Object.entries(byProf).filter(([,a])=>a.length>=4).sort((a,b)=>b[1].length-a[1].length).slice(0,4);
  console.log('\n=== REAL PARTICIPANT PATHS through events (4 participants with the most events) ===');
  for(const [pid,evs] of multi){
    evs.sort((a,b)=>a.d-b.d);
    const nm=(await db.collection('profile_data').doc(pid).get()).data();
    console.log(`  ${(nm&&nm.name)||pid} — ${evs.length} events:`);
    evs.slice(0,10).forEach(e=>console.log(`     [${e.j}] ${e.ev} → ${e.st}`));
  }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message,e.stack);process.exit(1)});
