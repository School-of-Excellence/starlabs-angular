// filter.pipe.unit.spec.ts (hpc) — unit tests for the `reduce` summing pipe.
//
// WHY UNIT: a pure numeric transform, and business's FIRST unit spec. It is used to total a column in the
// HPC dashboard, so what matters is that it produces a number for every input shape a Firestore row can
// arrive in — a NaN or "undefined" rendered in a total is both wrong and alarming to look at.
import { ReducePipe } from './filter.pipe';

const pipe = new ReducePipe();

describe('ReducePipe (hpc)', () => {
  // =============================================================================================
  // BMU-01 — summing
  // =============================================================================================
  describe('BMU-01 summing a field', () => {
    it('totals the named field across rows', () => {
      expect(pipe.transform([{ n: 1 }, { n: 2 }, { n: 3 }], 'n')).toBe(6);
    });

    it('ignores other fields on the same rows', () => {
      expect(pipe.transform([{ n: 1, other: 100 }, { n: 2, other: 200 }], 'n')).toBe(3);
    });

    it('handles negative values and decimals', () => {
      expect(pipe.transform([{ n: -5 }, { n: 2.5 }], 'n')).toBe(-2.5);
    });

    it('does not mutate the input rows', () => {
      const rows = [{ n: 1 }, { n: 2 }];
      pipe.transform(rows, 'n');
      expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
    });
  });

  // =============================================================================================
  // BMU-02 — missing and non-numeric values
  // =============================================================================================
  describe('BMU-02 imperfect rows', () => {
    it('treats a missing field as zero rather than producing NaN', () => {
      // Firestore rows are not uniform; one row without the field must not poison the whole total.
      expect(pipe.transform([{ n: 5 }, {}, { n: 5 }], 'n')).toBe(10);
    });

    it('treats null and undefined values as zero', () => {
      expect(pipe.transform([{ n: null }, { n: undefined }, { n: 4 }], 'n')).toBe(4);
    });

    it('treats zero as zero, not as missing', () => {
      expect(pipe.transform([{ n: 0 }, { n: 0 }], 'n')).toBe(0);
    });

    it('returns 0 when the named field exists on no row', () => {
      expect(pipe.transform([{ a: 1 }, { b: 2 }], 'n')).toBe(0);
    });

    it('CONCATENATES when the field holds strings — a real hazard with Firestore numbers stored as text', () => {
      // Pinned, not fixed: `sum + (item[field] || 0)` is untyped, so string values produce '05' rather than
      // 5. If a collection ever stores these as strings the dashboard silently shows a nonsense total. A
      // Number() coercion would fix it and turn this test red, which is the point.
      expect(pipe.transform([{ n: '5' }, { n: '5' }] as any, 'n') as any).toBe('055');
    });
  });

  // =============================================================================================
  // BMU-03 — guards
  // =============================================================================================
  describe('BMU-03 guards', () => {
    it('returns 0 for an empty list', () => {
      expect(pipe.transform([], 'n')).toBe(0);
    });

    it('returns 0 when the list has not loaded yet', () => {
      expect(pipe.transform(null as any, 'n')).toBe(0);
      expect(pipe.transform(undefined as any, 'n')).toBe(0);
    });

    it('returns 0 rather than throwing on a null row', () => {
      // No row guard inside the reduce, so this documents the current limit: a null ROW still throws.
      expect(() => pipe.transform([null] as any, 'n')).toThrow();
    });
  });
});
