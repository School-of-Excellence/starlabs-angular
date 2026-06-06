// @ts-nocheck
/**
 * Seed builder — V7 · uP! - Next Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V7 (PLAN §2.4 V7, case WF-uPNextCycle-001).
 *   variationId : hdxaoI8zASDEk56OVIrk
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 18 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * Stage list + self-move backbone IDENTICAL to V2 (LYL-NC); the ONLY difference is the
 * Diagnostics-and-down branch set — V7 uses the uP!-family branches (NO →Consultation from
 * Diagnostics/ATC-Prep/ATC-Briefing). The headline V2↔V7 divergence the spec asserts (ATC Briefing
 * must NOT offer Consultation). Includes the link stage [10] no-write assertion. Seeds
 * PRECONDITIONS only; the spec asserts CF/app output.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of uP! - Next Cycle (flow-config.md §2 V7). */
export const VARIATION_ID = 'hdxaoI8zASDEk56OVIrk';
export const VARIATION_NAME = 'uP! - Next Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V7 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (WF-uPNextCycle-001). */
export const DEFAULT_COHORT = 1;

export function seedUpNextCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedUpNextCycle;
