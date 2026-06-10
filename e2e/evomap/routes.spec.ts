// routes.spec.ts — Evolution Mapping route-mount smoke + the /participant_videos_mapping summary-stat
// anti-circular case (EM-12). The smoke proves the dashboard route-grants seeded (guard admits, no
// /login bounce); EM-12 proves the catalogue screen DERIVES its participant total from its own Firestore
// query (compared to the live admin count) rather than echoing a seeded constant.
//
// Recon: e2e/recon-allcomp/evolution-mapping.md (EM-12 + route-mount smoke).
import { test, expect } from '@playwright/test';
import { installEvomapStubs, loginAsEvoAdmin, countMetadataWithName, PVM_LASTVIDEO_INDEX_ERR } from './support/evomap';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

test.describe('Evolution Mapping — participant_videos_mapping summary (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvomapStubs(page);
  });
  // The "Last Video" column query needs a composite index not provisioned on the test project (returned
  // in neededIndexes) — an auxiliary query, not the asserted stat — so it is ignorable here.
  test.afterEach(() => assertNoFatal(guard, 'participant_videos_mapping: no fatal console errors (last-video index aux query excepted)', [PVM_LASTVIDEO_INDEX_ERR]));

  // ===========================================================================================
  // EM-12 — the catalogue screen's "Participants" stat is the app-derived count of participant metadata
  // ===========================================================================================
  // RE-DERIVED (was fixme): the original premise `rendered == countWhere('participant metadata')` was
  // wrong because the screen's fetchParticipants() runs query(collection('participant metadata'),
  // orderBy('name')); Firestore's orderBy SILENTLY drops docs missing the `name` field, so the rendered
  // stat (participantOptions.length) is the count of docs WITH a name — strictly <= the raw count. We now
  // assert against countMetadataWithName(), which mirrors orderBy('name'). Anti-circular: the app computes
  // the stat from its own query; the admin independently counts the same name-having population.
  test('EM-12 /participant_videos_mapping Participants stat equals the name-having participant-metadata count', async ({ page }) => {
    await loginAsEvoAdmin(page);
    await page.goto('/participant_videos_mapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant_videos_mapping/, { timeout: 30_000 });

    // [REAL-UI] fetchParticipants() → participantOptions; fetchSummaryStats() sets
    // summaryStats.totalParticipants = participantOptions.length, rendered in the FIRST "Participants" card.
    const statCard = page.locator('.summary-card').first();
    await expect(statCard, 'EM-12: the Participants summary card must render').toBeVisible({ timeout: 30_000 });
    await expect(statCard.locator('.summary-label')).toHaveText(/Participants/i, { timeout: 10_000 });
    // Poll the rendered number until it settles to a positive value (fetchSummaryStats resolves async).
    let rendered = 0;
    await expect(async () => {
      const countText = (await statCard.locator('.summary-count').first().innerText()).trim();
      rendered = parseInt(countText, 10);
      expect(Number.isFinite(rendered) && rendered > 0, `EM-12: stat must be a positive number (got "${countText}")`).toBe(true);
    }).toPass({ timeout: 30_000 });

    // [ASSERT] the app-derived stat equals the live name-having `participant metadata` count (the app
    // computed participantOptions.length from orderBy('name'); the admin mirrors that filter independently).
    const liveWithName = await countMetadataWithName();
    expect(rendered, 'EM-12: rendered Participants stat == live name-having participant-metadata count').toBe(liveWithName);
    // And it includes at least the 6 run-seeded metadata rows (all carry a name).
    expect(rendered, 'EM-12: at least the 6 seeded metadata rows are counted').toBeGreaterThanOrEqual(6);
  });
});

// ===========================================================================================
// Route-mount smoke — every Evolution Mapping route mounts for the seeded admin (guard admits, no
// bounce to /login). Proves the dashboard route-grants seeded for this group. Skips assertNoFatal
// (a mount smoke only asserts the route does not bounce to /login).
// ===========================================================================================
test.describe('Evolution Mapping — route-mount smoke (guard admits admin)', () => {
  const ROUTES = ['/evolutionmapping', '/participant_videos_mapping'];
  test('every seeded Evolution Mapping admin route mounts (no /login bounce)', async ({ page }) => {
    await installEvomapStubs(page);
    await loginAsEvoAdmin(page);
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
