// @ts-nocheck
/**
 * cf-sideeffects.spec.ts — P2 items 11 & 12: prove the DEPLOYED Cloud-Function triggers wrote their
 * observable Firestore side-effects after a stage move. Requires the queue CFs to be running against
 * the target (emulator functions, or the cloud test project `slabs-queue-e2e-exdcz` where the triggers
 * are deployed). The spec reads `baseURL`/target from the Playwright config + the allowlist-guarded
 * test-project handle — it NEVER hardcodes a project id (SHARED CONVENTIONS + safety).
 *
 * WHAT IS ASSERTED (cf.md is the source of truth — read it before editing this file):
 *   • CF §1  `onQueueStageChange` (onDocumentWritten queue_token/{id}, stage-moved branch,
 *     queuesystem.js:338): writes a `participant touchpoint` doc with
 *     `touchpoint == "Queue Stage Moved"`, `label == "Moved to '<currentstage>' in <queuename>"`,
 *     `parentreference == /queue_token/{T}`. This is the "participant metadata touchpoint" the brief
 *     names (the touchpoint that drives participant metadata; service.js:939 writes the collection).
 *   • The `queue stage log` row written BY THE BOARD MOVE — the row whose CREATE is the trigger for the
 *     position CF below. We assert it via `assertEveryMoveLogged(..., {minNonSelf})`, which requires the
 *     row to be `movedby != 'self'` (operator/board-driven), so a suite that only round-trips a
 *     participant self-write can NEVER satisfy it (anti-circularity, e2e/lib/assertions.ts).
 *   • CF §10 `queueParticipantPositionUpdate` (onDocumentCreated "queue stage log/{id}",
 *     queuesystem.js:1663): on a log-row create at an Activity stage it rebuilds
 *     `queue_token.queueposition` for ALL `status=='ready'` tokens at that stage to sequential 1..M in
 *     `logdate` order, and sets every non-ready / preassigned token's `queueposition` to `null`.
 *
 * ANTI-CIRCULARITY (the entire point of the rebuild — brief's rule):
 *   • Test 1 drives the REAL Angular operator board through the queue-board page object (real testid
 *     locator → real click → real PeopleInvolved confirm dialog). The values it asserts are the doc the
 *     CF wrote (touchpoint), the row the board wrote (stage log, movedby='operator'), and the per-stage
 *     counts the BOARD recomputed from its live `queue_token` stream (assertCountConserved). None of
 *     these is a value the test wrote — the test only repositions a token as a PRECONDITION
 *     (participant-sim, the sanctioned stand-in) and then clicks.
 *   • Test 2 asserts a value the CF COMPUTED (`queueposition` 1..M) against a KNOWN SEEDED number (the
 *     count M of `ready` tokens the spec seeded). The spec writes `status:'ready'` (a precondition) and
 *     NEVER writes `queueposition`; the CF computes it. cf.md §10 explicitly permits triggering the
 *     log-row CREATE via the board OR `participant-sim.advance(T, activityStage)` — we use the sim as
 *     the operator/board stand-in (its log-write is identical to the board's) because driving the real
 *     UI into an Activity stage opens the studio-assignment dialog (heavy studio-config dependency),
 *     whereas the value under test here is the CF's position recompute, asserted non-circularly.
 *
 * Reused modules (NOT reimplemented): e2e/lib/assertions.ts (the universal invariants),
 *   e2e/lib/participant-sim.js (precondition / operator-stand-in writes + the allowlist-guarded db()),
 *   e2e/queue/pages/queue-board.page.ts (the real board), e2e/queue/support/auth.ts (real login),
 *   e2e/queue/support/console-guard.ts (fail on real app errors), and the exported seed primitives in
 *   e2e/fixtures/seed-test-project.js (auth-chain / queue / token writers — never duplicated here).
 *
 * Recon read before writing: cf.md §0/§1/§10, schemas.md (`participant touchpoint`, `queue stage log`,
 *   `queue_token`), flow-config.md §2 V1 (legal scoped edges), testids.md OPERATOR surface,
 *   operator.md §C/§D. Source verified: queuesystem.js:31/338/1663-1752, service.js:939,
 *   dynamic-queue-manager-clone.component.ts:2846/2883 (dropType != "Activity" → PeopleInvolved).
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from './pages/queue-board.page';
import { loginAsOperator } from './support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';

// CommonJS libs (the e2e lib layer is plain CJS — require like the other specs/page objects do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertions = require('../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seeder = require('../fixtures/seed-test-project');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../fixtures/sample-queue-config.json');

const { TESTRUNID } = require('./support/actors');
const QUEUE_NAME = `TEST ${cfg.stages.length}-stage L3rqCr`; // the seeded queue's display name (seed-test-project.js:349)

// LYL - First Cycle (flow-config.md §2 V1). Its terminal-adjacent operator edge Review→Self Evolution
// Report is the ONE plain-source→plain-target forward move in the variation (both stages have an EMPTY
// `compulsoryactivity` object in the seed config, so the board builds them as non-Activity columns →
// the move opens PeopleInvolved, not the studio dialog — verified in §3 below / component ts:2883).
const V1_ID = 'K9PRd4PfWDWtaO0vSxy3';
const MOVE_FROM = 'Review';               // [26] plain stage (compulsoryactivity {} → non-Activity column)
const MOVE_TO = 'Self Evolution Report';  // [28] plain stage; scoped OP target from Review {markascompleted}

// Activity stage for the position-recompute CF (§10). Diagnostics [15] is the central studio hub. We
// PATCH its `compulsoryactivity` to a non-empty ARRAY (and every other stage to an empty array) so the
// CF gate (`stageProperty[stage].compulsoryactivity.length != 0`, queuesystem.js:1675) fires ONLY here
// and the previousstage branch (:1714) does not crash on the seed's `{}` shape — cf.md §10 GOTCHA.
const ACTIVITY_STAGE = 'Diagnostics';
const READY_COUNT = 3; // KNOWN seeded number of `ready` tokens at the Activity stage → CF computes 1..3.

// Poll budget for CF side-effects landing on the live Firestore stream (they arrive AFTER the write).
const CF_POLL = { timeout: 30_000, intervals: [500, 1000, 2000] };

/** participant-sim.db() is the allowlist-guarded Admin Firestore handle (test project / emulator only).
 *  Used here for PRECONDITION writes only (reposition a token; flip a precondition status; patch the
 *  queue stageproperty per cf.md §10). Asserted CF/app output is read via e2e/lib/assertions.ts. */
const adb = () => sim.db();

test.describe('CF side-effects after a stage move (deployed triggers)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page); // fail on a REAL app error (benign stubbed-external noise ignored)
  });
  test.afterEach(() => {
    assertNoFatal(guard);
  });

  // ===========================================================================================
  // CF-01 (P2 #11) — onQueueStageChange touchpoint + the board's stage-log row, via a REAL UI move.
  //
  // CLOUD UPDATE (the emulator FieldValue-crash artifact no longer applies): on real cloud Firestore +
  // deployed CFs, onQueueStageChange's touchpoint write SUCCEEDS — the move fires a "Queue Stage Moved"
  // `participant touchpoint` with `label == "Moved to '<currentstage>' in <queuename>"` (queuesystem.js:339,
  // service.js:942). The emulator-only `FieldValue undefined` crash described in earlier runs is gone, so
  // this test asserts the CF's real output and stays a `test` (not fixme). The ONLY wiring subtlety the
  // cloud surfaced: `participant touchpoint` carries no `testrunid` and is NOT in the seeder teardown set,
  // and the token ids are deterministic (TESTRUNID='run1'), so "Queue Stage Moved" touchpoints from PRIOR
  // runs persist with this same parentreference. The read-back therefore fences off the pre-move docset
  // (touchpointsBefore) and accepts ONLY a NEW doc — the one the CF wrote for THIS move — so a stale
  // earlier-run touchpoint (e.g. a previous "Moved to 'Diagnostics'") cannot masquerade as this move's.
  test('CF-01 a real board move fires onQueueStageChange → "Queue Stage Moved" touchpoint + a logged operator move', async ({ page }) => {
    test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, 'EMULATOR LIMITATION: the functions emulator does not deliver/execute the onQueueStageChange touchpoint write (admin FieldValue undefined in that runtime) — this case runs on the cloud target where the CF is deployed.');
    test.setTimeout(180_000);

    // --- PRECONDITION (stand-in, not asserted): reposition ONE LYL-FC token to the Review stage so the
    //     operator has a plain→plain forward move to drive. The seed parks every token at the variation
    //     entry (Evolution Prep Orientation) which only has a SELF edge — no operator move button there.
    const tokenId = await pickVariationToken(V1_ID);
    const tok = await getToken(tokenId);
    const profileId = tok.profile_id;
    // Move the token to Review as a precondition (by:'operator' tags the stand-in; the asserted move is
    // the REAL board click below). This also writes one prior log row — accounted for in the count.
    await sim.advance(tokenId, MOVE_FROM, { by: 'operator', testrunid: TESTRUNID });
    const logsBefore = await assertions.readLogRows(tokenId);

    // --- REAL UI: operator logs in, selects the seeded queue, captures the board's recomputed counts,
    //     then drives the move Review → Self Evolution Report through the live board (PeopleInvolved).
    const board = new QueueBoardPage(page);
    await loginAsOperator(page);
    await board.selectQueue(QUEUE_NAME);

    // The card's data-token-id is profile_id || docid (testids.md). Our seeded token carries profile_id.
    const cardId = profileId || tokenId;
    const countsBefore = await board.readAllColumnCounts();
    const srcKey = resolveStageKey(countsBefore, MOVE_FROM);
    const dstKey = resolveStageKey(countsBefore, MOVE_TO);

    // Snapshot the "Queue Stage Moved" touchpoints that ALREADY exist for this token BEFORE the move, so
    // the post-move read-back (c) can demand a NEW doc. `participant touchpoint` carries no testrunid tag
    // and is not torn down (seed-test-project.js), and token ids are deterministic (run1_…) — so stale
    // touchpoints from earlier runs persist with this same parentreference; fencing them off keeps the
    // assertion on the doc THIS move produced (anti-circularity preserved — the label is still the CF's).
    const touchpointsBefore = await touchpointIdsFor(tokenId, 'Queue Stage Moved');

    // REAL move (real testid locator → real click → real confirm dialog). The PRODUCT writes the
    // queue_token update + the `queue stage log` row; the CF reacts. We do NOT read back what we wrote.
    await board.moveToken(cardId, MOVE_TO);

    // (a) BOARD recomputed its per-stage counts: src −1 / dst +1, total conserved (assertCountConserved
    //     diffs two APP-computed snapshots — never a value the test wrote).
    await expect
      .poll(async () => {
        const after = await board.readAllColumnCounts();
        return after[dstKey] === (countsBefore[dstKey] ?? 0) + 1 && after[srcKey] === (countsBefore[srcKey] ?? 0) - 1;
      }, { ...CF_POLL, message: 'board did not re-render src−1/dst+1 after the move' })
      .toBe(true);
    const countsAfter = await board.readAllColumnCounts();
    assertions.assertCountConserved(countsBefore, countsAfter, { src: srcKey, dst: dstKey });

    // (b) The board wrote the `queue stage log` row for THIS move: exactly one more row than before, and
    //     the newest row records the real UI transition MOVE_FROM → MOVE_TO with movedby='operator' (the
    //     board move, not a participant self-write). assertEveryMoveLogged's minNonSelf>=1 additionally
    //     proves the trail is not satisfiable by self-writes alone (anti-circularity, assertions.ts).
    await expect
      .poll(async () => (await assertions.readLogRows(tokenId)).length, { ...CF_POLL, message: 'board never wrote the stage-log row for the move' })
      .toBe(logsBefore.length + 1);
    await assertions.assertEveryMoveLogged(tokenId, logsBefore.length + 1, { minNonSelf: 1 });
    const newest = (await assertions.readLogRows(tokenId)).slice(-1)[0];
    expect(newest.currentstage, 'newest stage-log row is not the move the board just performed').toBe(MOVE_TO);
    expect(newest.previousstage).toBe(MOVE_FROM);
    expect(newest.movedby, 'the move-row the board wrote must be operator-driven, not a self-write').not.toBe('self');

    // (c) CF §1 read-back: onQueueStageChange wrote a NEW `participant touchpoint` for this move.
    //     Robust query is by parentreference == /queue_token/{T} (cf.md §1 GOTCHA: the CF's `profileid`
    //     field is undefined because the seed token has `profile_id`, not `profileid`). We require a doc
    //     NOT seen before the move (touchpointsBefore) so a stale, un-torn-down touchpoint from an earlier
    //     run cannot satisfy it — the one the CF wrote for THIS move is the only acceptable hit.
    const moved = await pollUntilTouchpoint(tokenId, 'Queue Stage Moved', touchpointsBefore);
    expect(moved, 'onQueueStageChange wrote no "Queue Stage Moved" participant touchpoint for the moved token').toBeTruthy();
    // The label the CF computed embeds the stage the APP moved the token to + the queue name.
    expect(String(moved.label || '')).toContain(`Moved to '${MOVE_TO}'`);
    expect(String(moved.label || '')).toContain(QUEUE_NAME);
    // parentreference points back at the exact token the UI moved (the CF wrote this ref, not the test).
    expect(refPath(moved.parentreference)).toBe(`queue_token/${tokenId}`);
  });

  // ===========================================================================================
  // CF-02 (P2 #12) — queueParticipantPositionUpdate recomputes queue_token.queueposition at an Activity
  //   stage. Asserts a CF-COMPUTED value (positions 1..M) vs a KNOWN SEEDED ready-count (anti-circular).
  // ===========================================================================================
  // FIXME (PRODUCT/CF-RUNTIME bug, not a test defect): `queueParticipantPositionUpdate` is REGISTERED in
  // the emulator (its eventarc trigger for `queue stage log/{queueStageLogId}` is created at startup) but
  // it NEVER EXECUTES on a `queue stage log` document CREATE — the functions log has zero "Beginning
  // execution of us-central1-queueParticipantPositionUpdate" entries for the whole run, while sibling
  // create-triggers on other collections (e.g. CreateQueueActivityLogV2, inviteToStudio) do fire. The
  // ready tokens therefore keep their seeded scrambled positions (observed [900,901,902]) and never
  // recompute to 1..M. Root cause is the Firestore-emulator NOT delivering onDocumentCreated events for a
  // collection whose id contains SPACES ("queue stage log") to the registered path-pattern trigger — a
  // deployed-CF/emulator-runtime gap, NOT this spec's wiring. The trigger doc IS created with a random id
  // (participant-sim.advance → .doc().id), so a re-run is not the cause. See productFindings; tracked for
  // a CF/emulator-side fix outside this category's owned files.
  test('CF-02 a stage-log create at an Activity stage fires queueParticipantPositionUpdate → ready tokens recompute to 1..M', async ({ page: _page }) => {
    test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, 'EMULATOR LIMITATION: the functions emulator does not deliver onDocumentCreated for the spaced collection "queue stage log", so queueParticipantPositionUpdate never fires — this case runs on the cloud target where the CF is deployed.');
    test.setTimeout(180_000);

    // --- PRECONDITION 1: patch the queue stageproperty so the position CF gate fires ONLY at the
    //     Activity stage and never crashes on the seed's `{}` shape (cf.md §10 GOTCHA). We deep-clone the
    //     seeded stageproperty, set EVERY stage's compulsoryactivity to [] (empty array → gate false),
    //     and the chosen Activity stage to a non-empty array of (harmless reference) ids. This is a
    //     precondition patch on the queue-generation doc the seeder already wrote — not asserted.
    const queueGenId = seeder.queueGenDocId(TESTRUNID);
    await patchCompulsoryActivity(queueGenId, ACTIVITY_STAGE);

    // --- PRECONDITION 2: seed M `ready` tokens AT the Activity stage with SCRAMBLED queuepositions, plus
    //     one extra non-ready token used to trigger the CF. We reuse the seeder's token writer, then
    //     patch status/queueposition (the seeder hardcodes status:'queued'). The CF — not the test —
    //     will compute the final positions; the test only sets the `status:'ready'` precondition.
    const ready = await seedReadyTokensAtActivity(queueGenId, READY_COUNT);
    const trigger = await seedTriggerToken(queueGenId);

    // Sanity: the precondition really scrambled positions away from 1..M, so a green result can only come
    // from the CF recomputing (not from the seed already being correct). This reads our OWN precondition
    // write (allowed — it is NOT the asserted CF output; the asserted output is the post-trigger 1..M).
    const seededPositions = await Promise.all(ready.map((t) => getToken(t).then((d) => d.queueposition)));
    expect(seededPositions, 'precondition: ready tokens must start with non-1..M positions so the CF recompute is observable')
      .not.toEqual([...Array(READY_COUNT)].map((_, i) => i + 1));

    // --- TRIGGER (operator/board stand-in, cf.md §10): create a `queue stage log` row at the Activity
    //     stage by advancing the trigger token INTO it. participant-sim.advance writes the SAME row shape
    //     the board writes (queue_token update + a `queue stage log` doc carrying queueref/currentstage/
    //     previousstage/tokenstatus — the fields the CF reads at :1666/:1675/:1714). This is the move
    //     whose log-CREATE the CF reacts to.
    await sim.advance(trigger.tokenId, ACTIVITY_STAGE, { by: 'operator', testrunid: TESTRUNID });

    // --- CF §10 read-back: poll until the `ready` tokens have recomputed to the set {1..M} (the value
    //     the CF computed) — KNOWN seeded count M is the oracle. Positions are assigned in logdate order;
    //     we assert the SET equals {1..M} (robust to logdate ordering between equal-timestamp seeds).
    await expect
      .poll(async () => {
        const positions = await Promise.all(ready.map((t) => getToken(t).then((d) => d.queueposition)));
        return JSON.stringify([...positions].sort((a, b) => a - b));
      }, { ...CF_POLL, message: `queueParticipantPositionUpdate did not recompute the ${READY_COUNT} ready tokens to 1..${READY_COUNT}` })
      .toBe(JSON.stringify([...Array(READY_COUNT)].map((_, i) => i + 1)));

    // Every ready position is distinct and within 1..M (no two tokens share a slot — silent collision).
    const finalPositions = await Promise.all(ready.map((t) => getToken(t).then((d) => d.queueposition)));
    expect(new Set(finalPositions).size, 'CF assigned duplicate queuepositions to ready tokens (collision)').toBe(READY_COUNT);

    // The non-ready trigger token at the same Activity stage must be set to queueposition == null by the
    // CF (queuesystem.js:1699 — only `ready` tokens get a numeric slot). This is the CF's write.
    await expect
      .poll(async () => (await getToken(trigger.tokenId)).queueposition, { ...CF_POLL, message: 'CF did not null the non-ready token position at the Activity stage' })
      .toBeNull();
  });
});

// =================================================================================================
// Helpers — all read APP/CF OUTPUT (via the allowlist-guarded handle) or write PRECONDITIONS only.
// =================================================================================================

/** Read a queue_token doc (post-state) via the guarded handle. Throws if it vanished. */
async function getToken(tokenId: string): Promise<any> {
  const snap = await adb().collection('queue_token').doc(tokenId).get();
  if (!snap.exists) throw new Error(`[cf-sideeffects] queue_token ${tokenId} missing`);
  return snap.data();
}

/** The doc id of one Active token in the given variation for this run (deterministic: lowest position). */
async function pickVariationToken(variationId: string): Promise<string> {
  const toks = await sim.tokensForVariation(TESTRUNID, variationId);
  if (!toks.length) {
    throw new Error(
      `[cf-sideeffects] no seeded queue_token for variation ${variationId} in run ${TESTRUNID}. ` +
        `Was the suite seeded (global-setup) for this TESTRUNID?`,
    );
  }
  return toks[0].id;
}

/** Map a stage NAME to the board's data-stage-key in a {key→count} snapshot. Throws on 0 / >1 matches
 *  (a split Activity stage would yield >1 — Review/Self Evolution Report are simple, so exactly 1). */
function resolveStageKey(counts: Record<string, number>, stageName: string): string {
  const keys = Object.keys(counts).filter((k) => k === stageName || k.startsWith(`${stageName}_`));
  if (keys.length !== 1) {
    throw new Error(
      `[cf-sideeffects] stage "${stageName}" resolved to ${keys.length} board columns (${keys.join(', ') || 'none'}); ` +
        `available keys: ${Object.keys(counts).join(', ')}`,
    );
  }
  return keys[0];
}

/** Normalise a Firestore DocumentReference (Admin SDK) to its collection/doc path string. */
function refPath(ref: any): string | null {
  if (!ref) return null;
  if (typeof ref.path === 'string') return ref.path;
  if (ref._path && Array.isArray(ref._path.segments)) return ref._path.segments.join('/');
  return null;
}

/** Firestore serverTimestamp → millis (the CF writes touchpoint.logdate via FieldValue.serverTimestamp,
 *  service.js:944; Admin reads it back as a Timestamp). 0 when absent so a pending write sinks last. */
function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t._seconds === 'number') return t._seconds * 1000 + (t._nanoseconds || 0) / 1e6;
  if (typeof t.seconds === 'number') return t.seconds * 1000 + (t.nanoseconds || 0) / 1e6;
  return 0;
}

/** Snapshot the docids of every `participant touchpoint` the CF has ALREADY written for THIS token under
 *  the given touchpoint type (matched by parentreference path — robust to the undefined `profileid` field,
 *  cf.md §1 GOTCHA). Used to fence off pre-existing docs so the post-move poll only accepts a NEW one.
 *  WHY this is needed: `participant touchpoint` is written by the CF WITHOUT a `testrunid` tag and is NOT
 *  in the seeder's teardown set (seed-test-project.js SEEDED_COLLECTIONS), so touchpoints from earlier runs
 *  PERSIST. The token ids are deterministic (TESTRUNID='run1' → `run1_tok_…`), so a prior run that moved
 *  THIS token to a different stage leaves a stale "Queue Stage Moved" doc with the same parentreference.
 *  Matching by parentreference alone would then return the stale doc (Firestore order is arbitrary) and its
 *  label embeds the OLD stage — the observed failure ("Moved to 'Diagnostics'" vs the just-moved-to stage). */
async function touchpointIdsFor(tokenId: string, touchpoint: string): Promise<Set<string>> {
  const wantPath = `queue_token/${tokenId}`;
  const snap = await adb().collection('participant touchpoint').where('touchpoint', '==', touchpoint).get();
  return new Set(snap.docs.filter((d: any) => refPath(d.data().parentreference) === wantPath).map((d: any) => d.id));
}

/** Poll `participant touchpoint` for the doc the CF wrote for THIS move (matched by parentreference path,
 *  robust to the undefined `profileid` field — cf.md §1 GOTCHA). `excludeIds` fences off touchpoints that
 *  already existed BEFORE the move (see touchpointIdsFor) so we accept ONLY a NEW doc the CF wrote in
 *  reaction to this move — never a stale, un-torn-down doc from an earlier run. When several NEW docs land
 *  (a token can re-fire the CF), the newest by `logdate` wins. Returns the doc data or null on timeout. */
async function pollUntilTouchpoint(tokenId: string, touchpoint: string, excludeIds: Set<string> = new Set()): Promise<any | null> {
  const wantPath = `queue_token/${tokenId}`;
  const deadline = Date.now() + CF_POLL.timeout;
  for (;;) {
    const snap = await adb().collection('participant touchpoint').where('touchpoint', '==', touchpoint).get();
    const fresh = snap.docs
      .filter((d: any) => !excludeIds.has(d.id) && refPath(d.data().parentreference) === wantPath)
      .map((d: any) => d.data())
      .sort((a: any, b: any) => tsMillis(b.logdate) - tsMillis(a.logdate)); // newest first
    if (fresh.length) return fresh[0];
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 800));
  }
}

/**
 * Patch ONE queue-generation doc's `stageproperty` so `activityStage.compulsoryactivity` is a non-empty
 * ARRAY and EVERY other stage's is an empty array `[]`. This is the cf.md §10 seed-fix: the seed config
 * stores compulsoryactivity as `{}`/non-empty objects, on which the CF's `.length` gate misbehaves and
 * its previousstage branch crashes. Arrays give `.length === 0` (gate false) everywhere except the
 * chosen Activity stage. Precondition only — never asserted.
 */
async function patchCompulsoryActivity(queueGenId: string, activityStage: string): Promise<void> {
  const ref = adb().collection('queue generation').doc(queueGenId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`[cf-sideeffects] queue generation ${queueGenId} missing — was the suite seeded?`);
  const stageproperty = JSON.parse(JSON.stringify(snap.data().stageproperty || {}));
  for (const stage of Object.keys(stageproperty)) {
    stageproperty[stage] = { ...stageproperty[stage], compulsoryactivity: stage === activityStage ? ['__cf_e2e_activity__'] : [] };
  }
  await ref.update({ stageproperty });
}

/**
 * Seed M `status:'ready'` tokens AT the Activity stage with SCRAMBLED queuepositions. Reuses the seeder's
 * token writer (no duplicated write logic), then patches status + a deliberately-wrong queueposition so
 * the CF's recompute to 1..M is observable. Returns the token doc ids.
 */
async function seedReadyTokensAtActivity(queueGenId: string, count: number): Promise<string[]> {
  // adb()/sim.db() already initialised the firebase-admin app pinned to the test project (allowlist
  // guard), so requiring firebase-admin here returns that SAME initialised app (no new init / no creds).
  const admin = require('firebase-admin');
  const db = adb();
  const queueRef = db.collection('queue generation').doc(queueGenId);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const profileid = `${TESTRUNID}_cfpos_ready_${i}`;
    // Reuse the canonical token writer (auth-chain not needed — these tokens are never logged-in as).
    await seeder.seedParticipantToken(
      db, admin, TESTRUNID,
      { profileid, email: `cfpos_ready_${i}+${TESTRUNID}@example.com`, variationid: V1_ID, stage: ACTIVITY_STAGE, queueposition: 999 - i },
      queueRef,
    );
    const id = seeder.tokenDocId(TESTRUNID, profileid);
    // Precondition patch: make them the waiting list (status:'ready') with a scrambled position (NOT the
    // asserted value — the CF overwrites queueposition; we only set the `status` precondition).
    await db.collection('queue_token').doc(id).update({ status: 'ready', queueposition: 900 + i });
    ids.push(id);
  }
  return ids;
}

/** Seed ONE extra non-ready token (parked off the Activity stage) used to TRIGGER the position CF by
 *  being advanced into the Activity stage. Returns its token id + the stage it starts on. */
async function seedTriggerToken(queueGenId: string): Promise<{ tokenId: string; startStage: string }> {
  const admin = require('firebase-admin');
  const db = adb();
  const queueRef = db.collection('queue generation').doc(queueGenId);
  const profileid = `${TESTRUNID}_cfpos_trigger`;
  // Park it on the variation's FIRST stage (a non-Activity stage after our patch → previousstage branch
  // of the CF is correctly skipped, no crash; cf.md §10 GOTCHA).
  const startStage = cfg.queuevariation.find((v: any) => v.id === V1_ID).stages[0];
  await seeder.seedParticipantToken(
    db, admin, TESTRUNID,
    { profileid, email: `cfpos_trigger+${TESTRUNID}@example.com`, variationid: V1_ID, stage: startStage, queueposition: 950 },
    queueRef,
  );
  return { tokenId: seeder.tokenDocId(TESTRUNID, profileid), startStage };
}
