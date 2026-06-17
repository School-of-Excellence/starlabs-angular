// jb_probe3_events.js — READ-ONLY: events-attended-per-profileid distribution + what an
// "attended" event looks like (the status fields). Tells us how to make a synthetic median
// user attend >=4 events. Production fir-sample-aae4a. Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const rid = (r) => (r && r.id ? r.id : (typeof r === 'string' ? r : null));
const pct = (arr, q) => arr[Math.floor(arr.length * q)] || 0;

(async () => {
  // 1) event participation request — the registration+attendance record. Distribution per profileid.
  const epr = await db.collection('event participation request').get();
  const reqByProfile = {};   // profileid -> total requests
  const attByProfile = {};   // profileid -> ATTENDED count
  const statusDist = {};
  epr.forEach((d) => {
    const x = d.data();
    const pid = x.profileid;
    const st = x.status || '(none)';
    statusDist[st] = (statusDist[st] || 0) + 1;
    if (!pid) return;
    reqByProfile[pid] = (reqByProfile[pid] || 0) + 1;
    if (st === 'attended') attByProfile[pid] = (attByProfile[pid] || 0) + 1;
  });
  console.log('=== event participation request (' + epr.size + ') status: ' + JSON.stringify(statusDist));

  const allReq = Object.values(reqByProfile).sort((a, b) => a - b);
  const allProfiles = Object.keys(reqByProfile);
  console.log('\n=== REQUESTS per profileid (' + allProfiles.length + ' distinct profiles registered for >=1 event) ===');
  console.log('  min=' + allReq[0] + ' p25=' + pct(allReq, 0.25) + ' median=' + pct(allReq, 0.5) + ' p75=' + pct(allReq, 0.75) + ' p90=' + pct(allReq, 0.9) + ' max=' + allReq[allReq.length - 1]);

  // ATTENDED per profileid — but only over profiles that attended >=1 (to see the "active" attender shape),
  // AND over ALL registered profiles (incl. zero-attended) to get the true population median.
  const attendedProfiles = Object.keys(attByProfile);
  const attActive = Object.values(attByProfile).sort((a, b) => a - b);
  // population-wide attendance (every registered profile, 0 if none attended):
  const attAll = allProfiles.map((p) => attByProfile[p] || 0).sort((a, b) => a - b);
  console.log('\n=== ATTENDED events per profileid ===');
  console.log('  over ALL ' + allProfiles.length + ' registered profiles:  min=' + attAll[0] + ' p25=' + pct(attAll, 0.25) + ' median=' + pct(attAll, 0.5) + ' p75=' + pct(attAll, 0.75) + ' p90=' + pct(attAll, 0.9) + ' max=' + attAll[attAll.length - 1]);
  console.log('  over the ' + attendedProfiles.length + ' profiles who attended >=1: min=' + attActive[0] + ' p25=' + pct(attActive, 0.25) + ' median=' + pct(attActive, 0.5) + ' p75=' + pct(attActive, 0.75) + ' p90=' + pct(attActive, 0.9) + ' max=' + attActive[attActive.length - 1]);
  const ge4 = attAll.filter((n) => n >= 4).length;
  console.log('  profiles attending >=4 events: ' + ge4 + ' (' + Math.round(ge4 / allProfiles.length * 100) + '% of registered)');

  // 2) What an ATTENDED event row looks like (full field shape of a few attended EPRs).
  console.log('\n=== sample ATTENDED event participation request docs ===');
  const attSample = await db.collection('event participation request').where('status', '==', 'attended').limit(3).get();
  attSample.forEach((d) => {
    const x = d.data();
    const fields = Object.keys(x).sort().map((k) => {
      const v = x[k];
      const t = v === null ? 'null' : (v && v._seconds !== undefined ? 'Timestamp' : (v && v.path ? 'ref->' + v.path : (typeof v === 'string' && k !== 'profileid' && k !== 'status' ? 'string' : JSON.stringify(v))));
      return k + '=' + t;
    });
    console.log('  EPR ' + d.id + ': ' + fields.join(' | '));
  });

  // 3) event rsvp — the intent record (also keyed by profileid). Per-profile + status shape.
  const rsvp = await db.collection('event rsvp').get();
  const rsvpResp = {}, rsvpType = {};
  const rsvpByProfile = {};
  rsvp.forEach((d) => {
    const x = d.data();
    rsvpResp[x.participantresponse || '(null)'] = (rsvpResp[x.participantresponse || '(null)'] || 0) + 1;
    rsvpType[x.type || '(none)'] = (rsvpType[x.type || '(none)'] || 0) + 1;
    if (x.profileid) rsvpByProfile[x.profileid] = (rsvpByProfile[x.profileid] || 0) + 1;
  });
  console.log('\n=== event rsvp (' + rsvp.size + ') participantresponse: ' + JSON.stringify(rsvpResp) + ' | type: ' + JSON.stringify(rsvpType));
  console.log('  distinct profiles with an rsvp: ' + Object.keys(rsvpByProfile).length);
  // one sample rsvp shape
  const rsvpSample = await db.collection('event rsvp').limit(1).get();
  rsvpSample.forEach((d) => console.log('  sample rsvp keys: ' + Object.keys(d.data()).sort().join(', ')));

  // 4) events_profiles denorm (attendance denorm) + arena e-ticket (per-participant ticket) shapes.
  const ep = await db.collection('events_profiles').limit(1).get();
  ep.forEach((d) => console.log('\n=== events_profiles sample keys: ' + Object.keys(d.data()).sort().join(', ')));
  const et = await db.collection('arena e-ticket').limit(1).get();
  et.forEach((d) => console.log('=== arena e-ticket sample keys: ' + Object.keys(d.data()).sort().join(', ')));

  // 5) event collection — the event master; how many to seed, and a sample shape.
  const ec = await db.collection('event collection').limit(1).get();
  ec.forEach((d) => console.log('=== event collection sample keys: ' + Object.keys(d.data()).sort().join(', ')));
  const ecCount = await db.collection('event collection').count().get();
  console.log('=== event collection count: ' + ecCount.data().count);

  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
