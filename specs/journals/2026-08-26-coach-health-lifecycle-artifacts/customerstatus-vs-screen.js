/**
 * READ-ONLY probe. Compares the `participant metadata` customerstatus buckets against the
 * universe the journey-coach-health "All participants" screen actually loads.
 *
 * Screen universe = distinct profileid over `participantjourneyproduct`
 *                   where journeystatus in ['initiated','ongoing','completed','cancelled'].
 *
 * Usage: node customerstatus-vs-screen.js <serviceAccount.json>
 * NO WRITES. Touches no ATC collection.
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = process.argv[2];
if (!path) { console.error('usage: node customerstatus-vs-screen.js <serviceAccount.json>'); process.exit(1); }
const sa = require(path);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const CURRENT = ['initiated', 'ongoing', 'completed', 'cancelled'];

// same normalisation as lifecycleOf() in the component
function bucket(s) {
  const t = (s ?? '').toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (t === 'active') return 'active';
  if (t === 'non active' || t === 'nonactive' || t === 'inactive') return 'nonactive';
  if (t === 'discontinued' || t === 'banned' || t === 'late') return 'discontinued';
  return 'nostatus';
}

(async () => {
  console.log(`project: ${sa.project_id}\n`);

  // ---------- 1. participant metadata, grouped by customerstatus ----------
  const metaSnap = await db.collection('participant metadata').get();
  const byBucket = { active: [], nonactive: [], discontinued: [], nostatus: [] };
  const rawTokens = new Map();
  const noNameField = [];
  metaSnap.forEach(d => {
    const data = d.data();
    byBucket[bucket(data.customerstatus)].push(d.id);
    const raw = data.customerstatus === undefined ? '<missing>' : JSON.stringify(data.customerstatus);
    rawTokens.set(raw, (rawTokens.get(raw) ?? 0) + 1);
    if (data.name === undefined || data.name === null) noNameField.push(d.id);
  });
  console.log(`participant metadata docs: ${metaSnap.size}`);
  console.log('raw customerstatus tokens:');
  [...rawTokens.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`   ${String(n).padStart(6)}  ${t}`));
  console.log('\nbucketed (lifecycleOf):');
  for (const k of Object.keys(byBucket)) console.log(`   ${k.padEnd(13)} ${byBucket[k].length}`);
  console.log(`\n!! metadata docs with NO 'name' field: ${noNameField.length}` +
              ` (getParticipantMetaMap orderBy('name') drops these from the app's metaMap)`);
  if (noNameField.length) console.log('   ' + noNameField.slice(0, 20).join(', ') + (noNameField.length > 20 ? ' …' : ''));

  // ---------- 2. the screen's universe ----------
  const pjpSnap = await db.collection('participantjourneyproduct')
    .where('journeystatus', 'in', CURRENT).get();
  const onScreen = new Set();
  pjpSnap.forEach(d => { const p = d.data().profileid; if (p) onScreen.add(p); });
  console.log(`\npjp records matching journeystatus in [${CURRENT}]: ${pjpSnap.size}`);
  console.log(`distinct profileids on screen (= "All participants" total): ${onScreen.size}`);

  // ---------- 3. every pjp record, to size the query-level gate ----------
  const allPjpSnap = await db.collection('participantjourneyproduct').get();
  const allIds = new Set();
  const statusCount = new Map();
  allPjpSnap.forEach(d => {
    const data = d.data();
    const p = data.profileid; if (p) allIds.add(p);
    const raw = data.journeystatus === undefined ? '<missing>' : JSON.stringify(data.journeystatus);
    statusCount.set(raw, (statusCount.get(raw) ?? 0) + 1);
  });
  console.log(`\nALL pjp records: ${allPjpSnap.size}   distinct profileids: ${allIds.size}`);
  console.log('journeystatus distribution (all records):');
  [...statusCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`   ${String(n).padStart(6)}  ${t}`));

  // ---------- 4. MISSING: metadata people the screen never shows ----------
  console.log('\n' + '='.repeat(72));
  console.log('MISSING — in participant metadata, absent from the screen');
  console.log('='.repeat(72));
  const missingReport = {};
  for (const k of ['active', 'nonactive', 'discontinued']) {
    const missing = byBucket[k].filter(id => !onScreen.has(id));
    missingReport[k] = missing;
    const noPjpAtAll = missing.filter(id => !allIds.has(id));
    const gatedByStatus = missing.filter(id => allIds.has(id));
    console.log(`\n${k}: ${byBucket[k].length} in metadata, ${byBucket[k].length - missing.length} on screen, ${missing.length} MISSING`);
    console.log(`   • ${noPjpAtAll.length} have NO participantjourneyproduct record at all`);
    console.log(`   • ${gatedByStatus.length} HAVE pjp records but every one is outside the journeystatus gate`);
    if (gatedByStatus.length) {
      console.log('     these are the ones the journeystatus filter is hiding:');
      gatedByStatus.forEach(id => console.log(`       ${id}`));
    }
    if (noPjpAtAll.length) {
      console.log('     no pjp record (first 40):');
      noPjpAtAll.slice(0, 40).forEach(id => console.log(`       ${id}`));
      if (noPjpAtAll.length > 40) console.log(`       … +${noPjpAtAll.length - 40} more`);
    }
  }

  // ---------- 5. reverse: on screen but no usable metadata ----------
  const metaIds = new Set(metaSnap.docs.map(d => d.id));
  const onScreenNoMeta = [...onScreen].filter(id => !metaIds.has(id));
  const onScreenNoStatus = [...onScreen].filter(id => metaIds.has(id) && bucket(metaSnap.docs.find(d => d.id === id)?.data().customerstatus) === 'nostatus');
  console.log('\n' + '='.repeat(72));
  console.log('REVERSE — on the screen, but no usable customerstatus');
  console.log('='.repeat(72));
  console.log(`on screen with NO participant metadata doc: ${onScreenNoMeta.length}`);
  onScreenNoMeta.slice(0, 40).forEach(id => console.log(`   ${id}`));
  console.log(`on screen but customerstatus blank/unrecognised (→ "No status" tile): ${onScreenNoStatus.length}`);
  onScreenNoStatus.slice(0, 40).forEach(id => console.log(`   ${id}`));

  console.log('\n--- reconciliation ---');
  const onScreenBuckets = { active: 0, nonactive: 0, discontinued: 0, nostatus: 0 };
  const metaById = new Map(metaSnap.docs.map(d => [d.id, d.data()]));
  for (const id of onScreen) onScreenBuckets[bucket(metaById.get(id)?.customerstatus)]++;
  console.log('what the status band should show for "All participants":');
  for (const k of Object.keys(onScreenBuckets)) console.log(`   ${k.padEnd(13)} ${onScreenBuckets[k]}`);
  console.log(`   ${'TOTAL'.padEnd(13)} ${onScreen.size}`);
  process.exit(0);
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
