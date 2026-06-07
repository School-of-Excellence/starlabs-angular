// @ts-nocheck
/**
 * up-prep-hold.spec.ts — V9 · uP! - Prep Hold closed-loop variation walk (the degenerate one).
 * PLAN cases UPH-00 / UPH-01 / UPH-02 (flow-config.md §2 V9, §4 orphan #2, §5 "V9 Prep-Hold")
 * PLUS the 72-journey expansion: this variation's FORWARD-JOURNEY set has exactly ONE member (the
 * zero-transition entry==terminal journey), enumerated from e2e/lib/forward-journeys.js and WALKED
 * data-driven so a failure names the exact journey — identical machinery to the multi-stage siblings,
 * just at journey-length 1 / zero transitions (see UPH-WALK below).
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
 *            its terminal in zero hops. Also asserts forwardJourneys(cfg, V9) == [[the parking stage]].
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
 *   UPH-WALK — THE 72-JOURNEY EXPANSION at journey-length 1: forwardJourneys(cfg, V9) yields exactly ONE
 *            forward journey — the singleton `[uP! Prep Process - Hold]` (entry IS terminal, zero forward
 *            edges, so the DFS terminates at the entry). We WALK it data-driven (one `test` per journey)
 *            asserting the SAME six universal invariants after each transition — of which there are ZERO,
 *            so every invariant is evaluated at its vacuous/terminal base case against PRODUCT state. This
 *            mirrors the sibling specs' "walk EVERY forward journey" coverage; V9's path space is
 *            finite-and-singleton, so walking "every forward journey" is walking this one.
 *
 * THE move-dropdown SCOPED-EDGE / variation-id NAMESPACE FIX (the brief's STEP-1 green-up; CONFIRMED on
 *   the live emulator + board source, identical to the multi-stage siblings):
 *     • seed-test-project.js `seedQueueAndVariations` writes the `queue variation` DOC id as
 *       `${testrunid}_${rawId}` (line 425), and the board keys its variation map by that DOC id
 *       (`mapVariation[document.id]`, dynamic-queue-manager-clone.ts:1814-1817).
 *     • BUT `seedParticipantToken` writes the TOKEN's `variationid` as the RAW id (line 510). So the
 *       board's `checkAvailablestages` lookup `mapVariation[token.variationid]` (ts:2784-2785) MISSES
 *       (raw key ≠ prefixed doc id) ⇒ `stagesToShow` is empty ⇒ the move-dropdown renders ZERO options.
 *   WHY THIS MATTERS EVEN FOR V9 (and why the green-up is NOT optional here): UPH-01 asserts ZERO ENABLED
 *   move-targets. With the RAW id the board can't resolve V9's variation AT ALL, so it renders zero
 *   targets for the WRONG reason (the namespace miss, not V9's terminality) — an ANTI-CIRCULARITY HOLE
 *   (the assertion would pass for every token regardless of whether the stage is genuinely terminal).
 *   FIX (PRECONDITION, in our owned spec only): park the token with its `variationid` set to the PREFIXED
 *   form so the board successfully loads V9's variation doc and computes its single-stage list
 *   (`[uP! Prep Process - Hold]`); THEN it correctly renders only the DISABLED self-stage and ZERO enabled
 *   targets — a genuine proof of terminality. The oracle assertions are UNAFFECTED: they take the RAW
 *   `VARIATION_ID` as an explicit arg (outEdgesForVariation / assertTerminalReached / assertNoStageSkipped),
 *   never reading `token.variationid`. The ROOT fix belongs in the shared seeder (seedParticipantToken
 *   should write the prefixed id) and is RETURNED as a seedRequest — this local override unblocks THIS spec.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md §0/§2 V9/§3/§4/§5 — the routing oracle SOURCE OF TRUTH for THIS variation.
 *   - e2e/lib/flow-model.js (build, oracle, outEdgesForVariation, reachableInVariation) — the scoped-edge oracle.
 *   - e2e/lib/forward-journeys.js (forwardJourneys) — the FINITE forward-journey enumerator (V9 ⇒ 1 journey).
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
import { QUEUE_NAME, TESTRUNID } from '../support/actors';
import { seedUpPrepHold, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/up-prep-hold';

// CommonJS libs (lib/* are plain CommonJS — require like the sibling specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, oracle, outEdgesForVariation, reachableInVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forwardJourneys } = require('../../lib/forward-journeys');
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
const VID = VARIATION_ID;            // PJQVQf9HU0PxSCIbH5re (RAW seed id — the oracle key, NEVER read off the token)
const TERMINAL = FIRST_STAGE;        // entry == terminal for V9: 'uP! Prep Process - Hold'

/**
 * The PREFIXED variation id the board keys its variation map by — `${testrunid}_${rawId}`, matching the
 * `queue variation` DOC id `seedQueueAndVariations` writes. See the header's "NAMESPACE FIX" block: the
 * token must carry this (not the raw id) for the board to resolve V9's single-stage list and render the
 * move-dropdown's (disabled) self-stage — so UPH-01's ZERO-enabled-targets assertion proves terminality,
 * not the namespace miss. RETURNED as a seedRequest for the root seeder fix.
 *
 * Derived from the SEEDED run's testrunid (NOT the global TESTRUNID) so it always matches the `queue
 * variation` DOC id THAT seed wrote — UPH-01 seeds under run1, but a per-test runid would otherwise
 * desync the prefix from the doc the board loaded. The DEFAULT (`run1`) is the board-driven UPH-01 case.
 */
function prefixedVariationId(testrunid: string): string {
  return `${testrunid}_${VID}`;
}
const PREFIXED_VARIATION_ID = prefixedVariationId(TESTRUNID); // run1 — the board-driven (UPH-01) default

/**
 * The FINITE forward-journey set for V9 (e2e/lib/forward-journeys.js). For a single-stage variation whose
 * sole stage has zero forward edges, the DFS terminates at the entry, yielding exactly ONE journey: the
 * singleton `[uP! Prep Process - Hold]` (entry IS terminal). This is the "walk EVERY forward journey"
 * coverage at its degenerate base case — enumerated from the SAME oracle source the multi-stage siblings use.
 */
const FORWARD_JOURNEYS: string[][] = forwardJourneys(cfg, VID);

/**
 * Park `tokenDocId` on the parking stage as a PRECONDITION (allowed setup — re-anchors the lone token
 * to the entry==terminal stage so the run is deterministic / re-runnable). Mirrors the sibling specs'
 * parkAt: it is NOT an assertion target; the spec asserts only PRODUCT output (board state, the empty
 * `queue stage log`, the oracle). Clears any prior studio refs so the board buckets the token into the
 * stage's simple (un-split) column. Sets the PREFIXED variationid (NAMESPACE FIX) so the board can
 * resolve V9's variation-scoped stage list when it builds the move-dropdown (see header).
 */
async function parkAt(tokenDocId: string, stage: string, prefixedVarId: string = PREFIXED_VARIATION_ID): Promise<void> {
  await sim.db().collection('queue_token').doc(tokenDocId).set(
    {
      // PREFIXED variationid so the board's checkAvailablestages can look up V9's stage list
      // (mapVariation is keyed by the prefixed DOC id; the raw id MISSES — header NAMESPACE FIX).
      // Caller passes the prefix derived from the run that seeded this token's variation doc.
      variationid: prefixedVarId,
      currentstage: stage,
      previousstage: null,
      status: 'queued',
      liveassignmentid: null,
      studioid: null,
      delete: false,
      tokenstatus: 'Active',
    },
    { merge: true },
  );
}

/**
 * Purge any prior `queue stage log` rows for `tokenDocId` so the per-run vacuous-zero invariants
 * (EVERY-MOVE-LOGGED 0==0, observedTransitions == 0) count THIS run only and survive idempotent re-runs
 * on the serialized shared emulator. A PRECONDITION (a freshly-arrived parked participant has no prior
 * trail) — never asserted. Mirrors the sibling specs' resetTokenForWalk log-purge.
 */
async function purgeLogRows(tokenDocId: string): Promise<void> {
  const db = sim.db();
  const prior = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
  await Promise.all(prior.docs.map((d: any) => d.ref.delete()));
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

/**
 * The SIX universal invariants (e2e/lib/assertions.ts) evaluated at ZERO transitions for the lone parked
 * token — the SAME assertion set the multi-stage siblings call after every hop, here at the degenerate
 * base case (no hop). Reads entirely PRODUCT state / the oracle; the RAW `VID` is passed explicitly so the
 * oracle never depends on the token's (prefixed) `variationid`. Shared by UPH-02 and the UPH-WALK journey.
 */
async function assertZeroTransitionInvariants(tokenDocId: string): Promise<void> {
  //   NO-ORPHAN — lone token exists, single cohort sibling, zero log rows (never moved past entry).
  await assertNoOrphan(tokenDocId);
  //   EVERY-MOVE-LOGGED — VACUOUS 0 == 0, minNonSelf 0 (no operator/CF move). A secretly-advanced token
  //               would have ≥1 row and FAIL — the test is NOT vacuously green by construction.
  await assertEveryMoveLogged(tokenDocId, 0, { minNonSelf: 0 });
  //   NO-STAGE-SKIPPED — vacuously satisfied: there is no observed transition to validate.
  await assertNoStageSkipped(tokenDocId, MODEL, VID);
  //   TERMINAL-REACHED — entry IS terminal: currentstage == parking stage AND it has ZERO scoped
  //               out-edges in the oracle (proves it is a real terminal, not just a name).
  await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });
  //   LOOP-BOUND — trivially ≤ 2 (zero edge traversals recorded).
  await assertLoopBound(tokenDocId, 2);
  //   COUNT-DRIFT (degenerate): no move occurred, so there is no per-stage delta to diff — the stable
  //   board count is asserted in UPH-01 (two product-rendered snapshots). Here, the absence of any
  //   observed transition IS the conservation proof (no token entered or left the lone stage).
  expect((await observedTransitions(tokenDocId)).length, 'zero observed transitions for the parked token').toBe(0);
}

// =================================================================================================
test.describe(`V9 · ${VARIATION_NAME} (${VID}) — single-stage parking (UPH-00/01/02 + journey walk)`, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // UPH-00 — STATIC ORACLE parity (no UI): entry==terminal, ZERO out-edges, selfmovable false,
  //   backbone length 1, the documented global-orphan / no-dangling baseline, AND the forward-journey
  //   enumerator yields exactly the singleton journey.
  // -----------------------------------------------------------------------------------------------
  test('UPH-00 — oracle: single stage IS the terminal (0 out-edges), selfmovable false, backbone len 1; orphan/dangling baseline; 1 forward journey', async () => {
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

    // (5) THE FORWARD-JOURNEY ENUMERATOR (the 72-journey expansion source): V9 has exactly ONE forward
    //     journey — the singleton [parking stage] (entry IS terminal, zero forward edges). This is the
    //     finite path space the UPH-WALK block walks in full (one journey ⇒ one walked test).
    expect(FORWARD_JOURNEYS.length, 'UPH-00: V9 has exactly ONE forward journey (singleton, zero transitions)').toBe(1);
    expect(FORWARD_JOURNEYS[0], 'UPH-00: the lone forward journey is [the parking stage] (entry==terminal)').toEqual([FIRST_STAGE]);
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

    // Re-anchor deterministically on the parking stage with the PREFIXED variationid (NAMESPACE FIX, see
    // header) so the board can resolve V9's variation-scoped stage list and render the (disabled) self-
    // stage — making the ZERO-enabled-targets assertion below a genuine terminality proof, not a miss.
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

    // (3) MOVE-DROPDOWN EMPTY: the lone token's move-dropdown offers ZERO ENABLED targets. With the
    //     PREFIXED variationid the board RESOLVES V9's single-stage list, so the only option it can render
    //     is the current stage itself — rendered DISABLED (you cannot move onto your own stage).
    //     assertNoEnabledMoveTargets opens → asserts (zero enabled; the lone option, if any, is the
    //     disabled self-stage) → dismisses WITHOUT committing. APP-computed from the live variation stream.
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

    // Re-anchor on the parking stage (precondition only) + purge any prior trail for a deterministic
    // vacuous-zero count on idempotent re-runs. Prefix from THIS seed's run (not driven through the board
    // here, but kept consistent with UPH-01 so the token's variationid always names a seeded variation doc).
    await parkAt(tokenDocId, FIRST_STAGE, prefixedVariationId(seeded.testrunid));
    await purgeLogRows(tokenDocId);

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

    // (2) THE SIX UNIVERSAL INVARIANTS AT ZERO TRANSITIONS — all read PRODUCT output / the oracle.
    await assertZeroTransitionInvariants(tokenDocId);
  });

  // -----------------------------------------------------------------------------------------------
  // UPH-WALK — THE 72-JOURNEY EXPANSION (degenerate length-1). Data-driven over forwardJourneys(cfg, V9):
  //   exactly ONE journey ⇒ exactly ONE walked test. "Walking" the singleton journey means seeding the
  //   token onto the journey's sole stage (entry==terminal), confirming the product holds it there with
  //   no movement, and asserting the SAME six universal invariants after each transition — of which there
  //   are ZERO, so each invariant is checked at its terminal/vacuous base case against PRODUCT state.
  //   A separate `test` per journey so a failure names the exact journey (here, the lone parking journey).
  // -----------------------------------------------------------------------------------------------
  for (let j = 0; j < FORWARD_JOURNEYS.length; j++) {
    const journey = FORWARD_JOURNEYS[j];
    const label = journey.join(' → ');
    test(`UPH-WALK[${j}] — forward journey {${label}} holds at entry==terminal with zero transitions; six invariants hold`, async () => {
      // A V9 forward journey is the singleton [parking stage]; defend that precondition explicitly so a
      // future config drift (a forward edge sneaking in) fails loudly HERE rather than walking a path the
      // degenerate harness can't drive.
      expect(journey.length, `UPH-WALK[${j}]: a V9 forward journey is a single stage (entry==terminal)`).toBe(1);
      expect(journey[0], `UPH-WALK[${j}]: the journey's sole stage is the parking stage`).toBe(FIRST_STAGE);
      const entry = journey[0];
      const terminal = journey[journey.length - 1];
      expect(entry, `UPH-WALK[${j}]: entry == terminal for a single-stage forward journey`).toBe(terminal);

      // Per-journey seed + run id so the walk is independent of UPH-01/02 (and of a re-run).
      const seeded = await seedUpPrepHold({ cohort: 1, testrunid: `uphwalk${j}` });
      const tokenDocId = seeded.participants[0].tokenId;

      // PRECONDITION: place the token at the journey's entry stage (== terminal) with a clean trail.
      // This stands in for "a fresh participant entered the V9 queue"; it is the journey's starting
      // point, never an assertion target. PREFIXED variationid (from THIS seed's run) for board-
      // resolvability parity with UPH-01, though this case is not driven through the board.
      await parkAt(tokenDocId, entry, prefixedVariationId(seeded.testrunid));
      await purgeLogRows(tokenDocId);

      // WALK the journey: there is exactly ONE stage and ZERO forward edges, so the walk advances ZERO
      // times. The oracle CONFIRMS there is nothing to drive — the entry has no scoped forward edge — so
      // any attempt to "advance" would itself be the bug this asserts the absence of.
      const forward = outEdgesForVariation(MODEL, entry, VID).filter((e: any) => !e.loop && !e.back);
      expect(forward.length, `UPH-WALK[${j}]: the parking stage exposes ZERO forward edges (nothing to walk)`).toBe(0);

      // The product holds the token at the entry==terminal stage (no CF/app/operator move could fire —
      // there is no edge). Read PRODUCT state.
      expect(await sim.currentStage(tokenDocId), `UPH-WALK[${j}]: token rests on the journey's terminal stage`).toBe(terminal);

      // ASSERT THE SIX UNIVERSAL INVARIANTS AFTER EACH TRANSITION (there are none) — the SAME set the
      // multi-stage walks call per hop, here at the zero-transition base case, read entirely from PRODUCT
      // state / the oracle (RAW VID passed explicitly; never the token's prefixed variationid).
      await assertZeroTransitionInvariants(tokenDocId);
      // TERMINAL-REACHED with the journey's own terminal (== entry) for completeness with the multi-stage
      // siblings' end-of-walk assertion (already covered inside assertZeroTransitionInvariants, asserted
      // again here against the journey-derived terminal to bind the walk's end to the enumerator's output).
      await assertTerminalReached(tokenDocId, VID, { terminal, oracle: MODEL });
    });
  }
});
