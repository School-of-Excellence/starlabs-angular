// content-analytics.engine.unit.spec.ts — unit tests for the watch-time analytics rules.
//
// WHY THESE COULD NOT BE TESTED BEFORE: the rules lived as methods on ContentAnalyticsComponent, a
// 1,252-line Firestore component — and that component imports Node's `console` module (line 8), which does
// not resolve under tsconfig.spec. It is one of the files that breaks the repo-wide `ng test`, so it can
// never appear in a spec build at all. Extraction was the only route to covering these numbers.
//
// WHAT THEY PROTECT: these figures are what a content team reads to decide whether a series is working.
// A wrong divisor here crashes nothing — it just reports the wrong answer, quietly, forever.
import {
  NEVER_SEEN_DAYS,
  WatchLog,
  avgHoursPerActiveDay,
  completionPercent,
  daysSinceLastSeen,
  formatDaysHoursMins,
  formatHoursMins,
  formatMinutesSeconds,
  csvCell,
  filterVideoNameOptions,
  isStillNewUser,
  profilePhone,
  journeyProfileVisible,
  stillNewUserMap,
  visibleProfileCount,
  watchHours,
} from './content-analytics.engine';

const HOUR = 3600;
const log = (over: Partial<WatchLog> = {}): WatchLog => ({
  totaltimespend: HOUR, totalruntime: HOUR, logdate: '2026-09-01T10:00:00Z', ...over,
});

describe('content-analytics.engine', () => {
  // =============================================================================================
  // CNU-10 — hours watched
  // =============================================================================================
  describe('CNU-10 watchHours', () => {
    it('sums seconds across logs and converts to hours', () => {
      expect(watchHours([log({ totaltimespend: HOUR }), log({ totaltimespend: HOUR / 2 })])).toBe(1.5);
    });

    it('treats a missing time as zero rather than producing NaN', () => {
      // Firestore rows are not uniform; one row without the field must not poison the total.
      expect(watchHours([log({ totaltimespend: undefined }), log({ totaltimespend: HOUR })])).toBe(1);
    });

    it('returns 0 for empty, null or undefined input', () => {
      expect(watchHours([])).toBe(0);
      expect(watchHours(null)).toBe(0);
      expect(watchHours(undefined)).toBe(0);
    });
  });

  // =============================================================================================
  // CNU-11 — completion percentage
  // =============================================================================================
  describe('CNU-11 completionPercent', () => {
    it('reports spend against runtime as a percentage', () => {
      expect(completionPercent([log({ totaltimespend: HOUR / 2, totalruntime: HOUR })])).toBe(50);
    });

    it('sums both sides before dividing, not per-row', () => {
      // (1800 + 1800) / (3600 + 3600) = 50%, which differs from averaging per-row percentages.
      const rows = [
        log({ totaltimespend: 1800, totalruntime: HOUR }),
        log({ totaltimespend: 1800, totalruntime: HOUR }),
      ];
      expect(completionPercent(rows)).toBe(50);
    });

    it('returns 0 rather than Infinity when nothing has a runtime', () => {
      // The divide guard. An unrated series must report 0, not Infinity or NaN on the dashboard.
      expect(completionPercent([log({ totaltimespend: HOUR, totalruntime: 0 })])).toBe(0);
      expect(completionPercent([log({ totaltimespend: HOUR, totalruntime: undefined })])).toBe(0);
    });

    it('is NOT capped at 100 — re-watching legitimately exceeds it', () => {
      // Pinned deliberately: this is existing behaviour and arguably correct, but a reader seeing 250%
      // should know it is intended rather than a bug.
      expect(completionPercent([log({ totaltimespend: HOUR * 2.5, totalruntime: HOUR })])).toBe(250);
    });

    it('returns 0 for empty input', () => {
      expect(completionPercent([])).toBe(0);
      expect(completionPercent(null)).toBe(0);
    });
  });

  // =============================================================================================
  // CNU-12 — average per ACTIVE day
  // =============================================================================================
  describe('CNU-12 avgHoursPerActiveDay', () => {
    it('divides by the number of DISTINCT log dates', () => {
      const rows = [
        log({ totaltimespend: HOUR, logdate: '2026-09-01T10:00:00Z' }),
        log({ totaltimespend: HOUR, logdate: '2026-09-02T10:00:00Z' }),
      ];
      expect(avgHoursPerActiveDay(rows)).toBe(1);   // 2 hours over 2 days
    });

    it('counts several logs on one day as a single active day', () => {
      const rows = [
        log({ totaltimespend: HOUR, logdate: '2026-09-01T08:00:00Z' }),
        log({ totaltimespend: HOUR, logdate: '2026-09-01T20:00:00Z' }),
      ];
      expect(avgHoursPerActiveDay(rows)).toBe(2);   // 2 hours over 1 day
    });

    it('ignores idle days between logs — the divisor is active days, not elapsed days', () => {
      // Worth pinning: a participant who watched twice a month apart averages over 2 days, not 30. That
      // makes the figure "intensity when active" rather than "intensity over time".
      const rows = [
        log({ totaltimespend: HOUR, logdate: '2026-09-01T10:00:00Z' }),
        log({ totaltimespend: HOUR, logdate: '2026-10-01T10:00:00Z' }),
      ];
      expect(avgHoursPerActiveDay(rows)).toBe(1);
    });

    it('accepts a Firestore Timestamp as readily as a raw date', () => {
      const d = new Date('2026-09-01T10:00:00Z');
      const rows = [log({ totaltimespend: HOUR, logdate: { toDate: () => d } })];
      expect(avgHoursPerActiveDay(rows)).toBe(1);
    });

    it('returns 0 for empty input', () => {
      expect(avgHoursPerActiveDay([])).toBe(0);
      expect(avgHoursPerActiveDay(null)).toBe(0);
    });
  });

  // =============================================================================================
  // CNU-13 — days since last seen
  // =============================================================================================
  describe('CNU-13 daysSinceLastSeen', () => {
    const NOW = new Date('2026-09-10T12:00:00Z').getTime();

    it('measures from the MOST RECENT log, not the first', () => {
      const rows = [
        log({ logdate: '2026-09-01T12:00:00Z' }),
        log({ logdate: '2026-09-08T12:00:00Z' }),
      ];
      expect(daysSinceLastSeen(rows, NOW)).toBe(2);
    });

    it('floors partial days', () => {
      expect(daysSinceLastSeen([log({ logdate: '2026-09-09T23:00:00Z' })], NOW)).toBe(0);
    });

    it('returns the never-seen sentinel for no logs', () => {
      // 999, deliberately large so such rows sort to the bottom of a last-seen list rather than the top.
      expect(daysSinceLastSeen([], NOW)).toBe(NEVER_SEEN_DAYS);
      expect(daysSinceLastSeen(null, NOW)).toBe(NEVER_SEEN_DAYS);
      expect(NEVER_SEEN_DAYS).toBe(999);
    });

    it('accepts a Firestore Timestamp', () => {
      const rows = [log({ logdate: { toDate: () => new Date('2026-09-05T12:00:00Z') } })];
      expect(daysSinceLastSeen(rows, NOW)).toBe(5);
    });
  });

  // =============================================================================================
  // CNU-14 — duration formatters
  // =============================================================================================
  describe('CNU-14 formatters', () => {
    it('renders minutes and seconds, echoing the raw value', () => {
      // The raw seconds are shown on purpose so a reader can sanity-check the conversion.
      expect(formatMinutesSeconds(125)).toBe('2 mins 5 sec (125)');
    });

    it('renders zero cleanly', () => {
      expect(formatMinutesSeconds(0)).toBe('0 mins 0 sec (0)');
      expect(formatHoursMins(0)).toBe('0 hours 0 mins 0 secs');
      expect(formatDaysHoursMins(0)).toBe('0 days 0 hours 0 mins 0 secs');
    });

    it('breaks seconds into days, hours, minutes and seconds', () => {
      const total = (2 * 24 * HOUR) + (3 * HOUR) + (4 * 60) + 5;
      expect(formatDaysHoursMins(total)).toBe('2 days 3 hours 4 mins 5 secs');
    });

    it('does NOT roll hours into days in the hours formatter', () => {
      // formatHoursMins is used where a day breakdown would be noise, so 50 hours stays 50 hours.
      expect(formatHoursMins(50 * HOUR)).toBe('50 hours 0 mins 0 secs');
    });

    it('handles exactly one hour and one day boundaries', () => {
      expect(formatHoursMins(HOUR)).toBe('1 hours 0 mins 0 secs');
      expect(formatDaysHoursMins(24 * HOUR)).toBe('1 days 0 hours 0 mins 0 secs');
    });
  });

  // =============================================================================================
  // CNU-15 — journey profile filter + search
  // =============================================================================================
  describe('CNU-15 journeyProfileVisible', () => {
    const watching = { name: 'Asha Rao', watching: true };
    const notYet = { name: 'Bala Kumar', watching: false };

    it('shows everything under the all filter', () => {
      expect(journeyProfileVisible(watching, 'all', '')).toBeTrue();
      expect(journeyProfileVisible(notYet, 'all', '')).toBeTrue();
    });

    it('splits watching from not-yet', () => {
      expect(journeyProfileVisible(watching, 'watching', '')).toBeTrue();
      expect(journeyProfileVisible(notYet, 'watching', '')).toBeFalse();
      expect(journeyProfileVisible(notYet, 'notyet', '')).toBeTrue();
      expect(journeyProfileVisible(watching, 'notyet', '')).toBeFalse();
    });

    it('treats a missing watching flag as not-yet', () => {
      expect(journeyProfileVisible({ name: 'X' }, 'notyet', '')).toBeTrue();
      expect(journeyProfileVisible({ name: 'X' }, 'watching', '')).toBeFalse();
    });

    it('searches the name case-insensitively, as a substring', () => {
      expect(journeyProfileVisible(watching, 'all', 'ASHA')).toBeTrue();
      expect(journeyProfileVisible(watching, 'all', 'rao')).toBeTrue();
      expect(journeyProfileVisible(watching, 'all', 'zzz')).toBeFalse();
    });

    it('requires BOTH the filter and the search to match', () => {
      expect(journeyProfileVisible(notYet, 'watching', 'Bala')).toBeFalse();
    });

    it('shows a profile with no name only when the search box is empty', () => {
      expect(journeyProfileVisible({ watching: true }, 'all', '')).toBeTrue();
      expect(journeyProfileVisible({ watching: true }, 'all', 'a')).toBeFalse();
    });

    it('counts only the visible profiles', () => {
      const all = [watching, notYet, { name: 'Cara', watching: true }];
      expect(visibleProfileCount(all, 'watching', '')).toBe(2);
      expect(visibleProfileCount(all, 'all', 'bala')).toBe(1);
      expect(visibleProfileCount(null, 'all', '')).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // New users — new_user_data keeps the record after migration and flags it `movedtoexist: true`.
  // Those people are existing users from then on; their live details are in participant metadata.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('isStillNewUser', () => {
    it('counts a record with no movedtoexist flag', () => {
      expect(isStillNewUser({ name: 'Anita' })).toBe(true);
    });

    it('counts a record explicitly NOT moved', () => {
      expect(isStillNewUser({ name: 'Anita', movedtoexist: false })).toBe(true);
    });

    it('does not count a record that has been moved to a full profile', () => {
      expect(isStillNewUser({ name: 'Bala', movedtoexist: true })).toBe(false);
    });

    it('only the boolean true means moved — a truthy string does not', () => {
      // The flag is written as a boolean. Treating 'true' as moved would silently drop people
      // whose record was ever written by something that stringified it.
      expect(isStillNewUser({ movedtoexist: 'true' })).toBe(true);
    });

    it('has nothing to say about a missing record', () => {
      expect(isStillNewUser(null)).toBe(false);
      expect(isStillNewUser(undefined)).toBe(false);
    });
  });

  describe('stillNewUserMap', () => {
    const docs = {
      p1: { name: 'Anita' },
      p2: { name: 'Bala', movedtoexist: true },
      p3: { name: 'Chitra', movedtoexist: false },
    };
    const names = { p1: 'Anita', p2: 'Bala', p3: 'Chitra' };

    it('drops the people who have moved to a full profile, keeps the rest', () => {
      expect(stillNewUserMap(names, docs)).toEqual({ p1: 'Anita', p3: 'Chitra' });
    });

    it('works over the documents themselves, not just the name map', () => {
      expect(Object.keys(stillNewUserMap(docs, docs))).toEqual(['p1', 'p3']);
    });

    it('KEEPS an id whose document is missing rather than blanking it out', () => {
      // The map and the documents come from one read, so this should not arise. If it ever does,
      // keeping makes the filter do nothing; dropping would erase every name on the screen.
      expect(stillNewUserMap({ p9: 'Ghost' }, docs)).toEqual({ p9: 'Ghost' });
      expect(stillNewUserMap(names, {})).toEqual(names);
      expect(stillNewUserMap(names, null)).toEqual(names);
    });

    it('survives an empty or absent map', () => {
      expect(stillNewUserMap({}, docs)).toEqual({});
      expect(stillNewUserMap(null, docs)).toEqual({});
      expect(stillNewUserMap(undefined, undefined)).toEqual({});
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // CSV cells — ConvertToCSV joins on bare commas and quotes nothing, so one stray comma shifts
  // every column after it on that row.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('csvCell', () => {
    it('passes an ordinary value through', () => {
      expect(csvCell('anita@example.com')).toBe('anita@example.com');
      expect(csvCell('complete')).toBe('complete');
    });

    it('empties null and undefined rather than writing the words', () => {
      expect(csvCell(null)).toBe('');
      expect(csvCell(undefined)).toBe('');
    });

    it('strips commas, which would otherwise shift every later column', () => {
      expect(csvCell('Anita, Kumar')).toBe('Anita  Kumar');
    });

    it('flattens newlines onto the one row', () => {
      expect(csvCell('line one\nline two')).toBe('line one line two');
      expect(csvCell('a\r\nb')).toBe('a b');
    });

    it('keeps a zero rather than treating it as empty', () => {
      expect(csvCell(0)).toBe('0');
      expect(csvCell(false)).toBe('false');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Video Name typeahead. The dropdown is `multiple`, which is what makes the selected-option rule
  // load-bearing rather than cosmetic — see the engine comment.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('filterVideoNameOptions', () => {
    const all = ['Morning Routine', 'Evening Wind Down', 'Deep Work', 'morning stretch'];

    it('shows everything when nothing has been typed', () => {
      expect(filterVideoNameOptions(all, '', [])).toEqual(all);
      expect(filterVideoNameOptions(all, null, [])).toEqual(all);
      expect(filterVideoNameOptions(all, undefined, null)).toEqual(all);
    });

    it('matches anywhere in the name, not just the start', () => {
      expect(filterVideoNameOptions(all, 'work', [])).toEqual(['Deep Work']);
      expect(filterVideoNameOptions(all, 'wind', [])).toEqual(['Evening Wind Down']);
    });

    it('ignores case and surrounding spaces in the query', () => {
      expect(filterVideoNameOptions(all, '  MORNING  ', [])).toEqual(['Morning Routine', 'morning stretch']);
    });

    it('returns nothing when the term matches nothing', () => {
      expect(filterVideoNameOptions(all, 'zzz', [])).toEqual([]);
    });

    it('KEEPS an already-selected name even when the term excludes it', () => {
      // The load-bearing case. MatSelect re-selects only the options it can still see, then writes
      // back selected.map(o => o.value) — so a selected option hidden by the search would be
      // dropped from the model on the user's next click, losing a choice they already made.
      expect(filterVideoNameOptions(all, 'work', ['Morning Routine']))
        .toEqual(['Morning Routine', 'Deep Work']);
    });

    it('keeps several selected names, in the source list order', () => {
      // Order matters: MatSelect._sortValues() sorts by options.indexOf, so hoisting the selected
      // ones to the front would reorder the chosen values behind the user's back.
      expect(filterVideoNameOptions(all, 'zzz', ['Deep Work', 'Morning Routine']))
        .toEqual(['Morning Routine', 'Deep Work']);
    });

    it('does not duplicate a name that both matches and is selected', () => {
      expect(filterVideoNameOptions(all, 'deep', ['Deep Work'])).toEqual(['Deep Work']);
    });

    it('survives an empty or absent option list', () => {
      expect(filterVideoNameOptions([], 'x', [])).toEqual([]);
      expect(filterVideoNameOptions(null, 'x', ['a'])).toEqual([]);
      expect(filterVideoNameOptions(undefined, null, null)).toEqual([]);
    });

    it('does not throw on a null entry in the list', () => {
      // videoNameList is built from log documents, and a log with no videoname pushes undefined.
      const ragged = ['Deep Work', null as any, undefined as any];
      expect(() => filterVideoNameOptions(ragged, 'deep', [])).not.toThrow();
      expect(filterVideoNameOptions(ragged, 'deep', [])).toEqual(['Deep Work']);
    });

    it('returns a copy, so the caller cannot mutate the source list', () => {
      const out = filterVideoNameOptions(all, '', []);
      out.push('Injected');
      expect(all.length).toBe(4);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Phone for the export. The field names differ between the two collections, which is the whole
  // reason this is a function and not an inline lookup.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('profilePhone', () => {
    it('reads new_user_data: phonenumber + countryCode', () => {
      expect(profilePhone({ phonenumber: '9999900001', countryCode: '+91' })).toBe('+91 9999900001');
    });

    it('reads participant metadata: phonenumber + the LOWER-cased countrycode', () => {
      // The CF profiledata_to_participantmetadata writes `countrycode`; new_user_data carries
      // `countryCode`. Accepting only one of them would blank the column for half the people.
      expect(profilePhone({ phonenumber: '9999900000', countrycode: '+91' })).toBe('+91 9999900000');
    });

    it('returns the bare number when there is no country code', () => {
      expect(profilePhone({ phonenumber: '9999900000' })).toBe('9999900000');
      expect(profilePhone({ phonenumber: '9999900000', countryCode: '' })).toBe('9999900000');
      expect(profilePhone({ phonenumber: '9999900000', countryCode: '   ' })).toBe('9999900000');
    });

    it('returns empty when there is no number, so the caller can fall through to its other source', () => {
      // A document that exists but carries no phone must not beat one that does.
      expect(profilePhone({ countryCode: '+91' })).toBe('');
      expect(profilePhone({ phonenumber: '' })).toBe('');
      expect(profilePhone({ phonenumber: '   ' })).toBe('');
      expect(profilePhone({ phonenumber: null })).toBe('');
      expect(profilePhone({})).toBe('');
    });

    it('has nothing to say about a missing document', () => {
      expect(profilePhone(null)).toBe('');
      expect(profilePhone(undefined)).toBe('');
    });

    it('copes with a number stored as a number rather than a string', () => {
      expect(profilePhone({ phonenumber: 9999900000, countryCode: '+91' })).toBe('+91 9999900000');
    });

    it('trims both parts so the pair never double-spaces', () => {
      expect(profilePhone({ phonenumber: ' 9999900000 ', countryCode: ' +91 ' })).toBe('+91 9999900000');
    });

    it('prefers countryCode when a document somehow carries both spellings', () => {
      expect(profilePhone({ phonenumber: '1', countryCode: '+1', countrycode: '+91' })).toBe('+1 1');
    });
  });
});
