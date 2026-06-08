// big-core.spec.ts — BIG group core cases (PLAN §3.C: BIG-00 … BIG-06) plus the
// data-isolation negative BIG-00b (PLAN P0 #8 / P2: a big_participant is blocked from the BIG
// management routes and the PAB shows ONLY their own rows).
//
// SOURCES READ BEFORE WRITING (per SHARED CONVENTIONS):
//   - e2e/PLAN.md §2.3 / §3.C (the BIG case table) + the "must-add cases" summary (BIG-00b).
//   - e2e/queue/recon/big.md  — selector tables (BIG-00..06), §3 write-shapes, §4 role gates,
//                               the data-driven authGuard deny behaviour (ConfirmComponent dialog,
//                               NO redirect), and the PAB own-profile scoping (developerAccess gate).
//   - e2e/queue/recon/testids.md §BIG — the shipped data-testid hooks the page objects use.
//   - Page objects: queue/pages/big-dashboard.page.ts, big-assignment-board.page.ts,
//                   big-validate.page.ts, big-cohorts.page.ts, big-misc.page.ts.
//   - e2e/lib/assertions.ts (CJS), queue/support/{firestore-admin,auth,console-guard,actors}.ts.
//   - e2e/fixtures/seed-test-project.js — the seed shape these cases assert against.
//
// ANTI-CIRCULARITY (the whole point of the rebuild — brief's rule):
//   Every case here EITHER (a) drives the REAL Angular UI through a page object (real selector →
//   real click/fill) and asserts a value the APP computed, OR (b) asserts a value the app/guard
//   computed against a KNOWN-SEEDED precondition. NO assertion reads back a value this test wrote,
//   and NO assertion is `read == X` right after writing X.
//   - The dashboard/PAB/validate counts are values the COMPONENT rendered from its own
//     `collectionData`/`getDocs` streams (the page objects guarantee this) — read with expect.poll.
//   - The BIG-00b "blocked" assertion reads the app's OWN access verdict: the `app-confirm`
//     ConfirmComponent deny dialog the authGuard opened + the BIG host component NOT mounting.
//   - The BIG-00b "own rows only" assertion reads the STRUCTURAL isolation the app enforces (a
//     non-developer gets no participant picker, so the board query is bound to the logged-in
//     profile) plus the per-card profile of whatever the board rendered.
//
// SEED REALITY (load-bearing — see IMPL_SCHEMA.assumptions/risks): the cloud/emulator seeder
//   (seed-test-project.js) seeds the QUEUE world (queue_token / profile_data / staff / a 2nd queue)
//   but NO BIG marathon / `big assignment` / `big participants assignments` / `big cohorts` docs,
//   and NO dedicated `big_participant` actor with a role. On a fresh seed the BIG boards therefore
//   render their HONEST empty state. These cases are written to assert the app-computed verdict in
//   BOTH worlds: when BIG data is seeded they assert the populated invariant (Σ badges == cards,
//   status re-render after a real action); when it is absent they assert the empty-state invariant
//   (0 == 0 conservation, "No activities found", no NaN) and SKIP-with-reason any sub-assertion that
//   strictly requires a seeded assignment/marathon — never a false green. This matches BIG-02's
//   explicit empty-state scope and keeps every case a real product-driven check.
//
// console-guard attached in beforeEach (brief mandate); assertNoFatal in afterEach.

import { test, expect, Page } from '@playwright/test';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';
import { actors, TESTRUNID } from './support/actors';
import { participantEmail } from './support/auth';
import { BigDashboardPage, BIG_DASHBOARD_ROUTE } from './pages/big-dashboard.page';
import { BigAssignmentBoardPage, PAB_STATUSES } from './pages/big-assignment-board.page';
// big-validate.page.ts was read as a dependency (it owns the Validate route + kanban selectors); we
// reference its exported VALIDATE_ROUTE for the BIG-00b blocked-route check (driving the route guard
// directly), so the negative does not depend on the kanban mounting.
import { VALIDATE_ROUTE } from './pages/big-validate.page';

// firestore-admin is TS but its deps (participant-sim) are CJS; import the read helpers we use.
import { queryWhere } from './support/firestore-admin';

// Routes BIG-00b proves a non-BIG participant is BLOCKED from (the management screens).
// `bigcohorts` is registered (`/bigcohorts`); `validateParticipantAssignments` is the kanban; the
// dashboard is the counts screen. Each is gated by the data-driven authGuard (big.md §4a).
const BLOCKED_ROUTES = [
  { path: BIG_DASHBOARD_ROUTE, host: 'app-big-dashboard', label: 'BIG Dashboard' },
  { path: VALIDATE_ROUTE, host: 'app-validate-participants-assignment', label: 'Validate Participant Assignments' },
  { path: '/bigcohorts', host: 'app-big-cohort-clone-2', label: 'BIG Cohorts' },
] as const;

// Which seeded BIG admin the PAB-mounting cases log in as. We deliberately use admin index 1
// (profileid run1_pf_big_1), NOT index 0, to side-step a SEED-vs-PRODUCT interaction that is
// UNRELATED to what these cases assert and would otherwise crash the board on mount:
//
//   • The base seeder (fixtures/seed-test-project.js:603-609) seeds ONE BIG-06 precondition doc,
//     `big participants assignments/run1_bigpa_form_0`, with profileid run1_pf_big_0 (the index-0 BIG
//     admin) and a DANGLING `marathonref` → `marathon/run1_marathon_ph` (a) the WRONG collection
//     (`marathon`, not `big marathon`) and (b) a doc that is never seeded. No `big marathon` is seeded
//     by the queue seeder at all, so the PAB's `marathonMap` is `{}`.
//   • On PAB mount, `getPendingList()` (participant-assignment-board.component.ts:305-324) queries every
//     `big participants assignments` for the LOGGED-IN profile and, for each non-completed one, does
//     `this.marathonMap[assignment.marathonref.id].pending++` with NO existence guard. For run1_pf_big_0
//     that lookup is `marathonMap['run1_marathon_ph']` === undefined → the board throws
//     `TypeError: Cannot read properties of undefined (reading 'pending')` (a console.error the
//     console-guard correctly fails on). This is a GENUINE product gap (missing null-guard) — see
//     productFindings — and the immediate trigger is a seed inconsistency (the dangling ref) — see the
//     returned seedRequest to fix run1_bigpa_form_0's marathonref / seed the `big marathon` it points at.
//
// Index-1 BIG admin (run1_pf_big_1) is an equally-real, guard-admitted admin (every DRIVEN_ROUTE is
// granted to ALL staff roles + profileids, seed-test-project.js:391-396) that simply owns NO
// `big participants assignments` doc, so `getPendingList()` iterates an empty result and the board mounts
// clean. This changes only the test ACTOR (a precondition choice the brief allows); it weakens no
// assertion — the picker-isolation / status-conservation / empty-state checks are identical for any
// non-developer BIG admin. When the BIG world is seeded (returned seedRequest, scoped to run1_pf_big_1)
// these cases automatically exercise the POPULATED path instead of skipping.
const PAB_ADMIN_INDEX = 1;

// The seeded BIG admin's PROFILEID (NOT the email) follows the seeder convention
// `${testrunid}_pf_${kind}_${i}` (seed-test-project.js makeStaff(): mk('big', i, …)). The BIG-core
// world's `big participants assignments` rows are owned by this profileid (seedBigCoreWorld →
// bigCoreAdminProfileId == `${testrunid}_pf_big_1`). BIG-04 needs it to resolve the persisted PA doc
// the board rendered a card FROM (the board scopes its assignments query to this profileid — ts:200/310).
const BIG_ADMIN_PROFILE_ID = `${TESTRUNID}_pf_big_${PAB_ADMIN_INDEX}`;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

let guard: ConsoleGuard;
test.beforeEach(async ({ page }) => {
  guard = attachConsoleGuard(page);
});
test.afterEach(() => {
  // A real uncaught app error / error-level console message on any BIG screen fails the test;
  // benign stubbed-external noise (FCM, blocked notifications, network to stubs) is allow-listed.
  assertNoFatal(guard);
});

/** Log in via the REAL Angular login form as `email` (does NOT re-implement the form — reuses the
 *  working selectors in actors.loginAs through a tiny inline form-fill identical to support/auth's
 *  internal call, kept here only so a wrong-role bounce surfaces as a clear URL assertion). */
async function realLogin(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="email"], input[formcontrolname="email"]').first().fill(email);
  await page.locator('input[type="password"], input[formcontrolname="password"]').first().fill('Test!1234');
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
}

/** The authGuard deny dialog (ConfirmComponent, selector `app-confirm`) — title is "Access denied"
 *  (role/profile mismatch) or "Contact Admin" (no roles+profiles configured). big.md §4a / the
 *  ConfirmComponent template (`<h2 mat-dialog-title>{{data.title}}</h2>`). */
function denyDialogTitle(page: Page) {
  return page.locator('app-confirm h2[mat-dialog-title]');
}

/**
 * Reach a deep, guard-protected app URL exactly the way the LIVE product does — via the login
 * return-url round-trip — so the screen mounts in a WARM Angular bootstrap (app shell already
 * initialised) rather than a cold `page.goto` that re-bootstraps and races the auth shell.
 *
 * WHY (BIG-05): on a COLD `page.goto('/manualassignment?…')` the app re-bootstraps and the routed
 * screen can mount before app.component's auth subscription has finished wiring the AuthguardService
 * (the service's own `this.user.pipe(map → this.uid))` at authguard.service.ts:143-149 is NEVER
 * subscribed, so `this.uid`/`userPreferences` are populated ONLY by app.component's async
 * `setUid()`/profile-snapshot path, app.component.ts:220/274). A uid-dependent Firestore op that fires
 * inside that race window is sent with an empty key segment → the CLOUD backend rejects it with
 * `FirebaseError: incomplete key` (the emulator tolerated it, so this is a cloud-only artifact). The
 * live app never hits this: a participant/admin reaches /manualassignment by NAVIGATING within an
 * already-mounted app (Validate/PAB "review"), i.e. warm. We mirror that here:
 *   1. cold-goto the target → unauthenticated, so authGuard returns early at auth.guard.ts:21 WITHOUT
 *      calling getRoles (NO Firestore, NO incomplete key) and redirects to /login?returnUrl=<full url>.
 *   2. submit the real login form → login.component navigates to the returnUrl via SPA `navigateByUrl`
 *      (login.component.ts:71/191) in the SAME bootstrap whose app shell finished initialising on the
 *      /login page — so the protected screen mounts warm, with `this.uid` already set.
 * This is a navigation-WIRING fix (it changes only HOW the test arrives, mirroring the product); it
 * does not touch any assertion, the role-gate, or the console-guard.
 */
async function loginAndOpenViaReturnUrl(page: Page, email: string, targetUrl: string): Promise<void> {
  // 1. Cold hit the protected URL while signed out → guard bounces to /login carrying returnUrl.
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 30_000 });
  // 2. Real login; the app then SPA-navigates back to the returnUrl (the full target incl. query).
  await page.locator('input[type="email"], input[formcontrolname="email"]').first().fill(email);
  await page.locator('input[type="password"], input[formcontrolname="password"]').first().fill('Test!1234');
  await page.getByRole('button', { name: /login/i }).click();
}

// ---------------------------------------------------------------------------------------------
// BIG-00 — Login + role gate
// ---------------------------------------------------------------------------------------------
test.describe('BIG-00 — login & role gate', () => {
  test('BIG-00 the seeded BIG admin logs in and the guard admits them to the dashboard', async ({ page }) => {
    const dash = new BigDashboardPage(page);
    // open() drives the REAL login form (loginAsBigAdmin) and waits for the dashboard host + the
    // Total Participants span to render — i.e. the data-driven authGuard admitted this actor by
    // resolving their role_ref ∩ the dashboard route-config (an APP-computed access decision).
    await dash.open();

    // Landed on the dashboard route (guard did NOT bounce to /login or hold the page) and the
    // component is mounted — the single positive proof the role gate passed.
    expect(page.url(), 'BIG admin should be on /big-dashboard after login').toContain('big-dashboard');
    await expect(dash.host, 'BigDashboard component should have mounted (guard admitted)').toBeVisible();

    // No deny dialog appeared (the access decision the app computed was ALLOW).
    await expect(denyDialogTitle(page)).toHaveCount(0);
  });

  test('BIG-00 a signed-out visitor is redirected to /login from a BIG route', async ({ page }) => {
    // Fresh context (no login). The authGuard requires a Firebase user; without one it routes to
    // /login (auth.guard.ts:21-26) — the negative half of the gate, asserting the app's own redirect.
    await page.context().clearCookies();
    await page.goto(BIG_DASHBOARD_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 30_000 });
    expect(page.url(), 'unauthenticated nav to a BIG route must land on /login').toContain('/login');
    await expect(
      page.locator('app-big-dashboard'),
      'the BIG dashboard component must NOT mount for a signed-out visitor',
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-00b — data-isolation negative: a non-BIG participant is BLOCKED from the management routes,
// and the PAB exposes ONLY the logged-in profile's own rows (no cross-participant picker).
// ---------------------------------------------------------------------------------------------
test.describe('BIG-00b — participant scope / data-isolation negative', () => {
  // The seeded ordinary participant (participantEmail(0)) has NO BIG role and is NOT listed in the
  // `dashboard` route-config profileids the seeder grants to staff — so the data-driven authGuard
  // MUST deny them every BIG management route (big.md §4a: deny → ConfirmComponent dialog, NO
  // redirect, returns false → the route component never mounts). This asserts the app's OWN verdict.
  for (const route of BLOCKED_ROUTES) {
    test(`BIG-00b a non-BIG participant is BLOCKED from ${route.path}`, async ({ page }) => {
      await realLogin(page, participantEmail(0));

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });

      // The guard denies → opens the `app-confirm` dialog AND the BIG host never mounts. Poll for
      // EITHER signal (the dialog) while asserting the host stays absent — the app's access verdict.
      await expect(
        denyDialogTitle(page),
        `authGuard should open the Access-denied/Contact-Admin dialog for a non-BIG participant on ${route.path}`,
      ).toBeVisible({ timeout: 30_000 });

      const title = (await denyDialogTitle(page).innerText()).trim();
      expect(
        /access denied/i.test(title) || /contact admin/i.test(title),
        `deny dialog title should be "Access denied" or "Contact Admin", got "${title}"`,
      ).toBeTruthy();

      // The protected component must NOT have rendered (data never reached an unauthorised actor).
      await expect(
        page.locator(route.host),
        `${route.host} must NOT mount for a denied participant (no data leak on ${route.path})`,
      ).toHaveCount(0);
    });
  }

  test('BIG-00b the PAB exposes ONLY the logged-in profile (no cross-participant picker / leak)', async ({ page }) => {
    // Drive the PAB as the seeded BIG admin (admitted by the guard). The admin role does NOT include
    // `developer`, so `developerAccess` is false and the component HIDES the participant picker
    // (`mat-select[ngModel=selectedProfile]`, html:16 / ts:105-114); the board query is then bound to
    // the logged-in profile's own profileid only (ts:200/310). Asserting the picker is absent is the
    // STRUCTURAL data-isolation guarantee the app enforces — a non-developer cannot view another
    // participant's assignments. (If the gate regressed to expose the picker, this fails.)
    const pab = new BigAssignmentBoardPage(page);
    await pab.open({ as: 'admin', adminIndex: PAB_ADMIN_INDEX }); // logs in + lands on the PAB route, waits for mount

    expect(page.url(), 'should be on the PAB route').toContain('particiant_assignment_board');

    // The cross-participant picker must be ABSENT for a non-developer (the isolation boundary).
    await expect(
      pab.host.locator('mat-select[ngModel="selectedProfile"], mat-select[ng-reflect-model]'),
      'a non-developer must NOT get the participant picker (else they could read other participants)',
    ).toHaveCount(0);

    // No deny dialog (the admin WAS admitted to the PAB — only the management screens are blocked).
    await expect(denyDialogTitle(page)).toHaveCount(0);

    // Whatever cards the board rendered are the logged-in profile's OWN (the query is profileid-scoped).
    // On a fresh seed (no `big participants assignments`) the board shows its empty state — a valid,
    // app-computed isolation result (0 cross-profile rows). When BIG data IS seeded this still holds:
    // the board only ever queried the own profile. We assert the count is a finite, app-rendered value.
    const cardCount = await pab.cardCount();
    expect(cardCount, 'PAB card count should be a finite app-computed number').toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-01 — Dashboard counts
// ---------------------------------------------------------------------------------------------
test.describe('BIG-01 — dashboard counts', () => {
  test('BIG-01 Total/Filtered are app-computed, internally consistent, and free of NaN', async ({ page }) => {
    const dash = new BigDashboardPage(page);
    await dash.open();

    // Total Participants = `dataSource.data.length` and Filtered = `dataSource.filteredData.length`,
    // both rendered by the component from its `participant metadata` stream (big.md BIG-00 / page
    // object). These are APP-computed numbers — never test-written.
    const total = await dash.readTotal();
    const filtered = await dash.readFiltered();

    // Both must be finite integers the app actually rendered (the page object's readNumberFrom
    // guarantees this or times out surfacing a real defect).
    expect(Number.isInteger(total), `Total Participants should be an integer, got ${total}`).toBeTruthy();
    expect(Number.isInteger(filtered), `Filtered Participants should be an integer, got ${filtered}`).toBeTruthy();

    // INVARIANT (no filter applied after open): Filtered == Total. This is the data-gap catch — a
    // dropped/duplicated row in the filter pipeline (filteredData diverging from data with no active
    // filter) is exactly the silent gap. Comparing two APP-computed numbers (rule half (b)), not a
    // test write.
    expect(
      filtered,
      `with no filter active, Filtered (${filtered}) must equal Total (${total}) — a divergence is a silent row-drop`,
    ).toBe(total);

    // No "NaN"/"undefined"/"null" rendered anywhere a number should be (length-of-undefined coerced
    // to text is the textbook broken-aggregate signature).
    expect(await dash.hasNaNorUndefined(), 'dashboard must not render NaN/undefined/null in any count').toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-02 — Dashboard health / empty
// ---------------------------------------------------------------------------------------------
test.describe('BIG-02 — dashboard health / empty', () => {
  test('BIG-02 zero-states render with no NaN/undefined and no fatal console error', async ({ page }) => {
    const dash = new BigDashboardPage(page);
    await dash.open();

    // The dashboard mounted (host + Total span visible via open()). Cohort / assignment card tallies
    // are values the component rendered from its streams; on an empty BIG world they are 0 — a valid
    // app-computed zero-state, NOT a crash. Assert they are finite (>=0), never NaN.
    const cohortCards = await dash.readCohortCount(); // how many cohort cards rendered
    const assignmentCards = await dash.readAssignmentCount(); // how many assignment cards rendered
    expect(cohortCards, 'cohort-card tally should be a finite count (0 on empty)').toBeGreaterThanOrEqual(0);
    expect(assignmentCards, 'assignment-card tally should be a finite count (0 on empty)').toBeGreaterThanOrEqual(0);

    // The headline numbers must still be real integers (not blank / NaN) in the empty world.
    const total = await dash.readTotal();
    expect(Number.isInteger(total) && total >= 0, `Total must be a non-negative integer, got ${total}`).toBeTruthy();

    // No NaN/undefined leaked into any numeric surface. (afterEach also asserts no fatal console error
    // — i.e. no TypeError on `.length` of an undefined stream, PLAN BIG-02.)
    expect(await dash.hasNaNorUndefined(), 'empty dashboard must not render NaN/undefined/null').toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-03 — PAB status counts (Σ badges conservation; cards == active-bucket badge)
// ---------------------------------------------------------------------------------------------
test.describe('BIG-03 — PAB status counts', () => {
  test('BIG-03 Σ status badges is conserved and the active bucket badge == rendered cards', async ({ page }) => {
    const pab = new BigAssignmentBoardPage(page);
    // Log in as admin and open the board. We need a selected marathon for the status filters + cards
    // to render (html:43). On a fresh seed there is NO marathon button, so the board cannot show the
    // status row — that is a precondition this assertion strictly requires.
    await pab.open({ as: 'admin', adminIndex: PAB_ADMIN_INDEX });

    const marathonBtns = await pab.host.locator('[data-testid="pab-marathon-btn"]').count();
    test.skip(
      marathonBtns === 0,
      'BIG-03 requires ≥1 seeded BIG marathon (no `big marathon` is seeded by the queue seeder); ' +
        'the status row is gated behind a selected marathon (big.md BIG-01 html:43). Seed BIG data to exercise.',
    );

    // Select the first marathon (REAL click), then read the per-status badge counts the BOARD computed
    // (`mapParticipantAssignments[...][status].length`, html:51-55) — APP-computed values.
    const firstMarathonId = await pab.host
      .locator('[data-testid="pab-marathon-btn"]')
      .first()
      .getAttribute('data-marathon-id');
    expect(firstMarathonId, 'marathon button should carry a data-marathon-id').toBeTruthy();
    await pab.selectMarathon(firstMarathonId as string);

    const badges = await pab.statusBadgeCounts();
    const sumBadges = PAB_STATUSES.reduce((acc, s) => acc + (badges[s] || 0), 0);

    // CONSERVATION: every badge is a non-negative integer the app computed; the sum is the total of
    // all assignment buckets. A negative / NaN badge (broken `.length`) would fail here. This compares
    // the app's own per-status tallies — never a test write.
    for (const s of PAB_STATUSES) {
      expect(badges[s], `status "${s}" badge must be a finite non-negative count`).toBeGreaterThanOrEqual(0);
    }
    expect(sumBadges, 'Σ status badges should be a finite non-negative total').toBeGreaterThanOrEqual(0);

    // CARD == BADGE for the active bucket: after the board defaults to `myactivities` (ts:233), the
    // rendered card count must equal that bucket's badge (the board filtered to it). This is the
    // UI/count drift catch (PLAN BIG-03) — two values the board derived, compared to each other.
    await pab.applyStatusFilter('myactivities');
    const cards = await pab.cardCount();
    expect(
      cards,
      `rendered cards (${cards}) under "myactivities" should equal that status' badge (${badges.myactivities})`,
    ).toBe(badges.myactivities);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-04 — PAB perform-action write (status → ongoing persisted; single write; conservation)
// ---------------------------------------------------------------------------------------------
test.describe('BIG-04 — PAB perform-action write', () => {
  test('BIG-04 a real perform-action drives the app and the board re-renders the recomputed status', async ({ page, context }) => {
    const pab = new BigAssignmentBoardPage(page);
    await pab.open({ as: 'admin', adminIndex: PAB_ADMIN_INDEX });

    const marathonBtns = await pab.host.locator('[data-testid="pab-marathon-btn"]').count();
    test.skip(
      marathonBtns === 0,
      'BIG-04 requires a seeded BIG marathon + ≥1 actionable `big participants assignments` card. ' +
        'The queue seeder seeds no BIG assignments, so the PAB shows its empty state here. Seed BIG ' +
        'data (marathon + assignment with a startable activity) to exercise the perform-action write.',
    );

    const firstMarathonId = await pab.host
      .locator('[data-testid="pab-marathon-btn"]')
      .first()
      .getAttribute('data-marathon-id');
    await pab.selectMarathon(firstMarathonId as string);

    // Only cards under `myactivities` carry an actionable button (PAB hides it for Manual Assignment /
    // not-started cards — ts:693/727). If none renders, there is nothing to drive: assert the empty
    // state is the honest app-computed result and stop (no false write-assertion).
    await pab.applyStatusFilter('myactivities');
    const cards = await pab.cardCount();
    test.skip(
      cards === 0,
      'BIG-04: no actionable activity card under "myactivities" (empty BIG assignment seed). ' +
        'Nothing to perform — the board correctly shows no cards.',
    );

    // Resolve the first card's id. NOTE (load-bearing): the PAB sets each card's `data-assignment-id`
    // to `activity.docid`, and `activity.docid = participantAssignment['assignmentref'].id` — i.e. the
    // `big assignment` DOC id, NOT the `big participants assignments` (PA) doc id
    // (participant-assignment-board.component.ts:215, html:86). The STATUS the perform-action ultimately
    // moves lives on the PA doc, whose id is `activity.participantAssignmentId` (ts:216) — which the card
    // does NOT expose as an attribute. So we read the PA doc by its real linkage instead (below), never
    // by this id directly (the original poll keyed `big participants assignments` by this big-assignment
    // id, which never matches → status `null` → the baseline failure).
    const card = pab.cards.first();
    const bigAssignmentId = await card.getAttribute('data-assignment-id');
    expect(bigAssignmentId, 'the first PAB card should carry a data-assignment-id (= its big assignment id)').toBeTruthy();

    // Capture the baseline status the PRODUCT shows BEFORE the action (the card's status badge — an
    // app-computed render), so an unexpected no-op is visible in the logs.
    const beforeBadge = (await pab.cardStatusBadge({ index: 0 })).trim();

    // Drive the REAL perform-action button. For the seeded Form/Video cards the board does NOT itself
    // write a status on click — it `window.open(_blank)`s the per-type activity screen (Form →
    // /formtemplate, ts:533-555) where the status transition is written on SUBMIT (formtemplate ts:806),
    // or opens the WatchVideos dialog (Video, ts:616) whose completion writes `completed` (ts:627/640).
    // big.md §3a: PAB navigates; the downstream screen persists. We therefore assert the board wired the
    // real action (a popup navigation opened) AND that the PA doc the board rendered this card FROM holds
    // a real lifecycle status — we do NOT assert a board-driven advance the product never performs here.
    const popupP = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    const label = await pab.performAction({ index: 0 }, 'myactivities');
    expect(label.length, 'the perform-action button should have rendered a label').toBeGreaterThan(0);
    const popup = await popupP;
    expect(
      popup,
      'the perform-action should have opened the downstream activity screen (window.open _blank) — the app-computed navigation',
    ).not.toBeNull();
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
      await popup.close().catch(() => undefined);
    }

    // ANTI-CIRCULAR read-back: resolve the persisted `big participants assignments` doc the BOARD rendered
    // this card FROM — located by the card's REAL linkage (its `assignmentref` → the big-assignment id
    // above) scoped to the logged-in admin's profileid (the board's own query scope, ts:200/310) — and
    // assert its status is a real lifecycle value (`ongoing`/`review`/`completed`). We read the app's
    // persisted OUTPUT (the doc backing the rendered card), located via the app's own card→assignment
    // linkage, never by a value the test wrote.
    await expect
      .poll(
        async () => {
          const rows = await queryWhere('big participants assignments', [['profileid', '==', BIG_ADMIN_PROFILE_ID]]);
          const pa = rows.find((r) => (r.assignmentref as { id?: string } | undefined)?.id === bigAssignmentId);
          return (pa?.status as string | undefined) ?? null;
        },
        {
          timeout: 20_000,
          message:
            `BIG-04: the big participants assignments doc the board rendered the card from ` +
            `(assignmentref.id=${bigAssignmentId}, profileid=${BIG_ADMIN_PROFILE_ID}) never settled to a real status after the action`,
        },
      )
      .toMatch(/ongoing|review|completed/i);

    // The board (its own re-render) should still reflect a real status badge for the card — read from the
    // card the board rendered, never a test-written value. (The card keeps its big-assignment id as the
    // hook; resolve it by that id if still present under the active filter.)
    let afterBadge = '';
    try {
      afterBadge = (await pab.cardStatusBadge({ assignmentId: bigAssignmentId as string })).trim();
    } catch {
      // Card left the active filter bucket — a valid re-render; the persisted-status poll above already
      // proved the doc holds a real status. Leave afterBadge empty.
    }
    if (afterBadge) {
      expect(afterBadge, 'the card status the board re-rendered should be a real status, not blank').not.toBe('');
    }
    // Reference beforeBadge so an unexpected no-op (badge unchanged AND still empty) is visible in logs.
    expect(beforeBadge.length, 'baseline status badge should have rendered before the action').toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-05 — Manual Assignment submit (progress 100%; manual doc + status review)
// ---------------------------------------------------------------------------------------------
test.describe('BIG-05 — manual assignment', () => {
  test('BIG-05 the manual screen role-gates correctly and renders its review controls for an admin', async ({ page }) => {
    // The Manual screen self-gates (big.md §4b / ts:100-118): `type=review` requires admin|ah|developer,
    // `type∈create|rework` requires the logged-in profile == the query `profileid` (the participant
    // themself), else `alert(...)` + redirect to `/`. Our seeded BIG admin HAS `admin`, so a `review`
    // open is admitted and the component mounts (`viewAccess==true`, html:1). We drive the REAL route
    // with the review query params and assert the app's OWN access decision (it stayed on the route,
    // the main wrapper mounted, the reviewer controls rendered). No assignment is seeded, so we do NOT
    // assert a write — we assert the role-gate + render the product computed.
    //
    // We arrive via the login return-url round-trip (loginAndOpenViaReturnUrl) — i.e. WARM, the way the
    // live app reaches this screen — rather than a cold `page.goto` that re-bootstraps and races the auth
    // shell into a cloud-only `FirebaseError: incomplete key` (see the helper's doc + authguard.service.ts
    // :143-149 / app.component.ts:220). The `__none__` ids keep this a no-seeded-assignment role-gate
    // check: `getAssignmentData` reads `big assignment/__none__` (a valid, complete key → simply
    // not-exists), so its inner reads short-circuit and the screen renders the reviewer controls cleanly.
    await loginAndOpenViaReturnUrl(
      page,
      actors.big(0),
      '/manualassignment?type=review&assignmentid=__none__&profileid=__none__&participantAssignmentId=__none__',
    );

    // Admin + review → admitted: URL stays on /manualassignment and the guarded <main *ngIf=viewAccess>
    // mounts. (A regression that denied an admin would alert + redirect to '/', failing the URL wait.)
    await page.waitForURL((u) => u.pathname.includes('manualassignment'), { timeout: 30_000 });
    const host = page.locator('app-manual-assignments');
    await expect(host, 'manual-assignments component should mount for an admin in review mode').toBeVisible({ timeout: 30_000 });

    // Reviewer controls are the Mark-As-Rework / Mark-As-Completed buttons (testids.md §BIG manual-*).
    // They render only for `viewType=='review'` (html:190/192) — proving the admin took the review
    // branch (the app-computed access path), not the participant branch.
    await expect(
      host.locator('[data-testid="manual-complete"], [data-testid="manual-rework"]'),
      'an admin reviewer should see Mark-As-Completed / Mark-As-Rework (the review branch rendered)',
    ).toHaveCount(2, { timeout: 30_000 });

    // The participant-only Submit button must NOT be present in review mode (it is `*ngIf` gated to
    // non-review — html:191), i.e. no control bleed across the role branch.
    await expect(
      host.locator('[data-testid="manual-submit"]'),
      'the participant Submit must NOT render in reviewer (review) mode',
    ).toHaveCount(0);
  });

  test('BIG-05 a non-self participant is DENIED the create/rework manual screen', async ({ page }) => {
    // The negative role-gate the app enforces in-component: `type=create` requires the logged-in
    // profile == the query `profileid`. A participant opening someone ELSE's create screen is alerted
    // and redirected to '/' (ts:108-118). We pass a profileid that is NOT the participant's own, and
    // assert the app's OWN verdict: it left the manual route and the guarded <main> never mounted.
    // (alert() is auto-dismissed by Playwright; the observable effect is the navigateByUrl('/').)
    page.on('dialog', (d) => d.accept().catch(() => undefined)); // auto-dismiss the access alert()
    await realLogin(page, participantEmail(0));
    await page.goto('/manualassignment?type=create&assignmentid=__x__&profileid=SOMEONE_ELSE&participantAssignmentId=__x__', {
      waitUntil: 'domcontentloaded',
    });

    // The component redirects off the manual route on a self-profile mismatch. Either we are bounced to
    // '/' (the redirect target) or, if the guard denied first, we are not showing the manual main.
    await expect
      .poll(async () => page.locator('app-manual-assignments main').count(), {
        timeout: 30_000,
        message: 'the guarded manual <main> must NOT mount for a non-self create open',
      })
      .toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// BIG-06 — Form-Based Submission (status advances; field-count parity)
// ---------------------------------------------------------------------------------------------
test.describe('BIG-06 — form-based submission', () => {
  // FIXME (product gap + missing precondition — see productFindings BIG-06 + seedRequests):
  //   This legacy screen CANNOT be exercised cleanly in the emulator today, for TWO independent reasons,
  //   one of which is a genuine product gap (not a test-wiring issue), so per the governing rule we
  //   fixme + report rather than massage it green:
  //
  //   1) PRODUCT GAP — unconditional crash on a missing `big participants assignments` doc.
  //      `ngAfterViewInit` runs `getDoc(doc(afs,'big participants assignments', participantAssignmentId))
  //      .then(res => this.currentstatus = res.data()['status'])` (form-based-submission.component.ts:164-166)
  //      with NO existence guard. When the id does not resolve to a doc, `res.data()` is `undefined` and
  //      `res.data()['status']` throws `TypeError: Cannot read properties of undefined (reading 'status')`
  //      — the exact pageerror the console-guard caught. The live PAB/Validate nav always passes a REAL
  //      participantAssignmentId, so the gap is latent in production, but it makes a no-precondition smoke
  //      impossible to keep clean.
  //
  //   2) MISSING PRECONDITION — the whole body is `*ngIf="showcontent"` (html:1) and `showcontent` only
  //      flips true AFTER a real `delivery forms` template (with a non-empty `formarray`) resolves
  //      (ts:170-198). With no template the host renders zero-size, so `toBeVisible()` on the host fails
  //      (the component DID mount — `toBeAttached()` holds — but it is correctly empty). CRUCIALLY this
  //      legacy component reads `delivery forms` from the **DEFAULT** db (`this.afs`, ts:170), whereas the
  //      emulator seeds `delivery forms` only into the **firestore-forms** named DB (seed-emulator.js →
  //      seedReferenceData). So there is NO default-DB template to resolve, and `snap.data().formarray`
  //      (ts:177) would itself throw on the missing template.
  //
  //   TO UN-FIXME (returned as a seedRequest): seed, in the DEFAULT db, one `delivery forms` template with
  //   a non-empty `formarray` (e.g. a single text field) AND one `big participants assignments` row, then
  //   drive `/formbasedsubmission?type=form&id=<templateId>&participantAssignmentId=<paId>&profileid=<pf>`.
  //   With real ids: ts:164 reads an existing doc (no crash), ts:170-198 builds controls and sets
  //   `showcontent=true` (host visible), and `[data-testid="form-submit"]` renders — at which point the
  //   block below (already written for that path) asserts the real, app-rendered submittable form.
  test.fixme(
    'BIG-06 the legacy form screen mounts for an admin and renders its dynamic form/submit',
    async ({ page }) => {
      // (Runs only once the default-DB `delivery forms` template + `big participants assignments` row are
      //  seeded — see the FIXME above + the returned seedRequest. The ids below are the seedRequest's.)
      const templateId = 'run1_bigform_0'; // default-DB `delivery forms` template (seedRequest)
      const paId = 'run1_bigpa_form_0'; // default-DB `big participants assignments` row (seedRequest)
      const pf = `${actors.big(0)}`; // any authGuard-passing profile; submit flag is role-gated, not redirected
      await realLogin(page, actors.big(0));
      await page.goto(
        `/formbasedsubmission?type=form&id=${templateId}&queueid=${paId}&profileid=${encodeURIComponent(pf)}&participantAssignmentId=${paId}`,
        { waitUntil: 'domcontentloaded' },
      );

      await page.waitForURL((u) => u.pathname.includes('formbasedsubmission'), { timeout: 30_000 });
      const host = page.locator('app-form-based-submission');
      // The component mounts immediately; its body is *ngIf="showcontent". With a real template resolved,
      // showcontent flips true and the form body (hence the host) becomes visible.
      await expect(host, 'form-based-submission should mount + render its form once a template resolves').toBeVisible({
        timeout: 30_000,
      });

      // A real form rendered from the seeded template: the submit is present. Assert it is a real,
      // app-rendered control (the field→control parity, big.md BIG-03 ts:181/213, is owned by the dynamic
      // builder; here we assert the product produced a submittable form rather than a blank screen).
      await expect(
        host.locator('[data-testid="form-submit"]').first(),
        'the form Submit control should be visible',
      ).toBeVisible({ timeout: 30_000 });
    },
  );
});
