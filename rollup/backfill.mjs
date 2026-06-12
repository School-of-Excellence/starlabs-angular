/**
 * One-time backfill: compute event_stats for every current/upcoming event.
 * Run this once (it populates the rollup docs the screen now prefers), then deploy
 * functions.ts to keep them fresh. Safe to re-run — it's an idempotent rebuild.
 *
 *   npm i firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=./starlabs-test-sa.json node rollup/backfill.mjs
 *
 * (or against the emulator:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node rollup/backfill.mjs)
 */
import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'starlabs-test' });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const toMs = (d) => d?.toMillis?.() ?? (d?.toDate?.()?.getTime?.()) ?? (d ? new Date(d).getTime() : 0);

async function recomputeEventStats(arenaeventid, arena) {
  const [ownSnap, eprSnap, tokSnap, scanSnap] = await Promise.all([
    db.collection('participantsproduct').where('productref', '==', arena.productref).where('status', '==', null).get(),
    db.collection('event participation request').where('arenaeventid', '==', arenaeventid).where('status', 'in', ['requested', 'approved', 'attended']).get(),
    db.collection('queue_token').where('queueref', '==', arena.eventref).get(),
    db.collection('arena e-ticket log').where('eventref', '==', arena.eventref).get(),
  ]);
  const owners = new Set(); ownSnap.forEach(d => { const p = d.data().profileid; if (p) owners.add(p); });
  const active = new Set(); tokSnap.forEach(d => { const x = d.data(); if (String(x.tokenstatus || '').toLowerCase() === 'active' && x.profile_id) active.add(x.profile_id); });
  const scanned = new Set(); scanSnap.forEach(d => { const p = d.data().profileid; if (p) scanned.add(p); });
  const requested = new Map(), approved = new Set(), attended = new Set();
  let noShow = 0;
  eprSnap.forEach(d => {
    const x = d.data(), p = x.profileid; if (!p) return;
    if (x.attendance_state === 'no_show') noShow++;
    if (x.status === 'approved') approved.add(p);
    else if (x.status === 'attended') { attended.add(p); approved.add(p); }
    else if (x.status === 'requested') requested.set(p, x.docid || d.id);
  });
  approved.forEach(p => requested.delete(p));
  scanned.forEach(p => { attended.add(p); approved.add(p); });
  let eligible = 0, noProduct = 0, inQueue = 0;
  let batch = db.batch(), n = 0;
  for (const [pid, eprId] of requested) {
    let bucket;
    if (!owners.has(pid)) { noProduct++; bucket = 'noProduct'; }
    else if (active.has(pid)) { inQueue++; bucket = 'inQueue'; }
    else { eligible++; bucket = 'eligible'; }
    batch.update(db.doc(`event participation request/${eprId}`), { epc_bucket: bucket });
    if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n > 0) await batch.commit();
  const notRequested = [...owners].filter(o => !requested.has(o) && !approved.has(o)).length;
  await db.doc(`event_stats/${arenaeventid}`).set({
    arenaeventid, potential: owners.size, requested: requested.size, notRequested,
    eligible, noProduct, inQueue, approved: approved.size, attended: attended.size, noShow,
    updatedAt: FV.serverTimestamp(),
  }, { merge: true });
  return owners.size;
}

const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
const floor = todayStart.getTime();
const live = new Set();
for (const [coll, endField] of [['event collection', 'end_date'], ['queue generation', 'queueenddate']]) {
  const snap = await db.collection(coll).get();
  snap.forEach(d => { if (d.data().delete !== true && toMs(d.data()[endField]) >= floor) live.add(d.id); });
}
const arenas = await db.collection('arena events').get();
let done = 0;
for (const a of arenas.docs) {
  const data = a.data();
  if (data.delete === true || !data.eventref || !live.has(data.eventref.id)) continue;
  const owners = await recomputeEventStats(data.docid || a.id, data);
  console.log(`  event_stats[${data.docid || a.id}]  potential=${owners}`);
  done++;
}
console.log(`BACKFILL DONE — ${done} event_stats docs`);
process.exit(0);
