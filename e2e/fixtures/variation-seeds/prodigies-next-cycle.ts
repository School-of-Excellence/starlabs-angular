// @ts-nocheck
/**
 * Seed builder — V4 · Prodigies - Next Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V4 (PLAN §2.4 V4, cases PNC-WF-01/02/03 +
 * the PNC-FWD per-forward-journey expansion).
 *   variationId : zvFQgmYarx1NKubIP70R
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 16 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * AEL self-moves to Prodigies Preparation Form; In Evolution Mapping Activity goes straight to
 * Ready for Diagnostics (SKIPS the Self-Eval/Guided-Self-ATC pair). Consultation is OFF the forward
 * happy path (flow-config.md §3 D2). Seeds PRECONDITIONS only; the spec asserts CF/app output.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * VARIATION-ID NAMESPACE RECONCILIATION (the real-board move-dropdown fix — see SHARED BRIEF).
 *
 * ROOT CAUSE (confirmed against the live emulator + the board source): the shared seeder writes the
 * `queue variation` DOC at id `${testrunid}_<rawId>` (seed-test-project.js seedQueueAndVariations:425)
 * but writes `queue_token.variationid` as the RAW `<rawId>` (seedParticipantToken:510). The operator
 * board builds `mapVariation[document.id]` keyed by the PREFIXED variation-doc id (dynamic-queue-manager-
 * clone.component.ts:1817, idField:'id') and then, when building a token's move-dropdown, looks up
 * `mapVariation[token['variationid']]` (checkAvailablestages:2784). RAW token.variationid never matches a
 * PREFIXED map key, so the lookup misses and the board FALLS BACK to the full 30-stage queue list (:2788)
 * — the dropdown then offers every queue stage (illegal scoped edges included) instead of THIS variation's
 * scoped stages, and a real-board move on a variation-scoped edge is not driven against the correct stage
 * set. The same mismatch breaks the dynamic-studio move-next path (queueVariation[token.variationid],
 * dynamic-studio.component.ts:383/1291/1372). The seeder also already remaps nextstage `variations` to the
 * PREFIXED ids (remapStagePropertyVariations:263), so the consistent fix is to align token.variationid to
 * the PREFIXED variation-doc id too.
 *
 * THE SHARED-SEEDER FIX is returned as a seedRequest (the shared seeders — seed-test-project.js /
 * seed-emulator.js — are owned elsewhere). Until that lands, this builder reconciles the namespace LOCALLY
 * for ONLY this variation's seeded tokens: after `seedVariation`, it re-points each walked token's
 * `variationid` to `${testrunid}_<rawId>` (the id the board's `mapVariation` is actually keyed by). This is
 * a PRECONDITION-shape change only (the same field the shared seeder would set once fixed) — it does NOT
 * weaken any assertion: the spec still passes the RAW `VARIATION_ID` to the flow-model oracle (the oracle
 * reads the raw config), and the board reads the live `variationid` field. Scope is strictly this builder's
 * own tokens; no shared seeder, page object, or other variation's docs are touched.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

// The shared seeder primitives — reused ONLY to obtain the allowlist-guarded admin handle (test
// project / emulator) for the one-field token reconciliation below. Never re-implements seed logic.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seeder = require('../seed-test-project');

/** Seed-config id of Prodigies - Next Cycle (flow-config.md §2 V4). */
export const VARIATION_ID = 'zvFQgmYarx1NKubIP70R';
export const VARIATION_NAME = 'Prodigies - Next Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V4 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (PNC-WF-01). */
export const DEFAULT_COHORT = 1;

/**
 * The id the operator board's `mapVariation` is keyed by for this run — the PREFIXED `queue variation`
 * doc id (`${testrunid}_<rawId>`). The board reads `mapVariation[token.variationid]`, so the walked
 * token's `variationid` must equal THIS for the scoped move-dropdown to render (see header). The spec
 * still uses the RAW `VARIATION_ID` for the flow-model oracle.
 */
export function boardVariationId(testrunid: string): string {
  return `${testrunid}_${VARIATION_ID}`;
}

/**
 * Seed V4 preconditions, then reconcile the walked tokens' `variationid` to the PREFIXED variation-doc id
 * the board keys its move-dropdown by (header). Returns the standard VariationSeedResult AND a
 * `boardVariationId` field so the spec knows the value the board will resolve. Idempotent.
 */
export async function seedProdigiesNextCycle(
  opts: VariationSeedOptions = {},
): Promise<VariationSeedResult & { boardVariationId: string; rawVariationId: string }> {
  const seeded = await seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });

  // Reconcile every seeded token's variationid → the PREFIXED variation-doc id the board's mapVariation
  // is keyed by (the local stand-in for the shared-seeder fix; see header / the returned seedRequest).
  const boardVid = boardVariationId(seeded.testrunid);
  const admin = seeder.initAdmin();          // allowlist-guarded; honours FIRESTORE_EMULATOR_HOST
  const db = admin.firestore();
  const batch = db.batch();
  for (const tokenId of seeded.tokenIds) {
    batch.update(db.collection('queue_token').doc(tokenId), { variationid: boardVid });
  }
  if (seeded.tokenIds.length) await batch.commit();

  return { ...seeded, boardVariationId: boardVid, rawVariationId: VARIATION_ID };
}

export default seedProdigiesNextCycle;
