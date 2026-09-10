/**
 * Delivery Dashboard Rules Engine (pure, dependency-free).
 *
 * The arithmetic and the decisions behind the Delivery Dashboard: how long a participant has been
 * waiting and how urgent that makes them, whether their payments clear them to start, which
 * "needs attention" cohort they fall into and how hard it should be escalated, the funnel averages
 * and percentages on the product cards, and the label/colour rules that turn all of that into
 * something on screen.
 *
 * Extracted from DeliveryDashboardCloneComponent (6,547 lines) on 2026-09-10, following the pattern
 * already set by priority.engine.ts in ../journey-coach-health-dashboard. The logic is UNCHANGED —
 * same thresholds, same comparison operators, same rounding, same strings, same quirks. Only its
 * location moved. Several known oddities (documented as DEFECT notes below) were deliberately left
 * intact and pinned by tests rather than fixed, because this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO DOM. Every function takes its inputs as arguments and returns a
 *   value, so the rules can be exercised offline instead of standing up a 6,500-line component that
 *   injects two Firestore instances, a Router, an NgZone and a MatDialog.
 * - As methods on that component the rules were only reachable through a rendered template. An e2e
 *   case could assert that a chip said "HIGH" — it could not tell a 10-day threshold from an 11-day
 *   one, so a shifted boundary passed silently.
 * - These are product decisions, not implementation details. 14/10/5 days deciding URGENT/HIGH/
 *   MEDIUM, 7 days idle, 15 days stuck, 21/30 days escalation, and the excluded delivery modes all
 *   change who a delivery manager chases today. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, walks `this.allMatchedProductsRaw` / `this.mapMetaData`, resolves
 *   product-group ids, mutates `originalData`, opens modals, sorts tables or exports Excel. Where a
 *   method mixed both, only the pure core moved and the component still does its own gathering —
 *   see populateActionableCohorts(), which still walks the raw product list itself and only asks the
 *   engine the questions (eligible? which cohort? how bad?).
 *
 * Thresholds are exported as named constants and, where a caller had its own copy, are injectable so
 * a test can pin a boundary without rewriting a constant.
 */

// =================================================================================================
// Thresholds — the component's own readonly values, kept as the defaults so behaviour is identical.
// =================================================================================================

/** getPriorityLabel() bands (delivery-dashboard-clone.component.ts:4389). */
export const PRIORITY_URGENT_DAYS = 14;
export const PRIORITY_HIGH_DAYS = 10;
export const PRIORITY_MEDIUM_DAYS = 5;

/** Actionable-cohort cut-offs (component IDLE_DAYS / STUCK_DAYS, lines 6432-6433). */
export const IDLE_DAYS = 7;
export const STUCK_DAYS = 15;

/** Escalation bands inside the stuck cohort (line 6514). Both are strict `>`. */
export const ESCALATION_HIGH_DAYS = 30;
export const ESCALATION_MEDIUM_DAYS = 21;

/** Delivery modes that never count as payment-eligible (component excludedModes, line 989). */
export const EXCLUDED_MODES: ReadonlySet<string> = new Set([
  'installation event mode',
  'event mode',
  'integration mode',
]);

/** Statuses that drop a participant out of the actionable board entirely (line 6447). */
export const REJECTED_STATUSES: ReadonlySet<string> = new Set(['rejected', 'cancelled', 'inactive']);

/** Specialist-utilisation tone bands (utilTone, line 6207). Utilisation is a 0..1 fraction. */
export const UTIL_HIGH = 0.85;
export const UTIL_MED = 0.6;
export const UTIL_LOW = 0.3;

/** Product-row dot palette, cycled by index (productDotClass, line 2845). */
export const DOT_PALETTE = ['dot-indigo', 'dot-teal', 'dot-emerald', 'dot-amber', 'dot-violet'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
 * Band a waiting period, in whole days, into the chip shown beside a participant.
 * Every comparison is `>=`, so each threshold day itself belongs to the HIGHER band.
 */
export function priorityLabel(waitingPeriod: number, bands: PriorityBands = PRIORITY_DEFAULTS): PriorityLabel {
  if (waitingPeriod >= bands.urgentDays) return 'URGENT';
  if (waitingPeriod >= bands.highDays) return 'HIGH';
  if (waitingPeriod >= bands.mediumDays) return 'MEDIUM';
  return 'LOW';
}

/**
 * Whole days elapsed since `onboardedtime`, floored.
 *
 * DEFECT (pinned, not fixed): a falsy date yields 0, which bands as LOW — indistinguishable from a
 * participant onboarded today. A future date yields a negative number that is NOT clamped, so it
 * also bands LOW. Both were the pre-extraction behaviour.
 */
export function waitingDaysSince(onboardedtime: Date | null | undefined, now: Date = new Date()): number {
  if (!onboardedtime) return 0;
  const timeDifference = now.getTime() - onboardedtime.getTime();
  return Math.floor(timeDifference / MS_PER_DAY);
}

/** The subset of a participant row the waiting-period rule reads. */
export interface WaitingPeriodInput {
  /** A pre-computed value, e.g. one the cohort builder already stamped on the row. */
  waitingperiod?: number;
  /** Otherwise, when the row was initiated. */
  initiatedtime?: Date | null;
}

/**
 * Waiting period for a participant row.
 *
 * Precedence matters: an explicitly stamped `waitingperiod` ALWAYS wins, even when it is 0 or
 * negative — only `undefined` falls through to the initiated timestamp. A row with neither is 0.
 */
export function waitingPeriodFor(participant: WaitingPeriodInput, now: Date = new Date()): number {
  if (participant.waitingperiod !== undefined) return participant.waitingperiod;
  if (participant.initiatedtime) return waitingDaysSince(participant.initiatedtime, now);
  return 0;
}

// =================================================================================================
// Date helpers — the small maths every rule above is built on
// =================================================================================================

/** Firestore Timestamp / Date / epoch / parseable string → Date, or null when there is nothing. */
export function dateFromField(field: any): Date | null {
  if (!field) return null;
  return field?.toDate?.() || new Date(field);
}

/** Stricter variant used by the analytics tab: anything unrecognised becomes null rather than an Invalid Date. */
export function toDateOrNull(ts: any): Date | null {
  if (!ts) return null;
  if (ts?.toDate) return ts.toDate() as Date;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  return null;
}

/**
 * Whole days since a timestamp, floored and CLAMPED AT ZERO — unlike waitingDaysSince(), a future
 * timestamp reads as 0 here. Unparseable or absent input is also 0.
 */
export function daysSince(ts: any, now: Date = new Date()): number {
  if (!ts) return 0;
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  if (!d || isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY));
}

/**
 * "N days" / "1 day" — the delay text beside a stalled participant.
 *
 * DEFECT (pinned, not fixed): unlike daysSince() this does NOT validate the date, so an unparseable
 * input renders the literal string "NaN days" in the table. It also does not clamp, so a future date
 * renders "-3 days".
 */
export function daysDifferenceLabel(targetDate: any, now: Date = new Date()): string {
  const date = targetDate?.toDate ? targetDate.toDate() : new Date(targetDate);
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / MS_PER_DAY);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
}

/** Same calendar month AND year as `now`. */
export function isDateInCurrentMonth(date: Date, now: Date = new Date()): boolean {
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/** The calendar month after `now` — built via new Date(y, m + 1, 1) so December rolls into next January. */
export function isDateInNextMonth(date: Date, now: Date = new Date()): boolean {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return date.getMonth() === nextMonth.getMonth() && date.getFullYear() === nextMonth.getFullYear();
}

/**
 * Inclusive range test.
 *
 * NOTE the deliberate fail-open: when either bound is missing the answer is TRUE ("no filter set"),
 * and a null date also returns true. Only a real date against two real bounds is actually filtered.
 */
export function isDateInRange(date: Date | null, start: Date | null, end: Date | null): boolean {
  if (!start || !end || !date) return true;
  return date >= start && date <= end;
}

/**
 * ISO date (YYYY-MM-DD) of the Monday that starts the given date's week, Monday-first.
 *
 * DEFECT (pinned, not fixed): the day is snapped to LOCAL midnight and then serialised with
 * toISOString(), which is UTC. East of Greenwich that shifts the answer back to the Sunday. All
 * seven days of a week still agree with each other, so week GROUPING is sound; only the label can be
 * a day early. Tests assert the grouping property, not a timezone-dependent literal.
 */
export function weekMondayIso(d: Date): string {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  day.setDate(day.getDate() - dow);
  day.setHours(0, 0, 0, 0);
  return day.toISOString().slice(0, 10);
}

/**
 * Compact axis label for a velocity week, e.g. "May 18".
 *
 * DEFECT (pinned, not fixed): a bare "YYYY-MM-DD" string is parsed as UTC midnight but read back
 * with local getters, so west of Greenwich the label is the previous day. Kept as-is.
 */
export function velocityWeekLabel(week: string): string {
  if (!week) return '';
  const d = new Date(week);
  const m = d.toLocaleString('en-US', { month: 'short' });
  return `${m} ${d.getDate()}`;
}

/** A subscription that has already ended. Absent end date means "still running", not "ended". */
export function isSubscriptionEnded(subscriptionend: any, now: Date = new Date()): boolean {
  if (!subscriptionend) return false;
  const endDate = subscriptionend?.toDate?.() || new Date(subscriptionend);
  return endDate < now;
}

// =================================================================================================
// Payment eligibility
// =================================================================================================

/** What the eligibility rule actually reads. Raw values — they are parsed here, exactly as before. */
export interface EligibilityInput {
  /** meta.pp_totalpaid — string or number as stored. */
  totalPaid: any;
  /** meta.pp_totalpurchasevalue. */
  totalPurchaseValue: any;
  /** The product's minimumpayment. */
  minimumPayment: any;
  /** The participant's delivery mode, ALREADY lower-cased and trimmed by the caller. */
  participantMode: string;
}

/**
 * Is this participant financially clear to start?
 *
 * Two independent ways to qualify: the balance is fully settled (<= 0), OR enough has been paid to
 * meet the product's minimum. Either way an excluded delivery mode vetoes it outright — those modes
 * are delivered under a different commercial arrangement and must never appear as "ready".
 *
 * DEFECT (pinned, not fixed): every amount goes through parseInt, so decimals are TRUNCATED —
 * paying 99.99 against a 100 minimum parses to 99 and stays ineligible. Absent/garbage values
 * become 0, which makes a participant with no purchase record look fully settled (balance 0 - 0
 * <= 0) and therefore ELIGIBLE.
 */
export function isPaymentEligible(
  input: EligibilityInput,
  excludedModes: ReadonlySet<string> = EXCLUDED_MODES,
): boolean {
  const totalPaid = parseInt(input.totalPaid ?? '0') || 0;
  const totalPurchaseValue = parseInt(input.totalPurchaseValue ?? '0') || 0;
  const totalBalance = totalPurchaseValue - totalPaid;
  const minPayment = parseInt(input.minimumPayment) || 0;
  return !excludedModes.has(input.participantMode) && (totalBalance <= 0 || totalPaid >= minPayment);
}

/** The financial column's text, derived straight from eligibility. */
export function financialLabel(eligible: boolean): string {
  return eligible ? 'Cleared' : 'Not Scheduled';
}

// =================================================================================================
// Actionable cohorts — who needs attention, and how badly
// =================================================================================================

export type EscalationLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CohortThresholds {
  idleDays: number;
  stuckDays: number;
}

const COHORT_DEFAULTS: CohortThresholds = { idleDays: IDLE_DAYS, stuckDays: STUCK_DAYS };

/** What the cohort rules read. `status` is ALREADY lower-cased and trimmed by the caller. */
export interface CohortInput {
  status: string;
  eligible: boolean;
  daysSinceInitiated: number;
  daysSinceActivity: number;
}

export interface CohortFlags {
  /** Finished or written off — off the actionable board entirely, and in no other cohort. */
  excluded: boolean;
  /** No status yet and payment is clear: ready for initiation. */
  awaiting: boolean;
  /** Initiated but sat untouched past the idle threshold. */
  idle: boolean;
  /** Initiated or ongoing with no activity past the stuck threshold. */
  stuck: boolean;
}

/**
 * Place one participant/product row into the attention cohorts.
 *
 * Ordering is load-bearing and matches the original loop:
 *   1. completed / rejected / cancelled / inactive drops out before anything else is considered;
 *   2. "no status yet AND eligible" is AWAITING and stops there — an awaiting row is never also
 *      idle or stuck, because the original `continue`d;
 *   3. otherwise idle and stuck are independent and a row can be BOTH (initiated, 15+ days quiet,
 *      counts once in each list).
 *
 * NOTE: an ineligible row with no status falls through to step 3 and, having no status, matches
 * neither idle nor stuck — it is invisible on the board. That is the existing behaviour.
 */
export function classifyCohorts(input: CohortInput, thresholds: CohortThresholds = COHORT_DEFAULTS): CohortFlags {
  if (input.status === 'completed' || REJECTED_STATUSES.has(input.status)) {
    return { excluded: true, awaiting: false, idle: false, stuck: false };
  }
  if (!input.status && input.eligible) {
    return { excluded: false, awaiting: true, idle: false, stuck: false };
  }
  return {
    excluded: false,
    awaiting: false,
    idle: input.status === 'initiated' && input.daysSinceInitiated >= thresholds.idleDays,
    stuck: (input.status === 'initiated' || input.status === 'ongoing')
      && input.daysSinceActivity >= thresholds.stuckDays,
  };
}

/**
 * How hard a stuck case should be escalated.
 * Both comparisons are STRICT `>`, so exactly 30 days is MEDIUM and exactly 21 days is LOW.
 */
export function escalationLevel(days: number): EscalationLevel {
  return days > ESCALATION_HIGH_DAYS ? 'HIGH' : days > ESCALATION_MEDIUM_DAYS ? 'MEDIUM' : 'LOW';
}

/** The issue text for a stuck row — 'ongoing' means it stalled mid-flow, anything else never got going. */
export function stuckIssueType(status: string): string {
  return status === 'ongoing' ? 'Stuck mid-flow' : 'Initiated · stalled';
}

// =================================================================================================
// Funnel arithmetic — totals, averages and percentages on the product cards
// =================================================================================================

/** One measured span between two status timestamps. Either end may be missing. */
export interface DaySpan {
  from: Date | null;
  to: Date | null;
}

/**
 * Mean gap in whole days across the spans that have BOTH ends, rounded.
 *
 * Spans with a missing end are skipped entirely — they do not drag the mean toward zero. With
 * nothing measurable the answer is 0, which the cards render the same as "instant"; that ambiguity
 * is pre-existing. The gap is Math.abs()'d, so a completed-before-started row still contributes a
 * positive number rather than cancelling others out.
 */
export function averageDaysBetween(spans: DaySpan[]): number {
  let total = 0;
  let count = 0;
  for (const span of spans) {
    if (span.from && span.to) {
      total += Math.abs(span.to.getTime() - span.from.getTime()) / MS_PER_DAY;
      count++;
    }
  }
  return count > 0 ? Math.round(total / count) : 0;
}

/** Completed as a whole percentage of the cohort. An empty cohort is 0%, not a division by zero. */
export function conversionRatePct(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * A bar's width as a percentage of the biggest bar, with a 4% FLOOR so a product with one
 * participant still draws something visible rather than a zero-width sliver.
 */
export function pctOfMax(value: number, max: number): number {
  return Math.max(4, Math.round((value / max) * 100));
}

/**
 * The average-completion gauge, as a percentage of target, CAPPED AT 150 so a pathological average
 * cannot run the gauge off the end of its track. There is no floor — 0 is a legitimate reading.
 */
export function avgTimePct(value: number, target: number): number {
  return Math.min(150, Math.round((value / target) * 100));
}

/** Sparkline scale: never below 1, so an all-zero series still has a denominator. */
export function sparkMax(values: number[]): number {
  return Math.max(1, ...values);
}

/**
 * Loading bar percentage.
 *
 * DEFECT (pinned, not fixed): there is no guard on `total`, so 0 of 0 produces NaN, which renders
 * as an empty width. Callers currently always pass a non-empty map.
 */
export function loadingProgressPct(loaded: number, total: number): number {
  return (loaded / total) * 100;
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
    let end = Math.min(totalPages, start + maxPagesToShow - 1);
    if (end === totalPages) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
  }
  return pages;
}

// =================================================================================================
// Label and colour rules
// =================================================================================================

/**
 * Stage name → kanban column colour class.
 *
 * Matching is by SUBSTRING on the lower-cased name, and the order below is the precedence: a stage
 * called "Diagnostic Review" is a diagnostic, not a review, because diagnostic is tested first.
 * Anything unrecognised — including an empty name — falls back to the eligible colour.
 */
export function stageColorClass(stage: string): string {
  if (!stage) return 'col--eligible';
  const s = stage.toLowerCase().trim();
  if (s.includes('eligible')) return 'col--eligible';
  if (s.includes('request')) return 'col--request';
  if (s.includes('pre-process')
    || s.includes('preprocess')
    || s.includes('welcome')) return 'col--preprocess';
  if (s.includes('diagnostic')) return 'col--diagnostic';
  if (s.includes('implement')) return 'col--implement';
  if (s.includes('review')) return 'col--review';
  if (s.includes('complet')
    || s.includes('post-process')
    || s.includes('celebration')
    || s.includes('check-in')) return 'col--completion';
  return 'col--eligible';
}

/** Cycle the five-colour dot palette by row index. */
export function productDotClass(idx: number, palette: string[] = DOT_PALETTE): string {
  return palette[idx % palette.length];
}

/**
 * Up-to-three-letter monogram for a product avatar.
 *
 * Leading punctuation is stripped, then: one word → its first two characters, two words → both
 * initials, three or more → the first three initials (later words are ignored). Nothing usable
 * gives '?'.
 *
 * DEFECT (pinned, not fixed): only LEADING punctuation is removed, so "EI-Starter Pack" keeps the
 * hyphen inside the first token and reads "EI"; and a single one-letter word yields a one-character
 * monogram rather than padding.
 */
export function productMonogram(name: string): string {
  if (!name) return '?';
  const cleaned = name.trim().replace(/^[^a-zA-Z0-9]+/, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
}

/** Specialist utilisation (0..1) → heat tone. All comparisons are `>=`, so each band owns its edge. */
export function utilTone(util: number, bands = { high: UTIL_HIGH, med: UTIL_MED, low: UTIL_LOW }): string {
  if (util >= bands.high) return 'high';
  if (util >= bands.med) return 'med';
  if (util >= bands.low) return 'low';
  return 'min';
}

/** What the appointment-status rule reads. */
export interface AppointmentStatusInput {
  cancelled?: any;
  attended?: any;
  starttime?: any;
  date?: any;
}

/**
 * Appointment → status pill class.
 *
 * Strict precedence, and it is the reason a cancelled-but-attended appointment reads CANCELLED:
 * cancelled beats attended beats scheduled beats submitted. An appointment with none of the four
 * fields is "not scheduled".
 */
export function appointmentStatusClass(app: AppointmentStatusInput | null | undefined): string {
  if (app?.cancelled) return 'status-cancelled';
  else if (app?.attended) return 'status-completed';
  else if (app?.starttime) return 'status-scheduled';
  else if (app?.date) return 'status-submitted';
  else return 'status-notscheduled';
}

/**
 * "Last updated" stamp from an elapsed second count.
 * Under 5s reads "just now"; then seconds, then whole minutes, then whole hours. It never rolls over
 * to days — a dashboard left open overnight reads "14h ago".
 */
export function relativeUpdatedLabel(diffSeconds: number): string {
  const diff = diffSeconds;
  if (diff < 5) return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
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
