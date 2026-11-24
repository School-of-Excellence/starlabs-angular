// workshop-dashboard.glance.unit.spec.ts — unit tests for the At a glance additions (2026-11-17).
//
// WHY: the six new cards are counts over time windows (7×24h, 3×24h, calendar days) and day arithmetic
// on the workshop dates. Off-by-one mistakes there read as plausible numbers on screen, so each window
// edge and each piece of wording ("Starts tomorrow", "Ends today", "Ended yesterday") is pinned here with
// a frozen clock. Every date is built in LOCAL time (new Date(y, m, d, h)), the same frame the rules
// count in, so the spec passes in any timezone.
//
// NOT COVERED HERE: the template, the side panel opening, the Top tags click and the tag-name read —
// those belong to the workshop e2e suite.
import {
  GLANCE_DAY_MS,
  calendarDaysBetween,
  daysWord,
  emptyGlanceJoined,
  firstDocPerPerson,
  joinedRecently,
  latestStepFinishedMs,
  needsAttention,
  isSignupWindowSet,
  newSignups,
  shortDay,
  signupWindow,
  signupWindowLabel,
  tagIdSetKey,
  topTags,
  weekdayDay,
  workshopTimeline,
} from './workshop-dashboard.glance';
import { formatDate } from './workshop-dashboard.engine';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const HOUR = 60 * 60 * 1000;
/** A Firestore Timestamp look-alike (the engine's toMillis reads toMillis()). */
const ts = (ms: number) => ({ toMillis: () => ms });

describe('workshop-dashboard.glance', () => {

  describe('day helpers', () => {
    it('counts local calendar days, not elapsed hours', () => {
      expect(calendarDaysBetween(at(2026, 11, 16, 23, 59), at(2026, 11, 17, 0, 1))).toBe(1);
      expect(calendarDaysBetween(at(2026, 11, 17, 0, 1), at(2026, 11, 17, 23, 59))).toBe(0);
      expect(calendarDaysBetween(at(2026, 11, 20), at(2026, 11, 17))).toBe(-3);
    });
    it('formats days the way the cards print them', () => {
      expect(shortDay(at(2026, 11, 5))).toBe('05 Nov');
      expect(weekdayDay(at(2026, 11, 20))).toBe('Fri 20 Nov');
      expect(daysWord(1)).toBe('1 day');
      expect(daysWord(24)).toBe('24 days');
    });
    it('keeps the first doc per person, in order', () => {
      const out = firstDocPerPerson([{ profileid: 'a', n: 1 }, { profileid: 'b', n: 2 }, { profileid: 'a', n: 3 }, { profileid: '', n: 4 }] as any[]);
      expect(out.map((d: any) => d.n)).toEqual([1, 2]);
    });
  });

  describe('workshopTimeline', () => {
    const base = { evergreen: false, evergreenDays: 0, start: ts(at(2026, 11, 5, 9)), end: ts(at(2026, 11, 28, 18)) };

    it('running: Day 12 of 24 with 12 days left (both ends counted)', () => {
      const t = workshopTimeline(base, at(2026, 11, 16, 12))!;
      expect(t.kind).toBe('live');
      expect(t.title).toBe('Day 12');
      expect(t.titleOf).toBe('of 24');
      expect(t.sub).toBe('12 days left');
      expect(t.pill).toBe('Running');
      expect(t.pct).toBe(50);
      expect(t.startLabel).toBe('Starts 05 Nov');
      expect(t.endLabel).toBe('Ends 28 Nov');
    });

    it('running: "1 day left" the day before the end, "Ends today" on the end day (even after its end time)', () => {
      expect(workshopTimeline(base, at(2026, 11, 27, 10))!.sub).toBe('1 day left');
      const last = workshopTimeline(base, at(2026, 11, 28, 22))!;
      expect(last.kind).toBe('live');
      expect(last.title).toBe('Day 24');
      expect(last.sub).toBe('Ends today');
      expect(last.pct).toBe(100);
    });

    it('running from the start moment on the first day: Day 1', () => {
      const t = workshopTimeline(base, at(2026, 11, 5, 9, 30))!;
      expect(t.kind).toBe('live');
      expect(t.title).toBe('Day 1');
      expect(t.sub).toBe('23 days left');
    });

    it('upcoming: "Starts in 3 days" with the weekday and the length', () => {
      const w = { ...base, start: ts(at(2026, 11, 20, 9)), end: ts(at(2026, 12, 13, 18)) };
      const t = workshopTimeline(w, at(2026, 11, 17, 10))!;
      expect(t.kind).toBe('soon');
      expect(t.title).toBe('Starts in 3 days');
      expect(t.titleOf).toBe('');
      expect(t.sub).toBe('Fri 20 Nov · 24 days long');
      expect(t.pill).toBe('Upcoming');
      expect(t.pct).toBe(0);
      expect(t.startLabel).toBe('Starts 20 Nov');
      expect(t.endLabel).toBe('Ends 13 Dec');
    });

    it('upcoming: "Starts tomorrow", and "Starts today" before a later-today start time', () => {
      const w = { ...base, start: ts(at(2026, 11, 18, 9)), end: ts(at(2026, 11, 18, 18)) };
      expect(workshopTimeline(w, at(2026, 11, 17, 23))!.title).toBe('Starts tomorrow');
      const today = workshopTimeline(w, at(2026, 11, 18, 7))!;
      expect(today.kind).toBe('soon');
      expect(today.title).toBe('Starts today');
      expect(today.sub).toBe('Wed 18 Nov · 1 day long');
    });

    it('ended: "Ended 4 days ago", "Ended yesterday"', () => {
      const t = workshopTimeline(base, at(2026, 12, 2, 8))!;
      expect(t.kind).toBe('done');
      expect(t.title).toBe('Ended 4 days ago');
      expect(t.sub).toBe('Ran 24 days · 05 Nov – 28 Nov');
      expect(t.pill).toBe('Ended');
      expect(t.pct).toBe(100);
      expect(t.startLabel).toBe('Started 05 Nov');
      expect(t.endLabel).toBe('Ended 28 Nov');
      expect(workshopTimeline(base, at(2026, 11, 29, 0, 5))!.title).toBe('Ended yesterday');
    });

    it('evergreen: the journey length, no track; hidden when the length is 0', () => {
      const t = workshopTimeline({ evergreen: true, evergreenDays: 8, start: null, end: null }, at(2026, 11, 17))!;
      expect(t.kind).toBe('ever');
      expect(t.title).toBe('8-day journey');
      expect(t.sub).toBe('Evergreen · each participant starts on their own day');
      expect(t.pill).toBe('Evergreen');
      expect(workshopTimeline({ evergreen: true, evergreenDays: 0, start: base.start, end: base.end }, at(2026, 11, 17))).toBeNull();
    });

    it('hidden when a date is missing or unreadable, or the end is before the start', () => {
      const now = at(2026, 11, 17);
      expect(workshopTimeline({ ...base, start: null }, now)).toBeNull();
      expect(workshopTimeline({ ...base, end: undefined }, now)).toBeNull();
      expect(workshopTimeline({ ...base, start: 'not a date' }, now)).toBeNull();
      expect(workshopTimeline({ ...base, start: ts(at(2026, 11, 28)), end: ts(at(2026, 11, 5)) }, now)).toBeNull();
    });

    it('reads the {seconds} timestamp shape too', () => {
      const w = { ...base, start: { seconds: at(2026, 11, 5, 9) / 1000 }, end: { seconds: at(2026, 11, 28, 18) / 1000 } };
      expect(workshopTimeline(w, at(2026, 11, 16, 12))!.title).toBe('Day 12');
    });
  });

  describe('joinedRecently', () => {
    const now = at(2026, 11, 17, 12);

    it('counts the last 7×24h against the 7×24h before, first enrolled doc per person', () => {
      const j = joinedRecently([
        { profileid: 'a', enrollmentdate: ts(now - HOUR) },
        { profileid: 'b', enrollmentdate: ts(now - 7 * GLANCE_DAY_MS + 60_000) },   // just inside
        { profileid: 'c', enrollmentdate: ts(now - 7 * GLANCE_DAY_MS) },            // exactly 7×24h: the week before
        { profileid: 'd', enrollmentdate: ts(now - 13 * GLANCE_DAY_MS) },
        { profileid: 'e', enrollmentdate: ts(now - 20 * GLANCE_DAY_MS) },           // neither window
        { profileid: 'f' },                                                          // no date: left out
        { profileid: 'a', enrollmentdate: ts(now - 10 * GLANCE_DAY_MS) },           // second doc: ignored
      ], now);
      expect(j.count).toBe(2);
      expect(j.profileIds).toEqual(['a', 'b']);
      expect(j.prev).toBe(2);
      expect(j.trend).toBe('flat');
      expect(j.delta).toBe('• same as the week before');
    });

    it('says up or down by how many', () => {
      const up = joinedRecently([
        { profileid: 'a', enrollmentdate: ts(now - HOUR) },
        { profileid: 'b', enrollmentdate: ts(now - 2 * HOUR) },
      ], now);
      expect(up.trend).toBe('up');
      expect(up.delta).toBe('▲ 2 vs the week before');
      const down = joinedRecently([
        { profileid: 'a', enrollmentdate: ts(now - 8 * GLANCE_DAY_MS) },
        { profileid: 'b', enrollmentdate: ts(now - 9 * GLANCE_DAY_MS) },
        { profileid: 'c', enrollmentdate: ts(now - HOUR) },
      ], now);
      expect(down.trend).toBe('down');
      expect(down.delta).toBe('▼ 1 vs the week before');
    });

    it('draws 14 calendar-day bars, oldest first, the last 7 darker', () => {
      const j = joinedRecently([
        { profileid: 'a', enrollmentdate: ts(at(2026, 11, 17, 1)) },     // today
        { profileid: 'b', enrollmentdate: ts(at(2026, 11, 17, 9)) },     // today
        { profileid: 'c', enrollmentdate: ts(at(2026, 11, 16, 23)) },    // yesterday
        { profileid: 'd', enrollmentdate: ts(at(2026, 11, 4, 8)) },      // 13 days ago: the first bar
        { profileid: 'e', enrollmentdate: ts(at(2026, 11, 3, 8)) },      // 14 days ago: no bar
      ], now);
      expect(j.bars.length).toBe(14);
      expect(j.bars.map(b => b.n)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
      expect(j.bars.map(b => b.wk)).toEqual([false, false, false, false, false, false, false, true, true, true, true, true, true, true]);
      expect(j.bars[13].h).toBe(100);
      expect(j.bars[12].h).toBe(50);
      expect(j.bars[1].h).toBe(0);
      expect(j.bars[1].zero).toBeTrue();
      expect(j.bars[13].label).toBe('17 Nov: 2 joined');
      expect(j.bars[0].label).toBe('04 Nov: 1 joined');
    });

    it('gives a non-zero day at least a 4% bar', () => {
      const docs = [{ profileid: 'x', enrollmentdate: ts(at(2026, 11, 10, 9)) }];
      for (let i = 0; i < 40; i++) docs.push({ profileid: `t${i}`, enrollmentdate: ts(at(2026, 11, 17, 9)) });
      const j = joinedRecently(docs, now);
      expect(j.bars[6].n).toBe(1);
      expect(j.bars[6].h).toBe(4);
    });

    it('counts a slightly future enrolment (server clock ahead) as now', () => {
      const j = joinedRecently([{ profileid: 'a', enrollmentdate: ts(now + 5 * 60_000) }], now);
      expect(j.count).toBe(1);
      expect(j.bars[13].n).toBe(1);
    });

    it('is empty and flat with nobody enrolled', () => {
      const j = joinedRecently([], now);
      expect(j.count).toBe(0);
      expect(j.prev).toBe(0);
      expect(j.bars.every(b => b.zero)).toBeTrue();
      expect(emptyGlanceJoined().count).toBe(0);
    });
  });

  describe('latestStepFinishedMs', () => {
    it('is the newest step completion time on the participant workshop doc', () => {
      const doc = {
        challenges: [
          { type: 'challenge', challenges: [{ status: 'completed', completed: ts(at(2026, 11, 10)) }, { status: '' }] },
          { type: 'zoomcall' },
          { type: 'challenge', challenges: [{ status: 'completed', completed: { seconds: at(2026, 11, 12) / 1000 } }] },
        ],
      };
      expect(latestStepFinishedMs(doc)).toBe(at(2026, 11, 12));
    });
    it('is null with no finished step or no doc', () => {
      expect(latestStepFinishedMs({ challenges: [{ type: 'challenge', challenges: [{ status: '' }] }] })).toBeNull();
      expect(latestStepFinishedMs(undefined)).toBeNull();
    });
  });

  describe('needsAttention', () => {
    const now = at(2026, 11, 17, 12);
    const stepDoc = (ms: number) => ({ challenges: [{ type: 'challenge', challenges: [{ status: 'completed', completed: ts(ms) }] }] });

    it('splits started people into stuck (0%) and inactive (some progress, no step in 3×24h), never both', () => {
      const enrolled = [
        { profileid: 'p0', status: 'enrolled' },                                                      // 0%
        { profileid: 'pNoRow', status: 'enrolled' },                                                  // no progress row: 0%
        { profileid: 'pOld', status: 'enrolled' },                                                    // 50%, step 4 days ago
        { profileid: 'pFresh', status: 'enrolled' },                                                  // 50%, step yesterday
        { profileid: 'pEdge', status: 'enrolled' },                                                   // 50%, step exactly 3×24h ago
        { profileid: 'pStartOnly', status: 'enrolled', workshopStartedAt: ts(now - 5 * GLANCE_DAY_MS) }, // no step time: start time
        { profileid: 'pNothing', status: 'enrolled' },                                                // no step time, no start: out
        { profileid: 'pDone', status: 'enrolled' },                                                   // 100%: out
        { profileid: 'pNotStarted', status: 'enrollednotstarted' },                                   // not started: out
        { profileid: 'p0', status: 'enrolled' },                                                      // second doc: once
      ];
      const progress = new Map<string, number>([
        ['p0', 0], ['pOld', 50], ['pFresh', 50], ['pEdge', 50], ['pStartOnly', 50], ['pNothing', 50], ['pDone', 100], ['pNotStarted', 0],
      ]);
      const docs = new Map<string, any>([
        ['pOld', stepDoc(now - 4 * GLANCE_DAY_MS)],
        ['pFresh', stepDoc(now - GLANCE_DAY_MS)],
        ['pEdge', stepDoc(now - 3 * GLANCE_DAY_MS)],
        ['pStartOnly', { challenges: [] }],
        ['pDone', stepDoc(now - 30 * GLANCE_DAY_MS)],
      ]);
      const a = needsAttention(enrolled, progress, docs, now);
      expect(a.stuck).toEqual(['p0', 'pNoRow']);
      expect(a.inactive).toEqual(['pOld', 'pEdge', 'pStartOnly']);
      expect(a.stuck.some(id => a.inactive.includes(id))).toBeFalse();
    });

    it('prefers the step time over the start time', () => {
      const enrolled = [{ profileid: 'p', status: 'enrolled', workshopStartedAt: ts(now - 10 * GLANCE_DAY_MS) }];
      const a = needsAttention(enrolled, new Map([['p', 40]]), new Map([['p', stepDoc(now - HOUR)]]), now);
      expect(a.inactive).toEqual([]);
    });
  });

  describe('topTags', () => {
    it('counts people (not docs or ids), orders by count then name, keeps five', () => {
      const perPerson = [
        ['Corporate', 'Mumbai'],
        ['Corporate', 'Corporate'],          // the same name twice on one person counts once
        ['Corporate', 'Returning'],
        ['Returning', 'Alpha'],
        ['Mumbai'],
        ['Zeta'], ['Beta'], ['Gamma'],
        [],
      ];
      const rows = topTags(perPerson, 10);
      expect(rows.map(r => r.name)).toEqual(['Corporate', 'Mumbai', 'Returning', 'Alpha', 'Beta']);
      expect(rows.map(r => r.n)).toEqual([3, 2, 2, 1, 1]);
      expect(rows[0].pct).toBe(30);
      expect(rows[0].w).toBe(100);
      expect(rows[1].w).toBe(67);
    });
    it('is empty with no tags, and pct is 0 when nobody is enrolled', () => {
      expect(topTags([[], []], 2)).toEqual([]);
      expect(topTags([['A']], 0)[0].pct).toBe(0);
    });
  });

  describe('tagIdSetKey', () => {
    it('is the same for the same set in any order, and ignores non-ids', () => {
      const a = tagIdSetKey([{ tags: ['t2', 't1'] }, { tags: ['t1'] }, {}]);
      const b = tagIdSetKey([{ tags: ['t1', 't2', 7 as any, ''] }]);
      expect(a.key).toBe(b.key);
      expect(a.ids).toEqual(['t1', 't2']);
      expect(tagIdSetKey([{ tags: ['t3'] }]).key).not.toBe(a.key);
    });
  });

  // New Sign-ups (2026-11-21): the window is exact moments, both inclusive; the end is the completion moment when
  // there is one, else the workshop end date. Pinned at each edge, for every date shape the docs can carry.
  describe('signupWindow', () => {
    const regStart = at(2026, 11, 7, 10, 0);
    const planned = at(2026, 12, 6, 18, 0);
    const completed = at(2026, 12, 1, 9, 30);

    it('runs from the registration start to the completion moment when the workshop was marked completed', () => {
      expect(signupWindow(ts(regStart), ts(completed), ts(planned))).toEqual({ start: regStart, end: completed, endKind: 'completed' });
    });
    it('falls back to the workshop end date without a completion moment', () => {
      expect(signupWindow(ts(regStart), undefined, ts(planned))).toEqual({ start: regStart, end: planned, endKind: 'planned' });
      expect(signupWindow(ts(regStart), null, ts(planned))).toEqual({ start: regStart, end: planned, endKind: 'planned' });
    });
    it('treats an unreadable completion moment as not set (falls back to the end date)', () => {
      expect(signupWindow(ts(regStart), 'not a date', ts(planned))).toEqual({ start: regStart, end: planned, endKind: 'planned' });
    });
    it('uses the completion moment even when it is after the planned end', () => {
      const late = at(2026, 12, 20, 12, 0);
      expect(signupWindow(ts(regStart), ts(late), ts(planned))).toEqual({ start: regStart, end: late, endKind: 'completed' });
    });
    it('reads a Timestamp, a Date, a {seconds} object and an ISO string alike', () => {
      const want = { start: regStart, end: planned, endKind: 'planned' };
      expect(signupWindow(new Date(regStart), null, new Date(planned))).toEqual(want as any);
      expect(signupWindow({ seconds: regStart / 1000 }, null, { seconds: planned / 1000 })).toEqual(want as any);
      expect(signupWindow(new Date(regStart).toISOString(), null, new Date(planned).toISOString())).toEqual(want as any);
      expect(signupWindow(ts(regStart), { seconds: completed / 1000 }, null)).toEqual({ start: regStart, end: completed, endKind: 'completed' });
    });
    it("says 'start' when the registration start is missing or unreadable, whatever the end", () => {
      expect(signupWindow(undefined, ts(completed), ts(planned))).toEqual({ missing: 'start' });
      expect(signupWindow(null, null, null)).toEqual({ missing: 'start' });
      expect(signupWindow('garbage', null, ts(planned))).toEqual({ missing: 'start' });
    });
    it("says 'end' when there is neither a completion moment nor an end date", () => {
      expect(signupWindow(ts(regStart), null, undefined)).toEqual({ missing: 'end' });
      expect(signupWindow(ts(regStart), 'x', 'y')).toEqual({ missing: 'end' });
    });
    it('is not set when the start is after the end; a one-moment window is fine', () => {
      expect(signupWindow(ts(planned), null, ts(regStart))).toEqual({ invalid: true });
      expect(signupWindow(ts(planned), ts(regStart), ts(at(2027, 1, 1)))).toEqual({ invalid: true });
      expect(signupWindow(ts(regStart), null, ts(regStart))).toEqual({ start: regStart, end: regStart, endKind: 'planned' });
    });
    it('counts a planned end saved with no time (local midnight) to the end of that day', () => {
      const endDay = at(2026, 12, 6);   // 06 Dec 2026 00:00:00.000 local: the end time was left empty
      const lastMs = new Date(2026, 11, 6, 23, 59, 59, 999).getTime();
      expect(signupWindow(ts(regStart), null, ts(endDay))).toEqual({ start: regStart, end: lastMs, endKind: 'planned' });
      expect(signupWindow(ts(regStart), null, new Date(endDay))).toEqual({ start: regStart, end: lastMs, endKind: 'planned' });
      // someone who signed up at noon on the end day is in; the next day is out
      const w = signupWindow(ts(regStart), null, ts(endDay));
      const rows = newSignups({ noon: { created: ts(at(2026, 12, 6, 12, 0)) }, next: { created: ts(at(2026, 12, 7)) } }, w);
      expect(rows.map(r => r.id)).toEqual(['noon']);
      // and a registration start later that same day is still a window, not "not set correctly"
      expect(signupWindow(ts(at(2026, 12, 6, 9, 0)), null, ts(endDay))).toEqual({ start: at(2026, 12, 6, 9, 0), end: lastMs, endKind: 'planned' });
    });
    it('keeps a planned end with a time, and a completion moment at midnight, exact', () => {
      const oneMinutePast = at(2026, 12, 6, 0, 1);
      expect(signupWindow(ts(regStart), null, ts(oneMinutePast))).toEqual({ start: regStart, end: oneMinutePast, endKind: 'planned' });
      const midnight = at(2026, 12, 1);
      expect(signupWindow(ts(regStart), ts(midnight), ts(planned))).toEqual({ start: regStart, end: midnight, endKind: 'completed' });
    });
    it("reads a date-only 'yyyy-mm-dd' string as that LOCAL day (start of day; a planned end runs to its last moment)", () => {
      expect(signupWindow('2026-11-07', null, '2026-12-06')).toEqual({
        start: at(2026, 11, 7), end: new Date(2026, 11, 6, 23, 59, 59, 999).getTime(), endKind: 'planned',
      });
      expect(signupWindow(' 2026-11-07 ', null, ts(planned))).toEqual({ start: at(2026, 11, 7), end: planned, endKind: 'planned' });
      // a date-only created is that local day's midnight too
      const w = { start: at(2026, 11, 7), end: planned, endKind: 'planned' as const };
      expect(newSignups({ a: { created: '2026-11-07' } }, w).map(r => r.created)).toEqual([at(2026, 11, 7)]);
    });
    it('isSignupWindowSet tells a set window from the not-set states', () => {
      expect(isSignupWindowSet(signupWindow(ts(regStart), null, ts(planned)))).toBeTrue();
      expect(isSignupWindowSet({ missing: 'start' })).toBeFalse();
      expect(isSignupWindowSet({ missing: 'end' })).toBeFalse();
      expect(isSignupWindowSet({ invalid: true })).toBeFalse();
      expect(isSignupWindowSet(null)).toBeFalse();
    });
  });

  describe('signupWindowLabel', () => {
    it('prints both ends in the dashboard date format, with "(completed)" when the end is the completion moment', () => {
      const s = at(2026, 11, 7, 10, 0), e = at(2026, 12, 6, 18, 0);
      expect(signupWindowLabel({ start: s, end: e, endKind: 'planned' })).toBe('07 Nov 2026 – 06 Dec 2026');
      expect(signupWindowLabel({ start: s, end: e, endKind: 'completed' })).toBe('07 Nov 2026 – 06 Dec 2026 (completed)');
      // the same formatter the rest of the dashboard uses
      expect(signupWindowLabel({ start: s, end: e, endKind: 'planned' })).toBe(`${formatDate(new Date(s))} – ${formatDate(new Date(e))}`);
    });
    it('keeps each date (and the dash after the first) on one line for the card, with the same words', () => {
      const s = at(2026, 11, 7, 10, 0), e = at(2026, 12, 6, 18, 0);
      const card = signupWindowLabel({ start: s, end: e, endKind: 'completed' }, true);
      expect(card).toBe('07\u00a0Nov\u00a02026\u00a0– 06\u00a0Dec\u00a02026 (completed)');
      expect(card.replace(/\u00a0/g, ' ')).toBe(signupWindowLabel({ start: s, end: e, endKind: 'completed' }));
      expect(signupWindowLabel({ missing: 'end' }, true)).toBe('Workshop end date is not set');
    });
    it('gives the reason when there is no window', () => {
      expect(signupWindowLabel({ missing: 'start' })).toBe('Registration start date is not set');
      expect(signupWindowLabel({ missing: 'end' })).toBe('Workshop end date is not set');
      expect(signupWindowLabel({ invalid: true })).toBe('Dates are not set correctly');
      expect(signupWindowLabel(null)).toBe('Registration start date is not set');
    });
  });

  describe('newSignups', () => {
    const start = at(2020, 3, 1, 9, 0);
    const end = at(2020, 3, 31, 18, 0);
    const win = { start, end, endKind: 'planned' as const };
    const map: Record<string, any> = {
      before:   { name: 'Before',   created: ts(start - 1) },
      atStart:  { name: 'At Start', created: ts(start) },
      inside:   { name: 'Inside',   created: new Date(at(2020, 3, 10, 12, 0)) },
      moved:    { name: 'Moved',    created: { seconds: at(2020, 3, 20, 8, 0) / 1000 }, movedtoexist: true },
      notMoved: { name: 'Kept',     created: new Date(at(2020, 3, 21, 8, 0)).toISOString(), movedtoexist: false },
      atEnd:    { name: 'At End',   created: ts(end) },
      after:    { name: 'After',    created: ts(end + 1) },
      noDate:   { name: 'No Date' },
      badDate:  { name: 'Bad Date', created: 'yesterday-ish' },
      empty:    null,
    };

    it('lists everyone created inside the window, both ends included, newest first', () => {
      expect(newSignups(map, win).map(s => s.id)).toEqual(['atEnd', 'notMoved', 'moved', 'inside', 'atStart']);
    });
    it('keeps people moved to existing and flags them', () => {
      const rows = newSignups(map, win);
      expect(rows.find(r => r.id === 'moved')?.moved).toBeTrue();
      expect(rows.find(r => r.id === 'notMoved')?.moved).toBeFalse();
      expect(rows.find(r => r.id === 'inside')?.moved).toBeFalse();
    });
    it('carries the created moment and the doc', () => {
      const row = newSignups(map, win).find(r => r.id === 'atStart')!;
      expect(row.created).toBe(start);
      expect(row.doc).toBe(map['atStart']);
    });
    it('leaves out docs without a readable created date', () => {
      const ids = newSignups(map, win).map(s => s.id);
      expect(ids).not.toContain('noDate');
      expect(ids).not.toContain('badDate');
      expect(ids).not.toContain('empty');
    });
    it('orders equal moments by name, then id', () => {
      const t = ts(at(2020, 3, 5));
      const rows = newSignups({ z: { name: 'Bea', created: t }, y: { name: 'amy', created: t }, x: { name: 'Bea', created: t } }, win);
      expect(rows.map(r => r.id)).toEqual(['y', 'x', 'z']);
    });
    it('is empty without a set window or without data', () => {
      expect(newSignups(map, { missing: 'start' })).toEqual([]);
      expect(newSignups(map, { invalid: true })).toEqual([]);
      expect(newSignups(null, win)).toEqual([]);
      expect(newSignups({}, win)).toEqual([]);
    });
  });
});
