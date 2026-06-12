/**
 * Event Participation Confirmations — rollup Cloud Functions (reference impl).
 *
 * Maintains one `event_stats/{arenaeventid}` doc per event (the funnel counts the
 * screen reads) and an `epc_bucket` field on each `requested` participation request
 * (so the funnel list can filter eligible / noProduct / inQueue server-side).
 *
 * Pattern: source writes mark the affected arena-event(s) "dirty"; a scheduled sweep
 * recomputes each dirty event once (debounces bursts). Swap the sweep for Cloud Tasks
 * if you want sub-minute freshness. Drop this into your existing functions repo and
 * deploy with your normal pipeline — it is NOT wired into the Angular app's build.
 *
 * Firebase Functions v2 + Admin SDK.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// ---------- dirty-marking ----------
async function markDirty(arenaIds: string[]) {
  const uniq = [...new Set(arenaIds.filter(Boolean))];
  if (!uniq.length) return;
  const batch = db.batch();
  uniq.forEach(id => batch.set(db.doc(`rollup_dirty/${id}`), { at: FV.serverTimestamp() }, { merge: true }));
  await batch.commit();
}
async function arenaIdsWhere(field: string, value: any): Promise<string[]> {
  const s = await db.collection('arena events').where(field, '==', value).get();
  return s.docs.map(d => (d.data() as any).docid || d.id);
}

// A change to any of these source collections can change a funnel's numbers.
export const onEprWrite = onDocumentWritten('event participation request/{id}', async (e) => {
  const aeid = (e.data?.after.data() as any)?.arenaeventid ?? (e.data?.before.data() as any)?.arenaeventid;
  if (aeid) await markDirty([aeid]);
});
export const onOwnerWrite = onDocumentWritten('participantsproduct/{id}', async (e) => {
  const pref = (e.data?.after.data() as any)?.productref ?? (e.data?.before.data() as any)?.productref;
  if (pref) await markDirty(await arenaIdsWhere('productref', pref)); // fan-out: every event using this product
});
export const onTokenWrite = onDocumentWritten('queue_token/{id}', async (e) => {
  const eref = (e.data?.after.data() as any)?.queueref ?? (e.data?.before.data() as any)?.queueref;
  if (eref) await markDirty(await arenaIdsWhere('eventref', eref));
});
export const onScanWrite = onDocumentWritten('arena e-ticket log/{id}', async (e) => {
  const eref = (e.data?.after.data() as any)?.eventref ?? (e.data?.before.data() as any)?.eventref;
  if (eref) await markDirty(await arenaIdsWhere('eventref', eref));
});

// ---------- debounced recompute ----------
export const recomputeDirty = onSchedule('every 1 minutes', async () => {
  const dirty = await db.collection('rollup_dirty').limit(200).get();
  for (const d of dirty.docs) {
    try { await recomputeEventStats(d.id); await d.ref.delete(); }
    catch (err) { console.error('recompute failed for', d.id, err); }
  }
});

// ---------- the core recompute (mirrors the screen's funnel logic, server-side, once) ----------
export async function recomputeEventStats(arenaeventid: string) {
  const arenaSnap = await db.collection('arena events').where('docid', '==', arenaeventid).limit(1).get();
  if (arenaSnap.empty) return;
  const arena = arenaSnap.docs[0].data() as any;

  const [ownSnap, eprSnap, tokSnap, scanSnap] = await Promise.all([
    db.collection('participantsproduct').where('productref', '==', arena.productref).where('status', '==', null).get(),
    db.collection('event participation request').where('arenaeventid', '==', arenaeventid).where('status', 'in', ['requested', 'approved', 'attended']).get(),
    db.collection('queue_token').where('queueref', '==', arena.eventref).get(),
    db.collection('arena e-ticket log').where('eventref', '==', arena.eventref).get(),
  ]);

  const owners = new Set<string>(); ownSnap.forEach(d => { const p = (d.data() as any).profileid; if (p) owners.add(p); });
  const active = new Set<string>(); tokSnap.forEach(d => { const x = d.data() as any; if (String(x.tokenstatus || '').toLowerCase() === 'active' && x.profile_id) active.add(x.profile_id); });
  const scanned = new Set<string>(); scanSnap.forEach(d => { const p = (d.data() as any).profileid; if (p) scanned.add(p); });

  const requested = new Map<string, string>();   // profileid -> eprId
  const approved = new Set<string>();             // cohort (approved + attended status)
  const attended = new Set<string>();
  let noShow = 0;
  eprSnap.forEach(d => {
    const x = d.data() as any, p = x.profileid; if (!p) return;
    if (x.attendance_state === 'no_show') noShow++;
    if (x.status === 'approved') approved.add(p);
    else if (x.status === 'attended') { attended.add(p); approved.add(p); }
    else if (x.status === 'requested') requested.set(p, x.docid || d.id);
  });
  approved.forEach(p => requested.delete(p));
  scanned.forEach(p => { attended.add(p); approved.add(p); });

  // bucket each requested participant + count eligible / noProduct / inQueue
  let eligible = 0, noProduct = 0, inQueue = 0;
  let batch = db.batch(), n = 0;
  for (const [pid, eprId] of requested) {
    let bucket: string;
    if (!owners.has(pid)) { noProduct++; bucket = 'noProduct'; }
    else if (active.has(pid)) { inQueue++; bucket = 'inQueue'; }
    else { eligible++; bucket = 'eligible'; }
    batch.update(db.doc(`event participation request/${eprId}`), { epc_bucket: bucket });
    if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n > 0) await batch.commit();

  const notRequested = [...owners].filter(o => !requested.has(o) && !approved.has(o)).length;
  await db.doc(`event_stats/${arenaeventid}`).set({
    arenaeventid,
    potential: owners.size, requested: requested.size, notRequested,
    eligible, noProduct, inQueue,
    approved: approved.size, attended: attended.size, noShow,
    updatedAt: FV.serverTimestamp(),
  }, { merge: true });
}
