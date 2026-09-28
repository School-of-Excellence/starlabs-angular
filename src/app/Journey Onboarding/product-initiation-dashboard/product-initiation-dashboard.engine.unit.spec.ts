// product-initiation-dashboard.engine.unit.spec.ts — unit tests for the Product Initiation Dashboard's
// business rules.
//
// WHAT THESE PROTECT: who gets started on a product today. How long someone has been waiting, whether
// their payments clear them, which of the three boards they land on (awaiting initiation /
// initiated-but-pending / engagement opportunity), which month the board is scoped to, and the table's
// sort / filter / pagination / formatting behaviour underneath it all.
//
// WHY THEY DID NOT EXIST BEFORE: all of this lived as methods on a 1,821-line component that injects
// Firestore, a Router, a DatePipe, a MatDialog and an AuthguardService and opens four collection
// subscriptions — several issuing a getDocs PER PARTICIPANT — before it computes anything. There is also a
// stray `import { count } from 'console'` at the top of that file which keeps it out of the type-checked
// unit build entirely. The engine imports NOTHING, so these rules are now testable regardless of what
// happens to that import. Extracted 2026-09-10, following the precedent set by
// ../delivery-dashboard-clone/delivery-dashboard.engine.ts and ../journey-coach-health-dashboard/priority.engine.ts.
//
// THE TWO CLEARANCE RULES ARE THE HEADLINE. This dashboard answers "has this person paid enough?" TWICE,
// with two different implementations that disagree — hasAnyClearedProduct() on the awaiting/priority boards
// and isEngagementCleared() on the engagement board. Both are pinned here, including the NaN and the
// string-comparison behaviour, because a participant can be Cleared on one board and Pending on the other.
//
// CASES MARKED "DEFECT (pinned)" record behaviour that is arguably wrong. They are pinned, not fixed: this
// was a refactor. See the engine header and the extraction report for the list.
import {
  ACTIVE_JOURNEY_STATUSES,
  BADGE_COLUMNS,
  DEAD_JOURNEY_STATUSES,
  EXCLUDED_JOURNEY_ID,
  IST_OFFSET_MINUTES,
  PERFORMANCE_MODES,
  SALES_EPOCH_ISO,
  TAB_BOXES,
  TEST_EMAIL_DOMAIN,
  allLoaded,
  boundsFromMonthYearKey,
  boxForTabIndex,
  cellValueOrDash,
  clampPage,
  compareCellValues,
  daysAgo,
  financialLabel,
  formatCurrencyCell,
  formatNumberCell,
  formatTextCell,
  hasAnyClearedProduct,
  hasInFlightJourney,
  isAfterSalesEpoch,
  isAwaitingInitiationCandidate,
  isBadgeColumn,
  isDateLike,
  isDeadJourney,
  isEngagementCleared,
  isEngagementOpportunity,
  isPerformanceMode,
  isReportableJourney,
  isSortable,
  isStatusEmpty,
  isTestParticipantEmail,
  isWithinRange,
  istShiftedWindow,
  lastNoteText,
  loadedCount,
  loadingProgressPct,
  mapCellValue,
  matchesRowFilters,
  monthBounds,
  monthYearKey,
  nextSortState,
  pageNumbers,
  parseMonthYearKey,
  purchaseAgeBucket,
  resolveMinimumPayment,
  salesEpoch,
  shouldHighlightCell,
  sortIcon,
  stepMonthYearKey,
  totalPagesFor,
  waitingDaysSince,
} from './product-initiation-dashboard.engine';

/** A fixed "now" so every date case is deterministic. Noon, to keep DST out of the day maths. */
const NOW = new Date(2026, 8, 10, 12, 0, 0); // 2026-09-10
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);

/** A row that matches everything; each case switches on only what it is about. */
const fields = {
  name: 'Asha Menon',
  mobile: '9876543210',
  email: 'asha@example.com',
  journey: 'EI Solution',
  financialdata: 'Cleared',
};
const noFilters = { search: '', selectedJourney: [] as string[], selectedStatus: '' };

describe('product-initiation-dashboard.engine', () => {

  // ===============================================================================================
  // Waiting period
  // ===============================================================================================
  describe('waitingDaysSince', () => {
    it('floors partial days', () => {
      const almost = new Date(NOW.getTime() - (6 * DAY + 23 * 60 * 60 * 1000));
      expect(waitingDaysSince(almost, NOW)).toBe(6);
    });

    it('counts whole days, and today is 0', () => {
      expect(waitingDaysSince(daysBefore(21), NOW)).toBe(21);
      expect(waitingDaysSince(NOW, NOW)).toBe(0);
    });

    it('DEFECT (pinned): an absent date and a brand-new one both read 0, and a future date goes negative', () => {
      // The waiting-period column cannot distinguish "onboarded today" from "we never recorded when",
      // and a mis-keyed future date reads as a negative age rather than standing out.
      expect(waitingDaysSince(null, NOW)).toBe(0);
      expect(waitingDaysSince(undefined, NOW)).toBe(0);
      expect(waitingDaysSince(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe(-3);
    });
  });

  // ===============================================================================================
  // Payment clearance — the two disagreeing rules
  // ===============================================================================================
  describe('isAwaitingInitiationCandidate', () => {
    it('accepts an in-flight journey with no products at all', () => {
      expect(isAwaitingInitiationCandidate('initiated', [], [])).toBe(true);
      expect(isAwaitingInitiationCandidate('ongoing', null, undefined)).toBe(true);
    });

    it('rejects any other status and anyone already holding a product', () => {
      expect(isAwaitingInitiationCandidate('completed', [], [])).toBe(false);
      expect(isAwaitingInitiationCandidate(null, [], [])).toBe(false);
      expect(isAwaitingInitiationCandidate('initiated', ['p1'], [])).toBe(false);
      expect(isAwaitingInitiationCandidate('initiated', [], ['p1'])).toBe(false);
    });
  });

  describe('resolveMinimumPayment', () => {
    it('prefers the participant record, including a legitimate ZERO', () => {
      expect(resolveMinimumPayment(0, 5000)).toBe(0);
      expect(resolveMinimumPayment(750, 5000)).toBe(750);
    });

    it('falls back to the catalogue only for null / undefined', () => {
      expect(resolveMinimumPayment(null, 5000)).toBe(5000);
      expect(resolveMinimumPayment(undefined, 5000)).toBe(5000);
    });

    it('DEFECT (pinned): a missing catalogue minimum becomes 0, so the product clears for free', () => {
      // A product whose catalogue entry has not loaded yet reports the participant as Cleared without
      // them having paid anything — and they are then queued for initiation.
      expect(resolveMinimumPayment(null, undefined)).toBe(0);
      expect(hasAnyClearedProduct([resolveMinimumPayment(null, undefined)], 0)).toBe(true);
    });
  });

  describe('hasAnyClearedProduct', () => {
    it('clears on the FIRST product that meets its minimum', () => {
      expect(hasAnyClearedProduct([50000, 100, 90000], 500)).toBe(true);
    });

    it('is inclusive at the minimum and fails one unit below', () => {
      expect(hasAnyClearedProduct([500], 500)).toBe(true);
      expect(hasAnyClearedProduct([500], 499)).toBe(false);
    });

    it('is false when the participant holds no products at all', () => {
      expect(hasAnyClearedProduct([], 999999)).toBe(false);
    });

    it('DEFECT (pinned): two string amounts compare LEXICOGRAPHICALLY, not numerically', () => {
      // The priority-mode path defaults pp_totalpaid to the STRING '0'. When the minimum is also a
      // string, '500' <= '1000' is false — a participant who has paid double the minimum is reported
      // Pending and is never initiated.
      expect(hasAnyClearedProduct(['500'], '1000')).toBe(false);
      expect(hasAnyClearedProduct([500], 1000)).toBe(true);
    });

    it('DEFECT (pinned): the string default "0" clears any zero minimum by coincidence', () => {
      expect(hasAnyClearedProduct([0], '0')).toBe(true);
    });
  });

  describe('isEngagementCleared — the SECOND, different clearance rule', () => {
    it('clears when nothing is outstanding', () => {
      expect(isEngagementCleared(500, 500)).toBe(true);
      expect(isEngagementCleared(500, 900)).toBe(true);
      expect(isEngagementCleared(500, 100)).toBe(false);
    });

    it('DEFECT (pinned): the "NA" defaults make this NaN, so the row is Pending FOREVER', () => {
      // Both operands default to the string 'NA' when absent. 'NA' - 'NA' is NaN and NaN <= 0 is
      // false, so a participant with no recorded minimum payment can never be shown as cleared on the
      // engagement board however much they have paid.
      expect(isEngagementCleared('NA', 'NA')).toBe(false);
      expect(isEngagementCleared('NA', 100000)).toBe(false);
      expect(financialLabel(isEngagementCleared('NA', 100000))).toBe('Pending');
    });

    it('DEFECT (pinned): it DISAGREES with hasAnyClearedProduct() on the same participant', () => {
      // Same person, same money, two boards, two answers. Paid 1000 against a 500 minimum:
      expect(hasAnyClearedProduct([500], 1000)).toBe(true);   // awaiting board: Cleared
      expect(isEngagementCleared('NA', 1000)).toBe(false);    // engagement board: Pending
    });
  });

  describe('financialLabel', () => {
    it('says Cleared / Pending', () => {
      expect(financialLabel(true)).toBe('Cleared');
      expect(financialLabel(false)).toBe('Pending');
    });
  });

  // ===============================================================================================
  // Board membership
  // ===============================================================================================
  describe('hasInFlightJourney / isEngagementOpportunity', () => {
    it('one in-flight journey among many is enough', () => {
      expect(hasInFlightJourney(['completed', 'cancelled', 'ongoing'])).toBe(true);
      expect(hasInFlightJourney(['completed', 'cancelled'])).toBe(false);
      expect(hasInFlightJourney([])).toBe(false);
    });

    it('an engagement opportunity is mid-journey, has finished something, and holds nothing now', () => {
      expect(isEngagementOpportunity(true, ['done'], [])).toBe(true);
      expect(isEngagementOpportunity(true, ['done'], null)).toBe(true);
      expect(isEngagementOpportunity(false, ['done'], [])).toBe(false);
      expect(isEngagementOpportunity(true, [], [])).toBe(false);
      expect(isEngagementOpportunity(true, ['done'], ['active'])).toBe(false);
    });

    it('DEFECT (pinned): the delivery MODE is computed but never applied to this board', () => {
      // The component builds an isValidMode flag from PERFORMANCE_MODES right beside this test and
      // then never reads it, so participants in every other mode land on the engagement board too.
      expect(Array.from(PERFORMANCE_MODES)).toEqual([
        'Performance Mode', 'Extended Performance Mode', 'After Extended Performance Mode',
      ]);
      expect(isPerformanceMode('Priority Mode')).toBe(false);
      // ...yet the membership rule does not take a mode at all:
      expect(isEngagementOpportunity(true, ['done'], [])).toBe(true);
    });
  });

  describe('isStatusEmpty', () => {
    it('covers every "not started" shape', () => {
      expect(isStatusEmpty(null)).toBe(true);
      expect(isStatusEmpty(undefined)).toBe(true);
      expect(isStatusEmpty('')).toBe(true);
      expect(isStatusEmpty('initiated')).toBe(false);
    });
  });

  describe('isAfterSalesEpoch', () => {
    it('admits a 2026 purchase and rejects a 2024 one', () => {
      expect(isAfterSalesEpoch(new Date(2026, 0, 1))).toBe(true);
      expect(isAfterSalesEpoch(new Date(2024, 5, 1))).toBe(false);
      expect(isAfterSalesEpoch(null)).toBe(false);
    });

    it('DEFECT (pinned): the epoch is parsed as UTC midnight, not local midnight', () => {
      // new Date('2025-01-01') is UTC. West of Greenwich the last hours of 31 Dec 2024 are admitted;
      // east of it, the first hours of 1 Jan 2025 are excluded. The cut-off therefore moves with the
      // deployment region rather than being a fixed business date.
      expect(SALES_EPOCH_ISO).toBe('2025-01-01');
      expect(salesEpoch().toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect(salesEpoch().getTime()).toBe(Date.UTC(2025, 0, 1));
      // A LOCAL 2025-01-01 midnight is a different instant unless the machine runs in UTC:
      const localNewYear = new Date(2025, 0, 1, 0, 0, 0, 0);
      expect(isAfterSalesEpoch(localNewYear))
        .toBe(localNewYear.getTime() >= Date.UTC(2025, 0, 1));
    });
  });

  describe('isTestParticipantEmail / isDeadJourney', () => {
    it('recognises an internal address by substring', () => {
      expect(isTestParticipantEmail('meena@soexcellence.com')).toBe(true);
      expect(isTestParticipantEmail('customer@gmail.com')).toBe(false);
      expect(TEST_EMAIL_DOMAIN).toBe('soexcellence');
    });

    it('DEFECT (pinned): the component derefs .email WITHOUT guarding it', () => {
      // In the component the expression is `metadata?.['email'].includes('soexcellence')` — the
      // optional chain protects the metadata but not the email, so a participant record with no email
      // throws inside a Firestore subscription callback and kills the whole not-assured pass silently.
      // The engine version is safe; this case documents what the CALLER still does.
      expect(isTestParticipantEmail(undefined)).toBe(false);
      expect(() => (undefined as any).includes('soexcellence')).toThrow();
    });

    it('DEFECT (pinned): the domain check has no @ boundary, so a lookalike domain is treated as internal', () => {
      expect(isTestParticipantEmail('buyer@notsoexcellence.co')).toBe(true);
    });

    it('drops a cancelled or downgraded journey', () => {
      expect(Array.from(DEAD_JOURNEY_STATUSES)).toEqual(['cancelled', 'downgraded']);
      expect(isDeadJourney('cancelled')).toBe(true);
      expect(isDeadJourney('ongoing')).toBe(false);
    });
  });

  describe('isReportableJourney', () => {
    it('keeps a normal journey in an active status', () => {
      expect(isReportableJourney('J1', 'ongoing')).toBe(true);
      expect(isReportableJourney('J1', 'initiated')).toBe(true);
      expect(isReportableJourney(null, 'ongoing')).toBe(true);
    });

    it('drops the excluded journey outright', () => {
      expect(isReportableJourney(EXCLUDED_JOURNEY_ID, 'ongoing')).toBe(false);
      expect(EXCLUDED_JOURNEY_ID).toBe('InLXMl7OBAqlDTZcXwK0');
    });

    it('drops a completed or cancelled status', () => {
      expect(isReportableJourney('J1', 'completed')).toBe(false);
      expect(isReportableJourney('J1', 'cancelled')).toBe(false);
    });

    it('DEFECT (pinned): an explicit null status is kept but a MISSING one is dropped', () => {
      // The status list contains a literal null and not undefined, so two ways of saying "no status
      // yet" behave differently — a document that simply omits journeystatus falls off the board.
      expect(Array.from(ACTIVE_JOURNEY_STATUSES)).toEqual([null, 'ongoing', 'initiated']);
      expect(isReportableJourney('J1', null)).toBe(true);
      expect(isReportableJourney('J1', undefined)).toBe(false);
    });
  });

  describe('purchaseAgeBucket / daysAgo', () => {
    it('is inclusive at the cut-off — a purchase exactly on it counts as recent', () => {
      const cutoff = daysBefore(7);
      expect(purchaseAgeBucket(cutoff, cutoff)).toBe('recent');
      expect(purchaseAgeBucket(daysBefore(6), cutoff)).toBe('recent');
      expect(purchaseAgeBucket(daysBefore(8), cutoff)).toBe('older');
    });

    it('an absent purchase date is never treated as new', () => {
      expect(purchaseAgeBucket(null, daysBefore(7))).toBe('older');
    });

    it('walks back across a month boundary and keeps the time of day', () => {
      const d = daysAgo(30, new Date(2026, 8, 10, 12, 0));
      expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([7, 11, 12]);
    });
  });

  // ===============================================================================================
  // Month windows
  // ===============================================================================================
  describe('monthBounds / monthYearKey / parseMonthYearKey / boundsFromMonthYearKey', () => {
    it('spans a whole calendar month, leap years included', () => {
      expect(monthBounds(new Date(2026, 1, 14)).end.getDate()).toBe(28);
      expect(monthBounds(new Date(2028, 1, 14)).end.getDate()).toBe(29);
    });

    it('round-trips the "YYYY-MM" key', () => {
      expect(monthYearKey(new Date(2026, 8, 10))).toBe('2026-09');
      expect(parseMonthYearKey('2026-09')).toEqual({ year: 2026, month: 9 });
      const b = boundsFromMonthYearKey('2026-02');
      expect([b.start.getMonth(), b.start.getDate(), b.end.getDate()]).toEqual([1, 1, 28]);
    });
  });

  describe('stepMonthYearKey', () => {
    it('rolls December forward into the next January', () => {
      const next = stepMonthYearKey('2026-12', 1);
      expect(next.monthyear).toBe('2027-01');
      expect([next.start.getFullYear(), next.start.getMonth()]).toEqual([2027, 0]);
    });

    it('rolls January back into the previous December', () => {
      const prev = stepMonthYearKey('2026-01', -1);
      expect(prev.monthyear).toBe('2025-12');
      expect([prev.start.getFullYear(), prev.start.getMonth()]).toEqual([2025, 11]);
    });

    it('zero-pads a single-digit month', () => {
      expect(stepMonthYearKey('2026-08', 1).monthyear).toBe('2026-09');
    });

    it('never overshoots the way Date.setMonth() does — it is longhand month arithmetic', () => {
      // Stepping is done on the year/month PAIR, so there is no day-of-month to spill over.
      const feb = stepMonthYearKey('2026-03', -1);
      expect(feb.monthyear).toBe('2026-02');
      expect(feb.end.getDate()).toBe(28);
    });

    it('DEFECT (pinned): a malformed key yields an Invalid Date and an empty board, not an error', () => {
      const bad = stepMonthYearKey('not-a-month', 1);
      expect(isNaN(bad.start.getTime())).toBe(true);
      expect(bad.monthyear).toContain('NaN');
    });
  });

  describe('istShiftedWindow', () => {
    it('DEFECT (pinned): the window is shifted 5h30m LATE by a hard-coded IST offset', () => {
      // Built at LOCAL midnight, then pushed forward by a constant that has nothing to do with the
      // machine's timezone. Onboardings in the first 5½ hours of the 1st are missed and 5½ hours of
      // the next month leak in — every count is slightly wrong, and differently wrong per region.
      const startDate = new Date(2026, 8, 1, 9, 0);
      const endDate = new Date(2026, 8, 30, 9, 0);
      const { start, end } = istShiftedWindow(startDate, endDate);
      expect(start.getTime() - new Date(2026, 8, 1, 0, 0, 0, 0).getTime()).toBe(IST_OFFSET_MINUTES * 60 * 1000);
      expect(end.getTime() - new Date(2026, 8, 30, 23, 59, 59, 999).getTime()).toBe(IST_OFFSET_MINUTES * 60 * 1000);
      expect(IST_OFFSET_MINUTES).toBe(330);
    });

    it('an injected zero offset gives the honest window, proving the shift is the only difference', () => {
      const { start, end } = istShiftedWindow(new Date(2026, 8, 1, 9, 0), new Date(2026, 8, 30, 9, 0), 0);
      expect(start.getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
      expect(end.getTime()).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).getTime());
    });

    it('does not mutate its arguments', () => {
      const startDate = new Date(2026, 8, 1, 9, 0);
      const snapshot = startDate.getTime();
      istShiftedWindow(startDate, new Date(2026, 8, 30));
      expect(startDate.getTime()).toBe(snapshot);
    });
  });

  describe('isWithinRange / boxForTabIndex', () => {
    it('is inclusive at both ends and false for an absent date', () => {
      const start = new Date(2026, 8, 1);
      const end = new Date(2026, 8, 30);
      expect(isWithinRange(start, start, end)).toBe(true);
      expect(isWithinRange(end, start, end)).toBe(true);
      expect(isWithinRange(new Date(2026, 9, 1), start, end)).toBe(false);
      expect(isWithinRange(null, start, end)).toBe(false);
    });

    it('maps each tab to its board and nothing to an out-of-range index', () => {
      expect(Array.from(TAB_BOXES)).toEqual(['awaitingInitiation', 'initiatedPending', 'engagementOpportunity']);
      expect(boxForTabIndex(0)).toBe('awaitingInitiation');
      expect(boxForTabIndex(2)).toBe('engagementOpportunity');
      expect(boxForTabIndex(3)).toBeNull();
      expect(boxForTabIndex(-1)).toBeNull();
    });
  });

  // ===============================================================================================
  // Pagination
  // ===============================================================================================
  describe('totalPagesFor / clampPage / pageNumbers', () => {
    it('rounds a partial last page UP; an empty table has ZERO pages', () => {
      expect(totalPagesFor(21, 10)).toBe(3);
      expect(totalPagesFor(0, 10)).toBe(0);
    });

    it('pulls a too-high page down but leaves page 1 of an empty table alone', () => {
      expect(clampPage(9, 3)).toBe(3);
      expect(clampPage(1, 0)).toBe(1);
    });

    it('centres the window and shunts it back at the end', () => {
      expect(pageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]);
      expect(pageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10]);
      expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
      expect(pageNumbers(1, 0)).toEqual([]);
    });
  });

  // ===============================================================================================
  // Sorting and cell formatting
  // ===============================================================================================
  describe('nextSortState / compareCellValues', () => {
    it('cycles asc -> desc -> OFF on the same column and restarts a new column at asc', () => {
      let state = nextSortState({ sortColumn: null, sortDirection: null }, 'name');
      expect(state).toEqual({ sortColumn: 'name', sortDirection: 'asc' });
      state = nextSortState(state, 'name');
      expect(state).toEqual({ sortColumn: 'name', sortDirection: 'desc' });
      state = nextSortState(state, 'name');
      expect(state).toEqual({ sortColumn: null, sortDirection: null });
      expect(nextSortState({ sortColumn: 'name', sortDirection: 'desc' }, 'date'))
        .toEqual({ sortColumn: 'date', sortDirection: 'asc' });
    });

    it('compares numerically, chronologically, then by locale text', () => {
      expect(compareCellValues('9', '100', 'asc')).toBeLessThan(0);
      expect(compareCellValues('2026-01-01', '2026-02-01', 'asc')).toBeLessThan(0);
      expect(compareCellValues('apple', 'banana', 'asc')).toBeLessThan(0);
      expect(compareCellValues(9, 100, 'desc')).toBeGreaterThan(0);
    });

    it('sorts nulls to the END in ascending order', () => {
      expect(compareCellValues(null, 'a', 'asc')).toBe(1);
      expect(compareCellValues('a', null, 'asc')).toBe(-1);
      expect(compareCellValues(null, null, 'asc')).toBe(0);
    });

    it('DEFECT (pinned): an EMPTY STRING is treated as the number 0 and sorts ahead of every word', () => {
      expect(compareCellValues('', '5', 'asc')).toBeLessThan(0);
    });

    it('DEFECT (pinned): a bare year string parses as a date', () => {
      expect(isDateLike('2000')).toBe(true);
      expect(isDateLike('not a date')).toBe(false);
    });
  });

  describe('sortIcon / isSortable / column flags / cellValueOrDash', () => {
    it('shows the neutral glyph on an unsorted column', () => {
      expect(sortIcon({ sortColumn: null, sortDirection: null }, 'name')).toBe('⇅');
      expect(sortIcon({ sortColumn: 'name', sortDirection: 'asc' }, 'name')).toBe('↑');
      expect(sortIcon({ sortColumn: 'name', sortDirection: 'desc' }, 'name')).toBe('↓');
    });

    it('columns are sortable unless explicitly opted out with false', () => {
      expect(isSortable({})).toBe(true);
      expect(isSortable({ sortable: false })).toBe(false);
    });

    it('pins the highlighted and badge column lists', () => {
      expect(shouldHighlightCell('name')).toBe(true);
      expect(shouldHighlightCell('journey')).toBe(false);
      expect(isBadgeColumn('journey')).toBe(true);
      expect(Array.from(BADGE_COLUMNS)).toEqual(['journey', 'paymentStatus']);
    });

    it('DEFECT (pinned): a real ZERO renders as an empty dash on a PAYMENTS board', () => {
      // `row[key] || '-'`. "Paid 0" and "we have no record" look identical in the amount columns.
      expect(cellValueOrDash({ totalpaid: 0 }, 'totalpaid')).toBe('-');
      expect(cellValueOrDash({ totalpaid: 500 }, 'totalpaid')).toBe(500 as any);
    });
  });

  describe('formatCurrencyCell / formatNumberCell / formatTextCell / lastNoteText', () => {
    it('renders a real ZERO but a missing value as a dash', () => {
      expect(formatNumberCell(0)).toBe('0');
      expect(formatNumberCell(undefined)).toBe('-');
      expect(formatCurrencyCell(1000).startsWith('₹')).toBe(true);
      expect(formatCurrencyCell(1000, '$').startsWith('$')).toBe(true);
    });

    it('DEFECT (pinned): a corrupt NaN amount renders as "-", same as a missing one', () => {
      expect(formatCurrencyCell(NaN)).toBe('-');
      expect(formatNumberCell(NaN)).toBe('-');
    });

    it('truncates a text cell only when an END is given', () => {
      expect(formatTextCell('ABCDEFGH', 0, 3)).toBe('ABC');
      expect(formatTextCell('ABCDEFGH', 2, undefined)).toBe('ABCDEFGH');
    });

    it('takes the LAST note; a blank one is indistinguishable from none', () => {
      expect(lastNoteText([{ note: 'first' }, { note: 'latest' }])).toBe('latest');
      expect(lastNoteText([{ note: '' }])).toBe('-');
      expect(lastNoteText([])).toBe('-');
      expect(lastNoteText(undefined)).toBe('-');
    });
  });

  describe('mapCellValue', () => {
    const map = { j1: { name: 'Ecosystem' }, j2: 'DFU' };

    it('looks a raw value up, optionally reading a property off the hit', () => {
      expect(mapCellValue('j2', map)).toBe('DFU');
      expect(mapCellValue('j1', map, undefined, 'name')).toBe('Ecosystem');
      expect(mapCellValue({ id: 'j2' }, map, 'id')).toBe('DFU');
      expect(mapCellValue([{ id: 'j2' }], map, '[0].id')).toBe('DFU');
    });

    it('falls back to a DASH for an unmapped value — unlike the sales dashboard\'s copy', () => {
      // ../sales-dashboard-clone's otherwise-identical mapCellValue() falls back to value.toString().
      // The two were already different before extraction; this pins which board does which, so a
      // future de-duplication has to make a deliberate choice.
      expect(mapCellValue('unmapped', map)).toBe('-');
      // ...except when there is no dictionary at all, where BOTH fall back to toString():
      expect(mapCellValue('anything', undefined)).toBe('anything');
    });
  });

  // ===============================================================================================
  // Table filtering
  // ===============================================================================================
  describe('matchesRowFilters', () => {
    it('matches everything when no filter is set', () => {
      expect(matchesRowFilters(fields, noFilters)).toBe(true);
    });

    it('searches the name case-INsensitively', () => {
      expect(matchesRowFilters(fields, { ...noFilters, search: 'MENON' })).toBe(true);
      expect(matchesRowFilters(fields, { ...noFilters, search: 'asha' })).toBe(true);
    });

    it('searches mobile and email too', () => {
      expect(matchesRowFilters(fields, { ...noFilters, search: '98765' })).toBe(true);
      expect(matchesRowFilters(fields, { ...noFilters, search: 'asha@example' })).toBe(true);
      expect(matchesRowFilters(fields, { ...noFilters, search: 'nothing here' })).toBe(false);
    });

    it('ignores a whitespace-only search term entirely', () => {
      expect(matchesRowFilters(fields, { ...noFilters, search: '   ' })).toBe(true);
    });

    it('DEFECT (pinned): email and mobile are case-SENSITIVE while name is not', () => {
      // Same search box, three columns, two different rules. Searching an email in any case other
      // than the stored one silently finds nothing, and nothing tells the user why.
      expect(matchesRowFilters(fields, { ...noFilters, search: 'ASHA@EXAMPLE.COM' })).toBe(false);
      expect(matchesRowFilters(fields, { ...noFilters, search: 'ASHA MENON' })).toBe(true);
    });

    it('filters journey by EXACT rendered cell value, and skips the filter when there is no column', () => {
      expect(matchesRowFilters(fields, { ...noFilters, selectedJourney: ['EI Solution'] })).toBe(true);
      expect(matchesRowFilters(fields, { ...noFilters, selectedJourney: ['WiSH'] })).toBe(false);
      expect(matchesRowFilters({ ...fields, journey: null }, { ...noFilters, selectedJourney: ['WiSH'] })).toBe(true);
    });

    it('filters on the financial status', () => {
      expect(matchesRowFilters(fields, { ...noFilters, selectedStatus: 'Cleared' })).toBe(true);
      expect(matchesRowFilters(fields, { ...noFilters, selectedStatus: 'Pending' })).toBe(false);
      expect(matchesRowFilters({ ...fields, financialdata: 'Pending' },
        { ...noFilters, selectedStatus: 'Pending' })).toBe(true);
    });

    it('ANDs all three filters together', () => {
      expect(matchesRowFilters(fields, {
        search: 'asha', selectedJourney: ['EI Solution'], selectedStatus: 'Cleared',
      })).toBe(true);
      expect(matchesRowFilters(fields, {
        search: 'asha', selectedJourney: ['EI Solution'], selectedStatus: 'Pending',
      })).toBe(false);
    });

    it('an EMPTY status array leaves the status filter inert (it is neither Cleared nor Pending)', () => {
      expect(matchesRowFilters(fields, { ...noFilters, selectedStatus: [] as any })).toBe(true);
    });
  });

  // ===============================================================================================
  // Loading progress
  // ===============================================================================================
  describe('loadedCount / allLoaded / loadingProgressPct', () => {
    it('counts only strict true', () => {
      expect(loadedCount({ a: true, b: false, c: 'yes' })).toBe(1);
      expect(allLoaded({ a: true, b: true })).toBe(true);
      expect(allLoaded({ a: true, b: false })).toBe(false);
    });

    it('reports the bar as a percentage of the tracked loaders', () => {
      expect(loadingProgressPct({ a: true, b: true, c: false, d: false })).toBe(50);
    });

    it('DEFECT (pinned): an EMPTY state map gives NaN progress but reads as fully loaded', () => {
      expect(loadingProgressPct({})).toBeNaN();
      expect(allLoaded({})).toBe(true);
    });
  });
});
