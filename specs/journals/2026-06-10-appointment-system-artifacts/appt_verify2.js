const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
(async()=>{
  // A. journeycoach studio-URL fork — inspect actual sent emails' datamodel/body for the URL used
  const ea=await db.collection('email archive').limit(800).get();
  let apptEmails=0, withPartStudio=0, withApptStudio=0, withZoom=0;
  ea.forEach(d=>{const x=d.data();
    const blob=JSON.stringify(x.datamodel||'')+JSON.stringify(x.body||'')+JSON.stringify(x.emailmap||'');
    const subj=(x.subject||'').toLowerCase();
    const isAppt=/appointment|booked|scheduled|meeting/.test(subj)||/meetingurl|appointmentstudio|participantstudio/.test(blob);
    if(!isAppt) return; apptEmails++;
    if(/participantstudio/.test(blob)) withPartStudio++;
    if(/appointmentstudio/.test(blob)) withApptStudio++;
    if(/zoom\.us|zoomurl|zoom_url/i.test(blob)) withZoom++;
  });
  console.log('=== email archive (800 sampled): appointment-related emails ===');
  console.log('  appt emails:',apptEmails,'| contain participantstudio:',withPartStudio,'| appointmentstudio:',withApptStudio,'| zoom URL:',withZoom);

  // B. touchpoint the CF writes on attend ("Appointment Scheduled") — does it exist?
  const tps={};
  const tp=await db.collection('participant touchpoint').limit(3000).get();
  tp.forEach(d=>{const t=(d.data().touchpoint||d.data().label||'').toString(); if(/appoint/i.test(t)) tps[t]=(tps[t]||0)+1;});
  console.log('\n=== participant touchpoint (3000 sampled): appointment-related touchpoints ===');
  Object.entries(tps).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>console.log('  '+v+'x  '+k));
  if(!Object.keys(tps).length) console.log('  (none in sample)');

  // C. Is the continuity engine WiSH-only? check which journeys the mapping-holders belong to
  const cem=await db.collection('customer_eismapping').get();
  const holders=cem.docs.filter(d=>Object.keys(d.data().eisroles||{}).length).map(d=>d.id).slice(0,60);
  const jrn={};
  for(const pid of holders){
    const pd=await db.collection('profile_data').doc(pid).get().catch(()=>null);
    // try to read journey from participantjourneyproduct or profile
    const pj=await db.collection('participantjourneyproduct').where('profileid','==',pid).limit(1).get().catch(()=>null);
    let j='(unknown)';
    if(pj&&!pj.empty){ const x=pj.docs[0].data(); j=x.journeyname||x.journey||x.journeyref&&x.journeyref.id||'(set)'; if(typeof j==='object')j='(ref)'; }
    jrn[j]=(jrn[j]||0)+1;
  }
  console.log('\n=== continuity mapping-holders by journey (is it WiSH-only?) ===', JSON.stringify(jrn));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
