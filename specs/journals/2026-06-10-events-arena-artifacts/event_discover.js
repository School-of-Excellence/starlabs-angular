const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const want=['arena events','arena e-ticket','arena e-ticket log','arena highlights','arenaspace','arenalayers','arenavideoask',
'event collection','event location','event participant zones','event participant zones logs','event participation request',
'event rsvp','event users','event zones','event_token_user','events_hosts','events_profiles',
'bigeventmentor','bigeventparticipantsplan','big aggregate event level','delivery events'];
(async()=>{
  for(const c of want){
    try{
      const agg=await db.collection(c).count().get();
      const s=await db.collection(c).limit(1).get();
      const keys=s.empty?[]:Object.keys(s.docs[0].data()).sort();
      console.log(`### "${c}" — ${agg.data().count} docs`);
      console.log('   keys:', keys.join(', ')||'(empty)');
    }catch(e){ console.log(`### "${c}" ERR ${e.message}`); }
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
