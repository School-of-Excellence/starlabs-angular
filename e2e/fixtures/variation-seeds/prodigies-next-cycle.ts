// @ts-nocheck
/**
 * Seed builder — V4 · Prodigies - Next Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V4 (PLAN §2.4 V4, cases PNC-WF-01/02/03).
 *   variationId : zvFQgmYarx1NKubIP70R
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 16 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * AEL self-moves to Prodigies Preparation Form; In Evolution Mapping Activity goes straight to
 * Ready for Diagnostics (SKIPS the Self-Eval/Guided-Self-ATC pair). Consultation is OFF the forward
 * happy path (flow-config.md §3 D2). Seeds PRECONDITIONS only; the spec asserts CF/app output.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of Prodigies - Next Cycle (flow-config.md §2 V4). */
export const VARIATION_ID = 'zvFQgmYarx1NKubIP70R';
export const VARIATION_NAME = 'Prodigies - Next Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V4 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (PNC-WF-01). */
export const DEFAULT_COHORT = 1;

export function seedProdigiesNextCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedProdigiesNextCycle;
