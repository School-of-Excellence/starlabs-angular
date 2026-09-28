/**
 * Sales Dashboard Rules Engine (pure, dependency-free).
 *
 * The arithmetic and the decisions behind the Sales Dashboard: which sales leads count at all and
 * which are test data, whether a sale is "assured", which pot (gross / assured / cancelled /
 * downgrade) a sale falls into and at which value, the conversion percentages and the colour they are
 * drawn in, the top-five performer leaderboards, the money and cell formatting in every table, the
 * table's sort/filter/pagination behaviour, and the carousel maths behind the performer sliders.
 *
 * Extracted from SalesDashboardCloneComponent (4,867 lines) on 2026-09-10, following the pattern
 * already set by ../delivery-dashboard-clone/delivery-dashboard.engine.ts and priority.engine.ts in
 * ../journey-coach-health-dashboard. The logic is UNCHANGED — same thresholds, same comparison
 * operators, same rounding (Math.floor, not round), same strings, same quirks. Only its location
 * moved. Several oddities (documented as DEFECT notes below) were deliberately left intact and pinned
 * by tests rather than fixed, because this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO Chart.js, NO DOM. Every function takes its inputs as
 *   arguments and returns a value, so the rules can be exercised offline instead of standing up a
 *   4,867-line component that injects Firestore, a Router, a DatePipe, a MatDialog and nine
 *   MatTableDataSources, and wires up eleven charts before it computes anything.
 * - As methods on that component the rules were only reachable through a rendered template or a
 *   rendered chart. An e2e case could assert that a bar was green — it could not tell a 70% threshold
 *   from a 71% one, so a shifted boundary passed silently.
 * - These are money decisions. Which sale counts as assured, whether a cancellation is netted off the
 *   month it belongs to or the month it was recorded in, and who tops the leaderboard all feed
 *   commission conversations. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, walks `this.originalData` / `this.salesLeadsMap()`, resolves
 *   cancellation or downgrade source documents, mutates the metric accumulator, drives a chart, opens
 *   a dialog or exports Excel. Where a method mixed both, only the pure core moved and the component
 *   still does its own gathering — see calculateDashboardMetricForSale(), which still accumulates into
 *   its Maps and only asks the engine the questions (assured? which value key? is this a movement?).
 *
 * Thresholds are exported as named constants and, where a caller had its own copy, are injectable so
 * a test can pin a boundary without rewriting a constant. `now` is an optional last parameter
 * defaulting to `new Date()` — exactly what the component did — so tests can freeze the clock.
 */

// =================================================================================================
// Thresholds and reference data — the component's own inline values, kept as the defaults.
// =================================================================================================

/** getBarColors() bands (sales-dashboard-clone.component.ts:968). Percentages, `>=`. */
export const BAR_GREEN_PCT = 70;
export const BAR_AMBER_PCT = 55;
export const BAR_GREEN = '#22C55E';
export const BAR_AMBER = '#B45309';
export const BAR_RED = '#EF4444';

/** The carousel shows at most this many pages, however many performers exist (MAX_SLIDES, line 414). */
export const MAX_SLIDES = 5;

/** Pixels of drag before the carousel commits to the next page (settle(), line 4776). */
export const DRAG_THRESHOLD_PX = 60;

/** Leaderboards are top FIVE (calculateTopFive*, lines 4434-4470). */
export const TOP_N = 5;

/** The pair-performance grid is chunked into pages of this many (getTopPairPerformance, line 4494). */
export const PAIR_CHUNK_SIZE = 8;

/** The synthetic aggregate row that must never appear on a leaderboard. */
export const TEAM_ROW = 'Team';

/** Fallback when a sale has no named person. Counts as a real person everywhere except leaderboards. */
export const UNKNOWN_PERSON = 'Unknown';

/** The journey whose sales are excluded from the dashboard entirely (line 3541). */
export const EXCLUDED_JOURNEY_ID = 'InLXMl7OBAqlDTZcXwK0';

/** The journey whose internal/test purchases are stripped by email domain (line 3535). */
export const TEST_DATA_JOURNEY_ID = 'RXvsMYoK0g4SstvDDURZ';
export const TEST_DATA_EMAIL_DOMAIN = 'soexcellence.com';

/** Sale types that are a MOVEMENT off a previous sale rather than a new sale (line 4128). */
export const MOVEMENT_TYPES: readonly string[] = ['cancelled', 'downgradetoold', 'downgradetonew'];

/** Sale types that count toward a person's gross tally outright (line 4219). */
export const COUNTING_TYPES: readonly string[] = ['new', 'addons', 'upgrade'];

/** Status values that all mean "not decided yet" (lines 4141, 3185). */
export const PENDING_STATUSES: readonly any[] = [null, undefined, '', 'pending'];

/** Customer statuses that all render as "discontinued" (line 3229). */
export const DISCONTINUED_STATUSES: readonly string[] = ['discontinued', 'banned', 'late'];

/** Columns rendered with emphasis / as a badge (lines 3234, 3240). */
export const HIGHLIGHT_COLUMNS: readonly string[] = ['name', 'contractId', 'category'];
export const BADGE_COLUMNS: readonly string[] = ['journey', 'paymentStatus'];

// =================================================================================================
// Which sales count at all
// =================================================================================================

/** The subset of a sales-lead document the inclusion rules read. */
export interface SalesLeadFilterInput {
  journey?: any;
  email?: any;
  status?: any;
}

/**
 * Is this row internal test data that must never reach the dashboard?
 *
 * BOTH conditions must hold: the specific test journey AND an @soexcellence.com email. A real
 * customer on that journey is kept, and a colleague buying on a different journey is also kept.
 *
 * DEFECT (pinned, not fixed): the email test is `includes('soexcellence.com')`, a substring anywhere
 * in the address — so a genuine customer at "notsoexcellence.com" is silently deleted from the month's
 * numbers. It also only guards ONE journey, so the same staff purchase on any other journey is
 * counted as revenue.
 */
export function isTestDataSale(sale: SalesLeadFilterInput): boolean {
  return sale.journey === TEST_DATA_JOURNEY_ID
    && !!sale.email?.toLowerCase().includes(TEST_DATA_EMAIL_DOMAIN);
}

/**
 * Is this sale skipped outright — the excluded journey, or a rejected lead?
 * Status matching is case-insensitive; journey matching is an exact id comparison.
 */
export function isExcludedSale(sale: SalesLeadFilterInput): boolean {
  return sale.journey === EXCLUDED_JOURNEY_ID || sale.status?.toLowerCase() === 'rejected';
}

/** The filter state a sale is tested against. Empty arrays / '' mean "not filtering on this". */
export interface SaleFilterCriteria {
  selectedFilter: any;
  selectedJourney: any[];
  selectedPreSalesPerson: any[];
  selectedSalesPerson: any[];
}

/**
 * Does a sale survive the dashboard's journey / pre-sales / sales filters?
 *
 * DEFECT (pinned, not fixed): the journey clause is
 *   `(selectedFilter is set OR selectedJourney is non-empty) AND !selectedJourney.includes(journey)`
 * so clicking a JOURNEY-GROUP tile (ecosystem / dfu / gifts, which sets selectedFilter) while
 * selectedJourney is still EMPTY makes the condition true for every sale — and every sale is
 * therefore rejected. The group tiles only work because the component happens to populate
 * selectedJourney at the same time; if it ever stops doing so the dashboard silently reads zero.
 */
export function matchesSaleFilters(sale: any, criteria: SaleFilterCriteria): boolean {
  const saleJourney = sale['journey'];
  const preSalesPerson = sale['presalespersonname'] || UNKNOWN_PERSON;
  const salesPerson = sale['salespersonname'] || UNKNOWN_PERSON;

  const journeyCondition = (![null, undefined, ''].includes(criteria.selectedFilter)
    || criteria.selectedJourney.length > 0)
    && !criteria.selectedJourney.includes(saleJourney);

  const preSalesPersonCondition = criteria.selectedPreSalesPerson.length > 0
    && !criteria.selectedPreSalesPerson.includes(preSalesPerson);
  const salesPersonCondition = criteria.selectedSalesPerson.length > 0
    && !criteria.selectedSalesPerson.includes(salesPerson);

  return !(journeyCondition || preSalesPersonCondition || salesPersonCondition);
}

// =================================================================================================
// Sale classification — assured, movement, and which money column to read
// =================================================================================================

/**
 * Which field on the sale carries the money for this row.
 *
 * A cancellation is worth the BALANCE that was written off, not the original purchase value; anything
 * else is worth its full purchase value. Only the literal type 'cancelled' switches — a downgrade
 * still reads totalpurchasevalue.
 */
export function saleValueKey(type: any): 'balanceamount' | 'totalpurchasevalue' {
  return type === 'cancelled' ? 'balanceamount' : 'totalpurchasevalue';
}

/**
 * Is this sale "assured"? Assured means a payment plan exists.
 *
 * DEFECT (pinned, not fixed): the test is only against null / undefined / '', so a payment plan
 * recorded as the number 0 or the string 'none' counts as assured. Assured drives the headline
 * conversion number the sales floor is measured on.
 */
export function isAssuredSale(paymentplan: any): boolean {
  return ![null, undefined, ''].includes(paymentplan);
}

/** Status counts as undecided — no decision has been recorded yet. Case-insensitive via the caller. */
export function isPendingStatus(status: any, pending: readonly any[] = PENDING_STATUSES): boolean {
  return pending.includes(status);
}

/** Is this a movement off an earlier sale (cancellation or downgrade) rather than a new sale? */
export function isMovementType(type: any, types: readonly string[] = MOVEMENT_TYPES): boolean {
  return types.includes(type);
}

/** Does this sale type add to a person's gross tally on its own? */
export function isCountingType(type: any, types: readonly string[] = COUNTING_TYPES): boolean {
  return types.includes(type);
}

/** A person's display name, with the shared fallback so unnamed sales still aggregate somewhere. */
export function personNameOrUnknown(name: any): string {
  return name || UNKNOWN_PERSON;
}

/**
 * The money written off by a cancellation: what was originally bought, minus what the cancellation
 * document says was retained. Both sides default to 0 when absent.
 *
 * DEFECT (pinned, not fixed): there is no floor, so a cancellation whose retained value exceeds the
 * original produces a NEGATIVE balance that is then ADDED into the cancelled total, quietly reducing
 * reported cancellations instead of flagging the inconsistent pair of documents.
 */
export function cancellationBalance(originalPurchaseValue: any, cancelledPurchaseValue: any): number {
  return (originalPurchaseValue ?? 0) - (cancelledPurchaseValue ?? 0);
}

/**
 * Which downgrade bucket a downgrade belongs to.
 *
 * 'downgradetonew' only when the participant actually bought the replacement AND that purchase falls
 * inside the reporting window; otherwise the downgrade is attributed to the OLD product. A
 * replacement bought outside the window therefore reads as a plain loss for this month.
 */
export function downgradeType(
  downgradeToNewPurchase: any,
  purchaseDate: Date | null | undefined,
  start: Date,
  end: Date,
): 'downgradetonew' | 'downgradetoold' {
  if (downgradeToNewPurchase && purchaseDate && purchaseDate >= start && purchaseDate <= end) {
    return 'downgradetonew';
  }
  return 'downgradetoold';
}

// =================================================================================================
// Percentages and chart colours
// =================================================================================================

/**
 * Conversion as a whole percentage.
 *
 * FLOOR, not round — 69.9% draws as 69 and therefore RED, not green. A zero or negative denominator
 * is 0%, not a division by zero.
 */
export function percentageOf(value1: any = 0, value2: any = 0): number {
  return value2 > 0 ? Math.floor((value1 * 100) / value2) : 0;
}

/** One bar's colour from its percentage. Both comparisons are `>=`, so each band owns its edge. */
export function barColor(value: number, greenPct = BAR_GREEN_PCT, amberPct = BAR_AMBER_PCT): string {
  if (value >= greenPct) return BAR_GREEN;
  if (value >= amberPct) return BAR_AMBER;
  return BAR_RED;
}

/** The whole bar series' colours. */
export function barColors(values: number[]): string[] {
  return values.map((value) => barColor(value));
}

// =================================================================================================
// Person rows and leaderboards
// =================================================================================================

/**
 * Does a person row survive the sale-type chips?
 *
 * The chips arrive comma-joined; a person passes if they have at least ONE sale in ANY selected type.
 *
 * DEFECT (pinned, not fixed): ''.split(',') is [''], whose length is 1 and not 0, so the "no chips
 * selected" case never reaches the `return true` fallback — it instead tests `person[''] > 0`, which
 * is undefined > 0, i.e. false. Clearing every chip therefore EMPTIES the person tables rather than
 * showing everyone. (The component avoids this in practice by never sending an empty filter string.)
 */
export function matchesSaleTypeFilter(person: any, selectedSaleTypeFilter: string): boolean {
  const saleTypes = selectedSaleTypeFilter.split(',');
  if (saleTypes.length > 0) {
    return saleTypes.some((key) => person[key] > 0);
  }
  return true;
}

/**
 * Should a person row be shown at all?
 *
 * 'Unknown' is dropped outright, and everyone else needs at least one positive metric — a person with
 * nothing but zeroes is noise.
 *
 * DEFECT (pinned, not fixed): the scan starts at Object.values(person)[1], i.e. it SKIPS the first
 * property, on the assumption that `person` is always the first key. A person object built with its
 * keys in any other order silently loses one metric from the test, so a person whose ONLY non-zero
 * metric happens to sit in that first slot disappears from the table.
 */
export function hasAnyPositiveMetric(person: any): boolean {
  const values: any = Object.values(person);
  if (person?.person !== UNKNOWN_PERSON) {
    for (let i = 1; i < values.length; i++) {
      if (values[i] > 0) return true;
    }
  }
  return false;
}

/** The minimum shape the leaderboards sort on. */
export interface AssuredRanked {
  person?: string;
  preSalesPerson?: string;
  salesPerson?: string;
  /** Typed loosely on purpose: the component's TopPerformer marks this optional, and the original
   *  comparator did plain arithmetic on it — including the NaN a missing value produces. */
  assured?: any;
}

/**
 * The top `n` performers by assured count, with the synthetic 'Team' row removed first.
 *
 * The sort is a plain descending numeric compare and is therefore NOT stable across engines for ties —
 * two people on the same assured count can swap places between renders. That was true before the
 * extraction too.
 */
export function topPerformers<T extends AssuredRanked>(
  people: T[],
  n: number = TOP_N,
  teamRow: string = TEAM_ROW,
): T[] {
  const eligible = people.filter((p) => p.person !== teamRow);
  const sorted = [...eligible].sort((a, b) => b.assured - a.assured);
  return sorted.slice(0, n);
}

/** The same, for pairs: a pair is dropped if EITHER side is the synthetic Team row. */
export function topPairs<T extends AssuredRanked>(
  pairs: T[],
  n: number = TOP_N,
  teamRow: string = TEAM_ROW,
): T[] {
  const eligible = pairs.filter((p) => ![p.preSalesPerson, p.salesPerson].includes(teamRow));
  const sorted = [...eligible].sort((a, b) => b.assured - a.assured);
  return sorted.slice(0, n);
}

/**
 * The pair avatar, e.g. "A x B".
 *
 * DEFECT (pinned, not fixed): `.at(0)` on an empty name is undefined, so a pair with a blank side
 * renders the literal text "undefined x B" in the UI.
 */
export function pairAvatar(pair: { preSalesPerson?: any; salesPerson?: any }): string {
  return `${pair.preSalesPerson.at(0)} x ${pair.salesPerson.at(0)}`;
}

/** Split a list into fixed-size pages. A trailing partial page is kept, and [] gives []. */
export function chunk<T>(items: T[], size: number = PAIR_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// =================================================================================================
// Row highlighting and status counts
// =================================================================================================

/** What the row-highlight rule reads. */
export interface HighlightRowInput {
  status?: any;
  paymentplan?: any;
  customerstatus?: any;
}

/**
 * The CSS class for one table row.
 *
 * Sales tables highlight by decision state (pending / assured); the participants table highlights by
 * customer status. Anything unrecognised — including a table type with no rule — gets no class.
 *
 * DEFECT (pinned, not fixed): an APPROVED sale with no payment plan gets NO highlight at all, so on
 * screen it is indistinguishable from a row in an unhighlighted table — even though "approved but not
 * assured" is exactly the state the not-assured tile counts and the floor is meant to chase.
 */
export function rowHighlightClass(tableType: string, row: HighlightRowInput): string {
  if (tableType === 'grossSales' || tableType === 'grossDowngradeSales' || tableType === 'grossCancelledSales') {
    if (PENDING_STATUSES.includes(row['status']?.toLowerCase())) {
      return 'pending-highlight';
    } else if (row['status']?.toLowerCase() === 'approved' && isAssuredSale(row['paymentplan'])) {
      return 'assured-highlight';
    } else {
      return '';
    }
  }
  if (tableType === 'overallParticipants') {
    const customerStatus = row['customerstatus']?.toLowerCase();
    if (customerStatus === 'active') return 'active-highlight';
    if (customerStatus === 'non active') return 'non-active-highlight';
    if (DISCONTINUED_STATUSES.includes(customerStatus)) return 'discontinued-highlight';
  }
  return '';
}

/** A sale still awaiting a decision. */
export function isPendingSale(row: HighlightRowInput): boolean {
  return PENDING_STATUSES.includes(row['status']?.toLowerCase());
}

/** Approved but with no payment plan — the "not assured" tile. */
export function isNotAssuredSale(row: HighlightRowInput): boolean {
  return !isAssuredSale(row['paymentplan']) && row['status']?.toLowerCase() === 'approved';
}

/**
 * The customer-status bucket a participant row falls into, or null.
 * Note 'late' is grouped with discontinued here — a participant behind on payments is counted as gone.
 */
export function customerStatusBucket(customerstatus: any): 'active' | 'non active' | 'discontinued' | null {
  const s = customerstatus?.toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'non active') return 'non active';
  if (DISCONTINUED_STATUSES.includes(s)) return 'discontinued';
  return null;
}

// =================================================================================================
// Cell formatting
// =================================================================================================

/**
 * A bare number in Indian digit grouping (1,23,456) with no symbol and no decimals.
 * An absent value is '-', but a real 0 is formatted as "0".
 */
export function formatIndianCurrency(value: number): string {
  if (!value && value !== 0) return '-';
  return value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * A currency cell: symbol + Indian grouping, up to 2 decimals.
 *
 * DEFECT (pinned, not fixed): `!value && value !== 0` treats NaN as absent and renders '-', so a
 * corrupt amount is indistinguishable from a missing one. The `mapValue` indirection also reassigns
 * `value` to a property of itself, which yields undefined and then '-' if that property is missing —
 * a silent blank rather than an error.
 */
export function formatCurrencyCell(value: any, prefix?: string, mapValue?: string): string {
  if (!value && value !== 0) return '-';
  if (mapValue) {
    value = value[mapValue];
  }
  const symbol = prefix || '₹';
  const formatted = value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** A plain number cell with optional prefix/suffix. Absent is '-'; 0 formats as "0". */
export function formatNumberCell(value: any, prefix?: string, suffix?: string): string {
  if (!value && value !== 0) return '-';
  const formatted = value.toLocaleString('en-IN');
  return `${prefix || ''}${formatted}${suffix || ''}`;
}

/**
 * A mapped cell: look the raw value up in a dictionary and optionally read one property off the hit.
 *
 * `mapKey` may be a plain property name, or an indexed path like "[0].name" meaning "element 0, then
 * .name" — used for rows whose key is buried in an array.
 *
 * NOTE the fallback: an unmapped value falls back to its own `toString()` on THIS dashboard (the
 * product-initiation dashboard's otherwise-identical copy falls back to '-' instead). The two were
 * already different before extraction and are kept different on purpose.
 */
export function mapCellValue(
  value: any,
  mapData?: { [key: string]: any },
  mapKey?: string,
  mapValue?: string,
): string {
  if (!mapData) return value.toString();
  let tempMap: any = '';

  if (mapKey) {
    if (mapKey.startsWith('[')) {
      const match = mapKey.match(/\[(\d+)\]\.?(.*)$/);
      if (match) {
        const index = parseInt(match[1]);
        const property = match[2];
        tempMap = value?.[index];
        if (property) {
          tempMap = tempMap?.[property];
        }
      }
    } else {
      tempMap = value?.[mapKey];
    }
  } else {
    tempMap = value;
  }

  tempMap = mapValue ? mapData[tempMap]?.[mapValue] : mapData[tempMap];
  return tempMap || value.toString();
}

/**
 * The most recent note's text.
 *
 * DEFECT (pinned, not fixed): the guard requires the last entry to be an object with a truthy `note`,
 * so a blank note — and a note stored as a plain string rather than an object — both render '-',
 * indistinguishable from "nobody wrote anything".
 */
export function lastNoteText(value: any): string {
  if (Array.isArray(value) && value.length > 0) {
    const lastNote = value[value.length - 1];
    if (lastNote && typeof lastNote === 'object' && lastNote.note) {
      return lastNote.note;
    }
  }
  return '-';
}

/**
 * A text cell, optionally truncated to a substring window.
 * Only `substringEnd` gates the truncation, so a start with no end is IGNORED and the full text shows.
 */
export function formatTextCell(value: any, substringStart?: number, substringEnd?: number): string {
  const stringValue = value.toString();
  return substringEnd ? stringValue.substring(substringStart as number, substringEnd) : stringValue;
}

/** The raw cell value with the table's universal empty-cell placeholder. A real 0 also reads '-'. */
export function cellValueOrDash(row: any, key: string): string {
  return row[key] || '-';
}

// =================================================================================================
// Sorting
// =================================================================================================

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  sortColumn: string | null;
  sortDirection: SortDirection;
}

/**
 * The next state of the tri-state sort when a header is clicked.
 *
 * asc → desc → OFF (which restores the unsorted order) → asc. Clicking a DIFFERENT column always
 * starts that column at asc rather than inheriting the previous direction.
 */
export function nextSortState(current: SortState, columnKey: string): SortState {
  if (current.sortColumn === columnKey) {
    if (current.sortDirection === 'asc') return { sortColumn: columnKey, sortDirection: 'desc' };
    if (current.sortDirection === 'desc') return { sortColumn: null, sortDirection: null };
  }
  return { sortColumn: columnKey, sortDirection: 'asc' };
}

/**
 * Compare two already-extracted cell values.
 *
 * Precedence: both numeric → numeric compare; both date-like → chronological; otherwise
 * localeCompare. Nulls sort to the END in ascending order.
 *
 * DEFECT (pinned, not fixed): `!isNaN(value)` is true for the EMPTY STRING and for whitespace, so a
 * column of text with any blank cells takes the numeric branch and every blank sorts as 0 — ahead of
 * every real word. Because the cells come from cellValueOrDash(), an empty cell is actually '-',
 * which is not numeric — but a genuinely empty string still trips it.
 */
export function compareCellValues(valueA: any, valueB: any, direction: SortDirection): number {
  if (valueA == null && valueB == null) return 0;
  if (valueA == null) return direction === 'asc' ? 1 : -1;
  if (valueB == null) return direction === 'asc' ? -1 : 1;

  let comparison = 0;
  if (!isNaN(valueA) && !isNaN(valueB)) {
    comparison = Number(valueA) - Number(valueB);
  } else if (isDateLike(valueA) && isDateLike(valueB)) {
    comparison = new Date(valueA).getTime() - new Date(valueB).getTime();
  } else {
    comparison = valueA.toString().localeCompare(valueB.toString());
  }
  return direction === 'asc' ? comparison : -comparison;
}

/**
 * Is a value usable as a date?
 *
 * DEFECT (pinned, not fixed): `Date.parse` accepts far more than dates — "2000" parses as the year
 * 2000, so a numeric-looking string column can be sorted chronologically instead of numerically once
 * anything makes it skip the numeric branch.
 */
export function isDateLike(value: any): boolean {
  return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
}

/** The header's sort glyph. An unsorted column shows the neutral double arrow. */
export function sortIcon(state: SortState, columnKey: string): string {
  if (state.sortColumn !== columnKey) return '⇅';
  return state.sortDirection === 'asc' ? '↑' : '↓';
}

/** Columns are sortable unless explicitly opted out — `sortable: false`, not merely falsy. */
export function isSortable(column: any): boolean {
  return column.sortable !== false;
}

/** Emphasised cell. */
export function shouldHighlightCell(columnKey: string, columns: readonly string[] = HIGHLIGHT_COLUMNS): boolean {
  return columns.includes(columnKey);
}

/** Badge-rendered cell. */
export function isBadgeColumn(columnKey: string, columns: readonly string[] = BADGE_COLUMNS): boolean {
  return columns.includes(columnKey);
}

// =================================================================================================
// Pagination
// =================================================================================================

/** Total pages for a row count. An empty list is 0 pages, not 1. */
export function totalPagesFor(rowCount: number, itemsPerPage: number): number {
  return Math.ceil(rowCount / itemsPerPage);
}

/** Pull a too-high page down, but never below 1 when the table is empty. */
export function clampPage(currentPage: number, totalPages: number): number {
  if (currentPage > totalPages && totalPages > 0) return totalPages;
  return currentPage;
}

/**
 * The window of page numbers to draw. Up to `maxPagesToShow`, centred on the current page and shunted
 * back at the end so the pager never goes ragged.
 */
export function pageNumbers(currentPage: number, totalPages: number, maxPagesToShow = 5): number[] {
  const pages: number[] = [];
  if (totalPages <= maxPagesToShow) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const halfRange = Math.floor(maxPagesToShow / 2);
    let start = Math.max(1, currentPage - halfRange);
    const end = Math.min(totalPages, start + maxPagesToShow - 1);
    if (end === totalPages) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
  }
  return pages;
}

// =================================================================================================
// Date windows
// =================================================================================================

/** A new Date at local midnight. Never mutates its argument. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** A new Date at the last millisecond of the day. Never mutates its argument. */
export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** The reporting window, snapped so a whole first and last day are included. */
export function dayBounds(start: Date, end: Date): [Date, Date] {
  return [startOfDay(start), endOfDay(end)];
}

/** First and last calendar day of the month containing `d`. */
export function monthBounds(d: Date): { start: Date; end: Date } {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
  };
}

/** The first of the month `delta` months away. Rolls over the year. */
export function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/**
 * The cut-off for the assured-date quick filters.
 * 'last7days' means 7; ANY other value — including a typo — silently means 30.
 */
export function assuredFilterCutoff(filterType: string, now: Date = new Date()): Date {
  const daysAgo = filterType === 'last7days' ? 7 : 30;
  const filterDate = new Date(now);
  filterDate.setDate(filterDate.getDate() - daysAgo);
  filterDate.setHours(0, 0, 0, 0);
  return filterDate;
}

/**
 * The month the trends chart starts from: `duration` months before now.
 * Built with setMonth() on today's date, so on the 31st it can roll into the following month — the
 * pre-existing behaviour of JavaScript's month arithmetic.
 */
export function trendsStartMonth(duration: number, now: Date = new Date()): { month: number; year: number } {
  const currentDate = new Date(now);
  currentDate.setMonth(currentDate.getMonth() - duration);
  return { month: currentDate.getMonth(), year: currentDate.getFullYear() };
}

/** Inclusive at both ends. An absent date is never in range. */
export function isWithinRange(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

// =================================================================================================
// Carousel maths
// =================================================================================================

export interface SliderState {
  currentPage: number;
  isDragging: boolean;
  dragStartX: number;
  dragDelta: number;
  outerWidth: number;
  totalCount: number;
}

/** A fresh slider. */
export function initSlider(): SliderState {
  return { currentPage: 0, isDragging: false, dragStartX: 0, dragDelta: 0, outerWidth: 300, totalCount: 0 };
}

/**
 * The track's transform.
 *
 * While dragging, the offset follows the finger but is CLAMPED to the real page range so the track
 * cannot be pulled off either end. When not dragging it is simply the current page.
 *
 * DEFECT (pinned, not fixed): the resting branch is NOT clamped — a currentPage set beyond the
 * available slides (which clampSliderPage prevents, but nothing else enforces) would translate the
 * track into empty space.
 */
export function sliderTransform(s: SliderState, maxSlides: number = MAX_SLIDES): string {
  if (s.isDragging) {
    const dragPct = s.outerWidth ? (s.dragDelta / s.outerWidth) * 100 : 0;
    const rawPct = s.currentPage * 100 - dragPct;
    const clampedPct = Math.min(Math.min(maxSlides - 1, s.totalCount - 1) * 100, Math.max(0, rawPct));
    return `translateX(-${clampedPct}%)`;
  }
  return `translateX(-${s.currentPage * 100}%)`;
}

/** Clamp a page into [0, min(maxSlides, totalCount) - 1]. Never negative. */
export function clampSliderPage(page: number, totalCount: number, maxSlides: number = MAX_SLIDES): number {
  return Math.max(0, Math.min(maxSlides - 1, page, totalCount - 1));
}

/**
 * Where a drag lands. Past the threshold in either direction advances one page; anything shorter
 * snaps back. The result is then clamped, so a flick at either end goes nowhere.
 */
export function settleSliderPage(
  s: Pick<SliderState, 'currentPage' | 'dragDelta' | 'totalCount'>,
  maxSlides: number = MAX_SLIDES,
  threshold: number = DRAG_THRESHOLD_PX,
): number {
  let page = s.currentPage;
  if (s.dragDelta < -threshold) page = page + 1;
  else if (s.dragDelta > threshold) page = page - 1;
  return clampSliderPage(page, s.totalCount, maxSlides);
}

/** Jump to a page from a dot/arrow control. `total` defaults to a sentinel meaning "unbounded". */
export function sliderGoToPage(page: number, total?: number): number {
  const max = total ?? 999;
  return Math.max(0, Math.min(max - 1, page));
}

// =================================================================================================
// Loading progress
// =================================================================================================

/** How many of the tracked loaders have finished. Only strict `true` counts. */
export function loadedCount(loadingStates: Record<string, unknown>): number {
  return Object.values(loadingStates).filter((state) => state === true).length;
}

/** Every tracked loader has reported in. An EMPTY state map is vacuously "all loaded". */
export function allLoaded(loadingStates: Record<string, unknown>): boolean {
  return Object.values(loadingStates).every((state) => state === true);
}

/**
 * Loading bar percentage.
 *
 * DEFECT (pinned, not fixed): no guard on an empty state map, so 0 of 0 produces NaN and the bar
 * renders blank rather than full or absent.
 */
export function loadingProgressPct(loadingStates: Record<string, unknown>): number {
  const loaded = loadedCount(loadingStates);
  const total = Object.keys(loadingStates).length;
  return (loaded / total) * 100;
}
