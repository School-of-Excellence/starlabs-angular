// @ts-nocheck
/**
 * up-3rd-cycle.spec.ts — V8 · uP! - 3rd Cycle closed-loop variation walk + 72-journey expansion.
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
 *     • the SPECIALIST studio stage (Scope Enhancement, the studio engine — studiowidgets + compulsory
 *       activity) is advanced through the REAL Dynamic Studio UI (StudioPage.moveNext → the product's
 *       `moveStage`), and we re-read the operator board to assert the board recomputed the counts;
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
 *   forward happy path (D2): no forward operator edge enters it. This drops V8's distinct FORWARD journey
 *   count to 8 (V7 has 9): V8 lacks the V7 journey that exits Diagnostics directly to Self Evolution
 *   Report. The 72-journey expansion at the bottom walks ALL 8 entry→terminal.
 *
 * ⚠ THE VARIATION-ID NAMESPACE PRECONDITION (the move-dropdown scoped-edge bug the brief flagged —
 *   CONFIRMED on the live emulator + in source, identical to the V7/V2 twins):
 *     • seed-test-project.js `seedQueueAndVariations` writes the `queue variation` DOC id as
 *       `${testrunid}_${rawId}` (seed-test-project.js:425), and the board/studio key their variation maps
 *       by that DOC id (board `mapVariation[document.id]`; studio `queueVariation[doc.id]`). The seeded
 *       queue's nextstage `variations` are ALSO rewritten to the prefixed ids (seed-test-project.js:270).
 *     • BUT `seedParticipantToken` writes the TOKEN's `variationid` as the RAW id
 *       (seed-test-project.js:510). So `mapVariation[token.variationid]` / `queueVariation[token.variationid]`
 *       MISS (raw key ≠ prefixed doc id) ⇒ the board move-dropdown's `checkAvailablestages` renders ZERO
 *       targets (the board cannot scope the token to its variation stage list) and the studio move-next
 *       button — gated on `queueVariation[token.variationid] && config.variations.includes(token.variationid)`
 *       (dynamic-studio.component.html:527, where `config.variations` carry the PREFIXED ids) — never
 *       renders. Both real-UI hops become undrivable; on a crowded board the card may not even bucket into
 *       a stage column.
 *   FIX (PRECONDITION, in our owned spec only): set the walked token's `variationid` to the PREFIXED form
 *   (`PREFIXED_VARIATION_ID`) so it matches the doc id the board/studio loaded. The ORACLE assertions are
 *   UNAFFECTED — they take the RAW `VARIATION_ID` as an explicit arg (outEdgesForVariation /
 *   assertNoStageSkipped / assertTerminalReached), never reading `token.variationid`. The ROOT fix belongs
 *   in the shared seeder (`seedParticipantToken` should write the prefixed id) and is RETURNED as a
 *   seedRequest — this local override unblocks THIS spec now.
 *
 * VARIATION-SPECIFIC (the ref / flow-config.md §5 "V4/V5/V6/V8" + §2 V8 + §3 D1+D2):
 *   UP3-WF-01-HAPPY — the canonical forward walk: the V8 backbone MINUS the two off-forward stages
 *                     (Consultation [19] D2, DRC [16] D1), routed Diagnostics→ATC Briefing→Self Evolution
 *                     Report→Completed. The Scope Enhancement→Evolution Mapping Activity next-cycle hop is
 *                     driven by the REAL SPECIALIST STUDIO (the studio engine stage), the Diagnostics-and-
 *                     down operator hops by the REAL board, the self/auto hops by the sim — actor mixing.
 *                     Every adjacency is a single legal scoped edge (asserted by classifyHop / legalEdge).
 *   UP3-WF-01-LOOP  — the Diagnostics SELF-LOOP ("Send Back", to==from) ≤ 2 AND the Diagnostics↔DRC
 *                     round-trip ≤ 2 (forward Diagnostics→DRC then the D1 BACK-edge DRC→Diagnostics),
 *                     WITH the D1 negative gate (DRC's ONLY oracle exit is →Diagnostics, never →ATC
 *                     Preparation). A 3rd traversal of EITHER edge FAILS LOOP-BOUND (TEST-THE-TEST; PLAN
 *                     risk 13). All driven on the REAL board.
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
 *   - e2e/lib/forward-journeys.js (forwardJourneys) — the FINITE forward-journey enumerator (8 for V8).
 *   - e2e/lib/assertions.ts — the six universal invariants (read product output, not test writes).
 *   - e2e/lib/participant-sim.js (advance/currentStage/db) — self-move stand-in + allowlist-pinned handle.
 *   - e2e/fixtures/variation-seeds/up-3rd-cycle.ts (+ _common.ts) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts — REAL operator board moves + board-computed counts.
 *   - e2e/queue/pages/studio.page.ts — REAL specialist studio move-next (the Scope Enhancement engine stage).
 *   - e2e/queue/support/{auth,console-guard,actors,delivery-status-spy,firestore-admin}.ts; e2e/queue/stubs
 *     (external boundaries); e2e/queue/recon/testids.md (OPERATOR + STUDIO surfaces, PRE-EXISTING
 *     data-token-id / data-stage-name). No selector is invented (the page objects own them).
 */
import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator } from '../support/auth';
import { TESTRUNID, QUEUE_NAME } from '../support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { installDeliveryStatusSpy, waitForDeliveryStatusCalls } from '../support/delivery-status-spy';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { getDoc } from '../support/firestore-admin';
import { seedUp3rdCycle, VARIATION_ID, VARIATION_NAME, FIRST_STAGE } from '../../fixtures/variation-seeds/up-3rd-cycle';

// CommonJS libs (lib/* are plain CommonJS — require like the sibling specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, oracle, outEdgesForVariation } = require('../../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forwardJourneys } = require('../../lib/forward-journeys');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  observedTransitions,
  readLogRows,
} = require('../../lib/assertions');

/** The flow-model graph, built ONCE from the seeded config (cheap, reused). The ORACLE authority. */
const MODEL = build(cfg);
const VID = VARIATION_ID; // XmCS5togakPzWjfQvEe3 (the RAW id the oracle is keyed on)
const TERMINAL = 'Completed';

/**
 * The PREFIXED variation id the board + studio key by (see the NAMESPACE PRECONDITION header). Every
 * precondition write below sets `token.variationid = PREFIXED_VARIATION_ID` so the REAL board move-
 * dropdown + studio move-next button resolve their variation-scoped stage lists. The oracle calls keep
 * using the RAW `VID`.
 */
const PREFIXED_VARIATION_ID = `${TESTRUNID}_${VARIATION_ID}`;

/** The seeded specialist we act as in the REAL studio (member of the Scope Enhancement pairing). */
const SPECIALIST_PROFILE_ID = `${TESTRUNID}_pf_specialist_0`;
/** The specialist email the PeopleInvolved confirm dialog selects on every board move (seeded staff). */
const SPECIALIST_EMAIL = `specialist0+${TESTRUNID}@example.com`;
/** Deterministic precondition doc ids for the Scope Enhancement live session this spec seeds. */
const SE_PAIRING_ID = `${TESTRUNID}_pair_se_${VARIATION_ID.slice(0, 6)}`;
const SE_LIVE_ASSIGNMENT_ID = `${TESTRUNID}_la_se_${VARIATION_ID.slice(0, 6)}`;
/**
 * The Scope Enhancement compulsory-activity id (sample-queue-config.json `stageproperty['Scope
 * Enhancement'].compulsoryactivity['0'] == ['SBDo3ww3ZxKrKjkfIzLU']`). The studio's `onStudioSelect`
 * builds `studioStage` by matching `Object.values(participantsactivity).sort().join(',')` against each
 * stage's compulsoryactivity combos (dynamic-studio.ts:645-671); pinning the pairing's
 * `participantsactivity` to `{ [specialist]: SCOPE_ENHANCEMENT_ACTIVITY }` makes that join-string equal
 * the Scope Enhancement combo[0] — so Scope Enhancement enters `studioStage`, the live token query runs
 * (ts:695, `currentstage in studioStage`), the live panel hydrates, and the move-next button renders.
 * It ALSO supplies the value the studio-select button template dereferences as
 * `studio['participantsactivity'][participant]` (dynamic-studio.html:50) — without this key that read is
 * `undefined[participant]` and the whole studio button list CRASHES (the known html:50 null-guard
 * finding); seeding a real activity map is the correct PRECONDITION, not a workaround for the crash.
 */
const SCOPE_ENHANCEMENT_ACTIVITY = 'SBDo3ww3ZxKrKjkfIzLU';

// Stage-name constants used across the walk / loop / scope cases (avoid typos; one place to edit).
const ENTRY = 'Evolution Prep Orientation';
const SCOPE = 'Scope Enhancement';
const NEXT_CYCLE_TARGET = 'Evolution Mapping Activity';
const LINK_STAGE = 'In Evolution Mapping Activity';
const DIAG = 'Diagnostics';
const DRC = 'Diagnostics Readiness Changework';
const ATC_PREP = 'ATC Preparation';
const ATC_BRIEF = 'ATC Briefing';
const CONSULT = 'Consultation';
const UP_RCW = 'uP! Readiness Changework';
const REVIEW = 'Review';
const SELF_REPORT = 'Self Evolution Report';

// =================================================================================================
// Oracle helpers (legal-edge lookups — the AUTHORITY is outEdgesForVariation, not the backbone).
// =================================================================================================
/**
 * The classification of one transition on the walk, derived from the ORACLE (flow-config authority),
 * NOT the backbone array. `kind`:
 *   - 'OP'    : operator `nextstage` edge → driven through the REAL board (QueueBoardPage.moveToken),
 *               count-drift asserted from the board's recomputed counts. movedby != 'self'.
 *   - 'STUDIO': an operator `nextstage` edge OUT OF the studio engine (Scope Enhancement), driven through
 *               the REAL specialist Dynamic Studio UI (StudioPage.moveNext → moveStage). movedby != 'self'.
 *   - 'SELF'  : participant self-move on form/videoask submit (selfmv) → participant-sim stand-in (by:'self').
 *   - 'AUTO'  : non-self-movable gate/link auto-advance (no scoped button) → participant-sim stand-in
 *               (by:'operator' — an app/CF-driven hop, NOT a participant self-write).
 * `studio` (optional) overrides the oracle-derived kind to drive the hop through the REAL studio even
 * though the underlying edge is an operator `next` edge (used for the Scope Enhancement engine hop).
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

/** Assert `from → to` is a legal scoped edge per the oracle, returning its descriptor (fails loud if not). */
function legalEdge(from: string, to: string): any {
  const edge = outEdgesForVariation(MODEL, from, VID).find((e: any) => e.to === to);
  expect(
    edge,
    `[oracle] move "${from}" → "${to}" is NOT a legal scoped edge for ${VARIATION_NAME}. Legal out-edges: ` +
      JSON.stringify(
        outEdgesForVariation(MODEL, from, VID).map(
          (e: any) => `${e.to}[${e.type}${e.loop ? ',loop' : ''}${e.back ? ',back' : ''}]`,
        ),
      ),
  ).toBeTruthy();
  return edge;
}

/** A board move-dropdown target name for a stage: split (compulsory-activity) stages render as
 *  "<name> (Queued)"; simple stages render as the bare name (component ts:2796-2821 + html:1238).
 *  A seeded/operator-moved token enters a compulsory-activity stage in its Queued sub-column. */
function boardTargetName(stage: string): string {
  const p = cfg.stageproperty[stage] || {};
  const isSplit = !!p.compulsoryactivity && Object.keys(p.compulsoryactivity).length > 0;
  return isSplit ? `${stage} (Queued)` : stage;
}

/**
 * The UP3-WF-01 HAPPY forward stage sequence — the V8 backbone walked through the ORACLE, MINUS the two
 * stages that are off the forward happy path for this variation (flow-config.md §2 V8 / §3):
 *   • Diagnostics Readiness Changework [16] — DEAD-FORWARD (D1): its only exit is the BACK-edge.
 *   • Consultation [19] — OFF the forward path in the uP!/Prodigies family (D2): no forward edge enters it.
 * The operator decision at Diagnostics is routed to ATC Briefing (the uP!-family forward branch), then
 * ATC Briefing→Self Evolution Report→Completed (NOT →Consultation — the uP!-family branch set). Every
 * adjacency below is a single legal scoped edge (asserted by classifyHop).
 */
const HAPPY_PATH: string[] = [
  'Evolution Prep Orientation',          // [0]  AUTO  →
  'Accelerated Evolution Level Form',    // [2]  SELF  →
  'uP! Life Report',                     // [7]  SELF  →
  'Scope Enhancement',                   // [8]  STUDIO→  (studio engine; SPECIALIST drives moveStage → Evolution Mapping Activity)
  'Evolution Mapping Activity',          // [9]  AUTO  →
  'In Evolution Mapping Activity',       // [10] AUTO  →  (link stage — non-self-movable auto gate)
  'Self Evaluation Form',                // [11] SELF  →
  'Guided Self ATC',                     // [13] SELF  →
  'Ready for Diagnostics',               // [14] AUTO  →
  'Diagnostics',                         // [15] OP    →  (central hub; operator routes forward on the board)
  'ATC Briefing',                        // [18] OP    →
  'Self Evolution Report',               // [28] SELF  →  (NO uP!RCW/Review loop — the short uP!-family branch)
  'Completed',                           // [29] TERMINAL
];
// 13 stages ⇒ 12 forward transitions. The PLAN's headline counts the full V8 backbone (which lists DRC
// [16] and Consultation [19]); the oracle-legal FORWARD walk omits both (D1 + D2), and the canonical
// HAPPY takes the short ATC Briefing→Self Evolution Report branch (the uP!RCW→Review detour is exercised
// by the journey expansion), so the product logs exactly the 12 moves asserted below.

/**
 * Pre-compute & oracle-validate the HAPPY hops once (fails fast on any illegal adjacency). The Scope
 * Enhancement→Evolution Mapping Activity hop is flagged `studio:true` so it is driven through the REAL
 * specialist studio (the Scope Enhancement engine), exercising the studio surface as the brief requires.
 */
const HAPPY_HOPS: Hop[] = HAPPY_PATH.slice(0, -1).map((from, i) =>
  classifyHop(from, HAPPY_PATH[i + 1], { studio: from === SCOPE }),
);

// =================================================================================================
// Shared helpers — board readiness + per-hop drivers (REAL board for OP, REAL studio for STUDIO,
// sim stand-in for SELF/AUTO). All precondition writes pin the PREFIXED variationid (namespace fix).
// =================================================================================================

/**
 * Park `tokenDocId` on `stage` with a clean (re-runnable) state and the PREFIXED variationid (so the
 * board/studio can scope the token), and purge its prior `queue stage log` rows so per-transition
 * log-count invariants count THIS run's moves only. PRECONDITION (stands in for the participant having
 * reached the stage; mirrors the V7 sibling resetTokenForWalk) — never an assertion target.
 */
async function parkAt(tokenDocId: string, stage: string): Promise<void> {
  const db = sim.db();
  await db.collection('queue_token').doc(tokenDocId).set(
    {
      variationid: PREFIXED_VARIATION_ID, // namespace fix — board move-dropdown + studio move-next gate
      currentstage: stage,
      previousstage: null,
      status: 'queued',
      stagestatus: 'Yet to Start',
      tokenstatus: 'Active',
      delete: false,
      liveassignmentid: null,
      studioid: null,
      manuallymoved: false,
    },
    { merge: true },
  );
  const prior = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
  await Promise.all(prior.docs.map((d: any) => d.ref.delete()));
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
 * per-STAGE count-drift (src−1 / dst+1, Σ conserved). Reads the board-computed `before` snapshot
 * (aggregated by stage NAME so a split stage's sub-columns sum to one total), drives the real move-
 * dropdown + PeopleInvolved confirm, then polls the board-computed `after` snapshot. The numbers are the
 * APP's, captured before vs after the product's own move — never written by the test.
 */
async function driveOperatorHop(
  page: Page,
  board: QueueBoardPage,
  cardId: string,
  hop: Hop,
): Promise<void> {
  await waitForCardOnStage(page, board, cardId, hop.from);

  // BEFORE: per-stage-NAME counts the board re-rendered (APP-computed from the live stream).
  const before = await readCountsByStageName(board);
  expect(before[hop.from], `count-drift: board must render a count for source stage "${hop.from}" before ${hop.from}→${hop.to}`).toBeGreaterThanOrEqual(1);

  // REAL operator move: open this token's dropdown, click the scoped target (split stages render as
  // "<name> (Queued)"), confirm PeopleInvolved (pick the seeded specialist).
  await board.moveToken(cardId, boardTargetName(hop.to), { specialist: SPECIALIST_EMAIL });

  // AFTER: poll until the board re-rendered src−1 (collectionData is async). assertCountConserved then
  // enforces dst+1, Σ conserved, and that ONLY src/dst moved (against the SAME-shaped board snapshot).
  const after = await pollColumnCounts(board, hop.from, before[hop.from] - 1);
  assertCountConserved(before, after, { src: hop.from, dst: hop.to });
}

/**
 * Drive ONE participant self-move / auto-advance transition via the documented simulator stand-in.
 * `SELF` → movedby 'self' (participant form submit); `AUTO` → movedby 'operator' (an app/CF-driven gate
 * /link hop, NOT a participant self-write). This is a PRECONDITION/self-move stand-in only (brief): the
 * spec still asserts the PRODUCT's log row via the universal invariants, never this written value directly.
 */
async function driveSimHop(tokenDocId: string, hop: Hop): Promise<void> {
  const by = hop.kind === 'SELF' ? 'self' : 'operator';
  await sim.advance(tokenDocId, hop.to, { by, testrunid: TESTRUNID });
}

/**
 * Wire the walked token into a LIVE Scope Enhancement studio session as a PRECONDITION so the real
 * specialist studio mounts the live panel + renders the move-next button for this token. Mirrors the
 * documented §3a link used by the V7 sibling (preconditions only): a `queue studio pairing` (the acting
 * specialist is a participant) + a `live assignment` (status:'live', stagename:Scope Enhancement) + the
 * token's liveassignmentid/studioid/status:'instudio'. NEVER asserted as output — the spec asserts the
 * stage-log row the studio MOVE writes, not these seeded values.
 */
async function linkTokenIntoScopeEnhancementStudio(tokenDocId: string, queueGenDocId: string): Promise<void> {
  const db = sim.db();
  const tokSnap = await db.collection('queue_token').doc(tokenDocId).get();
  const tok = tokSnap.data() || {};
  const queueref = tok.queueref || null;

  await db.collection('queue studio pairing').doc(SE_PAIRING_ID).set(
    {
      docid: SE_PAIRING_ID,
      participants: [SPECIALIST_PROFILE_ID],
      // participantsactivity is REQUIRED by the studio: (a) the studio-select button template reads
      // `studio['participantsactivity'][participant]` with NO null-guard (dynamic-studio.html:50) — an
      // absent map crashes the whole button list (the known html:50 finding); (b) onStudioSelect builds
      // `studioStage` only from stages whose compulsoryactivity combo join-equals
      // Object.values(participantsactivity).sort().join(',') (ts:645-671). Pinning the Scope Enhancement
      // activity makes that string match Scope Enhancement's combo[0] so the stage is eligible and the
      // live token query runs. This is the real pairing shape (every assignStudio write carries it,
      // ts:3151) — a PRECONDITION, never asserted.
      participantsactivity: { [SPECIALIST_PROFILE_ID]: SCOPE_ENHANCEMENT_ACTIVITY },
      atcmodel: null, // short-circuits the waiting-list eligibility filter before it touches productref (ts:808)
      studioin: true,
      checkin: true,
      status: 'live',
      openvidu: false,
      queueref,
      _testdata: true,
      testrunid: TESTRUNID,
    },
    { merge: true },
  );
  await db.collection('live assignment').doc(SE_LIVE_ASSIGNMENT_ID).set(
    {
      docid: SE_LIVE_ASSIGNMENT_ID,
      studioid: SE_PAIRING_ID,
      stagename: SCOPE,
      participantid: tok.profile_id,
      status: 'live',
      pairing: [SPECIALIST_PROFILE_ID],
      // queueid MUST be the queue-generation DOC ID string (NOT a DocumentReference): the studio's
      // live-assignment stream queries `where("queueid","==", ongoingQueue["docid"])` (dynamic-studio.ts:516)
      // and `ongoingQueue.docid` is the queue-gen doc id string. A ref here would never match (fake-data.js:181).
      queueid: queueGenDocId,
      _testdata: true,
      testrunid: TESTRUNID,
    },
    { merge: true },
  );
  await db.collection('queue_token').doc(tokenDocId).set(
    {
      variationid: PREFIXED_VARIATION_ID, // namespace fix — studio move-next button gate (html:527)
      currentstage: SCOPE,
      previousstage: SCOPE,
      // The live token query filters `stagestatus == "Approved"` AND `tokenstatus == "Active"`
      // (dynamic-studio.ts:695); without Approved the in-studio token is invisible to the panel.
      stagestatus: 'Approved',
      tokenstatus: 'Active',
      status: 'instudio',
      liveassignmentid: SE_LIVE_ASSIGNMENT_ID,
      studioid: SE_PAIRING_ID,
    },
    { merge: true },
  );
}

/** Detach the token from the studio session after the specialist moves it out, so the operator board
 *  buckets it into the next stage's Queued sub-column (a normal queued token). Precondition cleanup. */
async function detachTokenFromStudio(tokenDocId: string, landedStage: string): Promise<void> {
  await sim.db().collection('queue_token').doc(tokenDocId).set(
    { status: 'queued', liveassignmentid: null, studioid: null, currentstage: landedStage },
    { merge: true },
  );
}

/**
 * Drive ONE specialist (`STUDIO`) transition OUT of the Scope Enhancement studio engine through the REAL
 * Dynamic Studio UI, asserting the operator board's recomputed counts around the move.
 *
 * Returns true if the REAL studio move was performed; false if the live panel / move-next button could
 * not render in this environment (the caller records a finding + stops the walk — the sim is NEVER
 * substituted for the specialist move, which would be the circular anti-pattern this rebuild removes).
 */
async function driveStudioHop(
  page: Page,
  board: QueueBoardPage,
  hop: Hop,
  ctx: { tokenDocId: string; cardId: string; queueGenDocId: string },
): Promise<boolean> {
  await waitForCardOnStage(page, board, ctx.cardId, hop.from);
  const before = await readCountsByStageName(board);
  expect(before[hop.from], `count-drift: board must render a count for source stage "${hop.from}" before the studio ${hop.from}→${hop.to}`).toBeGreaterThanOrEqual(1);

  const moved = await tryStudioMove(page, hop, ctx);
  if (!moved) return false;

  // Wait for the studio move to advance the token (it writes the stage-log + advances currentstage).
  await expect
    .poll(async () => (await getDoc('queue_token', ctx.tokenDocId))?.currentstage, {
      timeout: 30_000, message: `token ${ctx.tokenDocId} did not advance to "${hop.to}" via the REAL studio move.`,
    })
    .toBe(hop.to);
  await detachTokenFromStudio(ctx.tokenDocId, hop.to);

  // Re-focus the operator board (the studio move happened on /dynamicstudio) so its stream re-renders.
  // NO re-login here: the operator session established by the caller persists across the
  // /dynamicstudio→/dynamicqueuemanager navigation (the shared `loginAs` never logged us out, and re-
  // calling it while authed hangs on the absent login form). board.selectQueue → open() navigates back to
  // the board via page.goto and re-subscribes the queue_token stream — exactly the V7 sibling's pattern
  // (up-next-cycle.spec.ts:512-514 re-focuses the board with selectQueue and no second login).
  await board.selectQueue(QUEUE_NAME);
  const after = await pollColumnCounts(board, hop.from, before[hop.from] - 1);
  assertCountConserved(before, after, { src: hop.from, dst: hop.to });
  return true;
}

/**
 * Wire the in-studio link as a PRECONDITION and drive the REAL specialist move-next for `hop.to`.
 * Mirrors the V7 sibling tryStudioMove (the established pattern): act as the seeded member via the
 * `?profileid=` studio override hook (studio.md CRITICAL TEST HOOK), select the studio, and click the
 * REAL move-next button. Returns false when the live panel / move-next button cannot render.
 */
async function tryStudioMove(
  page: Page,
  hop: Hop,
  ctx: { tokenDocId: string; queueGenDocId: string },
): Promise<boolean> {
  // PRECONDITION wiring (allowed — preconditions only; the spec asserts the PRODUCT's output from the
  // REAL moveStage, never these seeded values).
  await linkTokenIntoScopeEnhancementStudio(ctx.tokenDocId, ctx.queueGenDocId);

  // Act as the seeded studio member WITHOUT any mid-test login (mirrors the V7 sibling exactly —
  // up-next-cycle.spec.ts:494-498, which logs in ONCE per test then only navigates via page objects). The
  // caller (UP3-WF-01-HAPPY) is ALREADY signed in as the operator, and the shared `loginAs` does NOT log
  // out — so re-invoking ANY login helper here (loginAsSpecialist OR loginAsOperator) makes `page.goto('/')`
  // redirect off /login (the operator is still authed) and `loginAs` then hangs forever on the absent email
  // input — the observed 240s cloud timeout. Instead we keep the persistent operator session and just
  // navigate to the studio: the seeded `dashboard` route-config grants /dynamicstudio to ALL staff roles
  // (seed-test-project.js:409-411 `allRoles`), so the operator's `admin` role admits the route, and the
  // `?profileid` hook (dynamic-studio.component.ts:160,171) makes the page ACT as the seeded Scope
  // Enhancement specialist for this token's live session.
  const studio = new StudioPage(page);
  await studio.load(SPECIALIST_PROFILE_ID);

  // The seeded pairing renders one studio button for this member; if it never renders the live panel
  // cannot mount → report inability to drive the REAL move (never sim-substitute).
  const hasButton = await pollNonThrow(async () => (await studio.studioButtonCount()) > 0, 30_000);
  if (!hasButton) return false;
  await studio.selectStudio({ studioId: SE_PAIRING_ID });

  // The live panel must mount (the live participant name renders) for the move-next button to appear.
  const panelMounted = await studio.liveParticipantName.isVisible({ timeout: 30_000 }).catch(() => false);
  if (!panelMounted) return false;

  // The move-next button for the target stage renders only when the variation includes the stage AND the
  // token carries the PREFIXED variationid (html:527 gate). If absent, we cannot drive the REAL move.
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
 *   walk's end.) `loggedSoFar` settles first (streams are async) before the trail-only checks.
 */
async function assertUniversalAfterHop(tokenDocId: string, loggedSoFar: number, minNonSelfSoFar: number): Promise<void> {
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
  let tokenDocId: string;
  let cardId: string;
  let queueGenDocId: string;

  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    // Guarantee the V8 preconditions for THIS run via the per-variation seed builder (idempotent):
    // staff auth chain + queue generation + the V8 `queue variation` doc + 1 token at the first stage.
    const seeded = await seedUp3rdCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId, 'seed must target the V8 uP!-3rd variation id').toBe(VARIATION_ID);
    expect(seeded.firstStage, 'seed must start the token on the V8 first stage').toBe(FIRST_STAGE);
    // Sanity: the seeded queue's display name is the one the operator board selects (actors.QUEUE_NAME).
    expect(seeded.queueName, 'seed queueName must equal the board QUEUE_NAME so selectQueue picks it').toBe(QUEUE_NAME);
    tokenDocId = seeded.tokenIds[0];               // the `docid` the product's stage-log rows key on
    cardId = seeded.profileIds[0];                 // the board card's data-token-id (= profile_id)
    queueGenDocId = seeded.queueGenDocId;          // the queue-gen doc id string the studio LA stream matches on
    expect(queueGenDocId, 'seed must expose the queue generation doc id').toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub every external boundary (Zoom/LiveKit/FCM/Wati/email) so a stray studio call cannot escape.
    stubs = installAllExternalStubs(page);
    expect(stubs).toBeTruthy();
  });
  test.afterEach(() => { assertNoFatal(guard); });

  // -----------------------------------------------------------------------------------------------
  // UP3-WF-01-HAPPY — the canonical forward walk (oracle-walked, MIXING ALL THREE drivers), terminal
  //   Completed. 12 product-logged transitions = the V8 backbone MINUS DRC (D1) and Consultation (D2),
  //   on the short ATC Briefing→Self Evolution Report branch. Driver mix: sim self/auto hops + REAL
  //   operator board hops + ONE REAL specialist studio hop (Scope Enhancement→Evolution Mapping Activity).
  // -----------------------------------------------------------------------------------------------
  test('UP3-WF-01-HAPPY — walk entry→Completed mixing actors (SIM + REAL board + REAL studio); every transition legal, logged, count-conserved', async ({ page }) => {
    // Re-anchor the token at the entry stage for a deterministic, re-runnable walk (precondition only).
    await parkAt(tokenDocId, FIRST_STAGE);

    // Drive the operator board ONCE (auth + queue select) — reused across every OP hop.
    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await installDeliveryStatusSpy(page); // dev-global wrap; only the final Completed move asserts it fired.

    let logged = 0;       // product-logged transitions so far (entry hop excluded)
    let minNonSelf = 0;   // operator/studio/CF-driven (movedby != 'self') subset — proves non-circularity

    for (const hop of HAPPY_HOPS) {
      if (hop.kind === 'OP') {
        // REAL board move + board-computed per-stage count-drift (src−1 / dst+1, Σ conserved).
        await driveOperatorHop(page, board, cardId, hop);
        minNonSelf += 1; // a board move writes movedby = operator profileid (NOT 'self')
      } else if (hop.kind === 'STUDIO') {
        // REAL specialist studio move out of the Scope Enhancement engine + board-computed count-drift.
        const drove = await driveStudioHop(page, board, hop, { tokenDocId, cardId, queueGenDocId });
        if (!drove) {
          // The REAL studio live panel / move-next button did not render in this environment. Record a
          // finding and STOP the walk (downstream hops depend on this state); NEVER sim-substitute the
          // specialist move (the circular anti-pattern this rebuild removes).
          test.info().annotations.push({
            type: 'finding',
            description:
              `UP3-WF-01-HAPPY: stopped at the Scope Enhancement→${hop.to} specialist hop — the REAL studio live ` +
              'panel / move-next button did not render; the remaining hops were not driven (never sim-substituted).',
          });
          test.skip(true, `REAL specialist studio control for ${hop.from}→${hop.to} did not render — see finding`);
          return;
        }
        minNonSelf += 1; // a studio move writes movedby != 'self'
      } else {
        // Participant self-move / auto-advance stand-in (precondition only; product logs the row).
        await driveSimHop(tokenDocId, hop);
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

    // The forward walk reached the terminal WITHOUT ever visiting Consultation (V8 off-path fact, D2).
    const trail = await observedTransitions(tokenDocId);
    expect(
      trail.some((t: any) => t.to === CONSULT || t.from === CONSULT),
      'V8: the forward walk must reach Completed WITHOUT visiting Consultation (it is off the happy path)',
    ).toBe(false);

    // updateDeliveryStatus ON FINAL — the operator's move into the LAST column fires
    // guard.updateDeliveryStatus("queue_token/{docid}","completed",{eventRequestRef}) — BUT the final hop
    // here (Self Evolution Report→Completed) is a SELF-MOVE (selfmove edge, the participant submit), driven
    // by the sim stand-in, which does NOT route through the board's updateDeliveryStatus call. So we do NOT
    // assert the spy here (it is asserted in the journey expansion where the terminal hop is an operator
    // board move). The product still logged the terminal transition (asserted above).

    // Final EVERY-MOVE-LOGGED tally: exactly the 12 product-logged forward transitions, of which the
    // operator/studio/CF-driven (non-'self') count is OP(2) + STUDIO(1) + AUTO(4) = 7.
    const expectedOp = HAPPY_HOPS.filter(h => h.kind === 'OP').length;
    const expectedStudio = HAPPY_HOPS.filter(h => h.kind === 'STUDIO').length;
    const expectedAuto = HAPPY_HOPS.filter(h => h.kind === 'AUTO').length;
    const expectedSelf = HAPPY_HOPS.filter(h => h.kind === 'SELF').length;
    expect(expectedOp, 'V8 happy path operator (board) hops').toBe(2);
    expect(expectedStudio, 'V8 happy path specialist (studio) hops').toBe(1);
    expect(expectedAuto, 'V8 happy path auto-gate/link hops').toBe(4);
    expect(expectedSelf, 'V8 happy path participant self-move hops').toBe(5);
    await assertEveryMoveLogged(tokenDocId, HAPPY_HOPS.length, { minNonSelf: expectedOp + expectedStudio + expectedAuto });
    expect(logged, 'total product-logged transitions on the UP3-WF-01 happy path').toBe(HAPPY_HOPS.length);
    expect(HAPPY_HOPS.length, 'UP3-WF-01 forward transition count (backbone MINUS DRC + Consultation, short branch)').toBe(12);
  });

  // -----------------------------------------------------------------------------------------------
  // UP3-WF-01-LOOP — the Diagnostics SELF-LOOP ≤ 2 AND the Diagnostics↔DRC round-trip ≤ 2 (the brief's
  //   "Diagnostics self-loop plus Diagnostics and DRC at most 2"). A 3rd traversal of EITHER edge FAILS.
  //   All driven on the REAL board.
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

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // ---- Part A: the Diagnostics SELF-LOOP ("Send Back", to==from) bound ≤ 2 ----
    // Park the SHARED walked token on Diagnostics with a clean trail (serial suite — reuse one token).
    await parkAt(tokenDocId, DIAG);
    for (let i = 1; i <= 2; i++) {
      // A self-loop is a src==dst move: the board EXCLUDES the token's own (Queued) sub-column from the
      // dropdown, so the "Send Back" commits onto a sibling bucket of the SAME stage (bare currentstage
      // stays Diagnostics). Per-column drift does NOT hold; assert (i) the stage-level total is unchanged
      // AND (ii) the WHOLE board Σ is conserved, plus the LOOP-BOUND trail.
      await waitForCardOnStage(page, board, cardId, DIAG);
      const beforeByName = await readCountsByStageName(board);
      expect(beforeByName[DIAG], `board must render a Diagnostics total before self-loop #${i}`).toBeGreaterThanOrEqual(1);
      await board.moveToken(cardId, DIAG, { specialist: SPECIALIST_EMAIL }); // the self-loop "Send Back" target
      // Wait for the product to record the self-loop row, then assert stage-total + whole-board Σ conserved.
      await expect
        .poll(async () => {
          const t = await observedTransitions(tokenDocId);
          return t.filter((x: any) => x.from === DIAG && x.to === DIAG).length;
        }, { timeout: 20_000, message: `UP3-WF-01-LOOP-A: the product should record Diagnostics self-loop #${i}.` })
        .toBe(i);
      const afterByName = await readCountsByStageName(board);
      expect(afterByName[DIAG], `self-loop #${i} must keep the Diagnostics stage total unchanged (src==dst)`).toBe(beforeByName[DIAG]);
      expect(sumBoardCounts(afterByName), `self-loop #${i}: total board population must be unchanged (no token vaporized/duplicated)`).toBe(sumBoardCounts(beforeByName));
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
    await board.moveToken(cardId, DIAG, { specialist: SPECIALIST_EMAIL }); // 3rd Diagnostics→Diagnostics
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === DIAG && x.to === DIAG).length;
      }, { timeout: 20_000, message: 'UP3-WF-01-LOOP-A: the 3rd Diagnostics self-loop row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);

    // ---- Part B: the Diagnostics ↔ DRC round-trip bound ≤ 2 (forward edge then the D1 BACK-edge) ----
    // Re-park the SAME token fresh so Part A's deliberately-over-bound history does not contaminate Part B.
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
      // invariant `assertNoStageSkipped(..., MODEL, VID)` (around this loop).
      void ATC_PREP;
      await waitForCardOnStage(page, board, cardId, DRC);
      await board.assertMoveTargets(cardId, { offers: [boardTargetName(DIAG)] });

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
      expect(fwd.length, 'UP3-WF-01-LOOP-B: exactly two Diagnostics→DRC rows').toBe(2);
      expect(back.length, 'UP3-WF-01-LOOP-B: exactly two DRC→Diagnostics rows').toBe(2);
      expect([...fwd, ...back].every((t: any) => t.movedby && t.movedby !== 'self'),
        'UP3-WF-01-LOOP-B: round-trip moves must be operator-driven (movedby != self).').toBe(true);
    }

    // A THIRD Diagnostics→DRC traversal MUST violate the ≤2 bound — prove the detector fires.
    await driveOperatorHop(page, board, cardId, classifyHop(DIAG, DRC));
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === DIAG && x.to === DRC).length;
      }, { timeout: 20_000, message: 'UP3-WF-01-LOOP-B: the 3rd Diagnostics→DRC row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);
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
    //     "Forms submitted by the Participant" widget). KNOWN seeded config fact (not a value the test
    //     wrote): assert it is present AND stage-specific (a non-form stage like Review has none).
    const diagForms = (cfg.stageproperty[DIAG] || {}).participantform || [];
    expect(Array.isArray(diagForms), 'UP3-WF-01-SCOPE: Diagnostics participantform must be an array').toBe(true);
    expect(diagForms.length, 'UP3-WF-01-SCOPE: the V8 Diagnostics stage must reference ≥1 participant form (formref presence)').toBeGreaterThan(0);
    const reviewForms = (cfg.stageproperty[REVIEW] || {}).participantform || [];
    expect(reviewForms.length, 'UP3-WF-01-SCOPE: a non-form stage (Review) references no forms — formref presence is stage-specific').toBe(0);

    // (4) THE SAME SCOPING, PROVEN ON THE REAL BOARD: a V8 token parked on Diagnostics must render a
    //     move-dropdown offering its 4 DISTINCT NON-loop targets (the Diagnostics self-LOOP "Send Back"
    //     is the token's own column, not a distinct move-target option) and MUST NOT offer →Consultation
    //     NOR →Self Evolution Report. The option set is APP-COMPUTED from the live variation-scoped
    //     nextstage edges; assertMoveTargets opens → asserts → dismisses WITHOUT committing (no move written).
    await parkAt(tokenDocId, DIAG);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    await waitForCardOnStage(page, board, cardId, DIAG);

    // OFFERS the 4 distinct forward/back targets (bare or as a typed "(Queued)" bucket — assertMoveTargets
    // matches either). We do NOT assert `absent:[CONSULT, SELF_REPORT]` on the dropdown: it is NOT
    // edge-scoped (checkAvailablestages lists the whole variation/queue stage set, component ts:2784-2790),
    // so it surfaces both as columns. Those exclusions are proven AUTHORITATIVELY at the ORACLE level above
    // (diagOut EXACTLY the 5 scoped edges; !includes CONSULT; !includes SELF_REPORT; forwardIntoConsult==0).
    void CONSULT; void SELF_REPORT;
    await board.assertMoveTargets(cardId, {
      offers: [boardTargetName(DRC), boardTargetName(ATC_PREP), boardTargetName(ATC_BRIEF), boardTargetName(UP_RCW)],
    });

    // The board committed NO move (the dropdown inspection is read-only): the product wrote ZERO stage-log
    // rows for this token, and it still rests on Diagnostics — assert against PRODUCT state, not a test write.
    expect((await observedTransitions(tokenDocId)).length, 'UP3-WF-01-SCOPE: dropdown inspection must not write any stage-log row').toBe(0);
    await assertNoOrphan(tokenDocId);
  });
});

// =============================================================================================
// 72-JOURNEY EXPANSION (variation share) — walk EVERY distinct FORWARD journey of V8 entry→terminal.
//
// The forward path space of a variation is FINITE (the forward graph is a DAG over the variation's own
// backbone order, so the enumeration terminates) — `forwardJourneys(cfg, VID)` returns each distinct
// entry→terminal stage sequence. For V8 there are 8 (one fewer than V7's 9: V8 DROPS the V7 journey that
// exits Diagnostics directly to Self Evolution Report — the V6/V7↔V8 discriminator). They share the
// entry→Diagnostics prefix and diverge across the uP!-family Diagnostics-and-down operator branch set
// (with/without ATC Preparation, with/without ATC Briefing, the uP! Readiness Changework→Review path vs
// the direct Self Evolution Report hop, plus the dead-forward Diagnostics→Diagnostics Readiness Changework
// terminal of journey 0). Critically NONE of the V8 journeys passes through Consultation (D2): if a journey
// here contained a Consultation hop it would be a flow-model regression, caught by the beforeAll guard.
//
// One test PER journey (so a failure names the exact journey). Each test walks its journey entry→terminal
// and asserts the e2e/lib/assertions.ts UNIVERSAL invariants AFTER EVERY transition:
//   • NO-ORPHAN / EVERY-MOVE-LOGGED (with a non-self lower bound) / NO-STAGE-SKIPPED (vs the oracle) /
//     LOOP-BOUND — on the running audit trail after each hop; and
//   • COUNT-DRIFT via the board UI — on every hop driven on the REAL operator board; and
//   • FORWARD-TERMINAL — the journey's last stage is reached AND the oracle gives it ZERO FORWARD edges.
//
// ACTOR MIX (rules): the journeys DIVERGE precisely on the Diagnostics-and-down OPERATOR spine, so that
// spine is driven entirely through the REAL OPERATOR BOARD (queue-board.page.ts), reading the board's own
// before/after column counts for COUNT-DRIFT — the part of each journey that actually varies is exercised
// against the live product UI. The shared, identical entry→Diagnostics prefix (the AUTO gates, the 4 SELF
// forms, and the Scope Enhancement specialist forward hop — all the same in every journey) is driven via
// the participant-sim PRECONDITION stand-in: it replicates EXACTLY the Firestore writes the apps make (a
// token advance + one `queue stage log` row), so the audit trail the invariants read is genuine. The deep
// REAL-STUDIO specialist coverage (the Scope Enhancement next-cycle forward move through the live UI) is
// the canonical walk above (UP3-WF-01-HAPPY); re-driving an identical studio session in all 8 journeys
// would only multiply flakiness without adding forward-path coverage.
//
// Anti-circularity holds: every operator hop is a REAL board click whose `queue stage log` row the PRODUCT
// writes (counted by EVERY-MOVE-LOGGED's non-self lower bound), every observed edge is validated against
// the oracle (NO-STAGE-SKIPPED), and COUNT-DRIFT reads numbers the board computed from its live stream.
// =============================================================================================
const FORWARD_JOURNEYS: string[][] = forwardJourneys(cfg, VID);
/** All V8 forward journeys share `…→Diagnostics`; from Diagnostics onward the operator branch differs. */
const DIVERGENCE_STAGE = 'Diagnostics';

test.describe('V8 · uP! - 3rd Cycle — every forward journey entry→terminal holds the universal invariants', () => {
  let guard: ConsoleGuard;
  let tokenDocId: string;
  let cardId: string;

  // Each journey is its own end-to-end walk (sim prefix + real-board spine); give it the full budget and
  // serialize (the suite shares one board/queue — fullyParallel is already off, but be explicit).
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    const seeded = await seedUp3rdCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId).toBe(VARIATION_ID);
    tokenDocId = seeded.tokenIds[0];
    cardId = seeded.profileIds[0];
    // Sanity: the enumeration must match the known V8 forward-journey count (8). A drift here means the
    // flow-model / config changed and the expansion is stale — fail loud rather than under-cover.
    expect(FORWARD_JOURNEYS.length, 'V8 must enumerate its 8 distinct forward journeys (one fewer than V7 — drops Diagnostics→Self Evolution Report)').toBe(8);
    // Every journey starts at V8's entry and every transition is an oracle-legal scoped edge (guards the
    // data source — a journey with an illegal hop would be a flow-model regression, not a test bug). Also
    // proves NO journey visits Consultation (D2) — legalEdge throws on any non-oracle hop.
    for (const j of FORWARD_JOURNEYS) {
      expect(j[0], 'every journey starts at the V8 entry stage').toBe(ENTRY);
      expect(
        j.includes(CONSULT),
        'D2: no V8 forward journey may pass through Consultation (it is off the uP!-family happy path)',
      ).toBe(false);
      expect(
        j.includes(SELF_REPORT) && j[j.indexOf(DIAG) + 1] === SELF_REPORT,
        'the V6/V7↔V8 discriminator: NO V8 journey exits Diagnostics directly to Self Evolution Report',
      ).toBe(false);
      for (let k = 1; k < j.length; k++) {
        legalEdge(j[k - 1], j[k]); // throws if any hop is not a legal scoped edge for V8
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub all externals so the (split) board stages that can open studios never pop a real window/network.
    installAllExternalStubs(page);
  });
  test.afterEach(() => {
    assertNoFatal(guard);
  });

  // One parametrized test per forward journey — the title carries the index + terminal so a failure is
  // immediately attributable to a specific path.
  for (let ji = 0; ji < FORWARD_JOURNEYS.length; ji++) {
    const journey = FORWARD_JOURNEYS[ji];
    const terminal = journey[journey.length - 1];
    const divergeAt = journey.indexOf(DIVERGENCE_STAGE);

    test(`journey ${ji}/${FORWARD_JOURNEYS.length - 1} (→ ${terminal}, ${journey.length} stages) walks entry→terminal; invariants hold after every transition`, async ({ page }) => {
      expect(divergeAt, `journey ${ji} must pass through "${DIVERGENCE_STAGE}" (the operator-spine divergence point)`).toBeGreaterThanOrEqual(0);

      // Fresh participant at the entry gate (PRECONDITION). parkAt also pins the PREFIXED variationid so
      // the real board can scope this token's move targets, and purges the prior trail.
      await parkAt(tokenDocId, journey[0]);

      let expectedRows = 0;     // total `queue stage log` rows the PRODUCT should have written so far
      let expectedNonSelf = 0;  // of those, operator/specialist (movedby != 'self')

      /** The trail-only universal invariants (COUNT-DRIFT is asserted inline around each board move). */
      async function assertTrailInvariants(_ctx: string): Promise<void> {
        // Let the PRODUCT's `queue stage log` write SETTLE before the strict row-count assertion (same
        // guard the UP3-WF-01-HAPPY walk uses in assertUniversalAfterHop). The board move advances the
        // token via the live `queue_token` stream (which `pollColumnCounts` waits on for COUNT-DRIFT), but
        // the matching stage-log row lands in a SEPARATE collection that propagates independently — on real
        // cloud Firestore that row can trail the token update by a beat, so reading it the instant
        // pollColumnCounts resolves can catch N-1 rows (the observed cloud miss: 9 found, 10 expected). This
        // ONLY waits for the row to appear; it does NOT relax the assertion below (still exact == expectedRows
        // with the same non-self lower bound).
        await expect
          .poll(async () => (await observedTransitions(tokenDocId)).length, {
            timeout: 30_000,
            message: `[journey] exactly ${expectedRows} stage-log row(s) expected for ${tokenDocId} after this transition (the product's async write must settle first).`,
          })
          .toBe(expectedRows);
        await assertNoOrphan(tokenDocId);
        await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
        await assertNoStageSkipped(tokenDocId, MODEL, VID);
        await assertLoopBound(tokenDocId, 2);
      }

      // -----------------------------------------------------------------------------------------
      // PHASE A — the shared entry→Diagnostics prefix via the participant-sim PRECONDITION stand-in.
      // Each hop is the oracle's sole forward edge; a SELF-movable form is a participant self-move
      // (movedby:'self'), every other backbone hop (AUTO gate, the Scope Enhancement specialist forward
      // move) is an operator/CF-driven advance (movedby:'operator'). One stage-log row per hop.
      // -----------------------------------------------------------------------------------------
      for (let k = 1; k <= divergeAt; k++) {
        const from = journey[k - 1];
        const to = journey[k];
        const edge = legalEdge(from, to);
        const isSelfForm = edge.type === 'selfmove' && edge.selfmv === true;
        await sim.advance(tokenDocId, to, { by: isSelfForm ? 'self' : 'operator', testrunid: TESTRUNID });
        expectedRows++;
        if (!isSelfForm) expectedNonSelf++;
        await assertTrailInvariants(`[journey ${ji}] sim prefix ${from}→${to}`);
      }
      expect(await sim.currentStage(tokenDocId), `[journey ${ji}] token should rest on ${DIVERGENCE_STAGE} before the board spine`).toBe(DIVERGENCE_STAGE);

      // -----------------------------------------------------------------------------------------
      // PHASE B — the divergent Diagnostics-and-down OPERATOR spine on the REAL board.
      // Every remaining hop is an operator move driven through the live move-dropdown; COUNT-DRIFT is
      // asserted from the board's own before/after column counts around each move.
      // -----------------------------------------------------------------------------------------
      await loginAsOperator(page);
      const board = new QueueBoardPage(page);
      await board.selectQueue(QUEUE_NAME);
      // Spy installed after the board mounts; only journeys terminating at Completed assert it fired.
      await installDeliveryStatusSpy(page);

      await expect
        .poll(async () => board.revealTokenCard(cardId), {
          message: `[journey ${ji}] board never rendered token card data-token-id="${cardId}" in the ${DIVERGENCE_STAGE} column`,
          timeout: 20_000,
        })
        .toBe(true);

      for (let k = divergeAt + 1; k < journey.length; k++) {
        const from = journey[k - 1];
        const to = journey[k];

        // (a) the move must be a legal scoped edge per the oracle (the AUTHORITY) — fail loud if not.
        legalEdge(from, to);

        // (b) COUNT-DRIFT: board per-STAGE counts BEFORE the move (APP-computed, polled). Diff at the
        //     stage level so a split stage's sub-columns sum into one total.
        const before = await readCountsByStageName(board);
        expect(before[from], `[journey ${ji}] board must render a count for source stage "${from}" before ${from}→${to}`).toBeGreaterThanOrEqual(1);

        // (c) drive the REAL operator move (split stages render as "<name> (Queued)"; pick the seeded
        //     specialist in the PeopleInvolved confirm).
        await board.moveToken(cardId, boardTargetName(to), { specialist: SPECIALIST_EMAIL });
        expectedRows++; expectedNonSelf++;

        // (d) COUNT-DRIFT: board re-rendered src−1 / dst+1, Σ conserved (read AFTER, polled until the
        //     source stage reflects the departure — values the board computed from its stream).
        const after = await pollColumnCounts(board, from, before[from] - 1);
        assertCountConserved(before, after, { src: from, dst: to });

        // (e) trail invariants after every board move.
        await assertTrailInvariants(`[journey ${ji}] REAL board ${from}→${to}`);
      }

      // -----------------------------------------------------------------------------------------
      // PHASE C — forward-terminal + (for Completed journeys) updateDeliveryStatus-on-final.
      // -----------------------------------------------------------------------------------------
      // The token reached this journey's terminal (REAL post-state).
      expect(await sim.currentStage(tokenDocId), `[journey ${ji}] token must rest on the journey terminal "${terminal}"`).toBe(terminal);
      // FORWARD-TERMINAL: the oracle gives the terminal ZERO FORWARD edges (loop/back edges are allowed —
      // e.g. the dead-forward "Diagnostics Readiness Changework" terminal of journey 0 keeps only its
      // Diagnostics back-edge, which `forwardJourneys` correctly treats as a forward dead-end).
      const fwdFromTerminal = outEdgesForVariation(MODEL, terminal, VID).filter((e: any) => !e.loop && !e.back);
      expect(
        fwdFromTerminal.length,
        `[journey ${ji}] terminal "${terminal}" must have ZERO forward scoped out-edges (a real forward dead-end). Got: ` +
          JSON.stringify(fwdFromTerminal.map((e: any) => e.to)),
      ).toBe(0);
      if (terminal === TERMINAL) {
        // Completed is the multi-stage true terminal — additionally assert it has ZERO scoped out-edges of
        // ANY kind (the move-dropdown is genuinely empty) and that the final move fired updateDeliveryStatus.
        // NOTE: the final hop into Completed (Self Evolution Report→Completed) is a SELFMOVE edge in the
        // oracle. The board move-dropdown still surfaces Completed as a column (checkAvailablestages lists
        // the whole variation stage set), so we DROVE it as a REAL board move above — and the board's
        // last-column move fires guard.updateDeliveryStatus("completed") (component ts:2980-2984). We assert
        // the ARGS the PRODUCT computed (path/status/eventRequestRef), never a value the test wrote.
        await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });
        const calls = await waitForDeliveryStatusCalls(page, 1);
        const completedCall = calls.find((c) => c.status === 'completed' && c.apptPath === `queue_token/${tokenDocId}`);
        expect(
          completedCall,
          `[journey ${ji}] the final board move into "${TERMINAL}" must fire guard.updateDeliveryStatus("queue_token/${tokenDocId}","completed",…). Captured: ${JSON.stringify(calls)}`,
        ).toBeTruthy();
        expect(
          completedCall!.hasEventRequestRef,
          `[journey ${ji}] updateDeliveryStatus must carry a non-null eventRequestRef (gap-10)`,
        ).toBe(true);
      }

      // FINAL trail snapshot: exactly the transitions we drove, with the operator (non-self) board moves
      // present in the PRODUCT's audit trail (anti-circular lower bound). One row per journey hop.
      expect(expectedRows, `[journey ${ji}] one stage-log row per journey transition`).toBe(journey.length - 1);
      await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Local helpers — board count aggregation + departure poll.
//
// WHY aggregate-by-stage-NAME (not by the raw `<name>_<type>_<i>` sub-column key): a split
// (compulsoryactivity) stage renders MULTIPLE sub-columns (Queued / Waiting / Activity), and a board
// move can re-bucket a token across sub-columns of the SAME stage — e.g. the Diagnostics self-loop
// ("Send Back"): the board EXCLUDES the token's own (Queued) bucket from the move-dropdown, so the move
// commits onto a sibling (Waiting) bucket of the SAME stage. The committed `currentstage` is still the
// bare stage (moveTokenToStage parses the suffix back), so the stage-level total is the meaningful
// COUNT-DRIFT quantity — a single `_queued_` key read would spuriously go to 0 after a self-loop. Summing
// a stage's sub-columns into one per-stage total is the same technique the V7 sibling uses.
// ---------------------------------------------------------------------------------------------
/** Collapse { data-stage-key → count } into { stageName → count } by stripping the board's
 *  `<name>_<i>` / `<name>_queued_<i>` / `_waiting_` / `_activity_` sub-column suffixes (so a split
 *  stage's sub-columns sum into one per-stage total before a move diff). */
function aggregateByStageName(byKey: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(byKey)) {
    const name = key.replace(/_(queued|waiting|activity)_\d+$/i, '').replace(/_\d+$/, '');
    out[name] = (out[name] || 0) + (Number(n) || 0);
  }
  return out;
}

/** Σ of every visible board column count (APP-computed) — for the population-conservation invariant. */
function sumBoardCounts(byKey: Record<string, number>): number {
  return Object.values(byKey).reduce((a, n) => a + (Number(n) || 0), 0);
}

/** Per-stage-NAME counts the board rendered (split sub-columns summed). The values are APP-computed
 *  (the board derived them from its live Firestore stream) — this only reads + aggregates them. */
async function readCountsByStageName(board: QueueBoardPage): Promise<Record<string, number>> {
  return aggregateByStageName(await board.readAllColumnCounts());
}

/** Poll the board's per-stage-NAME counts until the SOURCE stage's total reflects the departure
 *  (collectionData is async — SHARED CONVENTIONS: use expect.poll for live-stream-dependent reads). */
async function pollColumnCounts(
  board: QueueBoardPage,
  srcStage: string,
  expectedSrc: number,
): Promise<Record<string, number>> {
  let last: Record<string, number> = {};
  await expect
    .poll(
      async () => {
        last = await readCountsByStageName(board);
        return last[srcStage];
      },
      {
        message: `board source stage "${srcStage}" never re-rendered to ${expectedSrc} after the move (stream not settled?)`,
        timeout: 20_000,
        intervals: [200, 400, 800, 1200],
      },
    )
    .toBe(expectedSrc);
  return last;
}
