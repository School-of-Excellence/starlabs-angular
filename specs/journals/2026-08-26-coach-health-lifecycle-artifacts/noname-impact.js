const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const sa = require(process.argv[2]);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const CURRENT = ['initiated','ongoing','completed','cancelled'];
(async () => {
  const meta = await db.collection('participant metadata').get();
  const pjp = await db.collection('participantjourneyproduct').where('journeystatus','in',CURRENT).get();
  const onScreen = new Set(); pjp.forEach(d => { const p = d.data().profileid; if (p) onScreen.add(p); });

  console.log('metadata docs with NO `name` field — what the app LOSES for them:\n');
  console.log('profileid'.padEnd(24), 'onScreen'.padEnd(9), 'raw customerstatus');
  let lostRealStatus = 0;
  meta.forEach(d => {
    const x = d.data();
    if (x.name === undefined || x.name === null) {
      const raw = x.customerstatus === undefined ? '<missing>' : JSON.stringify(x.customerstatus);
      const on = onScreen.has(d.id);
      if (on && x.customerstatus !== undefined && x.customerstatus !== null) lostRealStatus++;
      console.log(d.id.padEnd(24), String(on).padEnd(9), raw);
    }
  });
  console.log(`\n=> ${lostRealStatus} of them are ON SCREEN and DO have a real customerstatus,`);
  console.log('   but the app never sees it (getParticipantMetaMap orderBy("name") drops the doc),');
  console.log('   so they fall into the "No status" bucket regardless of their true status.');

  // profile_data has the same orderBy('name') issue -> name/phone/coach lookups
  const pd = await db.collection('profile_data').get();
  const pdNoName = []; pd.forEach(d => { if (d.data().name === undefined || d.data().name === null) pdNoName.push(d.id); });
  console.log(`\nprofile_data docs with NO 'name' field: ${pdNoName.length} (getProfileMap orderBy('name') drops these too)`);
  const pdNoNameOnScreen = pdNoName.filter(id => onScreen.has(id));
  console.log(`   of which ON SCREEN: ${pdNoNameOnScreen.length}`);
  pdNoNameOnScreen.slice(0,20).forEach(id => console.log(`   ${id}`));
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
