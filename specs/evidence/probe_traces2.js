// READ-ONLY supplementary traces: (1) resolve role_ref target collection (auth model truth),
// (2) a concrete 1:1 scheduling worked-example (appointment -> appointmenttype -> participantsproduct -> deliverable),
// (3) confirm queue token.queueref -> queue generation, (4) a productToDeliverySequence shape.
// HARD ATC DENYLIST. No writes.
const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();
const refPath = (r) => (r && r.path) ? r.path : null;
const tsStr = (t) => (t && t.toDate) ? t.toDate().toISOString().slice(0, 19).replace('T', ' ') : null;
const out = {};

(async () => {
  // ===== (1) AUTH MODEL: where does profile_data.role_ref point? =====
  const profs = (await db.collection('profile_data').limit(60).get()).docs;
  const tally = {};
  let sampleUsersRolesPath = null, sampleEisPath = null;
  profs.forEach(d => { const p = refPath(d.data().role_ref); if (!p) return; const col = p.split('/')[0]; tally[col] = (tally[col] || 0) + 1;
    if (col === 'users_roles' && !sampleUsersRolesPath) sampleUsersRolesPath = p;
    if (col === 'eisroles' && !sampleEisPath) sampleEisPath = p; });
  out.roleRefTargetTally = tally;
  // shape of a users_roles doc
  if (sampleUsersRolesPath) { const ur = await db.doc(sampleUsersRolesPath).get();
    const x = ur.data() || {}; const boolKeys = Object.keys(x).filter(k => x[k] === true);
    out.usersRolesDoc = { path: sampleUsersRolesPath, fieldCount: Object.keys(x).length, trueFlags: boolKeys.slice(0, 30), allKeysSample: Object.keys(x).slice(0, 30) }; }
  // shape of an eisroles doc (for contrast)
  const eis = (await db.collection('eisroles').limit(3).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  out.eisrolesDocs = eis.map(e => ({ id: e.id, role: e.role, experiencestage: e.experiencestage, experiencelevel: e.experiencelevel }));
  out.usersRolesCount = (await db.collection('users_roles').count().get()).data().count;
  console.log('roleRef targets:', JSON.stringify(tally), ' users_roles count:', out.usersRolesCount);
  console.log('usersRolesDoc trueFlags:', (out.usersRolesDoc || {}).trueFlags);

  // ===== (2) SCHEDULING worked-example: a real attended 1:1 appointment, fully resolved =====
  const apptSnap = (await db.collection('appointments').orderBy('starttime', 'desc').limit(60).get()).docs; // single-field sort (auto-indexed); filter in JS to avoid composite index
  const appt = apptSnap.find(d => d.data().attended === true && d.data().participantproductid && d.data().appointment)
    || apptSnap.find(d => d.data().participantproductid && d.data().appointment) || apptSnap[0];
  const a = appt.data();
  const sch = { appointmentId: appt.id, start: tsStr(a.starttime), end: tsStr(a.endtime), attended: a.attended, cancelled: a.cancelled,
    totalminutes: a.totalminutes ?? null, appointmentRef: refPath(a.appointment), participantproductid: a.participantproductid || null,
    productid: a.productid || null, hostCount: (a.hosts || []).length, hasZoom: !!a.zoomurl };
  // resolve appointment ref -> appointmenttype name
  if (a.appointment) { try { const at = await a.appointment.get(); sch.appointmentType = at.exists ? (at.data().appointmenttype || at.data().appointment || '(name field?)') : 'not found'; sch.appointmentTypeId = at.id; } catch (e) { sch.appointmentType = 'ERR'; } }
  // resolve participantsproduct -> deliverymode + product
  if (a.participantproductid) { try { const pp = await db.collection('participantsproduct').doc(a.participantproductid).get();
    if (pp.exists) { sch.participantsproduct = { profileid: pp.data().profileid, deliverymode: pp.data().deliverymode, productref: refPath(pp.data().productref), status: pp.data().status || null };
      // a deliverable for that profile
      const delv = (await db.collection('deliverables').where('profileid', '==', pp.data().profileid).limit(5).get()).docs.map(d => ({ type: d.data().type, status: d.data().status || null, deliveryref: refPath(d.data().deliveryref) }));
      sch.deliverablesForProfile = delv; } } catch (e) { sch.participantsproduct = 'ERR ' + e.message.slice(0, 40); } }
  out.schedulingTrace = sch;
  console.log('\nschedulingTrace appt:', sch.appointmentId, 'type:', sch.appointmentType, 'mode:', (sch.participantsproduct || {}).deliverymode);

  // ===== (3) confirm token.queueref -> queue generation doc =====
  const tok = (await db.collection('queue_token').where('currentstage', '==', 'Completed').limit(1).get()).docs[0];
  if (tok && tok.data().queueref) { try { const qg = await tok.data().queueref.get();
    out.tokenQueueRef = { tokenId: tok.id, queueref: refPath(tok.data().queueref), resolvesToQueueGeneration: qg.exists, queuename: qg.exists ? qg.data().queuename : null, hasStages: qg.exists ? Array.isArray(qg.data().stages) : null };
  } catch (e) { out.tokenQueueRef = 'ERR'; } }
  console.log('tokenQueueRef:', JSON.stringify(out.tokenQueueRef));

  // ===== (4) a productToDeliverySequence shape (config -> delivery sequence) =====
  const pds = (await db.collection('productToDeliverySequence').limit(8).get()).docs;
  const withSeq = pds.find(d => Array.isArray(d.data().deliveryoptions) && d.data().deliveryoptions.length) || pds[0];
  const pd = withSeq.data();
  out.productToDeliverySequenceSample = { id: withSeq.id, product: refPath(pd.product), deliveryoptionCount: (pd.deliveryoptions || []).length,
    firstOptionKeys: pd.deliveryoptions && pd.deliveryoptions[0] ? Object.keys(pd.deliveryoptions[0]) : null,
    firstOptionDeliverySeqLen: pd.deliveryoptions && pd.deliveryoptions[0] && Array.isArray(pd.deliveryoptions[0].deliverysequence) ? pd.deliveryoptions[0].deliverysequence.length : null };
  console.log('productToDeliverySequence sample:', JSON.stringify(out.productToDeliverySequenceSample));

  fs.writeFileSync('/Users/solar/Downloads/svstats/traces2.json', JSON.stringify(out, null, 2));
  console.log('\nDONE -> traces2.json');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
