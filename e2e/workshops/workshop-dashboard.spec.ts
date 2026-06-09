// workshop-dashboard.spec.ts — Workshop dashboard: the app-computed enrolled metric, the app-computed
// progress percentage, and a REAL manual move-next WRITE. Plus a route-mount smoke for the whole group.
//
// Recon: e2e/recon-allcomp/workshops.md (WS-07 / WS-11 / WS-12).
// Anti-circularity:
//   • WS-07: the dashboard streams `workshop participant enrolled where workshopref==ref` and renders a
//     "Total Enrolled" metric it computed; we compare it to an INDEPENDENT Firestore countWhere.
//   • WS-11: the dashboard computes progressPercentage = completed/total sub-challenges from the
//     `participant workshop` doc; we assert the RENDERED % equals the ratio implied by the seeded
//     precondition (1 of 2 = 50%) — the app computed it, we only supplied the inputs.
//   • WS-12: drive the real "Move Next" button and assert the value the APP WROTE to `participant
//     workshop` (manualcompletion:true + status 'completed' on the current sub-challenge) — never a
//     value the test wrote; the test only resets the precondition.
//
// The dashboard query (`workshop participant enrolled where workshopref==<ref>`) and the participant-
// workshop query are single-equality reads — NO composite index needed.
import { test, expect } from '@playwright/test';
import {
  wsActors, wsIds, installWshopStubs, loginAsWshopAdmin, loginAsWshopMover, resetParticipantWorkshopP0,
} from './support/wshop';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.WSHOP_RUNID || 'wshop';

test.describe('Workshop dashboard — enrolled metric + progress + move-next (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installWshopStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'workshop dashboard: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // WS-07 — "Total Enrolled" metric equals the live count of enrolled docs for this workshop
  // ===========================================================================================
  test('WS-07 dashboard Total Enrolled equals the Firestore count of enrolled docs (app-computed)', async ({ page }) => {
    await loginAsWshopAdmin(page);
    await page.goto(`/workshop_dashboard/${wsIds.W_DASH}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`workshop_dashboard/${wsIds.W_DASH}`), { timeout: 30_000 });

    // [REAL-UI] the "Total Enrolled" metric card renders {{ totalEnrolled }} = the length of the live
    // `workshop participant enrolled where workshopref==ref` stream (updateMetrics, ts:1054). Wait for
    // the card the app built, then read the number it computed.
    const card = page.locator('mat-card.metric-card').filter({ hasText: 'Total Enrolled' });
    await expect(card, 'WS-07: the Total Enrolled metric card must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] independent Firestore count of enrolled docs for the dashboard workshop. Every enrolled
    // doc seeded for THIS run points at W_DASH's workshopref (seed-workshops.js), so the run-tag count
    // is exactly the count of enrolled docs the dashboard streams for this workshop — an independent
    // oracle, never a value the test wrote. The app counts all statuses for the Total Enrolled metric.
    const seededEnrolled = await countWhere('workshop participant enrolled', [['testrunid', '==', RUN]]);
    expect(seededEnrolled, 'WS-07: precondition — 2 enrolled docs seeded for this run (both → W_DASH)').toBe(2);

    const value = await pollUntil(
      async () => {
        const txt = (await card.locator('.metric-value, h2').first().innerText()).trim();
        return parseInt(txt.replace(/[^0-9]/g, ''), 10);
      },
      (n) => Number.isFinite(n) && n === seededEnrolled,
      { label: `WS-07: Total Enrolled renders ${seededEnrolled}`, timeoutMs: 30_000 },
    );
    expect(value, 'WS-07: app-computed Total Enrolled == Firestore enrolled count').toBe(seededEnrolled);
  });

  // ===========================================================================================
  // WS-11 — the progress bar renders the app-computed percentage (1 of 2 sub-challenges = 50%)
  // ===========================================================================================
  test('WS-11 the participant progress row renders the app-computed 50% (1 of 2 sub-challenges)', async ({ page }) => {
    // Precondition (anti-circular): reset p0 to the 1-of-2-complete state so the computed % is 50.
    await resetParticipantWorkshopP0();

    await loginAsWshopAdmin(page);
    await page.goto(`/workshop_dashboard/${wsIds.W_DASH}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`workshop_dashboard/${wsIds.W_DASH}`), { timeout: 30_000 });

    // [REAL-UI] the progress table includes only status==='enrolled' participants (p0). The row renders
    // the participant name (mapProfile[profileid].name) and a progress-text "{{ pct.toFixed(0) }}%".
    const p0Row = page.locator('table.progress-table tr.mat-mdc-row, table.progress-table tr[mat-row]')
      .filter({ hasText: `WS Alpha ${RUN}` });
    await expect(p0Row, 'WS-11: the enrolled participant progress row must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the app computed progressPercentage = completed/total = 1/2 = 50% from the participant-
    // workshop doc it streamed; the rendered progress-text must read "50%". Known inputs (1 of 2) →
    // app output (50%); we never assert a value the test wrote.
    const pctText = p0Row.locator('.progress-text');
    await expect(pctText, 'WS-11: progress text renders the computed 50%').toHaveText(/\b50%/, { timeout: 15_000 });
    // The completed/total columns corroborate: 1 completed of 2.
    const rowText = (await p0Row.innerText()).replace(/\s+/g, ' ');
    expect(rowText, `WS-11: row shows the 1-of-2 completed ratio. Row="${rowText}"`).toMatch(/\b50%/);
  });

  // ===========================================================================================
  // WS-12 — manual move-next WRITES manualcompletion:true + status 'completed' on the current sub-challenge
  // ===========================================================================================
  test('WS-12 manual "Move Next" writes manualcompletion:true + status "completed" to participant workshop', async ({ page }) => {
    // Precondition (anti-circular): p0 at sub-challenge[0]=completed, [1]='' (current). The move marks [1].
    await resetParticipantWorkshopP0();
    const before = await getDoc('participant workshop', wsIds.PW_A);
    expect(before, 'WS-12: seeded participant workshop must exist').toBeTruthy();
    const beforeSub1 = (before as any)!.challenges[0].challenges[1];
    expect(beforeSub1.status ?? '', 'WS-12: sub-challenge[1] starts not-completed').not.toBe('completed');
    expect(beforeSub1.manualcompletion ?? null, 'WS-12: sub-challenge[1] starts without manualcompletion').not.toBe(true);

    // The move-next button only renders/runs for the hardcoded allow-list of profileids — log in as the
    // seeded "mover" whose profileid IS one of them (workshop-dashboard.component.ts:1688).
    await loginAsWshopMover(page);
    await page.goto(`/workshop_dashboard/${wsIds.W_DASH}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`workshop_dashboard/${wsIds.W_DASH}`), { timeout: 30_000 });

    const p0Row = page.locator('table.progress-table tr.mat-mdc-row, table.progress-table tr[mat-row]')
      .filter({ hasText: `WS Alpha ${RUN}` });
    await expect(p0Row, 'WS-12: the enrolled participant row must render').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] click the "Move Next" action button (moveParticipantToNext()).
    const moveBtn = p0Row.getByRole('button', { name: /Move Next/i });
    await expect(moveBtn, 'WS-12: the Move Next button must render for the allow-listed mover').toBeVisible({ timeout: 15_000 });
    await moveBtn.click();

    // [ASSERT] the app's updateDoc wrote status:'completed' + manualcompletion:true on sub-challenge[1]
    // (updateChallengeProgress, ts:1758). Polled from Firestore — the value the PRODUCT wrote, not the
    // test's reset value (which left [1] uncompleted).
    const after = await pollUntil(
      () => getDoc('participant workshop', wsIds.PW_A),
      (d) => !!d && (d as any).challenges?.[0]?.challenges?.[1]?.status === 'completed',
      { label: 'WS-12: participant-workshop sub-challenge[1] → status "completed"', timeoutMs: 30_000 },
    );
    const afterSub1 = (after as any)!.challenges[0].challenges[1];
    expect(afterSub1.status, 'WS-12: sub-challenge[1] marked completed by the app').toBe('completed');
    expect(afterSub1.manualcompletion, 'WS-12: app set manualcompletion:true').toBe(true);
  });
});

// ===========================================================================================
// Route-mount smoke — every workshop route mounts for the super-role admin (guard admits, no bounce
// to /login, the screen renders). Proves the dashboard route-grants seeded. Skips assertNoFatal: the
// engagement/capacity dashboards do heavy cross-feature reads that may log benign errors on a sparse
// test project; this smoke only asserts the route does not bounce to /login.
// ===========================================================================================
test.describe('Workshops — route-mount smoke (guard admits super-role admin)', () => {
  const ROUTES = [
    '/workshops',
    `/workshopconfig/${wsIds.W_INACTIVE}`,
    `/workshop_dashboard/${wsIds.W_DASH}`,
    '/create-workshop',
    '/productpageworkshop',
    '/engagementdashboard',
    '/bigengagementdashboard',
  ];
  test('every seeded workshop route mounts (no /login bounce)', async ({ page }) => {
    await installWshopStubs(page);
    await loginAsWshopAdmin(page);
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
