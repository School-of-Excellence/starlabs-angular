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
  journeyProfileVisible,
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
});
