// delivery-dashboard.engine.unit.spec.ts — unit tests for the ORIGINAL Delivery Dashboard's business rules.
//
// WHAT THESE PROTECT: the numbers a delivery manager acts on every morning on the v1 board — how long a
// participant has waited and which chip that earns them, whether any of their products clears them
// financially, how stale an appointment must be before the case counts as stuck and how loudly it is
// escalated, which appointment type feeds which kanban column, and the month window the whole board is
// scoped to.
//
// WHY THEY DID NOT EXIST BEFORE: all of this lived as methods on a 1,862-line component that injects
// Firestore, a Router, a MatDialog and a FormBuilder and subscribes to four collections before it computes
// anything. Nothing could reach the rules except through a rendered template, so the only assertion
// available was "the chip says MEDIUM" — which cannot tell a 15-day threshold from a 16-day one. Extracted
// 2026-09-10 into delivery-dashboard.engine.ts with the logic unchanged, following the precedent set by
// ../delivery-dashboard-clone/delivery-dashboard.engine.ts and ../journey-coach-health-dashboard/priority.engine.ts.
//
// THRESHOLDS ARE ASSERTED BY VALUE ON PURPOSE. 14/10/5 priority days, 15 stuck days, 30 escalation days and
// the 7/30 cleared-age split are product decisions. Changing one changes who gets chased today, and that
// should be a deliberate edit that turns these tests red — not silent drift.
//
// THE DIVERGENCE FROM THE CLONE IS ALSO PINNED. This board uses strict `>` where the clone uses `>=`, and
// escalates MEDIUM at 15 days where the clone escalates at 21. Those are asserted here so that if the two
// boards are ever merged, the reconciliation is a decision somebody made, not a boundary that quietly moved.
//
// CASES MARKED "DEFECT (pinned)" record behaviour that is arguably wrong. They are pinned, not fixed: this
// was a refactor. See the engine header and the extraction report for the list.
import {
  ALL_PRODUCTS,
  APPOINTMENT_CATEGORY_MAP,
  CLEARED_OVER_LONG_DAYS,
  CLEARED_OVER_SHORT_DAYS,
  ESCALATION_HIGH_DAYS,
  IST_OFFSET_MINUTES,
  PRIORITY_HIGH_DAYS,
  PRIORITY_MEDIUM_DAYS,
  PRIORITY_URGENT_DAYS,
  PRODUCT_KEYWORDS_MAP,
  STUCK_DAYS,
  allLoaded,
  appointmentCategory,
  appointmentStatusLabel,
  clampPage,
  clearedAgeBucket,
  displayMonthLabel,
  endOfDay,
  escalationLevel,
  exportBottleneckLabel,
  exportFinancialLabel,
  exportWaitingPeriodLabel,
  filterDisplayText,
  financialLabel,
  hasActiveTableFilter,
  hasAnyClearedProduct,
  isAwaitingInitiationCandidate,
  isStuckCase,
  isWithinRange,
  istShiftedMonthWindow,
  lastNDaysRange,
  lastNoteText,
  loadedCount,
  loadingProgressPct,
  matchesProductSelection,
  matchesRowFilters,
  monthBounds,
  monthYearKey,
  pageNumbers,
  pageSlice,
  priorityLabel,
  resolveMinimumPayment,
  shiftMonth,
  startOfDay,
  stuckIssueType,
  stuckResolution,
  toDateOrNull,
  totalPagesFor,
  waitingDaysSince,
  waitingPeriodFor,
  wholeDaysBetweenMidnights,
} from './delivery-dashboard.engine';

/** A fixed "now" so every date case is deterministic. Noon, to keep DST out of the day maths. */
const NOW = new Date(2026, 8, 10, 12, 0, 0); // 2026-09-10
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
/** A stand-in for a Firestore Timestamp — only `toDate()` is ever touched. */
const ts = (d: Date) => ({ toDate: () => d });

describe('delivery-dashboard.engine (v1 board)', () => {

  // ===============================================================================================
  // Waiting period and the priority chip
  // ===============================================================================================
  describe('waitingDaysSince', () => {
    it('floors partial days — 13 days and 23 hours is still 13, not 14', () => {
      const almost = new Date(NOW.getTime() - (13 * DAY + 23 * 60 * 60 * 1000));
      expect(waitingDaysSince(almost, NOW)).toBe(13);
      expect(priorityLabel(waitingDaysSince(almost, NOW))).toBe('HIGH'); // not yet URGENT
    });

    it('counts exact whole days, and today is 0', () => {
      expect(waitingDaysSince(daysBefore(14), NOW)).toBe(14);
      expect(waitingDaysSince(NOW, NOW)).toBe(0);
    });

    it('returns 0 for an absent date', () => {
      expect(waitingDaysSince(null, NOW)).toBe(0);
      expect(waitingDaysSince(undefined, NOW)).toBe(0);
    });

    it('DEFECT (pinned): a FUTURE date is not clamped and goes negative', () => {
      // The clone dashboard's daysSince() clamps at 0. This one never has, so a mis-keyed onboarding
      // date reads as LOW priority forever instead of standing out.
      expect(waitingDaysSince(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe(-5);
      expect(priorityLabel(-5)).toBe('LOW');
    });
  });

  describe('waitingPeriodFor', () => {
    it('prefers an explicitly stamped waitingperiod over the timestamp', () => {
      expect(waitingPeriodFor({ waitingperiod: 3, initiatedtime: ts(daysBefore(99)) }, NOW)).toBe(3);
    });

    it('honours a stamped ZERO — only undefined falls through', () => {
      // `!== undefined`, not a truthiness check: 0 must not be mistaken for "no value".
      expect(waitingPeriodFor({ waitingperiod: 0, initiatedtime: ts(daysBefore(99)) }, NOW)).toBe(0);
    });

    it('falls back to the initiated Timestamp when nothing is stamped', () => {
      expect(waitingPeriodFor({ initiatedtime: ts(daysBefore(12)) }, NOW)).toBe(12);
    });

    it('is 0 when the row carries neither', () => {
      expect(waitingPeriodFor({}, NOW)).toBe(0);
      expect(waitingPeriodFor({ initiatedtime: null }, NOW)).toBe(0);
    });

    it('DEFECT (pinned): a plain JS Date in initiatedtime THROWS instead of being read', () => {
      // The fallback is `initiatedtime?.toDate()`. The optional chain guards initiatedtime being
      // absent, but NOT the missing toDate method — so a row carrying a real Date (anything that did
      // not come straight from raw Firestore) raises a TypeError mid-render rather than falling back.
      expect(() => waitingPeriodFor({ initiatedtime: daysBefore(40) as any }, NOW)).toThrow();
    });
  });

  describe('priorityLabel', () => {
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

    it('honours injected bands so a boundary can be pinned without editing a constant', () => {
      expect(priorityLabel(3, { urgentDays: 3, highDays: 2, mediumDays: 1 })).toBe('URGENT');
    });
  });

  // ===============================================================================================
  // Who is even on the awaiting-initiation board
  // ===============================================================================================
  describe('isAwaitingInitiationCandidate', () => {
    it('accepts an initiated or ongoing journey with no products at all', () => {
      expect(isAwaitingInitiationCandidate('initiated', [], [])).toBe(true);
      expect(isAwaitingInitiationCandidate('ongoing', null, undefined)).toBe(true);
    });

    it('rejects any other journey status, including completed and an absent one', () => {
      expect(isAwaitingInitiationCandidate('completed', [], [])).toBe(false);
      expect(isAwaitingInitiationCandidate(null, [], [])).toBe(false);
      expect(isAwaitingInitiationCandidate(undefined, [], [])).toBe(false);
      expect(isAwaitingInitiationCandidate('', [], [])).toBe(false);
    });

    it('rejects anyone who already holds an active OR a consumed product', () => {
      expect(isAwaitingInitiationCandidate('initiated', ['p1'], [])).toBe(false);
      expect(isAwaitingInitiationCandidate('initiated', [], ['p1'])).toBe(false);
    });

    it('is case-sensitive on the status — "Initiated" does not qualify', () => {
      expect(isAwaitingInitiationCandidate('Initiated', [], [])).toBe(false);
    });
  });

  // ===============================================================================================
  // Payment clearance — the gate on "ready for initiation"
  // ===============================================================================================
  describe('resolveMinimumPayment', () => {
    it('prefers the participant product record, including a legitimate ZERO', () => {
      expect(resolveMinimumPayment(0, 5000)).toBe(0);
      expect(resolveMinimumPayment(750, 5000)).toBe(750);
    });

    it('falls back to the product catalogue only for null / undefined', () => {
      expect(resolveMinimumPayment(null, 5000)).toBe(5000);
      expect(resolveMinimumPayment(undefined, 5000)).toBe(5000);
    });

    it('DEFECT (pinned): a missing or falsy catalogue minimum silently becomes 0', () => {
      // 0 means "no minimum", so a product whose catalogue entry has not loaded yet clears for free
      // and the participant is reported Cleared without having paid anything.
      expect(resolveMinimumPayment(null, undefined)).toBe(0);
      expect(resolveMinimumPayment(null, '')).toBe(0);
    });
  });

  describe('hasAnyClearedProduct', () => {
    it('clears on the FIRST product that meets its minimum — one cheap product is enough', () => {
      expect(hasAnyClearedProduct([50000, 100, 90000], 500)).toBe(true);
    });

    it('is inclusive at the minimum and fails one unit below', () => {
      expect(hasAnyClearedProduct([500], 500)).toBe(true);
      expect(hasAnyClearedProduct([500], 499)).toBe(false);
    });

    it('is false when the participant holds no products at all', () => {
      expect(hasAnyClearedProduct([], 999999)).toBe(false);
    });

    it('a zero minimum always clears, whatever has been paid', () => {
      expect(hasAnyClearedProduct([0], 0)).toBe(true);
    });

    it('DEFECT (pinned): two string amounts compare LEXICOGRAPHICALLY, not numerically', () => {
      // pp_totalpaid is stored as a string on some documents. '500' <= '1000' is false in JS, so a
      // participant who has paid 1000 against a 500 minimum is reported Pending and never initiated.
      expect(hasAnyClearedProduct(['500'], '1000')).toBe(false);
      // ...while the same pair as numbers behaves correctly, so the bug depends on document shape.
      expect(hasAnyClearedProduct([500], 1000)).toBe(true);
    });
  });

  describe('financialLabel', () => {
    it('says Cleared / Pending — NOT the clone board\'s "Not Scheduled"', () => {
      expect(financialLabel(true)).toBe('Cleared');
      expect(financialLabel(false)).toBe('Pending');
    });
  });

  describe('clearedAgeBucket', () => {
    it('uses STRICT > at both edges, so the threshold day falls in the LOWER bucket', () => {
      expect(clearedAgeBucket(CLEARED_OVER_LONG_DAYS)).toBe('over7');    // exactly 30
      expect(clearedAgeBucket(CLEARED_OVER_LONG_DAYS + 1)).toBe('over30');
      expect(clearedAgeBucket(CLEARED_OVER_SHORT_DAYS)).toBe('recent');  // exactly 7
      expect(clearedAgeBucket(CLEARED_OVER_SHORT_DAYS + 1)).toBe('over7');
    });

    it('pins the 30 / 7 day split', () => {
      expect([CLEARED_OVER_LONG_DAYS, CLEARED_OVER_SHORT_DAYS]).toEqual([30, 7]);
    });

    it('buckets are exclusive — an over-30 row is NOT also counted as over-7', () => {
      expect(clearedAgeBucket(45)).toBe('over30');
    });
  });

  describe('wholeDaysBetweenMidnights', () => {
    it('snaps both ends to midnight, so last night to this morning is a full 1 day', () => {
      const lastNight = new Date(2026, 8, 9, 23, 30, 0);
      const thisMorning = new Date(2026, 8, 10, 6, 0, 0);
      expect(wholeDaysBetweenMidnights(lastNight, thisMorning)).toBe(1);
    });

    it('is 0 within the same calendar day, however many hours apart', () => {
      expect(wholeDaysBetweenMidnights(new Date(2026, 8, 10, 0, 1), new Date(2026, 8, 10, 23, 59))).toBe(0);
    });

    it('does not mutate its arguments', () => {
      const from = new Date(2026, 8, 1, 15, 0);
      const snapshot = from.getTime();
      wholeDaysBetweenMidnights(from, NOW);
      expect(from.getTime()).toBe(snapshot);
    });
  });

  // ===============================================================================================
  // Stuck cases and escalation — where this board and the clone disagree
  // ===============================================================================================
  describe('escalationLevel', () => {
    it('uses STRICT > — exactly 30 days is MEDIUM, exactly 15 days is LOW', () => {
      expect(escalationLevel(ESCALATION_HIGH_DAYS)).toBe('MEDIUM');
      expect(escalationLevel(ESCALATION_HIGH_DAYS + 1)).toBe('HIGH');
      expect(escalationLevel(STUCK_DAYS)).toBe('LOW');
      expect(escalationLevel(STUCK_DAYS + 1)).toBe('MEDIUM');
    });

    it('pins the divergence from the clone board: MEDIUM starts at 16 days here, 22 there', () => {
      expect(STUCK_DAYS).toBe(15);
      expect(ESCALATION_HIGH_DAYS).toBe(30);
      expect(escalationLevel(16)).toBe('MEDIUM'); // the clone would still say LOW at 16
    });
  });

  describe('isStuckCase / stuckIssueType / stuckResolution', () => {
    it('all three flip together at the same strict > boundary', () => {
      expect(isStuckCase(15)).toBe(false);
      expect(stuckIssueType(15)).toBe('In Progress');
      expect(stuckResolution(15)).toBe('N/A');

      expect(isStuckCase(16)).toBe(true);
      expect(stuckIssueType(16)).toBe('Stuck in Phase');
      expect(stuckResolution(16)).toBe('Pending');
    });

    it('DEFECT (pinned): a future-dated appointment can never become stuck', () => {
      // waitingDaysSince() does not clamp, so a bad date produces a negative age that stays below the
      // threshold forever — the case silently drops off the stuck-cases tab.
      expect(isStuckCase(-40)).toBe(false);
      expect(stuckResolution(-40)).toBe('N/A');
    });
  });

  describe('appointmentStatusLabel', () => {
    it('is a bare truthiness check on attended', () => {
      expect(appointmentStatusLabel(true)).toBe('Completed');
      expect(appointmentStatusLabel(false)).toBe('Scheduled');
      expect(appointmentStatusLabel(undefined)).toBe('Scheduled');
    });

    it('DEFECT (pinned): a CANCELLED appointment still reads "Scheduled"', () => {
      // There is no cancelled branch on this board at all — the clone's appointmentStatusClass()
      // checks cancelled first. A cancelled call looks identical to one still to come.
      expect(appointmentStatusLabel(false)).toBe('Scheduled');
    });
  });

  // ===============================================================================================
  // Appointment type → delivery stage
  // ===============================================================================================
  describe('appointmentCategory', () => {
    it('maps a known type to its kanban column', () => {
      expect(appointmentCategory('Welcome To WiSH')).toBe('welcomeCall');
      expect(appointmentCategory('EI Diagnostics')).toBe('diagnostics');
      expect(appointmentCategory('WiSH Celebration Call')).toBe('completed');
    });

    it('returns null for an unmapped or absent type', () => {
      expect(appointmentCategory('Some New Call')).toBeNull();
      expect(appointmentCategory('')).toBeNull();
      expect(appointmentCategory(null)).toBeNull();
    });

    it('DEFECT (pinned): matching is EXACT and case-sensitive, so a re-cased type drops off the board', () => {
      // Nothing normalises the stored appointmenttype. Renaming "EI Review" to "EI review" in the
      // admin UI would empty the Final Review column with no error anywhere.
      expect(appointmentCategory('EI Review')).toBe('finalReview');
      expect(appointmentCategory('EI review')).toBeNull();
      expect(appointmentCategory(' EI Review')).toBeNull();
    });

    it('DEFECT (pinned): no appointment type maps to implementationPhase2, so that column is always empty', () => {
      const targets = Object.values(APPOINTMENT_CATEGORY_MAP);
      expect(targets).not.toContain('implementationPhase2');
      expect(targets).not.toContain('needsValidation');
    });

    it('pins the stage each product family lands in', () => {
      expect(appointmentCategory('A&H Light Mid Review')).toBe('midReviewDiagnostics');
      expect(appointmentCategory('EI Starter Pack Clarity Call')).toBe('clarityCall');
      expect(appointmentCategory('Critical Support Implementation')).toBe('implementation');
    });
  });

  describe('matchesProductSelection', () => {
    it('passes everything under the All Products sentinel', () => {
      expect(matchesProductSelection('Anything At All', ALL_PRODUCTS)).toBe(true);
      expect(matchesProductSelection(null, ALL_PRODUCTS)).toBe(true);
    });

    it('matches on a case-sensitive substring of the appointment type name', () => {
      expect(matchesProductSelection('WiSH Diagnostics', 'WISH')).toBe(true);
      expect(matchesProductSelection('A&H Light Review', 'A&H LIGHT')).toBe(true);
      expect(matchesProductSelection('EI Diagnostics', 'WISH')).toBe(false);
    });

    it('keeps EI Starter Pack out of the EI Solution view', () => {
      expect(matchesProductSelection('EI Starter Pack Diagnostics', 'EI Solution')).toBe(false);
      expect(matchesProductSelection('EI Starter Pack Diagnostics', 'EI Starter Pack')).toBe(true);
    });

    it('DEFECT (pinned): an unknown product name hides EVERY row instead of showing all', () => {
      // The keyword lookup falls back to [], and [].some() is false. A newly added product in the
      // dropdown that nobody added to PRODUCT_KEYWORDS_MAP renders a blank board, not an error.
      expect(PRODUCT_KEYWORDS_MAP['Brand New Product']).toBeUndefined();
      expect(matchesProductSelection('Brand New Product Diagnostics', 'Brand New Product')).toBe(false);
    });
  });

  // ===============================================================================================
  // Month windows and date helpers
  // ===============================================================================================
  describe('startOfDay / endOfDay', () => {
    it('snap to the local day bounds without mutating the input', () => {
      const d = new Date(2026, 8, 10, 15, 30, 45, 500);
      const snapshot = d.getTime();
      expect(startOfDay(d).getHours()).toBe(0);
      expect(endOfDay(d).getHours()).toBe(23);
      expect(endOfDay(d).getMilliseconds()).toBe(999);
      expect(d.getTime()).toBe(snapshot);
    });
  });

  describe('monthBounds', () => {
    it('spans the 1st to the true last day of the month', () => {
      const { start, end } = monthBounds(new Date(2026, 1, 14)); // February 2026
      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(1);
      expect(end.getDate()).toBe(28);
    });

    it('gets February right in a leap year', () => {
      expect(monthBounds(new Date(2028, 1, 14)).end.getDate()).toBe(29);
    });
  });

  describe('shiftMonth', () => {
    it('rolls backwards over a year boundary', () => {
      const prev = shiftMonth(new Date(2026, 0, 15), -1);
      expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2025, 11, 1]);
    });

    it('rolls forwards over a year boundary and always lands on the 1st', () => {
      const next = shiftMonth(new Date(2026, 11, 31), 1);
      expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2027, 0, 1]);
    });
  });

  describe('displayMonthLabel / monthYearKey', () => {
    it('renders the heading and the zero-padded 1-based key', () => {
      expect(displayMonthLabel(new Date(2026, 8, 10))).toBe('September 2026');
      expect(monthYearKey(new Date(2026, 8, 10))).toBe('2026-09');
      expect(monthYearKey(new Date(2026, 11, 1))).toBe('2026-12');
    });
  });

  describe('istShiftedMonthWindow', () => {
    it('DEFECT (pinned): the query window is shifted 5h30m LATE by a hard-coded IST offset', () => {
      // The bounds are built at LOCAL midnight and then pushed forward by a constant that has nothing
      // to do with the machine's timezone. Consequence: appointments in the first 5½ hours of the 1st
      // are missed from the month, and 5½ hours of the next month leak in — every count on the board
      // is slightly wrong, and differently wrong in each deployment region.
      const { start, end } = istShiftedMonthWindow(new Date(2026, 8, 10));
      const plainStart = new Date(2026, 8, 1, 0, 0, 0, 0);
      const plainEnd = new Date(2026, 8, 30, 23, 59, 59, 999);
      expect(start.getTime() - plainStart.getTime()).toBe(IST_OFFSET_MINUTES * 60 * 1000);
      expect(end.getTime() - plainEnd.getTime()).toBe(IST_OFFSET_MINUTES * 60 * 1000);
      expect(IST_OFFSET_MINUTES).toBe(330);
    });

    it('an injected zero offset gives the honest window, proving the shift is the only difference', () => {
      const { start, end } = istShiftedMonthWindow(new Date(2026, 8, 10), 0);
      expect(start.getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
      expect(end.getTime()).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).getTime());
    });
  });

  describe('isWithinRange / toDateOrNull / lastNDaysRange', () => {
    it('is inclusive at both ends', () => {
      const start = daysBefore(2);
      const end = NOW;
      expect(isWithinRange(start, start, end)).toBe(true);
      expect(isWithinRange(end, start, end)).toBe(true);
      expect(isWithinRange(daysBefore(3), start, end)).toBe(false);
    });

    it('treats an absent date as out of range (it does NOT fail open)', () => {
      expect(isWithinRange(null, daysBefore(2), NOW)).toBe(false);
      expect(isWithinRange(undefined, daysBefore(2), NOW)).toBe(false);
    });

    it('unwraps a Firestore Timestamp and passes a Date through untouched', () => {
      const d = daysBefore(1);
      expect(toDateOrNull(ts(d))).toBe(d);
      expect(toDateOrNull(d)).toBe(d);
      expect(toDateOrNull(null)).toBeNull();
      expect(toDateOrNull(0)).toBeNull();
    });

    it('walks back N days across a month boundary', () => {
      const { start, end } = lastNDaysRange(30, new Date(2026, 8, 10, 12, 0));
      expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 7, 11]);
      expect(end.getDate()).toBe(10);
    });
  });

  // ===============================================================================================
  // Pagination
  // ===============================================================================================
  describe('totalPagesFor / clampPage / pageSlice', () => {
    it('rounds a partial last page UP', () => {
      expect(totalPagesFor(21, 10)).toBe(3);
      expect(totalPagesFor(20, 10)).toBe(2);
    });

    it('an empty table has ZERO pages, not one', () => {
      expect(totalPagesFor(0, 10)).toBe(0);
    });

    it('pulls a too-high page down, but leaves page 1 of an empty table alone', () => {
      expect(clampPage(9, 3)).toBe(3);
      expect(clampPage(2, 5)).toBe(2);
      expect(clampPage(1, 0)).toBe(1); // not clamped to 0
    });

    it('slices 1-based pages, and a page past the end is empty rather than an error', () => {
      const rows = [1, 2, 3, 4, 5];
      expect(pageSlice(rows, 1, 2)).toEqual([1, 2]);
      expect(pageSlice(rows, 3, 2)).toEqual([5]);
      expect(pageSlice(rows, 9, 2)).toEqual([]);
    });
  });

  describe('pageNumbers', () => {
    it('lists every page when they all fit', () => {
      expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
      expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('centres the window on the current page', () => {
      expect(pageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]);
    });

    it('shunts the window back at the end so the pager never goes ragged', () => {
      expect(pageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10]);
      expect(pageNumbers(9, 10)).toEqual([6, 7, 8, 9, 10]);
    });

    it('does not run off the front', () => {
      expect(pageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5]);
    });

    it('is empty for a table with no pages', () => {
      expect(pageNumbers(1, 0)).toEqual([]);
    });
  });

  // ===============================================================================================
  // Table filtering
  // ===============================================================================================
  describe('matchesRowFilters', () => {
    const fields = { name: 'Asha Menon', journeyName: 'EI Solution', productName: 'EI Starter Pack' };
    const none = { searchTerm: '', selectedJourneys: [] as string[], selectedProducts: [] as string[] };

    it('matches everything when no filter is set', () => {
      expect(matchesRowFilters(fields, none)).toBe(true);
    });

    it('search is a case-insensitive substring of the NAME', () => {
      expect(matchesRowFilters(fields, { ...none, searchTerm: 'menon' })).toBe(true);
      expect(matchesRowFilters(fields, { ...none, searchTerm: 'sha me' })).toBe(true);
      expect(matchesRowFilters(fields, { ...none, searchTerm: 'zzz' })).toBe(false);
    });

    it('DEFECT (pinned): search ignores every column except the name', () => {
      // A delivery manager typing a product or journey name into the search box gets an empty table,
      // even though both are shown in the row.
      expect(matchesRowFilters(fields, { ...none, searchTerm: 'ei solution' })).toBe(false);
      expect(matchesRowFilters(fields, { ...none, searchTerm: 'starter' })).toBe(false);
    });

    it('journey is an EXACT membership test, product is a SUBSTRING test', () => {
      expect(matchesRowFilters(fields, { ...none, selectedJourneys: ['EI Solution'] })).toBe(true);
      expect(matchesRowFilters(fields, { ...none, selectedJourneys: ['EI'] })).toBe(false);
      expect(matchesRowFilters(fields, { ...none, selectedProducts: ['EI'] })).toBe(true);
    });

    it('ANDs the three filters together', () => {
      expect(matchesRowFilters(fields, {
        searchTerm: 'asha', selectedJourneys: ['EI Solution'], selectedProducts: ['Starter'],
      })).toBe(true);
      expect(matchesRowFilters(fields, {
        searchTerm: 'asha', selectedJourneys: ['WiSH'], selectedProducts: ['Starter'],
      })).toBe(false);
    });
  });

  describe('hasActiveTableFilter', () => {
    it('is true when any one of search / journey / product is populated', () => {
      expect(hasActiveTableFilter({ search: 'a', journey: [], product: [] })).toBe(true);
      expect(hasActiveTableFilter({ search: '', journey: ['EI'], product: [] })).toBe(true);
      expect(hasActiveTableFilter({ search: '', journey: [], product: ['EI'] })).toBe(true);
    });

    it('is false for an untouched or absent form', () => {
      expect(hasActiveTableFilter({ search: '', journey: [], product: [] })).toBe(false);
      expect(hasActiveTableFilter({})).toBe(false);
    });
  });

  // ===============================================================================================
  // Loading progress
  // ===============================================================================================
  describe('loadedCount / allLoaded / loadingProgressPct', () => {
    it('counts only strict true — a truthy string does not count as loaded', () => {
      expect(loadedCount({ a: true, b: false, c: 'yes' })).toBe(1);
    });

    it('reports the bar as a percentage of the tracked loaders', () => {
      expect(loadingProgressPct({ a: true, b: true, c: false, d: false })).toBe(50);
      expect(loadingProgressPct({ a: true })).toBe(100);
    });

    it('allLoaded is true only when every loader reported in', () => {
      expect(allLoaded({ a: true, b: true })).toBe(true);
      expect(allLoaded({ a: true, b: false })).toBe(false);
    });

    it('DEFECT (pinned): an EMPTY state map gives NaN progress but reads as fully loaded', () => {
      // 0/0. The bar renders blank while the "all loaded" gate fires immediately, so a mis-initialised
      // loadingStates would flash an empty dashboard as if it were complete.
      expect(loadingProgressPct({})).toBeNaN();
      expect(allLoaded({})).toBe(true);
    });
  });

  // ===============================================================================================
  // Export and display text
  // ===============================================================================================
  describe('export labels', () => {
    it('shouts the financial state louder in the spreadsheet than on screen', () => {
      expect(exportFinancialLabel('Cleared')).toBe('ELIGIBLE');
      expect(exportFinancialLabel('Pending')).toBe('NOT CLEARED');
    });

    it('derives the bottleneck column purely from the financial column', () => {
      expect(exportBottleneckLabel('Cleared')).toBe('Ready for Initiation');
      expect(exportBottleneckLabel('Pending')).toBe('Payment Follow-up');
    });

    it('DEFECT (pinned): anything other than the exact string "Cleared" exports as NOT CLEARED', () => {
      // Including undefined, which is what a row that never went through the clearance loop carries.
      // A participant whose data simply has not loaded is indistinguishable from one who has not paid.
      expect(exportFinancialLabel(undefined)).toBe('NOT CLEARED');
      expect(exportFinancialLabel('cleared')).toBe('NOT CLEARED');
      expect(exportBottleneckLabel(undefined)).toBe('Payment Follow-up');
    });

    it('renders an absent waiting period as "0 DAYS", never blank', () => {
      expect(exportWaitingPeriodLabel(12)).toBe('12 DAYS');
      expect(exportWaitingPeriodLabel(undefined)).toBe('0 DAYS');
      expect(exportWaitingPeriodLabel(0)).toBe('0 DAYS');
    });

    it('takes the LAST note in the list', () => {
      expect(lastNoteText([{ note: 'first' }, { note: 'latest' }])).toBe('latest');
      expect(lastNoteText([])).toBe('N/A');
      expect(lastNoteText(undefined)).toBe('N/A');
    });

    it('DEFECT (pinned): a blank note is indistinguishable from no note at all', () => {
      expect(lastNoteText([{ note: '' }])).toBe('N/A');
    });
  });

  describe('filterDisplayText', () => {
    it('explains each quick filter', () => {
      expect(filterDisplayText('readyForInitiation')).toBe('Showing only participants with cleared payment');
      expect(filterDisplayText('clearedMoreThan30Days'))
        .toBe('Showing only participants waiting 30+ days with cleared payment');
      expect(filterDisplayText('completed')).toBe('Showing completed participants');
    });

    it('says nothing for an unknown or absent filter, which hides the banner', () => {
      expect(filterDisplayText('none')).toBe('');
      expect(filterDisplayText('')).toBe('');
      expect(filterDisplayText('somethingNew')).toBe('');
    });
  });
});
