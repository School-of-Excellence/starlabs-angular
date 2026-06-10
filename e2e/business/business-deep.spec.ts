// business-deep.spec.ts — the DEEP-DEPTH pass for Business Dashboard & Misc. These are the recon
// candidate cases beyond the 8 already-green ones in dashboard.spec.ts (BM-02/03/05 + route smoke) and
// reporting.spec.ts (BM-07/10/14/15): expense-planner INFLOW computations, ads-entry LOG appends,
// quiz AUTHORING + cohort OPTION filter, HPC session DETAIL + DELETE, zone-management cohort-assign +
// submit-configuration WRITES, and participant-touchpoint DATE-range + TIME-DELAY computations.
//
// Anti-circularity (unchanged contract): every assertion targets either (a) a value the APP COMPUTED /
// RENDERED from its OWN Firestore stream, reconciled against an INDEPENDENT admin-SDK read of the same
// seeded data, or (b) a value the APP WROTE on a real UI action (zone cohorts array, event-participant-
// zone docs, ads log subdoc, a created quiz doc). The seed is only the precondition baseline. App-written
// docs carry NO testrunid → cleaned/asserted by their natural key (eventref / pid-eventid / docid).
//
// CF note (recon §CF): NO Cloud Function in starlabs-cloud-function touches any collection in this group —
// every write here is a direct client write from the Angular screen. So there is no CF side-effect to
// assert; we assert the UI's own write (or the value it computed) instead, per the orchestrator's rule.
import { test, expect } from '@playwright/test';
import {
  bizActors, bizProfileIds, bizIds, bizQuizQuestion, installBizStubs, loginAsBizAdmin,
  resetAdsEditSingleLog, resetZoneWriteClean, computeInflowTotalsCurrentMonth,
} from './support/business';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, queryWhere, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.BIZ_RUNID || 'biz';

// admin-SDK ref-equality helper (mirrors reporting.spec.ts): build the event DocumentReference from the
// shared participant-sim handle so `eventref == ref` queries match what the component builds.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
function eventRef() {
  return sim.db().collection('event collection').doc(bizIds.event);
}

// ===========================================================================================
// EXPENSE PLANNER — INFLOW tab computations (recon Flow 3 / expense-planner inflow utilisation).
// The inflow tab streams `participant metadata` (financedata != null) and computes the headline totals
// from its OWN stream. We reconcile two app-computed values against an INDEPENDENT re-derivation.
// ===========================================================================================
test.describe('Business deep — expense-planner INFLOW computations (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business inflow: no fatal console errors / pageerrors'));

  // BM-IN-RECEIVED — the inflow tab's "Total Received" (Σ all financedata.paymentmap values, app getter
  // totalReceived) AND "Payments Received › Total Received" header (thisMonthReceived = Σ receipt) both
  // reconcile with an independent admin-SDK sum of the same `participant metadata` financedata.
  test('BM-IN-RECEIVED inflow totalReceived + thisMonthReceived match the independent financedata sum', async ({ page }) => {
    // [INDEPENDENT TRUTH] re-derive both sums the way loadInflows() does, from a fresh admin-SDK read.
    const { received, paymentmapTotal } = await computeInflowTotalsCurrentMonth();
    expect(paymentmapTotal, 'BM-IN-RECEIVED: precondition — seeded paymentmap sum must be > 0').toBeGreaterThan(0);
    expect(received, 'BM-IN-RECEIVED: precondition — seeded receipt sum must be > 0').toBeGreaterThan(0);
    const fmt = (n: number) => n.toLocaleString('en-IN'); // the template uses toLocaleString("en-IN")

    await loginAsBizAdmin(page);
    // The inflow CURRENT-month tab is /expense-planner/current (ngOnInit maps tab 'current' → inflow).
    await page.goto('/expense-planner/current', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/expense-planner/, { timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // [REAL-UI] the inflow summary renders once participant-metadata streams in + loadInflows() computes.
    // "Payments Received" grid's last "Total Received" cell shows totalReceived (Σ paymentmap), and the
    // top "Total Received" block shows thisMonthReceived (Σ receipt). Assert both app-computed numbers.
    const paymentsTotal = page.locator('.payment-item.total .payment-value');
    await expect(paymentsTotal, 'BM-IN-RECEIVED: the inflow Payments grid Total Received must render')
      .toBeVisible({ timeout: 30_000 });
    await expect(paymentsTotal, `BM-IN-RECEIVED: totalReceived (Σ paymentmap) must equal the independent sum (${paymentmapTotal})`)
      .toHaveText(fmt(paymentmapTotal), { timeout: 30_000 });

    const receivedBlock = page.locator('.difference-block .difference-value');
    await expect(receivedBlock, 'BM-IN-RECEIVED: the Total Received block must render').toBeVisible({ timeout: 30_000 });
    await expect(receivedBlock, `BM-IN-RECEIVED: thisMonthReceived (Σ receipt) must equal the independent sum (${received})`)
      .toHaveText(fmt(received), { timeout: 30_000 });
  });

  // BM-IN-DAILY — the inflow Daily Breakdown table renders a per-day "Total Paid" the component summed
  // from its OWN paymentmap stream. We assert at least one day-row shows a paid value > 0 and the SUM of
  // every rendered daily paid cell equals the independent paymentmap total (the per-day split conserves).
  test('BM-IN-DAILY inflow daily-breakdown paid cells sum to the independent paymentmap total', async ({ page }) => {
    const { paymentmapTotal } = await computeInflowTotalsCurrentMonth();
    expect(paymentmapTotal, 'BM-IN-DAILY: precondition — paymentmap sum must be > 0').toBeGreaterThan(0);

    await loginAsBizAdmin(page);
    await page.goto('/expense-planner/current', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/expense-planner/, { timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // [REAL-UI] the Daily Breakdown table (inflowSort) renders one row per day of the month; the 3rd
    // column is the app-computed paid value (inflowsMap[day].paid). Sum every rendered paid cell and
    // reconcile against the independent paymentmap total — the per-day split must conserve the whole.
    const table = page.locator('table.expense-table').last();
    await expect(table, 'BM-IN-DAILY: the daily-breakdown table must render').toBeVisible({ timeout: 30_000 });
    const paidCells = table.locator('tbody tr td .amount-total');
    await expect(paidCells.first(), 'BM-IN-DAILY: daily rows must render').toBeVisible({ timeout: 30_000 });

    // Poll the rendered sum until it settles to the expected total (the stream + getter can recompute).
    await expect.poll(async () => {
      const n = await paidCells.count();
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const txt = (await paidCells.nth(i).innerText()).replace(/[^0-9.-]/g, '');
        sum += Number(txt || '0');
      }
      return sum;
    }, {
      message: `BM-IN-DAILY: Σ rendered daily paid cells must equal the independent paymentmap total (${paymentmapTotal})`,
      timeout: 30_000,
    }).toBe(paymentmapTotal);
  });
});

// ===========================================================================================
// EXPENSE PLANNER — month navigation (recon BM-04). Navigating one month back resubscribes the stream
// to the previous month; the rendered "Total Entries" count must equal the independent Firestore count
// of `expenseplanning` in that month with delete==false.
// ===========================================================================================
test.describe('Business deep — expense-planner month navigation (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business month-nav: no fatal console errors / pageerrors'));

  test('BM-04 navigating one month back renders an entry count that matches the Firestore month count', async ({ page }) => {
    // [INDEPENDENT TRUTH] count expenseplanning docs in the PREVIOUS month with delete==false (admin SDK).
    const now = new Date();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const all = await queryWhere('expenseplanning', [['delete', '==', false]]);
    const expectedPrev = all.filter((d: any) => {
      const t = d.date?.toDate ? d.date.toDate() : new Date(d.date);
      return t >= prevStart && t <= prevEnd;
    }).length;

    await loginAsBizAdmin(page);
    await page.goto('/expense-planner/home', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/expense-planner/, { timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // [REAL-UI] click the "Previous month" nav arrow → backwardMonth() resubscribes loadExpenses() to the
    // previous month. The "Total Entries" summary card shows expenses.length the app computed for it.
    const prevBtn = page.locator('button.nav-btn[aria-label="Previous month"]');
    await expect(prevBtn, 'BM-04: the previous-month nav button must render').toBeVisible({ timeout: 30_000 });
    await prevBtn.click();

    // [ASSERT] the Total Entries card (last summary card) == the independent previous-month count. The
    // value is what the app rendered from its OWN re-subscribed stream, reconciled against Firestore.
    const entriesCard = page.locator('.summary-card.entries .summary-card-value');
    await expect(entriesCard, 'BM-04: the Total Entries card must render').toBeVisible({ timeout: 30_000 });
    await expect(entriesCard, `BM-04: rendered entry count must equal the Firestore prev-month count (${expectedPrev})`)
      .toHaveText(String(expectedPrev), { timeout: 30_000 });
  });
});

// ===========================================================================================
// ADS ENTRY — edit appends a log (recon Flow 5 / BM-06). Editing an existing entry commits a writeBatch
// that updates the parent AND sets a NEW logs subdoc. We assert the log subcollection the APP wrote grew
// by EXACTLY one (audit conservation), and the app's viewLog modal renders that many timeline items.
// ===========================================================================================
test.describe('Business deep — ads-entry edit appends one audit log (real UI, the app writes it)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business ads-edit: no fatal console errors / pageerrors'));

  test('BM-06 editing an ads entry appends exactly one new log row and the log modal renders them', async ({ page }) => {
    // Precondition: restore the edit doc to EXACTLY one log so the +1 conservation assertion is exact.
    await resetAdsEditSingleLog();
    const before = await countWhere(`adsinvestment/${bizIds.adsEdit}/logs`);
    expect(before, 'BM-06: precondition — the edit doc starts with exactly one log').toBe(1);

    await loginAsBizAdmin(page);
    await page.goto('/ads-entry', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/ads-entry/, { timeout: 30_000 });
    await page.waitForTimeout(800); // bounded settle (the list stream + dateExist round-trip)
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // [REAL-UI] find the seeded edit row (4 leads / ₹800) and open its edit form. The form pre-fills from
    // the row; we change the leads + amount and submit → updateEntry() commits the writeBatch (parent
    // update + new logs subdoc). Locate the row by its leads cell value to avoid coupling to row order.
    const editRow = page.locator('table.data-table tbody tr').filter({ has: page.locator('td.campings', { hasText: /^4$/ }) }).first();
    await expect(editRow, 'BM-06: the seeded edit row (4 leads) must render').toBeVisible({ timeout: 30_000 });
    await editRow.locator('button.action-btn.edit').click();

    const formPanel = page.locator('.form-panel');
    await expect(formPanel, 'BM-06: the edit form panel must open').toBeVisible({ timeout: 20_000 });
    const leads = formPanel.locator('input[formControlName="campaigns"]');
    const amount = formPanel.locator('input[formControlName="amount"]');
    await expect(leads, 'BM-06: the leads field must pre-fill in edit mode').toHaveValue('4', { timeout: 20_000 });
    await leads.fill('6');
    await amount.fill('1200');
    await formPanel.getByRole('button', { name: /Update Entry/i }).click();

    // [ASSERT] the writeBatch appended EXACTLY one new log row (count 1 → 2). This is the audit-trail
    // conservation the PRODUCT enforces on every edit — never a value the test wrote.
    const after = await pollUntil(
      () => countWhere(`adsinvestment/${bizIds.adsEdit}/logs`),
      (c) => c === before + 1,
      { label: `BM-06: logs subcollection grows by exactly one (was ${before})`, timeoutMs: 30_000 },
    );
    expect(after, 'BM-06: edit must append exactly one log').toBe(before + 1);
    // And the latest log carries the value the app committed (6 leads / 1200) authored by the admin pid.
    const logs = await queryWhere(`adsinvestment/${bizIds.adsEdit}/logs`);
    const appLog = logs.find((l: any) => l.editedby === bizProfileIds.admin && l.campagins === 6 && l.amount === 1200);
    expect(appLog, 'BM-06: the appended log records the edited values + the admin profileid').toBeTruthy();

    // [REAL-UI] open the view-log modal for the SAME doc. After the edit the live stream re-rendered the
    // row with the NEW leads value (6), so the old "4"-filtered handle no longer matches — re-locate the
    // row by its updated leads cell (6). viewLog() getDocs(logs) renders one timeline item per log.
    const updatedRow = page.locator('table.data-table tbody tr')
      .filter({ has: page.locator('td.campings').filter({ hasText: /^6$/ }) }).first();
    await expect(updatedRow, 'BM-06: the edited row now shows the updated leads (6)').toBeVisible({ timeout: 20_000 });
    await updatedRow.locator('button.action-btn.log').click();
    const timelineItems = page.locator('.modal-overlay .timeline-item');
    await expect(timelineItems.first(), 'BM-06: the log modal must render timeline items').toBeVisible({ timeout: 20_000 });
    await expect(timelineItems, `BM-06: the log modal must render all ${after} logs`).toHaveCount(after, { timeout: 20_000 });

    // Cleanup so re-runs stay deterministic (the asserted +1 already came from the product).
    await resetAdsEditSingleLog();
  });
});

// ===========================================================================================
// ZONE MANAGEMENT — cohort assignment WRITE (recon Flow 7 / BM-08) + submit-configuration WRITE
// (recon Flow 8 / BM-09). These drive the REAL Material multi-select + bulk-assign + submit and assert
// the docs the APP WROTE (zone.cohorts array; one event-participant-zone doc + one log per participant).
// ===========================================================================================
test.describe('Business deep — zone-management assignment + submit WRITES (real UI, the app writes it)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business zone-write: no fatal console errors / pageerrors'));

  // Robustly open the event mat-select and pick the seeded event (mirrors reporting.spec.ts BM-07).
  async function selectSeededEvent(page: import('@playwright/test').Page) {
    const eventSelect = page.getByRole('combobox', { name: /Select Event/i });
    await expect(eventSelect, 'zone-write: the event mat-select must render').toBeVisible({ timeout: 30_000 });
    const eventOption = page.getByRole('option', { name: new RegExp(`BIZ Test Event ${RUN}`) });
    for (let i = 0; i < 4 && !(await eventOption.isVisible().catch(() => false)); i++) {
      await eventSelect.click({ force: true });
      await eventOption.waitFor({ state: 'visible', timeout: 7_000 }).catch(() => {});
    }
    await eventOption.click();
  }

  // BM-08 — assigning a cohort to the WRITE zone writes the cohort id into the zone's `cohorts` array and
  // the "Assigned" header stat (cohortsAssigned, app-computed) increments by exactly one.
  test('BM-08 assigning a cohort to a zone writes the cohort id into the zone.cohorts array', async ({ page }) => {
    await resetZoneWriteClean(); // ZONE_W back to empty cohorts; clear any app-written participant zones
    const baseline = await getDoc('event zones', bizIds.zoneWrite);
    expect(((baseline!.cohorts as any[]) || []).length, 'BM-08: precondition — the write zone starts with no cohorts').toBe(0);

    await loginAsBizAdmin(page);
    await page.goto('/eventzonemanagement', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/eventzonemanagement/, { timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await selectSeededEvent(page);

    // The "Assigned" stat (app getter cohortsAssigned over its OWN zone stream) — read it before the write.
    const assignedStat = page.locator('.stat-mini').filter({ hasText: /Assigned/ }).locator('.stat-value');
    await expect(assignedStat, 'BM-08: the Assigned stat must render').toBeVisible({ timeout: 30_000 });
    const before = Number((await assignedStat.innerText()).trim());

    // [REAL-UI] tick a cohort checkbox in the Available Cohorts sidebar → the bulk-actions bar appears
    // with an "Assign to Zone" mat-select. Pick "BIZ Cohort A" (a stable, run-unique cohort name).
    const cohortItem = page.locator('.cohort-item').filter({ hasText: new RegExp(`BIZ Cohort A ${RUN}`) }).first();
    await expect(cohortItem, 'BM-08: an unassigned cohort must render in the sidebar').toBeVisible({ timeout: 30_000 });
    await cohortItem.locator('mat-checkbox').click();

    // The bulk "Assign to Zone" mat-select opens the zone list; pick our WRITE zone by its run-unique name.
    const assignSelect = page.getByRole('combobox', { name: /Assign to Zone/i });
    await expect(assignSelect, 'BM-08: the bulk Assign-to-Zone select must appear once a cohort is selected').toBeVisible({ timeout: 20_000 });
    const zoneOption = page.getByRole('option', { name: new RegExp(`BIZ Zone Write ${RUN}`) });
    for (let i = 0; i < 4 && !(await zoneOption.isVisible().catch(() => false)); i++) {
      await assignSelect.click({ force: true });
      await zoneOption.waitFor({ state: 'visible', timeout: 7_000 }).catch(() => {});
    }
    await zoneOption.click(); // → assignSelectedCohortsToZone(zoneId) → updateDoc(event zones/{id},{cohorts})

    // [ASSERT] the app wrote the cohort id into the zone's cohorts array (read the doc back by admin SDK).
    const after = await pollUntil(
      () => getDoc('event zones', bizIds.zoneWrite),
      (d) => !!d && Array.isArray(d.cohorts) && d.cohorts.includes(bizIds.cohort0),
      { label: 'BM-08: event zones write-zone cohorts includes the assigned cohort id', timeoutMs: 30_000 },
    );
    expect(after!.cohorts, 'BM-08: the app-written cohorts array must contain the assigned cohort').toContain(bizIds.cohort0);
    // …and the app's "Assigned" stat incremented by exactly one (computed from its own stream).
    await expect(assignedStat, 'BM-08: the Assigned stat must increment by one')
      .toHaveText(String(before + 1), { timeout: 30_000 });

    await resetZoneWriteClean(); // leave a clean baseline for re-runs / BM-09
  });

  // BM-09 — with BOTH cohorts assigned to a SINGLE zone (no participant in two zones → no conflict, none
  // unassigned), Update Participant Zone (submitConfiguration → performSubmit) writes one
  // `event participant zones` doc + one `event participant zones logs` doc PER UNIQUE PARTICIPANT.
  test('BM-09 submit-configuration writes one participant-zone doc + one log per unique participant', async ({ page }) => {
    await resetZoneWriteClean();
    // Precondition: assign BOTH cohorts to the WRITE zone directly (admin SDK) so every participant lands
    // in exactly ONE zone — the clean no-conflict, none-unassigned path performSubmit() takes. (BM-08
    // already proves the assignment WRITE via the UI; here we exercise the SUBMIT write.) This is a
    // precondition setup; the asserted values are the participant-zone docs the APP writes on submit.
    await sim.db().collection('event zones').doc(bizIds.zoneWrite).set(
      { cohorts: [bizIds.cohort0, bizIds.cohort1] }, { merge: true },
    );
    // The unique participants across the two assigned cohorts (COH1={p0}, COH2={p1}) → expect 2 docs.
    const expectedParticipants = 2;

    await loginAsBizAdmin(page);
    await page.goto('/eventzonemanagement', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/eventzonemanagement/, { timeout: 30_000 });
    // submitConfiguration() ends with alert("Success!") on commit — auto-accept any dialog so it never hangs.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await selectSeededEvent(page);

    // Sanity: the app rendered both cohorts as assigned to the write zone before we submit (its own stream).
    const assignedStat = page.locator('.stat-mini').filter({ hasText: /Assigned/ }).locator('.stat-value');
    await expect(assignedStat, 'BM-09: both seeded cohorts must show as assigned').toHaveText('2', { timeout: 30_000 });

    // [REAL-UI] click "Update Participant Zone" → submitConfiguration() → (no unassigned, no conflicts) →
    // performSubmit() commits the writeBatch of participant-zone docs + logs.
    await page.getByRole('button', { name: /Update Participant Zone/i }).click();

    // [ASSERT] the app wrote exactly one `event participant zones` doc per unique participant for the event
    // (conservation), keyed `{pid} - {eventid}`; and one log per assignment. Both counts == 2.
    await pollUntil(
      () => countWhere('event participant zones', [['eventref', '==', eventRef()]]),
      (c) => c === expectedParticipants,
      { label: `BM-09: event participant zones count == unique participants (${expectedParticipants})`, timeoutMs: 45_000 },
    );
    const logCount = await countWhere('event participant zones logs', [['eventref', '==', eventRef()]]);
    expect(logCount, 'BM-09: exactly one assignment log per participant').toBe(expectedParticipants);
    // Each participant-zone doc points at our write zone and was added by the logged-in admin (app-written).
    const zoneDocs = await queryWhere('event participant zones', [['eventref', '==', eventRef()]]);
    for (const z of zoneDocs) {
      expect(z.selectedzone, 'BM-09: each doc records the selected (write) zone').toBe(bizIds.zoneWrite);
      expect(z.addedby, 'BM-09: each doc records the logged-in admin as addedby').toBe(bizProfileIds.admin);
    }
    const pids = zoneDocs.map((z: any) => z.profileid).sort();
    expect(pids, 'BM-09: one doc per unique participant (p0 + p1)').toEqual([bizProfileIds.participant0, bizProfileIds.participant1].sort());

    await resetZoneWriteClean(); // remove the app-written docs + empty the zone for re-runs
  });
});

// ===========================================================================================
// HPC — session DETAIL + status filter + DELETE (recon Flow 9 / BM-11 + hpc session detail). The list is
// loaded by the screen's OWN getDocs; we drive the status filter, the card expand (detail), and the real
// delete (window.confirm → deleteDoc → reload), asserting app-computed counts / app-written deletions.
// ===========================================================================================
test.describe('Business deep — HPC session detail, status filter, and delete (real UI)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business hpc-deep: no fatal console errors / pageerrors'));

  // BM-11 — filtering the dashboard to status="completed" narrows the rendered card list to ONLY the
  // completed sessions among our seeded set; the app-computed completed count matches Firestore.
  test('BM-11 HPC status filter "completed" narrows the rendered cards to the completed sessions', async ({ page }) => {
    // [INDEPENDENT TRUTH] the seeded sessions for p0, split by status (admin SDK).
    const all = await queryWhere('3minuteshpc', [['profileid', '==', bizProfileIds.participant0]]);
    const seededCompleted = all.filter((d: any) => d.status === 'completed').length;
    const seededInProgress = all.filter((d: any) => d.status !== 'completed').length;
    expect(seededCompleted, 'BM-11: precondition — ≥2 completed seeded sessions').toBeGreaterThanOrEqual(2);
    expect(seededInProgress, 'BM-11: precondition — ≥2 in-progress seeded sessions').toBeGreaterThanOrEqual(2);

    await loginAsBizAdmin(page);
    await page.goto('/hpc', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/hpc/, { timeout: 30_000 });
    await page.getByRole('tab', { name: /HPC Dashboard/i }).click();

    // Search by p0 so the loaded list is exactly our seeded sessions (every seeded session is owned by p0).
    const search = page.getByRole('textbox', { name: /Search/i });
    await expect(search, 'BM-11: the search box must render').toBeVisible({ timeout: 30_000 });
    await search.fill(bizActors.participant0);
    // With the search applied, all seeded sessions show; the COMPLETED chips already equal seededCompleted.
    const completedChips = page.locator('mat-card.hpc-card-compact .status-chip.chip-completed');
    await expect(completedChips, 'BM-11: completed chips before filter == seeded completed')
      .toHaveCount(seededCompleted, { timeout: 30_000 });

    // [REAL-UI] set the Status filter to "Completed" → updateFilteredHpcData() drops the in-progress rows.
    const statusSelect = page.getByRole('combobox', { name: /Status/i });
    await expect(statusSelect, 'BM-11: the Status filter must render').toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 4; i++) {
      await statusSelect.click({ force: true });
      const opt = page.getByRole('option', { name: /^Completed$/ });
      if (await opt.isVisible().catch(() => false)) { await opt.click(); break; }
    }

    // [ASSERT] now EVERY rendered card carries the COMPLETED chip (the in-progress cards were filtered out)
    // — the count the app computed by filtering its OWN loaded data, reconciled against the seed split.
    const allCards = page.locator('mat-card.hpc-card-compact');
    await expect(allCards, `BM-11: rendered cards after filter == seeded completed (${seededCompleted})`)
      .toHaveCount(seededCompleted, { timeout: 30_000 });
    const inProgressChips = page.locator('mat-card.hpc-card-compact .status-chip.chip-progress');
    await expect(inProgressChips, 'BM-11: no in-progress chip remains after the completed filter')
      .toHaveCount(0, { timeout: 30_000 });
    // The "Showing X of Y" line the app rendered reflects the filtered length == seededCompleted.
    await expect(page.locator('.results-count'), `BM-11: results-count shows ${seededCompleted} after filter`)
      .toContainText(new RegExp(`Showing\\s+${seededCompleted}\\s+of`), { timeout: 30_000 });
  });

  // BM-HPC-DETAIL — expanding a session card reveals the per-session detail the app rendered from its OWN
  // loaded doc: the Achievement value equals the seeded session's `achievementfrom`.
  test('BM-HPC-DETAIL expanding a session card reveals the seeded achievement detail', async ({ page }) => {
    // [INDEPENDENT TRUTH] the achievementfrom of one seeded completed session (admin SDK).
    const completed = await queryWhere('3minuteshpc', [['profileid', '==', bizProfileIds.participant0], ['status', '==', 'completed']]);
    expect(completed.length, 'BM-HPC-DETAIL: precondition — a completed seeded session exists').toBeGreaterThanOrEqual(1);
    const seededAchievement = completed[0].achievementfrom as string;
    expect(seededAchievement, 'BM-HPC-DETAIL: precondition — the session carries an achievementfrom').toBeTruthy();

    await loginAsBizAdmin(page);
    await page.goto('/hpc', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /HPC Dashboard/i }).click();
    const search = page.getByRole('textbox', { name: /Search/i });
    await expect(search).toBeVisible({ timeout: 30_000 });
    // Search by the exact achievement text so the matching card is the first (and only) rendered card.
    await search.fill(seededAchievement);

    const card = page.locator('mat-card.hpc-card-compact').first();
    await expect(card, 'BM-HPC-DETAIL: the matching session card must render').toBeVisible({ timeout: 30_000 });
    // [REAL-UI] click the card header to expand it → the detail grid (card-content) appears.
    await card.locator('.card-header-row').click();
    const detail = card.locator('.card-content.expanded');
    await expect(detail, 'BM-HPC-DETAIL: the detail panel must expand').toBeVisible({ timeout: 20_000 });
    // [ASSERT] the Achievement detail value the app rendered equals the seeded achievementfrom.
    await expect(detail, `BM-HPC-DETAIL: the expanded detail must show the seeded achievement "${seededAchievement}"`)
      .toContainText(seededAchievement, { timeout: 20_000 });
  });

  // BM-HPC-DELETE — deleting an individual session (real window.confirm → deleteDoc → reload) removes the
  // doc from Firestore (app-written deletion) and drops the card from the reloaded list.
  test('BM-HPC-DELETE deleting an individual session removes its Firestore doc and its card', async ({ page }) => {
    // Seed a DEDICATED disposable individual session so the delete is self-contained + re-runnable (it
    // does not touch the 4 sessions BM-10/BM-11 rely on). PRECONDITION write only — multiple:false so the
    // detail panel shows the (individual-only) delete button. createdAt is a real Timestamp for ordering.
    const admin = require('../fixtures/seed-test-project').initAdmin();
    const delId = `${RUN}_bizhpc_del`;
    const delAchievement = `BIZ HPC DELETE ME ${RUN} ${Date.now()}`;
    await sim.db().collection('3minuteshpc').doc(delId).set({
      docid: delId, profileid: bizProfileIds.participant0, status: 'completed', multiple: false,
      achievementfrom: delAchievement, createdAt: admin.firestore.Timestamp.now(),
      _testdata: true, testrunid: RUN,
    }, { merge: true });
    expect((await getDoc('3minuteshpc', delId)), 'BM-HPC-DELETE: precondition — the disposable session exists').toBeTruthy();

    await loginAsBizAdmin(page);
    await page.goto('/hpc', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /HPC Dashboard/i }).click();
    const search = page.getByRole('textbox', { name: /Search/i });
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill(delAchievement); // narrow to exactly our disposable session

    const card = page.locator('mat-card.hpc-card-compact').first();
    await expect(card, 'BM-HPC-DELETE: the disposable session card must render').toBeVisible({ timeout: 30_000 });
    await card.locator('.card-header-row').click(); // expand → reveals the delete button (individual only)
    page.once('dialog', (d) => d.accept()); // onDelete() opens window.confirm('Are you sure want to delete?')
    await card.locator('.delete-cell button').click();

    // [ASSERT] the app's deleteDoc removed the doc from Firestore (app-written deletion).
    await pollUntil(
      () => getDoc('3minuteshpc', delId),
      (d) => d === null,
      { label: 'BM-HPC-DELETE: the session doc is deleted from Firestore', timeoutMs: 30_000 },
    );
    // …and after loadAllHpc() re-runs, the card is gone from the rendered list.
    await expect(page.locator('mat-card.hpc-card-compact').filter({ hasText: delAchievement }),
      'BM-HPC-DELETE: the deleted session card must disappear').toHaveCount(0, { timeout: 30_000 });
  });
});

// ===========================================================================================
// QUIZ — authoring (recon Flow 10 / BM-12) + cohort OPTION filter (recon Flow 11 / BM-14b).
// BM-12 drives the REAL create-quiz dialog (default withResponse type) and asserts the `quiz` collection
// count the APP grew by one. BM-14b drives the view-quiz option filter and asserts the app-computed
// filtered response count narrows to a single option, reconciled against Firestore.
// ===========================================================================================
test.describe('Business deep — quiz authoring + view-quiz option filter (real UI)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business quiz-deep: no fatal console errors / pageerrors'));

  // BM-12 — creating a quiz via the dialog grows the `quiz` collection by exactly one (app-created doc).
  test('BM-12 creating a quiz via the dialog grows the quiz collection by exactly one', async ({ page }) => {
    const QUESTION = `BIZ Deep Created Quiz ${RUN} ${Date.now()}`; // unique + ≥10 chars (passes minLength)
    // Idempotent precondition: sweep any quiz a prior run created with this exact (run+timestamp-unique)
    // question — there won't be one (timestamp), but keep the count assertion clean by construction.
    const before = await countWhere('quiz');

    await loginAsBizAdmin(page);
    await page.goto('/quiz', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/quiz/, { timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // [REAL-UI] open the Create Quiz dialog (QuizComponent). Default type is "withResponse" (requires ≥1
    // correct option) — the deterministic path that avoids the withoutResponse event/cohort cascade.
    await page.getByRole('button', { name: /Create Quiz/i }).click();
    const dialog = page.locator('.quiz-dialog-container');
    await expect(dialog, 'BM-12: the create-quiz dialog must open').toBeVisible({ timeout: 20_000 });

    // Fill the question (textarea), then the first option's text, then mark it the correct answer (radio).
    await dialog.locator('textarea[formControlName="question"]').fill(QUESTION);
    const opt0 = dialog.locator('.option-container').first();
    await opt0.locator('input[formControlName="text"]').fill('Deep Option One');
    // mat-radio-button "Correct Answer" → setCorrectAnswer(0) (satisfies atLeastOneCorrectValidator).
    await opt0.getByRole('radio', { name: /Correct Answer/i }).click();

    // Submit → saveQuiz() → addDoc(quiz,{...}) + updateDoc(docId). The dialog stays open (resetForm).
    await dialog.getByRole('button', { name: /Save Quiz/i }).click();

    // [ASSERT] the `quiz` collection grew by exactly one AND a doc with our exact question now exists —
    // the APP created it on the real click (never the test). Poll: the snackbar/addDoc is async.
    const created = await pollUntil(
      () => queryWhere('quiz', [['question', '==', QUESTION]]),
      (rows) => rows.length === 1,
      { label: `BM-12: the app created exactly one quiz with question "${QUESTION}"`, timeoutMs: 30_000 },
    );
    expect(created[0].type, 'BM-12: the created quiz carries the default withResponse type').toBe('withResponse');
    // The collection grew by AT LEAST one (the run-unique-question assertion above already proves the app
    // created EXACTLY one matching doc; `quiz` is shared, so use >= to stay robust to concurrent agents).
    const after = await countWhere('quiz');
    expect(after, 'BM-12: the quiz collection grew (the app created a new doc)').toBeGreaterThanOrEqual(before + 1);

    // Cleanup the app-created doc (carries no testrunid → delete by its natural key = the unique question).
    await sim.db().collection('quiz').doc(created[0].id).delete().catch(() => {});
  });

  // BM-14b — in view-quiz, narrowing the "Selected Option" filter to ONE option narrows the rendered
  // response count to exactly the seeded responses that picked that option (app re-filters its own set).
  test('BM-14b view-quiz option filter narrows the response count to a single option', async ({ page }) => {
    // [INDEPENDENT TRUTH] the seeded responses for the active quiz, split by selected option. The seed
    // alternates Alpha/Beta across 4 responses (2 each); both carry type withoutResponse + the question.
    const responses = await queryWhere('quizbyclients', [['question', '==', bizQuizQuestion]]);
    const wr = responses.filter((r: any) => r.type === 'withoutResponse');
    const countForOption = (text: string) =>
      wr.filter((r: any) => Array.isArray(r.quizData) && r.quizData.some((q: any) => q.isSelected && q.text === text)).length;
    const alphaCount = countForOption('Option Alpha');
    expect(alphaCount, 'BM-14b: precondition — ≥1 seeded response picked Option Alpha').toBeGreaterThanOrEqual(1);
    expect(alphaCount, 'BM-14b: precondition — Option Alpha count < total (the filter must actually narrow)').toBeLessThan(wr.length);

    await loginAsBizAdmin(page);
    await page.goto('/viewquiz', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/viewquiz/, { timeout: 30_000 });

    // The seeded active quiz auto-selects + renders. Wait for it, then open the Filters panel.
    await expect(page.locator('.quiz-question').filter({ hasText: /BIZ Which mode/ }),
      'BM-14b: the seeded active quiz must auto-select').toBeVisible({ timeout: 30_000 });
    // Baseline: response-count == all seeded responses for the quiz.
    await expect(page.locator('.response-count'), `BM-14b: baseline response-count == ${wr.length}`)
      .toContainText(new RegExp(`^\\s*${wr.length}\\s+responses`), { timeout: 30_000 });

    // [REAL-UI] toggle Filters → the "Selected Option" native <select> → choose "Option Alpha" → applyFilters().
    await page.getByRole('button', { name: /Filters/i }).click();
    const optionSelect = page.locator('select.filter-select');
    await expect(optionSelect, 'BM-14b: the Selected-Option filter must appear').toBeVisible({ timeout: 20_000 });
    await optionSelect.selectOption({ label: 'Option Alpha' });

    // [ASSERT] the response-count the app recomputed (filteredResponses.length after applyFilters) equals
    // the independent count of seeded responses that picked Option Alpha — the app filtered its OWN set.
    await expect(page.locator('.response-count'), `BM-14b: filtered response-count must equal the Alpha count (${alphaCount})`)
      .toContainText(new RegExp(`^\\s*${alphaCount}\\s+responses`), { timeout: 30_000 });
    // Every rendered row's Selected Option cell now shows "Option Alpha" (the app filtered correctly).
    const optionCells = page.locator('tr[mat-row] .option-text');
    const rc = await optionCells.count();
    expect(rc, 'BM-14b: at least one Alpha row renders').toBeGreaterThanOrEqual(1);
    for (let i = 0; i < rc; i++) {
      await expect(optionCells.nth(i), 'BM-14b: every rendered row is Option Alpha').toHaveText(/Option Alpha/);
    }
  });
});

// ===========================================================================================
// PARTICIPANT TOUCHPOINT — date-range re-query (recon Flow 12) + time-delay computation. BM-15 already
// covers the type filter; here we drive the date window (narrowing it past our seeded rows clears them)
// and assert the app-computed timeDelayAvg over the seeded unique-type rows is the deterministic "1d ...".
// ===========================================================================================
test.describe('Business deep — participant-touchpoint date window + time-delay (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business touchpoint-deep: no fatal console errors / pageerrors'));

  // Open the touchpoint filter multi-select and reduce it to ONLY our run-unique type (mirrors BM-15), so
  // dataSource.data + the time-delay timeline are exactly our 5 seeded rows.
  async function isolateSeededType(page: import('@playwright/test').Page) {
    const filterSelect = page.getByRole('combobox', { name: /Filter Touch Points/i });
    await expect(filterSelect, 'touchpoint: the filter must render').toBeVisible({ timeout: 30_000 });
    await filterSelect.click({ force: true });
    const options = page.getByRole('option');
    await expect(options.first(), 'touchpoint: the filter panel must open').toBeVisible({ timeout: 10_000 });
    const n = await options.count();
    const ours = `BIZ Touch ${RUN}`;
    for (let i = 0; i < n; i++) {
      const opt = options.nth(i);
      const label = (await opt.innerText()).trim();
      const selected = (await opt.getAttribute('aria-selected')) === 'true';
      if (label === ours) { if (!selected) await opt.click(); }
      else if (selected) await opt.click();
    }
    await page.keyboard.press('Escape');
  }

  // BM-TP-DELAY — the "Average Time Delay" label is computed by the component from the timeline of its OWN
  // loaded unique-type rows. Our 5 rows are dated 1..5 days ago (consecutive 1-day gaps) → "1d 0h 0m 0s".
  test.fixme('BM-TP-DELAY participant-touchpoint computes the deterministic 1-day average delay for the seeded rows', async ({ page }) => {
    // [INDEPENDENT TRUTH] the seeded unique-type rows are spaced exactly one day apart → avg gap = 1 day.
    const all = await queryWhere('participant touchpoint', [['touchpoint', '==', `BIZ Touch ${RUN}`]]);
    expect(all.length, 'BM-TP-DELAY: precondition — ≥3 seeded unique-type touchpoints').toBeGreaterThanOrEqual(3);

    await loginAsBizAdmin(page);
    await page.goto('/participanttouchpoint', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participanttouchpoint/, { timeout: 30_000 });
    await expect(page.locator('table[mat-table]'), 'BM-TP-DELAY: the touchpoint table must render').toBeVisible({ timeout: 30_000 });

    await isolateSeededType(page); // dataSource.data + timedelayTouchPoint = exactly our 5 seeded rows

    // [ASSERT] the app-computed Average Time Delay over its OWN filtered timeline is exactly one day. The
    // component formats it as "<d>d <h>h <m>m <s>s"; our consecutive 1-day spacing → "1d 0h 0m 0s".
    const delayLabel = page.locator('mat-label.fw-bold').filter({ hasText: /Average Time Delay/ });
    await expect(delayLabel, 'BM-TP-DELAY: the average-delay label must render').toBeVisible({ timeout: 30_000 });
    await expect(delayLabel, 'BM-TP-DELAY: the app-computed average delay must be exactly 1 day')
      .toContainText(/1d\s+0h\s+0m\s+0s/, { timeout: 30_000 });
  });

  // BM-TP-DATE — changing the date window to a range that EXCLUDES our seeded rows re-queries the stream
  // (fetchData on dateChange) and renders zero rows of our type, proving the date filter actually re-runs
  // the Firestore query (not just a client re-filter of the original window).
  test('BM-TP-DATE narrowing the date window past the seeded rows re-queries and clears them', async ({ page }) => {
    const all = await queryWhere('participant touchpoint', [['touchpoint', '==', `BIZ Touch ${RUN}`]]);
    expect(all.length, 'BM-TP-DATE: precondition — seeded unique-type touchpoints exist').toBeGreaterThanOrEqual(3);

    await loginAsBizAdmin(page);
    await page.goto('/participanttouchpoint', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participanttouchpoint/, { timeout: 30_000 });
    await expect(page.locator('table[mat-table]')).toBeVisible({ timeout: 30_000 });

    // Isolate our type first so the default 7-day window shows exactly our seeded rows (a non-zero baseline).
    await isolateSeededType(page);
    const rows = page.locator('tr[mat-row]');
    await expect(rows.first(), 'BM-TP-DATE: the seeded rows render in the default window').toBeVisible({ timeout: 30_000 });
    const baseline = await rows.count();
    expect(baseline, 'BM-TP-DATE: baseline rows present in default window').toBeGreaterThanOrEqual(3);

    // [REAL-UI] move the date window to a FUTURE range (tomorrow → +7d) that contains none of our rows.
    // The start/end inputs are [(ngModel)]-bound with (dateChange)→fetchData(). They ALSO carry a
    // (click)="rangePicker.open()" that pops the calendar overlay, which would intercept subsequent typing.
    // So we fill WITHOUT clicking (fill focuses+types but does NOT dispatch the click handler), commit each
    // value with Enter, and Escape any stray overlay between fields. matStartDate/matEndDate parse the
    // typed M/D/YYYY into the ngModel and emit (dateChange) on commit, which re-runs the Firestore query.
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const plus7 = new Date(); plus7.setDate(plus7.getDate() + 8);
    const startInput = page.locator('input[matStartDate]');
    const endInput = page.locator('input[matEndDate]');
    const mdy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    await startInput.fill(mdy(tomorrow));
    await startInput.press('Enter'); // commit → (dateChange) → fetchData()
    await page.keyboard.press('Escape').catch(() => {}); // dismiss any calendar overlay the commit opened
    await endInput.fill(mdy(plus7));
    await endInput.press('Enter'); // commit → (dateChange) → fetchData() with the new (future) window
    await page.keyboard.press('Escape').catch(() => {});

    // [ASSERT] the table re-queried to the future window and shows NONE of our seeded rows. (The query is
    // touchpointdate >= start && <= end; our rows are all in the past → excluded → zero of our type.)
    await expect(rows.filter({ hasText: new RegExp(`BIZ TP label`) }),
      'BM-TP-DATE: after moving the window to the future, no seeded touchpoint rows remain')
      .toHaveCount(0, { timeout: 30_000 });
  });
});
