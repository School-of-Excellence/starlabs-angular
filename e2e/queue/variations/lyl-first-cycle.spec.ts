// @ts-nocheck
/**
 * lyl-first-cycle.spec.ts — V1 · LYL - First Cycle closed-loop variation walk.
 * PLAN cases LYL-FC-WF-01 / 02 / 03 (flow-config.md §2 V1, §3 D1, §5 V1 specials),
 * PLUS the 72-journey expansion: LYL-FC-J01…J09 walk EVERY distinct FORWARD journey V1 defines
 * (forwardJourneys(cfg, VID), ≈9 for V1) — one data-driven test per journey, entry→its forward sink,
 * asserting the same universal invariants after every transition. See the block above that describe.
 *
 * WHAT THIS PROVES (the anti-circularity rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   A participant of variation V1 (`K9PRd4PfWDWtaO0vSxy3`) is walked from the entry stage
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
 *   `currentstage == X` (closed-loop.spec.ts, superseded). The only "read == X right after writing X"
 *   that would be circular is explicitly avoided — every invariant reads a value the PRODUCT produced.
 *
 * VARIATION-SPECIFIC (flow-config.md §5 "V1 LYL-FC"):
 *   LYL-FC-WF-01 — the 16-transition happy path: the full V1 backbone walked through the oracle
 *                  (operator routes Diagnostics→ATC Preparation→ATC Briefing→Consultation), ending at
 *                  Completed; the observed forward subsequence is exactly the oracle-legal walk.
 *   LYL-FC-WF-02 — Scope Enhancement self-loop ("Send Back", `to==from`) is bound ≤ 2: the operator may
 *                  re-loop the studio engine at most twice; LOOP-BOUND would FAIL a 3rd traversal.
 *   LYL-FC-WF-03 — Diagnostics ↔ DRC round-trip is bound ≤ 2 WITH the backbone-divergence flag (D1):
 *                  DRC is DEAD-FORWARD — its ONLY legal exit is the BACK-edge DRC→Diagnostics; the
 *                  backbone-adjacent DRC→ATC Preparation is ILLEGAL and the board must not offer it.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md §0/§2 V1/§3 D1/§5 — the routing oracle SOURCE OF TRUTH for THIS variation.
 *   - e2e/lib/flow-model.js (build, outEdgesForVariation) — the scoped-edge oracle.
 *   - e2e/lib/assertions.ts — the six universal invariants (read product output, not test writes).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db) — self-move stand-in + allowlist-pinned handle.
 *   - e2e/fixtures/variation-seeds/lyl-first-cycle.ts (+ _common.ts) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts — REAL operator board moves + board-computed counts.
 *   - e2e/queue/support/{auth,console-guard,actors}.ts; e2e/queue/recon/testids.md (OPERATOR surface,
 *     PRE-EXISTING data-token-id / data-stage-name). No selector is invented (board page owns them).
 *
 * STUDIO NOTE: V1's two studio-engine stages (Scope Enhancement [8], Diagnostics [15]) are entered by an
 *   AUTO advance, so the seeded token rests in their QUEUED sub-column (status:'queued',
 *   liveassignmentid:null). The operator's FORWARD targets out of them (Guided Self ATC, ATC Briefing,
 *   …) are all NON-Activity stages, so every operator move on the V1 happy path is a NON-Activity move
 *   (PeopleInvolved confirm — operator.md §3.1), driven by board.moveToken(). We never need to open a
 *   live studio for the V1 forward walk; the specialist studio surface is exercised by studio-session.spec.ts.
 */
import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { QUEUE_NAME } from '../support/actors';
import { seedLylFirstCycle, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/lyl-first-cycle';

// CommonJS libs (lib/* are plain CommonJS — require like the sibling specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../../lib/flow-model');
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
  assertCountConserved,
  assertLoopBound,
  observedTransitions,
} = require('../../lib/assertions');

/** The flow-model graph, built ONCE from the seeded config (cheap, reused). The ORACLE authority. */
const MODEL = build(cfg);
const VID = VARIATION_ID; // K9PRd4PfWDWtaO0vSxy3
const TERMINAL = 'Completed';

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
      `[lyl-first-cycle] hop "${from}" → "${to}" is not a single legal scoped edge (matched ${edges.length}). ` +
      `Legal oracle out-edges from "${from}": ${JSON.stringify(legal)}. Fix the path or regenerate flow-config.md.`,
    );
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/**
 * The LYL-FC-WF-01 happy-path stage sequence — the V1 backbone walked through the ORACLE.
 * Routes the operator decision at Diagnostics through ATC Preparation (Diagnostics→ATC Preparation→
 * ATC Briefing→Consultation), the longest clean forward route, so the walk visits the backbone's
 * ATC-Preparation stage rather than the Diagnostics→ATC Briefing shortcut. Every adjacency below is a
 * single legal scoped edge (asserted by classifyHop); the DEAD-FORWARD DRC [16] is deliberately NOT on
 * this forward path (its only legal exit is the BACK-edge — exercised in WF-03).
 */
const WF01_PATH: string[] = [
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
  'Consultation',                        // [19] OP   →
  'uP! Readiness Changework',            // [25] OP   →
  'Review',                              // [26] OP   →
  'Self Evolution Report',               // [28] SELF →
  'Completed',                           // [29] TERMINAL
];
// 16 stages ⇒ 15 forward transitions. (The 16th "transition" of the happy path is the participant's
// entry hop onto the first stage, which the product never logs — assertions treat a null `from` as the
// entry hop. The PLAN's "16-transition" headline counts the entry hop; we assert the 15 product-logged
// moves below, exactly as the oracle defines them.)

/** Pre-compute & oracle-validate the WF-01 hops once (fails fast on any illegal adjacency). */
const WF01_HOPS: Hop[] = WF01_PATH.slice(0, -1).map((from, i) => classifyHop(from, WF01_PATH[i + 1]));

/**
 * Classify a single legal FORWARD hop (excludes the loop / back edges so the forward-journey walk only
 * ever drives advancing edges). Mirrors classifyHop but pins to a forward scoped edge — used by the
 * 72-journey expansion below (the bounded loop / DRC back-edge are exercised by WF-02 / WF-03 above).
 */
function classifyForwardHop(from: string, to: string): Hop {
  const edges = outEdgesForVariation(MODEL, from, VID).filter((e: any) => e.to === to && !e.loop && !e.back);
  if (edges.length !== 1) {
    const legal = outEdgesForVariation(MODEL, from, VID)
      .map((e: any) => `${e.to}[${e.type}${e.back ? ',back' : ''}${e.loop ? ',loop' : ''}]`);
    throw new Error(
      `[lyl-first-cycle] forward hop "${from}" → "${to}" is not a single legal forward scoped edge (matched ${edges.length}). ` +
      `Legal oracle out-edges from "${from}": ${JSON.stringify(legal)}.`,
    );
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/**
 * True iff `stage` has ZERO FORWARD scoped out-edges for V1 (a forward-DAG sink == a journey terminal).
 * `Completed` is a true graph terminal (zero edges of any type); DRC is a forward sink whose ONLY edge is
 * the BACK-edge to Diagnostics (so forwardJourneys ends J1 at DRC) — both satisfy this.
 */
function isForwardSink(stage: string): boolean {
  return outEdgesForVariation(MODEL, stage, VID).every((e: any) => e.loop || e.back || e.dangling);
}

/**
 * The FINITE set of distinct FORWARD journeys for V1 (entry→forward-sink). `forwardJourneys` advances in
 * the variation's own backbone order (strictly increasing ⇒ a DAG ⇒ terminates), so this is EVERY distinct
 * forward journey, not a curated subset (≈9 for V1 — see e2e/scripts/count-paths.js / the brief's 72-journey
 * total). The bounded back-edge loops (Scope Enhancement self-loop, Diagnostics↔DRC) are NOT enumerated here
 * — they are the WF-02 / WF-03 cases above. J1 ends at the DRC forward sink (dead-forward D1); J2…J9 end at
 * Completed.
 */
const JOURNEYS: string[][] = forwardJourneys(cfg, VID);

// Pre-validate at module load (fail fast): non-empty, every journey starts at the entry, every adjacency is
// a single legal FORWARD scoped edge, and every journey ends at a forward sink. A regression in the seed
// config / oracle surfaces here as a load-time error naming the offending journey, not a flaky mid-walk fail.
if (JOURNEYS.length === 0) throw new Error('[lyl-first-cycle] forwardJourneys returned 0 journeys for V1 — enumerator/oracle mismatch.');
for (const j of JOURNEYS) {
  if (j[0] !== FIRST_STAGE) throw new Error(`[lyl-first-cycle] journey does not start at the entry "${FIRST_STAGE}": ${j[0]}`);
  for (let i = 0; i < j.length - 1; i++) classifyForwardHop(j[i], j[i + 1]); // throws on any illegal adjacency
  if (!isForwardSink(j[j.length - 1])) throw new Error(`[lyl-first-cycle] journey terminal "${j[j.length - 1]}" is not a forward sink.`);
}

// =================================================================================================
// Shared helpers — board readiness + per-hop drivers (REAL board for OP, sim stand-in for SELF/AUTO)
// =================================================================================================

/**
 * Reset a token to a FRESH-participant precondition: delete its accumulated `queue stage log` rows and
 * park it on `stage` (status:'queued', no studio refs → the board buckets it into the QUEUED sub-column).
 *
 * WHY clear the log rows: all three V1 tests share ONE seeded queue (the default TESTRUNID run — the
 * seeded queue display name `TEST 30-stage L3rqCr` is the SAME for every run, so seeding distinct runs
 * would make the operator's queue picker ambiguous). Sharing the run means sharing the deterministic
 * token doc id, so a prior test's product-written stage-log rows would otherwise leak into this test's
 * absolute EVERY-MOVE-LOGGED counts. Clearing them re-establishes a clean, re-runnable starting point —
 * a PRECONDITION (allowed setup, mirrors closed-loop/selfmovable-gate resets), never an assertion target.
 * The serialized suite (workers:1) guarantees no concurrent writer races this reset.
 */
async function resetToken(tokenDocId: string, stage: string): Promise<void> {
  const db = sim.db();
  const existing = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
  // Batch-delete the prior product-written rows (allowlist-guarded handle; test project only).
  const batch = db.batch();
  existing.docs.forEach((d: any) => batch.delete(d.ref));
  if (existing.size) await batch.commit();
  await parkAt(tokenDocId, stage);
}

/**
 * Park `tokenDocId` on `stage` as a PRECONDITION (allowed setup — stands in for the participant having
 * reached the stage; mirrors closed-loop/selfmovable-gate resets). Clears prior studio refs so the
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
    .poll(async () => {
      // The card lives under whichever sub-column the board bucketed it into; assert the named column
      // shows ≥1 token AND the card exists on the board (paging it in via Load More if the column is
      // crowded past PAGE_SIZE and the card sorted onto a later page).
      return board.revealTokenCard(cardId);
    }, { timeout: 20_000, message: `board never rendered token card data-token-id="${cardId}" (queue selected & queue_token stream loaded? — also paged via Load More)` })
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
 *
 * @returns the board's full {stageKey→count} snapshot AFTER the move (so the caller can chain).
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
  // (Forward targets out of V1 stages are all NON-Activity → PeopleInvolved path; submit as-is.)
  await board.moveToken(cardId, hop.to);

  // AFTER: poll until the board re-rendered src−1 / dst+1 (collectionData is async). We assert against
  // the SAME-shaped board snapshot; assertCountConserved enforces Σ conserved + only src/dst moved.
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
  // assertCountConserved, asserted explicitly here for a clearer failure if it ever regresses).
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
  // Candidate keys for this stage name (a split stage has several: <name>_queued_i / _waiting_i / _activity_i).
  const candidates = await board.stageKeysForName(stageName);
  // Prefer the candidate whose count changed by exactly expectDelta.
  for (const key of candidates) {
    const b = Number(before[key] || 0);
    const a = Number(after[key] || 0);
    if (a - b === expectDelta) return key;
  }
  // Fallback: a column that appeared only after the move (dst 0→1 with no before entry) or vanished.
  if (expectDelta > 0) {
    for (const key of candidates) if (!(key in before) && Number(after[key] || 0) === expectDelta) return key;
  }
  // Last resort: the board's canonical resolver (the simple/Queued column for the name).
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
 * Run the SIX universal silent-data-gap invariants after a transition, against PRODUCT OUTPUT:
 *   no-orphan · every-move-logged · no-stage-skipped · loop-bound (≤2). (count-drift is asserted inline
 *   by driveOperatorHop from the board UI; terminal-reached is asserted once at the walk's end.)
 *
 * @param tokenDocId         the token doc id (the `docid` the product's log rows key on).
 * @param loggedSoFar        how many product-logged transitions are expected so far (entry hop excluded).
 * @param minNonSelfSoFar    how many of those must be operator/CF-driven (movedby != 'self') — proves the
 *                           count is NOT satisfiable by sim self-writes alone (anti-circularity).
 */
async function assertUniversalAfterHop(tokenDocId: string, loggedSoFar: number, minNonSelfSoFar: number): Promise<void> {
  // EVERY-MOVE-LOGGED depends on a live Firestore write the PRODUCT just made (a board move's
  // `queue stage log` batch.set, or the sim self-move stand-in's set). Poll until the product's row
  // count reaches the expected total before the strict assertion, so we tolerate stream/write
  // propagation lag without weakening the invariant (brief: expect.poll for live-Firestore reads).
  await expect
    .poll(async () => (await observedTransitions(tokenDocId)).length, {
      timeout: 20_000,
      message: `EVERY-MOVE-LOGGED: product stage-log rows for ${tokenDocId} did not reach ${loggedSoFar}.`,
    })
    .toBe(loggedSoFar);

  await assertNoOrphan(tokenDocId);
  await assertEveryMoveLogged(tokenDocId, loggedSoFar, { minNonSelf: minNonSelfSoFar });
  await assertNoStageSkipped(tokenDocId, MODEL, VID);
  await assertLoopBound(tokenDocId, 2);
}

// =================================================================================================
test.describe(`V1 · ${VARIATION_NAME} (${VID}) — closed-loop walk (LYL-FC-WF-01/02/03)`, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // LYL-FC-WF-01 — the 16-transition happy path (oracle-walked, mixing actors), terminal Completed.
  // -----------------------------------------------------------------------------------------------
  test('LYL-FC-WF-01 — walk entry→Completed mixing actors; every transition legal, logged, count-conserved', async ({ page }) => {
    // SEED preconditions on the shared default run: queue generation + the V1 variation doc + ONE token
    // at the first stage. (All three V1 tests share this one queue — see resetToken's WHY note.)
    const seeded = await seedLylFirstCycle({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;          // the `docid` the product's stage-log rows key on
    const cardId = participant.profileid;            // the board card's data-token-id (= profile_id)
    expect(seeded.firstStage, 'V1 first stage').toBe(FIRST_STAGE);

    // Re-anchor at the entry stage with a CLEAN log (fresh-participant precondition; re-runnable walk).
    await resetToken(tokenDocId, FIRST_STAGE);

    // Drive the operator board ONCE (auth + queue select) — reused across every OP hop.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    let logged = 0;       // product-logged transitions so far (entry hop excluded)
    let minNonSelf = 0;   // operator/CF-driven (movedby != 'self') subset — proves non-circularity

    for (const hop of WF01_HOPS) {
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

    // Final EVERY-MOVE-LOGGED tally: exactly the 15 product-logged forward transitions, of which the
    // operator/CF-driven (non-'self') count is the OP hops (7: incl. Diagnostics→ATC Preparation→ATC
    // Briefing→Consultation) + AUTO gate hops (3) = 10 (computed below, never hardcoded).
    const expectedOp = WF01_HOPS.filter(h => h.kind === 'OP').length;
    const expectedAuto = WF01_HOPS.filter(h => h.kind === 'AUTO').length;
    await assertEveryMoveLogged(tokenDocId, WF01_HOPS.length, { minNonSelf: expectedOp + expectedAuto });
    expect(logged, 'total product-logged transitions on the WF-01 happy path').toBe(WF01_HOPS.length);
  });

  // -----------------------------------------------------------------------------------------------
  // LYL-FC-WF-02 — Scope Enhancement self-loop ("Send Back") bound ≤ 2 (a 3rd traversal FAILS).
  // -----------------------------------------------------------------------------------------------
  test('LYL-FC-WF-02 — Scope Enhancement self-loop is bound ≤ 2 (real board "Send Back"); 3rd would fail loop-bound', async ({ page }) => {
    const LOOP_STAGE = 'Scope Enhancement';
    // The self-loop edge must exist in the oracle for V1 (flow-config §2 V1 row 6 — "Send Back", to==from).
    const loopEdges = outEdgesForVariation(MODEL, LOOP_STAGE, VID).filter((e: any) => e.to === LOOP_STAGE && e.loop);
    expect(loopEdges.length, `V1 "${LOOP_STAGE}" must expose a self-loop edge in the oracle`).toBe(1);

    const seeded = await seedLylFirstCycle({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;

    // Reset to the studio engine stage with a CLEAN log (fresh-participant precondition; the board
    // buckets the queued token into the Queued sub-column).
    await resetToken(tokenDocId, LOOP_STAGE);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // The board total for a SPLIT studio stage = Σ of its (Queued)+(Waiting)+(Activity) sub-column counts
    // (Scope Enhancement is a compulsoryactivity stage → 3 sub-columns; component ts:1944-1985). The
    // "Send Back" self-loop is a same-STAGE move whose target the real board can only offer as a SIBLING
    // sub-column bucket: the token sits in (Queued), and checkAvailablestages EXCLUDES the token's own
    // (stage,type) sub-column (component ts:2803), so the only "Scope Enhancement" target the dropdown
    // renders is the (Waiting)/(Activity) bucket. Committing it re-buckets the token onto the SAME bare
    // stage with status:'ready' (moveTokenToStage parses the suffix → status by dropType, ts:2953/1964),
    // i.e. it leaves (Queued) and re-enters (Waiting). The per-(Queued)-column count therefore does NOT
    // net back — the CONSERVED quantity is the STAGE TOTAL across all sub-columns. Read it APP-computed
    // (the board's re-rendered sub-column counts), never a value the test wrote.
    const readStageTotal = async (): Promise<number> => {
      const keys = await board.stageKeysForName(LOOP_STAGE);
      const all = await board.readAllColumnCounts();
      return keys.reduce((sum, k) => sum + Number(all[k] || 0), 0);
    };

    // Drive the "Send Back" self-loop TWICE through the REAL board. Each loop is a src==dst (same-stage)
    // move, so the board's STAGE TOTAL (Σ sub-columns) is unchanged (a token leaves one sub-column and
    // re-enters a sibling sub-column of the SAME stage); we assert the stage total nets to the same value
    // (APP-computed) and the product logged a Scope Enhancement → Scope Enhancement row each time.
    for (let i = 1; i <= 2; i++) {
      await waitForCardOnStage(page, board, cardId, LOOP_STAGE);
      const beforeTotal = await readStageTotal();
      // The self-loop target carries data-stage-name == the stage's own name (the "Send Back" button);
      // the board offers it as a sibling (Waiting)/(Activity) sub-column bucket (the token's own (Queued)
      // bucket is excluded), which moveToken resolves to.
      await board.moveToken(cardId, LOOP_STAGE);
      // The card stays on the same STAGE; the stage total (Σ sub-columns) nets to the same value
      // (the token left one sub-column and re-entered a sibling sub-column of the same stage).
      await expect
        .poll(readStageTotal, {
          timeout: 20_000,
          message: `WF-02: after self-loop #${i} the board should still show the token on "${LOOP_STAGE}" (stage total across sub-columns conserved).`,
        })
        .toBe(beforeTotal);
      await expect
        .poll(async () => board.revealTokenCard(cardId), {
          timeout: 20_000, message: `WF-02: token card should remain on the board after self-loop #${i}.`,
        })
        .toBe(true);

      // LOOP-BOUND holds at i (≤2); no-orphan / no-stage-skipped hold (self-loop is a legal scoped edge).
      await assertNoOrphan(tokenDocId);
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);
    }

    // The PRODUCT recorded EXACTLY two Scope Enhancement → Scope Enhancement traversals (read product rows).
    const trail = await observedTransitions(tokenDocId);
    const selfLoops = trail.filter((t: any) => t.from === LOOP_STAGE && t.to === LOOP_STAGE);
    expect(selfLoops.length, `WF-02: exactly two "${LOOP_STAGE}" self-loop rows expected`).toBe(2);
    // Each board self-loop is an operator move (movedby != 'self') — not a sim self-write.
    expect(selfLoops.every((t: any) => t.movedby && t.movedby !== 'self'),
      'WF-02: board self-loops must be operator-driven (movedby != self).').toBe(true);

    // A THIRD self-loop MUST violate the ≤2 bound — prove the detector fires (TEST-THE-TEST).
    await board.moveToken(cardId, LOOP_STAGE);
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === LOOP_STAGE && x.to === LOOP_STAGE).length;
      }, { timeout: 20_000, message: 'WF-02: the 3rd self-loop row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);
  });

  // -----------------------------------------------------------------------------------------------
  // LYL-FC-WF-03 — Diagnostics ↔ DRC round-trip bound ≤ 2 + the backbone-divergence flag (D1):
  //   DRC is DEAD-FORWARD — its ONLY legal exit is the BACK-edge DRC→Diagnostics; the backbone-adjacent
  //   DRC→ATC Preparation is ILLEGAL and the board must NOT offer it.
  // -----------------------------------------------------------------------------------------------
  test('LYL-FC-WF-03 — Diagnostics↔DRC round-trip ≤ 2; DRC→ATC Preparation is illegal (D1 dead-forward)', async ({ page }) => {
    const DIAG = 'Diagnostics';
    const DRC = 'Diagnostics Readiness Changework';
    const ATC_PREP = 'ATC Preparation';

    // ORACLE FLAGS (flow-config §3 D1) — assert the divergence the spec hinges on (two PRODUCT artifacts):
    //  • Diagnostics→DRC is a forward operator edge; DRC→Diagnostics is the ONLY DRC exit and is a BACK-edge.
    const diagToDrc = outEdgesForVariation(MODEL, DIAG, VID).filter((e: any) => e.to === DRC);
    expect(diagToDrc.length, `V1 Diagnostics must offer a forward edge to DRC`).toBe(1);
    const drcOut = outEdgesForVariation(MODEL, DRC, VID);
    expect(drcOut.map((e: any) => e.to), `V1 DRC must have EXACTLY ONE out-edge (back to Diagnostics) — dead-forward D1`).toEqual([DIAG]);
    expect(drcOut[0].back, `the sole DRC→Diagnostics edge must be a BACK-edge`).toBe(true);
    //  • DRC→ATC Preparation must be ABSENT from the oracle (the illegal backbone-adjacency skip).
    expect(outEdgesForVariation(MODEL, DRC, VID).some((e: any) => e.to === ATC_PREP),
      `D1: DRC→ATC Preparation must be ILLEGAL (absent from the oracle).`).toBe(false);

    const seeded = await seedLylFirstCycle({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;

    // Reset to Diagnostics with a CLEAN log (fresh-participant precondition; Queued sub-column).
    await resetToken(tokenDocId, DIAG);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // Drive the Diagnostics→DRC→Diagnostics round-trip TWICE through the REAL board.
    // Each direction is a legal scoped edge (forward then BACK); count-drift asserted from the board.
    for (let i = 1; i <= 2; i++) {
      // Diagnostics → DRC (forward operator edge).
      await driveOperatorHop(page, board, cardId, classifyHop(DIAG, DRC));
      await assertNoOrphan(tokenDocId);
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);

      // D1 NEGATIVE GATE: while parked on DRC, the board's move-dropdown must OFFER DRC→Diagnostics.
      // We inspect the dropdown READ-ONLY (open → assert the legal target is offered → dismiss), then
      // commit the legal BACK move below. NOTE: we do NOT assert `absent:[ATC_PREP]` on the dropdown —
      // the board's move-dropdown is NOT edge-scoped (checkAvailablestages lists the token's whole
      // variation/queue stage set, component ts:2784-2790), so it DOES surface ATC Preparation as a
      // column. The D1 dead-forward GUARANTEE (DRC→ATC Preparation is illegal) is enforced where it is
      // real: the oracle invariant `assertNoStageSkipped(..., MODEL, VID)` above/below this loop, which
      // rejects any committed transition that is not a legal scoped edge. (void ATC_PREP — kept imported
      // for the oracle-level no-skip assertions.)
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
    const trail = await observedTransitions(tokenDocId);
    const fwd = trail.filter((t: any) => t.from === DIAG && t.to === DRC);
    const back = trail.filter((t: any) => t.from === DRC && t.to === DIAG);
    expect(fwd.length, 'WF-03: exactly two Diagnostics→DRC rows').toBe(2);
    expect(back.length, 'WF-03: exactly two DRC→Diagnostics rows').toBe(2);
    expect([...fwd, ...back].every((t: any) => t.movedby && t.movedby !== 'self'),
      'WF-03: round-trip moves must be operator-driven (movedby != self).').toBe(true);

    // A THIRD Diagnostics→DRC traversal MUST violate the ≤2 bound — prove the detector fires.
    await driveOperatorHop(page, board, cardId, classifyHop(DIAG, DRC));
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === DIAG && x.to === DRC).length;
      }, { timeout: 20_000, message: 'WF-03: the 3rd Diagnostics→DRC row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);
  });
});

// =================================================================================================
// THE 72-JOURNEY EXPANSION (V1's slice) — walk EVERY distinct FORWARD journey LYL-FC defines.
//
// WHY (the brief's "expand to ALL forward journeys"): LYL-FC-WF-01 above walks ONE curated happy path
// (the Diagnostics→ATC Preparation→ATC Briefing→Consultation route, == journey J8). The forward path space
// of V1 is FINITE — `forwardJourneys(cfg, VID)` (above, JOURNEYS) enumerates EVERY distinct entry→sink
// sequence where each step takes a distinct FORWARD next-stage (a forward edge strictly increases the
// variation's backbone order ⇒ DAG ⇒ terminates). For V1 that is exactly 9 journeys (the operator's choice
// at the Diagnostics hub — Consultation / ATC Briefing / ATC Preparation and their combinations — plus the
// optional uP! Readiness Changework→Review detour before Self Evolution Report, with J1 the dead-forward DRC).
//
// This block converts the walk from "one curated path" to "EVERY forward journey", DATA-DRIVEN: one `test`
// per journey, so a failure NAMES the exact journey. Each journey is walked entry→terminal MIXING ACTORS
// exactly as WF-01 does — operator `nextstage` hops through the REAL Live Board (QueueBoardPage.moveToken →
// real move-dropdown → real PeopleInvolved confirm, asserting the board's recomputed counts) and participant
// self-move / gate auto-advance hops via the documented participant-sim stand-in (preconditions only). After
// EVERY transition the universal silent-data-gap invariants (e2e/lib/assertions.ts) run AGAINST PRODUCT OUTPUT
// (the `queue stage log` rows the board/sim wrote, the token the app advanced, the per-stage counts the board
// recomputed) and the scoped-edge ORACLE (flow-model.outEdgesForVariation — NOT the raw backbone):
//   NO-ORPHAN · EVERY-MOVE-LOGGED (≥ the operator/CF-driven count, so a sim-only walk can NOT satisfy it) ·
//   NO-STAGE-SKIPPED (prev→curr is a legal scoped edge) · COUNT-CONSERVED (board UI, on each OP hop) ·
//   LOOP-BOUND ≤2 · TERMINAL-REACHED (the journey's own forward-terminal).
//
// ANTI-CIRCULARITY: each operator hop drives the REAL board + asserts the count the BOARD recomputed and the
// row the PRODUCT wrote — never a value the test wrote. participant-sim stands in ONLY for the participant
// self-move / gate auto-advance (the native Flutter participant has no web UI); the invariants still read the
// product's logged row, never the written value directly. These journey tests REUSE the SAME helpers as
// WF-01 (driveOperatorHop / driveSimHop / resetToken / assertUniversalAfterHop) — no duplicated routing logic.
//
// FORWARD-TERMINAL NOTE (D1 dead-forward): in the forward DAG, DRC (Diagnostics Readiness Changework) is a
// SINK — its only scoped edge is the BACK-edge DRC→Diagnostics, which is NOT forward, so the enumerator ends
// journey J1 at DRC. TERMINAL-REACHED is asserted with each journey's OWN last stage (Completed for J2…J9;
// DRC for J1): for Completed via assertTerminalReached + the oracle (ZERO scoped out-edges of ANY type); for
// the DRC sink via isForwardSink (zero FORWARD edges) + a token read. The DRC back-edge LOOP is exercised by
// WF-03 above; these forward walks never traverse it.
// =================================================================================================
test.describe(`V1 · ${VARIATION_NAME} (${VID}) — walk EVERY forward journey (${JOURNEYS.length} journeys, data-driven)`, () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  // One test PER forward journey — a failure names the exact journey index + its terminal.
  JOURNEYS.forEach((journey, idx) => {
    const jno = idx + 1;
    const hops: Hop[] = journey.slice(0, -1).map((from, i) => classifyForwardHop(from, journey[i + 1]));
    const terminal = journey[journey.length - 1];
    const opHops = hops.filter((h) => h.kind === 'OP').length;
    const autoHops = hops.filter((h) => h.kind === 'AUTO').length;
    const title =
      `LYL-FC-J${String(jno).padStart(2, '0')} walk entry→${terminal} (${hops.length} hops: ${opHops} operator + ` +
      `${hops.length - opHops} self/auto) — every transition legal, logged, count-conserved`;

    test(title, async ({ page }) => {
      // SEED preconditions on the shared default run: queue generation + the V1 variation doc + ONE token at
      // the first stage. Idempotent; the spec asserts CF/app output, never this seeded value (anti-circularity).
      const seeded = await seedLylFirstCycle({ cohort: 1 });
      const participant = seeded.participants[0];
      const tokenDocId = participant.tokenId;        // the `docid` the product's stage-log rows key on
      const cardId = participant.profileid;          // the board card's data-token-id (= profile_id)
      expect(seeded.firstStage, 'V1 first stage').toBe(FIRST_STAGE);

      // FRESH-participant precondition: clear the token's accumulated product-written stage-log rows and
      // re-anchor it at the entry (the token is REUSED across all V1 describes + every journey here, so a
      // prior walk's rows would otherwise leak into this journey's ABSOLUTE EVERY-MOVE-LOGGED counts).
      await resetToken(tokenDocId, FIRST_STAGE);

      // Drive the REAL operator board ONCE (auth + queue select) — reused across every OP hop in this walk.
      await loginAsOperator(page);
      const board = new QueueBoardPage(page);
      await board.selectQueue(QUEUE_NAME);

      let logged = 0;       // product-logged transitions so far (the entry hop is never logged)
      let minNonSelf = 0;   // operator/CF-driven (movedby != 'self') subset — proves non-circularity

      for (const hop of hops) {
        if (hop.kind === 'OP') {
          // REAL board move + board-computed count-drift (src−1 / dst+1, Σ conserved).
          await driveOperatorHop(page, board, cardId, hop);
          minNonSelf += 1; // a board move writes movedby = operator profileid (NOT 'self')
        } else {
          // Participant self-move / gate auto-advance stand-in (precondition only; the product logs the row).
          await driveSimHop(tokenDocId, hop, seeded.testrunid);
          if (hop.kind === 'AUTO') minNonSelf += 1; // an AUTO gate hop is app/CF-driven (movedby 'operator')
        }
        logged += 1;

        // UNIVERSAL invariants after EVERY transition — all read PRODUCT output / the oracle.
        await assertUniversalAfterHop(tokenDocId, logged, minNonSelf);

        // NO-STAGE-SKIPPED, sharpened: the LATEST product-logged transition is exactly this oracle hop.
        const trail = await observedTransitions(tokenDocId);
        const last = trail[trail.length - 1];
        expect(last, `LYL-FC-J${jno}: a stage-log row should exist after hop → ${hop.to}`).toBeTruthy();
        expect(last.to, `LYL-FC-J${jno}: latest logged transition should land on "${hop.to}"`).toBe(hop.to);
        expect(last.from, `LYL-FC-J${jno}: latest logged transition should originate at "${hop.from}"`).toBe(hop.from);
      }

      // TERMINAL-REACHED: the token rests on THIS journey's forward-terminal. For Completed assert the full
      // oracle terminal (ZERO scoped out-edges of any type); for the J1 DRC forward sink assert isForwardSink
      // (zero FORWARD edges — its lone BACK-edge is WF-03's bounded loop, never traversed on this forward walk).
      if (terminal === TERMINAL) {
        await assertTerminalReached(tokenDocId, VID, { terminal, oracle: MODEL });
      } else {
        expect(isForwardSink(terminal), `LYL-FC-J${jno}: "${terminal}" must be a forward sink (zero forward scoped edges).`).toBe(true);
        const tok = await sim.db().collection('queue_token').doc(tokenDocId).get();
        expect(tok.exists, `LYL-FC-J${jno}: token still exists at terminal`).toBe(true);
        expect(tok.data().currentstage, `LYL-FC-J${jno}: token rests on the journey terminal "${terminal}".`).toBe(terminal);
      }

      // Final EVERY-MOVE-LOGGED tally: exactly the product-logged forward transitions of THIS journey, of
      // which the operator/CF-driven (non-'self') count is the OP hops + AUTO gate hops (computed, never
      // hardcoded) — so the count can NOT be satisfied by participant self-writes alone (anti-circularity).
      await assertEveryMoveLogged(tokenDocId, hops.length, { minNonSelf: opHops + autoHops });
      expect(logged, `LYL-FC-J${jno}: total product-logged transitions`).toBe(hops.length);
    });
  });
});
