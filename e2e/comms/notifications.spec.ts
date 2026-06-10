// notifications.spec.ts — Communication Center / Notifications: the harness validators for the whole
// comms suite. These exercise REAL screens with ANTI-CIRCULAR assertions and need NO composite index
// (single-field range / orderBy queries only).
//
// Recon: e2e/recon-allcomp/comms-notifications.md (CN-12 / CN-10 / CN-11 / CN-06).
// Anti-circularity:
//   CN-12 (ORACLE) asserts the receivedRate the APP COMPUTED ("66.67") from a KNOWN-SEEDED ratio
//         (profilesuccess 2 / profileid 3) — the seed provides the inputs, the app's
//         (2/3*100).toFixed(2) is the asserted output (notification-record.component.ts:199-201).
//   CN-10/11 assert the rows/filtering the APP RENDERED from its own getDocs(zoom recordings backup)
//         stream — never a value the test wrote to a counter.
//   CN-06 (CF-SIDEEFFECT, GATED) asserts the value the notifyMobileApp CF WROTE (success:true) — never
//         a value the test wrote (the seed sets success:false; the CF flips it).
import { test, expect } from '@playwright/test';
import {
  commsActors, commsIds, installCommsStubs, loginAsCommsAdmin, resetNotificationCfDoc,
} from './support/comms';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.COMM_RUNID || 'comm';

test.describe('Comms — notification record + zoom dashboard (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installCommsStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'comms notifications: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CN-12 (ORACLE) — notification record renders the app-computed receivedRate (2/3 → "66.67")
  // ===========================================================================================
  test('CN-12 notification record computes receivedRate 66.67 from a seeded 2/3 success ratio', async ({ page }) => {
    test.setTimeout(90_000); // the test project's notificationrecord is large; the component getDocs-loads it all
    await loginAsCommsAdmin(page);
    await page.goto('/notificationrecord', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/notificationrecord/, { timeout: 30_000 });

    // [REAL-UI] the component subscribes to notificationrecord where(date in last-7-days) orderBy(date desc)
    // and computes receivedRate per row. The cloud test project holds thousands of rows in that window, so
    // the MatTable paginates and the oracle row sits off page 1. Use the component's own Search box to
    // client-filter the loaded dataset down to the unique oracle title (the app's filter), then assert.
    const search = page.getByPlaceholder('Search...');
    await expect(search, 'CN-12: the Search box must render').toBeVisible({ timeout: 30_000 });
    await search.fill(`Seeded Oracle Notification ${RUN}`);
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Seeded Oracle Notification ${RUN}` });
    await expect(row, 'CN-12: the seeded oracle notificationrecord row must render (after search filter)').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the receivedRate cell shows the value the component computed (2/3*100).toFixed(2) = "66.67".
    // This is the app's computation over KNOWN-SEEDED inputs — NOT a value the test wrote to a counter.
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    expect(rowText, `CN-12: receivedRate must be the app-computed 66.67%. Row="${rowText}"`).toContain('66.67');
    // The "Sent to" cell also reflects the app reading the seeded arrays (✓2 / Total 3) — a second
    // app-rendered, non-tautological signal on the same row.
    expect(rowText, 'CN-12: the Sent-to cell must show the seeded success count (2)').toMatch(/\b2\b/);
  });

  // ===========================================================================================
  // CN-10 — zoom recording dashboard renders the seeded meeting rows (app-rendered from its query)
  // ===========================================================================================
  test('CN-10 zoom dashboard renders the seeded meeting rows', async ({ page }) => {
    await loginAsCommsAdmin(page);
    await page.goto('/zoom-recording-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/zoom-recording-dashboard/, { timeout: 30_000 });

    // [REAL-UI] ngOnInit getDocs(zoom recordings backup, orderBy timestamp desc) → MatTable rows. The
    // default form date-range is today..today; the seeded rows carry startTime=now so they pass the filter.
    const doneRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Completed Meeting ${RUN}` });
    const failRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Failed Meeting ${RUN}` });
    await expect(doneRow, 'CN-10: the seeded completed meeting must render').toBeVisible({ timeout: 30_000 });
    await expect(failRow, 'CN-10: the seeded failed meeting must render').toBeVisible({ timeout: 30_000 });

    // The host email cell is the app rendering the seeded field (a non-tautological per-row signal).
    expect((await doneRow.innerText())).toContain(commsActors.admin);
  });

  // ===========================================================================================
  // CN-11 — zoom status filter "Completed" shows only the matching row (the app's filterPredicate)
  // ===========================================================================================
  test('CN-11 zoom status filter "Completed" hides the failed row (app filterPredicate)', async ({ page }) => {
    await loginAsCommsAdmin(page);
    await page.goto('/zoom-recording-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/zoom-recording-dashboard/, { timeout: 30_000 });

    const doneRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Completed Meeting ${RUN}` });
    const failRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Failed Meeting ${RUN}` });
    await expect(doneRow, 'CN-11: completed row visible before filtering').toBeVisible({ timeout: 30_000 });
    await expect(failRow, 'CN-11: failed row visible before filtering').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the Status mat-select and pick "Completed" → filterPredicate keeps status=='completed'.
    // Material gotcha: the floating <mat-label> intercepts a normal click on the combobox → click({force}).
    const statusSelect = page.getByRole('combobox', { name: /Status/i });
    await expect(statusSelect, 'CN-11: the Status filter must render').toBeVisible({ timeout: 20_000 });
    await statusSelect.click({ force: true });
    await page.getByRole('option', { name: /^Completed$/i }).click();

    // [ASSERT] the app's filterPredicate removed the failed row and kept the completed one.
    await expect(failRow, 'CN-11: the failed row must disappear under the Completed filter').toBeHidden({ timeout: 20_000 });
    await expect(doneRow, 'CN-11: the completed row must remain under the Completed filter').toBeVisible();
  });

  // ===========================================================================================
  // CN-06 (CF-SIDEEFFECT, GATED) — notifyMobileApp flips notificationrecord.success false → true.
  //
  // GATED behind COMM_CF=1 because it depends on the `notifyMobileApp` trigger being DEPLOYED to the
  // cloud test project (slabs-queue-e2e-exdcz). The queue suite's deployed triggers are verified there;
  // the comms/notification triggers are NOT verified from this repo (CF source lives in a separate repo).
  // Skipped on the emulator (functions emulator does not deliver these onCreate triggers — cf-sideeffects
  // spec convention) and by default in CI so an undeployed CF cannot break the serial orchestrator run.
  // When the trigger IS confirmed deployed, run with COMM_CF=1 to assert the CF-written value.
  // ===========================================================================================
  test('CN-06 notifyMobileApp writes success:true back onto a seeded notificationrecord', async ({ page: _page }) => {
    test.skip(process.env.COMM_CF !== '1', 'CF-side-effect gated: set COMM_CF=1 once notifyMobileApp is confirmed deployed to the test project.');
    test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, 'EMULATOR LIMITATION: the functions emulator does not deliver the onCreate notificationrecord trigger.');
    test.setTimeout(120_000);

    // Precondition (anti-circular): the seeded CF doc starts success:false. The CF — not the test — flips it.
    await resetNotificationCfDoc();
    const before = await getDoc('notificationrecord', commsIds.NR_CF);
    expect(before, 'CN-06: the seeded CF notificationrecord must exist').toBeTruthy();
    expect(before!.success, 'CN-06: it must start un-processed (success:false)').toBe(false);

    // Re-create the doc to (re)fire the onCreate trigger deterministically: delete then set with the same
    // precondition shape. (notifyMobileApp is onCreate — a merge-update would not re-trigger it.)
    const admin = require('../fixtures/seed-test-project').initAdmin();
    const db = admin.firestore();
    await db.collection('notificationrecord').doc(commsIds.NR_CF).delete();
    await db.collection('notificationrecord').doc(commsIds.NR_CF).set({
      docid: commsIds.NR_CF, title: `Seeded CF Notification ${RUN}`, message: 'CF body',
      notificationtype: 'General', profileid: [`${RUN}_pf_p0`], success: false,
      date: admin.firestore.Timestamp.fromMillis(Date.now() - 2 * 3600e3),
      testrunid: RUN, _testdata: true,
    });

    // [ASSERT] notifyMobileApp updated the doc with success:true (CF:519-529) — the value the CF computed.
    const after = await pollUntil(
      () => getDoc('notificationrecord', commsIds.NR_CF),
      (d) => !!d && d.success === true,
      { label: 'CN-06: notificationrecord NR_CF → success:true (CF write)', timeoutMs: 90_000, intervalMs: 1500 },
    );
    expect(Array.isArray(after!.profilesuccess) || Array.isArray(after!.profilefailed),
      'CN-06: the CF must write back profilesuccess[]/profilefailed[]').toBeTruthy();
  });
});

// ===========================================================================================
// Route-mount smoke — every comms route mounts for the super-role admin (guard admits, no bounce to
// /login, the lazy chunk resolves). Proves the dashboard route-grants seeded. Skips assertNoFatal (the
// broad /communication dashboard reads many collections + benign stubbed-external noise) and only
// asserts the route does not bounce to /login (recon: authGuard denies ungranted routes → root/login).
// ===========================================================================================
test.describe('Comms — route-mount smoke (guard admits super-role admin)', () => {
  const ROUTES = [
    '/communication', '/email-templates', '/zoom-recording-dashboard',
    '/notificationlog', '/notificationrecord', '/group-chat', '/onewaytemplates',
  ];
  test('every seeded comms route mounts (no /login bounce)', async ({ page }) => {
    await installCommsStubs(page);
    await loginAsCommsAdmin(page);
    const bounced: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800); // bounded settle (networkidle hangs on camera/iframe/stream routes)
      const url = page.url();
      if (/\/login/.test(url)) bounced.push(`${route} -> ${url}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
