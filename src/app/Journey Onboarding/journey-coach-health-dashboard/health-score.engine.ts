/**
 * Health Score Engine (pure, dependency-free).
 *
 * Implements HEALTH_TRACKER_SPEC.md sections 2-4:
 *   five factors -> tier-weighted composite -> state (Sad/Neutral/Happy/Evangelist).
 *
 * Design notes:
 * - NO Angular / Firestore imports. Pure functions so it is unit-testable offline
 *   and reusable by both the coach dashboard and the participant-facing app.
 * - Graceful degradation: the system is instrumented incrementally. Any sub-signal
 *   or whole factor may be null (not yet available, e.g. confirmed Wins or the
 *   referral event). Nulls are excluded and the remaining weights are renormalized,
 *   so the score always reflects what is actually known, with a `coverage` figure.
 * - CALIBRATED = false: weights and band thresholds below are PROVISIONAL placeholders.
 *   They are replaced by calibration on real data before the score is shown as truth.
 */

export const CALIBRATED = false; // flip to true only after data calibration

export type HealthState = 'SAD' | 'NEUTRAL' | 'HAPPY' | 'EVANGELIST';
export type Tier = 'B!G' | 'LYL' | 'uP!' | 'CPM' | 'OTHER';
export type FactorKey = 'engagement' | 'progress' | 'wins' | 'relationship' | 'advocacy';

/** Each sub-signal is 0..100, or null when not yet known. */
export interface ParticipantSignals {
  engagement: {
    coachTouchpointRecency: number | null; // recency of last coach contact
    appActivityRecency: number | null;     // recency of app/content activity
    pendingActionsCleared: number | null;  // % of assigned actions not overdue
    attendanceRate: number | null;         // events/workshops attended vs eligible
  };
  progress: {
    aelImprovement: number | null;         // AEL crossover start->end gain
    evolutionStage: number | null;         // evolutionprogress ordinal
    journeyPace: number | null;            // on-pace vs tentativestart slippage
    interimAdherence: number | null;       // interim reports completed on time
  };
  wins: {
    confirmedWins: number | null;          // null until confirmed-win instrumented
  };
  relationship: {
    cadenceKept: number | null;            // sessions kept vs planned
    responsiveness: number | null;         // replies / opens
    satisfaction: number | null;           // happinessindex normalized
  };
  advocacy: {
    referralGiven: boolean;                // proxy today: opportunities_consumed has 'Referral'
    testimonial: number | null;            // testimonial present
    wishlistShared: number | null;         // wishlist shared with contacts
  };
}

export interface HealthResult {
  factors: Record<FactorKey, number | null>;
  health: number | null;                   // 0..100, null if no factors available
  state: HealthState;
  referralGiven: boolean;
  coverage: number;                        // 0..1, fraction of factors with data
  calibrated: boolean;
}

// --- provisional tier weights (sum to 1 over the 5 factors) -------------------
const TIER_WEIGHTS: Record<Tier, Record<FactorKey, number>> = {
  'B!G': { engagement: 0.15, progress: 0.35, wins: 0.15, relationship: 0.25, advocacy: 0.10 },
  'CPM': { engagement: 0.15, progress: 0.35, wins: 0.15, relationship: 0.25, advocacy: 0.10 },
  'LYL': { engagement: 0.20, progress: 0.30, wins: 0.15, relationship: 0.25, advocacy: 0.10 },
  'uP!': { engagement: 0.30, progress: 0.25, wins: 0.15, relationship: 0.20, advocacy: 0.10 },
  'OTHER': { engagement: 0.30, progress: 0.25, wins: 0.15, relationship: 0.20, advocacy: 0.10 },
};

// provisional band thresholds
const HAPPY_MIN = 70;
const NEUTRAL_MIN = 45;

export function normalizeTier(atcmodel: string | null | undefined): Tier {
  const v = (atcmodel ?? '').trim();
  if (v === 'B!G' || v === 'LYL' || v === 'uP!' || v === 'CPM') return v;
  return 'OTHER';
}

/** Average of the non-null numbers, or null if none are present. */
function meanPresent(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null && !isNaN(v));
  if (present.length === 0) return null;
  const sum = present.reduce((a, b) => a + clamp(b, 0, 100), 0);
  return sum / present.length;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Recency -> 0..100. Full score at/under `fullDays`, zero at/over `zeroDays`,
 * linear in between. null date -> null (unknown, excluded from the score).
 */
export function recencyScore(
  date: Date | null,
  fullDays: number,
  zeroDays: number,
  now: number = referenceNow(),
): number | null {
  if (!date) return null;
  const days = (now - date.getTime()) / 86400000;
  if (days <= fullDays) return 100;
  if (days >= zeroDays) return 0;
  return clamp(100 * (1 - (days - fullDays) / (zeroDays - fullDays)), 0, 100);
}

/** Indirection so callers/tests can inject a fixed clock. */
let _now = () => Date.now();
export function referenceNow(): number { return _now(); }
export function __setNow(fn: () => number): void { _now = fn; }

export function computeFactors(s: ParticipantSignals): Record<FactorKey, number | null> {
  return {
    engagement: meanPresent([
      s.engagement.coachTouchpointRecency,
      s.engagement.appActivityRecency,
      s.engagement.pendingActionsCleared,
      s.engagement.attendanceRate,
    ]),
    progress: meanPresent([
      s.progress.aelImprovement,
      s.progress.evolutionStage,
      s.progress.journeyPace,
      s.progress.interimAdherence,
    ]),
    wins: meanPresent([s.wins.confirmedWins]),
    relationship: meanPresent([
      s.relationship.cadenceKept,
      s.relationship.responsiveness,
      s.relationship.satisfaction,
    ]),
    // Advocacy is POSITIVE-ONLY (spec): "no referral" is not a penalty, it is
    // simply absent signal (null) and excluded — it must never drag health down.
    advocacy: meanPresent([
      s.advocacy.referralGiven ? 100 : null,
      s.advocacy.testimonial,
      s.advocacy.wishlistShared,
    ]),
  };
}

export function computeHealth(signals: ParticipantSignals, tier: Tier): HealthResult {
  const factors = computeFactors(signals);
  const weights = TIER_WEIGHTS[tier];

  // weighted average over factors that have data, renormalizing the present weights
  let weightedSum = 0;
  let weightTotal = 0;
  let present = 0;
  (Object.keys(factors) as FactorKey[]).forEach(k => {
    const v = factors[k];
    if (v == null) return;
    weightedSum += v * weights[k];
    weightTotal += weights[k];
    present++;
  });

  const health = weightTotal > 0 ? clamp(weightedSum / weightTotal, 0, 100) : null;
  const referralGiven = signals.advocacy.referralGiven;
  const coverage = present / 5;

  return {
    factors,
    health,
    state: deriveState(health, referralGiven),
    referralGiven,
    coverage,
    calibrated: CALIBRATED,
  };
}

export function deriveState(health: number | null, referralGiven: boolean): HealthState {
  if (health == null) return 'NEUTRAL';            // not enough signal yet
  if (health < NEUTRAL_MIN) return 'SAD';
  if (health < HAPPY_MIN) return 'NEUTRAL';
  return referralGiven ? 'EVANGELIST' : 'HAPPY';   // top state requires advocacy
}
