// comms.ts — actors, login, and the per-test external/prod stub installer for the Communication
// Center / Notifications / Chat suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/
// Wati/email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no comms screen
// can hit a real production Cloud Function (sendBatchEmail / Postmark prod URLs) or open a real Zoom/
// OpenVidu window. The firewall blocks prod HTTPS CF URLs; the test then asserts the Firestore state
// the app/CF wrote on the TEST project (anti-circular).
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.COMM_RUNID || 'comm';
export const PASSWORD = 'Test!1234';

/** Seeded comms actors (seed-comms.js roster). */
export const commsActors = {
  admin: `admin+${RUN}@example.com`,           // roles {admin} — comms super-role
  chatadmin: `chatadmin+${RUN}@example.com`,   // roles {chatxadmin, admin} — chat moderation gate
  staff: `staff+${RUN}@example.com`,           // roles {eventcoordinator} — NON-chatxadmin staffer
  participant0: `participant0+${RUN}@example.com`,
  participant1: `participant1+${RUN}@example.com`,
};

/** Seeded profileids (for asserting app-written refs / oracle inputs). */
export const commsProfileIds = {
  admin: `${RUN}_pf_admin`,
  chatadmin: `${RUN}_pf_chatadmin`,
  staff: `${RUN}_pf_staff`,
  participant0: `${RUN}_pf_p0`,
  participant1: `${RUN}_pf_p1`,
};

/** Seeded auth uids (supportchat.members + message sender_uid are AUTH UIDs, per recon). */
export const commsUids = {
  admin: `${RUN}_u_admin`,
  chatadmin: `${RUN}_u_chatadmin`,
  staff: `${RUN}_u_staff`,
  participant0: `${RUN}_u_p0`,
  participant1: `${RUN}_u_p1`,
};

/** Seeded deterministic doc ids the specs assert against (kept in sync with seed-comms.js ID). */
export const commsIds = {
  NR_ORACLE: `${RUN}_nr_oracle`,
  NR_CF: `${RUN}_nr_cf`,
  ZOOM_DONE: `${RUN}_zoom_completed`,
  ZOOM_FAIL: `${RUN}_zoom_failed`,
  CHAT_GROUP: `${RUN}_chat_group`,
  CHAT_CHANNEL: `${RUN}_chat_channel`,
  OW_TEMPLATE: `${RUN}_oneway_tmpl`,
  EMAIL_APPROVED: `${RUN}_email_approved`,
  EMAIL_PENDING: `${RUN}_email_pending`,
  EMAIL_CF: `${RUN}_email_cf`,
  EMAIL_ARCHIVE_CF: `${RUN}_email_archive_cf`,
  NOTIF_LOG: `${RUN}_notif_log`,
};

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installCommsStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded comms super-role admin. */
export async function loginAsCommsAdmin(page: Page): Promise<void> {
  await loginAs(page, commsActors.admin, PASSWORD);
}

/** Log in as the seeded chat-admin (chatxadmin + admin). */
export async function loginAsChatAdmin(page: Page): Promise<void> {
  await loginAs(page, commsActors.chatadmin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the chat group's last_* fields back to a stable PRECONDITION (so the send test is order- and
 * re-run-independent). This is a PRECONDITION write only — the send test asserts the message the APP
 * RENDERED from its own Firestore stream, never this reset value (anti-circularity).
 */
export async function resetChatGroup(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('supportchat').doc(commsIds.CHAT_GROUP).set(
    { isdelete: false, last_message: 'Seeded last message', last_pending: [] }, { merge: true },
  );
}

/**
 * Reset the CF-side-effect notificationrecord (CN-06) back to its un-processed PRECONDITION so a re-run
 * observes the CF flip again. Precondition only — the test asserts the value the CF WROTE (success:true).
 */
export async function resetNotificationCfDoc(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('notificationrecord').doc(commsIds.NR_CF).set(
    { success: false, profilesuccess: [], profilefailed: [] }, { merge: true },
  );
}

const RUNID = RUN; // local alias for the doc shapes below

/**
 * (Re)create the EMAIL_ARCHIVE_CF doc to (re)fire the `sendBatchEmailTest` onCreate trigger (CN-05).
 * Delete-then-set with the same precondition shape (status:'created', profileid:[p0,p1]). Also pre-clears
 * any prior `email logs` rows for this archive so the count assertion starts from zero. PRECONDITION only —
 * the test asserts the CF-COMPUTED `email logs` fan-out count, never a value the test wrote.
 */
export async function resetEmailArchiveCf(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  // clear prior CF output (natural key — these carry no testrunid)
  const prior = await db.collection('email logs').where('emailarchiveid', '==', commsIds.EMAIL_ARCHIVE_CF)
    .get().catch(() => ({ docs: [] as any[] }));
  for (const d of prior.docs) await d.ref.delete().catch(() => {});
  await db.collection('email archive').doc(commsIds.EMAIL_ARCHIVE_CF).delete().catch(() => {});
  await db.collection('email archive').doc(commsIds.EMAIL_ARCHIVE_CF).set({
    docid: commsIds.EMAIL_ARCHIVE_CF, broadcastname: `Seeded Broadcast ${RUNID}`,
    profileid: [commsProfileIds.participant0, commsProfileIds.participant1],
    templateid: `Approved Email ${RUNID}`, subject: 'Test Subject', body: '<p>Hello</p>', notes: '',
    status: 'created', createdby: commsUids.admin, date: T.fromMillis(Date.now() - 3600e3),
    testrunid: RUNID, _testdata: true,
  });
}

/**
 * Reset the EMAIL_CF email-templates doc to its pre-validate PRECONDITION (CN-13): pending+unvalidated,
 * status 'created'. The test then flips templatevalidated:true (the validate action) and asserts the CF
 * WROTE postmarkstatus:'approved'. Precondition only.
 */
export async function resetEmailTemplateCf(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('email templates').doc(commsIds.EMAIL_CF).set(
    { postmarkstatus: 'pending', templatevalidated: false, templatestatus: 'created', active: false },
    { merge: true },
  );
}
