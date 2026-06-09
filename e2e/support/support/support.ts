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

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installSupportStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded primary chatxadmin agent. */
export async function loginAsAgent(page: Page): Promise<void> {
  await loginAs(page, supActors.agent0, PASSWORD);
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
