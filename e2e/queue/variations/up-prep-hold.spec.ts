// @ts-nocheck
/**
 * up-prep-hold.spec.ts — V9 · uP! - Prep Hold closed-loop variation walk (the degenerate one).
 * PLAN cases UPH-00 / UPH-01 / UPH-02 (flow-config.md §2 V9, §4 orphan #2, §5 "V9 Prep-Hold").
 *
 * WHAT THIS PROVES (the anti-circularity rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   V9 (`PJQVQf9HU0PxSCIbH5re`) is the SINGLE-STAGE variation whose ONE stage — `uP! Prep Process -
 *   Hold` [1] — is simultaneously the ENTRY and the TERMINAL: a parking stage with `selfmovable:false`,
 *   `actiontype:null`, `nextstage:[]`, no studiowidgets, no compulsoryactivity (verified against the
 *   seed config). There is NO walk to drive: the participant has NO action (no self-move CTA, no
 *   operator `nextstage` button), so the test PROVES THE ABSENCE OF MOVEMENT against PRODUCT OUTPUT —
 *   the inverse of the multi-stage variation walks, but the SAME six universal invariants
 *   (e2e/lib/assertions.ts) evaluated at zero transitions:
 *     • NO-ORPHAN — the lone parked token exists and has the single seeded cohort sibling.
 *     • EVERY-MOVE-LOGGED — VACUOUS 0 == 0: the product wrote ZERO `queue stage log` rows (no move
 *       happened), with minNonSelf 0 (no operator/CF move). A suite that secretly advanced the token
 *       would FAIL this (a row would appear).
 *     • NO-STAGE-SKIPPED — vacuously satisfied (no observed transition to validate against the oracle).
 *     • TERMINAL-REACHED — entry IS terminal: currentstage == `uP! Prep Process - Hold` AND that stage
 *       has ZERO scoped out-edges in the oracle (the move-dropdown therefore renders no pickable target).
 *     • COUNT-DRIFT — the board's per-column count for the parking stage is STABLE (no token enters or
 *       leaves), read from the REAL board UI before/after the (deliberately no-op) interaction window.
 *     • LOOP-BOUND — trivially ≤ 2 (zero edge traversals).
 *
 *   CRITICAL anti-circularity stance for the degenerate case: we do NOT assert `read == X right after
 *   writing X`. Every assertion reads a value the PRODUCT produced — the board's rendered stage column
 *   + count + move-dropdown (the APP computed them from its live variation-scoped Firestore stream),
 *   and the `queue stage log` collection the apps/CF would have written (it is empty BECAUSE no move
 *   occurred). The participant simulator is used ONLY to PROVE a self-move never fires (UPH-02): a
 *   `selfmovable:false` parking stage must produce NO `queue_token` write / NO log row — a negative
 *   assertion read from the product, not a value the test wrote (PLAN P1 #6 selfmovable-gate).
 *
 * V9 SPECIALS (flow-config.md §2 V9, §3 drift table "n/a", §4, §5):
 *   UPH-00 — STATIC ORACLE parity: build()/oracle() baseline (the 2 documented global orphans incl.
 *            this stage; 0 dangling; V9 NOT in unreachableTerminals — `oracle()` skips reachability for
 *            len-1 variations via its `vs.length > 1` guard); the sole stage has ZERO scoped out-edges
 *            (terminal == entry) and `selfmovable == false`; backbone length 1; the variation reaches
 *            its terminal in zero hops.
 *   UPH-01 — THE REAL BOARD renders the parking stage as ONE simple (un-split) column holding the lone
 *            seeded token, the token's move-dropdown offers ZERO ENABLED targets (move-dropdown EMPTY —
 *            the only option the board can render for a single-stage variation is the current stage
 *            itself, rendered DISABLED), and the board's column count for the stage is STABLE across the
 *            read window (no drift). Asserts the APP-computed board state, commits NO move.
 *   UPH-02 — THE NO-MOVE / NO-LOG INVARIANT: the participant simulator emits NO self-move for this token
 *            (selfmovable:false negative gate), the product holds ZERO `queue stage log` rows, the lone
 *            token still rests on the entry==terminal stage, and the six invariants hold at zero
 *            transitions (vacuous EVERY-MOVE-LOGGED 0==0, NO-STAGE-SKIPPED, LOOP-BOUND, NO-ORPHAN,
 *            TERMINAL-REACHED) — read entirely from PRODUCT state.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md §0/§2 V9/§3/§4/§5 — the routing oracle SOURCE OF TRUTH for THIS variation.
 *   - e2e/lib/flow-model.js (build, oracle, outEdgesForVariation, reachableInVariation) — the scoped-edge oracle.
 *   - e2e/lib/assertions.ts — the six universal invariants (read product output, not test writes;
 *     assertTerminalReached `opts.terminal` override + oracle out-edge check; assertEveryMoveLogged 0==0).
 *   - e2e/lib/participant-sim.js (logCount/currentStage/db) — used ONLY to prove NO self-move fires.
 *   - e2e/fixtures/variation-seeds/up-prep-hold.ts (+ _common.ts) — the per-variation seed builder
 *     (cohort 1 parked token; seeds PRECONDITIONS only, never a stage-log/advance).
 *   - e2e/queue/pages/queue-board.page.ts — REAL board: the parking-stage column + stable count +
 *     assertNoEnabledMoveTargets (the move-dropdown-EMPTY proof).
 *   - e2e/queue/support/{auth,console-guard,actors}.ts; e2e/queue/recon/testids.md (OPERATOR surface,
 *     PRE-EXISTING data-token-id / data-stage-key). No selector is invented (the board page owns them).
 *
 * STUDIO/SIM NOTE: V9 has NO studio stage and NO forward edge, so the specialist studio page object and
 *   the operator move drivers are intentionally NOT exercised — there is nothing to move. The studio /
 *   operator surfaces are covered by the multi-stage variation specs and studio-session.spec.ts. The
 *   participant-sim is present ONLY as the negative-control (proving the self-move never fires).
 */
import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { QUEUE_NAME } from '../support/actors';
import { seedUpPrepHold, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/up-prep-hold';

// CommonJS libs (lib/* are plain CommonJS — require like the sibling specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, oracle, outEdgesForVariation, reachableInVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertLoopBound,
  observedTransitions,
  readLogRows,
} = require('../../lib/assertions');

/** The flow-model graph, built ONCE from the seeded config (cheap, reused). The ORACLE authority. */
const MODEL = build(cfg);
const VID = VARIATION_ID;            // PJQVQf9HU0PxSCIbH5re
const TERMINAL = FIRST_STAGE;        // entry == terminal for V9: 'uP! Prep Process - Hold'

/**
 * Park `tokenDocId` on the parking stage as a PRECONDITION (allowed setup — re-anchors the lone token
 * to the entry==terminal stage so the run is deterministic / re-runnable). Mirrors the sibling specs'
 * parkAt: it is NOT an assertion target; the spec asserts only PRODUCT output (board state, the empty
 * `queue stage log`, the oracle). Clears any prior studio refs so the board buckets the token into the
 * stage's simple (un-split) column.
 */
async function parkAt(tokenDocId: string, stage: string): Promise<void> {
  await sim.db().collection('queue_token').doc(tokenDocId).set(
    { currentstage: stage, previousstage: null, status: 'queued', liveassignmentid: null, studioid: null, delete: false, tokenstatus: 'Active' },
    { merge: true },
  );
}

/** Wait until the board rendered the lone token card AND a resolvable column for the parking stage. */
async function waitForCardOnStage(page: Page, board: QueueBoardPage, cardId: string, stage: string): Promise<void> {
  await expect
    .poll(async () => board.revealTokenCard(cardId), {
      timeout: 20_000,
      message: `board never rendered token card data-token-id="${cardId}" (queue selected & queue_token stream loaded? — also paged via Load More)`,
    })
    .toBe(true);
  await expect
    .poll(async () => {
      try { await board.readColumnCount(stage); return true; } catch { return false; }
    }, { timeout: 20_000, message: `board never rendered a column for the parking stage "${stage}".` })
    .toBe(true);
}

// =================================================================================================
test.describe(`V9 · ${VARIATION_NAME} (${VID}) — single-stage parking (UPH-00/01/02)`, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // UPH-00 — STATIC ORACLE parity (no UI): entry==terminal, ZERO out-edges, selfmovable false,
  //   backbone length 1, and the documented global-orphan / no-dangling baseline.
  // -----------------------------------------------------------------------------------------------
  test('UPH-00 — oracle: single stage IS the terminal (0 out-edges), selfmovable false, backbone len 1; orphan/dangling baseline', async () => {
    // (1) The variation's backbone is exactly the one parking stage (flow-config.md §2 V9).
    const v = cfg.queuevariation.find((x: any) => x.id === VID);
    expect(v, 'V9 variation present in the seed config').toBeTruthy();
    expect(v.stages, 'V9 backbone is the single parking stage').toEqual([FIRST_STAGE]);
    expect(v.stages.length, 'V9 backbone length == 1').toBe(1);

    // (2) The sole stage has ZERO scoped out-edges for V9 → the move-dropdown can offer no destination
    //     (entry IS terminal). And it is reachable from the entry in zero hops (just itself).
    const outs = outEdgesForVariation(MODEL, FIRST_STAGE, VID);
    expect(outs.length, 'V9 parking stage must have ZERO scoped out-edges (terminal == entry)').toBe(0);
    const reachable = [...reachableInVariation(MODEL, VID, FIRST_STAGE)];
    expect(reachable, 'V9: only the entry==terminal stage is reachable (no forward edge)').toEqual([FIRST_STAGE]);

    // (3) selfmovable == false on the parking stage (PLAN UPH-01/02; flow-config.md §2 V9). Read from
    //     the model node (which mirrors the stageproperty) AND from the raw config — both agree.
    const node = MODEL.nodeBy[FIRST_STAGE];
    expect(node.selfmv, 'V9 parking stage node.selfmv == false (no participant self-move)').toBe(false);
    expect(node.outN, 'V9 parking stage has zero out-edges in the global graph').toBe(0);
    const prop = cfg.stageproperty[FIRST_STAGE];
    expect(prop.selfmovable, 'stageproperty.selfmovable == false').toBe(false);
    expect(prop.actiontype, 'stageproperty.actiontype == null (no form/link CTA)').toBeNull();
    expect(prop.nextstage, 'stageproperty.nextstage == [] (no operator button)').toEqual([]);

    // (4) STATIC ORACLE BASELINE (flow-config.md §1 / §4; identical to oracle-selftest.spec.ts): the
    //     oracle reports ok:false SOLELY because of the 2 known orphans (one of which IS this stage);
    //     NO dangling edge; and V9 is NOT flagged unreachable (the len-1 guard skips its reachability).
    const o = oracle(cfg);
    expect(o.dangling.length, 'UPH-00: no dangling edges in the seed config').toBe(0);
    expect(o.orphans.slice().sort(), 'UPH-00: exactly the 2 documented orphans (flow-config §4)')
      .toEqual(['My Evolution Wishlist', 'uP! Prep Process - Hold'].sort());
    expect(o.orphans.includes(FIRST_STAGE), 'UPH-00: the V9 parking stage is one of the documented global orphans').toBe(true);
    expect(o.unreachableTerminals, 'UPH-00: V9 (len-1) is NOT flagged as having an unreachable terminal').toEqual([]);
  });

  // -----------------------------------------------------------------------------------------------
  // UPH-01 — THE REAL BOARD: one simple column holds the lone token; the move-dropdown is EMPTY
  //   (zero enabled targets); the board's column count is STABLE (no drift). APP-computed, no move written.
  // -----------------------------------------------------------------------------------------------
  test('UPH-01 — board renders the parking column with the lone token, move-dropdown offers ZERO enabled targets, count stable', async ({ page }) => {
    // SEED preconditions: queue generation + the V9 variation doc + ONE parked token (cohort 1).
    const seeded = await seedUpPrepHold({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;          // the `docid` any stage-log row would key on
    const cardId = participant.profileid;            // the board card's data-token-id (= profile_id)
    expect(seeded.firstStage, 'V9 first stage == the parking stage').toBe(FIRST_STAGE);
    expect(seeded.stages, 'V9 seeded backbone is the single parking stage').toEqual([FIRST_STAGE]);

    // Re-anchor deterministically on the parking stage (precondition only).
    await parkAt(tokenDocId, FIRST_STAGE);

    // Drive the REAL operator board (auth + queue select).
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnStage(page, board, cardId, FIRST_STAGE);

    // (1) The parking stage is rendered as ONE simple (un-split) column: a stage with empty
    //     compulsoryactivity is NOT split into Queued/Waiting/Activity (board processTokensIntoStages),
    //     so exactly one data-stage-key carries the stage name. APP-rendered headers — pure DOM read.
    const stageKeys = await board.stageKeysForName(FIRST_STAGE);
    expect(stageKeys.length, `UPH-01: parking stage "${FIRST_STAGE}" must render exactly one (un-split) column`).toBe(1);

    // (2) The board's column count for the parking stage is ≥1 — it includes OUR lone seeded cohort token.
    //     This is the APP's `allTokens.length` for that column, polled from the live stream (not a test
    //     write). NOTE: the parking stage "uP! Prep Process - Hold" is a real cfg stage that the BASE seed
    //     (and any prior V9 test on the serialized shared emulator) also parks tokens on, so the column is
    //     NOT guaranteed to hold exactly one — only ≥1. The load-bearing facts for this case are the
    //     ZERO-enabled-move-targets (step 3) and the count STABILITY across the read-only inspection (step
    //     4), both asserted below; the absolute count is not the invariant. We separately confirm OUR token
    //     is the one rendered via revealTokenCard + the assertNoOrphan/observedTransitions checks.
    await expect
      .poll(async () => board.readColumnCount(FIRST_STAGE), {
        timeout: 20_000, message: `UPH-01: board column count for "${FIRST_STAGE}" should render at least the lone seeded token.`,
      })
      .toBeGreaterThanOrEqual(1);
    const countBefore = await board.readColumnCount(FIRST_STAGE);
    expect(countBefore, 'UPH-01: the parking column renders ≥1 token (incl. the seeded cohort token)').toBeGreaterThanOrEqual(1);

    // (3) MOVE-DROPDOWN EMPTY: the lone token's move-dropdown offers ZERO ENABLED targets. The only
    //     option the board can render for a single-stage variation is the current stage itself —
    //     rendered DISABLED (you cannot move onto your own stage). assertNoEnabledMoveTargets opens →
    //     asserts (zero enabled; the lone option, if any, is the disabled self-stage) → dismisses
    //     WITHOUT committing. The option set is APP-computed from the live variation stage list.
    await board.assertNoEnabledMoveTargets(cardId, FIRST_STAGE);

    // (4) COUNT-DRIFT (degenerate): the parking column count is UNCHANGED after the read-only dropdown
    //     inspection — no token entered or left. Read the APP-computed count again and compare to the
    //     pre-inspection snapshot (two product-rendered snapshots; never a value the test wrote).
    await expect
      .poll(async () => board.readColumnCount(FIRST_STAGE), {
        timeout: 20_000, message: `UPH-01: parking column count must stay ${countBefore} (no move occurred).`,
      })
      .toBe(countBefore);

    // (5) The read-only board interaction committed NO move: the product wrote ZERO stage-log rows for
    //     this token and it still rests on the parking stage. Assert against PRODUCT state, not a write.
    expect((await observedTransitions(tokenDocId)).length, 'UPH-01: board inspection must not write any stage-log row').toBe(0);
    await assertNoOrphan(tokenDocId);
    await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });
  });

  // -----------------------------------------------------------------------------------------------
  // UPH-02 — THE NO-MOVE / NO-LOG INVARIANT: the participant-sim emits NO self-move (selfmovable:false
  //   negative gate); ZERO stage-log rows; the six invariants hold at zero transitions. PRODUCT-read.
  // -----------------------------------------------------------------------------------------------
  test('UPH-02 — no-move/no-log: participant self-move never fires (selfmovable false), 0 stage-log rows, vacuous invariants hold', async () => {
    // Fresh seed + run so this negative-control run is independent of UPH-01's board run.
    const seeded = await seedUpPrepHold({ cohort: 1, testrunid: 'uphnomove' });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;

    // Re-anchor on the parking stage (precondition only).
    await parkAt(tokenDocId, FIRST_STAGE);

    // (1) SELFMOVABLE-GATE (PLAN P1 #6; flow-config.md §0 row 3 / §2 V9): the participant simulator must
    //     emit NO self-move for a `selfmovable:false` parking stage. The simulator stands in for the
    //     Flutter participant self-move ONLY (SHARED CONVENTIONS); on this stage the participant has no
    //     CTA, so the harness does NOT call sim.advance(). We PROVE the gate by reading the PRODUCT: the
    //     stage has no self-move edge in the oracle, the stageproperty says selfmovable:false, and the
    //     `queue stage log` collection is empty for this token (no self-write occurred).
    expect(outEdgesForVariation(MODEL, FIRST_STAGE, VID).some((e: any) => e.type === 'selfmove'),
      'UPH-02: the parking stage must expose NO self-move edge in the oracle (selfmovable gate)').toBe(false);
    expect(cfg.stageproperty[FIRST_STAGE].selfmovable, 'UPH-02: stageproperty.selfmovable == false').toBe(false);

    // The product wrote ZERO stage-log rows (read the real collection via the sim's allowlist-pinned
    // handle / the assertions reader — never a value the test wrote).
    expect(await sim.logCount(tokenDocId), 'UPH-02: ZERO "queue stage log" rows for the parked token (no move fired)').toBe(0);
    expect((await readLogRows(tokenDocId)).length, 'UPH-02: assertions reader also sees zero log rows').toBe(0);

    // The token never moved: it still sits on the entry==terminal stage with previousstage null
    // (the seeded/parked state, which NO product move overwrote — read from the product).
    expect(await sim.currentStage(tokenDocId), 'UPH-02: token still on the parking stage (never advanced)').toBe(FIRST_STAGE);

    // (2) THE SIX UNIVERSAL INVARIANTS AT ZERO TRANSITIONS — all read PRODUCT output / the oracle:
    //   NO-ORPHAN — lone token exists, single cohort sibling, and (since it never moved past entry) it
    //               legitimately has zero log rows (the movedPastEntry guard does not fire).
    await assertNoOrphan(tokenDocId);
    //   EVERY-MOVE-LOGGED — VACUOUS 0 == 0, minNonSelf 0 (no operator/CF move). A secretly-advanced
    //               token would have ≥1 row and FAIL here — the test is not vacuously green.
    await assertEveryMoveLogged(tokenDocId, 0, { minNonSelf: 0 });
    //   NO-STAGE-SKIPPED — vacuously satisfied: there is no observed transition to validate.
    await assertNoStageSkipped(tokenDocId, MODEL, VID);
    //   TERMINAL-REACHED — entry IS terminal: currentstage == parking stage AND it has ZERO scoped
    //               out-edges in the oracle (proves it is a real terminal, not just a name).
    await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });
    //   LOOP-BOUND — trivially ≤ 2 (zero edge traversals recorded).
    await assertLoopBound(tokenDocId, 2);

    // (3) Belt-and-suspenders on the vacuity: observedTransitions is empty (no from→to hop ever recorded).
    expect((await observedTransitions(tokenDocId)).length, 'UPH-02: zero observed transitions for the parked token').toBe(0);
  });
});
