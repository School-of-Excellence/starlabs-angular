// @ts-nocheck
/**
 * Seed builder — V8 · uP! - 3rd Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V8 (PLAN §2.4 V8, case UP3-WF-01).
 *   variationId : XmCS5togakPzWjfQvEe3
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 18 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * Stage list IDENTICAL to V7 (uP!-NC). The ONLY oracle difference: Diagnostics has 5 forward edges
 * (NOT 6) — it drops Diagnostics→Self Evolution Report. The spec's variation-scoping negative
 * assertion (PLAN P1 #12) checks the Diagnostics move-dropdown offers EXACTLY 5 buttons and omits
 * both →Consultation (LYL/B!G-only) and →Self Evolution Report (V4–V7). That dropped edge also drops
 * V8's distinct FORWARD journey count to 8 (V7 has 9) — the spec's 72-journey expansion walks all 8.
 * Seeds PRECONDITIONS only; the spec asserts CF/app output.
 *
 * NOTE (variationid namespace — RESOLVED in the shared seeder): `seedParticipantToken` now writes the
 * token's `variationid` PREFIXED (`${testrunid}_${id}`) to match the `queue variation` DOC id + the
 * queue's nextstage `variations` the board/studio key by (mapVariation / queueVariation). This builder
 * therefore needs NO local re-pin — the prefixed token is produced at the source. (Any belt-and-suspenders
 * re-pin in up-3rd-cycle.spec.ts is now an idempotent no-op writing the same prefixed value.)
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of uP! - 3rd Cycle (flow-config.md §2 V8). */
export const VARIATION_ID = 'XmCS5togakPzWjfQvEe3';
export const VARIATION_NAME = 'uP! - 3rd Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V8 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort: single walked participant (UP3-WF-01). */
export const DEFAULT_COHORT = 1;

export function seedUp3rdCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedUp3rdCycle;
