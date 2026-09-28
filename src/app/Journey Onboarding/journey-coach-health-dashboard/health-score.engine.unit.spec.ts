// health-score.engine.spec.ts — unit tests for the participant Health Score engine.
//
// WHY THESE ARE UNIT TESTS AND NOT E2E:
// the engine is only reachable at runtime behind `SHOW_HEALTH` (journey-coach-health-dashboard.component.ts:190),
// which is `false` pending calibration — so line 1203 (`if (this.SHOW_HEALTH) this.scoreHealth(row)`) never
// fires and NO e2e case can execute a single line of this file. These tests are the only regression net the
// rules have.
//
// The engine is pure (no Angular, no Firestore), so there is no TestBed here — just imports and calls.
//
// A NOTE ON CALIBRATION: `CALIBRATED === false` says the weights and band thresholds are provisional. A
// deliberate recalibration WILL turn JPU-04/05/06 red. That is intended: it forces new numbers to be written
// down as an explicit edit rather than sliding in unnoticed.
import {
  CALIBRATED,
  ParticipantSignals,
  clamp,
  computeFactors,
  computeHealth,
  deriveState,
  normalizeTier,
  recencyScore,
  __setNow,
} from './health-score.engine';

/** All-null signals; each case overrides only the sub-signals it is about. */
const noSignals = (): ParticipantSignals => ({
  engagement: {
    coachTouchpointRecency: null,
    appActivityRecency: null,
    pendingActionsCleared: null,
    attendanceRate: null,
  },
  progress: { aelImprovement: null, evolutionStage: null, journeyPace: null, interimAdherence: null },
  wins: { confirmedWins: null },
  relationship: { cadenceKept: null, responsiveness: null, satisfaction: null },
  advocacy: { referralGiven: false, testimonial: null, wishlistShared: null },
});

describe('Health Score engine', () => {
  // =============================================================================================
  // JPU-01 — a factor is the mean of its PRESENT sub-signals; nulls are excluded, not counted as 0
  // =============================================================================================
  describe('JPU-01 factor averaging excludes nulls', () => {
    it('averages only the non-null sub-signals', () => {
      const s = noSignals();
      s.engagement.coachTouchpointRecency = 100;
      s.engagement.attendanceRate = 50;
      // the other two stay null: mean of [100, 50] is 75, NOT (100+50+0+0)/4 = 37.5
      expect(computeFactors(s).engagement).toBe(75);
    });

    it('a factor with no sub-signals at all is null, not zero', () => {
      expect(computeFactors(noSignals()).progress).toBeNull();
    });

    it('clamps each sub-signal into 0..100 before averaging', () => {
      const s = noSignals();
      s.relationship.cadenceKept = 150;   // over
      s.relationship.responsiveness = -50; // under
      expect(computeFactors(s).relationship).toBe(50); // mean of clamped [100, 0]
    });
  });

  // =============================================================================================
  // JPU-02 — advocacy is POSITIVE-ONLY: "no referral" is absent signal, never a penalty
  // =============================================================================================
  // The engine states this as a spec rule in computeFactors: "it must never drag health down."
  describe('JPU-02 advocacy is positive-only', () => {
    it('referralGiven:false with no other advocacy signal yields null, not 0', () => {
      expect(computeFactors(noSignals()).advocacy).toBeNull();
    });

    it('referralGiven:true scores the advocacy factor at 100', () => {
      const s = noSignals();
      s.advocacy.referralGiven = true;
      expect(computeFactors(s).advocacy).toBe(100);
    });

    it('a missing referral does not lower the composite health', () => {
      const withEngagementOnly = noSignals();
      withEngagementOnly.engagement.attendanceRate = 80;

      const alsoNoReferral = noSignals();
      alsoNoReferral.engagement.attendanceRate = 80;
      alsoNoReferral.advocacy.referralGiven = false;

      // Identical: false must contribute NOTHING, rather than pulling an 80 toward 0.
      expect(computeHealth(alsoNoReferral, 'B!G').health)
        .toBe(computeHealth(withEngagementOnly, 'B!G').health);
    });
  });

  // =============================================================================================
  // JPU-03 — present weights are renormalized, so a sparse profile is not dragged toward zero
  // =============================================================================================
  describe('JPU-03 weight renormalization over present factors', () => {
    it('a single present factor scores at its own value regardless of its weight', () => {
      const s = noSignals();
      s.engagement.attendanceRate = 80;
      const res = computeHealth(s, 'B!G'); // engagement weighs only 0.15 of the full model
      expect(res.health).toBe(80);         // 80*0.15 / 0.15 — NOT 80*0.15 = 12
      expect(res.coverage).toBeCloseTo(0.2, 5); // 1 of 5 factors known
    });

    it('reports coverage as the fraction of factors carrying data', () => {
      const s = noSignals();
      s.engagement.attendanceRate = 80;
      s.progress.journeyPace = 40;
      s.wins.confirmedWins = 60;
      expect(computeHealth(s, 'LYL').coverage).toBeCloseTo(0.6, 5);
    });
  });

  // =============================================================================================
  // JPU-04 — tier weights actually apply: the same signals score differently per tier
  // =============================================================================================
  describe('JPU-04 tier weighting', () => {
    // engagement 100 / progress 0, nothing else. B!G leans on progress (0.35 vs 0.15), uP! on
    // engagement (0.30 vs 0.25) — so the same participant must score differently under each.
    const lopsided = (): ParticipantSignals => {
      const s = noSignals();
      s.engagement.coachTouchpointRecency = 100;
      s.engagement.appActivityRecency = 100;
      s.engagement.pendingActionsCleared = 100;
      s.engagement.attendanceRate = 100;
      s.progress.aelImprovement = 0;
      s.progress.evolutionStage = 0;
      s.progress.journeyPace = 0;
      s.progress.interimAdherence = 0;
      return s;
    };

    it('B!G weights progress over engagement', () => {
      // 100*0.15 / (0.15 + 0.35) = 30
      expect(computeHealth(lopsided(), 'B!G').health).toBeCloseTo(30, 5);
    });

    it('uP! weights engagement over progress', () => {
      // 100*0.30 / (0.30 + 0.25) = 54.545…
      expect(computeHealth(lopsided(), 'uP!').health).toBeCloseTo(54.5454, 3);
    });

    it('CPM matches B!G, and LYL sits between the two', () => {
      const big = computeHealth(lopsided(), 'B!G').health!;
      const lyl = computeHealth(lopsided(), 'LYL').health!;
      expect(computeHealth(lopsided(), 'CPM').health).toBeCloseTo(big, 5);
      expect(lyl).toBeGreaterThan(big);
      expect(lyl).toBeLessThan(computeHealth(lopsided(), 'uP!').health!);
    });

    describe('normalizeTier', () => {
      it('accepts the four known tiers verbatim', () => {
        (['B!G', 'LYL', 'uP!', 'CPM'] as const).forEach((t) => expect(normalizeTier(t)).toBe(t));
      });
      it('trims surrounding whitespace', () => {
        expect(normalizeTier('  LYL  ')).toBe('LYL');
      });
      it('maps anything unknown, empty, null or undefined to OTHER', () => {
        expect(normalizeTier('platinum')).toBe('OTHER');
        expect(normalizeTier('')).toBe('OTHER');
        expect(normalizeTier(null)).toBe('OTHER');
        expect(normalizeTier(undefined)).toBe('OTHER');
      });
    });
  });

  // =============================================================================================
  // JPU-05 — band thresholds: SAD < 45 <= NEUTRAL < 70 <= HAPPY
  // =============================================================================================
  describe('JPU-05 state bands', () => {
    it('below 45 is SAD', () => {
      expect(deriveState(44.9, false)).toBe('SAD');
      expect(deriveState(0, false)).toBe('SAD');
    });
    it('45 up to (not including) 70 is NEUTRAL', () => {
      expect(deriveState(45, false)).toBe('NEUTRAL');   // lower bound inclusive
      expect(deriveState(69.9, false)).toBe('NEUTRAL');
    });
    it('70 and above is at least HAPPY', () => {
      expect(deriveState(70, false)).toBe('HAPPY');     // lower bound inclusive
      expect(deriveState(100, false)).toBe('HAPPY');
    });
  });

  // =============================================================================================
  // JPU-06 — the top state requires advocacy
  // =============================================================================================
  describe('JPU-06 EVANGELIST requires a referral', () => {
    it('promotes a HAPPY score to EVANGELIST when a referral was given', () => {
      expect(deriveState(85, true)).toBe('EVANGELIST');
    });
    it('leaves the same score at HAPPY without one', () => {
      expect(deriveState(85, false)).toBe('HAPPY');
    });
    it('does not promote a score below the HAPPY band, however strong the advocacy', () => {
      expect(deriveState(69.9, true)).toBe('NEUTRAL');
      expect(deriveState(20, true)).toBe('SAD');
    });
    it('carries referralGiven through the composite result', () => {
      const s = noSignals();
      s.advocacy.referralGiven = true;
      expect(computeHealth(s, 'B!G').referralGiven).toBeTrue();
    });
  });

  // =============================================================================================
  // JPU-07 — recency curve: full score at/under fullDays, zero at/over zeroDays, linear between
  // =============================================================================================
  describe('JPU-07 recencyScore', () => {
    const NOW = new Date('2026-09-09T00:00:00Z').getTime();
    const daysAgo = (n: number) => new Date(NOW - n * 86400000);

    it('scores today, and anything inside fullDays, at 100', () => {
      expect(recencyScore(daysAgo(0), 30, 180, NOW)).toBe(100);
      expect(recencyScore(daysAgo(30), 30, 180, NOW)).toBe(100); // boundary is inclusive
    });
    it('scores anything at or beyond zeroDays at 0', () => {
      expect(recencyScore(daysAgo(180), 30, 180, NOW)).toBe(0);  // boundary is inclusive
      expect(recencyScore(daysAgo(365), 30, 180, NOW)).toBe(0);
    });
    it('decays linearly between the two bounds', () => {
      // midpoint of 30..180 is 105 days -> 50
      expect(recencyScore(daysAgo(105), 30, 180, NOW)).toBeCloseTo(50, 5);
      expect(recencyScore(daysAgo(67.5), 30, 180, NOW)).toBeCloseTo(75, 5);
    });
    it('returns null for an unknown date, so it is EXCLUDED rather than scored 0', () => {
      expect(recencyScore(null, 30, 180, NOW)).toBeNull();
    });

    it('honours an injected clock via __setNow', () => {
      const original = Date.now;
      try {
        __setNow(() => NOW);
        // no explicit `now` argument — the engine must read the injected clock
        expect(recencyScore(daysAgo(0), 30, 180)).toBe(100);
        expect(recencyScore(daysAgo(180), 30, 180)).toBe(0);
      } finally {
        __setNow(() => original()); // restore, so later specs are not pinned to a fixed date
      }
    });
  });

  // =============================================================================================
  // JPU-08 — the empty participant: no signal at all
  // =============================================================================================
  describe('JPU-08 no signal at all', () => {
    it('reports null health, zero coverage and a NEUTRAL state', () => {
      const res = computeHealth(noSignals(), 'OTHER');
      expect(res.health).toBeNull();
      expect(res.coverage).toBe(0);
      expect(res.state).toBe('NEUTRAL'); // "not enough signal yet" is NEUTRAL, never SAD
    });

    it('never reports itself as calibrated while CALIBRATED is false', () => {
      // Guards the display gate: a provisional score must not present as truth.
      expect(computeHealth(noSignals(), 'B!G').calibrated).toBe(CALIBRATED);
      expect(CALIBRATED).toBeFalse();
    });
  });

  // =============================================================================================
  // clamp — small, but every factor average depends on it
  // =============================================================================================
  describe('clamp', () => {
    it('bounds a value into the range', () => {
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(-1, 0, 100)).toBe(0);
      expect(clamp(42, 0, 100)).toBe(42);
    });
  });
});
