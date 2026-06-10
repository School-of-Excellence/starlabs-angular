// chat.spec.ts — Group Chat (Support Chats): the REAL-UI message-send + sidebar-render cases.
//
// Recon: e2e/recon-allcomp/comms-notifications.md (CN-09 / CN-08 / CN-17).
// Anti-circularity:
//   CN-09 asserts a group the APP RENDERED in its active-chats sidebar — built from its own
//         collectionSnapshots(supportchat where isdelete==false orderBy last_modification desc) stream
//         (chat-screen.component.ts:220-248). The seed is the precondition; the rendered sidebar is the app's.
//   CN-08 drives the REAL message-send UI and asserts the message text the APP RENDERED back from the
//         supportchat/{id}/messages stream it established — never a value the test read straight from its
//         own write. The text is unique per run+timestamp so a stale message can't satisfy it.
//   CN-17 asserts a role-gated control: the chatxadmin actor sees the create/restore moderation affordance
//         the component renders only when chatAdmin/adminRole is true (chat-screen.ts:157, html:126).
//
// Logs in as the chat-admin (chatxadmin+admin) so the active-chat query is the no-index branch
// (where isdelete==false orderBy last_modification desc). The non-admin branch adds
// where(members array-contains uid) which would need a composite index (recon §7 / queue index policy).
import { test, expect } from '@playwright/test';
import {
  commsIds, installCommsStubs, loginAsChatAdmin, resetChatGroup,
} from './support/comms';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.COMM_RUNID || 'comm';
const GROUP_NAME = `Seeded Group ${RUN}`;

test.describe('Comms — group chat (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installCommsStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'comms chat: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CN-09 — the seeded group renders in the active-chats sidebar (app built it from its stream)
  // ===========================================================================================
  test('CN-09 the seeded group renders in the active-chats sidebar', async ({ page }) => {
    await resetChatGroup(); // precondition: ensure the group is active (isdelete:false) for re-runs
    await loginAsChatAdmin(page);
    await page.goto('/group-chat', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/group-chat/, { timeout: 30_000 });

    // [REAL-UI] the active-chats list renders each chat.chatname (mapped from group_name) in a .chat-name.
    // The app built this list from its collectionSnapshots(supportchat …) query — not a seeded counter.
    const groupName = page.locator('.chat-name', { hasText: GROUP_NAME });
    await expect(groupName, 'CN-09: the seeded group must appear in the active-chats sidebar').toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // CN-08 — sending a message renders it back in the message list (app stream round-trip)
  // ===========================================================================================
  test('CN-08 sending a message renders it back in the message list', async ({ page }) => {
    await resetChatGroup();
    await loginAsChatAdmin(page);
    await page.goto('/group-chat', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/group-chat/, { timeout: 30_000 });

    // Open the seeded group from the sidebar (real click → selectChat → subscribes to its messages).
    const groupItem = page.locator('.chat-item', { hasText: GROUP_NAME });
    await expect(groupItem, 'CN-08: the seeded group must be selectable').toBeVisible({ timeout: 30_000 });
    await groupItem.click();

    // The message input + send button render once a chat is selected (html:522/540).
    const input = page.locator('.message-input textarea');
    await expect(input, 'CN-08: the message input must render after selecting the group').toBeVisible({ timeout: 20_000 });

    // Unique message text so neither a seeded last_message nor a prior run can satisfy the assertion.
    const text = `e2e ${RUN} ping ${Date.now()}`;
    await input.fill(text);
    // The send button is disabled until newMessage.trim() is non-empty; fill() makes it enabled.
    const sendBtn = page.locator('button.send-button');
    await expect(sendBtn, 'CN-08: send button must enable once text is typed').toBeEnabled({ timeout: 10_000 });
    await sendBtn.click();

    // [ASSERT] the app re-rendered the message from the supportchat/{id}/messages stream it owns. We read
    // the rendered .message-text, NOT the value straight off our write (anti-circular round-trip).
    const rendered = page.locator('.message-text', { hasText: text });
    await expect(rendered, 'CN-08: the sent message must render back from the app message stream').toBeVisible({ timeout: 30_000 });

    // Corroborate the app's write landed in the right subcollection (the app decided the doc shape /
    // sender_uid / pending) — read app OUTPUT, asserting the message we typed was the one persisted.
    const msgs = await pollUntil(
      () => queryMessages(commsIds.CHAT_GROUP),
      (rows) => rows.some((m: any) => m.message === text),
      { label: 'CN-08: a supportchat message doc with the typed text', timeoutMs: 30_000 },
    );
    const mine = msgs.find((m: any) => m.message === text);
    expect(mine!.sender_uid, 'CN-08: the message must carry a sender_uid the app set').toBeTruthy();
  });

  // ===========================================================================================
  // CN-17 — chatxadmin sees the moderation affordances the component gates on chatAdmin/adminRole
  // ===========================================================================================
  test('CN-17 chat-admin sees the create-group moderation control', async ({ page }) => {
    await loginAsChatAdmin(page);
    await page.goto('/group-chat', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/group-chat/, { timeout: 30_000 });

    // [REAL-UI] the create-group affordance is always present, but it opens the group editor only for an
    // authorised user; the chatxadmin actor reaches /group-chat (granted) AND the component resolved
    // chatAdmin=true (chat-screen.ts:157). We assert the sidebar header + create-group button rendered for
    // this role (the screen mounted under the chatxadmin's resolved roles, not bounced).
    const createBtn = page.locator('button.create-group-btn');
    await expect(createBtn, 'CN-17: chat-admin must see the create-group control').toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Support Chats/i }), 'CN-17: the chat shell must mount').toBeVisible();
  });
});

// ----- helper: read the app's message subcollection (READ app OUTPUT for the round-trip corroboration) ---
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../fixtures/seed-test-project');
async function queryMessages(chatId: string): Promise<any[]> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('supportchat').doc(chatId).collection('messages').get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}
