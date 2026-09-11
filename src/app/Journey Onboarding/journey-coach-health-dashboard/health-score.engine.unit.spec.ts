/**
 * Unit gate — Journey / health score engine.  Prefix: JPU
 *
 * Pins the RULES in HEALTH_TRACKER_SPEC.md sections 2-4, not the plumbing. The engine is pure and
 * dependency-free, so every case here is "import the function, call it, assert the rule".
 *
 * PROVISIONAL VALUES: CALIBRATED is false — the band thresholds (45 / 70) and the tier weights are
 * placeholders awaiting calibration on real data. The cases below deliberately pin them anyway, so
 * that a calibration change shows up as a RED test that must be consciously updated rather than
 * silently shifting every participant's state. If you are here because one of these went red after
 * a deliberate recalibration: update the expected numbers, do not delete the case.
 */
import {
  CALIBRATED, clamp, computeFactors, computeHealth, deriveState, normalizeTier,
  recencyScore, referenceNow, __setNow,
  type FactorKey, type ParticipantSignals, type Tier,
} from './health-score.engine';

/** All-null signals: the "we know nothing yet" baseline. Override just the field under test. */
function noSignals(): ParticipantSignals {
  return {
    engagement: { coachTouchpointRecency: null, appActivityRecency: null, pendingActionsCleared: null, attendanceRate: null },
    progress: { aelImprovement: null, evolutionStage: null, journeyPace: null, interimAdherence: null },
    wins: { confirmedWins: null },
    relationship: { cadenceKept: null, responsiveness: null, satisfaction: null },
    advocacy: { referralGiven: false, testimonial: null, wishlistShared: null },
  };
}

describe('JPU — health score engine', () => {

  // ---------------------------------------------------------------- state bands
  describe('JPU-01 deriveState maps a score to a state band', () => {
    it('scores below 45 are SAD', () => {
      expect(deriveState(0, false)).toBe('SAD');
      expect(deriveState(44.9, false)).toBe('SAD');
    });
    it('45 is the inclusive floor of NEUTRAL — 44.9 is still SAD', () => {
      expect(deriveState(44.9, false)).toBe('SAD');
      expect(deriveState(45, false)).toBe('NEUTRAL');
    });
    it('70 is the inclusive floor of HAPPY — 69.9 is still NEUTRAL', () => {
      expect(deriveState(69.9, false)).toBe('NEUTRAL');
      expect(deriveState(70, false)).toBe('HAPPY');
    });
    it('100 is HAPPY without a referral', () => {
      expect(deriveState(100, false)).toBe('HAPPY');
    });
  });

  describe('JPU-02 no signal at all is NEUTRAL, never SAD', () => {
    // A participant we have not instrumented yet must not be shown to a coach as unhappy.
    // Absence of evidence is not evidence of a problem.
    it('a null health score is NEUTRAL', () => {
      expect(deriveState(null, false)).toBe('NEUTRAL');
    });
    it('a referral cannot promote a null score to EVANGELIST', () => {
      expect(deriveState(null, true)).toBe('NEUTRAL');
    });
  });

  describe('JPU-03 EVANGELIST requires a referral', () => {
    it('promotes a HAPPY score when a referral was given', () => {
      expect(deriveState(85, true)).toBe('EVANGELIST');
    });
    it('leaves the same score at HAPPY without one', () => {
      expect(deriveState(85, false)).toBe('HAPPY');
    });
    it('a referral does NOT rescue a sub-HAPPY score', () => {
      expect(deriveState(69.9, true)).toBe('NEUTRAL');
      expect(deriveState(20, true)).toBe('SAD');
    });
  });

  // ---------------------------------------------------------------- tiers
  describe('JPU-04 normalizeTier recognises the four real tiers', () => {
    it('passes the known tiers through unchanged', () => {
      (['B!G', 'LYL', 'uP!', 'CPM'] as Tier[]).forEach(t => expect(normalizeTier(t)).toBe(t));
    });
    it('trims surrounding whitespace before matching', () => {
      expect(normalizeTier('  B!G  ')).toBe('B!G');
    });
    it('falls back to OTHER for unknown, empty, null and undefined', () => {
      expect(normalizeTier('Platinum')).toBe('OTHER');
      expect(normalizeTier('')).toBe('OTHER');
      expect(normalizeTier(null)).toBe('OTHER');
      expect(normalizeTier(undefined)).toBe('OTHER');
    });
    it('is case-sensitive — tier codes are exact literals, not free text', () => {
      expect(normalizeTier('b!g')).toBe('OTHER');
    });
  });

  // ---------------------------------------------------------------- advocacy
  describe('JPU-05 advocacy is positive-only and never penalises', () => {
    // Spec: "no referral" is absent signal, not a zero. A participant who simply has not
    // referred anyone must score identically to one whose advocacy is not instrumented.
    it('a participant with no advocacy at all has a null advocacy factor', () => {
      expect(computeFactors(noSignals()).advocacy).toBeNull();
    });
    it('withholding a referral does not lower the composite health score', () => {
      const s = noSignals();
      s.relationship.satisfaction = 80;
      const withoutReferral = computeHealth(s, 'LYL').health;
      s.advocacy.referralGiven = true;
      const withReferral = computeHealth(s, 'LYL').health;
      // The referral can only raise the score. If advocacy were scored as 0 when absent,
      // withoutReferral would be dragged below 80.
      expect(withoutReferral).toBe(80);
      expect(withReferral!).toBeGreaterThan(withoutReferral!);
    });
    it('a given referral scores advocacy at 100', () => {
      const s = noSignals();
      s.advocacy.referralGiven = true;
      expect(computeFactors(s).advocacy).toBe(100);
    });
    it('averages the referral with the other advocacy sub-signals when present', () => {
      const s = noSignals();
      s.advocacy.referralGiven = true;   // 100
      s.advocacy.testimonial = 50;
      expect(computeFactors(s).advocacy).toBe(75);
    });
  });

  // ---------------------------------------------------------------- renormalization
  describe('JPU-06 missing factors are excluded and the remaining weights renormalize', () => {
    it('a single known factor carries the whole score regardless of its weight', () => {
      const s = noSignals();
      s.wins.confirmedWins = 60;          // wins is only 0.15 of the LYL weighting
      const r = computeHealth(s, 'LYL');
      expect(r.health).toBe(60);          // not 60 * 0.15
      expect(r.coverage).toBeCloseTo(0.2, 10); // 1 of 5 factors
    });
    it('weights still decide the blend when several factors are present', () => {
      const s = noSignals();
      s.progress.evolutionStage = 100;    // uP! progress weight 0.25
      s.engagement.attendanceRate = 0;    // uP! engagement weight 0.30
      // renormalized over the two present weights: 100*0.25 / (0.25+0.30) = 45.4545...
      expect(computeHealth(s, 'uP!').health!).toBeCloseTo(45.4545, 3);
    });
    it('the same signals score differently across tiers, because the weights differ', () => {
      const s = noSignals();
      s.progress.evolutionStage = 100;
      s.engagement.attendanceRate = 0;
      // B!G leans on progress (0.35 vs 0.15), uP! leans on engagement (0.30 vs 0.25)
      expect(computeHealth(s, 'B!G').health!).toBeGreaterThan(computeHealth(s, 'uP!').health!);
    });
  });

  describe('JPU-07 a participant with no data yet', () => {
    it('has a null score, NEUTRAL state and zero coverage', () => {
      const r = computeHealth(noSignals(), 'OTHER');
      expect(r.health).toBeNull();
      expect(r.state).toBe('NEUTRAL');
      expect(r.coverage).toBe(0);
      (Object.keys(r.factors) as FactorKey[]).forEach(k => expect(r.factors[k]).toBeNull());
    });
  });

  describe('JPU-08 coverage reports how much of the picture we actually have', () => {
    it('is the fraction of the five factors carrying data', () => {
      const s = noSignals();
      s.engagement.attendanceRate = 50;
      s.progress.journeyPace = 50;
      s.relationship.cadenceKept = 50;
      expect(computeHealth(s, 'LYL').coverage).toBeCloseTo(0.6, 10); // 3 of 5
    });
    it('reaches 1 only when every factor has at least one sub-signal', () => {
      const s = noSignals();
      s.engagement.attendanceRate = 50;
      s.progress.journeyPace = 50;
      s.wins.confirmedWins = 50;
      s.relationship.cadenceKept = 50;
      s.advocacy.referralGiven = true;
      expect(computeHealth(s, 'LYL').coverage).toBe(1);
    });
  });

  describe('JPU-09 the score is reported as uncalibrated', () => {
    // Guards against the score being presented to coaches as truth before calibration.
    // When calibration lands, flip CALIBRATED and update this case deliberately.
    it('carries calibrated:false through to the result', () => {
      expect(CALIBRATED).toBe(false);
      expect(computeHealth(noSignals(), 'LYL').calibrated).toBe(false);
    });
  });

  // ---------------------------------------------------------------- clamp
  describe('JPU-10 clamp holds a value inside its bounds', () => {
    it('returns the value untouched when already inside', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });
    it('pins to the bound at and beyond each edge', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(-1, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
      expect(clamp(101, 0, 100)).toBe(100);
    });
  });

  describe('JPU-11 out-of-range sub-signals cannot push a factor out of 0..100', () => {
    it('clamps a nonsense high value before averaging', () => {
      const s = noSignals();
      s.relationship.cadenceKept = 500;
      s.relationship.responsiveness = 0;
      expect(computeFactors(s).relationship).toBe(50); // (100 + 0) / 2, not (500 + 0) / 2
    });
    it('clamps a negative value to zero before averaging', () => {
      const s = noSignals();
      s.relationship.cadenceKept = -100;
      s.relationship.responsiveness = 100;
      expect(computeFactors(s).relationship).toBe(50);
    });
  });

  describe('JPU-12 NaN is treated as absent, not as a number', () => {
    it('excludes NaN from the average rather than poisoning it', () => {
      const s = noSignals();
      s.relationship.cadenceKept = NaN;
      s.relationship.responsiveness = 80;
      expect(computeFactors(s).relationship).toBe(80);
    });
  });

  // ---------------------------------------------------------------- recency
  describe('JPU-13 recencyScore decays linearly between the two day bounds', () => {
    const NOW = new Date('2026-06-15T00:00:00Z').getTime();
    const daysAgo = (n: number) => new Date(NOW - n * 86400000);

    it('scores 100 anywhere at or inside the full-credit window', () => {
      expect(recencyScore(daysAgo(0), 7, 30, NOW)).toBe(100);
      expect(recencyScore(daysAgo(7), 7, 30, NOW)).toBe(100);
    });
    it('scores 0 at and beyond the zero-credit bound', () => {
      expect(recencyScore(daysAgo(30), 7, 30, NOW)).toBe(0);
      expect(recencyScore(daysAgo(365), 7, 30, NOW)).toBe(0);
    });
    it('is exactly half way at the midpoint of the decay window', () => {
      expect(recencyScore(daysAgo(18.5), 7, 30, NOW)!).toBeCloseTo(50, 6);
    });
    it('returns null — not 0 — when there is no date at all', () => {
      // "never contacted" and "contacted long ago" are different facts. null is excluded
      // from the factor average; 0 would drag the score down.
      expect(recencyScore(null, 7, 30, NOW)).toBeNull();
    });
    it('scores a future date at 100 rather than going out of range', () => {
      expect(recencyScore(new Date(NOW + 86400000), 7, 30, NOW)).toBe(100);
    });
  });

  describe('JPU-14 the clock is injectable so recency is testable offline', () => {
    afterEach(() => __setNow(() => Date.now())); // never leak a frozen clock into other specs

    it('uses the injected clock when no explicit now is passed', () => {
      const frozen = new Date('2026-06-15T00:00:00Z').getTime();
      __setNow(() => frozen);
      expect(referenceNow()).toBe(frozen);
      expect(recencyScore(new Date(frozen - 3 * 86400000), 7, 30)).toBe(100);
    });
    it('restores the real clock afterwards', () => {
      __setNow(() => Date.now());
      expect(Math.abs(referenceNow() - Date.now())).toBeLessThan(1000);
    });
  });
});
