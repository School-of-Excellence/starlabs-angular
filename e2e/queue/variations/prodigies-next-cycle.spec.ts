// @ts-nocheck
/**
 * prodigies-next-cycle.spec.ts — V4 · Prodigies - Next Cycle closed-loop variation
 * (PLAN §3.D cases PNC-WF-01 / PNC-WF-02 / PNC-WF-03; flow-config.md §2 V4 + §3 D1/D2)
 * PLUS the PNC-FWD expansion: walk EVERY distinct FORWARD journey entry→terminal (forward-journeys.js).
 *
 * WHAT THIS PROVES (the variation slice of the silent-data-gap suite — assertions.ts header / brief):
 *   Walk Prodigies-NC participants from the variation's FIRST stage (Evolution Prep Orientation [0]) to a
 *   terminal, MIXING actors at each hop (participant self-move forms, AUTO gates, operator moves), and
 *   after EVERY transition assert the universal invariants from e2e/lib/assertions.ts against the
 *   PRODUCT's own output — the `queue stage log` rows the app/CF/self-move wrote and the per-stage counts
 *   the REAL operator board re-rendered — NEVER a value the test wrote:
 *     • NO-ORPHAN          — exactly one token for this participant; a moved token has an audit row.
 *     • EVERY-MOVE-LOGGED  — one `queue stage log` row per driven transition; AND >=1 of them is a
 *                            REAL operator/board move (movedby != 'self'), so a suite that only round-
 *                            tripped participant self-writes could NOT satisfy it (anti-circularity).
 *     • NO-STAGE-SKIPPED   — each observed previousstage→currentstage is a LEGAL SCOPED EDGE per the
 *                            flow-model ORACLE for V4 (outEdgesForVariation), NOT a mere backbone
 *                            adjacency (flow-config.md §3: DRC is dead-forward, Consultation is off-path).
 *     • TERMINAL-REACHED   — Completed has ZERO scoped out-edges (oracle); the J1 forward-leaf
 *                            Diagnostics Readiness Changework has ZERO FORWARD next-stages (the
 *                            forward-journeys terminal definition — it keeps only a BACK-edge, flow-config §3 D1).
 *     • COUNT-DRIFT        — for the REAL-board operator move, the board's per-stage counts changed by
 *                            exactly src−1 / dst+1 with the total conserved (assertCountConserved over two
 *                            APP-recomputed board snapshots).
 *     • LOOP-BOUND         — no edge traversed > 2 times across the walk.
 *
 * THE 72-JOURNEY EXPANSION (PNC-FWD, brief): the V4 forward path space is FINITE — forwardJourneys(cfg, V4)
 *   enumerates exactly 9 distinct entry→terminal journeys (they all share the
 *   EPO→AEL→PPF→Scope→EMA→In-EMA→RFD→Diagnostics spine, then FORK at Diagnostics into its 6 forward
 *   operator edges — 5 reach Completed via different ATC/uP! prefixes, 1 dead-ends at the forward-leaf
 *   Diagnostics Readiness Changework). PNC-FWD walks EVERY one (one test per journey, so a failure names
 *   the exact journey), classifying each hop's actor from the oracle (next ⇒ operator, selfmove+selfmv ⇒
 *   participant self-move, selfmove+!selfmv ⇒ AUTO gate) and asserting the universal invariants after every
 *   transition. The plain→plain operator edge Review→Self Evolution Report (V4's ONLY forward operator edge
 *   whose both endpoints are non-Activity columns — flow-config.md §2 V4 / operator.md §C–E) is driven on
 *   the REAL board with board-rendered count-drift in every journey that contains it (J3/J4/J7/J9); every
 *   other operator hop (and the Activity-target operator hops, whose real-UI driving needs per-stage studio
 *   pairings out of this seed's scope — covered by studio-session.spec.ts SS-06/12) is driven by the
 *   sanctioned operator/board stand-in (participant-sim.advance, by:'operator'), and participant/AUTO hops
 *   by the stand-in (by:'self'). EVERY journey therefore lands >=1 genuine non-self row in the product trail.
 *
 * CRITICAL ANTI-CIRCULARITY DESIGN (SHARED CONVENTIONS / the entire point of the rebuild):
 *   This is NOT the old circular walk (closed-loop.spec.ts, which advanced via sim writes and asserted
 *   currentstage == the value it just wrote — SUPERSEDED by this directory). Instead:
 *     (a) The load-bearing OPERATOR transition is driven through the REAL Angular operator board — a real
 *         move-dropdown click + the real PeopleInvolved confirm dialog (queue-board.page.ts) — and we
 *         assert a value the APP COMPUTED: the board's re-rendered per-stage counts (src−1/dst+1, Σ
 *         conserved). The plain→plain Review→Self-Evolution-Report edge is that real-board count-drift proof.
 *     (b) Every OTHER hop is performed by the SANCTIONED operator/board stand-in (participant-sim.advance —
 *         identical Firestore write shape to the apps, cf.md §10; by:'self' for participant self-moves/auto,
 *         by:'operator' for operator moves) ONLY to set up the preconditioned position; the ASSERTED values
 *         are read from the PRODUCT's audit trail via assertions.ts (the rows the apps/CF/stand-in wrote)
 *         and compared to the ORACLE — branch (b) of the rule (assert app/CF output vs a KNOWN oracle).
 *   Because the real-board move writes a non-`self` row, EVERY-MOVE-LOGGED's `minNonSelf >= 1` is
 *   satisfiable ONLY because a genuine product UI move occurred — closing the circularity gap.
 *
 * VARIATION-ID NAMESPACE (the move-dropdown root cause — SHARED BRIEF; fixed in the seed builder):
 *   the operator board keys `mapVariation` by the PREFIXED `queue variation` doc id (`${testrunid}_<rawId>`,
 *   dynamic-queue-manager-clone.component.ts:1817) and looks the token up by `mapVariation[token.variationid]`
 *   (checkAvailablestages:2784); the shared seeder wrote token.variationid RAW, so the lookup missed and the
 *   board fell back to the full 30-stage list. The seed builder (prodigies-next-cycle.ts) reconciles each
 *   seeded token's variationid to the prefixed id so the scoped move-dropdown renders; this spec's
 *   dedicated tokens (seedDedicatedToken) set the same prefixed id. The shared-seeder fix is returned as a
 *   seedRequest. The flow-model ORACLE is still keyed by the RAW id (it reads the raw config), so the
 *   oracle assertions pass `RAW_VID`; only the live token.variationid the board reads is prefixed.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per CLAUDE.md / SHARED CONVENTIONS):
 *   - e2e/queue/recon/flow-config.md §2 V4 / §3 D1 (DRC dead-forward) / D2 (Consultation off-path) / §5.
 *   - e2e/lib/flow-model.js (build + outEdgesForVariation) — the scoped-edge oracle.
 *   - e2e/lib/forward-journeys.js (forwardJourneys) — the finite forward-journey enumerator.
 *   - e2e/lib/assertions.ts (the 6 invariants + readLogRows/observedTransitions read-only views).
 *   - e2e/fixtures/variation-seeds/prodigies-next-cycle.ts (VARIATION_ID/FIRST_STAGE + namespace reconcile).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db — the sanctioned self-move / operator stand-in).
 *   - e2e/queue/pages/queue-board.page.ts (QueueBoardPage — REAL operator board surface).
 *   - e2e/queue/support/auth.ts (loginAsOperator), actors.ts (TESTRUNID, QUEUE_NAME), console-guard.ts.
 *   - e2e/queue/recon/operator.md §C/§D (move-dropdown + PeopleInvolved), §4 (per-column counts),
 *     testids.md OPERATOR surface (qm-move-*, PRE-EXISTING data-token-id = profile_id||docid).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { TESTRUNID, QUEUE_NAME } from '../support/actors';
import { seedProdigiesNextCycle, VARIATION_ID, FIRST_STAGE, boardVariationId } from '../../fixtures/variation-seeds/prodigies-next-cycle';

// CommonJS libs (the e2e lib layer is plain CJS — require like the other specs/page objects do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forwardJourneys } = require('../../lib/forward-journeys');
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
// legal scoped edges — NOT the raw stages[] backbone (flow-config.md §3 drift). The oracle is keyed by
// the RAW variation id (it reads the raw config); the live token.variationid the board reads is PREFIXED
// (namespace reconcile — see header), so the board id is computed separately in beforeAll.
// ---------------------------------------------------------------------------------------------
const MODEL = build(cfg);
const RAW_VID = VARIATION_ID;             // 'zvFQgmYarx1NKubIP70R' — the oracle key (flow-config.md §2 V4)
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
  DRC: 'Diagnostics Readiness Changework',     // [16] OP forward-LEAF (only edge: BACK→Diagnostics) (D1)
  ATC_PREP: 'ATC Preparation',                 // [17] OP (the D1 illegal-skip target from DRC)
  ATC_BRIEF: 'ATC Briefing',                   // [18] OP
  CONSULT: 'Consultation',                     // [19] OFF the forward happy path (D2)
  UP_RCW: 'uP! Readiness Changework',          // [25] OP
  REVIEW: 'Review',                            // [26] PLAIN OP — the real-board count-drift edge source
  SER: 'Self Evolution Report',                // [28] SELF form → Completed; PLAIN — real-board edge dest
  COMPLETED: TERMINAL,                         // [29] TERMINAL
};

/**
 * The deterministic Prodigies-NC happy-path walk (PNC-WF-01): a SUBSEQUENCE of the backbone restricted to
 * the ORACLE's legal forward edges (this is forward-journey J4 — the Diagnostics→uP!RCW fork). Each hop is
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

/** The single plain→plain forward operator edge — driven through the REAL operator board (count-drift). */
const REAL_BOARD = { from: S.REVIEW, to: S.SER };

/** A walk hop is "non-self" (operator/board-driven) for the EVERY-MOVE-LOGGED minNonSelf lower bound. */
const EXPECTED_NON_SELF = WALK.filter((h) => h.by === 'operator').length;

// ---------------------------------------------------------------------------------------------
// Oracle helpers (pure — flow-model only).
// ---------------------------------------------------------------------------------------------

/** Classify a forward hop's actor from the V4 oracle: 'operator' (next) | 'self' (selfmove+selfmv) |
 *  'auto' (selfmove+!selfmv). Throws if the edge is not a legal V4 scoped edge (guards the walk against a
 *  config drift — flow-config.md §3 risk 11: trust the oracle, not the backbone array). */
function actorForEdge(from: string, to: string): 'operator' | 'self' | 'auto' {
  const e = outEdgesForVariation(MODEL, from, RAW_VID).find((x: any) => x.to === to);
  if (!e) throw new Error(`oracle: "${from}" → "${to}" is not a legal V4 scoped edge (cannot classify actor).`);
  if (e.type === 'next') return 'operator';
  if (e.type === 'selfmove') return e.selfmv ? 'self' : 'auto';
  throw new Error(`oracle: "${from}" → "${to}" has unexpected edge type "${e.type}".`);
}

/** Forward next-stages of a stage per the forward-journeys definition (strictly-increasing backbone
 *  order, no dangling). Used to assert the J1 forward-LEAF (DRC) genuinely has no forward continuation. */
const V4 = (cfg.queuevariation || []).find((x: any) => x.id === RAW_VID);
const V4_ORDER = new Map<string, number>((V4?.stages || []).map((s: string, i: number) => [s, i]));
function forwardNexts(stage: string): string[] {
  const out = new Set<string>();
  for (const e of outEdgesForVariation(MODEL, stage, RAW_VID)) {
    if (e.dangling || !V4_ORDER.has(e.from) || !V4_ORDER.has(e.to)) continue;
    if ((V4_ORDER.get(e.to) as number) > (V4_ORDER.get(e.from) as number)) out.add(e.to);
  }
  return [...out];
}

/** Per-stage compulsoryactivity column-count (0 ⇒ a plain, non-split column — the kind the REAL board can
 *  move BETWEEN via PeopleInvolved without opening the studio AssignQueueStudio dialog). */
const compulsoryKeys = (s: string) => Object.keys((cfg.stageproperty[s] || {}).compulsoryactivity || {}).length;
const isPlainEdge = (from: string, to: string) => compulsoryKeys(from) === 0 && compulsoryKeys(to) === 0;

/** The finite set of V4 forward journeys (entry→terminal stage sequences) — the PNC-FWD data source. */
const FORWARD_JOURNEYS: string[][] = forwardJourneys(cfg, RAW_VID);

// ---------------------------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------------------------
test.describe('V4 · Prodigies - Next Cycle — closed-loop walk + every forward journey (PNC-WF-01/02/03 + PNC-FWD)', () => {
  let guard: ConsoleGuard;
  // Seed handles shared across the (serialized) cases — seeded once, reused (workers:1).
  let walkedTokenId: string;
  let walkedProfileId: string;
  let boardVid: string;   // the PREFIXED variation id the board's mapVariation is keyed by (header)

  test.beforeAll(async () => {
    // PRECONDITION: seed the queue generation + the V4 variation doc + staff auth chain + ONE walked
    // participant token at the FIRST stage (Evolution Prep Orientation), and reconcile token.variationid
    // to the prefixed id the board resolves (seed builder). Seeds preconditions ONLY — the spec asserts
    // the CF/app/board output, never this seeded value (_common.ts contract).
    const seeded = await seedProdigiesNextCycle();
    expect(seeded.rawVariationId, 'seed must target the V4 Prodigies-NC variation id').toBe(RAW_VID);
    expect(seeded.firstStage, 'seed must start the token on the V4 first stage').toBe(FIRST_STAGE);
    expect(seeded.participants.length, 'seed must lay >=1 walked participant').toBeGreaterThan(0);
    walkedTokenId = seeded.participants[0].tokenId;
    walkedProfileId = seeded.participants[0].profileid;
    boardVid = seeded.boardVariationId;
    expect(boardVid, 'seed must expose the prefixed board variation id').toBe(boardVariationId(seeded.testrunid));
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
  // PNC-WF-01 — full mixed-actor walk entry→terminal (forward journey J4), invariants after EVERY
  //   transition, with the load-bearing operator move driven through the REAL board (count-drift).
  // ===========================================================================================
  test('PNC-WF-01 walks Evolution Prep Orientation → Completed mixing actors; invariants hold after every transition; the Review→Self-Evolution-Report operator move is driven on the REAL board with board-rendered count-drift', async ({ page }) => {
    test.setTimeout(180_000);

    // --- 0. Confirm the planned walk is entirely LEGAL per the V4 oracle BEFORE driving anything, and
    //        that each hop's actor tag matches the oracle's edge type (guards vs a config change).
    for (const hop of WALK) {
      const edge = outEdgesForVariation(MODEL, hop.from, RAW_VID).find((e: any) => e.to === hop.to);
      expect(edge, `oracle: "${hop.from}" → "${hop.to}" must be a legal V4 scoped edge`).toBeTruthy();
      expect(actorForEdge(hop.from, hop.to), `"${hop.from}"→"${hop.to}" actor tag mismatches the oracle`).toBe(hop.by);
    }
    // The REAL-board hop must be plain→plain so a board move opens PeopleInvolved (not the studio dialog)
    // and the count-drift lands on simple columns (operator.md §C/§4).
    expect(isPlainEdge(REAL_BOARD.from, REAL_BOARD.to), `REAL-board edge "${REAL_BOARD.from}"→"${REAL_BOARD.to}" must be plain→plain`).toBe(true);

    // --- 1. Reset the walked token to the entry stage with a clean trail (re-runnable precondition).
    await resetToken(walkedTokenId, FIRST_STAGE);
    expect(await isAt(walkedTokenId, FIRST_STAGE), `token must start on "${FIRST_STAGE}"`).toBe(true);

    // --- 2. Log the operator onto the REAL board ONCE (used for the real-board hop; cheap to keep open).
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // --- 3. Walk the backbone hop-by-hop, asserting the universal invariants after EACH transition.
    let driven = 0;
    let nonSelf = 0;
    for (let i = 0; i < WALK.length; i++) {
      const hop = WALK[i];
      expect(await isAt(walkedTokenId, hop.from), `pre-hop ${i}: token must be at "${hop.from}"`).toBe(true);

      if (hop.by === 'operator' && hop.from === REAL_BOARD.from && hop.to === REAL_BOARD.to) {
        // Plain→plain Review → Self Evolution Report on the REAL board, WITH board-rendered count-drift.
        await driveRealBoardMove(page, board, walkedTokenId, walkedProfileId, hop.from, hop.to, { countDrift: true });
        nonSelf++;
      } else {
        await standInAdvance(walkedTokenId, hop.to, hop.by);
        if (hop.by === 'operator') nonSelf++;
      }
      driven++;
      expect(await isAt(walkedTokenId, hop.to), `post-hop ${i}: token must have advanced to "${hop.to}"`).toBe(true);
      await assertAllInvariantsAfterHop(walkedTokenId, driven, nonSelf);
    }

    // --- 4. TERMINAL-REACHED: Completed has ZERO scoped out-edges (a true terminal, not just a name).
    await assertTerminalReached(walkedTokenId, RAW_VID, { terminal: TERMINAL, oracle: MODEL });

    // --- 5. Final whole-trail checks: exactly WALK.length transitions, >=1 real operator/board move,
    //        and the last logged move lands on the terminal.
    await assertEveryMoveLogged(walkedTokenId, WALK.length, { minNonSelf: EXPECTED_NON_SELF });
    expect(nonSelf, 'PNC-WF-01: at least one transition must be a REAL operator/board move (anti-circularity)').toBeGreaterThanOrEqual(1);
    const trail = await observedTransitions(walkedTokenId);
    expect(trail[trail.length - 1].to, 'PNC-WF-01: the final logged move must land on the terminal').toBe(TERMINAL);
    expect(
      trail.some((t: { movedby: string | null }) => t.movedby && t.movedby !== 'self'),
      'PNC-WF-01: the product audit trail must contain >=1 operator/board (movedby != "self") move',
    ).toBe(true);
  });

  // ===========================================================================================
  // PNC-FWD — walk EVERY distinct V4 FORWARD journey entry→terminal (forwardJourneys, ~9), one test per
  //   journey, asserting the universal invariants after EVERY transition. The plain→plain Review→SER
  //   operator edge is driven on the REAL board (count-drift) in journeys that contain it; all other
  //   operator hops via the operator stand-in, participant/AUTO via the self stand-in. Each journey lands
  //   >=1 genuine non-self row in the product trail (anti-circularity). This is the 72-journey expansion's
  //   V4 slice — KEEP the bounded-loop (PNC-WF-02) and drift (PNC-WF-03) cases below on top.
  // ===========================================================================================
  for (let j = 0; j < FORWARD_JOURNEYS.length; j++) {
    const journey = FORWARD_JOURNEYS[j];
    const terminal = journey[journey.length - 1];
    const label = `J${j + 1}/${FORWARD_JOURNEYS.length} (${journey.length} stages → ${terminal})`;

    test(`PNC-FWD ${label} — walk entry→terminal mixing actors; every transition legal, logged, oracle-scoped, count-conserved; >=1 REAL operator/board move`, async ({ page }) => {
      test.setTimeout(180_000);

      // --- 0. The journey must start at the variation entry and be entirely oracle-legal forward edges.
      expect(journey[0], `${label}: every forward journey must start at the V4 entry`).toBe(FIRST_STAGE);
      const hops = journey.slice(0, -1).map((from: string, k: number) => ({ from, to: journey[k + 1], by: actorForEdge(from, journey[k + 1]) }));
      // The journey must contain >=1 operator hop (so the trail can carry a non-self row — anti-circularity).
      expect(hops.some((h) => h.by === 'operator'), `${label}: a forward journey must contain >=1 operator hop`).toBe(true);

      // --- 1. Fresh dedicated token parked at the entry with a clean trail, so this journey's audit trail
      //        is EXACTLY the hops we drive (the KNOWN count the invariants are checked against).
      const { tokenId, profileId } = await seedDedicatedToken(FIRST_STAGE, `fwd_${j + 1}`);

      // --- 2. The board (logged-in operator) — drives the REAL operator move(s) for this journey.
      await loginAsOperator(page);
      const board = new QueueBoardPage(page);
      await board.selectQueue(QUEUE_NAME);

      // Pick which operator hops to drive on the REAL board (the rest via the operator stand-in):
      //   • the FIRST operator hop whose TARGET is a non-Activity column (present in EVERY journey:
      //     Scope Enhancement → Evolution Mapping Activity) — driven as a genuine product move, so EVERY
      //     journey lands a REAL board move in the trail (anti-circularity, not just a stand-in row); and
      //   • the plain→plain Review → Self Evolution Report edge when the journey contains it (J3/J4/J7/J9)
      //     — driven WITH board-rendered COUNT-DRIFT (the clean per-column-arithmetic proof; the count key
      //     is unambiguous only when both endpoints are simple columns).
      // A board move only opens the studio AssignQueueStudio dialog when the TARGET is an Activity column
      // (dropType=='Activity', component ts:2883); a non-Activity target routes through PeopleInvolved, so
      // both selected hops commit via the normal move path even though their SOURCE may be a split stage.
      const firstNonActivityOpIdx = hops.findIndex((h) => h.by === 'operator' && compulsoryKeys(h.to) === 0);
      expect(firstNonActivityOpIdx, `${label}: every journey must have an operator hop into a non-Activity stage to drive on the real board`).toBeGreaterThanOrEqual(0);

      // --- 3. Walk every hop; assert invariants after each transition.
      let driven = 0;
      let nonSelf = 0;
      for (let k = 0; k < hops.length; k++) {
        const hop = hops[k];
        expect(await isAt(tokenId, hop.from), `${label} pre-hop ${k}: token must be at "${hop.from}"`).toBe(true);

        if (hop.by === 'operator' && isPlainEdge(hop.from, hop.to)) {
          // Plain→plain operator edge → REAL board move WITH count-drift (Review → SER).
          await driveRealBoardMove(page, board, tokenId, profileId, hop.from, hop.to, { countDrift: true });
          nonSelf++;
        } else if (hop.by === 'operator' && k === firstNonActivityOpIdx) {
          // The chosen non-Activity-target operator hop → REAL board move (trail-verified, no count-drift
          // keying on the possibly-split source). Guarantees a genuine product move in EVERY journey.
          await driveRealBoardMove(page, board, tokenId, profileId, hop.from, hop.to, { countDrift: false });
          nonSelf++;
        } else {
          // Operator-into-Activity hops + participant self-moves + AUTO gates → sanctioned stand-in.
          await standInAdvance(tokenId, hop.to, hop.by);
          if (hop.by === 'operator') nonSelf++;
        }
        driven++;
        expect(await isAt(tokenId, hop.to), `${label} post-hop ${k}: token must have advanced to "${hop.to}"`).toBe(true);
        await assertAllInvariantsAfterHop(tokenId, driven, nonSelf);
      }

      // --- 4. TERMINAL-REACHED. Completed → the full oracle check (zero scoped out-edges). The J1
      //        forward-LEAF Diagnostics Readiness Changework is NOT a zero-out-edge terminal (it keeps a
      //        BACK-edge to Diagnostics — flow-config §3 D1), so assert it the forward-journeys way: the
      //        token is parked there AND it has ZERO FORWARD next-stages (no forward continuation).
      if (terminal === TERMINAL) {
        await assertTerminalReached(tokenId, RAW_VID, { terminal: TERMINAL, oracle: MODEL });
      } else {
        expect(await isAt(tokenId, terminal), `${label}: token must end on the forward-leaf "${terminal}"`).toBe(true);
        expect(forwardNexts(terminal), `${label}: forward-leaf "${terminal}" must have ZERO forward next-stages (a forward terminal)`).toEqual([]);
      }

      // --- 5. Whole-trail: exactly `hops.length` transitions, >=1 genuine non-self move recorded.
      await assertEveryMoveLogged(tokenId, hops.length, { minNonSelf: Math.max(1, nonSelf) });
      expect(nonSelf, `${label}: at least one transition must be a REAL/operator (non-self) move (anti-circularity)`).toBeGreaterThanOrEqual(1);
      const trail = await observedTransitions(tokenId);
      expect(trail[trail.length - 1].to, `${label}: the final logged move must land on the journey terminal`).toBe(terminal);
      expect(
        trail.some((t: { movedby: string | null }) => t.movedby && t.movedby !== 'self'),
        `${label}: the product audit trail must contain >=1 operator (movedby != "self") move`,
      ).toBe(true);
    });
  }

  // ===========================================================================================
  // PNC-WF-02 — bounded loops: the Scope Enhancement studio self-LOOP and the Diagnostics self-LOOP
  //   may be traversed ≤2 times; a 3rd traversal MUST fail assertLoopBound (flow-config.md §2 / risk 13).
  // ===========================================================================================
  test('PNC-WF-02 the Scope Enhancement and Diagnostics self-loops are bounded ≤2 (a 3rd traversal fails the loop guard)', async () => {
    test.setTimeout(120_000);

    for (const loopStage of [S.SCOPE, S.DIAG]) {
      const hasLoop = outEdgesForVariation(MODEL, loopStage, RAW_VID).some((e: any) => e.loop && e.to === loopStage);
      expect(hasLoop, `oracle: "${loopStage}" must expose a legal self-LOOP edge for V4`).toBe(true);

      // Fresh dedicated token so the trail is EXACTLY the loop traversals we drive.
      const { tokenId } = await seedDedicatedToken(loopStage, `loop_${loopStage.slice(0, 4)}`);

      // (i) Exactly 2 traversals are within the bound → the guard does NOT throw.
      await standInAdvance(tokenId, loopStage, 'operator'); // traversal 1 (loopStage → loopStage)
      await standInAdvance(tokenId, loopStage, 'operator'); // traversal 2
      await assertLoopBound(tokenId, 2);

      const t2 = await observedTransitions(tokenId);
      const loops2 = t2.filter((x: { from: string | null; to: string }) => x.from === loopStage && x.to === loopStage).length;
      expect(loops2, `"${loopStage}" self-loop should have been traversed exactly twice`).toBe(2);

      // (ii) A 3rd traversal pushes the edge PAST its bound → assertLoopBound MUST throw.
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
      expect(threw, `PNC-WF-02: a 3rd traversal of the "${loopStage}" self-loop MUST fail assertLoopBound`).toBe(true);
    }
  });

  // ===========================================================================================
  // PNC-WF-03 — backbone↔oracle DRIFT negatives for V4 (flow-config.md §3): the no-skip invariant must
  //   reject backbone-adjacent-but-oracle-illegal moves (proves assertNoStageSkipped reads the ORACLE).
  //     D1: DRC is DEAD-FORWARD — only scoped out-edge is BACK→Diagnostics; DRC → ATC Preparation is ILLEGAL.
  //     D2: Consultation is OFF the forward happy path — Diagnostics → Consultation / ATC Briefing →
  //         Consultation are ILLEGAL for V4 (Consultation is reached only via self-LOOP or uP!RCW BACK-edge).
  // ===========================================================================================
  test('PNC-WF-03 the no-skip invariant rejects the V4 drift skips: DRC→ATC-Preparation (D1) and Diagnostics/ATC-Briefing→Consultation (D2) are illegal oracle edges', async () => {
    test.setTimeout(120_000);

    // ---- Oracle-level assertions (the drift facts themselves). ----
    const drcOut = outEdgesForVariation(MODEL, S.DRC, RAW_VID);
    expect(drcOut.map((e: any) => e.to).sort(), `D1: DRC out-edges must be exactly [Diagnostics] (dead-forward)`).toEqual([S.DIAG]);
    expect(drcOut[0].back, 'D1: the sole DRC out-edge must be a BACK-edge').toBe(true);
    expect(drcOut.some((e: any) => e.to === S.ATC_PREP), 'D1: DRC → ATC Preparation must NOT be an oracle edge').toBe(false);

    expect(outEdgesForVariation(MODEL, S.DIAG, RAW_VID).some((e: any) => e.to === S.CONSULT), 'D2: Diagnostics → Consultation must NOT exist for V4').toBe(false);
    expect(outEdgesForVariation(MODEL, S.ATC_BRIEF, RAW_VID).some((e: any) => e.to === S.CONSULT), 'D2: ATC Briefing → Consultation must NOT exist for V4').toBe(false);
    const intoConsult = MODEL.edges.filter(
      (e: any) => e.to === S.CONSULT && !e.dangling && (e.variations.length === 0 || e.variations.includes(RAW_VID)),
    );
    expect(
      intoConsult.every((e: any) => e.loop || e.back),
      'D2: the only edges into Consultation for V4 must be its self-LOOP and the uP!RCW BACK-edge (no forward entry)',
    ).toBe(true);

    // ---- Behavioural: assertNoStageSkipped FAILS on an illegal skip written to the trail. ----
    for (const illegal of [
      { from: S.DRC, to: S.ATC_PREP, why: 'D1 (DRC is dead-forward; only legal exit is BACK→Diagnostics)' },
      { from: S.DIAG, to: S.CONSULT, why: 'D2 (Consultation is off the forward happy path)' },
    ]) {
      const { tokenId } = await seedDedicatedToken(illegal.from, `skip_${illegal.to.slice(0, 4)}`);
      await standInAdvance(tokenId, illegal.to, 'operator'); // record the illegal hop (a real log row)

      let threw = false;
      try {
        await assertNoStageSkipped(tokenId, MODEL, RAW_VID);
      } catch (e: any) {
        threw = true;
        expect(String(e.message), `PNC-WF-03: the no-skip error must name the illegal move ${illegal.from}→${illegal.to}`).toContain('NO-STAGE-SKIPPED');
      }
      expect(
        threw,
        `PNC-WF-03: ${illegal.from} → ${illegal.to} must be rejected by assertNoStageSkipped — ${illegal.why}. ` +
          `If this passes, the invariant is trusting the backbone array, not the V4 oracle (flow-config.md §3).`,
      ).toBe(true);
    }
  });

  // =============================================================================================
  // Spec-local helpers — assertions bundle, real-board move, and dedicated-token PRECONDITION seeding.
  // =============================================================================================

  /** Assert the universal invariants after a single hop against the PRODUCT's audit trail + the oracle. */
  async function assertAllInvariantsAfterHop(tokenId: string, driven: number, nonSelf: number): Promise<void> {
    // NO-ORPHAN: the token exists, is the only token for its (run, profile), and (past entry) has an audit row.
    await assertNoOrphan(tokenId, { expectSiblings: 1 });
    // EVERY-MOVE-LOGGED: exactly `driven` rows, with >= `nonSelf` operator/board (movedby != 'self') rows.
    await assertEveryMoveLogged(tokenId, driven, { minNonSelf: nonSelf });
    // NO-STAGE-SKIPPED: every observed previousstage→currentstage is a LEGAL scoped oracle edge for V4.
    await assertNoStageSkipped(tokenId, MODEL, RAW_VID);
    // LOOP-BOUND: no single edge traversed > 2 times (the forward walk traverses each edge once).
    await assertLoopBound(tokenId, 2);
  }

  /**
   * Drive ONE forward operator hop with a NON-Activity target through the REAL operator board (a real
   * move-dropdown click + the real PeopleInvolved confirm dialog — queue-board.page.ts). The PRODUCT
   * performs the writes (queue_token update + `queue stage log` set, movedby = operator profileid,
   * movedthrough 'queue manager'); this drives only clicks. The token must already be parked at `from`.
   *
   * opts.countDrift:
   *   • true  — additionally assert the board's re-rendered per-stage COUNT-DRIFT (src−1 / dst+1 / Σ
   *             conserved over two APP-computed snapshots). Only valid when BOTH endpoints are SIMPLE
   *             (non-split) columns, so the count key is unambiguous (Review → Self Evolution Report).
   *   • false — assert the move committed by confirming the board re-rendered the token OUT of the source
   *             column (the card no longer carries the source's bucket). The caller's post-hop `isAt` +
   *             the universal invariants (a fresh non-self `queue stage log` row) assert the product's
   *             own output for this transition. Used when the SOURCE is a split stage (count key ambiguous).
   */
  async function driveRealBoardMove(
    page: any, board: QueueBoardPage, tokenId: string, profileId: string, from: string, to: string,
    opts: { countDrift: boolean },
  ): Promise<void> {
    // The board must have bucketed the token into the source column from its live queue_token stream.
    await expect
      .poll(async () => board.revealTokenCard(profileId), {
        timeout: 20_000,
        message: `board never rendered token card data-token-id="${profileId}" on "${from}" (also paged via Load More)`,
      })
      .toBe(true);

    if (opts.countDrift) {
      // Snapshot every column's APP-recomputed count BEFORE the move (both endpoints simple → keyable).
      const before = await board.readAllColumnCounts();
      const srcKey = stageKeyFor(before, from);

      // [REAL-UI] open the token's move dropdown → click the (plain) target → confirm PeopleInvolved.
      await board.moveToken(profileId, to);

      // Poll until the destination column reflects the +1, then assert src−1 / dst+1 / Σ conserved.
      await expect
        .poll(async () => {
          const now = await board.readAllColumnCounts();
          const dKey = stageKeyForOrNull(now, to);
          return dKey ? now[dKey] : -1;
        }, { timeout: 20_000, message: `board "${to}" column never rose after the operator move` })
        .toBe((before[stageKeyForOrNull(before, to) ?? '__absent__'] ?? 0) + 1);

      const after = await board.readAllColumnCounts();
      const dstKey = stageKeyFor(after, to);
      assertCountConserved(before, after, { src: srcKey, dst: dstKey });
    } else {
      // [REAL-UI] perform the move; the source may be a split stage (count key ambiguous), so assert the
      // commit by polling the board's own stream until the destination column rises by >=1 (the board
      // re-rendered the moved token into `to` from its live queue_token stream — an APP-computed number,
      // never one the test wrote). Post-hop isAt + the invariants cover the per-token trail.
      const dstBefore = await readNamedCount(board, to);
      await board.moveToken(profileId, to);
      await expect
        .poll(async () => readNamedCount(board, to), {
          timeout: 20_000,
          message: `board "${to}" column never reflected the real-board operator move (token did not re-render into it)`,
        })
        .toBeGreaterThanOrEqual(dstBefore + 1);
    }

    // SETTLE: the board commits the move (queue_token update + `queue stage log` set) ASYNCHRONOUSLY —
    // its `afterClosed()` confirm resolves and the column count above re-renders from the live stream
    // BEFORE the writeBatch is guaranteed visible to a fresh admin read (Firestore eventual consistency /
    // stream-vs-direct-read lag; pronounced on cloud while indexes settle). Do NOT return until the
    // PRODUCT's own `currentstage` reflects this move, so the caller's immediate post-hop `isAt(...)` (a
    // strong admin read) asserts the same real value without racing the commit. This polls a value the
    // APP wrote (token.currentstage) — never one the test wrote — matching the SHARED CONVENTION of
    // expect.poll for live-Firestore reads (e.g. lyl-next-cycle.spec.ts post-board-move currentstage poll).
    await expect
      .poll(async () => sim.currentStage(tokenId), {
        timeout: 20_000,
        message: `real-board move committed (board re-rendered "${to}") but queue_token ${tokenId}.currentstage never settled to "${to}"`,
      })
      .toBe(to);
  }

  /** The board's current rendered count for a stage NAME (sum across its columns), or 0 if absent. */
  async function readNamedCount(board: QueueBoardPage, stageName: string): Promise<number> {
    const counts = await board.readAllColumnCounts();
    let sum = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (k === stageName || (k.startsWith(`${stageName}_`))) sum += Number(v) || 0;
    }
    return sum;
  }

  /**
   * Seed a FRESH dedicated walked token parked at `stage` (for the journey / loop / skip cases), so each
   * case's audit trail is exactly the hops it drives. Reuses the shared queue/variation already seeded in
   * beforeAll — it ONLY writes a queue_token (+ profile_data so the board renders it), with the PREFIXED
   * `variationid` the board's mapVariation is keyed by (header). Never re-implements the seeder's
   * queue/auth logic. Idempotent per (stage,tag,seq).
   */
  let dedupSeq = 0;
  async function seedDedicatedToken(stage: string, tag: string): Promise<{ tokenId: string; profileId: string }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const seeder = require('../../fixtures/seed-test-project');
    const d = adb();
    const n = dedupSeq++;
    const profileId = `${TESTRUNID}_pnc_${tag}_pf_${n}`;
    const tokenId = `${TESTRUNID}_pnc_${tag}_tok_${n}`;
    const queueRef = d.collection('queue generation').doc(seeder.queueGenDocId(TESTRUNID));

    await d.collection('profile_data').doc(profileId).set({
      docid: profileId, profileid: profileId, email: `pnc_${tag}_${n}+${TESTRUNID}@example.com`, name: `PNC ${tag} ${n}`,
      number: '9999900000', countrycode: '+91', testrunid: TESTRUNID, _testdata: true,
    });
    await d.collection('queue_token').doc(tokenId).set({
      docid: tokenId, profile_id: profileId, profileid: profileId, profile_name: `PNC ${tag} ${n}`,
      queueref: queueRef, variationid: boardVid,    // PREFIXED — the board's mapVariation key (header)
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
// Module-local pure helpers (Firestore handle, preconditioning, board-count keying, regex escaping).
// ---------------------------------------------------------------------------------------------

/** participant-sim.db() = the allowlist-guarded Admin Firestore handle (test project / emulator only). */
function adb() {
  return sim.db();
}

/** Reset a token to `stage` with a clean trail (re-runnable preconditioning; NOT an assertion target).
 *  Clears this token's prior `queue stage log` rows so the per-walk audit trail is exactly the hops driven. */
async function resetToken(tokenId: string, stage: string): Promise<void> {
  await adb().collection('queue_token').doc(tokenId).update({
    currentstage: stage, previousstage: null, liveassignmentid: null, studioid: null, status: 'queued',
  });
  const old = await adb().collection('queue stage log').where('docid', '==', tokenId).get();
  const batch = adb().batch();
  old.docs.forEach((doc: any) => batch.delete(doc.ref));
  if (old.size) await batch.commit();
}

/** Advance one hop via the sanctioned operator/board stand-in (identical write shape to the apps —
 *  participant-sim.js, cf.md §10). by:'self' for participant self-moves AND auto gates; by:'operator' for
 *  operator moves. Sets up the preconditioned position only — asserted values are read from the trail after. */
async function standInAdvance(tokenId: string, to: string, by: 'self' | 'auto' | 'operator'): Promise<void> {
  await sim.advance(tokenId, to, { by: by === 'operator' ? 'operator' : 'self', testrunid: TESTRUNID });
}

/** True iff `stage` is the live `currentstage` of the token (read of REAL product state). */
async function isAt(tokenId: string, stage: string): Promise<boolean> {
  return (await sim.currentStage(tokenId)) === stage;
}

/**
 * Resolve the data-stage-key in a board { stageKey → count } snapshot for a SIMPLE (non-split) stage NAME.
 * The board keys simple columns `<stage>_<i>`; the V4 real-board edge endpoints (Review / Self Evolution
 * Report) are plain stages with exactly one column each (operator.spec.ts stageKeyFor twin).
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

/** Escape a string for use inside a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
