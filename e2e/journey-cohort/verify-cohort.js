// @ts-nocheck
/**
 * verify-cohort.js — READ-ONLY proof of the two cohort invariants on the TEST project.
 * PROVES: (1) median events-attended per user >= 4 ; (2) median journey shift/upgrade count >= 1.
 * Exits non-zero unless BOTH pass (so CI / the suite can gate on the seed). ADC only — never the prod SA.
 */
'use strict';
const { seed } = require('../lib/seed-common');
const RUN = process.env.JRNY_RUNID || 'jrny';
const median = (a) => { a = a.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };

(async () => {
  const admin = seed.initAdmin();                 // hard-aborts unless the test project allowlist
  const db = admin.firestore();
  console.log(`\n[verify-cohort] run=${RUN} project=${admin.app().options.projectId}`);

  // the cohort = the seeded PARTICIPANT profiles for this run (ids `${RUN}_profile_<i>`); exclude the
  // EIS host + any other tagged profile so the median is over participants only.
  const profiles = await db.collection('profile_data').where('testrunid', '==', RUN).get();
  const pids = profiles.docs.map((d) => d.id).filter((id) => id.startsWith(`${RUN}_profile_`));
  if (!pids.length) { console.error('  ✗ no cohort profiles found — seed first'); process.exit(1); }

  // (1) events attended per profile, from event participation request (status == 'attended')
  const epr = await db.collection('event participation request').where('testrunid', '==', RUN).get();
  const attBy = {}; pids.forEach((p) => (attBy[p] = 0));
  epr.forEach((d) => { const x = d.data(); if (x.status === 'attended' && x.profileid in attBy) attBy[x.profileid]++; });
  const attCounts = pids.map((p) => attBy[p]);
  const medianEvents = median(attCounts);
  const ge4 = attCounts.filter((n) => n >= 4).length;

  // (2) shift/upgrade count per profile: #PJP with journeystatus in {upgraded,shifted,downgraded}
  //     OR (#distinct journeyref - 1)
  const pjp = await db.collection('participantjourneyproduct').where('testrunid', '==', RUN).get();
  const upgBy = {}, jrefBy = {}; pids.forEach((p) => { upgBy[p] = 0; jrefBy[p] = new Set(); });
  pjp.forEach((d) => { const x = d.data(); const p = x.profileid; if (!(p in upgBy)) return;
    if (['upgraded', 'shifted', 'downgraded'].includes(x.journeystatus)) upgBy[p]++;
    if (x.journeyref && x.journeyref.id) jrefBy[p].add(x.journeyref.id); });
  const shiftCounts = pids.map((p) => Math.max(upgBy[p], jrefBy[p].size - 1));
  const medianShift = median(shiftCounts);
  const withShift = shiftCounts.filter((n) => n >= 1).length;

  // cross-checks (informational): every profile has a delivery sequence + the Watson-join string
  const pds = await db.collection('participantdeliverysequence').where('testrunid', '==', RUN).get();
  const jpp = await db.collection('journeyproductpurchase').where('testrunid', '==', RUN).get();
  let watsonOk = 0; jpp.forEach((d) => { if (d.data().watsonpurchaseid) watsonOk++; });

  const okEvents = medianEvents >= 4, okShift = medianShift >= 1;
  console.log(`  cohort size                 : ${pids.length}`);
  console.log(`  median events attended/user : ${medianEvents}   (>=4 ? ${okEvents ? 'PASS' : 'FAIL'}) | users>=4: ${ge4} (${Math.round(ge4 / pids.length * 100)}%)`);
  console.log(`  median shift/upgrade count  : ${medianShift}   (>=1 ? ${okShift ? 'PASS' : 'FAIL'}) | users w/ shift: ${withShift} (${Math.round(withShift / pids.length * 100)}%)`);
  console.log(`  delivery sequences          : ${pds.size}/${pids.length} profiles`);
  console.log(`  watsonpurchaseid on JPP     : ${watsonOk}/${jpp.size} (${jpp.size ? Math.round(watsonOk / jpp.size * 100) : 0}%)`);
  console.log(`\n  RESULT: ${okEvents && okShift ? '✅ COHORT VALID' : '❌ COHORT INVALID'}`);
  process.exit(okEvents && okShift ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
