// live-event-dashboard.engine.unit.spec.ts — unit tests for the Live Event Dashboard V3 rules.
//
// WHY THESE TESTS EXIST: this dashboard is what an operator watches DURING a live event. The tier a
// participant lands in, whether they show up on the "never attended" list, whether a call is still
// outstanding, and which tag column a video-ask submission falls into all decide who gets chased in the
// next ten minutes. Every one of those rules was a private method or getter on a 1,941-line component
// that injects a Firestore, a Storage, an HttpClient, a MatDialog and a live-subscribing data service —
// unreachable from a unit test, and reachable from e2e only as rendered text. An e2e case could assert
// that a chip read "75–99%"; it could not tell 0.75 from 0.7499, so a shifted boundary passed silently.
//
// Extracted 2026-09-10 with the logic UNCHANGED, mirroring delivery-dashboard.engine.ts and
// priority.engine.ts under ../../Journey Onboarding.
//
// WHAT THE TESTS PROTECT: the band boundaries and their exact labels, the "Addressed replaces every tag
// column" rule and its vacuous-truth guard, the day-scope resolution behind every 'Today'/'Overall'
// chip, the call-outcome precedence (optimistic over live over pending), and the Participant Data
// table's filter/sort/export rules. Values are asserted literally ON PURPOSE — they are product
// decisions, and changing one should turn a test red rather than drift quietly.
//
// TEN behaviours here are WRONG and are pinned as-is with `DEFECT (pinned)` titles, because this was a
// refactor and fixing them was explicitly out of scope. Each carries a comment saying what it costs.
//
// NOT COVERED HERE: anything that reads Firestore or LiveEventDataService state, opens the drill-down
// panel, marks attendance or sends a communication — that stays with the events e2e suite. ATC bucket
// derivation is also absent by design: it stayed on the component and was never read for this work.
import {
  JOURNEY_PALETTE_SIZE,
  PD_CSV_HEADER,
  PdFilter,
  PdRow,
  QUARTILE_DEFS,
  attendanceRangeLabel,
  attendedAtLeastOnceIds,
  buildPdCsvLines,
  callStatusClass,
  comparePdRows,
  completionQuartiles,
  completionRatio,
  coveragePct,
  csvCell,
  dayLabel,
  defaultPdFilter,
  exportFileStem,
  feedStatusClass,
  groupByName,
  groupCrmTags,
  groupVideoAskTags,
  idsWithoutCohort,
  initials,
  isFirstTimer,
  journeyBadgeClass,
  journeyColumns,
  missingRecordingIds,
  nextPdSort,
  pairCountLabel,
  paletteColor,
  participantCountLabel,
  pdAtcLabel,
  pdMatches,
  resolutionHours,
  resolveCallStatus,
  reviewPercentage,
  scopeDates,
  shortDateLabel,
  staffNamesLabel,
  summariseCalls,
  tagDocsForDay,
  ticketStatusLabel,
  timeLabel,
  todayBarPct,
  todayKey,
  triggerLabel,
  videoAskIdsForDay,
  weekdayLabel,
} from './live-event-dashboard.engine';

/** A registered participant row with nothing remarkable — each case switches on only what it is about. */
const row = (over: Partial<PdRow> = {}): PdRow => ({
  profileId: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', journeyId: 'j1', ft: false,
  atcBucket: 0, atcPct: 50, adjDone: 1, adjPending: 1, procDone: 0, procPending: 0, attd: 2,
  ...over,
});

/** One day card of the attendance grid. */
const day = (over: Partial<{ day: number; date: string; count: number; isToday: boolean; isPast: boolean; isFuture: boolean; presentProfileIds: string[]; absentProfileIds: string[] }> = {}) => ({
  day: 1, date: '2026-05-18', count: 10, isToday: false, isPast: true, isFuture: false,
  presentProfileIds: [], absentProfileIds: [], ...over,
});

describe('live-event-dashboard.engine', () => {

  // ===============================================================================================
  // LEU-01 — first timers
  // ===============================================================================================
  describe('LEU-01 first timers', () => {
    const HERO = '0ayiNALL1HDVvCXDHcZ4';

    it('counts anyone who has not consumed the hero product', () => {
      expect(isFirstTimer(['someOtherProduct'], HERO)).toBe(true);
    });

    it('counts a participant with no consumed products at all', () => {
      // A brand-new profile has no consumedproducts array — that is the archetypal first timer.
      expect(isFirstTimer([], HERO)).toBe(true);
      expect(isFirstTimer(null, HERO)).toBe(true);
      expect(isFirstTimer(undefined, HERO)).toBe(true);
    });

    it('excludes anyone who has consumed it', () => {
      expect(isFirstTimer([HERO], HERO)).toBe(false);
      expect(isFirstTimer(['x', HERO, 'y'], HERO)).toBe(false);
    });

    it('matches the id exactly — no prefix or case folding', () => {
      expect(isFirstTimer([HERO.toLowerCase()], HERO)).toBe(true);
    });
  });

  // ===============================================================================================
  // LEU-02 — completion ratio
  // ===============================================================================================
  describe('LEU-02 completion ratio', () => {
    it('is done over total', () => {
      expect(completionRatio(3, 4)).toBe(0.75);
      expect(completionRatio(0, 4)).toBe(0);
      expect(completionRatio(4, 4)).toBe(1);
    });

    it('is null when there are no adjustments — "no ATC on record", not "0% done"', () => {
      // This is the difference between a participant who is behind and one who was never measured.
      // null keeps them out of every tier and shows "—" in the table.
      expect(completionRatio(0, 0)).toBeNull();
    });
  });

  // ===============================================================================================
  // LEU-03 — completion tiers
  // ===============================================================================================
  describe('LEU-03 completion tiers', () => {
    const q = (ratios: number[], total = ratios.length) =>
      completionQuartiles(ratios.map((r, i) => ({ profileId: 'p' + i, ratio: r })), total);

    it('exposes the five tiers in order, with the labels the UI shows', () => {
      expect(QUARTILE_DEFS.map(d => d.cls)).toEqual(['q100', 'q75', 'q50', 'q25', 'q0']);
      expect(QUARTILE_DEFS.map(d => d.label)).toEqual(['100%', '75–99%', '50–74%', '25–49%', 'Below 25%']);
    });

    it('puts each participant in exactly one tier', () => {
      const rows = q([1, 0.8, 0.6, 0.3, 0.1]);
      expect(rows.map(r => r.count)).toEqual([1, 1, 1, 1, 1]);
    });

    it('bands on the boundary values the product chose', () => {
      // Every lower bound is inclusive and every upper bound exclusive: 0.75 is 75–99%, not 50–74%.
      expect(q([0.75])[1].count).toBe(1);
      expect(q([0.7499])[2].count).toBe(1);
      expect(q([0.5])[2].count).toBe(1);
      expect(q([0.4999])[3].count).toBe(1);
      expect(q([0.25])[3].count).toBe(1);
      expect(q([0.2499])[4].count).toBe(1);
    });

    it('treats only an exact 1 as 100%', () => {
      expect(q([1])[0].count).toBe(1);
      expect(q([0.999])[0].count).toBe(0);
      expect(q([0.999])[1].count).toBe(1);
    });

    it('carries the profile ids so a tier click can open that exact list', () => {
      expect(q([1, 1, 0.1])[0].profileIds).toEqual(['p0', 'p1']);
    });

    it('DEFECT (pinned): tier widths are a share of the WHOLE universe, not of the measured group', () => {
      // Two measured participants, both at 100%, out of ten registered. The bar reads 20% — so a
      // section where every measurable participant is finished still renders four-fifths empty, and
      // an operator scanning the bar reads it as "barely started".
      const rows = completionQuartiles(
        [{ profileId: 'a', ratio: 1 }, { profileId: 'b', ratio: 1 }], 10
      );
      expect(rows[0].count).toBe(2);
      expect(rows[0].width).toBe(20);
      expect(rows.reduce((s, r) => s + r.width, 0)).toBe(20);   // widths do not sum to 100
    });

    it('renders zero-width tiers rather than dividing by zero on an empty event', () => {
      expect(completionQuartiles([], 0).every(r => r.width === 0 && r.count === 0)).toBe(true);
    });
  });

  // ===============================================================================================
  // LEU-04 — journey matrix columns
  // ===============================================================================================
  describe('LEU-04 journey columns', () => {
    const label = (id: string) => id.toUpperCase();
    const js = [
      { journeyId: 'a', count: 3 },
      { journeyId: 'b', count: 5 },
      { journeyId: 'c', count: 1 },
    ];

    it('keeps ungrouped journeys separate, biggest first', () => {
      const cols = journeyColumns(js, {}, label);
      expect(cols.map(c => c.key)).toEqual(['b', 'a', 'c']);
      expect(cols.every(c => !c.isGroup)).toBe(true);
      expect(cols[0].label).toBe('B');
    });

    it('collapses same-named groups into one column carrying every member journey', () => {
      const cols = journeyColumns(js, { a: 'Core', c: 'Core' }, label);
      const grp = cols.find(c => c.isGroup)!;
      expect(grp.key).toBe('grp:Core');
      expect(grp.label).toBe('Core');
      expect(grp.journeyIds).toEqual(['a', 'c']);
    });

    it('orders a group by its COMBINED headcount', () => {
      // Core is 3 + 1 = 4, below b's 5 — so grouping must not float it to the front.
      const cols = journeyColumns(js, { a: 'Core', c: 'Core' }, label);
      expect(cols.map(c => c.key)).toEqual(['b', 'grp:Core']);
    });

    it('ignores a whitespace-only group name', () => {
      // An operator who cleared the name box must get their journey back as its own column.
      const cols = journeyColumns(js, { a: '   ' }, label);
      expect(cols.every(c => !c.isGroup)).toBe(true);
    });

    it('shows every journey individually in edit mode so each can be ticked', () => {
      const cols = journeyColumns(js, { a: 'Core', c: 'Core' }, label, true);
      expect(cols.length).toBe(3);
      expect(cols.every(c => !c.isGroup)).toBe(true);
    });
  });

  // ===============================================================================================
  // LEU-05 — journey badge colours
  // ===============================================================================================
  describe('LEU-05 journey badge colour', () => {
    it('cycles the palette by position', () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      expect(journeyBadgeClass('a', ids)).toBe('jc0');
      expect(journeyBadgeClass('f', ids)).toBe('jc5');
      expect(journeyBadgeClass('g', ids)).toBe('jc0');   // wraps after JOURNEY_PALETTE_SIZE
      expect(JOURNEY_PALETTE_SIZE).toBe(6);
    });

    it('DEFECT (pinned): an unknown journey silently takes the FIRST journey\'s colour', () => {
      // indexOf returns -1 and the guard coerces it to 0, so a badge for a journey that is not in the
      // counts list is visually identical to the first real journey. On a matrix where colour is the
      // only thing separating journeys, that reads as "these two people are in the same journey".
      expect(journeyBadgeClass('unknown', ['a', 'b'])).toBe('jc0');
      expect(journeyBadgeClass('a', ['a', 'b'])).toBe('jc0');   // the collision, spelled out
    });
  });

  // ===============================================================================================
  // LEU-06 — attendance grid labels and percentages
  // ===============================================================================================
  describe('LEU-06 attendance labels', () => {
    it('names the weekday from a local-midnight parse, not a UTC one', () => {
      // '2026-05-18' parsed as UTC would slide back a day west of Greenwich and print the wrong
      // weekday on every card. Splitting the string keeps it local.
      expect(weekdayLabel('2026-05-18')).toBe('Mon');
      expect(weekdayLabel('2026-05-24')).toBe('Sun');
    });

    it('formats a short date the same way', () => {
      expect(shortDateLabel('2026-05-18')).toBe('May 18');
    });

    it('calls the live day "Today" and every other day by its number', () => {
      expect(dayLabel({ day: 3, isToday: true })).toBe('Today');
      expect(dayLabel({ day: 3, isToday: false })).toBe('Day 3');
    });

    it('builds the range header with a 1-based day counter', () => {
      const days = [
        { date: '2026-05-18', isFuture: false },
        { date: '2026-05-19', isFuture: false },
        { date: '2026-05-20', isFuture: true },
      ];
      expect(attendanceRangeLabel(days, iso => iso)).toBe('2026-05-18 – 2026-05-20 · Day 2 of 3');
    });

    it('never reads "Day 0" before the event starts', () => {
      // Every day still in the future would give a count of 0; Math.max pins it to Day 1.
      const days = [{ date: 'a', isFuture: true }, { date: 'b', isFuture: true }];
      expect(attendanceRangeLabel(days, iso => iso)).toBe('a – b · Day 1 of 2');
    });

    it('returns an empty header when the event has no days', () => {
      expect(attendanceRangeLabel([], iso => iso)).toBe('');
    });
  });

  // ===============================================================================================
  // LEU-07 — the day-card bar
  // ===============================================================================================
  describe('LEU-07 day bar percentage', () => {
    it('is video asks over attendance, rounded', () => {
      expect(todayBarPct(5, 10)).toBe(50);
      expect(todayBarPct(1, 3)).toBe(33);
    });

    it('draws nothing while the video-ask data has not loaded', () => {
      // null means "not loaded yet" — an empty bar is honest, 0% would not be.
      expect(todayBarPct(null, 10)).toBe(0);
    });

    it('draws nothing rather than dividing by zero on a day nobody attended', () => {
      expect(todayBarPct(4, 0)).toBe(0);
    });

    it('DEFECT (pinned): the bar is not clamped and can exceed 100%', () => {
      // Video asks are counted per submission-day and attendance per scan, from two different
      // sources. Someone who submits without a scan (or on the wrong day key) pushes the numerator
      // past the denominator and the bar overflows its track.
      expect(todayBarPct(12, 10)).toBe(120);
    });
  });

  // ===============================================================================================
  // LEU-08 — video-ask reconciliation
  // ===============================================================================================
  describe('LEU-08 video ask per day', () => {
    it('narrows submissions to the registered universe', () => {
      // A walk-in who submits but was never approved must not inflate the day's count.
      expect(videoAskIdsForDay(['a', 'gatecrasher', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b']);
    });

    it('lists everyone present that day who did not submit', () => {
      expect(missingRecordingIds(['a', 'b', 'c'], ['b'], ['a', 'b', 'c'])).toEqual(['a', 'c']);
    });

    it('excludes an unregistered attendee from the missing list too', () => {
      expect(missingRecordingIds(['a', 'ghost'], [], ['a'])).toEqual(['a']);
    });

    it('derives "attended at least once" by subtracting the never-attended', () => {
      expect(attendedAtLeastOnceIds(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    });
  });

  // ===============================================================================================
  // LEU-09 — day-scope chips
  // ===============================================================================================
  describe('LEU-09 day scope', () => {
    const days = [
      day({ day: 1, date: 'd1', isPast: true }),
      day({ day: 2, date: 'd2', isToday: true, isPast: false }),
      day({ day: 3, date: 'd3', isPast: false, isFuture: true }),
    ];

    it('"all" covers every day that has happened, never a future one', () => {
      expect(scopeDates('all', days)).toEqual(['d1', 'd2']);
    });

    it('"today" resolves to the flagged day', () => {
      expect(scopeDates('today', days)).toEqual(['d2']);
    });

    it('an explicit date is taken literally', () => {
      expect(scopeDates('d1', days)).toEqual(['d1']);
    });

    it('DEFECT (pinned): "today" outside the event range silently scopes to NOTHING', () => {
      // On a day the event structure does not contain (the day after it ends, or a timezone edge),
      // no day carries isToday, so every Video Ask and Arena Calling KPI reads a confident 0 — which
      // looks like "nobody has anything outstanding" instead of "there is no data for today".
      const noToday = [day({ date: 'd1' }), day({ date: 'd3', isFuture: true })];
      expect(scopeDates('today', noToday)).toEqual([]);
    });
  });

  // ===============================================================================================
  // LEU-10 — review coverage
  // ===============================================================================================
  describe('LEU-10 review percentage', () => {
    it('is reviewed over received, rounded', () => {
      expect(reviewPercentage(3, 4)).toBe(75);
    });

    it('reads 0 rather than dividing by zero when nothing was received', () => {
      expect(reviewPercentage(0, 0)).toBe(0);
    });

    it('DEFECT (pinned): not clamped — can report more than 100% reviewed', () => {
      // "Received" and "reviewed" are collected from two independent per-day maps, so a submission
      // tagged under one day key and received under another counts on only one side. A tile reading
      // "125% reviewed" is the visible symptom of a day-key mismatch nobody is alerted to.
      expect(reviewPercentage(5, 4)).toBe(125);
    });
  });

  // ===============================================================================================
  // LEU-11 — Arena Calling
  // ===============================================================================================
  describe('LEU-11 call outcomes', () => {
    it('lets an in-flight optimistic write win over the live log', () => {
      // The operator just clicked "Coming"; the write is still in the air. Showing the stale log
      // value would flicker the chip back and read as a lost click.
      expect(resolveCallStatus('coming', 'no-answer')).toBe('coming');
    });

    it('falls back to the live log', () => {
      expect(resolveCallStatus(undefined, 'not-coming')).toBe('not-coming');
    });

    it('defaults an absentee nobody has called to "pending"', () => {
      expect(resolveCallStatus(undefined, undefined)).toBe('pending');
    });

    it('tallies the four outcomes', () => {
      const s = summariseCalls([
        { status: 'pending' }, { status: 'pending' }, { status: 'coming' },
        { status: 'no-answer' }, { status: 'not-coming' },
      ]);
      expect(s).toEqual({ pending: 2, coming: 1, noAnswer: 1, notComing: 1 });
    });

    it('ignores a status it does not recognise instead of throwing', () => {
      expect(summariseCalls([{ status: 'wat' }])).toEqual({ pending: 0, coming: 0, noAnswer: 0, notComing: 0 });
    });

    it('maps outcomes to their CSS modifiers', () => {
      expect(callStatusClass('no-answer')).toBe('noanswer');
      expect(callStatusClass('not-coming')).toBe('notcoming');
      expect(callStatusClass('coming')).toBe('coming');
      expect(callStatusClass('nonsense')).toBe('');
    });
  });

  // ===============================================================================================
  // LEU-12 — Customer Support
  // ===============================================================================================
  describe('LEU-12 support tickets', () => {
    it('maps the service label to the feed status', () => {
      expect(ticketStatusLabel('resolved')).toBe('Resolved');
      expect(ticketStatusLabel('open')).toBe('Open');
      expect(ticketStatusLabel('responded')).toBe('In Progress');
    });

    it('treats any unrecognised label as In Progress', () => {
      // "In Progress" is the catch-all, so a new label shipped by the tickets collection lands
      // there rather than disappearing.
      expect(ticketStatusLabel('')).toBe('In Progress');
    });

    it('computes resolution hours to one decimal', () => {
      const open = Date.UTC(2026, 4, 18, 9, 0, 0);
      expect(resolutionHours(open, open + 3600000)).toBe(1);
      expect(resolutionHours(open, open + 5400000)).toBe(1.5);
      expect(resolutionHours(open, open + 3600000 * 1.234)).toBe(1.2);
    });

    it('returns null when either endpoint is missing', () => {
      expect(resolutionHours(null, 1)).toBeNull();
      expect(resolutionHours(1, null)).toBeNull();
    });

    it('DEFECT (pinned): a close before the report yields NEGATIVE hours', () => {
      // Backfilled tickets and clock-skewed devices produce this, and the value feeds straight into
      // the mean on the "resolution" tile — one bad ticket drags the whole team's number down.
      const open = Date.UTC(2026, 4, 18, 9, 0, 0);
      expect(resolutionHours(open, open - 7200000)).toBe(-2);
    });

    it('maps feed statuses to CSS modifiers', () => {
      expect(feedStatusClass('In Progress')).toBe('inprogress');
      expect(feedStatusClass('Open')).toBe('open');
      expect(feedStatusClass('Resolved')).toBe('resolved');
    });
  });

  // ===============================================================================================
  // LEU-13 — Participant Data table filter
  // ===============================================================================================
  describe('LEU-13 participant table filter', () => {
    const f = (over: Partial<PdFilter> = {}): PdFilter => ({ ...defaultPdFilter(), ...over });

    it('lets everything through in its default state', () => {
      expect(pdMatches(row(), f())).toBe(true);
      expect(defaultPdFilter()).toEqual({ q: '', journey: 'all', type: 'all', atc: 'all', pctOp: '>=', pctVal: 0, band: '' });
    });

    it('searches name and email, case- and space-insensitively', () => {
      expect(pdMatches(row(), f({ q: '  ADA ' }))).toBe(true);
      expect(pdMatches(row(), f({ q: 'example.com' }))).toBe(true);
      expect(pdMatches(row(), f({ q: 'babbage' }))).toBe(false);
    });

    it('filters by journey and by first-timer type', () => {
      expect(pdMatches(row({ journeyId: 'j2' }), f({ journey: 'j1' }))).toBe(false);
      expect(pdMatches(row({ ft: true }), f({ type: 'ft' }))).toBe(true);
      expect(pdMatches(row({ ft: true }), f({ type: 'rp' }))).toBe(false);
    });

    it('compares the bucket filter numerically, not as the string the select gives it', () => {
      expect(pdMatches(row({ atcBucket: 2 }), f({ atc: '2' }))).toBe(true);
      expect(pdMatches(row({ atcBucket: 2 }), f({ atc: '3' }))).toBe(false);
    });

    it('filters a clicked tier by MEMBERSHIP, not by a percentage threshold', () => {
      // The table's % column is Math.round(ratio*100) while the tiers band on the raw ratio, so a
      // participant on 0.497 sits in 25–49% but renders "50%". Membership is exact by construction.
      const inBand = new Set(['p1']);
      expect(pdMatches(row({ profileId: 'p1', atcPct: 50 }), f({ band: 'q25' }), inBand)).toBe(true);
      expect(pdMatches(row({ profileId: 'p2', atcPct: 30 }), f({ band: 'q25' }), inBand)).toBe(false);
    });

    it('applies the three percentage operators', () => {
      expect(pdMatches(row({ atcPct: 50 }), f({ pctOp: '>=', pctVal: 50 }))).toBe(true);
      expect(pdMatches(row({ atcPct: 49 }), f({ pctOp: '>=', pctVal: 50 }))).toBe(false);
      expect(pdMatches(row({ atcPct: 50 }), f({ pctOp: '<=', pctVal: 50 }))).toBe(true);
      expect(pdMatches(row({ atcPct: 50 }), f({ pctOp: '<', pctVal: 50 }))).toBe(false);
    });

    it('keeps unknown-% rows until a threshold is actually set', () => {
      expect(pdMatches(row({ atcPct: null }), f())).toBe(true);
      expect(pdMatches(row({ atcPct: null }), f({ pctVal: 1 }))).toBe(false);
    });

    it('DEFECT (pinned): "<" with the default 0 shows ONLY the participants with no data', () => {
      // Nothing is < 0, so every measured row is dropped; the unknown-% branch only excludes once
      // pctVal > 0, so those rows stay. Picking "<" before typing a number leaves an operator staring
      // at a table of exactly the people the dashboard knows nothing about.
      const measured = row({ atcPct: 0 });
      const unknown = row({ profileId: 'p2', atcPct: null });
      expect(pdMatches(measured, f({ pctOp: '<', pctVal: 0 }))).toBe(false);
      expect(pdMatches(unknown, f({ pctOp: '<', pctVal: 0 }))).toBe(true);
    });
  });

  // ===============================================================================================
  // LEU-14 — table sort
  // ===============================================================================================
  describe('LEU-14 participant table sort', () => {
    it('sorts names alphabetically in the given direction', () => {
      const a = row({ name: 'Ada' }), b = row({ name: 'Grace' });
      expect(comparePdRows(a, b, 'name', 1)).toBeLessThan(0);
      expect(comparePdRows(a, b, 'name', -1)).toBeGreaterThan(0);
    });

    it('sorts numeric columns numerically', () => {
      expect(comparePdRows(row({ attd: 2 }), row({ attd: 9 }), 'attd', 1)).toBeLessThan(0);
    });

    it('DEFECT (pinned): an unknown % sorts BELOW a real 0%, as if it were -1', () => {
      // Participants with no ATC on record are pushed under the genuinely-at-zero ones on an
      // ascending sort. The two mean completely different things — "never measured" versus "measured
      // and has done nothing" — and the column that is supposed to separate them merges them.
      const unknown = row({ atcPct: null }), zero = row({ atcPct: 0 });
      expect(comparePdRows(unknown, zero, 'atcPct', 1)).toBeLessThan(0);
    });

    it('flips direction when the same header is clicked again', () => {
      expect(nextPdSort({ key: 'name', dir: 1 }, 'name')).toEqual({ key: 'name', dir: -1 });
      expect(nextPdSort({ key: 'name', dir: -1 }, 'name')).toEqual({ key: 'name', dir: 1 });
    });

    it('starts a new column ascending for the name and descending for a number', () => {
      // A→Z reads naturally for names; every count column is more useful biggest-first.
      expect(nextPdSort({ key: 'attd', dir: 1 }, 'name')).toEqual({ key: 'name', dir: 1 });
      expect(nextPdSort({ key: 'name', dir: 1 }, 'attd')).toEqual({ key: 'attd', dir: -1 });
    });
  });

  // ===============================================================================================
  // LEU-15 — CSV export
  // ===============================================================================================
  describe('LEU-15 CSV export', () => {
    const ctx = { journeyLabel: (id: string) => 'Journey ' + id, atcLabel: (b: number) => 'B' + b, totalDays: 5 };

    it('quotes every text cell and doubles inner quotes', () => {
      expect(csvCell('plain')).toBe('"plain"');
      expect(csvCell('a,b')).toBe('"a,b"');
      expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    });

    it('emits the header first, in the documented column order', () => {
      const lines = buildPdCsvLines([], ctx);
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe(PD_CSV_HEADER.join(','));
      expect(PD_CSV_HEADER[0]).toBe('Name');
      expect(PD_CSV_HEADER[PD_CSV_HEADER.length - 1]).toBe('Attended Days');
    });

    it('writes attendance as a fraction of the event length', () => {
      expect(buildPdCsvLines([row({ attd: 3 })], ctx)[1]).toContain('3/5');
    });

    it('spells out the participant type in words', () => {
      expect(buildPdCsvLines([row({ ft: true })], ctx)[1]).toContain('First timer');
      expect(buildPdCsvLines([row({ ft: false })], ctx)[1]).toContain('Repeat');
    });

    it('leaves an unknown % as an empty cell, not a zero', () => {
      // A 0 here would be read as "did nothing" by whoever opens the sheet.
      const cells = buildPdCsvLines([row({ atcPct: null })], ctx)[1].split(',');
      expect(cells[5]).toBe('');
    });

    it('slugs the event name for the filename', () => {
      expect(exportFileStem('Live Event: Mumbai 2026!')).toBe('live-event-mumbai-2026-');
      expect(exportFileStem('')).toBe('event');
    });
  });

  // ===============================================================================================
  // LEU-16 — video-ask tag columns
  // ===============================================================================================
  describe('LEU-16 video ask tags', () => {
    const doc = (profileid: string, tags: string[], addressed = false, d = 'd1') =>
      ({ profileid, day: d, tags, addressed });

    it('scopes docs to a day and drops any doc without one', () => {
      const docs = [doc('a', ['t1'], false, 'd1'), doc('b', ['t1'], false, 'd2'), doc('c', ['t1'], false, '')];
      expect(tagDocsForDay(docs, 'd1').map(x => x.profileid)).toEqual(['a']);
      expect(tagDocsForDay(docs, 'all').map(x => x.profileid)).toEqual(['a', 'b']);
    });

    it('puts a participant in EVERY tag they carry, not just one', () => {
      // Column sums therefore exceed headcount — that is correct here, where it would be a bug signal
      // on a partition.
      const g = groupVideoAskTags([doc('a', ['t1', 't2'])], ['t1', 't2']);
      expect(g.byTag['t1']).toEqual(['a']);
      expect(g.byTag['t2']).toEqual(['a']);
    });

    it('counts a participant once per column across several submissions', () => {
      const g = groupVideoAskTags([doc('a', ['t1']), doc('a', ['t1'])], ['t1']);
      expect(g.byTag['t1']).toEqual(['a']);
    });

    it('moves a fully-addressed participant into Addressed and OUT of every tag column', () => {
      const g = groupVideoAskTags([doc('a', ['t1'], true)], ['t1']);
      expect(g.addressedIds).toEqual(['a']);
      expect(g.byTag['t1']).toEqual([]);
    });

    it('keeps a participant with one unaddressed submission under their tags', () => {
      const g = groupVideoAskTags([doc('a', ['t1'], true), doc('a', ['t2'], false)], ['t1', 't2']);
      expect(g.addressedIds).toEqual([]);
      expect(g.byTag['t1']).toEqual(['a']);
      expect(g.byTag['t2']).toEqual(['a']);
    });

    it('never lets an untagged submission make someone Addressed by accident', () => {
      // Without the "at least one tagged doc" guard, "all tagged docs are addressed" is vacuously
      // true for a participant who was never tagged, and they would land in Addressed.
      const g = groupVideoAskTags([doc('a', [], false)], ['t1']);
      expect(g.addressedIds).toEqual([]);
      expect(g.byTag['t1']).toEqual([]);
    });

    it('reports a tag id that has no column instead of rendering it', () => {
      const g = groupVideoAskTags([doc('a', ['retired'])], ['t1']);
      expect(g.unknownTagIds).toEqual(['retired']);
      expect(g.byTag['t1']).toEqual([]);
    });

    it('DEFECT (pinned): an UNTAGGED unaddressed submission cannot hold someone out of Addressed', () => {
      // The untagged doc is skipped before the addressed vote, so a participant whose only
      // outstanding submission is the untagged one still shows as fully Addressed. An operator
      // clearing the Addressed column believes that video ask has been dealt with; it has not.
      const g = groupVideoAskTags([doc('a', ['t1'], true), doc('a', [], false)], ['t1']);
      expect(g.addressedIds).toEqual(['a']);
    });

    it('keeps empty taxonomy columns so the scroller always renders in full', () => {
      const g = groupVideoAskTags([], ['t1', 't2']);
      expect(Object.keys(g.byTag)).toEqual(['t1', 't2']);
    });
  });

  // ===============================================================================================
  // LEU-17 — CRM flags
  // ===============================================================================================
  describe('LEU-17 CRM flags', () => {
    it('lists a participant under every flag they carry', () => {
      const by = groupCrmTags(['f1', 'f2'], [{ profileId: 'a', tags: ['f1', 'f2'] }]);
      expect(by['f1']).toEqual(['a']);
      expect(by['f2']).toEqual(['a']);
    });

    it('keeps a flag with nobody on it', () => {
      const by = groupCrmTags(['f1', 'f2'], [{ profileId: 'a', tags: ['f1'] }]);
      expect(by['f2']).toEqual([]);
    });

    it('ignores a tag that is not part of the taxonomy', () => {
      const by = groupCrmTags(['f1'], [{ profileId: 'a', tags: ['f1', 'stale'] }]);
      expect(Object.keys(by)).toEqual(['f1']);
    });

    it('cycles the palette by column index', () => {
      expect(paletteColor(0, ['x', 'y'])).toBe('x');
      expect(paletteColor(3, ['x', 'y'])).toBe('y');
    });
  });

  // ===============================================================================================
  // LEU-18 — zones and cohorts
  // ===============================================================================================
  describe('LEU-18 zones and cohorts', () => {
    it('computes coverage as allocated over present', () => {
      expect(coveragePct(3, 4)).toBe(75);
    });

    it('reads 0 rather than dividing by zero before anyone arrives', () => {
      expect(coveragePct(0, 0)).toBe(0);
    });

    it('joins staff names, falling back to the id when a name is missing', () => {
      // Showing a raw id is ugly but honest — an empty cell would read as "no coordinator assigned".
      expect(staffNamesLabel(['s1', 's2'], id => ({ s1: 'Ada' } as any)[id])).toBe('Ada, s2');
    });

    it('shows an em dash when a zone has no staff, and tolerates a non-array field', () => {
      expect(staffNamesLabel([], () => '')).toBe('—');
      expect(staffNamesLabel(null, () => '')).toBe('—');
    });

    it('groups by name with the biggest group first', () => {
      const g = groupByName(['a', 'b', 'c'], id => (id === 'c' ? 'Beta' : 'Alpha'));
      expect(g.map(x => [x.name, x.count])).toEqual([['Alpha', 2], ['Beta', 1]]);
    });

    it('finds the participants in no cohort at all', () => {
      expect(idsWithoutCohort(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
    });
  });

  // ===============================================================================================
  // LEU-19 — panel labels
  // ===============================================================================================
  describe('LEU-19 panel labels', () => {
    const opts = [{ id: 'p1', name: 'Solar Voice' }, { id: 'p2', name: 'uP!' }];

    it('names a single pick and counts several', () => {
      expect(triggerLabel(['p1'], opts, 'product')).toBe('Solar Voice');
      expect(triggerLabel(['p1', 'p2'], opts, 'product')).toBe('2 products');
    });

    it('falls back to a count when the picked option is no longer in the list', () => {
      expect(triggerLabel(['gone'], opts, 'product')).toBe('1 product');
    });

    it('DEFECT (pinned): zero picks reads "0 products"', () => {
      // The trigger is normally hidden while nothing is picked, so this is latent — but any future
      // caller that renders it unconditionally gets a label that says the wrong thing in the wrong
      // grammatical form instead of a placeholder.
      expect(triggerLabel([], opts, 'product')).toBe('0 products');
    });

    it('takes up to two initials, upper-cased', () => {
      expect(initials('ada lovelace')).toBe('AL');
      expect(initials('Ada Byron King Lovelace')).toBe('AB');
      expect(initials('Ada')).toBe('A');
      expect(initials('')).toBe('');
    });

    it('survives a name with double spaces rather than emitting a stray character', () => {
      expect(initials('Ada  Lovelace')).toBe('AL');
    });

    it('pluralises the participant count', () => {
      expect(participantCountLabel(1)).toBe('1 participant');
      expect(participantCountLabel(2)).toBe('2 participants');
    });

    it('states rows AND people for a grouped changework list', () => {
      // A grouped row is 1 lead + N counterparts, so the row count is not a headcount — saying
      // "3 participants" under-reported the people on screen and contradicted the filter dropdowns.
      expect(pairCountLabel(3, 7, 'doer')).toBe('3 doers · 7 people');
      expect(pairCountLabel(1, 1, 'beneficiary')).toBe('1 beneficiary · 1 person');
      expect(pairCountLabel(2, 5, 'beneficiary')).toBe('2 beneficiaries · 5 people');
    });
  });

  // ===============================================================================================
  // LEU-20 — clock helpers (frozen, so these never flake)
  // ===============================================================================================
  describe('LEU-20 clock helpers', () => {
    it('renders today as an ISO-ordered local date key', () => {
      // en-CA is used precisely because it prints yyyy-mm-dd, which is what the attendance day keys
      // are — and it is the LOCAL date, so an operator past UTC midnight still sees their own day.
      expect(todayKey(new Date(2026, 4, 18, 23, 30))).toBe('2026-05-18');
    });

    it('formats a call time as h:mm with a meridiem', () => {
      // Matched loosely on the separator only: browsers disagree on whether the space before AM/PM
      // is U+0020 or U+202F, and that is not what this rule is about.
      expect(timeLabel(new Date(2026, 4, 18, 9, 5))).toMatch(/^9:05\s?AM$/);
      expect(timeLabel(new Date(2026, 4, 18, 14, 30))).toMatch(/^2:30\s?PM$/);
    });

    it('renders nothing for a missing time', () => {
      expect(timeLabel(null)).toBe('');
    });
  });

  // ===============================================================================================
  // LEU-21 — ATC bucket label (index in, label out — no ATC data is read here)
  // ===============================================================================================
  describe('LEU-21 bucket label', () => {
    const short = ['Full', 'Partial', 'Unval', 'None'];

    it('labels a known bucket index', () => {
      expect(pdAtcLabel(0, short)).toBe('Full');
      expect(pdAtcLabel(3, short)).toBe('None');
    });

    it('shows an em dash for the unknown sentinel', () => {
      // -1 means "not in any bucket" — a dash says so, where "Full" would be a lie.
      expect(pdAtcLabel(-1, short)).toBe('—');
    });
  });
});
