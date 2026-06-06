// @ts-nocheck
/**
 * _common.ts — shared orchestration for the 9 per-variation seed builders.
 *
 * The brief: each variation builder "seeds the queue generation and variation plus N tokens
 * at the first stage for that variation, reusing the main seeder helpers." This module is the
 * thin glue that does exactly that by CALLING the exported primitives in
 * `fixtures/seed-test-project.js` — it NEVER re-implements the auth-chain / queue / token write
 * logic (anti-circularity + DRY: one writer, reused everywhere).
 *
 * It writes PRECONDITIONS ONLY:
 *   - the staff auth chain (so the spec can `loginAs` the SAME operator/specialist/BIG emails
 *     that `e2e/queue/support/actors.ts` logs in with),
 *   - `queue generation` + the ONE `queue variation` doc under test (the board fetches a token's
 *     variation by `getDoc(doc('queue variation', token.variationid))`, so only that doc is needed),
 *   - `cohort` participant `queue_token`s seeded at the variation's FIRST stage.
 *
 * The variation specs then drive the REAL UI / the participant-sim and assert the value the
 * APP / cloud function computes (a re-rendered count, a CF-written `queue stage log` row) — they
 * NEVER assert a value this seed just wrote. So this builder must not be used as an oracle.
 *
 * Target: the dedicated test project `slabs-queue-e2e-exdcz` (or the emulator when
 * FIRESTORE_EMULATOR_HOST is set). The allowlist guard in `lib/test-project.js` (invoked inside
 * `initAdmin`) hard-aborts on production / starlabs-test / Watson / SalesCRM.
 */

// CommonJS helpers — reused, never duplicated (the e2e package is CJS; Playwright/ts resolves require()).
const seeder = require('../seed-test-project');
const cfg = require('../sample-queue-config.json');

export interface VariationSeedOptions {
  /** Number of participant tokens to seed at the variation's first stage (cohort N). */
  cohort?: number;
  /** Run id namespacing every doc + Auth user (default: env TESTRUNID or 'run1', matching actors.ts). */
  testrunid?: string;
  /**
   * Seed ALL 9 `queue variation` docs (true) or only the one under test (false, default).
   * The board only needs the token's own variation doc, but seeding all is handy when a spec
   * opens the queue picker / variation filter. The `queue generation` doc is always seeded.
   */
  seedAllVariationDocs?: boolean;
  /** Override the per-participant queue_token starting stage (default: the variation's first stage). */
  startStage?: string;
}

export interface SeededParticipant {
  profileid: string;
  email: string;
  /** queue_token doc id (deterministic: `${testrunid}_tok_${profileid}`). */
  tokenId: string;
  queueposition: number;
}

export interface VariationSeedResult {
  testrunid: string;
  variationId: string;
  variationName: string;
  /** the queue's display name — equals actors.QUEUE_NAME so specs can pick it on the board. */
  queueName: string;
  /** `queue generation` doc id for this run. */
  queueGenDocId: string;
  /** the variation's authoritative ordered stage list (from sample-queue-config.json). */
  stages: string[];
  /** the stage every seeded token starts on (the variation's first stage unless overridden). */
  firstStage: string;
  /** the seeded cohort (length === cohort). */
  participants: SeededParticipant[];
  /** convenience: just the queue_token doc ids, in queueposition order. */
  tokenIds: string[];
  /** convenience: just the participant profileids. */
  profileIds: string[];
}

/** Look up a variation in the seed config by its id; throw early on a typo. */
function variationOrThrow(variationId: string) {
  const v = cfg.queuevariation.find((x: any) => x.id === variationId);
  if (!v) {
    throw new Error(
      `[variation-seeds] unknown variationId "${variationId}". ` +
        `Known: ${cfg.queuevariation.map((x: any) => `${x.variationname}=${x.id}`).join(', ')}`,
    );
  }
  return v;
}

/**
 * Seed one variation's preconditions and return the handles a variation spec needs.
 * Reuses `seedAuthChain`, `seedQueueAndVariations`, `seedParticipantToken` from the main seeder.
 *
 * @param variationId the seed-config variation id (e.g. 'K9PRd4PfWDWtaO0vSxy3' for LYL-FC)
 * @param opts cohort size, testrunid, etc.
 */
export async function seedVariation(
  variationId: string,
  opts: VariationSeedOptions = {},
): Promise<VariationSeedResult> {
  const testrunid = opts.testrunid || process.env.TESTRUNID || 'run1';
  const cohort = Math.max(1, opts.cohort ?? 1);

  const v = variationOrThrow(variationId);
  const stages: string[] = v.stages || [];
  const firstStage = opts.startStage || stages[0] || cfg.stages[0];

  // Allowlist-guarded admin (hard-aborts on any non-test project). Lazy: only on actual seed.
  const admin = seeder.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();

  // Staff roster — the SAME operators/specialists/BIG `actors.ts` expects (never re-listed here).
  const { staff, operators } = seeder.makeStaff(testrunid);

  // Cohort of participants for THIS variation, namespaced so parallel variation seeds don't collide.
  const tag = variationId.slice(0, 6);
  const participants: SeededParticipant[] = Array.from({ length: cohort }, (_, i) => {
    const profileid = `${testrunid}_pf_${tag}_${i}`;
    return {
      profileid,
      email: `p_${tag}_${i}+${testrunid}@example.com`,
      uid: `${testrunid}_u_${tag}_${i}`,
      tokenId: seeder.tokenDocId(testrunid, profileid),
      queueposition: i + 1,
    } as any;
  });

  // 1. Staff auth chain + dashboard routes, and an Auth user for each cohort participant.
  await seeder.seedAuthChain(db, auth, testrunid, { staff, operators, participants });

  // 2. queue generation + the variation doc(s) (only the one under test unless seedAllVariationDocs).
  const variationIds = opts.seedAllVariationDocs ? undefined : [variationId];
  const { queueGenRef } = await seeder.seedQueueAndVariations(db, admin, testrunid, operators, { variationIds });

  // 3. N tokens at the variation's first stage (PRECONDITION only — the spec asserts CF/app output).
  for (const p of participants) {
    await seeder.seedParticipantToken(
      db, admin, testrunid,
      { profileid: p.profileid, email: p.email, variationid: variationId, stage: firstStage, queueposition: p.queueposition },
      queueGenRef,
    );
  }

  return {
    testrunid,
    variationId,
    variationName: v.variationname,
    queueName: `TEST ${cfg.stages.length}-stage L3rqCr`,
    queueGenDocId: seeder.queueGenDocId(testrunid),
    stages,
    firstStage,
    participants,
    tokenIds: participants.map(p => p.tokenId),
    profileIds: participants.map(p => p.profileid),
  };
}

/** Re-export the config for specs that want the raw stage/variation data alongside a seed. */
export { cfg };
