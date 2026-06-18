// READ-ONLY worked-example traces for the subsystem docs. One real entity per subsystem, end-to-end.
// HARD ATC DENYLIST. No writes. Secrets/URLs redacted (zoomdata -> key existence only).
const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();
const out = {};
const refPath = (r) => (r && r.path) ? r.path : null;
const tsStr = (t) => (t && t.toDate) ? t.toDate().toISOString().slice(0, 19).replace('T', ' ') : null;
const NOW = new Date(), d90 = new Date(NOW - 90 * 86400000), d365 = new Date(NOW - 365 * 86400000);
const cnt = async (col, ...wh) => { let q = db.collection(col); for (const w of wh) q = q.where(...w); return (await q.count().get()).data().count; };

(async () => {
  // ===== RECENCY NUANCES (resolve TD-008 + field-selection) =====
  const rec = {};
  for (const f of ['created', 'modified']) {
    try {
      rec['queue generation/' + f + '/90d'] = await cnt('queue generation', [f, '>=', d90]);
      rec['queue generation/' + f + '/365d'] = await cnt('queue generation', [f, '>=', d365]);
      const mx = (await db.collection('queue generation').orderBy(f, 'desc').limit(1).get()).docs[0];
      rec['queue generation/' + f + '/last'] = mx ? tsStr(mx.data()[f]) : null;
    } catch (e) { rec['queue generation/' + f] = 'ERR ' + e.message.slice(0, 40); }
  }
  for (const f of ['createdon', 'updatedAt']) {
    try { rec['queue stage log/' + f + '/90d'] = await cnt('queue stage log', [f, '>=', d90]); } catch (e) { rec['queue stage log/' + f] = 'ERR'; }
  }
  for (const f of ['subscriptionstart', 'purchasedate', 'updated']) {
    try { rec['participantjourneyproduct/' + f + '/90d'] = await cnt('participantjourneyproduct', [f, '>=', d90]); } catch (e) { rec['pjp/' + f] = 'ERR'; }
  }
  out.recencyNuance = rec;
  console.log('recencyNuance:', JSON.stringify(rec, null, 1));

  // ===== QUEUE TRACE (Example A) =====
  const qt = {};
  // a queue generation with explicit stages[]
  const qgSnap = (await db.collection('queue generation').orderBy('modified', 'desc').limit(10).get()).docs;
  const qg = qgSnap.find(d => Array.isArray(d.data().stages) && d.data().stages.length >= 5) || qgSnap[0];
  const qgd = qg.data();
  qt.queueGeneration = { id: qg.id, queuename: qgd.queuename, stages: qgd.stages, stageCount: (qgd.stages || []).length,
    stagepropertyKeys: Object.keys(qgd.stageproperty || {}).slice(0, 30),
    sampleStageProperty: qgd.stageproperty ? Object.fromEntries(Object.entries(qgd.stageproperty).slice(0, 1).map(([k, v]) => [k, Object.keys(v || {})])) : null,
    queuevariationCount: (qgd.queuevariation || []).length, queueadmin: (qgd.queueadmin || []).length, modified: tsStr(qgd.modified), created: tsStr(qgd.created),
    hasBooleanToggles: ['isdiagnosticsrequired', 'isconsultationrequired', 'isvideologrequired', 'ischangeworkreq'].filter(k => k in qgd) };
  // a completed token with a variation + rich history
  const candidates = (await db.collection('queue_token').where('currentstage', '==', 'Completed').limit(25).get()).docs;
  let best = null, bestLog = [];
  for (const c of candidates.slice(0, 12)) {
    const pid = c.data().profile_id;
    const logs = (await db.collection('queue stage log').where('profile_id', '==', pid).limit(300).get()).docs
      .map(d => d.data()).filter(l => refPath(l.queueref) === refPath(c.data().queueref));
    if (logs.length > bestLog.length) { best = c; bestLog = logs; }
  }
  if (best) {
    const b = best.data();
    qt.tokenTrace = { tokenId: best.id, profile_id: b.profile_id, queuename: b.queuename, queueref: refPath(b.queueref),
      currentstage: b.currentstage, previousstage: b.previousstage, tokenstatus: b.tokenstatus, variationid: b.variationid || null,
      studioid: b.studioid || null, liveassignmentid: b.liveassignmentid || null, productname: b.productname };
    if (b.variationid) {
      try { const v = await db.collection('queue variation').doc(b.variationid).get();
        qt.tokenTrace.resolvedVariation = v.exists ? { variationname: v.data().variationname, stages: v.data().stages, atcmodel: v.data().atcmodel || null } : 'variationid not found';
      } catch (e) { qt.tokenTrace.resolvedVariation = 'ERR'; }
    }
    bestLog.sort((a, b2) => (a.createdon?.toDate?.() || 0) - (b2.createdon?.toDate?.() || 0));
    qt.tokenTrace.stageHistoryCount = bestLog.length;
    qt.tokenTrace.stageHistory = bestLog.map(l => ({ at: tsStr(l.createdon), from: l.previousstage, to: l.currentstage, status: l.stagestatus, manuallymoved: l.manuallymoved ?? null, pos: l.queueposition ?? null }));
  }
  out.queueTrace = qt;
  console.log('\nqueueTrace queue:', qt.queueGeneration.queuename, 'stages:', qt.queueGeneration.stageCount, 'tokenHistory:', qt.tokenTrace?.stageHistoryCount);

  // ===== STUDIO TRACE (Example B) =====
  const st = {};
  const laSnap = (await db.collection('live assignment').orderBy('updated', 'desc').limit(40).get()).docs;
  const la = laSnap.find(d => d.data().studioid && d.data().zoomdata) || laSnap.find(d => d.data().studioid) || laSnap[0];
  const lad = la.data();
  st.liveAssignment = { id: la.id, participantid: lad.participantid, queueid: lad.queueid, stagename: lad.stagename, stagetype: lad.stagetype || null,
    studioid: lad.studioid || null, status: lad.status, created: tsStr(lad.created), updated: tsStr(lad.updated),
    zoomdataKeys: lad.zoomdata ? Object.keys(lad.zoomdata) : null, hasJoinUrl: !!(lad.zoomdata && lad.zoomdata.join_url), hasStartUrl: !!(lad.zoomdata && lad.zoomdata.start_url),
    signatureLen: lad.signature ? String(lad.signature).length : 0, pairingCount: (lad.pairing || []).length, changeworkbriefCount: (lad.changeworkbrief || []).length };
  // queue_token that points at this live assignment
  const linkTok = (await db.collection('queue_token').where('liveassignmentid', '==', la.id).limit(1).get()).docs[0];
  st.linkedToken = linkTok ? { tokenId: linkTok.id, profile_id: linkTok.data().profile_id, currentstage: linkTok.data().currentstage, studioid: linkTok.data().studioid || null } : 'no token currently points here (binding may be completed/cleared)';
  // openviduroom whose id == liveassignmentid (the documented join)
  try { const ovr = await db.collection('openviduroom').doc(la.id).get();
    st.openviduroomByLiveAssignmentId = ovr.exists ? { roomid: ovr.data().roomid, roomstatus: ovr.data().roomstatus, recordingstatus: ovr.data().recordingstatus, hasEgressInfo: !!ovr.data().egressInfo, participantjoined: (ovr.data().participantjoined || []).length } : 'no openviduroom with id==liveassignmentid (Zoom-path studios have none)';
  } catch (e) { st.openviduroomByLiveAssignmentId = 'ERR'; }
  // an openviduroom sample regardless
  const ovrAny = (await db.collection('openviduroom').orderBy('createddate', 'desc').limit(1).get()).docs[0];
  st.openviduroomSample = ovrAny ? { id: ovrAny.id, sessiontype: ovrAny.data().sessiontype, roomstatus: ovrAny.data().roomstatus, recordingstatus: ovrAny.data().recordingstatus, hasEgress: !!ovrAny.data().egressInfo } : null;
  // arenaspace sample
  const asp = (await db.collection('arenaspace').limit(1).get()).docs[0];
  st.arenaspaceSample = asp ? { id: asp.id, spaceid: asp.data().spaceid, pivottype: asp.data().pivottype, mentors: (asp.data().mentor || []).length, validated: asp.data().validated, participants: (asp.data().participantslist || []).length } : null;
  out.studioTrace = st;
  console.log('studioTrace la:', st.liveAssignment.id, 'studio:', st.liveAssignment.studioid, 'linkedToken:', typeof st.linkedToken === 'object');

  // ===== JOURNEY TRACE =====
  const jt = {};
  const pjpCand = (await db.collection('participantjourneyproduct').where('onboarded', '==', true).limit(40).get()).docs;
  // pick a profile with >1 journey (cross-sell) if possible
  const byProfile = {};
  for (const d of pjpCand) { const p = d.data().profileid; (byProfile[p] = byProfile[p] || []).push(d); }
  const pid = Object.keys(byProfile).sort((a, b) => byProfile[b].length - byProfile[a].length)[0];
  jt.profileid = pid;
  jt.journeyCount = byProfile[pid].length;
  jt.journeys = byProfile[pid].map(d => { const x = d.data(); return { id: d.id, journeystatus: x.journeystatus, journeyref: refPath(x.journeyref), subscriptionstart: tsStr(x.subscriptionstart), subscriptionend: tsStr(x.subscriptionend), onboarded: x.onboarded, purchasedate: tsStr(x.purchasedate), journeytype: x.journeytype || null }; });
  const pp = (await db.collection('participantsproduct').where('profileid', '==', pid).limit(50).get()).docs.map(d => d.data());
  jt.products = pp.map(x => ({ productref: refPath(x.productref), deliverymode: x.deliverymode, mode: x.mode || null, status: x.status || null, subscriptionstart: tsStr(x.subscriptionstart), subscriptionend: tsStr(x.subscriptionend), queuevariationid: x.queuevariationid || null }));
  jt.productCount = pp.length;
  // appointments via participantproductid
  const ppids = (await db.collection('participantsproduct').where('profileid', '==', pid).limit(50).get()).docs.map(d => d.id);
  let appts = [];
  for (const id of ppids.slice(0, 10)) { const a = (await db.collection('appointments').where('participantproductid', '==', id).limit(20).get()).docs.map(d => d.data()); appts = appts.concat(a); }
  appts.sort((a, b) => (a.starttime?.toDate?.() || 0) - (b.starttime?.toDate?.() || 0));
  jt.appointmentCount = appts.length;
  jt.appointments = appts.slice(0, 12).map(a => ({ start: tsStr(a.starttime), appointment: refPath(a.appointment), attended: a.attended, cancelled: a.cancelled, totalminutes: a.totalminutes ?? null }));
  const delv = (await db.collection('deliverables').where('profileid', '==', pid).limit(40).get()).docs.map(d => d.data());
  jt.deliverableCount = delv.length;
  jt.deliverableStatuses = delv.reduce((m, d) => { const s = d.status || '(blank)'; m[s] = (m[s] || 0) + 1; return m; }, {});
  out.journeyTrace = jt;
  console.log('journeyTrace pid:', pid, 'journeys:', jt.journeyCount, 'products:', jt.productCount, 'appts:', jt.appointmentCount, 'deliverables:', jt.deliverableCount);

  // ===== CONTENT TRACE =====
  const ct = {};
  ct.totalContentAnalytics = await cnt('content analytics');
  ct.byType = {};
  for (const t of ['solarvoice', 'eiflixcontent', 'eiflix', 'video', 'audio', 'ads', 'series', 'healthstories']) {
    try { ct.byType[t] = await cnt('content analytics', ['type', '==', t]); } catch (e) { ct.byType[t] = 'ERR'; }
  }
  const ca = (await db.collection('content analytics').orderBy('logdate', 'desc').limit(1).get()).docs[0];
  ct.sample = ca ? { type: ca.data().type, videoname: ca.data().videoname, totaltimespend: ca.data().totaltimespend, from: ca.data().from, logdate: tsStr(ca.data().logdate) } : null;
  const tp = (await db.collection('participant touchpoint').orderBy('logdate', 'desc').limit(1).get()).docs[0];
  ct.touchpointSample = tp ? { touchpoint: tp.data().touchpoint, label: tp.data().label, profileid: tp.data().profileid, at: tsStr(tp.data().logdate) } : null;
  ct.touchpointTotal = await cnt('participant touchpoint');
  out.contentTrace = ct;
  console.log('contentTrace total:', ct.totalContentAnalytics, 'solarvoice:', ct.byType.solarvoice, 'eiflixcontent:', ct.byType.eiflixcontent);

  // ===== AUTH TRACE (dashboard nav/ACL config) =====
  const at = { dashboard: [] };
  const dash = (await db.collection('dashboard').get()).docs;
  for (const d of dash) {
    const x = d.data();
    at.dashboard.push({ id: d.id, label: x.label, route: x.route ?? null, showInSidenav: x.showInSidenav, order: x.order,
      roles: x.roles || [], profileidCount: (x.profileid || []).length,
      children: (x.children || []).map(c => ({ label: c.label, route: c.route ?? null, roles: (c.roles || []).length, profileid: (c.profileid || []).length, showInSidenav: c.showInSidenav ?? null })) });
  }
  at.dashboard.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // eisroles sample
  at.eisrolesSample = (await db.collection('eisroles').limit(8).get()).docs.map(d => ({ id: d.id, role: d.data().role }));
  at.eisrolesCount = await cnt('eisroles');
  // classify/AHCRM_dashboard_access (keys + sizes only, no profileids)
  try { const ah = await db.collection('classify').doc('AHCRM_dashboard_access').get();
    at.ahcrmAccess = ah.exists ? Object.fromEntries(Object.entries(ah.data()).map(([k, v]) => [k, Array.isArray(v) ? v.length + ' profileids' : typeof v])) : null;
  } catch (e) { at.ahcrmAccess = 'ERR'; }
  // a profile_data role_ref path (confirm role_ref -> eisroles)
  const prof = (await db.collection('profile_data').where('role_ref', '!=', null).limit(1).get()).docs[0];
  at.profileRoleRefExample = prof ? { profileid: prof.data().profileid, role_ref: refPath(prof.data().role_ref) } : null;
  out.authTrace = at;
  console.log('authTrace dashboard docs:', at.dashboard.length, 'eisroles:', at.eisrolesCount, 'roleRefPath:', at.profileRoleRefExample?.role_ref);

  fs.writeFileSync('/Users/solar/Downloads/svstats/traces.json', JSON.stringify(out, null, 2));
  console.log('\nDONE -> traces.json');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
