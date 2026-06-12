// @ts-nocheck
/**
 * seed-workshops.cjs — Workshops bucket seeder (Flutter e2e suite, user idx 150).
 *
 * EXTENDS the 200-user journey cohort (journey-cohort/seed-cohort.js) for the ONE driven user
 *   participant150+jrny@example.com  /  profileid jrny_profile_150  /  pw Test!1234
 * with the preconditions the content-workshops catalog rows (FEATURE-CATALOG.md §11,
 * clusters/content-workshops.md) need ON TOP of the cohort baseline.
 *
 * The cohort already gives this user: profile_data (participantmode 'Event Mode', profileimg set),
 * the purchase quartet, a queue_token render chain, ≥4 attended events, content, and a 2nd-journey
 * purchase. It does NOT seed ANY of the workshop world — so this file lays the LIVE NEW-system
 * workshop fixtures the §11 features read/write against.
 *
 * WHAT THIS SEEDS (only the LIVE NEW `EIFlix Workshop New/` system — never the DEAD OLD `eiflix *`):
 *   0. static meta data/Workshop Admin.showworkshopinapp=true  — so the EiFlix "Workshop" tab shows
 *      (the test pushes WorkshopListView directly too, but this keeps the in-app tab reachable).
 *   1. workshopconfiguration/<WS> — a FULL, ENROLLABLE workshop config for this user:
 *        • active:true (→ appears in WorkshopListView's or(active,testmode,workshopcompleted) query),
 *        • detailpage{enrollbuttonname, title, description, registrationStartDate(PAST)/EndDate(FUTURE),
 *          workshopStartDate/EndDate} so enrollWorkshop()'s registration-window check passes,
 *        • challenges[] non-null (enroll hard-requires challenges) — ONE challenge with a QUIZ
 *          sub-activity (workshop-take-quiz target) + a form sub-activity (map only),
 *        • NOT newusersonly / journeybased / tierbased / activeparticipants / categorybased →
 *          eligibility passes for a plain cohort participant (anti-blocking on this one driven user),
 *        • qanda:true (workshop-qa-ask-reply-delete reads/writes workshopQA),
 *        • atcmodel:null. The workshop is on the TEST project only.
 *   2. workshopcategory/<CAT> — one category doc (sales page reads `workshopcategory` (all); benign).
 *   3. quizbyclients PRECONDITION: a `quiz` doc the config's quizref points at (options w/ isCorrect)
 *      so WorkshopQuizScreen renders a real question → the answer WRITE (quizbyclients) is anti-circular.
 *   4. participant workshop/<PW> + workshop participant enrolled/<WPE> — a PRE-ENROLLED pair so
 *      WorkshopChallenges (workshop-auto-resume) + the Q&A tab can be reached for THIS user WITHOUT
 *      depending on the enroll write firing first (the enroll feature W3 still asserts a NEW pair it
 *      writes — these seeded docs carry the run tag and a distinct id, excluded from that assertion).
 *   5. appactionpending/<profileid>.workshopaction — a pending mobile action so
 *      workshop-clear-mobile-action has a field to (map; the clear path has no headless UI trigger →
 *      render-only in the test, the field documents the precondition).
 *   6. delivery forms/<FORM> (DEFAULT + firestore-forms mirror) — the form sub-activity's template
 *      (workshop-fill-form is Partial/map; provisioning keeps the challenge's formref resolvable).
 *
 * ANTI-CIRCULARITY (the doc the APP writes is the assertion target — never a seeded value):
 *   • workshop-enroll        → the APP adds a NEW `participant workshop` + `workshop participant
 *                              enrolled` pair (profileid==me, workshopref==<WS>); a server read of a
 *                              pair NOT equal to the seeded ids proves the app wrote it.
 *   • workshop-take-quiz     → the APP writes a NEW `quizbyclients` doc (profileid==me, quizref==<quiz>)
 *                              + back-writes participant `challenges[..].quizAnswered`; neither is seeded.
 *   • workshop-qa-ask…       → the APP writes a NEW `workshopQA` question (profileid==me, workshopId==
 *                              <WS>, replyid==null); the seed writes NO workshopQA → any match is the app.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts unless the
 * dedicated disposable test project slabs-queue-e2e-exdcz, per lib/test-project.js); every doc is
 * tagged {testrunid:'jrny', _testdata:true}; deterministic run-prefixed doc ids (idempotent set/merge);
 * atcmodel:null on every workshop/quiz/form doc; NO ATC collection is ever touched (the OLD Mentoring
 * ATC tool + the OLD `eiflix *` model are DEAD and never seeded) and firestore-atc is never opened.
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-workshops.cjs --seed
 *   node flutter-suite/seed-workshops.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');
const { getFirestore } = require('firebase-admin/firestore');

const RUN = process.env.JRNY_RUNID || 'jrny';
const IDX = Number(process.env.WORKSHOP_USER_IDX || 150);       // the driven workshops user (cohort E2E index)
const FORMS_DB = 'firestore-forms';

// ── deterministic ids (cohort-aligned; idempotent set/merge) ─────────────────────────────────────
// TWO workshop configs are seeded on purpose. EiFlixWorkshop.workshopEnrollment (workshopenrollment.dart:
// 165-191) flips the enroll button to "Continue"→navigatetochallenge() the moment THIS user has ANY
// `workshop participant enrolled` doc whose workshopref.id == the config's docid. So the ENROLL target
// (WS) must stay UN-enrolled, while the challenge-runner / quiz / Q&A features need a PRE-ENROLLED config
// (WS_RUNNER) — a separate doc — to be reachable without depending on the W3 enroll write firing first.
const P = `${RUN}_profile_${IDX}`;                              // driven user profileid (cohort: pidFor(150))
const WS = `${RUN}_ws_${IDX}`;                                  // ENROLL target config (NOT pre-enrolled)
const WS_RUNNER = `${RUN}_ws_runner_${IDX}`;                    // PRE-ENROLLED config (runner/quiz/Q&A target)
const CATG = `${RUN}_wscat_${IDX}`;                             // workshopcategory doc
const QUIZ = `${RUN}_wsquiz_${IDX}`;                            // quiz doc (runner config quizref → this)
const FORM_TEMPLATE = `${RUN}_wsform_${IDX}`;                   // delivery forms template (form sub-activity)
const PW = `${RUN}_ws_pw_${IDX}`;                               // SEEDED participant workshop (pre-enrolled, → WS_RUNNER)
const WPE = `${RUN}_ws_wpe_${IDX}`;                             // SEEDED workshop participant enrolled (→ WS_RUNNER)

async function seedBucket() {
  const admin = seed.initAdmin();                  // hard-aborts unless the test project
  const db = admin.firestore();
  const formsDb = getFirestore(admin.app(), FORMS_DB);
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-workshops] run=${RUN} user=${P} workshop=${WS} → ${seed.TEST_PROJECT_ID || 'test project'}`);

  // 0) Gate: show the EiFlix "Workshop" tab (static meta data/Workshop Admin). MERGE — shared singleton.
  await ref('static meta data', 'Workshop Admin').set({
    showworkshopinapp: true, sharemessage: `Join this workshop ${RUN}`, ...tag,
  }, { merge: true });
  console.log('  ✓ static meta data/Workshop Admin.showworkshopinapp = true');

  // 3) quiz doc the config's quizref resolves to. WorkshopQuizScreen reads `options` (each {text,isCorrect}).
  //    One correct + one wrong option → a real, answerable question (the answer WRITE is anti-circular).
  await ref('quiz', QUIZ).set({
    docid: QUIZ, quizname: `Workshop Quiz ${RUN}`, question: `Which answer is correct, ${RUN}?`,
    options: [
      { text: `Correct answer ${RUN}`, isCorrect: true, explanation: 'Well done.' },
      { text: `Wrong answer ${RUN}`, isCorrect: false, explanation: 'Not quite.' },
    ],
    atcmodel: null, ...tag,
  }, { merge: true });
  console.log(`  ✓ quiz ${QUIZ} (1 correct + 1 wrong option)`);

  // 6) form template (form sub-activity — Partial/map). DEFAULT db + firestore-forms mirror (FillForm
  //    reads the template from the named DB for workshop forms; provisioning both keeps refs resolvable).
  const formArray = [{ fieldname: `Workshop Notes ${RUN}`, type: 'text', required: false, value: '', options: [], array: [] }];
  const formDoc = { docid: FORM_TEMPLATE, formname: `Workshop Form ${RUN}`, formdescription: 'flutter-e2e workshop form', formarray: formArray, atcmodel: null, ...tag };
  await ref('delivery forms', FORM_TEMPLATE).set(formDoc, { merge: true });
  await formsDb.collection('delivery forms').doc(FORM_TEMPLATE).set(formDoc, { merge: true });
  console.log(`  ✓ delivery-forms template ${FORM_TEMPLATE} (default + firestore-forms)`);

  // The `challenges[]` array (participant-workshop shape the runner walks): ONE challenge with a QUIZ
  //    sub-activity + a FORM sub-activity (both map/drive targets). Shared by the runner config + the
  //    pre-enrolled participant workshop doc.
  const buildChallenges = () => [
    {
      challengename: `Workshop Challenge One ${RUN}`,
      description: 'The first workshop challenge.',
      status: 'live',
      challenges: [
        {
          // QUIZ sub-activity (workshop-take-quiz). type 'quiz' + quizref list (refs → quiz docs).
          subchallengename: `Knowledge Check ${RUN}`,
          type: 'quiz',
          status: 'live',
          quizref: [ref('quiz', QUIZ)],
          quizname: `Workshop Quiz ${RUN}`,
          markChallengeCompletedOnFinish: false,
        },
        {
          // FORM sub-activity (workshop-fill-form — Partial/map). formref → the template above.
          subchallengename: `Reflection Form ${RUN}`,
          type: 'form',
          status: 'live',
          formref: ref('delivery forms', FORM_TEMPLATE),
          reviewassignemnt: false,
        },
      ],
    },
  ];

  // A reusable config doc shape (only docid/id + detailpage title differ between WS and WS_RUNNER).
  const buildConfig = (id, titleSuffix) => ({
    docid: id, id,
    active: true, testmode: false, workshopcompleted: false,
    // eligibility: all gates OFF so a plain cohort participant enrolls (anti-blocking on this 1 user).
    newusersonly: false, journeybased: false, tierbased: false, activeparticipants: false,
    categorybased: false, evergreenWorkshop: false, facilitator: false,
    qanda: true,                                   // workshop-qa-ask-reply-delete read/write
    challenges: buildChallenges(),
    cohortsforthisworkshop: [], facilitatorprofiles: [], testusers: [P],
    detailpage: {
      title: `Workshop E2E ${titleSuffix}`,
      workshopname: `Workshop E2E ${titleSuffix}`,
      description: 'A seeded enrollable workshop for the flutter e2e suite.',
      enrollbuttonname: 'Enroll Now',
      // registration window OPEN (now ∈ [start,end]); workshop dates set so the date guards pass.
      registrationStartDate: past(10), registrationEndDate: future(30),
      workshopStartDate: past(2), workshopEndDate: future(30),
      day: '1', price: '0', pricestriked: '0',
      // workshopoverview is LIST-rendered (workshopenrollment.dart:1476-1480 indexes it + reads item.question/
      // item.answer) — a String would throw "String has no []"/"List is not String". Seed an array of Q&A items.
      workshopoverview: [{ question: 'What will I learn?', answer: 'Everything in this seeded e2e workshop.' }],
      // EiFlixWorkshop.buildLeftSideContent (workshopenrollment.dart:1185/1209) renders these as Text(String)
      // POSITIONALS, UNFILTERED by the test's onError list — a null shortdescription throws "non-null String
      // required", and a List whyworkshop throws "List is not a String"; either kills the build before the
      // enroll button (later in the same Column) renders → W2 fails. Seed both as non-empty Strings.
      shortdescription: 'A seeded enrollable workshop for the flutter e2e suite.',
      // joinus is rendered via renderHtml(String?) (workshopenrollment.dart:1330) → MUST be a String, not [].
      // testimonialmap/faq/knowinfo/sneakpeak stay arrays (list-rendered with .isNotEmpty/.map).
      testimonialmap: [], faq: [], knowinfo: [], joinus: 'Join us for this workshop', sneakpeak: [], whyworkshop: 'Why this workshop',
    },
    atcmodel: null, ...tag,
  });

  // 1a) The ENROLL-TARGET workshop config (WS). NOT pre-enrolled for this user → the sales page shows the
  //     "Enroll Now" button (not "Continue") so tapping it runs enrollWorkshop() (the W3 anti-circular write).
  //     detailpage.title is unique ("…jrny") so WorkshopListView's card text is unambiguous for W1.
  await ref('workshopconfiguration', WS).set(buildConfig(WS, RUN), { merge: true });
  console.log(`  ✓ workshopconfiguration ${WS} (ENROLL target — active, NOT pre-enrolled, qanda, quiz+form)`);

  // 1b) The PRE-ENROLLED runner config (WS_RUNNER) — same shape, distinct id/title. The pre-enrolled pair
  //     below points HERE, so WorkshopChallenges (W4) / quiz (W5) / Q&A (W6) are reachable for this user
  //     WITHOUT depending on the W3 enroll write, and WITHOUT flipping WS's button to "Continue".
  await ref('workshopconfiguration', WS_RUNNER).set(buildConfig(WS_RUNNER, `${RUN} Runner`), { merge: true });
  console.log(`  ✓ workshopconfiguration ${WS_RUNNER} (RUNNER target — pre-enrolled below)`);

  // 2) workshopcategory — the sales page reads all category docs (benign render input).
  await ref('workshopcategory', CATG).set({
    docid: CATG, id: CATG, name: `Focus Group ${RUN}`, description: 'A seeded workshop category.',
    ...tag,
  }, { merge: true });
  console.log(`  ✓ workshopcategory ${CATG}`);

  // 4) PRE-ENROLLED pair (→ WS_RUNNER) so WorkshopChallenges (auto-resume) + the Q&A tab + the quiz are
  //    reachable for THIS user independent of the enroll write. W3 still asserts a NEW pair for WS.
  const pwRef = ref('participant workshop', PW);
  await pwRef.set({
    docref: pwRef, docid: PW, profileid: P,
    workshopref: ref('workshopconfiguration', WS_RUNNER),
    challenges: buildChallenges(), detailpage: { title: `Workshop E2E ${RUN} Runner` },
    created: past(1), evergreenWorkshop: false,
    workshopparticipantenrolledRef: ref('workshop participant enrolled', WPE),
    atcmodel: null, ...tag,
  }, { merge: true });
  await ref('workshop participant enrolled', WPE).set({
    docid: WPE, profileid: P,
    workshopref: ref('workshopconfiguration', WS_RUNNER),
    participantworkshopref: pwRef,
    enrollmentdate: past(1), status: 'enrolled', workshopStartedAt: past(1),
    evergreenWorkshop: false, atcmodel: null, ...tag,
  }, { merge: true });
  console.log(`  ✓ pre-enrolled pair (→ ${WS_RUNNER}): participant workshop ${PW} + workshop participant enrolled ${WPE}`);

  // 5) pending mobile action (workshop-clear-mobile-action precondition — map/render-only).
  await ref('appactionpending', P).set({
    docid: P, lastupdate: past(0),
    workshopaction: { type: 'record', subchallenge: `Knowledge Check ${RUN}`, workshopref: WS_RUNNER },
    ...tag,
  }, { merge: true });
  console.log(`  ✓ appactionpending/${P}.workshopaction (clear-mobile-action precondition)`);

  console.log(`\n[seed-workshops] done for ${P}.`);
  return { RUN, P, WS, WS_RUNNER, QUIZ, PW, WPE, FORM_TEMPLATE };
}

// Collections this seeder writes (run-scoped teardown by testrunid). `static meta data/Workshop Admin`
// is a merged shared singleton — swept by testrunid below (harmless if another suite re-merges it).
const SEEDED = [
  'workshopconfiguration', 'workshopcategory', 'quiz', 'delivery forms',
  'participant workshop', 'workshop participant enrolled', 'appactionpending', 'static meta data',
];
// firestore-forms named-DB collections this seeder writes.
const SEEDED_FORMS = ['delivery forms'];

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const formsDb = getFirestore(admin.app(), FORMS_DB);

  // Default-DB collections by testrunid.
  let n = await seed.teardownCollections(db, SEEDED, RUN);

  // firestore-forms: the template mirror (testrunid-tagged).
  for (const col of SEEDED_FORMS) {
    const tagged = await formsDb.collection(col).where('testrunid', '==', RUN).get().catch(() => ({ docs: [] }));
    for (const d of tagged.docs) { await d.ref.delete().catch(() => {}); n++; }
  }

  // APP-WRITTEN docs (no testrunid) for the driven user, swept by natural key:
  //   • enroll: participant workshop + workshop participant enrolled (profileid==P) — the seeded pair is
  //     tagged (swept above); the APP-written pair is untagged → sweep by profileid here.
  for (const col of ['participant workshop', 'workshop participant enrolled']) {
    const app = await db.collection(col).where('profileid', '==', P).get().catch(() => ({ docs: [] }));
    for (const d of app.docs) { await d.ref.delete().catch(() => {}); n++; }
  }
  //   • take-quiz: quizbyclients (profileid==P) — app-written, untagged.
  const qbc = await db.collection('quizbyclients').where('profileid', '==', P).get().catch(() => ({ docs: [] }));
  for (const d of qbc.docs) { await d.ref.delete().catch(() => {}); n++; }
  //   • qa: workshopQA (profileid==P) — app-written, untagged.
  const qa = await db.collection('workshopQA').where('profileid', '==', P).get().catch(() => ({ docs: [] }));
  for (const d of qa.docs) { await d.ref.delete().catch(() => {}); n++; }

  return n;
}

module.exports = { RUN, P, WS, WS_RUNNER, QUIZ, PW, WPE, FORM_TEMPLATE, SEEDED, SEEDED_FORMS, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-workshops] seeded', JSON.stringify(r)); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-workshops] torn down', n, 'docs for run', RUN); }
    else { console.log('usage: seed-workshops.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
