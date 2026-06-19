const admin=require('firebase-admin');
const KEY='/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore();
const ms=t=>t&&t.toMillis?t.toMillis():(t&&t._seconds?t._seconds*1000:0);
const id=r=>r&&r.id?r.id:(r&&r.path?r.path.split('/').pop():(typeof r==='string'?r.split('/').pop():null));
(async()=>{
  const ap=await db.collection('appointments').get();
  // build a duration map from appointmenttype
  const atSnap=await db.collection('appointmenttype').get(); const durOf={},nameOf={};
  atSnap.forEach(d=>{durOf[d.id]=d.data().duration;nameOf[d.id]=d.data().appointmenttype;});

  // 1. LEAD TIME (created -> starttime) — verifies the next-day / 24h rule in real data
  const leadBuckets={'<0 (backdated)':0,'0-6h':0,'6-24h':0,'1-2d':0,'2-7d':0,'>7d':0};
  let leadN=0;
  // 2. DURATION realized (start->end) vs configured type duration
  let durMatch=0,durMismatch=0,durN=0;
  // 3. admin-on-behalf marker present?
  let hasLogged=0, loggedNeBooked=0;
  // 4. totalminutes present
  let hasTotal=0;
  const samples={solo:null,tworole:null,jc:null,ob:null};
  ap.forEach(d=>{const x=d.data();
    const c=ms(x.created), s=ms(x.starttime);
    if(c&&s){ leadN++; const h=(s-c)/3600000;
      if(h<0)leadBuckets['<0 (backdated)']++; else if(h<6)leadBuckets['0-6h']++; else if(h<24)leadBuckets['6-24h']++;
      else if(h<48)leadBuckets['1-2d']++; else if(h<168)leadBuckets['2-7d']++; else leadBuckets['>7d']++; }
    const tid=id(x.appointment); const cfgDur=durOf[tid];
    const st=ms(x.starttime),en=ms(x.endtime);
    if(cfgDur&&st&&en){ durN++; const realMin=Math.round((en-st)/60000); if(Math.abs(realMin-cfgDur)<=5)durMatch++; else durMismatch++; }
    if(x.loggedid!==undefined){ hasLogged++; if(id(x.loggedid)!==id(x.bookedby)) loggedNeBooked++; }
    if(x.totalminutes!==undefined&&x.totalminutes!==null) hasTotal++;
    // capture one real sample of each shape
    const roles=Array.isArray(x.appointmentrole)?x.appointmentrole.length:0;
    const shape = x.journeycoach&&x.onboarding?'ob': x.journeycoach?'jc': roles>=2?'tworole':'solo';
    if(!samples[shape]) samples[shape]={id:d.id, type:nameOf[tid], cfgDur, roles, hosts:(x.hosts||[]).length, hostRoleKeys:x.hostRole?Object.keys(x.hostRole).length:0, attended:x.attended, cancelled:x.cancelled, leadH: c&&s?Math.round((s-c)/3600000):null, realMin: st&&en?Math.round((en-st)/60000):null};
  });
  console.log('=== LEAD TIME (created→starttime) over',leadN,'appts ===',JSON.stringify(leadBuckets));
  console.log('=== DURATION realized vs configured (±5min) over',durN,'appts ===','match:',durMatch,'mismatch:',durMismatch);
  console.log('=== admin-on-behalf marker: loggedid present on',hasLogged,'| loggedid≠bookedby:',loggedNeBooked);
  console.log('=== totalminutes present on',hasTotal,'/',ap.size);
  console.log('\n=== REAL sample appointment of each shape ===');
  for(const [k,v] of Object.entries(samples)) console.log('  ['+k+']', JSON.stringify(v));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
