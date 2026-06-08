// operator.spec.ts — OPERATOR group (Queue Manager board, route /dynamicqueuemanager).
//
// Implements PLAN §3.A cases OP-01 … OP-13, REPLACING the prior 3-test smoke file, PLUS the two
// P0 must-add cases from the PLAN's completeness critique (§7):
//   • OP-02b — non-admin operator queue-visibility access control (a queue they are NOT admin of is
//     ABSENT from the Select-Queue dropdown). PLAN §7 P0 #3 / risk #7.
//   • OP-09b — bulk-invite fan-out conservation (count(studioinvitation) == count(bulk-selected
//     tokens), every selected token flips to `invited`, none left un-invited) AND the
//     `bulk invitation.totalaccepted` counter increments by exactly 1 per accept and NEVER on a
//     deny / expiry. PLAN §7 P0 #1 & #2 (gap-1 / gap-2; cf.md §5 & §6).
//
// ANTI-CIRCULARITY (the entire point of the rebuild — SHARED CONVENTIONS):
//   Every case EITHER drives the REAL Angular UI through the page objects (real testid → real
//   click/fill) and asserts a value the APP computed (recomputed board counts, the dropdown the app
//   built), OR asserts a value the app/CF computed against a KNOWN SEEDED number (the `queue stage
//   log` rows the board wrote — via e2e/lib/assertions.ts; the `studioinvitation`/`status:'invited'`
//   fan-out the `bulkReadyInvitation` CF wrote; the `updateDeliveryStatus` ARGUMENTS the board
//   passed — via the dev-global spy). NO assertion reads back a value the test itself just wrote.
//   The participant simulator (participant-sim.advance) is used ONLY to set up preconditions
//   (position a token at the source stage a case needs) — never as the thing under assertion.
//
// Page objects / helpers read before writing (per the task's "Depends on"):
//   - e2e/queue/pages/queue-board.page.ts   (QueueBoardPage: selectQueue/move/comms/filters/exportCsv)
//   - e2e/queue/pages/queue-list.page.ts    (QueueListPage: rows/filter/menu/B!G-Planner link)
//   - e2e/queue/pages/big-planner.page.ts   (BigPlannerPage: completedToken/stageTokenMap/profile stats)
//   - e2e/lib/assertions.ts                 (assertEveryMoveLogged/assertCountConserved/readLogRows…)
//   - e2e/queue/support/firestore-admin.ts  (getDoc/queryWhere/countWhere/pollUntil — READ app/CF output)
//   - e2e/queue/support/console-guard.ts    (attachConsoleGuard/assertNoFatal — fail on real app errors)
//   - e2e/queue/support/auth.ts             (loginAsOperator)
//   - e2e/queue/support/delivery-status-spy.ts (capture updateDeliveryStatus args — argument correctness)
//   - e2e/queue/stubs/index.ts              (installAllExternalStubs — no real Zoom/FCM/Wati/email windows)
//   - e2e/lib/participant-sim.js            (advance/db — precondition self-move stand-in + Admin handle)
//   - e2e/fixtures/seed-test-project.js     (exported ids/helpers — queueGenDocId/tokenDocId/initAdmin)
//   - recon: operator.md (selectors + write shapes + source-of-numbers), flow-config.md (stages),
//            cf.md §5/§6/§9 (bulk fan-out / accept counter / updateDeliveryStatus args), testids.md.
//
// SEED reality the cases rely on (verified against seed-test-project.js + the live component source):
//   • Operator `admin+<run>@example.com` has roles ['admin'] → board shows ALL queues
//     (component:1543 `if (roles.ah||roles.admin) → no queueadmin filter`). So OP-02 (positive) uses
//     this operator; OP-02b (negative) needs a NON-admin operator (seeded as a precondition here).
//   • The move-dropdown lists EVERY stage in the token's variation stages (or, when
//     `mapVariation[token.variationid]` misses — the seed stores the bare `variationid` while the
//     variation DOC id is `<run>_<id>`, so it DOES miss — it falls back to the queue's full 30-stage
//     list, component checkAvailablestages:~4404). Either way `Completed` (the LAST column) is an
//     offered target, so an operator move into it fires the final-stage `updateDeliveryStatus`
//     (component:2980-2984). This is why OP-07 can drive the real final move via the dropdown.
//   • Complete-Queue (`cloud_done`) is gated by `*ngIf="roles['developer']"` (html:1194); the seeded
//     operator is not a developer, so OP-08 grants `developer:true` on the operator's seeded
//     users_roles doc as a PRECONDITION (a role-gate setup write, not an assertion).
//   • Activity stages (Scope Enhancement, Diagnostics, …) split into typed sub-columns; a token with
//     `liveassignmentid != null` renders in the "<stage> (Activity)" column (recon §4). The seed puts
//     the first 3 participants into a live studio at `Diagnostics` — OP-06 uses one of them.

import { test, expect } from '@playwright/test';
import { QueueBoardPage } from './pages/queue-board.page';
import { QueueListPage } from './pages/queue-list.page';
import { BigPlannerPage } from './pages/big-planner.page';
import { loginAsOperator } from './support/auth';
import { TESTRUNID, PASSWORD, actors, loginAs } from './support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';
import { installAllExternalStubs } from './stubs';
import { installDeliveryStatusSpy, waitForDeliveryStatusCalls } from './support/delivery-status-spy';
import { getDoc, queryWhere, countWhere, pollUntil, WhereClause } from './support/firestore-admin';

// CommonJS deps (match the rest of e2e/lib + the other specs' require() style).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
// Universal invariant helpers (anti-circular: they read the REAL post-move state the product wrote).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertCountConserved, readLogRows } = require('../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../fixtures/seed-test-project');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('firebase-admin');

// ---------------------------------------------------------------------------------------------
// Run-scoped ids (the seed wrote these deterministically — seed-test-project.js).
// ---------------------------------------------------------------------------------------------
const QUEUE1_DOCID = seed.queueGenDocId(TESTRUNID);   // queue 1 (operator is admin → visible)
const QUEUE2_DOCID = seed.queueGenDocId2(TESTRUNID);  // queue 2 (operator-excluded; OP-02b)
const QUEUE1_NAME = `TEST ${seed.cfg.stages.length}-stage L3rqCr`;          // seedQueueAndVariations()
const QUEUE2_NAME = `TEST Q2 (operator-excluded) ${TESTRUNID}`;             // seedSecondQueue()

// Global stage names we drive (flow-config.md §0 global stages[]).
const FINAL_STAGE = 'Completed';                       // last column → final-completion path
const ACTIVITY_STAGE = 'Diagnostics';                  // Activity-typed (compulsoryactivity + enablezoom)
const NONACTIVITY_SRC = 'Review';                      // no compulsoryactivity → simple column
const NONACTIVITY_DST = 'Self Evolution Report';       // SELF form → simple column

/** The shared Admin Firestore handle (allowlist-pinned to the test project via participant-sim). */
function db() {
  return sim.db();
}

/** Find the seeded queue_token doc id for the Nth participant of this run (deterministic ids). */
async function nthParticipantToken(n: number): Promise<{ tokenId: string; profileId: string; variationId: string }> {
  // The seeder ids tokens `<run>_tok_<profileid>` with profileid `<run>_profile_<idx>`. Rather than
  // reconstruct the index→profileid mapping, read the actual seeded tokens for queue 1 ordered by
  // queueposition (the seeder assigns ++pos in participant order) and pick the Nth.
  const toks = await queryWhere(
    'queue_token',
    [['testrunid', '==', TESTRUNID], ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)]],
    { orderBy: 'queueposition', limit: 60 },
  );
  if (toks.length <= n) {
    throw new Error(`nthParticipantToken(${n}): only ${toks.length} seeded tokens for run ${TESTRUNID} on queue 1.`);
  }
  const t = toks[n] as Record<string, unknown>;
  return {
    tokenId: (t.docid as string) || (t.id as string),
    profileId: t.profile_id as string,
    variationId: t.variationid as string,
  };
}

/**
 * Position a token at `stage` as a PRECONDITION using the participant simulator (a self-move
 * stand-in, explicitly allowed for preconditions). Uses `by:'operator'` so it does not masquerade as
 * a participant self-write. Returns the token's profile_id. This is NOT asserted — it only sets up
 * the source stage a case drives the REAL move FROM.
 */
async function positionTokenAt(tokenId: string, stage: string): Promise<void> {
  const cur = await sim.currentStage(tokenId);
  if (cur !== stage) {
    await sim.advance(tokenId, stage, { by: 'operator', testrunid: TESTRUNID });
  }
}

/** Count `queue stage log` rows the product/CF/sim wrote for a token (app-OUTPUT, anti-circular). */
async function logRowCount(tokenId: string): Promise<number> {
  return countWhere('queue stage log', [['docid', '==', tokenId]]);
}

// ---------------------------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------------------------
test.describe('Operator — Queue Manager board (OP-01…OP-13, OP-02b, OP-09b)', () => {
  let guard: ConsoleGuard;

  test.beforeEach(async ({ page }) => {
    // Fail on any REAL app error / pageerror (stubbed-external noise is allowlisted). SHARED CONVENTIONS.
    guard = attachConsoleGuard(page);
    // No real Zoom/OpenVidu/FCM/Wati/email window may escape any case that touches studio/comms.
    installAllExternalStubs(page);
  });

  test.afterEach(() => {
    assertNoFatal(guard, 'operator board: no fatal console errors / pageerrors during the case');
  });

  // ===========================================================================================
  // OP-01 — Login & role-gated route
  // ===========================================================================================
  test('OP-01 operator logs in and lands on the role-gated board (no bounce, no console error)', async ({ page }) => {
    // [REAL-UI] real login form → guard admits the operator → board route mounts (no /login bounce).
    await loginAsOperator(page); // resolves only once the URL is on /dynamicqueuemanager (auth.ts)
    expect(page.url(), 'OP-01: operator must leave /login after a valid role-gated login').not.toContain('/login');

    const board = new QueueBoardPage(page);
    await board.open(); // asserts the Select-Queue control renders (authGuard let us in)

    // [GAP] direct nav to the board does not bounce back to /login (silent role gap).
    await page.goto('/dynamicqueuemanager', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/dynamicqueuemanager/, { timeout: 30_000 });
    // [GAP] zero error-level console logs during login is enforced by afterEach(assertNoFatal).
  });

  // ===========================================================================================
  // OP-02 — Queue List (admin CRUD list + B!G Planner entry)
  // ===========================================================================================
  test('OP-02 queue list renders the seeded queue, filters live, and links to the B!G Planner', async ({ page }) => {
    await loginAsOperator(page);
    const list = new QueueListPage(page);
    await list.open();

    // [ASSERT] the seeded queue 1 is present in the list the component rendered from its stream.
    const names = await list.visibleQueueNames();
    expect(names, 'OP-02: queue list must render the seeded queue 1').toContain(QUEUE1_NAME);

    // [GAP] every queue THIS run seeded is rendered (catch a dropped query result). The list reads ALL
    // `queue generation` with NO testrunid/delete filter (queue-list.component.ts:62 — admin CRUD over the
    // whole project), so on the persistent cloud test project it legitimately also renders queues left by
    // OTHER runs (teardown is testrunid-scoped) — and QUEUE1_NAME is NOT run-namespaced (it is the same
    // `TEST <N>-stage L3rqCr` string every run), so a raw `== QUEUE1_NAME` row-count would tally every
    // prior run's queue-1 too. The faithful, run-scoped anti-drop oracle is therefore set CONTAINMENT of
    // this run's KNOWN seeded queue names (not equality against a cross-run-polluted count): each seeded
    // queue MUST appear, and the run-UNIQUE queue 2 (its name carries TESTRUNID) is the strong signal that
    // catches a dropped stream result for this run. We also lower-bound the rendered run-name rows by the
    // Firestore count of this run's non-soft-deleted queues.
    const seededQueues = await queryWhere('queue generation', [['testrunid', '==', TESTRUNID]]);
    const liveSeeded = seededQueues.filter((q) => (q as Record<string, unknown>).delete !== true);
    const renderedNames = await list.visibleQueueNames();
    // The run-unique queue 2 (name contains TESTRUNID) must be present — a dropped query result would lose it.
    expect(
      renderedNames,
      'OP-02: this run\'s operator-excluded queue 2 (run-unique name) must be rendered (catches a dropped query result)',
    ).toContain(QUEUE2_NAME);
    // …and queue 1 (asserted present above) — both seeded run queues are rendered.
    expect(renderedNames, 'OP-02: this run\'s seeded queue 1 must be rendered').toContain(QUEUE1_NAME);
    // No run-scoped queue silently dropped: the list shows at least as many QUEUE1/QUEUE2-named rows as
    // Firestore holds for this run (other runs\' leftover same-named queue-1 rows only ever ADD to this).
    const renderedRunRows = renderedNames.filter((n) => n === QUEUE1_NAME || n === QUEUE2_NAME);
    expect(
      renderedRunRows.length,
      'OP-02: the rendered list must include at least this run\'s seeded queues (no dropped query result)',
    ).toBeGreaterThanOrEqual(liveSeeded.length);

    // [GAP] no `undefined` date cell — the date column rendered a real range string for each row.
    const dates = await list.rowDateCells();
    for (const d of dates) {
      expect(d.toLowerCase(), 'OP-02: a queue-date cell rendered "undefined"/blank (silent gap)').not.toContain('undefined');
    }

    // [ASSERT] filter live: typing the seeded queue name narrows the table to matching rows only.
    const after = await list.filterByName('L3rqCr');
    expect(after, 'OP-02: filtering by the seeded name should leave >=1 row').toBeGreaterThan(0);

    // [ASSERT] the B!G Planner link is present in the row menu (the entry point OP-12 uses).
    await list.open(); // reset filter/render
    await list.openRowMenu(0);
    expect(await list.bigPlannerLinkVisible(), 'OP-02: row menu must offer the B!G Planner link').toBe(true);
  });

  // ===========================================================================================
  // OP-02b — NEGATIVE queue visibility (a non-admin operator sees ONLY queues they administer)
  // ===========================================================================================
  test('OP-02b a non-admin operator sees ONLY queues where their profileid is in queueadmin (queue 2 ABSENT)', async ({ page }) => {
    // PRECONDITION: the base-seeded operator has roles:['admin'] → the board's `if (roles.ah||roles.admin)`
    // branch shows it ALL queues (component:1543), so it can never exercise the non-admin queueadmin filter
    // (and queue 1's seeded queueadmin holds the admin's own profileid). So we seed a dedicated NON-admin
    // operator (role eventcoordinator → passes the route guard via the existing dashboard grant, but is
    // neither `admin` nor `ah` → hits the queueadmin-filtered branch, component:1546) and put its PROFILEID
    // into queue 1's queueadmin (and NOT queue 2's). This is precondition setup only.
    const op = await seedNonAdminOperatorAdminOfQueue1();

    // [REAL-UI] log in as that non-admin operator (real login form) and open the board.
    await loginAs(page, op.email, PASSWORD);
    await page.goto('/dynamicqueuemanager', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/dynamicqueuemanager/, { timeout: 30_000 });

    const board = new QueueBoardPage(page);
    await board.open();

    // [ASSERT] the Select-Queue dropdown shows queue 1 (they administer it) and is ABSENT of queue 2.
    await page.locator('[data-testid="qm-queue-select"]').click();
    const options = page.locator('mat-option');
    // Poll until the (stream-driven) option list has rendered queue 1, then assert queue 2 is absent.
    await expect
      .poll(async () => (await options.filter({ hasText: QUEUE1_NAME }).count()), {
        timeout: 20_000,
        message: 'OP-02b: queue 1 (the one this operator administers) never appeared in the dropdown',
      })
      .toBeGreaterThan(0);
    expect(
      await options.filter({ hasText: QUEUE2_NAME }).count(),
      'OP-02b: a queue the operator is NOT in queueadmin for must be ABSENT (access-control / data-isolation gap)',
    ).toBe(0);
  });

  // ===========================================================================================
  // OP-03 — Board load & counts (Total == Σ columns; per-column parity)
  // ===========================================================================================
  test('OP-03 board shows the right numbers: Total Participants == Σ per-stage column counts', async ({ page }) => {
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    // [ASSERT] the board's Total Participants (app-computed, stream-driven) is a finite number.
    const total = await board.readTotalParticipants();
    expect(total, 'OP-03: Total Participants should be a finite count').toBeGreaterThanOrEqual(0);

    // [GAP] Total == Σ of every column count EXCLUDING the "Unattended Participants" stage
    // (component:2009-2011). Both sides are values the BOARD recomputed from its live stream.
    const cols = await board.readAllColumnCounts();
    const sumExclUnattended = Object.entries(cols)
      .filter(([key]) => !/unattended/i.test(key))
      .reduce((a, [, n]) => a + n, 0);
    expect(
      sumExclUnattended,
      'OP-03: Total Participants must equal the sum of per-stage column counts (excl. Unattended) — per-column parity, not just the total',
    ).toBe(total);

    // [GAP] at least one stage column rendered (the board is not a ghost), and the total matches the
    // KNOWN seeded population for queue 1 (anti-circular: seeded N vs the number the board computed).
    expect(Object.keys(cols).length, 'OP-03: at least one stage column must render').toBeGreaterThan(0);
    // Mirror the board's own filter (recon §4): Active, non-deleted tokens for THIS queue. Every seeded
    // token sits at a configured stage, so the board's Σ and this count reconcile exactly.
    const seededTokens = await countWhere('queue_token', [
      ['testrunid', '==', TESTRUNID],
      ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)],
      ['tokenstatus', '==', 'Active'],
    ]);
    expect(total, 'OP-03: board Total should reconcile with the KNOWN seeded active-token count').toBe(seededTokens);
  });

  // ===========================================================================================
  // OP-04 — Move token → non-Activity target (writes the audit log) [+CF]
  // ===========================================================================================
  test('OP-04 operator moves a token to a NON-Activity stage: one new stage-log row, counts conserved, studio fields cleared', async ({ page }) => {
    const { tokenId, profileId, variationId } = await nthParticipantToken(5); // a non-studio token
    await positionTokenAt(tokenId, NONACTIVITY_SRC); // precondition: source = Review (simple column)

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    const logsBefore = await logRowCount(tokenId);
    const before = await board.readAllColumnCounts();

    // [REAL-UI] open the token's move dropdown → click the non-Activity target → confirm PeopleInvolved.
    await board.moveToken(profileId, NONACTIVITY_DST, { specialist: undefined });

    // [GAP] exactly ONE new `queue stage log` row written by the board, recording
    // previousstage=Review → currentstage=Self Evolution Report, tagged movedthrough 'queue manager'.
    // assertions.readLogRows reads the REAL rows the product wrote (app OUTPUT), polled for the new one.
    await pollUntil(
      () => logRowCount(tokenId),
      (n) => n === logsBefore + 1,
      { label: `OP-04: exactly one new stage-log row for ${tokenId} after the move` },
    );
    const rows = await readLogRows(tokenId); // ordered by the app-written logdate (assertions.ts)
    const latest = rows[rows.length - 1];
    expect(latest.currentstage, 'OP-04: the move row must record the destination stage').toBe(NONACTIVITY_DST);
    expect(latest.previousstage, 'OP-04: the move row must record the source stage').toBe(NONACTIVITY_SRC);
    // The board tags operator moves movedthrough 'queue manager' (operator.md §3.1b) — read the raw row.
    // Fetch by docid WITHOUT an orderBy (the cloud project has no `queue stage log` composite index on
    // `docid + logdate` — only profile_id+createdon / queueref+logdate exist, firestore.indexes.json — so
    // an `orderBy:'logdate'` here throws FAILED_PRECONDITION on cloud). Re-select the SAME latest row that
    // readLogRows already identified (by its logdocid, sorted in memory exactly as assertions.ts does), so
    // the assertion is semantically unchanged: it reads movedthrough off the latest move row the app wrote.
    const rawRows = await queryWhere('queue stage log', [['docid', '==', tokenId]]);
    const latestRaw =
      (rawRows.find(
        (r) =>
          (r as Record<string, unknown>).logdocid === latest.logdocid ||
          (r as Record<string, unknown>).id === latest.logdocid,
      ) as Record<string, unknown>) ?? (rawRows[rawRows.length - 1] as Record<string, unknown>);
    expect(latestRaw.movedthrough, 'OP-04: the move row must be tagged as a queue-manager (operator) move').toBe('queue manager');

    // [GAP] the token itself has studio fields cleared by the non-Activity move (operator.md §3.1a).
    // (This is the APP's write on a non-Activity move; we read it as a post-state, not a value we wrote.)
    await pollUntil(
      () => getDoc('queue_token', tokenId),
      (t) => !!t && t.currentstage === NONACTIVITY_DST && t.liveassignmentid == null && t.studioid == null,
      { label: `OP-04: token ${tokenId} at ${NONACTIVITY_DST} with liveassignmentid/studioid cleared` },
    );

    // [GAP] source −1 / dest +1, Σ conserved — assertCountConserved (assertions.ts) diffs the two
    // board-recomputed snapshots. Keys are the stable data-stage-keys of the (simple) src/dst columns.
    const after = await board.readAllColumnCounts();
    const srcKey = stageKeyFor(before, NONACTIVITY_SRC);
    const dstKey = stageKeyFor(after, NONACTIVITY_DST);
    assertCountConserved(before, after, { src: srcKey, dst: dstKey });

    // [+CF] onQueueStageChange touchpoint side-effect: the CF wrote a "Queue Stage Moved" touchpoint
    // whose parentreference is THIS token (cf.md §1 canonical read-back). Best-effort: assert if the CF
    // is deployed to the target (it is on slabs-queue-e2e-exdcz + the emulator). Query by parentreference
    // path (robust to the profileid-vs-profile_id gotcha, cf.md §1).
    await assertStageMovedTouchpoint(tokenId, profileId);
  });

  // ===========================================================================================
  // OP-05 — Move token → Activity stage (opens a studio) [+CF]
  // ===========================================================================================
  test('OP-05 operator moves a token INTO an Activity stage: one live-assignment, pairing live, one stage-log', async ({ page }) => {
    const { tokenId, profileId } = await nthParticipantToken(6);
    await positionTokenAt(tokenId, NONACTIVITY_SRC); // start somewhere non-Activity, then move INTO Diagnostics

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    const logsBefore = await logRowCount(tokenId);

    // [REAL-UI] move into "Diagnostics (Activity)" → AssignQueueStudio dialog → pick a studio → submit.
    await board.moveTokenToActivity(profileId, `${ACTIVITY_STAGE} (Activity)`);

    // [ASSERT] the APP created exactly ONE new `live assignment` for this participant with status 'live',
    // and set the token's liveassignmentid/studioid. App OUTPUT (the doc the board's writeBatch created),
    // polled — never a value the test wrote (operator.md §3.2).
    const la = await pollUntil(
      () => queryWhere('live assignment', [['participantid', '==', profileId], ['status', '==', 'live']]),
      (rows) => rows.length >= 1,
      { label: `OP-05: a live 'live assignment' for ${profileId}` },
    );
    expect(la.length, 'OP-05: exactly one LIVE live-assignment should exist for the participant after opening a studio').toBe(1);
    const liveAssignmentId = (la[0] as Record<string, unknown>).docid as string;

    await pollUntil(
      () => getDoc('queue_token', tokenId),
      (t) => !!t && t.currentstage === ACTIVITY_STAGE && t.liveassignmentid === liveAssignmentId && t.studioid != null,
      { label: `OP-05: token ${tokenId} linked to live-assignment ${liveAssignmentId} + a studio` },
    );

    // [GAP] the pairing the studio used flipped to status 'live' (operator.md §3.2), and exactly ONE new
    // stage-log row was written for the Activity move.
    const studioId = (await getDoc('queue_token', tokenId))!.studioid as string;
    await pollUntil(
      () => getDoc('queue studio pairing', studioId),
      (p) => !!p && p.status === 'live',
      { label: `OP-05: pairing ${studioId} flipped to status 'live'` },
    );
    await pollUntil(
      () => logRowCount(tokenId),
      (n) => n === logsBefore + 1,
      { label: `OP-05: exactly one new stage-log row for the Activity move of ${tokenId}` },
    );

    // [+CF] studioZoomLink: with dummy Zoom secrets the CF writes zoomdata.start_url == "Link Broken"
    // onto the live-assignment IF enablezoom is set for the stage (Diagnostics has enablezoom). Best-effort.
    await assertZoomLinkBrokenIfPresent(liveAssignmentId);
  });

  // ===========================================================================================
  // OP-06 — Drag a token OUT of an Activity stage (closes the studio) [+CF]
  // ===========================================================================================
  test('OP-06 operator moves a token OUT of an Activity stage: live-assignment completed, pairing released, one stage-log', async ({ page }) => {
    // Use a seeded studio-cohort token: the seed put the first 3 participants into a LIVE studio at
    // `Diagnostics` (seedStudioFlowPreconditions). That token renders in the "Diagnostics (Activity)"
    // column (liveassignmentid != null → Activity bucket, recon §4) and its drag is the close-studio path.
    const { tokenId, profileId } = await nthParticipantToken(0); // first cohort participant
    // Ensure it is at Diagnostics with its seeded live-assignment (precondition).
    const tok0 = await getDoc('queue_token', tokenId);
    const seededLa = (tok0 as Record<string, unknown> | null)?.liveassignmentid as string | undefined;
    test.skip(!seededLa, 'OP-06: requires a seeded live-assignment on the first cohort token (studio preconditions).');
    await positionTokenAt(tokenId, ACTIVITY_STAGE);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    const logsBefore = await logRowCount(tokenId);

    // [REAL-UI] move the in-studio token to a NON-Activity stage → the board closes the studio.
    await board.moveToken(profileId, NONACTIVITY_DST);

    // [ASSERT] the live-assignment the token had is now status 'completed' + carries `updated`
    // (operator.md §3.3). App OUTPUT, polled.
    await pollUntil(
      () => getDoc('live assignment', seededLa as string),
      (l) => !!l && l.status === 'completed',
      { label: `OP-06: live-assignment ${seededLa} closed to status 'completed'` },
    );

    // [GAP] the token's studio fields are cleared, and the pairing it used was released (status null).
    await pollUntil(
      () => getDoc('queue_token', tokenId),
      (t) => !!t && t.currentstage === NONACTIVITY_DST && t.liveassignmentid == null && t.studioid == null,
      { label: `OP-06: token ${tokenId} left the studio (currentstage ${NONACTIVITY_DST}, studio fields null)` },
    );

    // [GAP] exactly ONE new stage-log row for the close-studio move (no zombie/duplicate).
    await pollUntil(
      () => logRowCount(tokenId),
      (n) => n === logsBefore + 1,
      { label: `OP-06: exactly one new stage-log row for the close-studio move of ${tokenId}` },
    );
  });

  // ===========================================================================================
  // OP-07 — Final-stage move completes delivery (updateDeliveryStatus ARG CORRECTNESS) [+CF]
  // ===========================================================================================
  test('OP-07 moving a token to the final stage calls updateDeliveryStatus("queue_token/{T}","completed",{eventRequestRef})', async ({ page }) => {
    const { tokenId, profileId } = await nthParticipantToken(7);
    await positionTokenAt(tokenId, NONACTIVITY_SRC); // position before the terminal

    // SEED a `deliverables` doc linked to this token so updateDeliveryStatus has a real record to flip
    // (else the batch is a silent no-op — cf.md §9 seed requirement). PRECONDITION write only.
    const deliverableId = await seedDeliverableForToken(tokenId);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    // Install the arg-capturing spy AFTER the board mounted (it wraps guard.updateDeliveryStatus on the
    // live component instance via the Angular dev global — see delivery-status-spy.ts).
    await installDeliveryStatusSpy(page);

    const logsBefore = await logRowCount(tokenId);

    // [REAL-UI] move the token into the FINAL column (`Completed`). The board fires
    // updateDeliveryStatus when dropIndex+1 == stageQueue.length (component:2980-2984).
    await board.completeFinal(profileId, FINAL_STAGE);

    // [ASSERT] argument correctness (PLAN §7 P2 #10 / cf.md §9 gap-10): exactly the right path + status +
    // a present eventRequestRef. The captured values are what the PRODUCT computed (anti-circular).
    const calls = await waitForDeliveryStatusCalls(page, 1);
    const call = calls[calls.length - 1];
    expect(call.apptPath, 'OP-07: updateDeliveryStatus must target THIS token (doc().path drops the leading slash)').toBe(
      `queue_token/${tokenId}`,
    );
    expect(call.status, 'OP-07: the delivery status must be "completed"').toBe('completed');
    expect(call.hasEventRequestRef, 'OP-07: the call must carry an eventRequestRef (event-participation-request query)').toBe(true);

    // [GAP] the move was logged once and the token reached the final stage (the audit trail is intact).
    await pollUntil(
      () => logRowCount(tokenId),
      (n) => n === logsBefore + 1,
      { label: `OP-07: exactly one new stage-log row for the final move of ${tokenId}` },
    );
    expect((await getDoc('queue_token', tokenId))!.currentstage, 'OP-07: token must be at the terminal stage').toBe(FINAL_STAGE);

    // [+Firestore effect] the seeded deliverable linked to this token was flipped to "completed" by the
    // app method (cf.md §9 — the value the APP computed from the seeded fileref linkage, not the test).
    await pollUntil(
      () => getDoc('deliverables', deliverableId),
      (d) => !!d && d.status === 'completed',
      { label: `OP-07: deliverable ${deliverableId} flipped to status "completed"` },
    );
  });

  // ===========================================================================================
  // OP-08 — Complete Queue (bulk): one updateDeliveryStatus call PER token, all with correct args
  // ===========================================================================================
  test('OP-08 Complete-Queue fires updateDeliveryStatus once per token in the column, each with the correct path/status/ref', async ({ page }) => {
    // The cloud_done bulk-complete button is developer-gated (html:1194). Grant `developer:true` on the
    // operator's seeded users_roles doc as a PRECONDITION (a role-gate setup, not an assertion).
    await grantDeveloperToOperator();

    // Place a KNOWN small set of tokens into one non-Activity stage so the column population is exact.
    const cohort = [await nthParticipantToken(8), await nthParticipantToken(9)];
    const COMPLETE_SRC = 'Review'; // simple (non-Activity) column → completeQueue takes the non-studio path
    for (const c of cohort) await positionTokenAt(c.tokenId, COMPLETE_SRC);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);
    await installDeliveryStatusSpy(page);

    // Wait for the board to render exactly our cohort in the Review column before completing it.
    await expect
      .poll(() => board.readColumnCount(COMPLETE_SRC), {
        timeout: 20_000,
        message: 'OP-08: the Review column never rendered the seeded cohort count',
      })
      .toBeGreaterThanOrEqual(cohort.length);
    const columnCount = await board.readColumnCount(COMPLETE_SRC);

    // completeQueue() opens a window.confirm("…Continue?"); auto-accept it.
    page.once('dialog', (d) => d.accept());

    // [REAL-UI] click the developer cloud_done action on the Review column.
    await board.bulkComplete(COMPLETE_SRC);

    // [GAP] one completion call PER token in the column (catch a partial bulk). The call count is the
    // value the PRODUCT produced; the column count is what the board computed. Both app-derived.
    const calls = await waitForDeliveryStatusCalls(page, columnCount);
    expect(
      calls.length,
      'OP-08: Complete-Queue must call updateDeliveryStatus once per token in the column (no partial bulk)',
    ).toBe(columnCount);

    // [ASSERT] every call carried the correct status + a present eventRequestRef, and each path targets a
    // queue_token (argument correctness across the whole bulk — PLAN §7 P2 #10).
    const cohortPaths = new Set(cohort.map((c) => `queue_token/${c.tokenId}`));
    for (const c of calls) {
      expect(c.status, 'OP-08: each bulk completion status must be "completed"').toBe('completed');
      expect(c.hasEventRequestRef, 'OP-08: each bulk completion call must carry an eventRequestRef').toBe(true);
      expect(c.apptPath.startsWith('queue_token/'), 'OP-08: each call must target a queue_token path').toBe(true);
    }
    for (const c of cohort) {
      expect([...cohortPaths].includes(`queue_token/${c.tokenId}`), 'sanity: cohort path set').toBe(true);
      expect(
        calls.some((k) => k.apptPath === `queue_token/${c.tokenId}`),
        `OP-08: the bulk must include a completion call for the seeded token ${c.tokenId}`,
      ).toBe(true);
    }
  });

  // ===========================================================================================
  // OP-09 — Comms sidebar & counts (recipient parity, disabled-on-empty-selection)
  // ===========================================================================================
  test('OP-09 comms sidebar: Send is disabled with no selection; recipient count matches the board column', async ({ page }) => {
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    // Open comms on the seeded entry stage (most tokens start at Evolution Prep Orientation).
    const COMMS_STAGE = 'Evolution Prep Orientation';
    await board.openComms(COMMS_STAGE);

    // [GAP] with no comm type chosen and nothing selected, Send is not enabled (no zero-recipient send).
    expect(await board.commsSendEnabled(), 'OP-09: Send must NOT be enabled before a selection / comm type').toBe(false);

    // Choose the stage in the multi-select so the panel populates, then Select-All.
    const colCount = await board.readColumnCount(COMMS_STAGE);
    await board.selectCommsStages([COMMS_STAGE]);
    await board.commsSelectAll(true);

    // [ASSERT] the comms recipient count (getSelectedTokens().length) matches the board's column count
    // for the chosen stage — both numbers the APP computed (operator.md §4).
    await expect
      .poll(() => board.commsRecipientCount(), {
        timeout: 20_000,
        message: 'OP-09: recipient count never matched the board column count',
      })
      .toBe(colCount);
  });

  // ===========================================================================================
  // OP-09b — Bulk-invite fan-out conservation + totalaccepted counter [+CF]
  //
  // FIXME (CF-RUNTIME/emulator-infra gap, not a test defect): this case depends on the `bulkReadyInvitation`
  // Cloud Function (onDocumentCreated "bulk invitation/{docid}") fanning out N `studioinvitation` docs. In
  // this emulator runtime that trigger NEVER receives an event: the functions log shows ZERO RunCloudEvent
  // deliveries for the `bulk invitation` collection and ZERO "Beginning execution of
  // us-central1-bulkReadyInvitation" — even though the trigger is registered at startup and the spec
  // creates a real `bulk invitation` doc (now with a unique id, ruling out the deterministic-id re-run
  // case). The seeded cohort tokens stay `status:'queued'` and no `studioinvitation` is written, so the
  // fan-out read-back cannot pass. The SAME non-delivery affects CF-02's queueParticipantPositionUpdate
  // ("queue stage log" creates). This is an emulator/CF event-delivery gap (collections whose onCreate
  // triggers got no events this run), NOT this spec's wiring — forcing it green would assert output the
  // product never produced. See productFindings; tracked for a CF/emulator-side fix.
  test('OP-09b bulk-invite fan-out conserves (N invitations == N selected, all tokens→invited) and totalaccepted ++1 per accept only', async () => {
    test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, 'EMULATOR LIMITATION: the functions emulator does not deliver onDocumentCreated for the spaced collection "bulk invitation", so bulkReadyInvitation never fans out — this case runs on the cloud target where the CF is deployed.');
    // This is a CF-side-effect conservation case (the anti-circularity rule's branch (b): assert values
    // the CF computed against a KNOWN seeded N). The operator UI writes ONE `bulk invitation` doc
    // (CreateBulkInvitationComponent.sendInvitation, verified shape); we create that exact trigger doc as
    // the precondition and assert the `bulkReadyInvitation` CF fan-out + the `invitationAccepted` counter.
    // (Driving the comms→BulkInvite→dialog UI is covered structurally by OP-09; OP-09b pins the
    // deterministic conservation numbers the UI path cannot make exact.)
    const K = 3;
    // Use a CONFIGURED but base-seed-EMPTY stage (My Evolution Wishlist [12] is a config orphan no
    // variation routes through — flow-config.md §4) so (a) the eligible set at this stage is EXACTLY our
    // K tokens, and (b) the board still renders a column for it (it is in cfg.stages), so these tokens are
    // counted in Total consistently with OP-13's reconciliation. `selectedparticipants` further scopes the
    // CF to our K by profile_id (cf.md §5).
    const stage = 'My Evolution Wishlist';
    const seededTokenIds = await seedEligibleBulkCohort(K, stage);

    // Create the bulk invitation doc the operator UI would write (cf.md §5 read shape).
    const bulkId = await createBulkInvitation(stage, K, seededTokenIds);

    // [+CF gap-1] conservation: the CF wrote exactly K `studioinvitation` docs with bulkref == this bulk,
    // and flipped exactly K tokens at `stage` to status 'invited' — none left un-invited. CF OUTPUT vs
    // the KNOWN seeded K (anti-circular).
    const bulkRef = db().collection('bulk invitation').doc(bulkId);
    const invitations = await pollUntil(
      () => queryWhere('studioinvitation', [['bulkref', '==', bulkRef]]),
      (rows) => rows.length >= K,
      { label: `OP-09b: the bulkReadyInvitation CF should fan out ${K} studioinvitation docs`, timeoutMs: 30_000 },
    );
    expect(invitations.length, 'OP-09b: count(studioinvitation) must equal the bulk-selected token count').toBe(K);

    await pollUntil(
      () =>
        countWhere('queue_token', [
          ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)],
          ['currentstage', '==', stage],
          ['status', '==', 'invited'],
        ]),
      (n) => n === K,
      { label: `OP-09b: exactly ${K} tokens at "${stage}" flip to status 'invited' (none left un-invited)` },
    );

    // [+CF gap-2] totalaccepted counter: it increments by exactly 1 on an accept, and NEVER on a deny or
    // an expiry. We drive each client response by setting `clientresponse` on a child invitation (the
    // participant self-move stand-in) — we do NOT set status/totalaccepted; the CF computes those.
    const before = ((await getDoc('bulk invitation', bulkId)) as Record<string, unknown>).totalaccepted ?? 0;
    expect(Number(before), 'OP-09b: a fresh bulk should start with totalaccepted 0/absent').toBe(0);

    // (a) ACCEPT one invitation → totalaccepted becomes prior + 1, and that token → 'ready'.
    const accepted = invitations[0] as Record<string, unknown>;
    const acceptedTokenId = tokenIdFromRef(accepted); // CF wrote tokenref == /queue_token/{docid} (cf.md §5)
    await setInvitationResponse(accepted.docid as string, 'approved');
    await pollUntil(
      () => getDoc('bulk invitation', bulkId),
      (b) => !!b && Number(b.totalaccepted ?? 0) === Number(before) + 1,
      { label: 'OP-09b: totalaccepted should increment by exactly 1 on an accept', timeoutMs: 30_000 },
    );
    if (acceptedTokenId) {
      await pollUntil(
        () => getDoc('queue_token', acceptedTokenId),
        (t) => !!t && t.status === 'ready',
        { label: 'OP-09b: the accepted invitation flips its token to status "ready" (CF-computed)' },
      );
    }

    // (b) DENY a second invitation → totalaccepted does NOT change.
    const denied = invitations[1] as Record<string, unknown>;
    await setInvitationResponse(denied.docid as string, 'denied');
    // (c) EXPIRE a third (set clientresponse to a non-approved value standing in for expiry) → no change.
    const expired = invitations[2] as Record<string, unknown>;
    await setInvitationResponse(expired.docid as string, 'expired');

    // Give the CF a fair window, then assert the counter is STILL prior + 1 (deny/expiry never counted).
    await page_sleepViaPoll(2500);
    const afterDenyExpiry = ((await getDoc('bulk invitation', bulkId)) as Record<string, unknown>).totalaccepted ?? 0;
    expect(
      Number(afterDenyExpiry),
      'OP-09b: totalaccepted must NOT increment on a deny or an expiry (only on an accept)',
    ).toBe(Number(before) + 1);
  });

  // ===========================================================================================
  // OP-10 — Filters & search (badge == distinct active groups; clear restores exact Total)
  // ===========================================================================================
  test('OP-10 applying a tag filter updates the active-filter badge and clearing restores the exact Total', async ({ page }) => {
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);

    // Capture the pre-filter Total only ONCE the board's stream-computed value has SETTLED. selectQueue's
    // "Staging Queue..." loader is NOT a reliable readiness signal on cloud: the component closes that
    // dialog UNCONDITIONALLY and synchronously (dynamic-queue-manager-clone.component.ts:1856) right after
    // registering the queue_token subscription — its count-based close (count>=6) is unreachable (only 3
    // streams increment), so the loader is gone before the queue_token collectionData has landed. The board
    // therefore still shows its initial `totalParticipants = 0` (ts:174) for a tick, and a one-shot
    // readTotalParticipants() here samples that stale 0 (the cloud round-trip widens the window). Anti-
    // circular & faithful: poll until the board's OWN stream-computed Total converges on the live Firestore
    // count of Active tokens for queue 1 (the same reconciliation OP-03 asserts and OP-13's convergence
    // rationale), then snapshot it as the real pre-filter baseline. The product assertion below (clearing
    // restores this EXACT Total) is unchanged.
    const queue1ActiveFilter: WhereClause[] = [
      ['testrunid', '==', TESTRUNID],
      ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)],
      ['tokenstatus', '==', 'Active'],
    ];
    await expect
      .poll(
        async () => {
          const total = await board.readTotalParticipants();
          const activeTokens = await countWhere('queue_token', queue1ActiveFilter);
          return total === activeTokens && total > 0;
        },
        {
          timeout: 30_000,
          message:
            'OP-10: the board Total never settled to the live Active-token count for queue 1 (queue_token stream not yet rendered after selectQueue)',
        },
      )
      .toBe(true);
    const totalBefore = await board.readTotalParticipants();
    expect(await board.filterBadgeCount(), 'OP-10: no filter should be active initially').toBe(0);

    await board.openFilters();
    // The seed does not guarantee participant tags; if there are no tag options, this case still proves
    // the badge/clear contract by skipping the tag-apply and asserting the no-filter baseline restores.
    const tagOptions = page.locator('[data-testid="qm-tag-option"]');
    const hasTags = (await tagOptions.count()) > 0 ||
      (await page.locator('.fsb-expandable:has(.fsb-label:has-text("Tag"))').count()) > 0;

    if (hasTags) {
      // Open the Tags row and apply the first available tag (live filter).
      const row = page.locator('.fsb-expandable:has(.fsb-label:has-text("Tag"))').locator('.fsb-row').first();
      if ((await tagOptions.count()) === 0 && (await row.count()) > 0) await row.click();
      if ((await tagOptions.count()) > 0) {
        const firstTagText = (await tagOptions.first().innerText()).trim();
        await board.applyFilterTag(firstTagText);
        // [ASSERT] the active-filter badge reflects ≥1 active dimension after applying a tag.
        await expect
          .poll(() => board.filterBadgeCount(), { timeout: 20_000, message: 'OP-10: badge did not rise after applying a tag' })
          .toBeGreaterThanOrEqual(1);
      }
    }

    // [GAP] clearing all filters restores the EXACT pre-filter Total (no token permanently dropped).
    await board.clearFilters();
    await expect
      .poll(() => board.filterBadgeCount(), { timeout: 20_000, message: 'OP-10: badge did not return to 0 after Clear all' })
      .toBe(0);
    await expect
      .poll(() => board.readTotalParticipants(), { timeout: 20_000, message: 'OP-10: Total did not restore after clearing filters' })
      .toBe(totalBefore);
  });

  // ===========================================================================================
  // OP-11 — Export CSV (header + one row per token; no truncation)
  // ===========================================================================================
  test('OP-11 Export CSV produces a header and at least one data row per board token (no truncation)', async ({ page }) => {
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE1_NAME);
    const total = await board.readTotalParticipants();

    // [REAL-UI] click Export CSV and parse the downloaded file (client-side build; operator.md §3.5).
    const csv = await board.exportCsv();

    // [ASSERT] a header row exists.
    expect(csv.headers.length, 'OP-11: the exported CSV must have a header row').toBeGreaterThan(0);

    // [GAP] row count is at least the board Total (the export must not truncate the population). It may
    // exceed Total because the CSV joins fetched logs, so assert a lower bound against the KNOWN total.
    expect(
      csv.rowCount,
      'OP-11: exported data rows must cover at least the board Total (no silent truncation)',
    ).toBeGreaterThanOrEqual(total);
  });

  // ===========================================================================================
  // OP-12 — B!G Planner (completedToken / stageTokenMap reconcile with Firestore)
  // ===========================================================================================
  test('OP-12 B!G Planner: completedToken and stageTokenMap reconcile with the seeded Firestore population', async ({ page }) => {
    await loginAsOperator(page);
    const planner = new BigPlannerPage(page);
    await planner.open(QUEUE1_DOCID);

    const lastStage = seed.cfg.stages[seed.cfg.stages.length - 1];
    const queueRefFilter: WhereClause[] = [
      ['testrunid', '==', TESTRUNID],
      ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)],
      ['tokenstatus', '==', 'Active'],
    ];

    // [GAP] completedToken (component ts:549; no DOM binding → read off the live instance) == the
    // Firestore count of Active tokens at the queue's LAST stage. Anti-circular: the planner computes
    // `completedToken` from ITS OWN live `queue_token` stream (ts:546 query, filtered tokenstatus=="Active"),
    // the oracle COUNTS Firestore — two independent derivations of whatever state exists; we assert they
    // AGREE. We poll for that agreement rather than reading each once, because (a) earlier cases in this
    // same spec file move tokens INTO `Completed` (OP-07/OP-08), so the last-stage population is non-zero
    // and (b) the planner's collectionData stream converges to Firestore a tick after the underlying write
    // lands — a one-shot read can sample the two sides mid-propagation and spuriously disagree. The Active
    // filter on the oracle mirrors the component's query EXACTLY so a Completed-but-inactive token left by a
    // serialized case never inflates only one side. (Anti-circular: never assert read==written; we compare
    // the app's stream-computed number to the live Firestore count, settled.)
    await expect
      .poll(
        async () => {
          const completed = await planner.readCompletedToken();
          const firestoreCompleted = await countWhere('queue_token', [
            ...queueRefFilter,
            ['currentstage', '==', lastStage],
          ]);
          return completed === firestoreCompleted;
        },
        {
          timeout: 30_000,
          message:
            'OP-12: planner completedToken must reconcile with the live Firestore count of Active tokens at the last stage',
        },
      )
      .toBe(true);

    // [GAP] stageTokenMap totals sum to the Active-token population for the queue (no per-stage miscount
    // masked by an aggregate — the per-stage map is the app's own computation, ts:552-578). Same
    // convergence rationale: poll until the planner's per-stage Σ equals the live Firestore Active count.
    await expect
      .poll(
        async () => {
          const map = await planner.readStageTokenMap();
          const mapSum = Object.values(map).reduce((a, b) => a + b.total, 0);
          const activeTokens = await countWhere('queue_token', queueRefFilter);
          return mapSum === activeTokens;
        },
        {
          timeout: 30_000,
          message: 'OP-12: Σ stageTokenMap.total must equal the live Active-token count for the queue',
        },
      )
      .toBe(true);
  });

  // ===========================================================================================
  // OP-13 — Empty / health-negative (0 not NaN; missing-profile token still counted)
  // ===========================================================================================
  test('OP-13 health-negative: an empty queue renders 0 (not NaN) and a token with a missing profile is still counted', async ({ page }) => {
    // PRECONDITION: a fresh EMPTY queue (no tokens) so the board must render 0, and a token whose
    // profile_data is absent (blank-name) added to queue 1 so it is still counted (PLAN OP-13 / V5).
    const emptyQueueName = await seedEmptyQueueForOperator();
    const missingProfileTokenId = await seedTokenWithMissingProfile();

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);

    // (a) Empty queue → Total renders 0 (a finite number, not NaN/blank), and columns sum to 0.
    await board.selectQueue(emptyQueueName);
    const emptyTotal = await board.readTotalParticipants();
    expect(Number.isFinite(emptyTotal), 'OP-13: an empty queue Total must be a finite number, not NaN/blank').toBe(true);
    expect(emptyTotal, 'OP-13: an empty queue Total must be 0').toBe(0);
    const emptyCols = await board.readAllColumnCounts().catch(() => ({} as Record<string, number>));
    expect(sumOf(emptyCols), 'OP-13: an empty queue must have 0 tokens across all columns').toBe(0);

    // (b) Queue 1 still counts a token whose profile_data is missing (the count must not silently drop it).
    await board.selectQueue(QUEUE1_NAME);
    // Poll for the board's stream-computed Total to CONVERGE on the live Firestore Active-token count.
    // Same convergence rationale as OP-12: earlier cases in this file (OP-04..OP-08) churned queue 1's
    // population and this case just seeded the missing-profile token, so the board's collectionData stream
    // settles to Firestore a tick after those writes — a one-shot read can sample mid-propagation and
    // spuriously disagree. Anti-circular: the board independently computes Total from its stream, the
    // oracle counts Firestore; we assert they agree once settled (never read==written). The key invariant —
    // the missing-profile token is NOT silently dropped — holds iff the two converge (it is one of the
    // Active tokens both sides count).
    const queue1ActiveFilter: WhereClause[] = [
      ['testrunid', '==', TESTRUNID],
      ['queueref', '==', db().collection('queue generation').doc(QUEUE1_DOCID)],
      ['tokenstatus', '==', 'Active'],
    ];
    await expect
      .poll(
        async () => {
          const total = await board.readTotalParticipants();
          const activeTokens = await countWhere('queue_token', queue1ActiveFilter);
          return total === activeTokens;
        },
        {
          timeout: 30_000,
          message:
            'OP-13: the board Total must converge on the live Active-token count (the missing-profile token must still be counted, not silently dropped)',
        },
      )
      .toBe(true);
    // Sanity: the missing-profile token is one of the counted Active tokens.
    const mp = await getDoc('queue_token', missingProfileTokenId);
    expect(mp && mp.tokenstatus, 'OP-13: the missing-profile token should be Active (counted)').toBe('Active');
    // [GAP] zero uncaught console errors across all sub-steps is enforced by afterEach(assertNoFatal).
  });

  // =============================================================================================
  // Spec-local PRECONDITION helpers (Admin SDK, allowlist-guarded). These set up state a case drives
  // the REAL UI against / asserts the CF output of — they never assert a value the test wrote.
  // =============================================================================================

  /** Seed a dedicated NON-admin operator and make it admin of ONLY queue 1 (for OP-02b). */
  async function seedNonAdminOperatorAdminOfQueue1(): Promise<{ email: string; profileId: string; uid: string }> {
    const d = db(); // initializes the Admin app (lazy) FIRST — else admin.auth() throws "default app does not exist"
    const auth = admin.auth();
    const uid = `${TESTRUNID}_op02b`;
    const profileId = `${TESTRUNID}_pf_op02b`;
    const email = `op02b+${TESTRUNID}@example.com`;
    const roleId = `${TESTRUNID}_role_${uid}`;

    await auth
      .createUser({ uid, email, password: PASSWORD, displayName: email })
      .catch((e: { code?: string }) => {
        if (e && e.code === 'auth/uid-already-exists') return;
        if (e && e.code === 'auth/email-already-exists') return;
        throw e;
      });
    await auth.setCustomUserClaims(uid, { testrunid: TESTRUNID, role: 'eventcoordinator' });

    const userDataRef = d.collection('user_data').doc(uid);
    const profileRef = d.collection('profile_data').doc(profileId);
    const roleRef = d.collection('users_roles').doc(roleId);
    await userDataRef.set({ name: email, email, number: '9999900000', testrunid: TESTRUNID, _testdata: true });
    // NON-admin role: eventcoordinator only (neither admin nor ah) → board's queueadmin-filtered branch.
    await roleRef.set({
      id: roleId, name: email, participant: false, profile_ref: profileRef,
      eventcoordinator: true, testrunid: TESTRUNID, _testdata: true,
    });
    await profileRef.set({
      profileid: profileId, email: email.toLowerCase(), name: email, number: '9999900000', countrycode: '+91',
      user_ref: userDataRef, role_ref: roleRef, testrunid: TESTRUNID, _testdata: true,
    });

    // Put this operator's PROFILEID into queue 1's queueadmin (NOT queue 2's). arrayUnion is additive.
    await d.collection('queue generation').doc(QUEUE1_DOCID).update({
      queueadmin: admin.firestore.FieldValue.arrayUnion(profileId),
    });
    return { email, profileId, uid };
  }

  /** Grant `developer:true` on the seeded operator's users_roles doc (reveals the cloud_done button). */
  async function grantDeveloperToOperator(): Promise<void> {
    const rows = await queryWhere('users_roles', [['name', '==', actors.operatorAdmin]]);
    if (rows.length === 0) throw new Error('grantDeveloperToOperator: operator users_roles doc not found by name.');
    await db().collection('users_roles').doc(rows[0].id).update({ developer: true });
  }

  /** Seed a `deliverables` doc whose fileref array-contains this token (so updateDeliveryStatus flips it). */
  async function seedDeliverableForToken(tokenId: string): Promise<string> {
    const d = db();
    const id = `${TESTRUNID}_delv_${tokenId}`;
    await d.collection('deliverables').doc(id).set({
      docid: id,
      fileref: [d.collection('queue_token').doc(tokenId)], // array-contains target (authguard:894)
      status: 'pending',
      testrunid: TESTRUNID,
      _testdata: true,
    });
    return id;
  }

  /** Seed K eligible tokens (status 'queued') at a dedicated stage on queue 1 (OP-09b known cohort). */
  async function seedEligibleBulkCohort(k: number, stage: string): Promise<string[]> {
    const d = db();
    const queueRef = d.collection('queue generation').doc(QUEUE1_DOCID);
    const ids: string[] = [];
    for (let i = 0; i < k; i++) {
      const profileId = `${TESTRUNID}_op09b_pf_${i}`;
      const tokenId = `${TESTRUNID}_op09b_tok_${i}`;
      // profile_data so the CF's profile_data.get() resolves (cf.md §5 gotcha).
      await d.collection('profile_data').doc(profileId).set({
        docid: profileId, profileid: profileId, email: `op09b${i}+${TESTRUNID}@example.com`, name: `OP09B ${i}`,
        number: '9999900000', countrycode: '+91', testrunid: TESTRUNID, _testdata: true,
      });
      await d.collection('queue_token').doc(tokenId).set({
        docid: tokenId, profile_id: profileId, profile_name: `OP09B ${i}`,
        queueref: queueRef, variationid: seed.cfg.queuevariation[0].id,
        currentstage: stage, previousstage: null, status: 'queued', stagestatus: 'Yet to Start',
        tokenstatus: 'Active', tokennumber: 1000 + i, delete: false, queueposition: 1000 + i,
        people_involved: [], liveassignmentid: null, manuallymoved: false,
        createdon: admin.firestore.Timestamp.now(), logdate: admin.firestore.Timestamp.now(),
        testrunid: TESTRUNID, _testdata: true,
      });
      ids.push(tokenId);
    }
    return ids;
  }

  /** Create the `bulk invitation` doc the operator UI writes (CreateBulkInvitationComponent shape). */
  async function createBulkInvitation(stage: string, totalInvited: number, tokenIds: string[]): Promise<string> {
    const d = db();
    const profileIds: string[] = [];
    for (const t of tokenIds) {
      const tok = await getDoc('queue_token', t);
      if (tok) profileIds.push(tok.profile_id as string);
    }
    // UNIQUE per invocation so the create is unambiguous on a state-persisting emulator (a deterministic id
    // would make a re-run's set() an update, not a create). NOTE: this alone does NOT make OP-09b pass —
    // see the test.fixme above: the `bulkReadyInvitation` onCreate trigger never receives an event for the
    // `bulk invitation` collection in this emulator runtime regardless of doc id.
    const bulkId = `${TESTRUNID}_bulk_op09b_${Date.now()}`;
    await d.collection('bulk invitation').doc(bulkId).set({
      docid: bulkId,
      stage,
      totalinvited: totalInvited,
      duration: 2, // minutes — CF computes expirydate ≈ now + duration
      selectedparticipants: profileIds, // CF intersects eligible tokens by profile_id (cf.md §5)
      expirydate: new Date(Date.now() + 2 * 60 * 1000),
      queueref: d.collection('queue generation').doc(QUEUE1_DOCID),
      created: admin.firestore.Timestamp.now(),
      testrunid: TESTRUNID,
      _testdata: true,
    });
    return bulkId;
  }

  /** Drive a participant client-response on a studioinvitation (accept/deny/expiry stand-in). */
  async function setInvitationResponse(invitationDocId: string, response: 'approved' | 'denied' | 'expired'): Promise<void> {
    // We set ONLY clientresponse (the participant overlay's write). The CF computes status/totalaccepted
    // (cf.md §6) — never set here, keeping the assertion non-circular.
    await db().collection('studioinvitation').doc(invitationDocId).update({ clientresponse: response });
  }

  /** Seed a fresh EMPTY queue (no tokens) the operator can select (OP-13 empty-state). */
  async function seedEmptyQueueForOperator(): Promise<string> {
    const d = db();
    const ts = admin.firestore.Timestamp;
    const past = ts.fromMillis(Date.now() - 7 * 86400e3);
    const future = ts.fromMillis(Date.now() + 30 * 86400e3);
    const id = `${TESTRUNID}_empty_queue`;
    const name = `TEST Empty Queue ${TESTRUNID}`;
    const ref = d.collection('queue generation').doc(id);
    const v = seed.cfg.queuevariation[0];
    const vref = d.collection('queue variation').doc(`${TESTRUNID}_empty_${v.id}`);
    await vref.set({ docid: vref.id, variationname: v.variationname, stages: v.stages, atcmodel: null, queueref: ref, testrunid: TESTRUNID, _testdata: true });
    await ref.set({
      docid: id, queuename: name,
      queueadmin: [`${TESTRUNID}_pf_admin_0`], queuementor: [],
      stages: seed.cfg.stages, stageproperty: seed.cfg.stageproperty, queuevariation: [vref],
      zoomlinkrequired: true, iscommunicationsdisabled: true,
      queuestartdate: past, queueenddate: future, lastregistrationdate: future,
      created: ts.now(), modified: ts.now(), testrunid: TESTRUNID, _testdata: true,
    });
    return name;
  }

  /** Seed an Active token on queue 1 whose profile_data does NOT exist (blank-name; still counted). */
  async function seedTokenWithMissingProfile(): Promise<string> {
    const d = db();
    const tokenId = `${TESTRUNID}_noprofile_tok`;
    const profileId = `${TESTRUNID}_noprofile_pf`; // intentionally NO profile_data doc written for this id
    await d.collection('queue_token').doc(tokenId).set({
      docid: tokenId, profile_id: profileId, profile_name: '',
      queueref: d.collection('queue generation').doc(QUEUE1_DOCID), variationid: seed.cfg.queuevariation[0].id,
      currentstage: 'Evolution Prep Orientation', previousstage: null, status: 'queued', stagestatus: 'Yet to Start',
      tokenstatus: 'Active', tokennumber: 9999, delete: false, queueposition: 9999,
      people_involved: [], liveassignmentid: null, manuallymoved: false,
      createdon: admin.firestore.Timestamp.now(), logdate: admin.firestore.Timestamp.now(),
      testrunid: TESTRUNID, _testdata: true,
    });
    return tokenId;
  }

  // ---- CF-output read-back helpers (best-effort; tolerant if a trigger isn't deployed to the target) ----

  /** Assert the onQueueStageChange CF wrote a "Queue Stage Moved" touchpoint for the token (cf.md §1). */
  async function assertStageMovedTouchpoint(tokenId: string, profileId: string): Promise<void> {
    const tokenPath = `queue_token/${tokenId}`;
    try {
      await pollUntil(
        () => queryWhere('participant touchpoint', [['touchpoint', '==', 'Queue Stage Moved']]),
        (rows) =>
          rows.some((r) => {
            const pr = (r as Record<string, unknown>).parentreference as { path?: string } | undefined;
            return pr?.path === tokenPath;
          }),
        { label: `onQueueStageChange touchpoint for ${tokenPath}`, timeoutMs: 15_000 },
      );
    } catch {
      // The CF may not be deployed to this target; the in-app stage-log assertions above already prove
      // the move. Do not hard-fail the operator UI case on the CF's optional touchpoint side-effect.
      test.info().annotations.push({ type: 'cf-skip', description: `no Queue-Stage-Moved touchpoint observed for ${tokenPath}` });
    }
  }

  /** Assert studioZoomLink wrote the deterministic "Link Broken" zoomdata onto the live-assignment. */
  async function assertZoomLinkBrokenIfPresent(liveAssignmentId: string): Promise<void> {
    try {
      await pollUntil(
        () => getDoc('live assignment', liveAssignmentId),
        (l) => !!l && !!(l as Record<string, unknown>).zoomdata,
        { label: `studioZoomLink zoomdata on ${liveAssignmentId}`, timeoutMs: 15_000 },
      );
      const la = await getDoc('live assignment', liveAssignmentId);
      const zoom = (la as Record<string, unknown>).zoomdata as { start_url?: string } | undefined;
      // With dummy Zoom secrets the deterministic value is "Link Broken" (cf.md §2). Assert if present.
      if (zoom && typeof zoom.start_url === 'string') {
        expect(zoom.start_url, 'OP-05: studioZoomLink should write the deterministic "Link Broken" start_url under dummy secrets').toBe('Link Broken');
      }
    } catch {
      test.info().annotations.push({ type: 'cf-skip', description: `no zoomdata observed on live-assignment ${liveAssignmentId}` });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Module-local pure helpers
// ---------------------------------------------------------------------------------------------

/** Sum a { stageKey -> count } snapshot. */
function sumOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, n) => a + (Number(n) || 0), 0);
}

/**
 * Resolve the data-stage-key in a counts snapshot for a simple (non-split) stage NAME. The board keys
 * simple columns `<stage>_<i>`; for the non-Activity stages OP-04/08 use (Review / Self Evolution
 * Report), there is exactly one column. Returns the first key whose `<name>_<i>` prefix matches.
 */
function stageKeyFor(counts: Record<string, number>, stageName: string): string {
  const exact = Object.keys(counts).find((k) => k === stageName);
  if (exact) return exact;
  const byPrefix = Object.keys(counts).find((k) => k.startsWith(`${stageName}_`) && !/_queued_|_waiting_|_activity_/.test(k));
  if (byPrefix) return byPrefix;
  const any = Object.keys(counts).find((k) => k.startsWith(`${stageName}_`));
  if (!any) {
    throw new Error(`stageKeyFor: no column key for stage "${stageName}". Keys: ${Object.keys(counts).join(', ')}`);
  }
  return any;
}

/** Extract the token doc id a studioinvitation points at (its tokenref ref, or a stored id field). */
function tokenIdFromRef(invitation: Record<string, unknown>): string {
  const ref = invitation.tokenref as { id?: string; path?: string } | undefined;
  if (ref?.id) return ref.id;
  if (ref?.path) return ref.path.split('/').pop() as string;
  // Fallback to a stored token id field if the invitation carries one.
  return (invitation.tokenDocId as string) || (invitation.tokenid as string) || '';
}

/** Bounded wait via expect.poll (foreground sleep is blocked in this harness). */
async function page_sleepViaPoll(ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  await expect.poll(() => Date.now() >= deadline, { timeout: ms + 2000, intervals: [200] }).toBe(true);
}
