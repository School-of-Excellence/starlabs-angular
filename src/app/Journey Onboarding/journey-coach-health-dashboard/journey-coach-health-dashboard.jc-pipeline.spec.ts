import { JourneyCoachHealthDashboardComponent } from './journey-coach-health-dashboard.component';

/**
 * "JC done" excludes ONBOARDING calls (2026-09-23).
 *
 * The bug: loadContactEvents classified every appointment with isOnboardingAppt(), but only used the
 * result for PENDING ones (the Schedule card's JC vs Onboarding columns). Attended appointments were
 * pushed without it, so the same call was Onboarding while booked and a journey-coaching session once
 * attended — inflating "JC done today / last week / last month" on the Summary card and "Done today /
 * week / month" on the Coaches tab by every onboarding call in the window.
 *
 * The fix routes all four "JC done" surfaces through isCoachingDone(). Both predicates read only their
 * argument (no component state), so they run off the prototype with no TestBed / Firestore — same shape
 * as the needs-attention and going-quiet specs next to this file.
 *
 * REVERT GUARD: drop `onboarding` from the pushed JcDoneEvent (or make isCoachingDone always true) and
 * the "onboarding call" cases below go RED.
 *
 * NOT ASSERTED HERE, deliberately: contact recency still counts onboarding calls (feature 9) — an
 * onboarding call must keep a participant out of Going quiet. That path never consults isCoachingDone.
 */
type AnyRec = Record<string, unknown>;
const proto = JourneyCoachHealthDashboardComponent.prototype as unknown as {
  isCoachingDone(e: AnyRec): boolean;
  isOnboardingAppt(d: AnyRec): boolean;
};
const isCoachingDone = (e: AnyRec) => proto.isCoachingDone.call(null, e);
/** isOnboardingAppt reads this.onboardingApptTypeIds — give it the minimal `this` it needs. */
const isOnboardingAppt = (d: AnyRec, typeIds: string[] = []) =>
  proto.isOnboardingAppt.call({ onboardingApptTypeIds: new Set(typeIds) }, d);

const done = (extra: AnyRec = {}): AnyRec => ({ profileid: 'p1', coachId: 'c1', ms: Date.now(), onboarding: false, ...extra });

describe('JC pipeline — "JC done" counts coaching sessions only', () => {
  it('counts an attended coaching session', () => {
    expect(isCoachingDone(done())).toBe(true);
  });

  it('does NOT count an attended onboarding call', () => {
    expect(isCoachingDone(done({ onboarding: true }))).toBe(false);
  });

  it('treats a missing flag as a coaching session (older events predate the field)', () => {
    const e = done(); delete e['onboarding'];
    expect(isCoachingDone(e)).toBe(true);
  });

  it('is the exact complement of the onboarding flag — no third state', () => {
    for (const v of [true, false]) {
      expect(isCoachingDone(done({ onboarding: v }))).toBe(!v);
    }
  });

  // The flag stamped onto a done event comes from the SAME discriminator the Schedule column uses, so a
  // call cannot be Onboarding while booked and Journey Coaching once attended.
  describe('the flag comes from isOnboardingAppt — every marker excludes the call from "JC done"', () => {
    const cases: Array<[string, AnyRec, string[]]> = [
      ['the onboarding flag', { onboarding: true }, []],
      ['a journeyid', { journeyid: 'j1' }, []],
      ['a participantjourneyproductid', { participantjourneyproductid: 'pjp1' }, []],
      ['an onboarding appointment-type ref (legacy doc, no other marker)', { appointment: { id: 't-onb' } }, ['t-onb']],
    ];
    for (const [label, data, typeIds] of cases) {
      it(`excludes a call carrying ${label}`, () => {
        expect(isOnboardingAppt(data, typeIds)).toBe(true);
        expect(isCoachingDone(done({ onboarding: isOnboardingAppt(data, typeIds) }))).toBe(false);
      });
    }

    it('keeps a plain coaching call — no markers, and its type ref is not an onboarding type', () => {
      const data = { appointment: { id: 't-coach' } };
      expect(isOnboardingAppt(data, ['t-onb'])).toBe(false);
      expect(isCoachingDone(done({ onboarding: isOnboardingAppt(data, ['t-onb']) }))).toBe(true);
    });
  });
});
