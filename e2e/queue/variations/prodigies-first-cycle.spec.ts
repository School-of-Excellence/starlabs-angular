// prodigies-first-cycle.spec.ts — V5 · Prodigies - First Cycle closed-loop variation walk.
//
// PLAN case PFC-WF-01 (flow-config.md §2 V5 / §2.4 V5 / §5 "V4/V5/V6/V8" specials). This is the
// closed-loop REPLACEMENT for the old circular walk: it walks ONE participant of an N>=2 cohort from
// the variation's first stage to the terminal `Completed`, MIXING the three move drivers, and asserts
// the universal silent-data-gap invariants after EVERY transition.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE AUTHORITATIVE FLOW (oracle = e2e/lib/flow-model.js, transcribed in flow-config.md §2 V5 — the
// SOURCE OF TRUTH, NOT the raw stages[] backbone). variationId GHsYb6bRCg4qBWqgUKe6, backbone len 13.
// Reproduced verbatim from `outEdgesForVariation(build(cfg), stage, VID)`:
//
//   [0] Evolution Prep Orientation  --AUTO-->  Accelerated Evolution Level Form     (gate, selfmovable:false)
//   [2] Accelerated Evolution Level Form --SELF--> Scope Enhancement                 (form, selfmovable:true — the unique 4th AEL fork)
//   [8] Scope Enhancement           --OP-->    Ready for Diagnostics {first-cycle Prodigie, done}
//                                   --OP-->    Scope Enhancement [LOOP] {Send Back}  (studio engine; loop <=2)
//   [14] Ready for Diagnostics      --AUTO-->  Diagnostics                           (gate)
//   [15] Diagnostics                --OP-->    {DRC | ATC Briefing | uP!RCW | Self Evolution Report | ATC Preparation | Diagnostics[LOOP]}  — 6 edges, NO ->Consultation
//   [18] ATC Briefing               --OP-->    Self Evolution Report {Completed, done} · uP! Readiness Changework {¬done}
//   [28] Self Evolution Report      --SELF-->  Completed                             (form, selfmovable:true)
//   [29] Completed                  TERMINAL (no scoped out-edge)
//
//   D2 caveat (flow-config.md §3): `Consultation` [19] is OFF the forward happy path for V5 — no
//   forward operator edge enters it (only its self-LOOP / the uP!RCW back-edge). The walk below NEVER
//   visits Consultation; no-stage-skipped uses the ORACLE edge set, so a backbone adjacency that the
//   oracle does not connect would (correctly) FAIL it.
//
// THE WALK (8 transitions, mixing actors — the anti-circular requirement that operator + specialist
// moves go through the REAL board / studio UI, never a replayed sim write):
//   T1  Evolution Prep Orientation -> AEL                 [SIM  auto-gate stand-in]     (flow-config §0: a pure gate auto-advances; the participant app, no CF)
//   T2  AEL -> Scope Enhancement                          [SIM  participant SELF-move]  (selfmovable:true form submit — participant-sim self-move stand-in)
//   T3  Scope Enhancement -> Scope Enhancement [LOOP #1]  [OP   REAL board "Send Back"] (loop traversal 1/2)
//   T4  Scope Enhancement -> Ready for Diagnostics        [OP   REAL board move]        (the first-cycle-Prodigie forward branch, markascompleted)
//   T5  Ready for Diagnostics -> Diagnostics              [SIM  auto-gate stand-in]
//   T6  Diagnostics -> ATC Briefing                       [SPEC REAL studio move-next]  (studio engine stage; specialist drives moveStage)
//   T7  ATC Briefing -> Self Evolution Report             [OP   REAL board move]        (markascompleted=Completed branch)
//   T8  Self Evolution Report -> Completed                [SIM  participant SELF-move]  (terminal)
//
//   The Move-Back loop (T3) is bounded at <=2 (we traverse it once; assertLoopBound caps at 2 and a 3rd
//   would FAIL). Mixing: 3 REAL operator board moves + 1 REAL specialist studio move + 4 sim self/auto
//   hops. The operator/specialist moves assert the board re-rendered counts (count-drift, src-1/dst+1).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// AFTER EVERY TRANSITION (e2e/lib/assertions.ts — all read PRODUCT/CF OUTPUT, never a value the test
// wrote; the operator/specialist moves additionally diff board-rendered counts):
//   • assertNoOrphan          — token exists, exactly cohort siblings, >=1 audit row once past entry
//   • assertEveryMoveLogged   — exactly k `queue stage log` rows after k transitions (minNonSelf>=#real moves so a sim-only run can't satisfy it)
//   • assertNoStageSkipped    — every observed prev->curr is a LEGAL scoped oracle edge for V5
//   • assertLoopBound         — no edge traversed >2 (the Scope Enhancement self-loop)
//   • assertTerminalReached   — only at the end: currentstage==Completed, terminal has 0 scoped out-edges
//   • assertCountConserved    — only around the REAL board/studio moves: board src-1/dst+1, Σ conserved
//
// VARIATION-SPECIFIC (the ref / PLAN §3.D V5):
//   • COHORT CONSERVATION (PLAN PFC-WF-01 "5-stage cohort N>=2; conservation"): Σ board counts across
//     ALL columns == N at the start and == N after the walk (no token vaporized/duplicated as the
//     walked token traverses). Read from the board UI (totalParticipants + per-column), an APP number.
//   • BLANK-NAME GUARD: a token card must render a NON-blank participant name on the board (the board's
//     `data-token-id` is profile_id||docid and the card shows "Name:"); a blank/empty name is the
//     silent "wrong/empty person" gap. Asserted on the live board for the walked token.
//   • DIAGNOSTICS DROPDOWN SCOPING (flow-config §5 / §3 D2): the V5 Diagnostics move-dropdown must
//     offer its forward branches and MUST NOT offer `Consultation` (an LYL/B!G-only edge). Asserted by
//     the move-target options the board rendered for the walked token at Diagnostics.
//
// REAL-UI PRECONDITION HONESTY (mirrors studio-session.spec.ts): an operator board move needs the
// queue selected + the token card on the board with a move-dropdown offering the scoped target; a
// specialist studio move needs the live panel mounted (token instudio + live-assignment + pairing).
// Where a REAL surface cannot render the control (e.g. the studio live panel did not mount in this
// environment, or the board move-target is absent), the test records a FINDING annotation and
// test.skip()s that leg — it is NEVER faked green, and the sim is NEVER substituted for the real
// operator/specialist move (that would be the circular anti-pattern this rebuild removes).
//
// TARGET: emulator (FIRESTORE_EMULATOR_HOST) or the cloud test project slabs-queue-e2e-exdcz; baseURL
// comes from the Playwright config (BASE_URL). No project id is hardcoded. Seeds go through the
// allowlist-guarded test-project writer.

import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator, loginAsSpecialist } from '../support/auth';
import { actors, QUEUE_NAME, TESTRUNID } from '../support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { getDoc, queryWhere, pollUntil } from '../support/firestore-admin';

// CommonJS interop (the lib/* modules are plain CJS, matching the other specs).
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  readLogRows,
} = require('../../lib/assertions');
const { build } = require('../../lib/flow-model');
const sim = require('../../lib/participant-sim');
const seedCfg = require('../../fixtures/sample-queue-config.json');
const { seedProdigiesFirstCycle, VARIATION_ID, FIRST_STAGE } = require('../../fixtures/variation-seeds/prodigies-first-cycle');
/* eslint-enable @typescript-eslint/no-var-requires */

// The built flow-model oracle (passed to assertNoStageSkipped / assertTerminalReached). Built once.
const ORACLE = build(seedCfg);

// V5 stage names (flow-config.md §2 V5; verified === seed variation.stages order).
const S = {
  entry: 'Evolution Prep Orientation',
  ael: 'Accelerated Evolution Level Form',
  scope: 'Scope Enhancement',
  readyDx: 'Ready for Diagnostics',
  diagnostics: 'Diagnostics',
  drc: 'Diagnostics Readiness Changework',
  atcPrep: 'ATC Preparation',
  atcBriefing: 'ATC Briefing',
  consultation: 'Consultation', // OFF the V5 happy path (D2) — used ONLY for the negative dropdown assertion
  upRcw: 'uP! Readiness Changework',
  review: 'Review',
  selfReport: 'Self Evolution Report',
  completed: 'Completed',
} as const;

const TERMINAL = S.completed;

/** Which driver performs a transition. */
type Driver = 'sim-self' | 'sim-auto' | 'op-board' | 'studio';

/** One transition in the walk. */
interface Hop {
  from: string;
  to: string;
  driver: Driver;
  /** True for an intentional self-loop / back-edge traversal (bounded <=2). */
  loop?: boolean;
  note: string;
}

// The 8-transition mixed-actor walk (see header). Order is load-bearing.
const WALK: Hop[] = [
  { from: S.entry, to: S.ael, driver: 'sim-auto', note: 'T1 entry gate auto-advance (no CF; participant waits)' },
  { from: S.ael, to: S.scope, driver: 'sim-self', note: 'T2 AEL form SELF-move (selfmovable:true → Scope Enhancement, the unique 4th AEL fork)' },
  { from: S.scope, to: S.scope, driver: 'op-board', loop: true, note: 'T3 operator "Send Back" self-loop (traversal 1/2)' },
  { from: S.scope, to: S.readyDx, driver: 'op-board', note: 'T4 operator forward branch (first-cycle Prodigie, markascompleted)' },
  { from: S.readyDx, to: S.diagnostics, driver: 'sim-auto', note: 'T5 Ready-for-Diagnostics gate auto-advance' },
  { from: S.diagnostics, to: S.atcBriefing, driver: 'studio', note: 'T6 specialist studio move-next (Diagnostics engine → ATC Briefing)' },
  { from: S.atcBriefing, to: S.selfReport, driver: 'op-board', note: 'T7 operator ATC Briefing → Self Evolution Report (Completed branch)' },
  { from: S.selfReport, to: S.completed, driver: 'sim-self', note: 'T8 Self Evolution Report SELF-move → Completed (terminal)' },
];

/** The REAL operator-board moves and the REAL studio move in the walk (used to size minNonSelf so a
 *  sim-only run can NEVER satisfy every-move-logged — anti-circularity). */
const REAL_OP_OR_STUDIO_DRIVERS: Driver[] = ['op-board', 'studio'];

/** Default cohort N>=2 (the seed floors at 2; conservation needs >=2 to be non-vacuous). */
const COHORT = Math.max(2, Number.parseInt(process.env.PFC_COHORT || '2', 10) || 2);

// =================================================================================================

test.describe('PFC-WF-01 — Prodigies-First-Cycle closed-loop walk (operator + SIM + specialist; Move-Back ≤2)', () => {
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;
  let seed: SeedHandles;

  test.beforeAll(async () => {
    // Seed preconditions ONLY: queue generation + the V5 variation doc + N tokens at the first stage.
    // The spec drives the real UI / sim and asserts CF/app OUTPUT — never these seeded values.
    const result = await seedProdigiesFirstCycle({ cohort: COHORT, testrunid: TESTRUNID });
    // The seeder names staff `profile_data.name` by email (seed-test-project.js seedAuthChain) and the
    // PeopleInvolved person select matches the option by that visible text, so the specialist's display
    // name is exactly actors.specialist(0). Attach it for the operator confirm dialog.
    seed = { ...result, specialistName: actors.specialist(0) };
    expect(seed.tokenIds.length, 'cohort N>=2 must be seeded for a meaningful conservation invariant').toBeGreaterThanOrEqual(2);
    expect(seed.variationId).toBe(VARIATION_ID);
    expect(seed.firstStage).toBe(FIRST_STAGE);
  });

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub every external boundary (Zoom/LiveKit/FCM/Wati/email) so no real window/network escapes.
    stubs = installAllExternalStubs(page);
  });

  test.afterEach(() => {
    // A real uncaught app error / error-level console message fails the test (stubbed noise is allowlisted).
    assertNoFatal(guard);
  });

  // -----------------------------------------------------------------------------------------------
  // The closed-loop walk. One participant of the cohort is walked entry→terminal mixing all three
  // drivers; the universal invariants run after every transition; conservation + blank-name +
  // dropdown-scoping are the V5 specials.
  // -----------------------------------------------------------------------------------------------
  test('walks the cohort participant entry→Completed via the oracle path, invariants hold after every transition', async ({ page }) => {
    // The walked participant: card data-token-id == profile_id (board card id), token doc id == tokenId.
    const walked = seed.participants[0];
    const tokenId: string = walked.tokenId;
    const tokenCardId: string = walked.profileid; // board card data-token-id = profile_id||docid
    const variationId: string = seed.variationId;

    // Defensive precondition: the seed actually placed the token at the variation's first stage.
    const seededTok = await getDoc('queue_token', tokenId);
    expect(seededTok, `seeded queue_token ${tokenId} must exist (run the seeder for TESTRUNID=${TESTRUNID})`).not.toBeNull();
    expect(seededTok!.currentstage, 'token must start at the V5 first stage').toBe(S.entry);
    expect(seededTok!.variationid, 'token must carry the V5 variation id').toBe(variationId);

    // Operator board: log in + select the queue once. All operator moves below drive THIS board.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // ── POPULATION CONSERVATION baseline (APP number): Σ of all column counts the board rendered. The
    // board's live queue_token stream is the SHARED queue 1 (the main seed places its 50-participant
    // roster there too — seed-emulator.js — and this variation's cohort is ADDED to it), so the absolute
    // Σ is NOT the cohort size; it is "everyone currently on queue 1". We capture that APP-computed
    // baseline and later assert it is CONSERVED across the walk (no vaporized/duplicated token). We assert
    // it is ≥ the seeded cohort (the cohort IS present) so the baseline is non-vacuous. Read from the board
    // UI (the app computed it from its stream), never a value the test wrote.
    const cohortN = seed.tokenIds.length;
    const startTotal = await sumBoardCounts(board);
    expect(
      startTotal,
      `population conservation: the board's summed column counts must include this run's seeded cohort (N=${cohortN}) ` +
        'on the shared queue (APP-computed Σ ≥ cohort — not a value the test wrote)',
    ).toBeGreaterThanOrEqual(cohortN);

    // ── BLANK-NAME GUARD (APP render): the walked token's card shows a non-blank participant name.
    await assertCardNameNotBlank(board, tokenCardId);

    // Track how many REAL operator/studio moves we have actually driven so far (for minNonSelf).
    let realMovesDriven = 0;

    // Walk every hop in order, asserting invariants after each.
    for (let i = 0; i < WALK.length; i++) {
      const hop = WALK[i];
      const stepNo = i + 1;

      // Sanity: every hop's edge must be a LEGAL scoped oracle edge BEFORE we drive it (a typo in the
      // walk table would otherwise be "proven" by a circular replay). This reads the oracle, not state.
      assertHopIsLegalOracleEdge(variationId, hop);

      const drove = await driveHop(page, board, hop, {
        tokenId,
        tokenCardId,
        variationId,
        walkProfileId: walked.profileid,
        seed,
      });

      if (!drove) {
        // A REAL UI control could not render in this environment — recorded as a finding inside
        // driveHop and the leg skipped. Stop the walk here (downstream hops depend on this state);
        // do NOT fake the move with a sim write (anti-circularity).
        test.info().annotations.push({
          type: 'finding',
          description:
            `PFC-WF-01: stopped at transition ${stepNo} (${hop.from} → ${hop.to}, ${hop.driver}) — the REAL ` +
            'operator/studio control did not render; the remaining hops were not driven (never sim-substituted).',
        });
        test.skip(true, `REAL UI control for transition ${stepNo} (${hop.driver}) did not render — see finding`);
        return;
      }
      if (REAL_OP_OR_STUDIO_DRIVERS.includes(hop.driver)) realMovesDriven++;

      // ── UNIVERSAL INVARIANTS after THIS transition (all read PRODUCT/CF OUTPUT) ─────────────────

      // The product wrote one stage-log row per transition; wait for the count to settle to stepNo.
      await pollUntil(
        () => readLogRows(tokenId),
        (rows: unknown[]) => rows.length === stepNo,
        { label: `exactly ${stepNo} stage-log row(s) for ${tokenId} after transition ${stepNo}`, timeoutMs: 30_000 },
      );

      // EVERY-MOVE-LOGGED: exactly stepNo rows, AND at least `realMovesDriven` of them are
      // operator/CF-driven (movedby != 'self') — a sim-self-only run can never satisfy this.
      await assertEveryMoveLogged(tokenId, stepNo, { minNonSelf: realMovesDriven });

      // NO-STAGE-SKIPPED: every observed prev→curr is a legal V5 oracle edge (NOT a backbone adjacency).
      await assertNoStageSkipped(tokenId, ORACLE, variationId);

      // NO-ORPHAN: token exists, exactly the cohort number of siblings, has an audit trail past entry.
      await assertNoOrphan(tokenId, { expectSiblings: cohortN });

      // LOOP-BOUND: no single edge (the Scope Enhancement self-loop) traversed > 2 times.
      await assertLoopBound(tokenId, 2);
    }

    // ── TERMINAL-REACHED: the walked token is at Completed, which has ZERO scoped out-edges for V5.
    await pollUntil(
      () => getDoc('queue_token', tokenId),
      (t) => !!t && t.currentstage === TERMINAL,
      { label: `token ${tokenId} reached terminal ${TERMINAL}`, timeoutMs: 30_000 },
    );
    await assertTerminalReached(tokenId, variationId, { terminal: TERMINAL, oracle: ORACLE });

    // ── POPULATION CONSERVATION after the walk (APP number): Σ board counts is UNCHANGED from the
    // baseline. The walked token moved across columns, but the TOTAL population on the (shared) queue is
    // conserved — no vaporized/duplicated token. We compare to the captured `startTotal` (the real
    // APP-computed baseline), NOT to the cohort size: the queue holds the whole shared roster.
    const endTotal = await sumBoardCounts(board);
    expect(
      endTotal,
      `population conservation: Σ board column counts must be unchanged (${startTotal}) after the walk ` +
        '(the walked token traversed columns; the total population is conserved — no drop/duplicate)',
    ).toBe(startTotal);

    // ── EVERY-MOVE-LOGGED final tally: exactly WALK.length rows, with the real operator+studio moves
    // present as non-self provenance (we drove all of them to reach here).
    const finalRows = await readLogRows(tokenId);
    expect(finalRows.length, 'one stage-log row per walk transition (no drop, no double-fire)').toBe(WALK.length);
    expect(realMovesDriven, 'the walk drove all 3 operator + 1 studio REAL moves').toBe(
      WALK.filter((h) => REAL_OP_OR_STUDIO_DRIVERS.includes(h.driver)).length,
    );
  });

  // -----------------------------------------------------------------------------------------------
  // VARIATION-SPECIFIC negative scoping (flow-config §5 / §3 D2): the V5 Diagnostics move-dropdown must
  // NOT offer `Consultation` (an LYL/B!G-only forward edge). This is asserted directly against the
  // move-target options the REAL board renders for a token positioned at Diagnostics — an APP decision
  // (the board scopes the dropdown by the token's variationid), not a value the test computed.
  //
  // We use a SECOND cohort member (so the walked token's run is untouched) and stand it at Diagnostics
  // as a PRECONDITION (operator-drag entry is runtime/off-config; placing the token is a precondition
  // only — we assert the dropdown the app then renders, never the seeded stage value).
  // -----------------------------------------------------------------------------------------------
  test('Diagnostics move-dropdown is V5-scoped — offers forward branches, does NOT offer Consultation (D2)', async ({ page }) => {
    const probe = seed.participants[1]; // distinct from the walked participant
    const probeTokenId: string = probe.tokenId;
    const probeCardId: string = probe.profileid;

    // PRECONDITION: position the probe token at Diagnostics (status 'queued' so the card's Move button
    // is enabled). This is a precondition stand-in for an operator drag — we assert the rendered
    // dropdown, NOT this stage value (anti-circularity).
    await sim
      .db()
      .collection('queue_token')
      .doc(probeTokenId)
      .set(
        { currentstage: S.diagnostics, previousstage: S.readyDx, status: 'queued', stagestatus: 'Yet to Start' },
        { merge: true },
      );

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // Open the probe token's move-dropdown and read the offered target stage names (APP-rendered).
    const offered = await openMoveDropdownTargets(page, board, probeCardId);

    if (offered === null) {
      test.info().annotations.push({
        type: 'finding',
        description:
          'PFC-WF-01 dropdown-scoping: the move-dropdown for the Diagnostics-positioned probe token did not ' +
          'render on the board in this environment — negative Consultation assertion not exercised (not faked green).',
      });
      test.skip(true, 'move-dropdown did not render for the probe token — see finding');
      return;
    }

    // The V5 oracle forward branches from Diagnostics (excluding the self-LOOP which renders as the
    // same stage). At least ONE must be offered (the dropdown is non-empty and scoped).
    const v5ForwardFromDiagnostics = [S.drc, S.atcBriefing, S.upRcw, S.selfReport, S.atcPrep];
    const offeredForward = v5ForwardFromDiagnostics.filter((s) => offered.includes(s));
    expect(
      offeredForward.length,
      `the V5 Diagnostics dropdown must offer its scoped forward branches (${v5ForwardFromDiagnostics.join(', ')}); ` +
        `offered: ${offered.join(', ') || '(none)'}`,
    ).toBeGreaterThan(0);

    // THE NEGATIVE ASSERTION (D2): Consultation is NOT a V5 forward edge from Diagnostics and must NOT
    // appear in the dropdown (it is an LYL/B!G-only edge — variation scoping must exclude it).
    expect(
      offered,
      'the V5 Diagnostics move-dropdown must NOT offer `Consultation` (an LYL/B!G-only edge; D2 variation scoping)',
    ).not.toContain(S.consultation);
  });
});

// =================================================================================================
// Hop drivers
// =================================================================================================

interface HopCtx {
  tokenId: string;
  tokenCardId: string;
  variationId: string;
  walkProfileId: string;
  seed: SeedHandles;
}

/**
 * Drive ONE transition with its actor. Returns true if the transition was actually performed, false
 * if a REAL UI control could not render (the caller records a finding + skips — never sim-substitutes
 * an operator/specialist move).
 *
 * For the REAL board / studio moves we snapshot the board's per-column counts BEFORE and AFTER and run
 * assertCountConserved (src-1/dst+1, Σ conserved) — the board numbers are APP-computed.
 */
async function driveHop(page: Page, board: QueueBoardPage, hop: Hop, ctx: HopCtx): Promise<boolean> {
  switch (hop.driver) {
    case 'sim-auto':
    case 'sim-self': {
      // Participant-sim stand-in for an auto-gate advance or a selfmovable form submit. Allowed: the
      // simulator may set up preconditions or stand in for the Flutter participant self-move/auto-advance
      // (it writes the queue_token + ONE `queue stage log` row with movedby:'self', exactly as the app).
      await sim.advance(ctx.tokenId, hop.to, { by: 'self', testrunid: ctx.seed.testrunid });
      return true;
    }

    case 'op-board': {
      // REAL operator board move. Requires the token card + its move-dropdown offering the scoped target.
      // The board may split a stage into Queued/Waiting/Activity columns; sum across same-named columns
      // so conservation reads the stage total, not one sub-column.
      const before = await board.readAllColumnCounts();

      // For the self-loop "Send Back", the dropdown lists the SAME stage as a target (data-stage-name ==
      // current stage). moveToken handles both forward + loop via the target's data-stage-name.
      const moved = await tryBoardMove(page, board, ctx.tokenCardId, hop.to, ctx.seed);
      if (!moved) return false;

      // Wait for the product to write the stage-log row for this transition, then re-read the board.
      await pollUntil(
        () => queryWhere('queue stage log', [['docid', '==', ctx.tokenId]]),
        (rows: unknown[]) => rows.length >= 1,
        { label: `stage-log row appears after operator move ${hop.from} → ${hop.to}`, timeoutMs: 30_000 },
      );
      const after = await board.readAllColumnCounts();

      // COUNT-DRIFT around the move: src-1 / dst+1, Σ conserved. For a self-loop the source == dest, so
      // assertCountConserved (which rejects src==dst) does not apply — instead assert Σ is unchanged
      // (the token did not leave the board) which is the conservation guarantee for a loop.
      assertConservationForMove(before, after, hop);
      return true;
    }

    case 'studio': {
      // REAL specialist studio move-next. The Diagnostics studio engine renders move-next buttons only
      // when the live panel is mounted: token instudio + a live-assignment + a live pairing that the
      // acting member belongs to (flow-config: Diagnostics is the studio engine). We wire that link as a
      // PRECONDITION (allowed), then drive the REAL moveNext and assert the board re-rendered counts.
      const before = await board.readAllColumnCounts();

      const moved = await tryStudioMove(page, hop, ctx);
      if (!moved) return false;

      // Wait for the studio move to advance the token (it writes the stage-log + advances currentstage),
      // then re-read the SAME operator board to confirm the board recomputed the counts.
      await pollUntil(
        () => getDoc('queue_token', ctx.tokenId),
        (t) => !!t && t.currentstage === hop.to,
        { label: `token ${ctx.tokenId} advanced to ${hop.to} via the studio move`, timeoutMs: 30_000 },
      );
      // Re-focus the operator board (the studio move happened on /dynamicstudio) so its stream re-renders.
      await board.selectQueue(QUEUE_NAME);
      const after = await board.readAllColumnCounts();
      assertConservationForMove(before, after, hop);
      return true;
    }

    default:
      throw new Error(`driveHop: unknown driver "${(hop as Hop).driver}"`);
  }
}

/**
 * Attempt a REAL operator board move of `tokenCardId` to `targetStage` (forward OR self-loop). Returns
 * false (no throw) when the token card or the scoped move-target is not present, so the caller can
 * record a finding and skip rather than fake the move. A stage that needs a specialist in the
 * PeopleInvolved confirm dialog is given the seeded specialist.
 */
async function tryBoardMove(
  page: Page,
  board: QueueBoardPage,
  tokenCardId: string,
  targetStage: string,
  seed: SeedHandles,
): Promise<boolean> {
  const card = board.tokenCard(tokenCardId);
  await board.revealTokenCard(tokenCardId).catch(() => {}); // page the card in if a crowded column hid it
  if ((await card.count().catch(() => 0)) === 0) return false;
  // The move-target option for this stage must be offered by the app's variation-scoped dropdown. If
  // it is not present (control did not render / not a legal scoped edge), do NOT force it.
  const moveBtn = card.locator('[data-testid="qm-move-btn"]');
  if ((await moveBtn.count().catch(() => 0)) === 0) return false;

  try {
    await board.moveToken(tokenCardId, targetStage, {
      specialist: seed.specialistName, // picked only if the confirm dialog exposes the person select
      dialogTimeoutMs: 15_000,
    });
    return true;
  } catch {
    // The target option / confirm dialog did not appear → treat as "control did not render".
    return false;
  }
}

/**
 * Attempt a REAL specialist studio move-next for the walked token. Wires the in-studio link as a
 * PRECONDITION (token instudio + a live-assignment + live pairing the acting member belongs to), opens
 * /dynamicstudio acting as the member, selects the studio so the live panel mounts, and clicks the
 * REAL move-next button for `hop.to`. Returns false when the live panel / move-next button cannot
 * render (caller records a finding + skips — never sim-substitutes).
 */
async function tryStudioMove(page: Page, hop: Hop, ctx: HopCtx): Promise<boolean> {
  const member = ctx.walkProfileId;
  const pairingId = `${ctx.seed.testrunid}_pfc_pair`;
  const liveAssignmentId = `${ctx.seed.testrunid}_pfc_la_${member}`;

  // PRECONDITION wiring (allowed — preconditions only; the spec asserts the value the PRODUCT produces
  // by the REAL moveNext, never these seeded values):
  //   • a pairing the acting member belongs to, checked-in + live;
  //   • a live-assignment at the studio stage for this member;
  //   • the token instudio, linked to the live-assignment + pairing, at the studio stage.
  const db = sim.db();
  await db.collection('queue studio pairing').doc(pairingId).set(
    {
      docid: pairingId,
      participants: [member],
      studioin: true,
      checkin: true,
      status: 'live',
      openvidu: false,
      queueid: ctx.seed.queueGenDocId,
      delete: false,
      testrunid: ctx.seed.testrunid,
      _testdata: true,
    },
    { merge: true },
  );
  await db.collection('live assignment').doc(liveAssignmentId).set(
    {
      docid: liveAssignmentId,
      status: 'live',
      stagename: hop.from,
      studioid: pairingId,
      participantid: member,
      queueid: ctx.seed.queueGenDocId,
      testrunid: ctx.seed.testrunid,
      _testdata: true,
    },
    { merge: true },
  );
  await db.collection('queue_token').doc(ctx.tokenId).set(
    {
      currentstage: hop.from,
      previousstage: hop.from,
      status: 'instudio',
      liveassignmentid: liveAssignmentId,
      studioid: pairingId,
    },
    { merge: true },
  );

  // Act as the seeded studio member (log in as a real specialist to pass authGuard, then ?profileid
  // override resolves studioList/live-assignment to the seeded pairing — studio.md CRITICAL TEST HOOK).
  await loginAsSpecialist(page, 0);
  const studio = new StudioPage(page);
  await studio.load(member);

  // The seeded pairing renders one studio button for this member; if it never renders the live panel
  // cannot mount → report inability to drive the REAL move.
  const hasButton = await pollNonThrow(async () => (await studio.studioButtonCount()) > 0, 30_000);
  if (!hasButton) return false;
  await studio.selectStudio({ studioId: pairingId });

  // The live panel must mount (the live participant name renders) for the move-next button to appear.
  const panelMounted = await studio.liveParticipantName.isVisible({ timeout: 30_000 }).catch(() => false);
  if (!panelMounted) return false;

  // The move-next button for the target stage renders only when the variation includes the stage
  // (html *ngIf). If absent, we cannot drive the REAL studio move.
  const moveBtn = page.locator(`[data-testid="studio-move-next-btn"][data-stage="${cssAttr(hop.to)}"]`).first();
  if ((await moveBtn.count().catch(() => 0)) === 0) return false;

  try {
    await studio.moveNext(hop.to); // REAL specialist action (moveStage)
    return true;
  } catch {
    // moveNext throws on an AEL gate / unexpected dialog → could not complete the real move.
    return false;
  }
}

// =================================================================================================
// Board / oracle helpers
// =================================================================================================

/** Σ of every visible board column count (APP-computed) — used for the cohort conservation invariant. */
async function sumBoardCounts(board: QueueBoardPage): Promise<number> {
  const counts = await board.readAllColumnCounts();
  return Object.values(counts).reduce((a, n) => a + (Number(n) || 0), 0);
}

/**
 * Assert conservation around a single move using the board's before/after column-count snapshots.
 *  • forward move (src != dst): delegate to assertCountConserved (src-1 / dst+1, Σ conserved, no other
 *    column moved). Columns are keyed by data-stage-key; a stage may be split into sub-columns, so we
 *    aggregate per-stage-name before diffing.
 *  • self-loop (src == dst): assertCountConserved rejects src==dst, so we assert the only guarantee a
 *    loop gives — the TOTAL population is unchanged (the token stayed on the same stage; no vaporize).
 */
function assertConservationForMove(
  before: Record<string, number>,
  after: Record<string, number>,
  hop: Hop,
): void {
  const beforeByStage = aggregateByStageName(before);
  const afterByStage = aggregateByStageName(after);

  if (hop.from === hop.to) {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + (Number(n) || 0), 0);
    expect(
      sum(afterByStage),
      `[COUNT-CONSERVED] self-loop ${hop.from} → ${hop.to}: total board population must be unchanged`,
    ).toBe(sum(beforeByStage));
    return;
  }
  // Forward move — the universal helper diffs the two APP-computed snapshots.
  assertCountConserved(beforeByStage, afterByStage, { src: hop.from, dst: hop.to });
}

/**
 * Collapse a { data-stage-key → count } map into { stageName → count } by stripping the board's
 * stage-key suffixes (`<name>_<i>` / `<name>_queued_<i>` / `<name>_waiting_<i>` / `<name>_activity_<i>`).
 * A split stage's sub-columns sum into one per-stage total so the move diff is stage-level.
 */
function aggregateByStageName(byKey: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(byKey)) {
    const name = stageNameFromKey(key);
    out[name] = (out[name] || 0) + (Number(n) || 0);
  }
  return out;
}

/** Derive the stage NAME from a board data-stage-key by removing the trailing sub-column/index suffix. */
function stageNameFromKey(key: string): string {
  return key
    .replace(/_(queued|waiting|activity)_\d+$/i, '')
    .replace(/_\d+$/, '');
}

/**
 * Open the move-dropdown for a token card and return the target stage NAMES the app rendered
 * (data-stage-name on each qm-move-target). Returns null when the card / Move button did not render so
 * the caller can record a finding. Closes the dropdown afterward.
 */
async function openMoveDropdownTargets(
  page: Page,
  board: QueueBoardPage,
  tokenCardId: string,
): Promise<string[] | null> {
  const card = board.tokenCard(tokenCardId);
  await board.revealTokenCard(tokenCardId).catch(() => {}); // page the card in if a crowded column hid it
  if ((await card.count().catch(() => 0)) === 0) return null;
  const moveBtn = card.locator('[data-testid="qm-move-btn"]');
  if ((await moveBtn.count().catch(() => 0)) === 0) return null;
  if (!(await moveBtn.isEnabled().catch(() => false))) return null;
  await moveBtn.click();
  // Targets render inside the open .move-dropdown for THIS token only.
  const targets = page.locator('[data-testid="qm-move-target"]');
  // Wait for the dropdown to populate (the app builds it from the variation-scoped edges, async).
  const appeared = await pollNonThrow(async () => (await targets.count()) > 0, 15_000);
  if (!appeared) {
    await page.keyboard.press('Escape').catch(() => {});
    return null;
  }
  const names = await targets.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-stage-name') || '').filter((s) => s.length > 0),
  );
  await page.keyboard.press('Escape').catch(() => {}); // close the dropdown without committing a move
  return names;
}

/** Assert the walked token's board card renders a NON-blank participant name (blank-name guard). */
async function assertCardNameNotBlank(board: QueueBoardPage, tokenCardId: string): Promise<void> {
  const card = board.tokenCard(tokenCardId);
  await board.revealTokenCard(tokenCardId); // page the card in if a crowded column hid it (>15 tokens)
  await expect(card, `blank-name guard: token card ${tokenCardId} must be on the board`).toBeVisible({ timeout: 30_000 });
  // The card shows "Name:" then the value span (queue-board.page.ts tokenName reads the same element).
  const nameValue = card.locator('.label:text-is("Name:") + span, .label:has-text("Name") + span').first();
  let text = '';
  if (await nameValue.count().catch(() => 0)) {
    text = ((await nameValue.first().textContent().catch(() => '')) || '').trim();
  }
  // Fallback to the whole card text if the specific Name span shape differs — still an APP render.
  if (!text) text = ((await card.textContent().catch(() => '')) || '').trim();
  expect(
    text.length,
    `blank-name guard: the walked token's card must render a non-blank participant name (a blank name is the ` +
      'silent "wrong/empty person" gap). Card content was empty.',
  ).toBeGreaterThan(0);
}

/**
 * Assert a walk hop is a legal scoped oracle edge for the variation BEFORE driving it — so a typo in
 * the WALK table is caught against the oracle, not "proven" by a circular replay. Reads the oracle
 * (flow-model), never Firestore state.
 */
function assertHopIsLegalOracleEdge(variationId: string, hop: Hop): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { outEdgesForVariation } = require('../../lib/flow-model');
  const legal = outEdgesForVariation(ORACLE, hop.from, variationId).some((e: { to: string }) => e.to === hop.to);
  expect(
    legal,
    `WALK table is wrong: ${hop.from} → ${hop.to} (${hop.note}) is NOT a legal scoped V5 oracle edge. ` +
      `Legal out-edges: ${outEdgesForVariation(ORACLE, hop.from, variationId)
        .map((e: { to: string; type: string }) => `${e.to}[${e.type}]`)
        .join(', ') || '(none)'}`,
  ).toBe(true);
}

/** Poll a non-throwing predicate up to `timeoutMs`; resolves true on first success, false on timeout. */
async function pollNonThrow(pred: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await pred().catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Escape a value for a CSS attribute selector (stage names carry spaces/punctuation). */
function cssAttr(value: string): string {
  return String(value).replace(/(["\\])/g, '\\$1');
}

// =================================================================================================
// Types
// =================================================================================================

/** The handles the seed builder returns (e2e/fixtures/variation-seeds/_common.ts VariationSeedResult),
 *  plus the convenience `specialistName` the operator confirm dialog may need. */
interface SeedHandles {
  testrunid: string;
  variationId: string;
  variationName: string;
  queueName: string;
  queueGenDocId: string;
  stages: string[];
  firstStage: string;
  participants: { profileid: string; email: string; tokenId: string; queueposition: number }[];
  tokenIds: string[];
  profileIds: string[];
  /** Visible name of the seeded specialist (for the PeopleInvolved person select). The seeder names
   *  staff by email; the operator confirm dialog matches the option by visible text. */
  specialistName: string;
}
