// @ts-nocheck
/**
 * Seed builder — V9 · uP! - Prep Hold.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V9 (PLAN §2.4 V9, cases UPH-00/01/02).
 *   variationId : PJQVQf9HU0PxSCIbH5re
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 1 · first stage == terminal: uP! Prep Process - Hold [1]
 *
 * The sole stage is a PARKING stage: selfmovable:false, actiontype:null, nextstage:[], no widgets,
 * no compulsoryactivity. Entry IS the terminal — ZERO out-edges, ZERO participant CTA. The token is
 * therefore seeded directly onto `uP! Prep Process - Hold` (== stages[0], resolved by _common).
 *
 * The spec `up-prep-hold.spec.ts` asserts the no-move/no-log invariant (move-dropdown EMPTY,
 * selfmovable==false, 0 stage-log docs, vacuous every-move-logged 0==0) and that the participant
 * simulator emits NO self-move for this token. So this builder MUST NOT seed any extra stage-log
 * or advance the token — it only lays the single parked token. Seeds PRECONDITIONS only.
 *
 * NOTE (flow-config.md §4): this stage is also one of the 2 documented global orphans, which is
 * EXPECTED — do not "fix" it. `oracle()` skips reachability for len-1 variations.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of uP! - Prep Hold (flow-config.md §2 V9). */
export const VARIATION_ID = 'PJQVQf9HU0PxSCIbH5re';
export const VARIATION_NAME = 'uP! - Prep Hold';
/** The sole stage — entry == terminal (flow-config.md §2 V9). Tokens are parked here. */
export const FIRST_STAGE = 'uP! Prep Process - Hold';
/** Default cohort: a single parked participant (UPH-01/02). */
export const DEFAULT_COHORT = 1;

export function seedUpPrepHold(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedUpPrepHold;
