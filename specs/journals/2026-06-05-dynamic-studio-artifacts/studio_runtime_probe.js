const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const tally=(arr)=>arr.reduce((m,k)=>{m[k]=(m[k]||0)+1;return m;},{});
(async()=>{
  // 1. live assignment status distribution + pairing size (solo vs multi-specialist)
  const la=await db.collection('live assignment').get();
  const laStatus={}, pairSize={}, vidstack={};
  let zoomdataPresent=0;
  la.forEach(d=>{const x=d.data();
    laStatus[x.status||'(none)']=(laStatus[x.status||'(none)']||0)+1;
    const n=Array.isArray(x.pairing)?x.pairing.length:(x.pairing?1:0);
    pairSize[n]=(pairSize[n]||0)+1;
    if(x.zoomdata) zoomdataPresent++;
  });
  console.log('=== live assignment ('+la.size+') ===');
  console.log(' status:',JSON.stringify(laStatus));
  console.log(' pairing size (specialists/session):',JSON.stringify(pairSize));
  console.log(' has zoomdata:',zoomdataPresent,'('+Math.round(zoomdataPresent/la.size*100)+'%)');

  // 2. queue studio pairing: openvidu flag + participants array size
  const qsp=await db.collection('queue studio pairing').get();
  let ov=0; const partSize={};
  qsp.forEach(d=>{const x=d.data();
    if(x.openvidu===true) ov++;
    const n=Array.isArray(x.participants)?x.participants.length:0;
    partSize[n]=(partSize[n]||0)+1;
  });
  console.log('\n=== queue studio pairing ('+qsp.size+') ===');
  console.log(' openvidu=true:',ov,'('+Math.round(ov/qsp.size*100)+'%)  -> rest use Zoom');
  console.log(' participants per studio:',JSON.stringify(partSize));

  // 3. studioinvitation: clientresponse distribution (accept/deny rate)
  const si=await db.collection('studioinvitation').get();
  const resp={};
  si.forEach(d=>{const r=d.data().clientresponse; resp[r==null?'(pending/null)':r]=(resp[r==null?'(pending/null)':r]||0)+1;});
  console.log('\n=== studioinvitation ('+si.size+') ===');
  console.log(' clientresponse:',JSON.stringify(resp));

  // 4. arena participant: pairingmode + stagerole presence
  const ap=await db.collection('arena participant').get();
  const pm={}; let hasRole=0;
  ap.forEach(d=>{const x=d.data(); pm[x.pairingmode||'(none)']=(pm[x.pairingmode||'(none)']||0)+1; if(x.stagerole) hasRole++;});
  console.log('\n=== arena participant ('+ap.size+') ===');
  console.log(' pairingmode:',JSON.stringify(pm));
  console.log(' has stagerole:',hasRole,'('+Math.round(hasRole/ap.size*100)+'%)');

  // 5. queue-level video config: enablezoommeetingsdk / zoomlinkrequired on queue generation
  const qg=await db.collection('queue generation').get();
  let sdk=0, zlrFalse=0;
  qg.forEach(d=>{const x=d.data(); if(x.enablezoommeetingsdk===true) sdk++; if(x.zoomlinkrequired===false) zlrFalse++;});
  console.log('\n=== queue generation ('+qg.size+') video config ===');
  console.log(' enablezoommeetingsdk=true:',sdk,' | zoomlinkrequired=false:',zlrFalse);

  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
