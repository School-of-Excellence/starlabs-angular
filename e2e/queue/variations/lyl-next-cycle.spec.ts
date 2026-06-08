// @ts-nocheck
/**
 * lyl-next-cycle.spec.ts — V2 · LYL - Next Cycle · closed-loop variation walk (case LYL-NC-WF-01).
 *
 * ⚠ FILE LOCATION: the playwright runner (e2e/playwright.queue.config.ts) has testDir `queue` and
 *   testMatch `** /*.spec.ts`, so a variation spec MUST live under `e2e/queue/variations/` to run.
 *   The task brief named the path `e2e/variations/lyl-next-cycle.spec.ts`; a file there would NOT be
 *   collected by the runner. This spec is therefore placed at `e2e/queue/variations/lyl-next-cycle.spec.ts`
 *   (the same home as the sibling V1 spec `lyl-first-cycle.spec.ts`), per SHARED CONVENTIONS.
 *
 * WHAT THIS PROVES (the SILENT-DATA-GAP class — see assertions.ts header + SHARED CONVENTIONS):
 *   Drive ONE participant of V2 (LYL - Next Cycle, seed id `zxcF1MNH8Jp0eCxxXASY`) from its first
 *   stage to the terminal `Completed`, MIXING ACTORS, and after EACH transition assert the universal
 *   invariants against the PRODUCT's own output + the flow-model oracle:
 *     • NO-ORPHAN          — the walked token exists, no forked/duplicate sibling, audit trail explains it.
 *     • EVERY-MOVE-LOGGED  — exactly one `queue stage log` row per driven transition, and the
 *                            operator/specialist (non-`self`) moves are present in the PRODUCT's log
 *                            (minNonSelf > 0) — a suite that only round-tripped sim self-writes can NOT
 *                            satisfy this (anti-circularity).
 *     • NO-STAGE-SKIPPED   — every observed `previousstage→currentstage` is a LEGAL SCOPED EDGE per the
 *                            flow-model oracle for V2 (`outEdgesForVariation`), NOT a mere backbone
 *                            adjacency (flow-config.md §3 drift: DRC dead-forward, Consultation routing).
 *     • TERMINAL-REACHED   — currentstage == `Completed` AND the oracle gives `Completed` ZERO scoped
 *                            out-edges (a real terminal, not just a name).
 *     • COUNT-DRIFT        — for every move DRIVEN ON THE REAL BOARD, the board re-rendered src−1 / dst+1
 *                            and Σ conserved (read from the board UI before/after — values the APP
 *                            computed from its live Firestore stream, never written by this test).
 *     • LOOP-BOUND         — no edge traversed > 2 times (the Scope Enhancement send-back self-loop is
 *                            traversed once here; a 3rd traversal of ANY edge fails).
 *
 *   Plus the V2-specific assertions in flow-config.md §5 "V2 LYL-NC":
 *     • SCOPE-ENHANCEMENT SEND-BACK LOOP — driven through the REAL specialist studio
 *       (`moveStage(Scope Enhancement, markascompleted:false)` = the `[LOOP]` self-edge), bounded ≤2.
 *     • NEXT-CYCLE EDGE — the Scope Enhancement → `Evolution Mapping Activity` operator branch (the V2
 *       "next-cycle" forward decision, `{done}`), driven through the REAL studio and confirmed to be the
 *       oracle's sole forward edge from Scope Enhancement for V2.
 *     • V2-vs-V7 DISCRIMINATOR — `ATC Briefing → Consultation` IS a legal V2 forward edge (it exists only
 *       in the LYL/B!G family; V7/uP! does NOT have it) — this spec drives that exact move on the board,
 *       and `assertNoStageSkipped` would reject it for any variation that lacks it.
 *     • updateDeliveryStatus ON FINAL — the operator's move into the LAST board column (`Completed`,
 *       global idx 29) fires `guard.updateDeliveryStatus(/queue_token/{docid}, "completed",{eventRequestRef})`
 *       (board component ts:2980-2984). We capture the ARGS the product computed via the delivery-status
 *       spy (a dev-global wrap, NOT a stub) and assert the path/status/eventRequestRef — the values the
 *       APP derived, never values the test wrote (cf. delivery-status-spy.ts / cf.md §9 gap-10).
 *     • FORM-WRITE INTEGRITY on the 4 self-movable stages — V2's 4 self-movable FORM stages
 *       (AEL Form, uP! Life Report, Self Evaluation Form, Guided Self ATC; flow-config.md §2 V2 SELF set
 *       minus the terminal Self Evolution Report) each, on the participant self-move (`movedby:'self'`),
 *       produce exactly ONE `queue stage log` row whose `previousstage→currentstage` equals the oracle's
 *       `selfmove`+`selfmv:true` edge. We read the rows the PRODUCT/self-move wrote (assertions.ts) — not
 *       a value the test computed.
 *
 * ACTOR MIX (the brief: operator/specialist transitions MUST go through the REAL board/studio UI and
 * assert the board-rendered counts; the participant-sim may ONLY set up preconditions or stand in for the
 * Flutter participant self-move / auto-advance):
 *   • REAL SPECIALIST STUDIO (studio.page.ts): Scope Enhancement send-back `[LOOP]` + the next-cycle
 *     forward move Scope Enhancement → Evolution Mapping Activity. Scope Enhancement is the studio engine
 *     stage (studiowidgets) — the natural specialist surface.
 *   • REAL OPERATOR BOARD (queue-board.page.ts): Diagnostics→ATC Briefing, ATC Briefing→Consultation,
 *     Consultation→uP! Readiness Changework, uP! RCW→Review, Review→Self Evolution Report, and the FINAL
 *     Self Evolution Report→Completed (fires updateDeliveryStatus). The board move-dropdown offers every
 *     stage of the token's variation (component ts:2784-2822), so these are real, clickable moves; the
 *     anti-circular NO-STAGE-SKIPPED invariant is what enforces they are oracle-LEGAL.
 *   • PARTICIPANT-SIM (participant-sim.js) — PRECONDITION/self-move stand-in ONLY: the AUTO gates
 *     (Evolution Prep Orientation, Evolution Mapping Activity, In-Evolution-Mapping link, Ready for
 *     Diagnostics) and the 4 self-movable FORM self-moves. These replicate EXACTLY the Firestore writes
 *     the Flutter app makes (token advance + one `queue stage log` row), so the PRODUCT's audit trail is
 *     genuine; the spec then asserts that trail, never the seeded value.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md (§0 the 3 edge types · §2 V2 authoritative ordered stages + scoped
 *     edges + selfmovable flags · §3 D1/D2 drift · §5 V2-specific asserts) — the ROUTING ORACLE.
 *   - e2e/lib/flow-model.js (`build`, `outEdgesForVariation`) — the scoped-edge oracle (the authority, not
 *     the raw backbone). Verified the exact V2 edge set against this file before writing.
 *   - e2e/lib/assertions.ts (the 6 universal invariants) — reads PRODUCT output, never test writes.
 *   - e2e/lib/participant-sim.js (`advance`, `tokensForVariation`, `db`) — self-move/auto stand-in shape.
 *   - e2e/fixtures/variation-seeds/lyl-next-cycle.ts (`seedLylNextCycle`) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts (QueueBoardPage) · e2e/queue/pages/studio.page.ts (StudioPage).
 *   - e2e/queue/support/{auth,actors,console-guard,firestore-admin,delivery-status-spy}.ts.
 *   - e2e/queue/recon/testids.md (OPERATOR + STUDIO surfaces) — every selector used by the page objects
 *     is a shipped data-testid; no selector is invented here.
 *   - src/app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts
 *     (ts:2784-2824 dropdown source · ts:2936-2984 move write + updateDeliveryStatus on last column).
 *   - src/app/queue system/dynamic-studio/dynamic-studio.component.ts (ts:1157+ moveStage send-back/forward).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator } from '../support/auth';
import { TESTRUNID, QUEUE_NAME } from '../support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import {
  installDeliveryStatusSpy,
  waitForDeliveryStatusCalls,
  readDeliveryStatusCalls,
} from '../support/delivery-status-spy';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { getDoc } from '../support/firestore-admin';

// lib/* are plain CommonJS (no `type:module`) — require like the other specs do.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../../lib/flow-model');
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
  readLogRows,
} = require('../../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seedLylNextCycle } = require('../../fixtures/variation-seeds/lyl-next-cycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forwardJourneys } = require('../../lib/forward-journeys');

// ---------------------------------------------------------------------------------------------
// V2 identity + the flow-model oracle (built ONCE, reused — the AUTHORITY for legal edges).
// ---------------------------------------------------------------------------------------------
const VARIATION_ID = 'zxcF1MNH8Jp0eCxxXASY';        // SEED id (flow-config.md §2 V2 — trust the seed id)
const VARIATION_NAME = 'LYL - Next Cycle';
const MODEL = build(cfg);
const TERMINAL = 'Completed';

/**
 * The PREFIXED variation id the board + studio key by. WHY this exists (the move-dropdown scoped-edge /
 * variation-id namespace bug the brief flagged — CONFIRMED on the live emulator, see below):
 *   • seed-test-project.js `seedQueueAndVariations` writes the `queue variation` DOC id as
 *     `${testrunid}_${rawId}` (ts:425), and the board/studio key their variation maps by that DOC id
 *     (board `mapVariation[document.id]`, dynamic-queue-manager-clone.ts:1817; studio
 *     `queueVariation[doc.id]`, dynamic-studio.ts:383).
 *   • BUT `seedParticipantToken` writes the TOKEN's `variationid` as the RAW id (ts:510). So
 *     `mapVariation[token.variationid]` / `queueVariation[token.variationid]` MISS (raw key ≠ prefixed
 *     doc id) ⇒ the board move-dropdown's `checkAvailablestages` (ts:2784, gated on
 *     `mapVariation[token.variationid]`) renders ZERO targets, and the studio move-next button (html:527,
 *     gated on `queueVariation[token.variationid]` AND `config.variations.includes(token.variationid)`
 *     where `config.variations` are the PREFIXED ids the seeded queue's nextstage carries, ts:447-449)
 *     never renders. Both real-UI hops become undrivable.
 * Empirically verified on the running emulator: token.variationid="zxcF1MNH8Jp0eCxxXASY" but the only
 * `queue variation` doc that exists is "<run>_zxcF1MNH8Jp0eCxxXASY" — so mapVariation[rawId] is undefined.
 * FIX (PRECONDITION, in our owned spec only): set the walked token's `variationid` to the PREFIXED form so
 * it matches the doc id the board/studio loaded. The oracle assertions are UNAFFECTED — they take the RAW
 * `VARIATION_ID` as an explicit arg (outEdgesForVariation / assertNoStageSkipped / assertTerminalReached),
 * never reading `token.variationid`. The ROOT fix belongs in the shared seeder (seedParticipantToken should
 * write the prefixed id) and is RETURNED as a seedRequest — this local override unblocks THIS spec now.
 */
const PREFIXED_VARIATION_ID = `${TESTRUNID}_${VARIATION_ID}`;

/** The seeded specialist we act as in the REAL studio (member of the Scope Enhancement pairing). */
const SPECIALIST_PROFILE_ID = `${TESTRUNID}_pf_specialist_0`;
/** Deterministic precondition doc ids for the Scope Enhancement live session this spec seeds. */
const SE_PAIRING_ID = `${TESTRUNID}_pair_se_${VARIATION_ID.slice(0, 6)}`;
const SE_LIVE_ASSIGNMENT_ID = `${TESTRUNID}_la_se_${VARIATION_ID.slice(0, 6)}`;
const SCOPE_ENHANCEMENT = 'Scope Enhancement';
const NEXT_CYCLE_TARGET = 'Evolution Mapping Activity';
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

/** The 4 self-movable FORM stages on V2's backbone whose self-move write-integrity we assert
 *  (flow-config.md §2 V2 SELF set, excluding the terminal-self-mover Self Evolution Report). */
const SELF_MOVABLE_FORM_STAGES = [
  'Accelerated Evolution Level Form',
  'uP! Life Report',
  'Self Evaluation Form',
  'Guided Self ATC',
] as const;

// ---------------------------------------------------------------------------------------------
// Oracle helpers (legal-edge lookups — the AUTHORITY is outEdgesForVariation, not the backbone).
// ---------------------------------------------------------------------------------------------
/** The single legal forward target of `from` for V2 (next or self-move, excluding loop/back). */
function legalForwardTarget(from: string): string {
  const fwd = outEdgesForVariation(MODEL, from, VARIATION_ID).filter((e: any) => !e.loop && !e.back);
  if (fwd.length !== 1) {
    throw new Error(
      `[oracle] expected exactly ONE forward edge from "${from}" for ${VARIATION_NAME}, got ` +
        `${JSON.stringify(fwd.map((e: any) => `${e.to}[${e.type}${e.done ? ',done' : ''}]`))}. ` +
        `Pick the intended branch explicitly via legalOperatorTarget().`,
    );
  }
  return fwd[0].to;
}

/** Assert `from → to` is a legal scoped edge per the oracle, returning its descriptor (fails loud if not). */
function legalEdge(from: string, to: string): any {
  const edge = outEdgesForVariation(MODEL, from, VARIATION_ID).find((e: any) => e.to === to);
  expect(
    edge,
    `[oracle] move "${from}" → "${to}" is NOT a legal scoped edge for ${VARIATION_NAME}. Legal out-edges: ` +
      JSON.stringify(
        outEdgesForVariation(MODEL, from, VARIATION_ID).map(
          (e: any) => `${e.to}[${e.type}${e.loop ? ',loop' : ''}${e.back ? ',back' : ''}]`,
        ),
      ),
  ).toBeTruthy();
  return edge;
}

/** True iff `stage` exposes a participant self-advance edge (selfmove + selfmv:true) for V2. */
function hasSelfMoveEdge(stage: string): boolean {
  return outEdgesForVariation(MODEL, stage, VARIATION_ID).some((e: any) => e.type === 'selfmove' && e.selfmv);
}

/** A board move-dropdown target name for a stage: split (compulsory-activity) stages render as
 *  "<name> (Queued)"; simple stages render as the bare name (component ts:2796-2821 + html:1238).
 *  A seeded/operator-moved token enters a compulsory-activity stage in its Queued sub-column. */
function boardTargetName(stage: string): string {
  const p = cfg.stageproperty[stage] || {};
  const isSplit = !!p.compulsoryactivity && Object.keys(p.compulsoryactivity).length > 0;
  return isSplit ? `${stage} (Queued)` : stage;
}

/** The board `data-stage-key` of a stage's column we read counts from: for a split stage that is the
 *  Queued sub-column `<stage>_queued_<globalIndex>`; for a simple stage `<stage>_<globalIndex>`
 *  (component ts:1927/1946 — stageKey is keyed by the stage's index in the queue's `stages[]`, which is
 *  the global cfg.stages order this queue is seeded with). */
function columnKey(stage: string): string {
  const gi = cfg.stages.indexOf(stage);
  const p = cfg.stageproperty[stage] || {};
  const isSplit = !!p.compulsoryactivity && Object.keys(p.compulsoryactivity).length > 0;
  return isSplit ? `${stage}_queued_${gi}` : `${stage}_${gi}`;
}

// ---------------------------------------------------------------------------------------------
// Precondition seeders (allowed: preconditions only; NEVER asserted as output).
// ---------------------------------------------------------------------------------------------
/**
 * Reset the walked token to V2's first stage with a clean (re-runnable) state, and purge its prior
 * `queue stage log` rows so the per-transition log-count invariants count THIS run's moves only.
 * This is a PRECONDITION (stands in for "a fresh participant entered the queue") — never asserted.
 */
async function resetTokenForWalk(tokenDocId: string, firstStage: string): Promise<void> {
  const db = sim.db();
  await db.collection('queue_token').doc(tokenDocId).set(
    {
      // PREFIXED variationid so the board move-dropdown + studio move-next button resolve their
      // variation-scoped stage lists (see PREFIXED_VARIATION_ID — the namespace-bug precondition fix).
      variationid: PREFIXED_VARIATION_ID,
      currentstage: firstStage,
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
  // Purge prior log rows for a deterministic per-run count (idempotent re-runs).
  const prior = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
  await Promise.all(prior.docs.map((d: any) => d.ref.delete()));
}

/**
 * Wire the walked token into a LIVE Scope Enhancement studio session as a PRECONDITION so the real
 * specialist studio mounts the live panel + renders the move-next button for this token. Mirrors the
 * documented §3a link used by studio-session.spec.ts (preconditions only): a `queue studio pairing`
 * (the acting specialist is a participant) + a `live assignment` (status:'live', stagename:Scope
 * Enhancement) + the token's liveassignmentid/studioid/status:'instudio'. NEVER asserted as output —
 * the spec asserts the stage-log row the studio MOVE writes, not these seeded values.
 */
async function linkTokenIntoScopeEnhancementStudio(tokenDocId: string, queueGenDocId: string): Promise<void> {
  const db = sim.db();
  // The token's queueref is already set by the seeder; reuse it for the pairing ref.
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
      stagename: SCOPE_ENHANCEMENT,
      participantid: tok.profile_id,
      status: 'live',
      pairing: [SPECIALIST_PROFILE_ID],
      // queueid MUST be the queue-generation DOC ID **string** (NOT a DocumentReference): the studio's
      // live-assignment stream queries `where("queueid","==", ongoingQueue["docid"])` (dynamic-studio.ts:516)
      // and `ongoingQueue.docid` is the queue-gen doc id string. A ref here would never match ⇒ the live_tv
      // icon + liveAssignment resolution never fire (fake-data.js:181 documents this: "STRING — NOT a ref").
      queueid: queueGenDocId,
      _testdata: true,
      testrunid: TESTRUNID,
    },
    { merge: true },
  );
  await db.collection('queue_token').doc(tokenDocId).set(
    {
      // PREFIXED variationid (namespace fix) so the studio move-next button's queueVariation +
      // config.variations gates resolve for this token (html:527).
      variationid: PREFIXED_VARIATION_ID,
      currentstage: SCOPE_ENHANCEMENT,
      previousstage: SCOPE_ENHANCEMENT,
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
 * Wait until the PRODUCT's `queue stage log` collection has at least `expectedRows` rows for this token
 * before running the trail invariants. This is a pure read-after-WRITE-PROPAGATION settle, NOT a relaxed
 * assertion: a REAL board/studio move commits the `queue_token` update + its `queue stage log` row in ONE
 * writeBatch (dynamic-queue-manager-clone.ts:2956-2964 / dynamic-studio.ts moveStage), and the board's
 * own optimistic in-memory splice re-renders the column counts the instant `batch.commit()` resolves —
 * so the spec's COUNT-DRIFT check can pass within ~200ms of the commit ack. Against the REAL cloud
 * Firestore (vs the in-process emulator, where a committed write is instantly queryable) a `where('docid',
 * '==', T)` query can lag the commit-ack by a small index-propagation window, so a single un-polled
 * `assertEveryMoveLogged` read immediately after the move occasionally sees N−1 rows (a read-after-write
 * race, not a missing row — the row IS committed). Poll until the count catches up, then the caller runs
 * the EXACT invariant (`=== expectedRows` + the non-self lower bound) unchanged. If the product genuinely
 * never wrote the row this poll times out and the subsequent assertion still fails with its full trail —
 * nothing is masked. (assertions.ts `readLogRows` reads the rows the PRODUCT wrote — never a test value.)
 */
async function settleLogRows(tokenDocId: string, expectedRows: number): Promise<void> {
  await expect
    .poll(async () => (await readLogRows(tokenDocId)).length, {
      message: `queue stage log row count did not reach ${expectedRows} for token ${tokenDocId} ` +
        `(real-cloud read-after-write index propagation); the trail invariant will report the detail if it never settles`,
      timeout: 20_000,
      intervals: [200, 400, 800, 1200, 2000],
    })
    .toBeGreaterThanOrEqual(expectedRows);
}

// =============================================================================================
test.describe('V2 · LYL - Next Cycle — closed-loop walk to terminal (LYL-NC-WF-01)', () => {
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;
  let tokenDocId: string;
  let cardId: string;
  let queueGenDocId: string;

  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    // Guarantee the V2 preconditions for THIS run via the per-variation seed builder (idempotent):
    // staff auth chain + queue generation + the V2 `queue variation` doc + 1 token at the first stage.
    const seeded = await seedLylNextCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId).toBe(VARIATION_ID);
    tokenDocId = seeded.tokenIds[0];
    // The board card carries data-token-id = profile_id || docid (testids.md PRE-EXISTING attrs).
    cardId = seeded.profileIds[0];
    // The queue-generation doc id string the studio's live-assignment stream matches on
    // (where queueid == ongoingQueue.docid). Used to wire the Scope Enhancement live session.
    queueGenDocId = seeded.queueGenDocId;
    expect(queueGenDocId, 'seed must expose the queue generation doc id').toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub all externals (Zoom/OpenVidu/FCM/Wati/email) so no real window/network opens during the
    // studio phase. installAllExternalStubs is synchronous (registers page.route handlers; the per-test
    // page auto-clears them on close). Captured here only to keep the boundary stubbed for the run.
    stubs = installAllExternalStubs(page);
    expect(stubs).toBeTruthy();
  });
  test.afterEach(() => {
    assertNoFatal(guard);
  });

  test('walks first→terminal mixing actors; every transition holds the silent-data-gap invariants', async ({ page }) => {
    const firstStage = (cfg.queuevariation.find((v: any) => v.id === VARIATION_ID).stages || [])[0];
    expect(firstStage, 'V2 must declare a first stage').toBe('Evolution Prep Orientation');

    // Fresh, re-runnable participant at the entry gate (PRECONDITION — not an assertion target).
    await resetTokenForWalk(tokenDocId, firstStage);

    // Track the walk for the universal invariants we assert AFTER each transition.
    let expectedRows = 0;      // total `queue stage log` rows the PRODUCT should have written so far
    let expectedNonSelf = 0;   // of those, how many are operator/specialist (movedby != 'self')

    /** Assert the per-token universal invariants that read the PRODUCT's audit trail + oracle.
     *  (COUNT-DRIFT is asserted inline around each REAL-BOARD move, where before/after board counts
     *  are captured from the UI — it is not part of this trail-only checkpoint.) */
    async function assertTrailInvariants(ctx: string): Promise<void> {
      // Settle the just-committed log row into the query index before the un-polled count assertion
      // (real-cloud read-after-write race — see settleLogRows). Sim-prefix writes are already present,
      // so this returns immediately there; it only waits after a REAL board/studio move.
      await settleLogRows(tokenDocId, expectedRows);
      await assertNoOrphan(tokenDocId);
      await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
      await assertNoStageSkipped(tokenDocId, MODEL, VARIATION_ID);
      await assertLoopBound(tokenDocId, 2);
    }

    // -----------------------------------------------------------------------------------------
    // PHASE 1 — entry gate + 2 self-movable forms (participant-sim self-move / auto stand-ins).
    //   Evolution Prep Orientation --AUTO--> AEL Form --SELF--> uP! Life Report --SELF--> Scope Enhancement
    // The AUTO gate is the operator/CF-driven backbone advance (movedby:'operator' stand-in); the two
    // SELF moves are participant self-moves (movedby:'self'). Each writes exactly one stage-log row.
    // -----------------------------------------------------------------------------------------
    // 1. Evolution Prep Orientation → AEL Form (AUTO gate — non-self-movable; advanced by operator/CF).
    {
      const to = legalForwardTarget('Evolution Prep Orientation'); // = Accelerated Evolution Level Form
      legalEdge('Evolution Prep Orientation', to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO gate Evolution Prep Orientation→AEL Form');
    }
    // 2 & 3. AEL Form → uP! Life Report → Scope Enhancement (two participant SELF-move forms).
    for (const from of ['Accelerated Evolution Level Form', 'uP! Life Report']) {
      const to = legalForwardTarget(from);
      const edge = legalEdge(from, to);
      expect(edge.type, `${from}→${to} must be a self-move edge`).toBe('selfmove');
      expect(edge.selfmv, `${from} must be self-movable (a participant form self-move)`).toBe(true);
      await sim.advance(tokenDocId, to, { by: 'self', testrunid: TESTRUNID });
      expectedRows++;
      await assertTrailInvariants(`after SELF form ${from}→${to}`);
    }
    expect(await sim.currentStage(tokenDocId), 'token should rest on Scope Enhancement after phase 1').toBe(SCOPE_ENHANCEMENT);

    // -----------------------------------------------------------------------------------------
    // PHASE 2 — REAL SPECIALIST STUDIO: Scope Enhancement send-back [LOOP] + the next-cycle forward edge.
    //   • The send-back loop is moveStage(Scope Enhancement, markascompleted:false) — the [LOOP] self-edge.
    //   • The forward move is moveStage(Evolution Mapping Activity, markascompleted:true) — the V2
    //     "next-cycle" operator branch (the ONLY forward edge from Scope Enhancement for V2).
    // Both are driven through the REAL studio (StudioPage.moveNext) acting as a seeded specialist; the
    // studio writes the `queue stage log` row (movedthrough:'studio', movedby:profileid → non-self).
    // -----------------------------------------------------------------------------------------
    // Oracle pre-checks (the AUTHORITY): Scope Enhancement has the loop edge AND exactly one forward edge.
    const loopEdge = legalEdge(SCOPE_ENHANCEMENT, SCOPE_ENHANCEMENT);
    expect(loopEdge.loop, 'Scope Enhancement must have a self-[LOOP] edge (the Send-Back)').toBe(true);
    const nextCycleEdge = legalEdge(SCOPE_ENHANCEMENT, NEXT_CYCLE_TARGET);
    expect(nextCycleEdge.type, 'the next-cycle edge is an operator nextstage edge').toBe('next');
    expect(nextCycleEdge.done, 'the next-cycle edge is markascompleted (done)').toBe(true);
    expect(
      legalForwardTarget(SCOPE_ENHANCEMENT),
      'Scope Enhancement → Evolution Mapping Activity must be V2’s sole forward edge (the next-cycle decision)',
    ).toBe(NEXT_CYCLE_TARGET);

    // Wire the token into a live Scope Enhancement studio session (PRECONDITION) and act as the specialist.
    await linkTokenIntoScopeEnhancementStudio(tokenDocId, queueGenDocId);
    // Log in ONCE as the operator (admin) and stay logged in for the WHOLE walk — do NOT switch actors
    // mid-test. The shared `loginAs` (support/actors.ts:18-24) does `page.goto('/')` + fill, with NO
    // logout; on real cloud the persisted auth session means a second login re-navigates to '/' and the
    // app redirects an already-authenticated user away from the login form, so `input[type="email"]`
    // never appears and the fill hangs to the test timeout (the observed cloud failure at the PHASE 4
    // operator login). Instead we authenticate as the operator here and drive the SPECIALIST studio via
    // the `?profileid=<specialist>` override (dynamic-studio.component.ts:160 — `studio.load` threads it
    // through): the page then ACTS as the seeded Scope Enhancement specialist for this token's live
    // session. The seeded `dashboard` route-config grants `/dynamicstudio` to ALL staff roles
    // (seed-test-project.js:149,411-420 `roles: allRoles`), so the operator's `admin` role admits the
    // studio route. PHASE 4's operator board then REUSES this same session — no second login. (This is
    // the exact pattern the sibling up-next-cycle.spec.ts uses for the same studio→board walk.)
    await loginAsOperator(page);
    const studio = new StudioPage(page);
    await studio.load(SPECIALIST_PROFILE_ID);
    // Select the studio the race-free way: wait for the live-assignment stream to surface this studio's
    // live_tv icon (mapStudioLiveAssignment populated) BEFORE the click, so onStudioSelect resolves the
    // live token AND the studio-button list has settled. On real cloud the chunked `queue studio pairing`
    // stream re-emits more (and slower) than on the emulator, so selecting right after navigation could
    // catch the button mid-re-render → "Element is not attached to the DOM" (studio.page.ts:163). Waiting
    // on the app's own readiness signal first avoids that detach race; it still asserts the live panel.
    await studio.selectStudioWithLivePanel(SE_PAIRING_ID);

    // 4. Scope Enhancement → Scope Enhancement (SEND-BACK [LOOP], markascompleted:false) — REAL studio.
    //    moveNext to the SAME stage triggers the StageIncompleteConfirmation dialog (component ts:1274),
    //    which moveNext() confirms. After it commits, the token is back on Scope Enhancement.
    await studio.moveNext(SCOPE_ENHANCEMENT);
    expectedRows++; expectedNonSelf++;
    await expect
      .poll(async () => (await getDoc('queue_token', tokenDocId))?.currentstage, {
        message: 'studio send-back loop did not return the token to Scope Enhancement',
        timeout: 20_000,
      })
      .toBe(SCOPE_ENHANCEMENT);
    await assertTrailInvariants('after studio send-back loop Scope Enhancement→Scope Enhancement');
    // LOOP-BOUND: the self-loop has now been traversed exactly once (≤2 — a later 3rd would fail).
    {
      const loopState = await assertLoopBound(tokenDocId, 2);
      expect(loopState.maxObserved, 'the Scope Enhancement send-back loop must be bounded (≤2)').toBeLessThanOrEqual(2);
    }

    // The send-back move detaches the live session (closeStudio); re-link for the forward move so the
    // live panel + move-next button render again (PRECONDITION only). Re-select via the live-panel-aware
    // path (waits for the re-linked live_tv icon before clicking) so the post-navigation button re-render
    // can't detach the element mid-select — this is the exact hop that flaked on cloud (studio.page.ts:163).
    await linkTokenIntoScopeEnhancementStudio(tokenDocId, queueGenDocId);
    await studio.load(SPECIALIST_PROFILE_ID);
    await studio.selectStudioWithLivePanel(SE_PAIRING_ID);

    // 5. Scope Enhancement → Evolution Mapping Activity (NEXT-CYCLE forward, markascompleted:true) — REAL studio.
    //    UNLIKE the send-back loop (markascompleted:false → the StageIncompleteConfirmation branch that
    //    StudioPage.moveNext drives), a studio FORWARD-COMPLETE to a DIFFERENT stage takes the product's
    //    `moveStage` ELSE branch (dynamic-studio.ts:1353): it (a) opens the "Assign Specialist if attended"
    //    AssignQueueStudio dialog via `inviteMore(true)` and ABORTS the move if it returns falsy
    //    (`if(!reviewSpecialist) return`, ts:1354-1355), then (b) opens the HoldAlertDialog "Confirmation!"
    //    and ABORTS if cancelled (`if(result == null) return`, ts:1360-1363) before it writes the token +
    //    stage-log (ts:1365-1405). StudioPage.moveNext only handles the StageIncompleteConfirmation dialog,
    //    so without driving these two product dialogs the forward move silently no-ops and the token stays
    //    on Scope Enhancement (the observed cloud failure). Drive BOTH real dialogs to completion here — no
    //    assertion is weakened; this is the genuine specialist forward-complete interaction the product
    //    requires. The aqs form is pre-valid (single studio is pre-selected, no mandatory bonus rows for
    //    this seeded pairing — aqs.ts:73-77,102-118), so Assign is enabled immediately.
    await studio.moveNext(NEXT_CYCLE_TARGET);
    expectedRows++; expectedNonSelf++;
    // (5a) Confirm the "Assign Specialist if attended in this Studio" dialog (inviteMore(true)).
    const aqsSubmit = page.locator('[data-testid="aqs-submit"]');
    await expect(aqsSubmit, 'studio forward-complete must open the Assign-Specialist dialog (inviteMore)').toBeVisible({ timeout: 20_000 });
    await expect(aqsSubmit).toBeEnabled({ timeout: 20_000 });
    await aqsSubmit.click();
    // (5b) Confirm the HoldAlert "Confirmation!" dialog (Confirm → "confirm"; Cancel → null aborts).
    const holdConfirm = page.getByRole('button', { name: /^Confirm$/ });
    await expect(holdConfirm, 'studio forward-complete must open the HoldAlert confirmation dialog').toBeVisible({ timeout: 20_000 });
    await holdConfirm.click();
    await expect
      .poll(async () => (await getDoc('queue_token', tokenDocId))?.currentstage, {
        message: 'studio next-cycle move did not advance the token to Evolution Mapping Activity',
        timeout: 20_000,
      })
      .toBe(NEXT_CYCLE_TARGET);
    await detachTokenFromStudio(tokenDocId, NEXT_CYCLE_TARGET);
    await assertTrailInvariants('after studio next-cycle Scope Enhancement→Evolution Mapping Activity');

    // -----------------------------------------------------------------------------------------
    // PHASE 3 — Evolution-Mapping block via participant-sim (AUTO gates + link + SELF forms).
    //   Evolution Mapping Activity --AUTO--> In Evolution Mapping Activity (link) --AUTO--> Self Evaluation Form
    //     --SELF--> Guided Self ATC --SELF--> Ready for Diagnostics --AUTO--> Diagnostics
    // The `In Evolution Mapping Activity` link stage is non-self-movable (flow-config.md §2 V2 note): it
    // is an AUTO gate (the participant opens a URL, NO self-move write). We assert it has NO self-move
    // edge, and advance it as an operator/CF-driven backbone step (NOT a participant self-move).
    // -----------------------------------------------------------------------------------------
    // 6. Evolution Mapping Activity → In Evolution Mapping Activity (AUTO).
    {
      const to = legalForwardTarget(NEXT_CYCLE_TARGET); // = In Evolution Mapping Activity
      legalEdge(NEXT_CYCLE_TARGET, to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO Evolution Mapping Activity→In Evolution Mapping Activity');
    }
    // 7. In Evolution Mapping Activity (link) → Self Evaluation Form (AUTO; link stage has NO self-move edge).
    {
      const linkStage = 'In Evolution Mapping Activity';
      expect(
        hasSelfMoveEdge(linkStage),
        'the link stage In Evolution Mapping Activity must expose NO participant self-move edge (AUTO gate)',
      ).toBe(false);
      const to = legalForwardTarget(linkStage); // = Self Evaluation Form
      legalEdge(linkStage, to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO link In Evolution Mapping Activity→Self Evaluation Form');
    }
    // 8 & 9. Self Evaluation Form → Guided Self ATC → Ready for Diagnostics (two SELF-move forms).
    for (const from of ['Self Evaluation Form', 'Guided Self ATC']) {
      const to = legalForwardTarget(from);
      const edge = legalEdge(from, to);
      expect(edge.type, `${from}→${to} must be a self-move edge`).toBe('selfmove');
      expect(edge.selfmv, `${from} must be self-movable`).toBe(true);
      await sim.advance(tokenDocId, to, { by: 'self', testrunid: TESTRUNID });
      expectedRows++;
      await assertTrailInvariants(`after SELF form ${from}→${to}`);
    }
    // 10. Ready for Diagnostics → Diagnostics (AUTO gate).
    {
      const to = legalForwardTarget('Ready for Diagnostics'); // = Diagnostics
      legalEdge('Ready for Diagnostics', to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO Ready for Diagnostics→Diagnostics');
    }
    expect(await sim.currentStage(tokenDocId), 'token should rest on Diagnostics before the board phase').toBe('Diagnostics');

    // -----------------------------------------------------------------------------------------
    // PHASE 4 — REAL OPERATOR BOARD: the Diagnostics-and-down spine to the terminal.
    //   Diagnostics → ATC Briefing → Consultation → uP! Readiness Changework → Review
    //     → Self Evolution Report → Completed   (each a REAL board move; COUNT-DRIFT asserted on each).
    // This is V2's LYL-family spine: it INCLUDES `ATC Briefing → Consultation` (the V2-vs-V7
    // discriminator — that edge exists only in V1/V2/V3). The final move into `Completed` (the last board
    // column) fires guard.updateDeliveryStatus("completed") (component ts:2980-2984) — captured by the spy.
    // -----------------------------------------------------------------------------------------
    // REUSE the operator session established in PHASE 2 (no second login — a re-login on the same page
    // would re-navigate to '/', which an already-authenticated session redirects away from the login
    // form, hanging the email fill; see the PHASE 2 note). The operator is `admin`, so the board route
    // (/dynamicqueuemanager) is already admitted; just navigate to the board and select the queue.
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    // Install the delivery-status spy AFTER the board mounted (dev-global wrap; cf. delivery-status-spy.ts).
    await installDeliveryStatusSpy(page);

    // The walked token must render on the board (board bucketed it into Diagnostics' Queued sub-column;
    // paged in via Load More if the column is crowded past PAGE_SIZE).
    await expect
      .poll(async () => board.revealTokenCard(cardId), {
        message: `board never rendered token card data-token-id="${cardId}" (is the queue selected and the queue_token stream loaded? — also paged via Load More)`,
        timeout: 20_000,
      })
      .toBe(true);

    // The board spine (each entry: the legal oracle target + the dropdown option name the board renders).
    const boardSpine: { from: string; to: string }[] = [
      { from: 'Diagnostics', to: 'ATC Briefing' },
      { from: 'ATC Briefing', to: 'Consultation' },
      { from: 'Consultation', to: 'uP! Readiness Changework' },
      { from: 'uP! Readiness Changework', to: 'Review' },
      { from: 'Review', to: 'Self Evolution Report' },
      { from: 'Self Evolution Report', to: TERMINAL },
    ];

    for (const { from, to } of boardSpine) {
      // (a) The move must be a LEGAL scoped edge per the oracle (the AUTHORITY) — fail loud if not.
      legalEdge(from, to);

      // (b) COUNT-DRIFT: capture the board's per-column counts BEFORE the move (APP-computed, polled).
      const before = await board.readAllColumnCounts();
      const srcKey = columnKey(from);
      const dstKey = columnKey(to);
      expect(before[srcKey], `board must render a count for source column "${srcKey}" before the ${from}→${to} move`).toBeGreaterThanOrEqual(1);

      // (c) Drive the REAL move through the board: open the token's move-dropdown → pick the target
      //     (split stages render as "<name> (Queued)") → confirm PeopleInvolved (pick the seeded specialist).
      await board.moveToken(cardId, boardTargetName(to), { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;

      // (d) COUNT-DRIFT: the board re-rendered src−1 / dst+1, Σ conserved (read AFTER the move, polled
      //     until the source column reflects the departure — the board computes these from its stream).
      const after = await pollColumnCounts(board, () => true, srcKey, before[srcKey] - 1);
      assertCountConserved(before, after, { src: srcKey, dst: dstKey });

      // (e) Trail invariants after every board move (NO-ORPHAN / EVERY-MOVE-LOGGED w/ non-self lower
      //     bound / NO-STAGE-SKIPPED against the oracle / LOOP-BOUND).
      await assertTrailInvariants(`after REAL board move ${from}→${to}`);
    }

    // -----------------------------------------------------------------------------------------
    // PHASE 5 — terminal + updateDeliveryStatus-on-final assertions.
    // -----------------------------------------------------------------------------------------
    // TERMINAL-REACHED — currentstage == Completed AND the oracle gives Completed ZERO scoped out-edges.
    await assertTerminalReached(tokenDocId, VARIATION_ID, { terminal: TERMINAL, oracle: MODEL });

    // updateDeliveryStatus ON FINAL — the board fired the call when the token entered the last column.
    // We assert the ARGS the PRODUCT computed (path/status/eventRequestRef), never a value the test wrote.
    const calls = await waitForDeliveryStatusCalls(page, 1);
    const completedCall = calls.find((c) => c.status === 'completed' && c.apptPath === `queue_token/${tokenDocId}`);
    expect(
      completedCall,
      `the final board move into "${TERMINAL}" must fire guard.updateDeliveryStatus("queue_token/${tokenDocId}","completed",…). ` +
        `Captured calls: ${JSON.stringify(calls)}`,
    ).toBeTruthy();
    expect(
      completedCall!.hasEventRequestRef,
      'updateDeliveryStatus must carry a non-null eventRequestRef (the event-participation-request query) — a wrong/absent ref completes the wrong record (gap-10)',
    ).toBe(true);

    // FINAL trail snapshot: exactly the number of transitions we drove, with the operator/specialist
    // (non-self) moves present in the PRODUCT's audit trail (anti-circular lower bound).
    await settleLogRows(tokenDocId, expectedRows);
    await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
    // 16 transitions total, broken down by driver:
    //   phase 1: 1 AUTO (operator/CF) + 2 SELF                      → rows 3, nonSelf 1
    //   phase 2: 2 studio specialist moves (loop + next-cycle)      → rows 2, nonSelf 2
    //   phase 3: 2 AUTO + 2 SELF + 1 AUTO                           → rows 5, nonSelf 3
    //   phase 4: 6 operator board moves (incl. final → Completed)   → rows 6, nonSelf 6
    // ⇒ 16 rows total; 12 operator/specialist (non-self); 4 participant SELF self-moves (the 4
    //   self-movable FORM stages — the terminal Self Evolution Report→Completed is driven by the
    //   operator board here so it fires updateDeliveryStatus, hence it counts as non-self).
    expect(expectedRows, 'V2 walk drove the full 16-transition backbone (incl. 1 send-back loop)').toBe(16);
    expect(expectedNonSelf, 'V2 walk drove 12 operator/specialist (non-self) transitions').toBe(12);
  });

  // ===========================================================================================
  // FORM-WRITE INTEGRITY (flow-config.md §5 V2) — the 4 self-movable FORM stages each write exactly
  // ONE `queue stage log` row on the participant self-move, and that row's prev→curr equals the
  // oracle's selfmove+selfmv:true edge. Reads the rows the PRODUCT/self-move wrote — never a value the
  // test computed. (Driven via the participant-sim self-move stand-in, the allowed Flutter-self-move
  // substitute; the integrity is proven against the PRODUCT log + the oracle, not against the write.)
  // ===========================================================================================
  test('form-write integrity: each of the 4 self-movable stages self-moves to exactly its oracle edge, one log row', async () => {
    for (const stage of SELF_MOVABLE_FORM_STAGES) {
      // The oracle (AUTHORITY): this stage is self-movable and exposes exactly one selfmove+selfmv edge.
      expect(!!(cfg.stageproperty[stage] || {}).selfmovable, `${stage} must be configured selfmovable:true`).toBe(true);
      const selfEdges = outEdgesForVariation(MODEL, stage, VARIATION_ID).filter((e: any) => e.type === 'selfmove' && e.selfmv);
      expect(selfEdges.length, `${stage} must expose exactly ONE participant self-move edge for V2`).toBe(1);
      const to = selfEdges[0].to;

      // PRECONDITION reset: park the token on this stage with a clean log, then drive the SELF move.
      await resetTokenForWalk(tokenDocId, stage);
      const logId = await sim.advance(tokenDocId, to, { by: 'self', testrunid: TESTRUNID });
      expect(logId, `${stage} self-move must produce a queue stage log doc id`).toBeTruthy();

      // The PRODUCT's audit trail: exactly ONE row, movedby:'self', prev=stage, curr=oracle target.
      const rows = await readLogRows(tokenDocId);
      expect(rows.length, `${stage} self-move must write exactly ONE queue stage log row`).toBe(1);
      const row = rows[0];
      expect(row.movedby, `${stage} self-move row must be movedby:'self'`).toBe('self');
      expect(row.previousstage, `${stage} self-move row previousstage`).toBe(stage);
      expect(row.currentstage, `${stage} self-move row currentstage must equal the oracle self-move target`).toBe(to);

      // NO-STAGE-SKIPPED for this single hop (the row must be a legal scoped edge for V2).
      await assertNoStageSkipped(tokenDocId, MODEL, VARIATION_ID);
      // And the token itself advanced (read REAL post-state, not the value we passed to advance()).
      expect(await sim.currentStage(tokenDocId), `${stage} token must have advanced to ${to}`).toBe(to);
    }
  });
});

// =============================================================================================
// 72-JOURNEY EXPANSION (variation share) — walk EVERY distinct FORWARD journey of V2 entry→terminal.
//
// The forward path space of a variation is FINITE (the forward graph is a DAG over the variation's own
// backbone order, so the enumeration terminates) — `forwardJourneys(cfg, VARIATION_ID)` returns each
// distinct entry→terminal stage sequence. For V2 there are 9 (they share the entry→Diagnostics prefix and
// diverge across the Diagnostics-and-down operator branch set: with/without ATC Preparation, with/without
// ATC Briefing, Consultation→uP! RCW→Review vs Consultation→Self Evolution Report direct, plus the
// dead-forward Diagnostics→Diagnostics Readiness Changework terminal of journey 0).
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
// REAL-STUDIO specialist coverage (the Scope Enhancement send-back [LOOP] + the next-cycle forward move
// through the live studio panel) is the canonical walk above (LYL-NC-WF-01); re-driving an identical studio
// session in all 9 journeys would only multiply flakiness without adding forward-path coverage.
//
// Anti-circularity holds: every operator hop is a REAL board click whose `queue stage log` row the PRODUCT
// writes (counted by EVERY-MOVE-LOGGED's non-self lower bound), every observed edge is validated against
// the oracle (NO-STAGE-SKIPPED), and COUNT-DRIFT reads numbers the board computed from its live stream.
// =============================================================================================
const FORWARD_JOURNEYS: string[][] = forwardJourneys(cfg, VARIATION_ID);
/** The stage the journeys stop sharing a prefix and begin diverging on the operator board.
 *  All V2 forward journeys share `…→Diagnostics`; from Diagnostics onward the operator branch differs. */
const DIVERGENCE_STAGE = 'Diagnostics';

test.describe('V2 · LYL - Next Cycle — every forward journey entry→terminal holds the universal invariants', () => {
  let guard: ConsoleGuard;
  let tokenDocId: string;
  let cardId: string;
  let queueGenDocId: string;

  // Each journey is its own end-to-end walk (sim prefix + real-board spine); give it the full budget and
  // serialize (the suite shares one board/queue — fullyParallel is already off, but be explicit).
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    const seeded = await seedLylNextCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId).toBe(VARIATION_ID);
    tokenDocId = seeded.tokenIds[0];
    cardId = seeded.profileIds[0];
    queueGenDocId = seeded.queueGenDocId;
    // Sanity: the enumeration must match the known V2 forward-journey count (≈9). A drift here means the
    // flow-model / config changed and the expansion is stale — fail loud rather than under-cover.
    expect(FORWARD_JOURNEYS.length, 'V2 must enumerate its 9 distinct forward journeys').toBe(9);
    // Every journey starts at V2's entry and every transition is an oracle-legal scoped edge (guards the
    // data source — a journey with an illegal hop would be a flow-model regression, not a test bug).
    for (const j of FORWARD_JOURNEYS) {
      expect(j[0], 'every journey starts at the V2 entry stage').toBe('Evolution Prep Orientation');
      for (let k = 1; k < j.length; k++) {
        legalEdge(j[k - 1], j[k]); // throws if any hop is not a legal scoped edge for V2
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

      // Fresh participant at the entry gate (PRECONDITION). resetTokenForWalk also pins the PREFIXED
      // variationid so the real board can scope this token's move targets.
      await resetTokenForWalk(tokenDocId, journey[0]);

      let expectedRows = 0;     // total `queue stage log` rows the PRODUCT should have written so far
      let expectedNonSelf = 0;  // of those, operator/specialist (movedby != 'self')

      /** The trail-only universal invariants (COUNT-DRIFT is asserted inline around each board move). */
      async function assertTrailInvariants(ctx: string): Promise<void> {
        // Settle the just-committed log row into the query index before the un-polled count assertion
        // (real-cloud read-after-write race — see settleLogRows). No-op delay during the sim prefix.
        await settleLogRows(tokenDocId, expectedRows);
        await assertNoOrphan(tokenDocId);
        await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
        await assertNoStageSkipped(tokenDocId, MODEL, VARIATION_ID);
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

        // (b) COUNT-DRIFT: board column counts BEFORE the move (APP-computed, polled).
        const before = await board.readAllColumnCounts();
        const srcKey = columnKey(from);
        const dstKey = columnKey(to);
        expect(before[srcKey], `[journey ${ji}] board must render a count for source column "${srcKey}" before ${from}→${to}`).toBeGreaterThanOrEqual(1);

        // (c) drive the REAL operator move (split stages render as "<name> (Queued)"; pick the seeded
        //     specialist in the PeopleInvolved confirm).
        await board.moveToken(cardId, boardTargetName(to), { specialist: `specialist0+${TESTRUNID}@example.com` });
        expectedRows++; expectedNonSelf++;

        // (d) COUNT-DRIFT: board re-rendered src−1 / dst+1, Σ conserved (read AFTER, polled until the
        //     source column reflects the departure — values the board computed from its stream).
        const after = await pollColumnCounts(board, () => true, srcKey, before[srcKey] - 1);
        assertCountConserved(before, after, { src: srcKey, dst: dstKey });

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
      const fwdFromTerminal = outEdgesForVariation(MODEL, terminal, VARIATION_ID).filter((e: any) => !e.loop && !e.back);
      expect(
        fwdFromTerminal.length,
        `[journey ${ji}] terminal "${terminal}" must have ZERO forward scoped out-edges (a real forward dead-end). Got: ` +
          JSON.stringify(fwdFromTerminal.map((e: any) => e.to)),
      ).toBe(0);
      if (terminal === TERMINAL) {
        // Completed is the multi-stage true terminal — additionally assert it has ZERO scoped out-edges of
        // ANY kind (the move-dropdown is genuinely empty) and that the final move fired updateDeliveryStatus.
        await assertTerminalReached(tokenDocId, VARIATION_ID, { terminal: TERMINAL, oracle: MODEL });
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
      await settleLogRows(tokenDocId, expectedRows);
      await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Local helper — poll the board's per-column counts until the SOURCE column reflects the departure.
// (collectionData is async — SHARED CONVENTIONS: use expect.poll for live-stream-dependent reads.)
// ---------------------------------------------------------------------------------------------
async function pollColumnCounts(
  board: QueueBoardPage,
  _predicate: (counts: Record<string, number>) => boolean,
  srcKey: string,
  expectedSrc: number,
): Promise<Record<string, number>> {
  let last: Record<string, number> = {};
  await expect
    .poll(
      async () => {
        last = await board.readAllColumnCounts();
        return last[srcKey];
      },
      {
        message: `board source column "${srcKey}" never re-rendered to ${expectedSrc} after the move (stream not settled?)`,
        timeout: 20_000,
        intervals: [200, 400, 800, 1200],
      },
    )
    .toBe(expectedSrc);
  return last;
}
