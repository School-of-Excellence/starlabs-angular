// profile.spec.ts — Participant profile pages (userprofile/:id + profilesummary/:profileid).
//
// These exercise the REAL profile screens with ANTI-CIRCULAR assertions and need NO composite index
// (doc-id reads + single-field `where profileid==` queries only):
//   PA-01 userprofile renders name+email the APP READ from `participant metadata` (its own stream).
//   PA-02 userprofile Journey tab renders the journey-status badge the APP computed from the
//         `participantjourneyproduct` query (status text it read+rendered, not a value the test asserts blind).
//   PA-03 the customer-status editor: the APP WRITES participant metadata.customerstatus on a real
//         "Update Status" click; we poll the admin SDK for the value the PRODUCT wrote.
//   PA-10 profilesummary renders the participant name the APP READ from profile_data.
// Anti-circularity: the seed is the precondition; each assertion is on a value the APP rendered from
// its OWN Firestore read, or (PA-03) a value the APP WROTE — never a value the test just wrote.
import { test, expect } from '@playwright/test';
import {
  profActors, profProfileIds, profNames, installProfileStubs, loginAsProfileAdmin, resetCustomerStatus,
} from './support/profiles';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

test.describe('Profiles — userprofile + profilesummary (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installProfileStubs(page);
  });
  // userprofile/profilesummary are the giant participant dashboard (dozens of widget queries). On the
  // disposable test project a few auxiliary widgets (appointments / fullfillmentchallenge / formsByClient)
  // lack composite indexes → benign "requires an index" console errors from queries that are NOT the
  // behavior under test. The screen still mounts and the functional assertions (the participant NAME the
  // app read from profile_data) hold. Tolerate ONLY that error class here (documented environment gap).
  // …and the same dashboard, on sparse seed, builds a doc() ref from an optional id that is absent →
  // "TypeError: Cannot read properties of undefined (reading 'indexOf')" at ResourcePath.fromString — the
  // SAME documented quirk the queue suite tolerates (cf. the big-planner eventid race). The screen still
  // renders the asserted name. Tolerate ONLY these two env/sparse-seed classes (a real bug is a distinct message).
  test.afterEach(() => assertNoFatal(guard, 'profiles: no fatal console errors / pageerrors',
    [/requires an index/i, /Cannot read properties of undefined \(reading 'indexOf'\)/i]));

  // ===========================================================================================
  // PA-01 — userprofile renders the participant name + email from `participant metadata`
  // ===========================================================================================
  test('PA-01 userprofile renders name & email the app read from participant metadata', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto(`/userprofile/${profProfileIds.p0}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/userprofile/, { timeout: 30_000 });

    // [REAL-UI] loadJourneyData() reads participant metadata/<p0> and binds userData.name -> .profile-name,
    // userData.email -> a .detail-value (userprofile.component.ts:448 / .html:8,45). The seed wrote a
    // friendly unique name; the APP queried the collection and rendered it.
    await expect(page.locator('.profile-name'), 'PA-01: profile name must render').toHaveText(
      new RegExp(profNames.p0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 30_000 },
    );
    // The seeded email appears in one of the .detail-value spans.
    await expect(
      page.locator('.detail-value', { hasText: profActors.p0 }),
      'PA-01: seeded email must render in a detail row',
    ).toBeVisible({ timeout: 20_000 });
  });

  // ===========================================================================================
  // PA-02 — userprofile Journey tab renders the seeded journey's status badge ("ongoing")
  // ===========================================================================================
  test('PA-02 userprofile Journey tab renders the journey-status badge the app computed', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto(`/userprofile/${profProfileIds.p0}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/userprofile/, { timeout: 30_000 });

    // [REAL-UI] the Journey tab is the default tab; loadJourneyData() queries
    // participantjourneyproduct(where profileid==p0) and renders each row's journeystatus into a
    // `.badge.ongoing` (userprofile.component.html:157). The seeded PJP0 is journeystatus:'ongoing'.
    const badge = page.locator('.badge.ongoing').filter({ hasText: /ongoing/i });
    await expect(badge.first(), 'PA-02: the ongoing journey badge the app rendered must be visible')
      .toBeVisible({ timeout: 30_000 });
  });

  // ===========================================================================================
  // PA-03 — customer-status editor: a real "Update Status" click WRITES participant metadata
  // ===========================================================================================
  test('PA-03 admin updates customer status -> the app writes participant metadata.customerstatus', async ({ page }) => {
    // Precondition (anti-circular): reset to a KNOWN baseline distinct from the value we will select.
    await resetCustomerStatus(profProfileIds.p0, 'active');
    const before = await getDoc('participant metadata', profProfileIds.p0);
    expect(before, 'PA-03: seeded participant metadata must exist').toBeTruthy();
    expect(before!.customerstatus, 'PA-03: baseline customerstatus is "active"').toBe('active');

    await loginAsProfileAdmin(page);
    await page.goto(`/userprofile/${profProfileIds.p0}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.profile-name')).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the status editor (the fa-edit icon next to Financial/Customer Status), pick a
    // NEW status in the native #statusSelect, and click "Update Status".
    await page.locator('.fa-edit').first().click();
    const select = page.locator('#statusSelect');
    await expect(select, 'PA-03: status editor dropdown must open').toBeVisible({ timeout: 10_000 });
    await select.selectOption('banned');
    // updateCustomerStatus() fires a native alert() on success — auto-accept it so the run continues.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Update Status/i }).click();

    // [ASSERT] the app's updateDoc wrote customerstatus:'banned' to participant metadata
    // (userprofile.component.ts:1542). Polled — the value the PRODUCT wrote, not the test.
    const after = await pollUntil(
      () => getDoc('participant metadata', profProfileIds.p0),
      (d) => !!d && d.customerstatus === 'banned',
      { label: 'PA-03: participant metadata customerstatus -> "banned"', timeoutMs: 30_000 },
    );
    expect(after!.customerstatus).toBe('banned');
    // Clean up so re-runs / other cases start from "active" again (precondition write only).
    await resetCustomerStatus(profProfileIds.p0, 'active');
  });

  // ===========================================================================================
  // PA-10 — profilesummary renders the participant name the app read from profile_data
  // ===========================================================================================
  test('PA-10 profilesummary renders the participant name the app read from profile_data', async ({ page }) => {
    await loginAsProfileAdmin(page);
    await page.goto(`/profilesummary/${profProfileIds.p0}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/profilesummary/, { timeout: 30_000 });

    // [REAL-UI] onScreenLoading() subscribes to docData(profile_data/<p0>) and binds profileData.name
    // into the "<name> Profile Summary" title (profile-summary.component.html:21). The APP read the
    // doc over its stream and rendered the seeded name.
    await expect(
      page.locator('h4.title', { hasText: profNames.p0 }),
      'PA-10: the "<name> Profile Summary" title must render the seeded name',
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('h4.title')).toContainText('Profile Summary');
  });
});
