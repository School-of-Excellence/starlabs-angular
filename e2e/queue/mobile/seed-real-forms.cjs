// seed-real-forms.cjs — use the REAL end-user delivery-form templates (not a stub replica).
//
// Copies the verbatim `delivery forms` templates that the prod queue's form stages reference into the
// disposable test project, pre-fills the ENFORCED-required fields with valid default answers (so the
// real FillForm code validates & submits — see fieldValidationCheck in FillForm.dart), and wires the
// test queue-generation's form-stage `actionresource` to them. The real FillForm then renders the real
// end-user form. PROD IS READ-ONLY (only `queue generation` + `delivery forms` are read — no ATC data).
//
// Run locally (needs the prod SA):  node queue/mobile/seed-real-forms.cjs
const admin = require('firebase-admin');
const { TEST_PROJECT_ID, assertWritable } = require('../../lib/test-project');

const PROD_SA = process.env.PROD_SA || '/Users/antano/solarcode/serviceAccountKeyProduction.json';
const TESTRUNID = process.env.TESTRUNID || 'run1';
const QUEUE_ID = process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn';

// Valid default answer per ENFORCED type (fieldValidationCheck: text/dropdown/radio/multiselect/
// multicheckbox/checkbox/date are enforced; video/audio/array/label/slider pass unenforced → left as-is).
function defaultValueFor(field) {
  const t = String(field.type || '').toLowerCase();
  const opts = Array.isArray(field.options) ? field.options : [];
  const optVal = (o) => (o && typeof o === 'object' ? (o.value ?? o.label ?? o.name ?? JSON.stringify(o)) : o);
  if (['text', 'email', 'paragraph'].includes(t)) return 'E2E automated test response.';
  if (t === 'number') return '42';
  if (['dropdown', 'radio'].includes(t)) return opts.length ? optVal(opts[0]) : 'E2E';
  if (['multiselect', 'multicheckbox'].includes(t)) return opts.length ? [optVal(opts[0])] : ['E2E'];
  if (t === 'checkbox') return true;
  // date/time: pre-seed a valid past Timestamp (top-level date validator checks field["value"] != null).
  // The real DateTimeField picker does NOT open under flutter_test's tap, so — exactly like every other
  // required field — we pre-seed the value. FillForm now renders a Timestamp date safely (the hint at
  // FillForm.dart:1496 was fixed to convert Timestamp→DateTime, matching the draft-load + preview paths).
  if (['date', 'time'].includes(t)) return admin.firestore.Timestamp.fromDate(new Date('2000-06-01T09:00:00Z'));
  return undefined; // video/audio/array/label/slider → leave untouched

}

function prefill(formarray) {
  let filled = 0;
  const out = (formarray || []).map((f) => {
    const nf = { ...f };
    const t = String(f.type || '').toLowerCase();
    if (t === 'array' && Array.isArray(f.array)) {
      // FillForm.arrayField auto-renders ONE row with every sub-field = null; required sub-fields (often
      // DropDowns) then fail formKey.validate(). Seed ONE complete row (each sub-field a valid value) so
      // the real form validates & submits.
      const row = {};
      for (const sub of f.array) {
        const v = defaultValueFor(sub);
        row[sub.fieldname] = v !== undefined
          ? v
          : (Array.isArray(sub.options) && sub.options.length ? sub.options[0] : 'E2E');
      }
      nf.value = [row];
      filled++;
    } else if (f && (f.required === true || f.required === 'true')) {
      const v = defaultValueFor(f);
      if (v !== undefined) { nf.value = v; filled++; }
    }
    return nf;
  });
  return { out, filled };
}

(async () => {
  assertWritable(process.env.TEST_PROJECT || TEST_PROJECT_ID); // never let test point at prod
  const prod = admin.initializeApp({ credential: admin.credential.cert(require(PROD_SA)) }, 'prod-read');
  const test = admin.initializeApp({ projectId: TEST_PROJECT_ID }); // ADC
  const pdb = prod.firestore();
  const tdb = test.firestore();

  const gen = await pdb.collection('queue generation').doc(QUEUE_ID).get();
  if (!gen.exists) throw new Error(`prod queue generation ${QUEUE_ID} not found`);
  const psp = gen.data().stageproperty || {};
  const formStages = Object.keys(psp).filter((s) => psp[s].actiontype === 'form' && psp[s].actionresource);

  const testGenId = `${TESTRUNID}_${QUEUE_ID}`;
  const testGenRef = tdb.collection('queue generation').doc(testGenId);
  const testGen = await testGenRef.get();
  if (!testGen.exists) throw new Error(`test queue generation ${testGenId} not found — run the seed first`);
  const tsp = testGen.data().stageproperty || {};

  let seeded = 0, wired = 0;
  for (const stage of formStages) {
    const prodForm = await psp[stage].actionresource.get(); // prod DocumentReference
    if (!prodForm.exists) { console.log(`  ⚠ prod form missing for "${stage}"`); continue; }
    const data = prodForm.data();
    const testFormId = `${TESTRUNID}_rf_${prodForm.id}`;
    const { out, filled } = prefill(data.formarray);
    await tdb.collection('delivery forms').doc(testFormId).set({
      ...data,
      docid: testFormId,
      formarray: out,
      _sourceProdId: prodForm.id,
      testrunid: TESTRUNID,
      _testdata: true,
    });
    seeded++;
    if (tsp[stage]) {
      tsp[stage].actionresource = tdb.collection('delivery forms').doc(testFormId);
      wired++;
    }
    console.log(`  ✓ "${stage}" → ${data.formname} (${(data.formarray || []).length} fields, pre-filled ${filled}) [${testFormId}]`);
  }
  await testGenRef.update({ stageproperty: tsp });
  console.log(`\n✓ seeded ${seeded} REAL form templates + wired ${wired} stage(s). The real FillForm now renders the real end-user forms.`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
