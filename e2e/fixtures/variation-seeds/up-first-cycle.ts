// @ts-nocheck
/**
 * Seed builder — V6 · uP! - First Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V6 (PLAN §2.4 V6, cases UPFC-HAPPY/LOOP/GAP).
 *   variationId : M2wSxXnHYzvBRcpIlXYJ
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 17 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * Stages 1–8 identical to V1 (LYL-FC); from Diagnostics down it uses the uP!-family branch set
 * (NO →Consultation forward) — the V1↔V6 divergence the spec asserts. Consultation is OFF the
 * forward happy path (flow-config.md §3 D2). Seeds PRECONDITIONS only; the spec asserts CF/app output.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of uP! - First Cycle (flow-config.md §2 V6). */
export const VARIATION_ID = 'M2wSxXnHYzvBRcpIlXYJ';
export const VARIATION_NAME = 'uP! - First Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V6 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (UPFC-HAPPY). */
export const DEFAULT_COHORT = 1;

export function seedUpFirstCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedUpFirstCycle;
