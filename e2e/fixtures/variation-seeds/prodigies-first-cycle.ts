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
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * VARIATION-ID NAMESPACE (the green-up root cause — coordinated SEED_REQUEST below):
 *
 * The shared seeder writes a token's `variationid` as the RAW sample-config id (`GHsYb6bRCg4qBWqgUKe6`,
 * seed-test-project.js seedParticipantToken:510), but it writes the `queue variation` DOC at the
 * PREFIXED id `${testrunid}_${rawId}` (seedQueueAndVariations:425) AND remaps the queue's nextstage
 * `variations` to the same PREFIXED ids (remapStagePropertyVariations:263). The board keys
 * `mapVariation` by the variation DOC id (dynamic-queue-manager-clone.ts:1816) and the studio keys
 * `queueVariation` by the same DOC id (dynamic-studio.ts:383) — both PREFIXED. So a token carrying the
 * RAW id:
 *   • on the BOARD move-dropdown, `checkAvailablestages` (ts:2784) finds NO `mapVariation[rawId]` and
 *     FALLS BACK to ALL 30 queue stages — the dropdown is NOT variation-scoped (it offers stages that
 *     are not even in V5, e.g. "Guided Self ATC");
 *   • in the STUDIO, the move-next button (dynamic-studio.html:527) requires
 *     `queueVariation[token.variationid]` AND `config.variations.includes(token.variationid)` — both
 *     keyed/valued by the PREFIXED id — so with the RAW id the button can NEVER render and the
 *     specialist studio hop cannot be driven.
 *
 * THE FIX (precondition, in THIS owned seed wrapper — not the shared seeder): after seeding, set each
 * cohort token's `variationid` to the PREFIXED DOC id `${testrunid}_${VARIATION_ID}`, so the board /
 * studio variation scoping resolves exactly as production does for a real seeded queue. The flow-model
 * ORACLE is built from the RAW cfg, so the SPEC keeps passing the RAW `VARIATION_ID` to every
 * `outEdgesForVariation` / `assertNoStageSkipped` call — the token FIELD (read by the UI) and the
 * oracle ARG (read by the assertions) are intentionally different values. `variationDocId` (PREFIXED)
 * is returned alongside `variationId` (RAW) for that split.
 *
 * SEED_REQUEST (returned by the spec): make seed-test-project.js `seedParticipantToken` write the
 * PREFIXED `${testrunid}_${variationid}` into queue_token.variationid (or have `_common.ts` pass it),
 * so EVERY variation cohort is board/studio-scoped without this per-wrapper post-process.
 *
 * CROWDED-ENTRY ORDERING: the board's queue_token stream is `orderBy("logdate","asc")` and renders
 * only the first PAGE_SIZE (15) per column behind "Load More" (component ts:1827/2477). The base seed
 * piles 49 participants onto the SHARED "Evolution Prep Orientation" entry column, and a freshly-seeded
 * cohort token has the LATEST logdate ⇒ it sorts LAST and is paged out. The spec pages it in (polled
 * `revealTokenCard`), and as belt-and-suspenders this wrapper back-dates the cohort tokens' `logdate`
 * to BEFORE the base roster so they render on page 1 even without paging. Ordering only — not asserted.
 */
import { seedVariation, VariationSeedOptions, VariationSeedResult } from './_common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');

/** Seed-config id of Prodigies - First Cycle (flow-config.md §2 V5 — the SEED id, 13 stages). */
export const VARIATION_ID = 'GHsYb6bRCg4qBWqgUKe6';
export const VARIATION_NAME = 'Prodigies - First Cycle';
/** First stage tokens are seeded onto (flow-config.md §2 V5 row 1). */
export const FIRST_STAGE = 'Evolution Prep Orientation';
/** Default cohort N≥2 — the conservation invariant (Σ==N) needs >=2 tokens to be meaningful. */
export const DEFAULT_COHORT = 2;

/** The PREFIXED `queue variation` DOC id for a run (== the key board/studio scope by). */
export function variationDocId(testrunid: string): string {
  return `${testrunid}_${VARIATION_ID}`;
}

/** Extends VariationSeedResult with the PREFIXED variation doc id the cohort tokens are scoped to. */
export interface ProdigiesFirstCycleSeed extends VariationSeedResult {
  /** PREFIXED `queue variation` doc id (`${testrunid}_${VARIATION_ID}`) — the value written into each
   *  cohort token's `variationid` field so the board/studio variation scoping resolves. The ORACLE arg
   *  stays the RAW `VARIATION_ID`. */
  variationDocId: string;
}

export async function seedProdigiesFirstCycle(opts: VariationSeedOptions = {}): Promise<ProdigiesFirstCycleSeed> {
  // Floor the cohort at 2 even if a caller passes 1, to preserve the N≥2 conservation contract.
  const cohort = Math.max(DEFAULT_COHORT, opts.cohort ?? DEFAULT_COHORT);
  const result = await seedVariation(VARIATION_ID, { ...opts, cohort });

  const docId = variationDocId(result.testrunid);

  // PRECONDITION post-process (see header): give each cohort token the PREFIXED variationid so the
  // board/studio scope by V5's 13 stages, and a back-dated logdate so it renders on page 1 of the
  // crowded shared entry column. The Admin handle is allowlist-pinned (test project / emulator only).
  const db = sim.db();
  const { Timestamp } = require('firebase-admin').firestore;
  // 30 days before "now" — comfortably older than the base roster's `logdate` (Timestamp.now()), so the
  // cohort tokens sort to the FRONT of the `orderBy("logdate","asc")` stream (page 1).
  const earlyLogdate = Timestamp.fromMillis(Date.now() - 30 * 86400e3);
  for (const p of result.participants) {
    await db.collection('queue_token').doc(p.tokenId).set(
      { variationid: docId, logdate: earlyLogdate },
      { merge: true },
    );
  }

  return { ...result, variationDocId: docId };
}

export default seedProdigiesFirstCycle;
