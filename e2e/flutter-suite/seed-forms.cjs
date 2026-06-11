// @ts-nocheck
/**
 * seed-forms.cjs — Forms (FillForm) bucket precondition seeder for the breakthroughs-flutter e2e suite.
 *
 * EXTENDS the ≥200-user journey cohort (journey-cohort/seed-cohort.js) for the ONE driven Forms user
 * (profileid `jrny_profile_94`, email participant94+jrny@example.com). The cohort already gives this user
 * the full render chain (profile_data + purchase quartet + queue_token + participantdeliverysequence +
 * ≥4 events + content + 2nd-journey). This seeder adds ONLY what the delivery-forms catalog rows
 * (FEATURE-CATALOG.md §7 / clusters/delivery-forms.md) require ON TOP of that baseline:
 *
 *   • a `delivery forms` TEMPLATE  (DEFAULT DB)        — the form FillForm renders + submits (F1/F4/F5/F8/F9/F10/F11)
 *   • a `temporary_forms` DRAFT    (firestore-forms DB) — forces the "Select Draft" sheet on load (F2)
 *   • a `formsByClient` SUBMITTED  (firestore-forms DB) — a prior submission to open read-only (F12)
 *   • a `participantdeliverysequence` deliverable LEAF (DEFAULT DB) — the non-queue journey-advance target (F7)
 *
 * The template is engineered so the REAL FillForm validates & submits WITHOUT any date picker: every
 * `required:true` field (text/dropdown/radio/multiselect/checkbox — the only enforced types per
 * fieldValidationCheck, FillForm.dart:189-209) is PRE-FILLED with a valid `value`; the array field gets one
 * complete row; the flipping field gets a non-empty List value so its follow-up slider renders at load;
 * audio/video/slider/label are non-required so they pass. NO required `date`/`time` field (a date would
 * need the picker — out of scope for the static assert path; the queue suite handles that separately).
 *
 * Anti-circular note: this seeder writes the TEMPLATE (the INPUT). The test asserts the doc the APP writes
 * on submit/autosave (`formsByClient`, `temporary_forms` with delete:true, the deliverable status flip) —
 * NEVER a value this seeder wrote. The `formsByClient` we seed here is ONLY the read-only F12 fixture.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the
 * slabs-queue-e2e-exdcz allowlist); every doc carries {testrunid:'jrny', _testdata:true}; deterministic
 * run+profile-prefixed doc ids (idempotent set/merge); NO ATC collection is ever touched and the
 * firestore-atc named DB is never opened (only the default DB + the firestore-forms named DB).
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-forms.cjs --seed
 *   node flutter-suite/seed-forms.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

const RUN = process.env.JRNY_RUNID || 'jrny';
// The Forms bucket's driven user — the cohort seeded Firebase Auth for index 94 (SUITE-PLAN.md U5).
const FORMS_INDEX = Number(process.env.FORMS_INDEX || 94);
const PID = `${RUN}_profile_${FORMS_INDEX}`;
const EMAIL = `participant${FORMS_INDEX}+${RUN}@example.com`;

// deterministic, run+user-prefixed doc ids (idempotent re-seed; teardown sweeps by testrunid + profileid)
const ID = {
  template: `${RUN}_forms_template_${FORMS_INDEX}`,   // delivery forms/{docid}  (DEFAULT DB) — the form FillForm renders
  draft: `${RUN}_forms_draft_${FORMS_INDEX}`,         // temporary_forms/{docid} (firestore-forms) — forces the draft sheet (F2)
  submitted: `${RUN}_forms_fbc_${FORMS_INDEX}`,       // formsByClient/{docid}   (firestore-forms) — read-only view fixture (F12)
  deliverableForm: `${RUN}_delform_${FORMS_INDEX}`,   // deliverables/{docid}    (DEFAULT DB) — the F7 non-queue sequence leaf
};

// Stable, run-scoped field names so the Flutter test can find an unambiguous render anchor per field.
// (FillForm renders each field's title as Text("${field['fieldname']}") — FillForm.dart:1905.)
const FIELD = {
  label: `Forms E2E Section ${RUN}`,
  text: `Forms E2E Text ${RUN}`,
  dropdown: `Forms E2E Dropdown ${RUN}`,
  radio: `Forms E2E Radio ${RUN}`,
  multiselect: `Forms E2E Multiselect ${RUN}`,
  checkbox: `Forms E2E Checkbox ${RUN}`,
  slider: `Forms E2E Slider ${RUN}`,
  array: `Forms E2E Array ${RUN}`,
  flipping: `Forms E2E Flipping ${RUN}`,
  flippingQ: `Forms E2E Flipping Followup ${RUN}`,
  audio: `Forms E2E Audio ${RUN}`,
  video: `Forms E2E Video ${RUN}`,
};
const FORM_NAME = `Forms E2E Template ${RUN}`;

// A non-required public sample media URL (smoke-level only; playback is sim-blocked → render-only in test).
const SAMPLE_AUDIO = 'https://example.com/e2e-audio.mp3';
const SAMPLE_VIDEO = 'https://example.com/e2e-video.mp4';

/**
 * The form template `formarray` (the typed-field set). Pre-filled so the REAL FillForm validates & submits.
 * Field order is deliberate: the `label` (section) first, then the required typed fields (all pre-filled),
 * then the non-required slider/array/flipping/audio/video.
 */
function buildFormArray() {
  return [
    // F1 anchor + label render (label fields are SizedBox bodies — assert via their fieldname Text).
    { type: 'label', fieldname: FIELD.label, fielddescription: 'Seeded section for the Forms e2e bucket.' },

    // Required typed fields (enforced by fieldValidationCheck) — PRE-FILLED with a valid `value`.
    { type: 'text', fieldname: FIELD.text, required: true, value: 'E2E automated text answer.' },
    { type: 'dropdown', fieldname: FIELD.dropdown, required: true, options: ['Alpha', 'Beta', 'Gamma'], value: 'Alpha' },
    { type: 'radio', fieldname: FIELD.radio, required: true, options: ['Yes', 'No'], value: 'Yes' },
    { type: 'multiselect', fieldname: FIELD.multiselect, required: true, options: ['One', 'Two', 'Three'], value: ['One'] },
    { type: 'checkbox', fieldname: FIELD.checkbox, required: true, value: true },

    // Non-required slider (F3 autosave fires on scrub; render-anchored by fieldname).
    { type: 'slider', fieldname: FIELD.slider, required: false, options: ['Low', 'Mid', 'High'], value: 0.0 },

    // F8 — repeatable array sub-form. Sub-fields are non-required and pre-filled with ONE complete row so
    // the form validates (arrayField auto-renders one row; we seed the value so required-validation passes).
    {
      type: 'array', fieldname: FIELD.array, required: false, maxitems: 3,
      array: [
        { type: 'text', fieldname: `${FIELD.array} Item Name`, required: false },
        { type: 'dropdown', fieldname: `${FIELD.array} Item Kind`, required: false, options: ['X', 'Y'] },
      ],
      value: [{ [`${FIELD.array} Item Name`]: 'Row one', [`${FIELD.array} Item Kind`]: 'X' }],
    },

    // F9 — flipping follow-up. `value` is a non-empty List → the follow-up slider renders per selection at load.
    {
      type: 'multiselect', fieldname: FIELD.flipping, required: false, flipping: true,
      options: ['Focus', 'Energy', 'Clarity'], value: ['Focus'],
      flippingquestion: { type: 'slider', fieldname: FIELD.flippingQ, options: ['1', '2', '3', '4', '5'], value: {} },
    },

    // F10/F11 — media fields (non-required; playback sim-blocked → render-only in test).
    { type: 'audio', fieldname: FIELD.audio, required: false, options: [SAMPLE_AUDIO] },
    { type: 'video', fieldname: FIELD.video, required: false, options: [SAMPLE_VIDEO] },
  ];
}

async function seedBucket() {
  const admin = seed.initAdmin();                 // hard-aborts unless the test project
  const db = admin.firestore();                   // DEFAULT DB (delivery forms template + deliverables)
  const formsDb = seed.getFormsDb(admin);         // firestore-forms named DB (temporary_forms + formsByClient)
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);

  console.log(`\n[seed-forms] run=${RUN} user=${PID} (${EMAIL}) → ${seed.TEST_PROJECT_ID || 'test project'}`);

  const formArray = buildFormArray();

  // ── (1) the delivery forms TEMPLATE (DEFAULT DB) — branch B reads firestoreDefault.doc(formpath) ──
  //    formpath the test pushes = `delivery forms/${ID.template}`; FillForm reads formname/formdescription/formarray.
  await db.collection('delivery forms').doc(ID.template).set({
    docid: ID.template,
    formname: FORM_NAME,
    formdescription: `Auto-seeded form for the Forms (FillForm) e2e bucket, run ${RUN}.`,
    formarray: formArray,
    ...tag,
  }, { merge: true });

  // ── (2) a DRAFT (firestore-forms) to force the "Select Draft" sheet (F2) ────────────────────────
  //    loadDraftFromDB queries temporary_forms WHERE formid == doc(formpath).id  (== ID.template)
  //    AND profileid == loggedinProfile.profileid (== PID) AND delete == false. We mirror the autosave
  //    doc shape (FillForm.dart:369-410). `date` must be a Timestamp (selectDraft sorts on it + formats it).
  await formsDb.collection('temporary_forms').doc(ID.draft).set({
    docid: ID.draft,
    formid: ID.template,
    profileid: PID,
    delete: false,
    date: past(1),
    formname: FORM_NAME,
    formdescription: `Seeded draft for the Forms e2e bucket, run ${RUN}.`,
    formarray: formArray,
    ...tag,
  }, { merge: true });

  // ── (3) a prior SUBMITTED form (firestore-forms) to open read-only (F12) ────────────────────────
  //    FillForm(submittedForm: ID.submitted) reads formsByClient/{submittedForm}.formarray and renders
  //    it IgnorePointer-disabled (no Preview/Submit). Same field shape as a real submission.
  await formsDb.collection('formsByClient').doc(ID.submitted).set({
    docid: ID.submitted,
    formid: ID.template,
    formname: FORM_NAME,
    formarray: formArray,
    profileid: PID,
    loginid: `${RUN}_u_${FORMS_INDEX}`,
    submittedin: 'breakthroughs',
    date: past(2),
    ...tag,
  }, { merge: true });

  // ── (4) a non-queue deliverable LEAF (DEFAULT DB) — the F7 updateJourney target ──────────────────
  //    The non-queue submit path does firestoreDefault.doc(deliverablepath).update({fileref arrayUnion,
  //    status:'completed'}). The test pushes FillForm with deliverablepath = this doc's path and asserts
  //    status flips to 'completed'. Seed it 'ready' so the flip is observable (anti-circular).
  await db.collection('deliverables').doc(ID.deliverableForm).set({
    docid: ID.deliverableForm,
    profileid: PID,
    type: 'form',
    status: 'ready',
    fileref: [],
    participantproductid: `${RUN}_pp_${FORMS_INDEX}_a`,
    participantjourneyid: `${RUN}_pjp_${FORMS_INDEX}`,
    ...tag,
  }, { merge: true });

  console.log(`  ✓ template ${ID.template} (${formArray.length} fields) · draft ${ID.draft} · submitted ${ID.submitted} · deliverable ${ID.deliverableForm}`);
  console.log(`[seed-forms] done.`);
  return { RUN, PID, EMAIL, ID, FIELD, FORM_NAME };
}

// collections this seed writes (run-scoped teardown). default-DB vs firestore-forms split below.
const SEEDED_DEFAULT = ['delivery forms', 'deliverables'];
const SEEDED_FORMS = ['temporary_forms', 'formsByClient'];

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const formsDb = seed.getFormsDb(admin);

  // 1) testrunid-tagged docs this seeder wrote (both DBs).
  let n = await seed.teardownCollections(db, SEEDED_DEFAULT, RUN);
  n += await seed.teardownCollections(formsDb, SEEDED_FORMS, RUN);

  // 2) APP-written docs (no testrunid tag) keyed by the driven user's profileid — the autosave drafts
  //    and the submitted forms the REAL FillForm wrote during the test run (firestore-forms named DB).
  //    These are swept by profileid so a testrunid-only sweep doesn't miss them.
  let appDeleted = 0;
  for (const col of SEEDED_FORMS) {
    const snap = await formsDb.collection(col).where('profileid', '==', PID).get().catch(() => ({ docs: [] }));
    for (const d of snap.docs) { await d.ref.delete().catch(() => {}); appDeleted++; }
  }
  return n + appDeleted;
}

// what this bucket guarantees exists after seeding (for the orchestrator / the test's knowledge).
const SEEDED = { default: SEEDED_DEFAULT, forms: SEEDED_FORMS, ids: ID, profileid: PID, email: EMAIL };

module.exports = { RUN, PID, EMAIL, ID, FIELD, FORM_NAME, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-forms] seeded', JSON.stringify({ user: r.PID, template: r.ID.template })); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-forms] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-forms.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
