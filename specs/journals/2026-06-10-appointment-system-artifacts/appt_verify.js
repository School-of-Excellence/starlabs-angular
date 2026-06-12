const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const DIAG='AkOr1WLFFq2ttBIQQKYe', CELEB='gQR1GKk9no7YQqk2yoCW';
const refId=r=>r&&r.id?r.id:(r&&r.path?r.path.split('/').pop():null);
(async()=>{
  // 0. resolve the two special type names
  for(const id of [DIAG,CELEB]){
    const d=await db.collection('appointmenttype').doc(id).get();
    console.log(`type ${id}:`, d.exists?JSON.stringify(d.data().appointmenttype):'(missing)');
  }

  // 1. CONTINUITY ENGINE: do customer_eismapping role-keys match the claimed 5 roles? resolve names.
  const cem=await db.collection('customer_eismapping').get();
  const roleHits={};
  cem.forEach(d=>{const m=d.data().eisroles||{}; Object.keys(m).forEach(k=>{const rid=k.split('/').pop(); roleHits[rid]=(roleHits[rid]||0)+1;});});
  console.log('\n=== customer_eismapping role-keys (resolve to eisroles names) ===');
  const top=Object.entries(roleHits).sort((a,b)=>b[1]-a[1]).slice(0,8);
  for(const [rid,n] of top){ const r=await db.collection('eisroles').doc(rid).get(); console.log(`  ${n}x  ${rid}  ->`, r.exists?JSON.stringify(r.data().role||r.data().rolename||r.data()):'(missing)'); }

  // 2. CAUSAL CHECK: participants WITH a mapping — did they actually book a Diagnostic appt?
  //    appointments.appointment is a ref to appointmenttype. Sample mapping-holders.
  const mapHolders=cem.docs.filter(d=>Object.keys(d.data().eisroles||{}).length).map(d=>d.id);
  let checked=0,withDiag=0;
  for(const pid of mapHolders.slice(0,40)){
    const q=await db.collection('appointments').where('appointment','==',db.doc('appointmenttype/'+DIAG)).where('bookedby','==',db.doc('profile_data/'+pid)).limit(1).get().catch(()=>null);
    if(q){ checked++; if(!q.empty) withDiag++; }
  }
  console.log(`\n=== CAUSAL: of ${checked} sampled mapping-holders, ${withDiag} have a Diagnostic appointment booked (bookedby) ===`);

  // 3. INVERSE: participants who booked a Celebration — do they STILL have those 5 role mappings? (should be deleted)
  const celebAppts=await db.collection('appointments').where('appointment','==',db.doc('appointmenttype/'+CELEB)).limit(50).get();
  const celebBookers=[...new Set(celebAppts.docs.map(d=>refId(d.data().bookedby)).filter(Boolean))];
  let stillMapped=0,celebChecked=0;
  for(const pid of celebBookers.slice(0,40)){
    const m=await db.collection('customer_eismapping').doc(pid).get();
    celebChecked++;
    if(m.exists && Object.keys(m.data().eisroles||{}).length) stillMapped++;
  }
  console.log(`=== INVERSE: of ${celebChecked} Celebration-bookers, ${stillMapped} STILL have a non-empty mapping (claim: Celebration deletes the 5 pins) ===`);

  // 4. 2-ROLE distinctness: sample 2-host appointments, confirm distinct specialists
  const two=await db.collection('appointments').get();
  let twoRole=0,distinct=0;
  two.forEach(d=>{const hr=d.data().hostRole; if(hr&&typeof hr==='object'&&Object.keys(hr).length===2){ twoRole++;
    const all=[].concat(...Object.values(hr).map(v=>Array.isArray(v)?v.map(refId):[refId(v)]));
    if(new Set(all).size===all.length && all.length>=2) distinct++; }});
  console.log(`\n=== 2-role appts: ${twoRole} sampled, ${distinct} have all-distinct host specialists (claim: same-time distinct-specialist) ===`);

  // 5. RUNTIME EVIDENCE: email archive — does a journeycoach appt's email carry a 'participantstudio' URL?
  const ea=await db.collection('email archive').limit(1).get();
  console.log('\n=== email archive schema (runtime CF evidence) ===', ea.empty?'(empty)':Object.keys(ea.docs[0].data()).sort().join(', '));
  const tp=await db.collection('participant touchpoint').limit(1).get();
  console.log('=== participant touchpoint schema ===', tp.empty?'(empty)':Object.keys(tp.docs[0].data()).sort().join(', '));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
