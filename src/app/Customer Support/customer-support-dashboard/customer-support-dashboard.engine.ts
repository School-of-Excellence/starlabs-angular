/**
 * Customer Support Dashboard Engine (pure, dependency-free).
 *
 * The rules behind the Customer Support dashboard: which tickets survive the seventeen-clause filter
 * form, how a negligence score becomes a band, which tiles a ticket increments, how the header sort
 * cycles and orders, the age buckets on the category report, the two "days" counters on every row, the
 * ISO-ish week number the negligence filter keys off, and the small typeaheads behind the dropdowns.
 *
 * Extracted from CustomerSupportDashboardComponent (1,911 lines) on 2026-09-10, following the pattern
 * set by delivery-dashboard.engine.ts and content-analytics.engine.ts. The logic is UNCHANGED — same
 * comparison operators, same `?.` placement (and same places where it is MISSING), same strings, same
 * rounding. Every oddity found is marked DEFECT below and pinned by a test rather than fixed, because
 * this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs. Every function takes its inputs as arguments, so the rules can be
 *   exercised offline instead of standing up a component that injects a Firestore, a FormBuilder, a
 *   DatePipe, a MatDialog, a MatSnackBar, a Router and a DateAdapter.
 * - THE E2E SUITE IS CURRENTLY RED HERE. The failures are unguarded `.toLowerCase()` /
 *   `.localeCompare()` calls on values Firestore does not guarantee — a ticket with no status, a journey
 *   doc with no name, a chat-admin id with no profile. Those cases are pinned as DEFECT tests below
 *   asserting the CURRENT throw, so the exact trigger is documented rather than argued about. They are
 *   NOT fixed here; fixing them is a separate, deliberate change.
 * - These are product decisions. Whether a negligence score of 5 is "high" or "moderate", whether a
 *   re-opened ticket counts as open, and which tickets a "greater than 8" filter returns all decide what
 *   a support lead chases today.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads or writes Firestore, patches the reactive form, opens a dialog, exports Excel or
 *   renders a PNG. Where a method mixed both, only the pure core moved: allCases() still walks the
 *   snapshot itself and only asks the engine the questions (open? which chat band? which negligence
 *   band? re-opened?).
 */

// =================================================================================================
// Negligence bands — the component's own thresholds, in both places it applied them.
// =================================================================================================

/** Above this, a ticket is "gross" negligence. Strict `>`. */
export const NEGLIGENCE_GROSS_ABOVE = 8;
/** A "high" score is strictly below 9 AND strictly above 5. */
export const NEGLIGENCE_HIGH_BELOW = 9;
export const NEGLIGENCE_HIGH_ABOVE = 5;
/** "Moderate" is an exact membership test, not a range. */
export const NEGLIGENCE_MODERATE_SCORES: readonly number[] = [4, 5];
/** "Low" is an exact membership test too. */
export const NEGLIGENCE_LOW_SCORES: readonly number[] = [1, 2, 3];

export type NegligenceBand = 'gross' | 'high' | 'moderate' | 'low' | 'none' | null;

// =================================================================================================
// Shapes — only the fields the rules touch.
// =================================================================================================

/** A Firestore Timestamp, as far as these rules care. */
export interface TimestampLike {
  toDate?: () => Date;
  seconds?: number;
}

export interface TicketStatus {
  status?: string;
  date?: TimestampLike;
  editedBy?: string;
}

export interface Ticket {
  issue?: string;
  name?: string;
  email?: string;
  issueno?: any;
  status?: TicketStatus;
  category?: string;
  journey?: { id?: string };
  assign?: string[];
  review?: any;
  peopleinvolved?: string[];
  chatstatus?: string;
  flag?: boolean;
  negligencemetrics?: Record<string, number>;
  priority?: string;
  reporteddate?: TimestampLike;
  [key: string]: any;
}

/** The filter form's raw value. */
export interface TicketFilterValue {
  search?: any;
  status?: any;
  category?: any[];
  journey?: any[];
  assign?: any[];
  reviewedby?: any[];
  peopleinvolved?: any[];
  chatstatus?: any;
  flag?: any;
  review?: any;
  metrics?: any;
  priority?: any[];
  ticketstart?: any;
  ticketend?: any;
  closedstart?: any;
  closedend?: any;
  [key: string]: any;
}

// =================================================================================================
// Status + chat-status classification
// =================================================================================================

/**
 * Does this ticket count as open on the dashboard tiles?
 *
 * A SUBSTRING test, so "Open", "Reopened" and "open again" all count. That is deliberate on the tiles.
 *
 * DEFECT 1 (pinned, not fixed): the category report (openTicketsForReport below) uses strict equality
 * with 'open' instead, so a ticket whose status reads "Reopened" is counted by the tiles and ignored by
 * the report. The two numbers on the same screen disagree, and neither is labelled as approximate.
 *
 * DEFECT 1b (pinned, not fixed) — UNGUARDED. The `?.` sits on `.status`, not on the status MAP, exactly
 * as the component wrote it (`element['status']['status']?.toLowerCase()`, lines 408/425/432). A ticket
 * document with no `status` map throws here, aborting the whole snapshot loop — so ONE malformed
 * document leaves every tile on the dashboard reading its reset value of 0.
 */
export function isOpenStatus(status: TicketStatus): boolean {
  return !!status['status']?.toLowerCase().includes('open');
}

/** Mirror of the above for closed. Also a substring test ('close', not 'closed'), and equally unguarded. */
export function isClosedStatus(status: TicketStatus): boolean {
  return !!status['status']?.toLowerCase().includes('close');
}

/**
 * Which chat tile an OPEN ticket increments, or null for none.
 *
 * DEFECT 2 (pinned, not fixed): 'New' is compared CASE-SENSITIVELY (`== 'New'`) while every sibling
 * branch lower-cases first. A ticket written as 'new' by any other screen or a Cloud Function lands in
 * no tile at all: it is counted in `opentickets` but appears in none of new/responded/pending, so the
 * three sub-tiles silently fail to add up to the total.
 */
export function openChatBand(chatstatus: any): 'new' | 'responded' | 'pending' | null {
  if ([null, undefined, ''].includes(chatstatus)) return null;
  if (chatstatus == 'New') return 'new';
  if (chatstatus?.toLowerCase() == 'responded') return 'responded';
  if (['decision making', 'pending'].includes(chatstatus?.toLowerCase())) return 'pending';
  return null;
}

/**
 * Which negligence band a weekly score falls into.
 *
 * DEFECT 3 (pinned, not fixed): the bands do not cover the number line. 'high' is `< 9 && > 5`,
 * 'moderate' is exact membership of [4, 5] and 'low' is exact membership of [1, 2, 3], so any
 * non-integer between 0 and 4 — 3.5, 0.5 — and anything above 5 that is not an integer below 9 falls
 * through to `null` and is counted on NO tile. A partially-scored week silently under-reports.
 */
export function negligenceBand(score: any): NegligenceBand {
  if (score > NEGLIGENCE_GROSS_ABOVE) return 'gross';
  if (score < NEGLIGENCE_HIGH_BELOW && score > NEGLIGENCE_HIGH_ABOVE) return 'high';
  if (NEGLIGENCE_MODERATE_SCORES.includes(score)) return 'moderate';
  if (NEGLIGENCE_LOW_SCORES.includes(score)) return 'low';
  if (score == 0) return 'none';
  return null;
}

/**
 * Was this ticket re-opened by someone outside the chat-admin team?
 *
 * Only open tickets can be re-opened; everything else is explicitly false.
 */
export function isReopened(
  status: TicketStatus,
  chatadminUsers: string[] | null | undefined,
): boolean {
  if (!isOpenStatus(status)) return false;
  if ([null, undefined, ''].includes(status?.editedBy as any)) return false;
  return !(chatadminUsers || []).includes(status?.editedBy as string);
}

/** Has anyone reviewed this ticket? The component's isIdPresent(), whose name no longer matches. */
export function hasReview(ticket: any): boolean {
  if (![null, undefined, ''].includes(ticket['review'])) {
    return Object.keys(ticket['review']).length != 0;
  }
  return false;
}

// =================================================================================================
// The filter form
// =================================================================================================

/**
 * Does one ticket survive the whole filter form?
 *
 * Reproduced clause-for-clause from formfilter(). `weekyear` is the "<week>-<year>" key the negligence
 * filter looks up, passed in rather than read off `this`.
 *
 * DEFECT 4 (pinned, not fixed) — UNGUARDED `.toLowerCase()`: the status clause reads
 * `e.status.status?.toLowerCase()`. The `?.` is on `.status.status`, NOT on `e.status`, so a ticket
 * document with no `status` map at all throws `Cannot read properties of undefined (reading 'status')`
 * the moment ANY status filter is applied. See customer-support-dashboard.component.ts:309.
 *
 * DEFECT 5 (pinned, not fixed): the status clause is `value.status.toLowerCase().includes(ticketStatus)`
 * — the FILTER contains the TICKET, not the other way round. Selecting "Open" therefore also matches a
 * ticket whose status is "pen" or "e", and selecting "Closed" matches "close", "lose" and "d".
 */
export function ticketMatchesFilter(
  e: Ticket,
  value: TicketFilterValue,
  weekyear: string,
): boolean {
  const ticketDateArray = e.reporteddate;
  const endDate = new Date(value.ticketend);
  endDate.setHours(23, 59, 59, 999);

  const closedTicketDate = e.status?.date;
  const closedEndDate = new Date(value.closedend);
  closedEndDate.setHours(23, 59, 59, 999);

  return !!(
    ((e.issue?.toLowerCase().trim().replace(/\s/g, '').indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, '') : '') as number) > -1
      || (e.name?.toLowerCase().trim().replace(/\s/g, '').indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, '') : '') as number) > -1
      || (e.email?.toLowerCase().trim().replace(/\s/g, '').indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, '') : '') as number) > -1
      || (e.issueno?.toString().trim().replace(/\s/g, '').indexOf(value.search != '' ? value.search.toString().toLowerCase().trim().replace(/\s/g, '') : '') as number) > -1)
    && (value.status.length != 0 ? value.status?.toLowerCase().includes((e.status as any).status?.toLowerCase()) : true)
    && (value.category!.length != 0 ? value.category!.includes(e.category) : true)
    && (value.journey!.length != 0 ? value.journey!.includes(e.journey?.id) : true)
    && (value.assign!.length != 0 ? value.assign!.some((item) => e.assign!.includes(item)) : true)
    && (value.reviewedby!.length != 0 ? value.reviewedby!.some((item) => ![null, undefined].includes(e.review) && Object.keys(e.review).includes(item)) : true)
    && (value.peopleinvolved!.length != 0 ? value.peopleinvolved!.some((item) => e.peopleinvolved?.includes(item)) : true)
    && (value.chatstatus != '' ? value.chatstatus == e.chatstatus && ![null, undefined].includes(e.chatstatus as any) : true)
    && (value.flag ? value.flag == e.flag && ![null, undefined].includes(e.flag as any) : true)
    && (value.review != '' ? ![null, undefined].includes(e.review) && value.review == 'true' ? e.review && typeof e.review === 'object' && Object.keys(e.review).length != 0 : e.review && typeof e.review === 'object' && Object.keys(e.review).length == 0 : true)
    && (value.metrics != '' ? value.metrics == 'gross' ? ![null, undefined, ''].includes(e.negligencemetrics as any) && e.negligencemetrics!.hasOwnProperty(weekyear) && e.negligencemetrics![weekyear] > 8 : value.metrics == 'high' ? ![null, undefined, ''].includes(e.negligencemetrics as any) && e.negligencemetrics!.hasOwnProperty(weekyear) && e.negligencemetrics![weekyear] < 9 && e.negligencemetrics![weekyear] > 5 : ![null, undefined, ''].includes(e.negligencemetrics as any) && e.negligencemetrics!.hasOwnProperty(weekyear) && [4, 5].includes(e.negligencemetrics![weekyear]) : true)
    && (value.priority!.length != 0 ? value.priority!.includes(e.priority) : true)
    && ((![null, undefined, ''].includes(value.ticketstart) ? ((ticketDateArray?.toDate!() as any) >= new Date(value.ticketstart)) : true)
      && (![null, undefined, ''].includes(value.ticketend) ? ((ticketDateArray?.toDate!() as any) <= endDate) : true))
    && ((![null, undefined, ''].includes(value.closedstart) ? ((closedTicketDate?.toDate!() as any) >= new Date(value.closedstart)) : true)
      && (![null, undefined, ''].includes(value.closedend) ? ((closedTicketDate?.toDate!() as any) <= closedEndDate) : true))
  );
}

/** The whole list, filtered. */
export function filterTickets(
  tickets: Ticket[] | null | undefined,
  value: TicketFilterValue,
  weekyear: string,
): Ticket[] {
  return (tickets || []).filter((e) => ticketMatchesFilter(e, value, weekyear));
}

// =================================================================================================
// Header sorting
// =================================================================================================

export type SortOrder = '' | 'asc' | 'desc';

/**
 * The three-state header cycle: unsorted -> asc -> desc -> unsorted.
 *
 * Clicking a DIFFERENT column always restarts at ascending.
 */
export function nextSortState(
  currentColumn: string,
  currentOrder: SortOrder,
  clickedColumn: string,
): { column: string; order: SortOrder } {
  if (currentColumn == clickedColumn) {
    if (currentOrder == 'desc') return { column: '', order: currentOrder };
    if (currentOrder == 'asc') return { column: clickedColumn, order: 'desc' };
    return { column: clickedColumn, order: 'asc' };
  }
  return { column: clickedColumn, order: 'asc' };
}

/** Which lookup maps the sort comparators need. */
export interface SortMaps {
  mapProfileData: Record<string, any>;
  mapJourney: Record<string, any>;
}

/**
 * Sort the ticket list by a column, in one direction.
 *
 * Both directions of the component's ascSorting()/descSorting() are folded together here; the only
 * difference between them was which operand came first, which is what `direction` selects. An unknown
 * column returns the list untouched, exactly as before.
 *
 * DEFECT 6 (pinned, not fixed) — UNGUARDED `.toLowerCase()` ON THE WRONG MAP. The 'journey' branch
 * compares `mapJourney[a.journey.id]` against `mapProfileData[b.journey.id]` — two DIFFERENT maps
 * (component lines 1444 and 1478). `mapProfileData` holds profile OBJECTS, so `.toLowerCase()` on one
 * is not a function and the sort throws. Sorting by Journey is therefore broken outright, in both
 * directions, on any board with journeys.
 *
 * DEFECT 7 (pinned, not fixed) — UNGUARDED `.localeCompare()` ARGUMENT. `a?.toLowerCase()` guards the
 * receiver but nothing guards the ARGUMENT: `'abc'.localeCompare(undefined)` coerces to the literal
 * string 'undefined', so tickets with a blank category/name/priority sort as though they were named
 * "undefined" — landing in the middle of the alphabet rather than at either end.
 *
 * DEFECT 8 (pinned, not fixed): the 'happinessindex' branch DROPS rows. It reassigns the list to the
 * non-blank rows, then pushes `list.filter(blank)` — but that second filter runs against the ALREADY
 * FILTERED list, which has no blank rows left. Nothing is pushed back, so every ticket without a
 * happiness index disappears from the table the moment someone sorts by that column.
 */
export function sortTickets(
  list: any[],
  column: string,
  direction: 'asc' | 'desc',
  maps: SortMaps,
): any[] {
  const asc = direction === 'asc';
  const first = (a: any, b: any) => (asc ? a : b);
  const second = (a: any, b: any) => (asc ? b : a);

  if (['category', 'name', 'chatstatus', 'priority'].includes(column)) {
    return list.sort((a, b) => first(a, b)[column]?.toLowerCase().localeCompare(second(a, b)[column]?.toLowerCase()));
  }

  if (column == 'severity') {
    return list.sort((a, b) => first(a, b)['flagdata']?.severity?.toLowerCase().localeCompare(second(a, b)['flagdata']?.severity?.toLowerCase()));
  }

  if (['active', 'issueno', 'closed'].includes(column)) {
    return list.sort((a, b) => first(a, b)[column] - second(a, b)[column]);
  }

  if (['happinessindex'].includes(column)) {
    let out = list.filter((e) => ![null, undefined, ''].includes(e[column])).sort((a, b) => first(a, b)[column] - second(a, b)[column]);
    out.push(...out.filter((e) => [null, undefined, ''].includes(e[column])));
    return out;
  }

  if (['reportedBy'].includes(column)) {
    return list.sort((a, b) => maps.mapProfileData[first(a, b)[column]]?.name?.toLowerCase().localeCompare(maps.mapProfileData[second(a, b)[column]]?.name?.toLowerCase()));
  }

  if (['journey'].includes(column)) {
    return list.sort((a, b) => maps.mapJourney[first(a, b)[column]?.id]?.toLowerCase().localeCompare(maps.mapProfileData[second(a, b)[column]?.id]?.toLowerCase()));
  }

  if (['reporteddate'].includes(column)) {
    return list.sort((a, b) => (first(a, b)[column]?.toDate() as any) - (second(a, b)[column]?.toDate() as any));
  }

  if (['closeddate'].includes(column)) {
    return list.sort((a, b) => (first(a, b).status.date?.toDate() as any) - (second(a, b).status.date?.toDate() as any));
  }

  return list;
}

// =================================================================================================
// Row counters
// =================================================================================================

/**
 * Whole days a ticket took to close, as a STRING (the table renders it directly).
 *
 * DEFECT 9 (pinned, not fixed): the `-1` special case is a string comparison against exactly '-1', so a
 * ticket closed two days before it was reported — clock skew, a back-dated import — renders '-2'
 * rather than being clamped. A missing close date renders the literal 'NaN' in the column.
 */
export function calculateDaysClosed(reportedDate: Date | undefined, closedDate: Date | undefined): string {
  const daysDiff = Math.floor(((closedDate as any)?.getTime() - (reportedDate as any)?.getTime()) / (1000 * 3600 * 24));
  return daysDiff.toString() == '-1' ? '0' : daysDiff.toString();
}

/**
 * Whole days a ticket has been open. `now` is injectable so a test can freeze the clock; the default
 * preserves the component's original `new Date()` behaviour.
 */
export function calculateDaysAgo(reportedDate: Date | undefined, now: number = Date.now()): string {
  const currentDate = new Date(now);
  const daysDiff = Math.floor((currentDate?.getTime() - (reportedDate as any)?.getTime()) / (1000 * 3600 * 24));
  return daysDiff.toString() == '-1' ? '0' : daysDiff.toString();
}

/**
 * The week number the negligence filters key off, with the year it belongs to.
 *
 * Weeks start on TUESDAY (the component sets the DateAdapter's first day to 2), and week 1 is the first
 * whole week of the calendar year.
 *
 * The component returned only the number and wrote the year onto `this.weekYear` as a side effect; this
 * returns both so the pair can be tested together.
 *
 * DEFECT 10 (pinned, not fixed): `weekYear` is the year of the date's own TUESDAY-anchored week start,
 * but the week COUNT is measured from the first Tuesday of that same year. Early-January days that fall
 * before the first Tuesday produce week 0, and a negligence key of "0-2026" matches nothing that was
 * ever written.
 */
export function weekNumberFor(date: Date): { weekNumber: number; weekYear: number } {
  const tempDate = new Date(date);
  tempDate.setHours(0, 0, 0, 0);

  const weekYear = tempDate.getFullYear();

  const dayOffset = (tempDate.getDay() - 2 + 7) % 7;
  tempDate.setDate(tempDate.getDate() - dayOffset);

  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const yearStartDay = (yearStart.getDay() - 2 + 7) % 7;
  yearStart.setDate(yearStart.getDate() + (yearStartDay === 0 ? 0 : 7 - yearStartDay));

  const daysSinceYearStart = Math.floor((tempDate.getTime() - yearStart.getTime()) / 86400000);
  const weekNumber = Math.floor(daysSinceYearStart / 7) + 1;

  return { weekNumber, weekYear };
}

/** The "<week>-<year>" key used to look a score up in `negligencemetrics`. */
export function weekYearKey(weekNumber: number, weekYear: number): string {
  return `${weekNumber}${'-'}${weekYear}`;
}

/**
 * The CSS row class for a ticket's status.
 *
 * DEFECT 11 (pinned, not fixed) — UNGUARDED `.toLowerCase()`. `status['status'].toLowerCase()` has NO
 * optional chaining at all (component line 1821). This is called from the template for every rendered
 * row, so a single ticket document missing its `status` map takes the entire table down with
 * `Cannot read properties of undefined (reading 'toLowerCase')` — not one blank row, the whole view.
 * This is the most likely single cause of the red Customer Support e2e run.
 *
 * Note also that this one uses strict equality where the tiles use a substring test, so a status of
 * "Reopened" gets neither class and renders unstyled.
 */
export function statusRowClass(status: any): string {
  if (status['status'].toLowerCase() === 'open') {
    return 'row-open';
  } else if (status['status'].toLowerCase() === 'closed') {
    return 'row-closed';
  }
  return '';
}

// =================================================================================================
// The category report
// =================================================================================================

/** One row of the category report table. */
export interface CategoryReportRow {
  category: string;
  total: number;
  totalUnresponded: number;
  closedLast24: number;
  last24: number; last24Unresponded: number;
  hrs48: number; hrs48Unresponded: number;
  hrs72: number; hrs72Unresponded: number;
  days7: number; days7Unresponded: number;
  month01: number; month01Unresponded: number;
  moreThan01: number; moreThan01Unresponded: number;
}

/**
 * Is a ticket awaiting its first reply?
 *
 * Guarded — `chatStatus != null` catches both null and undefined — so this one does NOT throw. It is
 * included because it is the only lower-casing on this screen that was written safely, and a future
 * "consistency" edit should not quietly remove the guard.
 */
export function isUnresponded(chatStatus: any): boolean {
  return [null, undefined, 'new'].includes(chatStatus != null ? chatStatus.toLowerCase() : chatStatus);
}

/**
 * Which age bucket a ticket falls in, from its age in hours.
 *
 * The bands are cumulative and evaluated in order, so a 30-hour ticket is 'hrs48', not 'last24'.
 * All boundaries are inclusive (`<=`).
 */
export function ageBucket(diffHours: number): 'last24' | 'hrs48' | 'hrs72' | 'days7' | 'month01' | 'moreThan01' {
  const diffDays = diffHours / 24;
  if (diffHours <= 24) return 'last24';
  if (diffHours <= 48) return 'hrs48';
  if (diffHours <= 72) return 'hrs72';
  if (diffDays <= 7) return 'days7';
  if (diffDays <= 30) return 'month01';
  return 'moreThan01';
}

/**
 * Resolve a reported date from any of the three shapes Firestore hands back.
 *
 * DEFECT 12 (pinned, not fixed): the final fallback for CLOSED tickets reads `ticket.date`, not
 * `ticket.status.date` (component line 1131 area). A ticket whose close date is stored as a plain
 * string therefore resolves to `new Date(undefined)` — an Invalid Date — and its "closed in the last
 * 24h" arithmetic silently becomes NaN, which fails every comparison and drops the ticket from the
 * closed count.
 */
export function resolveTimestamp(value: any): Date {
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

/** Open tickets, as the REPORT selects them — strict equality, unlike the tiles. See DEFECT 1. */
export function openTicketsForReport(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status?.status?.toLowerCase() === 'open');
}

/** Closed tickets, as the REPORT selects them — strict equality with 'closed'. */
export function closedTicketsForReport(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status?.status?.toLowerCase() === 'closed');
}

/**
 * The whole category report, one row per selected category.
 *
 * `now` is injectable so a test can freeze the clock; the default preserves the component's original
 * `new Date()` behaviour. Categories are sorted, exactly as before.
 */
export function buildCategoryReport(
  tickets: Ticket[],
  selectedCategories: string[],
  now: number = Date.now(),
): CategoryReportRow[] {
  const nowDate = new Date(now);
  const openTickets = openTicketsForReport(tickets);
  const closedTickets = closedTicketsForReport(tickets);

  return selectedCategories.sort().map((category) => {
    const categoryTickets = openTickets.filter((t) => t.category === category);
    const closedTicketsCategory = closedTickets.filter((t) => t.category === category);

    let closedLast24 = 0;
    let last24 = 0, hrs48 = 0, hrs72 = 0, days7 = 0, month1 = 0, moreThan1Month = 0;
    let last24Unresponded = 0, hrs48Unresponded = 0, hrs72Unresponded = 0;
    let days7Unresponded = 0, month1Unresponded = 0, moreThan1MonthUnresponded = 0;

    categoryTickets.forEach((ticket) => {
      const reportedDate = resolveTimestamp(ticket.reporteddate);
      const diffHours = (nowDate.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);
      const unresponded = isUnresponded(ticket.chatstatus);

      switch (ageBucket(diffHours)) {
        case 'last24': last24++; if (unresponded) last24Unresponded++; break;
        case 'hrs48': hrs48++; if (unresponded) hrs48Unresponded++; break;
        case 'hrs72': hrs72++; if (unresponded) hrs72Unresponded++; break;
        case 'days7': days7++; if (unresponded) days7Unresponded++; break;
        case 'month01': month1++; if (unresponded) month1Unresponded++; break;
        default: moreThan1Month++; if (unresponded) moreThan1MonthUnresponded++; break;
      }
    });

    closedTicketsCategory.forEach((ticket) => {
      // NOTE the fallback reads `ticket.date`, not `ticket.status.date` — DEFECT 12, kept verbatim.
      let date: Date;
      if (ticket?.status?.date?.toDate) {
        date = ticket.status.date.toDate();
      } else if (ticket.status?.date?.seconds) {
        date = new Date(ticket.status?.date?.seconds * 1000);
      } else {
        date = new Date((ticket as any).date);
      }
      const diffHours = (nowDate.getTime() - date.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 24) {
        closedLast24++;
      }
    });

    return {
      category,
      total: categoryTickets.length,
      totalUnresponded: last24Unresponded + hrs48Unresponded + hrs72Unresponded
        + days7Unresponded + month1Unresponded + moreThan1MonthUnresponded,
      closedLast24,
      last24, last24Unresponded,
      hrs48, hrs48Unresponded,
      hrs72, hrs72Unresponded,
      days7, days7Unresponded,
      month01: month1,
      month01Unresponded: month1Unresponded,
      moreThan01: moreThan1Month,
      moreThan01Unresponded: moreThan1MonthUnresponded,
    };
  });
}

/** The footer total for one report column. */
export function reportTotal(reportData: any[], field: string): number {
  return reportData.reduce((sum, row) => sum + row[field], 0);
}

/** The distinct, sorted, non-blank categories present on the ticket list. */
export function uniqueCategories(tickets: Ticket[]): string[] {
  return [...new Set(tickets.map((t) => t.category).filter((c) => c))].sort() as string[];
}

/** Add or remove one category from the selection. Returns a NEW array. */
export function toggleCategorySelection(selected: string[], category: string): string[] {
  const next = [...selected];
  const index = next.indexOf(category);
  if (index > -1) {
    next.splice(index, 1);
  } else {
    next.push(category);
  }
  return next;
}

// =================================================================================================
// Dropdown typeaheads
// =================================================================================================

/** The category dropdown. Both sides are optional-chained, so this one is safe. */
export function filterCategoryOptions<T extends { category?: string }>(
  categories: T[],
  query: string | null | undefined,
): T[] {
  return categories.filter((e) => e.category?.toLowerCase().includes((query as any)?.toLowerCase()));
}

/**
 * The journey dropdown.
 *
 * DEFECT 13 (pinned, not fixed) — UNGUARDED `.toLowerCase()` AND `.localeCompare()`. `e.journey` has no
 * `?.` (component line 1801) while the query beside it does, and the sort calls
 * `a['journey'].localeCompare(...)` bare. A journey document with no `journey` field — which is exactly
 * what a half-created journey looks like — throws and empties the whole dropdown.
 */
export function filterJourneyOptions<T extends { journey?: string }>(
  journeyList: T[],
  query: string | null | undefined,
): T[] {
  return journeyList
    .filter((e) => (e.journey as string).toLowerCase().includes((query as any)?.toLowerCase()))
    .sort((a, b) => (a as any)['journey'].localeCompare((b as any)['journey']));
}

/**
 * The "team member" and "reviewed by" dropdowns — the same rule twice in the component.
 *
 * DEFECT 14 (pinned, not fixed) — UNGUARDED PROFILE LOOKUP. `mapProfileData[e]['name']` indexes the map
 * with NO guard on the map entry (component lines 1806 and 1811). A chat-admin id with no profile
 * document — a deleted admin, or one whose profile has not loaded yet — throws
 * `Cannot read properties of undefined (reading 'name')` and both dropdowns go blank. Note the `?.` on
 * `['name']?.toLowerCase()` guards only the NAME, not the profile.
 */
export function filterAdminUserOptions(
  chatadminUsers: string[],
  mapProfileData: Record<string, any>,
  query: string | null | undefined,
): string[] {
  return chatadminUsers
    .filter((e) => mapProfileData[e]['name']?.toLowerCase().includes((query as any)?.toLowerCase()))
    .sort((a, b) => mapProfileData[a]['name']?.toLowerCase().localeCompare(mapProfileData[b]['name']?.toLowerCase()));
}

// =================================================================================================
// Pagination + misc
// =================================================================================================

/** The slice of rows the current page shows. */
export function paginate<T>(list: T[], currentPage: number, itemsPerPage: number): T[] {
  const startIndex = (currentPage - 1) * itemsPerPage;
  return list.slice(startIndex, startIndex + itemsPerPage);
}

/** How many pages the list needs. */
export function totalPages(rowCount: number, itemsPerPage: number): number {
  return Math.ceil(rowCount / itemsPerPage);
}

/**
 * The key of the most recent timestamp in a map of them, or null.
 *
 * Handles Dates, Firestore Timestamps, `{_seconds}` shapes, numeric millis and ISO strings. Unlike most
 * of this file it is defensively written throughout, so it is here mainly to lock that in.
 */
export function mostRecentTimestampKey(obj: Record<string, any>): string | null {
  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    return null;
  }

  let mostRecentKey: string | null = null;
  let mostRecentDate: Date = new Date(0);

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const timestamp = obj[key];
      let currentDate: Date | null = null;

      if (timestamp instanceof Date) {
        currentDate = timestamp;
      } else if (timestamp && typeof timestamp.toDate === 'function') {
        currentDate = timestamp.toDate();
      } else if (timestamp && timestamp._seconds !== undefined) {
        currentDate = new Date(timestamp._seconds * 1000);
      } else if (typeof timestamp === 'number') {
        currentDate = new Date(timestamp);
      } else if (typeof timestamp === 'string' && !isNaN(Date.parse(timestamp))) {
        currentDate = new Date(timestamp);
      }

      if (currentDate && currentDate > mostRecentDate) {
        mostRecentDate = currentDate;
        mostRecentKey = key;
      }
    }
  }

  return mostRecentKey;
}
