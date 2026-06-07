// @ts-nocheck
/**
 * prodigies-next-cycle.spec.ts — V4 · Prodigies - Next Cycle closed-loop variation
 * (PLAN §3.D cases PNC-WF-01 / PNC-WF-02 / PNC-WF-03; flow-config.md §2 V4 + §3 D1/D2).
 *
 * WHAT THIS PROVES (the variation slice of the silent-data-gap suite — assertions.ts header / brief):
 *   Walk one Prodigies-NC participant from its FIRST stage (Evolution Prep Orientation [0]) along the
 *   variation's 16-stage backbone to the sole terminal (Completed [29]), MIXING actors at each hop
 *   (participant self-move forms, AUTO gates, and operator moves), and after EVERY transition assert the
 *   universal invariants from e2e/lib/assertions.ts against the PRODUCT's own output — the `queue stage
 *   log` rows the app/CF/self-move wrote and the per-stage counts the REAL operator board re-rendered —
 *   NEVER a value this test wrote:
 *     • NO-ORPHAN          — exactly one token for this participant; a moved token has an audit row.
 *     • EVERY-MOVE-LOGGED  — one `queue stage log` row per driven transition; AND >=1 of them is a
 *                            REAL operator/board move (movedby != 'self'), so a suite that only round-
 *                            tripped participant self-writes could NOT satisfy it (anti-circularity).
 *     • NO-STAGE-SKIPPED   — each observed previousstage→currentstage is a LEGAL SCOPED EDGE per the
 *                            flow-model ORACLE for V4 (outEdgesForVariation), NOT a mere backbone
 *                            adjacency (flow-config.md §3: DRC is dead-forward, Consultation is off-path).
 *     • TERMINAL-REACHED   — currentstage == Completed AND Completed has ZERO scoped out-edges (oracle).
 *     • COUNT-DRIFT        — for the REAL-board operator move, the board's per-stage counts changed by
 *                            exactly src−1 / dst+1 with the total conserved (assertCountConserved over two
 *                            APP-recomputed board snapshots).
 *     • LOOP-BOUND         — no edge traversed > 2 times across the walk.
 *
 * CRITICAL ANTI-CIRCULARITY DESIGN (SHARED CONVENTIONS / the entire point of the rebuild):
 *   This is NOT the old circular walk (closed-loop.spec.ts, which advanced via sim writes and asserted
 *   currentstage == the value it just wrote — that file is SUPERSEDED by this directory). Instead:
 *     (a) The load-bearing OPERATOR transition is driven through the REAL Angular operator board — a real
 *         move-dropdown click + the real PeopleInvolved confirm dialog (queue-board.page.ts) — and we
 *         assert a value the APP COMPUTED: the board's re-rendered per-stage counts (src−1/dst+1, Σ
 *         conserved). V4's ONLY forward operator edge whose BOTH endpoints are plain (non-Activity)
 *         columns is `Review → Self Evolution Report` (every other V4 stage has a non-empty
 *         compulsoryactivity → the board splits it into Activity sub-columns and a move INTO it opens the
 *         AssignQueueStudio studio dialog — flow-config.md §2 V4 / operator.md §C–E). So that edge is the
 *         real-board count-drift proof, exactly as operator.spec.ts OP-04 drives it.
 *     (b) Every OTHER hop (the participant self-moves, the AUTO gates, and the operator hops whose target
 *         is an Activity stage) is performed by the SANCTIONED operator/board stand-in
 *         (participant-sim.advance — identical Firestore write shape to the apps, cf.md §10; `by:'self'`
 *         for participant self-moves/auto, `by:'operator'` for operator moves) ONLY to set up the
 *         preconditioned position; the ASSERTED values are then read from the PRODUCT's audit trail via
 *         assertions.ts (the rows the apps/CF/stand-in wrote) and compared to the ORACLE — branch (b) of
 *         the rule (assert app/CF output vs a KNOWN oracle, never read-back-what-we-wrote).
 *   Because the real-board move writes a non-`self` row, EVERY-MOVE-LOGGED's `minNonSelf >= 1` is
 *   satisfiable ONLY because a genuine product UI move occurred — closing the circularity gap that the
 *   old suite had. (Driving the *full* 16-stage walk through real studio open/close per Activity stage is
 *   out of this variation seed's scope — seedVariation seeds tokens at the first stage + the variation
 *   doc + staff only, no per-stage studio pairings — and is covered by studio-session.spec.ts SS-06/12;
 *   this spec follows the accepted sibling pattern of loop-bound-selftest.spec.ts: drive the real-UI hop
 *   on the plain edge, walk the rest with the stand-in, assert the product trail throughout.)
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per CLAUDE.md / SHARED CONVENTIONS):
 *   - e2e/queue/recon/flow-config.md §2 V4 (the authoritative scoped edges / terminals / selfmovable —
 *     the flow-model ORACLE is the authority, NOT the raw backbone), §3 D1 (DRC dead-forward) / D2
 *     (Consultation off the uP!/Prodigies-family happy path), §5 (the per-variation invariant set).
 *   - e2e/lib/flow-model.js (build + outEdgesForVariation) — the scoped-edge oracle.
 *   - e2e/lib/assertions.ts (the 6 invariants + readLogRows/observedTransitions read-only views).
 *   - e2e/fixtures/variation-seeds/prodigies-next-cycle.ts (the per-variation seed builder — VARIATION_ID,
 *     FIRST_STAGE; seeds PRECONDITIONS only) and its _common.ts (reuses the main seed-test-project.js).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db — the sanctioned self-move / operator stand-in
 *     + the allowlist-guarded Admin Firestore handle, test project / emulator only).
 *   - e2e/queue/pages/queue-board.page.ts (QueueBoardPage — REAL operator board: selectQueue / moveToken /
 *     readAllColumnCounts) — the real operator-move + board-count surface.
 *   - e2e/queue/support/auth.ts (loginAsOperator), actors.ts (TESTRUNID, QUEUE_NAME), console-guard.ts
 *     (attach in beforeEach, fail on a REAL app error), stubs (no real Zoom/FCM/Wati window escapes).
 *   - e2e/queue/recon/operator.md §C/§D (move-dropdown + PeopleInvolved), §4 (per-column count =
 *     column.allTokens.length, split into Queued/Waiting/Activity for compulsory-activity stages),
 *     testids.md OPERATOR surface (qm-move-*, PRE-EXISTING data-token-id = profile_id||docid).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { TESTRUNID, QUEUE_NAME } from '../support/actors';
import { seedProdigiesNextCycle, VARIATION_ID, FIRST_STAGE } from '../../fixtures/variation-seeds/prodigies-next-cycle';

// CommonJS libs (the e2e lib layer is plain CJS — require like the other specs/page objects do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertions = require('../../lib/assertions');

const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  observedTransitions,
} = assertions;

// ---------------------------------------------------------------------------------------------
// V4 oracle, built ONCE from the seeded config (cheap, reused). The flow-model is the AUTHORITY for
// legal scoped edges — NOT the raw stages[] backbone (flow-config.md §3 drift).
// ---------------------------------------------------------------------------------------------
const MODEL = build(cfg);
const VID = VARIATION_ID;                 // 'zvFQgmYarx1NKubIP70R' (flow-config.md §2 V4)
const TERMINAL = 'Completed';             // the sole multi-stage terminal (flow-config.md §2)

/** Stage names on the V4 walk (verified against flow-config.md §2 V4 + the live oracle output). */
const S = {
  EPO: 'Evolution Prep Orientation',          // [0] AUTO gate → AEL
  AEL: 'Accelerated Evolution Level Form',     // [2] SELF form → Prodigies Prep Form
  PPF: 'Prodigies Preparation Form',           // [3] SELF form → Scope Enhancement
  SCOPE: 'Scope Enhancement',                  // [8] OP studio engine (self-LOOP ≤2)
  EMA: 'Evolution Mapping Activity',           // [9] AUTO gate → In-EMA
  IEMA: 'In Evolution Mapping Activity',       // [10] AUTO link gate → Ready for Diagnostics (V4 fork)
  RFD: 'Ready for Diagnostics',                // [14] AUTO gate → Diagnostics
  DIAG: 'Diagnostics',                         // [15] OP hub (self-LOOP ≤2; 6 fwd edges, NO →Consultation)
  DRC: 'Diagnostics Readiness Changework',     // [16] OP DEAD-FORWARD (only edge: BACK→Diagnostics) (D1)
  ATC_PREP: 'ATC Preparation',                 // [17] OP (the D1 illegal-skip target from DRC)
  ATC_BRIEF: 'ATC Briefing',                   // [18] OP
  CONSULT: 'Consultation',                     // [19] OFF the forward happy path (D2)
  UP_RCW: 'uP! Readiness Changework',          // [25] OP
  REVIEW: 'Review',                            // [26] PLAIN OP — the real-board count-drift edge source
  SER: 'Self Evolution Report',                // [28] SELF form → Completed; PLAIN — real-board edge dest
  COMPLETED: TERMINAL,                         // [29] TERMINAL
};

/**
 * The deterministic Prodigies-NC happy-path walk: a SUBSEQUENCE of the backbone restricted to the
 * ORACLE's legal forward edges (flow-config.md §3 D2: Consultation is reachable only via its self-LOOP
 * or the uP!RCW BACK-edge, so the forward walk reaches Completed WITHOUT visiting it). Each hop is
 * tagged with the actor that performs it (validated against the oracle in the test body):
 *   self      = participant self-move on form submit (selfmove + selfmv:true)            → [SIM stand-in]
 *   auto      = auto-advance gate (selfmovable:false, no scoped operator button)         → [SIM stand-in]
 *   operator  = operator `nextstage` move on the live board                              → [SIM stand-in
 *               for Activity-target hops; REAL board for the plain→plain Review→SER hop, see REAL_BOARD]
 */
const WALK: { from: string; to: string; by: 'self' | 'auto' | 'operator' }[] = [
  { from: S.EPO, to: S.AEL, by: 'auto' },            // [0]→[2]  AUTO gate
  { from: S.AEL, to: S.PPF, by: 'self' },            // [2]→[3]  participant form submit (AEL fork → Prodigies)
  { from: S.PPF, to: S.SCOPE, by: 'self' },          // [3]→[8]  participant form submit
  { from: S.SCOPE, to: S.EMA, by: 'operator' },      // [8]→[9]  operator nextstage {next-cycle, done}
  { from: S.EMA, to: S.IEMA, by: 'auto' },           // [9]→[10] AUTO gate
  { from: S.IEMA, to: S.RFD, by: 'auto' },           // [10]→[14] AUTO link gate (V4 fork: → Ready for Diagnostics)
  { from: S.RFD, to: S.DIAG, by: 'auto' },           // [14]→[15] AUTO gate
  { from: S.DIAG, to: S.UP_RCW, by: 'operator' },    // [15]→[25] operator nextstage {done} (NO →Consultation: D2)
  { from: S.UP_RCW, to: S.REVIEW, by: 'operator' },  // [25]→[26] operator nextstage {Send for Review, done}
  { from: S.REVIEW, to: S.SER, by: 'operator' },     // [26]→[28] operator nextstage {Completed, done}  ← REAL BOARD
  { from: S.SER, to: S.COMPLETED, by: 'self' },      // [28]→[29] participant form submit → TERMINAL
];

/** The single hop driven through the REAL operator board (plain→plain — the only such V4 forward edge). */
const REAL_BOARD = { from: S.REVIEW, to: S.SER };

/** A walk hop is "non-self" (operator/board-driven) for the EVERY-MOVE-LOGGED minNonSelf lower bound. */
const EXPECTED_NON_SELF = WALK.filter((h) => h.by === 'operator').length;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** participant-sim.db() = the allowlist-guarded Admin Firestore handle (test project / emulator only). */
const adb = () => sim.db();

/** Reset the walked token to the variation's FIRST stage with a clean trail — re-runnable preconditioning
 *  (NOT an assertion target; identical to closed-loop.spec.ts resetting to a variation's entry). We delete
 *  this token's prior `queue stage log` rows so the per-walk audit trail is exactly the hops we drive — the
 *  KNOWN count the invariants are checked against. */
async function resetWalkedToken(tokenId: string): Promise<void> {
  await adb().collection('queue_token').doc(tokenId).update({
    currentstage: FIRST_STAGE,
    previousstage: null,
    liveassignmentid: null,
    studioid: null,
    status: 'queued',
  });
  // Clear this token's stage-log so EVERY-MOVE-LOGGED counts only THIS walk's transitions.
  const old = await adb().collection('queue stage log').where('docid', '==', tokenId).get();
  const batch = adb().batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  if (old.size) await batch.commit();
}

/** Advance one hop via the sanctioned operator/board stand-in (identical write shape to the apps —
 *  participant-sim.js:38-56, cf.md §10). `by:'self'` for participant self-moves AND auto gates (both are
 *  participant-side advances with no operator click); `by:'operator'` for operator moves. This sets up the
 *  preconditioned position only — the asserted values are read from the product trail / board afterwards. */
async function standInAdvance(tokenId: string, to: string, by: 'self' | 'auto' | 'operator'): Promise<void> {
  await sim.advance(tokenId, to, { by: by === 'operator' ? 'operator' : 'self', testrunid: TESTRUNID });
}

/** True iff `to` is the live `currentstage` of the token (read of REAL product state). */
async function isAt(tokenId: string, stage: string): Promise<boolean> {
  return (await sim.currentStage(tokenId)) === stage;
}

// ---------------------------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------------------------
test.describe('V4 · Prodigies - Next Cycle — closed-loop walk (PNC-WF-01/02/03)', () => {
  let guard: ConsoleGuard;
  // Seed handles shared across the (serialized) cases — seeded once, reused (workers:1).
  let walkedTokenId: string;
  let walkedProfileId: string;

  test.beforeAll(async () => {
    // PRECONDITION: seed the queue generation + the V4 variation doc + staff auth chain + ONE walked
    // participant token at the FIRST stage (Evolution Prep Orientation). Seeds preconditions ONLY — the
    // spec asserts the CF/app/board output, never this seeded value (_common.ts contract).
    const seeded = await seedProdigiesNextCycle();
    expect(seeded.variationId, 'seed must target the V4 Prodigies-NC variation id').toBe(VID);
    expect(seeded.firstStage, 'seed must start the token on the V4 first stage').toBe(FIRST_STAGE);
    expect(seeded.participants.length, 'seed must lay >=1 walked participant').toBeGreaterThan(0);
    walkedTokenId = seeded.participants[0].tokenId;
    walkedProfileId = seeded.participants[0].profileid;
    // Sanity: the seeded queue's display name is the one the operator board selects (actors.QUEUE_NAME).
    expect(seeded.queueName, 'seed queueName must equal the board QUEUE_NAME so selectQueue picks it').toBe(QUEUE_NAME);
  });

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page); // fail on a REAL app error (benign stubbed-external noise allowlisted)
  });
  test.afterEach(() => {
    assertNoFatal(guard, 'Prodigies-NC walk: no fatal console errors / pageerrors during the case');
  });

  // ===========================================================================================
  // PNC-WF-01 — full mixed-actor walk entry→terminal, invariants after EVERY transition, with the
  //   load-bearing operator move driven through the REAL board (board-rendered count-drift).
  // ===========================================================================================
  test('PNC-WF-01 walks Evolution Prep Orientation → Completed mixing actors; invariants hold after every transition; the Review→Self-Evolution-Report operator move is driven on the REAL board with board-rendered count-drift', async ({ page }) => {
    test.setTimeout(180_000);

    // --- 0. Confirm the planned walk is entirely LEGAL per the V4 oracle BEFORE driving anything, and
    //        that each hop's actor tag matches the oracle's edge type. This guards the walk against a
    //        config change (flow-config.md §3 risk 11): a no-skip assertion that trusted the backbone
    //        array could pass an illegal skip; we validate against outEdgesForVariation instead.
    for (const hop of WALK) {
      const edge = outEdgesForVariation(MODEL, hop.from, VID).find((e: any) => e.to === hop.to);
      expect(edge, `oracle: "${hop.from}" → "${hop.to}" must be a legal V4 scoped edge`).toBeTruthy();
      if (hop.by === 'operator') {
        expect(edge.type, `"${hop.from}"→"${hop.to}" is tagged operator but the oracle edge is ${edge.type}`).toBe('next');
      } else {
        // self / auto are both `selfmove` edges (selfmv:true ⇒ participant form submit; selfmv:false ⇒ AUTO gate).
        expect(edge.type, `"${hop.from}"→"${hop.to}" is tagged ${hop.by} but the oracle edge is ${edge.type}`).toBe('selfmove');
        expect(!!edge.selfmv, `"${hop.from}"→"${hop.to}" actor ${hop.by} vs oracle selfmv=${!!edge.selfmv}`).toBe(hop.by === 'self');
      }
    }
    // The REAL-board hop must be plain→plain (no compulsoryactivity) so a board move opens PeopleInvolved
    // (not the studio dialog) and the count-drift lands on simple columns (operator.md §C/§4).
    const compulsoryKeys = (s: string) => Object.keys((cfg.stageproperty[s] || {}).compulsoryactivity || {}).length;
    expect(compulsoryKeys(REAL_BOARD.from), `REAL-board source "${REAL_BOARD.from}" must be a plain (non-Activity) column`).toBe(0);
    expect(compulsoryKeys(REAL_BOARD.to), `REAL-board dest "${REAL_BOARD.to}" must be a plain (non-Activity) column`).toBe(0);

    // --- 1. Reset the walked token to the entry stage with a clean trail (re-runnable precondition).
    await resetWalkedToken(walkedTokenId);
    expect(await isAt(walkedTokenId, FIRST_STAGE), `token must start on "${FIRST_STAGE}"`).toBe(true);

    // --- 2. Log the operator onto the REAL board ONCE (used for the real-board hop; cheap to keep open).
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // --- 3. Walk the backbone hop-by-hop. After EACH transition, assert the universal invariants against
    //        the PRODUCT's audit trail + the oracle (never a value we wrote).
    let drivenTransitions = 0;
    let nonSelfDriven = 0;

    for (let i = 0; i < WALK.length; i++) {
      const hop = WALK[i];
      expect(await isAt(walkedTokenId, hop.from), `pre-hop ${i}: token must be at "${hop.from}"`).toBe(true);

      if (hop.by === 'operator' && hop.from === REAL_BOARD.from && hop.to === REAL_BOARD.to) {
        // ---- (a) REAL-UI operator move on the plain→plain edge, with board-rendered COUNT-DRIFT. ----
        // The board must have bucketed the token into the source column from its live queue_token stream.
        const card = page.locator(`[data-token-id="${cssEscape(walkedProfileId)}"]`).first();
        await expect
          .poll(async () => board.revealTokenCard(walkedProfileId), {
            timeout: 20_000,
            message: `board never rendered token card data-token-id="${walkedProfileId}" on "${hop.from}" (also paged via Load More)`,
          })
          .toBe(true);

        // Snapshot every column's APP-recomputed count BEFORE the move (assertCountConserved diffs two
        // app-computed snapshots — neither is a value the test wrote).
        const before = await board.readAllColumnCounts();
        const srcKey = stageKeyFor(before, hop.from);

        // [REAL-UI] open the token's move dropdown → click the (plain) target → confirm PeopleInvolved.
        // The PRODUCT performs the writes (queue_token update + `queue stage log` set, movedthrough
        // 'queue manager') — this method only drives clicks; we assert via the recomputed counts + trail.
        await board.moveToken(walkedProfileId, hop.to);

        // The board re-renders from its stream; poll until the destination column reflects the +1, then
        // snapshot AFTER and assert src−1 / dst+1 / Σ conserved on the BOARD's own numbers.
        await expect
          .poll(async () => {
            const now = await board.readAllColumnCounts();
            const dKey = stageKeyForOrNull(now, hop.to);
            return dKey ? now[dKey] : -1;
          }, { timeout: 20_000, message: `board "${hop.to}" column never rose after the operator move` })
          .toBe((before[stageKeyForOrNull(before, hop.to) ?? '__absent__'] ?? 0) + 1);

        const after = await board.readAllColumnCounts();
        const dstKey = stageKeyFor(after, hop.to);
        assertCountConserved(
          // Restrict the diff to the two columns this move touches (other tokens of the shared seed may
          // sit elsewhere; assertCountConserved also checks no UNRELATED column moved, so pass the full
          // snapshots keyed by the resolved src/dst keys).
          before,
          after,
          { src: srcKey, dst: dstKey },
        );
        nonSelfDriven++;
      } else {
        // ---- (b) Sanctioned stand-in advance (self / auto / Activity-target operator hop). ----
        await standInAdvance(walkedTokenId, hop.to, hop.by);
        if (hop.by === 'operator') nonSelfDriven++;
      }

      drivenTransitions++;
      expect(await isAt(walkedTokenId, hop.to), `post-hop ${i}: token must have advanced to "${hop.to}"`).toBe(true);

      // -------- universal invariants AFTER this transition (read the PRODUCT's output) --------
      // NO-ORPHAN: the walked token exists, is the only token for its (run, profile), and (now that it has
      // moved past entry) has an audit row explaining it.
      await assertNoOrphan(walkedTokenId, { expectSiblings: 1 });

      // EVERY-MOVE-LOGGED: exactly `drivenTransitions` `queue stage log` rows so far, and at least
      // `nonSelfDriven` of them are operator/board moves (movedby != 'self') — the count is NOT satisfiable
      // by participant self-writes alone (anti-circularity; the real-board move guarantees >=1 once driven).
      await assertEveryMoveLogged(walkedTokenId, drivenTransitions, { minNonSelf: nonSelfDriven });

      // NO-STAGE-SKIPPED: every observed previousstage→currentstage is a LEGAL scoped oracle edge for V4
      // (NOT a backbone adjacency — flow-config.md §3). A DRC→ATC-Preparation-style skip would FAIL here.
      await assertNoStageSkipped(walkedTokenId, MODEL, VID);

      // LOOP-BOUND: no single edge traversed > 2 times (the happy path traverses each edge once).
      await assertLoopBound(walkedTokenId, 2);
    }

    // --- 4. TERMINAL-REACHED: the token is at Completed AND Completed has ZERO scoped out-edges (oracle) —
    //        a true terminal, not just a name; the move-dropdown for it would be empty.
    await assertTerminalReached(walkedTokenId, VID, { terminal: TERMINAL, oracle: MODEL });

    // --- 5. Final whole-trail checks: exactly WALK.length transitions logged, >=1 real operator/board
    //        move present, and the recorded trail is a contiguous oracle-legal path from entry to terminal.
    await assertEveryMoveLogged(walkedTokenId, WALK.length, { minNonSelf: EXPECTED_NON_SELF });
    expect(nonSelfDriven, 'PNC-WF-01: at least one transition must be a REAL operator/board move (anti-circularity)').toBeGreaterThanOrEqual(1);

    const trail = await observedTransitions(walkedTokenId);
    // The first row's `from` may be the entry (null/EPO); the last row must land on the terminal.
    expect(trail[trail.length - 1].to, 'PNC-WF-01: the final logged move must land on the terminal').toBe(TERMINAL);
    // At least one logged move is a real product (non-self) move — proves the trail is not all self-writes.
    expect(
      trail.some((t: { movedby: string | null }) => t.movedby && t.movedby !== 'self'),
      'PNC-WF-01: the product audit trail must contain >=1 operator/board (movedby != "self") move',
    ).toBe(true);
  });

  // ===========================================================================================
  // PNC-WF-02 — bounded loops: the Scope Enhancement studio self-LOOP and the Diagnostics self-LOOP
  //   may be traversed ≤2 times; a 3rd traversal of one edge MUST fail assertLoopBound (flow-config.md
  //   §2 / PLAN risk 13). Also assert these self-loops are genuinely legal V4 edges (so the overrun is a
  //   bounded-loop overrun, not an illegal skip).
  // ===========================================================================================
  test('PNC-WF-02 the Scope Enhancement and Diagnostics self-loops are bounded ≤2 (a 3rd traversal fails the loop guard)', async () => {
    test.setTimeout(120_000);

    for (const loopStage of [S.SCOPE, S.DIAG]) {
      // The self-loop must be a legal V4 scoped edge (operator "Send Back").
      const hasLoop = outEdgesForVariation(MODEL, loopStage, VID).some((e: any) => e.loop && e.to === loopStage);
      expect(hasLoop, `oracle: "${loopStage}" must expose a legal self-LOOP edge for V4`).toBe(true);

      // Fresh dedicated token so the trail is EXACTLY the loop traversals we drive (the KNOWN count the
      // guard's verdict is checked against) — independent of the shared walked token.
      const { tokenId } = await seedLoopToken(loopStage);

      // (i) Exactly 2 traversals of the self-loop are within the bound → the guard does NOT throw.
      //     Each traversal is an operator "Send Back" stand-in (identical write shape; movedby='operator').
      await standInAdvance(tokenId, loopStage, 'operator'); // traversal 1 (loopStage → loopStage)
      await standInAdvance(tokenId, loopStage, 'operator'); // traversal 2
      await assertLoopBound(tokenId, 2); // 2 == bound → passes (guard is not vacuously red)

      // Sanity: the trail genuinely recorded 2 self-loop hops on this edge (read the product's rows).
      const t2 = await observedTransitions(tokenId);
      const loops2 = t2.filter((x: { from: string | null; to: string }) => x.from === loopStage && x.to === loopStage).length;
      expect(loops2, `"${loopStage}" self-loop should have been traversed exactly twice`).toBe(2);

      // (ii) A 3rd traversal pushes the edge PAST its bound → assertLoopBound MUST throw (the guard bites).
      await standInAdvance(tokenId, loopStage, 'operator'); // traversal 3 (the overrun)
      let threw = false;
      try {
        await assertLoopBound(tokenId, 2);
      } catch (e: any) {
        threw = true;
        expect(String(e.message), 'PNC-WF-02: the loop-bound error must name the overrun edge + its count').toMatch(
          new RegExp(`${escapeRegExp(loopStage)} . ${escapeRegExp(loopStage)}|traversed 3 times`),
        );
      }
      expect(threw, `PNC-WF-02: a 3rd traversal of the "${loopStage}" self-loop MUST fail assertLoopBound (unbounded routing loop)`).toBe(true);
    }
  });

  // ===========================================================================================
  // PNC-WF-03 — backbone↔oracle DRIFT negatives for V4 (flow-config.md §3): the no-skip invariant must
  //   reject the backbone-adjacent-but-oracle-illegal moves. Proves assertNoStageSkipped is reading the
  //   ORACLE, not the stages[] array.
  //     D1: Diagnostics Readiness Changework is DEAD-FORWARD — its ONLY scoped out-edge is the BACK-edge
  //         to Diagnostics; DRC → ATC Preparation (the next backbone stage) is ILLEGAL.
  //     D2: Consultation is OFF the forward happy path — no forward operator edge enters it; it is
  //         reachable ONLY via its self-LOOP or the uP! Readiness Changework BACK-edge. So
  //         Diagnostics → Consultation and ATC Briefing → Consultation are ILLEGAL for V4.
  // ===========================================================================================
  test('PNC-WF-03 the no-skip invariant rejects the V4 drift skips: DRC→ATC-Preparation (D1) and Diagnostics/ATC-Briefing→Consultation (D2) are illegal oracle edges', async () => {
    test.setTimeout(120_000);

    // ---- Oracle-level assertions (the drift facts themselves; flow-config.md §3 D1/D2). ----
    // D1: DRC's ONLY out-edge is a BACK-edge to Diagnostics (dead-forward).
    const drcOut = outEdgesForVariation(MODEL, S.DRC, VID);
    expect(drcOut.map((e: any) => e.to).sort(), `D1: DRC out-edges must be exactly [Diagnostics] (dead-forward)`).toEqual([S.DIAG]);
    expect(drcOut[0].back, 'D1: the sole DRC out-edge must be a BACK-edge').toBe(true);
    expect(drcOut.some((e: any) => e.to === S.ATC_PREP), 'D1: DRC → ATC Preparation must NOT be an oracle edge').toBe(false);

    // D2: no forward operator edge enters Consultation; Diagnostics / ATC Briefing do NOT offer it.
    expect(outEdgesForVariation(MODEL, S.DIAG, VID).some((e: any) => e.to === S.CONSULT), 'D2: Diagnostics → Consultation must NOT exist for V4').toBe(false);
    expect(outEdgesForVariation(MODEL, S.ATC_BRIEF, VID).some((e: any) => e.to === S.CONSULT), 'D2: ATC Briefing → Consultation must NOT exist for V4').toBe(false);
    const intoConsult = MODEL.edges.filter(
      (e: any) => e.to === S.CONSULT && !e.dangling && (e.variations.length === 0 || e.variations.includes(VID)),
    );
    // Only the self-LOOP and the uP!RCW BACK-edge reach Consultation (no forward entry).
    expect(
      intoConsult.every((e: any) => e.loop || e.back),
      'D2: the only edges into Consultation for V4 must be its self-LOOP and the uP!RCW BACK-edge (no forward entry)',
    ).toBe(true);

    // ---- Behavioural assertion: assertNoStageSkipped FAILS on an illegal skip written to the trail. ----
    // We use a FRESH dedicated token and write (via the stand-in) a deliberately ILLEGAL move so the guard
    // has a real product row to reject. This is a TEST-THE-TEST of the no-skip invariant against the V4
    // oracle: the guard's VERDICT (throws) is the asserted value — never a read-back of what we wrote.
    for (const illegal of [
      { from: S.DRC, to: S.ATC_PREP, why: 'D1 (DRC is dead-forward; only legal exit is BACK→Diagnostics)' },
      { from: S.DIAG, to: S.CONSULT, why: 'D2 (Consultation is off the forward happy path)' },
    ]) {
      const { tokenId } = await seedLoopToken(illegal.from);
      // Stand-in writes the illegal hop (a real `queue stage log` row the guard will read). The seeded
      // token already sits at `illegal.from`, so this records illegal.from → illegal.to.
      await standInAdvance(tokenId, illegal.to, 'operator');

      let threw = false;
      try {
        await assertNoStageSkipped(tokenId, MODEL, VID);
      } catch (e: any) {
        threw = true;
        expect(String(e.message), `PNC-WF-03: the no-skip error must name the illegal move ${illegal.from}→${illegal.to}`).toContain(
          'NO-STAGE-SKIPPED',
        );
      }
      expect(
        threw,
        `PNC-WF-03: ${illegal.from} → ${illegal.to} must be rejected by assertNoStageSkipped — ${illegal.why}. ` +
          `If this passes, the invariant is trusting the backbone array, not the V4 oracle (flow-config.md §3).`,
      ).toBe(true);
    }
  });

  // =============================================================================================
  // Spec-local PRECONDITION helper (Admin SDK, allowlist-guarded via participant-sim.db()). Seeds a
  // FRESH dedicated walked token parked at `stage` for the loop/skip cases, so each case's audit trail is
  // exactly the hops it drives (the KNOWN-SEEDED count the invariants are checked against). Reuses the
  // shared queue/variation already seeded in beforeAll — it ONLY writes a queue_token (+ profile_data so
  // the board can render it), never re-implementing the seeder's queue/auth logic.
  // =============================================================================================
  let loopTokenSeq = 0;
  async function seedLoopToken(stage: string): Promise<{ tokenId: string; profileId: string }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const seeder = require('../../fixtures/seed-test-project');
    const d = adb();
    const n = loopTokenSeq++;
    const profileId = `${TESTRUNID}_pnc_loop_pf_${n}`;
    const tokenId = `${TESTRUNID}_pnc_loop_tok_${n}`;
    const queueRef = d.collection('queue generation').doc(seeder.queueGenDocId(TESTRUNID));

    // profile_data so the board card renders (data-token-id = profile_id || docid).
    await d.collection('profile_data').doc(profileId).set({
      docid: profileId, profileid: profileId, email: `pnc_loop_${n}+${TESTRUNID}@example.com`, name: `PNC Loop ${n}`,
      number: '9999900000', countrycode: '+91', testrunid: TESTRUNID, _testdata: true,
    });
    await d.collection('queue_token').doc(tokenId).set({
      docid: tokenId, profile_id: profileId, profile_name: `PNC Loop ${n}`,
      queueref: queueRef, variationid: VID,
      currentstage: stage, previousstage: null, status: 'queued', stagestatus: 'Yet to Start',
      tokenstatus: 'Active', tokennumber: 7000 + n, delete: false, queueposition: 7000 + n,
      people_involved: [], liveassignmentid: null, manuallymoved: false,
      createdon: admin.firestore.Timestamp.now(), logdate: admin.firestore.Timestamp.now(),
      testrunid: TESTRUNID, _testdata: true,
    });
    return { tokenId, profileId };
  }
});

// ---------------------------------------------------------------------------------------------
// Module-local pure helpers (board-count snapshot keying + regex escaping).
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the data-stage-key in a board { stageKey → count } snapshot for a SIMPLE (non-split) stage
 * NAME. The board keys simple columns `<stage>_<i>`; the V4 real-board edge endpoints (Review / Self
 * Evolution Report) are plain stages with exactly one column each (operator.spec.ts stageKeyFor twin).
 */
function stageKeyFor(counts: Record<string, number>, stageName: string): string {
  const key = stageKeyForOrNull(counts, stageName);
  if (!key) throw new Error(`stageKeyFor: no column key for stage "${stageName}". Keys: ${Object.keys(counts).join(', ')}`);
  return key;
}

/** As stageKeyFor but returns null instead of throwing (used while polling for the column to appear). */
function stageKeyForOrNull(counts: Record<string, number>, stageName: string): string | null {
  const exact = Object.keys(counts).find((k) => k === stageName);
  if (exact) return exact;
  const byPrefix = Object.keys(counts).find((k) => k.startsWith(`${stageName}_`) && !/_queued_|_waiting_|_activity_/.test(k));
  if (byPrefix) return byPrefix;
  const any = Object.keys(counts).find((k) => k.startsWith(`${stageName}_`));
  return any ?? null;
}

/** CSS.escape for attribute-value selectors (profile ids are token-safe, but escape defensively). */
function cssEscape(v: string): string {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape a string for use inside a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
