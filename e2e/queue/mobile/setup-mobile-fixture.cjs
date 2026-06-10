#!/usr/bin/env node
/**
 * setup-mobile-fixture.cjs — mobile-walk precondition (WIRE step W5). Run AFTER the standard seed.
 *
 * The exported sample-queue-config.json lost every stage's `actionresource` DocumentReference
 * (refs don't survive JSON export → `actionresource: undefined`). So when a participant taps a
 * FORM self-move stage, the Flutter app pushes `FillForm(formpath: null)` and crashes on
 * `firestoreDefault.doc(null)`. The real participant self-moves are ALL forms (no variation uses
 * videoask/slots), so the form must render. This patch (test FIXTURE only — never a product edit):
 *   1. seeds a DEFAULT-DB `delivery forms` template with ONE OPTIONAL text field (trivially
 *      submittable), and
 *   2. sets `queue generation.stageproperty.<formStage>.actionresource` to a ref to that template
 *      for every stage where `actiontype === 'form'`, so FillForm loads a real template.
 *
 * The Angular board does NOT read nextstage/actionresource (it moves via columns), and form stages
 * are not studio stages, so this is invisible to the existing desktop suite. Hard-gated to the
 * dedicated test project; idempotent (deterministic ids + set/merge).
 */
'use strict';
const { TEST_PROJECT_ID, assertWritable } = require('../../lib/test-project');
const cfg = require('../../fixtures/sample-queue-config.json');

const TEST_PROJECT = process.env.TEST_PROJECT || TEST_PROJECT_ID;
const TESTRUNID = process.env.TESTRUNID || 'run1';
const QUEUE_ID = process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn';
const FORM_TEMPLATE_ID = `${TESTRUNID}_queueform_0`;

async function main() {
  assertWritable(TEST_PROJECT); // hard-abort on prod / non-test
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: TEST_PROJECT });
  const resolved = admin.app().options.projectId || TEST_PROJECT;
  assertWritable(resolved);
  const db = admin.firestore();

  // 1) DEFAULT-DB delivery-forms template — one OPTIONAL text field (FillForm needs a non-null
  //    template; an optional field means Preview passes with no input, so the form submits trivially).
  await db.collection('delivery forms').doc(FORM_TEMPLATE_ID).set({
    docid: FORM_TEMPLATE_ID,
    formname: `TEST Queue Form ${TESTRUNID}`,
    formdescription: 'mobile-e2e trivial form',
    formarray: [
      { fieldname: 'Notes', type: 'text', required: false, value: '', options: [], array: [] },
    ],
    testrunid: TESTRUNID, _testdata: true,
  });
  console.log(`✓ seeded default-DB delivery-forms template ${FORM_TEMPLATE_ID}`);

  // 2) patch the queue-generation stageproperty: actionresource -> the template ref, for FORM stages.
  const queueGenId = `${TESTRUNID}_${QUEUE_ID}`;
  const genRef = db.collection('queue generation').doc(queueGenId);
  const snap = await genRef.get();
  if (!snap.exists) { console.error(`🛑 queue generation ${queueGenId} not found — run the seed first.`); process.exit(1); }
  const stageproperty = snap.data().stageproperty || {};
  const templateRef = db.collection('delivery forms').doc(FORM_TEMPLATE_ID);

  const formStages = Object.keys(cfg.stageproperty).filter(s => cfg.stageproperty[s].actiontype === 'form');
  let patched = 0;
  for (const stage of formStages) {
    if (!stageproperty[stage]) continue; // stage must exist in the seeded property map
    stageproperty[stage].actionresource = templateRef;
    patched++;
  }
  await genRef.update({ stageproperty });
  console.log(`✓ patched actionresource on ${patched} FORM stage(s): ${formStages.join(', ')}`);

  // 3) home-dashboard preconditions. The busy participant Home fires many background queries; on the
  // queue-minimal seed two of them throw UNCAUGHT (aborting the test before the queue card renders):
  //   • applivestreaming/livestreaming — liveStream() casts doc.participants to a List (no onError).
  //   • static meta data/HPC Config — threeminhpcconfig() does hpcConfig!['awards'] unguarded (:643).
  // Seed the data a REAL participant would have so Home loads clean (NO app edit — operator directive).
  const TAG = { testrunid: TESTRUNID, _testdata: true };
  await db.collection('applivestreaming').doc('livestreaming').set({ participants: [], ...TAG }, { merge: true });
  await db.collection('static meta data').doc('HPC Config').set({ awards: {}, ...TAG }, { merge: true });
  // Neutralize the seeded queue planning (app casts segments[].stagecohort to List in checkBigCohortEvent).
  const qp = await db.collection('queue planning').where('testrunid', '==', TESTRUNID).get();
  const qpBatch = db.batch();
  qp.docs.forEach(d => qpBatch.update(d.ref, { planning: [] }));
  if (qp.size) await qpBatch.commit();
  // A pending studioinvitation makes the Flutter Home show a blocking "Your Turn Has Come!" accept/
  // defer overlay that covers the queue card. Mark it responded so home.dart's pending-invitation
  // query (clientresponse == null) doesn't match it. The desktop studio specs re-seed fresh.
  const inv = await db.collection('studioinvitation').where('testrunid', '==', TESTRUNID).get();
  const invBatch = db.batch();
  inv.docs.forEach(d => invBatch.update(d.ref, { clientresponse: 'deferred' }));
  if (inv.size) await invBatch.commit();
  // The home's "ads playlist" (homeContent.dart:4586 → AppTheme.adsplaylist) loads async and sets
  // adsPlaylist AFTER the first build; a doc with a null `adsthumbnail` then crashes the rebuild
  // (CachedNetworkImage.imageUrl: 'Null' is not a 'String', Themes.dart:3387) — intermittently erasing
  // the queue card (the card renders, then ~1s later the ads query lands and throws). Neutralize: mark
  // every adsplaylist doc available:false so the query returns empty (→ SizedBox, no ads, card stays).
  const ads = await db.collection('adsplaylist').where('available', '==', true).get();
  const adsBatch = db.batch();
  ads.docs.forEach(d => adsBatch.update(d.ref, { available: false }));
  if (ads.size) await adsBatch.commit();
  console.log(`✓ home-dashboard preconditions: applivestreaming + HPC Config + neutralized ${qp.size} queue planning + ${inv.size} studio invitation(s) + ${ads.size} ads`);

  // 4) Flutter-home queue-resolution chain. The Flutter Home renders the queue card (QueueControl)
  // only when it resolves: profile_data.participantmode (Event Mode) → participantsproduct(mode==
  // participantmode, status ongoing, productref) → products(mode) → participantdeliverysequence/{pid}
  // .products[participantproductid==active].delivery[type=='queue',status ongoing].sequenceref →
  // deliverables.fileref[0] → queue_token. The Angular-board seed reads queue_token directly and never
  // modelled this Flutter path, so seed it for EVERY seeded participant (idempotent).
  const PROD_ID = `${TESTRUNID}_event_prod`;
  await db.collection('products').doc(PROD_ID).set({
    id: PROD_ID, product: 'TEST Event Product', mode: 'Event Mode', testrunid: TESTRUNID, _testdata: true,
  });
  const tokens = await db.collection('queue_token').where('testrunid', '==', TESTRUNID).get();
  let wired = 0;
  for (const tokDoc of tokens.docs) {
    const tk = tokDoc.data();
    const pid = tk.profile_id || tk.profileid;
    if (!pid) continue;
    const tokenId = tokDoc.id;
    const ppId = `${TESTRUNID}_pp_${pid}`;
    const seqId = `${TESTRUNID}_delivseq_${pid}`;
    // participantmode drives home.dart:686 (primaryProduct = product whose mode == participantmode).
    // profileimg must be non-null or home.dart:472 pushes the ProfileImage ("Verify Your Profile")
    // screen over Home, hiding the queue card.
    await db.collection('profile_data').doc(pid).set({
      participantmode: 'Event Mode',
      profileimg: 'https://example.com/e2e-test.png',
      profile: 'https://example.com/e2e-test.png',
    }, { merge: true });
    // the active product: status ongoing + a real productref (home.dart:635 reads productref.id).
    await db.collection('participantsproduct').doc(ppId).set({
      docid: ppId, profileid: pid, mode: 'Event Mode', status: 'ongoing', sequenceorder: 1,
      productref: db.collection('products').doc(PROD_ID), testrunid: TESTRUNID, _testdata: true,
    }, { merge: true });
    // the delivery-sequence doc the queue deliverable points at: fileref[0] → the queue_token.
    await db.collection('deliverables').doc(seqId).set({
      docid: seqId, type: 'queue', status: 'ongoing',
      fileref: [db.collection('queue_token').doc(tokenId)], testrunid: TESTRUNID, _testdata: true,
    });
    // the participant's delivery sequence: products[active].delivery has the queue deliverable.
    await db.collection('participantdeliverysequence').doc(pid).set({
      docid: pid, products: [{
        participantproductid: ppId,
        delivery: [{ type: 'queue', status: 'ongoing', sequenceref: db.collection('deliverables').doc(seqId) }],
      }], testrunid: TESTRUNID, _testdata: true,
    });
    wired++;
  }
  console.log(`✓ Flutter-home queue chain wired for ${wired} participant(s)`);

  console.log(`✅ mobile fixture ready on ${TEST_PROJECT} (testrunid=${TESTRUNID}).`);
  process.exit(0);
}
main().catch(e => { console.error('setup-mobile-fixture error:', e); process.exit(1); });
