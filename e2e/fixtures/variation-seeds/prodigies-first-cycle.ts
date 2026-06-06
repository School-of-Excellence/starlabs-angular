// @ts-nocheck
/**
 * Seed builder — V5 · Prodigies - First Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V5 (PLAN §2.4 V5, case PFC-WF-01).
 *   variationId : GHsYb6bRCg4qBWqgUKe6   (the SEED id — flow-config.md §2 V5 flags that PLAN §2.4
 *                                          lists `zUuoZoJHHDQnPTA6Ap68` + a synthetic 5-stage path;
 *                                          TRUST THE SEED: 13 stages, NO ATC Orientation Form /
 *                                          Guided Self ATC)
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 13 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * ⚠ COHORT N≥2 (PLAN PFC-WF-01 "5-stage cohort (N≥2) walkforward" / §2.4 V5 "cohort N,
 * conservation"): this variation's spec asserts cohort conservation (Σ tokens == N across the
 * board after the walk). N==1 makes that invariant vacuous, so the DEFAULT cohort here is 2.
 * The seed lays N tokens at the first stage; the spec moves them and asserts the conserved sum —
 * never the seeded value (anti-circularity).
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of Prodigies - First Cycle (flow-config.md §2 V5 — the SEED id, 13 stages). */
export const VARIATION_ID = 'GHsYb6bRCg4qBWqgUKe6';
export const VARIATION_NAME = 'Prodigies - First Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V5 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort N≥2 — the conservation invariant (Σ==N) needs >=2 tokens to be meaningful. */
export const DEFAULT_COHORT = 2;

export function seedProdigiesFirstCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  // Floor the cohort at 2 even if a caller passes 1, to preserve the N≥2 conservation contract.
  const cohort = Math.max(DEFAULT_COHORT, opts.cohort ?? DEFAULT_COHORT);
  return seedVariation(VARIATION_ID, { ...opts, cohort });
}

export default seedProdigiesFirstCycle;
