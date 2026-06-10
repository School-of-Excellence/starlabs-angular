// reporting.spec.ts — Business/Misc READ-RECONCILIATION cases (the anti-circular core of this suite):
// each test drives a REAL Angular screen and asserts a value the APP COMPUTED/RENDERED from its own
// Firestore stream, then reconciles it against an INDEPENDENT admin-SDK count of the same seeded data.
// The seed is a precondition; the assertion is always the app's own computed/rendered number.
//
// Recon: e2e/recon-allcomp/business-misc.md (BM-07 zone, BM-10 HPC, BM-14 viewquiz, BM-15 touchpoint).
// None of these queries needs a composite index (all single-field range / single equality).
import { test, expect } from '@playwright/test';
import {
  bizActors, bizProfileIds, bizIds, bizQuizQuestion, bizTouchpointType, installBizStubs, loginAsBizAdmin,
} from './support/business';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { countWhere, queryWhere } from '../queue/support/firestore-admin';

const RUN = process.env.BIZ_RUNID || 'biz';

// admin-SDK ref-equality helper: firestore-admin's countWhere takes a value; for an `eventref == ref`
// query we pass the admin DocumentReference. Build it from the same shared handle the helpers use.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
function eventRef() {
  return sim.db().collection('event collection').doc(bizIds.event);
}

test.describe('Business — read reconciliation (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installBizStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'business reporting: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // BM-07 — Zone management: selecting the seeded event renders a zonesCreated count that
  // reconciles with the independent Firestore count of `event zones` for that event.
  // ===========================================================================================
  test('BM-07 zone management renders zonesCreated that matches the Firestore event-zone count', async ({ page }) => {
    // [INDEPENDENT TRUTH] count the seeded zones for this event straight from Firestore (admin SDK).
    const expectedZones = await countWhere('event zones', [['eventref', '==', eventRef()]]);
    expect(expectedZones, 'BM-07: precondition — seeded zones for the event must exist').toBeGreaterThanOrEqual(2);
    const expectedCohorts = await countWhere('big cohorts', [['eventref', '==', eventRef()]]);
    expect(expectedCohorts, 'BM-07: precondition — seeded cohorts for the event must exist').toBeGreaterThanOrEqual(2);

    await loginAsBizAdmin(page);
    await page.goto('/eventzonemanagement', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/eventzonemanagement/, { timeout: 30_000 });

    // [REAL-UI] select the seeded event from the mat-select (bound to selectedEvent → onEventSelect()).
    // The floating <mat-label> intercepts a normal click on the trigger → force the click.
    const eventSelect = page.getByRole('combobox', { name: /Select Event/i });
    await expect(eventSelect, 'BM-07: the event mat-select must render').toBeVisible({ timeout: 30_000 });
    const eventOption = page.getByRole('option', { name: new RegExp(`BIZ Test Event ${RUN}`) });
    // Robust open: a single force-click on the mat-select trigger can be lost to an Angular hydration race
    // (the panel doesn't open) → retry until the option panel is actually showing, then pick it.
    for (let i = 0; i < 4 && !(await eventOption.isVisible().catch(() => false)); i++) {
      await eventSelect.click({ force: true });
      await eventOption.waitFor({ state: 'visible', timeout: 7_000 }).catch(() => {});
    }
    await eventOption.click();

    // [ASSERT] the "Zones" stat the component computed from its OWN `event zones` stream
    // (zonesCreated == eventZoneList.length) equals the independent Firestore count.
    const zonesStat = page.locator('.stat-mini').filter({ hasText: /Zones/ }).locator('.stat-value');
    await expect(zonesStat, 'BM-07: zonesCreated must reconcile with the Firestore zone count')
      .toHaveText(String(expectedZones), { timeout: 30_000 });

    // [ASSERT] the available-cohorts header the component computed from its OWN `big cohorts` stream
    // (allCohorts.length) equals the independent Firestore cohort count: "Available Cohorts (x/Y)".
    const cohortHeader = page.locator('.sidebar-title').filter({ hasText: /Available Cohorts/ });
    await expect(cohortHeader, 'BM-07: available-cohorts header must render').toBeVisible({ timeout: 30_000 });
    await expect(cohortHeader, `BM-07: allCohorts.length must reconcile with the Firestore cohort count (${expectedCohorts})`)
      .toContainText(`/${expectedCohorts})`);
  });

  // ===========================================================================================
  // BM-10 — HPC dashboard: searching by the seeded participant narrows the rendered list to the
  // seeded sessions; the app-computed status split (completed vs in-progress) matches Firestore.
  // ===========================================================================================
  test('BM-10 HPC dashboard search narrows to the seeded sessions; completed/in-progress split reconciles', async ({ page }) => {
    // [INDEPENDENT TRUTH] the seeded HPC sessions for p0, split by status (admin SDK).
    const all = await queryWhere('3minuteshpc', [['profileid', '==', bizProfileIds.participant0]]);
    const seededTotal = all.length;
    const seededCompleted = all.filter((d) => d.status === 'completed').length;
    expect(seededTotal, 'BM-10: precondition — seeded HPC sessions for p0 must exist').toBeGreaterThanOrEqual(4);
    expect(seededCompleted, 'BM-10: precondition — some seeded sessions are completed').toBeGreaterThanOrEqual(2);

    await loginAsBizAdmin(page);
    await page.goto('/hpc', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/hpc/, { timeout: 30_000 });

    // [REAL-UI] move to the "HPC Dashboard" tab (the default tab is the admin config tab).
    await page.getByRole('tab', { name: /HPC Dashboard/i }).click();

    // Search by the seeded participant's mapped name (= their email). The app's updateFilteredHpcData()
    // filters allHpcData (loaded via its own getDocs) by profileName.includes(search). Because every
    // seeded session is owned by p0, the filtered set is exactly our seeded sessions.
    const search = page.getByRole('textbox', { name: /Search/i });
    await expect(search, 'BM-10: the search box must render on the dashboard tab').toBeVisible({ timeout: 30_000 });
    await search.fill(bizActors.participant0);

    // [ASSERT] the results-count line the app rendered ("Showing X of Y sessions") shows X == seededTotal
    // — the count the component computed by filtering its OWN loaded data, vs the independent seed count.
    const resultsCount = page.locator('.results-count');
    await expect(resultsCount, 'BM-10: results-count must render').toBeVisible({ timeout: 30_000 });
    await expect(resultsCount, `BM-10: filteredHpcData.length must equal the seeded session count (${seededTotal})`)
      .toContainText(new RegExp(`Showing\\s+${seededTotal}\\s+of`));

    // [ASSERT] exactly seededCompleted of the rendered cards carry the COMPLETED chip — the app's own
    // per-card status render, reconciled against the independent Firestore status split.
    const completedChips = page.locator('mat-card.hpc-card-compact .status-chip.chip-completed');
    await expect(completedChips, `BM-10: rendered COMPLETED cards must equal the seeded completed count (${seededCompleted})`)
      .toHaveCount(seededCompleted, { timeout: 30_000 });
  });

  // ===========================================================================================
  // BM-14 — View Quiz: the auto-selected active quiz's response total + option breakdown are
  // computed by the app from its own `quizbyclients` stream and reconcile with Firestore.
  // ===========================================================================================
  test('BM-14 view-quiz renders a filtered response count + breakdown that reconcile with Firestore', async ({ page }) => {
    // [INDEPENDENT TRUTH] count the seeded responses for the seeded active quiz's question (admin SDK).
    // The component filters responses by r.question === selectedQuiz.question AND loads only
    // type=='withoutResponse'; both are satisfied by the seed, and the question is run-unique.
    const responses = await queryWhere('quizbyclients', [['question', '==', bizQuizQuestion]]);
    const expectedResponses = responses.filter((r) => r.type === 'withoutResponse').length;
    expect(expectedResponses, 'BM-14: precondition — seeded quiz responses must exist').toBeGreaterThanOrEqual(2);

    await loginAsBizAdmin(page);
    await page.goto('/viewquiz', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/viewquiz/, { timeout: 30_000 });

    // [REAL-UI] the quiz card auto-selects the latest active quiz (our seeded one). Wait for its question.
    const quizQuestion = page.locator('.quiz-question').filter({ hasText: new RegExp(`BIZ Which mode`) });
    await expect(quizQuestion, 'BM-14: the seeded active quiz must auto-select and render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the response-count the app computed (filteredResponses.length) equals the seeded count.
    const responseCount = page.locator('.response-count');
    await expect(responseCount, 'BM-14: response-count must render').toBeVisible({ timeout: 30_000 });
    await expect(responseCount, `BM-14: filteredResponses.length must equal the seeded response count (${expectedResponses})`)
      .toContainText(new RegExp(`^\\s*${expectedResponses}\\s+responses`));

    // [ASSERT] the option-breakdown percentages the app computed sum to ~100 (a real derived invariant
    // over the app's own filtered set — never a value the test wrote).
    const pctCells = page.locator('.stat-breakdown .stat-count');
    const n = await pctCells.count();
    expect(n, 'BM-14: at least one option breakdown row must render').toBeGreaterThanOrEqual(1);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const txt = (await pctCells.nth(i).innerText()).replace(/\s+/g, ' ');
      const m = txt.match(/\((\d+)%\)/);
      if (m) sum += Number(m[1]);
    }
    expect(sum, `BM-14: breakdown percentages must sum to ~100 (got ${sum})`).toBeGreaterThanOrEqual(99);
    expect(sum, `BM-14: breakdown percentages must sum to ~100 (got ${sum})`).toBeLessThanOrEqual(101);
  });

  // ===========================================================================================
  // BM-15 — Participant touchpoint: narrowing the filter multi-select to our RUN-UNIQUE touchpoint
  // type makes the component filter its own `participant touchpoint` stream down to exactly the
  // seeded rows. We assert the app-rendered row count == the independent Firestore count of that type
  // in the default 7-day window. (A unique type sidesteps the 17k+ stock-type rows + pagination.)
  // ===========================================================================================
  test('BM-15 participant-touchpoint filtered to the seeded type renders the app-computed row count', async ({ page }) => {
    // [INDEPENDENT TRUTH] count the seeded touchpoints of our unique type within the default 7-day window.
    const start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const all = await queryWhere('participant touchpoint', [['touchpoint', '==', bizTouchpointType]]);
    const expectedRows = all.filter((d: any) => {
      const t = d.touchpointdate?.toDate ? d.touchpointdate.toDate() : new Date(d.touchpointdate);
      return t >= start && t <= end;
    }).length;
    expect(expectedRows, 'BM-15: precondition — seeded touchpoints of the unique type in-window must exist').toBeGreaterThanOrEqual(3);

    await loginAsBizAdmin(page);
    await page.goto('/participanttouchpoint', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participanttouchpoint/, { timeout: 30_000 });

    const table = page.locator('table[mat-table]');
    await expect(table, 'BM-15: the touchpoint table must render').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the "Filter Touch Points" multi-select. It defaults to the FULL touchpoint list
    // (every type selected). De-select the four stock types so only our run-unique type remains → the
    // component's calculateTimeDelay() rebuilds dataSource.data = rows whose touchpoint is in
    // filterTouchPoint, i.e. exactly our seeded rows.
    const filterSelect = page.getByRole('combobox', { name: /Filter Touch Points/i });
    await expect(filterSelect, 'BM-15: the touchpoint filter must render').toBeVisible({ timeout: 30_000 });
    await filterSelect.click({ force: true });
    // De-select EVERY option except our run-unique type (the list also carries other suites' types, so
    // we cannot hardcode the stock set — toggle off any currently-selected option that isn't ours).
    const options = page.getByRole('option');
    await expect(options.first(), 'BM-15: the filter panel must open with options').toBeVisible({ timeout: 10_000 });
    const optCount = await options.count();
    for (let i = 0; i < optCount; i++) {
      const opt = options.nth(i);
      const label = (await opt.innerText()).trim();
      const selected = (await opt.getAttribute('aria-selected')) === 'true';
      if (label === bizTouchpointType) {
        if (!selected) await opt.click(); // ensure ours is ON
      } else if (selected) {
        await opt.click(); // turn every other type OFF
      }
    }
    // Close the panel so the table reflects the new filter.
    await page.keyboard.press('Escape');

    // [ASSERT] the app rendered exactly `expectedRows` table rows — the count it computed by filtering
    // its OWN Firestore stream to our type, reconciled against the independent Firestore count.
    const rows = page.locator('tr[mat-row]');
    await expect(rows, `BM-15: rendered touchpoint rows must equal the seeded in-window count (${expectedRows})`)
      .toHaveCount(expectedRows, { timeout: 30_000 });
    // Each rendered row shows the participant NAME the app resolved via its profile map (proves the app
    // joined profile_data → mapProfile and rendered from its own stream, not a test-supplied value).
    await expect(rows.first(), 'BM-15: a rendered row shows the app-resolved participant name')
      .toContainText(bizActors.participant0);
  });
});
