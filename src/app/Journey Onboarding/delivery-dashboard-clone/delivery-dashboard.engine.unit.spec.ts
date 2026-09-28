// delivery-dashboard.engine.unit.spec.ts — unit tests for the Delivery Dashboard business rules.
//
// WHAT THESE PROTECT: the arithmetic and decisions a delivery manager acts on every morning — how long
// someone has been waiting and whether that makes them URGENT, whether their payments clear them to start,
// which "needs attention" list they land in and how loudly, and the funnel averages and percentages on the
// product cards.
//
// WHY THEY DID NOT EXIST BEFORE: all of this lived as methods on a 6,547-line component that injects two
// Firestore instances, a Router, an NgZone and a MatDialog. Nothing could reach the rules except through a
// rendered template, so the only available assertion was "the chip says HIGH" — which cannot tell a 10-day
// threshold from an 11-day one. Extracted 2026-09-10 into delivery-dashboard.engine.ts with the logic
// unchanged, following the priority.engine.ts precedent in ../journey-coach-health-dashboard.
//
// THRESHOLDS ARE ASSERTED BY VALUE ON PURPOSE. 14/10/5 days, 7 idle, 15 stuck, 21/30 escalation, and the
// excluded delivery modes are product decisions. Changing one changes who gets chased today, and that should
// be a deliberate edit that turns these tests red — not silent drift.
//
// CASES MARKED "DEFECT" pin behaviour that is arguably wrong. They are pinned, not fixed: this was a
// refactor. See the report / engine header for the list.
import {
  DOT_PALETTE,
  ESCALATION_HIGH_DAYS,
  ESCALATION_MEDIUM_DAYS,
  EXCLUDED_MODES,
  IDLE_DAYS,
  PRIORITY_HIGH_DAYS,
  PRIORITY_MEDIUM_DAYS,
  PRIORITY_URGENT_DAYS,
  REJECTED_STATUSES,
  STUCK_DAYS,
  appointmentStatusClass,
  averageDaysBetween,
  avgTimePct,
  classifyCohorts,
  conversionRatePct,
  dateFromField,
  daysDifferenceLabel,
  daysSince,
  escalationLevel,
  filterDisplayText,
  financialLabel,
  isDateInCurrentMonth,
  isDateInNextMonth,
  isDateInRange,
  isPaymentEligible,
  isSubscriptionEnded,
  loadingProgressPct,
  pageNumbers,
  pctOfMax,
  priorityLabel,
  productDotClass,
  productMonogram,
  relativeUpdatedLabel,
  sparkMax,
  stageColorClass,
  stuckIssueType,
  toDateOrNull,
  utilTone,
  velocityWeekLabel,
  waitingDaysSince,
  waitingPeriodFor,
  weekMondayIso,
} from './delivery-dashboard.engine';

/** A fixed "now" so every date case is deterministic. Noon, to keep DST out of the day maths. */
const NOW = new Date(2026, 8, 10, 12, 0, 0); // 2026-09-10
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
/** A stand-in for a Firestore Timestamp — only `toDate()` is ever touched. */
const ts = (d: Date) => ({ toDate: () => d });

/** An eligibility row that clears on every count; each case switches on only what it is about. */
const payer = (over: Partial<Parameters<typeof isPaymentEligible>[0]> = {}) => ({
  totalPaid: '1000',
  totalPurchaseValue: '1000',
  minimumPayment: '500',
  participantMode: 'priority mode',
  ...over,
});

/** A cohort row that is initiated and freshly active — in no cohort at all. */
const row = (over: Partial<Parameters<typeof classifyCohorts>[0]> = {}) => ({
  status: 'initiated',
  eligible: true,
  daysSinceInitiated: 0,
  daysSinceActivity: 0,
  ...over,
});

describe('delivery-dashboard.engine', () => {

  // ===============================================================================================
  // JPU-40 — waiting-period bands: which chip a participant wears
  // ===============================================================================================
  describe('JPU-40 priorityLabel', () => {
    it('bands each threshold day into the HIGHER band (>= not >)', () => {
      expect(priorityLabel(PRIORITY_URGENT_DAYS)).toBe('URGENT');   // 14
      expect(priorityLabel(PRIORITY_HIGH_DAYS)).toBe('HIGH');       // 10
      expect(priorityLabel(PRIORITY_MEDIUM_DAYS)).toBe('MEDIUM');   // 5
    });

    it('drops to the lower band one day below each threshold', () => {
      expect(priorityLabel(PRIORITY_URGENT_DAYS - 1)).toBe('HIGH');
      expect(priorityLabel(PRIORITY_HIGH_DAYS - 1)).toBe('MEDIUM');
      expect(priorityLabel(PRIORITY_MEDIUM_DAYS - 1)).toBe('LOW');
    });

    it('pins the thresholds themselves — 14 / 10 / 5 days', () => {
      expect([PRIORITY_URGENT_DAYS, PRIORITY_HIGH_DAYS, PRIORITY_MEDIUM_DAYS]).toEqual([14, 10, 5]);
    });

    it('treats a brand-new and a negative waiting period alike, as LOW', () => {
      expect(priorityLabel(0)).toBe('LOW');
      expect(priorityLabel(-5)).toBe('LOW');
    });

    it('honours injected bands so a boundary can be pinned without editing a constant', () => {
      expect(priorityLabel(3, { urgentDays: 3, highDays: 2, mediumDays: 1 })).toBe('URGENT');
    });
  });

  // ===============================================================================================
  // JPU-41 — waiting period: the number the bands read
  // ===============================================================================================
  describe('JPU-41 waitingDaysSince', () => {
    it('floors partial days — 13 days and 23 hours is still 13, not 14', () => {
      const almost = new Date(NOW.getTime() - (13 * DAY + 23 * 60 * 60 * 1000));
      expect(waitingDaysSince(almost, NOW)).toBe(13);
      expect(priorityLabel(waitingDaysSince(almost, NOW))).toBe('HIGH'); // not yet URGENT
    });

    it('counts exact whole days', () => {
      expect(waitingDaysSince(daysBefore(14), NOW)).toBe(14);
      expect(waitingDaysSince(NOW, NOW)).toBe(0);
    });

    it('returns 0 for an absent date', () => {
      expect(waitingDaysSince(null, NOW)).toBe(0);
      expect(waitingDaysSince(undefined, NOW)).toBe(0);
    });

    it('DEFECT (pinned): a FUTURE date is not clamped and goes negative', () => {
      // daysSince() clamps at 0; this one does not. Both feed priority chips, so the two disagree.
      expect(waitingDaysSince(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe(-5);
    });
  });

  describe('JPU-41 waitingPeriodFor', () => {
    it('prefers an explicitly stamped waitingperiod over the timestamp', () => {
      expect(waitingPeriodFor({ waitingperiod: 3, initiatedtime: daysBefore(99) }, NOW)).toBe(3);
    });

    it('honours a stamped ZERO — only undefined falls through', () => {
      // `!== undefined`, not a truthiness check: 0 must not be mistaken for "no value".
      expect(waitingPeriodFor({ waitingperiod: 0, initiatedtime: daysBefore(99) }, NOW)).toBe(0);
    });

    it('falls back to the initiated timestamp when nothing is stamped', () => {
      expect(waitingPeriodFor({ initiatedtime: daysBefore(12) }, NOW)).toBe(12);
    });

    it('is 0 when the row carries neither', () => {
      expect(waitingPeriodFor({}, NOW)).toBe(0);
      expect(waitingPeriodFor({ initiatedtime: null }, NOW)).toBe(0);
    });
  });

  // ===============================================================================================
  // JPU-42 — payment eligibility: the gate on "ready to initiate"
  // ===============================================================================================
  describe('JPU-42 isPaymentEligible', () => {
    it('clears a fully settled balance even below the product minimum', () => {
      expect(isPaymentEligible(payer({ totalPaid: '200', totalPurchaseValue: '200', minimumPayment: '500' }))).toBe(true);
    });

    it('clears an unsettled balance once the minimum is met', () => {
      expect(isPaymentEligible(payer({ totalPaid: '500', totalPurchaseValue: '2000', minimumPayment: '500' }))).toBe(true);
    });

    it('is inclusive at the minimum and fails one unit below', () => {
      expect(isPaymentEligible(payer({ totalPaid: '500', totalPurchaseValue: '2000', minimumPayment: '500' }))).toBe(true);
      expect(isPaymentEligible(payer({ totalPaid: '499', totalPurchaseValue: '2000', minimumPayment: '500' }))).toBe(false);
    });

    it('lets an OVERPAYMENT clear it (balance below zero counts as settled)', () => {
      expect(isPaymentEligible(payer({ totalPaid: '3000', totalPurchaseValue: '2000', minimumPayment: '9999' }))).toBe(true);
    });

    it('vetoes every excluded delivery mode however much has been paid', () => {
      for (const mode of Array.from(EXCLUDED_MODES)) {
        expect(isPaymentEligible(payer({ participantMode: mode })))
          .withContext(mode).toBe(false);
      }
    });

    it('pins the excluded mode list', () => {
      expect(Array.from(EXCLUDED_MODES).sort())
        .toEqual(['event mode', 'installation event mode', 'integration mode']);
    });

    it('lets an unlisted mode through', () => {
      expect(isPaymentEligible(payer({ participantMode: 'priority mode' }))).toBe(true);
    });

    it('DEFECT (pinned): parseInt TRUNCATES decimals, so 99.99 misses a 100 minimum', () => {
      expect(isPaymentEligible(payer({ totalPaid: '99.99', totalPurchaseValue: '5000', minimumPayment: '100' }))).toBe(false);
    });

    it('DEFECT (pinned): a row with NO financial data at all reads as ELIGIBLE', () => {
      // 0 purchased minus 0 paid is a zero balance, which the rule reads as "fully settled".
      expect(isPaymentEligible({
        totalPaid: undefined, totalPurchaseValue: undefined, minimumPayment: undefined, participantMode: '',
      })).toBe(true);
    });

    it('treats unparseable amounts as zero rather than NaN', () => {
      expect(isPaymentEligible(payer({ totalPaid: 'n/a', totalPurchaseValue: '2000', minimumPayment: '1' }))).toBe(false);
    });

    it('accepts an injected excluded-mode set', () => {
      expect(isPaymentEligible(payer({ participantMode: 'priority mode' }), new Set(['priority mode']))).toBe(false);
    });
  });

  describe('JPU-42 financialLabel', () => {
    it('reads straight off eligibility', () => {
      expect(financialLabel(true)).toBe('Cleared');
      expect(financialLabel(false)).toBe('Not Scheduled');
    });
  });

  // ===============================================================================================
  // JPU-43 — actionable cohorts: which attention list a row lands in
  // ===============================================================================================
  describe('JPU-43 classifyCohorts', () => {
    it('drops completed and every rejected status off the board entirely', () => {
      for (const status of ['completed', ...Array.from(REJECTED_STATUSES)]) {
        const f = classifyCohorts(row({ status, daysSinceInitiated: 999, daysSinceActivity: 999 }));
        expect(f).withContext(status).toEqual({ excluded: true, awaiting: false, idle: false, stuck: false });
      }
    });

    it('pins the rejected status list', () => {
      expect(Array.from(REJECTED_STATUSES).sort()).toEqual(['cancelled', 'inactive', 'rejected']);
    });

    it('calls an eligible row with no status AWAITING', () => {
      expect(classifyCohorts(row({ status: '', eligible: true })).awaiting).toBe(true);
    });

    it('never marks an awaiting row idle or stuck as well — the original continued past them', () => {
      const f = classifyCohorts(row({ status: '', eligible: true, daysSinceInitiated: 900, daysSinceActivity: 900 }));
      expect(f).toEqual({ excluded: false, awaiting: true, idle: false, stuck: false });
    });

    it('leaves an INELIGIBLE statusless row invisible — in no cohort at all', () => {
      const f = classifyCohorts(row({ status: '', eligible: false, daysSinceInitiated: 900, daysSinceActivity: 900 }));
      expect(f).toEqual({ excluded: false, awaiting: false, idle: false, stuck: false });
    });

    it('is inclusive at the idle threshold and quiet one day short', () => {
      expect(classifyCohorts(row({ daysSinceInitiated: IDLE_DAYS })).idle).toBe(true);
      expect(classifyCohorts(row({ daysSinceInitiated: IDLE_DAYS - 1 })).idle).toBe(false);
    });

    it('is inclusive at the stuck threshold and quiet one day short', () => {
      expect(classifyCohorts(row({ daysSinceActivity: STUCK_DAYS })).stuck).toBe(true);
      expect(classifyCohorts(row({ daysSinceActivity: STUCK_DAYS - 1 })).stuck).toBe(false);
    });

    it('pins the cohort thresholds — 7 idle, 15 stuck', () => {
      expect([IDLE_DAYS, STUCK_DAYS]).toEqual([7, 15]);
    });

    it('only ever calls an INITIATED row idle — an ongoing one is working, not idle', () => {
      expect(classifyCohorts(row({ status: 'ongoing', daysSinceInitiated: 500 })).idle).toBe(false);
    });

    it('calls both initiated and ongoing rows stuck', () => {
      expect(classifyCohorts(row({ status: 'initiated', daysSinceActivity: 20 })).stuck).toBe(true);
      expect(classifyCohorts(row({ status: 'ongoing', daysSinceActivity: 20 })).stuck).toBe(true);
    });

    it('ignores any other status for idle and stuck alike', () => {
      const f = classifyCohorts(row({ status: 'submitted', daysSinceInitiated: 900, daysSinceActivity: 900 }));
      expect(f.idle).toBe(false);
      expect(f.stuck).toBe(false);
    });

    it('lets one row be BOTH idle and stuck — it is counted once in each list', () => {
      const f = classifyCohorts(row({ status: 'initiated', daysSinceInitiated: 20, daysSinceActivity: 20 }));
      expect(f.idle).toBe(true);
      expect(f.stuck).toBe(true);
    });

    it('honours injected thresholds', () => {
      const f = classifyCohorts(row({ daysSinceInitiated: 2, daysSinceActivity: 3 }), { idleDays: 2, stuckDays: 3 });
      expect([f.idle, f.stuck]).toEqual([true, true]);
    });
  });

  describe('JPU-43 escalationLevel', () => {
    it('uses STRICT > , so the threshold day itself sits in the lower band', () => {
      expect(escalationLevel(ESCALATION_HIGH_DAYS)).toBe('MEDIUM');       // exactly 30
      expect(escalationLevel(ESCALATION_HIGH_DAYS + 1)).toBe('HIGH');     // 31
      expect(escalationLevel(ESCALATION_MEDIUM_DAYS)).toBe('LOW');        // exactly 21
      expect(escalationLevel(ESCALATION_MEDIUM_DAYS + 1)).toBe('MEDIUM'); // 22
    });

    it('pins the escalation thresholds — 30 / 21 days', () => {
      expect([ESCALATION_HIGH_DAYS, ESCALATION_MEDIUM_DAYS]).toEqual([30, 21]);
    });

    it('calls a freshly stuck case LOW', () => {
      expect(escalationLevel(STUCK_DAYS)).toBe('LOW');
      expect(escalationLevel(0)).toBe('LOW');
    });
  });

  describe('JPU-43 stuckIssueType', () => {
    it('distinguishes a stall mid-flow from one that never started', () => {
      expect(stuckIssueType('ongoing')).toBe('Stuck mid-flow');
      expect(stuckIssueType('initiated')).toBe('Initiated · stalled');
    });
  });

  // ===============================================================================================
  // JPU-44 — date maths shared by every rule above
  // ===============================================================================================
  describe('JPU-44 daysSince', () => {
    it('reads a Firestore Timestamp, a Date and an epoch alike', () => {
      expect(daysSince(ts(daysBefore(9)), NOW)).toBe(9);
      expect(daysSince(daysBefore(9), NOW)).toBe(9);
      expect(daysSince(daysBefore(9).getTime(), NOW)).toBe(9);
    });

    it('CLAMPS a future timestamp at 0 — unlike waitingDaysSince, which goes negative', () => {
      expect(daysSince(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe(0);
    });

    it('returns 0 for absent or unparseable input rather than NaN', () => {
      expect(daysSince(null, NOW)).toBe(0);
      expect(daysSince(undefined, NOW)).toBe(0);
      expect(daysSince('not a date', NOW)).toBe(0);
    });

    it('floors partial days', () => {
      expect(daysSince(new Date(NOW.getTime() - (DAY + 1)), NOW)).toBe(1);
    });
  });

  describe('JPU-44 dateFromField / toDateOrNull', () => {
    it('dateFromField unwraps a Timestamp and passes a plain value to the Date constructor', () => {
      const d = daysBefore(1);
      expect(dateFromField(ts(d))!.getTime()).toBe(d.getTime());
      expect(dateFromField(d.getTime())!.getTime()).toBe(d.getTime());
    });

    it('dateFromField returns null only for falsy input', () => {
      expect(dateFromField(null)).toBeNull();
      expect(dateFromField(0)).toBeNull();   // epoch 0 is falsy — pinned quirk
    });

    it('DEFECT (pinned): dateFromField hands back an Invalid Date for garbage instead of null', () => {
      const bad = dateFromField('not a date');
      expect(bad).not.toBeNull();
      expect(isNaN(bad!.getTime())).toBe(true);
    });

    it('toDateOrNull is the strict variant — anything unrecognised is null', () => {
      expect(toDateOrNull('not a date')).toBeNull();
      expect(toDateOrNull({})).toBeNull();
      expect(toDateOrNull(null)).toBeNull();
      expect(toDateOrNull(ts(NOW))).toBe(NOW);
      expect(toDateOrNull(NOW)).toBe(NOW);
      expect(toDateOrNull(NOW.getTime())!.getTime()).toBe(NOW.getTime());
    });
  });

  describe('JPU-44 daysDifferenceLabel', () => {
    it('singularises exactly one day and pluralises everything else', () => {
      expect(daysDifferenceLabel(daysBefore(1), NOW)).toBe('1 day');
      expect(daysDifferenceLabel(daysBefore(2), NOW)).toBe('2 days');
      expect(daysDifferenceLabel(NOW, NOW)).toBe('0 days');
    });

    it('DEFECT (pinned): an unparseable date renders the literal string "NaN days"', () => {
      expect(daysDifferenceLabel('not a date', NOW)).toBe('NaN days');
    });

    it('DEFECT (pinned): a future date renders a negative count, e.g. "-3 days"', () => {
      expect(daysDifferenceLabel(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe('-3 days');
    });
  });

  describe('JPU-44 month and range predicates', () => {
    it('isDateInCurrentMonth needs the year to match too', () => {
      expect(isDateInCurrentMonth(new Date(2026, 8, 1), NOW)).toBe(true);
      expect(isDateInCurrentMonth(new Date(2025, 8, 1), NOW)).toBe(false); // same month, wrong year
      expect(isDateInCurrentMonth(new Date(2026, 7, 31), NOW)).toBe(false);
    });

    it('isDateInNextMonth rolls December into next January', () => {
      const dec = new Date(2026, 11, 15);
      expect(isDateInNextMonth(new Date(2027, 0, 5), dec)).toBe(true);
      expect(isDateInNextMonth(new Date(2026, 0, 5), dec)).toBe(false); // right month, wrong year
    });

    it('isDateInRange is inclusive at both bounds', () => {
      const start = new Date(2026, 8, 1);
      const end = new Date(2026, 8, 30);
      expect(isDateInRange(start, start, end)).toBe(true);
      expect(isDateInRange(end, start, end)).toBe(true);
      expect(isDateInRange(new Date(2026, 7, 31), start, end)).toBe(false);
      expect(isDateInRange(new Date(2026, 9, 1), start, end)).toBe(false);
    });

    it('isDateInRange FAILS OPEN — a missing bound or a null date means "no filter"', () => {
      const start = new Date(2026, 8, 1);
      const end = new Date(2026, 8, 30);
      expect(isDateInRange(new Date(2020, 0, 1), null, end)).toBe(true);
      expect(isDateInRange(new Date(2020, 0, 1), start, null)).toBe(true);
      expect(isDateInRange(null, start, end)).toBe(true);
    });
  });

  describe('JPU-44 weekMondayIso', () => {
    it('groups all seven days of a week onto one key (Monday-first)', () => {
      // Asserted as a PROPERTY, not a literal: the label itself is timezone-sensitive (see the
      // DEFECT note in the engine), but the grouping this drives is not.
      const monday = new Date(2026, 8, 7, 9, 0, 0); // Mon 2026-09-07
      const key = weekMondayIso(monday);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getTime() + i * DAY);
        expect(weekMondayIso(d)).withContext(d.toDateString()).toBe(key);
      }
    });

    it('puts Sunday with the week that precedes it, not the one that follows', () => {
      const sunday = new Date(2026, 8, 13, 9, 0, 0);
      const nextMonday = new Date(2026, 8, 14, 9, 0, 0);
      expect(weekMondayIso(sunday)).not.toBe(weekMondayIso(nextMonday));
      expect(weekMondayIso(sunday)).toBe(weekMondayIso(new Date(2026, 8, 7, 9, 0, 0)));
    });

    it('does not mutate the date it is given', () => {
      const d = new Date(2026, 8, 10, 12, 0, 0);
      const before = d.getTime();
      weekMondayIso(d);
      expect(d.getTime()).toBe(before);
    });
  });

  describe('JPU-44 velocityWeekLabel / isSubscriptionEnded', () => {
    it('renders a short month and day', () => {
      // Given a full local datetime the label is deterministic; a bare "YYYY-MM-DD" is parsed as UTC
      // and can slip a day west of Greenwich (DEFECT, pinned in the engine header).
      expect(velocityWeekLabel(new Date(2026, 4, 18, 12, 0, 0).toString())).toBe('May 18');
    });

    it('renders an empty label for an empty week', () => {
      expect(velocityWeekLabel('')).toBe('');
    });

    it('calls a subscription ended only once the end date is in the past', () => {
      expect(isSubscriptionEnded(ts(daysBefore(1)), NOW)).toBe(true);
      expect(isSubscriptionEnded(ts(new Date(NOW.getTime() + DAY)), NOW)).toBe(false);
    });

    it('treats a missing end date as still running', () => {
      expect(isSubscriptionEnded(null, NOW)).toBe(false);
      expect(isSubscriptionEnded(undefined, NOW)).toBe(false);
    });
  });

  // ===============================================================================================
  // JPU-45 — funnel arithmetic on the product cards
  // ===============================================================================================
  describe('JPU-45 averageDaysBetween', () => {
    it('averages only the spans with BOTH ends and rounds the result', () => {
      const spans = [
        { from: daysBefore(10), to: daysBefore(8) },  // 2
        { from: daysBefore(10), to: daysBefore(7) },  // 3
        { from: daysBefore(10), to: null },           // skipped, not counted as 0
      ];
      expect(averageDaysBetween(spans)).toBe(3); // (2+3)/2 = 2.5 → 3 (round-half-up)
    });

    it('does NOT drag the mean down with unmeasurable spans', () => {
      const withGaps = [{ from: daysBefore(10), to: daysBefore(0) }, { from: null, to: null }];
      expect(averageDaysBetween(withGaps)).toBe(10);
    });

    it('is 0 when nothing is measurable, including an empty list', () => {
      expect(averageDaysBetween([])).toBe(0);
      expect(averageDaysBetween([{ from: null, to: daysBefore(1) }])).toBe(0);
    });

    it('DEFECT (pinned): an out-of-order span is Math.abs()d, so bad data reads as a positive delay', () => {
      expect(averageDaysBetween([{ from: daysBefore(0), to: daysBefore(4) }])).toBe(4);
    });

    it('rounds a fractional day rather than truncating it', () => {
      const from = daysBefore(2);
      const to = new Date(from.getTime() + 2.6 * DAY);
      expect(averageDaysBetween([{ from, to }])).toBe(3);
    });
  });

  describe('JPU-45 conversionRatePct', () => {
    it('rounds to a whole percentage', () => {
      expect(conversionRatePct(1, 3)).toBe(33);
      expect(conversionRatePct(2, 3)).toBe(67);
    });

    it('guards an empty cohort at 0 instead of dividing by zero', () => {
      expect(conversionRatePct(0, 0)).toBe(0);
      expect(conversionRatePct(5, 0)).toBe(0);
    });

    it('reads a fully converted cohort as 100', () => {
      expect(conversionRatePct(7, 7)).toBe(100);
    });
  });

  describe('JPU-45 pctOfMax / avgTimePct / sparkMax', () => {
    it('pctOfMax floors at 4% so the smallest bar is still visible', () => {
      expect(pctOfMax(1, 100)).toBe(4);   // 1% would be invisible
      expect(pctOfMax(0, 100)).toBe(4);   // even an empty bar keeps the floor
      expect(pctOfMax(50, 100)).toBe(50);
      expect(pctOfMax(100, 100)).toBe(100);
    });

    it('avgTimePct caps at 150 so the gauge cannot run off its track', () => {
      expect(avgTimePct(30, 30)).toBe(100);
      expect(avgTimePct(15, 30)).toBe(50);
      expect(avgTimePct(900, 30)).toBe(150);
      expect(avgTimePct(45, 30)).toBe(150); // 150% is already the cap
      expect(avgTimePct(44, 30)).toBe(147);
    });

    it('avgTimePct has NO floor — a zero average is a legitimate 0', () => {
      expect(avgTimePct(0, 30)).toBe(0);
    });

    it('sparkMax never returns below 1, so an all-zero series still has a denominator', () => {
      expect(sparkMax([0, 0, 0])).toBe(1);
      expect(sparkMax([])).toBe(1);
      expect(sparkMax([0, 4, 2])).toBe(4);
    });
  });

  describe('JPU-45 loadingProgressPct', () => {
    it('reports whole and partial progress', () => {
      expect(loadingProgressPct(0, 4)).toBe(0);
      expect(loadingProgressPct(1, 4)).toBe(25);
      expect(loadingProgressPct(4, 4)).toBe(100);
    });

    it('DEFECT (pinned): 0 of 0 is NaN, not 0 — there is no guard on the denominator', () => {
      expect(isNaN(loadingProgressPct(0, 0))).toBe(true);
    });
  });

  // ===============================================================================================
  // JPU-46 — pager windowing
  // ===============================================================================================
  describe('JPU-46 pageNumbers', () => {
    it('lists every page when they fit in the window', () => {
      expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(pageNumbers(3, 3)).toEqual([1, 2, 3]);
    });

    it('centres the window on the current page in the middle of a long list', () => {
      expect(pageNumbers(10, 20)).toEqual([8, 9, 10, 11, 12]);
    });

    it('clamps to the start rather than showing page 0 or negatives', () => {
      expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5]);
      expect(pageNumbers(2, 20)).toEqual([1, 2, 3, 4, 5]);
    });

    it('SHUNTS BACK at the end so the last page never leaves a ragged short pager', () => {
      expect(pageNumbers(20, 20)).toEqual([16, 17, 18, 19, 20]);
      expect(pageNumbers(19, 20)).toEqual([16, 17, 18, 19, 20]);
    });

    it('always draws exactly maxPagesToShow pages once the list is longer than the window', () => {
      for (let p = 1; p <= 20; p++) {
        expect(pageNumbers(p, 20).length).withContext(`page ${p}`).toBe(5);
      }
    });

    it('returns an empty pager when there are no pages', () => {
      expect(pageNumbers(1, 0)).toEqual([]);
    });

    it('honours a different window size', () => {
      expect(pageNumbers(5, 20, 3)).toEqual([4, 5, 6]);
    });
  });

  // ===============================================================================================
  // JPU-47 — label and colour rules
  // ===============================================================================================
  describe('JPU-47 stageColorClass', () => {
    it('maps each recognised stage family to its column colour', () => {
      expect(stageColorClass('Eligible')).toBe('col--eligible');
      expect(stageColorClass('Request')).toBe('col--request');
      expect(stageColorClass('Pre-Process')).toBe('col--preprocess');
      expect(stageColorClass('Diagnostics')).toBe('col--diagnostic');
      expect(stageColorClass('Implementation')).toBe('col--implement');
      expect(stageColorClass('Final Review')).toBe('col--review');
      expect(stageColorClass('Completed')).toBe('col--completion');
    });

    it('accepts the alternate spellings for pre-process and completion', () => {
      expect(stageColorClass('Preprocess Form')).toBe('col--preprocess');
      expect(stageColorClass('Welcome Call')).toBe('col--preprocess');
      expect(stageColorClass('Post-Process Form')).toBe('col--completion');
      expect(stageColorClass('Celebration Call')).toBe('col--completion');
      expect(stageColorClass('Post Session Check-in')).toBe('col--completion');
    });

    it('matches by substring, case-insensitively, ignoring surrounding space', () => {
      expect(stageColorClass('  MID REVIEW - DIAGNOSTICS  ')).toBe('col--diagnostic');
    });

    it('resolves an overlap by ORDER — diagnostic is tested before review', () => {
      // "Mid Review - Diagnostics" contains both words; the earlier branch wins.
      expect(stageColorClass('Mid Review - Diagnostics')).toBe('col--diagnostic');
    });

    it('falls back to the eligible colour for an unknown or empty stage', () => {
      expect(stageColorClass('Something Else')).toBe('col--eligible');
      expect(stageColorClass('')).toBe('col--eligible');
    });
  });

  describe('JPU-47 productDotClass', () => {
    it('cycles the palette and wraps past the end', () => {
      expect(productDotClass(0)).toBe(DOT_PALETTE[0]);
      expect(productDotClass(4)).toBe(DOT_PALETTE[4]);
      expect(productDotClass(5)).toBe(DOT_PALETTE[0]);
      expect(productDotClass(11)).toBe(DOT_PALETTE[1]);
    });

    it('pins the palette', () => {
      expect(DOT_PALETTE).toEqual(['dot-indigo', 'dot-teal', 'dot-emerald', 'dot-amber', 'dot-violet']);
    });
  });

  describe('JPU-47 productMonogram', () => {
    it('takes the first two characters of a single word', () => {
      expect(productMonogram('Diagnostics')).toBe('DI');
    });

    it('takes both initials of a two-word name', () => {
      expect(productMonogram('Starter Pack')).toBe('SP');
    });

    it('takes the first THREE initials and ignores later words', () => {
      expect(productMonogram('EI Custom Solutions Premium')).toBe('ECS');
    });

    it('strips leading punctuation before deciding', () => {
      expect(productMonogram('  ***Critical Support')).toBe('CS');
    });

    it('gives a question mark when there is nothing usable', () => {
      expect(productMonogram('')).toBe('?');
      expect(productMonogram('   ')).toBe('?');
      expect(productMonogram('***')).toBe('?');
    });

    it('DEFECT (pinned): interior punctuation is kept, so a hyphen swallows the second initial', () => {
      // "EI-Starter Pack" splits on whitespace only → ["EI-Starter", "Pack"] → E + P.
      // A human would read this product as "EIS"; the monogram says "EP".
      expect(productMonogram('EI-Starter Pack')).toBe('EP');
    });

    it('DEFECT (pinned): a single one-letter word yields a one-character monogram', () => {
      expect(productMonogram('X')).toBe('X');
    });
  });

  describe('JPU-47 utilTone', () => {
    it('is inclusive at every band edge', () => {
      expect(utilTone(0.85)).toBe('high');
      expect(utilTone(0.6)).toBe('med');
      expect(utilTone(0.3)).toBe('low');
    });

    it('drops a band just below each edge', () => {
      expect(utilTone(0.8499)).toBe('med');
      expect(utilTone(0.5999)).toBe('low');
      expect(utilTone(0.2999)).toBe('min');
    });

    it('handles the empty and the saturated specialist', () => {
      expect(utilTone(0)).toBe('min');
      expect(utilTone(1)).toBe('high');
    });
  });

  describe('JPU-47 appointmentStatusClass', () => {
    it('lets cancelled beat every other signal, attended included', () => {
      expect(appointmentStatusClass({ cancelled: true, attended: true, starttime: 1, date: 1 }))
        .toBe('status-cancelled');
    });

    it('walks the precedence attended → scheduled → submitted', () => {
      expect(appointmentStatusClass({ attended: true, starttime: 1, date: 1 })).toBe('status-completed');
      expect(appointmentStatusClass({ starttime: 1, date: 1 })).toBe('status-scheduled');
      expect(appointmentStatusClass({ date: 1 })).toBe('status-submitted');
    });

    it('calls an empty, null or undefined appointment not scheduled', () => {
      expect(appointmentStatusClass({})).toBe('status-notscheduled');
      expect(appointmentStatusClass(null)).toBe('status-notscheduled');
      expect(appointmentStatusClass(undefined)).toBe('status-notscheduled');
    });
  });

  describe('JPU-47 relativeUpdatedLabel', () => {
    it('says "just now" below 5 seconds and switches to seconds at 5', () => {
      expect(relativeUpdatedLabel(0)).toBe('just now');
      expect(relativeUpdatedLabel(4)).toBe('just now');
      expect(relativeUpdatedLabel(5)).toBe('5s ago');
    });

    it('switches to whole minutes at 60 seconds and to hours at 3600', () => {
      expect(relativeUpdatedLabel(59)).toBe('59s ago');
      expect(relativeUpdatedLabel(60)).toBe('1m ago');
      expect(relativeUpdatedLabel(119)).toBe('1m ago');   // floored, not rounded
      expect(relativeUpdatedLabel(3599)).toBe('59m ago');
      expect(relativeUpdatedLabel(3600)).toBe('1h ago');
    });

    it('never rolls over to days — an overnight tab reads in hours', () => {
      expect(relativeUpdatedLabel(14 * 3600)).toBe('14h ago');
      expect(relativeUpdatedLabel(72 * 3600)).toBe('72h ago');
    });
  });

  describe('JPU-47 filterDisplayText', () => {
    it('explains each quick filter', () => {
      expect(filterDisplayText('readyForInitiation')).toBe('Showing only participants with cleared payment');
      expect(filterDisplayText('clearedMoreThan7Days'))
        .toBe('Showing only participants waiting 7+ days with cleared payment');
      expect(filterDisplayText('clearedMoreThan30Days'))
        .toBe('Showing only participants waiting 30+ days with cleared payment');
      expect(filterDisplayText('initiatedToday')).toBe('Showing only participants initiated today');
      expect(filterDisplayText('todayActivity')).toBe('Showing today\'s activity (initiated and appointments)');
      expect(filterDisplayText('thisMonthActivity')).toBe('Showing this month\'s activity');
      expect(filterDisplayText('midReviewDiagnostics'))
        .toBe('Showing participants in Mid Review - Diagnostics stage');
      expect(filterDisplayText('completed')).toBe('Showing completed participants');
    });

    it('explains nothing for an unknown filter or the "none" sentinel, hiding the banner', () => {
      expect(filterDisplayText('none')).toBe('');
      expect(filterDisplayText('')).toBe('');
      expect(filterDisplayText('somethingInvented')).toBe('');
    });
  });
});
