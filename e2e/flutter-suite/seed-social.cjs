// @ts-nocheck
/**
 * seed-social.cjs — Social / BIG / Shadow / Reports / Profile bucket seeder (Flutter e2e suite).
 *
 * EXTENDS the ≥200-user cohort (journey-cohort/seed-cohort.js) for the ONE driven user
 *   participant151+jrny@example.com  /  profileid jrny_profile_151  /  uid jrny_u_151  /  pw Test!1234
 * with the feature preconditions the catalog rows in FEATURE-CATALOG.md §13 (social-community),
 * §14 (big), §15 (shadow-opportunity), §5 (reports-evolution) + §3 (profile) need ON TOP of the
 * cohort baseline. It does NOT re-seed the cohort baseline — seed-cohort.js already gives this user
 * profile_data (name/email/number/participantmode), the purchase quartet, the queue_token render
 * chain, ≥4 attended events, content, a 2nd-journey upgrade, and an Auth account (idx 151 ∈ the
 * cohort E2E_INDICES).
 *
 * WHAT THIS SEEDS (only what the §13/§14/§15/§5/§3 features read/assert ON TOP of the cohort):
 *
 *   SOCIAL (§13) — drive DraftPost(uid: authUid, profileID) pushed via navigatorKey:
 *     • drafts/{jrny_social_draft_151}  — uid==jrny_u_151, created==TODAY (the DraftPost list query is
 *         where uid==me & created>=today00:00), publish:false, postmessage/significance/consequence +
 *         a postcategory REF → renders the PostItemWidget (category chip + sig/consequence render rows).
 *         ANTI-CIRCULAR: "Publish Now" makes the APP set a NEW Achievements/posts/postcollection/{id}
 *         doc (the seed only wrote the draft) + flips drafts.publish==true. "Report Post" makes the APP
 *         add an Achievements/blacklist/blacklistrows doc.
 *     • postcategory/{jrny_social_cat_151} — the category doc the draft's postcategory ref resolves to.
 *
 *   BIG (§14) — render-only (the app does NO Firestore write in the B!G cluster):
 *     • biglevel ×2 + bigactivity ×1 + big aggregate level/{jrny_social_bal_151} (profileid==me, one
 *         ATC model with regular[] referencing the seeded bigactivity + a level REF into biglevel) so
 *         BigGamefication renders the "My Predictive Intelligence Progress" bar + the fullscreen model
 *         breakdown. + big aggregate level archives for the Achieved-Levels section.
 *     • demovideos/bigdashboard (videoholder/textholder) so BIGVideo renders its intro text + player.
 *
 *   SHADOW (§15) — the 4-collection reference join + an appointment the user can request to shadow:
 *     • eisroles/{jrny_social_shadowrole}  (experiencelevel:"Shadowing")
 *     • Roles-To-EIS/{...}  (assigned_eis arrayContains profile_data/jrny_profile_151, assigned_role_ref→shadowrole)
 *     • AppointmentType-To-Roles/{...}  (additional_role arrayContains shadowrole, assigned_appttype_ref→cohort AT)
 *     • appointments/{jrny_social_shadowappt_151} of the cohort appttype, cancelled:false, FUTURE starttime,
 *         bookedby a DIFFERENT profile (the cohort EIS), hosts/endtime, requestedby:[] (NOT me).
 *       ANTI-CIRCULAR: "Request" makes the APP add this user's profile_data ref to appointments.requestedby.
 *     • a 2nd appointment/{jrny_social_shadowbadge_151} with requestaccepted:[me] → the Accepted badge (display-only).
 *
 *   REPORTS (§5) — read-only summary viewers + the evolution-wishlist send (a clean default-db write):
 *     • uP Life Report Summary/{jrny_profile_151}  (delete:false, summary, capabilities[], timeline[], selectedforms[])
 *     • Big Interview Summary/{jrny_profile_151}    (delete:false, title, summary, capabilities[])
 *     • evolutionwishlistlog/{jrny_social_ewl_151}  (status:'initiated') + static meta data/wishlist (family trailer).
 *       ANTI-CIRCULAR: the Send action flips evolutionwishlistlog.status 'initiated' → 'sent' with contacts[].
 *
 *   PROFILE (§3) — ProfileImage identity card + the destructive delete-account write + Request-Change ticket:
 *     • chat config/{jrny_social_chatcfg} with an "In-App Support" category (Request Change → raiseTickets).
 *     • (identity rows render straight from the cohort profile_data name/email/number; we MERGE a
 *         dateofbirth Timestamp so the DOB row + any .toDate() formatting render cleanly.)
 *       ANTI-CIRCULAR (destructive, LAST in the test): Delete Account writes profile_data.accountdeleted==true.
 *
 * NOT seeded (honest gaps — see SEEDED + the test's render-only/skip tally):
 *   • The snippet rail (social-snippets / ViewSnippet) needs publit.io media → render-only/external, not driven.
 *   • profile-change-picture / profile-verify-photo are camera+ML-Kit → sim-blocked (render the screen only).
 *   • the interim-report ATC step (reports-interim-step2) is ATC OFF-LIMITS → skipped entirely (never seeded).
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts unless the
 * dedicated disposable test project slabs-queue-e2e-exdcz per lib/test-project.js); every doc is tagged
 * {testrunid:'jrny', _testdata:true}; deterministic run-prefixed ids (idempotent set/merge); atcmodel:null
 * on every product/journey/event-shaped doc; NO ATC collection is ever touched and firestore-atc is never
 * opened (the `atc model` collection is reference config and is NOT used here; the B!G aggregate uses
 * plain `atcmodel` STRING labels, not ATC data).
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-social.cjs --seed
 *   node flutter-suite/seed-social.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

// Same run id the cohort uses — this user (jrny_profile_151) is a cohort member; we extend in-place.
const RUN = process.env.JRNY_RUNID || 'jrny';
const I = Number(process.env.SOCIAL_USER_INDEX || 151);

const PID = `${RUN}_profile_${I}`;      // the driven user's profileid (== profile_data doc id)
const UID = `${RUN}_u_${I}`;            // the driven user's auth uid (cohort uidFor(151)) — DraftPost keys on this
const EMAIL = `participant${I}+${RUN}@example.com`;

// ── cohort ids we REUSE (must match seed-cohort.js CAT) ──────────────────────────────────────────
const COHORT = {
  appttype: `${RUN}_AT`,       // appointmenttype "Cohort Coaching <run>"
  eisProfile: `${RUN}_pf_eis`, // the host EIS profile_data (a DIFFERENT profile → a valid shadow host/booker)
};

// ── this seeder's OWN run-prefixed ids (additive; never collide with cohort ids) ─────────────────
const ID = {
  // SOCIAL
  draft: `${RUN}_social_draft_${I}`,
  category: `${RUN}_social_cat_${I}`,
  // BIG
  bigLevel0: `${RUN}_social_biglvl_0`,
  bigLevel1: `${RUN}_social_biglvl_1`,
  bigActivity: `${RUN}_social_bigact_0`,
  bigAggregate: `${RUN}_social_bal_${I}`,
  bigArchive: `${RUN}_social_balarch_${I}`,
  // SHADOW
  shadowRole: `${RUN}_social_shadowrole`,
  shadowRte: `${RUN}_social_shadow_RTE`,
  shadowAtr: `${RUN}_social_shadow_ATR`,
  shadowAppt: `${RUN}_social_shadowappt_${I}`,   // requestable (requestedby empty)
  shadowBadge: `${RUN}_social_shadowbadge_${I}`, // accepted badge (requestaccepted:[me])
  // REPORTS
  evolutionWishlist: `${RUN}_social_ewl_${I}`,
  // PROFILE
  chatCfg: `${RUN}_social_chatcfg`,
};

async function seedBucket() {
  const admin = seed.initAdmin();                 // HARD-ABORTS unless the dedicated test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);
  // today at 00:05 local — guaranteed >= the DraftPost list's `currentdate` (today 00:00) and <= now.
  const todayMorning = () => { const d = new Date(); d.setHours(0, 5, 0, 0); return T.fromDate(d); };
  const futureAt = (dayOffset, h) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return T.fromDate(d); };

  console.log(`\n[seed-social] run=${RUN} user=${PID} (${EMAIL}) uid=${UID} → extend cohort with social/BIG/shadow/reports/profile fixtures`);

  // Reset the APP-WRITTEN, untagged docs a PRIOR run created so each --seed restores the anti-circular
  // pre-state (publish/report/ticket targets must NOT exist before the test drives them). Mirrors
  // teardownBucket (1)-(3): published post, blacklistrows(reportedby me), clientissue(profileid me).
  await db.collection('Achievements').doc('posts').collection('postcollection').doc(ID.draft).delete().catch(() => {});
  const _blPrev = await db.collection('Achievements').doc('blacklist').collection('blacklistrows')
    .where('reportedby', '==', db.collection('user_data').doc(UID)).get().catch(() => ({ docs: [] }));
  for (const d of _blPrev.docs) { await d.ref.delete().catch(() => {}); }
  const _ciPrev = await db.collection('clientissue').where('profileid', '==', PID).get().catch(() => ({ docs: [] }));
  for (const d of _ciPrev.docs) { const _m = await d.ref.collection('messages').get().catch(() => ({ docs: [] })); for (const mm of _m.docs) { await mm.ref.delete().catch(() => {}); } await d.ref.delete().catch(() => {}); }
  // (4) profile_data.accountdeleted — the delete-account feature sets it true; reset to false so the
  // delete-account pre-state (expect accountdeleted==false before the sheet) holds on every re-run.
  await db.collection('profile_data').doc(PID).set({ accountdeleted: false }, { merge: true }).catch(() => {});

  const bw = db.bulkWriter();
  bw.onWriteError((err) => err.failedAttempts < 5);
  let n = 0;
  const W = (r, d, opts) => { bw.set(r, d, opts || {}); n++; };
  const tag = TAG(RUN);

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // SOCIAL (§13) — a TODAY draft for DraftPost(uid: authUid) + the category it references.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // postcategory: PostItemWidget reads firestore.doc(postCategory).type for the coloured chip.
  W(ref('postcategory', ID.category), { docid: ID.category, type: `Breakthrough ${RUN}`, colour: '#2962FF', ...tag });
  // drafts: keyed by uid==authUid & created>=today00:00 (draftposts.dart:599-600). publish:false → "Publish Now"
  // is offered; the APP-written postcollection doc on publish is the anti-circular target (the seed only wrote
  // the draft). significance/consequence drive the expand rows; postimagelist [] (no external image needed).
  W(ref('drafts', ID.draft), {
    docid: ID.draft, postid: ID.draft, uid: UID, profileid: PID, name: `Cohort User ${I} ${RUN}`,
    postmessage: `E2E social achievement ${RUN}`,
    significance: `E2E significance ${RUN}`, consequence: `E2E consequence ${RUN}`,
    postcategory: ref('postcategory', ID.category), postimagelist: [],
    private: false, publish: false, created: todayMorning(), date: '', version: [], ...tag,
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // BIG (§14) — biglevel + bigactivity + a per-model big aggregate level (render-only; no app write).
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // biglevel: {level, sequence, docid} — the level catalog (keyed by the `docid` FIELD in the live widget).
  W(ref('biglevel', ID.bigLevel0), { docid: ID.bigLevel0, level: `Level 1 ${RUN}`, sequence: 1, ...tag });
  W(ref('biglevel', ID.bigLevel1), { docid: ID.bigLevel1, level: `Level 2 ${RUN}`, sequence: 2, ...tag });
  // bigactivity: id→{activity} label map (each big-aggregate activity row references one of these).
  W(ref('bigactivity', ID.bigActivity), { docid: ID.bigActivity, activity: `Arena Experience ${RUN}`, ...tag });
  // big aggregate level: the central per-participant per-ATC-model progress doc. `level` is a REF into
  // biglevel; activity rows are {activity:ref→bigactivity, completed, metric}. One CTD model with a
  // regular[] row at 1/3 fills the bar column + the fullscreen breakdown.
  W(ref('big aggregate level', ID.bigAggregate), {
    docid: ID.bigAggregate, profileid: PID, atcmodel: 'CTD',
    level: ref('biglevel', ID.bigLevel0), levelupcount: 1,
    regular: [{ activity: ref('bigactivity', ID.bigActivity), completed: 1, metric: 3 }],
    fasttrack: [], warmup: [], booster: [], special: [], ...tag,
  });
  // big aggregate level archives: an already-achieved level (the fullscreen "Achieved Levels" list).
  W(ref('big aggregate level archives', ID.bigArchive), {
    docid: ID.bigArchive, profileid: PID, atcmodel: 'CTD', level: ref('biglevel', ID.bigLevel0), ...tag,
  });
  // demovideos/bigdashboard: BIGVideo intro text + (empty) video URL. videoholder '' → the controller is
  // built but never reaches a real network video in CI (we assert the intro text + the screen render).
  // NO ...tag (and merge:false to REPLACE any prior _testdata-polluted doc): BIGVideo.initState does
  // content.data()!.cast<dynamic,String>() then print()s the map (BIGVideo.dart:43-45) — a non-String value
  // (the tag's _testdata:true bool) throws "bool is not String in type cast". Strings only (+ testrunid string).
  W(ref('demovideos', 'bigdashboard'), {
    docid: 'bigdashboard', textholder: `E2E B!G intro ${RUN}`, videoholder: '', testrunid: RUN,
  }, { merge: false });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // SHADOW (§15) — the reference-join + a requestable future appointment + an accepted-badge one.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  const shadowRoleRef = ref('eisroles', ID.shadowRole);
  const apptTypeRef = ref('appointmenttype', COHORT.appttype);
  // eisroles with experiencelevel "Shadowing" → collected into shadowRoles by its reference path.
  W(ref('eisroles', ID.shadowRole), {
    docid: ID.shadowRole, role: `Shadowing Role ${RUN}`, experiencelevel: 'Shadowing', ...tag,
  });
  // Roles-To-EIS: assigned_eis arrayContains profile_data/{PID} (the driven user) AND assigned_role_ref→shadowRole.
  W(ref('Roles-To-EIS', ID.shadowRte), {
    docid: ID.shadowRte, assigned_role_ref: shadowRoleRef, assigned_eis: [ref('profile_data', PID)], ...tag,
  });
  // AppointmentType-To-Roles: additional_role arrayContainsAny [shadowRole] AND assigned_appttype_ref→cohort AT.
  // (the screen filters AppointmentType-To-Roles where additional_role arrayContainsAny apptRoleRef.)
  W(ref('AppointmentType-To-Roles', ID.shadowAtr), {
    docid: ID.shadowAtr, assigned_appttype_ref: apptTypeRef, additional_role: [shadowRoleRef], required_role: [], ...tag,
  });
  // A FUTURE, non-cancelled appointment of the cohort appttype, booked by a DIFFERENT profile (cohort EIS),
  // with the user NOT yet in requestedby → the "Request" affordance shows. The app's "Request" write adds
  // this user's profile_data ref to requestedby (the anti-circular target).
  W(ref('appointments', ID.shadowAppt), {
    docid: ID.shadowAppt, appointment: apptTypeRef,
    hosts: [ref('profile_data', COHORT.eisProfile)], bookedby: ref('profile_data', COHORT.eisProfile),
    starttime: futureAt(6, 11), endtime: futureAt(6, 12), cancelled: false,
    requestedby: [], requestaccepted: [], requestdenied: [], ...tag,
  });
  // A 2nd appointment where the user is already in requestaccepted → the Accepted badge (display-only).
  W(ref('appointments', ID.shadowBadge), {
    docid: ID.shadowBadge, appointment: apptTypeRef,
    hosts: [ref('profile_data', COHORT.eisProfile)], bookedby: ref('profile_data', COHORT.eisProfile),
    starttime: futureAt(8, 14), endtime: futureAt(8, 15), cancelled: false,
    requestedby: [], requestaccepted: [ref('profile_data', PID)], requestdenied: [], ...tag,
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // REPORTS (§5) — read-only summary viewers + an evolution-wishlist log (send flips status→sent).
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // uP Life Report Summary: doc id == profileid; viewer reads via constructor (pre-fetched where delete==false).
  W(ref('uP Life Report Summary', PID), {
    docid: PID, profileid: PID, delete: false, summary: `E2E uP! Life Report ${RUN}`,
    startdate: past(120), enddate: past(10),
    capabilities: [{ title: `Capability ${RUN}`, description: 'seeded capability', imageurl: 'https://example.com/e2e.png' }],
    timeline: [{ title: `Milestone ${RUN}`, description: 'seeded milestone', imageurl: 'https://example.com/e2e.png', startdate: past(60) }],
    selectedforms: [], ...tag,
  });
  // Big Interview Summary: doc id == profileid; viewer reads via constructor (pre-fetched where delete==false).
  W(ref('Big Interview Summary', PID), {
    docid: PID, profileid: PID, delete: false, title: `E2E B!G Interview ${RUN}`,
    startdate: past(90), summary: `E2E B!G interview summary ${RUN}`,
    capabilities: [{ title: `Interview Capability ${RUN}`, description: 'seeded' }], ...tag,
  });
  // evolutionwishlistlog: status 'initiated' so OpenEvolution shows "Share Wishlist Request" and the
  // SendEvolutionWishList screen is editable; the Send write flips THIS doc to status:'sent' (anti-circular).
  W(ref('evolutionwishlistlog', ID.evolutionWishlist), {
    docid: ID.evolutionWishlist, profileid: PID, status: 'initiated',
    closed: false, closedbeforeshare: false, created: past(2), contacts: [], ...tag,
  });
  // static meta data/wishlist: the AEC family trailer the SendEvolutionWishList screen reads (video URL ''
  // → the BetterPlayer is built but reaches no real media in CI; the contacts form still drives).
  W(ref('static meta data', 'wishlist'), {
    family: { videoholder: '', url: '', textholder: `E2E wishlist trailer ${RUN}` },
    self: { videoholder: '', url: '', textholder: `E2E wishlist self ${RUN}` }, ...tag,
  }, { merge: true });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PROFILE (§3) — chat config for the Request-Change ticket + a DOB Timestamp on the profile.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // chat config: first doc holds `categories`; raiseTickets resolves the "In-App Support" category for the
  // profile Request-Change ticket. (Shape mirrors the queue/content seeders' chat config.)
  W(ref('chat config', ID.chatCfg), {
    docid: ID.chatCfg,
    categories: [
      { name: 'In-App Support', category: 'In-App Support', active: true, subcategories: ['Profile', 'General'] },
      { name: 'General', category: 'General', active: true },
    ],
    messages: ['How can we help?'], ...tag,
  });
  // MERGE a dateofbirth Timestamp onto the cohort profile_data so the DOB identity row renders + any
  // .toDate() formatting (profileimage.dart:647) is safe. (name/email/number already come from the cohort.)
  W(ref('profile_data', PID), { dateofbirth: past(9000), ...tag }, { merge: true });

  await bw.close();
  console.log(`  ✓ social fixtures: ${n} docs`);
  console.log(`    • SOCIAL: drafts/${ID.draft} (TODAY, uid=${UID}) + postcategory/${ID.category}`);
  console.log(`    • BIG: biglevel×2 + bigactivity + big aggregate level(+archive) for ${PID} + demovideos/bigdashboard`);
  console.log(`    • SHADOW: eisroles(Shadowing) + Roles-To-EIS + AppointmentType-To-Roles + 2 future appointments`);
  console.log(`    • REPORTS: uP Life Report Summary/${PID} + Big Interview Summary/${PID} + evolutionwishlistlog(initiated) + static meta data/wishlist`);
  console.log(`    • PROFILE: chat config(In-App Support) + dateofbirth on ${PID}`);
  console.log(`  ✓ anti-circular (the APP writes these — NOT seeded): postcollection/${ID.draft}, blacklistrows, appointments.requestedby[${PID}], evolutionwishlistlog.status='sent', profile_data.accountdeleted`);
  console.log('[seed-social] done.');
  return { RUN, PID, EMAIL, UID, ID, docs: n };
}

// Collections this seeder writes (run-scoped teardown by testrunid). `profile_data` is SHARED with the
// cohort (we only merged dateofbirth onto the user's doc) — the cohort's teardown owns that doc, so we DO
// NOT list it here (deleting it would remove the cohort's render-chain precondition). `static meta data`
// is a merged shared-config singleton (swept by testrunid; harmless if other suites also use it).
const SEEDED = [
  'postcategory', 'drafts',
  'biglevel', 'bigactivity', 'big aggregate level', 'big aggregate level archives', 'demovideos',
  'eisroles', 'Roles-To-EIS', 'AppointmentType-To-Roles', 'appointments',
  'uP Life Report Summary', 'Big Interview Summary', 'evolutionwishlistlog', 'static meta data',
  'chat config',
];

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  let n = await seed.teardownCollections(db, SEEDED, RUN);

  // ── APP-WRITTEN docs (no testrunid tag) the social/profile WRITES create, swept by natural key ──
  // (1) the published Achievement: Achievements/posts/postcollection/{draft id} — set by the publish action.
  await db.collection('Achievements').doc('posts').collection('postcollection').doc(ID.draft)
    .delete().catch(() => {});
  n++;
  // (2) blacklistrows the Report-Post action adds (reportedby == user_data/{UID}) — app-written, untagged.
  const bl = await db.collection('Achievements').doc('blacklist').collection('blacklistrows')
    .where('reportedby', '==', db.collection('user_data').doc(UID)).get().catch(() => ({ docs: [] }));
  for (const d of bl.docs) { await d.ref.delete().catch(() => {}); n++; }
  // (3) clientissue (+ its messages) the Request-Change ticket raises (profileid==PID) — app-written, untagged.
  const ci = await db.collection('clientissue').where('profileid', '==', PID).get().catch(() => ({ docs: [] }));
  for (const d of ci.docs) {
    const msgs = await d.ref.collection('messages').get().catch(() => ({ docs: [] }));
    for (const m of msgs.docs) { await m.ref.delete().catch(() => {}); n++; }
    await d.ref.delete().catch(() => {}); n++;
  }
  // NOTE: appointments.requestedby (shadow Request), evolutionwishlistlog.status='sent' (wishlist send)
  // and profile_data.accountdeleted (delete account) are MUTATIONS of docs we already swept above (the two
  // appointments + the wishlist log are testrunid-tagged → removed in teardownCollections; accountdeleted
  // lives on the cohort-owned profile_data and is reset when the cohort is re-seeded). No extra sweep needed.
  return n;
}

module.exports = { RUN, PID, EMAIL, UID, ID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-social] seeded', JSON.stringify({ user: r.PID, docs: r.docs })); }
    else if (mode === '--teardown') { const c = await teardownBucket(); console.log('[seed-social] torn down', c, 'docs for run', RUN); }
    else { console.log('usage: seed-social.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
