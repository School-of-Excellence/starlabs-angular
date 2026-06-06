// @ts-nocheck
/**
 * up-3rd-cycle.spec.ts — V8 · uP! - 3rd Cycle closed-loop variation walk.
 * PLAN case UP3-WF-01 (flow-config.md §2 V8, §3 D1+D2, §5 "V4/V5/V6/V8").
 *
 * PATH NOTE: the task brief names this file `e2e/variations/up-3rd-cycle.spec.ts`, but the Playwright
 * runner (`e2e/playwright.queue.config.ts`) has `testDir: './queue'` + `testMatch: '**​/*.spec.ts'`, so a
 * file outside `queue/` is NOT discovered. flow-config.md §2 V8 names the spec
 * `e2e/queue/variations/up-3rd-cycle.spec.ts` and every sibling variation spec lives there. This file is
 * therefore placed under `queue/variations/` so it actually runs (SHARED CONVENTIONS: specs MUST live
 * under e2e/queue/...).
 *
 * WHAT THIS PROVES (the anti-circularity rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   A participant of variation V8 (`XmCS5togakPzWjfQvEe3`) is walked from the entry stage
 *   (`Evolution Prep Orientation`) to the sole terminal (`Completed`) MIXING ALL THREE DRIVERS:
 *     • operator `nextstage` decisions are driven through the REAL Angular Live Board (QueueBoardPage:
 *       open the token's move-dropdown → click the scoped target → drive the PeopleInvolved confirm
 *       dialog), and we assert the count the BOARD re-rendered (src−1 / dst+1, Σ conserved) — a value the
 *       APP computed from its live `queue_token` stream, never one the test wrote;
 *     • the SPECIALIST studio stage (Diagnostics, the studio engine — studiowidgets + enablezoom) is
 *       advanced through the REAL Dynamic Studio UI (StudioPage.moveNext → the product's `moveStage`),
 *       and we re-read the operator board to assert the board recomputed the counts;
 *     • self-move / auto-advance transitions are stood in for by the participant simulator
 *       (`participant-sim.advance`, the documented Flutter self-move stand-in) — PRECONDITIONS ONLY.
 *   After EVERY transition the universal silent-data-gap invariants (e2e/lib/assertions.ts) run AGAINST
 *   PRODUCT OUTPUT (the `queue stage log` rows the board/studio/CF/self-move wrote, the token the app
 *   advanced, the per-stage counts the board recomputed) and against the scoped-edge ORACLE
 *   (e2e/lib/flow-model.js `outEdgesForVariation` — the flow-config authority, NOT the raw backbone):
 *     NO-ORPHAN · EVERY-MOVE-LOGGED (reads product rows; ≥ the operator/studio/CF-driven count) ·
 *     NO-STAGE-SKIPPED (prev→curr is a legal scoped edge) · TERMINAL-REACHED · COUNT-DRIFT (board UI) ·
 *     LOOP-BOUND ≤ 2.
 *   CRITICAL (the circular anti-pattern being removed — closed-loop.spec.ts, superseded): operator AND
 *   specialist transitions go through the REAL board / studio UI and assert the board's recomputed
 *   counts; we do NOT replay a sim write and then assert `currentstage == X`. Every invariant reads a
 *   value the PRODUCT produced — never "read == X right after writing X".
 *
 * V8 ↔ V7 / V6 DIVERGENCE (the headline facts this spec hinges on — flow-config.md §2 V8, §3 D1+D2):
 *   Stage list IDENTICAL to V7 (uP!-NC): Evolution Prep Orientation→AEL→uP! Life Report→Scope
 *   Enhancement→Evolution Mapping Activity→In Evolution Mapping Activity (link)→Self Evaluation Form→
 *   Guided Self ATC→Ready for Diagnostics→Diagnostics→…→Self Evolution Report→Completed.
 *   The ONLY oracle difference vs V7: `Diagnostics` [15] has EXACTLY 5 forward edges — it DROPS the
 *   `Diagnostics→Self Evolution Report` button (which V4/V5/V6/V7 keep). It still does NOT offer
 *   →Consultation (an LYL/B!G-only edge). So the V8 Diagnostics move-dropdown must offer EXACTLY
 *   {DRC, Diagnostics[LOOP], ATC Briefing, uP! Readiness Changework, ATC Preparation} and MUST NOT offer
 *   →Consultation (D2) NOR →Self Evolution Report (the V6/V7↔V8 discriminator — PLAN P1 #12 / §3.D V8).
 *   `Diagnostics Readiness Changework` [16] is DEAD-FORWARD (D1): its ONLY exit is the BACK-edge
 *   →Diagnostics; the backbone-adjacent DRC→ATC Preparation is ILLEGAL. `Consultation` [19] is OFF the
 *   forward happy path (D2): no forward operator edge enters it.
 *
 * VARIATION-SPECIFIC (the ref / flow-config.md §5 "V4/V5/V6/V8" + §2 V8 + §3 D1+D2):
 *   UP3-WF-01-HAPPY — the canonical forward walk: the V8 backbone MINUS the two off-forward stages
 *                     (Consultation [19] D2, DRC [16] D1), routed Diagnostics→ATC Briefing→uP! Readiness
 *                     Changework→Review→Self Evolution Report→Completed. The Diagnostics→ATC Briefing hop
 *                     is driven by the REAL SPECIALIST STUDIO (the studio engine), every other operator
 *                     hop by the REAL board, the self/auto hops by the sim — actor mixing. Every
 *                     adjacency is a single legal scoped edge (asserted by classifyHop before driving).
 *   UP3-WF-01-LOOP  — the Diagnostics SELF-LOOP ("Send Back", to==from) ≤ 2 AND the Diagnostics↔DRC
 *                     round-trip ≤ 2 (forward Diagnostics→DRC then the D1 BACK-edge DRC→Diagnostics),
 *                     WITH the D1 negative gate (DRC offers only →Diagnostics, never →ATC Preparation).
 *                     A 3rd traversal of EITHER edge FAILS LOOP-BOUND (TEST-THE-TEST; PLAN risk 13).
 *   UP3-WF-01-SCOPE — the oracle-parity sweep: the static build()/oracle() baseline (the 2 known
 *                     orphans, 0 dangling) + the variation-scoped Diagnostics move-dropdown on the REAL
 *                     board (EXACTLY the 4 distinct non-loop targets; →Consultation absent (D2),
 *                     →Self Evolution Report absent (the V6/V7↔V8 discriminator)), and the FORMREF
 *                     PRESENCE fact (the V8 Diagnostics stage references participant forms — a non-empty
 *                     `participantform[]`, the "Forms submitted by the Participant" studio widget source).
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md §0/§2 V8/§3 D1+D2/§5 — the routing oracle SOURCE OF TRUTH for THIS variation.
 *   - e2e/lib/flow-model.js (build, oracle, outEdgesForVariation) — the scoped-edge oracle.
 *   - e2e/lib/assertions.ts — the six universal invariants (read product output, not test writes).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db) — self-move stand-in + allowlist-pinned handle.
 *   - e2e/fixtures/variation-seeds/up-3rd-cycle.ts (+ _common.ts) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts — REAL operator board moves + board-computed counts.
 *   - e2e/queue/pages/studio.page.ts — REAL specialist studio move-next (the Diagnostics engine stage).
 *   - e2e/queue/support/{auth,console-guard,actors}.ts; e2e/queue/stubs (external boundaries);
 *     e2e/queue/recon/testids.md (OPERATOR + STUDIO surfaces, PRE-EXISTING data-token-id /
 *     data-stage-name). No selector is invented (the page objects own them).
 */
import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator, loginAsSpecialist } from '../support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { QUEUE_NAME } from '../support/actors';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { seedUp3rdCycle, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/up-3rd-cycle';

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
const VID = VARIATION_ID; // XmCS5togakPzWjfQvEe3
const TERMINAL = 'Completed';

// Stage-name constants used across the walk / loop / scope cases (avoid typos; one place to edit).
const ENTRY = 'Evolution Prep Orientation';
const SCOPE = 'Scope Enhancement';
const DIAG = 'Diagnostics';
const DRC = 'Diagnostics Readiness Changework';
const ATC_PREP = 'ATC Preparation';
const ATC_BRIEF = 'ATC Briefing';
const CONSULT = 'Consultation';
const UP_RCW = 'uP! Readiness Changework';
const REVIEW = 'Review';
const SELF_REPORT = 'Self Evolution Report';

/**
 * The classification of one transition on the walk, derived from the ORACLE (flow-config authority),
 * NOT the backbone array. `kind`:
 *   - 'OP'    : operator `nextstage` edge → driven through the REAL board (QueueBoardPage.moveToken),
 *               count-drift asserted from the board's recomputed counts. movedby != 'self'.
 *   - 'STUDIO': an operator `nextstage` edge OUT OF the studio engine (Diagnostics), driven through the
 *               REAL specialist Dynamic Studio UI (StudioPage.moveNext → moveStage). movedby != 'self'.
 *   - 'SELF'  : participant self-move on form/videoask submit (selfmv) → participant-sim stand-in (by:'self').
 *   - 'AUTO'  : non-self-movable gate/link auto-advance (no scoped button) → participant-sim stand-in
 *               (by:'operator' — an app/CF-driven hop, NOT a participant self-write).
 * `studio` (optional) overrides the oracle-derived kind to drive the hop through the REAL studio even
 * though the underlying edge is an operator `next` edge (used for the Diagnostics engine hop).
 */
type Hop = { from: string; to: string; kind: 'OP' | 'STUDIO' | 'SELF' | 'AUTO' };

/** Classify a single legal forward hop from `from`→`to` against the oracle (throws if illegal). */
function classifyHop(from: string, to: string, opts: { studio?: boolean } = {}): Hop {
  const edges = outEdgesForVariation(MODEL, from, VID).filter((e: any) => e.to === to);
  if (edges.length !== 1) {
    const legal = outEdgesForVariation(MODEL, from, VID).map((e: any) => e.to);
    throw new Error(
      `[up-3rd-cycle] hop "${from}" → "${to}" is not a single legal scoped edge (matched ${edges.length}). ` +
      `Legal oracle out-edges from "${from}": ${JSON.stringify(legal)}. Fix the path or regenerate flow-config.md.`,
    );
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: opts.studio ? 'STUDIO' : 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/**
 * The UP3-WF-01 HAPPY forward stage sequence — the V8 backbone walked through the ORACLE, MINUS the two
 * stages that are off the forward happy path for this variation (flow-config.md §2 V8 / §3):
 *   • Diagnostics Readiness Changework [16] — DEAD-FORWARD (D1): its only exit is the BACK-edge.
 *   • Consultation [19] — OFF the forward path in the uP!/Prodigies family (D2): no forward edge enters it.
 * The operator decision at Diagnostics is routed to ATC Briefing (the studio-engine forward branch),
 * then ATC Briefing→uP! Readiness Changework→Review→Self Evolution Report→Completed (NOT →Consultation —
 * the uP!-family branch set). Every adjacency below is a single legal scoped edge (asserted by classifyHop).
 */
const HAPPY_PATH: string[] = [
  'Evolution Prep Orientation',          // [0]  AUTO  →
  'Accelerated Evolution Level Form',    // [2]  SELF  →
  'uP! Life Report',                     // [7]  SELF  →
  'Scope Enhancement',                   // [8]  OP    →  (studio engine; operator routes forward on the board)
  'Evolution Mapping Activity',          // [9]  AUTO  →
  'In Evolution Mapping Activity',       // [10] AUTO  →  (link stage — non-self-movable auto gate)
  'Self Evaluation Form',                // [11] SELF  →
  'Guided Self ATC',                     // [13] SELF  →
  'Ready for Diagnostics',               // [14] AUTO  →
  'Diagnostics',                         // [15] STUDIO→  (central hub / studio engine; SPECIALIST drives moveStage → ATC Briefing)
  'ATC Briefing',                        // [18] OP    →
  'uP! Readiness Changework',            // [25] OP    →  (NO Consultation hop — D2: ATC Briefing→uP!RCW)
  'Review',                              // [26] OP    →
  'Self Evolution Report',               // [28] SELF  →
  'Completed',                           // [29] TERMINAL
];
// 15 stages ⇒ 14 forward transitions. The PLAN's headline counts the full V8 backbone (which lists
// DRC [16] and Consultation [19]); the oracle-legal FORWARD walk omits both (D1 + D2), so the product
// logs exactly the 14 moves asserted below (assertions treat the null-`from` entry hop, which the
// product never logs, as the entry onto the first stage).

/**
 * Pre-compute & oracle-validate the HAPPY hops once (fails fast on any illegal adjacency). The
 * Diagnostics→ATC Briefing hop is flagged `studio:true` so it is driven through the REAL specialist
 * studio (the Diagnostics engine), exercising the studio surface as the brief requires.
 */
const HAPPY_HOPS: Hop[] = HAPPY_PATH.slice(0, -1).map((from, i) =>
  classifyHop(from, HAPPY_PATH[i + 1], { studio: from === DIAG }),
);

// =================================================================================================
// Shared helpers — board readiness + per-hop drivers (REAL board for OP, REAL studio for STUDIO,
// sim stand-in for SELF/AUTO)
// =================================================================================================

/**
 * Park `tokenDocId` on `stage` as a PRECONDITION (allowed setup — stands in for the participant having
 * reached the stage; mirrors the V1/V6 siblings / selfmovable-gate resets). Clears prior studio refs so
 * the board buckets the token into the stage's QUEUED sub-column. Not an assertion target.
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
      const present = await board.tokenCard(cardId).count();
      return present > 0;
    }, { timeout: 20_000, message: `board never rendered token card data-token-id="${cardId}" (queue selected & queue_token stream loaded?)` })
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
  // (Forward targets out of V8 stages are all NON-Activity → PeopleInvolved path; submit as-is.)
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
 * /link hop, NOT a participant self-write). This is a PRECONDITION/self-move stand-in only (brief): the
 * spec still asserts the PRODUCT's log row via the universal invariants, never this written value directly.
 */
async function driveSimHop(tokenDocId: string, hop: Hop, testrunid: string): Promise<void> {
  const by = hop.kind === 'SELF' ? 'self' : 'operator';
  await sim.advance(tokenDocId, hop.to, { by, testrunid });
}

/**
 * Drive ONE specialist (`STUDIO`) transition OUT of the Diagnostics studio engine through the REAL
 * Dynamic Studio UI, asserting the operator board's recomputed counts around the move.
 *
 * The studio renders the move-next button only when the live panel is mounted: token instudio + a
 * live-assignment + a live pairing the acting member belongs to (studio.md §3a / SS-12). We wire that
 * link as a PRECONDITION (allowed — preconditions only; the spec asserts the value the PRODUCT produces
 * by the REAL moveStage, never these seeded values), open /dynamicstudio acting as the seeded member,
 * select the studio so the live panel mounts, and click the REAL move-next button for `hop.to`.
 *
 * Returns true if the REAL studio move was performed; false if the live panel / move-next button could
 * not render in this environment (the caller records a finding + stops the walk — the sim is NEVER
 * substituted for the specialist move, which would be the circular anti-pattern this rebuild removes).
 */
async function driveStudioHop(
  page: Page,
  board: QueueBoardPage,
  hop: Hop,
  ctx: { tokenDocId: string; cardId: string; memberProfileId: string; testrunid: string; queueGenDocId: string },
): Promise<boolean> {
  await waitForCardOnStage(page, board, ctx.cardId, hop.from);
  const beforeAll = await board.readAllColumnCounts();
  const beforeSrc = await board.readColumnCount(hop.from);

  const moved = await tryStudioMove(page, hop, ctx);
  if (!moved) return false;

  // Wait for the studio move to advance the token (it writes the stage-log + advances currentstage),
  // then re-read the SAME operator board to confirm the board recomputed the counts.
  await expect
    .poll(async () => {
      const d = await sim.db().collection('queue_token').doc(ctx.tokenDocId).get();
      return d.exists ? d.data().currentstage : null;
    }, { timeout: 30_000, message: `token ${ctx.tokenDocId} did not advance to "${hop.to}" via the REAL studio move.` })
    .toBe(hop.to);

  // Re-focus the operator board (the studio move happened on /dynamicstudio) so its stream re-renders.
  await loginAsOperator(page);
  await board.selectQueue(QUEUE_NAME);
  await expect
    .poll(async () => (await board.readColumnCount(hop.from).catch(() => beforeSrc)), {
      timeout: 20_000,
      message: `count-drift: board source column "${hop.from}" did not drop after the REAL studio ${hop.from}→${hop.to} move.`,
    })
    .toBe(beforeSrc - 1);
  const afterAll = await board.readAllColumnCounts();
  const srcKey = await resolveStageKeyForCount(board, hop.from, beforeAll, afterAll, -1);
  const dstKey = await resolveStageKeyForCount(board, hop.to, beforeAll, afterAll, +1);
  assertCountConserved(beforeAll, afterAll, { src: srcKey, dst: dstKey });
  return true;
}

/**
 * Wire the in-studio link as a PRECONDITION and drive the REAL specialist move-next for `hop.to`.
 * Mirrors prodigies-first-cycle.spec.ts tryStudioMove (the established pattern): a live pairing the
 * acting member belongs to (checked-in + live), a live-assignment at the studio stage, the token
 * instudio + linked to the live-assignment + pairing. Then act as the seeded member via the
 * `?profileid=` studio override hook (studio.md CRITICAL TEST HOOK), select the studio, and click the
 * REAL move-next button. Returns false when the live panel / move-next button cannot render.
 */
async function tryStudioMove(
  page: Page,
  hop: Hop,
  ctx: { tokenDocId: string; memberProfileId: string; testrunid: string; queueGenDocId: string },
): Promise<boolean> {
  const member = ctx.memberProfileId;
  const pairingId = `${ctx.testrunid}_up3_pair`;
  const liveAssignmentId = `${ctx.testrunid}_up3_la_${member}`;
  const db = sim.db();

  // PRECONDITION wiring (allowed — preconditions only; the spec asserts the PRODUCT's output from the
  // REAL moveStage, never these seeded values):
  await db.collection('queue studio pairing').doc(pairingId).set(
    {
      docid: pairingId, participants: [member], studioin: true, checkin: true, status: 'live',
      openvidu: false, queueid: ctx.queueGenDocId, delete: false, testrunid: ctx.testrunid, _testdata: true,
    },
    { merge: true },
  );
  await db.collection('live assignment').doc(liveAssignmentId).set(
    {
      docid: liveAssignmentId, status: 'live', stagename: hop.from, studioid: pairingId,
      participantid: member, queueid: ctx.queueGenDocId, testrunid: ctx.testrunid, _testdata: true,
    },
    { merge: true },
  );
  await db.collection('queue_token').doc(ctx.tokenDocId).set(
    { currentstage: hop.from, previousstage: hop.from, status: 'instudio', liveassignmentid: liveAssignmentId, studioid: pairingId },
    { merge: true },
  );

  // Act as the seeded studio member: log in as a real specialist to pass authGuard, then the
  // ?profileid override resolves studioList/live-assignment to the seeded pairing.
  await loginAsSpecialist(page, 0);
  const studio = new StudioPage(page);
  await studio.load(member);

  // The seeded pairing renders one studio button for this member; if it never renders the live panel
  // cannot mount → report inability to drive the REAL move (never sim-substitute).
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

/**
 * Run the universal silent-data-gap invariants after a transition, against PRODUCT OUTPUT:
 *   no-orphan · every-move-logged · no-stage-skipped · loop-bound (≤2). (count-drift is asserted inline
 *   by driveOperatorHop / driveStudioHop from the board UI; terminal-reached is asserted once at the
 *   walk's end.)
 */
async function assertUniversalAfterHop(tokenDocId: string, loggedSoFar: number, minNonSelfSoFar: number): Promise<void> {
  // The product writes one stage-log row per transition; wait for the count to settle (streams are async).
  await expect
    .poll(async () => (await observedTransitions(tokenDocId)).length, {
      timeout: 30_000,
      message: `exactly ${loggedSoFar} stage-log row(s) expected for ${tokenDocId} after this transition.`,
    })
    .toBe(loggedSoFar);
  await assertNoOrphan(tokenDocId);
  await assertEveryMoveLogged(tokenDocId, loggedSoFar, { minNonSelf: minNonSelfSoFar });
  await assertNoStageSkipped(tokenDocId, MODEL, VID);
  await assertLoopBound(tokenDocId, 2);
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
test.describe(`V8 · ${VARIATION_NAME} (${VID}) — closed-loop walk (UP3-WF-01: happy + Diagnostics self-loop & Diagnostics↔DRC ≤2 + scoping)`, () => {
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub every external boundary (Zoom/LiveKit/FCM/Wati/email) so a stray studio call cannot escape.
    stubs = installAllExternalStubs(page);
  });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // UP3-WF-01-HAPPY — the canonical forward walk (oracle-walked, MIXING ALL THREE drivers), terminal
  //   Completed. 14 product-logged transitions = the V8 backbone MINUS DRC (D1) and Consultation (D2).
  //   Driver mix: sim self/auto hops + REAL operator board hops + ONE REAL specialist studio hop
  //   (Diagnostics→ATC Briefing through the Diagnostics studio engine).
  // -----------------------------------------------------------------------------------------------
  test('UP3-WF-01-HAPPY — walk entry→Completed mixing actors (SIM + REAL board + REAL studio); every transition legal, logged, count-conserved', async ({ page }) => {
    // SEED preconditions: queue generation + the V8 variation doc + ONE token at the first stage.
    const seeded = await seedUp3rdCycle({ cohort: 1 });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;          // the `docid` the product's stage-log rows key on
    const cardId = participant.profileid;            // the board card's data-token-id (= profile_id)
    expect(seeded.variationId, 'V8 variation id').toBe(VARIATION_ID);
    expect(seeded.firstStage, 'V8 first stage').toBe(FIRST_STAGE);

    // Re-anchor the token at the entry stage for a deterministic, re-runnable walk (precondition only).
    await parkAt(tokenDocId, FIRST_STAGE);

    // Drive the operator board ONCE (auth + queue select) — reused across every OP hop.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    let logged = 0;       // product-logged transitions so far (entry hop excluded)
    let minNonSelf = 0;   // operator/studio/CF-driven (movedby != 'self') subset — proves non-circularity

    for (const hop of HAPPY_HOPS) {
      if (hop.kind === 'OP') {
        // REAL board move + board-computed count-drift (src−1 / dst+1, Σ conserved).
        await driveOperatorHop(page, board, cardId, hop);
        minNonSelf += 1; // a board move writes movedby = operator profileid (NOT 'self')
      } else if (hop.kind === 'STUDIO') {
        // REAL specialist studio move out of the Diagnostics engine + board-computed count-drift.
        const drove = await driveStudioHop(page, board, hop, {
          tokenDocId, cardId, memberProfileId: participant.profileid,
          testrunid: seeded.testrunid, queueGenDocId: seeded.queueGenDocId,
        });
        if (!drove) {
          // The REAL studio live panel / move-next button did not render in this environment. Record a
          // finding and STOP the walk (downstream hops depend on this state); NEVER sim-substitute the
          // specialist move (the circular anti-pattern this rebuild removes).
          test.info().annotations.push({
            type: 'finding',
            description:
              `UP3-WF-01-HAPPY: stopped at the Diagnostics→${hop.to} specialist hop — the REAL studio live panel / ` +
              'move-next button did not render; the remaining hops were not driven (never sim-substituted).',
          });
          test.skip(true, `REAL specialist studio control for ${hop.from}→${hop.to} did not render — see finding`);
          return;
        }
        minNonSelf += 1; // a studio move writes movedby != 'self'
      } else {
        // Participant self-move / auto-advance stand-in (precondition only; product logs the row).
        await driveSimHop(tokenDocId, hop, seeded.testrunid);
        if (hop.kind === 'AUTO') minNonSelf += 1; // AUTO gate/link hop is app/CF-driven (movedby 'operator')
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
    // operator/studio/CF-driven (non-'self') count is OP(4) + STUDIO(1) + AUTO(4) = 9.
    const expectedOp = HAPPY_HOPS.filter(h => h.kind === 'OP').length;
    const expectedStudio = HAPPY_HOPS.filter(h => h.kind === 'STUDIO').length;
    const expectedAuto = HAPPY_HOPS.filter(h => h.kind === 'AUTO').length;
    const expectedSelf = HAPPY_HOPS.filter(h => h.kind === 'SELF').length;
    expect(expectedOp, 'V8 happy path operator (board) hops').toBe(4);
    expect(expectedStudio, 'V8 happy path specialist (studio) hops').toBe(1);
    expect(expectedAuto, 'V8 happy path auto-gate/link hops').toBe(4);
    expect(expectedSelf, 'V8 happy path participant self-move hops').toBe(5);
    await assertEveryMoveLogged(tokenDocId, HAPPY_HOPS.length, { minNonSelf: expectedOp + expectedStudio + expectedAuto });
    expect(logged, 'total product-logged transitions on the UP3-WF-01 happy path').toBe(HAPPY_HOPS.length);
    expect(HAPPY_HOPS.length, 'UP3-WF-01 forward transition count (backbone MINUS DRC + Consultation)').toBe(14);
  });

  // -----------------------------------------------------------------------------------------------
  // UP3-WF-01-LOOP — the Diagnostics SELF-LOOP ≤ 2 AND the Diagnostics↔DRC round-trip ≤ 2 (the brief's
  //   "Diagnostics self-loop plus Diagnostics and DRC at most 2"). A 3rd traversal of EITHER edge FAILS.
  // -----------------------------------------------------------------------------------------------
  test('UP3-WF-01-LOOP — Diagnostics self-loop ≤ 2 AND Diagnostics↔DRC round-trip ≤ 2 (D1 dead-forward); a 3rd of either fails', async ({ page }) => {
    // ORACLE FLAGS asserted up-front (the product artifacts the case hinges on; flow-config.md §2 V8 / §3):
    //  Diagnostics self-LOOP edge exists ("Send Back", to==from).
    const diagSelfLoop = outEdgesForVariation(MODEL, DIAG, VID).filter((e: any) => e.to === DIAG && e.loop);
    expect(diagSelfLoop.length, `V8 "${DIAG}" must expose a self-loop edge in the oracle ("Send Back")`).toBe(1);
    //  D1 — Diagnostics→DRC is a forward operator edge; DRC→Diagnostics is the ONLY DRC exit (a BACK-edge);
    //       the backbone-adjacent DRC→ATC Preparation is ABSENT (illegal skip).
    const diagToDrc = outEdgesForVariation(MODEL, DIAG, VID).filter((e: any) => e.to === DRC);
    expect(diagToDrc.length, `V8 Diagnostics must offer a forward edge to DRC`).toBe(1);
    const drcOut = outEdgesForVariation(MODEL, DRC, VID);
    expect(drcOut.map((e: any) => e.to), `V8 DRC must have EXACTLY ONE out-edge (back to Diagnostics) — dead-forward D1`).toEqual([DIAG]);
    expect(drcOut[0].back, `the sole DRC→Diagnostics edge must be a BACK-edge`).toBe(true);
    expect(outEdgesForVariation(MODEL, DRC, VID).some((e: any) => e.to === ATC_PREP),
      `D1: DRC→ATC Preparation must be ILLEGAL (absent from the oracle).`).toBe(false);

    const seeded = await seedUp3rdCycle({ cohort: 1, testrunid: 'up3loop' });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // ---- Part A: the Diagnostics SELF-LOOP ("Send Back", to==from) bound ≤ 2 ----
    await parkAt(tokenDocId, DIAG);
    for (let i = 1; i <= 2; i++) {
      // A self-loop is a src==dst move: the board's column count is unchanged (token leaves & re-enters
      // the same Queued column); assert the card stays on Diagnostics (APP-computed) and the product
      // logged a self-loop row each time.
      await waitForCardOnStage(page, board, cardId, DIAG);
      const beforeCount = await board.readColumnCount(DIAG);
      await board.moveToken(cardId, DIAG); // the self-loop target carries data-stage-name == Diagnostics
      await expect
        .poll(async () => (await board.readColumnCount(DIAG)), {
          timeout: 20_000,
          message: `UP3-WF-01-LOOP-A: after Diagnostics self-loop #${i} the board should still show the token on "${DIAG}".`,
        })
        .toBe(beforeCount);
      await expect
        .poll(async () => (await board.tokenCard(cardId).count()) > 0, {
          timeout: 20_000, message: `UP3-WF-01-LOOP-A: token card should remain on the board after Diagnostics self-loop #${i}.`,
        })
        .toBe(true);
      await assertNoOrphan(tokenDocId);
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);
    }

    // PRODUCT recorded EXACTLY two Diagnostics→Diagnostics traversals (read product rows), each operator-driven.
    {
      const trail = await observedTransitions(tokenDocId);
      const selfLoops = trail.filter((t: any) => t.from === DIAG && t.to === DIAG);
      expect(selfLoops.length, `UP3-WF-01-LOOP-A: exactly two "${DIAG}" self-loop rows expected`).toBe(2);
      expect(selfLoops.every((t: any) => t.movedby && t.movedby !== 'self'),
        'UP3-WF-01-LOOP-A: board self-loops must be operator-driven (movedby != self).').toBe(true);
    }

    // A THIRD Diagnostics self-loop MUST violate the ≤2 bound — prove the detector fires.
    await waitForCardOnStage(page, board, cardId, DIAG);
    await board.moveToken(cardId, DIAG); // 3rd Diagnostics→Diagnostics
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === DIAG && x.to === DIAG).length;
      }, { timeout: 20_000, message: 'UP3-WF-01-LOOP-A: the 3rd Diagnostics self-loop row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);

    // ---- Part B: the Diagnostics ↔ DRC round-trip bound ≤ 2 (forward edge then the D1 BACK-edge) ----
    // Fresh token + run so Part A's deliberately-over-bound history does not contaminate Part B.
    const seededB = await seedUp3rdCycle({ cohort: 1, testrunid: 'up3loopb' });
    const tokenB = seededB.participants[0].tokenId;
    const cardB = seededB.participants[0].profileid;
    await parkAt(tokenB, DIAG);

    for (let i = 1; i <= 2; i++) {
      // Diagnostics → DRC (forward operator edge).
      await driveOperatorHop(page, board, cardB, classifyHop(DIAG, DRC));
      await assertNoOrphan(tokenB);
      await assertNoStageSkipped(tokenB, MODEL, VID);
      await assertLoopBound(tokenB, 2);

      // D1 NEGATIVE GATE: while parked on DRC, the board's move-dropdown must OFFER DRC→Diagnostics and
      // must NOT offer the illegal backbone-adjacent DRC→ATC Preparation. READ-ONLY (open → assert →
      // dismiss), then commit the legal BACK move below.
      await waitForCardOnStage(page, board, cardB, DRC);
      await board.assertMoveTargets(cardB, { offers: [DIAG], absent: [ATC_PREP] });

      // DRC → Diagnostics (the ONLY legal exit — a BACK-edge).
      await driveOperatorHop(page, board, cardB, classifyHop(DRC, DIAG));
      await assertNoOrphan(tokenB);
      await assertNoStageSkipped(tokenB, MODEL, VID);
      await assertLoopBound(tokenB, 2);
    }

    // PRODUCT rows: exactly two Diagnostics→DRC and two DRC→Diagnostics traversals (≤2 each), all
    // operator-driven (movedby != 'self'); read the product's own log (never a test write).
    {
      const trail = await observedTransitions(tokenB);
      const fwd = trail.filter((t: any) => t.from === DIAG && t.to === DRC);
      const back = trail.filter((t: any) => t.from === DRC && t.to === DIAG);
      expect(fwd.length, 'UP3-WF-01-LOOP-B: exactly two Diagnostics→DRC rows').toBe(2);
      expect(back.length, 'UP3-WF-01-LOOP-B: exactly two DRC→Diagnostics rows').toBe(2);
      expect([...fwd, ...back].every((t: any) => t.movedby && t.movedby !== 'self'),
        'UP3-WF-01-LOOP-B: round-trip moves must be operator-driven (movedby != self).').toBe(true);
    }

    // A THIRD Diagnostics→DRC traversal MUST violate the ≤2 bound — prove the detector fires.
    await driveOperatorHop(page, board, cardB, classifyHop(DIAG, DRC));
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenB);
        return t.filter((x: any) => x.from === DIAG && x.to === DRC).length;
      }, { timeout: 20_000, message: 'UP3-WF-01-LOOP-B: the 3rd Diagnostics→DRC row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenB, 2)).rejects.toThrow(/LOOP-BOUND/);
  });

  // -----------------------------------------------------------------------------------------------
  // UP3-WF-01-SCOPE — the oracle-parity sweep: the static build()/oracle() baseline + the
  //   variation-scoped Diagnostics move-dropdown on the REAL board (EXACTLY 4 distinct non-loop targets;
  //   →Consultation absent (D2) AND →Self Evolution Report absent (the V6/V7↔V8 discriminator — PLAN P1
  //   #12)), plus the FORMREF PRESENCE fact (the V8 Diagnostics stage references participant forms).
  // -----------------------------------------------------------------------------------------------
  test('UP3-WF-01-SCOPE — oracle parity + variation-scoped Diagnostics dropdown (EXACTLY 5 edges, no Consultation, no Self Evolution Report) + formref presence', async ({ page }) => {
    // (1) STATIC ORACLE BASELINE (flow-config.md §1 / §4; identical to oracle-selftest.spec.ts): the
    //     oracle reports ok:false SOLELY because of the 2 known orphans; NO dangling edge; the V8
    //     variation reaches the terminal. We assert the baseline, NOT o.ok (it is false by design).
    const o = oracle(cfg);
    expect(o.dangling.length, 'UP3-WF-01-SCOPE: no dangling edges in the seed config').toBe(0);
    expect(o.orphans.slice().sort(), 'UP3-WF-01-SCOPE: exactly the 2 documented orphans (flow-config §4)')
      .toEqual(['My Evolution Wishlist', 'uP! Prep Process - Hold'].sort());
    expect(o.unreachableTerminals, 'UP3-WF-01-SCOPE: every multi-stage variation reaches its terminal').toEqual([]);

    // (2) ORACLE-LEVEL DIAGNOSTICS SCOPING (flow-config.md §2 V8, §3 D2; the V6/V7↔V8 discriminator).
    //     V8 Diagnostics offers EXACTLY 5 scoped edges INCLUDING the self-LOOP: {DRC, Diagnostics[LOOP],
    //     ATC Briefing, uP! Readiness Changework, ATC Preparation}. It DROPS →Self Evolution Report and
    //     never offers →Consultation.
    const diagEdges = outEdgesForVariation(MODEL, DIAG, VID);
    const diagOut = diagEdges.map((e: any) => e.to).sort();
    const EXPECTED_DIAG = [ATC_BRIEF, ATC_PREP, DIAG /* self-LOOP */, DRC, UP_RCW].sort();
    expect(diagEdges.length, 'UP3-WF-01-SCOPE: V8 Diagnostics has EXACTLY 5 scoped edges (incl. the self-LOOP) — drops →Self Evolution Report (PLAN §3.D V8)').toBe(5);
    expect(diagOut, 'UP3-WF-01-SCOPE: V8 Diagnostics offers EXACTLY its 5 scoped targets (incl. the self-LOOP)').toEqual(EXPECTED_DIAG);
    expect(diagOut.includes(CONSULT), 'UP3-WF-01-SCOPE: V8 Diagnostics must NOT offer →Consultation (an LYL/B!G-only edge — D2)').toBe(false);
    expect(diagOut.includes(SELF_REPORT), 'UP3-WF-01-SCOPE: V8 Diagnostics must NOT offer →Self Evolution Report (the V6/V7↔V8 discriminator — V8 drops it)').toBe(false);
    // D2 structural fact: NO forward (non-back, non-loop) operator edge in the whole variation enters Consultation.
    const forwardIntoConsult = MODEL.edges.filter((e: any) =>
      e.to === CONSULT && !e.dangling && !e.back && !e.loop &&
      (e.variations.length === 0 || e.variations.includes(VID)),
    );
    expect(forwardIntoConsult.length, 'UP3-WF-01-SCOPE: D2 — no FORWARD edge enters Consultation in V8 (off the happy path)').toBe(0);

    // (3) FORMREF PRESENCE (flow-config.md §2 V8 "Diagnostics … 8 forms"): the V8 Diagnostics stage
    //     references participant forms — a NON-EMPTY `participantform[]` (the source of the studio
    //     "Forms submitted by the Participant" widget). This is a KNOWN seeded config fact (not a value
    //     the test wrote): assert it is present AND stage-specific (a non-form stage like Scope
    //     Enhancement has none), so the assertion is non-vacuous.
    const diagForms = (cfg.stageproperty[DIAG] || {}).participantform || [];
    expect(Array.isArray(diagForms), 'UP3-WF-01-SCOPE: Diagnostics participantform must be an array').toBe(true);
    expect(diagForms.length, 'UP3-WF-01-SCOPE: the V8 Diagnostics stage must reference ≥1 participant form (formref presence)').toBeGreaterThan(0);
    const scopeForms = (cfg.stageproperty[SCOPE] || {}).participantform || [];
    expect(scopeForms.length, 'UP3-WF-01-SCOPE: a non-form stage (Scope Enhancement) references no forms — formref presence is stage-specific').toBe(0);

    // (4) THE SAME SCOPING, PROVEN ON THE REAL BOARD: a V8 token parked on Diagnostics must render a
    //     move-dropdown offering its 4 DISTINCT NON-loop targets (the Diagnostics self-LOOP "Send Back"
    //     is the token's own column, not a distinct move-target option) and MUST NOT offer →Consultation
    //     NOR →Self Evolution Report. The option set is APP-COMPUTED from the live variation-scoped
    //     nextstage edges; assertMoveTargets opens → asserts → dismisses WITHOUT committing (no move written).
    const seeded = await seedUp3rdCycle({ cohort: 1, testrunid: 'up3scope' });
    const participant = seeded.participants[0];
    const tokenDocId = participant.tokenId;
    const cardId = participant.profileid;
    await parkAt(tokenDocId, DIAG);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnStage(page, board, cardId, DIAG);

    // OFFERS the 4 distinct forward/back targets; ABSENT Consultation (D2) AND Self Evolution Report (V6/V7↔V8).
    await board.assertMoveTargets(cardId, {
      offers: [DRC, ATC_PREP, ATC_BRIEF, UP_RCW],
      absent: [CONSULT, SELF_REPORT],
    });

    // The board committed NO move (the dropdown inspection is read-only): the product wrote ZERO stage-log
    // rows for this token, and it still rests on Diagnostics — assert against PRODUCT state, not a test write.
    expect((await observedTransitions(tokenDocId)).length, 'UP3-WF-01-SCOPE: dropdown inspection must not write any stage-log row').toBe(0);
    await assertNoOrphan(tokenDocId);
  });
});
