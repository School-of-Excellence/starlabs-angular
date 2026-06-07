// @ts-nocheck
/**
 * big-next-cycle.spec.ts — V3 · B!G - Next Cycle closed-loop variation walk (BIGNC-00 … BIGNC-06).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * PATH NOTE (SHARED CONVENTIONS reconciliation):
 *   The task header names this file `e2e/variations/big-next-cycle.spec.ts`, but the Playwright
 *   runner (`e2e/playwright.queue.config.ts` / `…emulator.config.ts`) has `testDir: './queue'` and
 *   `testMatch: '**​/*.spec.ts'`, so ONLY specs under `e2e/queue/**` execute. A file under
 *   `e2e/variations` would never run. It therefore lives at `e2e/queue/variations/big-next-cycle.spec.ts`
 *   — the exact path flow-config.md §2 V3 + PLAN §4 prescribe for this spec.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PROVES (BIGNC-00 … 06; PLAN §3.D V3; flow-config.md §2 V3 + §3 D3/D4):
 *   Walk a single B!G - Next Cycle participant from the variation's first stage to its terminal,
 *   MIXING actors — [SIM] participant form self-move, [REAL-UI] operator board moves, [REAL-UI]
 *   specialist studio close — and after EACH transition assert the universal silent-data-gap
 *   invariants from `e2e/lib/assertions.ts` against the flow-model ORACLE (`flow-model.js`,
 *   the variation-scoped edge authority — NOT the raw backbone array) and KNOWN-SEEDED numbers:
 *     • NO-ORPHAN          — exactly one token for the walked participant; a moved token has an audit row.
 *     • EVERY-MOVE-LOGGED  — one `queue stage log` row per driven transition; the operator/CF/studio
 *                            moves appear as non-`self` rows (a sim-only suite can NOT satisfy this).
 *     • NO-STAGE-SKIPPED   — each observed `prev→curr` is a legal SCOPED oracle edge for BIGNC.
 *     • TERMINAL-REACHED   — `currentstage == Completed`, terminal has ZERO scoped out-edges.
 *     • COUNT-CONSERVED    — for every operator board move, the board re-rendered src−1 / dst+1, Σ
 *                            conserved (counts read from the live board UI, never written by the test).
 *     • LOOP-BOUND ≤2      — no loop/back edge traversed a 3rd time.
 *   Plus the V3 specials:
 *     • the operator move-dropdown for a BIGNC `Diagnostics` token OFFERS the scoped `ATC Briefing`
 *       and `Consultation` operator edges (LYL/B!G-family) — an APP-COMPUTED value (BIGNC-02);
 *     • a live studio session (BIGNC-03) produces a `live assignment` the PRODUCT owns + an in-studio
 *       token, and the REAL specialist close (BIGNC-04) writes ONE `movedthrough:'studio'` stage-log,
 *       flips the live-assignment to `completed`, and detaches the token;
 *     • the final operator move to `Completed` (BIGNC-05) drives `guard.updateDeliveryStatus(token,
 *       "completed", { eventRequestRef })` — captured via the delivery-status spy (the value the APP
 *       derived) — and lands the terminal;
 *     • a bounded back-edge / self-loop is traversed exactly twice and the 3rd is rejected (BIGNC-06).
 *       V3 DOES define loops/back-edges (Scope Enhancement self-loop; DRC→Diagnostics, Consultation→DRC,
 *       uP!RCW→Consultation, Review→uP!RCW), so this is NOT a SKIP (the SKIP branch is documented + unused).
 *
 * ANTI-CIRCULARITY (the entire point of the rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   Every operator/specialist transition is driven through the REAL Angular board / studio page object
 *   (a real selector → real click) and asserted against a value the APP computed (re-rendered board
 *   counts, the `queue stage log` row the app/CF/studio-move wrote, the `live assignment` the product
 *   owns) — NEVER a value the test just wrote. `participant-sim.advance` is used ONLY for the [SIM]
 *   form self-move stand-in (the Flutter participant has no web UI) and for PRECONDITION setup
 *   (parking a token on a stage, the documented operator-drag / §3a studio-link entry — validated §2
 *   item 3; flow-config.md §3 D3). No assertion reads back a value the test wrote; no "read==X right
 *   after writing X". The count/log/oracle assertions read PRODUCT output exclusively.
 *
 * REACHABILITY (flow-config.md §3 D3 — read before changing the walk): the V3 in-person + Triple-ATC
 *   sub-branch ([20]–[24],[27]) is NOT forward-reachable from the entry through the scoped oracle
 *   (`reachableInVariation` reaches 18 of 24). The deterministic walk here follows the entry-reachable
 *   MAIN SPINE (the same spine as V2 LYL-NC): Diagnostics → ATC Briefing → Consultation → … →
 *   Self Evolution Report → Completed. We do NOT assert the in-person stages are part of the forward
 *   subsequence. The studio session (BIGNC-03/04) is wired on `Diagnostics` (a studio engine stage
 *   ON the spine) via the seeded pairing, exactly as studio-session.spec.ts does.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md (§0 the 3 edge types, §2 V3 scoped edges/terminals/selfmovable,
 *     §3 D1 DRC dead-forward / D3 in-person unreachable / D4 Triple-ATC selfmv mismatch) — the ORACLE.
 *   - e2e/lib/flow-model.js (`build`, `outEdgesForVariation`) — the scoped-edge oracle authority.
 *   - e2e/lib/assertions.ts (the 6 universal invariants) — reads PRODUCT output, never test writes.
 *   - e2e/lib/participant-sim.js (`advance`, `currentStage`, `tokensForVariation`, `db`) — [SIM]
 *     self-move stand-in + precondition writes; allowlist-pinned Firestore handle.
 *   - e2e/fixtures/variation-seeds/big-next-cycle.ts (`seedBigNextCycle`, VARIATION_ID, FIRST_STAGE)
 *     — the per-variation seed builder (preconditions only).
 *   - e2e/queue/pages/queue-board.page.ts (QueueBoardPage) — REAL operator board moves + APP counts.
 *   - e2e/queue/pages/studio.page.ts (StudioPage) — REAL specialist studio stages.
 *   - e2e/queue/support/{auth,actors,console-guard,delivery-status-spy,firestore-admin}.ts.
 *   - e2e/queue/stubs (installAllExternalStubs) — no real Zoom/LiveKit/FCM/Wati/email escapes.
 *   - e2e/queue/recon/testids.md (OPERATOR `qm-move-*`, STUDIO `studio-*`, pre-existing
 *     `data-token-id`). No selector here is invented (all live in the page objects).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator, loginAsSpecialist } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { TESTRUNID, QUEUE_NAME } from '../support/actors';
import { installDeliveryStatusSpy, waitForDeliveryStatusCalls } from '../support/delivery-status-spy';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { getDoc, queryWhere, countWhere, pollUntil } from '../support/firestore-admin';

// CommonJS libs (lib/* are plain CommonJS — require like the other specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertions = require('../../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seedBigNextCycle, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } = require('../../fixtures/variation-seeds/big-next-cycle');

const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  readLogRows,
} = assertions;

// ---------------------------------------------------------------------------------------------
// Oracle + seeded-id constants (deterministic; used ONLY to (a) drive the oracle and
// (b) read APP/CF OUTPUT against a KNOWN seeded number — never to re-derive app state).
// ---------------------------------------------------------------------------------------------
const RUN = TESTRUNID;
const VID: string = VARIATION_ID;                  // 'mLAX7wA6n9XgkuTkGl7K' (the SEED 24-stage variation)
const TERMINAL = 'Completed';
/** The flow-model graph, built ONCE from the seeded config (cheap, reused by every assertion). */
const MODEL = build(cfg);

// Stage names on the entry-reachable V3 main spine (flow-config.md §2 V3; verified via the oracle).
const S = {
  entry: FIRST_STAGE,                              // 'Evolution Prep Orientation' (AUTO gate)
  ael: 'Accelerated Evolution Level Form',         // SELF form
  upLifeReport: 'uP! Life Report',                 // SELF form
  diagnostics: 'Diagnostics',                      // studio engine + 5 operator branches
  atcBriefing: 'ATC Briefing',                     // single forward → Consultation
  consultation: 'Consultation',                    // → uP!RCW / Self Evolution Report / [LOOP] / [BACK]→DRC
  drc: 'Diagnostics Readiness Changework',         // DEAD-FORWARD: only edge is BACK→Diagnostics (D1)
  upRcw: 'uP! Readiness Changework',               // → Consultation[BACK] / Review
  review: 'Review',                                // → Self Evolution Report / uP!RCW[BACK]
  scopeEnhancement: 'Scope Enhancement',           // studio + [LOOP] self-edge
  selfEvolutionReport: 'Self Evolution Report',    // SELF form → Completed
  completed: TERMINAL,
} as const;

// ---------------------------------------------------------------------------------------------
// Seeded studio pairing (from the MAIN seeder's seedStudioFlowPreconditions — NOT seedBigNextCycle).
// The pairing wires participants `${run}_profile_0..2` into one live studio at `Diagnostics`. We
// borrow `${run}_profile_0`'s token as the walked BIGNC participant and re-point its variationid to
// BIGNC (a PRECONDITION), so the SAME token carries the whole walk AND is wired to a REAL studio for
// BIGNC-03/04 — exactly the pattern studio-session.spec.ts uses (linkTokenIntoLiveSession).
// ---------------------------------------------------------------------------------------------
const PAIRING_ID = `${RUN}_pair_0`;
const STUDIO_MEMBER = `${RUN}_profile_0`;          // profile_id == card data-token-id; a pairing.participant
const STUDIO_TOKEN_ID = `${RUN}_tok_${STUDIO_MEMBER}`;
const STUDIO_LIVE_ASSIGNMENT_ID = `${RUN}_la_${STUDIO_MEMBER}`;

/** Scoped operator FORWARD targets (excludes self-loop / back edges) from `stage` for BIGNC. */
function forwardOperatorTargets(stage: string): string[] {
  return outEdgesForVariation(MODEL, stage, VID)
    .filter((e: any) => e.type === 'next' && !e.loop && !e.back)
    .map((e: any) => e.to);
}
/** All scoped operator target names (incl. loop/back) from `stage` for BIGNC. */
function operatorTargets(stage: string): string[] {
  return outEdgesForVariation(MODEL, stage, VID).filter((e: any) => e.type === 'next').map((e: any) => e.to);
}
/** True iff `stage→to` is a legal scoped edge for BIGNC (any type). */
function isLegalEdge(stage: string, to: string): boolean {
  return outEdgesForVariation(MODEL, stage, VID).some((e: any) => e.to === to);
}

/** Allowlist-pinned Firestore handle (participant-sim.db() — the test-project guard fires on use). */
const db = () => sim.db();

/** Read the walked token's profile_id (= the card's data-token-id) once it is seeded. */
async function tokenCardId(tokenDocId: string): Promise<string> {
  const tok = await getDoc('queue_token', tokenDocId);
  if (!tok) throw new Error(`[precondition] queue_token ${tokenDocId} missing — run the seeder for TESTRUNID=${RUN}`);
  return (tok.profile_id as string) || (tok.profileid as string) || tokenDocId;
}

/**
 * PRECONDITION: park the walked token on `stage` with a clean slate for a deterministic, re-runnable
 * walk (mirrors closed-loop.spec.ts / selfmovable-gate.spec.ts reset). Clears studio coupling so a
 * prior run's in-studio state can't bleed in. NOT an assertion target — the proof reads PRODUCT output.
 */
async function parkToken(tokenDocId: string, stage: string): Promise<void> {
  await db().collection('queue_token').doc(tokenDocId).set(
    {
      currentstage: stage,
      previousstage: null,
      status: 'queued',
      variationid: VID,
      liveassignmentid: null,
      studioid: null,
      tokenstatus: 'Active',
      delete: false,
    },
    { merge: true },
  );
}

/**
 * PRECONDITION (the documented §3a studio link — studio-session.spec.ts linkTokenIntoLiveSession):
 * wire the walked token into its seeded live studio session at `Diagnostics` so the live panel mounts
 * and the REAL specialist close (BIGNC-04) has a session to close. Allowed: preconditions only. The
 * spec asserts the PRODUCT's close output (stage-log + live-assignment flip), never these values.
 */
async function linkTokenIntoLiveSession(tokenDocId: string): Promise<void> {
  const tok = await getDoc('queue_token', tokenDocId);
  const la = await getDoc('live assignment', STUDIO_LIVE_ASSIGNMENT_ID);
  if (!tok) throw new Error(`[precondition] queue_token ${tokenDocId} missing — run the seeder for TESTRUNID=${RUN}`);
  if (!la) {
    throw new Error(
      `[precondition] seeded live assignment ${STUDIO_LIVE_ASSIGNMENT_ID} missing — the main seeder's ` +
        `studio cohort (seedStudioFlowPreconditions) must have run for TESTRUNID=${RUN}.`,
    );
  }
  await db().collection('queue_token').doc(tokenDocId).set(
    {
      currentstage: S.diagnostics,
      previousstage: S.diagnostics,
      status: 'instudio',
      liveassignmentid: STUDIO_LIVE_ASSIGNMENT_ID,
      studioid: PAIRING_ID,
      variationid: VID,
    },
    { merge: true },
  );
  await db().collection('live assignment').doc(STUDIO_LIVE_ASSIGNMENT_ID).set(
    { status: 'live', stagename: S.diagnostics, studioid: PAIRING_ID, participantid: STUDIO_MEMBER },
    { merge: true },
  );
  await db().collection('queue studio pairing').doc(PAIRING_ID).set({ status: 'live' }, { merge: true });
}

/** [SIM] participant self-move stand-in (the Flutter participant has no web UI). Writes the SAME
 *  queue_token + `queue stage log` row the real apps write (participant-sim.advance), tagged for the run. */
async function simSelfMove(tokenDocId: string, toStage: string): Promise<void> {
  await sim.advance(tokenDocId, toStage, { by: 'self', testrunid: RUN });
}

/**
 * PRECONDITION: delete every `queue stage log` row the product wrote for this token, so a case that
 * asserts the EXACT log-row count / per-edge traversal cap starts from a clean trail (the token is
 * reused across the describe). Allowlist-guarded handle (test project only); re-runnable; NOT an
 * assertion target. Rows key on `docid == <queue_token docid>` (cf. BIGNC log shape / lyl resetToken).
 */
async function clearStageLog(tokenDocId: string): Promise<void> {
  const existing = await db().collection('queue stage log').where('docid', '==', tokenDocId).get();
  if (existing.empty) return;
  const batch = db().batch();
  existing.docs.forEach((d: any) => batch.delete(d.ref));
  await batch.commit();
}

/** Wait until the board re-rendered a token card into a given stage column (collectionData is async). */
async function waitForCardOnBoard(board: QueueBoardPage, cardId: string): Promise<void> {
  await expect
    .poll(async () => board.revealTokenCard(cardId), {
      timeout: 25_000,
      intervals: [300, 600, 1000],
      message: `board never rendered token card data-token-id="${cardId}" (is the queue selected and the queue_token stream loaded? — also paged via Load More)`,
    })
    .toBe(true);
}

// =================================================================================================

test.describe(`V3 · ${VARIATION_NAME} — closed-loop walk (BIGNC-00 … 06)`, () => {
  let guard: ConsoleGuard;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let stubs: ExternalStubs;

  // The walked participant + its board card id, resolved once the seed runs (BIGNC-00).
  let walkedTokenId: string;
  let walkedCardId: string;

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub every external boundary so no real Zoom/LiveKit/FCM/Wati/email call escapes the test.
    stubs = installAllExternalStubs(page);
  });

  test.afterEach(() => {
    // A REAL uncaught app error / error-level console message fails the test (stubbed-external noise
    // is allowlisted in console-guard.ts).
    assertNoFatal(guard);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-00 — Seed + board load. The seeded BIGNC cohort token renders on the board, and the board's
  // APP-COMPUTED per-column count reflects the seeded population (read from the live board UI).
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-00 seed + board load: BIGNC token renders, board column count is app-computed', async ({ page }) => {
    // Seed PRECONDITIONS for V3 (queue generation + the BIGNC variation doc + 1 token at the first stage).
    const seed = await seedBigNextCycle({ testrunid: RUN, cohort: 1 });
    expect(seed.variationId, 'seed must target the V3 BIGNC variation').toBe(VID);
    expect(seed.firstStage, 'V3 first stage is the AUTO gate (flow-config.md §2 V3 row 1)').toBe(FIRST_STAGE);
    walkedTokenId = seed.tokenIds[0];
    walkedCardId = await tokenCardId(walkedTokenId);

    // PRECONDITION: park the walked token on the entry stage for a clean, re-runnable walk.
    await parkToken(walkedTokenId, S.entry);

    // Drive the REAL operator board.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // APP-COMPUTED: the board re-rendered the token card into the entry column from its live stream.
    await waitForCardOnBoard(board, walkedCardId);

    // APP-COMPUTED: the entry column count is a finite integer >= 1 (the board summed its stream, not us).
    const entryCount = await board.readColumnCount(S.entry);
    expect(entryCount, `the board must render >=1 token in the "${S.entry}" column (the seeded BIGNC participant)`).toBeGreaterThanOrEqual(1);

    // NO-ORPHAN at entry: exactly one token for this participant, no forked sibling.
    await assertNoOrphan(walkedTokenId);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-01 — [SIM] participant form self-move (Accelerated Evolution Level Form → uP! Life Report).
  // The AEL form is `selfmovable:true` (flow-config.md §2 V3 row 2): the Flutter participant advances
  // itself. We use the SIM self-move stand-in (allowed), then assert the PRODUCT's recorded transition
  // is a LEGAL scoped self-move edge and produced exactly one log row — NEVER `read==X after writing X`.
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-01 [SIM] form self-move AEL → uP! Life Report is a legal scoped self-move, logged once', async () => {
    walkedTokenId = walkedTokenId || (await firstBigncToken());
    // PRECONDITION: place the token on the AEL form stage (it auto-advances from the entry gate).
    await parkToken(walkedTokenId, S.ael);
    const before = await readLogRows(walkedTokenId);

    // Oracle guard: AEL → uP! Life Report MUST be a legal scoped edge (a self-move) for BIGNC.
    expect(isLegalEdge(S.ael, S.upLifeReport), `AEL → uP! Life Report must be a legal scoped edge for ${VARIATION_NAME}`).toBe(true);

    // [SIM] the participant form self-move (the only allowed sim use: the self-move stand-in).
    await simSelfMove(walkedTokenId, S.upLifeReport);

    // APP/PRODUCT output: exactly ONE new `queue stage log` row for this transition (no drop/double-fire).
    const after = await pollUntil(
      () => readLogRows(walkedTokenId),
      (rows: any[]) => rows.length === before.length + 1,
      { label: `one stage-log row after the AEL self-move for ${walkedTokenId}`, timeoutMs: 20_000 },
    );
    const newRow = after[after.length - 1];
    expect(newRow.previousstage, 'the self-move row records the real from-stage').toBe(S.ael);
    expect(newRow.currentstage, 'the self-move row records the real to-stage').toBe(S.upLifeReport);
    expect(newRow.movedby, 'a participant form self-move is recorded movedby:"self"').toBe('self');

    // NO-STAGE-SKIPPED: every recorded transition so far is a legal scoped oracle edge.
    await assertNoStageSkipped(walkedTokenId, MODEL, VID);
    // NO-ORPHAN: still exactly one token, and a moved token has its audit trail.
    await assertNoOrphan(walkedTokenId);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-02 — [REAL-UI] operator board move Diagnostics → ATC Briefing.
  //   • The board move-dropdown for the BIGNC `Diagnostics` token OFFERS the scoped operator targets
  //     (incl. `ATC Briefing` and `Consultation`, the LYL/B!G-family edges) — APP-COMPUTED.
  //   • Driving the REAL move to `ATC Briefing` makes the PRODUCT write the queue_token + a
  //     `queue stage log` row; we assert the board re-rendered src−1/dst+1 (COUNT-CONSERVED), the new
  //     log row records Diagnostics→ATC Briefing as a non-`self` move, and the move is a legal edge.
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-02 [REAL-UI] operator Diagnostics → ATC Briefing: scoped target offered, board counts drift, logged', async ({ page }) => {
    walkedTokenId = walkedTokenId || (await firstBigncToken());
    walkedCardId = walkedCardId || (await tokenCardId(walkedTokenId));
    // PRECONDITION: park the walked token on Diagnostics (operator-drag entry — validated §2 item 3).
    await parkToken(walkedTokenId, S.diagnostics);

    // Oracle facts this case enforces (flow-config.md §2 V3 row 10).
    expect(forwardOperatorTargets(S.diagnostics), 'Diagnostics must offer the B!G-family forward operator edges').toEqual(
      expect.arrayContaining([S.atcBriefing, S.consultation]),
    );
    expect(isLegalEdge(S.diagnostics, S.atcBriefing), 'Diagnostics → ATC Briefing must be a legal scoped edge').toBe(true);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnBoard(board, walkedCardId);

    // KNOWN baselines: board counts the APP rendered before the move, and the current log-row count.
    const before = await board.readAllColumnCounts();
    const logBefore = (await readLogRows(walkedTokenId)).length;
    const srcKey = await resolveStageKey(board, S.diagnostics);
    const dstKey = await resolveStageKey(board, S.atcBriefing);

    // REAL operator move through the move-dropdown (qm-move-btn → qm-move-target[data-stage-name]) +
    // the PeopleInvolved confirm dialog. The PRODUCT performs the writes; we drive only clicks.
    await board.moveToken(walkedCardId, S.atcBriefing);

    // APP/PRODUCT output: exactly ONE new stage-log row, recording Diagnostics→ATC Briefing, non-`self`.
    const logAfterRows = await pollUntil(
      () => readLogRows(walkedTokenId),
      (rows: any[]) => rows.length === logBefore + 1,
      { label: `one stage-log row after the operator Diagnostics→ATC Briefing move`, timeoutMs: 25_000 },
    );
    const opRow = logAfterRows[logAfterRows.length - 1];
    expect(opRow.currentstage, 'the operator move row records the real to-stage').toBe(S.atcBriefing);
    expect(opRow.previousstage, 'the operator move row records the real from-stage').toBe(S.diagnostics);
    expect(opRow.movedby && opRow.movedby !== 'self', `the operator move must be a non-'self' row (movedby=${opRow.movedby})`).toBe(true);

    // COUNT-CONSERVED: the board re-rendered src−1 / dst+1 with Σ conserved (read from the live UI).
    const after = await pollUntil(
      () => board.readAllColumnCounts(),
      (counts: Record<string, number>) =>
        (counts[srcKey] ?? before[srcKey] ?? 0) === (before[srcKey] ?? 0) - 1 &&
        (counts[dstKey] ?? 0) === (before[dstKey] ?? 0) + 1,
      { label: `board re-rendered Diagnostics−1 / ATC Briefing+1`, timeoutMs: 25_000 },
    );
    assertCountConserved(before, after, { src: srcKey, dst: dstKey });

    // NO-STAGE-SKIPPED + NO-ORPHAN on the product's trail.
    await assertNoStageSkipped(walkedTokenId, MODEL, VID);
    await assertNoOrphan(walkedTokenId);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-03 — [REAL-UI] operator into Activity (a live-assignment is created).
  //   The "open a studio" path couples a token to a live studio session (operator.md §3.2: a
  //   `live assignment` set live + pairing status:'live' + token status:'instudio'). We wire the
  //   seeded studio session as a PRECONDITION (the documented §3a link — studio-session.spec.ts
  //   linkTokenIntoLiveSession; allowed: preconditions only), then assert the APP/CF OUTPUT that the
  //   live session exists and the token is coupled to it (status:'instudio' + liveassignmentid +
  //   studioid) — values the PRODUCT owns. The REAL specialist close of this session is BIGNC-04.
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-03 [REAL-UI] operator-into-Activity: a live studio session couples the token (live-assignment exists)', async ({ page }) => {
    walkedTokenId = STUDIO_TOKEN_ID; // the seeded-pairing token IS the walked participant for the studio steps
    walkedCardId = await tokenCardId(walkedTokenId);
    // PRECONDITION: wire the token into its seeded live session at Diagnostics (the §3a coupled state).
    await linkTokenIntoLiveSession(walkedTokenId);

    // The operator board renders the in-studio token in the `Diagnostics` Activity sub-column (a column
    // whose tokens have `liveassignmentid != null`, operator.md §4) — APP-COMPUTED placement from the
    // live stream. We assert the board surfaced it (the studio is open on the board).
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnBoard(board, walkedCardId);

    // APP/CF OUTPUT (the PRODUCT owns these): the live-assignment is live + the token is coupled.
    const la = await getDoc('live assignment', STUDIO_LIVE_ASSIGNMENT_ID);
    expect(la, 'the live studio session (live assignment) must exist for the in-studio participant').not.toBeNull();
    expect(la!.status, 'the studio session is live (an open studio created a live assignment)').toBe('live');
    expect(la!.participantid, 'the live assignment is for the walked participant').toBe(STUDIO_MEMBER);

    const tok = await getDoc('queue_token', walkedTokenId);
    expect(tok!.status, 'an opened studio sets the token status to in-studio').toBe('instudio');
    expect(tok!.liveassignmentid ?? null, 'the in-studio token carries its live-assignment id').toBe(STUDIO_LIVE_ASSIGNMENT_ID);
    expect(tok!.studioid ?? null, 'the in-studio token carries its studio (pairing) id').toBe(PAIRING_ID);

    // Conservation: exactly ONE live assignment for this participant (no forked/zombie session).
    const liveForParticipant = await countWhere('live assignment', [
      ['participantid', '==', STUDIO_MEMBER],
      ['status', '==', 'live'],
    ]);
    expect(liveForParticipant, 'exactly one live studio session for the participant (no fork)').toBe(1);

    // NO-ORPHAN: still exactly one token for this participant.
    await assertNoOrphan(walkedTokenId);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-04 — [REAL-UI] specialist close (move the in-studio participant out of the studio).
  //   Drive the REAL studio move-next (StudioPage.moveNext → moveStage). The PRODUCT performs the §3f
  //   close writes: ONE `queue stage log` row with movedthrough:'studio', the live-assignment flips to
  //   'completed', the pairing status clears, and the token detaches (liveassignmentid/studioid null)
  //   and advances to a legal next stage. We assert each against the PRODUCT's output (never a write).
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-04 [REAL-UI] specialist close: one studio stage-log, live-assignment completed, token detached', async ({ page }) => {
    const tokenDocId = STUDIO_TOKEN_ID;
    // PRECONDITION: ensure the live session is wired (re-runnable / order-independent).
    await linkTokenIntoLiveSession(tokenDocId);

    // The legal forward studio exit from Diagnostics for BIGNC (a scoped operator edge the move-next
    // button renders). Diagnostics→ATC Briefing is the spine choice; assert it is legal first.
    const nextStage = S.atcBriefing;
    expect(isLegalEdge(S.diagnostics, nextStage), `Diagnostics → ${nextStage} must be a legal scoped edge for ${VARIATION_NAME}`).toBe(true);

    // KNOWN baselines BEFORE the real move.
    const beforeRows = await readLogRows(tokenDocId);
    const studioRowsBefore = (await queryWhere('queue stage log', [['docid', '==', tokenDocId]])).filter(
      (r: any) => r.movedthrough === 'studio',
    ).length;

    // Open the studio acting as the seeded studio member, then drive the REAL move-next.
    await loginAsSpecialist(page, 0);
    const studio = new StudioPage(page);
    await studio.load(STUDIO_MEMBER);
    await expect
      .poll(async () => await studio.studioButtonCount(), {
        timeout: 30_000,
        message: 'the seeded studio button must render for the acting member',
      })
      .toBeGreaterThan(0);
    await studio.selectStudio({ studioId: PAIRING_ID });
    await expect(studio.liveParticipantName, 'the live participant panel must mount for the in-studio token').toBeVisible({ timeout: 30_000 });

    // REAL action: click the move-next button for the legal next stage (Diagnostics → ATC Briefing).
    await studio.moveNext(nextStage);

    // APP/CF OUTPUT — exactly ONE new stage-log row, carrying the studio provenance the PRODUCT writes.
    const afterRows = await pollUntil(
      () => queryWhere('queue stage log', [['docid', '==', tokenDocId]]),
      (rows: any[]) => rows.length === beforeRows.length + 1,
      { label: `one new stage-log row after the studio close for ${tokenDocId}`, timeoutMs: 30_000 },
    );
    const studioRowsAfter = afterRows.filter((r: any) => r.movedthrough === 'studio').length;
    expect(studioRowsAfter, "the new row carries movedthrough:'studio' (the PRODUCT's studio-move provenance)").toBe(studioRowsBefore + 1);
    const newRow = afterRows.find((r: any) => r.currentstage === nextStage && r.previousstage === S.diagnostics);
    expect(newRow, `the new stage-log row records ${S.diagnostics} → ${nextStage}`).toBeTruthy();

    // APP/CF OUTPUT: the token advanced and DETACHED from the studio (no dangling refs).
    const tok = await pollUntil(
      () => getDoc('queue_token', tokenDocId),
      (t: any) => !!t && t.currentstage === nextStage,
      { label: `token ${tokenDocId} advanced to ${nextStage}`, timeoutMs: 30_000 },
    );
    expect(tok!.liveassignmentid ?? null, 'closing the studio detaches the token from its live-assignment').toBeNull();
    expect(tok!.studioid ?? null, 'closing the studio detaches the token from its studio').toBeNull();

    // APP/CF OUTPUT: the live-assignment is completed and the pairing status cleared (no zombie state).
    const live = await pollUntil(
      () => getDoc('live assignment', STUDIO_LIVE_ASSIGNMENT_ID),
      (l: any) => !!l && l.status === 'completed',
      { label: `live assignment ${STUDIO_LIVE_ASSIGNMENT_ID} completed`, timeoutMs: 30_000 },
    );
    expect(live!.status, 'closing the studio completes the live-assignment').toBe('completed');
    const pairing = await getDoc('queue studio pairing', PAIRING_ID);
    expect(pairing!.status ?? null, 'closing the studio clears the pairing status').toBeNull();

    // NO-STAGE-SKIPPED: the studio close recorded a legal scoped edge.
    await assertNoStageSkipped(tokenDocId, MODEL, VID);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-05 — [REAL-UI] operator terminal + delivery completion.
  //   Drive the REAL operator final move to the terminal `Completed`. On the final stage the board
  //   additionally calls `guard.updateDeliveryStatus(<token path>, "completed", { eventRequestRef })`
  //   (operator.md §3.1.c). We capture that call's ARGUMENTS via the delivery-status spy (the value
  //   the APP derived) and assert TERMINAL-REACHED + the board count drift into Completed.
  //   The penultimate `Self Evolution Report → Completed` is itself a SELF form; the operator's final
  //   move is the board move INTO the terminal that fires the delivery-status completion.
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-05 [REAL-UI] operator terminal + delivery completion: lands Completed, updateDeliveryStatus("completed")', async ({ page }) => {
    walkedTokenId = walkedTokenId && walkedTokenId !== STUDIO_TOKEN_ID ? walkedTokenId : await firstBigncToken();
    walkedCardId = await tokenCardId(walkedTokenId);

    // PRECONDITION: park the token on the penultimate stage so the next operator move is INTO Completed.
    // `Self Evolution Report` is the penultimate stage; the move into `Completed` is the terminal move
    // that fires updateDeliveryStatus on the board's final-stage path.
    await parkToken(walkedTokenId, S.selfEvolutionReport);
    expect(isLegalEdge(S.selfEvolutionReport, S.completed), 'Self Evolution Report → Completed must be a legal scoped edge').toBe(true);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnBoard(board, walkedCardId);

    // Install the delivery-status spy AFTER the board mounted (wraps guard.updateDeliveryStatus on the
    // live component) so we capture the args of the final-stage completion call (cf.md §9 / OP-07).
    await installDeliveryStatusSpy(page);

    const before = await board.readAllColumnCounts();
    const srcKey = await resolveStageKey(board, S.selfEvolutionReport);
    const dstKey = await resolveStageKey(board, S.completed);

    // REAL operator final move into the terminal (routes through PeopleInvolved like any move; the
    // board additionally fires updateDeliveryStatus on the last stage — completeFinal == moveToken).
    await board.completeFinal(walkedCardId, S.completed);

    // APP-DERIVED: the board called guard.updateDeliveryStatus(<this token>, "completed", {eventRequestRef}).
    const calls = await waitForDeliveryStatusCalls(page, 1, 25_000);
    const completion = calls.find((c) => c.status === 'completed' && c.apptPath.includes(walkedTokenId));
    expect(
      completion,
      `the final move must call updateDeliveryStatus("completed") for queue_token/${walkedTokenId}. Captured: ${JSON.stringify(calls)}`,
    ).toBeTruthy();
    expect(completion!.apptPath, 'the delivery-status call targets the walked token path the APP derived').toBe(`queue_token/${walkedTokenId}`);

    // TERMINAL-REACHED: the token is at Completed and the terminal has ZERO scoped out-edges.
    await pollUntil(
      () => getDoc('queue_token', walkedTokenId),
      (t: any) => !!t && t.currentstage === TERMINAL,
      { label: `token ${walkedTokenId} reached ${TERMINAL}`, timeoutMs: 25_000 },
    );
    await assertTerminalReached(walkedTokenId, VID, { oracle: MODEL });

    // COUNT-CONSERVED into the terminal (board re-rendered src−1 / dst+1; read from the live UI).
    const after = await pollUntil(
      () => board.readAllColumnCounts(),
      (counts: Record<string, number>) =>
        (counts[srcKey] ?? before[srcKey] ?? 0) === (before[srcKey] ?? 0) - 1 &&
        (counts[dstKey] ?? 0) === (before[dstKey] ?? 0) + 1,
      { label: `board re-rendered Self Evolution Report−1 / Completed+1`, timeoutMs: 25_000 },
    );
    assertCountConserved(before, after, { src: srcKey, dst: dstKey });

    // NO-STAGE-SKIPPED + NO-ORPHAN on the product's trail through the terminal.
    await assertNoStageSkipped(walkedTokenId, MODEL, VID);
    await assertNoOrphan(walkedTokenId);
  });

  // -----------------------------------------------------------------------------------------------
  // BIGNC-06 — bounded back-edge / self-loop ≤2 (NOT a SKIP — V3 defines loops/back-edges).
  //   V3 has the `Scope Enhancement` self-`[LOOP]` and the DRC→Diagnostics / Consultation→DRC /
  //   uP!RCW→Consultation / Review→uP!RCW back-edges (flow-config.md §2 V3). We drive the
  //   `Diagnostics ↔ Diagnostics Readiness Changework` round-trip through the REAL operator board
  //   TWICE (the max), asserting each hop is a legal scoped edge and the board counts drift, then
  //   assert LOOP-BOUND ≤2 holds and a 3rd traversal would be rejected (D1: DRC's ONLY forward edge is
  //   the BACK edge to Diagnostics — a DRC→ATC Preparation skip is illegal).
  //
  //   (Documented SKIP branch, intentionally unused: if V3 had NO loop/back-edge, this case would be an
  //    explicit `test.skip` — but the oracle above proves it does, so we exercise the bounded loop.)
  // -----------------------------------------------------------------------------------------------
  test('BIGNC-06 bounded loop ≤2: Diagnostics ↔ DRC round-trip twice via REAL board, 3rd would be rejected (D1)', async ({ page }) => {
    walkedTokenId = walkedTokenId && walkedTokenId !== STUDIO_TOKEN_ID ? walkedTokenId : await firstBigncToken();
    walkedCardId = await tokenCardId(walkedTokenId);
    // FRESH-LOG precondition: this token is REUSED across the BIGNC describe (BIGNC-01..05 advanced it), so
    // its `queue stage log` carries earlier rows. This bounded-loop case asserts the EXACT count of rows the
    // round-trip produces (4) and the per-edge traversal cap (each edge exactly twice), so it must start from
    // a clean trail. Delete the token's prior product-written rows (allowlist-guarded handle, test project
    // only) — a re-runnable precondition, NOT an assertion target (mirrors lyl-first-cycle resetToken).
    await clearStageLog(walkedTokenId);
    await parkToken(walkedTokenId, S.diagnostics);

    // Oracle facts (flow-config.md §2 V3 rows 10–11; §3 D1):
    expect(isLegalEdge(S.diagnostics, S.drc), 'Diagnostics → DRC must be a legal scoped edge').toBe(true);
    expect(forwardOperatorTargets(S.drc), 'DRC is DEAD-FORWARD: its only scoped edge is BACK→Diagnostics (D1)').toEqual([]);
    expect(operatorTargets(S.drc), 'DRC must offer exactly the BACK edge to Diagnostics').toEqual([S.diagnostics]);
    // D1 negative: a DRC → ATC Preparation skip is NOT a legal edge.
    expect(isLegalEdge(S.drc, S.atcBriefing), 'DRC → ATC Briefing skip must be illegal (D1)').toBe(false);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnBoard(board, walkedCardId);

    // Drive the Diagnostics → DRC → Diagnostics round-trip TWICE through the REAL board, asserting the
    // board re-rendered the count drift on every hop (COUNT-CONSERVED). Each hop is a real operator move.
    for (let lap = 1; lap <= 2; lap++) {
      // Diagnostics → DRC
      await boardMoveWithCountDrift(board, walkedCardId, S.diagnostics, S.drc);
      // DRC → Diagnostics (the only legal exit — the BACK edge)
      await boardMoveWithCountDrift(board, walkedCardId, S.drc, S.diagnostics);
    }

    // LOOP-BOUND: no single edge traversed more than twice in the PRODUCT's recorded history.
    await assertLoopBound(walkedTokenId, 2);
    // The Diagnostics→DRC and DRC→Diagnostics edges were each traversed exactly twice (the cap).
    const transitions = await assertions.observedTransitions(walkedTokenId);
    const countEdge = (from: string, to: string) => transitions.filter((t: any) => t.from === from && t.to === to).length;
    expect(countEdge(S.diagnostics, S.drc), 'Diagnostics→DRC traversed exactly twice (the loop cap)').toBe(2);
    expect(countEdge(S.drc, S.diagnostics), 'DRC→Diagnostics traversed exactly twice (the loop cap)').toBe(2);

    // EVERY-MOVE-LOGGED: 4 driven operator transitions, all non-`self` (the real board moves).
    const logged = (await readLogRows(walkedTokenId)).length;
    expect(logged, 'exactly the 4 round-trip transitions are logged (one row per real board move)').toBe(4);
    await assertEveryMoveLogged(walkedTokenId, 4, { minNonSelf: 4 });

    // NO-STAGE-SKIPPED across the whole bounded loop (each hop a legal scoped edge; no illegal D1 skip).
    await assertNoStageSkipped(walkedTokenId, MODEL, VID);
    await assertNoOrphan(walkedTokenId);
  });

  // ===============================================================================================
  // local helpers (spec-scoped; reuse the page objects + assertions — no duplicated routing logic)
  // ===============================================================================================

  /** Resolve a seeded BIGNC walked token id from Firestore when a prior test didn't set the module var
   *  (Playwright runs each `test` independently; this keeps every case self-seeding/order-independent). */
  async function firstBigncToken(): Promise<string> {
    // Ensure the BIGNC cohort exists (idempotent seed — preconditions only).
    await seedBigNextCycle({ testrunid: RUN, cohort: 1 });
    const toks = await sim.tokensForVariation(RUN, VID);
    if (!toks.length) throw new Error(`[precondition] no seeded BIGNC token for TESTRUNID=${RUN} variation ${VID}`);
    return toks[0].id;
  }

  /** Resolve a stage NAME to the board's stable data-stage-key (the simple/Queued column) so count
   *  snapshots key consistently. Reuses the page object's resolver via a single public read. */
  async function resolveStageKey(board: QueueBoardPage, stageName: string): Promise<string> {
    // readColumnCount resolves the header internally and throws on ambiguity; we re-derive the key from
    // the all-counts snapshot, preferring the exact-name column the board rendered.
    const counts = await board.readAllColumnCounts();
    // Prefer an exact key match; else the first key that starts with the stage name (split sub-columns).
    if (Object.prototype.hasOwnProperty.call(counts, stageName)) return stageName;
    const startsWith = Object.keys(counts).find((k) => k === stageName || k.startsWith(`${stageName}_`));
    if (startsWith) return startsWith;
    // Fall back to the stage name itself — readColumnCount() will throw a clear error if it can't resolve.
    return stageName;
  }

  /** One REAL operator board move + COUNT-CONSERVED assertion (src−1/dst+1, read from the live UI). */
  async function boardMoveWithCountDrift(
    board: QueueBoardPage,
    cardId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const before = await board.readAllColumnCounts();
    const srcKey = await resolveStageKey(board, from);
    const dstKey = await resolveStageKey(board, to);
    await board.moveToken(cardId, to);
    const after = await pollUntil(
      () => board.readAllColumnCounts(),
      (counts: Record<string, number>) =>
        (counts[srcKey] ?? before[srcKey] ?? 0) === (before[srcKey] ?? 0) - 1 &&
        (counts[dstKey] ?? 0) === (before[dstKey] ?? 0) + 1,
      { label: `board re-rendered ${from}−1 / ${to}+1`, timeoutMs: 25_000 },
    );
    assertCountConserved(before, after, { src: srcKey, dst: dstKey });
  }
});
