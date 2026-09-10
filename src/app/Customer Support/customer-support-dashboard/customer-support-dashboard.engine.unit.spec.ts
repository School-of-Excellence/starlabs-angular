// customer-support-dashboard.engine.unit.spec.ts — unit tests for the Customer Support dashboard rules.
//
// WHY THESE COULD NOT BE TESTED BEFORE: the rules lived as methods on CustomerSupportDashboardComponent,
// a 1,911-line component injecting a Firestore, a FormBuilder, a DatePipe, a MatDialog, a MatSnackBar, a
// Router and a DateAdapter. Reaching them meant rendering the table, so an e2e case could assert that a
// tile said "12" — it could not tell a negligence score of 5 being "moderate" from it being "high".
//
// WHAT THEY PROTECT: what a support lead chases today. The seventeen-clause filter form, the tile
// arithmetic, the negligence bands, the header sort, the age buckets on the category report, and the two
// day counters on every row.
//
// AND: THE UNGUARDED CALLS BEHIND THE RED E2E RUN. The Customer Support suite currently fails on
// unguarded `.toLowerCase()` / `.localeCompare()` against values Firestore does not guarantee. Every one
// found is pinned below as a `DEFECT (pinned)` case asserting the CURRENT throw, with the component
// file:line in the comment, so the trigger is documented rather than argued about. None of them are
// fixed here — that is a separate, deliberate change. The list, in the order a page load hits them:
//
//   1. statusRowClass()          component line 1821  status['status'].toLowerCase()      — NO guard at all
//   2. isOpenStatus()/isClosed() component lines 408/425/432/566/583/590 element['status']['status']?.  — guard on the wrong hop
//   3. ticketMatchesFilter()     component line 309   e.status.status?.toLowerCase()      — guard on the wrong hop
//   4. filterJourneyOptions()    component line 1801  e.journey.toLowerCase() + a['journey'].localeCompare()
//   5. filterAdminUserOptions()  component lines 1806/1811  mapProfileData[e]['name']     — unguarded map index
//   6. sortTickets('journey')    component lines 1444/1478  mapProfileData[...]?.toLowerCase() on an OBJECT
//   7. sortTickets(text cols)    component lines 1424/1428/1441/1459/1466/1475  localeCompare(undefined)
//
// DEFECTS ARE PINNED, NOT FIXED. Numbering matches the DEFECT notes in
// customer-support-dashboard.engine.ts.
import {
  Ticket,
  TicketFilterValue,
  ageBucket,
  buildCategoryReport,
  calculateDaysAgo,
  calculateDaysClosed,
  closedTicketsForReport,
  filterAdminUserOptions,
  filterCategoryOptions,
  filterJourneyOptions,
  filterTickets,
  hasReview,
  isClosedStatus,
  isOpenStatus,
  isReopened,
  isUnresponded,
  mostRecentTimestampKey,
  negligenceBand,
  nextSortState,
  openChatBand,
  openTicketsForReport,
  paginate,
  reportTotal,
  resolveTimestamp,
  sortTickets,
  statusRowClass,
  ticketMatchesFilter,
  toggleCategorySelection,
  totalPages,
  uniqueCategories,
  weekNumberFor,
  weekYearKey,
} from './customer-support-dashboard.engine';

/** A Firestore Timestamp stand-in. */
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

/** The filter form at rest — every clause inert. */
const emptyFilter = (): TicketFilterValue => ({
  search: '', status: '', category: [], journey: [], assign: [], reviewedby: [],
  peopleinvolved: [], chatstatus: '', flag: false, review: '', metrics: '', priority: [],
  ticketstart: '', ticketend: '', closedstart: '', closedend: '',
});

/** A representative ticket. */
const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  issue: 'Login broken', name: 'Asha', email: 'a@b.c', issueno: 12,
  status: { status: 'Open' }, category: 'Billing', journey: { id: 'j1' },
  assign: ['u1'], review: {}, peopleinvolved: ['u2'], chatstatus: 'New', flag: false,
  negligencemetrics: { '37-2026': 9 }, priority: 'High',
  reporteddate: ts('2026-09-01T00:00:00Z'), ...over,
});

const WEEK = '37-2026';

describe('customer-support-dashboard.engine', () => {
  // ===============================================================================================
  // CSU-01 — status classification (tiles)
  // ===============================================================================================
  describe('CSU-01 open/closed classification', () => {
    it('treats open as a SUBSTRING test, so Reopened counts as open', () => {
      expect(isOpenStatus({ status: 'Open' })).toBeTrue();
      expect(isOpenStatus({ status: 'Reopened' })).toBeTrue();
      expect(isOpenStatus({ status: 'Closed' })).toBeFalse();
    });

    it('treats closed as a substring test on "close", not "closed"', () => {
      expect(isClosedStatus({ status: 'Closed' })).toBeTrue();
      expect(isClosedStatus({ status: 'close' })).toBeTrue();
      expect(isClosedStatus({ status: 'Open' })).toBeFalse();
    });

    it('reports false for a status map present but empty', () => {
      expect(isOpenStatus({})).toBeFalse();
      expect(isClosedStatus({})).toBeFalse();
    });

    it('DEFECT 1b (pinned): a ticket with NO status map throws — component lines 408/425/432', () => {
      // UNGUARDED .toLowerCase(). The component wrote `element['status']['status']?.toLowerCase()`:
      // the `?.` guards the inner `.status`, not the `status` MAP. Real-world consequence: this runs
      // inside the snapshot loop, so ONE malformed clientissue document aborts the loop and leaves
      // EVERY tile on the dashboard reading its reset value of 0 — not one bad row, the whole board.
      expect(() => isOpenStatus(undefined as any)).toThrowError(/Cannot read propert/);
      expect(() => isClosedStatus(null as any)).toThrowError(/Cannot read propert/);
    });

    it('DEFECT 1 (pinned): the tiles and the report disagree about "Reopened"', () => {
      // The tiles use a substring test; the report uses strict equality. Real-world consequence: the
      // open-tickets tile and the category report on the same screen show different totals, and there
      // is nothing on either to say which one to believe.
      const reopened = [ticket({ status: { status: 'Reopened' } })];
      expect(isOpenStatus(reopened[0].status!)).toBeTrue();
      expect(openTicketsForReport(reopened).length).toBe(0);
    });

    it('selects open and closed tickets for the report by strict equality', () => {
      const list = [
        ticket({ status: { status: 'Open' } }),
        ticket({ status: { status: 'closed' } }),
        ticket({ status: { status: 'Reopened' } }),
      ];
      expect(openTicketsForReport(list).length).toBe(1);
      expect(closedTicketsForReport(list).length).toBe(1);
    });
  });

  // ===============================================================================================
  // CSU-02 — chat status bands
  // ===============================================================================================
  describe('CSU-02 openChatBand', () => {
    it('routes responded and pending case-insensitively', () => {
      expect(openChatBand('Responded')).toBe('responded');
      expect(openChatBand('RESPONDED')).toBe('responded');
      expect(openChatBand('Decision Making')).toBe('pending');
      expect(openChatBand('Pending')).toBe('pending');
    });

    it('returns null for a blank or unknown chat status', () => {
      expect(openChatBand('')).toBeNull();
      expect(openChatBand(null)).toBeNull();
      expect(openChatBand(undefined)).toBeNull();
      expect(openChatBand('whatever')).toBeNull();
    });

    it('DEFECT 2 (pinned): "New" is matched CASE-SENSITIVELY while its siblings are not', () => {
      // Real-world consequence: a ticket whose chatstatus was written as 'new' (by a Cloud Function,
      // an import, or any other screen) is counted in `opentickets` but lands in NO chat tile, so
      // new + responded + pending silently fails to add up to the open total.
      expect(openChatBand('New')).toBe('new');
      expect(openChatBand('new')).toBeNull();
      expect(openChatBand('NEW')).toBeNull();
    });

    it('DEFECT 2b (pinned): all-tickets counts "pending" as pending, my-tickets does not', () => {
      // The component has two near-identical snapshot loops. allCases() tests
      // `['decision making','pending'].includes(...)`; myCases() tests `== 'decision making'` only
      // (component line 578). This engine encodes the allCases rule; myCases was deliberately left
      // inline. Real-world consequence: the SAME ticket is "pending" on the All Tickets tab and
      // uncounted on My Tickets, so the two tabs never agree.
      expect(openChatBand('pending')).toBe('pending');
    });
  });

  // ===============================================================================================
  // CSU-03 — negligence bands
  // ===============================================================================================
  describe('CSU-03 negligenceBand', () => {
    it('bands the integers the way the tiles do', () => {
      expect(negligenceBand(10)).toBe('gross');
      expect(negligenceBand(9)).toBe('gross');
      expect(negligenceBand(8)).toBe('high');
      expect(negligenceBand(6)).toBe('high');
      expect(negligenceBand(5)).toBe('moderate');
      expect(negligenceBand(4)).toBe('moderate');
      expect(negligenceBand(3)).toBe('low');
      expect(negligenceBand(1)).toBe('low');
      expect(negligenceBand(0)).toBe('none');
    });

    it('pins the 5 boundary, which reads ambiguously in the source', () => {
      // 'high' is `< 9 && > 5`, so 5 itself falls through to the [4,5] membership test. A reader
      // skimming "high is above 5" would guess wrong.
      expect(negligenceBand(5)).toBe('moderate');
      expect(negligenceBand(5.5)).toBe('high');
    });

    it('DEFECT 3 (pinned): the bands do not cover the number line', () => {
      // 'moderate' and 'low' are exact membership tests, not ranges. Real-world consequence: any
      // non-integer score below 4 — which a half-completed or averaged weekly scoring produces —
      // is counted on NO tile at all, so the five negligence tiles quietly under-report the week.
      expect(negligenceBand(3.5)).toBeNull();
      expect(negligenceBand(0.5)).toBeNull();
      expect(negligenceBand(-1)).toBeNull();
      expect(negligenceBand(undefined)).toBeNull();
      expect(negligenceBand(null)).toBeNull();
    });
  });

  // ===============================================================================================
  // CSU-04 — re-open detection and review presence
  // ===============================================================================================
  describe('CSU-04 isReopened + hasReview', () => {
    const admins = ['admin1'];

    it('flags an open ticket last edited by someone outside the chat-admin team', () => {
      expect(isReopened({ status: 'Open', editedBy: 'customer1' }, admins)).toBeTrue();
    });

    it('does not flag one an admin edited, one with no editor, or a closed one', () => {
      expect(isReopened({ status: 'Open', editedBy: 'admin1' }, admins)).toBeFalse();
      expect(isReopened({ status: 'Open' }, admins)).toBeFalse();
      expect(isReopened({ status: 'Closed', editedBy: 'customer1' }, admins)).toBeFalse();
    });

    it('reports a review only when the review map has entries', () => {
      expect(hasReview({ review: { admin1: true } })).toBeTrue();
      expect(hasReview({ review: {} })).toBeFalse();
      expect(hasReview({})).toBeFalse();
      expect(hasReview({ review: null })).toBeFalse();
    });
  });

  // ===============================================================================================
  // CSU-05 — the filter form
  // ===============================================================================================
  describe('CSU-05 ticketMatchesFilter', () => {
    /** Apply the filter form with only the named clauses changed from their at-rest values. */
    const ticketMatches = (t: Ticket, over: Partial<TicketFilterValue> = {}): boolean =>
      ticketMatchesFilter(t, { ...emptyFilter(), ...over }, WEEK);

    it('passes everything when the form is at rest', () => {
      expect(ticketMatches(ticket())).toBeTrue();
    });

    it('searches issue, name, email and ticket number, case- and space-insensitively', () => {
      expect(ticketMatches(ticket(), { search: 'LOGIN' })).toBeTrue();
      expect(ticketMatches(ticket(), { search: 'loginbroken' })).toBeTrue();
      expect(ticketMatches(ticket(), { search: 'asha' })).toBeTrue();
      expect(ticketMatches(ticket(), { search: 'a@b.c' })).toBeTrue();
      expect(ticketMatches(ticket(), { search: 'zzz' })).toBeFalse();
    });

    it('applies the category, journey and priority membership clauses', () => {
      expect(ticketMatches(ticket(), { category: ['Billing'] })).toBeTrue();
      expect(ticketMatches(ticket(), { category: ['Tech'] })).toBeFalse();
      expect(ticketMatches(ticket(), { journey: ['j1'] })).toBeTrue();
      expect(ticketMatches(ticket(), { journey: ['j2'] })).toBeFalse();
      expect(ticketMatches(ticket(), { priority: ['High'] })).toBeTrue();
      expect(ticketMatches(ticket(), { priority: ['Low'] })).toBeFalse();
    });

    it('applies the flag clause only when the flag box is ticked', () => {
      expect(ticketMatches(ticket({ flag: true }), { flag: true })).toBeTrue();
      expect(ticketMatches(ticket({ flag: false }), { flag: true })).toBeFalse();
      expect(ticketMatches(ticket({ flag: false }), { flag: false })).toBeTrue();
    });

    it('splits reviewed from unreviewed tickets', () => {
      expect(ticketMatches(ticket({ review: { admin1: true } }), { review: 'true' })).toBeTrue();
      expect(ticketMatches(ticket({ review: {} }), { review: 'true' })).toBeFalse();
      expect(ticketMatches(ticket({ review: {} }), { review: 'false' })).toBeTrue();
    });

    it('applies the negligence-metric bands against the week key', () => {
      expect(ticketMatches(ticket({ negligencemetrics: { [WEEK]: 9 } }), { metrics: 'gross' })).toBeTrue();
      expect(ticketMatches(ticket({ negligencemetrics: { [WEEK]: 7 } }), { metrics: 'gross' })).toBeFalse();
      expect(ticketMatches(ticket({ negligencemetrics: { [WEEK]: 7 } }), { metrics: 'high' })).toBeTrue();
      expect(ticketMatches(ticket({ negligencemetrics: { '1-2020': 9 } }), { metrics: 'gross' })).toBeFalse();
    });

    it('applies the reported-date range inclusively at both ends', () => {
      expect(ticketMatches(ticket(), { ticketstart: '2026-08-01', ticketend: '2026-09-30' })).toBeTrue();
      expect(ticketMatches(ticket(), { ticketstart: '2026-09-05' })).toBeFalse();
      expect(ticketMatches(ticket(), { ticketend: '2026-08-30' })).toBeFalse();
    });

    it('DEFECT 4 (pinned): a ticket with no status map throws once ANY status filter is applied', () => {
      // UNGUARDED — component line 309 reads `e.status.status?.toLowerCase()`. The `?.` is on the
      // wrong hop. Real-world consequence: the dashboard renders fine until someone picks a status
      // from the dropdown, at which point the whole list blows up. That intermittency is exactly why
      // this reads as flaky rather than broken in the e2e run.
      const noStatus = ticket({ status: undefined });
      expect(ticketMatches(noStatus)).toBeTrue();                                  // no filter: fine
      expect(() => ticketMatches(noStatus, { status: 'Open' })).toThrowError(/Cannot read propert/);
    });

    it('DEFECT 5 (pinned): the status clause is inverted — the FILTER contains the TICKET', () => {
      // `value.status.toLowerCase().includes(ticketStatus)`. Real-world consequence: filtering by
      // "Open" also returns tickets whose status is "pen", "e" or "n" — any substring. Data entered
      // by hand or truncated by an import silently leaks into every status-filtered view.
      expect(ticketMatches(ticket({ status: { status: 'pen' } }), { status: 'Open' })).toBeTrue();
      expect(ticketMatches(ticket({ status: { status: 'lose' } }), { status: 'Closed' })).toBeTrue();
    });

    it('DEFECT 6 (pinned): metrics="moderate" is the FALLBACK branch, so any unknown value acts as moderate', () => {
      // The metrics clause is gross ? ... : high ? ... : [4,5].includes(...). Real-world consequence:
      // a typo or a new metrics option added to the template silently filters as "moderate" instead
      // of erroring or being ignored.
      const moderate = ticket({ negligencemetrics: { [WEEK]: 4 } });
      expect(ticketMatches(moderate, { metrics: 'moderate' })).toBeTrue();
      expect(ticketMatches(moderate, { metrics: 'anything-at-all' })).toBeTrue();
    });

    it('filters a whole list', () => {
      const list = [ticket(), ticket({ category: 'Tech' })];
      expect(filterTickets(list, { ...emptyFilter(), category: ['Billing'] }, WEEK).length).toBe(1);
      expect(filterTickets(null, emptyFilter(), WEEK)).toEqual([]);
    });
  });

  // ===============================================================================================
  // CSU-06 — header sorting
  // ===============================================================================================
  describe('CSU-06 nextSortState', () => {
    it('cycles unsorted -> asc -> desc -> unsorted on the same column', () => {
      expect(nextSortState('', '', 'name')).toEqual({ column: 'name', order: 'asc' });
      expect(nextSortState('name', 'asc', 'name')).toEqual({ column: 'name', order: 'desc' });
      expect(nextSortState('name', 'desc', 'name')).toEqual({ column: '', order: 'desc' });
    });

    it('restarts at ascending when a different column is clicked', () => {
      expect(nextSortState('name', 'desc', 'category')).toEqual({ column: 'category', order: 'asc' });
    });
  });

  describe('CSU-07 sortTickets', () => {
    const maps = {
      mapProfileData: { u1: { name: 'Zoe' }, u2: { name: 'Amy' } },
      mapJourney: { j1: 'Alpha', j2: 'Beta' },
    };

    it('sorts text columns case-insensitively, both ways', () => {
      expect(sortTickets([{ category: 'Beta' }, { category: 'alpha' }], 'category', 'asc', maps)
        .map((t) => t.category)).toEqual(['alpha', 'Beta']);
      expect(sortTickets([{ category: 'alpha' }, { category: 'Beta' }], 'category', 'desc', maps)
        .map((t) => t.category)).toEqual(['Beta', 'alpha']);
    });

    it('sorts numeric columns numerically, even when stored as strings', () => {
      expect(sortTickets([{ active: '10' }, { active: '2' }], 'active', 'asc', maps)
        .map((t) => t.active)).toEqual(['2', '10']);
    });

    it('sorts reportedBy by the resolved profile NAME, not the id', () => {
      expect(sortTickets([{ reportedBy: 'u1' }, { reportedBy: 'u2' }], 'reportedBy', 'asc', maps)
        .map((t) => t.reportedBy)).toEqual(['u2', 'u1']);      // Amy before Zoe
    });

    it('leaves an unknown column untouched', () => {
      const rows = [{ a: 1 }, { a: 2 }];
      expect(sortTickets(rows, 'nosuchcolumn', 'asc', maps)).toBe(rows);
    });

    it('DEFECT 7 (pinned): sorting by Journey throws — the two operands read DIFFERENT maps', () => {
      // UNGUARDED .toLowerCase() on the wrong map. Component lines 1444 and 1478 compare
      // `mapJourney[a.journey.id]` (a STRING) against `mapProfileData[b.journey.id]` (an OBJECT).
      // `?.toLowerCase` on an object is not a function. Real-world consequence: the Journey column
      // header is broken outright, in both directions, on any board that has journeys — clicking it
      // throws rather than sorting.
      const rows = [{ journey: { id: 'j1' } }, { journey: { id: 'j2' } }];
      const badMaps = {
        mapProfileData: { j1: { name: 'x' }, j2: { name: 'y' } },
        mapJourney: { j1: 'Alpha', j2: 'Beta' },
      };
      expect(() => sortTickets(rows, 'journey', 'asc', badMaps)).toThrowError(/not a function/);
      expect(() => sortTickets(rows, 'journey', 'desc', badMaps)).toThrowError(/not a function/);
    });

    it('DEFECT 8 (pinned): a blank text value sorts as the literal word "undefined"', () => {
      // UNGUARDED .localeCompare() ARGUMENT: `a?.toLowerCase()` guards the receiver, but
      // `.localeCompare(b?.toLowerCase())` coerces an undefined argument to the string 'undefined'.
      // Real-world consequence: tickets with no category/name/priority do not collect at either end
      // of the sort where an operator would spot them — they land between "t" and "v".
      const sorted = sortTickets(
        [{ category: 'beta' }, {}, { category: 'alpha' }], 'category', 'asc', maps,
      ).map((t: any) => t.category);
      expect(sorted).toEqual(['alpha', 'beta', undefined]);
    });

    it('DEFECT 9 (pinned): sorting by happinessindex DELETES every row that has none', () => {
      // The component filters the blanks out, then pushes back `list.filter(blank)` — but that second
      // filter runs against the ALREADY-FILTERED list, which has no blanks left. Nothing comes back.
      // Real-world consequence: clicking the Happiness column silently removes tickets from the
      // table, and the only way to get them back is to reload the page.
      const rows = [{ happinessindex: 3 }, { happinessindex: null }, { happinessindex: 1 }];
      const out = sortTickets(rows, 'happinessindex', 'asc', maps);
      expect(out.length).toBe(2);
      expect(out.map((t: any) => t.happinessindex)).toEqual([1, 3]);
    });
  });

  // ===============================================================================================
  // CSU-08 — row day counters
  // ===============================================================================================
  describe('CSU-08 day counters', () => {
    it('counts whole days to close', () => {
      expect(calculateDaysClosed(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-04T00:00:00Z'))).toBe('3');
      expect(calculateDaysClosed(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-01T20:00:00Z'))).toBe('0');
    });

    it('counts whole days a ticket has been open, against a frozen clock', () => {
      const NOW = new Date('2026-09-10T06:00:00Z').getTime();
      expect(calculateDaysAgo(new Date('2026-09-01T00:00:00Z'), NOW)).toBe('9');
      expect(calculateDaysAgo(new Date('2026-09-10T00:00:00Z'), NOW)).toBe('0');
    });

    it('clamps exactly -1 to "0" — the same-day rounding case', () => {
      expect(calculateDaysClosed(new Date('2026-09-02T00:00:00Z'), new Date('2026-09-01T12:00:00Z'))).toBe('0');
    });

    it('DEFECT 10 (pinned): only -1 is clamped, so a back-dated close renders a negative day count', () => {
      // Real-world consequence: an imported or clock-skewed ticket shows "-3" in the "days to close"
      // column, and every average built on that column is dragged down by it.
      expect(calculateDaysClosed(new Date('2026-09-04T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))).toBe('-3');
    });

    it('DEFECT 10b (pinned): a missing date renders the literal string "NaN" in the table', () => {
      expect(calculateDaysClosed(new Date('2026-09-01T00:00:00Z'), undefined)).toBe('NaN');
      expect(calculateDaysAgo(undefined, Date.now())).toBe('NaN');
    });
  });

  // ===============================================================================================
  // CSU-09 — week number
  // ===============================================================================================
  describe('CSU-09 weekNumberFor', () => {
    it('numbers weeks from the first Tuesday of the year', () => {
      expect(weekNumberFor(new Date('2026-01-06T12:00:00'))).toEqual({ weekNumber: 1, weekYear: 2026 });
      expect(weekNumberFor(new Date('2026-01-07T12:00:00'))).toEqual({ weekNumber: 1, weekYear: 2026 });
      expect(weekNumberFor(new Date('2026-09-10T12:00:00'))).toEqual({ weekNumber: 36, weekYear: 2026 });
    });

    it('builds the negligence lookup key from the pair', () => {
      expect(weekYearKey(37, 2026)).toBe('37-2026');
      expect(weekYearKey(1, 2026)).toBe('1-2026');
    });

    it('DEFECT 11 (pinned): early-January dates produce a week number from the PREVIOUS year, labelled with THIS one', () => {
      // The week is anchored to its Tuesday, which for the 1st of January 2026 (a Thursday) is the
      // 30th of December 2025 — so the count is measured against 2025 and comes out as 52. But
      // `weekYear` was captured BEFORE that shift, so it still says 2026. Real-world consequence: a
      // negligence score recorded in the first days of January is filed under key "52-2026", a week
      // that has not happened yet, and is invisible to every negligence filter for eleven months.
      expect(weekNumberFor(new Date('2026-01-01T12:00:00'))).toEqual({ weekNumber: 52, weekYear: 2026 });
      expect(weekNumberFor(new Date('2026-01-05T12:00:00'))).toEqual({ weekNumber: 52, weekYear: 2026 });
      expect(weekYearKey(52, 2026)).toBe('52-2026');
    });
  });

  // ===============================================================================================
  // CSU-10 — row colour  (the single most likely cause of the red e2e run)
  // ===============================================================================================
  describe('CSU-10 statusRowClass', () => {
    it('colours open and closed rows', () => {
      expect(statusRowClass({ status: 'Open' })).toBe('row-open');
      expect(statusRowClass({ status: 'CLOSED' })).toBe('row-closed');
    });

    it('returns no class for anything else — including Reopened', () => {
      // Strict equality here, substring on the tiles. A "Reopened" row is counted as open but
      // rendered unstyled, which is why it looks closed to anyone scanning the table by colour.
      expect(statusRowClass({ status: 'Reopened' })).toBe('');
      expect(statusRowClass({ status: 'pending' })).toBe('');
    });

    it('DEFECT 12 (pinned): NO guard at all — component line 1821', () => {
      // `status['status'].toLowerCase()`, with no optional chaining anywhere. This is called from the
      // template for EVERY rendered row. Real-world consequence: a single clientissue document with
      // a missing or empty `status` map takes the entire table down with a render error — not one
      // blank row, the whole view. This is the most likely single cause of the red Customer Support
      // e2e run, because it needs no user interaction at all to fire.
      expect(() => statusRowClass(undefined)).toThrowError(/Cannot read propert/);
      expect(() => statusRowClass({})).toThrowError(/Cannot read properties of undefined \(reading 'toLowerCase'\)/);
    });
  });

  // ===============================================================================================
  // CSU-11 — category report
  // ===============================================================================================
  describe('CSU-11 report buckets', () => {
    it('bands a ticket by age, cumulatively and inclusively', () => {
      expect(ageBucket(1)).toBe('last24');
      expect(ageBucket(24)).toBe('last24');
      expect(ageBucket(25)).toBe('hrs48');
      expect(ageBucket(48)).toBe('hrs48');
      expect(ageBucket(72)).toBe('hrs72');
      expect(ageBucket(73)).toBe('days7');
      expect(ageBucket(168)).toBe('days7');
      expect(ageBucket(169)).toBe('month01');
      expect(ageBucket(720)).toBe('month01');
      expect(ageBucket(721)).toBe('moreThan01');
    });

    it('treats New, null and undefined chat statuses as unresponded — and this one IS guarded', () => {
      // Deliberately pinned: `chatStatus != null ? chatStatus.toLowerCase() : chatStatus` is the only
      // safely-written lower-casing on this screen. A future "consistency" edit must not remove it.
      expect(isUnresponded('New')).toBeTrue();
      expect(isUnresponded('new')).toBeTrue();
      expect(isUnresponded(null)).toBeTrue();
      expect(isUnresponded(undefined)).toBeTrue();
      expect(isUnresponded('Responded')).toBeFalse();
    });

    it('resolves a Timestamp, a {seconds} shape and a raw value alike', () => {
      expect(resolveTimestamp(ts('2026-09-01T00:00:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(resolveTimestamp({ seconds: 1767225600 }).getTime()).toBe(1767225600000);
      expect(resolveTimestamp('2026-09-01T00:00:00Z').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('builds one row per category, with unresponded counts per bucket', () => {
      const NOW = new Date('2026-09-10T12:00:00Z').getTime();
      const list = [
        ticket({ category: 'Billing', status: { status: 'Open' }, chatstatus: 'New', reporteddate: ts('2026-09-10T06:00:00Z') }),
        ticket({ category: 'Billing', status: { status: 'Open' }, chatstatus: 'Responded', reporteddate: ts('2026-09-08T12:00:00Z') }),
        ticket({ category: 'Billing', status: { status: 'Closed', date: ts('2026-09-10T06:00:00Z') } }),
      ];
      const [row] = buildCategoryReport(list, ['Billing'], NOW);
      expect(row.total).toBe(2);
      expect(row.last24).toBe(1);
      expect(row.last24Unresponded).toBe(1);
      expect(row.hrs48).toBe(1);
      expect(row.hrs48Unresponded).toBe(0);
      expect(row.totalUnresponded).toBe(1);
      expect(row.closedLast24).toBe(1);
    });

    it('emits a zeroed row for a category with no tickets', () => {
      const [row] = buildCategoryReport([], ['Ghost'], Date.now());
      expect(row.category).toBe('Ghost');
      expect(row.total).toBe(0);
      expect(row.totalUnresponded).toBe(0);
    });

    it('DEFECT 13 (pinned): the closed-date fallback reads ticket.date, not ticket.status.date', () => {
      // Real-world consequence: a close date stored as a plain string (an import, or a Cloud Function
      // that wrote an ISO string) resolves to an Invalid Date, whose arithmetic is NaN, which fails
      // every comparison — so the ticket vanishes from the "closed in the last 24h" count with no
      // error anywhere.
      const NOW = new Date('2026-09-10T12:00:00Z').getTime();
      const stringDate = [ticket({ category: 'X', status: { status: 'closed', date: '2026-09-10T06:00:00Z' as any } })];
      expect(buildCategoryReport(stringDate, ['X'], NOW)[0].closedLast24).toBe(0);
    });

    it('totals a report column', () => {
      expect(reportTotal([{ total: 2 }, { total: 3 }], 'total')).toBe(5);
      expect(reportTotal([], 'total')).toBe(0);
    });
  });

  // ===============================================================================================
  // CSU-12 — category selection
  // ===============================================================================================
  describe('CSU-12 category selection', () => {
    it('lists the distinct, sorted, non-blank categories', () => {
      const list = [ticket({ category: 'b' }), ticket({ category: 'a' }), ticket({ category: '' }),
        ticket({ category: 'b' }), ticket({ category: undefined })];
      expect(uniqueCategories(list)).toEqual(['a', 'b']);
    });

    it('toggles a category in and out without mutating the input', () => {
      const start = ['a'];
      expect(toggleCategorySelection(start, 'b')).toEqual(['a', 'b']);
      expect(toggleCategorySelection(['a', 'b'], 'a')).toEqual(['b']);
      expect(start).toEqual(['a']);
    });
  });

  // ===============================================================================================
  // CSU-13 — dropdown typeaheads (two of the three are unguarded)
  // ===============================================================================================
  describe('CSU-13 dropdowns', () => {
    it('filters categories safely, guarding both sides', () => {
      expect(filterCategoryOptions([{ category: 'Billing' }, { category: 'Tech' }, {}], 'bil'))
        .toEqual([{ category: 'Billing' }]);
    });

    it('filters and sorts journeys when every journey has a name', () => {
      expect(filterJourneyOptions([{ journey: 'Beta' }, { journey: 'alpha' }], 'a'))
        .toEqual([{ journey: 'alpha' }, { journey: 'Beta' }]);
    });

    it('DEFECT 14 (pinned): a journey with no name empties the whole journey dropdown — component line 1801', () => {
      // UNGUARDED .toLowerCase(). `e.journey.toLowerCase()` has no `?.`, while the query beside it
      // does; the sort then calls `a['journey'].localeCompare(...)` bare (also component line 215).
      // Real-world consequence: one half-created journey document — a row saved before its name was
      // typed — makes the journey filter throw, so NO journeys are selectable at all.
      expect(() => filterJourneyOptions([{ journey: 'A' }, {}], 'a'))
        .toThrowError(/Cannot read properties of undefined \(reading 'toLowerCase'\)/);
    });

    it('filters and sorts admin users by resolved profile name', () => {
      const map = { u1: { name: 'Zoe' }, u2: { name: 'Amy' } };
      expect(filterAdminUserOptions(['u1', 'u2'], map, '')).toEqual(['u2', 'u1']);
      expect(filterAdminUserOptions(['u1', 'u2'], map, 'zo')).toEqual(['u1']);
    });

    it('DEFECT 15 (pinned): a chat-admin id with no profile empties BOTH member dropdowns — component lines 1806/1811', () => {
      // UNGUARDED MAP INDEX. `mapProfileData[e]['name']` guards the NAME with `?.` but never the
      // profile itself. Real-world consequence: a deleted admin, or a profile map that has not
      // finished loading, throws — and because the same expression backs both the "team member" and
      // the "reviewed by" dropdowns, two filters go blank at once.
      expect(() => filterAdminUserOptions(['u1', 'ghost'], { u1: { name: 'A' } }, 'a'))
        .toThrowError(/Cannot read properties of undefined \(reading 'name'\)/);
    });
  });

  // ===============================================================================================
  // CSU-14 — pagination and timestamp scanning
  // ===============================================================================================
  describe('CSU-14 pagination + mostRecentTimestampKey', () => {
    it('slices the page the table shows', () => {
      expect(paginate([1, 2, 3, 4, 5], 1, 2)).toEqual([1, 2]);
      expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
      expect(paginate([1, 2, 3, 4, 5], 3, 2)).toEqual([5]);
      expect(paginate([], 1, 10)).toEqual([]);
    });

    it('counts pages, rounding up', () => {
      expect(totalPages(0, 10)).toBe(0);
      expect(totalPages(1, 10)).toBe(1);
      expect(totalPages(21, 10)).toBe(3);
    });

    it('finds the most recent key across every timestamp shape', () => {
      expect(mostRecentTimestampKey({ a: 1000, b: 5000 })).toBe('b');
      expect(mostRecentTimestampKey({ a: ts('2026-01-01T00:00:00Z'), b: ts('2026-05-01T00:00:00Z') })).toBe('b');
      expect(mostRecentTimestampKey({ a: { _seconds: 100 }, b: { _seconds: 200 } })).toBe('b');
      expect(mostRecentTimestampKey({ a: new Date(1000), b: new Date(2000) })).toBe('b');
    });

    it('ignores unparseable values and returns null for nothing usable', () => {
      expect(mostRecentTimestampKey({ a: 1000, b: 'not a date' })).toBe('a');
      expect(mostRecentTimestampKey({})).toBeNull();
      expect(mostRecentTimestampKey(null as any)).toBeNull();
    });
  });
});
