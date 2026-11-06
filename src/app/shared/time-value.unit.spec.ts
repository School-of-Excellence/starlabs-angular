// time-value.unit.spec.ts — unit tests for the "HH:mm" time-answer converter.
//
// WHAT THESE PROTECT: the stored shape of every `time` answer on a form. Before this converter,
// matTimepicker's Date went into Firestore as a Timestamp, which the Flutter app read as a string and
// CRASHED on, and which the preview dialogs printed as "Timestamp(seconds=…)". The converter is the only
// thing keeping the two apps agreeing on that shape, and it has shipped with no coverage.
//
// WHY THE READ SIDE TAKES FOUR SHAPES: no migration was run. Answers already in the data are Firestore
// Timestamps (old web), "H:m" unpadded (old Flutter), a date-time string (a Date that has been through
// JSON in a localStorage draft), or "HH:mm" (both apps from now on). An answer heals itself on next save.
//
// TIMEZONE: every case builds its Date from LOCAL components and asserts local hours/minutes, so none of
// these depend on the machine's zone. The one value whose reading is zone-dependent (a bare epoch number)
// is asserted by SHAPE only — see QTV-05.
import { timeToDate, timeToString } from './time-value';

describe('time-value (unit)', () => {
  // =================================================================================================
  // QTV-01 — the shapes that are already in the data
  // =================================================================================================
  describe('QTV-01 reading the four stored shapes', () => {
    it('reads a Firestore Timestamp through toDate()', () => {
      const stamp = { toDate: () => new Date(2026, 10, 5, 9, 5) };
      expect(timeToString(stamp)).toBe('09:05');
    });

    it('reads a plain Date', () => {
      expect(timeToString(new Date(2026, 10, 5, 14, 30))).toBe('14:30');
      expect(timeToString(new Date(2026, 10, 5, 0, 0))).toBe('00:00');
      expect(timeToString(new Date(2026, 10, 5, 23, 59))).toBe('23:59');
    });

    it('pads the unpadded "H:m" the old Flutter app wrote', () => {
      expect(timeToString('9:5')).toBe('09:05');
      expect(timeToString('0:0')).toBe('00:00');
      expect(timeToString('7:30')).toBe('07:30');
    });

    it('passes an already-correct "HH:mm" through unchanged', () => {
      expect(timeToString('09:05')).toBe('09:05');
      expect(timeToString('23:59')).toBe('23:59');
    });

    it('reads a date-time string — a Date that has been through JSON', () => {
      // A localStorage draft round-trips a Date to its ISO string. Splitting that on ":" gives a first
      // part that is not a number, so the converter falls through to Date parsing.
      const asJson = JSON.parse(JSON.stringify({ t: new Date(2026, 10, 5, 16, 45) })).t;
      expect(timeToString(asJson)).toBe('16:45');
    });

    it('ignores the seconds a "HH:mm:ss" value carries', () => {
      expect(timeToString('08:15:42')).toBe('08:15');
    });
  });

  // =================================================================================================
  // QTV-02 — nothing to convert
  // =================================================================================================
  describe('QTV-02 empty and unusable values', () => {
    it('reads null for an answer that was never given', () => {
      expect(timeToString(null)).toBeNull();
      expect(timeToString(undefined)).toBeNull();
      expect(timeToString('')).toBeNull();
    });

    it('reads null for text that is no time at all', () => {
      expect(timeToString('not a time')).toBeNull();
      expect(timeToString('abc:def')).toBeNull();
    });

    it('does NOT treat 0 as empty — it is a value, not a blank', () => {
      // `value === ''` would be true for 0 under ==; the converter uses === so 0 falls through to the
      // Date branch. The reading is zone-dependent, so only the SHAPE is asserted.
      expect(timeToString(0)).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // =================================================================================================
  // QTV-03 — the Date the timepicker control needs
  // =================================================================================================
  describe('QTV-03 timeToDate for matTimepicker', () => {
    it('puts the time on today, with seconds and milliseconds cleared', () => {
      const out = timeToDate('09:05');
      const today = new Date();
      expect(out.getHours()).toBe(9);
      expect(out.getMinutes()).toBe(5);
      expect(out.getSeconds()).toBe(0);
      expect(out.getMilliseconds()).toBe(0);
      expect(out.getFullYear()).toBe(today.getFullYear());
      expect(out.getMonth()).toBe(today.getMonth());
      expect(out.getDate()).toBe(today.getDate());
    });

    it('accepts every shape the string converter accepts', () => {
      expect(timeToDate(new Date(2026, 10, 5, 14, 30)).getHours()).toBe(14);
      expect(timeToDate({ toDate: () => new Date(2026, 10, 5, 7, 0) }).getHours()).toBe(7);
      expect(timeToDate('7:5').getMinutes()).toBe(5);
    });

    it('reads null when there is nothing to show', () => {
      expect(timeToDate(null)).toBeNull();
      expect(timeToDate('')).toBeNull();
      expect(timeToDate('not a time')).toBeNull();
    });
  });

  // =================================================================================================
  // QTV-04 — the round trip both apps rely on
  // =================================================================================================
  describe('QTV-04 round trip', () => {
    it('survives string -> Date -> string unchanged', () => {
      for (const hhmm of ['00:00', '09:05', '12:00', '13:45', '23:59']) {
        expect(timeToString(timeToDate(hhmm))).withContext(hhmm).toBe(hhmm);
      }
    });

    it('heals an old-shape answer on the first save', () => {
      // This is the migration story: read the old shape, write back the new one, and the next read is
      // already on the "HH:mm" branch.
      const healed = timeToString({ toDate: () => new Date(2026, 10, 5, 9, 5) });
      expect(healed).toBe('09:05');
      expect(timeToString(healed)).toBe('09:05');
    });
  });

  // =================================================================================================
  // QTV-05 — what the converter does NOT check
  // =================================================================================================
  describe('QTV-05 no range validation', () => {
    it('DEFECT (pinned): an out-of-range "25:70" is padded through, not rejected', () => {
      // The "H:m" branch only checks that both halves are finite numbers — it never checks 0-23 / 0-59.
      // A corrupt answer therefore survives a save and reaches the Flutter app as "25:70". The timepicker
      // cannot produce this, so it only matters for hand-written or imported data. FIX: range-check both
      // halves and fall through to Date parsing when either is out of range.
      expect(timeToString('25:70')).toBe('25:70');
    });

    it('DEFECT (pinned): a negative hour loses its sign to padStart', () => {
      // (-1).toString().padStart(2,'0') is "-1", so "-1:30" comes back as "-1:30" — still not a time.
      expect(timeToString('-1:30')).toBe('-1:30');
    });
  });
});
