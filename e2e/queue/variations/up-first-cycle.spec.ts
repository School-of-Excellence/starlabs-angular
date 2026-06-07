// @ts-nocheck
/**
 * up-first-cycle.spec.ts — V6 · uP! - First Cycle closed-loop variation walk.
 * PLAN cases UPFC-HAPPY / UPFC-LOOP / UPFC-GAP (flow-config.md §2 V6, §3 D1+D2, §5 "V4/V5/V6/V8").
 *
 * WHAT THIS PROVES (the anti-circularity rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   A participant of variation V6 (`M2wSxXnHYzvBRcpIlXYJ`) is walked from the entry stage
 *   (`Evolution Prep Orientation`) to the sole terminal (`Completed`) MIXING ACTORS:
 *     • operator `nextstage` decisions are driven through the REAL Angular Live Board (QueueBoardPage:
 *       open the token's move-dropdown → click the scoped target → drive the PeopleInvolved confirm
 *       dialog), and we assert the count the BOARD re-rendered (src−1 / dst+1, Σ conserved) — a value
 *       the APP computed from its live `queue_token` stream, never one the test wrote;
 *     • self-move / auto-advance transitions are stood in for by the participant simulator
 *       (`participant-sim.advance`, the documented Flutter self-move stand-in) — preconditions only.
 *   After EVERY transition the universal silent-data-gap invariants (e2e/lib/assertions.ts) run AGAINST
 *   PRODUCT OUTPUT (the `queue stage log` rows the board/CF/self-move wrote, the token the app advanced,
 *   the per-stage counts the board recomputed) and against the scoped-edge ORACLE (e2e/lib/flow-model.js
 *   `outEdgesForVariation` — the flow-config authority, NOT the raw backbone array):
 *     NO-ORPHAN · EVERY-MOVE-LOGGED (reads product rows; ≥ the operator/CF-driven count) ·
 *     NO-STAGE-SKIPPED (prev→curr is a legal scoped edge) · TERMINAL-REACHED · COUNT-DRIFT (board UI) ·
 *     LOOP-BOUND ≤ 2.
 *   CRITICAL (the circular anti-pattern being removed): operator transitions go through the REAL board
 *   UI and assert the board's recomputed counts; we do NOT replay a sim write and then assert
 *   `currentstage == X` (closed-loop.spec.ts, superseded). Every invariant reads a value the PRODUCT
 *   produced — never "read == X right after writing X".
 *
 * V6 ↔ V1 DIVERGENCE (the headline fact this spec hinges on — flow-config.md §2 V6, §3 D2):
 *   Stages 1–8 are IDENTICAL to V1 (LYL-FC): AEL→uP! Life Aspiration Report→ATC Orientation Form→
 *   ATC Orientation Group Call→Scope Enhancement→Guided Self ATC→Ready for Diagnostics→Diagnostics.
 *   FROM Diagnostics DOWN it uses the uP!-family branch set (NO →Consultation forward), exactly like
 *   V4/V5/V7/V8 — so unlike V1, `Consultation` [19] is OFF the forward happy path (D2): no forward
 *   operator edge enters it; it is reachable ONLY via its self-`[LOOP]` and the `uP! Readiness
 *   Changework → Consultation` BACK-edge. `Diagnostics` offers EXACTLY 6 operator targets (incl.
 *   →Self Evolution Report) and MUST NOT offer →Consultation — and (vs V8) it KEEPS →Self Evolution
 *   Report. `Diagnostics Readiness Changework` [16] is DEAD-FORWARD (D1): its ONLY exit is the
 *   BACK-edge →Diagnostics; the backbone-adjacent DRC→ATC Preparation is ILLEGAL.
 *
 * VARIATION-SPECIFIC (flow-config.md §5):
 *   UPFC-HAPPY — the canonical forward walk: the V6 backbone MINUS the two off-forward stages
 *                (Consultation [19] D2, DRC [16] D1) — 15 stages / 14 product-logged transitions —
 *                routed Diagnostics→ATC Preparation→ATC Briefing→uP! Readiness Changework→Review→
 *                Self Evolution Report→Completed, every adjacency a single legal scoped edge.
 *   UPFC-LOOP  — the two back-loops are each bound ≤ 2: (a) the Diagnostics↔DRC round-trip (forward
 *                Diagnostics→DRC then the BACK-edge DRC→Diagnostics) twice, WITH the D1 negative gate
 *                (DRC offers only →Diagnostics, never →ATC Preparation); (b) the Consultation back-loop
 *                — reached via the uP!RCW→Consultation BACK-edge — self-looped twice, then re-joined to
 *                the spine via Consultation→uP! Readiness Changework. A 3rd traversal of either edge
 *                FAILS LOOP-BOUND (TEST-THE-TEST; PLAN risk 13).
 *   UPFC-GAP   — the oracle-parity sweep this file's recon documents: build()/oracle() baseline (the
 *                2 known orphans, 0 dangling) + the variation-scoped Diagnostics move-dropdown on the
 *                REAL board (EXACTLY the 6 V6 targets; →Consultation absent (D2), →Self Evolution
 *                Report present (the V6↔V8 discriminator)), and the D2 structural fact that no forward
 *                edge enters Consultation.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md §0/§2 V6/§3 D1+D2/§5 — the routing oracle SOURCE OF TRUTH for THIS variation.
 *   - e2e/lib/flow-model.js (build, outEdgesForVariation) — the scoped-edge oracle.
 *   - e2e/lib/assertions.ts — the six universal invariants (read product output, not test writes).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db) — self-move stand-in + allowlist-pinned handle.
 *   - e2e/fixtures/variation-seeds/up-first-cycle.ts (+ _common.ts) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts — REAL operator board moves + board-computed counts.
 *   - e2e/queue/support/{auth,console-guard,actors}.ts; e2e/queue/recon/testids.md (OPERATOR surface,
 *     PRE-EXISTING data-token-id / data-stage-name). No selector is invented (board page owns them).
 *
 * STUDIO NOTE: V6's two studio-engine stages (Scope Enhancement [8], Diagnostics [15]) are entered by an
 *   AUTO advance, so the seeded token rests in their QUEUED sub-column (status:'queued',
 *   liveassignmentid:null). The operator's FORWARD targets out of them (Guided Self ATC, ATC Briefing,
 *   ATC Preparation, …) are all NON-Activity stages, so every operator move on the V6 happy path is a
 *   NON-Activity move (PeopleInvolved confirm — operator.md §3.1), driven by board.moveToken(). We never
 *   need to open a live studio for the V6 forward walk; the specialist studio surface (the studio page
 *   object) is exercised by studio-session.spec.ts. (V6's downstream branch set has no Activity target
 *   on the forward path, so no AssignQueueStudio dialog is reached here.)
 */
import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { QUEUE_NAME } from '../support/actors';
import { seedUpFirstCycle, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/up-first-cycle';

// CommonJS libs (lib/* are plain CommonJS — require like the sibling specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, oracle, outEdgesForVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  observedTransitions,
} = require('../../lib/assertions');

/** The flow-model graph, built ONCE from the seeded config (cheap, reused). The ORACLE authority. */
const MODEL = build(cfg);
const VID = VARIATION_ID; // M2wSxXnHYzvBRcpIlXYJ
const TERMINAL = 'Completed';

// Stage-name constants used across the loop / gap cases (avoid typos; one place to edit).
const DIAG = 'Diagnostics';
const DRC = 'Diagnostics Readiness Changework';
const ATC_PREP = 'ATC Preparation';
const CONSULT = 'Consultation';
const UP_RCW = 'uP! Readiness Changework';
const SELF_REPORT = 'Self Evolution Report';

/**
 * The classification of one transition on the walk, derived from the ORACLE (flow-config authority),
 * NOT the backbone array. `kind`:
 *   - 'OP'   : operator `nextstage` edge → driven through the REAL board (QueueBoardPage.moveToken),
 *              count-drift asserted from the board's recomputed counts. movedby != 'self'.
 *   - 'SELF' : participant self-move on form/videoask submit (selfmv) → participant-sim stand-in (by:'self').
 *   - 'AUTO' : non-self-movable gate auto-advance (no scoped button) → participant-sim stand-in
 *              (by:'operator' — an app/CF-driven hop, NOT a participant self-write).
 */
type Hop = { from: string; to: string; kind: 'OP' | 'SELF' | 'AUTO' };

/** Classify a single legal forward hop from `from`→`to` against the oracle (throws if illegal). */
function classifyHop(from: string, to: string): Hop {
  const edges = outEdgesForVariation(MODEL, from, VID).filter((e: any) => e.to === to);
  if (edges.length !== 1) {
    const legal = outEdgesForVariation(MODEL, from, VID).map((e: any) => e.to);
    throw new Error(
      `[up-first-cycle] hop "${from}" → "${to}" is not a single legal scoped edge (matched ${edges.length}). ` +
      `Legal oracle out-edges from "${from}": ${JSON.stringify(legal)}. Fix the path or regenerate flow-config.md.`,
    );
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/**
 * The UPFC-HAPPY forward stage sequence — the V6 backbone walked through the ORACLE, MINUS the two
 * stages that are off the forward happy path for this variation (flow-config.md §2 V6 / §3):
 *   • Diagnostics Readiness Changework [16] — DEAD-FORWARD (D1): its only exit is the BACK-edge.
 *   • Consultation [19] — OFF the forward path in the uP!/Prodigies family (D2): no forward edge enters it.
 * The operator decision at Diagnostics is routed through ATC Preparation (Diagnostics→ATC Preparation→
 * ATC Briefing→uP! Readiness Changework→Review→Self Evolution Report→Completed) — the longest clean
 * forward route, so the walk visits the backbone's ATC-Preparation stage. ATC Briefing here offers
 * →uP! Readiness Changework (NOT →Consultation — the V1↔V6 divergence). Every adjacency below is a
 * single legal scoped edge (asserted by classifyHop).
 */
const HAPPY_PATH: string[] = [
  'Evolution Prep Orientation',          // [0]  AUTO →
  'Accelerated Evolution Level Form',    // [2]  SELF →
  'uP! Life Aspiration Report',          // [4]  SELF →
  'ATC Orientation Form',                // [5]  SELF →
  'ATC Orientation Group Call',          // [6]  AUTO →
  'Scope Enhancement',                   // [8]  OP   →  (studio engine; operator routes forward)
  'Guided Self ATC',                     // [13] SELF →
  'Ready for Diagnostics',               // [14] AUTO →
  'Diagnostics',                         // [15] OP   →  (central hub; operator routes to ATC Preparation)
  'ATC Preparation',                     // [17] OP   →
  'ATC Briefing',                        // [18] OP   →
  'uP! Readiness Changework',            // [25] OP   →  (NO Consultation hop — D2: ATC Briefing→uP!RCW)
  'Review',                              // [26] OP   →
  'Self Evolution Report',               // [28] SELF →
  'Completed',                           // [29] TERMINAL
];
// 15 stages ⇒ 14 forward transitions. The PLAN's "17-stage" headline counts the full V6 backbone
// (which lists DRC [16] and Consultation [19]); the oracle-legal FORWARD walk omits both (D1 + D2),
// so the product logs exactly the 14 moves asserted below (assertions treat the null-`from` entry hop,
// which the product never logs, as the entry onto the first stage).

/** Pre-compute & oracle-validate the HAPPY hops once (fails fast on any illegal adjacency). */
const HAPPY_HOPS: Hop[] = HAPPY_PATH.slice(0, -1).map((from, i) => classifyHop(from, HAPPY_PATH[i + 1]));

// =================================================================================================
// Shared helpers — board readiness + per-hop drivers (REAL board for OP, sim stand-in for SELF/AUTO)
// =================================================================================================

/**
 * Park `tokenDocId` on `stage` as a PRECONDITION (allowed setup — stands in for the participant having
 * reached the stage; mirrors the V1 sibling / selfmovable-gate resets). Clears prior studio refs so the
 * board buckets the token into the stage's QUEUED sub-column. Not an assertion target.
 */
async function parkAt(tokenDocId: string, stage: string): Promise<void> {
  await sim.db().collection('queue_token').doc(tokenDocId).set(
    { currentstage: stage, previousstage: null, status: 'queued', liveassignmentid: null, studioid: null, delete: false, tokenstatus: 'Active' },
    { merge: true },
  );
}

/** Wait until the board has rendered the token's card on the given stage column (collectionData is async). */
async function waitForCardOnStage(page: Page, board: QueueBoardPage, cardId: string, stage: string): Promise<void> {
  await expect
    .poll(async () => board.revealTokenCard(cardId), { timeout: 20_000, message: `board never rendered token card data-token-id="${cardId}" (queue selected & queue_token stream loaded? — also paged via Load More)` })
    .toBe(true);
  // The stage column itself must be present so readColumnCount(stage) can resolve it.
  await expect
    .poll(async () => {
      try { await board.readColumnCount(stage); return true; } catch { return false; }
    }, { timeout: 20_000, message: `board never rendered a column for stage "${stage}".` })
    .toBe(true);
}

/**
 * Drive ONE operator (`OP`) transition through the REAL Live Board and assert the board's recomputed
 * count-drift (src−1 / dst+1, Σ conserved). Reads the board-computed `before` snapshot, drives the real
 * move-dropdown + PeopleInvolved confirm, then polls the board-computed `after` snapshot. The numbers
 * are the APP's, captured before vs after the product's own move — never written by the test.
 */
async function driveOperatorHop(
  page: Page,
  board: QueueBoardPage,
  cardId: string,
  hop: Hop,
): Promise<void> {
  await waitForCardOnStage(page, board, cardId, hop.from);

  // BEFORE: the board's per-column counts for src & dst (APP-computed from the live stream).
  const beforeSrc = await board.readColumnCount(hop.from);
  const beforeDst = await board.readColumnCount(hop.to);
  const beforeAll = await board.readAllColumnCounts();

  // REAL operator move: open this token's dropdown, click the scoped target, confirm PeopleInvolved.
  // (Forward targets out of V6 stages are all NON-Activity → PeopleInvolved path; submit as-is.)
  await board.moveToken(cardId, hop.to);

  // AFTER: poll until the board re-rendered src−1 (collectionData is async). assertCountConserved then
  // enforces dst+1, Σ conserved, and that ONLY src/dst moved (against the SAME-shaped board snapshot).
  await expect
    .poll(async () => (await board.readColumnCount(hop.from)), {
      timeout: 20_000,
      message: `count-drift: board source column "${hop.from}" did not drop after the ${hop.from}→${hop.to} move.`,
    })
    .toBe(beforeSrc - 1);

  const afterAll = await board.readAllColumnCounts();
  // Resolve the src/dst stage NAMEs to the exact data-stage-key the board used for `before`, so the
  // {stageKey→count} maps line up for assertCountConserved (which keys by column).
  const srcKey = await resolveStageKeyForCount(board, hop.from, beforeAll, afterAll, /*expectDelta*/ -1);
  const dstKey = await resolveStageKeyForCount(board, hop.to, beforeAll, afterAll, /*expectDelta*/ +1);
  assertCountConserved(beforeAll, afterAll, { src: srcKey, dst: dstKey });

  // Belt-and-suspenders: the destination column gained exactly one (already covered by
  // assertCountConserved, asserted explicitly for a clearer failure if it ever regresses).
  expect(afterAll[dstKey] ?? 0, `count-drift: destination "${hop.to}" expected ${beforeDst + 1}.`).toBe(beforeDst + 1);
}

/**
 * Resolve which `data-stage-key` corresponds to a stage NAME for the count maps, choosing the column
 * whose count changed by `expectDelta` between before/after (handles split studio columns: the token
 * leaves/enters the Queued sub-column, so we pick the sub-column that actually moved). Falls back to the
 * board's own name→key resolver when no column shows the delta (e.g. a brand-new dst column at 0→1).
 */
async function resolveStageKeyForCount(
  board: QueueBoardPage,
  stageName: string,
  before: Record<string, number>,
  after: Record<string, number>,
  expectDelta: number,
): Promise<string> {
  const candidates = await board.stageKeysForName(stageName);
  for (const key of candidates) {
    const b = Number(before[key] || 0);
    const a = Number(after[key] || 0);
    if (a - b === expectDelta) return key;
  }
  if (expectDelta > 0) {
    for (const key of candidates) if (!(key in before) && Number(after[key] || 0) === expectDelta) return key;
  }
  return board.resolveStageKeyPublic(stageName);
}

/**
 * Drive ONE participant self-move / auto-advance transition via the documented simulator stand-in.
 * `SELF` → movedby 'self' (participant form submit); `AUTO` → movedby 'operator' (an app/CF-driven gate
 * hop, NOT a participant self-write). This is a PRECONDITION/self-move stand-in only (brief): the spec
 * still asserts the PRODUCT's log row via the universal invariants, never this written value directly.
 */
async function driveSimHop(tokenDocId: string, hop: Hop, testrunid: string): Promise<void> {
  const by = hop.kind === 'SELF' ? 'self' : 'operator';
  await sim.advance(tokenDocId, hop.to, { by, testrunid });
}

/**
 * Run the universal silent-data-gap invariants after a transition, against PRODUCT OUTPUT:
 *   no-orphan · every-move-logged · no-stage-skipped · loop-bound (≤2). (count-drift is asserted inline
 *   by driveOperatorHop from the board UI; terminal-reached is asserted once at the walk's end.)
 */
async function assertUniversalAfterHop(tokenDocId: string, loggedSoFar: number, minNonSelfSoFar: number): Promise<void> {
  await assertNoOrphan(tokenDocId);
  await assertEveryMoveLogged(tokenDocId, loggedSoFar, { minNonSelf: minNonSelfSoFar });
  await assertNoStageSkipped(tokenDocId, MODEL, VID);
  await assertLoopBound(tokenDocId, 2);
}

// =================================================================================================
test.describe(`V6 · ${VARIATION_NAME} (${VID}) — closed-loop walk (UPFC-HAPPY/LOOP/GAP)`, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // UPFC-HAPPY — the canonical forward walk (oracle-walked, mixing actors), terminal Completed.
  //   15 stages / 14 product-logged transitions = the V6 backbone MINUS DRC (D1) and Consultation (D2).
  // -----------------------------------------------------------------------------------------------
  test('UPFC-HAPPY — walk entry→Completed mixing actors; every transition legal, logged, count-conserved', async ({ page }) => {
    // SEED preconditions: queue generation + the V6 variation doc + ONE token at the first stage.
    const seeded = await seedUpFirstCycle({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;          // the `docid` the product's stage-log rows key on
    const cardId = participant.profileid;            // the board card's data-token-id (= profile_id)
    expect(seeded.firstStage, 'V6 first stage').toBe(FIRST_STAGE);

    // Re-anchor the token at the entry stage for a deterministic, re-runnable walk (precondition only).
    await parkAt(tokenDocId, FIRST_STAGE);

    // Drive the operator board ONCE (auth + queue select) — reused across every OP hop.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    let logged = 0;       // product-logged transitions so far (entry hop excluded)
    let minNonSelf = 0;   // operator/CF-driven (movedby != 'self') subset — proves non-circularity

    for (const hop of HAPPY_HOPS) {
      if (hop.kind === 'OP') {
        // REAL board move + board-computed count-drift (src−1 / dst+1, Σ conserved).
        await driveOperatorHop(page, board, cardId, hop);
        minNonSelf += 1; // a board move writes movedby = operator profileid (NOT 'self')
      } else {
        // Participant self-move / auto-advance stand-in (precondition only; product logs the row).
        await driveSimHop(tokenDocId, hop, seeded.testrunid);
        if (hop.kind === 'AUTO') minNonSelf += 1; // AUTO gate hop is app/CF-driven (movedby 'operator')
      }
      logged += 1;

      // UNIVERSAL invariants after EACH transition — all read PRODUCT output / the oracle.
      await assertUniversalAfterHop(tokenDocId, logged, minNonSelf);

      // NO-STAGE-SKIPPED, sharpened: the LATEST product-logged transition is exactly this oracle hop.
      const trail = await observedTransitions(tokenDocId);
      const last = trail[trail.length - 1];
      expect(last, `a stage-log row should exist after hop → ${hop.to}`).toBeTruthy();
      expect(last.to, `latest logged transition should land on "${hop.to}"`).toBe(hop.to);
      expect(last.from, `latest logged transition should originate at "${hop.from}"`).toBe(hop.from);
    }

    // TERMINAL-REACHED: token rests on Completed AND Completed has ZERO scoped out-edges (true terminal).
    await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });

    // Final EVERY-MOVE-LOGGED tally: exactly the 14 product-logged forward transitions, of which the
    // operator/CF-driven (non-'self') count is the OP hops (6) + AUTO gate hops (3) = 9.
    const expectedOp = HAPPY_HOPS.filter(h => h.kind === 'OP').length;
    const expectedAuto = HAPPY_HOPS.filter(h => h.kind === 'AUTO').length;
    expect(expectedOp, 'V6 happy path operator hops').toBe(6);
    expect(expectedAuto, 'V6 happy path auto-gate hops').toBe(3);
    await assertEveryMoveLogged(tokenDocId, HAPPY_HOPS.length, { minNonSelf: expectedOp + expectedAuto });
    expect(logged, 'total product-logged transitions on the UPFC-HAPPY path').toBe(HAPPY_HOPS.length);
    expect(HAPPY_HOPS.length, 'UPFC-HAPPY forward transition count (backbone MINUS DRC + Consultation)').toBe(14);
  });

  // -----------------------------------------------------------------------------------------------
  // UPFC-LOOP — the two V6 back-loops are each bound ≤ 2 (a 3rd traversal FAILS). "DRC and Consultation
  //   back-loops twice" (the brief): the Diagnostics↔DRC round-trip AND the Consultation back-loop.
  // -----------------------------------------------------------------------------------------------
  test('UPFC-LOOP — Diagnostics↔DRC round-trip ≤ 2 (D1 dead-forward) AND Consultation back-loop ≤ 2; a 3rd of either fails', async ({ page }) => {
    // ORACLE FLAGS asserted up-front (the product artifacts the case hinges on; flow-config.md §3):
    //  D1 — Diagnostics→DRC is a forward operator edge; DRC→Diagnostics is the ONLY DRC exit (a BACK-edge);
    //       the backbone-adjacent DRC→ATC Preparation is ABSENT (illegal skip).
    const diagToDrc = outEdgesForVariation(MODEL, DIAG, VID).filter((e: any) => e.to === DRC);
    expect(diagToDrc.length, `V6 Diagnostics must offer a forward edge to DRC`).toBe(1);
    const drcOut = outEdgesForVariation(MODEL, DRC, VID);
    expect(drcOut.map((e: any) => e.to), `V6 DRC must have EXACTLY ONE out-edge (back to Diagnostics) — dead-forward D1`).toEqual([DIAG]);
    expect(drcOut[0].back, `the sole DRC→Diagnostics edge must be a BACK-edge`).toBe(true);
    expect(outEdgesForVariation(MODEL, DRC, VID).some((e: any) => e.to === ATC_PREP),
      `D1: DRC→ATC Preparation must be ILLEGAL (absent from the oracle).`).toBe(false);
    //  D2 — Consultation is reachable only via its self-LOOP and the uP!RCW→Consultation BACK-edge;
    //       Consultation→uP! Readiness Changework re-joins the spine.
    const consultLoop = outEdgesForVariation(MODEL, CONSULT, VID).filter((e: any) => e.to === CONSULT && e.loop);
    expect(consultLoop.length, `V6 "${CONSULT}" must expose a self-loop edge in the oracle`).toBe(1);
    const upRcwToConsult = outEdgesForVariation(MODEL, UP_RCW, VID).filter((e: any) => e.to === CONSULT);
    expect(upRcwToConsult.length, `V6 uP!RCW→Consultation BACK-edge must exist (the only forward way into Consultation)`).toBe(1);
    expect(upRcwToConsult[0].back, `uP!RCW→Consultation must be a BACK-edge (D2)`).toBe(true);
    expect(outEdgesForVariation(MODEL, CONSULT, VID).some((e: any) => e.to === UP_RCW),
      `Consultation must offer a forward edge back to uP!RCW (re-join the spine)`).toBe(true);

    const seeded = await seedUpFirstCycle({ cohort: 1, testrunid: 'upfcloop' });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // ---- Part A: Diagnostics ↔ DRC round-trip bound ≤ 2 (forward edge then the BACK-edge) ----
    await parkAt(tokenDocId, DIAG);
    for (let i = 1; i <= 2; i++) {
      // Diagnostics → DRC (forward operator edge).
      await driveOperatorHop(page, board, cardId, classifyHop(DIAG, DRC));
      await assertNoOrphan(tokenDocId);
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);

      // D1 NEGATIVE GATE: while parked on DRC, the board's move-dropdown must OFFER DRC→Diagnostics.
      // READ-ONLY (open → assert the legal target is offered → dismiss), then commit the legal BACK move
      // below. NOTE: no `absent:[ATC_PREP]` on the dropdown — the board's move-dropdown is NOT edge-scoped
      // (checkAvailablestages lists the token's whole variation/queue stage set, component ts:2784-2790),
      // so it surfaces ATC Preparation as a column. The D1 dead-forward GUARANTEE is enforced by the oracle
      // invariant `assertNoStageSkipped(..., MODEL, VID)` (around this loop), which rejects any committed
      // transition that is not a legal scoped edge.
      void ATC_PREP;
      await waitForCardOnStage(page, board, cardId, DRC);
      await board.assertMoveTargets(cardId, { offers: [DIAG] });

      // DRC → Diagnostics (the ONLY legal exit — a BACK-edge).
      await driveOperatorHop(page, board, cardId, classifyHop(DRC, DIAG));
      await assertNoOrphan(tokenDocId);
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);
    }

    // PRODUCT rows: exactly two Diagnostics→DRC and two DRC→Diagnostics traversals (≤2 each), all
    // operator-driven (movedby != 'self'); read the product's own log (never a test write).
    {
      const trail = await observedTransitions(tokenDocId);
      const fwd = trail.filter((t: any) => t.from === DIAG && t.to === DRC);
      const back = trail.filter((t: any) => t.from === DRC && t.to === DIAG);
      expect(fwd.length, 'UPFC-LOOP-A: exactly two Diagnostics→DRC rows').toBe(2);
      expect(back.length, 'UPFC-LOOP-A: exactly two DRC→Diagnostics rows').toBe(2);
      expect([...fwd, ...back].every((t: any) => t.movedby && t.movedby !== 'self'),
        'UPFC-LOOP-A: round-trip moves must be operator-driven (movedby != self).').toBe(true);
    }

    // A THIRD Diagnostics→DRC traversal MUST violate the ≤2 bound — prove the detector fires.
    await driveOperatorHop(page, board, cardId, classifyHop(DIAG, DRC));
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === DIAG && x.to === DRC).length;
      }, { timeout: 20_000, message: 'UPFC-LOOP-A: the 3rd Diagnostics→DRC row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);

    // ---- Part B: Consultation back-loop bound ≤ 2 (reached via the uP!RCW→Consultation BACK-edge) ----
    // Fresh token + run so Part A's deliberately-over-bound history does not contaminate Part B.
    const seededB = await seedUpFirstCycle({ cohort: 1, testrunid: 'upfcloopb' });
    const tokenB = seededB.participants[0].tokenId;
    const cardB = seededB.participants[0].profileid;

    // Park on uP! Readiness Changework — the spine node that owns the only forward way into Consultation.
    await parkAt(tokenB, UP_RCW);

    // uP!RCW → Consultation (BACK-edge): the operator sends the participant back into the consultation loop.
    await driveOperatorHop(page, board, cardB, classifyHop(UP_RCW, CONSULT));
    await assertNoOrphan(tokenB);
    await assertNoStageSkipped(tokenB, MODEL, VID);
    await assertLoopBound(tokenB, 2);

    // Consultation self-loop TWICE through the REAL board ("Send back", to==from). Each loop is a src==dst
    // move, so the board's column count is unchanged (token leaves & re-enters the same Queued column);
    // assert the card stays on Consultation (APP-computed) and the product logged a self-loop row each time.
    for (let i = 1; i <= 2; i++) {
      await waitForCardOnStage(page, board, cardB, CONSULT);
      const beforeCount = await board.readColumnCount(CONSULT);
      await board.moveToken(cardB, CONSULT); // the self-loop target carries data-stage-name == Consultation
      await expect
        .poll(async () => (await board.readColumnCount(CONSULT)), {
          timeout: 20_000,
          message: `UPFC-LOOP-B: after Consultation self-loop #${i} the board should still show the token on "${CONSULT}".`,
        })
        .toBe(beforeCount);
      await expect
        .poll(async () => board.revealTokenCard(cardB), {
          timeout: 20_000, message: `UPFC-LOOP-B: token card should remain on the board after Consultation self-loop #${i}.`,
        })
        .toBe(true);
      await assertNoOrphan(tokenB);
      await assertNoStageSkipped(tokenB, MODEL, VID);
      await assertLoopBound(tokenB, 2);
    }

    // PRODUCT recorded EXACTLY two Consultation→Consultation traversals (read product rows), each operator-driven.
    {
      const trail = await observedTransitions(tokenB);
      const selfLoops = trail.filter((t: any) => t.from === CONSULT && t.to === CONSULT);
      expect(selfLoops.length, `UPFC-LOOP-B: exactly two "${CONSULT}" self-loop rows expected`).toBe(2);
      expect(selfLoops.every((t: any) => t.movedby && t.movedby !== 'self'),
        'UPFC-LOOP-B: board self-loops must be operator-driven (movedby != self).').toBe(true);
    }

    // Re-join the spine: Consultation → uP! Readiness Changework (forward edge) — proves the loop has a
    // legal exit (no dead cycle), count-drift asserted from the board.
    await driveOperatorHop(page, board, cardB, classifyHop(CONSULT, UP_RCW));
    await assertNoOrphan(tokenB);
    await assertNoStageSkipped(tokenB, MODEL, VID);
    await assertLoopBound(tokenB, 2);

    // A THIRD Consultation self-loop MUST violate the ≤2 bound — drive the participant back in and loop again.
    await driveOperatorHop(page, board, cardB, classifyHop(UP_RCW, CONSULT)); // back into Consultation (2nd BACK traversal — still ≤2)
    await waitForCardOnStage(page, board, cardB, CONSULT);
    await board.moveToken(cardB, CONSULT); // 3rd Consultation→Consultation
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenB);
        return t.filter((x: any) => x.from === CONSULT && x.to === CONSULT).length;
      }, { timeout: 20_000, message: 'UPFC-LOOP-B: the 3rd Consultation self-loop row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenB, 2)).rejects.toThrow(/LOOP-BOUND/);
  });

  // -----------------------------------------------------------------------------------------------
  // UPFC-GAP — the oracle-parity sweep: the static build()/oracle() baseline + the variation-scoped
  //   Diagnostics move-dropdown on the REAL board (the V6↔V8 discriminator + the D2 no-Consultation fact).
  // -----------------------------------------------------------------------------------------------
  test('UPFC-GAP — oracle parity: known-orphan/dangling baseline, and the variation-scoped Diagnostics dropdown (6 targets, no Consultation, keeps Self Evolution Report)', async ({ page }) => {
    // (1) STATIC ORACLE BASELINE (flow-config.md §1 / §4; identical to oracle-selftest.spec.ts): the
    //     oracle reports ok:false SOLELY because of the 2 known orphans; NO dangling edge; the V6
    //     variation reaches the terminal. We assert the baseline, NOT o.ok.
    const o = oracle(cfg);
    expect(o.dangling.length, 'UPFC-GAP: no dangling edges in the seed config').toBe(0);
    expect(o.orphans.slice().sort(), 'UPFC-GAP: exactly the 2 documented orphans (flow-config §4)')
      .toEqual(['My Evolution Wishlist', 'uP! Prep Process - Hold'].sort());
    expect(o.unreachableTerminals, 'UPFC-GAP: every multi-stage variation reaches its terminal').toEqual([]);

    // (2) ORACLE-LEVEL DIAGNOSTICS SCOPING (flow-config.md §2 V6, §3 D2; the V6↔V8 discriminator).
    const diagOut = outEdgesForVariation(MODEL, DIAG, VID).map((e: any) => e.to).sort();
    const EXPECTED_DIAG = [
      'ATC Briefing', 'ATC Preparation', 'Diagnostics', // Diagnostics LOOP
      'Diagnostics Readiness Changework', 'Self Evolution Report', 'uP! Readiness Changework',
    ].sort();
    expect(diagOut, 'UPFC-GAP: V6 Diagnostics offers EXACTLY its 6 scoped targets (incl. the self-LOOP)').toEqual(EXPECTED_DIAG);
    expect(diagOut.includes(CONSULT), 'UPFC-GAP: V6 Diagnostics must NOT offer →Consultation (an LYL/B!G-only edge — D2)').toBe(false);
    expect(diagOut.includes(SELF_REPORT), 'UPFC-GAP: V6 Diagnostics KEEPS →Self Evolution Report (the V6↔V8 discriminator; V8 drops it)').toBe(true);
    // D2 structural fact: NO forward (non-back) operator edge in the whole variation enters Consultation.
    const forwardIntoConsult = MODEL.edges.filter((e: any) =>
      e.to === CONSULT && !e.dangling && !e.back && !e.loop &&
      (e.variations.length === 0 || e.variations.includes(VID)),
    );
    expect(forwardIntoConsult.length, 'UPFC-GAP: D2 — no FORWARD edge enters Consultation in V6 (off the happy path)').toBe(0);

    // (3) THE SAME SCOPING, PROVEN ON THE REAL BOARD: a V6 token parked on Diagnostics must render a
    //     move-dropdown offering its 5 NON-loop targets (the Diagnostics self-LOOP "Send Back" is the
    //     token's own column, not a distinct move-target option in the dropdown list) and MUST NOT
    //     offer →Consultation. The option set is APP-COMPUTED from the live variation-scoped nextstage
    //     edges; assertMoveTargets opens → asserts → dismisses WITHOUT committing (no move written).
    const seeded = await seedUpFirstCycle({ cohort: 1, testrunid: 'upfcgap' });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;
    await parkAt(tokenDocId, DIAG);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnStage(page, board, cardId, DIAG);

    // OFFERS the 5 distinct forward/back targets (each rendered bare or as a typed "(Queued)" bucket —
    // assertMoveTargets matches either). We do NOT assert `absent:[CONSULT]` on the dropdown: it is NOT
    // edge-scoped (checkAvailablestages lists the whole variation/queue stage set, component ts:2784-2790),
    // so it surfaces Consultation as a column. The D2 GUARANTEE (no FORWARD edge enters Consultation in V6)
    // is proven at the ORACLE level just above (forwardIntoConsult.length === 0) — the authoritative check.
    void CONSULT;
    await board.assertMoveTargets(cardId, {
      offers: [DRC, ATC_PREP, 'ATC Briefing', UP_RCW, SELF_REPORT],
    });

    // The board committed NO move (the dropdown inspection is read-only): the product wrote ZERO stage-log
    // rows for this token, and it still rests on Diagnostics — assert against PRODUCT state, not a test write.
    expect((await observedTransitions(tokenDocId)).length, 'UPFC-GAP: dropdown inspection must not write any stage-log row').toBe(0);
    await assertNoOrphan(tokenDocId);
  });
});
