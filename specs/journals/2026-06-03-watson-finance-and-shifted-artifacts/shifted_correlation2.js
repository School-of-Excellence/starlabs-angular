// READ-ONLY cross-project correlation via EMAIL join (the real key). No writes.
const admin = require('firebase-admin');
const fs = require('fs');
const NBSP = String.fromCharCode(160);
const wraw = fs.readFileSync('/Users/solar/Downloads/watson_servicefile.json','utf8');
const wcred = JSON.parse(wraw.slice(wraw.indexOf('{'), wraw.lastIndexOf('}')+1).split(NBSP).join(' '));
const slcred = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
const sl = admin.initializeApp({ credential: admin.credential.cert(slcred) }, 'sl').firestore();
const wt = admin.initializeApp({ credential: admin.credential.cert(wcred) }, 'wt').firestore();
const refId = r => r&&r.path ? r.path.split('/').pop() : (typeof r==='string'?r.split('/').pop():null);
const toD = t => t&&t.toDate ? t.toDate().toISOString().slice(0,10) : (t||'');

async function emailOf(pid){ try{ const d=await sl.doc('profile_data/'+pid).get(); return d.exists ? (d.data().email||'') : ''; }catch(e){ return ''; } }
async function watsonPurchases(email){
  if(!email) return {pid:null, purchases:[]};
  let p = await wt.collection('Participants').where('email','==',email).limit(1).get();
  if(p.empty) p = await wt.collection('Participants').where('email','==',email.toLowerCase().trim()).limit(1).get();
  if(p.empty) return {pid:null, purchases:[]};
  const wpid = p.docs[0].data().id || p.docs[0].id;
  const s = await wt.collection('ParticipantPurchases').where('participantid','==',wpid).orderBy('purchasedate','asc').get().catch(async()=>await wt.collection('ParticipantPurchases').where('participantid','==',wpid).get());
  return {pid:wpid, purchases:s.docs.map(d=>{const x=d.data(); return {product:x.product,ptype:x.purchasetype,pstatus:x.purchasestatus,pkg:x.packagedesignid,date:x.purchasedate,notes:(x.salenotes||'')};})};
}

(async()=>{
  const jmap={}; (await sl.collection('journey').get()).forEach(d=>jmap[d.id]=d.data().journey||d.id);
  const shifted=[], blank=[], manyProd=[];
  (await sl.collection('participantjourneyproduct').get()).forEach(d=>{ const x=d.data();
    const jn = x.journeyref ? (jmap[refId(x.journeyref)]||'(unknown)') : '(BLANK)';
    const pp = Array.isArray(x.participantproducts)?x.participantproducts.length:0;
    if(x.journeystatus==='shifted') shifted.push({pid:x.profileid, from:jn, notes:x.salenotes||''});
    if(!x.journeyref) blank.push({pid:x.profileid, jt:x.journeytype, status:x.journeystatus||'(none)'});
    if(pp>3) manyProd.push({pid:x.profileid, journey:jn, nprod:pp, status:x.journeystatus});
  });
  manyProd.sort((a,b)=>b.nprod-a.nprod);

  console.log('=== ITEM 1: SHIFTED via email join (first 6) ===');
  let matched=0;
  for(const s of shifted.slice(0,6)){
    const em=await emailOf(s.pid); const w=await watsonPurchases(em);
    if(w.pid) matched++;
    console.log(`\nSHIFTED from="${s.from}" email=${em||'(none)'} watson=${w.pid?'FOUND':'no-match'}`);
    if(s.notes) console.log('  SL note:', s.notes.slice(0,85).replace(/\n/g,' '));
    w.purchases.forEach(p=>console.log(`  W: "${p.product}" [${p.ptype}/${p.pstatus}${p.pkg?'/pkg':''}] ${p.date} ${p.notes?('"'+p.notes.slice(0,50).replace(/\n/g,' ')+'"'):''}`));
  }
  console.log(`\nshifted email-match rate: ${matched}/6`);

  console.log('\n=== ITEM 5: BLANK journeyref via email join (first 8) ===');
  for(const b of blank.slice(0,8)){
    const em=await emailOf(b.pid); const w=await watsonPurchases(em);
    console.log(`  jt=${b.jt||'-'} status=${b.status} email=${em||'(none)'} -> Watson ${w.pid?w.purchases.length+' purchases: '+[...new Set(w.purchases.map(p=>p.ptype))].join(','):'NO participant'}`);
  }

  console.log('\n=== ITEM 3: 5 power-users (>3 products) via email join ===');
  for(const m of manyProd.slice(0,5)){
    const em=await emailOf(m.pid); const w=await watsonPurchases(em);
    const pkgs=[...new Set(w.purchases.map(p=>p.pkg).filter(Boolean))];
    console.log(`  journey="${m.journey}" SLproducts=${m.nprod} status=${m.status} | Watson ${w.purchases.length} purchases {${[...new Set(w.purchases.map(p=>p.ptype))].join(',')}} ${pkgs.length}pkg | journeys bought: ${[...new Set(w.purchases.filter(p=>p.ptype==='journey').map(p=>p.product))].join(', ')}`);
  }
  console.log('\nDONE'); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
