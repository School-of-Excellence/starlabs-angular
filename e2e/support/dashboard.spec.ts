// dashboard.spec.ts — Customer Support dashboard: login+mount, app-computed metric/category counts,
// the Open filter card, and the "My Cases" assignment filter. Plus a route-mount smoke for the three
// support routes.
//
// Recon: e2e/recon-allcomp/customer-support.md (CS-01 / CS-02 / CS-03 / CS-12 / CS-17-style smoke).
// Anti-circularity: the dashboard streams `clientissue` and COMPUTES every metric card + the per-category
// open/close table from that stream (customer-support-dashboard.component.ts allCases() ts:333-462). We
// assert those APP-COMPUTED numbers against the KNOWN seeded shape — and we key the assertion on a
// RUN-UNIQUE category (`TEST Support <run>`) so PRODUCTION-leftover tickets (other categories) cannot
// pollute the count. The seed is the precondition; the rendered number is the app's own computation.
import { test, expect } from '@playwright/test';
import { supActors, supProfileIds, SUP_CATEGORY, installSupportStubs, loginAsAgent, resetTicket } from './support/support';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.SUP_RUNID || 'sup';
const T = (id: string) => `${RUN}_${id}`;

// Seeded shape (seed-support.js): 9 tickets all in SUP_CATEGORY — 8 Open, 1 Closed; 8 assigned to agent0.
const SEEDED_OPEN_IN_CATEGORY = 8;
const SEEDED_CLOSED_IN_CATEGORY = 1;

test.describe('Customer Support — dashboard counts & filters (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installSupportStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'support dashboard: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CS-01 — chatxadmin logs in and the dashboard MOUNTS (guard admits, content renders, no fatal)
  // ===========================================================================================
  test('CS-01 chatxadmin lands on the dashboard and it renders (no bounce, no console error)', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto('/customersupportdashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/customersupportdashboard/, { timeout: 30_000 });

    // [REAL-UI] the authGuard read the seeded `dashboard` route-config and ADMITTED the agent (chatxadmin
    // role + granted profileid). The dashboard content (the "Total" metric card) is the value that proves
    // the guard admitted AND the component mounted past its loading spinner.
    await expect(page.locator('.ticket-button .button-label', { hasText: /^Total$/ }))
      .toBeVisible({ timeout: 30_000 });
    // "All Tickets" / "Assigned to me" controls confirm the dashboard body (not a guard "Contact Admin" dialog).
    await expect(page.getByText('All Tickets')).toBeVisible();
    await expect(page.getByText('Assigned to me')).toBeVisible();
  });

  // ===========================================================================================
  // CS-02 — the per-category open/close counts the APP COMPUTED match the seeded run-unique category
  // ===========================================================================================
  test('CS-02 dashboard category table shows the app-computed open/close counts for the seeded category', async ({ page }) => {
    // Precondition reset (idempotent, anti-circular): restore the seeded open/closed SPLIT for the two
    // status-determining tickets so this count holds INDEPENDENT of the chat mutation specs (CS-09 closes
    // T_resp; alphabetical file order runs chat.spec before dashboard.spec). The COUNT is still computed
    // by the APP from its Firestore stream — we only reset the precondition rows, never assert a write.
    await resetTicket(T('T_resp'), { status: { status: 'Open', date: new Date(), editedBy: supProfileIds.agent0 } });
    await resetTicket(T('T_closed'), { status: { status: 'Closed', date: new Date(), editedBy: supProfileIds.agent0 } });

    await loginAsAgent(page);
    await page.goto('/customersupportdashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/customersupportdashboard/, { timeout: 30_000 });

    // The dashboard auto-loads ALL tickets on init (onDateChange → allCases, viewOfCases initially unset),
    // streams `clientissue`, and builds categoryCountMap[category] = {open,close} (ts:411/426). Find the
    // row for OUR run-unique category and read the open/close cells the APP computed from the stream.
    const catRow = page.locator('table.category-table tbody tr').filter({ hasText: SUP_CATEGORY });
    await expect(catRow, `CS-02: the seeded category "${SUP_CATEGORY}" row must render`).toBeVisible({ timeout: 30_000 });

    // [ASSERT] open/close counts = the seeded shape (8 open, 1 closed). Run-unique category ⇒ production
    // tickets can't contribute, so this is an EXACT app-computed-vs-known assertion (not a lower bound).
    const openCell = catRow.locator('td.open-count');
    const closeCell = catRow.locator('td.closed-count');
    await expect(openCell, 'CS-02: app-computed OPEN count for the seeded category').toHaveText(String(SEEDED_OPEN_IN_CATEGORY), { timeout: 15_000 });
    await expect(closeCell, 'CS-02: app-computed CLOSED count for the seeded category').toHaveText(String(SEEDED_CLOSED_IN_CATEGORY));

    // Cross-check: the global "Open" metric card (app-computed total open across ALL categories) is a
    // LOWER BOUND of our seeded opens (production may add more). Reads the rendered card value.
    const openCardValue = await page.locator('.ticket-button', { hasText: /Open/ }).locator('.countFontSize').first().innerText();
    expect(Number(openCardValue.trim()), `CS-02: global Open card (${openCardValue}) >= seeded opens`).toBeGreaterThanOrEqual(SEEDED_OPEN_IN_CATEGORY);
  });

  // ===========================================================================================
  // CS-03 — clicking the "Open" filter card narrows the table to ONLY open-status rows
  // ===========================================================================================
  test('CS-03 the Open filter card renders only open-status rows (no closed row visible)', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto('/customersupportdashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/customersupportdashboard/, { timeout: 30_000 });

    // Wait for the table to have streamed (the seeded New ticket's issueno is a stable marker).
    await expect(page.locator('table.native-table')).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] click the "Open" metric card → filterValues('tickets','Open') patches the filter form and
    // re-renders the open table. The app marks each rendered row with status-open / status-closed (HTML:409).
    await page.locator('.ticket-button', { hasText: /Open/ }).first().click();

    // [ASSERT] after the app re-filtered, ZERO rows carry the closed class, and at least our seeded opens show.
    await expect.poll(
      async () => page.locator('table.native-table tbody.table-body tr.status-closed').count(),
      { message: 'CS-03: no closed-status rows after the Open filter (app-rendered)', timeout: 15_000 },
    ).toBe(0);
    const openRows = await page.locator('table.native-table tbody.table-body tr.status-open').count();
    expect(openRows, 'CS-03: the app renders at least one open-status row').toBeGreaterThan(0);
  });

  // ===========================================================================================
  // CS-12 — the "Assigned To" filter narrows the table to one agent's tickets (app-computed, index-free)
  // ===========================================================================================
  // NOTE: the dashboard's "Assigned to me" tab (myCases()) issues `where(assign array-contains pid) +
  // orderBy(reporteddate desc)` (and a second peopleinvolved variant) — each needs a COMPOSITE index that
  // does NOT exist on the test project (and editing the shared firestore.indexes.json would race other
  // agents). So we exercise the SAME anti-circular intent via the index-free client-side "Assigned To"
  // filter (formfilter() filters the already-streamed all-tickets list by `assign`, ts:310 — no index).
  // The two myCases composite indexes are RETURNED in neededIndexes for the operator to enable later.
  test('CS-12 the "Assigned To" filter excludes a ticket assigned to a different agent', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto('/customersupportdashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/customersupportdashboard/, { timeout: 30_000 });
    await expect(page.locator('table.native-table')).toBeVisible({ timeout: 30_000 });

    // Sanity pre-state: with no filter, the agent1-only ticket (5107) IS present in the all-tickets stream.
    const search = page.locator('input[formControlName="search"]');
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('5107');
    await expect(
      page.locator('table.native-table tbody.table-body tr', { hasText: '5107' }),
      'CS-12: the agent1-only ticket (5107) is present before filtering',
    ).toBeVisible({ timeout: 15_000 });
    await search.fill('');

    // [REAL-UI] open the "Assigned To" multi-select and pick agent0 (option label = agent0's name).
    // force: the floating <mat-label> overlays the combobox trigger and intercepts a normal click.
    const assignSelect = page.getByRole('combobox', { name: /Assigned To/i });
    await assignSelect.click({ force: true });
    await page.getByRole('option', { name: supActors.agent0 }).click();
    // close the overlay so the table is interactable
    await page.keyboard.press('Escape');

    // [ASSERT] the app's client-side formfilter() recomputed the table keeping only tickets whose `assign`
    // includes agent0 — so the agent1-ONLY ticket (5107) is excluded, while an agent0 ticket (5101) remains.
    await search.fill('5101');
    await expect(
      page.locator('table.native-table tbody.table-body tr', { hasText: '5101' }),
      'CS-12: an agent0-assigned ticket (5101) survives the "Assigned To" filter',
    ).toBeVisible({ timeout: 15_000 });

    await search.fill('5107');
    await expect.poll(
      async () => page.locator('table.native-table tbody.table-body tr', { hasText: '5107' }).count(),
      { message: 'CS-12: the agent1-only ticket (5107) is excluded by the "Assigned To"=agent0 filter', timeout: 15_000 },
    ).toBe(0);
  });
});

// ===========================================================================================
// Route-mount smoke — every support route mounts for the chatxadmin agent (the data-driven guard
// admits, the screen renders its own content, no "Contact Admin"/"Access denied" guard dialog).
// Proves the dashboard route-grants seeded. NOTE: the guard does NOT redirect on deny — it opens a
// ConfirmComponent dialog and leaves the URL — so we assert the absence of that dialog, not the URL.
// ===========================================================================================
test.describe('Customer Support — route-mount smoke (guard admits chatxadmin agent)', () => {
  const ROUTES = ['/customersupportdashboard', '/customer-support-tickets', '/customertickets'];
  test('every seeded support route mounts (no guard-denied dialog)', async ({ page }) => {
    await installSupportStubs(page);
    await loginAsAgent(page);
    const denied: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // The app holds Firestore long-poll connections open, so 'networkidle' never settles — give the
      // guard + lazy chunk a brief fixed window to resolve instead.
      await page.waitForTimeout(2500);
      // The guard's deny path renders a ConfirmComponent with "Contact Admin" or "Access denied".
      const denyDialog = page.locator('mat-dialog-container', { hasText: /Contact Admin|Access denied/i });
      if (await denyDialog.count() > 0) denied.push(`${route} (guard denied)`);
      // also a hard bounce to /login would indicate the auth chain broke
      if (/\/login/.test(page.url())) denied.push(`${route} -> ${page.url()}`);
    }
    expect(denied, `support routes the guard denied / bounced: ${denied.join(', ')}`).toHaveLength(0);
  });
});
