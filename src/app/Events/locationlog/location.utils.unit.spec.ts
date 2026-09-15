// location.utils.unit.spec.ts — unit tests for the Live Location Tracking dashboard's pure helpers.
//
// WHY UNIT: this is the largest pure module in the app (445 lines, 27 exports) and had no tests of any
// kind. Everything here is side-effect free — no Firestore, no Angular, no DOM — and `now` is injectable
// on every time-dependent function, so the whole module is testable offline with no TestBed and no clock
// flakiness. Proving "a report 11 minutes old is not live" through a seeded e2e case would need a doc with
// a controlled timestamp and a rendered chip; here it is one call.
//
// SCOPE: the dashboard's Firestore reads and rendering stay with the events e2e suite. This file covers the
// rules those screens depend on: freshness banding, distance maths and formatting, sorting, coordinate
// parsing and the filter bounds.
import {
  LIVE_WINDOW_MS,
  RECENT_WINDOW_MS,
  SORT_TO_HEADER,
  calculateDistance,
  clampPageIndex,
  customDistanceBounds,
  customDistanceMeters,
  deriveStatus,
  describeCustomDistance,
  distanceBounds,
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getAvatarGradient,
  getAvatarInitials,
  getStatusHint,
  getStatusText,
  googleMapsUrl,
  isValidLatitude,
  isValidLongitude,
  parseCoordinatePair,
  sortKeyFromHeader,
  sortParticipants,
  startOfDay,
  statusRank,
  timeWindowBounds,
  trackByProfile,
} from './location.utils';
import { ParticipantLocation, SortKey } from './location.model';

/** Frozen clock. Every time-dependent assertion passes `now` so nothing depends on the wall clock. */
const NOW = new Date('2026-09-09T14:30:00').getTime();
const agoMs = (ms: number) => new Date(NOW - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const person = (over: Partial<ParticipantLocation> = {}): ParticipantLocation => ({
  profileid: 'p1',
  name: 'Asha Rao',
  initials: 'AR',
  latitude: 12.94,
  longitude: 80.25,
  created: agoMs(MIN),
  distanceMeters: 500,
  status: 'live',
  ...over,
});

describe('location.utils', () => {
  // =============================================================================================
  // EVTU-01 — freshness banding: the entire mechanism behind the status column and filter
  // =============================================================================================
  describe('EVTU-01 deriveStatus', () => {
    it('is live inside the 10-minute window', () => {
      expect(deriveStatus(agoMs(0), NOW)).toBe('live');
      expect(deriveStatus(agoMs(9 * MIN), NOW)).toBe('live');
    });

    it('treats the live boundary itself as live (inclusive)', () => {
      expect(deriveStatus(agoMs(LIVE_WINDOW_MS), NOW)).toBe('live');
    });

    it('is recent one millisecond past the live window', () => {
      expect(deriveStatus(agoMs(LIVE_WINDOW_MS + 1), NOW)).toBe('recent');
    });

    it('treats the recent boundary itself as recent (inclusive)', () => {
      expect(deriveStatus(agoMs(RECENT_WINDOW_MS), NOW)).toBe('recent');
    });

    it('is stale beyond the hour', () => {
      expect(deriveStatus(agoMs(RECENT_WINDOW_MS + 1), NOW)).toBe('stale');
      expect(deriveStatus(agoMs(3 * DAY), NOW)).toBe('stale');
    });

    it('keeps the windows at 10 minutes and 1 hour', () => {
      // The status hints below promise these numbers to the user in words.
      expect(LIVE_WINDOW_MS).toBe(10 * MIN);
      expect(RECENT_WINDOW_MS).toBe(HOUR);
    });
  });

  describe('EVTU-02 status labels, ranks and hints agree with each other', () => {
    it('ranks live before recent before stale', () => {
      expect(statusRank('live')).toBeLessThan(statusRank('recent'));
      expect(statusRank('recent')).toBeLessThan(statusRank('stale'));
    });

    it('labels each status', () => {
      expect(getStatusText('live')).toBe('Live');
      expect(getStatusText('recent')).toBe('Recent');
      expect(getStatusText('stale')).toBe('Stale');
    });

    it('hints the same windows deriveStatus actually uses', () => {
      // If a window constant changes, this copy is now lying to the user — that is the point of pinning it.
      expect(getStatusHint('live')).toContain('10 minutes');
      expect(getStatusHint('recent')).toContain('hour');
      expect(getStatusHint('stale')).toContain('over an hour');
    });
  });

  // =============================================================================================
  // EVTU-03 — great-circle distance
  // =============================================================================================
  describe('EVTU-03 calculateDistance', () => {
    it('is zero for a point against itself', () => {
      const p = { latitude: 12.94, longitude: 80.25 };
      expect(calculateDistance(p, p)).toBe(0);
    });

    it('measures one degree of latitude as ~111 km', () => {
      const d = calculateDistance({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
      expect(d).toBeGreaterThan(110_000);
      expect(d).toBeLessThan(112_000);
    });

    it('is symmetric', () => {
      const a = { latitude: 12.94, longitude: 80.25 };
      const b = { latitude: 13.08, longitude: 80.27 };
      expect(calculateDistance(a, b)).toBeCloseTo(calculateDistance(b, a), 6);
    });

    it('handles antipodal points without NaN (the asin clamp)', () => {
      const d = calculateDistance({ latitude: -90, longitude: 0 }, { latitude: 90, longitude: 0 });
      expect(Number.isFinite(d)).toBeTrue();
      expect(d).toBeGreaterThan(20_000_000); // ~half the Earth's circumference
    });
  });

  // =============================================================================================
  // EVTU-04 — distance formatting
  // =============================================================================================
  describe('EVTU-04 formatDistance', () => {
    it('shows metres below a kilometre, rounded', () => {
      expect(formatDistance(0)).toBe('0 m');
      expect(formatDistance(499.4)).toBe('499 m');
      expect(formatDistance(999)).toBe('999 m');
    });

    it('switches to kilometres at exactly 1000 m', () => {
      expect(formatDistance(1000)).toBe('1.0 km');
    });

    it('shows one decimal below 10 km and whole kilometres above', () => {
      expect(formatDistance(4321)).toBe('4.3 km');
      expect(formatDistance(12_600)).toBe('13 km');
    });

    it('renders an em dash when the distance is unknown', () => {
      // Geolocation denied or still pending — must not render "0 m", which reads as "right here".
      expect(formatDistance(null)).toBe('—');
      expect(formatDistance(Infinity)).toBe('—');
      expect(formatDistance(NaN)).toBe('—');
    });
  });

  // =============================================================================================
  // EVTU-05 — relative time
  // =============================================================================================
  describe('EVTU-05 formatRelativeTime', () => {
    it('says just now under a minute', () => {
      expect(formatRelativeTime(agoMs(0), NOW)).toBe('just now');
      expect(formatRelativeTime(agoMs(59_999), NOW)).toBe('just now');
    });

    it('singularises one minute and one hour', () => {
      expect(formatRelativeTime(agoMs(MIN), NOW)).toBe('1 minute ago');
      expect(formatRelativeTime(agoMs(HOUR), NOW)).toBe('1 hour ago');
    });

    it('pluralises beyond one', () => {
      expect(formatRelativeTime(agoMs(2 * MIN), NOW)).toBe('2 minutes ago');
      expect(formatRelativeTime(agoMs(3 * HOUR), NOW)).toBe('3 hours ago');
    });

    it('says Yesterday for the previous calendar day', () => {
      // NOW is 14:30, so 20 hours back lands yesterday evening — hours < 24 but a DIFFERENT day, which is
      // exactly the case the isSameDay guard exists for.
      expect(formatRelativeTime(agoMs(20 * HOUR), NOW)).toBe('Yesterday');
    });

    it('falls back to an absolute date beyond a week', () => {
      const label = formatRelativeTime(agoMs(30 * DAY), NOW);
      expect(label).not.toContain('ago');
      expect(label).toContain('2026');
    });
  });

  // =============================================================================================
  // EVTU-06 — avatars
  // =============================================================================================
  describe('EVTU-06 avatars', () => {
    it('takes the first and last name initials, uppercased', () => {
      expect(getAvatarInitials('John David')).toBe('JD');
      expect(getAvatarInitials('john david smith')).toBe('JS'); // first + LAST, not first two
    });

    it('uses a single initial for a mononym', () => {
      expect(getAvatarInitials('Priya')).toBe('P');
    });

    it('degrades to ? rather than throwing on empty or blank names', () => {
      expect(getAvatarInitials('')).toBe('?');
      expect(getAvatarInitials('   ')).toBe('?');
    });

    it('collapses irregular whitespace', () => {
      expect(getAvatarInitials('  Asha    Rao  ')).toBe('AR');
    });

    it('gives the same profileid the same gradient every time', () => {
      // Keyed on the id, never the row index — otherwise colours shuffle on every sort.
      expect(getAvatarGradient('abc123')).toBe(getAvatarGradient('abc123'));
      expect(getAvatarGradient('abc123')).not.toBe(getAvatarGradient('xyz789'));
    });
  });

  // =============================================================================================
  // EVTU-07 — sort state round-trips between the dropdown and the table headers
  // =============================================================================================
  describe('EVTU-07 sort key mapping', () => {
    it('round-trips every sort key through its header pair', () => {
      // This is what keeps the "Sort by" dropdown and the clickable headers from contradicting each other.
      (Object.keys(SORT_TO_HEADER) as SortKey[]).forEach((key) => {
        const { active, direction } = SORT_TO_HEADER[key];
        expect(sortKeyFromHeader(active, direction)).toBe(key);
      });
    });

    it('returns null when the header is cleared', () => {
      expect(sortKeyFromHeader('lastUpdated', '')).toBeNull();
    });

    it('returns null for a column it does not know', () => {
      expect(sortKeyFromHeader('nonsense', 'asc')).toBeNull();
    });
  });

  // =============================================================================================
  // EVTU-08 — sorting
  // =============================================================================================
  describe('EVTU-08 sortParticipants', () => {
    const older = person({ profileid: 'old', created: agoMs(5 * HOUR), distanceMeters: 100, name: 'Zoe' });
    const newer = person({ profileid: 'new', created: agoMs(1 * MIN), distanceMeters: 900, name: 'Adam' });
    const unknown = person({ profileid: 'unk', created: agoMs(2 * HOUR), distanceMeters: null, name: 'Mia' });

    it('does not mutate the input array', () => {
      // The input may be a shared slice of dashboard state.
      const input = [older, newer];
      const copy = [...input];
      sortParticipants(input, 'nameAsc');
      expect(input).toEqual(copy);
    });

    it('defaults to newest first', () => {
      expect(sortParticipants([older, newer], 'newest')[0].profileid).toBe('new');
    });

    it('sorts oldest first when asked', () => {
      expect(sortParticipants([newer, older], 'oldest')[0].profileid).toBe('old');
    });

    it('sinks unknown distances to the bottom of BOTH distance orders', () => {
      // The bug this guards: treating null as 0 would rank an unknown distance as the nearest row.
      expect(sortParticipants([unknown, older, newer], 'nearest').pop()!.profileid).toBe('unk');
      expect(sortParticipants([unknown, older, newer], 'farthest').pop()!.profileid).toBe('unk');
    });

    it('sorts by name in both directions', () => {
      expect(sortParticipants([older, newer], 'nameAsc')[0].name).toBe('Adam');
      expect(sortParticipants([newer, older], 'nameDesc')[0].name).toBe('Zoe');
    });

    it('orders by freshness, breaking ties by recency', () => {
      const staleOld = person({ profileid: 's1', status: 'stale', created: agoMs(9 * HOUR) });
      const staleNew = person({ profileid: 's2', status: 'stale', created: agoMs(2 * HOUR) });
      const live = person({ profileid: 'l1', status: 'live', created: agoMs(MIN) });

      const fresh = sortParticipants([staleOld, live, staleNew], 'statusFresh');
      expect(fresh.map((p) => p.profileid)).toEqual(['l1', 's2', 's1']);

      const stale = sortParticipants([live, staleNew, staleOld], 'statusStale');
      expect(stale[0].profileid).toBe('s1'); // stalest first, oldest of the ties leading
    });
  });

  // =============================================================================================
  // EVTU-09 — paging survives a list shrinking underneath it
  // =============================================================================================
  describe('EVTU-09 clampPageIndex', () => {
    it('keeps a valid index untouched', () => {
      expect(clampPageIndex(1, 50, 10)).toBe(1);
    });

    it('pulls an index past the end back to the last page', () => {
      // A filter change can leave the stored index stranded; an out-of-range page renders empty.
      expect(clampPageIndex(9, 25, 10)).toBe(2);
    });

    it('floors a negative index at zero', () => {
      expect(clampPageIndex(-3, 25, 10)).toBe(0);
    });

    it('returns page zero for an empty list', () => {
      expect(clampPageIndex(4, 0, 10)).toBe(0);
    });
  });

  // =============================================================================================
  // EVTU-10 — coordinate parsing, the one input that could corrupt every distance on the page
  // =============================================================================================
  describe('EVTU-10 parseCoordinatePair', () => {
    it('reads a plain comma pair', () => {
      expect(parseCoordinatePair('12.940029, 80.253343')).toEqual({ latitude: 12.940029, longitude: 80.253343 });
    });

    it('reads whitespace- and semicolon-separated pairs', () => {
      expect(parseCoordinatePair('12.94 80.25')).toEqual({ latitude: 12.94, longitude: 80.25 });
      expect(parseCoordinatePair('12.94; 80.25')).toEqual({ latitude: 12.94, longitude: 80.25 });
    });

    it('reads negatives', () => {
      expect(parseCoordinatePair('-33.86, 151.21')).toEqual({ latitude: -33.86, longitude: 151.21 });
    });

    it('applies N/S/E/W hemispheres, as the Firestore console renders them', () => {
      expect(parseCoordinatePair('12.94° N, 80.25° E')).toEqual({ latitude: 12.94, longitude: 80.25 });
      expect(parseCoordinatePair('33.86 S, 151.21 W')).toEqual({ latitude: -33.86, longitude: -151.21 });
    });

    it('rejects a lone hemisphere marker rather than guessing', () => {
      expect(parseCoordinatePair('12.94 N, 80.25')).toBeNull();
    });

    it('rejects out-of-range values', () => {
      expect(parseCoordinatePair('91, 0')).toBeNull();
      expect(parseCoordinatePair('0, 181')).toBeNull();
    });

    it('rejects junk, blanks and wrong-length input', () => {
      // A silently wrong reference point would corrupt every distance on the page, so null is the safe answer.
      expect(parseCoordinatePair('')).toBeNull();
      expect(parseCoordinatePair('   ')).toBeNull();
      expect(parseCoordinatePair('12.94')).toBeNull();
      expect(parseCoordinatePair('hello, world')).toBeNull();
      expect(parseCoordinatePair('1, 2, 3, 4, 5')).toBeNull();
    });

    it('accepts the exact string this dashboard itself renders', () => {
      // formatCoordinate output must round-trip back through the parser.
      const text = `${formatCoordinate(12.940029)}, ${formatCoordinate(80.253343)}`;
      expect(parseCoordinatePair(text)).toEqual({ latitude: 12.940029, longitude: 80.253343 });
    });
  });

  describe('EVTU-11 coordinate validation and display', () => {
    it('bounds latitude at ±90 and longitude at ±180, inclusive', () => {
      expect(isValidLatitude(90)).toBeTrue();
      expect(isValidLatitude(-90)).toBeTrue();
      expect(isValidLatitude(90.1)).toBeFalse();
      expect(isValidLongitude(180)).toBeTrue();
      expect(isValidLongitude(-180)).toBeTrue();
      expect(isValidLongitude(180.1)).toBeFalse();
    });

    it('rejects non-finite values', () => {
      expect(isValidLatitude(NaN)).toBeFalse();
      expect(isValidLongitude(Infinity)).toBeFalse();
    });

    it('formats to 6 decimal places (~11 cm)', () => {
      expect(formatCoordinate(12.94)).toBe('12.940000');
    });

    it('builds a Google Maps deep link', () => {
      expect(googleMapsUrl(12.94, 80.25)).toBe('https://www.google.com/maps?q=12.94,80.25');
    });

    it('tracks rows by profileid', () => {
      expect(trackByProfile(0, person({ profileid: 'abc' }))).toBe('abc');
    });
  });

  // =============================================================================================
  // EVTU-12 — distance filter bounds
  // =============================================================================================
  describe('EVTU-12 distanceBounds', () => {
    it('bounds the inward bands from zero', () => {
      expect(distanceBounds('within1')).toEqual({ min: 0, max: 1_000 });
      expect(distanceBounds('within5')).toEqual({ min: 0, max: 5_000 });
      expect(distanceBounds('within10')).toEqual({ min: 0, max: 10_000 });
    });

    it('leaves the outward bands open at the top', () => {
      expect(distanceBounds('beyond10')).toEqual({ min: 10_000, max: Infinity });
      expect(distanceBounds('beyond50')).toEqual({ min: 50_000, max: Infinity });
    });

    it('returns null for the bands the caller handles itself', () => {
      expect(distanceBounds('all')).toBeNull();
      expect(distanceBounds('unknown')).toBeNull();
    });
  });

  describe('EVTU-13 custom radius', () => {
    it('converts kilometres to metres and passes metres through', () => {
      expect(customDistanceMeters({ value: 2, unit: 'km', direction: 'within' })).toBe(2000);
      expect(customDistanceMeters({ value: 750, unit: 'm', direction: 'within' })).toBe(750);
    });

    it('rejects an empty, zero, negative or non-finite radius', () => {
      expect(customDistanceMeters({ value: null, unit: 'm', direction: 'within' })).toBeNull();
      expect(customDistanceMeters({ value: 0, unit: 'm', direction: 'within' })).toBeNull();
      expect(customDistanceMeters({ value: -5, unit: 'm', direction: 'within' })).toBeNull();
      expect(customDistanceMeters({ value: NaN, unit: 'm', direction: 'within' })).toBeNull();
    });

    it('makes "within" inclusive of the radius itself', () => {
      // "500 m" means "500 m or nearer" — a row at exactly 500 must fall inside.
      const b = customDistanceBounds({ value: 500, unit: 'm', direction: 'within' })!;
      expect(500 < b.max).toBeTrue();
      expect(b.min).toBe(0);
    });

    it('partitions within and beyond with no row in both or neither', () => {
      const custom = { value: 500, unit: 'm' as const };
      const within = customDistanceBounds({ ...custom, direction: 'within' })!;
      const beyond = customDistanceBounds({ ...custom, direction: 'beyond' })!;
      const inside = (b: { min: number; max: number }, v: number) => v >= b.min && v <= b.max;

      [0, 499.9, 500, 500.5, 10_000].forEach((v) => {
        expect(inside(within, v) !== inside(beyond, v)).toBeTrue();
      });
    });

    it('describes the radius for the filter chip, or nothing when unusable', () => {
      expect(describeCustomDistance({ value: 750, unit: 'm', direction: 'within' })).toBe('Within 750 m');
      expect(describeCustomDistance({ value: 2, unit: 'km', direction: 'beyond' })).toBe('Farther than 2 km');
      expect(describeCustomDistance({ value: null, unit: 'm', direction: 'within' })).toBeNull();
    });
  });

  // =============================================================================================
  // EVTU-14 — time windows
  // =============================================================================================
  describe('EVTU-14 timeWindowBounds', () => {
    it('returns null for "any time"', () => {
      expect(timeWindowBounds('all', NOW)).toBeNull();
    });

    it('opens the last hour and leaves it open-ended', () => {
      expect(timeWindowBounds('hour', NOW)).toEqual({ from: NOW - HOUR, to: Infinity });
    });

    it('starts today at local midnight', () => {
      expect(timeWindowBounds('today', NOW)!.from).toBe(startOfDay(NOW));
    });

    it('closes yesterday exactly where today opens, so neither overlaps nor gaps', () => {
      const midnight = startOfDay(NOW);
      expect(timeWindowBounds('yesterday', NOW)).toEqual({ from: midnight - DAY, to: midnight });
    });

    it('splits week and older at the same instant', () => {
      const week = timeWindowBounds('week', NOW)!;
      const older = timeWindowBounds('older', NOW)!;
      expect(week.from).toBe(older.to);
    });

    it('takes local midnight for startOfDay', () => {
      const d = new Date(startOfDay(NOW));
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
      expect(d.getDate()).toBe(new Date(NOW).getDate());
    });
  });
});
