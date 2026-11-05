// seed-update.js — adds the 2026-11-02 update to the manual demo world (run after seed-manual-demo + seed-extra).
// EMULATOR ONLY. Asha's WiSH ATC gets its purchase + delivery answers; Rahul's EI ATC gets a queue + a queue answer;
// both models get an optional sponsor form (an example form for the manual screenshots).
'use strict';
if (!/^localhost:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') || !/^localhost:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) { console.error('REFUSING: emulator only'); process.exit(3); }
const hubRequire = require('module').createRequire('/Users/m1/Documents/starlabs-e2e-tests/package.json');
const admin = hubRequire('firebase-admin');
const { getFirestore } = hubRequire('firebase-admin/firestore');
admin.initializeApp({ projectId: 'starlabs-cicd' });
const db = admin.firestore();
const adb = getFirestore(admin.app(), 'firestore-atc');
const fdb = getFirestore(admin.app(), 'firestore-forms');
const T = admin.firestore.Timestamp;
const tag = { testrunid: 'manual', _testdata: true };
const daysAgo = (d) => T.fromMillis(Date.now() - d * 86400e3);
const PID = (k) => `manual_pf_${k}`;
const q = (name, desc = '') => ({ type: 'Text', fieldname: name, fielddescription: desc, required: false });

const FORMS = {
  sponsor: { id: 'manual_df_sponsor', name: 'Sponsor Feedback', arr: [q('What change have you noticed?'), q('What would you like to see next?')] },
  wishCheckin: { id: 'manual_df_wish_checkin', name: 'WiSH Weekly Check-in', arr: [q('How did you sleep this week?'), q('Energy after lunch (1–10)')] },
  wishLab: { id: 'manual_df_wish_lab', name: 'WiSH Lab Report Upload', arr: [q('Report date'), q('Notes for your specialist')] },
  eiIntake: { id: 'manual_df_ei_intake', name: 'EI Intake Questionnaire', arr: [q('What brings you here?'), q('Who is affected most?')] },
};

(async () => {
  for (const f of Object.values(FORMS)) {
    await db.collection('delivery forms').doc(f.id).set({ docid: f.id, formname: f.name, formdescription: 'Manual demo form', formarray: f.arr, delete: false, ...tag });
  }
  // optional sponsor form on both models (examples)
  for (const [doc, base] of [['manual_model_wish', [{ formid: 'manual_df_clarity', filledby: 'specialist' }, { formid: 'manual_df_life', filledby: 'participant' }]],
    ['manual_model_ei', [{ formid: 'manual_df_pre', filledby: 'participant' }]]]) {
    await db.doc(`atc model/${doc}`).set({ forms: [...base, { formid: FORMS.sponsor.id, filledby: 'sponsor' }] }, { merge: true });
  }
  const ans = (id, f, who, d, extra, values) => fdb.collection('formsByClient').doc(id).set({
    docid: id, formid: f.id, formname: f.name, profileid: PID(who), date: daysAgo(d), formarray: f.arr.map((x, i) => ({ ...x, value: values[i] })), ...extra, ...tag });
  // WiSH: Asha's ATC knows its purchase; two delivery-sequence answers of that purchase
  await adb.doc('atc_alpha/manual_atc_wish_asha').set({ participantproductid: 'manual_pp_asha_wish' }, { merge: true });
  await ans('manual_dl_asha_checkin', FORMS.wishCheckin, 'asha', 4, { participantproductid: 'manual_pp_asha_wish', submittedin: 'breakthroughs' }, ['Better — about 6.5 hours', '6']);
  await ans('manual_dl_asha_lab', FORMS.wishLab, 'asha', 9, { participantproductid: 'manual_pp_asha_wish', submittedin: 'breakthroughs' }, ['12 Oct 2026', 'Vitamin D was low']);
  // EI: Rahul's ATC was given in a queue; one answer filled in that queue
  await adb.doc('atc_alpha/manual_atc_ei_rahul').set({ queueid: 'manual_queue_ei', queuename: 'EI Solution Intake', stagename: 'Consultation' }, { merge: true });
  await ans('manual_q_rahul_intake', FORMS.eiIntake, 'rahul', 6, { queueref: fdb.doc('queue generation/manual_queue_ei'), stagename: 'Consultation', submittedin: 'starlabs' }, ['Short fuse at work', 'My team']);
  console.log('[manual] update seeded');
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
