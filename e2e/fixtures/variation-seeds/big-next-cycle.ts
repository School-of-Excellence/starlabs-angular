// @ts-nocheck
/**
 * Seed builder — V3 · B!G - Next Cycle.
 *
 * Authoritative source: e2e/queue/recon/flow-config.md §2 V3 (PLAN §2.4 V3, cases BIGNC-00…06).
 *   variationId : mLAX7wA6n9XgkuTkGl7K   (the SEED id — flow-config.md §2 V3 flags that PLAN §2.4
 *                                          describes a synthetic 5-stage `BIGNC`; TRUST THE SEED:
 *                                          this is the REAL 24-stage variation, the only one with
 *                                          the in-person + Triple-ATC sub-flow)
 *   queue       : L3rqCrqDBsshd7HM5YRn   (seeded as `${testrunid}_${QUEUE_ID}`)
 *   backbone len: 24 · first stage: Evolution Prep Orientation [0] (AUTO gate → AEL Form)
 *
 * ⚠ Reachability (flow-config.md §3 D3): the in-person/Triple-ATC branch ([20]–[24],[27]) is NOT
 * forward-reachable from the first stage through the scoped oracle. A spec that wants to exercise
 * those stages must SEED a token directly onto `Diagnostics In-person` (operator-drag entry,
 * runtime/off-config) — pass `opts.startStage: 'Diagnostics In-person'`. The default seeds the
 * main-spine entry. Seeds PRECONDITIONS only; the spec asserts CF/app output.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

/** Seed-config id of B!G - Next Cycle (flow-config.md §2 V3 — the SEED id, the real 24-stage variation). */
export const VARIATION_ID = 'mLAX7wA6n9XgkuTkGl7K';
export const VARIATION_NAME = 'B!G - Next Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V3 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/**
 * Operator-drag entry to the in-person sub-branch (flow-config.md §3 D3). NOT a default start —
 * pass `seedBigNextCycle({ startStage: IN_PERSON_ENTRY })` to seed a token there.
 */
export const IN_PERSON_ENTRY = 'Diagnostics In-person';
/** Default cohort: single walked participant (BIGNC main-spine happy path). */
export const DEFAULT_COHORT = 1;

export function seedBigNextCycle(opts: VariationSeedOptions = {}): Promise<VariationSeedResult> {
  return seedVariation(VARIATION_ID, { cohort: DEFAULT_COHORT, ...opts });
}

export default seedBigNextCycle;
