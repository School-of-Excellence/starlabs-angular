// chat.spec.ts — Customer Support chat screen (standalone route /customersupportdashboard/ticket/:id/:no):
// unread-badge render, send-message, close-ticket, flag, unflag. Every case drives the REAL Angular chat
// screen and asserts a value the APP COMPUTED (unread count) or WROTE (message doc / status / flag) vs the
// KNOWN seeded pre-state — never a value the test itself wrote.
//
// Recon: e2e/recon-allcomp/customer-support.md (CS-06 / CS-07 / CS-09 / CS-10 / CS-11).
// The standalone chat route loads everything from Firestore via loadDataForNewTab() (chat-screen ts:257),
// so it is drivable without the dashboard tab host. loggedinprofile_id == roles['profile_ref'].id == the
// seeded profileid (authguard.getRoles → users_roles.profile_ref → profile_data doc id), which is the value
// seeded into each ticket's `assign` — so the send/close/flag gates (assign.includes(loggedinprofile_id))
// admit the logged-in agent.
import { test, expect } from '@playwright/test';
import {
  supProfileIds, installSupportStubs, loginAsAgent, resetTicket,
} from './support/support';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.SUP_RUNID || 'sup';
const T = (id: string) => `${RUN}_${id}`;

/** Navigate the standalone chat-screen route for a seeded ticket and wait for it to mount. */
async function openTicket(page: import('@playwright/test').Page, ticketId: string, issueno: number) {
  await page.goto(`/customersupportdashboard/ticket/${ticketId}/${issueno}`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/customersupportdashboard\/ticket/, { timeout: 30_000 });
  // The left "Details" card (status + flag) renders once editloading flips false — proves the screen mounted.
  await expect(page.locator('.status-toggle, .status-btn').first(), 'chat screen Details card must mount')
    .toBeVisible({ timeout: 30_000 });
}

test.describe('Customer Support — chat screen (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installSupportStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'support chat: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CS-06 — the chat screen renders the app-computed UNREAD badge (2 seeded admin-pending messages)
  // ===========================================================================================
  test('CS-06 chat screen shows the app-computed unread count for seeded admin-pending messages', async ({ page }) => {
    // Pre-state (anti-circular): the seeded T_UNREAD ticket has EXACTLY 2 messages with pending:['admin'].
    // (countWhere builds db().collection(path); the Admin SDK accepts an odd-segment subcollection path.)
    expect(await countWhere(`clientissue/${T('T_unread')}/messages`, []),
      'CS-06: seeded T_unread has 2 messages').toBe(2);

    await loginAsAgent(page);
    await openTicket(page, T('T_unread'), 5109);

    // [REAL-UI + ASSERT] the component streams the messages subcollection and computes unreadcount =
    // count of messages whose `pending` array-contains 'admin' (chat-screen ts:504). It renders
    // "<unreadcount> Unread" in the .unread divider. We assert the APP-COMPUTED 2, not the seed.
    const unreadBadge = page.locator('.unread');
    await expect(unreadBadge, 'CS-06: the unread badge must render (app-computed)').toBeVisible({ timeout: 30_000 });
    await expect(unreadBadge, 'CS-06: app-computed unread count == 2 seeded admin-pending messages')
      .toHaveText(/\b2\s*Unread\b/i);
  });

  // ===========================================================================================
  // CS-07 — sending a message writes a new message doc AND flips the ticket chatstatus to "Responded"
  // ===========================================================================================
  test('CS-07 sending a message writes a new message doc and sets chatstatus "Responded"', async ({ page }) => {
    // Precondition reset (idempotent): T_send is Open, assigned to agent0, chatstatus 'New', and KEEPS its
    // one seeded message (so the message-input renders — chat HTML gates it on currentIssueChat.length!=0).
    await resetTicket(T('T_send'), {
      chatstatus: 'New', status: { status: 'Open', date: new Date(), editedBy: supProfileIds.agent0 },
      assign: [supProfileIds.agent0],
    });
    const beforeCount = await countWhere(`clientissue/${T('T_send')}/messages`, []);
    expect(beforeCount, 'CS-07: T_send starts with its seeded messages').toBeGreaterThanOrEqual(1);

    await loginAsAgent(page);
    await openTicket(page, T('T_send'), 5108);

    // [REAL-UI] type into the message textarea and click the send (mat-mini-fab) button.
    const box = page.locator('textarea[formControlName="message"]');
    await expect(box, 'CS-07: message input renders (ticket Open + assigned + has messages)').toBeVisible({ timeout: 30_000 });
    const unique = `e2e-send-${Date.now()}`;
    await box.fill(unique);
    // the send button is the mat-mini-fab whose icon is "send" (chat HTML:435)
    await page.locator('button:has(mat-icon:text-is("send"))').click();

    // [ASSERT] the app's writeBatch added a new message doc (so the count grew) AND its updateDoc set the
    // parent ticket chatstatus to "Responded" (chat-screen ts:1134). Both are the PRODUCT's own writes.
    await pollUntil(
      () => countWhere(`clientissue/${T('T_send')}/messages`, []),
      (n) => n > beforeCount,
      { label: 'CS-07: a new message doc was written by the app', timeoutMs: 30_000 },
    );
    await pollUntil(
      () => getDoc('clientissue', T('T_send')),
      (d) => !!d && d.chatstatus === 'Responded',
      { label: 'CS-07: ticket chatstatus → "Responded" (app-written)', timeoutMs: 30_000 },
    );
  });

  // ===========================================================================================
  // CS-09 — closing a ticket writes status.status:"Closed" (the app's own write, vs seeded "Open")
  // ===========================================================================================
  test('CS-09 closing an open ticket writes status.status "Closed"', async ({ page }) => {
    // Precondition reset: T_resp is Open, assigned to agent0, with a message so the closing flow can run.
    await resetTicket(T('T_resp'), {
      chatstatus: 'Responded', status: { status: 'Open', date: new Date(), editedBy: supProfileIds.agent0 },
      assign: [supProfileIds.agent0],
    });
    // ensure at least one message exists (updateStatus('Closed') sends a closing message first; the screen
    // path is robust either way, but a prior message makes the chat panel render fully).
    const before = await getDoc('clientissue', T('T_resp'));
    expect(before!.status, 'CS-09: T_resp starts Open').toMatchObject({ status: 'Open' });

    await loginAsAgent(page);
    await openTicket(page, T('T_resp'), 5102);

    // [REAL-UI] click the "Closed" status button (chat HTML:149 → updateStatus('Closed')). From Open this
    // sends the seeded closing message then writes the Closed status sub-object.
    await page.locator('button.status-btn.closed-btn').click();

    // [ASSERT] the app's updateDoc wrote status.status == "Closed" (chat-screen ts:1063). We assert the
    // shape the APP chose (status sub-object) against the seeded prior "Open" — never a value we wrote.
    const after = await pollUntil(
      () => getDoc('clientissue', T('T_resp')),
      (d) => !!d && (d.status as { status?: string })?.status === 'Closed',
      { label: 'CS-09: ticket status.status → "Closed" (app-written)', timeoutMs: 30_000 },
    );
    expect((after!.status as { editedBy?: string }).editedBy, 'CS-09: editedBy is the logged-in agent profileid')
      .toBe(supProfileIds.agent0);
  });

  // ===========================================================================================
  // CS-10 — flagging a ticket writes flag:true + flagdata.severity (app-written, vs seeded flag:false)
  // ===========================================================================================
  test('CS-10 flagging a ticket writes flag:true and the chosen severity', async ({ page }) => {
    // Precondition reset (anti-circular): T_unflag starts UNFLAGGED.
    await resetTicket(T('T_unflag'), { flag: false, flagdata: null,
      status: { status: 'Open', date: new Date(), editedBy: supProfileIds.agent0 }, assign: [supProfileIds.agent0] });
    expect((await getDoc('clientissue', T('T_unflag')))!.flag, 'CS-10: T_unflag starts unflagged').toBe(false);

    await loginAsAgent(page);
    await openTicket(page, T('T_unflag'), 5105);

    // [REAL-UI] click "Flag This Ticket" → updateFlag() reveals the severity select (no confirm dialog),
    // pick a severity, click "Confirm Flag" → confirmFlag() writes flag:true + flagdata.
    await page.locator('button.flag-btn.unflagged').click();
    const severity = page.getByRole('combobox', { name: /Severity/i });
    await expect(severity, 'CS-10: severity select appears after Flag click').toBeVisible({ timeout: 15_000 });
    // force: the floating <mat-label> overlays the combobox trigger and intercepts a normal click.
    await severity.click({ force: true });
    await page.getByRole('option', { name: 'Escalation' }).click();
    await page.getByRole('button', { name: /Confirm Flag/i }).click();

    // [ASSERT] the app's updateDoc wrote flag:true with the chosen severity (chat-screen ts:646). App-written
    // values vs the seeded flag:false.
    const after = await pollUntil(
      () => getDoc('clientissue', T('T_unflag')),
      (d) => !!d && d.flag === true,
      { label: 'CS-10: ticket flag → true (app-written)', timeoutMs: 30_000 },
    );
    expect((after!.flagdata as { severity?: string }).severity, 'CS-10: app wrote the chosen severity').toBe('Escalation');
    expect((after!.flagdata as { flaggedby?: string }).flaggedby, 'CS-10: flaggedby is the logged-in agent profileid')
      .toBe(supProfileIds.agent0);
  });

  // ===========================================================================================
  // CS-11 — unflagging a flagged ticket writes flag:false (the app's own write, vs seeded flag:true)
  // ===========================================================================================
  test('CS-11 unflagging a flagged ticket writes flag:false', async ({ page }) => {
    // Precondition reset (anti-circular): T_flag starts FLAGGED.
    await resetTicket(T('T_flag'), {
      flag: true, flagdata: { severity: 'Normal', flaggedby: supProfileIds.agent0, time: new Date() },
      status: { status: 'Open', date: new Date(), editedBy: supProfileIds.agent0 }, assign: [supProfileIds.agent0],
    });
    expect((await getDoc('clientissue', T('T_flag')))!.flag, 'CS-11: T_flag starts flagged').toBe(true);

    await loginAsAgent(page);
    await openTicket(page, T('T_flag'), 5104);

    // [REAL-UI] click "Unflag Ticket" → updateFlag() opens a window.confirm; accept it → updateDoc flag:false.
    page.once('dialog', (d) => d.accept());
    await page.locator('button.flag-btn.flagged').click();

    // [ASSERT] the app's updateDoc wrote flag:false (chat-screen ts:622). App-written vs seeded flag:true.
    await pollUntil(
      () => getDoc('clientissue', T('T_flag')),
      (d) => !!d && d.flag === false,
      { label: 'CS-11: ticket flag → false (app-written)', timeoutMs: 30_000 },
    );
  });
});
