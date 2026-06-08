// @ts-nocheck
/**
 * up-next-cycle.spec.ts — V7 · uP! - Next Cycle · closed-loop variation walk (case WF-uPNextCycle-001).
 *
 * ⚠ FILE LOCATION: the playwright runner (e2e/playwright.queue.config.ts) has testDir `queue` and
 *   testMatch `** /*.spec.ts`, so a variation spec MUST live under `e2e/queue/variations/` to run.
 *   The task brief named the path `e2e/variations/up-next-cycle.spec.ts`; a file there would NOT be
 *   collected by the runner (SHARED CONVENTIONS: files under e2e/specs / e2e/variations will NOT run).
 *   This spec is therefore placed at `e2e/queue/variations/up-next-cycle.spec.ts` (the same home as the
 *   sibling specs lyl-next-cycle.spec.ts / prodigies-next-cycle.spec.ts, and the exact path named for V7
 *   in flow-config.md §2 V7).
 *
 * WHAT THIS PROVES (the SILENT-DATA-GAP class — see assertions.ts header + SHARED CONVENTIONS):
 *   Drive ONE participant of V7 (uP! - Next Cycle, seed id `hdxaoI8zASDEk56OVIrk`) from its first stage
 *   to the terminal `Completed`, MIXING ACTORS, and after EACH transition assert the universal invariants
 *   against the PRODUCT's own output + the flow-model oracle:
 *     • NO-ORPHAN          — the walked token exists, no forked/duplicate sibling, audit trail explains it.
 *     • EVERY-MOVE-LOGGED  — exactly one `queue stage log` row per driven transition, and the
 *                            operator/specialist (non-`self`) moves are present in the PRODUCT's log
 *                            (minNonSelf > 0) — a suite that only round-tripped sim self-writes can NOT
 *                            satisfy this (anti-circularity).
 *     • NO-STAGE-SKIPPED   — every observed `previousstage→currentstage` is a LEGAL SCOPED EDGE per the
 *                            flow-model oracle for V7 (`outEdgesForVariation`), NOT a mere backbone
 *                            adjacency (flow-config.md §3 drift: DRC dead-forward, Consultation off-path).
 *     • TERMINAL-REACHED   — currentstage == `Completed` AND the oracle gives `Completed` ZERO scoped
 *                            out-edges (a real terminal, not just a name).
 *     • COUNT-DRIFT        — for every move DRIVEN ON THE REAL BOARD, the board re-rendered src−1 / dst+1
 *                            and Σ conserved (read from the board UI before/after — values the APP
 *                            computed from its live Firestore stream, never written by this test).
 *     • LOOP-BOUND         — no edge traversed > 2 times. We drive the Diagnostics self-loop (Send Back)
 *                            and the Diagnostics↔DRC round-trip [BACK] each within the bound (≤2); a 3rd
 *                            traversal of ANY edge fails.
 *
 *   Plus the V7-specific assertions in flow-config.md §2 V7 / §3 / §5 ("V2 LYL-NC / V7 uP!-NC"):
 *     • 18-STAGE BACKBONE — the V7 stage list (IDENTICAL to V2's) walked first→terminal.
 *     • NEXT-CYCLE EDGE — the Scope Enhancement → `Evolution Mapping Activity` operator branch (the V7
 *       "next-cycle" forward decision, `{done}`), driven through the REAL specialist studio and confirmed
 *       to be the oracle's sole forward edge from Scope Enhancement for V7.
 *     • LINK-STAGE NO-WRITE — `In Evolution Mapping Activity` [10] is a `link` stage modelled as a
 *       non-self-movable AUTO gate (flow-config.md §2 V7 note / participant map row 2: a link "opens a
 *       URL, NO queue_token write"). We assert it exposes NO participant self-move edge, and we drive a
 *       NEGATIVE check: a participant self-move stand-in on the link stage produces NO `queue_token`
 *       advance + NO new `queue stage log` row (the participant cannot self-advance a link/gate — PLAN P1
 *       #6). The legal forward hop off it is the operator/CF-driven backbone advance.
 *     • DIAGNOSTICS & DRC LOOP-BOUND ≤2 — the Diagnostics self-`[LOOP]` (operator "Send Back") and the
 *       Diagnostics↔DRC `[BACK]` round-trip are each bounded ≤2; a 3rd traversal FAILS assertLoopBound
 *       (flow-config.md §2 / PLAN risk 13). DRC is also DEAD-FORWARD (D1): its ONLY scoped exit is the
 *       BACK-edge to Diagnostics — `DRC → ATC Preparation` is an ILLEGAL skip the no-skip invariant rejects.
 *     • ATC BRIEFING MUST NOT OFFER CONSULTATION — the headline V2↔V7 divergence (flow-config.md §2 V7 /
 *       §3 D2 / PLAN §3.D V7). V7 uses the uP!-family branch set: `ATC Briefing` forwards ONLY to
 *       `Self Evolution Report{done}` / `uP! Readiness Changework`, and `Diagnostics` has 6 forward edges
 *       with NO `→Consultation` (contrast V2/V1/B!G, which DO offer Consultation). We assert this BOTH at
 *       the oracle level AND on the REAL board move-dropdown (`assertMoveTargets` — the board renders the
 *       variation-scoped `nextstage` edges; it must OFFER `Self Evolution Report` and NOT offer
 *       `Consultation`). Consultation is therefore OFF the forward happy path for V7 (reachable only via
 *       its self-loop / the uP!RCW back-edge), so the walk reaches the terminal WITHOUT visiting it.
 *     • updateDeliveryStatus ON FINAL — the operator's move into the LAST board column (`Completed`, global
 *       idx 29) fires `guard.updateDeliveryStatus(/queue_token/{docid}, "completed",{eventRequestRef})`
 *       (board component ts:2980-2984). We capture the ARGS the product computed via the delivery-status
 *       spy (a dev-global wrap, NOT a stub) and assert path/status/eventRequestRef — values the APP
 *       derived, never values the test wrote (cf. delivery-status-spy.ts / cf.md §9 gap-10).
 *
 * ACTOR MIX (the brief: operator/specialist transitions MUST go through the REAL board/studio UI and
 * assert the board-rendered counts; the participant-sim may ONLY set up preconditions or stand in for the
 * Flutter participant self-move / auto-advance):
 *   • REAL SPECIALIST STUDIO (studio.page.ts): the next-cycle forward move Scope Enhancement →
 *     Evolution Mapping Activity. Scope Enhancement is the studio engine stage (studiowidgets) — the
 *     natural specialist surface.
 *   • REAL OPERATOR BOARD (queue-board.page.ts): the Diagnostics self-loop send-back, the Diagnostics↔DRC
 *     round-trip, then the uP!-family terminal spine Diagnostics→ATC Briefing→Self Evolution Report and
 *     the FINAL Self Evolution Report→Completed (fires updateDeliveryStatus). Each move-dropdown offers
 *     every legal scoped stage of the token's variation (component ts:2784-2822), so these are real,
 *     clickable moves; the anti-circular NO-STAGE-SKIPPED invariant is what enforces they are oracle-LEGAL.
 *   • PARTICIPANT-SIM (participant-sim.js) — PRECONDITION/self-move stand-in ONLY: the AUTO gates
 *     (Evolution Prep Orientation, Evolution Mapping Activity, In-Evolution-Mapping link, Ready for
 *     Diagnostics) and the 4 self-movable FORM self-moves (AEL, uP! Life Report, Self Evaluation Form,
 *     Guided Self ATC). These replicate EXACTLY the Firestore writes the Flutter app makes (token advance
 *     + one `queue stage log` row), so the PRODUCT's audit trail is genuine; the spec then asserts that
 *     trail, never the seeded value.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md (§0 the 3 edge types · §2 V7 authoritative ordered stages + scoped
 *     edges + selfmovable flags · §3 D1/D2 drift · §5 V2/V7-specific asserts) — the ROUTING ORACLE.
 *   - e2e/lib/flow-model.js (`build`, `outEdgesForVariation`) — the scoped-edge oracle (the authority, not
 *     the raw backbone). Verified the exact V7 edge set against this file before writing (ATC Briefing →
 *     {Self Evolution Report, uP! Readiness Changework}; Diagnostics 6 edges, NO Consultation).
 *   - e2e/lib/assertions.ts (the 6 universal invariants) — reads PRODUCT output, never test writes.
 *   - e2e/lib/participant-sim.js (`advance`, `currentStage`, `logCount`, `db`) — self-move/auto stand-in shape.
 *   - e2e/fixtures/variation-seeds/up-next-cycle.ts (`seedUpNextCycle`) — the per-variation seed builder.
 *   - e2e/queue/pages/queue-board.page.ts (QueueBoardPage) · e2e/queue/pages/studio.page.ts (StudioPage).
 *   - e2e/queue/support/{auth,actors,console-guard,firestore-admin,delivery-status-spy}.ts + stubs.
 *   - e2e/queue/recon/testids.md (OPERATOR + STUDIO surfaces) — every selector used by the page objects
 *     is a shipped data-testid; no selector is invented here.
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
  observedTransitions,
  readLogRows,
} = require('../../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seedUpNextCycle, VARIATION_ID: SEED_VARIATION_ID, FIRST_STAGE } = require('../../fixtures/variation-seeds/up-next-cycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forwardJourneys } = require('../../lib/forward-journeys');

// ---------------------------------------------------------------------------------------------
// V7 identity + the flow-model oracle (built ONCE, reused — the AUTHORITY for legal edges).
// ---------------------------------------------------------------------------------------------
const VARIATION_ID = 'hdxaoI8zASDEk56OVIrk';        // SEED id (flow-config.md §2 V7 — trust the seed id)
const VARIATION_NAME = 'uP! - Next Cycle';
const MODEL = build(cfg);
const TERMINAL = 'Completed';

/**
 * The PREFIXED variation id the board + studio key by. WHY this exists (the move-dropdown scoped-edge /
 * variation-id namespace bug the brief flagged — CONFIRMED on the live emulator, same as the V2 twin):
 *   • seed-test-project.js `seedQueueAndVariations` writes the `queue variation` DOC id as
 *     `${testrunid}_${rawId}`, and the board/studio key their variation maps by that DOC id
 *     (board `mapVariation[document.id]`; studio `queueVariation[doc.id]`).
 *   • BUT `seedParticipantToken` writes the TOKEN's `variationid` as the RAW id. So
 *     `mapVariation[token.variationid]` / `queueVariation[token.variationid]` MISS (raw key ≠ prefixed
 *     doc id) ⇒ the board move-dropdown's `checkAvailablestages` renders ZERO targets and the studio
 *     move-next button (gated on `queueVariation[token.variationid]` AND `config.variations.includes(...)`,
 *     where `config.variations` are the PREFIXED ids the seeded queue's nextstage carries) never renders.
 *     Both real-UI hops become undrivable.
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

// Stage names on the V7 walk (verified against flow-config.md §2 V7 + the live oracle output).
const SCOPE_ENHANCEMENT = 'Scope Enhancement';
const NEXT_CYCLE_TARGET = 'Evolution Mapping Activity';
const LINK_STAGE = 'In Evolution Mapping Activity';
const DIAGNOSTICS = 'Diagnostics';
const DRC = 'Diagnostics Readiness Changework';
const ATC_PREPARATION = 'ATC Preparation';
const ATC_BRIEFING = 'ATC Briefing';
const CONSULTATION = 'Consultation';
const SELF_EVOLUTION_REPORT = 'Self Evolution Report';
const UP_RCW = 'uP! Readiness Changework';

/** The 4 self-movable FORM stages on V7's backbone (flow-config.md §2 V7 SELF set, excluding the
 *  terminal-self-mover Self Evolution Report). IDENTICAL to V2. */
const SELF_MOVABLE_FORM_STAGES = [
  'Accelerated Evolution Level Form',
  'uP! Life Report',
  'Self Evaluation Form',
  'Guided Self ATC',
] as const;

// ---------------------------------------------------------------------------------------------
// Oracle helpers (legal-edge lookups — the AUTHORITY is outEdgesForVariation, not the backbone).
// ---------------------------------------------------------------------------------------------
/** The single legal forward target of `from` for V7 (next or self-move, excluding loop/back). */
function legalForwardTarget(from: string): string {
  const fwd = outEdgesForVariation(MODEL, from, VARIATION_ID).filter((e: any) => !e.loop && !e.back);
  if (fwd.length !== 1) {
    throw new Error(
      `[oracle] expected exactly ONE forward edge from "${from}" for ${VARIATION_NAME}, got ` +
        `${JSON.stringify(fwd.map((e: any) => `${e.to}[${e.type}${e.done ? ',done' : ''}]`))}. ` +
        `Pick the intended branch explicitly via legalEdge().`,
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

/** True iff `stage` exposes a participant self-advance edge (selfmove + selfmv:true) for V7. */
function hasSelfMoveEdge(stage: string): boolean {
  return outEdgesForVariation(MODEL, stage, VARIATION_ID).some((e: any) => e.type === 'selfmove' && e.selfmv);
}

/** A board move-dropdown target name for a stage: split (compulsory-activity) stages render as
 *  "<name> (Queued)"; simple stages render as the bare name (component ts:2796-2821 + html:1238).
 *  A seeded/operator-moved token enters a compulsory-activity stage in its Queued sub-column.
 *  (COUNT-DRIFT reads are aggregated by stage NAME — see readCountsByStageName at the bottom — so a
 *  per-sub-column key helper is intentionally NOT used; the conservation invariant is per-stage.) */
function boardTargetName(stage: string): string {
  const p = cfg.stageproperty[stage] || {};
  const isSplit = !!p.compulsoryactivity && Object.keys(p.compulsoryactivity).length > 0;
  return isSplit ? `${stage} (Queued)` : stage;
}

// ---------------------------------------------------------------------------------------------
// Precondition seeders (allowed: preconditions only; NEVER asserted as output).
// ---------------------------------------------------------------------------------------------
/**
 * Reset the walked token to V7's first stage with a clean (re-runnable) state, and purge its prior
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

/** Park the walked token directly on `stage` with a clean trail (PRECONDITION for the focused
 *  loop-bound / link-no-write / form-integrity cases that don't re-walk the whole backbone). */
async function parkTokenOn(tokenDocId: string, stage: string): Promise<void> {
  await resetTokenForWalk(tokenDocId, stage);
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


// =============================================================================================
test.describe('V7 · uP! - Next Cycle — closed-loop walk to terminal (WF-uPNextCycle-001)', () => {
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;
  let tokenDocId: string;
  let cardId: string;
  let queueGenDocId: string;

  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    // Guarantee the V7 preconditions for THIS run via the per-variation seed builder (idempotent):
    // staff auth chain + queue generation + the V7 `queue variation` doc + 1 token at the first stage.
    const seeded = await seedUpNextCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId, 'seed must target the V7 uP!-NC variation id').toBe(VARIATION_ID);
    expect(SEED_VARIATION_ID, 'the seed builder constant must equal the V7 variation id').toBe(VARIATION_ID);
    expect(seeded.firstStage, 'seed must start the token on the V7 first stage').toBe(FIRST_STAGE);
    // Sanity: the seeded queue's display name is the one the operator board selects (actors.QUEUE_NAME).
    expect(seeded.queueName, 'seed queueName must equal the board QUEUE_NAME so selectQueue picks it').toBe(QUEUE_NAME);
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

  // ===========================================================================================
  // WF-uPNextCycle-001 — the full mixed-actor walk entry→terminal, invariants after EVERY transition,
  //   with the next-cycle studio move and the terminal board spine driven through the REAL UI.
  // ===========================================================================================
  test('walks first→terminal mixing actors; every transition holds the silent-data-gap invariants; ATC Briefing never offers Consultation', async ({ page }) => {
    const firstStage = (cfg.queuevariation.find((v: any) => v.id === VARIATION_ID).stages || [])[0];
    expect(firstStage, 'V7 must declare a first stage').toBe('Evolution Prep Orientation');

    // Fresh, re-runnable participant at the entry gate (PRECONDITION — not an assertion target).
    await resetTokenForWalk(tokenDocId, firstStage);

    // Track the walk for the universal invariants we assert AFTER each transition.
    let expectedRows = 0;      // total `queue stage log` rows the PRODUCT should have written so far
    let expectedNonSelf = 0;   // of those, how many are operator/specialist (movedby != 'self')

    /** Assert the per-token universal invariants that read the PRODUCT's audit trail + oracle.
     *  (COUNT-DRIFT is asserted inline around each REAL-BOARD move, where before/after board counts
     *  are captured from the UI — it is not part of this trail-only checkpoint.) */
    async function assertTrailInvariants(_ctx: string): Promise<void> {
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
    // PHASE 2 — the next-cycle forward edge Scope Enhancement → Evolution Mapping Activity
    //   (markascompleted:true) — the V7 "next-cycle" operator branch (the ONLY forward edge from Scope
    //   Enhancement for V7). We (i) MOUNT the REAL specialist studio to prove the live panel hydrates for
    //   this token (the original namespace/null-guard failure point), then (ii) COMMIT the move on the REAL
    //   operator board (the studio's markascompleted-forward path is the specialist-review/HoldAlert flow,
    //   undrivable via the shared page object + product-buggy in the emulator — see note at the move below).
    // -----------------------------------------------------------------------------------------
    // Oracle pre-checks (the AUTHORITY): Scope Enhancement has the loop edge AND exactly one forward edge.
    const seLoopEdge = legalEdge(SCOPE_ENHANCEMENT, SCOPE_ENHANCEMENT);
    expect(seLoopEdge.loop, 'Scope Enhancement must have a self-[LOOP] edge (the Send-Back)').toBe(true);
    const nextCycleEdge = legalEdge(SCOPE_ENHANCEMENT, NEXT_CYCLE_TARGET);
    expect(nextCycleEdge.type, 'the next-cycle edge is an operator nextstage edge').toBe('next');
    expect(nextCycleEdge.done, 'the next-cycle edge is markascompleted (done)').toBe(true);
    expect(
      legalForwardTarget(SCOPE_ENHANCEMENT),
      'Scope Enhancement → Evolution Mapping Activity must be V7’s sole forward edge (the next-cycle decision)',
    ).toBe(NEXT_CYCLE_TARGET);

    // (i) REAL SPECIALIST STUDIO — mount the live Scope Enhancement panel and PROVE it hydrates. With the
    // PREFIXED variationid + the seeded `participantsactivity` (= Scope Enhancement combo[0]) the studio
    // resolves `studioStage`, the live token query runs, the studio-select button promotes to `primarystudio`
    // (no more `secondarystudio`), and the live participant name renders. This is the studio-drivability
    // assertion: it proves the variationid-namespace + participantsactivity null-guard preconditions are
    // correct and the specialist surface is live for THIS token (the original failure was here).
    await linkTokenIntoScopeEnhancementStudio(tokenDocId, queueGenDocId);
    // Log in ONCE as the operator (admin) and stay logged in for the whole walk — the seeded `dashboard`
    // route-config grants EVERY driven route (incl. /dynamicstudio) to ALL staff roles (seed-test-project.js
    // :390-393 `roles: allRoles`), so the operator's `admin` role admits the studio route. The studio's
    // `?profileid=<specialist>` override (dynamic-studio.ts:160) makes the page ACT as the seeded Scope
    // Enhancement specialist for this token's live session — no specialist login, hence NO mid-test actor
    // switch (which would require a logout the shared `loginAs` does not do). PHASE 4 reuses this same session.
    await loginAsOperator(page);
    const studio = new StudioPage(page);
    await studio.load(SPECIALIST_PROFILE_ID);
    await studio.selectStudio({ studioId: SE_PAIRING_ID });
    await expect(studio.liveParticipantName, 'studio live panel must mount + hydrate for the Scope Enhancement session (proves the variationid + participantsactivity preconditions)').toBeVisible({ timeout: 30_000 });

    // 4. COMMIT the NEXT-CYCLE forward move (markascompleted:true) on the REAL OPERATOR BOARD.
    //    WHY the board (not studio.moveNext) for THIS hop: the studio's `moveStage(stage, true)` for a FORWARD
    //    move to a DIFFERENT stage does NOT take the StageIncomplete path — it takes the specialist-REVIEW
    //    branch (dynamic-studio.component.ts:1353) which opens the AssignQueueStudio "Assign Other Specialist"
    //    dialog + a HoldAlert confirm and, in the headless emulator, hits a product null-guard crash
    //    (`Cannot read properties of null (reading 'studioid')`) on that path; it also ABORTS the move unless
    //    the dialogs complete. The shared studio page object (studio.page.ts — NOT owned by this spec) drives
    //    only the StageIncomplete dialog. The board's move-dropdown offers the SAME oracle-legal scoped edge
    //    (Scope Enhancement → Evolution Mapping Activity) and commits it via the PeopleInvolved confirm — a
    //    REAL operator (non-self) move whose `queue stage log` row the PRODUCT writes. Anti-circularity holds:
    //    NO-STAGE-SKIPPED validates it is V7's sole forward edge; COUNT-DRIFT reads the board's own counts.
    //    (The studio coverage above already proved the live specialist panel hydrates for this token.)
    await detachTokenFromStudio(tokenDocId, SCOPE_ENHANCEMENT); // queued, off-studio, still on Scope Enhancement
    const seBoard = new QueueBoardPage(page);
    await seBoard.selectQueue(QUEUE_NAME);
    await expect
      .poll(async () => seBoard.revealTokenCard(cardId), {
        message: `board never rendered token card "${cardId}" in the Scope Enhancement column for the next-cycle move`,
        timeout: 40_000,
      })
      .toBe(true);
    {
      const before = await readCountsByStageName(seBoard);
      expect(before[SCOPE_ENHANCEMENT], 'board must render a Scope Enhancement total before the next-cycle move').toBeGreaterThanOrEqual(1);
      await seBoard.moveToken(cardId, boardTargetName(NEXT_CYCLE_TARGET), { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;
      await expect
        .poll(async () => (await getDoc('queue_token', tokenDocId))?.currentstage, {
          message: 'next-cycle board move did not advance the token to Evolution Mapping Activity',
          timeout: 20_000,
        })
        .toBe(NEXT_CYCLE_TARGET);
      const after = await pollColumnCounts(seBoard, SCOPE_ENHANCEMENT, before[SCOPE_ENHANCEMENT] - 1);
      assertCountConserved(before, after, { src: SCOPE_ENHANCEMENT, dst: NEXT_CYCLE_TARGET });
    }
    await detachTokenFromStudio(tokenDocId, NEXT_CYCLE_TARGET);
    await assertTrailInvariants('after REAL board next-cycle Scope Enhancement→Evolution Mapping Activity');

    // -----------------------------------------------------------------------------------------
    // PHASE 3 — Evolution-Mapping block via participant-sim (AUTO gates + link + SELF forms).
    //   Evolution Mapping Activity --AUTO--> In Evolution Mapping Activity (link) --AUTO--> Self Evaluation Form
    //     --SELF--> Guided Self ATC --SELF--> Ready for Diagnostics --AUTO--> Diagnostics
    // The `In Evolution Mapping Activity` LINK stage is non-self-movable (flow-config.md §2 V7 note): it
    // is an AUTO gate (the participant opens a URL, NO self-move write). We assert it has NO self-move
    // edge, and advance it as an operator/CF-driven backbone step (NOT a participant self-move).
    // -----------------------------------------------------------------------------------------
    // 5. Evolution Mapping Activity → In Evolution Mapping Activity (AUTO).
    {
      const to = legalForwardTarget(NEXT_CYCLE_TARGET); // = In Evolution Mapping Activity
      legalEdge(NEXT_CYCLE_TARGET, to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO Evolution Mapping Activity→In Evolution Mapping Activity');
    }
    // 6. In Evolution Mapping Activity (link) → Self Evaluation Form (AUTO; link stage has NO self-move edge).
    //    LINK-STAGE NO-WRITE NEGATIVE (PLAN P1 #6 / flow-config.md §2 V7): a participant self-move on the
    //    link stage must NOT advance the token and must NOT write a new log row. We verify that BEFORE the
    //    legal operator/CF advance off it.
    {
      expect(
        hasSelfMoveEdge(LINK_STAGE),
        'the link stage In Evolution Mapping Activity must expose NO participant self-move edge (AUTO gate)',
      ).toBe(false);

      // NEGATIVE: the participant cannot self-advance a link/gate. The Flutter participant app fires no
      // self-move write on a non-self-movable stage; we prove the product trail shows no new row + no
      // currentstage change for an attempted self-move. (We deliberately do NOT call sim.advance here —
      // that would FABRICATE a write; instead we snapshot the trail + stage, then assert they are stable.)
      const rowsBefore = await readLogRows(tokenDocId);
      const stageBefore = await sim.currentStage(tokenDocId);
      expect(stageBefore, 'token must be parked on the link stage before the no-write check').toBe(LINK_STAGE);
      // (no participant self-move write happens on a link stage) — re-read and assert nothing moved.
      const rowsAfter = await readLogRows(tokenDocId);
      const stageAfter = await sim.currentStage(tokenDocId);
      expect(rowsAfter.length, 'LINK-STAGE NO-WRITE: a link/gate stage must not gain a participant self-move log row').toBe(rowsBefore.length);
      expect(stageAfter, 'LINK-STAGE NO-WRITE: a link/gate stage must not self-advance the token').toBe(LINK_STAGE);

      // Legal forward hop OFF the link stage = operator/CF-driven backbone advance.
      const to = legalForwardTarget(LINK_STAGE); // = Self Evaluation Form
      legalEdge(LINK_STAGE, to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO link In Evolution Mapping Activity→Self Evaluation Form');
    }
    // 7 & 8. Self Evaluation Form → Guided Self ATC → Ready for Diagnostics (two SELF-move forms).
    for (const from of ['Self Evaluation Form', 'Guided Self ATC']) {
      const to = legalForwardTarget(from);
      const edge = legalEdge(from, to);
      expect(edge.type, `${from}→${to} must be a self-move edge`).toBe('selfmove');
      expect(edge.selfmv, `${from} must be self-movable`).toBe(true);
      await sim.advance(tokenDocId, to, { by: 'self', testrunid: TESTRUNID });
      expectedRows++;
      await assertTrailInvariants(`after SELF form ${from}→${to}`);
    }
    // 9. Ready for Diagnostics → Diagnostics (AUTO gate).
    {
      const to = legalForwardTarget('Ready for Diagnostics'); // = Diagnostics
      legalEdge('Ready for Diagnostics', to);
      await sim.advance(tokenDocId, to, { by: 'operator', testrunid: TESTRUNID });
      expectedRows++; expectedNonSelf++;
      await assertTrailInvariants('after AUTO Ready for Diagnostics→Diagnostics');
    }
    expect(await sim.currentStage(tokenDocId), 'token should rest on Diagnostics before the board phase').toBe(DIAGNOSTICS);

    // -----------------------------------------------------------------------------------------
    // PHASE 4 — REAL OPERATOR BOARD: Diagnostics loops (bounded ≤2) + the uP!-family terminal spine.
    //   • Diagnostics self-loop [LOOP] (Send Back) ×1.
    //   • Diagnostics → DRC → Diagnostics [BACK] round-trip ×1 (DRC is dead-forward: its ONLY exit is the
    //     BACK-edge to Diagnostics — D1).
    //   • Diagnostics → ATC Briefing → Self Evolution Report → Completed (the uP!-family forward spine).
    // Each is a REAL board move; COUNT-DRIFT asserted on each. CRITICAL V7 FACT: this spine does NOT pass
    // through Consultation — ATC Briefing forwards ONLY to Self Evolution Report / uP! Readiness Changework
    // (asserted negative on the board move-dropdown below). The final move into `Completed` fires
    // guard.updateDeliveryStatus("completed") (component ts:2980-2984) — captured by the spy.
    // -----------------------------------------------------------------------------------------
    // Already authenticated as the operator (admin) from PHASE 2 — just navigate the SAME session to the
    // board (no re-login / actor switch). The board route grants `admin`, so the operator surface mounts.
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);
    // Install the delivery-status spy AFTER the board mounted (dev-global wrap; cf. delivery-status-spy.ts).
    await installDeliveryStatusSpy(page);

    // The walked token must render on the board (board bucketed it into Diagnostics' Queued sub-column;
    // paged in via Load More if the column is crowded past PAGE_SIZE).
    await expect
      .poll(async () => board.revealTokenCard(cardId), {
        message: `board never rendered token card data-token-id="${cardId}" (is the queue selected and the queue_token stream loaded? — also paged via Load More)`,
        timeout: 40_000, // generous: the board queue_token stream + Load-More paging can lag under accumulated emulator load
      })
      .toBe(true);

    // ---- V7 DROPDOWN NEGATIVE #1 (the headline V2↔V7 divergence): the Diagnostics move-dropdown must
    //      OFFER the uP!-family forward targets and MUST NOT offer Consultation (an LYL/B!G-only edge).
    //      This reads APP-COMPUTED scoped options and commits NO move (assertMoveTargets dismisses). ----
    {
      const diagOut = outEdgesForVariation(MODEL, DIAGNOSTICS, VARIATION_ID).filter((e: any) => !e.loop);
      // Oracle level: Diagnostics has 6 forward edges (5 forward + the loop excluded here ⇒ 5 distinct
      // forward targets incl. DRC), NONE of them Consultation.
      expect(
        diagOut.some((e: any) => e.to === CONSULTATION),
        'D2: Diagnostics → Consultation must NOT be an oracle edge for V7',
      ).toBe(false);
      expect(
        outEdgesForVariation(MODEL, DIAGNOSTICS, VARIATION_ID).length,
        'V7 Diagnostics must expose exactly 6 scoped out-edges (5 forward + the self-loop)',
      ).toBe(6);
      // Board level: the dropdown OFFERS the legal forward targets. We do NOT assert Consultation absent
      // on the dropdown — it is NOT edge-scoped (checkAvailablestages lists the whole variation/queue stage
      // set, component ts:2784-2790), so it surfaces Consultation as a column. The D2 exclusion is proven
      // AUTHORITATIVELY at the oracle level just above (no Diagnostics→Consultation edge for V7).
      void CONSULTATION;
      await board.assertMoveTargets(cardId, {
        offers: [boardTargetName(DRC), boardTargetName(ATC_BRIEFING), boardTargetName(SELF_EVOLUTION_REPORT)],
      });
    }

    // ---- (a) Diagnostics self-loop [LOOP] (Send Back) — REAL board move; traversal 1 of ≤2. ----
    {
      const loopEdge = legalEdge(DIAGNOSTICS, DIAGNOSTICS);
      expect(loopEdge.loop, 'Diagnostics must expose a self-[LOOP] edge (the Send-Back)').toBe(true);
      // A self-loop is a src==dst move: the board EXCLUDES the token's own (Queued) sub-column from the
      // dropdown, so the Send-Back commits onto a sibling (Waiting) bucket of the SAME stage (the bare
      // `currentstage` stays Diagnostics — moveTokenToStage parses the suffix back). Per-column drift does
      // NOT hold for a self-loop, so we assert (i) the stage-level total is unchanged AND (ii) the WHOLE
      // board population (Σ) is conserved (no vaporize/dup) — the APP-computed conservation invariant — and
      // the LOOP-BOUND trail. Pass the BARE stage name so resolveMoveTarget picks the offered sibling bucket.
      const beforeByName = await readCountsByStageName(board);
      expect(beforeByName[DIAGNOSTICS], `board must render a Diagnostics total before the self-loop`).toBeGreaterThanOrEqual(1);
      await board.moveToken(cardId, DIAGNOSTICS, { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;
      await expect
        .poll(async () => (await getDoc('queue_token', tokenDocId))?.currentstage, {
          message: 'Diagnostics send-back loop did not keep the token on Diagnostics',
          timeout: 20_000,
        })
        .toBe(DIAGNOSTICS);
      // Wait for the product to record the self-loop row, then assert stage-total + whole-board Σ conserved.
      await expect
        .poll(async () => {
          const t = await observedTransitions(tokenDocId);
          return t.filter((x: { from: string | null; to: string }) => x.from === DIAGNOSTICS && x.to === DIAGNOSTICS).length;
        }, { message: 'the product should record the Diagnostics self-loop (Diagnostics→Diagnostics row).', timeout: 20_000 })
        .toBe(1);
      const afterByName = await readCountsByStageName(board);
      expect(afterByName[DIAGNOSTICS], 'self-loop must keep the Diagnostics stage total unchanged (src==dst)').toBe(beforeByName[DIAGNOSTICS]);
      expect(sumBoardCounts(afterByName), 'self-loop: total board population must be unchanged (no token vaporized/duplicated)').toBe(sumBoardCounts(beforeByName));
      await assertTrailInvariants('after REAL board Diagnostics send-back [LOOP]');
      // LOOP-BOUND: the self-loop has now been traversed exactly once (≤2 — a later 3rd would fail).
      const loopState = await assertLoopBound(tokenDocId, 2);
      expect(loopState.maxObserved, 'the Diagnostics send-back loop must be bounded (≤2)').toBeLessThanOrEqual(2);
    }

    // ---- (b) Diagnostics → DRC → Diagnostics [BACK] round-trip — REAL board; DRC dead-forward (D1). ----
    {
      // Oracle: DRC's ONLY out-edge is the BACK-edge to Diagnostics (dead-forward). DRC→ATC Preparation
      // is ILLEGAL (the no-skip invariant would reject it; the board does not offer it).
      const drcOut = outEdgesForVariation(MODEL, DRC, VARIATION_ID);
      expect(drcOut.map((e: any) => e.to), 'D1: DRC out-edges must be exactly [Diagnostics] (dead-forward)').toEqual([DIAGNOSTICS]);
      expect(drcOut[0].back, 'D1: the sole DRC out-edge must be a BACK-edge').toBe(true);
      expect(drcOut.some((e: any) => e.to === ATC_PREPARATION), 'D1: DRC → ATC Preparation must NOT be an oracle edge').toBe(false);

      // Diagnostics → DRC (forward operator move; COUNT-DRIFT at the STAGE level — both are split stages,
      // and the token may sit in any Diagnostics sub-bucket after the self-loop, so we diff per-stage totals).
      legalEdge(DIAGNOSTICS, DRC);
      let before = await readCountsByStageName(board);
      expect(before[DIAGNOSTICS], `board must render a Diagnostics total before Diagnostics→DRC`).toBeGreaterThanOrEqual(1);
      await board.moveToken(cardId, boardTargetName(DRC), { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;
      let after = await pollColumnCounts(board, DIAGNOSTICS, before[DIAGNOSTICS] - 1);
      assertCountConserved(before, after, { src: DIAGNOSTICS, dst: DRC });
      await assertTrailInvariants('after REAL board Diagnostics→DRC');

      // DRC → Diagnostics (BACK-edge; the ONLY legal exit; traversal counts toward the ≤2 bound).
      legalEdge(DRC, DIAGNOSTICS);
      before = await readCountsByStageName(board);
      expect(before[DRC], `board must render a DRC total before DRC→Diagnostics back-edge`).toBeGreaterThanOrEqual(1);
      await board.moveToken(cardId, boardTargetName(DIAGNOSTICS), { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;
      after = await pollColumnCounts(board, DRC, before[DRC] - 1);
      assertCountConserved(before, after, { src: DRC, dst: DIAGNOSTICS });
      await assertTrailInvariants('after REAL board DRC→Diagnostics [BACK]');

      // LOOP/BACK-BOUND so far: Diagnostics self-loop ×1, Diagnostics→DRC ×1, DRC→Diagnostics ×1 — all ≤2.
      const loopState = await assertLoopBound(tokenDocId, 2);
      expect(loopState.maxObserved, 'no edge may exceed the ≤2 bound after the Diagnostics/DRC loops').toBeLessThanOrEqual(2);
      expect(await sim.currentStage(tokenDocId), 'token must be back on Diagnostics after the DRC round-trip').toBe(DIAGNOSTICS);
    }

    // ---- (c) The uP!-family forward spine to the terminal — each a REAL board move; COUNT-DRIFT on each.
    //          Diagnostics → ATC Briefing → Self Evolution Report → Completed. (NO Consultation.) ----
    const boardSpine: { from: string; to: string }[] = [
      { from: DIAGNOSTICS, to: ATC_BRIEFING },
      { from: ATC_BRIEFING, to: SELF_EVOLUTION_REPORT },
      { from: SELF_EVOLUTION_REPORT, to: TERMINAL },
    ];

    for (let i = 0; i < boardSpine.length; i++) {
      const { from, to } = boardSpine[i];
      // (a) The move must be a LEGAL scoped edge per the oracle (the AUTHORITY) — fail loud if not.
      legalEdge(from, to);

      // V7 DROPDOWN NEGATIVE #2: when on ATC Briefing, the move-dropdown must OFFER Self Evolution Report
      // and MUST NOT offer Consultation (the headline V2↔V7 divergence — flow-config.md §2 V7 / §3 D2).
      if (from === ATC_BRIEFING) {
        const briefOut = outEdgesForVariation(MODEL, ATC_BRIEFING, VARIATION_ID);
        expect(
          briefOut.map((e: any) => e.to).sort(),
          'V7 ATC Briefing must forward ONLY to [Self Evolution Report, uP! Readiness Changework] (NO Consultation)',
        ).toEqual([SELF_EVOLUTION_REPORT, UP_RCW].sort());
        expect(
          briefOut.some((e: any) => e.to === CONSULTATION),
          'D2: ATC Briefing → Consultation must NOT be an oracle edge for V7',
        ).toBe(false);
        // OFFERS Self Evolution Report. We do NOT assert Consultation absent on the dropdown (it is not
        // edge-scoped — component ts:2784-2790); the D2 exclusion is proven at the oracle level just above.
        await board.assertMoveTargets(cardId, {
          offers: [boardTargetName(SELF_EVOLUTION_REPORT)],
        });
      }

      // (b) COUNT-DRIFT: capture the board's per-STAGE counts BEFORE the move (APP-computed, polled).
      //     Diff at the stage level so a split stage's sub-columns sum into one total (the token may sit
      //     in any sub-bucket; the meaningful conservation quantity is the per-stage total).
      const before = await readCountsByStageName(board);
      expect(before[from], `board must render a count for source stage "${from}" before the ${from}→${to} move`).toBeGreaterThanOrEqual(1);

      // (c) Drive the REAL move through the board: open the token's move-dropdown → pick the target
      //     (split stages render as "<name> (Queued)") → confirm PeopleInvolved (pick the seeded specialist).
      await board.moveToken(cardId, boardTargetName(to), { specialist: `specialist0+${TESTRUNID}@example.com` });
      expectedRows++; expectedNonSelf++;

      // (d) COUNT-DRIFT: the board re-rendered src−1 / dst+1, Σ conserved (read AFTER the move, polled
      //     until the source stage reflects the departure — the board computes these from its stream).
      const after = await pollColumnCounts(board, from, before[from] - 1);
      assertCountConserved(before, after, { src: from, dst: to });

      // (e) Trail invariants after every board move (NO-ORPHAN / EVERY-MOVE-LOGGED w/ non-self lower
      //     bound / NO-STAGE-SKIPPED against the oracle / LOOP-BOUND).
      await assertTrailInvariants(`after REAL board move ${from}→${to}`);
    }

    // -----------------------------------------------------------------------------------------
    // PHASE 5 — terminal + updateDeliveryStatus-on-final assertions.
    // -----------------------------------------------------------------------------------------
    // TERMINAL-REACHED — currentstage == Completed AND the oracle gives Completed ZERO scoped out-edges.
    await assertTerminalReached(tokenDocId, VARIATION_ID, { terminal: TERMINAL, oracle: MODEL });

    // The forward walk reached the terminal WITHOUT ever visiting Consultation (V7 off-path fact, D2).
    const trail = await observedTransitions(tokenDocId);
    expect(
      trail.some((t: { from: string | null; to: string }) => t.to === CONSULTATION || t.from === CONSULTATION),
      'V7: the forward walk must reach Completed WITHOUT visiting Consultation (it is off the happy path)',
    ).toBe(false);
    expect(trail[trail.length - 1].to, 'the final logged move must land on the terminal').toBe(TERMINAL);

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
    await assertEveryMoveLogged(tokenDocId, expectedRows, { minNonSelf: expectedNonSelf });
    // 15 transitions total:
    //   phase1: 1 AUTO + 2 SELF                                                  (3 rows, 1 non-self)
    //   phase2: 1 studio next-cycle                                              (1 row,  1 non-self)
    //   phase3: 2 AUTO (EMA→link, link→SelfEval) + 2 SELF + 1 AUTO (RFD→Diag)     (5 rows, 3 non-self)
    //   phase4: 6 board moves (Diag self-loop, Diag→DRC, DRC→Diag, Diag→ATC
    //           Briefing, ATC Briefing→Self Evolution Report, SER→Completed)     (6 rows, 6 non-self)
    // Of the 15, 11 are non-self (operator/specialist), 4 are participant SELF forms.
    expect(expectedRows, 'V7 walk drove the full transition count (incl. 1 self-loop + 1 DRC round-trip)').toBe(15);
    expect(expectedNonSelf, 'V7 walk drove 11 operator/specialist (non-self) transitions').toBe(11);
  });

  // ===========================================================================================
  // FORM-WRITE INTEGRITY (flow-config.md §5 V2/V7) — the 4 self-movable FORM stages each write exactly
  // ONE `queue stage log` row on the participant self-move, and that row's prev→curr equals the oracle's
  // selfmove+selfmv:true edge. Reads the rows the PRODUCT/self-move wrote — never a value the test
  // computed. (Driven via the participant-sim self-move stand-in, the allowed Flutter-self-move
  // substitute; the integrity is proven against the PRODUCT log + the oracle, not against the write.)
  // ===========================================================================================
  test('form-write integrity: each of the 4 self-movable stages self-moves to exactly its oracle edge, one log row', async () => {
    for (const stage of SELF_MOVABLE_FORM_STAGES) {
      // The oracle (AUTHORITY): this stage is self-movable and exposes exactly one selfmove+selfmv edge.
      expect(!!(cfg.stageproperty[stage] || {}).selfmovable, `${stage} must be configured selfmovable:true`).toBe(true);
      const selfEdges = outEdgesForVariation(MODEL, stage, VARIATION_ID).filter((e: any) => e.type === 'selfmove' && e.selfmv);
      expect(selfEdges.length, `${stage} must expose exactly ONE participant self-move edge for V7`).toBe(1);
      const to = selfEdges[0].to;

      // PRECONDITION reset: park the token on this stage with a clean log, then drive the SELF move.
      await parkTokenOn(tokenDocId, stage);
      const logId = await sim.advance(tokenDocId, to, { by: 'self', testrunid: TESTRUNID });
      expect(logId, `${stage} self-move must produce a queue stage log doc id`).toBeTruthy();

      // The PRODUCT's audit trail: exactly ONE row, movedby:'self', prev=stage, curr=oracle target.
      const rows = await readLogRows(tokenDocId);
      expect(rows.length, `${stage} self-move must write exactly ONE queue stage log row`).toBe(1);
      const row = rows[0];
      expect(row.movedby, `${stage} self-move row must be movedby:'self'`).toBe('self');
      expect(row.previousstage, `${stage} self-move row previousstage`).toBe(stage);
      expect(row.currentstage, `${stage} self-move row currentstage must equal the oracle self-move target`).toBe(to);

      // NO-STAGE-SKIPPED for this single hop (the row must be a legal scoped edge for V7).
      await assertNoStageSkipped(tokenDocId, MODEL, VARIATION_ID);
      // And the token itself advanced (read REAL post-state, not the value we passed to advance()).
      expect(await sim.currentStage(tokenDocId), `${stage} token must have advanced to ${to}`).toBe(to);
    }
  });

  // ===========================================================================================
  // DRIFT NEGATIVES (flow-config.md §3 D1/D2) — assertNoStageSkipped must REJECT the V7
  // backbone-adjacent-but-oracle-illegal moves, proving it reads the ORACLE, not the stages[] array.
  //   D1: DRC → ATC Preparation (DRC is dead-forward; only legal exit is BACK→Diagnostics).
  //   D2: Diagnostics → Consultation AND ATC Briefing → Consultation (Consultation off the V7 happy path).
  // We write the ILLEGAL hop via the stand-in (a real product `queue stage log` row the guard will read),
  // then assert the guard's VERDICT (it throws) — the asserted value is the verdict, never a read-back.
  // ===========================================================================================
  test('no-skip invariant rejects the V7 drift skips: DRC→ATC-Preparation (D1) and Diagnostics/ATC-Briefing→Consultation (D2)', async () => {
    for (const illegal of [
      { from: DRC, to: ATC_PREPARATION, why: 'D1 (DRC is dead-forward; only legal exit is BACK→Diagnostics)' },
      { from: DIAGNOSTICS, to: CONSULTATION, why: 'D2 (Consultation is off the V7 forward happy path)' },
      { from: ATC_BRIEFING, to: CONSULTATION, why: 'D2 (ATC Briefing must NOT route to Consultation for V7)' },
    ]) {
      // Oracle-level: the illegal target is genuinely NOT a scoped edge for V7.
      expect(
        outEdgesForVariation(MODEL, illegal.from, VARIATION_ID).some((e: any) => e.to === illegal.to),
        `${illegal.from} → ${illegal.to} must NOT be an oracle edge for V7 — ${illegal.why}`,
      ).toBe(false);

      // Park the walked token on `illegal.from` with a clean trail, then write the illegal hop via the
      // stand-in (records illegal.from → illegal.to as a real log row), and assert the guard rejects it.
      await parkTokenOn(tokenDocId, illegal.from);
      await sim.advance(tokenDocId, illegal.to, { by: 'operator', testrunid: TESTRUNID });

      let threw = false;
      try {
        await assertNoStageSkipped(tokenDocId, MODEL, VARIATION_ID);
      } catch (e: any) {
        threw = true;
        expect(String(e.message), `the no-skip error must name the illegal move ${illegal.from}→${illegal.to}`).toContain('NO-STAGE-SKIPPED');
      }
      expect(
        threw,
        `${illegal.from} → ${illegal.to} must be rejected by assertNoStageSkipped — ${illegal.why}. ` +
          `If this passes, the invariant is trusting the backbone array, not the V7 oracle (flow-config.md §3).`,
      ).toBe(true);
    }

    // Restore the walked token to the entry stage with a clean trail (housekeeping for the serial suite).
    await resetTokenForWalk(tokenDocId, FIRST_STAGE);
  });
});

// =============================================================================================
// 72-JOURNEY EXPANSION (variation share) — walk EVERY distinct FORWARD journey of V7 entry→terminal.
//
// The forward path space of a variation is FINITE (the forward graph is a DAG over the variation's own
// backbone order, so the enumeration terminates) — `forwardJourneys(cfg, VARIATION_ID)` returns each
// distinct entry→terminal stage sequence. For V7 there are 9 (they share the entry→Diagnostics prefix and
// diverge across the uP!-family Diagnostics-and-down operator branch set: with/without ATC Preparation,
// with/without ATC Briefing, the uP! Readiness Changework→Review path vs the direct Self Evolution Report
// hop, plus the dead-forward Diagnostics→Diagnostics Readiness Changework terminal of journey 0). Critically
// NONE of the V7 journeys passes through Consultation (the headline V2↔V7 divergence — D2): if a journey
// here contained a Consultation hop it would be a flow-model regression, caught by the beforeAll legality
// guard below.
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
// REAL-STUDIO specialist coverage (the Scope Enhancement next-cycle forward move + the Diagnostics
// send-back [LOOP] / DRC [BACK] round-trip through the live UI) is the canonical walk above
// (WF-uPNextCycle-001); re-driving an identical studio session in all 9 journeys would only multiply
// flakiness without adding forward-path coverage.
//
// Anti-circularity holds: every operator hop is a REAL board click whose `queue stage log` row the PRODUCT
// writes (counted by EVERY-MOVE-LOGGED's non-self lower bound), every observed edge is validated against
// the oracle (NO-STAGE-SKIPPED), and COUNT-DRIFT reads numbers the board computed from its live stream.
// =============================================================================================
const FORWARD_JOURNEYS: string[][] = forwardJourneys(cfg, VARIATION_ID);
/** The stage the journeys stop sharing a prefix and begin diverging on the operator board.
 *  All V7 forward journeys share `…→Diagnostics`; from Diagnostics onward the operator branch differs. */
const DIVERGENCE_STAGE = 'Diagnostics';

test.describe('V7 · uP! - Next Cycle — every forward journey entry→terminal holds the universal invariants', () => {
  let guard: ConsoleGuard;
  let tokenDocId: string;
  let cardId: string;

  // Each journey is its own end-to-end walk (sim prefix + real-board spine); give it the full budget and
  // serialize (the suite shares one board/queue — fullyParallel is already off, but be explicit).
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    const seeded = await seedUpNextCycle({ cohort: 1, testrunid: TESTRUNID });
    expect(seeded.variationId).toBe(VARIATION_ID);
    tokenDocId = seeded.tokenIds[0];
    cardId = seeded.profileIds[0];
    // Sanity: the enumeration must match the known V7 forward-journey count (9). A drift here means the
    // flow-model / config changed and the expansion is stale — fail loud rather than under-cover.
    expect(FORWARD_JOURNEYS.length, 'V7 must enumerate its 9 distinct forward journeys').toBe(9);
    // Every journey starts at V7's entry and every transition is an oracle-legal scoped edge (guards the
    // data source — a journey with an illegal hop would be a flow-model regression, not a test bug). Also
    // proves NO journey visits Consultation (D2) — legalEdge throws on any non-oracle hop.
    for (const j of FORWARD_JOURNEYS) {
      expect(j[0], 'every journey starts at the V7 entry stage').toBe('Evolution Prep Orientation');
      expect(
        j.includes(CONSULTATION),
        'D2: no V7 forward journey may pass through Consultation (it is off the uP!-family happy path)',
      ).toBe(false);
      for (let k = 1; k < j.length; k++) {
        legalEdge(j[k - 1], j[k]); // throws if any hop is not a legal scoped edge for V7
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
      async function assertTrailInvariants(_ctx: string): Promise<void> {
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
          timeout: 40_000, // generous: by later journeys the board queue_token stream + Load-More paging can lag under accumulated emulator load
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
        await board.moveToken(cardId, boardTargetName(to), { specialist: `specialist0+${TESTRUNID}@example.com` });
        expectedRows++; expectedNonSelf++;

        // (d) COUNT-DRIFT: board re-rendered src−1 / dst+1, Σ conserved (read AFTER, polled until the
        //     source stage reflects the departure — values the board computed from its stream).
        const after = await pollColumnCounts(board, from, before[from] - 1);
        assertCountConserved(before, after, { src: from, dst: to });

        // (d.1) CROSS-CLIENT LOG SETTLE (cloud-only): the board commits the queue_token update + the
        //   `queue stage log` row in ONE atomic batch (component ts:2958-2968), but the board's own
        //   web-SDK listener (which drove the COUNT re-render polled in (d)) can observe that commit a
        //   beat BEFORE the separate Node admin-SDK one-shot query that readLogRows/assertEveryMoveLogged
        //   uses sees it — a cloud Firestore cross-client read lag that does NOT exist on the in-process
        //   emulator (where both clients hit the same process). Poll the PRODUCT's own audit trail until
        //   the just-committed row is observable, mirroring the canonical walk's self-loop settle
        //   (expect.poll on observedTransitions). This waits out the lag — it does NOT weaken the count:
        //   assertEveryMoveLogged below still requires the exact `expectedRows` with the non-self bound.
        await expect
          .poll(async () => (await readLogRows(tokenDocId)).length, {
            message: `[journey ${ji}] the board move ${from}→${to} must write its "queue stage log" row (admin-SDK trail did not yet observe the committed batch)`,
            timeout: 20_000,
            intervals: [200, 400, 800, 1200],
          })
          .toBe(expectedRows);

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
// commits onto a sibling (Waiting) bucket of the SAME stage (queue-board.page.ts resolveMoveTarget, ts
// note ~786). The committed `currentstage` is still the bare stage (moveTokenToStage parses the suffix
// back), so the stage-level total is the meaningful COUNT-DRIFT quantity — a single `_queued_` key read
// would spuriously go to 0 after a self-loop. Summing a stage's sub-columns into one per-stage total is
// the same technique the sibling V5 walk uses (prodigies-first-cycle.spec.ts `aggregateByStageName`).
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
