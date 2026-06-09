// @ts-nocheck
/**
 * invariants-selftest.spec.ts — TEST-THE-TEST for the harness guards the PRODUCT specs depend on
 * but that previously had NO self-test. Mirrors oracle-selftest.spec.ts + loop-bound-selftest.spec.ts:
 * inject a defect and prove the guard FIRES (throws), and prove it does NOT fire on the clean case
 * (so it is not vacuously always-red). If any of these go red, a guard the walk/variation suite leans
 * on has stopped catching its failure class — and a whole class of product tests would be vacuously green.
 *
 * Closes the meta-layer completeness gaps found in the 2026-06-09 evidence audit:
 *   • INVARIANT 2  assertEveryMoveLogged  (count conservation — the primary non-circular walk guard)
 *   • INVARIANT 3  assertNoStageSkipped   (no illegal scoped edge / no silent skip)
 *   • flow-model   selfmovable parity DETECTOR (the edge-vs-flag check 1b actually catches a flip)
 *   • flow-model   outEdgesForVariation scoping (an edge scoped to one variation is excluded for another)
 *
 * This whole file is META (it validates the harness, drives no product UI/CF) → tagged @oracle.
 * INVARIANT-2/3 cases read/write ONLY the `queue stage log` collection by a unique self-test docid
 * (never a seeded token) via the allowlist-guarded admin handle — hermetic; no app, no CF, no seed.
 */
import { test, expect } from '@playwright/test';

// CommonJS libs (the e2e lib layer is plain CJS — require like the other specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assertions = require('../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const flowModel = require('../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../fixtures/sample-queue-config.json');
const { TESTRUNID } = require('./support/actors');

const COL_LOG = 'queue stage log';
const MODEL = flowModel.build(cfg);
const DOCID_BASE = `invariants_selftest_${TESTRUNID}`;

// --------------------------------------------------------------------------------------------------
// Helpers — write/clear the EXACT `queue stage log` rows readLogRows() reads, and assert a guard throws.
// --------------------------------------------------------------------------------------------------
async function clearRows(docid: string): Promise<void> {
  const snap = await sim.db().collection(COL_LOG).where('docid', '==', docid).get();
  await Promise.all(snap.docs.map((d: any) => d.ref.delete()));
}

/** Write one canonical stage-log row (the shape readLogRows/observedTransitions read), ordered by `orderMs`. */
async function writeRow(docid: string, previousstage: string | null, currentstage: string, movedby: string, orderMs: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin'); // sim.db() already initialised the app (allowlist-pinned)
  await sim.db().collection(COL_LOG).add({
    docid, previousstage, currentstage, movedby,
    logdate: admin.firestore.Timestamp.fromMillis(orderMs),
  });
}

/** Assert `fn` throws, and (optionally) that the thrown message matches `re`. */
async function expectThrow(fn: () => Promise<any>, re?: RegExp): Promise<void> {
  let err: Error | null = null;
  try { await fn(); } catch (e) { err = e as Error; }
  expect(err, 'expected the guard to THROW on the injected defect, but it did not (guard is broken / vacuous)').toBeTruthy();
  if (re) expect(err!.message, `thrown message must match ${re}`).toMatch(re);
}

const hasSelfMoveEdge = (M: any, stage: string, vid: string): boolean =>
  flowModel.outEdgesForVariation(M, stage, vid).some((e: any) => e.type === 'selfmove' && e.selfmv);

// --- fixture pickers (same logic the probe confirmed yields real targets; in-spec so they adapt) ---
function pickOperatorGate() {
  for (const v of cfg.queuevariation) for (const s of (v.stages || [])) {
    if ((cfg.stageproperty[s] || {}).selfmovable) continue;
    if (hasSelfMoveEdge(MODEL, s, v.id)) continue;
    const fwd = flowModel.outEdgesForVariation(MODEL, s, v.id).filter((e: any) => e.type === 'next' && !e.loop && !e.back);
    if (fwd.length) return { vid: v.id, gate: s };
  }
  return null;
}
function pickLegalIllegal() {
  for (const v of cfg.queuevariation) for (const s of (v.stages || [])) {
    const outs = flowModel.outEdgesForVariation(MODEL, s, v.id).map((e: any) => e.to);
    const legalTo = outs.find((t: string) => t !== s);
    const illegalTo = (v.stages || []).find((x: string) => x !== s && !outs.includes(x));
    if (legalTo && illegalTo) return { vid: v.id, from: s, legalTo, illegalTo };
  }
  return null;
}
function pickVariationScopedEdge() {
  for (const e of MODEL.edges) {
    if (e.type !== 'next' || e.dangling || !e.variations || !e.variations.length) continue;
    const other = cfg.queuevariation.find((v: any) =>
      !e.variations.includes(v.id) && (v.stages || []).includes(e.from) &&
      !flowModel.outEdgesForVariation(MODEL, e.from, v.id).some((x: any) => x.to === e.to));
    if (other) return { from: e.from, to: e.to, inVid: e.variations[0], outVid: other.id };
  }
  return null;
}

test.describe('Invariants self-test — harness guards FIRE on a defect (test-the-test)', { tag: '@oracle' }, () => {

  // ============ INVARIANT 2 — EVERY-MOVE-LOGGED (count conservation) ============
  test.describe('assertEveryMoveLogged catches a dropped / duplicate / self-only trail', () => {
    const DOC = `${DOCID_BASE}_eml`;
    test.afterAll(() => clearRows(DOC));

    test('INV2 passes at exact count; throws on dropped row, duplicate row, and unmet minNonSelf', async () => {
      // CLEAN — 3 operator transitions → exactly 3 rows; count + minNonSelf both satisfied.
      await clearRows(DOC);
      await writeRow(DOC, null, 'A', 'operator', 1000);
      await writeRow(DOC, 'A', 'B', 'operator', 2000);
      await writeRow(DOC, 'B', 'C', 'operator', 3000);
      const ok = await assertions.assertEveryMoveLogged(DOC, 3, { minNonSelf: 3 });
      expect(ok.logged, 'clean trail of 3 must pass').toBe(3);

      // DEFECT A — a row was DROPPED (2 present, 3 expected): guard MUST throw.
      await clearRows(DOC);
      await writeRow(DOC, null, 'A', 'operator', 1000);
      await writeRow(DOC, 'A', 'B', 'operator', 2000); // B→C dropped
      await expectThrow(() => assertions.assertEveryMoveLogged(DOC, 3), /\[EVERY-MOVE-LOGGED\][\s\S]*found 2/);

      // DEFECT B — a DUPLICATE row double-fired (4 present, 3 expected): guard MUST throw.
      await clearRows(DOC);
      await writeRow(DOC, null, 'A', 'operator', 1000);
      await writeRow(DOC, 'A', 'B', 'operator', 2000);
      await writeRow(DOC, 'B', 'C', 'operator', 3000);
      await writeRow(DOC, 'B', 'C', 'operator', 3001); // duplicate double-fire
      await expectThrow(() => assertions.assertEveryMoveLogged(DOC, 3), /\[EVERY-MOVE-LOGGED\][\s\S]*found 4/);

      // DEFECT C — anti-circularity: count satisfied by SELF writes only, but minNonSelf demands operator rows.
      await clearRows(DOC);
      await writeRow(DOC, null, 'A', 'self', 1000);
      await writeRow(DOC, 'A', 'B', 'self', 2000);
      await expectThrow(() => assertions.assertEveryMoveLogged(DOC, 2, { minNonSelf: 1 }), /\[EVERY-MOVE-LOGGED\][\s\S]*operator\/CF-driven/);
    });
  });

  // ============ INVARIANT 3 — NO-STAGE-SKIPPED (no illegal scoped edge) ============
  test.describe('assertNoStageSkipped catches an illegal scoped edge', () => {
    const DOC = `${DOCID_BASE}_nss`;
    test.afterAll(() => clearRows(DOC));

    test('INV3 passes on a legal trail; throws on an illegal skip', async () => {
      const pick = pickLegalIllegal();
      expect(pick, 'fixture must yield a stage with a legal edge + an illegal (non-edge) target').toBeTruthy();
      const { vid, from, legalTo, illegalTo } = pick!;

      // CLEAN — entry hop (null→from) + a LEGAL scoped edge (from→legalTo): passes.
      await clearRows(DOC);
      await writeRow(DOC, null, from, 'operator', 1000);
      await writeRow(DOC, from, legalTo, 'operator', 2000);
      const ok = await assertions.assertNoStageSkipped(DOC, MODEL, vid);
      expect(ok.checked, 'legal 2-row trail must pass').toBe(2);

      // DEFECT — an ILLEGAL skip (from→illegalTo has no oracle edge for this variation): guard MUST throw.
      await clearRows(DOC);
      await writeRow(DOC, null, from, 'operator', 1000);
      await writeRow(DOC, from, illegalTo, 'operator', 2000);
      await expectThrow(
        () => assertions.assertNoStageSkipped(DOC, MODEL, vid),
        /\[NO-STAGE-SKIPPED\][\s\S]*is NOT a legal scoped edge/,
      );
    });
  });

  // ============ flow-model — SELFMOVABLE parity DETECTOR (edge-vs-flag check 1b) ============
  test('INV-selfmv: flipping an operator gate to selfmovable:true is DETECTABLE by parity check 1b', () => {
    const pick = pickOperatorGate();
    expect(pick, 'fixture must contain at least one operator gate (non-self-movable, operator-only forward)').toBeTruthy();
    const { vid, gate } = pick!;

    // Baseline (clean config): the gate is non-self-movable and exposes NO self-move edge — consistent.
    expect(!!(cfg.stageproperty[gate] || {}).selfmovable, `"${gate}" baseline must be non-self-movable`).toBe(false);
    expect(hasSelfMoveEdge(MODEL, gate, vid), `"${gate}" baseline must expose no self-move edge`).toBe(false);

    // Inject the drift a regression would introduce: flip the gate to selfmovable:true, rebuild the oracle.
    const drifted = JSON.parse(JSON.stringify(cfg));
    drifted.stageproperty[gate].selfmovable = true;
    const M2 = flowModel.build(drifted);
    const driftedConfigFlag = !!drifted.stageproperty[gate].selfmovable; // true
    const driftedHasEdge = hasSelfMoveEdge(M2, gate, vid);               // still false (explicit operator route suppresses it)

    // This IS the condition parity-1b asserts (configFlag ⇒ must have a self-move edge). The mismatch is
    // exactly what makes the parity test go RED on this regression — proving 1b is a real detector, not 1a's
    // tautology. A participant gate silently opened (selfmovable:true on an operator stage) is caught here.
    expect(driftedConfigFlag, 'flipped flag is true').toBe(true);
    expect(driftedHasEdge, `flip of operator gate "${gate}" must remain edge-less (detectable mismatch)`).toBe(false);
    expect(driftedConfigFlag === driftedHasEdge, 'parity-1b fires: configFlag !== hasSelfMoveEdge after the flip').toBe(false);
  });

  // ============ flow-model — outEdgesForVariation SCOPING (variation isolation) ============
  test('INV-scope: an edge scoped to one variation is EXCLUDED for another (outEdgesForVariation isolation)', () => {
    const pick = pickVariationScopedEdge();
    expect(pick, 'fixture must contain a variation-scoped operator edge whose `from` is shared by another variation').toBeTruthy();
    const { from, to, inVid, outVid } = pick!;

    const inEdges = flowModel.outEdgesForVariation(MODEL, from, inVid).map((e: any) => e.to);
    const outEdges = flowModel.outEdgesForVariation(MODEL, from, outVid).map((e: any) => e.to);

    expect(inEdges, `edge "${from}"→"${to}" must be present for its own variation ${inVid}`).toContain(to);
    expect(outEdges, `edge "${from}"→"${to}" (scoped to ${inVid}) must be EXCLUDED for variation ${outVid} — no scope leak`).not.toContain(to);
  });
});
