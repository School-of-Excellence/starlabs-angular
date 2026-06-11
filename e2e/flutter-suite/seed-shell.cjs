// @ts-nocheck
/**
 * seed-shell.cjs — EXTEND the journey cohort for the Flutter e2e "Shell & Home feed" bucket.
 *
 * Bucket key: `shell`. Driven user: participant91+jrny@example.com (profileid `jrny_profile_91`,
 * uid `jrny_u_91`). This seeder adds ONLY the feature preconditions the FEATURE-CATALOG §1 rows
 * require ON TOP of the cohort baseline (the cohort seeder, e2e/journey-cohort/seed-cohort.js, already
 * gives this user: profile_data with participantmode + profileimg, the purchase quartet, the
 * queue_token + full render chain, ≥4 attended events, content analytics, a 2nd journey).
 *
 * What the shell features need on top of the cohort (each maps to a §1 catalog row):
 *   • notifications/{uid} + a /logs subcol               → notification badge / inbox routing / sticky
 *   • a STICKY unread notification log                    → shell-inapp-sticky-message (app flips clicked/read)
 *   • App Version/breakthroughs (higher ios/android)      → shell-force-update-check (render dialog)
 *   • recommended mix playlist (≥1 future doc)            → shell-recommended-mix-listener (render row)
 *   • quiz of the day (delete:false, no response[pid])    → shell-home-quiz (app writes response[pid])
 *   • survey (delete:false, no response[pid])             → shell-home-survey (render card)
 *   • post_categories (≥1)                                → shell-create-post (chip to pick)
 *   • a public Achievements/posts/postcollection post     → shell-explore-social-grid / timeline / post-engagement (render)
 *   • atc taxonomy (SAFE ref) + content_urls             → shell-explore-content-search (render results)
 *   • procedurecode (used:false) + procedures (ongoing)   → shell-mark-procedure-code-qr (app flips used:true)
 *   • applivestreaming / supportchat                      → youtube banner / chat badge (render)
 *
 * SAFETY (mirrors seed-journey.js / seed-cohort.js):
 *   • const admin = seed.initAdmin()  → hard-aborts unless the disposable test project (slabs-queue-e2e-exdcz).
 *   • Every doc carries {testrunid:'jrny', _testdata:true} via TAG(RUN). Deterministic run-prefixed ids.
 *   • Idempotent (set/merge). atcmodel:null on any product/journey/event. NEVER seed any ATC collection;
 *     NEVER open firestore-atc. `atc taxonomy` is the SAFE reference-config collection (per CLAUDE.md).
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-shell.cjs --seed
 *   node flutter-suite/seed-shell.cjs --teardown
 *   JRNY_RUNID=jrny SHELL_INDEX=91 node flutter-suite/seed-shell.cjs --seed
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

// Match the cohort seeder's run + the driven shell user index (keep in lockstep with seed-cohort.js).
const RUN = process.env.JRNY_RUNID || 'jrny';
const IDX = Number(process.env.SHELL_INDEX || 91);

// Cohort-identity derivations (identical formulas to seed-cohort.js emailFor/pidFor/uidFor).
const PID = `${RUN}_profile_${IDX}`;          // profile_data doc id (the spine join key)
const UID = `${RUN}_u_${IDX}`;                // Auth uid == loggedinProfile['user_ref'].id (notifications/{uid})
const EMAIL = `participant${IDX}+${RUN}@example.com`;

// ── deterministic shell-scoped doc ids (run+index prefixed; idempotent re-seed) ─────────────────────
const ID = {
  // notifications/{uid} is the doc; its /logs are a subcollection (ids below)
  stickyLog: `${RUN}_shell_sticky_${IDX}`,     // sticky unread log → shell-inapp-sticky-message
  likeLog: `${RUN}_shell_log_like_${IDX}`,     // a normal recent log → NotificationLog grouping render
  ahLog: `${RUN}_shell_log_ah_${IDX}`,         // an ahupdate-type log → A&H updates feed render
  recMixGeneral: `${RUN}_shell_recmix_g_${IDX}`,
  recMixSolar: `${RUN}_shell_recmix_s_${IDX}`,
  quiz: `${RUN}_shell_qotd_${IDX}`,            // quiz of the day (doc id == its `id` field — the submit-write target)
  survey: `${RUN}_shell_survey_${IDX}`,
  postCat: `${RUN}_shell_postcat_${IDX}`,      // post_categories (a chip to pick in AddPost)
  publicPost: `${RUN}_shell_pubpost_${IDX}`,   // a seeded PUBLIC breakthrough post (Explore grid / Timeline render)
  taxonomy: `${RUN}_shell_tax_${IDX}`,         // atc taxonomy (SAFE reference config)
  contentUrl: `${RUN}_shell_content_${IDX}`,   // content_urls (a searchable General Content item)
  procedure: `${RUN}_shell_proc_${IDX}`,       // procedures doc the code marks complete
  procedureCode: `${RUN}_shell_proccode_${IDX}`,
  liveStream: `${RUN}_shell_live_${IDX}`,      // applivestreaming (YouTube live banner render)
  supportChat: `${RUN}_shell_support_${IDX}`,  // supportchat (chat unread badge render)
  appVersion: 'breakthroughs',                 // App Version/breakthroughs is a SINGLETON (shared) doc
};

// A deterministic procedure code (numeric — the app does int.parse(code.text)).
const PROCEDURE_CODE = 700000 + IDX;           // e.g. 700091 for index 91

// ── collections this seed writes (run-scoped teardown). notifications/<uid> is swept specially. ─────
const SEEDED = [
  'App Version',
  'recommended mix playlist',
  'quiz of the day',
  'survey',
  'post_categories',
  'Achievements',          // we use the doc Achievements/posts (postcollection is a subcol; swept by profileid below)
  'atc taxonomy',
  'content_urls',
  'procedures',
  'procedurecode',
  'applivestreaming',
  'supportchat',
];

async function seedBucket() {
  const admin = seed.initAdmin();          // hard-aborts unless the dedicated test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const FV = admin.firestore.FieldValue;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);
  const now = () => T.now();

  console.log(`\n[seed-shell] run=${RUN} user=${PID} (uid=${UID}) → ${seed.TEST_PROJECT_ID || 'test project'}`);

  // ── 1) NOTIFICATIONS: the doc keyed by uid + a /logs subcollection ───────────────────────────────
  //    home.dart userDataListener writes notifications/{uid} {name} merge (shell-profile-gate-roles);
  //    the badge listener reads notifications/{uid}.read; NotificationLog (initState) calls
  //    readnotification(uid) → notifications/{uid}.update({read:true}); inAppMessage() listens
  //    /logs where sticky==true & read==false limit 1.
  //    We seed read:false so (a) the badge dot shows, and (b) opening NotificationLog flips it true
  //    (the anti-circular assertion: app writes read:true; we seeded false).
  await ref('notifications', UID).set({ read: false, ...tag }, { merge: true });

  const logsCol = (id) => db.collection('notifications').doc(UID).collection('logs').doc(id);
  // (a) the STICKY unread log → the modal sticky card. landingpage empty → the button reads "Close"
  //     and on tap the app calls updateClicked(recordid) → matching log {clicked:true, read:true}.
  //     updateClicked queries /logs where recordid == messageData['recordid'] (the RAW field, sticky path),
  //     so `recordid` must equal what we put here.
  await logsCol(ID.stickyLog).set({
    recordid: ID.stickyLog,
    type: 'general',
    sticky: true,
    read: false,
    clicked: false,
    title: `Shell Sticky ${RUN}`,
    subtitle: 'Seeded sticky subtitle.',
    message: `Sticky in-app message for ${PID}.`,
    landingpage: '',                 // empty → dialog button is "Close" (no deeplink nav side-trip)
    notificationimage: null,
    date: now(),
    ...tag,
  });
  // (b) a normal recent (today) log → NotificationLog grouping render (Today section) + badge.
  await logsCol(ID.likeLog).set({
    recordid: ID.likeLog,
    type: 'like',
    sticky: false,
    read: false,
    clicked: false,
    title: `Someone liked your breakthrough ${RUN}`,
    subtitle: '',
    message: 'tap to view',
    landingpage: '',
    date: now(),
    ...tag,
  });
  // (c) an ahupdate-type log → A&H updates feed (AHupdate reads /logs where type==ahupdate).
  await logsCol(ID.ahLog).set({
    recordid: ID.ahLog,
    type: 'ahupdate',
    sticky: false,
    read: true,
    clicked: false,
    title: `A&H Update ${RUN}`,
    subtitle: '',
    message: 'A broadcast update from A&H.',
    landingpage: '',
    date: past(1),
    ...tag,
  });

  // ── 2) FORCE UPDATE: App Version/breakthroughs with a version HIGHER than any installed build ─────
  //    versioncheck() compares double-parsed (version+"."+build, dots stripped). 9999.9 → "99999"
  //    which exceeds any real installed value → showVersionDialog fires (render-only; no app write).
  //    SINGLETON doc (shared across users) — keep it tagged so teardown sweeps it.
  await ref('App Version', ID.appVersion).set({
    android: 9999.9, ios: 9999.9, androidmandatory: false, iosmandatory: false, ...tag,
  }, { merge: true });

  // ── 3) RECOMMENDED MIX: ≥1 future, non-deleted doc per type → the Home recommended row renders ────
  //    loadRecommendedMix() reads where profileid==PID & date>now-2mo, skips delete==true / expired.
  // recommenedmixplaylist.dart:59 reads doc['bufferdocref'].id UNGUARDED (group key) + doc['list'] (refs
  // it .get()s). The bufferdocref doc itself is NEVER fetched — only its .id is used — so a valid ref
  // suffices; list:[] means no item fetches. Without bufferdocref the Home recommended-mix initState crashes.
  const bufferRef = ref('recommended mix playlist', `${RUN}_shell_recmix_buf_${IDX}`);
  for (const [id, type] of [[ID.recMixGeneral, 'generalcontent'], [ID.recMixSolar, 'solarvoice']]) {
    await ref('recommended mix playlist', id).set({
      docid: id, profileid: PID, type, delete: false,
      date: past(1), expiredate: future(30),
      bufferdocref: bufferRef, list: [], completedcontent: [], completedplaylist: [],
      videoname: `Shell Rec ${type} ${RUN}`, videoid: `${RUN}_recvid_${type}_${IDX}`,
      playlistid: `${RUN}_recplay_${IDX}`, ...tag,
    });
  }

  // ── 4) QUIZ OF THE DAY: delete:false, no response[PID] → quizui() surfaces; submit writes
  //    quiz of the day/{id}.response[PID]=answer (merge). DOC id MUST equal the `id` field (the app
  //    uses quizOfTheDay['id'] as the write doc id). NO `response` key → anti-circular (app creates it).
  await ref('quiz of the day', ID.quiz).set({
    id: ID.quiz, delete: false,
    question: `Shell quiz: which mode? ${RUN}`,
    option: ['Event Mode', 'Integration Mode', 'Performance Mode'],
    correctanswer: 'Event Mode',
    // intentionally NO `response` field — the app writes response[PID] on submit.
    ...tag,
  });

  // ── 5) SURVEY: delete:false, no response[PID] → the inline survey card renders (render-only). ─────
  await ref('survey', ID.survey).set({
    id: ID.survey, delete: false,
    question: `Shell survey: how was today? ${RUN}`,
    option: ['Great', 'Okay', 'Bad'],
    type: 'rating',
    ...tag,
  });

  // ── 6) POST CATEGORIES: AddPost reads post_categories orderBy type, renders a ChoiceChip per cat.
  //    The user must pick one before publishing. `reference` is the doc itself (the app stores
  //    category["reference"] as postCategoryRef).
  await ref('post_categories', ID.postCat).set({
    docid: ID.postCat, type: 'breakthrough', name: `Breakthrough ${RUN}`, ...tag,
  });

  // ── 7) A PUBLIC breakthrough post (Achievements/posts/postcollection) → Explore grid / Timeline /
  //    post-engagement render. private:false so ExploreSocial (where private==false) lists it.
  await db.collection('Achievements').doc('posts').collection('postcollection').doc(ID.publicPost).set({
    postid: ID.publicPost, profileid: PID, uid: UID, name: `Cohort User ${IDX} ${RUN}`,
    postmessage: `Seeded public breakthrough for ${PID}.`,
    paralleltrajectory: 'Seeded parallel trajectory.',
    significance: null, consequence: null,
    private: false, postimagelist: null,
    postcategory: ref('post_categories', ID.postCat),
    created: now(), ...tag,
  });
  // keep a marker doc on the parent so teardown's testrunid sweep finds the family (postcollection is
  // a subcollection — swept by profileid in teardownBucket below).
  await db.collection('Achievements').doc('posts').set({ _shellMarker: PID, ...tag }, { merge: true });

  // ── 8) EXPLORE CONTENT SEARCH: atc taxonomy (SAFE ref) + a content_urls item → search renders. ───
  //    ExploreSearch reads `atc taxonomy` orderBy name; content_urls filtered by available + tags.
  await ref('atc taxonomy', ID.taxonomy).set({
    id: ID.taxonomy, name: `shellbreakthrough${RUN}`, ...tag,
  });
  await ref('content_urls', ID.contentUrl).set({
    docid: ID.contentUrl, videoname: `Shell General Content ${RUN}`,
    videoid: `${RUN}_cvid_${IDX}`, type: 'General Content', available: true,
    tags: [ID.taxonomy], keywords: ['shell', 'breakthrough'],
    url: 'https://example.com/shell-content.m3u8', ...tag,
  });

  // ── 9) MARK PROCEDURE (code): procedurecode (used:false) → procedures (ongoing). On code entry +
  //    submit the app flips procedurecode.{used:true, usedby:PID} and procedures.{status:completed}.
  //    Anti-circular: we seed used:false; assert the app wrote used:true.
  await ref('procedures', ID.procedure).set({
    docid: ID.procedure, status: 'ongoing', assigned_to: [], profileid: PID,
    proceduretitle: `Shell Procedure ${RUN}`, atcmodel: null, ...tag,
  });
  await ref('procedurecode', ID.procedureCode).set({
    docid: ID.procedureCode, code: PROCEDURE_CODE, used: false,
    procedureref: ref('procedures', ID.procedure), ...tag,
  });

  // ── 10) YOUTUBE LIVE BANNER + SUPPORT CHAT BADGE (render-only). ──────────────────────────────────
  await ref('applivestreaming', ID.liveStream).set({
    docid: ID.liveStream, live: true, title: `Shell Live ${RUN}`,
    videoid: 'dQw4w9WgXcQ', link: 'https://youtube.com/watch?v=dQw4w9WgXcQ', ...tag,
  });
  //    supportchat: members arrayContains uid & isdelete==false & pendingcount[uid]>0 → chat badge dot.
  await ref('supportchat', ID.supportChat).set({
    docid: ID.supportChat, members: [UID], isdelete: false,
    pendingcount: { [UID]: 1 }, ...tag,
  });

  console.log('  ✓ shell preconditions seeded:');
  console.log(`     notifications/${UID} (+3 logs: sticky/like/ahupdate), App Version, 2 recmix,`);
  console.log(`     quiz, survey, post_categories, 1 public post, atc taxonomy + content_urls,`);
  console.log(`     procedures + procedurecode(code=${PROCEDURE_CODE}), applivestreaming, supportchat`);
  console.log('[seed-shell] done.');

  return { RUN, PID, UID, EMAIL, ID, PROCEDURE_CODE };
}

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();

  // 1) testrunid-scoped sweep of the flat collections.
  let n = await seed.teardownCollections(db, SEEDED, RUN);

  // 2) notifications/{uid}: delete its /logs then the doc (subcollections aren't covered by the
  //    flat testrunid sweep). Sweep by the known uid.
  const logs = await db.collection('notifications').doc(UID).collection('logs').get().catch(() => ({ docs: [] }));
  for (const d of logs.docs) { await d.ref.delete().catch(() => {}); n++; }
  await db.collection('notifications').doc(UID).delete().catch(() => {});

  // 3) Achievements/posts/postcollection is a subcollection → sweep this run's docs by profileid
  //    (covers BOTH our seeded public post AND any post the APP published during shell-create-post,
  //    which carries no testrunid tag — same discipline as seed-journey.js's app-write sweep).
  const pc = await db.collection('Achievements').doc('posts').collection('postcollection')
    .where('profileid', '==', PID).get().catch(() => ({ docs: [] }));
  for (const d of pc.docs) { await d.ref.delete().catch(() => {}); n++; }

  console.log(`[seed-shell] torn down ${n} docs for run ${RUN} / user ${PID}`);
  return n;
}

module.exports = { RUN, PID, UID, EMAIL, ID, PROCEDURE_CODE, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-shell] seeded for', r.PID); }
    else if (mode === '--teardown') { await teardownBucket(); }
    else { console.log('usage: seed-shell.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
