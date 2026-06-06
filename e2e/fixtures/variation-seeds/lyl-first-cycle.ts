// @ts-nocheck
/**
 * Seed builder — V1 · LYL - First Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V1 (PLAN §2.4 V1, cases LYL-FC-WF-01/02/03).
 *   variationId : K9PRd4PfWDWtaO0vSxy3   (the SEED id — trust the seed, not the PLAN's synthetic ids)
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 17 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * Seeds PRECONDITIONS only (queue generation + the LYL-FC variation doc + N tokens at the first
 * stage). The spec `e2e/queue/variations/lyl-first-cycle.spec.ts` drives the real board / the
 * participant-sim and asserts CF/app output (stage-log rows, re-rendered counts) — never the
 * value seeded here (anti-circularity).
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of LYL - First Cycle (flow-config.md §2 V1). */
export const VARIATION_ID = 'K9PRd4PfWDWtaO0vSxy3';
export const VARIATION_NAME = 'LYL - First Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V1 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: V1 walks a single participant (LYL-FC-WF-01); raise via opts.cohort. */
export const DEFAULT_COHORT = 1;

export function seedLylFirstCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedLylFirstCycle;
