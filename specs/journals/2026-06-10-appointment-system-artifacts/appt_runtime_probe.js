const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const tally=(o,k)=>{o[k]=(o[k]||0)+1;};
(async()=>{
  // 1. appointments: state machine + linkage + host-count + zoom/platform presence
  const ap=await db.collection('appointments').get();
  let attended=0,cancelled=0,pendingFuture=0,noShow=0,hasPPid=0,journeycoach=0,onboarding=0,hasPlatform=0,hasZoom=0,hasSlotdata=0;
  const hostSize={}; const now=Date.now();
  ap.forEach(d=>{const x=d.data();
    if(x.cancelled===true)cancelled++;
    else if(x.attended===true)attended++;
    else { const st=x.starttime&&x.starttime.toMillis?x.starttime.toMillis():0;
      if(st>now)pendingFuture++; else noShow++; }
    if(x.participantproductid)hasPPid++;
    if(x.journeycoach===true)journeycoach++;
    if(x.onboarding===true)onboarding++;
    if(x.platform)hasPlatform++;
    if(x.zoomurl||x.zoomid||(x.slotdata&&(x.slotdata.zoomurl||x.slotdata.join_url)))hasZoom++;
    if(x.slotdata)hasSlotdata++;
    const n=Array.isArray(x.hosts)?x.hosts.length:(Array.isArray(x.appointmentrole)?x.appointmentrole.length:0);
    tally(hostSize,n);
  });
  console.log('=== appointments ('+ap.size+') ===');
  console.log(' state: attended',attended,'| cancelled',cancelled,'| upcoming',pendingFuture,'| past-unmarked(no-show)',noShow);
  console.log(' linkage: participantproductid present',hasPPid,'('+Math.round(hasPPid/ap.size*100)+'%)');
  console.log(' journeycoach',journeycoach,'| onboarding',onboarding);
  console.log(' platform field present',hasPlatform,'| zoom data present',hasZoom,'| slotdata present',hasSlotdata);
  console.log(' hosts/roles per appointment:',JSON.stringify(hostSize));

  // 2. appointmenttype: duration + changework + group
  const at=await db.collection('appointmenttype').get();
  const durs={}; let cw=0,grp=0;
  at.forEach(d=>{const x=d.data(); tally(durs, (x.duration||'?')+'min'); if(x.ischangeworkrequired===true)cw++; if(x.groupappointment===true)grp++;});
  console.log('\n=== appointmenttype ('+at.size+') ===');
  console.log(' durations:',JSON.stringify(durs));
  console.log(' ischangeworkrequired:',cw,'| groupappointment:',grp);

  // 3. offtime status
  const ot=await db.collection('offtime').get();
  const os={}; ot.forEach(d=>tally(os, d.data().status==null?'(pending)':d.data().status));
  console.log('\n=== offtime ('+ot.size+') status:',JSON.stringify(os));

  // 4. a sample availability doc structure (one nested slot)
  const avq=await db.collection('availability').where('appointments','!=',null).limit(1).get().catch(()=>null);
  const av=avq&&!avq.empty?avq.docs[0]:(await db.collection('availability').limit(1).get()).docs[0];
  const ad=av.data();
  const apptTypeKeys=Object.keys(ad).filter(k=>!['id','starttime','endtime','profileref','appointments','weeklyhours'].includes(k));
  console.log('\n=== availability sample ('+av.id+') ===');
  console.log(' top fields:', Object.keys(ad).filter(k=>['id','starttime','endtime','profileref','appointments','weeklyhours'].includes(k)).join(', '));
  console.log(' appt-type slot keys:', apptTypeKeys.length, apptTypeKeys.slice(0,3).join(', '));
  if(apptTypeKeys.length){ const sample=ad[apptTypeKeys[0]]; console.log(' sample slot array[0]:', JSON.stringify(Array.isArray(sample)?sample[0]:sample)); }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
