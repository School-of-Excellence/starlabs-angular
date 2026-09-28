// priority.engine.unit.spec.ts — unit tests for the coach portfolio priority rules.
//
// WHY THIS ENGINE MATTERS MORE THAN THE HEALTH ONE BESIDE IT: health-score.engine is gated behind
// SHOW_HEALTH = false and never runs. This one RUNS IN PRODUCTION and decides the order in which coaches
// contact participants — the top of every coach's list is this arithmetic.
//
// It was `private scoreRow()` on a 3,162-line component that injects Firestore, so nothing could reach it:
// not a unit test (private, and the constructor demands a Firestore), and not e2e, which could only assert
// a RENDERED band — a wrong weight landing in the same band would have passed silently. Extracted
// 2026-09-10 with the logic unchanged, mirroring the pure-engine pattern already used next door.
//
// The weights and band cut-offs below are asserted by value ON PURPOSE. They are product decisions, not
// implementation details: changing one changes who a coach calls first, and that should be a deliberate
// edit that turns these tests red rather than a silent drift.
import {
  HIGH_MIN,
  MEDIUM_MIN,
  PriorityInput,
  QUIET_DAYS,
  RENEWAL_DAYS,
  actionFor,
  bandFor,
  continuityOpen,
  scorePriority,
} from './priority.engine';

/** A participant with nothing wrong — every rule off. Each case switches on only what it is about. */
const ok = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  daysSinceCoach: 0,
  daysToRenewal: null,
  notStarted: false,
  lapsed: false,
  renewalWindow: false,
  goingQuiet: false,
  financialstatus: null,
  openTickets: 0,
  opportunities: [],
  opportunitiesConsumed: [],
  ...over,
});

describe('priority.engine', () => {
  // =============================================================================================
  // JPU-21 — the clean row
  // =============================================================================================
  describe('JPU-21 nothing wrong', () => {
    it('scores zero and reads On track', () => {
      const r = scorePriority(ok());
      expect(r.priority).toBe(0);
      expect(r.priorityBand).toBe('Low');
      expect(r.reason).toBe('On track');   // no drivers, so no action is suggested
    });
  });

  // =============================================================================================
  // JPU-22 — quiet: scaled by how long, capped at 180 days
  // =============================================================================================
  describe('JPU-22 quiet participants', () => {
    it('adds nothing at or below the quiet threshold', () => {
      // The comparison is `>`, so exactly QUIET_DAYS is still fine.
      expect(scorePriority(ok({ daysSinceCoach: QUIET_DAYS })).priority).toBe(0);
    });

    it('starts scoring one day past the threshold', () => {
      expect(scorePriority(ok({ daysSinceCoach: QUIET_DAYS + 1 })).priority).toBeGreaterThan(0);
    });

    it('scales with the silence, up to 20 at 180 days', () => {
      expect(scorePriority(ok({ daysSinceCoach: 90 })).priority).toBe(10);   // 90/180*20
      expect(scorePriority(ok({ daysSinceCoach: 180 })).priority).toBe(20);
    });

    it('caps at 20 however long the silence runs', () => {
      // min(days,180) — a participant untouched for two years is not more urgent than one at 180 days.
      expect(scorePriority(ok({ daysSinceCoach: 720 })).priority).toBe(20);
    });

    it('adds nothing when the contact date is unknown', () => {
      // null means "never loaded", not "never contacted" — it must not manufacture urgency.
      expect(scorePriority(ok({ daysSinceCoach: null })).priority).toBe(0);
    });

    it('names the silence in the reason', () => {
      expect(scorePriority(ok({ daysSinceCoach: 90 })).reason).toContain('quiet 90d');
    });
  });

  // =============================================================================================
  // JPU-23 — the flat-weight rules
  // =============================================================================================
  describe('JPU-23 flat weights', () => {
    it('adds 24 for a journey never started', () => {
      const r = scorePriority(ok({ notStarted: true }));
      expect(r.priority).toBe(24);
      expect(r.priorityBand).toBe('Medium');
      expect(r.reason).toContain('journey not started');
    });

    it('adds 40 for a lapsed subscription — the single heaviest signal', () => {
      const r = scorePriority(ok({ lapsed: true, daysToRenewal: -10 }));
      expect(r.priority).toBe(40);
      expect(r.priorityBand).toBe('High');   // lapsed alone is enough to reach High
      expect(r.reason).toContain('lapsed 10d ago');
    });

    it('reports the lapse in whole days regardless of sign', () => {
      expect(scorePriority(ok({ lapsed: true, daysToRenewal: -45 })).reason).toContain('45d ago');
    });

    it('says 0d ago when the lapse length is unknown', () => {
      expect(scorePriority(ok({ lapsed: true, daysToRenewal: null })).reason).toContain('0d ago');
    });
  });

  // =============================================================================================
  // JPU-24 — renewal window: more urgent the closer it gets
  // =============================================================================================
  describe('JPU-24 renewal window', () => {
    it('scores nothing extra at the far edge of the window', () => {
      // daysToRenewal == RENEWAL_DAYS -> (90-90)/90*32 == 0. The window has only just opened.
      expect(scorePriority(ok({ renewalWindow: true, daysToRenewal: RENEWAL_DAYS })).priority).toBe(0);
    });

    it('scores the full 32 on the day it expires', () => {
      expect(scorePriority(ok({ renewalWindow: true, daysToRenewal: 0 })).priority).toBe(32);
    });

    it('rises as the renewal approaches', () => {
      const far = scorePriority(ok({ renewalWindow: true, daysToRenewal: 60 })).priority;
      const near = scorePriority(ok({ renewalWindow: true, daysToRenewal: 10 })).priority;
      expect(near).toBeGreaterThan(far);
    });

    it('adds 8 more when a continuity opportunity is still open', () => {
      const base = ok({ renewalWindow: true, daysToRenewal: 0 });
      const withOpp = { ...base, opportunities: ['Continuity Offer'] };
      expect(scorePriority(withOpp).priority).toBe(scorePriority(base).priority + 8);
    });

    it('does NOT add the 8 once that opportunity has been consumed', () => {
      const r = ok({
        renewalWindow: true, daysToRenewal: 0,
        opportunities: ['Continuity Offer'], opportunitiesConsumed: ['continuity offer'],
      });
      expect(scorePriority(r).priority).toBe(32);
    });
  });

  describe('JPU-24b continuityOpen', () => {
    it('is open when offered and not consumed', () => {
      expect(continuityOpen({ opportunities: ['Continuity'], opportunitiesConsumed: [] })).toBeTrue();
    });
    it('is closed once consumed, matching case-insensitively', () => {
      expect(continuityOpen({ opportunities: ['Continuity'], opportunitiesConsumed: ['CONTINUITY'] })).toBeFalse();
    });
    it('is closed when never offered', () => {
      expect(continuityOpen({ opportunities: ['Referral'], opportunitiesConsumed: [] })).toBeFalse();
    });
    it('matches a continuity mention inside a longer label', () => {
      expect(continuityOpen({ opportunities: ['2026 continuity renewal'], opportunitiesConsumed: [] })).toBeTrue();
    });
  });

  // =============================================================================================
  // JPU-25 — financial status
  // =============================================================================================
  describe('JPU-25 payments', () => {
    it('adds 26 for defaulted or locked', () => {
      expect(scorePriority(ok({ financialstatus: 'defaulted' })).priority).toBe(26);
      expect(scorePriority(ok({ financialstatus: 'locked' })).priority).toBe(26);
    });

    it('adds 15 for late', () => {
      expect(scorePriority(ok({ financialstatus: 'late' })).priority).toBe(15);
    });

    it('is case-insensitive', () => {
      expect(scorePriority(ok({ financialstatus: 'DEFAULTED' })).priority).toBe(26);
    });

    it('adds nothing for an unknown or absent status', () => {
      expect(scorePriority(ok({ financialstatus: null })).priority).toBe(0);
      expect(scorePriority(ok({ financialstatus: 'good' })).priority).toBe(0);
    });

    it('counts the payment weight ONCE — defaulted and late are exclusive', () => {
      // else-if: a row cannot score 26 + 15.
      expect(scorePriority(ok({ financialstatus: 'defaulted' })).priority).toBe(26);
    });
  });

  // =============================================================================================
  // JPU-26 — support tickets
  // =============================================================================================
  describe('JPU-26 open tickets', () => {
    it('adds 4 per ticket', () => {
      expect(scorePriority(ok({ openTickets: 1 })).priority).toBe(4);
      expect(scorePriority(ok({ openTickets: 2 })).priority).toBe(8);
    });

    it('counts at most three tickets', () => {
      // A participant with 20 open tickets is not five times more urgent than one with three.
      expect(scorePriority(ok({ openTickets: 3 })).priority).toBe(12);
      expect(scorePriority(ok({ openTickets: 20 })).priority).toBe(12);
    });

    it('pluralises the driver text correctly', () => {
      expect(scorePriority(ok({ openTickets: 1 })).reason).toContain('1 open ticket ');
      expect(scorePriority(ok({ openTickets: 2 })).reason).toContain('2 open tickets');
    });

    it('adds nothing with no open tickets', () => {
      expect(scorePriority(ok({ openTickets: 0 })).priority).toBe(0);
    });
  });

  // =============================================================================================
  // JPU-27 — bands and clamping
  // =============================================================================================
  describe('JPU-27 banding', () => {
    it('bands at 22 and 40, lower bounds inclusive', () => {
      expect(bandFor(MEDIUM_MIN - 1)).toBe('Low');
      expect(bandFor(MEDIUM_MIN)).toBe('Medium');
      expect(bandFor(HIGH_MIN - 1)).toBe('Medium');
      expect(bandFor(HIGH_MIN)).toBe('High');
    });

    it('clamps a heavily-weighted row to 100', () => {
      const worst = ok({
        daysSinceCoach: 365, notStarted: true, lapsed: true, daysToRenewal: -5,
        renewalWindow: true, financialstatus: 'defaulted', openTickets: 9,
        opportunities: ['continuity'],
      });
      expect(scorePriority(worst).priority).toBe(100);
      expect(scorePriority(worst).priorityBand).toBe('High');
    });

    it('never returns a negative or fractional priority', () => {
      const r = scorePriority(ok({ daysSinceCoach: 61 }));   // 61/180*20 = 6.777…
      expect(Number.isInteger(r.priority)).toBeTrue();
      expect(r.priority).toBeGreaterThanOrEqual(0);
    });

    it('accumulates independent signals', () => {
      // notStarted 24 + late 15 = 39 — one short of High, which is exactly the kind of boundary a silent
      // weight change would move.
      const r = scorePriority(ok({ notStarted: true, financialstatus: 'late' }));
      expect(r.priority).toBe(39);
      expect(r.priorityBand).toBe('Medium');
    });
  });

  // =============================================================================================
  // JPU-28 — the reason string
  // =============================================================================================
  describe('JPU-28 reason', () => {
    it('names at most the top TWO drivers', () => {
      const r = scorePriority(ok({
        daysSinceCoach: 90, notStarted: true, lapsed: true, daysToRenewal: -3, openTickets: 2,
      }));
      // Drivers are pushed in evaluation order: quiet, notStarted, lapsed, … — only the first two show.
      expect(r.reason).toContain('quiet 90d');
      expect(r.reason).toContain('journey not started');
      expect(r.reason).not.toContain('open ticket');
    });

    it('joins the drivers and appends the suggested action', () => {
      // TWO drivers, so the separator appears. With a single driver there is nothing to join — the
      // reason is just that driver and the action, which the next case pins.
      const r = scorePriority(ok({ notStarted: true, lapsed: true, daysToRenewal: -1 }));
      expect(r.reason).toContain(' + ');
      expect(r.reason).toContain(' → win-back');
    });

    it('omits the separator when there is only one driver', () => {
      const r = scorePriority(ok({ lapsed: true, daysToRenewal: -1 }));
      expect(r.reason).toBe('lapsed 1d ago → win-back');
    });
  });

  // =============================================================================================
  // JPU-29 — actionFor precedence
  // =============================================================================================
  describe('JPU-29 actionFor', () => {
    it('prefers win-back for a lapsed participant', () => {
      expect(actionFor(ok({ lapsed: true, renewalWindow: true, notStarted: true }))).toBe('win-back');
    });

    it('then a continuity call in the renewal window', () => {
      expect(actionFor(ok({ renewalWindow: true, notStarted: true }))).toBe('continuity call');
    });

    it('then kickstart for an unstarted journey', () => {
      expect(actionFor(ok({ notStarted: true, financialstatus: 'late' }))).toBe('kickstart journey');
    });

    it('then finance follow-up for any bad payment status', () => {
      ['defaulted', 'locked', 'late'].forEach((fin) => {
        expect(actionFor(ok({ financialstatus: fin, openTickets: 2 }))).toBe('finance follow-up');
      });
    });

    it('then resolve support when tickets are open', () => {
      expect(actionFor(ok({ openTickets: 1, goingQuiet: true }))).toBe('resolve support');
    });

    it('then re-engage for a quiet participant', () => {
      expect(actionFor(ok({ goingQuiet: true }))).toBe('re-engage');
    });

    it('falls back to a check in', () => {
      expect(actionFor(ok())).toBe('check in');
    });
  });

  // =============================================================================================
  // JPU-30 — thresholds are injectable without changing behaviour
  // =============================================================================================
  describe('JPU-30 thresholds', () => {
    it('defaults to the component values of 60 and 90 days', () => {
      expect(QUIET_DAYS).toBe(60);
      expect(RENEWAL_DAYS).toBe(90);
    });

    it('honours an overridden quiet threshold', () => {
      const r = ok({ daysSinceCoach: 45 });
      expect(scorePriority(r).priority).toBe(0);                       // 45 < default 60
      expect(scorePriority(r, { quietDays: 30, renewalDays: 90 }).priority).toBeGreaterThan(0);
    });

    it('honours an overridden renewal window', () => {
      // The weight is the PROPORTION of the window already elapsed: (window - daysLeft) / window * 32.
      // So for the same 30 days remaining, a WIDER window scores higher — 30 days out is two-thirds
      // through a 90-day window but only halfway through a 60-day one. Worth pinning explicitly, because
      // "the tighter window must be more urgent" is the intuitive reading, and it is the wrong one.
      const r = ok({ renewalWindow: true, daysToRenewal: 30 });
      expect(scorePriority(r, { quietDays: 60, renewalDays: 90 }).priority).toBe(21);   // 60/90*32
      expect(scorePriority(r, { quietDays: 60, renewalDays: 60 }).priority).toBe(16);   // 30/60*32
    });
  });
});
