// jb_probe2_shift.js — READ-ONLY: how a journey SHIFT/UPGRADE manifests, and what fraction of
// real users have >1 journey/product (i.e. shifted/upgraded). Production fir-sample-aae4a.
// Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const tally = (o, k) => { k = k == null ? '(none)' : k; o[k] = (o[k] || 0) + 1; };

(async () => {
  // 1) journeystatus distribution across ALL participantjourneyproduct (the lifecycle state machine).
  const pjp = await db.collection('participantjourneyproduct').get();
  const statusDist = {};
  const byProfile = {};       // profileid -> [{journeyref, status}]
  const upgradeFlags = { onreschedule: 0, hasUpgradeNote: 0 };
  pjp.forEach((d) => {
    const x = d.data();
    tally(statusDist, x.journeystatus);
    const pid = x.profileid;
    if (pid) (byProfile[pid] || (byProfile[pid] = [])).push({ j: x.journeyref ? x.journeyref.id : null, s: x.journeystatus });
    if (x.onreschedule === true) upgradeFlags.onreschedule++;
  });
  console.log('=== participantjourneyproduct journeystatus distribution (' + pjp.size + ' docs) ===');
  console.log('  ' + JSON.stringify(statusDist));

  // 2) Fraction of profiles with >1 PJP (multi-journey) and with a distinct second JOURNEY.
  const profiles = Object.keys(byProfile);
  let multiPjp = 0, multiDistinctJourney = 0, hasShiftedStatus = 0, hasUpgradedStatus = 0;
  for (const pid of profiles) {
    const rows = byProfile[pid];
    if (rows.length > 1) multiPjp++;
    const distinctJourneys = new Set(rows.map((r) => r.j).filter(Boolean));
    if (distinctJourneys.size > 1) multiDistinctJourney++;
    if (rows.some((r) => r.s === 'shifted')) hasShiftedStatus++;
    if (rows.some((r) => r.s === 'upgraded')) hasUpgradedStatus++;
  }
  console.log('\n=== multi-journey fraction (per profileid, ' + profiles.length + ' distinct profiles with a PJP) ===');
  console.log('  profiles with >1 PJP (any):           ' + multiPjp + ' (' + Math.round(multiPjp / profiles.length * 100) + '%)');
  console.log('  profiles with >1 DISTINCT journeyref:  ' + multiDistinctJourney + ' (' + Math.round(multiDistinctJourney / profiles.length * 100) + '%)');
  console.log('  profiles with a "shifted" PJP:         ' + hasShiftedStatus);
  console.log('  profiles with an "upgraded" PJP:       ' + hasUpgradedStatus);
  console.log('  PJPs flagged onreschedule:true:        ' + upgradeFlags.onreschedule);

  // 3) The journeyproductpurchase.watsonpurchaselabel is where shift/upgrade is literally spelled out.
  //    Count labels that contain "to"/"upgrade" transition wording.
  const jpp = await db.collection('journeyproductpurchase').get();
  let transLabel = 0, upgradeLabel = 0;
  const labelSamples = [];
  jpp.forEach((d) => {
    const l = (d.data().watsonpurchaselabel || '').toLowerCase();
    if (/\bto\b/.test(l) && !/onboarding/.test(l)) { transLabel++; if (labelSamples.length < 14) labelSamples.push(d.data().watsonpurchaselabel); }
    if (/upgrade/.test(l)) upgradeLabel++;
  });
  console.log('\n=== journeyproductpurchase.watsonpurchaselabel (' + jpp.size + ' docs) ===');
  console.log('  labels with a "<A> to <B>" transition shape: ' + transLabel);
  console.log('  labels containing "upgrade":                 ' + upgradeLabel);
  console.log('  sample transition labels: ' + JSON.stringify(labelSamples));

  // 4) Mode-change view: participantsproduct.status across the cohort (incl. "shifted") + mode/nextmode set.
  const psp = await db.collection('participantsproduct').get();
  const pspStatus = {}; let hasNextmode = 0, hasMode = 0, hasStatusdateMulti = 0;
  const profileProductCount = {};
  psp.forEach((d) => {
    const x = d.data();
    tally(pspStatus, x.status);
    if (x.nextmode) hasNextmode++;
    if (x.mode) hasMode++;
    if (x.statusdate && Object.keys(x.statusdate).length > 1) hasStatusdateMulti++;
    if (x.profileid) profileProductCount[x.profileid] = (profileProductCount[x.profileid] || 0) + 1;
  });
  console.log('\n=== participantsproduct.status distribution (' + psp.size + ' docs) ===');
  console.log('  ' + JSON.stringify(pspStatus));
  console.log('  with mode set: ' + hasMode + ' | with nextmode set: ' + hasNextmode + ' | with multi-key statusdate (mode-progression trail): ' + hasStatusdateMulti);

  // 5) products-per-profile distribution (how many delivery units a typical user accrues).
  const counts = Object.values(profileProductCount).sort((a, b) => a - b);
  const at = (q) => counts[Math.floor(counts.length * q)] || 0;
  console.log('\n=== participantsproduct PER profileid (' + counts.length + ' profiles) ===');
  console.log('  min=' + counts[0] + ' p25=' + at(0.25) + ' median=' + at(0.5) + ' p75=' + at(0.75) + ' p90=' + at(0.9) + ' max=' + counts[counts.length - 1]);

  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
