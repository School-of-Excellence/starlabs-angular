/**
 * Delivery Dashboard (v1) Rules Engine — pure, dependency-free.
 *
 * The arithmetic and the decisions behind the ORIGINAL Delivery Dashboard: how long a participant has
 * been waiting and how urgent that makes them, whether any of their products clears them financially,
 * how stale an appointment has to be before the case counts as stuck and how loudly it is escalated,
 * which appointment type belongs to which delivery stage, the month window the whole board is scoped
 * to, and the pagination / filtering / export text that turns all of it into something on screen.
 *
 * Extracted from DeliveryDashboardComponent (1,862 lines) on 2026-09-10, following the pattern already
 * set by delivery-dashboard.engine.ts in ../delivery-dashboard-clone and priority.engine.ts in
 * ../journey-coach-health-dashboard. The logic is UNCHANGED — same thresholds, same comparison
 * operators (`>` here, NOT the clone's `>=`), same rounding, same strings, same quirks. Only its
 * location moved. Several oddities (documented as DEFECT notes) were deliberately left intact and
 * pinned by tests rather than fixed, because this is a refactor.
 *
 * NOTE ON THE SIBLING ENGINE: this is NOT the clone's engine under another name. The two dashboards
 * disagree — this one escalates on `days > 30 / > 15` where the clone uses `> 30 / > 21`, calls a case
 * stuck at 15 days with a strict `>` where the clone uses `>=`, and labels payment status
 * 'Cleared'/'Pending' where the clone says 'Cleared'/'Not Scheduled'. Those divergences are real and
 * are pinned here so a future merge of the two boards is a deliberate decision, not an accident.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments and
 *   returns a value, so the rules can be exercised offline instead of standing up a component that
 *   injects Firestore, a Router, a MatDialog and a FormBuilder and then subscribes to four
 *   collections before it computes anything.
 * - As methods on that component the rules were only reachable through a rendered template. An e2e
 *   case could assert that a chip said "MEDIUM" — it could not tell a 15-day threshold from a 16-day
 *   one, so a shifted boundary passed silently.
 * - These are product decisions, not implementation details. 14/10/5 days deciding the priority chip,
 *   15 days deciding "stuck", 30 days deciding a HIGH escalation, 7/30 days splitting the cleared-but-
 *   waiting buckets, and the appointment-type → stage map all change who a delivery manager chases
 *   today. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, walks `this.mapMetaData` / `this.originalData`, resolves product
 *   refs, opens modals, scrolls the page or exports Excel. Where a method mixed both, only the pure
 *   core moved and the component still does its own gathering — see loadJourneyProductData(), which
 *   still queries participantsproduct itself and only asks the engine the questions (does any product
 *   clear? which cleared-age bucket? how long have they waited?).
 *
 * Thresholds are exported as named constants and, where a caller had its own copy, are injectable so
 * a test can pin a boundary without rewriting a constant. `now` is an optional last parameter
 * defaulting to `new Date()` — exactly what the component did — so tests can freeze the clock.
 */

// =================================================================================================
// Thresholds — the component's own inline values, kept as the defaults so behaviour is identical.
// =================================================================================================

/** getPriorityLabel() bands (delivery-dashboard.component.ts:1073). All comparisons are `>=`. */
export const PRIORITY_URGENT_DAYS = 14;
export const PRIORITY_HIGH_DAYS = 10;
export const PRIORITY_MEDIUM_DAYS = 5;

/**
 * Stuck-case cut-off (line 778). STRICT `>` — a case exactly 15 days old is NOT yet stuck.
 * The clone dashboard uses `>=` on its own STUCK_DAYS, which is why the two boards disagree by a day.
 */
export const STUCK_DAYS = 15;

/** Escalation band inside the stuck cohort (line 775). Also strict `>`. */
export const ESCALATION_HIGH_DAYS = 30;

/** Cleared-but-still-waiting buckets, measured from the last payment date (lines 502-506). Strict `>`. */
export const CLEARED_OVER_LONG_DAYS = 30;
export const CLEARED_OVER_SHORT_DAYS = 7;

/**
 * The IST offset the month window is shifted by (line 578). See istShiftedMonthWindow() — this is
 * pinned as a DEFECT, not endorsed.
 */
export const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Journey statuses that put a participant on the awaiting-initiation board at all (line 457). */
export const AWAITING_JOURNEY_STATUSES: readonly string[] = ['initiated', 'ongoing'];

const MS_PER_DAY = 1000 * 3600 * 24;

// =================================================================================================
// Waiting period and priority
// =================================================================================================

export type PriorityLabel = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PriorityBands {
  urgentDays: number;
  highDays: number;
  mediumDays: number;
}

const PRIORITY_DEFAULTS: PriorityBands = {
  urgentDays: PRIORITY_URGENT_DAYS,
  highDays: PRIORITY_HIGH_DAYS,
  mediumDays: PRIORITY_MEDIUM_DAYS,
};

/**
 * Whole days elapsed since a timestamp, floored — the component's calculateWaitingPeriod().
 *
 * DEFECT (pinned, not fixed): a falsy date yields 0, which bands as LOW — indistinguishable from
 * someone onboarded today. A FUTURE date yields a negative number that is NOT clamped, so a
 * mis-entered date also bands LOW instead of shouting. The clone dashboard's daysSince() clamps at 0;
 * this one never has.
 */
export function waitingDaysSince(onboardedtime: Date | null | undefined, now: Date = new Date()): number {
  if (!onboardedtime) return 0;
  const timeDifference = now.getTime() - onboardedtime.getTime();
  return Math.floor(timeDifference / MS_PER_DAY);
}

/** The subset of a participant row the waiting-period rule reads. */
export interface WaitingPeriodInput {
  /** A pre-computed value the cohort builder already stamped on the row. */
  waitingperiod?: number;
  /** Otherwise, when the row was initiated — a Firestore Timestamp, a Date, or anything Date-able. */
  initiatedtime?: any;
}

/**
 * Waiting period for a participant row — the component's getWaitingPeriod().
 *
 * Precedence matters: an explicitly stamped `waitingperiod` ALWAYS wins, even when it is 0 or
 * negative — only `undefined` falls through to the initiated timestamp. A row with neither is 0.
 *
 * DEFECT (pinned, not fixed): the fallback is `initiatedtime?.toDate()`. The optional chain guards
 * initiatedtime being absent but NOT the missing toDate method, so a row carrying a plain JS Date
 * (anything that did not come straight from raw Firestore) raises a TypeError mid-render.
 */
export function waitingPeriodFor(participant: WaitingPeriodInput, now: Date = new Date()): number {
  if (participant.waitingperiod !== undefined) {
    return participant.waitingperiod;
  }
  if (participant.initiatedtime) {
    return waitingDaysSince(participant.initiatedtime?.toDate(), now);
  }
  return 0;
}

/**
 * Band a waiting period, in whole days, into the chip shown beside a participant.
 * Every comparison is `>=`, so each threshold day itself belongs to the HIGHER band.
 */
export function priorityLabel(waitingPeriod: number, bands: PriorityBands = PRIORITY_DEFAULTS): PriorityLabel {
  if (waitingPeriod >= bands.urgentDays) return 'URGENT';
  if (waitingPeriod >= bands.highDays) return 'HIGH';
  if (waitingPeriod >= bands.mediumDays) return 'MEDIUM';
  return 'LOW';
}

// =================================================================================================
// Payment clearance — the gate on "ready for initiation"
// =================================================================================================

/**
 * Is a participant eligible to appear on the awaiting-initiation board at all?
 *
 * They must be mid-journey (initiated or ongoing) AND hold no active and no consumed product — i.e.
 * the journey has started on paper but nothing has actually been delivered yet. Both product lists
 * are treated as "absent OR empty".
 */
export function isAwaitingInitiationCandidate(
  journeyStatus: string | null | undefined,
  activeProduct: unknown[] | null | undefined,
  consumedProduct: unknown[] | null | undefined,
  statuses: readonly string[] = AWAITING_JOURNEY_STATUSES,
): boolean {
  return statuses.includes(journeyStatus as string)
    && (!activeProduct || activeProduct.length === 0)
    && (!consumedProduct || consumedProduct.length === 0);
}

/**
 * The minimum payment actually enforced for one product row.
 *
 * The participant's own product record wins; only a literal null/undefined falls back to the product
 * catalogue's minimumrequiredamount, and a missing catalogue entry is 0 (= "no minimum").
 *
 * DEFECT (pinned, not fixed): the fallback is `|| 0`, so a catalogue minimum that is legitimately
 * recorded as an empty string or NaN also collapses to 0 and the product clears for free.
 */
export function resolveMinimumPayment(productMinimum: any, catalogueMinimum: any): any {
  if ([null, undefined].includes(productMinimum)) {
    return catalogueMinimum || 0;
  }
  return productMinimum;
}

/**
 * Does ANY of the participant's products clear on what they have paid?
 *
 * One cleared product is enough — the loop `break`s on the first hit, which is why a participant with
 * five products and one cheap one reads as fully cleared.
 *
 * DEFECT (pinned, not fixed): the comparison is `minimum <= totalPaid` on RAW values. When both sides
 * arrive as strings (pp_totalpaid is stored as a string on some documents) JavaScript compares them
 * LEXICOGRAPHICALLY, so '500' <= '1000' is false and a participant who has paid twice the minimum
 * reads as Pending.
 */
export function hasAnyClearedProduct(minimumPayments: any[], totalPaid: any): boolean {
  for (const minimum of minimumPayments) {
    if (minimum <= totalPaid) return true;
  }
  return false;
}

/** The financial column's text. Note: 'Pending', not the clone dashboard's 'Not Scheduled'. */
export function financialLabel(cleared: boolean): string {
  return cleared ? 'Cleared' : 'Pending';
}

export type ClearedAgeBucket = 'over30' | 'over7' | 'recent';

/**
 * How long a CLEARED participant has been sitting unstarted since their last payment.
 *
 * Both comparisons are strict `>`, and the bands do not overlap: exactly 30 days is 'over7', exactly
 * 7 days is 'recent'. A participant with no recorded payment date is in no bucket at all — the
 * component skips them entirely — so callers must check the date first.
 */
export function clearedAgeBucket(
  daysSincePayment: number,
  longDays: number = CLEARED_OVER_LONG_DAYS,
  shortDays: number = CLEARED_OVER_SHORT_DAYS,
): ClearedAgeBucket {
  if (daysSincePayment > longDays) return 'over30';
  if (daysSincePayment > shortDays) return 'over7';
  return 'recent';
}

/**
 * Whole days between two dates after BOTH are snapped to local midnight — the payment-age maths.
 * Snapping first is what makes "yesterday evening → this morning" read as 1 day and not 0.
 */
export function wholeDaysBetweenMidnights(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

// =================================================================================================
// Stuck cases and escalation
// =================================================================================================

export type EscalationLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * How hard a stalled appointment should be escalated.
 * Both comparisons are STRICT `>`, so exactly 30 days is MEDIUM and exactly 15 days is LOW.
 */
export function escalationLevel(
  days: number,
  highDays: number = ESCALATION_HIGH_DAYS,
  mediumDays: number = STUCK_DAYS,
): EscalationLevel {
  return days > highDays ? 'HIGH' : days > mediumDays ? 'MEDIUM' : 'LOW';
}

/**
 * Is this case stuck? Strict `>`, so a case exactly STUCK_DAYS old is still "in progress".
 *
 * DEFECT (pinned, not fixed): the day count feeding this comes from waitingDaysSince(), which does
 * not clamp. An appointment dated in the future produces a negative age and therefore never reads as
 * stuck no matter how long it then sits.
 */
export function isStuckCase(days: number, stuckDays: number = STUCK_DAYS): boolean {
  return days > stuckDays;
}

/** The issue text beside a case. */
export function stuckIssueType(days: number, stuckDays: number = STUCK_DAYS): string {
  return days > stuckDays ? 'Stuck in Phase' : 'In Progress';
}

/** The resolution column — 'Pending' only once the case is actually stuck. */
export function stuckResolution(days: number, stuckDays: number = STUCK_DAYS): string {
  return days > stuckDays ? 'Pending' : 'N/A';
}

/**
 * The appointment-status pill.
 *
 * DEFECT (pinned, not fixed): this is a bare truthiness check on `attended`, so a CANCELLED
 * appointment that was never attended reads 'Scheduled' — indistinguishable from one still to come.
 * The clone dashboard's appointmentStatusClass() checks `cancelled` first; this board never does.
 */
export function appointmentStatusLabel(attended: any): string {
  return attended ? 'Completed' : 'Scheduled';
}

// =================================================================================================
// Appointment type → delivery stage
// =================================================================================================

/**
 * Which kanban column an appointment type belongs to (component categoryMap, line 660).
 *
 * Matching is EXACT and case-sensitive on the appointment-type name stored in Firestore — there is no
 * normalisation and no fuzzy fallback, so a renamed or re-cased appointment type silently drops out of
 * every column and off the board.
 */
export const APPOINTMENT_CATEGORY_MAP: Readonly<Record<string, string>> = {
  'Welcome To WiSH': 'welcomeCall',

  'EI Starter Pack Clarity Call': 'clarityCall',

  'A&H Light Diagnostics': 'diagnostics',
  'EI Starter Pack Diagnostics': 'diagnostics',
  'WiSH Diagnostics': 'diagnostics',
  'Critical Support Diagnostics': 'diagnostics',
  'EI Diagnostics': 'diagnostics',

  'EI Implementation': 'implementation',
  'WiSH Implementation': 'implementation',
  'Critical Support Implementation': 'implementation',
  'A&H Light Implementation': 'implementation',
  'EI Starter Pack Implementation': 'implementation',

  'Critical Support Mid Review': 'midReviewDiagnostics',
  'A&H Light Mid Review': 'midReviewDiagnostics',

  'A&H Light Review': 'finalReview',
  'EI Review': 'finalReview',
  'WiSH Review': 'finalReview',
  'EI Starter Pack Review': 'finalReview',
  'Critical Support Review': 'finalReview',
  'WiSH Final Review Call': 'finalReview',

  'EI Celebration Call': 'completed',
  'WiSH Celebration Call': 'completed',
  'WiSH Experience Call': 'completed',
};

/**
 * Stage for an appointment type name, or null when unmapped.
 *
 * DEFECT (pinned, not fixed): the map has no 'implementationPhase2' entry at all, yet the board
 * renders an Implementation Phase 2 column. That column can therefore only ever be empty.
 */
export function appointmentCategory(
  typeName: string | null | undefined,
  map: Readonly<Record<string, string>> = APPOINTMENT_CATEGORY_MAP,
): string | null {
  if (!typeName) return null;
  return map[typeName] || null;
}

/** The product filter's keyword sets (component productKeywordsMap, line 708). */
export const PRODUCT_KEYWORDS_MAP: Readonly<Record<string, string[]>> = {
  'WISH': ['WiSH'],
  'A&H LIGHT': ['A&H Light'],
  'EI Solution': ['EI Solution', 'EI Celebration', 'EI Implementation', 'EI Diagnostics', 'EI Review'],
  'EI Starter Pack': ['EI Starter Pack'],
  'Critical Support': ['Critical Support'],
};

/** The sentinel that means "no product filter". */
export const ALL_PRODUCTS = 'All Products Overview';

/**
 * Does an appointment type belong to the selected product?
 *
 * 'All Products Overview' passes everything. Matching is a case-sensitive SUBSTRING test against the
 * product's keyword list.
 *
 * DEFECT (pinned, not fixed): an unknown product name yields an EMPTY keyword list, and
 * `[].some(...)` is false — so selecting a product that is not in the map hides every row rather than
 * falling back to showing all. The 'EI Starter Pack' keywords are also a strict prefix of nothing in
 * 'EI Solution', but 'EI Solution' does not list 'EI Starter Pack', so a Starter Pack appointment
 * never leaks into the EI Solution view — that part is deliberate.
 */
export function matchesProductSelection(
  appointmentTypeName: string | null | undefined,
  selectedProduct: string,
  map: Readonly<Record<string, string[]>> = PRODUCT_KEYWORDS_MAP,
): boolean {
  if (selectedProduct === ALL_PRODUCTS) return true;
  const keywords = map[selectedProduct] || [];
  const name = appointmentTypeName || '';
  return keywords.some((keyword) => name.includes(keyword));
}

// =================================================================================================
// Month windows and date helpers
// =================================================================================================

/** A new Date at local midnight of the given day. Never mutates its argument. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** A new Date at the last representable millisecond of the given day. Never mutates its argument. */
export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** First and last calendar day of the month containing `d` (day 0 of the next month = last of this). */
export function monthBounds(d: Date): { start: Date; end: Date } {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
  };
}

/** The first of the month `delta` months away — the prev/next month buttons. Rolls over the year. */
export function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** The "September 2026" heading. */
export function displayMonthLabel(d: Date, names: string[] = MONTH_NAMES): string {
  return `${names[d.getMonth()]} ${d.getFullYear()}`;
}

/** The "2026-09" key the rest of the component keys data by. Month is 1-based and zero-padded. */
export function monthYearKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The month window the appointment query is actually run over.
 *
 * DEFECT (pinned, not fixed): the window is built at LOCAL midnight and then shifted forward by a
 * hard-coded 5h30m "IST offset". On a machine already running in IST that pushes the whole window
 * 5½ hours late — appointments in the first 5½ hours of the 1st are missed and 5½ hours of the next
 * month leak in. On any other timezone the skew is different again. The offset is a constant, not a
 * function of the runtime zone, so this is wrong everywhere; it is kept because changing it moves
 * every count on the board.
 */
export function istShiftedMonthWindow(
  selectedMonth: Date,
  offsetMinutes: number = IST_OFFSET_MINUTES,
): { start: Date; end: Date } {
  const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  start.setTime(start.getTime() + offsetMinutes * 60 * 1000);
  end.setTime(end.getTime() + offsetMinutes * 60 * 1000);
  return { start, end };
}

/** Inclusive at both ends. A null date is never in range. */
export function isWithinRange(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

/** Firestore Timestamp / Date / anything → Date, or null. Only `toDate()` is probed. */
export function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  return value?.toDate ? value.toDate() : value;
}

/**
 * `startDate`..`endDate` for the "last N days" quick filters: N days back from today, through today.
 * Built with setDate(), so it rolls across month and year boundaries correctly.
 */
export function lastNDaysRange(days: number, now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return { start, end: new Date(now) };
}

// =================================================================================================
// Pagination
// =================================================================================================

/** Total pages for a row count. An empty list is 0 pages, not 1. */
export function totalPagesFor(rowCount: number, itemsPerPage: number): number {
  return Math.ceil(rowCount / itemsPerPage);
}

/**
 * Clamp the current page after the row count changed.
 * Only pulls a too-high page DOWN, and only when there is at least one page to land on — page 1 of an
 * empty table is left alone rather than becoming page 0.
 */
export function clampPage(currentPage: number, totalPages: number): number {
  if (currentPage > totalPages && totalPages > 0) return totalPages;
  return currentPage;
}

/** The rows on one page. 1-based page numbers. */
export function pageSlice<T>(rows: T[], currentPage: number, itemsPerPage: number): T[] {
  const startIndex = (currentPage - 1) * itemsPerPage;
  return rows.slice(startIndex, startIndex + itemsPerPage);
}

/**
 * The window of page numbers to draw.
 *
 * Up to `maxPagesToShow` pages, centred on the current page where possible, and SHUNTED BACK so the
 * window always shows a full `maxPagesToShow` pages when it hits the end of the list — the last page
 * does not leave a short, ragged pager.
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
// Table filtering
// =================================================================================================

/** The already-resolved fields the row filter compares against. The caller does the map lookups. */
export interface RowFilterFields {
  /** Participant display name, '' when unknown. */
  name: string;
  /** Resolved journey name, '' when unknown. */
  journeyName: string;
  /** Product name as stored on the row, '' when absent. */
  productName: string;
}

export interface RowFilterCriteria {
  /** Already lower-cased and trimmed by the caller. */
  searchTerm: string;
  selectedJourneys: string[];
  selectedProducts: string[];
}

/**
 * Does one row survive the search / journey / product filters? All three are ANDed.
 *
 * Each filter is skipped when it is empty, so an untouched filter bar matches everything.
 * - search is a case-insensitive SUBSTRING match on the NAME ONLY — not on journey, product, notes or
 *   anything else the table shows;
 * - journey is an EXACT membership test;
 * - product is a SUBSTRING test, so selecting "EI" would also match "EI Starter Pack".
 */
export function matchesRowFilters(fields: RowFilterFields, criteria: RowFilterCriteria): boolean {
  let matchesSearch = true;
  let matchesJourney = true;
  let matchesProduct = true;

  if (criteria.searchTerm) {
    matchesSearch = fields.name.toLowerCase().includes(criteria.searchTerm);
  }
  if (criteria.selectedJourneys.length > 0) {
    matchesJourney = criteria.selectedJourneys.includes(fields.journeyName);
  }
  if (criteria.selectedProducts.length > 0) {
    matchesProduct = criteria.selectedProducts.some((prod) => fields.productName.includes(prod));
  }
  return matchesSearch && matchesJourney && matchesProduct;
}

/** Is any filter actually narrowing the table? Drives whether the search path or the plain path runs. */
export function hasActiveTableFilter(formValue: { search?: any; journey?: any[]; product?: any[] }): boolean {
  return !!(formValue.search || (formValue.journey?.length ?? 0) > 0 || (formValue.product?.length ?? 0) > 0);
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
 * DEFECT (pinned, not fixed): there is no guard on an empty state map, so 0 of 0 produces NaN, which
 * renders as an empty progress bar rather than a full or absent one.
 */
export function loadingProgressPct(loadingStates: Record<string, unknown>): number {
  const loaded = loadedCount(loadingStates);
  const total = Object.keys(loadingStates).length;
  return (loaded / total) * 100;
}

// =================================================================================================
// Export and display text
// =================================================================================================

/** The financial column in the exported spreadsheet — deliberately louder than the on-screen wording. */
export function exportFinancialLabel(financialdata: any): string {
  return financialdata === 'Cleared' ? 'ELIGIBLE' : 'NOT CLEARED';
}

/** The bottleneck column: what to do about this row, derived purely from the financial column. */
export function exportBottleneckLabel(financialdata: any): string {
  return financialdata === 'Cleared' ? 'Ready for Initiation' : 'Payment Follow-up';
}

/** "12 DAYS". An absent value exports as "0 DAYS", not blank. */
export function exportWaitingPeriodLabel(value: any): string {
  return `${value || 0} DAYS`;
}

/**
 * The most recent note's text, or 'N/A'.
 *
 * DEFECT (pinned, not fixed): a note object that exists but has an empty `note` string also renders
 * 'N/A', so "someone wrote a blank note" and "nobody wrote anything" are indistinguishable.
 */
export function lastNoteText(notes: any): string {
  if (notes && notes.length > 0) {
    return notes[notes.length - 1].note || 'N/A';
  }
  return 'N/A';
}

/**
 * The banner explaining which quick-filter is active. An unknown or absent filter explains nothing
 * (empty string), which the template uses to hide the banner entirely.
 */
export function filterDisplayText(activeFilter: string): string {
  switch (activeFilter) {
    case 'readyForInitiation':
      return 'Showing only participants with cleared payment';
    case 'clearedMoreThan7Days':
      return 'Showing only participants waiting 7+ days with cleared payment';
    case 'clearedMoreThan30Days':
      return 'Showing only participants waiting 30+ days with cleared payment';
    case 'initiatedToday':
      return 'Showing only participants initiated today';
    case 'todayActivity':
      return 'Showing today\'s activity (initiated and appointments)';
    case 'last7DaysActivity':
      return 'Showing last 7 days activity';
    case 'last30DaysActivity':
      return 'Showing last 30 days activity';
    case 'thisMonthActivity':
      return 'Showing this month\'s activity';
    case 'welcomeCall':
      return 'Showing participants in Welcome Call stage';
    case 'clarityCall':
      return 'Showing participants in Clarity Call stage';
    case 'diagnostics':
      return 'Showing participants in Diagnostics stage';
    case 'implementation':
      return 'Showing participants in Implementation stage';
    case 'midReviewDiagnostics':
      return 'Showing participants in Mid Review - Diagnostics stage';
    case 'implementationPhase2':
      return 'Showing participants in Implementation Phase 2 stage';
    case 'finalReview':
      return 'Showing participants in Final Review stage';
    case 'completed':
      return 'Showing completed participants';
    default:
      return '';
  }
}
