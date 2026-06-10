// @ts-nocheck
/**
 * seed-support.js — stand up the Customer Support world on the dedicated disposable test project
 * (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded admin init,
 * the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/recon-allcomp/customer-support.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes
 * through seed-test-project.initAdmin() (hard-aborts off the test project), every data doc is tagged
 * {testrunid:'sup', _testdata:true}, and NO ATC collection is ever touched (Customer Support has no
 * ATC integration — all ticket data is in `clientissue`).
 *
 * Actors (custom roster — Customer Support needs a `chatxadmin` role the queue makeStaff lacks):
 *   admin+sup@example.com   roles {admin, chatxadmin} — Customer Support agent (sees/owns tickets)
 *   agent1+sup@example.com  roles {admin, chatxadmin} — 2nd agent (owns the "not assigned to me" ticket)
 *   participant0+sup@example.com roles {participant}  — the ticket CLIENT (clientid on tickets)
 *
 * Anti-circularity: the dashboard streams `clientissue` and COMPUTES the metric cards + per-category
 * open/close counts; the specs assert those APP-COMPUTED values against the KNOWN seeded shape (e.g.
 * a UNIQUE per-run category so production-leftover tickets can't pollute the count). Write-mutation
 * cases (send message, close, flag) assert the value the APP WROTE on a real click vs the seeded
 * pre-state — never a value the test itself wrote. The seed is a PRECONDITION, never the assertion.
 *
 * Usage:  node e2e/support/seed-support.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.SUP_RUNID || 'sup';

// The hardcoded `chat config` doc id the app reads (add-issue.component.ts:174 getDoc by this exact id;
// dashboard reads chatConfig.docs[0] — first doc). Seeding it with THIS id satisfies both readers.
const CHAT_CONFIG_ID = '0jqtiq3sxtbLVcEGMDhW';

// A UNIQUE-per-run category name — the dashboard's categoryCountMap is keyed by category string, so a
// run-unique category gives us an APP-COMPUTED open/close count that PRODUCTION-leftover tickets (which
// carry other categories) cannot pollute. This is the anti-circular oracle for CS-02.
const CATEGORY = `TEST Support ${TESTRUNID}`;

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  T_NEW: `${TESTRUNID}_T_new`,        // Open + chatstatus "New", assigned to agent0 (myCases)
  T_RESP: `${TESTRUNID}_T_resp`,       // Open + chatstatus "Responded", assigned to agent0
  T_CLOSED: `${TESTRUNID}_T_closed`,    // status.status "Closed", assigned to agent0
  T_FLAG: `${TESTRUNID}_T_flag`,       // Open + flag:true (→ CS-11 unflag), assigned to agent0
  T_UNFLAG: `${TESTRUNID}_T_unflag`,     // Open + flag:false (→ CS-10 flag), assigned to agent0
  T_REVIEWED: `${TESTRUNID}_T_reviewed`,   // Open + review:{agent0:ts} (reviewed), assigned to agent0
  T_OTHER: `${TESTRUNID}_T_other`,      // Open, assigned to agent1 ONLY (→ CS-12 not in agent0 myCases)
  T_SEND: `${TESTRUNID}_T_send`,       // Open, assigned to agent0, 1 seeded msg (→ CS-07 send-message)
  T_UNREAD: `${TESTRUNID}_T_unread`,     // Open, assigned to agent0, 2 unread (pending:admin) msgs (→ CS-06)
  COUNTER: 'ticketCounter',          // counters/ticketCounter (shared doc id, app-wide)
};

// Actors. profileids are run-prefixed; emails follow the actors.ts convention `<role>+<run>@example.com`.
const PF = {
  agent0: `${TESTRUNID}_pf_agent0`,
  agent1: `${TESTRUNID}_pf_agent1`,
  client: `${TESTRUNID}_pf_client`,
};
const EMAIL = {
  agent0: `admin+${TESTRUNID}@example.com`,   // primary chatxadmin agent (the specs log in as this)
  agent1: `agent1+${TESTRUNID}@example.com`,  // 2nd chatxadmin agent
  client: `participant0+${TESTRUNID}@example.com`,
};

// Counter starting value (CS-04 oracle: a freshly-created ticket's issueno is computed by the app/CF
// from this counter, so it must be > this seeded base). Reset every seed for determinism.
const COUNTER_START = 5000;

function roster() {
  const mk = (key, roles, role) => ({ uid: `${TESTRUNID}_u_${key}`, profileid: PF[key], email: EMAIL[key], role: role || key, roles });
  // chatxadmin agents carry {admin, chatxadmin} — admin so they pass the route grant (allRoles includes
  // 'admin'); chatxadmin so the dashboard/chat-screen role gate (roles['chatxadmin']) is true and the
  // `users_roles where chatxadmin==true` query (dashboard ts:235) returns them.
  const staff = [
    mk('agent0', ['admin', 'chatxadmin'], 'admin'),
    mk('agent1', ['admin', 'chatxadmin'], 'admin'),
  ];
  const participants = [mk('client', ['participant'], 'participant')];
  return { staff, operators: [], participants };
}

// Routes the support specs navigate to. The authGuard matches by the FIRST path segment only
// ('/' + state.url.split('?')[0].split('/')[1], auth.guard.ts:34), so the chat-screen sub-route
// /customersupportdashboard/ticket/:id/:no resolves its route-config to '/customersupportdashboard'.
const ROUTES = [
  { route: '/customersupportdashboard', label: 'Customer Support Dashboard' },
  { route: '/customer-support-tickets', label: 'Customer Support Tickets' },
  { route: '/customertickets', label: 'Customer Tickets' },
];

async function seedSupport() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the custom roster (Auth users + user_data + profile_data + users_roles + the
  //    queue DRIVEN_ROUTES grants). Reused verbatim from the queue seeder. NOTE: this writes the
  //    chatxadmin staff into users_roles with chatxadmin:true (roleFlags from `roles`), so the
  //    dashboard's `where('chatxadmin','==',true)` query returns exactly our seeded agents.
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes (so the data-driven authGuard admits the agents).
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))]; // ['admin','chatxadmin']
  const participantProfileIds = participants.map((p) => p.profileid);
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles, participantProfileIds });

  // 3) profile_data for the CLIENT (clientid on every seeded ticket). seedAuthChain already wrote a
  //    participant profile for `client`; we MERGE the support-display fields the dashboard/chat read
  //    (name/email/number) so the ticket rows render a client name. (merge keeps role_ref/user_ref.)
  await db.collection('profile_data').doc(PF.client).set({
    profileid: PF.client, name: `Client ${TESTRUNID}`, email: EMAIL.client, number: '9999911111', countrycode: '+91', ...tag,
  }, { merge: true });

  // 4) chat config — the SINGLE config doc (hardcoded id). categories[].assignto pre-populates the
  //    AddIssue assign field for that category; messages[0].message is the CF auto-reply; status drives
  //    the status selector; validators/negligencecategories keep those branches inert.
  await db.collection('chat config').doc(CHAT_CONFIG_ID).set({
    docid: CHAT_CONFIG_ID,
    categories: [{ category: CATEGORY, assignto: [PF.agent0], subcategories: [] }],
    status: [{ status: 'Open' }, { status: 'Closed' }],
    validators: [],
    negligencecategories: [],
    messages: [{ message: `Thank you for reaching out (${TESTRUNID})` }],
    warningmessages: [{ message: 'Please respond to avoid auto-close' }],
    closingmessages: [{ message: 'Ticket auto-closed' }],
    ...tag,
  });

  // 5) counters/ticketCounter — reset to a known base each seed so CS-04's app/CF-computed issueno is a
  //    deterministic value GREATER than this base (the seed is the precondition; the issueno is the
  //    app/CF-written assertion). NOT tagged-teardownable (shared app doc) — we just reset it.
  await db.collection('counters').doc(ID.COUNTER).set({ currentNumber: COUNTER_START }, { merge: true });

  // --- date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const daysAgo = (d) => T.fromMillis(Date.now() - d * 86400e3);
  const journeyNull = null; // dashboard guards `[null,undefined,''].includes(element.journey)` → "No Journey"

  // 6) clientissue tickets. EVERY field the dashboard dereferences without a guard MUST be present:
  //    reporteddate (Timestamp; orderBy + .toDate()), status:{status,date(Timestamp),editedBy},
  //    chatstatus (string), assign (profileid array), clientid, name, issue (string), category, review.
  //    `issueno` is run-offset so rows are visually distinct and stable across runs.
  const mkTicket = (id, over) => ({
    id,
    clientid: PF.client,
    name: `Client ${TESTRUNID}`,
    email: EMAIL.client,
    mobile: '9999911111',
    reportedBy: PF.agent0,
    issueReportedBy: PF.agent0,
    reporteddate: daysAgo(2),
    journey: journeyNull,
    category: CATEGORY,
    subcategory: null,
    assign: [PF.agent0],
    peopleinvolved: [],
    issue: `Seeded support issue ${id} for ${TESTRUNID}`,
    chatstatus: 'New',
    priority: '',
    status: { status: 'Open', date: daysAgo(2), editedBy: PF.agent0 },
    last_modification: daysAgo(1),
    flag: false,
    review: {},
    mandatereview: {},
    notes: [],
    ...over,
    ...tag,
  });

  // Two OPEN tickets in the unique category (one New, one Responded) → CS-02 open-count oracle == 2 (+
  // the other open tickets below also carry CATEGORY; we assert the CATEGORY open count precisely).
  await db.collection('clientissue').doc(ID.T_NEW).set(mkTicket(ID.T_NEW, { issueno: 5101, chatstatus: 'New' }));
  await db.collection('clientissue').doc(ID.T_RESP).set(mkTicket(ID.T_RESP, { issueno: 5102, chatstatus: 'Responded' }));
  // One CLOSED ticket (status.status Closed) → CS-02 close-count oracle for CATEGORY.
  await db.collection('clientissue').doc(ID.T_CLOSED).set(mkTicket(ID.T_CLOSED, {
    issueno: 5103, chatstatus: 'Responded', status: { status: 'Closed', date: daysAgo(1), editedBy: PF.agent0 },
  }));
  // Flag fixtures: one already-flagged (→ CS-11 unflag), one unflagged (→ CS-10 flag).
  await db.collection('clientissue').doc(ID.T_FLAG).set(mkTicket(ID.T_FLAG, {
    issueno: 5104, flag: true, flagdata: { severity: 'Normal', flaggedby: PF.agent0, time: new Date() },
  }));
  await db.collection('clientissue').doc(ID.T_UNFLAG).set(mkTicket(ID.T_UNFLAG, { issueno: 5105, flag: false }));
  // Reviewed ticket (review has agent0 key) → exercises the reviewmarked count + green "reviewed" button.
  await db.collection('clientissue').doc(ID.T_REVIEWED).set(mkTicket(ID.T_REVIEWED, {
    issueno: 5106, review: { [PF.agent0]: T.now() },
  }));
  // Ticket assigned to agent1 ONLY (NOT agent0) → CS-12 "My Cases" for agent0 must NOT include it.
  await db.collection('clientissue').doc(ID.T_OTHER).set(mkTicket(ID.T_OTHER, {
    issueno: 5107, assign: [PF.agent1], reportedBy: PF.agent1,
  }));
  // Send-message target (assigned to agent0) → CS-07 drives the chat screen and sends a real message.
  await db.collection('clientissue').doc(ID.T_SEND).set(mkTicket(ID.T_SEND, { issueno: 5108, chatstatus: 'New' }));
  // Unread fixture (assigned to agent0) → CS-06 asserts the app-computed unread badge.
  await db.collection('clientissue').doc(ID.T_UNREAD).set(mkTicket(ID.T_UNREAD, { issueno: 5109, chatstatus: 'New' }));

  // --- messages subcollections (preconditions only) ------------------------------------------------
  // The chat-screen message-input only renders when currentIssueChat.length != 0 (chat HTML:396), so the
  // SEND target needs >=1 seeded message. The UNREAD target gets 2 messages with pending:['admin'] so the
  // app computes unreadcount==2 (chat-screen ts:504 filters pending array-contains 'admin'). These are
  // PRECONDITIONS; the specs assert the app's own write (new message / unread render), not these values.
  const mkMsg = (ticketId, msgId, over) => ({
    time: T.now(), message: `seeded message ${msgId}`, messageid: msgId,
    sender_profileid: PF.client, sender_email: EMAIL.client, sender_uid: null,
    pending: ['user'], read_by: ['admin'], links: [], files: [], type: 'chat',
    clientid: PF.client, ticketid: ticketId, ...over, ...tag,
  });
  // SEND target: one existing inbound message (pending:['user'] → does NOT inflate unread).
  await db.collection('clientissue').doc(ID.T_SEND).collection('messages').doc(`${TESTRUNID}_m_send_0`)
    .set(mkMsg(ID.T_SEND, `${TESTRUNID}_m_send_0`));
  // UNREAD target: exactly 2 inbound messages pending for 'admin' → app unreadcount == 2.
  for (let i = 0; i < 2; i++) {
    await db.collection('clientissue').doc(ID.T_UNREAD).collection('messages').doc(`${TESTRUNID}_m_unread_${i}`)
      .set(mkMsg(ID.T_UNREAD, `${TESTRUNID}_m_unread_${i}`, { pending: ['admin'], read_by: ['user'] }));
  }
  // T_OTHER (assigned to agent1 ONLY) gets ONE inbound message so the chat-screen message-INPUT renders
  // (chat HTML:396 gates it on currentIssueChat.length!=0) when agent0 opens it → CS-08 can attempt a send
  // and hit the assign-gate alert. Additive: a message on the agent1 ticket does NOT change CS-12 (which
  // asserts row presence by issueno) nor any agent0 count. pending:['user'] so it never inflates unread.
  await db.collection('clientissue').doc(ID.T_OTHER).collection('messages').doc(`${TESTRUNID}_m_other_0`)
    .set(mkMsg(ID.T_OTHER, `${TESTRUNID}_m_other_0`));

  return {
    TESTRUNID, ID, PF, EMAIL, CATEGORY, CHAT_CONFIG_ID, COUNTER_START,
    counts: { tickets: 9, openInCategory: 8, closedInCategory: 1, assignedToAgent0: 8, unreadMsgs: 2 },
  };
}

// Collections this seed writes (for teardown). NOTE: `counters` is intentionally NOT swept (shared app
// doc, just reset on seed). `clientissue` has no soft-delete field in the app → testrunid-scoped delete.
const SEEDED = [
  'clientissue', 'chat config',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other agents' runs are untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownSupport() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Also delete the messages subcollections of any seeded clientissue docs (CFs create them on create).
  // Best-effort: list seeded ticket ids and purge their `messages` subcollection.
  for (const key of Object.keys(ID)) {
    if (key === 'COUNTER') continue;
    const ticketId = ID[key];
    try {
      const msgs = await db.collection('clientissue').doc(ticketId).collection('messages').get();
      for (const m of msgs.docs) await m.ref.delete().catch(() => {});
    } catch (_) { /* doc may not exist */ }
  }
  // Delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = {
  TESTRUNID, ID, PF, EMAIL, CATEGORY, CHAT_CONFIG_ID, COUNTER_START, ROUTES, SEEDED,
  seedSupport, teardownSupport,
};

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedSupport(); console.log('[seed-support] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID, 'category=', r.CATEGORY); }
    else if (mode === '--teardown') { const n = await teardownSupport(); console.log('[seed-support] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-support.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
