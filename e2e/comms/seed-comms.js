// @ts-nocheck
/**
 * seed-comms.js — stand up the Communication Center / Notifications / Chat world on the dedicated
 * disposable test project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives
 * (allowlist-guarded admin init, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/recon-allcomp/comms-notifications.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every doc is tagged
 * {testrunid:'comm', _testdata:true}, and NO ATC collection is ever touched. The recon confirms NONE
 * of the 8 comms routes nor their components read/write ATC — so there is nothing ATC-specific to null
 * here beyond the global constraint.
 *
 * Actors (custom roster — comms/chat need a `chatxadmin` role the queue makeStaff roster lacks):
 *   admin+comm@example.com      roles {admin}          — comms super-role: dashboards + template CRUD
 *   chatadmin+comm@example.com  roles {chatxadmin, admin} — chat moderation (chatAdmin gate, chat-screen.ts:157)
 *   staff+comm@example.com      roles {eventcoordinator}  — a NON-chatxadmin staffer (CN-17 negative arm)
 *   participant0+comm@example.com roles {participant}   — chat member / notification recipient
 *   participant1+comm@example.com roles {participant}   — 2nd recipient (CN-12 oracle denominator)
 *
 * Usage:  node e2e/comms/seed-comms.js --seed | --teardown   (run from the e2e/ dir)
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.COMM_RUNID || 'comm';

// ---- deterministic doc ids (run-prefixed; idempotent re-seed) -----------------------------------
const ID = {
  // notification-record ORACLE doc (CN-12): profileid:[p0,p1,p2], profilesuccess:[p0,p1] -> 66.67%.
  NR_ORACLE: `${TESTRUNID}_nr_oracle`,
  // CF-side-effect notificationrecord (CN-06, gated): profileid:[p0], success:false -> CF flips true.
  NR_CF: `${TESTRUNID}_nr_cf`,
  // zoom recordings backup rows (CN-10 render / CN-11 status filter).
  ZOOM_DONE: `${TESTRUNID}_zoom_completed`,
  ZOOM_FAIL: `${TESTRUNID}_zoom_failed`,
  // supportchat group (CN-08 send / CN-09 sidebar render / CN-17 chatxadmin gate).
  CHAT_GROUP: `${TESTRUNID}_chat_group`,
  // supportchat channel (oneway broadcast precondition — render-only here).
  CHAT_CHANNEL: `${TESTRUNID}_chat_channel`,
  // onewaytemplates doc (CN-14 list render).
  OW_TEMPLATE: `${TESTRUNID}_oneway_tmpl`,
  // email templates docs (CN-02 approved-vs-pending filter — render-only here).
  EMAIL_APPROVED: `${TESTRUNID}_email_approved`,
  EMAIL_PENDING: `${TESTRUNID}_email_pending`,
  // CF-side-effect email-templates doc (CN-13 createPostMarkEmailTemplate — starts pending+unvalidated,
  // the CF flips postmarkstatus->approved on the validate write). Distinct from EMAIL_PENDING so the
  // CN-02 render assertion is never disturbed by a CF run.
  EMAIL_CF: `${TESTRUNID}_email_cf`,
  // email archive doc (CN-05 sendBatchEmailTest CF — profileid:[p0,p1], status:'created' so the CF fires).
  EMAIL_ARCHIVE_CF: `${TESTRUNID}_email_archive_cf`,
  // notification templates doc (notification template list render).
  NOTIF_TEMPLATE: `${TESTRUNID}_notif_tmpl`,
  // notifications/{uid}/logs/{logid} doc (CN-16 notification-log collectionGroup render).
  NOTIF_LOG: `${TESTRUNID}_notif_log`,
};

// Actors. profileids run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  admin: `${TESTRUNID}_pf_admin`,
  chatadmin: `${TESTRUNID}_pf_chatadmin`,
  staff: `${TESTRUNID}_pf_staff`,
  p0: `${TESTRUNID}_pf_p0`,
  p1: `${TESTRUNID}_pf_p1`,
};
const EMAIL = {
  admin: `admin+${TESTRUNID}@example.com`,
  chatadmin: `chatadmin+${TESTRUNID}@example.com`,
  staff: `staff+${TESTRUNID}@example.com`,
  p0: `participant0+${TESTRUNID}@example.com`,
  p1: `participant1+${TESTRUNID}@example.com`,
};
// Auth uids (deterministic; seedAuthChain creates them and links profile_data.user_ref -> user_data/{uid}).
const UID = {
  admin: `${TESTRUNID}_u_admin`,
  chatadmin: `${TESTRUNID}_u_chatadmin`,
  staff: `${TESTRUNID}_u_staff`,
  p0: `${TESTRUNID}_u_p0`,
  p1: `${TESTRUNID}_u_p1`,
};

function roster() {
  const mk = (key, roles, role) => ({ uid: UID[key], profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  const staff = [
    mk('admin', ['admin'], 'admin'),
    mk('chatadmin', ['chatxadmin', 'admin'], 'chatadmin'),
    mk('staff', ['eventcoordinator'], 'staff'),
  ];
  const participants = [mk('p0', ['participant'], 'participant'), mk('p1', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the comms specs navigate to (each needs a dashboard route-config grant or authGuard denies it
// with "No roles or profiles configured for screen: X" and bounces to root — recon risk #1).
const ROUTES = [
  { route: '/communication', label: 'Communication Center' },
  { route: '/email-templates', label: 'Create Email Template' },
  { route: '/zoom-recording-dashboard', label: 'Zoom Recording Dashboard' },
  { route: '/notificationlog', label: 'Notification Log' },
  { route: '/notificationrecord', label: 'Notification Record' },
  { route: '/group-chat', label: 'Group Chat' },
  { route: '/onewaytemplates', label: 'One-Way Templates' },
];

async function seedComms() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the queue
  //    DRIVEN_ROUTES grants). profile_data.user_ref -> user_data/{uid}; users_roles carries the role flags
  //    + profile_ref (chat-screen.ts:156 reads roles['profile_ref'].id; :157 reads roles['chatxadmin']).
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes (granted to every staff role + every staff profileid).
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles });

  // --- date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const hoursAgo = (h) => T.fromMillis(Date.now() - h * 3600e3);
  const now = () => T.now();

  // 3) NOTIFICATION RECORD — the CN-12 ORACLE doc. The component computes
  //    receivedRate = (profilesuccess.length / profileid.length * 100).toFixed(2)
  //    (notification-record.component.ts:199-201). 2/3*100 -> "66.67". `date` MUST be a Timestamp inside
  //    the default fetch window (today-7 .. now): the query is where(date>=start) where(date<=end)
  //    orderBy(date desc) (ts:189-194) — a single-field range, NO composite index — and updateStatistics
  //    calls item.date.toDate() unguarded (ts:263). 1h ago is safely in-window.
  await db.collection('notificationrecord').doc(ID.NR_ORACLE).set({
    docid: ID.NR_ORACLE,
    title: `Seeded Oracle Notification ${TESTRUNID}`,
    message: 'Oracle body — receivedRate must compute to 66.67',
    notificationtype: 'General',
    profileid: [PF.p0, PF.p1, `${TESTRUNID}_pf_extra`],   // length 3 (denominator)
    profilesuccess: [PF.p0, PF.p1],                        // length 2 (numerator) -> 66.67
    profilefailed: [`${TESTRUNID}_pf_extra`],
    success: true,
    date: hoursAgo(1),
    ...tag,
  });

  // CF-side-effect precondition (CN-06, GATED behind COMM_CF=1 — see notifications.spec.ts). notifyMobileApp
  // (recon CF table) fires onCreate notificationrecord and writes back profilesuccess[]/profilefailed[]/
  // success:true (CF:519-529). success starts false here so the CF flip is observable. Only seeded so a CF
  // run has a fresh doc; the default (un-gated) suite never asserts on it. `date` in-window so the page that
  // lists records does not crash on it during a CF run.
  await db.collection('notificationrecord').doc(ID.NR_CF).set({
    docid: ID.NR_CF,
    title: `Seeded CF Notification ${TESTRUNID}`,
    message: 'CF body',
    notificationtype: 'General',
    profileid: [PF.p0],
    success: false,
    date: hoursAgo(2),
    ...tag,
  });

  // 4) ZOOM RECORDINGS BACKUP — two rows for CN-10 (render) + CN-11 (status filter). The dashboard queries
  //    orderBy('timestamp','desc') (zoom-...ts:49 — single-field, no composite) then renders a MatTable.
  //    The default form date-range is today..today and the filterPredicate compares startTime by day
  //    (ts:101-108); meetingTopic + hostEmail are .toLowerCase()'d UNGUARDED (ts:95-96) so BOTH must be
  //    non-empty strings, and startTime MUST be TODAY (a Timestamp -> mapped to a JS Date, ts:52) or the
  //    default filter hides the row.
  const zoomRow = (id, topic, status, ok, fail) => ({
    docid: id, meetingId: id.replace(`${TESTRUNID}_zoom_`, '999'), meetingTopic: topic,
    hostEmail: EMAIL.admin, duration: 60, status, successCount: ok, failedCount: fail,
    startTime: now(), totalSize: 1024, totalFiles: 1, files: [], timestamp: now(), ...tag,
  });
  await db.collection('zoom recordings backup').doc(ID.ZOOM_DONE).set(
    zoomRow(ID.ZOOM_DONE, `Completed Meeting ${TESTRUNID}`, 'completed', 5, 0),
  );
  await db.collection('zoom recordings backup').doc(ID.ZOOM_FAIL).set(
    zoomRow(ID.ZOOM_FAIL, `Failed Meeting ${TESTRUNID}`, 'failed', 0, 3),
  );

  // 5) SUPPORTCHAT GROUP — CN-08 (send) / CN-09 (sidebar render) / CN-17 (chatxadmin gate). The admin/
  //    chatxadmin active-chat query is where(isdelete==false) orderBy(last_modification desc)
  //    (chat-screen.ts:220-224 — single-field, no composite). mapChatList reads group_name -> chatname,
  //    last_modification -> time, last_pending -> pending (ts:1016-area). sendMessage reads
  //    selectedChat.members.filter(...) so members MUST be a non-empty array (auth UIDs, per recon).
  const memberUids = [UID.admin, UID.chatadmin, UID.p0, UID.p1];
  await db.collection('supportchat').doc(ID.CHAT_GROUP).set({
    docid: ID.CHAT_GROUP,
    group_name: `Seeded Group ${TESTRUNID}`,
    group_profile: 'https://example.com/g.png',
    chattype: 'group',
    type: 'group',
    members: memberUids,
    creator_uid: UID.chatadmin,
    isdelete: false,
    last_message: 'Seeded last message',
    last_sender_uid: UID.chatadmin,
    last_pending: [],
    last_modification: hoursAgo(1),
    created_on: hoursAgo(48),
    pinned: false,
    ...tag,
  });

  // SUPPORTCHAT CHANNEL (type:'channel') — oneway broadcast precondition. Render-only in this suite.
  await db.collection('supportchat').doc(ID.CHAT_CHANNEL).set({
    docid: ID.CHAT_CHANNEL,
    group_name: `Seeded Channel ${TESTRUNID}`,
    group_profile: 'https://example.com/c.png',
    chattype: 'channel',
    type: 'channel',
    members: [UID.admin],
    admins: [PF.admin],
    creator_uid: UID.admin,
    isdelete: false,
    last_message: 'Channel seed',
    last_modification: hoursAgo(1),
    created_on: hoursAgo(48),
    ...tag,
  });

  // 6) ONEWAYTEMPLATES — CN-14 list render. loadTemplates queries orderBy('createddate','desc')
  //    (oneway-templates.ts:417 — single-field, no composite) and filters out delete:true (ts:420). The
  //    list table shows templatename/category/headertype/status/date. `createddate` MUST exist or orderBy
  //    excludes the doc.
  await db.collection('onewaytemplates').doc(ID.OW_TEMPLATE).set({
    docid: ID.OW_TEMPLATE,
    templatename: `Seeded Oneway ${TESTRUNID}`,
    templateid: `Seeded_Oneway_${TESTRUNID}`,
    category: 'Test',
    headertype: 'none',
    headervalue: '',
    htmlbody: '<p>Broadcast body</p>',
    textbody: 'Broadcast body',
    footer: '',
    status: 'approved',
    createdby: UID.admin,
    createddate: hoursAgo(3),
    timeline: [],
    active: true,
    delete: false,
    ...tag,
  });
  // classify/onewaycategories — the category list the oneway create form reads (ts:401). Merge so we don't
  // clobber other runs' categories on the shared project.
  await db.collection('classify').doc('onewaycategories').set({ categories: ['Test'] }, { merge: true });

  // 7) EMAIL TEMPLATES — CN-02 render (approved-vs-pending). The /email-templates list queries
  //    orderBy('date','desc') (create-email-template.component.ts:590 — single-field, no composite) and
  //    renders a MatTable (cols templatename/category/subcategory/servername/status/validated/date). The
  //    `date` field MUST exist or the orderBy excludes the doc. The send/validation flows touch Postmark +
  //    a cross-project write — out of scope here (see blockers); these are render-only preconditions.
  const emailTmpl = (id, name, status, validated) => ({
    docid: id, templatename: name, type: 'email', subject: 'Test Subject', htmlbody: '<p>Hello</p>',
    templatealias: `${name}-alias`, category: 'Test', subcategory: 'Unit', servername: 'POSTMARK_STARLABS_TEST',
    postmarkstatus: status, templatevalidated: validated, templatestatus: 'created',
    active: status === 'approved', date: hoursAgo(4), createddate: hoursAgo(4), ...tag,
  });
  await db.collection('email templates').doc(ID.EMAIL_APPROVED).set(
    emailTmpl(ID.EMAIL_APPROVED, `Approved Email ${TESTRUNID}`, 'approved', true),
  );
  await db.collection('email templates').doc(ID.EMAIL_PENDING).set(
    emailTmpl(ID.EMAIL_PENDING, `Pending Email ${TESTRUNID}`, 'pending', false),
  );
  // CF-side-effect precondition (CN-13, skip-graceful). createPostMarkEmailTemplate (recon CF table)
  // fires onUpdate email-templates when templatevalidated flips false->true AND templatestatus=='created',
  // then calls Postmark externally and writes back postmarkstatus:'approved' (CF:1949-1952). It starts
  // pending+unvalidated here so the flip is observable. A separate doc from EMAIL_PENDING so the CN-02
  // render assertion is never perturbed by a CF run. (status MUST be 'created' for the CF guard.)
  await db.collection('email templates').doc(ID.EMAIL_CF).set(
    emailTmpl(ID.EMAIL_CF, `CF Email ${TESTRUNID}`, 'pending', false),
  );

  // 7b) EMAIL ARCHIVE — CF-side-effect precondition (CN-05 sendBatchEmailTest, skip-graceful). The CF
  //    fires onCreate `email archive` when status != 'queued' (recon risk #2) and writes one `email logs`
  //    row per recipient (CF:1496-1504) + postmark_msgid[]/mailstatus back on the archive doc. We seed
  //    profileid:[p0,p1] (the KNOWN recipient set) with status:'created'; the CF computes the log fan-out.
  //    `participant metadata` for p0/p1 carries the email the CF batch reads (sendBatchEmailArchive:1339).
  await db.collection('participant metadata').doc(PF.p0).set(
    { profileid: PF.p0, email: EMAIL.p0, name: `P0 ${TESTRUNID}`, customerstatus: 'active', ...tag }, { merge: true },
  );
  await db.collection('participant metadata').doc(PF.p1).set(
    { profileid: PF.p1, email: EMAIL.p1, name: `P1 ${TESTRUNID}`, customerstatus: 'active', ...tag }, { merge: true },
  );
  await db.collection('email archive').doc(ID.EMAIL_ARCHIVE_CF).set({
    docid: ID.EMAIL_ARCHIVE_CF,
    broadcastname: `Seeded Broadcast ${TESTRUNID}`,
    profileid: [PF.p0, PF.p1],
    templateid: `Approved Email ${TESTRUNID}`,
    subject: 'Test Subject', body: '<p>Hello</p>', notes: '',
    status: 'created', createdby: UID.admin, date: hoursAgo(1),
    ...tag,
  });

  // 7c) CONFIG for the create-email-template form (CN-04b) + communication notif-template form (CN-03):
  //    - email validators/templateCategories: the category + subcategory option lists the create form's
  //      mat-selects read (create-email-template.component.ts:556-559; communication reads :1194/1207).
  //      Without these the Category/Sub-Category selects are empty → the reactive form never validates →
  //      the Create button stays disabled. Merge so other runs' categories are not clobbered.
  //    - classify/postmarkserver: the Server-Name option list the create form reads (:574). Same gating.
  await db.collection('email validators').doc('templateCategories').set(
    { categories: ['Test'], subcategories: ['Unit'] }, { merge: true },
  );
  await db.collection('classify').doc('postmarkserver').set(
    { servername: ['POSTMARK_STARLABS_TEST'] }, { merge: true },
  );

  // 7d) NOTIFICATIONS LOG — CN-16. /notificationlog runs a collectionGroup('logs') query with
  //    where(date>=start) where(date<=end) orderBy(date desc) (notifications-log.component.ts:157-164)
  //    — a collectionGroup range+orderBy on `date`, which REQUIRES a collection-group single-field index
  //    on logs.date (returned in neededIndexes). The default form range is today..today, so `date` MUST be
  //    NOW (a Timestamp; the row renders {{row.date.toDate()|date}} so it MUST be a Timestamp or the cell
  //    throws). The query has NO testrunid filter (reads ALL logs project-wide) so the spec scopes to the
  //    run-unique message via the screen's "Filter Table" box. The parent path id (the {uid}) is mapped to
  //    a name via user_data — our admin uid IS in user_data (seedAuthChain), so the Name cell resolves.
  await db.collection('notifications').doc(UID.admin).set({ read: false, ...tag }, { merge: true });
  await db.collection('notifications').doc(UID.admin).collection('logs').doc(ID.NOTIF_LOG).set({
    message: `Seeded Log Notification ${TESTRUNID}`,
    title: `Seeded Log ${TESTRUNID}`,
    type: 'notification',
    sticky: false,
    read: true,
    clicked: false,
    landingpage: '',
    date: now(),
    ...tag,
  });

  // 8) NOTIFICATION TEMPLATES — render-only precondition for the communication dashboard's template list.
  await db.collection('notification templates').doc(ID.NOTIF_TEMPLATE).set({
    docid: ID.NOTIF_TEMPLATE, templatename: `Seeded Notif ${TESTRUNID}`, type: 'notification',
    message: 'Test notification body', templatevalidated: true, templatestatus: 'created',
    createdby: UID.admin, ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, UID,
    counts: {
      notificationrecord: 2, 'zoom recordings backup': 2, supportchat: 2, onewaytemplates: 1,
      'email templates': 3, 'notification templates': 1, 'email archive': 1, 'notifications/logs': 1,
      'participant metadata': 2,
    },
  };
}

// Collections this seed writes (for teardown). Spaced names are Firestore strings — pass verbatim.
const SEEDED = [
  'notificationrecord', 'zoom recordings backup', 'supportchat', 'onewaytemplates',
  'email templates', 'notification templates', 'email archive', 'participant metadata', 'notifications',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched).
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownComms() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  let n = await seed.teardownCollections(db, SEEDED, TESTRUNID);

  // teardownCollections is top-level-only; the notifications/{uid}/logs/{logid} subcollection doc is not
  // reached by deleting the parent. Delete the seeded log subcollection explicitly (idempotent).
  const logsSnap = await db.collection('notifications').doc(UID.admin).collection('logs')
    .where('testrunid', '==', TESTRUNID).get().catch(() => ({ docs: [] }));
  for (const d of logsSnap.docs) { await d.ref.delete().catch(() => {}); n++; }

  // App/CF-written docs from the CF cases carry NO testrunid — clean them by their natural key (the
  // seeded email-archive id) so a re-run starts clean even if a CF DID fire (skip-graceful cases).
  const elSnap = await db.collection('email logs').where('emailarchiveid', '==', ID.EMAIL_ARCHIVE_CF)
    .get().catch(() => ({ docs: [] }));
  for (const d of elSnap.docs) { await d.ref.delete().catch(() => {}); n++; }
  // The notification-template CREATE case (CN-03) writes a doc with NO testrunid keyed by its run-unique
  // message — sweep it by that natural key (the app sets type:'notification').
  const ntSnap = await db.collection('notification templates')
    .where('message', '==', `CN-03 body ${TESTRUNID}`).get().catch(() => ({ docs: [] }));
  for (const d of ntSnap.docs) { await d.ref.delete().catch(() => {}); n++; }
  // The email-template CREATE case (CN-04b) writes a doc with NO testrunid keyed by its run-unique name —
  // sweep by templatename (the app sets type:'email').
  const etSnap = await db.collection('email templates')
    .where('templatename', '==', `CN-04b Email ${TESTRUNID}`).get().catch(() => ({ docs: [] }));
  for (const d of etSnap.docs) { await d.ref.delete().catch(() => {}); n++; }

  // Also delete the Auth users (uids carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(UID)) {
    await auth.deleteUser(UID[key]).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, UID, ROUTES, SEEDED, seedComms, teardownComms };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedComms(); console.log('[seed-comms] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownComms(); console.log('[seed-comms] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-comms.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
