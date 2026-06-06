// @ts-nocheck
/**
 * Seed builder — V2 · LYL - Next Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V2 (PLAN §2.4 V2, case LYL-NC-WF-01).
 *   variationId : zxcF1MNH8Jp0eCxxXASY   (the SEED id — flow-config.md §2 V2 flags that PLAN §2.4
 *                                          lists `41KiwsFl4dZ6JhtfPemA`; TRUST THE SEED id here,
 *                                          which matches sample-queue-config.json + the fixture)
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 18 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * Seeds PRECONDITIONS only; the spec drives the real UI / sim and asserts CF/app output.
 * V2's discriminator vs V7 is the Diagnostics/ATC-Briefing branch set (V2 has →Consultation) —
 * exercised by the spec, not the seed.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of LYL - Next Cycle (flow-config.md §2 V2 — the SEED id, not the PLAN id). */
export const VARIATION_ID = 'zxcF1MNH8Jp0eCxxXASY';
export const VARIATION_NAME = 'LYL - Next Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V2 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (LYL-NC-WF-01). */
export const DEFAULT_COHORT = 1;

export function seedLylNextCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedLylNextCycle;
