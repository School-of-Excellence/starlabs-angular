const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const T=(o,k)=>{k=k==null?'(null)':k;o[k]=(o[k]||0)+1;};
const sz=v=>Array.isArray(v)?v.length:0;
(async()=>{
  // appointmenttype full enumeration: duration x changework x group x maxbooking
  const at=await db.collection('appointmenttype').get();
  let cw=0,grp=0; const byDur={}; const maxb={};
  at.forEach(d=>{const x=d.data(); if(x.ischangeworkrequired)cw++; if(x.groupappointment)grp++;
    T(byDur,(x.duration||'?')); if(x.maxbooking!=null)T(maxb,x.maxbooking);});
  console.log('=== appointmenttype ('+at.size+') ===');
  console.log('  changework-required:',cw,'| group:',grp,'| with maxbooking:',JSON.stringify(maxb));
  console.log('  duration histogram:',JSON.stringify(byDur));

  // AppointmentType-To-Roles: required vs additional role counts (single vs multi-role types)
  const a2r=await db.collection('AppointmentType-To-Roles').get();
  const reqSize={},addSize={};
  a2r.forEach(d=>{const x=d.data(); T(reqSize,sz(x.required_role)); T(addSize,sz(x.additional_role));});
  console.log('\n=== AppointmentType-To-Roles ('+a2r.size+') ===');
  console.log('  required_role count per type:',JSON.stringify(reqSize));
  console.log('  additional_role count per type:',JSON.stringify(addSize));

  // Roles-To-EIS: specialists per role
  const r2e=await db.collection('Roles-To-EIS').get();
  const eisSize={}; let totalRoles=r2e.size;
  r2e.forEach(d=>{T(eisSize,sz(d.data().assigned_eis));});
  console.log('\n=== Roles-To-EIS ('+totalRoles+' roles) — specialists per role:',JSON.stringify(eisSize));
  const er=await db.collection('eisroles').get(); console.log('  eisroles catalog size:',er.size);

  // customer_eismapping: personalization prevalence (preferred specialist per role)
  const cem=await db.collection('customer_eismapping').get();
  let withMap=0; const roleKeys={};
  cem.forEach(d=>{const x=d.data(); const m=x.eisroles||{}; const ks=Object.keys(m); if(ks.length)withMap++; ks.forEach(k=>T(roleKeys,'roles_'+ks.length));});
  console.log('\n=== customer_eismapping ('+cem.size+' participants) ===');
  console.log('  with >=1 preferred specialist:',withMap,'| #-roles-mapped histogram:',JSON.stringify(roleKeys));

  // Journey/Product -> AppointmentTypes: how many types unlocked per journey/product
  const j2a=await db.collection('Journey-To-AppointmentTypes').get();
  const p2a=await db.collection('Product-To-AppointmentTypes').get();
  const jSize={},pSize={};
  j2a.forEach(d=>T(jSize,sz(d.data().assigned_appttypes)));
  p2a.forEach(d=>T(pSize,sz(d.data().assigned_appttypes)));
  console.log('\n=== Journey-To-AppointmentTypes ('+j2a.size+') types-per-journey:',JSON.stringify(jSize));
  console.log('=== Product-To-AppointmentTypes ('+p2a.size+') types-per-product:',JSON.stringify(pSize));

  // appointments: the actual combination space
  const ap=await db.collection('appointments').get();
  const combo={}; const hostRoleSize={};
  ap.forEach(d=>{const x=d.data();
    const jc=x.journeycoach===true?'jc':'-';
    const ob=x.onboarding===true?'ob':'-';
    const roles=sz(x.appointmentrole);
    T(combo, jc+'/'+ob+'/roles='+roles);
    if(x.hostRole&&typeof x.hostRole==='object') T(hostRoleSize, Object.keys(x.hostRole).length);
  });
  console.log('\n=== appointments ('+ap.size+') combination space (journeycoach/onboarding/roles) ===');
  Object.entries(combo).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log('  '+k+': '+v));
  console.log('  hostRole key-count histogram:',JSON.stringify(hostRoleSize));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
