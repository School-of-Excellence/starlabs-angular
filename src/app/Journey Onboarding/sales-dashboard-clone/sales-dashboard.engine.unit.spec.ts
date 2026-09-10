// sales-dashboard.engine.unit.spec.ts — unit tests for the Sales Dashboard business rules.
//
// WHAT THESE PROTECT: the numbers the sales floor is measured on. Which leads count and which are test
// data, whether a sale is "assured", which money field a cancellation is worth, how a downgrade is
// attributed between the old and the new product, the conversion percentages and the colour they are drawn
// in, who tops the leaderboards, and the table sort / filter / pagination behaviour underneath it all.
//
// WHY THEY DID NOT EXIST BEFORE: all of this lived as methods on a 4,867-line component that injects
// Firestore, a Router, a DatePipe, a MatDialog and nine MatTableDataSources and wires up eleven charts
// before it computes anything. Nothing could reach the rules except through a rendered template or a
// rendered chart, so the only assertion available was "the bar is green" — which cannot tell a 70%
// threshold from a 71% one. Extracted 2026-09-10 into sales-dashboard.engine.ts with the logic unchanged,
// following the precedent set by ../delivery-dashboard-clone/delivery-dashboard.engine.ts and
// ../journey-coach-health-dashboard/priority.engine.ts.
//
// THRESHOLDS ARE ASSERTED BY VALUE ON PURPOSE. The 70/55 bar bands, the top-FIVE leaderboards, the 60px
// drag threshold, the 5-slide carousel cap and the excluded/test journey ids are product decisions. These
// feed commission conversations; changing one should be a deliberate edit that turns a test red.
//
// ROUNDING IS PINNED SEPARATELY. percentageOf() FLOORS. 69.9% is 69, and 69 is red. That single choice
// decides the colour of every performance bar on the page, so it gets its own case.
//
// CASES MARKED "DEFECT (pinned)" record behaviour that is arguably wrong. They are pinned, not fixed: this
// was a refactor. See the engine header and the extraction report for the list.
import {
  BAR_AMBER,
  BAR_AMBER_PCT,
  BAR_GREEN,
  BAR_GREEN_PCT,
  BAR_RED,
  DISCONTINUED_STATUSES,
  DRAG_THRESHOLD_PX,
  EXCLUDED_JOURNEY_ID,
  MAX_SLIDES,
  MOVEMENT_TYPES,
  PAIR_CHUNK_SIZE,
  TEAM_ROW,
  TEST_DATA_EMAIL_DOMAIN,
  TEST_DATA_JOURNEY_ID,
  TOP_N,
  UNKNOWN_PERSON,
  allLoaded,
  assuredFilterCutoff,
  barColor,
  barColors,
  cancellationBalance,
  cellValueOrDash,
  chunk,
  clampPage,
  clampSliderPage,
  compareCellValues,
  customerStatusBucket,
  dayBounds,
  downgradeType,
  formatCurrencyCell,
  formatIndianCurrency,
  formatNumberCell,
  formatTextCell,
  hasAnyPositiveMetric,
  initSlider,
  isAssuredSale,
  isBadgeColumn,
  isCountingType,
  isDateLike,
  isExcludedSale,
  isMovementType,
  isNotAssuredSale,
  isPendingSale,
  isPendingStatus,
  isSortable,
  isTestDataSale,
  isWithinRange,
  lastNoteText,
  loadedCount,
  loadingProgressPct,
  mapCellValue,
  matchesSaleFilters,
  matchesSaleTypeFilter,
  monthBounds,
  nextSortState,
  pageNumbers,
  pairAvatar,
  percentageOf,
  personNameOrUnknown,
  rowHighlightClass,
  saleValueKey,
  settleSliderPage,
  shouldHighlightCell,
  sliderGoToPage,
  sliderTransform,
  sortIcon,
  topPairs,
  topPerformers,
  totalPagesFor,
  trendsStartMonth,
} from './sales-dashboard.engine';

/** A fixed "now" so every date case is deterministic. Noon, to keep DST out of the day maths. */
const NOW = new Date(2026, 8, 10, 12, 0, 0); // 2026-09-10

/** No filter is active. Each case switches on only what it is about. */
const noFilters = {
  selectedFilter: '',
  selectedJourney: [] as any[],
  selectedPreSalesPerson: [] as any[],
  selectedSalesPerson: [] as any[],
};

const sale = (over: Record<string, any> = {}) => ({
  journey: 'J1',
  presalespersonname: 'Asha',
  salespersonname: 'Bilal',
  ...over,
});

describe('sales-dashboard.engine', () => {

  // ===============================================================================================
  // Which sales count at all
  // ===============================================================================================
  describe('isTestDataSale', () => {
    it('strips a staff purchase on the test journey', () => {
      expect(isTestDataSale({ journey: TEST_DATA_JOURNEY_ID, email: 'meena@soexcellence.com' })).toBe(true);
    });

    it('keeps a real customer on that same journey', () => {
      expect(isTestDataSale({ journey: TEST_DATA_JOURNEY_ID, email: 'customer@gmail.com' })).toBe(false);
    });

    it('is case-insensitive on the email', () => {
      expect(isTestDataSale({ journey: TEST_DATA_JOURNEY_ID, email: 'ME@SOEXCELLENCE.COM' })).toBe(true);
    });

    it('DEFECT (pinned): a staff purchase on ANY OTHER journey is counted as revenue', () => {
      // The journey id is hard-coded, so internal testing on a second journey inflates the month.
      expect(isTestDataSale({ journey: 'some-other-journey', email: 'meena@soexcellence.com' })).toBe(false);
    });

    it('DEFECT (pinned): the domain test is a bare substring, so a lookalike domain is deleted', () => {
      // "notsoexcellence.com" contains "soexcellence.com". A genuine customer there vanishes from the
      // month's revenue with no trace and no error.
      expect(TEST_DATA_EMAIL_DOMAIN).toBe('soexcellence.com');
      expect(isTestDataSale({ journey: TEST_DATA_JOURNEY_ID, email: 'buyer@notsoexcellence.com' })).toBe(true);
    });

    it('survives a sale with no email at all', () => {
      expect(isTestDataSale({ journey: TEST_DATA_JOURNEY_ID })).toBe(false);
    });
  });

  describe('isExcludedSale', () => {
    it('drops the excluded journey and any rejected lead, case-insensitively', () => {
      expect(isExcludedSale({ journey: EXCLUDED_JOURNEY_ID })).toBe(true);
      expect(isExcludedSale({ journey: 'J1', status: 'Rejected' })).toBe(true);
      expect(isExcludedSale({ journey: 'J1', status: 'REJECTED' })).toBe(true);
    });

    it('keeps everything else, including an undecided lead', () => {
      expect(isExcludedSale({ journey: 'J1', status: 'approved' })).toBe(false);
      expect(isExcludedSale({ journey: 'J1' })).toBe(false);
    });

    it('pins the excluded journey id', () => {
      expect(EXCLUDED_JOURNEY_ID).toBe('InLXMl7OBAqlDTZcXwK0');
    });
  });

  describe('matchesSaleFilters', () => {
    it('passes everything when nothing is filtered', () => {
      expect(matchesSaleFilters(sale(), noFilters)).toBe(true);
    });

    it('keeps only the selected journeys', () => {
      expect(matchesSaleFilters(sale(), { ...noFilters, selectedJourney: ['J1'] })).toBe(true);
      expect(matchesSaleFilters(sale(), { ...noFilters, selectedJourney: ['J2'] })).toBe(false);
    });

    it('filters on pre-sales and sales person independently, and ANDs them', () => {
      expect(matchesSaleFilters(sale(), { ...noFilters, selectedPreSalesPerson: ['Asha'] })).toBe(true);
      expect(matchesSaleFilters(sale(), { ...noFilters, selectedPreSalesPerson: ['Zed'] })).toBe(false);
      expect(matchesSaleFilters(sale(), {
        ...noFilters, selectedPreSalesPerson: ['Asha'], selectedSalesPerson: ['Zed'],
      })).toBe(false);
    });

    it('matches an unnamed person under the Unknown fallback', () => {
      expect(matchesSaleFilters(sale({ presalespersonname: null }), {
        ...noFilters, selectedPreSalesPerson: [UNKNOWN_PERSON],
      })).toBe(true);
    });

    it('DEFECT (pinned): a group tile with an empty journey list rejects EVERY sale', () => {
      // selectedFilter alone makes the journey clause true, and an empty selectedJourney can never
      // contain the sale's journey — so the whole dashboard reads zero. It only works today because
      // the component populates selectedJourney at the same moment it sets selectedFilter.
      expect(matchesSaleFilters(sale(), { ...noFilters, selectedFilter: 'ecosystem' })).toBe(false);
    });
  });

  // ===============================================================================================
  // Sale classification
  // ===============================================================================================
  describe('saleValueKey', () => {
    it('a cancellation is worth the written-off balance; everything else its purchase value', () => {
      expect(saleValueKey('cancelled')).toBe('balanceamount');
      expect(saleValueKey('new')).toBe('totalpurchasevalue');
      expect(saleValueKey('downgradetoold')).toBe('totalpurchasevalue');
      expect(saleValueKey(undefined)).toBe('totalpurchasevalue');
    });
  });

  describe('isAssuredSale', () => {
    it('assured means a payment plan exists', () => {
      expect(isAssuredSale('PLAN-3')).toBe(true);
      expect(isAssuredSale(null)).toBe(false);
      expect(isAssuredSale(undefined)).toBe(false);
      expect(isAssuredSale('')).toBe(false);
    });

    it('DEFECT (pinned): a plan recorded as 0 or as the word "none" still counts as assured', () => {
      // Assured drives the headline conversion number. Either value inflates it.
      expect(isAssuredSale(0)).toBe(true);
      expect(isAssuredSale('none')).toBe(true);
      expect(isAssuredSale(false)).toBe(true);
    });
  });

  describe('isPendingStatus / isMovementType / isCountingType / personNameOrUnknown', () => {
    it('every "no decision recorded" shape reads as pending', () => {
      expect(isPendingStatus(null)).toBe(true);
      expect(isPendingStatus(undefined)).toBe(true);
      expect(isPendingStatus('')).toBe(true);
      expect(isPendingStatus('pending')).toBe(true);
      expect(isPendingStatus('approved')).toBe(false);
    });

    it('pins the three movement types', () => {
      expect(Array.from(MOVEMENT_TYPES)).toEqual(['cancelled', 'downgradetoold', 'downgradetonew']);
      expect(isMovementType('cancelled')).toBe(true);
      expect(isMovementType('new')).toBe(false);
    });

    it('counting types are the three that add to a gross tally outright', () => {
      expect(isCountingType('new')).toBe(true);
      expect(isCountingType('addons')).toBe(true);
      expect(isCountingType('upgrade')).toBe(true);
      expect(isCountingType('cancelled')).toBe(false);
    });

    it('an unnamed person aggregates under Unknown, but a real 0-length name does too', () => {
      expect(personNameOrUnknown('Asha')).toBe('Asha');
      expect(personNameOrUnknown(null)).toBe(UNKNOWN_PERSON);
      expect(personNameOrUnknown('')).toBe(UNKNOWN_PERSON);
    });
  });

  describe('cancellationBalance', () => {
    it('is what was bought minus what the cancellation retained', () => {
      expect(cancellationBalance(100000, 40000)).toBe(60000);
    });

    it('treats absent values as zero', () => {
      expect(cancellationBalance(100000, null)).toBe(100000);
      expect(cancellationBalance(undefined, undefined)).toBe(0);
    });

    it('DEFECT (pinned): an inconsistent pair produces a NEGATIVE write-off', () => {
      // There is no floor, and the result is ADDED into the cancelled total — so a bad document pair
      // quietly REDUCES reported cancellations instead of raising a flag.
      expect(cancellationBalance(40000, 100000)).toBe(-60000);
    });
  });

  describe('downgradeType', () => {
    const start = new Date(2026, 8, 1);
    const end = new Date(2026, 8, 30, 23, 59, 59, 999);

    it('is attributed to the NEW product only when the replacement was bought in the window', () => {
      expect(downgradeType(true, new Date(2026, 8, 15), start, end)).toBe('downgradetonew');
    });

    it('falls back to the OLD product when there is no replacement purchase', () => {
      expect(downgradeType(false, new Date(2026, 8, 15), start, end)).toBe('downgradetoold');
      expect(downgradeType(undefined, new Date(2026, 8, 15), start, end)).toBe('downgradetoold');
    });

    it('a replacement bought OUTSIDE the window reads as a plain loss for this month', () => {
      expect(downgradeType(true, new Date(2026, 9, 2), start, end)).toBe('downgradetoold');
      expect(downgradeType(true, null, start, end)).toBe('downgradetoold');
    });

    it('is inclusive at both window edges', () => {
      expect(downgradeType(true, start, start, end)).toBe('downgradetonew');
      expect(downgradeType(true, end, start, end)).toBe('downgradetonew');
    });
  });

  // ===============================================================================================
  // Percentages and chart colours
  // ===============================================================================================
  describe('percentageOf', () => {
    it('FLOORS — it does not round', () => {
      expect(percentageOf(699, 1000)).toBe(69); // 69.9%, not 70
      expect(percentageOf(1, 3)).toBe(33);
    });

    it('a zero or negative denominator is 0%, never a division by zero', () => {
      expect(percentageOf(5, 0)).toBe(0);
      expect(percentageOf(5, -1)).toBe(0);
      expect(percentageOf()).toBe(0);
    });

    it('caps nothing — an over-100% ratio is reported as-is', () => {
      expect(percentageOf(150, 100)).toBe(150);
    });
  });

  describe('barColor', () => {
    it('uses >= at both edges, so each threshold owns its band', () => {
      expect(barColor(BAR_GREEN_PCT)).toBe(BAR_GREEN);
      expect(barColor(BAR_GREEN_PCT - 1)).toBe(BAR_AMBER);
      expect(barColor(BAR_AMBER_PCT)).toBe(BAR_AMBER);
      expect(barColor(BAR_AMBER_PCT - 1)).toBe(BAR_RED);
    });

    it('pins the 70 / 55 bands', () => {
      expect([BAR_GREEN_PCT, BAR_AMBER_PCT]).toEqual([70, 55]);
    });

    it('DEFECT (pinned): the FLOOR in percentageOf() drops a 69.9% bar into RED, not green', () => {
      // 69.9% is a hair off target; it renders in the same colour as 20%. The rounding choice and the
      // colour band interact, so the two are asserted together on purpose.
      expect(barColor(percentageOf(699, 1000))).toBe(BAR_AMBER);
      expect(barColor(percentageOf(549, 1000))).toBe(BAR_RED);
    });

    it('maps a whole series', () => {
      expect(barColors([90, 60, 10])).toEqual([BAR_GREEN, BAR_AMBER, BAR_RED]);
    });
  });

  // ===============================================================================================
  // Person rows and leaderboards
  // ===============================================================================================
  describe('matchesSaleTypeFilter', () => {
    it('passes a person with at least one sale in any selected type', () => {
      expect(matchesSaleTypeFilter({ grossCount: 0, assuredCount: 2 }, 'grossCount,assuredCount')).toBe(true);
      expect(matchesSaleTypeFilter({ grossCount: 0, assuredCount: 0 }, 'grossCount,assuredCount')).toBe(false);
    });

    it('DEFECT (pinned): clearing every chip EMPTIES the table instead of showing everyone', () => {
      // ''.split(',') is [''] — length 1, so the `return true` fallback is unreachable and the
      // predicate instead tests person[''] > 0, which is always false.
      expect(matchesSaleTypeFilter({ grossCount: 99 }, '')).toBe(false);
    });
  });

  describe('hasAnyPositiveMetric', () => {
    it('keeps a person with at least one positive metric', () => {
      expect(hasAnyPositiveMetric({ person: 'Asha', grossCount: 0, assuredCount: 3 })).toBe(true);
    });

    it('drops an all-zero person and drops Unknown outright', () => {
      expect(hasAnyPositiveMetric({ person: 'Asha', grossCount: 0, assuredCount: 0 })).toBe(false);
      expect(hasAnyPositiveMetric({ person: UNKNOWN_PERSON, grossCount: 9 })).toBe(false);
    });

    it('DEFECT (pinned): the scan SKIPS the first property, whatever it is', () => {
      // The loop starts at index 1 assuming `person` is always first. Build the object the other way
      // round and the only non-zero metric is skipped — the person vanishes from the table.
      expect(hasAnyPositiveMetric({ grossCount: 9, person: 'Asha' })).toBe(false);
      expect(hasAnyPositiveMetric({ person: 'Asha', grossCount: 9 })).toBe(true);
    });
  });

  describe('topPerformers / topPairs', () => {
    const people = [
      { person: 'A', assured: 3 },
      { person: TEAM_ROW, assured: 999 },
      { person: 'B', assured: 7 },
      { person: 'C', assured: 5 },
      { person: 'D', assured: 1 },
      { person: 'E', assured: 4 },
      { person: 'F', assured: 6 },
    ];

    it('drops the synthetic Team row before ranking', () => {
      expect(topPerformers(people).map((p) => p.person)).not.toContain(TEAM_ROW);
    });

    it('returns the top FIVE, descending by assured', () => {
      expect(topPerformers(people).map((p) => p.person)).toEqual(['B', 'F', 'C', 'E', 'A']);
      expect(TOP_N).toBe(5);
    });

    it('does not mutate the caller\'s array order', () => {
      const input = [...people];
      topPerformers(input);
      expect(input.map((p) => p.person)).toEqual(people.map((p) => p.person));
    });

    it('a pair is dropped when EITHER side is the Team row', () => {
      const pairs = [
        { preSalesPerson: 'A', salesPerson: TEAM_ROW, assured: 9 },
        { preSalesPerson: TEAM_ROW, salesPerson: 'B', assured: 8 },
        { preSalesPerson: 'A', salesPerson: 'B', assured: 2 },
      ];
      expect(topPairs(pairs).length).toBe(1);
      expect(topPairs(pairs)[0].assured).toBe(2);
    });
  });

  describe('pairAvatar / chunk', () => {
    it('renders the two initials', () => {
      expect(pairAvatar({ preSalesPerson: 'Asha', salesPerson: 'Bilal' })).toBe('A x B');
    });

    it('DEFECT (pinned): a blank side renders the literal text "undefined"', () => {
      expect(pairAvatar({ preSalesPerson: '', salesPerson: 'Bilal' })).toBe('undefined x B');
    });

    it('pages the pair grid, keeping a trailing partial page', () => {
      expect(PAIR_CHUNK_SIZE).toBe(8);
      const items = Array.from({ length: 10 }, (_, i) => i);
      expect(chunk(items).length).toBe(2);
      expect(chunk(items)[1]).toEqual([8, 9]);
      expect(chunk([])).toEqual([]);
    });
  });

  // ===============================================================================================
  // Row highlighting and status buckets
  // ===============================================================================================
  describe('rowHighlightClass', () => {
    it('highlights a pending sale and an approved+assured sale on the sales tables', () => {
      expect(rowHighlightClass('grossSales', { status: 'pending' })).toBe('pending-highlight');
      expect(rowHighlightClass('grossSales', { status: 'Approved', paymentplan: 'P1' })).toBe('assured-highlight');
    });

    it('applies the same rules to the cancelled and downgrade sales tables', () => {
      expect(rowHighlightClass('grossCancelledSales', { status: null })).toBe('pending-highlight');
      expect(rowHighlightClass('grossDowngradeSales', { status: null })).toBe('pending-highlight');
    });

    it('highlights participants by customer status, grouping late with discontinued', () => {
      expect(rowHighlightClass('overallParticipants', { customerstatus: 'Active' })).toBe('active-highlight');
      expect(rowHighlightClass('overallParticipants', { customerstatus: 'non active' })).toBe('non-active-highlight');
      expect(rowHighlightClass('overallParticipants', { customerstatus: 'late' })).toBe('discontinued-highlight');
      expect(rowHighlightClass('overallParticipants', { customerstatus: 'banned' })).toBe('discontinued-highlight');
    });

    it('gives an unknown table type or status no class at all', () => {
      expect(rowHighlightClass('somethingElse', { status: 'pending' })).toBe('');
      expect(rowHighlightClass('overallParticipants', { customerstatus: 'paused' })).toBe('');
    });

    it('DEFECT (pinned): approved-but-NOT-assured gets no highlight at all', () => {
      // That is exactly the state the "not assured" tile counts and the floor is meant to chase, yet
      // on screen the row is indistinguishable from an unhighlighted one.
      expect(rowHighlightClass('grossSales', { status: 'approved', paymentplan: null })).toBe('');
      expect(isNotAssuredSale({ status: 'approved', paymentplan: null })).toBe(true);
    });
  });

  describe('isPendingSale / isNotAssuredSale / customerStatusBucket', () => {
    it('pending covers every undecided shape, case-insensitively', () => {
      expect(isPendingSale({ status: 'PENDING' })).toBe(true);
      expect(isPendingSale({})).toBe(true); // undefined status
      expect(isPendingSale({ status: 'approved' })).toBe(false);
    });

    it('not-assured requires approval AND no plan', () => {
      expect(isNotAssuredSale({ status: 'approved', paymentplan: '' })).toBe(true);
      expect(isNotAssuredSale({ status: 'pending', paymentplan: '' })).toBe(false);
      expect(isNotAssuredSale({ status: 'approved', paymentplan: 'P1' })).toBe(false);
    });

    it('pins that a LATE customer is bucketed as discontinued, not active', () => {
      expect(Array.from(DISCONTINUED_STATUSES)).toEqual(['discontinued', 'banned', 'late']);
      expect(customerStatusBucket('late')).toBe('discontinued');
      expect(customerStatusBucket('Active')).toBe('active');
      expect(customerStatusBucket(undefined)).toBeNull();
    });
  });

  // ===============================================================================================
  // Cell formatting
  // ===============================================================================================
  describe('formatIndianCurrency / formatNumberCell / formatCurrencyCell', () => {
    it('renders a real ZERO, and only a missing value as a dash', () => {
      expect(formatIndianCurrency(0)).toBe('0');
      expect(formatIndianCurrency(null as any)).toBe('-');
      expect(formatNumberCell(0)).toBe('0');
      expect(formatNumberCell(undefined)).toBe('-');
    });

    it('prefixes the currency symbol, defaulting to the rupee', () => {
      expect(formatCurrencyCell(1000).startsWith('₹')).toBe(true);
      expect(formatCurrencyCell(1000, '$').startsWith('$')).toBe(true);
    });

    it('wraps a number cell in its prefix and suffix', () => {
      expect(formatNumberCell(5, '~', ' units')).toBe('~5 units');
    });

    it('DEFECT (pinned): a corrupt NaN amount renders as "-", same as a missing one', () => {
      // !NaN is true and NaN !== 0, so it takes the "absent" branch. A broken figure and an
      // unrecorded one look identical in the table and in the export.
      expect(formatCurrencyCell(NaN)).toBe('-');
      expect(formatNumberCell(NaN)).toBe('-');
    });
  });

  describe('mapCellValue', () => {
    const map = { j1: { name: 'Ecosystem' }, j2: 'DFU' };

    it('looks a raw value up in the dictionary', () => {
      expect(mapCellValue('j2', map)).toBe('DFU');
      expect(mapCellValue('j1', map, undefined, 'name')).toBe('Ecosystem');
    });

    it('reads a property off the row before the lookup', () => {
      expect(mapCellValue({ id: 'j2' }, map, 'id')).toBe('DFU');
    });

    it('supports the indexed "[0].prop" path used for array-backed rows', () => {
      expect(mapCellValue([{ id: 'j2' }], map, '[0].id')).toBe('DFU');
      expect(mapCellValue(['j2'], map, '[0]')).toBe('DFU');
    });

    it('falls back to the raw value\'s toString() — NOT to a dash', () => {
      // The product-initiation dashboard's otherwise-identical copy falls back to '-'. The two were
      // already different before extraction; this pins which one is which.
      expect(mapCellValue('unmapped', map)).toBe('unmapped');
      expect(mapCellValue('anything', undefined)).toBe('anything');
    });
  });

  describe('lastNoteText / formatTextCell / cellValueOrDash', () => {
    it('takes the LAST note in the list', () => {
      expect(lastNoteText([{ note: 'first' }, { note: 'latest' }])).toBe('latest');
      expect(lastNoteText([])).toBe('-');
      expect(lastNoteText(undefined)).toBe('-');
    });

    it('DEFECT (pinned): a blank note, and a note stored as a bare string, both read as "-"', () => {
      expect(lastNoteText([{ note: '' }])).toBe('-');
      expect(lastNoteText(['a plain string note'])).toBe('-');
    });

    it('truncates a text cell only when an END is given — a lone start is ignored', () => {
      expect(formatTextCell('ABCDEFGH', 0, 3)).toBe('ABC');
      expect(formatTextCell('ABCDEFGH', 2, undefined)).toBe('ABCDEFGH');
    });

    it('DEFECT (pinned): cellValueOrDash renders a real ZERO as an empty dash', () => {
      // `row[key] || '-'` — a legitimate count of 0 is indistinguishable from no data.
      expect(cellValueOrDash({ n: 0 }, 'n')).toBe('-');
      expect(cellValueOrDash({ n: 5 }, 'n')).toBe(5 as any);
    });
  });

  // ===============================================================================================
  // Sorting
  // ===============================================================================================
  describe('nextSortState', () => {
    it('cycles asc -> desc -> OFF on the same column', () => {
      let state = nextSortState({ sortColumn: null, sortDirection: null }, 'name');
      expect(state).toEqual({ sortColumn: 'name', sortDirection: 'asc' });
      state = nextSortState(state, 'name');
      expect(state).toEqual({ sortColumn: 'name', sortDirection: 'desc' });
      state = nextSortState(state, 'name');
      expect(state).toEqual({ sortColumn: null, sortDirection: null });
    });

    it('always restarts a DIFFERENT column at ascending', () => {
      expect(nextSortState({ sortColumn: 'name', sortDirection: 'desc' }, 'date'))
        .toEqual({ sortColumn: 'date', sortDirection: 'asc' });
    });
  });

  describe('compareCellValues', () => {
    it('compares two numbers numerically, not as text', () => {
      expect(compareCellValues(9, 100, 'asc')).toBeLessThan(0);
      expect(compareCellValues('9', '100', 'asc')).toBeLessThan(0);
    });

    it('reverses for descending', () => {
      expect(compareCellValues(9, 100, 'desc')).toBeGreaterThan(0);
    });

    it('sorts nulls to the END in ascending order', () => {
      expect(compareCellValues(null, 'a', 'asc')).toBe(1);
      expect(compareCellValues('a', null, 'asc')).toBe(-1);
      expect(compareCellValues(null, null, 'asc')).toBe(0);
    });

    it('compares date-like strings chronologically', () => {
      expect(compareCellValues('2026-01-01', '2026-02-01', 'asc')).toBeLessThan(0);
    });

    it('falls back to a locale text compare', () => {
      expect(compareCellValues('apple', 'banana', 'asc')).toBeLessThan(0);
    });

    it('DEFECT (pinned): an EMPTY STRING is treated as the number 0 and sorts ahead of every word', () => {
      // !isNaN('') is true. A text column with any genuinely empty cell takes the numeric branch.
      expect(compareCellValues('', '5', 'asc')).toBeLessThan(0);
    });
  });

  describe('isDateLike / sortIcon / isSortable / column flags', () => {
    it('accepts Dates and parseable strings', () => {
      expect(isDateLike(new Date())).toBe(true);
      expect(isDateLike('2026-01-01')).toBe(true);
      expect(isDateLike('not a date')).toBe(false);
      expect(isDateLike(12345)).toBe(false);
    });

    it('DEFECT (pinned): a bare year string parses as a date', () => {
      // Date.parse('2000') is the year 2000, so a numeric-looking text column can sort chronologically.
      expect(isDateLike('2000')).toBe(true);
    });

    it('shows the neutral glyph on an unsorted column', () => {
      expect(sortIcon({ sortColumn: null, sortDirection: null }, 'name')).toBe('⇅');
      expect(sortIcon({ sortColumn: 'name', sortDirection: 'asc' }, 'name')).toBe('↑');
      expect(sortIcon({ sortColumn: 'name', sortDirection: 'desc' }, 'name')).toBe('↓');
    });

    it('columns are sortable unless explicitly opted out with false', () => {
      expect(isSortable({})).toBe(true);
      expect(isSortable({ sortable: true })).toBe(true);
      expect(isSortable({ sortable: false })).toBe(false);
    });

    it('pins the highlighted and badge column lists', () => {
      expect(shouldHighlightCell('name')).toBe(true);
      expect(shouldHighlightCell('journey')).toBe(false);
      expect(isBadgeColumn('journey')).toBe(true);
      expect(isBadgeColumn('name')).toBe(false);
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
  // Date windows
  // ===============================================================================================
  describe('dayBounds / monthBounds / isWithinRange', () => {
    it('snaps the reporting window to whole days without mutating the inputs', () => {
      const start = new Date(2026, 8, 1, 14, 0);
      const end = new Date(2026, 8, 30, 9, 0);
      const snapshot = [start.getTime(), end.getTime()];
      const [a, b] = dayBounds(start, end);
      expect(a.getHours()).toBe(0);
      expect(b.getHours()).toBe(23);
      expect(b.getMilliseconds()).toBe(999);
      expect([start.getTime(), end.getTime()]).toEqual(snapshot);
    });

    it('spans a whole calendar month, leap years included', () => {
      expect(monthBounds(new Date(2026, 1, 14)).end.getDate()).toBe(28);
      expect(monthBounds(new Date(2028, 1, 14)).end.getDate()).toBe(29);
    });

    it('is inclusive at both ends and never true for an absent date', () => {
      const start = new Date(2026, 8, 1);
      const end = new Date(2026, 8, 30);
      expect(isWithinRange(start, start, end)).toBe(true);
      expect(isWithinRange(end, start, end)).toBe(true);
      expect(isWithinRange(new Date(2026, 9, 1), start, end)).toBe(false);
      expect(isWithinRange(undefined, start, end)).toBe(false);
    });
  });

  describe('assuredFilterCutoff', () => {
    it('walks back 7 days for last7days, snapped to midnight', () => {
      const d = assuredFilterCutoff('last7days', NOW);
      expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([8, 3, 0]);
    });

    it('DEFECT (pinned): ANY other value — including a typo — silently means 30 days', () => {
      // There is no validation and no default branch, so a mistyped filter key quietly widens the
      // window to a month instead of failing.
      expect(assuredFilterCutoff('last30days', NOW).getDate()).toBe(11);
      expect(assuredFilterCutoff('last7day', NOW).getDate()).toBe(11);
      expect(assuredFilterCutoff('', NOW).getDate()).toBe(11);
    });
  });

  describe('trendsStartMonth', () => {
    it('walks back the requested number of months', () => {
      expect(trendsStartMonth(3, new Date(2026, 8, 10))).toEqual({ month: 5, year: 2026 });
    });

    it('rolls back across a year boundary', () => {
      expect(trendsStartMonth(12, new Date(2026, 8, 10))).toEqual({ month: 8, year: 2025 });
    });

    it('DEFECT (pinned): on a long day-of-month it can OVERSHOOT into the following month', () => {
      // setMonth() keeps the day-of-month, so 31 March minus 1 month is "31 February" = 3 March. The
      // trends chart then starts a month later than the user asked for.
      expect(trendsStartMonth(1, new Date(2026, 2, 31)).month).toBe(2); // March, not February
    });
  });

  // ===============================================================================================
  // Carousel maths
  // ===============================================================================================
  describe('slider', () => {
    const state = (over: Partial<ReturnType<typeof initSlider>> = {}) => ({ ...initSlider(), ...over });

    it('starts on page 0 with a sensible default width', () => {
      expect(initSlider().currentPage).toBe(0);
      expect(initSlider().outerWidth).toBe(300);
    });

    it('translates by whole pages while at rest', () => {
      expect(sliderTransform(state({ currentPage: 2 }))).toBe('translateX(-200%)');
    });

    it('follows the finger while dragging, clamped to the real page range', () => {
      const dragging = state({ isDragging: true, currentPage: 0, dragDelta: 150, outerWidth: 300, totalCount: 3 });
      expect(sliderTransform(dragging)).toBe('translateX(-0%)'); // clamped at the front
      const dragging2 = state({ isDragging: true, currentPage: 2, dragDelta: -300, outerWidth: 300, totalCount: 3 });
      expect(sliderTransform(dragging2)).toBe('translateX(-200%)'); // clamped at the back
    });

    it('commits a page only past the 60px threshold', () => {
      expect(DRAG_THRESHOLD_PX).toBe(60);
      expect(settleSliderPage({ currentPage: 1, dragDelta: -61, totalCount: 5 })).toBe(2);
      expect(settleSliderPage({ currentPage: 1, dragDelta: -60, totalCount: 5 })).toBe(1); // exactly 60 snaps back
      expect(settleSliderPage({ currentPage: 1, dragDelta: 61, totalCount: 5 })).toBe(0);
    });

    it('never goes below 0 or past the carousel cap', () => {
      expect(MAX_SLIDES).toBe(5);
      expect(settleSliderPage({ currentPage: 0, dragDelta: 500, totalCount: 5 })).toBe(0);
      expect(clampSliderPage(99, 20)).toBe(MAX_SLIDES - 1);
      expect(clampSliderPage(99, 2)).toBe(1); // fewer real slides than the cap
      expect(clampSliderPage(-3, 5)).toBe(0);
    });

    it('DEFECT (pinned): an EMPTY carousel clamps to page 0 even though there is nothing to show', () => {
      // min(maxSlides-1, page, -1) is -1, then max(0, -1) is 0 — so the track renders page 0 of zero.
      expect(clampSliderPage(0, 0)).toBe(0);
    });

    it('goTo clamps into the requested range, defaulting to unbounded', () => {
      expect(sliderGoToPage(3, 3)).toBe(2);
      expect(sliderGoToPage(-1, 3)).toBe(0);
      expect(sliderGoToPage(50)).toBe(50);
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
