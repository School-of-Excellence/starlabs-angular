// cohorts-filter.unit.spec.ts — unit tests for the cohort search pipe.
//
// WHY UNIT: a pure transform — `new CohortsFilterPipe()` and call it. Small, but it is the search box on a
// cohort list, and its field-fallback chain (cohortname -> name -> id) is the kind of detail that decides
// whether a cohort is findable at all.
import { CohortsFilterPipe } from './cohorts-filter';

const pipe = new CohortsFilterPipe();

describe('CohortsFilterPipe', () => {
  const cohorts = [
    { cohortname: 'Alpha Cohort' },
    { name: 'Beta Group' },
    { id: 'gamma-123' },
  ];

  // =============================================================================================
  // OPU-13 — matching
  // =============================================================================================
  describe('OPU-13 matching', () => {
    it('matches on a substring, not just a prefix', () => {
      expect(pipe.transform(cohorts, 'Cohort')).toEqual([{ cohortname: 'Alpha Cohort' }]);
    });

    it('is case-insensitive in both directions', () => {
      expect(pipe.transform(cohorts, 'ALPHA').length).toBe(1);
      expect(pipe.transform([{ cohortname: 'ALPHA' }], 'alpha').length).toBe(1);
    });

    it('falls back through cohortname -> name -> id', () => {
      // Each cohort in the fixture carries only ONE of the three fields, so a broken fallback drops a row.
      expect(pipe.transform(cohorts, 'beta').length).toBe(1);
      expect(pipe.transform(cohorts, 'gamma').length).toBe(1);
    });

    it('prefers cohortname when more than one field is present', () => {
      const rows = [{ cohortname: 'Real Name', name: 'Other', id: 'x' }];
      expect(pipe.transform(rows, 'real').length).toBe(1);
      expect(pipe.transform(rows, 'other').length).toBe(0);   // `name` is not consulted once cohortname exists
    });

    it('returns an empty array when nothing matches', () => {
      expect(pipe.transform(cohorts, 'nothing-here')).toEqual([]);
    });

    it('handles a cohort with none of the three fields without throwing', () => {
      expect(() => pipe.transform([{ something: 'else' } as any], 'x')).not.toThrow();
      expect(pipe.transform([{ something: 'else' } as any], 'x')).toEqual([]);
    });
  });

  // =============================================================================================
  // OPU-14 — pass-through guards
  // =============================================================================================
  describe('OPU-14 guards', () => {
    it('returns the full list unchanged when the search box is empty', () => {
      // An empty search must show everything, not nothing.
      expect(pipe.transform(cohorts, '')).toBe(cohorts);
    });

    it('returns the input unchanged when it is null or undefined', () => {
      expect(pipe.transform(null as any, 'x')).toBeNull();
      expect(pipe.transform(undefined as any, 'x')).toBeUndefined();
    });

    it('returns a NEW empty array for an empty list with a search term', () => {
      // Not the same reference: `[]` is truthy, so the guard does not fire and the list goes through
      // filter(). Only a falsy search term returns the input by reference (see the empty-search case above).
      const empty: any[] = [];
      const out = pipe.transform(empty, 'x');
      expect(out).toEqual([]);
      expect(out).not.toBe(empty);
    });

    it('does not mutate the input when it does filter', () => {
      const input = [...cohorts];
      pipe.transform(input, 'alpha');
      expect(input.length).toBe(3);
    });

    it('treats whitespace as a real search term, not as empty', () => {
      // ' ' is truthy, so it filters — and matches only cohorts whose name contains a space.
      expect(pipe.transform(cohorts, ' ').map((c: any) => c.cohortname ?? c.name))
        .toEqual(['Alpha Cohort', 'Beta Group']);
    });
  });
});
