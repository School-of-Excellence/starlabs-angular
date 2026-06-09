// @ts-nocheck
/**
 * loop-bound-selftest.spec.ts — P3 item 14 (TEST-THE-TEST): prove the LOOP-BOUND invariant
 * (`assertLoopBound`, e2e/lib/assertions.ts §6) actually FIRES on a stuck token. If this spec ever
 * goes green-by-passing-through (i.e. assertLoopBound does NOT throw on a 3rd traversal), the loop
 * guard has stopped catching the unbounded-routing failure class (flow-config.md §2 / PLAN risk 13)
 * and the whole variation suite would be vacuously green on a cycle that never terminates.
 *
 * WHY a "test-the-test" is non-circular here:
 *   The thing UNDER TEST is the GUARD (`assertLoopBound`), not a Firestore round-trip. We do NOT assert
 *   "read == X right after writing X". We assert the GUARD's VERDICT (throws / does not throw) — a value
 *   the ORACLE CODE computes — against a KNOWN-SEEDED traversal count the spec drove (anti-circularity
 *   branch (b)). To make the verdict bite on a REAL product token (not a synthetic trail), the loop is
 *   built on the PRODUCT's own audit trail: the first back-edge traversal is driven through the REAL
 *   Angular operator board (a real testid move → real PeopleInvolved confirm → the PRODUCT writes a
 *   `queue stage log` row with movedby='operator'), and only the further traversals that push the edge
 *   PAST its bound are added via the sanctioned operator/board stand-in (`participant-sim.advance`,
 *   identical write shape — cf.md §10 / participant-sim.js:50-55). assertLoopBound then reads the rows
 *   the PRODUCT + stand-in wrote (it NEVER reads a value this test computed) and must throw on the 3rd
 *   traversal of one edge.
 *
 * THE EDGE WE OVERRUN — a real BACK-edge of LYL-First-Cycle (V1):
 *   flow-config.md §2 V1 (lines 96-97,103): `Review → uP! Readiness Changework` [BACK] {Send for
 *   Implementation, ¬done} and `uP! Readiness Changework → Review` {Send for Review, done} form a legal
 *   back-and-forth cycle, bound to ≤2 traversals per edge by the harness. `Review` is a PLAIN stage
 *   (empty compulsoryactivity → the board builds it as a non-Activity column, so a move INTO Review opens
 *   PeopleInvolved and is drivable through the real UI exactly like cf-sideeffects' Review→Self Evolution
 *   Report). We therefore drive the real-UI traversal in the `uP! Readiness Changework → Review`
 *   direction, then complete the cycle with the stand-in until that edge has been traversed 3 times.
 *
 * Reused modules (NOT reimplemented): e2e/lib/assertions.ts (`assertLoopBound`, the invariant under
 *   test, + `readLogRows`/`observedTransitions` read-only views), e2e/lib/participant-sim.js (the
 *   sanctioned operator/board stand-in + the allowlist-guarded db()), e2e/lib/flow-model.js (the scoped
 *   oracle — used only to confirm the cycle edges are LEGAL so the overrun is "bounded loop overrun",
 *   not "illegal skip"), e2e/queue/pages/queue-board.page.ts (the real board), e2e/queue/support/auth.ts
 *   (real login), e2e/queue/support/console-guard.ts (fail on a real app error), and the token writers
 *   exported by e2e/fixtures/seed-test-project.js (never duplicated here).
 *
 * Recon read before writing: flow-config.md §2 V1 (legal scoped edges, the ≤2 loop/back bound, the
 *   BACK-edge list line 103), cf.md §10 (every move appends one `queue stage log`; board and
 *   participant-sim.advance write the SAME row shape; movedby distinguishes self vs operator),
 *   operator.md §C/§D + testids.md OPERATOR surface (the move dropdown + PeopleInvolved confirm),
 *   schemas.md (`queue_token`, `queue stage log`). Source of the assertion under test:
 *   e2e/lib/assertions.ts:337-357 (assertLoopBound).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from './pages/queue-board.page';
import { loginAsOperator } from './support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';

// CommonJS libs (the e2e lib layer is plain CJS — require like the other specs/page objects do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertions = require('../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const flowModel = require('../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seeder = require('../fixtures/seed-test-project');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../fixtures/sample-queue-config.json');

const { TESTRUNID } = require('./support/actors');
const QUEUE_NAME = `TEST ${cfg.stages.length}-stage L3rqCr`; // the seeded queue's display name (seed-test-project.js)

// LYL - First Cycle (flow-config.md §2 V1). The back-edge cycle Review <-> uP! Readiness Changework.
const V1_ID = 'K9PRd4PfWDWtaO0vSxy3';
const REVIEW = 'Review';                          // PLAIN stage (compulsoryactivity empty) → real-UI movable
const UP_RCW = 'uP! Readiness Changework';        // back-edge partner of Review (V1 scoped edge)
const BACK_EDGE = `${UP_RCW} → ${REVIEW}`;        // the edge we will deliberately overrun (3 traversals)
const MAX_TRAVERSALS = 2;                          // the harness bound (flow-config.md §2): a 3rd FAILS

// Poll budget for product/stand-in writes landing on the live Firestore stream (they arrive AFTER the
// write). Mirrors cf-sideeffects.spec.ts CF_POLL.
const CF_POLL = { timeout: 30_000, intervals: [500, 1000, 2000] };

/** participant-sim.db() is the allowlist-guarded Admin Firestore handle (test project / emulator only).
 *  Used here ONLY to set preconditions (reposition a token) and as the sanctioned operator/board
 *  stand-in for the cycle traversals that push the edge past its bound. The asserted value is the
 *  GUARD's verdict on the rows the PRODUCT+stand-in wrote — read via e2e/lib/assertions.ts. */
const adb = () => sim.db();

test.describe('LOOP-BOUND self-test — the loop guard catches a stuck token (P3 #14)', { tag: '@oracle' }, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page); // fail on a REAL app error (benign stubbed-external noise ignored)
  });
  test.afterEach(() => {
    assertNoFatal(guard);
  });

  // ===========================================================================================
  // LB-01 — drive a deliberately-UNBOUNDED back-edge path (a 3rd traversal of ONE edge) and prove
  //   assertLoopBound THROWS on the product-written audit trail. Also prove the SAME guard does NOT
  //   throw at exactly the bound (2 traversals), so it is not vacuously always-red.
  // ===========================================================================================
  test('LB-01 a 3rd traversal of a back-edge fails assertLoopBound (and 2 traversals pass)', async ({ page }) => {
    test.setTimeout(180_000);

    // The cycle edges must be LEGAL scoped edges for V1 — otherwise an overrun would be an illegal-skip,
    // not a bounded-loop overrun. Confirm against the flow-model oracle (the SAME oracle assertNoStageSkipped
    // uses) so this test-the-test targets the loop guard specifically.
    const M = flowModel.build(cfg);
    const upToReview = flowModel.outEdgesForVariation(M, UP_RCW, V1_ID).some((e) => e.to === REVIEW);
    const reviewToUp = flowModel.outEdgesForVariation(M, REVIEW, V1_ID).some((e) => e.to === UP_RCW);
    expect(upToReview, `oracle: "${UP_RCW}" → "${REVIEW}" must be a legal V1 scoped edge`).toBe(true);
    expect(reviewToUp, `oracle: "${REVIEW}" → "${UP_RCW}" must be a legal V1 scoped edge`).toBe(true);

    // --- PRECONDITION (stand-in, not asserted): seed a fresh, dedicated token and park it at uP! Readiness
    //     Changework so the operator has the back-edge move uP!RCW → Review available. A dedicated token
    //     keeps this self-test independent of the shared seeded participants (its trail is exactly the
    //     traversals we drive — the KNOWN-SEEDED count the guard's verdict is checked against).
    const { tokenId, profileId } = await seedLoopToken();

    // --- TRAVERSAL #1 of the back-edge, through the REAL Angular board: operator logs in, selects the
    //     seeded queue, then moves the token uP! Readiness Changework → Review. Review is a plain stage so
    //     this routes through the real move-dropdown + PeopleInvolved confirm dialog; the PRODUCT writes
    //     the queue_token update + the `queue stage log` row (movedby='operator'). We do NOT read back what
    //     the product wrote — assertLoopBound below reads the product's rows.
    const board = new QueueBoardPage(page);
    await loginAsOperator(page);
    await board.selectQueue(QUEUE_NAME);
    const cardId = profileId || tokenId; // card data-token-id is profile_id || docid (testids.md)
    await board.moveToken(cardId, REVIEW);

    // Confirm the PRODUCT really wrote the first back-edge row (movedby != 'self') before we extend it.
    // This reads the product's OUTPUT (the stage-log row the board wrote), never a value the test wrote.
    await expect
      .poll(async () => backEdgeTraversals(await assertions.observedTransitions(tokenId)), {
        ...CF_POLL,
        message: `the REAL board move ${UP_RCW} → ${REVIEW} never produced its "queue stage log" row`,
      })
      .toBe(1);
    const afterRealMove = await assertions.observedTransitions(tokenId);
    expect(
      afterRealMove.some((t) => t.from === UP_RCW && t.to === REVIEW && t.movedby && t.movedby !== 'self'),
      'the first back-edge traversal must be the operator/board move the UI performed (movedby != "self"), ' +
        'not a participant self-write — anti-circularity',
    ).toBe(true);

    // --- AT THE BOUND (2 traversals): close the cycle once (Review → uP!RCW) then traverse the back-edge a
    //     2nd time via the sanctioned operator/board stand-in. After exactly 2 traversals of the back-edge
    //     the guard with the default cap of 2 must NOT throw — proving it is not vacuously always-red.
    await sim.advance(tokenId, UP_RCW, { by: 'operator', testrunid: TESTRUNID }); // Review → uP!RCW (legal V1 edge)
    await sim.advance(tokenId, REVIEW, { by: 'operator', testrunid: TESTRUNID }); // 2nd uP!RCW → Review (at bound)
    await expect
      .poll(async () => backEdgeTraversals(await assertions.observedTransitions(tokenId)), {
        ...CF_POLL,
        message: 'stand-in did not extend the back-edge to its 2-traversal bound',
      })
      .toBe(2);
    // Guard MUST PASS at the bound (no throw). It returns a summary; assert it observed exactly the bound.
    const atBound = await assertions.assertLoopBound(tokenId, MAX_TRAVERSALS);
    expect(atBound.maxObserved, 'guard should observe the back-edge at exactly its 2-traversal bound').toBe(MAX_TRAVERSALS);

    // --- OVER THE BOUND (3rd traversal): close the cycle once more, then traverse the back-edge a 3rd
    //     time. This is the deliberately-UNBOUNDED path — the stuck token a routing cycle would produce.
    await sim.advance(tokenId, UP_RCW, { by: 'operator', testrunid: TESTRUNID }); // Review → uP!RCW (legal V1 edge)
    await sim.advance(tokenId, REVIEW, { by: 'operator', testrunid: TESTRUNID }); // 3rd uP!RCW → Review (OVER bound)
    await expect
      .poll(async () => backEdgeTraversals(await assertions.observedTransitions(tokenId)), {
        ...CF_POLL,
        message: 'stand-in did not push the back-edge to its 3rd (unbounded) traversal',
      })
      .toBe(3);

    // THE ASSERTION UNDER TEST: assertLoopBound MUST THROW on the 3rd traversal of the back-edge. We assert
    // the guard's verdict (it rejects the stuck token) AND that the rejection names the exact overrun edge
    // and its count — proving it failed for the RIGHT reason, not an unrelated error. The trail it reads is
    // the rows the PRODUCT (UI) + stand-in wrote; we never assert "read == what we wrote".
    let thrown: Error | null = null;
    try {
      await assertions.assertLoopBound(tokenId, MAX_TRAVERSALS);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown, 'assertLoopBound did NOT throw on a 3rd back-edge traversal — the loop guard is broken (a stuck token would pass).').toBeTruthy();
    expect(thrown!.message, 'the LOOP-BOUND failure must be tagged so a future reader can find it').toMatch(/\[LOOP-BOUND\]/);
    expect(thrown!.message, `the failure must name the over-traversed edge "${BACK_EDGE}"`).toContain(BACK_EDGE);
    expect(thrown!.message, 'the failure must report the offending traversal count (3)').toMatch(/traversed\s+3\s+times/);
  });

  // ===========================================================================================
  // LB-02 — the guard fires on a SELF-LOOP too (the other LOOP-BOUND failure shape: to == from).
  //   flow-config.md §2 V1: `Scope Enhancement` carries a "Send Back" self-loop scoped to V1, bound ≤2.
  //   This is the second documented loop class (a self-edge, not a back-and-forth) — proving the guard
  //   catches BOTH shapes. Built entirely on the product's `queue stage log` rows; verdict asserted.
  // ===========================================================================================
  test('LB-02 a 3rd traversal of the Scope Enhancement self-loop also fails assertLoopBound', async ({ page: _page }) => {
    test.setTimeout(120_000);

    const SCOPE = 'Scope Enhancement';
    const SELF_LOOP = `${SCOPE} → ${SCOPE}`;

    // Oracle: the self-loop must be a legal scoped V1 edge (so the overrun is a bounded-loop overrun).
    const M = flowModel.build(cfg);
    const hasSelfLoop = flowModel
      .outEdgesForVariation(M, SCOPE, V1_ID)
      .some((e) => e.to === SCOPE && e.loop);
    expect(hasSelfLoop, `oracle: "${SCOPE}" must have a legal V1 self-loop ("Send Back")`).toBe(true);

    // PRECONDITION: dedicated token parked on the loop stage. (Scope Enhancement is an Activity-config
    // stage, so a real-UI self-loop opens the studio-assign dialog — heavy and orthogonal to the loop
    // guard under test here; LB-01 already exercises a REAL UI move. The sanctioned operator/board
    // stand-in writes the SAME `queue stage log` row shape the board would, cf.md §10 — and the value
    // under test is the GUARD's verdict on the product's audit-row collection, asserted non-circularly.)
    const { tokenId } = await seedLoopToken(SCOPE);

    // Traverse the self-loop 3 times via the stand-in: Scope Enhancement → Scope Enhancement, x3.
    for (let i = 0; i < 3; i++) {
      await sim.advance(tokenId, SCOPE, { by: 'operator', testrunid: TESTRUNID });
    }
    await expect
      .poll(async () => selfLoopTraversals(await assertions.observedTransitions(tokenId), SCOPE), {
        ...CF_POLL,
        message: `stand-in did not record 3 "${SELF_LOOP}" self-loop rows`,
      })
      .toBe(3);

    // Guard MUST THROW on the 3rd self-loop traversal, naming the self-edge and its count.
    let thrown: Error | null = null;
    try {
      await assertions.assertLoopBound(tokenId, MAX_TRAVERSALS);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown, 'assertLoopBound did NOT throw on a 3rd self-loop traversal — the loop guard is broken.').toBeTruthy();
    expect(thrown!.message).toMatch(/\[LOOP-BOUND\]/);
    expect(thrown!.message, `the failure must name the self-loop edge "${SELF_LOOP}"`).toContain(SELF_LOOP);
    expect(thrown!.message).toMatch(/traversed\s+3\s+times/);
  });
});

// =================================================================================================
// Helpers — read APP/PRODUCT OUTPUT (via the allowlist-guarded handle / assertions read-only views)
//   or write PRECONDITIONS only. None asserts a value the test wrote.
// =================================================================================================

/** Count how many times the deliberately-overrun back-edge (uP! Readiness Changework → Review) appears
 *  in the PRODUCT's ordered transitions. Reads product OUTPUT (stage-log rows), never a test value. */
function backEdgeTraversals(transitions: Array<{ from: string | null; to: string }>): number {
  return transitions.filter((t) => t.from === UP_RCW && t.to === REVIEW).length;
}

/** Count self-loop (stage → same stage) traversals in the PRODUCT's ordered transitions. */
function selfLoopTraversals(transitions: Array<{ from: string | null; to: string }>, stage: string): number {
  return transitions.filter((t) => t.from === stage && t.to === stage).length;
}

/**
 * Seed ONE fresh, dedicated V1 token parked at `startStage` (default uP! Readiness Changework) for this
 * self-test, so its `queue stage log` trail is EXACTLY the traversals the spec drives (the known-seeded
 * count the guard's verdict is checked against). Reuses the canonical token writer (no duplicated write
 * logic) and a unique, run-scoped profile id so re-runs do not collide. Returns the token + profile ids.
 * PRECONDITION only — never asserted.
 */
async function seedLoopToken(startStage: string = UP_RCW): Promise<{ tokenId: string; profileId: string }> {
  // adb()/sim.db() already initialised the firebase-admin app pinned to the test project (allowlist
  // guard), so requiring firebase-admin here returns that SAME initialised app (no new init / no creds).
  const admin = require('firebase-admin');
  const db = adb();
  const queueGenId = seeder.queueGenDocId(TESTRUNID);
  const queueRef = db.collection('queue generation').doc(queueGenId);
  // Unique per stage so LB-01 / LB-02 tokens never share a trail.
  const slug = startStage.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12).toLowerCase();
  const profileId = `${TESTRUNID}_loopbound_${slug}`;
  await seeder.seedParticipantToken(
    db,
    admin,
    TESTRUNID,
    {
      profileid: profileId,
      email: `loopbound_${slug}+${TESTRUNID}@example.com`,
      variationid: V1_ID,
      stage: startStage,
      queueposition: 970,
    },
    queueRef,
  );
  const tokenId = seeder.tokenDocId(TESTRUNID, profileId);
  // Re-run hygiene: clear any prior stage-log rows for this dedicated token so the trail the guard reads
  // is exactly the traversals THIS run drives (a precondition reset, not an asserted value).
  const prior = await db.collection('queue stage log').where('docid', '==', tokenId).get();
  await Promise.all(prior.docs.map((d: any) => d.ref.delete()));
  return { tokenId, profileId };
}
