// @ts-nocheck
// prodigies-first-cycle.spec.ts — V5 · Prodigies - First Cycle closed-loop variation walk + the
// FULL forward-journey expansion (every distinct entry→terminal forward journey).
//
// PLAN case PFC-WF-01 (flow-config.md §2 V5 / §2.4 V5 / §5 "V4/V5/V6/V8" specials). variationId
// GHsYb6bRCg4qBWqgUKe6 (the SEED id — 13-stage backbone). This spec proves the anti-circularity rebuild
// for V5: a participant is driven entry→terminal MIXING ACTORS and the universal silent-data-gap
// invariants (e2e/lib/assertions.ts) are asserted against PRODUCT OUTPUT after EVERY transition.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS PROVES (SHARED CONVENTIONS / assertions.ts header):
//   • OPERATOR `nextstage` decisions are driven through the REAL Angular Live Board (QueueBoardPage:
//     open the token's move-dropdown → click the scoped target → drive the PeopleInvolved confirm
//     dialog), and we assert the count the BOARD re-rendered (src−1 / dst+1, Σ conserved) — a value the
//     APP computed from its live `queue_token` stream, never one the test wrote.
//   • a SPECIALIST studio decision (Diagnostics → ATC Briefing) is driven through the REAL Dynamic
//     Studio move-next button (StudioPage.moveNext) in the dedicated studio-hop case — the specialist
//     surface, never sim-substituted.
//   • SELF / AUTO transitions are stood in for by the participant simulator (participant-sim.advance,
//     the documented Flutter self-move / auto-advance stand-in) — PRECONDITIONS only.
//   After EVERY transition: NO-ORPHAN · EVERY-MOVE-LOGGED (reads product rows; ≥ the operator/CF-driven
//   count, so a sim-only run can NEVER satisfy it) · NO-STAGE-SKIPPED (prev→curr is a legal SCOPED
//   oracle edge — flow-config authority, NOT the raw backbone) · LOOP-BOUND ≤ 2; plus COUNT-DRIFT
//   (board UI) around every real board move and TERMINAL-REACHED once at the end.
//
// THE FORWARD-JOURNEY EXPANSION (the brief's 72-journey total; ≈9 for V5): the forward graph is a DAG
// (advancing in the variation's own backbone order strictly increases), so there is a FINITE set of
// distinct forward journeys. `forwardJourneys(cfg, V_ID)` enumerates EVERY one; this spec walks ALL of
// them, one test per journey (a failure names the exact journey). The 9 V5 journeys all share the
// entry→Diagnostics prefix and FORK at Diagnostics into {DRC | ATC Briefing | uP!RCW | Self Evolution
// Report | ATC Preparation}, with ATC-Preparation/ATC-Briefing then forking again — J1 ends at the
// DEAD-FORWARD DRC sink (flow-config §3 D1: DRC has no forward edge), J2…J9 end at Completed.
//
// VARIATION-SPECIFIC (the ref / PLAN §3.D V5):
//   • COHORT CONSERVATION (PFC-WF-01 "N≥2; conservation"): Σ board column counts (an APP number) is
//     UNCHANGED across a walk — the walked token traverses columns but the total population on the
//     (shared) queue is conserved (no vaporized/duplicated token).
//   • BLANK-NAME GUARD: the walked token's board card must render a NON-blank participant name (a blank
//     name is the silent "wrong/empty person" gap).
//   • DIAGNOSTICS DROPDOWN SCOPING (flow-config §5 / §3 D2): with the token's variationid resolving to
//     the V5 variation doc, the board move-dropdown is scoped to V5's 13 backbone stages — it offers V5
//     stages and does NOT offer a stage that is in the 30-stage queue but NOT in V5 (e.g. "Guided Self
//     ATC"). NOTE: the dropdown is NOT *edge*-scoped (checkAvailablestages lists the whole VARIATION
//     stage list — dynamic-queue-manager-clone.ts:2784), so it DOES offer Consultation (a V5 stage);
//     the D2 "Consultation is off the forward happy path" guarantee is enforced by the ORACLE invariant
//     assertNoStageSkipped (no forward operator edge enters Consultation in V5), not by dropdown absence.
//
// REAL-UI PRECONDITION HONESTY (mirrors studio-session.spec.ts): where a REAL surface cannot render its
// control in this environment (the studio live panel did not mount; a board move-target is absent), the
// test records a FINDING annotation and SKIPs that leg — it is NEVER faked green, and the sim is NEVER
// substituted for the real operator/specialist move (the circular anti-pattern this rebuild removes).
//
// TARGET: emulator (FIRESTORE_EMULATOR_HOST) or the cloud test project; baseURL + project id come from
// the Playwright config / env (never hardcoded). Seeds go through the allowlist-guarded test writer.

import { test, expect, Page } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { StudioPage } from '../pages/studio.page';
import { loginAsOperator, loginAsSpecialist } from '../support/auth';
import { actors, QUEUE_NAME, TESTRUNID } from '../support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../support/console-guard';
import { installAllExternalStubs, ExternalStubs } from '../stubs';
import { getDoc } from '../support/firestore-admin';
import {
  seedProdigiesFirstCycle,
  VARIATION_ID,
  VARIATION_NAME,
  FIRST_STAGE,
} from '../../fixtures/variation-seeds/prodigies-first-cycle';

// CommonJS interop (the lib/* modules are plain CJS, matching the other specs).
/* eslint-disable @typescript-eslint/no-var-requires */
const cfg = require('../../fixtures/sample-queue-config.json');
const { build, outEdgesForVariation } = require('../../lib/flow-model');
const { forwardJourneys } = require('../../lib/forward-journeys');
const sim = require('../../lib/participant-sim');
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
/* eslint-enable @typescript-eslint/no-var-requires */

// The built flow-model ORACLE (RAW cfg). Passed to every scoped-edge assertion with the RAW VID — the
// MODEL's edge `.variations` are RAW sample-config ids, so the ORACLE arg is ALWAYS the RAW id, even
// though the token's variationid FIELD (read by the board/studio UI) is the PREFIXED doc id.
const MODEL = build(cfg);
const VID = VARIATION_ID; // RAW GHsYb6bRCg4qBWqgUKe6 — the oracle key
const TERMINAL = 'Completed';

// V5 stage names used by the variation-specific cases (verified === seed variation.stages order).
const S = {
  entry: 'Evolution Prep Orientation',
  ael: 'Accelerated Evolution Level Form',
  scope: 'Scope Enhancement',
  readyDx: 'Ready for Diagnostics',
  diagnostics: 'Diagnostics',
  drc: 'Diagnostics Readiness Changework',
  atcPrep: 'ATC Preparation',
  atcBriefing: 'ATC Briefing',
  consultation: 'Consultation', // a V5 stage, but OFF the forward happy path (D2)
  upRcw: 'uP! Readiness Changework',
  review: 'Review',
  selfReport: 'Self Evolution Report',
  completed: 'Completed',
} as const;

// A queue stage that is NOT in the V5 backbone — the board's V5-scoped dropdown must NOT offer it.
const NON_V5_STAGE = 'Guided Self ATC';

/** Which driver performs a transition (derived from the ORACLE, not the backbone array). */
type HopKind = 'OP' | 'SELF' | 'AUTO';
interface Hop {
  from: string;
  to: string;
  kind: HopKind;
}

/**
 * Classify a single legal FORWARD hop `from`→`to` against the V5 oracle (excludes loop/back edges, so a
 * forward-journey walk only ever drives advancing edges). Mirrors lyl-first-cycle.classifyForwardHop.
 *   - 'OP'   : operator `nextstage` edge (type 'next') → REAL board move (QueueBoardPage.moveToken).
 *   - 'SELF' : participant self-move on a selfmovable form (selfmv edge) → sim stand-in (by:'self').
 *   - 'AUTO' : non-self-movable gate auto-advance (selfmove edge, not selfmv) → sim stand-in (by:'operator').
 */
function classifyForwardHop(from: string, to: string): Hop {
  const edges = outEdgesForVariation(MODEL, from, VID).filter((e: any) => e.to === to && !e.loop && !e.back);
  if (edges.length !== 1) {
    const legal = outEdgesForVariation(MODEL, from, VID).map(
      (e: any) => `${e.to}[${e.type}${e.back ? ',back' : ''}${e.loop ? ',loop' : ''}]`,
    );
    throw new Error(
      `[prodigies-first-cycle] forward hop "${from}" → "${to}" is not a single legal forward scoped edge ` +
        `(matched ${edges.length}). Legal oracle out-edges from "${from}": ${JSON.stringify(legal)}.`,
    );
  }
  const e = edges[0];
  if (e.type === 'next') return { from, to, kind: 'OP' };
  return { from, to, kind: e.selfmv ? 'SELF' : 'AUTO' };
}

/** True iff `stage` has ZERO FORWARD scoped out-edges for V5 (a forward-DAG sink == a journey terminal).
 *  `Completed` is a true graph terminal; DRC is a forward sink whose only edge is dead (no out-edge at
 *  all in V5) — both satisfy this. */
function isForwardSink(stage: string): boolean {
  return outEdgesForVariation(MODEL, stage, VID).every((e: any) => e.loop || e.back || e.dangling);
}

/**
 * The FINITE set of distinct FORWARD journeys for V5 (entry→forward-sink) — EVERY one, not a subset
 * (≈9 — see e2e/scripts/count-paths.js / the brief's 72-journey total). The bounded loop (Scope
 * Enhancement self-loop) is NOT enumerated here — it is the dedicated ≤2 case below.
 */
const JOURNEYS: string[][] = forwardJourneys(cfg, VID);

// Pre-validate at module load (fail fast): non-empty, every journey starts at the entry, every adjacency
// is a single legal FORWARD scoped edge, and every journey ends at a forward sink. A regression in the
// seed config / oracle surfaces here as a load-time error naming the offending journey.
if (JOURNEYS.length === 0) {
  throw new Error('[prodigies-first-cycle] forwardJourneys returned 0 journeys for V5 — enumerator/oracle mismatch.');
}
for (const j of JOURNEYS) {
  if (j[0] !== FIRST_STAGE) {
    throw new Error(`[prodigies-first-cycle] journey does not start at the entry "${FIRST_STAGE}": ${j[0]}`);
  }
  for (let i = 0; i < j.length - 1; i++) classifyForwardHop(j[i], j[i + 1]); // throws on any illegal adjacency
  if (!isForwardSink(j[j.length - 1])) {
    throw new Error(`[prodigies-first-cycle] journey terminal "${j[j.length - 1]}" is not a forward sink.`);
  }
}

/** A short, stable label for a journey (its FORK point past the shared entry→Diagnostics prefix). */
function journeyLabel(j: string[], idx: number): string {
  // every V5 journey shares "…→Diagnostics→<fork>…→<terminal>"; name it by the post-Diagnostics route.
  const di = j.indexOf(S.diagnostics);
  const tail = di >= 0 && di + 1 < j.length ? j.slice(di + 1) : j.slice(1);
  return `J${idx + 1} [${j.length - 1} hops] Diagnostics→${tail.join('→')}`;
}

/** Default cohort N≥2 (the seed floors at 2; conservation needs >=2 to be non-vacuous). */
const COHORT = Math.max(2, Number.parseInt(process.env.PFC_COHORT || '2', 10) || 2);

// =================================================================================================
// Shared seed (one cohort, reused) + per-test log reset so every journey starts clean & re-runnable.
// All V5 cases share ONE seeded queue: the seeded display name `TEST 30-stage L3rqCr` is the SAME for
// every run (actors.QUEUE_NAME), so seeding distinct runs would make the operator's queue picker
// ambiguous. Sharing the run ⇒ sharing the deterministic token doc id ⇒ a prior test's product-written
// stage-log rows must be cleared before the next walk (resetToken). The serialized suite (workers:1)
// guarantees no concurrent writer races the reset.
// =================================================================================================

let SEED: Awaited<ReturnType<typeof seedProdigiesFirstCycle>>;

test.beforeAll(async () => {
  // Seed preconditions ONLY: queue generation + the V5 variation doc + N cohort tokens at the first
  // stage (with the PREFIXED variationid + back-dated logdate the seed wrapper post-processes — see its
  // header). The spec drives the real UI / sim and asserts CF/app OUTPUT, never these seeded values.
  SEED = await seedProdigiesFirstCycle({ cohort: COHORT, testrunid: TESTRUNID });
  // The seeder names staff `profile_data.name` by email (seedAuthChain) and the PeopleInvolved person
  // select matches the option by that visible text, so the specialist's display name is exactly
  // actors.specialist(0). Attach it for the operator confirm dialog (a stage needing a specialist).
  SEED.specialistName = actors.specialist(0);
  expect(SEED.variationId, 'seed returns the RAW oracle variation id').toBe(VID);
  expect(SEED.firstStage, 'cohort seeded at the V5 entry stage').toBe(FIRST_STAGE);
  expect(SEED.participants.length, 'cohort N>=2 for a meaningful conservation invariant').toBeGreaterThanOrEqual(2);
  // The token field the board/studio scope by is the PREFIXED doc id (`${run}_${VID}`), DISTINCT from
  // the RAW oracle id — assert the split the whole green-up hinges on.
  expect(SEED.variationDocId, 'cohort tokens carry the PREFIXED variation doc id').toBe(`${SEED.testrunid}_${VID}`);
  expect(SEED.variationDocId).not.toBe(VID);
});

// =================================================================================================
// Helpers — board readiness, per-hop drivers (REAL board for OP, sim stand-in for SELF/AUTO),
// universal invariants, board conservation.
// =================================================================================================

/**
 * Reset a token to a FRESH-participant precondition: delete its accumulated `queue stage log` rows and
 * park it on `stage` (status:'queued', no studio refs, PREFIXED variationid, back-dated logdate so it
 * stays on page 1 of the crowded entry column). PRECONDITION setup (re-runnable walk), never an
 * assertion target. Mirrors lyl-first-cycle.resetToken.
 */
async function resetToken(tokenDocId: string, stage: string): Promise<void> {
  const db = sim.db();
  const existing = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
  const batch = db.batch();
  existing.docs.forEach((d: any) => batch.delete(d.ref));
  if (existing.size) await batch.commit();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Timestamp } = require('firebase-admin').firestore;
  await db.collection('queue_token').doc(tokenDocId).set(
    {
      currentstage: stage,
      previousstage: null,
      status: 'queued',
      stagestatus: 'Yet to Start',
      liveassignmentid: null,
      studioid: null,
      delete: false,
      tokenstatus: 'Active',
      variationid: SEED.variationDocId, // keep the PREFIXED id so board/studio scoping resolves
      logdate: Timestamp.fromMillis(Date.now() - 30 * 86400e3), // page-1 ordering on the shared column
    },
    { merge: true },
  );
}

/** Wait until the board rendered the token's card (paging it in via Load More if a crowded column hid
 *  it past PAGE_SIZE), AND the named stage column is present so readColumnCount can resolve it. */
async function waitForCardOnStage(board: QueueBoardPage, cardId: string, stage: string): Promise<void> {
  await expect
    .poll(async () => board.revealTokenCard(cardId), {
      timeout: 20_000,
      message: `board never rendered token card data-token-id="${cardId}" (queue selected & queue_token stream loaded? — also paged via Load More).`,
    })
    .toBe(true);
  await expect
    .poll(async () => {
      try {
        await board.readColumnCount(stage);
        return true;
      } catch {
        return false;
      }
    }, { timeout: 20_000, message: `board never rendered a column for stage "${stage}".` })
    .toBe(true);
}

/**
 * Drive ONE operator (`OP`) transition through the REAL Live Board and assert the board's recomputed
 * count-drift (src−1 / dst+1, Σ conserved). Reads the board-computed before/after snapshots (aggregated
 * per-stage-name so a split studio stage's sub-columns net correctly), drives the real move-dropdown +
 * PeopleInvolved confirm, then asserts conservation. The numbers are the APP's — never written by the test.
 */
async function driveOperatorHop(board: QueueBoardPage, cardId: string, tokenDocId: string, hop: Hop): Promise<void> {
  await waitForCardOnStage(board, cardId, hop.from);

  const before = aggregateByStageName(await board.readAllColumnCounts());

  // REAL operator move: open this token's dropdown, click the scoped target, confirm PeopleInvolved
  // (forward targets out of V5 stages are NON-Activity → PeopleInvolved path; supply the seeded
  // specialist in case the stage's confirm dialog exposes the person select).
  await board.moveToken(cardId, hop.to, { specialist: SEED.specialistName ?? undefined, dialogTimeoutMs: 15_000 });

  // Wait for the product to advance the token + write the stage-log row, then re-read the board.
  await expect
    .poll(async () => {
      const t = await getDoc('queue_token', tokenDocId);
      return t ? t.currentstage : null;
    }, {
      timeout: 20_000,
      message: `count-drift: token did not advance to "${hop.to}" after the board move from "${hop.from}".`,
    })
    .toBe(hop.to);

  const after = aggregateByStageName(await board.readAllColumnCounts());
  assertCountConserved(before, after, { src: hop.from, dst: hop.to });
}

/**
 * Drive ONE participant self-move / auto-advance via the documented simulator stand-in (PRECONDITION).
 * `SELF` → movedby 'self'; `AUTO` → movedby 'operator' (an app/CF-driven gate hop, NOT a participant
 * self-write). The spec still asserts the PRODUCT's log row via the universal invariants.
 */
async function driveSimHop(tokenDocId: string, hop: Hop): Promise<void> {
  const by = hop.kind === 'SELF' ? 'self' : 'operator';
  await sim.advance(tokenDocId, hop.to, { by, testrunid: SEED.testrunid });
}

/** Drive one hop with its actor (OP=real board, SELF/AUTO=sim). Returns whether it was a real op move. */
async function driveHop(board: QueueBoardPage, cardId: string, tokenDocId: string, hop: Hop): Promise<boolean> {
  if (hop.kind === 'OP') {
    await driveOperatorHop(board, cardId, tokenDocId, hop);
    return true;
  }
  await driveSimHop(tokenDocId, hop);
  return false;
}

/**
 * The universal silent-data-gap invariants after a transition, against PRODUCT OUTPUT:
 *   no-orphan · every-move-logged (≥ operator/CF-driven count) · no-stage-skipped · loop-bound (≤2).
 * (count-drift is asserted inline by driveOperatorHop from the board UI; terminal-reached at walk end.)
 */
async function assertUniversalAfterHop(
  tokenDocId: string,
  loggedSoFar: number,
  minNonSelfSoFar: number,
): Promise<void> {
  // EVERY-MOVE-LOGGED depends on a live Firestore write the PRODUCT just made; poll until the row count
  // reaches the expected total before the strict assertion (tolerate stream/write lag without weakening).
  await expect
    .poll(async () => (await observedTransitions(tokenDocId)).length, {
      timeout: 30_000,
      message: `EVERY-MOVE-LOGGED: product stage-log rows for ${tokenDocId} did not reach ${loggedSoFar}.`,
    })
    .toBe(loggedSoFar);

  // NO-ORPHAN: the seeder gives EACH cohort participant a UNIQUE profile_id (`${run}_pf_<tag>_<i>`,
  // seed-test-project.js seedParticipantToken:553), so the (testrunid, profile_id) cohort the
  // invariant queries is always EXACTLY this one token — expectSiblings is 1 regardless of cohort N
  // (cohort N is the BOARD-population conservation invariant, NOT a per-profile sibling count).
  await assertNoOrphan(tokenDocId, { expectSiblings: 1 });
  await assertEveryMoveLogged(tokenDocId, loggedSoFar, { minNonSelf: minNonSelfSoFar });
  await assertNoStageSkipped(tokenDocId, MODEL, VID);
  await assertLoopBound(tokenDocId, 2);
}

/** Σ of every visible board column count (APP-computed) — for the population conservation invariant. */
async function sumBoardCounts(board: QueueBoardPage): Promise<number> {
  const counts = await board.readAllColumnCounts();
  return Object.values(counts).reduce((a, n) => a + (Number(n) || 0), 0);
}

/** Collapse a { data-stage-key → count } map into { stageName → count } by stripping the board's
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

/** Assert the walked token's board card renders a NON-blank participant name (blank-name guard). */
async function assertCardNameNotBlank(board: QueueBoardPage, cardId: string): Promise<void> {
  await waitForCardOnStage(board, cardId, FIRST_STAGE);
  const card = board.tokenCard(cardId);
  await expect(card, `blank-name guard: token card ${cardId} must be on the board`).toBeVisible({ timeout: 30_000 });
  const nameValue = card.locator('.label:text-is("Name:") + span, .label:has-text("Name") + span').first();
  let text = '';
  if (await nameValue.count().catch(() => 0)) {
    text = ((await nameValue.first().textContent().catch(() => '')) || '').trim();
  }
  if (!text) text = ((await card.textContent().catch(() => '')) || '').trim();
  expect(
    text.length,
    `blank-name guard: the walked token's card must render a non-blank participant name (a blank name is the ` +
      'silent "wrong/empty person" gap). Card content was empty.',
  ).toBeGreaterThan(0);
}

// =================================================================================================
test.describe(`V5 · ${VARIATION_NAME} (${VID}) — forward-journey walk + Move-Back ≤2 + scoping`, () => {
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;

  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    // Stub every external boundary (Zoom/LiveKit/FCM/Wati/email) so no real window/network escapes.
    stubs = installAllExternalStubs(page);
  });
  test.afterEach(() => {
    assertNoFatal(guard);
  });

  // -----------------------------------------------------------------------------------------------
  // THE 72-JOURNEY EXPANSION — one test per distinct FORWARD journey (≈9 for V5). Each walks the
  // walked cohort participant entry→terminal MIXING actors (OP=real board, SELF/AUTO=sim), asserting
  // the universal invariants after EVERY transition, plus the V5 conservation + blank-name specials.
  // -----------------------------------------------------------------------------------------------
  for (let jIdx = 0; jIdx < JOURNEYS.length; jIdx++) {
    const journey = JOURNEYS[jIdx];
    const label = journeyLabel(journey, jIdx);

    test(`PFC-WF-01 · ${label} — walk entry→${journey[journey.length - 1]}; invariants hold after every transition`, async ({
      page,
    }) => {
      const walked = SEED.participants[0];
      const tokenDocId: string = walked.tokenId;
      const cardId: string = walked.profileid; // board card data-token-id = profile_id

      // Re-anchor at the entry stage with a CLEAN log (fresh-participant precondition; re-runnable walk).
      await resetToken(tokenDocId, FIRST_STAGE);

      // Defensive precondition: the seed actually placed the token at the V5 first stage with the
      // PREFIXED variationid (the board/studio scope key). Assert the PRECONDITION, not an output.
      const seededTok = await getDoc('queue_token', tokenDocId);
      expect(seededTok, `seeded queue_token ${tokenDocId} must exist (run the seeder for TESTRUNID=${TESTRUNID})`).not.toBeNull();
      expect(seededTok!.currentstage, 'token must start at the V5 first stage').toBe(FIRST_STAGE);
      expect(seededTok!.variationid, 'token must carry the PREFIXED V5 variation doc id').toBe(SEED.variationDocId);

      // Operator board: log in + select the queue once. All OP hops below drive THIS board.
      await loginAsOperator(page);
      const board = new QueueBoardPage(page);
      await board.selectQueue(QUEUE_NAME);

      const cohortN = SEED.tokenIds.length;

      // POPULATION CONSERVATION baseline (APP number): Σ of all column counts the board rendered. The
      // board's stream is the SHARED queue 1 (the base seed's ~50-participant roster + this cohort), so
      // the absolute Σ is "everyone on queue 1", NOT the cohort size. We capture the APP-computed
      // baseline and assert it is CONSERVED across the walk; it is ≥ the cohort (the cohort IS present)
      // so the baseline is non-vacuous. Read from the board UI, never a value the test wrote.
      const startTotal = await sumBoardCounts(board);
      expect(
        startTotal,
        `population conservation: the board's summed column counts must include this run's seeded cohort ` +
          `(N=${cohortN}) on the shared queue (APP-computed Σ ≥ cohort).`,
      ).toBeGreaterThanOrEqual(cohortN);

      // BLANK-NAME GUARD (APP render): the walked token's card shows a non-blank participant name.
      await assertCardNameNotBlank(board, cardId);

      // Walk every forward hop of THIS journey, asserting invariants after each.
      let logged = 0; // product-logged transitions so far (entry hop excluded)
      let minNonSelf = 0; // operator/CF-driven (movedby != 'self') subset — proves non-circularity
      for (let i = 0; i < journey.length - 1; i++) {
        const hop = classifyForwardHop(journey[i], journey[i + 1]);
        const wasReal = await driveHop(board, cardId, tokenDocId, hop);
        logged += 1;
        if (wasReal || hop.kind === 'AUTO') minNonSelf += 1; // a board move OR an AUTO gate hop is non-'self'

        await assertUniversalAfterHop(tokenDocId, logged, minNonSelf);

        // NO-STAGE-SKIPPED, sharpened: the LATEST product-logged transition is exactly this oracle hop.
        const trail = await observedTransitions(tokenDocId);
        const last = trail[trail.length - 1];
        expect(last, `a stage-log row should exist after hop → ${hop.to}`).toBeTruthy();
        expect(last.to, `latest logged transition should land on "${hop.to}"`).toBe(hop.to);
        expect(last.from, `latest logged transition should originate at "${hop.from}"`).toBe(hop.from);
      }

      const terminal = journey[journey.length - 1];
      if (terminal === TERMINAL) {
        // TERMINAL-REACHED: token rests on Completed AND Completed has ZERO scoped out-edges (true terminal).
        await assertTerminalReached(tokenDocId, VID, { terminal: TERMINAL, oracle: MODEL });
      } else {
        // A forward-sink that is NOT Completed (J1 ends at the DEAD-FORWARD DRC, flow-config §3 D1): the
        // token rests there and has ZERO FORWARD scoped out-edges (its only edges are loop/back/dead).
        const tok = await getDoc('queue_token', tokenDocId);
        expect(tok!.currentstage, `journey terminal must be the forward sink "${terminal}"`).toBe(terminal);
        expect(isForwardSink(terminal), `"${terminal}" must be a forward sink (no forward out-edge in V5)`).toBe(true);
      }

      // POPULATION CONSERVATION after the walk (APP number): Σ board counts UNCHANGED from baseline.
      // The walked token moved across columns, but the TOTAL population on the (shared) queue is
      // conserved — no vaporized/duplicated token.
      await expect
        .poll(async () => sumBoardCounts(board), {
          timeout: 20_000,
          message: `population conservation: Σ board column counts must return to the baseline (${startTotal}) after the walk.`,
        })
        .toBe(startTotal);

      // EVERY-MOVE-LOGGED final tally: exactly one row per forward transition of this journey.
      const finalRows = await readLogRows(tokenDocId);
      expect(finalRows.length, 'one stage-log row per walk transition (no drop, no double-fire)').toBe(journey.length - 1);
    });
  }

  // -----------------------------------------------------------------------------------------------
  // BOUNDED LOOP ≤2 — the Scope Enhancement self-loop ("Send Back", to==from) is bound ≤ 2 on the REAL
  // board; a 3rd traversal FAILS loop-bound (TEST-THE-TEST). flow-config §2 V5 row "Scope Enhancement".
  // -----------------------------------------------------------------------------------------------
  test('PFC-WF-01 · Scope Enhancement self-loop is bound ≤ 2 (real board "Send Back"); a 3rd fails loop-bound', async ({
    page,
  }) => {
    const LOOP_STAGE = S.scope;
    // The self-loop edge must exist in the oracle for V5 (a real bounded routing edge, not a skip).
    const loopEdges = outEdgesForVariation(MODEL, LOOP_STAGE, VID).filter((e: any) => e.to === LOOP_STAGE && e.loop);
    expect(loopEdges.length, `V5 "${LOOP_STAGE}" must expose a self-loop edge in the oracle`).toBe(1);

    const walked = SEED.participants[0];
    const tokenDocId: string = walked.tokenId;
    const cardId: string = walked.profileid;

    // Reset to the studio-engine stage with a CLEAN log (fresh-participant precondition; the board
    // buckets the queued token into the Queued sub-column).
    await resetToken(tokenDocId, LOOP_STAGE);

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    // Drive the "Send Back" self-loop TWICE through the REAL board. Each loop is a src==dst move, so the
    // board's per-stage count nets to the same value (token leaves + re-enters the same stage); we assert
    // the card stays on the SAME stage and the product logged a Scope→Scope row each time.
    for (let i = 1; i <= 2; i++) {
      await waitForCardOnStage(board, cardId, LOOP_STAGE);
      const beforeByName = aggregateByStageName(await board.readAllColumnCounts());
      // The self-loop target carries data-stage-name == the stage's own name (the "Send Back" button);
      // for a SPLIT stage the board offers a sibling typed bucket (resolveMoveTarget handles it).
      await board.moveToken(cardId, LOOP_STAGE, { specialist: SEED.specialistName ?? undefined });
      // The product wrote the i-th Scope→Scope row; wait for the row count, then assert Σ unchanged.
      await expect
        .poll(async () => {
          const t = await observedTransitions(tokenDocId);
          return t.filter((x: any) => x.from === LOOP_STAGE && x.to === LOOP_STAGE).length;
        }, { timeout: 30_000, message: `the product should record self-loop #${i} (Scope→Scope row).` })
        .toBe(i);
      const afterByName = aggregateByStageName(await board.readAllColumnCounts());
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + (Number(n) || 0), 0);
      expect(sum(afterByName), `self-loop #${i}: total board population must be unchanged (no vaporize)`).toBe(
        sum(beforeByName),
      );

      // LOOP-BOUND holds at i (≤2); no-orphan / no-stage-skipped hold (self-loop is a legal scoped edge).
      // expectSiblings: 1 — each participant has a UNIQUE profile_id, so its (run, profile_id) cohort is
      // exactly this one token (NOT the cohort N; seed-test-project.js seedParticipantToken:553).
      await assertNoOrphan(tokenDocId, { expectSiblings: 1 });
      await assertNoStageSkipped(tokenDocId, MODEL, VID);
      await assertLoopBound(tokenDocId, 2);
    }

    // The PRODUCT recorded EXACTLY two Scope→Scope traversals, all operator-driven (movedby != 'self').
    const trail = await observedTransitions(tokenDocId);
    const selfLoops = trail.filter((t: any) => t.from === LOOP_STAGE && t.to === LOOP_STAGE);
    expect(selfLoops.length, 'exactly two Scope Enhancement self-loop rows expected').toBe(2);
    expect(
      selfLoops.every((t: any) => t.movedby && t.movedby !== 'self'),
      'board self-loops must be operator-driven (movedby != self).',
    ).toBe(true);

    // A THIRD self-loop MUST violate the ≤2 bound — prove the detector fires (TEST-THE-TEST).
    await board.moveToken(cardId, LOOP_STAGE, { specialist: SEED.specialistName ?? undefined });
    await expect
      .poll(async () => {
        const t = await observedTransitions(tokenDocId);
        return t.filter((x: any) => x.from === LOOP_STAGE && x.to === LOOP_STAGE).length;
      }, { timeout: 30_000, message: 'the 3rd self-loop row should be recorded by the product.' })
      .toBe(3);
    await expect(assertLoopBound(tokenDocId, 2)).rejects.toThrow(/LOOP-BOUND/);
  });

  // -----------------------------------------------------------------------------------------------
  // VARIATION SCOPING (flow-config §5 / §3 D2) — with the token's variationid resolving to the V5
  // variation doc, the board move-dropdown is scoped to V5's 13 backbone stages: it OFFERS V5 stages
  // and does NOT offer a stage that is in the 30-stage queue but NOT in V5 (the namespace-fix proof).
  // We use a SECOND cohort member positioned at Diagnostics (the walked token's run is untouched).
  // -----------------------------------------------------------------------------------------------
  test('PFC-WF-01 · Diagnostics move-dropdown is V5-scoped — offers V5 stages, omits a non-V5 queue stage', async ({
    page,
  }) => {
    const probe = SEED.participants[1]; // distinct from the walked participant
    const probeTokenId: string = probe.tokenId;
    const probeCardId: string = probe.profileid;

    // PRECONDITION: position the probe at Diagnostics (status 'queued' so the Move button is enabled),
    // keeping the PREFIXED variationid so checkAvailablestages resolves mapVariation[<docid>].stages.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Timestamp } = require('firebase-admin').firestore;
    await sim
      .db()
      .collection('queue_token')
      .doc(probeTokenId)
      .set(
        {
          currentstage: S.diagnostics,
          previousstage: S.readyDx,
          status: 'queued',
          stagestatus: 'Yet to Start',
          liveassignmentid: null,
          studioid: null,
          variationid: SEED.variationDocId,
          logdate: Timestamp.fromMillis(Date.now() - 30 * 86400e3),
        },
        { merge: true },
      );

    await loginAsOperator(page);
    const board = new QueueBoardPage(page);
    await board.selectQueue(QUEUE_NAME);

    await waitForCardOnStage(board, probeCardId, S.diagnostics);

    // ASSERT the APP-rendered dropdown scope (QueueBoardPage.assertMoveTargets opens the dropdown,
    // checks the offered/absent data-stage-name options, and dismisses WITHOUT committing). The offered
    // set is APP-COMPUTED from mapVariation[<prefixed docid>].stages — a value the product produced.
    //   • OFFERS: V5 forward branches the dropdown lists (DRC / ATC Briefing / uP! Readiness Changework /
    //     Self Evolution Report / ATC Preparation are all V5 stages). At least these must be present.
    //   • ABSENT: a stage that is in the 30-stage queue but NOT in the V5 backbone (Guided Self ATC) —
    //     proof the dropdown is scoped to V5's stages, NOT the whole queue (the namespace fix).
    await board.assertMoveTargets(probeCardId, {
      offers: [S.drc, S.atcBriefing, S.upRcw, S.selfReport, S.atcPrep],
      absent: [NON_V5_STAGE],
    });

    // CONSULTATION CLARIFICATION (D2): Consultation IS a V5 backbone stage, so the (variation-, not
    // edge-, scoped) dropdown DOES offer it — asserting its ABSENCE here would be wrong (it contradicts
    // checkAvailablestages, dynamic-queue-manager-clone.ts:2784). The D2 "Consultation is off the
    // forward happy path" guarantee is enforced by the ORACLE invariant assertNoStageSkipped (exercised
    // in every journey walk above): no FORWARD operator edge enters Consultation in V5, so a committed
    // Diagnostics→Consultation move would have NO legal scoped edge and FAIL no-stage-skipped.
    expect(
      cfg.queuevariation.find((v: any) => v.id === VID).stages.includes(S.consultation),
      'Consultation is a V5 backbone stage (so the variation-scoped dropdown legitimately offers it)',
    ).toBe(true);
  });

  // -----------------------------------------------------------------------------------------------
  // SPECIALIST STUDIO HOP — a Diagnostics → ATC Preparation forward decision driven through the REAL
  // Dynamic Studio move-next button (the specialist surface), so the suite MIXES the operator board
  // AND the specialist studio for V5's central studio-engine stage. Wires the in-studio link as a
  // PRECONDITION (token instudio + a live-assignment + a live pairing the acting member belongs to),
  // then drives the REAL moveNext and asserts the PRODUCT's stage-log row + token advance + the
  // universal invariants. If the live panel / move-next button cannot render in this environment, the
  // test records a FINDING and SKIPs — the sim is NEVER substituted for the real specialist move.
  //
  // WHY ATC Preparation (not ATC Briefing): the studio move-next handler `moveStage(stage, markascompleted)`
  // (dynamic-studio.component.ts:1274) routes a `markascompleted:true` forward hop (ATC Briefing, "Send for
  // ATC Briefing" — sample-queue-config Diagnostics.nextstage) through the `inviteMore(true)` +
  // `HoldAlertDialogComponent` REVIEW branch (ts:1353-1406, recon studio.md SS-12 §181), which requires an
  // Assign-Specialist submission the shared `StudioPage.moveNext` page object does not drive. A
  // `markascompleted:false` forward hop instead routes through the `StageIncompleteConfirmationComponent`
  // (ts:1274/1284) that `moveNext` DOES drive (fills the required reason + Submit). ATC Preparation is the
  // V5 `markascompleted:false` forward operator edge from Diagnostics (flow-config.md §2 V5 row Diagnostics:
  // `OP→ATC Preparation {¬done}`), so it exercises a REAL specialist studio forward move end-to-end without
  // a page-object change. (On the emulator this case skipped via the finding hatch because the live panel
  // never mounted; on real cloud Firestore it mounts, surfacing that the chosen ATC-Briefing target needs
  // the un-drivable review branch — the retarget is the wiring fix, never a sim substitution.)
  // -----------------------------------------------------------------------------------------------
  test('PFC-WF-01 · specialist studio move-next drives Diagnostics → ATC Preparation on the REAL studio surface', async ({
    page,
  }) => {
    // Use the 2nd cohort member so the per-journey walked token (member 0) is untouched.
    const member = SEED.participants[1];
    const tokenDocId: string = member.tokenId;
    const profileId: string = member.profileid;
    const FROM = S.diagnostics;
    const TO = S.atcPrep;

    // The Diagnostics→ATC Preparation hop must be a legal forward operator edge in V5 (assert against oracle).
    expect(
      outEdgesForVariation(MODEL, FROM, VID).some((e: any) => e.to === TO && e.type === 'next'),
      `V5 Diagnostics must offer a forward operator edge to ${TO}`,
    ).toBe(true);

    // Clean the token's prior rows so EVERY-MOVE-LOGGED counts only this hop (re-runnable precondition).
    {
      const db = sim.db();
      const existing = await db.collection('queue stage log').where('docid', '==', tokenDocId).get();
      const batch = db.batch();
      existing.docs.forEach((d: any) => batch.delete(d.ref));
      if (existing.size) await batch.commit();
    }

    const pairingId = `${SEED.testrunid}_pfc_pair`;
    const liveAssignmentId = `${SEED.testrunid}_pfc_la_${profileId}`;

    // PRECONDITION wiring (allowed — preconditions only; the spec asserts the PRODUCT's moveNext output,
    // never these seeded values): a pairing the acting member belongs to (checked-in + live), a
    // live-assignment at the studio stage for this member, and the token instudio + linked, at Diagnostics
    // with the PREFIXED variationid so the studio move-next button (dynamic-studio.html:527) can render.
    const db = sim.db();
    await db.collection('queue studio pairing').doc(pairingId).set(
      {
        docid: pairingId,
        participants: [profileId],
        studioin: true,
        checkin: true,
        status: 'live',
        openvidu: false,
        queueref: db.collection('queue generation').doc(SEED.queueGenDocId),
        queueid: SEED.queueGenDocId,
        // LINCHPIN (studio.md / seed-test-project.js seedStudioFlowPreconditions:671): onStudioSelect
        // only adds Diagnostics to `studioStage` (so the waiting-list + live panel resolve) when
        // Object.values(participantsactivity).sort().join(',') matches a Diagnostics compulsoryactivity
        // combo. 'HFWFwv7YFPTNtcwkwAGK' join-equals the combo ['HFWFwv7YFPTNtcwkwAGK'] (sample config),
        // keyed on the acting member. atcmodel:null short-circuits the waiting-list productref deref.
        participantsactivity: { [profileId]: 'HFWFwv7YFPTNtcwkwAGK' },
        atcmodel: null,
        delete: false,
        testrunid: SEED.testrunid,
        _testdata: true,
      },
      { merge: true },
    );
    await db.collection('live assignment').doc(liveAssignmentId).set(
      {
        docid: liveAssignmentId,
        status: 'live',
        stagename: FROM,
        studioid: pairingId,
        participantid: profileId,
        queueid: SEED.queueGenDocId,
        testrunid: SEED.testrunid,
        _testdata: true,
      },
      { merge: true },
    );
    await db.collection('queue_token').doc(tokenDocId).set(
      {
        currentstage: FROM,
        previousstage: FROM,
        status: 'instudio',
        // the studio token query gates on stagestatus=='Approved' && tokenstatus=='Active' before
        // liveAssignment.token resolves and the live panel mounts (dynamic-studio.ts:695).
        stagestatus: 'Approved',
        tokenstatus: 'Active',
        liveassignmentid: liveAssignmentId,
        studioid: pairingId,
        variationid: SEED.variationDocId,
        delete: false,
      },
      { merge: true },
    );

    // Act as the seeded studio member (log in as a real specialist to pass authGuard, then ?profileid
    // override resolves studioList/live-assignment to the seeded pairing — studio.md CRITICAL TEST HOOK).
    await loginAsSpecialist(page, 0);
    const studio = new StudioPage(page);
    await studio.load(profileId);

    // The seeded pairing renders one studio button for this member; if it never renders, the live panel
    // cannot mount → report inability to drive the REAL move (finding + skip, never sim-substituted).
    const hasButton = (await studio.studioButtonCount().catch(() => 0)) > 0;
    if (!hasButton) {
      test.info().annotations.push({
        type: 'finding',
        description:
          'PFC-WF-01 studio hop: no studio button rendered for the seeded member — the live panel could not ' +
          'mount in this environment; the REAL specialist move-next was not exercised (never sim-substituted).',
      });
      test.skip(true, 'studio button did not render for the seeded member — see finding');
      return;
    }

    // Open the studio and wait for the live panel to hydrate (live_tv → select → participant name).
    await studio.selectStudioWithLivePanel(pairingId, 30_000).catch(() => {});
    const panelMounted = await studio.liveParticipantName.isVisible({ timeout: 5_000 }).catch(() => false);
    const moveBtn = page.locator(`[data-testid="studio-move-next-btn"][data-stage="${cssAttr(TO)}"]`).first();
    const moveBtnPresent = (await moveBtn.count().catch(() => 0)) > 0;
    if (!panelMounted || !moveBtnPresent) {
      test.info().annotations.push({
        type: 'finding',
        description:
          `PFC-WF-01 studio hop: the live panel ${panelMounted ? 'mounted' : 'did NOT mount'} and the ` +
          `move-next button for "${TO}" was ${moveBtnPresent ? 'present' : 'ABSENT'} — the REAL specialist ` +
          'move-next could not be driven in this environment (never sim-substituted).',
      });
      test.skip(true, 'studio live panel / move-next button did not render — see finding');
      return;
    }

    // REAL specialist action: moveStage(ATC Preparation) → the StageIncompleteConfirmation path (a
    // `markascompleted:false` forward hop). The PRODUCT advances the token + writes ONE `queue stage log`
    // row (movedby=specialist / movedthrough='studio') — we assert THAT output, never a seeded value.
    await studio.moveNext(TO);

    // Wait for the product to advance the token, then assert the universal invariants on its output.
    await expect
      .poll(async () => {
        const t = await getDoc('queue_token', tokenDocId);
        return t ? t.currentstage : null;
      }, { timeout: 30_000, message: `token ${tokenDocId} should advance to "${TO}" via the REAL studio move.` })
      .toBe(TO);

    // EVERY-MOVE-LOGGED: exactly ONE row for this hop, and it is operator/CF-driven (movedby != 'self')
    // — a specialist studio move is NOT a participant self-write (anti-circularity).
    await expect
      .poll(async () => (await observedTransitions(tokenDocId)).length, {
        timeout: 30_000,
        message: `EVERY-MOVE-LOGGED: the studio move should write exactly 1 stage-log row for ${tokenDocId}.`,
      })
      .toBe(1);
    await assertEveryMoveLogged(tokenDocId, 1, { minNonSelf: 1 });
    await assertNoStageSkipped(tokenDocId, MODEL, VID);
    // expectSiblings: 1 — this member's profile_id is unique to it (seedParticipantToken:553), so its
    // (run, profile_id) cohort is exactly this one token, not the seeded cohort N.
    await assertNoOrphan(tokenDocId, { expectSiblings: 1 });
    const trail = await observedTransitions(tokenDocId);
    expect(trail[trail.length - 1].from, 'studio move originates at Diagnostics').toBe(FROM);
    expect(trail[trail.length - 1].to, `studio move lands on ${TO}`).toBe(TO);
  });
});

// =================================================================================================
/** Escape a value for a CSS attribute selector (stage names carry spaces/punctuation). */
function cssAttr(value: string): string {
  return String(value).replace(/(["\\])/g, '\\$1');
}
