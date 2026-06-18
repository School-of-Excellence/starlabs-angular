const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const T=(o,k)=>{k=k==null?'(null)':k;o[k]=(o[k]||0)+1;};
(async()=>{
  // 1. event participation request — the RSVP/approval state machine
  const epr=await db.collection('event participation request').get();
  const st={}; epr.forEach(d=>T(st,d.data().status));
  console.log('=== event participation request ('+epr.size+') status:',JSON.stringify(st));

  // 2. event rsvp — participant response
  const rs=await db.collection('event rsvp').get();
  const pr={},tr={}; rs.forEach(d=>{T(pr,d.data().participantresponse);T(tr,d.data().type);});
  console.log('=== event rsvp ('+rs.size+') participantresponse:',JSON.stringify(pr));
  console.log('    rsvp type:',JSON.stringify(tr));

  // 3. arena e-ticket — active + producteligible size
  const et=await db.collection('arena e-ticket').get();
  let act=0; const pe={}; et.forEach(d=>{const x=d.data(); if(x.active===true)act++; const n=Array.isArray(x.producteligible)?x.producteligible.length:0; T(pe,n);});
  console.log('=== arena e-ticket ('+et.size+') active:true',act,'('+Math.round(act/et.size*100)+'%) | producteligible size:',JSON.stringify(pe));

  // 4. event collection — events: registration window, arenaeventidlist, hosts
  const ec=await db.collection('event collection').get();
  let withArena=0,withReg=0,withHosts=0; const now=Date.now();
  let past=0,upcoming=0;
  ec.forEach(d=>{const x=d.data();
    if(Array.isArray(x.arenaeventidlist)&&x.arenaeventidlist.length)withArena++;
    if(x.lastregistrationdate)withReg++;
    if(Array.isArray(x.hosts)&&x.hosts.length)withHosts++;
    const ed=x.end_date&&x.end_date.toMillis?x.end_date.toMillis():0;
    if(ed&&ed<now)past++; else if(ed)upcoming++;
  });
  console.log('=== event collection ('+ec.size+') ===');
  console.log('   with arenaeventidlist:',withArena,'| with lastregistrationdate:',withReg,'| with hosts:',withHosts);
  console.log('   past(ended):',past,'| upcoming/ongoing:',upcoming);

  // 5. event participant zones — zone assignment
  const ez=await db.collection('event participant zones').get();
  let selz=0; ez.forEach(d=>{if(d.data().selectedzone)selz++;});
  console.log('=== event participant zones ('+ez.size+') with selectedzone:',selz);

  // 6. arena e-ticket log — check-in scans, distinct profiles
  const log=await db.collection('arena e-ticket log').get();
  const profs=new Set(),evs=new Set(); log.forEach(d=>{profs.add(d.data().profileid);evs.add(d.data().eventref&&d.data().eventref.path?d.data().eventref.path:String(d.data().eventref));});
  console.log('=== arena e-ticket log ('+log.size+' scans) distinct profiles:',profs.size,'| distinct events:',evs.size);
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
