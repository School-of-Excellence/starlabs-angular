// support.ts — actors, login, and the per-test external/prod stub installer for the Customer Support suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/Wati/
// email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no support screen can
// hit a real PRODUCTION Cloud Function or open a real window. Customer Support's external integrations
// (Slack + Watson + SalesCRM) all live in CLOUD FUNCTIONS (axios from clientissue.js), NOT the Angular
// layer — the browser-level firewall cannot block those server-side calls. In the TEST project
// commonService.production is false, so those CFs target the *-test-19 projects (NOT production) and
// merely fail-and-log; we never drive a cross-PROJECT production write. See blockers in the suite report.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.SUP_RUNID || 'sup';
export const PASSWORD = 'Test!1234';

/** Seeded Customer Support actors (seed-support.js roster). */
export const supActors = {
  agent0: `admin+${RUN}@example.com`,         // primary chatxadmin agent (owns most tickets)
  agent1: `agent1+${RUN}@example.com`,        // 2nd chatxadmin agent (owns the "not mine" ticket)
  client: `participant0+${RUN}@example.com`,  // the ticket client
};

/** Seeded profileids (for asserting app-written assign / review keys; this is the value the app
 *  resolves as loggedinprofile_id == roles['profile_ref'].id == the profileid). */
export const supProfileIds = {
  agent0: `${RUN}_pf_agent0`,
  agent1: `${RUN}_pf_agent1`,
  client: `${RUN}_pf_client`,
};

/** Run-unique category seeded into `chat config` + every seeded ticket (the CS-02 count oracle). */
export const SUP_CATEGORY = `TEST Support ${RUN}`;

/** The CLIENT's display name (seed step 3 overrides profile_data.name to this). The AddIssue dialog's
 *  Client-Name / Issue-Reported-By options render `profile_data.name` — so this, NOT the email, is the
 *  option label to pick for the client. Staff option labels remain their email (seedAuthChain name=email). */
export const SUP_CLIENT_NAME = `Client ${RUN}`;

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installSupportStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded primary chatxadmin agent. */
export async function loginAsAgent(page: Page): Promise<void> {
  await loginAs(page, supActors.agent0, PASSWORD);
}

/** Log in as the seeded PARTICIPANT (the ticket client) — a NON-chatxadmin user NOT in any support
 *  route grant. Used by CS-17 (access-denied). Auth succeeds (real user) so loginAs resolves off /login;
 *  the route guard then denies in-page via the "Access denied" ConfirmComponent (auth.guard.ts:62). */
export async function loginAsClient(page: Page): Promise<void> {
  await loginAs(page, supActors.client, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset a seeded ticket back to a known PRECONDITION (so the mutation tests are order- and re-run-
 * independent). This is a PRECONDITION write only — the test asserts the value the APP writes on the
 * real click, never this reset value (anti-circularity).
 *
 * @param ticketId the clientissue doc id
 * @param fields   the precondition field set to merge (e.g. {flag:false}, {chatstatus:'New', status:{...}})
 */
export async function resetTicket(ticketId: string, fields: Record<string, unknown>): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('clientissue').doc(ticketId).set(fields, { merge: true });
}

/** Delete the `messages` subcollection of a seeded ticket (CS-07 precondition: known empty pre-state). */
export async function clearTicketMessages(ticketId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const msgs = await db.collection('clientissue').doc(ticketId).collection('messages').get();
  for (const m of msgs.docs) await m.ref.delete().catch(() => {});
}

/** Read the `counters/ticketCounter.currentNumber` (the seeded COUNTER_START base; CS-04 oracle floor). */
export async function getTicketCounter(): Promise<number> {
  const admin = seed.initAdmin();
  const snap = await admin.firestore().collection('counters').doc('ticketCounter').get();
  return (snap.data() || {}).currentNumber ?? 0;
}

/** Count notification logs under notifications/{profileId}/logs (CS-15 ticketMsgNotification oracle). */
export async function countNotificationLogs(profileId: string): Promise<number> {
  const admin = seed.initAdmin();
  const snap = await admin.firestore().collection('notifications').doc(profileId).collection('logs').get();
  return snap.size;
}

/**
 * Detect whether the `clientissue` create-trigger CFs (ticketCreated / ticketCreatedV2) are DEPLOYED on
 * the cloud test project. The deployed-CF set on slabs-queue-e2e-exdcz is calculateParticipantMode + the
 * *_to_pmd family + the queue CFs — the Customer-Support CFs in clientissue.js are NOT deployed there
 * (operator directive). We confirm at RUNTIME (not by assumption): write a throwaway clientissue doc and
 * watch for a CF-written side-effect (issueno set, or a `messages` subdoc created). Returns true iff a CF
 * fired within the window. Used to skip-guard the CF cases (CS-05/CS-15) with a real, documented reason.
 * Cleans up the probe doc + any CF-created messages so it never pollutes a count.
 */
export async function ticketCreateCFDeployed(timeoutMs = 12_000): Promise<boolean> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const id = `${RUN}_cfprobe_${Date.now()}`;
  await db.collection('clientissue').doc(id).set({
    id, clientid: supProfileIds.client, name: 'CF probe', issue: 'cf probe',
    category: SUP_CATEGORY, assign: [supProfileIds.agent0], peopleinvolved: [],
    chatstatus: 'New', status: { status: 'Open', date: T.now(), editedBy: supProfileIds.agent0 },
    reporteddate: T.now(), review: {}, mandatereview: {}, flag: false,
    _testdata: true, testrunid: `${RUN}_probe`,
  });
  const deadline = Date.now() + timeoutMs;
  let fired = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const d = (await db.collection('clientissue').doc(id).get()).data() || {};
    const msgs = await db.collection('clientissue').doc(id).collection('messages').get();
    if (d.issueno !== undefined || msgs.size > 0) { fired = true; break; }
  }
  // cleanup
  const msgs = await db.collection('clientissue').doc(id).collection('messages').get();
  for (const m of msgs.docs) await m.ref.delete().catch(() => {});
  await db.collection('clientissue').doc(id).delete().catch(() => {});
  return fired;
}
