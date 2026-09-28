// segment name.pipe.unit.spec.ts — unit tests for the segment id → display name lookup.
//
// WHY UNIT: a pure transform. Small, but it is the pipe that decides whether a queue screen shows a human
// segment name or a raw document id — and its fallback chain is what keeps an unresolvable id readable
// rather than blank.
import { SegmentNamePipe } from './segment name.pipe';

const pipe = new SegmentNamePipe();

describe('SegmentNamePipe', () => {
  const segments = [
    { id: 's1', segmentname: 'Morning Cohort' },
    { id: 's2', name: 'Evening Cohort' },
    { id: 's3' },
  ];

  // =============================================================================================
  // OPU-22 — resolution
  // =============================================================================================
  describe('OPU-22 resolving a segment', () => {
    it('resolves an id to its segmentname', () => {
      expect(pipe.transform(segments, 's1')).toBe('Morning Cohort');
    });

    it('falls back to name when segmentname is absent', () => {
      expect(pipe.transform(segments, 's2')).toBe('Evening Cohort');
    });

    it('falls back to the id when the segment carries no name at all', () => {
      // Never blank: a raw id is still something an operator can search for.
      expect(pipe.transform(segments, 's3')).toBe('s3');
    });

    it('prefers segmentname over name when both are present', () => {
      expect(pipe.transform([{ id: 'x', segmentname: 'Primary', name: 'Secondary' }], 'x')).toBe('Primary');
    });

    it('returns the id unchanged when no segment matches', () => {
      // The id is displayed rather than "undefined" — the screen stays readable while data catches up.
      expect(pipe.transform(segments, 'unknown-id')).toBe('unknown-id');
    });

    it('matches on id exactly, not loosely', () => {
      expect(pipe.transform([{ id: 1, segmentname: 'One' } as any], '1')).toBe('1');
    });
  });

  // =============================================================================================
  // OPU-23 — guards
  // =============================================================================================
  describe('OPU-23 guards', () => {
    it('returns the id when the segment list has not loaded yet', () => {
      // The list arrives asynchronously; before it does, the id must still render.
      expect(pipe.transform(null as any, 's1')).toBe('s1');
      expect(pipe.transform(undefined as any, 's1')).toBe('s1');
    });

    it('returns the id when the list is empty', () => {
      expect(pipe.transform([], 's1')).toBe('s1');
    });

    it('returns the input unchanged when the id is empty', () => {
      expect(pipe.transform(segments, '')).toBe('');
      expect(pipe.transform(segments, null as any)).toBeNull();
    });

    it('THROWS on a null entry in the segment list', () => {
      // Pinned, not fixed: `segments.find(s => s.id === id)` dereferences every entry, so one null row takes
      // the render down. Consistent with the other pipes in this suite, the limit is documented rather
      // than implied away — a guard here would turn this red and get reviewed.
      expect(() => pipe.transform([null, { id: 's1', segmentname: 'OK' }] as any, 's1')).toThrow();
    });
  });
});
