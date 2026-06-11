// @ts-nocheck
/**
 * seed-queue.cjs — Queue-delivery bucket seeder (Flutter e2e suite, user idx 93).
 *
 * EXTENDS the 200-user cohort (journey-cohort/seed-cohort.js) for the ONE driven user
 *   participant93+jrny@example.com  /  profileid jrny_profile_93  /  pw Test!1234
 * with the preconditions the delivery-queue catalog rows (FEATURE-CATALOG.md §6,
 * clusters/delivery-queue.md) need ON TOP of the cohort baseline.
 *
 * The cohort already gives this user: profile_data (participantmode 'Event Mode'), the purchase
 * quartet, a queue_token (jrny_tok_jrny_profile_93 → queueref jrny_QG, variationid 'jrny_var',
 * currentstage 'Performance'), the deliverables→participantdeliverysequence render chain, ≥4 events,
 * content, and a 2nd-journey purchase. The cohort's `jrny_QG` queue-generation doc is MINIMAL: it has
 * `stages` but NO `stageproperty` map — so the QueueControl card's actionButton()/descriptionBox()
 * (which read queuemode.stageproperty[currentstage]) would have nothing to act on. This seeder fills
 * that gap and adds the slot-booking / stage-chat / studio-waiting preconditions.
 *
 * WHAT THIS SEEDS (only what the §6 features need beyond the cohort):
 *   1. jrny_QG.stageproperty — a real per-stage property map (MERGE onto the cohort's queue gen):
 *        • Performance  : actiontype 'form', selfmovable true   → queue-action-fill-form (anti-circular:
 *                         FillForm writes formsByClient (firestore-forms) + moveQueueStage advances the
 *                         token + appends a `queue stage log` doc). actionresource → the DEFAULT-db
 *                         `delivery forms` template below (FillForm reads the template from the DEFAULT db).
 *        • Integration  : selfmovable true (NO actiontype)      → queue-self-move ("Ready for Next Stage";
 *                         moveQueueStage advances the token + appends `queue stage log`).
 *        • Onboarded    : compulsoryactivity ['studio'], minwatingminutes/maxwatingminutes set →
 *                         queue-view-status-position-studio + descriptionBox waiting-time math.
 *      Plus jrny_QG.queuestartdate (PAST, so the action button is not the "event starts on…" branch) and
 *      queueenddate (FUTURE, so the home queueMode listener keeps queuemode non-null).
 *   2. queue_token jrny_tok_jrny_profile_93 — MERGE add `docid` (slot-booking writes
 *        queue_token/{tokenid==tokendata.docid}; the cohort omits docid) + `queuestartdate` mirror.
 *      Left at currentstage 'Performance' (the cohort value) so the form stage is live on boot.
 *   3. DEFAULT-db `delivery forms` template (one OPTIONAL text field → trivially submittable) — the
 *      form-stage actionresource target (mirrors e2e/queue/mobile/setup-mobile-fixture.cjs).
 *   4. firestore-forms named DB: a `delivery forms` MIRROR of the same template id (FillForm view-mode /
 *      formsByClient live under firestore-forms; provisioning the named DB doc keeps cross-DB refs valid).
 *   5. queue planning + participant list — a bookable slot for an upcoming stage (queue-book-slot:
 *        transactional usedslot++ on `queue planning` + queue_token.selectedstageslot.{stage}).
 *   6. queue generation/{jrny_QG}/stagechat — a pinned + a plain message for the current stage
 *        (queue-read-stage-chat read path; queue-send-stage-chat asserts a NEW app-written stagechat doc).
 *   7. queue studio pairing — one checked-in studio row (descriptionBox waiting-time / studio length).
 *   8. chat config — an 'Events & Process' category (queue-contact-support-booked-slot reaches RaiseTicket).
 *
 * NOT seeded (honest gaps — see SEEDED + the test's featuresCovered):
 *   • financialstatus is left 'regular' (cohort value) — a 'locked' status + a top-level checkfinance
 *     would REPLACE the action button on EVERY stage, killing the write-bearing form/self-move features
 *     on this single driven user. queue-financial-lock-notice is therefore render-only/seedGap.
 *
 * PRODUCTION-SAFE: seed.initAdmin() hard-aborts off the test project (slabs-queue-e2e-exdcz). Every doc
 * is tagged {testrunid:'jrny', _testdata:true}. atcmodel:null is left on the cohort's products/journeys/
 * events; NO ATC collection is ever written and `firestore-atc` is NEVER opened.
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-queue.cjs --seed
 *   node flutter-suite/seed-queue.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');
const { getFirestore } = require('firebase-admin/firestore');

const RUN = process.env.JRNY_RUNID || 'jrny';
const IDX = Number(process.env.QUEUE_USER_IDX || 93);          // the driven queue user (cohort E2E index)
const FORMS_DB = 'firestore-forms';

// ── deterministic ids (cohort-aligned; idempotent set/merge) ─────────────────────────────────────
const P = `${RUN}_profile_${IDX}`;                              // driven user profileid (cohort: pidFor(93))
const QG = `${RUN}_QG`;                                         // cohort queue-generation doc id (CAT.queueGen)
const TOK = `${RUN}_tok_${P}`;                                  // cohort queue_token id
const VAR = `${RUN}_var`;                                       // cohort token.variationid
const FORM_TEMPLATE = `${RUN}_queueform_${IDX}`;                // DEFAULT-db form template (form-stage actionresource)
const PLAN_ID = `${RUN}_qplan_${IDX}`;                          // queue planning doc
const SEGMENT_ID = `${RUN}_seg_${IDX}`;                         // the participant's segment
const PLIST_ID = `${RUN}_plist_${IDX}`;                         // participant list (segment membership)
const STUDIO_PAIR = `${RUN}_qpair_${IDX}`;                      // queue studio pairing
const CHAT_CFG = `${RUN}_chatcfg`;                              // chat config (Events & Process)

// The live stage the user is parked at on boot (a FORM self-move stage) and the chain it advances through.
const FORM_STAGE = 'Performance';   // cohort token.currentstage
const SELFMOVE_STAGE = 'Integration';
const ACTIVITY_STAGE = 'Onboarded'; // a terminal-ish compulsory-activity stage (status/position display)
const BOOK_STAGE = SELFMOVE_STAGE;  // the upcoming stage we expose a bookable slot for

async function seedBucket() {
  const admin = seed.initAdmin();                  // hard-aborts unless the test project
  const db = admin.firestore();
  const formsDb = getFirestore(admin.app(), FORMS_DB);
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-queue] run=${RUN} user=${P} queue=${QG} → ${seed.TEST_PROJECT_ID || 'test project'}`);

  // 1) DEFAULT-db form template (form-stage actionresource). One OPTIONAL text field → Preview passes
  //    with no input, so the form submits trivially and the queue self-advances.
  const formArray = [{ fieldname: 'Notes', type: 'text', required: false, value: '', options: [], array: [] }];
  await ref('delivery forms', FORM_TEMPLATE).set({
    docid: FORM_TEMPLATE, formname: `Queue Stage Form ${RUN}`, formdescription: 'flutter-e2e queue form',
    formarray: formArray, atcmodel: null, ...tag,
  }, { merge: true });
  // firestore-forms MIRROR (FillForm view-mode + formsByClient live in the named DB; keep the id resolvable).
  await formsDb.collection('delivery forms').doc(FORM_TEMPLATE).set({
    docid: FORM_TEMPLATE, formname: `Queue Stage Form ${RUN}`, formdescription: 'flutter-e2e queue form',
    formarray: formArray, atcmodel: null, ...tag,
  }, { merge: true });
  console.log(`  ✓ delivery-forms template ${FORM_TEMPLATE} (default + firestore-forms)`);

  // 2) Enrich the cohort queue-generation doc with a real stageproperty map (MERGE — keep cohort fields:
  //    queuename/stages/etc). queuemode = {...token, ...queueGen}, so stageproperty is read from HERE.
  const formTemplateRef = ref('delivery forms', FORM_TEMPLATE);   // DEFAULT-db ref (FillForm reads template from default db)
  const stageproperty = {
    [FORM_STAGE]: {
      actiontype: 'form',
      selfmovable: true,
      calltoaction: 'Click to Fill Form',
      actionresource: formTemplateRef,
      stageexplanation: 'Fill the stage form to proceed.',
      stagemessage: `You are at ${FORM_STAGE}.`,
      compulsoryactivity: [],
    },
    [SELFMOVE_STAGE]: {
      selfmovable: true,
      calltoaction: 'Ready for Next Stage',
      stageexplanation: 'Tap when you are ready to move to the next stage.',
      stagemessage: `You are at ${SELFMOVE_STAGE}.`,
      compulsoryactivity: [],
    },
    [ACTIVITY_STAGE]: {
      compulsoryactivity: ['studio'],
      minwatingminutes: '10',
      maxwatingminutes: '30',
      stageexplanation: 'Please wait until your turn is requested.',
      stagemessage: `You are at ${ACTIVITY_STAGE}.`,
    },
    Completed: { compulsoryactivity: [], stageexplanation: 'Queue complete.' },
  };
  await ref('queue generation', QG).set({
    id: QG, stageproperty,
    // queueMode listener gates on these: now must be AFTER queuestartdate (else the action button is the
    // "The Event Starts on…" branch) and BEFORE queueenddate (else queuemode is dropped to null).
    queuestartdate: past(30), queueenddate: future(60),
    ...tag,
  }, { merge: true });
  // The token carries variationid VAR (non-null) → home.dart queueMode (home.dart:905) resolves
  // queuestages from `queue variation/{VAR}.stages`, NOT queueGen.stages. Without this doc queuestages
  // is empty → queueControl.dart:71 stageList.indexOf(currentstage) == -1 → stageList[-1] RangeError.
  // Stages MUST include every stage used in stageproperty (currentstage + the self-move/activity/book
  // stages), in order, so the slot-booking window (currentIndex..end) and the stage timeline resolve.
  await ref('queue variation', VAR).set({
    id: VAR, docid: VAR, variationname: `Cohort Variation ${RUN}`,
    stages: ['Preparation', FORM_STAGE, SELFMOVE_STAGE, ACTIVITY_STAGE, 'Completed'], ...tag,
  }, { merge: true });
  console.log(`  ✓ stageproperty on ${QG}: ${FORM_STAGE}(form), ${SELFMOVE_STAGE}(selfmove), ${ACTIVITY_STAGE}(activity); queue variation ${VAR} stages set`);

  // 3) queue_token — MERGE add `docid` (slot-booking writes queue_token/{tokenid==tokendata.docid}; the
  //    cohort token omits docid) + mirror queuestartdate. Keep currentstage 'Performance' (cohort value).
  await ref('queue_token', TOK).set({
    docid: TOK, profile_id: P, profileid: P, queueref: ref('queue generation', QG),
    variationid: VAR, currentstage: FORM_STAGE, status: 'ready', queueposition: 3,
    queuestartdate: past(30), tokenstatus: 'Active', ...tag,
  }, { merge: true });
  console.log(`  ✓ queue_token ${TOK}: docid + status 'ready' + queueposition 3 (currentstage ${FORM_STAGE})`);

  // 4) Slot booking: a `queue planning` doc with a bookable slot for the BOOK_STAGE, scoped to this
  //    token's variation, plus a `participant list` granting the user a matching segmentid.
  //    queue planning read: where queueid == queueref.id (= QG); planning[].variationid == token.variationid;
  //    segment in participantSegment; slot.stagename in the at-or-after-currentstage window; enddate>now;
  //    usedslot < maxslot. The confirm path then transactionally usedslot++ and sets
  //    queue_token.selectedstageslot.{stagename} = slot.
  await ref('participant list', PLIST_ID).set({
    docid: PLIST_ID, profilelist: [P], segmentid: [SEGMENT_ID], ...tag,
  }, { merge: true });
  await ref('queue planning', PLAN_ID).set({
    docid: PLAN_ID, queueid: QG,
    planning: [{
      variationid: VAR,
      segments: [{
        segmentid: SEGMENT_ID,
        slots: [
          { stagename: BOOK_STAGE, title: `${BOOK_STAGE} Slot A`, description: 'Morning slot',
            startdate: future(2), enddate: future(3), usedslot: 0, maxslot: 5 },
          { stagename: BOOK_STAGE, title: `${BOOK_STAGE} Slot B`, description: 'Afternoon slot',
            startdate: future(4), enddate: future(5), usedslot: 0, maxslot: 5 },
        ],
      }],
    }],
    ...tag,
  }, { merge: true });
  console.log(`  ✓ queue planning ${PLAN_ID} + participant list ${PLIST_ID} (2 bookable ${BOOK_STAGE} slots)`);

  // 5) Stage chat: a pinned + a plain message for the CURRENT stage (read path + pinned toggle). The
  //    home listener filters stagechat where stage == currentstage and orderBy date desc.
  const chatCol = db.collection('queue generation').doc(QG).collection('stagechat');
  await chatCol.doc(`${RUN}_chat_${IDX}_pin`).set({
    docid: `${RUN}_chat_${IDX}_pin`, message: 'Welcome to this stage — read the pinned guidance.',
    pinned: true, queueref: ref('queue generation', QG), senderprofileid: `${RUN}_pf_eis`,
    stage: FORM_STAGE, date: past(2), links: [], ...tag,
  }, { merge: true });
  await chatCol.doc(`${RUN}_chat_${IDX}_msg`).set({
    docid: `${RUN}_chat_${IDX}_msg`, message: 'Let us know if you have questions.',
    pinned: false, queueref: ref('queue generation', QG), senderprofileid: `${RUN}_pf_eis`,
    stage: FORM_STAGE, date: past(1), links: [], ...tag,
  }, { merge: true });
  console.log(`  ✓ stagechat: 1 pinned + 1 plain message on ${QG}/${FORM_STAGE}`);

  // 6) queue studio pairing — one checked-in studio row for the waiting-time / studio-length math
  //    (home filters where queueref == token.queueref & checkin==true & studioin==true).
  await ref('queue studio pairing', STUDIO_PAIR).set({
    docid: STUDIO_PAIR, queueref: ref('queue generation', QG), participants: [P],
    checkin: true, studioin: true, participantsactivity: {}, atcmodel: null, ...tag,
  }, { merge: true });
  console.log(`  ✓ queue studio pairing ${STUDIO_PAIR}`);

  // 7) chat config — one doc with an 'Events & Process' category (queue-contact-support-booked-slot reads
  //    the first chat config doc's categories filtered to 'Events & Process' before pushing RaiseTicket).
  await ref('chat config', CHAT_CFG).set({
    docid: CHAT_CFG,
    categories: [{ category: 'Events & Process', subcategories: ['Slot Booking', 'General'] }],
    messages: ['How can we help with your event or process?'], ...tag,
  }, { merge: true });
  console.log(`  ✓ chat config ${CHAT_CFG} (Events & Process)`);

  console.log(`\n[seed-queue] done for ${P}.`);
  return { RUN, P, QG, TOK, FORM_STAGE, SELFMOVE_STAGE };
}

// Collections this seeder writes (run-scoped teardown). The stagechat subcollection is swept by parent.
const SEEDED = [
  'delivery forms', 'queue generation', 'queue variation', 'queue_token', 'queue planning', 'participant list',
  'queue studio pairing', 'chat config',
];
// firestore-forms named-DB collections this seeder writes.
const SEEDED_FORMS = ['delivery forms', 'formsByClient'];

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const formsDb = getFirestore(admin.app(), FORMS_DB);

  // Default-DB collections by testrunid.
  let n = await seed.teardownCollections(db, SEEDED, RUN);

  // The stagechat subcollection under the run's queue gen (testrunid-tagged).
  const chat = await db.collection('queue generation').doc(QG).collection('stagechat')
    .where('testrunid', '==', RUN).get().catch(() => ({ docs: [] }));
  for (const d of chat.docs) { await d.ref.delete().catch(() => {}); n++; }

  // firestore-forms: the template mirror + any APP-written submission for this user. formsByClient docs
  // the APP writes on form-submit carry profileid (the doc's own loginid/profileid) — sweep by testrunid
  // (our seed tag) AND by the driven user's profileid (app writes are untagged).
  for (const col of SEEDED_FORMS) {
    const tagged = await formsDb.collection(col).where('testrunid', '==', RUN).get().catch(() => ({ docs: [] }));
    for (const d of tagged.docs) { await d.ref.delete().catch(() => {}); n++; }
  }
  // app-written formsByClient (no testrunid) for the driven user, by profileid.
  const fbc = await formsDb.collection('formsByClient').where('profileid', '==', P).get().catch(() => ({ docs: [] }));
  for (const d of fbc.docs) { await d.ref.delete().catch(() => {}); n++; }

  // app-written `queue stage log` rows (no testrunid) for this token, by docid (== token id).
  const qsl = await db.collection('queue stage log').where('docid', '==', TOK).get().catch(() => ({ docs: [] }));
  for (const d of qsl.docs) { await d.ref.delete().catch(() => {}); n++; }

  // app-written stagechat (no testrunid) by this user, by senderprofileid.
  const userChat = await db.collection('queue generation').doc(QG).collection('stagechat')
    .where('senderprofileid', '==', P).get().catch(() => ({ docs: [] }));
  for (const d of userChat.docs) { await d.ref.delete().catch(() => {}); n++; }

  return n;
}

module.exports = { RUN, P, QG, TOK, FORM_STAGE, SELFMOVE_STAGE, SEEDED, SEEDED_FORMS, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-queue] seeded', JSON.stringify(r)); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-queue] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-queue.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
