// @ts-nocheck
/**
 * seed-manual-demo.js — a small FICTIONAL demo world for the WiSH / EI Solution ATC user-manual screenshots.
 * EMULATOR ONLY (same G1 guard as the hub's atc/seed-atc.js). Every doc is tagged testrunid=manual.
 *
 * Run from the hub so firebase-admin resolves:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199 node <this> --seed
 */
'use strict';

const EMU_FS = process.env.FIRESTORE_EMULATOR_HOST;
const EMU_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!EMU_FS || !EMU_AUTH || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(EMU_FS) || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(EMU_AUTH)) {
  console.error('REFUSING: emulator hosts must be set and local');
  process.exit(3);
}

const HUB = '/Users/m1/Documents/starlabs-e2e-tests';
const hubRequire = require('module').createRequire(`${HUB}/package.json`);
const admin = hubRequire('firebase-admin');
const { getFirestore } = hubRequire('firebase-admin/firestore');
admin.initializeApp({ projectId: 'starlabs-cicd', storageBucket: 'starlabs-cicd.appspot.com' });
const db = admin.firestore();
const adb = getFirestore(admin.app(), 'firestore-atc');
const fdb = getFirestore(admin.app(), 'firestore-forms');
const auth = admin.auth();
const T = admin.firestore.Timestamp;
const RUN = 'manual';
const tag = { testrunid: RUN, _testdata: true };
const daysAgo = (d) => T.fromMillis(Date.now() - d * 86400e3);
const hoursAgo = (h) => T.fromMillis(Date.now() - h * 3600e3);
const PASSWORD = 'Test!1234';

// ---- people (all fictional) ---------------------------------------------------------------------------
const PEOPLE = {
  // staff
  kavya: { name: 'Kavya Rao', roles: ['admin'], email: 'kavya.rao@example.com' },        // specialist + admin (configures)
  rohan: { name: 'Rohan Das', roles: ['changeagent'], email: 'rohan.das@example.com' },  // WiSH collaborator
  vikram: { name: 'Vikram Nair', roles: ['changeagent'], email: 'vikram.nair@example.com' }, // EI shadow
  sanjay: { name: 'Sanjay Kulkarni', roles: ['mentor'], email: 'sanjay.kulkarni@example.com' },
  // participants
  asha: { name: 'Asha Menon', participant: true, email: 'asha.menon@example.com' },      // WiSH ATC (saved)
  rahul: { name: 'Rahul Verma', participant: true, email: 'rahul.verma@example.com' },   // EI Solution ATC (saved)
  neha: { name: 'Neha Kapoor', participant: true, email: 'neha.kapoor@example.com' },    // WiSH prescribe walk-through
  arjun: { name: 'Arjun Pillai', participant: true, email: 'arjun.pillai@example.com' }, // EI prescribe walk-through
  // sponsors (2026-11-02 update): existing users, picked on the first sponsor-form send
  ravi: { name: 'Ravi Menon', participant: true, email: 'ravi.menon@example.com' },
  meera: { name: 'Meera Iyer', participant: true, email: 'meera.iyer@example.com' },
};
const PID = (k) => `manual_pf_${k}`;
const UID = (k) => `manual_u_${k}`;
const staffKeys = Object.keys(PEOPLE).filter((k) => !PEOPLE[k].participant);
const partKeys = Object.keys(PEOPLE).filter((k) => PEOPLE[k].participant);

// ---- reference data ----------------------------------------------------------------------------------
const ACT = { author: 'manual_act_diag_solo', observer: 'manual_act_diag_shadow', ca: 'manual_act_cw_solo', mentoring: 'manual_act_mentoring' };
const ACT_DEF = {
  author: { activity: 'Diagnostics Solo', atcproperty: 'author' },
  observer: { activity: 'Diagnostics Shadow', atcproperty: 'observer' },
  ca: { activity: 'Changework Solo', atcproperty: 'assigned_to' },
  mentoring: { activity: 'Mentoring', atcproperty: 'mentoring' },
};
const PROC = {
  breath: 'Morning breathing practice', walk: 'Evening walk (30 min)', journal: 'Gratitude journal',
  sunset: 'Digital sunset at 9 pm', talk: 'Weekly family check-in', pause: 'Pause-and-name the feeling',
};
const ROLE = {
  wishSpec: 'WiSH Diagnostics Specialist', wishColl: 'WiSH Diagnostics Collaborator',
  eiSpec: 'EI Diagnostics Specialist', eiShadow: 'EI Shadow',
};
const APPT_TYPE = { wish: 'WiSH Diagnostics', ei: 'EI Solution Session' };
const MODEL = { wish: 'WiSH', ei: 'EI Solution' };
const DIRECTIVE = {
  wish: 'Build a calm, energetic daily rhythm that supports your wishes',
  ei: 'Respond with awareness instead of reacting under stress',
};

const q = (fieldname, type = 'Paragraph', extra = {}) => ({ type, fieldname, required: false, ...extra });
const FORMS = {
  clarity: { name: 'WiSH Clarity Call', desc: 'Filled by the specialist after the clarity call', formarray: [
    { type: 'label', fieldname: 'Clarity call notes', fielddescription: 'Capture what the participant wants from WiSH' },
    q('What does the participant most want to change?'),
    q('Which WiSH outcome feels most urgent?', 'DropDown', { options: ['Health', 'Career', 'Relationships', 'Inner peace'] }),
    q('Commitment level', 'slider', { options: ['Low', 'Medium', 'High'] }),
    q('Notes for the change agent'),
  ] },
  life: { name: 'WiSH Life Report', desc: 'Filled by the participant in the app', formarray: [
    { type: 'label', fieldname: 'My WiSH Life Report', fielddescription: 'Answer honestly — there are no right answers' },
    q('How would you describe your energy through the day?'),
    q('How well are you sleeping?', 'radio', { options: ['Very well', 'Okay', 'Poorly'] }),
    q('What gave you joy this week?'),
    q('What is one wish you want to achieve this cycle?'),
  ] },
  pre: { name: 'EI Solution Pre Form', desc: 'Filled by the participant before the EI session', formarray: [
    { type: 'label', fieldname: 'Before your EI Solution session', fielddescription: 'Helps your specialist prepare' },
    q('Describe a recent situation where you reacted strongly'),
    q('Who is affected most when this happens?', 'DropDown', { options: ['Self', 'Spouse', 'Family', 'Friends'] }),
    q('How often does this happen?', 'radio', { options: ['Daily', 'Weekly', 'Rarely'] }),
  ] },
};
const DF = { clarity: 'manual_df_clarity', life: 'manual_df_life', pre: 'manual_df_pre' };

const ATCID = {
  wish: 'manual_atc_wish_asha', ei: 'manual_atc_ei_rahul',
};

async function seed() {
  // 1) auth chain
  for (const k of Object.keys(PEOPLE)) {
    const p = PEOPLE[k];
    await auth.createUser({ uid: UID(k), email: p.email, password: PASSWORD, displayName: p.name })
      .catch((e) => { if (e.code !== 'auth/uid-already-exists') throw e; });
    await auth.setCustomUserClaims(UID(k), { testrunid: RUN, role: p.participant ? 'participant' : p.roles[0] });
    const roleId = `manual_role_${k}`;
    const userRef = db.collection('user_data').doc(UID(k));
    const profileRef = db.collection('profile_data').doc(PID(k));
    const roleRef = db.collection('users_roles').doc(roleId);
    const flags = {}; (p.roles || []).forEach((r) => { flags[r] = true; });
    await userRef.set({ name: p.name, email: p.email, number: '9999900000', ...tag });
    await roleRef.set({ id: roleId, name: p.name, participant: !!p.participant, profile_ref: profileRef, ...flags, ...tag });
    const [first, ...rest] = p.name.split(' ');
    await profileRef.set({
      docid: PID(k), profileid: PID(k), email: p.email, name: p.name, firstname: first, lastname: rest.join(' '),
      number: '9999900000', countrycode: '+91', user_ref: userRef, role_ref: roleRef, ...tag,
    });
  }
  const staffPids = staffKeys.map(PID);
  const routes = [
    ['/prescribeATC', 'Prescribe ATC'], ['/editATC', 'Edit ATC'], ['/viewprescribedATC', 'View Prescribed ATC'],
    ['/previewATC', 'Preview ATC'], ['/formtemplate', 'Form Template'], ['/atcmodel', 'ATC Model'],
    ['/deliveryactivities', 'Delivery Activities'], ['/mapappointmentrole', 'Map Appointment Role'],
    ['/viewUpgradedATC', 'Upgraded ATC'],
    ['/view-participant-atc', 'View Participant ATC'],
  ];
  for (const [route, label] of routes) {
    await db.collection('dashboard').doc(`manual_dash_${route.replace(/\W+/g, '_')}`).set({
      route, label, roles: ['admin', 'eis', 'changeagent', 'mentor'], profileid: staffPids,
      showInSidenav: true, order: 0, children: [], ...tag,
    });
  }

  // 2) reference data
  for (const k of Object.keys(ACT)) await db.collection('bigactivity').doc(ACT[k]).set({ docid: ACT[k], ...ACT_DEF[k], ...tag });
  for (const k of Object.keys(PROC)) await db.collection('procedures').doc(`manual_proc_${k}`).set({ name: PROC[k], ...tag });
  await db.collection('procedure_recommend').doc('manual_rec_self').set({ name: 'Self', ...tag });
  await db.collection('procedure_recommend').doc('manual_rec_family').set({ name: 'Family', ...tag });
  await db.collection('classify').doc('adjustment_awareness').set({
    label: 'Awareness', potentialyearlabel: 'Potential Years',
    awarenesslist: [{ aware: 'aware', value: 'Aware' }, { aware: 'unaware', value: 'Unaware' }], ...tag,
  });
  for (const k of Object.keys(FORMS)) {
    await db.collection('delivery forms').doc(DF[k]).set({
      docid: DF[k], formname: FORMS[k].name, formdescription: FORMS[k].desc, formarray: FORMS[k].formarray, delete: false, ...tag,
    });
  }
  await db.collection('atc model').doc('manual_model_wish').set({
    atcmodel: MODEL.wish, directive: DIRECTIVE.wish, description: 'WiSH Accelerator Journey ATC',
    forms: [{ formid: DF.clarity, filledby: 'specialist' }, { formid: DF.life, filledby: 'participant' }], ...tag,
  });
  await db.collection('atc model').doc('manual_model_ei').set({
    atcmodel: MODEL.ei, directive: DIRECTIVE.ei, description: 'EI Solution ATC',
    forms: [{ formid: DF.pre, filledby: 'participant' }], ...tag,
  });
  for (const k of Object.keys(MODEL)) {
    await db.collection('products').doc(`manual_product_${k}`).set({ atcmodel: MODEL[k], directive: DIRECTIVE[k], ...tag });
  }

  // roles, appointment types, mapping
  const ref = (p) => db.doc(p);
  for (const k of Object.keys(ROLE)) await db.collection('eisroles').doc(`manual_role_${k}`).set({ docid: `manual_role_${k}`, id: `manual_role_${k}`, role: ROLE[k], ...tag });
  for (const k of Object.keys(APPT_TYPE)) await db.collection('appointmenttype').doc(`manual_at_${k}`).set({ docid: `manual_at_${k}`, id: `manual_at_${k}`, appointmenttype: APPT_TYPE[k], ...tag });
  await db.collection('AppointmentType-To-Roles').doc('manual_atr_wish').set({
    id: 'manual_atr_wish', assigned_appttype_ref: ref('appointmenttype/manual_at_wish'),
    required_role: [ref('eisroles/manual_role_wishSpec'), ref('eisroles/manual_role_wishColl')], additional_role: [],
    atcrequired: true, atcmodel: MODEL.wish,
    atcrolemap: { manual_role_wishSpec: [ACT.author], manual_role_wishColl: [ACT.observer, ACT.ca] }, ...tag,
  });
  await db.collection('AppointmentType-To-Roles').doc('manual_atr_ei').set({
    id: 'manual_atr_ei', assigned_appttype_ref: ref('appointmenttype/manual_at_ei'),
    required_role: [ref('eisroles/manual_role_eiSpec'), ref('eisroles/manual_role_eiShadow')], additional_role: [],
    atcrequired: true, atcmodel: MODEL.ei,
    atcrolemap: { manual_role_eiSpec: [ACT.author], manual_role_eiShadow: [ACT.observer, ACT.ca] }, ...tag,
  });
  const pf = (k) => ref(`profile_data/${PID(k)}`);
  const appt = (id, type, who, spec, other, roleSpec, roleOther, start) => db.collection('appointments').doc(id).set({
    appointment: ref(`appointmenttype/manual_at_${type}`), bookedby: pf(who), starttime: start, endtime: start,
    cancelled: false, attended: true, hosts: [pf(spec), pf(other)],
    hostRole: { [`eisroles/manual_role_${roleSpec}`]: [pf(spec)], [`eisroles/manual_role_${roleOther}`]: [pf(other)] }, ...tag,
  });
  await appt('manual_ap_neha', 'wish', 'neha', 'kavya', 'rohan', 'wishSpec', 'wishColl', hoursAgo(2));
  await appt('manual_ap_arjun', 'ei', 'arjun', 'kavya', 'vikram', 'eiSpec', 'eiShadow', hoursAgo(3));
  await appt('manual_ap_asha', 'wish', 'asha', 'kavya', 'rohan', 'wishSpec', 'wishColl', daysAgo(6));
  await appt('manual_ap_rahul', 'ei', 'rahul', 'kavya', 'vikram', 'eiSpec', 'eiShadow', daysAgo(5));

  // 3) saved ATCs (firestore-atc)
  const apref = (k) => adb.doc(`profile_data/${PID(k)}`);
  const procRef = (k) => adb.doc(`procedures/manual_proc_${k}`);
  async function writeATC(id, data, adjustments) {
    const r = adb.collection('atc_alpha').doc(id);
    await r.set({ atcid: id, isdelete: false, type: 'online', notesid: `${id}_notes`, mentoringid: null, mentorref: [], mentee: [],
      observer: null, validator: [apref('sanjay')], prescription_image: null, status: 'validated',
      totaladjustment: adjustments.length, totalprocedure: adjustments.reduce((n, a) => n + a.procedures.length, 0), ...data, ...tag });
    for (let a = 0; a < adjustments.length; a++) {
      const adj = adjustments[a];
      const adjId = `adjustment ${String(a + 1).padStart(2, '0')}`;
      const ar = r.collection('corrections').doc(adjId);
      await ar.set({ name: adj.name, awareness: adj.awareness ?? null, awarenessdetail: adj.awarenessdetail ?? null,
        potentialyears: adj.potentialyears ?? null, isdelete: false, implementationagent: [PID(adj.agent)], created: data.prescription_date, ...tag });
      for (let p = 0; p < adj.procedures.length; p++) {
        const pr = adj.procedures[p];
        await ar.collection('procedures').doc(`${adjId} - ${p + 1}`).set({
          name: procRef(pr.proc), recommended_to: pr.rec ? db.doc(`procedure_recommend/${pr.rec}`) : null, level: {},
          mandatory: !!pr.mandatory, status: pr.status || 'yet to start', cancelled: false, isdelete: false, autogeneralized: false,
          product: data.product, created: data.prescription_date, bigactivity: { [ACT.ca]: [PID(adj.agent)] },
          assigned_to: [apref(adj.agent)], ...tag,
        });
      }
    }
    await adb.collection('atc_notes').doc(`${id}_notes`).set({ atcid: id, consultationpoint: data._points, consultationsummary: data._summary,
      notes: data._notes, changeworkbrief: [], imagenotes: [], from: 'alpha', created: data.prescription_date, ...tag });
    await r.update({ _points: admin.firestore.FieldValue.delete(), _summary: admin.firestore.FieldValue.delete(), _notes: admin.firestore.FieldValue.delete() });
  }

  await writeATC(ATCID.wish, {
    profileid: PID('asha'), product: MODEL.wish, directive: 'Wake up rested and keep steady energy through the workday',
    prescription_date: daysAgo(6), appointmentid: 'manual_ap_asha',
    author: [apref('kavya')], bigactivity: { [ACT.author]: [PID('kavya')], [ACT.observer]: [PID('rohan')] },
    outcomes: [
      { outcomearea: 'Health', outcomeexpected: 'Sleep 7 hours on most nights' },
      { outcomearea: 'Career', outcomeexpected: 'Finish the workday without an energy crash' },
      { outcomearea: 'Relationships', outcomeexpected: 'One unhurried family dinner every week' },
    ],
    _points: 'Late screens, skipped breakfast, afternoon slump', _summary: 'Energy dips are driven by poor sleep hygiene.',
    _notes: 'Participant is motivated; start small.',
  }, [
    { name: 'Wind down before bed\n\nOutcome - Falls asleep within 20 minutes', agent: 'rohan', procedures: [
      { proc: 'sunset', mandatory: true }, { proc: 'breath', mandatory: true, status: 'completed' }] },
    { name: 'Move every evening\n\nOutcome - Feels lighter and calmer by night', agent: 'rohan', procedures: [{ proc: 'walk', mandatory: true }] },
  ]);

  await writeATC(ATCID.ei, {
    profileid: PID('rahul'), product: MODEL.ei, directive: 'Notice the trigger, pause, then choose the response',
    prescription_date: daysAgo(5), appointmentid: 'manual_ap_rahul',
    author: [apref('kavya')], bigactivity: { [ACT.author]: [PID('kavya')], [ACT.observer]: [PID('vikram')] },
    ask: [{ askedby: 'self', askedfor: 'Stay calm in tense meetings' }, { askedby: 'spouse', askedfor: 'Less irritation at home in the evenings' }],
    reviewlog: [
      { id: 'manual_rv1', note: 'Follow-up call: Rahul has used the pause practice three times this week.', createdby: PID('vikram'), createdon: daysAgo(2), isdelete: false, deletedby: null, deletedon: null },
      { id: 'manual_rv2', note: 'Spouse confirms evenings are calmer. Keep the family check-in going.', createdby: PID('kavya'), createdon: daysAgo(1), isdelete: false, deletedby: null, deletedon: null },
      { id: 'manual_rv3', note: 'Duplicate entry', createdby: PID('kavya'), createdon: daysAgo(1), isdelete: true, deletedby: PID('kavya'), deletedon: daysAgo(1) },
    ],
    _points: 'Reacts sharply when interrupted', _summary: 'Stress response is fast; awareness is low in the moment.',
    _notes: 'Responds well to concrete practices.',
  }, [
    { name: 'Pause before responding', agent: 'vikram', procedures: [{ proc: 'pause', mandatory: true, rec: 'manual_rec_self' }, { proc: 'breath' }] },
    { name: 'Reconnect at home', agent: 'vikram', procedures: [{ proc: 'talk', mandatory: true, rec: 'manual_rec_family' }] },
  ]);

  // 4) forms: Asha's clarity call answered (specialist), Life Report sent to the app; Rahul's Pre Form submitted
  const answer = (id, k, who, atcid, values, filledby) => fdb.collection('formsByClient').doc(id).set({
    docid: id, formid: DF[k], formname: FORMS[k].name, profileid: PID(who), atcid, filledby, date: daysAgo(1),
    formarray: FORMS[k].formarray.map((f, i) => (f.type === 'label' ? f : { ...f, value: values[i - 1] })), ...tag,
  });
  await answer('manual_ans_clarity', 'clarity', 'kavya', ATCID.wish, // a specialist form carries the specialist's profile id
    ['Wants to stop feeling drained by 3 pm', 'Health', 'High', 'Start with the evening routine first'], 'specialist');
  await answer('manual_ans_pre', 'pre', 'rahul', ATCID.ei,
    ['Snapped at a colleague when a meeting overran', 'Spouse', 'Weekly'], 'participant');
  await adb.doc(`atc_alpha/${ATCID.wish}`).update({ formsubmitted: { [DF.clarity]: 'manual_ans_clarity' } });
  await adb.doc(`atc_alpha/${ATCID.ei}`).update({ formsubmitted: { [DF.pre]: 'manual_ans_pre' } });
  await adb.collection('atc_form_requests').doc(`${ATCID.wish}_${DF.life}`).set({
    atcid: ATCID.wish, formid: DF.life, profileid: PID('asha'), product: MODEL.wish, sentby: PID('kavya'), sentat: daysAgo(1), formstatus: 'sent', filledby: 'participant', ...tag,
  });
  await adb.collection('atc_form_requests').doc(`${ATCID.ei}_${DF.pre}`).set({
    atcid: ATCID.ei, formid: DF.pre, profileid: PID('rahul'), product: MODEL.ei, sentby: PID('kavya'), sentat: daysAgo(3), formstatus: 'submitted', filledby: 'participant', ...tag,
  });
  console.log('[manual] seeded demo world');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { PEOPLE, PID, UID, DF, ATCID, MODEL, PASSWORD };
