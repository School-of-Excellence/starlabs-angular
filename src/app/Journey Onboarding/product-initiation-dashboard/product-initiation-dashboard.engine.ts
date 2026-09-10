/**
 * Product Initiation Dashboard Rules Engine (pure, dependency-free).
 *
 * The arithmetic and the decisions behind the Product Initiation Dashboard: how long a participant has
 * been waiting to be started, whether their payments clear them, which of the three boards they land
 * on (awaiting initiation / initiated-but-pending / engagement opportunity), how the month window is
 * chosen and stepped, and the table's sort / filter / pagination / cell-formatting behaviour.
 *
 * Extracted from ProductInitiationDashboardComponent (1,821 lines) on 2026-09-10, following the pattern
 * already set by ../delivery-dashboard-clone/delivery-dashboard.engine.ts and priority.engine.ts in
 * ../journey-coach-health-dashboard. The logic is UNCHANGED — same thresholds, same comparison
 * operators, same coercions, same strings, same quirks. Only its location moved. Several oddities
 * (documented as DEFECT notes below) were deliberately left intact and pinned by tests rather than
 * fixed, because this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments and returns
 *   a value, so the rules can be exercised offline instead of standing up a component that injects
 *   Firestore, a Router, a DatePipe, a MatDialog and an AuthguardService and then opens four
 *   collection subscriptions — several of which issue a getDocs PER PARTICIPANT — before it computes
 *   anything.
 * - The component also carries an unrelated broken import (`import { count } from 'console'`) that
 *   keeps it out of the type-checked unit build entirely. The engine deliberately imports NOTHING, so
 *   these rules are testable regardless of what happens to that import. That is a large part of why
 *   the extraction is worth doing here.
 * - As methods on that component the rules were only reachable through a rendered template. An e2e case
 *   could assert that a row said "Pending" — it could not tell a genuine shortfall from the string-
 *   comparison bug below, so both looked the same from outside.
 * - These are product decisions: who is chased today, and who is told they still owe money.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, walks `this.mapMetaData` / `this.mapProduct` / `this.originalData`,
 *   resolves product refs, opens dialogs, sorts a live table or exports Excel. Where a method mixed
 *   both, only the pure core moved and the component still does its own gathering.
 *
 * Thresholds are exported as named constants and, where a caller had its own copy, are injectable so a
 * test can pin a boundary without rewriting a constant. `now` is an optional last parameter defaulting
 * to `new Date()` — exactly what the component did — so tests can freeze the clock.
 */

// =================================================================================================
// Thresholds and reference data — the component's own inline values, kept as the defaults.
// =================================================================================================

/**
 * Sales before this date are ignored entirely (product-initiation-dashboard.component.ts:1206, 1233).
 * Constructed exactly as the component did — `new Date('2025-01-01')` — which is parsed as UTC
 * midnight, NOT local midnight. West of Greenwich that admits a few hours of 31 December 2024.
 */
export const SALES_EPOCH_ISO = '2025-01-01';

/** The journey whose participants never appear on this dashboard (line 1233). */
export const EXCLUDED_JOURNEY_ID = 'InLXMl7OBAqlDTZcXwK0';

/** Journey statuses that keep a participant on the boards (lines 1233, 1290). */
export const ACTIVE_JOURNEY_STATUSES: readonly any[] = [null, 'ongoing', 'initiated'];
export const IN_FLIGHT_JOURNEY_STATUSES: readonly string[] = ['initiated', 'ongoing'];

/** Journey statuses that drop a not-assured participant out (line 1210). */
export const DEAD_JOURNEY_STATUSES: readonly string[] = ['cancelled', 'downgraded'];

/** Internal/test participants are recognised by this substring in their email (line 1211). */
export const TEST_EMAIL_DOMAIN = 'soexcellence';

/** The not-yet-started split: purchases newer than this many days are the "recent" bucket (line 1246). */
export const RECENT_PURCHASE_DAYS = 7;

/** The journey-not-started split (line 1219). */
export const JOURNEY_NOT_STARTED_DAYS = 30;

/**
 * Delivery modes that the engagement-opportunity branch computes an `isValidMode` flag for (line 1424).
 *
 * DEFECT (pinned, not fixed): that flag is computed and then NEVER READ — the branch it was written for
 * tests only `isStatusEmpty`. Participants in every other mode therefore fall into the engagement
 * board too, which is almost certainly not what the mode list was written to express.
 */
export const PERFORMANCE_MODES: readonly string[] = [
  'Performance Mode',
  'Extended Performance Mode',
  'After Extended Performance Mode',
];

/** The IST offset the month window is shifted by (line 1189). Pinned as a DEFECT, not endorsed. */
export const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Columns rendered with emphasis / as a badge (lines 3234-3241 equivalents, lines 736, 742). */
export const HIGHLIGHT_COLUMNS: readonly string[] = ['name', 'contractId', 'category'];
export const BADGE_COLUMNS: readonly string[] = ['journey', 'paymentStatus'];

/** The tab index → board mapping (onTabChange, line 281). */
export const TAB_BOXES: readonly string[] = ['awaitingInitiation', 'initiatedPending', 'engagementOpportunity'];

const MS_PER_DAY = 1000 * 3600 * 24;

// =================================================================================================
// Waiting period
// =================================================================================================

/**
 * Whole days elapsed since a timestamp, floored — the component's calculateWaitingPeriod().
 *
 * DEFECT (pinned, not fixed): a falsy date yields 0, indistinguishable from "onboarded today", and a
 * FUTURE date yields a negative number that is NOT clamped. Every waiting-period column on this
 * dashboard inherits both.
 */
export function waitingDaysSince(onboardedtime: Date | null | undefined, now: Date = new Date()): number {
  if (!onboardedtime) return 0;
  const timeDifference = now.getTime() - onboardedtime.getTime();
  return Math.floor(timeDifference / MS_PER_DAY);
}

// =================================================================================================
// Payment clearance
// =================================================================================================

/**
 * Is this participant eligible for the awaiting-initiation board at all?
 * Mid-journey, and holding neither an active nor a consumed product.
 */
export function isAwaitingInitiationCandidate(
  journeyStatus: string | null | undefined,
  activeProduct: unknown[] | null | undefined,
  consumedProduct: unknown[] | null | undefined,
  statuses: readonly string[] = IN_FLIGHT_JOURNEY_STATUSES,
): boolean {
  return statuses.includes(journeyStatus as string)
    && (!activeProduct || activeProduct.length === 0)
    && (!consumedProduct || consumedProduct.length === 0);
}

/**
 * The minimum payment actually enforced for one product row: the participant's own record wins, and
 * only a literal null/undefined falls back to the product catalogue's minimumrequiredamount.
 *
 * DEFECT (pinned, not fixed): the fallback is `|| 0`, so a catalogue minimum recorded as an empty
 * string, or one whose catalogue entry has not loaded yet, collapses to 0 and the product clears for
 * free — reporting a participant as Cleared without them having paid anything.
 */
export function resolveMinimumPayment(productMinimum: any, catalogueMinimum: any): any {
  if ([null, undefined].includes(productMinimum)) {
    return catalogueMinimum || 0;
  }
  return productMinimum;
}

/**
 * Does ANY of the participant's products clear on what they have paid? One is enough — the original
 * loop `break`s on the first hit.
 *
 * DEFECT (pinned, not fixed): the comparison is `minimum <= totalPaid` on RAW values, and on the
 * priority-mode path pp_totalpaid defaults to the STRING '0'. When both sides are strings JavaScript
 * compares them LEXICOGRAPHICALLY, so '500' <= '1000' is false and a participant who has paid twice
 * the minimum is reported Pending and never initiated.
 */
export function hasAnyClearedProduct(minimumPayments: any[], totalPaid: any): boolean {
  for (const minimum of minimumPayments) {
    if (minimum <= totalPaid) return true;
  }
  return false;
}

/** The financial column's text. */
export function financialLabel(cleared: boolean): string {
  return cleared ? 'Cleared' : 'Pending';
}

/**
 * The engagement-opportunity board's OWN, different clearance rule: a straight subtraction.
 *
 * DEFECT (pinned, not fixed): both operands default to the string 'NA' when absent, and 'NA' - 'NA'
 * is NaN. `NaN <= 0` is false, so EVERY participant with no recorded minimum payment is labelled
 * Pending forever — they can never be shown as cleared however much they have paid. This is a
 * different rule from hasAnyClearedProduct() above, on the same dashboard, for the same question.
 */
export function isEngagementCleared(minimumPayment: any, totalPaid: any): boolean {
  const remainingamount = minimumPayment - totalPaid;
  return remainingamount <= 0;
}

// =================================================================================================
// Board membership
// =================================================================================================

/** Any of the participant's journeys is initiated or ongoing. An empty list is false. */
export function hasInFlightJourney(
  journeyStatuses: any[],
  statuses: readonly string[] = IN_FLIGHT_JOURNEY_STATUSES,
): boolean {
  return journeyStatuses.some((s) => statuses.includes(s));
}

/**
 * Does this row qualify for the engagement-opportunity board?
 *
 * The participant is mid-journey, has finished at least one product, and holds nothing active right
 * now — i.e. there is a gap to sell into.
 *
 * NOTE the deliberate omission: the delivery mode is NOT part of this test even though the component
 * computes a PERFORMANCE_MODES flag right beside it. See PERFORMANCE_MODES.
 */
export function isEngagementOpportunity(
  hasJourney: boolean,
  consumedProduct: unknown[] | null | undefined,
  activeProduct: unknown[] | null | undefined,
): boolean {
  const hasConsumedProducts = !!(consumedProduct && consumedProduct.length > 0);
  return hasJourney && hasConsumedProducts && (!activeProduct || activeProduct.length === 0);
}

/** The status value that means "this product has not been started" — an empty status. */
export function isStatusEmpty(status: any): boolean {
  return [null, undefined, ''].includes(status);
}

/** Is this delivery mode one of the performance modes? (Computed but unused — see PERFORMANCE_MODES.) */
export function isPerformanceMode(mode: any, modes: readonly string[] = PERFORMANCE_MODES): boolean {
  return modes.includes(mode);
}

/** The sales epoch as a Date, built exactly as the component built it. */
export function salesEpoch(iso: string = SALES_EPOCH_ISO): Date {
  return new Date(iso);
}

/**
 * Is this purchase recent enough to be on the dashboard at all?
 *
 * DEFECT (pinned, not fixed): the epoch is `new Date('2025-01-01')`, which JavaScript parses as UTC
 * midnight rather than local midnight. In a timezone behind UTC, purchases from the last hours of
 * 31 December 2024 are admitted; ahead of UTC, the first hours of 1 January 2025 are excluded.
 */
export function isAfterSalesEpoch(purchaseDate: Date | null | undefined, epoch: Date = salesEpoch()): boolean {
  if (!purchaseDate) return false;
  return purchaseDate >= epoch;
}

/**
 * Is this an internal/test participant, recognised by their email?
 *
 * DEFECT (pinned, not fixed): in the component this is written as `metadata?.['email'].includes(...)`
 * — the optional chain guards the METADATA but not the EMAIL, so a participant record with no email
 * throws a TypeError inside a Firestore subscription callback and silently kills the whole
 * not-assured pass. This version takes the email directly so the caller can decide; the missing guard
 * is pinned by a test on the caller's behalf.
 */
export function isTestParticipantEmail(email: any, domain: string = TEST_EMAIL_DOMAIN): boolean {
  return !!email && email.includes(domain);
}

/** A not-assured row is dropped once its journey is cancelled or downgraded. */
export function isDeadJourney(journeyStatus: any, statuses: readonly string[] = DEAD_JOURNEY_STATUSES): boolean {
  return statuses.includes(journeyStatus);
}

/**
 * Is the participant's journey one this dashboard reports on?
 *
 * The excluded journey is skipped, and the status must be one of null / 'ongoing' / 'initiated'.
 *
 * DEFECT (pinned, not fixed): the status list contains a literal `null` but not `undefined`, so a
 * document that simply omits `journeystatus` — as opposed to storing an explicit null — drops off the
 * board, while an explicit null stays on it. Two ways of saying "no status yet" behave differently.
 */
export function isReportableJourney(
  journeyRefId: any,
  journeyStatus: any,
  excludedId: string = EXCLUDED_JOURNEY_ID,
  statuses: readonly any[] = ACTIVE_JOURNEY_STATUSES,
): boolean {
  const journeyOk = [null, undefined, ''].includes(journeyRefId) || journeyRefId !== excludedId;
  return journeyOk && statuses.includes(journeyStatus);
}

export type PurchaseAgeBucket = 'recent' | 'older';

/**
 * Which side of a cut-off a purchase falls on.
 *
 * The comparison is `>=` against the cut-off, so a purchase exactly on the boundary counts as RECENT.
 * A missing purchase date is 'older' — it is never treated as new.
 */
export function purchaseAgeBucket(purchaseDate: Date | null | undefined, cutoff: Date): PurchaseAgeBucket {
  if (!purchaseDate) return 'older';
  return purchaseDate >= cutoff ? 'recent' : 'older';
}

/** N days before `now`, with the time of day preserved — exactly what setDate() does. */
export function daysAgo(days: number, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(now.getDate() - days);
  return d;
}

// =================================================================================================
// Month windows
// =================================================================================================

/** First and last calendar day of the month containing `d`. */
export function monthBounds(d: Date): { start: Date; end: Date } {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
  };
}

/** The "2026-09" key. Month is 1-based and zero-padded. */
export function monthYearKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse a "YYYY-MM" key into a 1-based year/month pair. */
export function parseMonthYearKey(monthyear: string): { year: number; month: number } {
  return {
    year: parseInt(monthyear.split('-')[0]),
    month: parseInt(monthyear.split('-')[1]),
  };
}

/** The calendar bounds of a "YYYY-MM" key. Month is 1-based on the way in. */
export function boundsFromMonthYearKey(monthyear: string): { start: Date; end: Date } {
  const { year, month } = parseMonthYearKey(monthyear);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
}

/**
 * The next / previous "YYYY-MM" key and its bounds.
 *
 * The month wraps 12→1 and 1→12 with the year following, written out longhand rather than via Date
 * arithmetic — which is why it never overshoots on a 31st the way Date.setMonth() does.
 *
 * DEFECT (pinned, not fixed): nothing validates the incoming key, so a malformed one produces NaN for
 * both fields and `new Date(NaN, NaN, 1)` is an Invalid Date — the board silently renders empty
 * rather than refusing the input.
 */
export function stepMonthYearKey(
  monthyear: string,
  direction: 1 | -1,
): { monthyear: string; start: Date; end: Date } {
  let { year, month } = parseMonthYearKey(monthyear);
  if (direction === 1) {
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
  } else {
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
  }
  return {
    monthyear: `${year}-${String(month).padStart(2, '0')}`,
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0),
  };
}

/**
 * The window the participantjourneyproduct pass is actually scoped to.
 *
 * DEFECT (pinned, not fixed): the bounds are built at LOCAL midnight and then shifted forward by a
 * hard-coded 5h30m "IST offset" that has nothing to do with the machine's timezone. Onboardings in
 * the first 5½ hours of the 1st are missed from the month and 5½ hours of the next month leak in —
 * every count on the board is slightly wrong, and differently wrong per deployment region.
 */
export function istShiftedWindow(
  startDate: Date,
  endDate: Date,
  offsetMinutes: number = IST_OFFSET_MINUTES,
): { start: Date; end: Date } {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  start.setTime(start.getTime() + offsetMinutes * 60 * 1000);
  end.setTime(end.getTime() + offsetMinutes * 60 * 1000);
  return { start, end };
}

/** Inclusive at both ends. An absent date is never in range. */
export function isWithinRange(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

/** Which board a tab index selects. An out-of-range index selects nothing. */
export function boxForTabIndex(index: number, boxes: readonly string[] = TAB_BOXES): string | null {
  return boxes[index] ?? null;
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
// Sorting
// =================================================================================================

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  sortColumn: string | null;
  sortDirection: SortDirection;
}

/**
 * The next state of the tri-state sort when a header is clicked.
 * asc → desc → OFF (restoring the unsorted order) → asc. A different column always restarts at asc.
 */
export function nextSortState(current: SortState, columnKey: string): SortState {
  if (current.sortColumn === columnKey) {
    if (current.sortDirection === 'asc') return { sortColumn: columnKey, sortDirection: 'desc' };
    if (current.sortDirection === 'desc') return { sortColumn: null, sortDirection: null };
  }
  return { sortColumn: columnKey, sortDirection: 'asc' };
}

/**
 * Compare two already-extracted cell values: numeric, then chronological, then locale text. Nulls
 * sort to the END in ascending order.
 *
 * DEFECT (pinned, not fixed): `!isNaN(value)` is true for the empty string, so a text column with any
 * genuinely empty cell takes the numeric branch and every blank sorts as 0 — ahead of every real word.
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
 * DEFECT (pinned, not fixed): Date.parse accepts far more than dates — a bare "2000" parses as the
 * year 2000, so a numeric-looking text column can be sorted chronologically.
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

/**
 * The raw cell value with the table's universal empty-cell placeholder.
 *
 * DEFECT (pinned, not fixed): `row[key] || '-'` — a legitimate 0 renders as a dash, indistinguishable
 * from missing data. On a payments board that is a meaningful difference.
 */
export function cellValueOrDash(row: any, key: string): string {
  return row[key] || '-';
}

// =================================================================================================
// Cell formatting
// =================================================================================================

/**
 * A currency cell: symbol + Indian grouping, up to 2 decimals. Absent is '-', but a real 0 formats.
 *
 * DEFECT (pinned, not fixed): NaN takes the "absent" branch, so a corrupt amount is indistinguishable
 * from an unrecorded one.
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
 * A mapped cell: look the raw value up in a dictionary, optionally reading one property off the hit.
 * `mapKey` may be a plain property name or an indexed path like "[0].name".
 *
 * NOTE the fallback: an UNMAPPED value renders '-' on this dashboard, where the otherwise-identical
 * copy in ../sales-dashboard-clone falls back to the raw value's toString(). The two were already
 * different before extraction and are kept different on purpose — a participant whose journey id is
 * not in the map reads as blank here and as a raw document id there.
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
  return tempMap || '-';
}

/**
 * The most recent note's text.
 *
 * DEFECT (pinned, not fixed): a blank note, and a note stored as a bare string rather than an object,
 * both render '-' — indistinguishable from "nobody wrote anything".
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
 * A text cell, optionally truncated. Only `substringEnd` gates the truncation, so a start with no end
 * is IGNORED and the full text is shown.
 */
export function formatTextCell(value: any, substringStart?: number, substringEnd?: number): string {
  const stringValue = value.toString();
  return substringEnd ? stringValue.substring(substringStart as number, substringEnd) : stringValue;
}

// =================================================================================================
// Table filtering
// =================================================================================================

/** The already-rendered cell values the row filter compares against. The caller does the formatting. */
export interface RowSearchFields {
  /** The rendered Name cell, or null when the table has no name column. */
  name?: string | null;
  /** The rendered Mobile cell. */
  mobile?: string | null;
  /** The rendered Email cell. */
  email?: string | null;
  /** The rendered Journey cell, or null when the table has no journey column. */
  journey?: string | null;
  /** The row's raw financialdata value. */
  financialdata?: any;
}

export interface RowFilterCriteria {
  search: string;
  selectedJourney: string[];
  selectedStatus: any;
}

/**
 * Does one row survive the search / journey / status filters? All three are ANDed.
 *
 * Search looks at three columns and treats them DIFFERENTLY: the name is matched case-INsensitively
 * (both sides lower-cased and the cell trimmed), while mobile and email are matched case-SENSITIVELY
 * on the raw rendered text. That asymmetry is the pre-existing behaviour.
 *
 * DEFECT (pinned, not fixed): searching for an email in any case other than the stored one finds
 * nothing, even though the name column right beside it is case-insensitive. Users cannot tell which
 * columns are which.
 */
export function matchesRowFilters(fields: RowSearchFields, criteria: RowFilterCriteria): boolean {
  let matchesSearch = true;
  let matchesJourney = true;
  let matchesStatus = true;

  const searchTerm = criteria.search || '';
  if (searchTerm.trim()) {
    matchesSearch = false;
    if (fields.name != null && fields.name.toLowerCase().trim().includes(searchTerm.toLowerCase())) {
      matchesSearch = true;
    }
    if (!matchesSearch && fields.mobile != null && fields.mobile.includes(searchTerm)) {
      matchesSearch = true;
    }
    if (!matchesSearch && fields.email != null && fields.email.includes(searchTerm)) {
      matchesSearch = true;
    }
  }

  if (criteria.selectedJourney.length > 0 && fields.journey != null) {
    matchesJourney = criteria.selectedJourney.includes(fields.journey);
  }

  if (criteria.selectedStatus && criteria.selectedStatus !== '') {
    if (criteria.selectedStatus === 'Cleared') {
      matchesStatus = fields.financialdata === 'Cleared';
    } else if (criteria.selectedStatus === 'Pending') {
      matchesStatus = fields.financialdata === 'Pending';
    }
  }

  return matchesSearch && matchesJourney && matchesStatus;
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
