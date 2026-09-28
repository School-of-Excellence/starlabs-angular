// exclude-filter-array.pipe.unit.spec.ts — unit tests for the "hide already-selected" pipe.
//
// WHY UNIT: a pure filter. It is what stops an already-picked taxonomy entry reappearing in the picker, so
// its failure mode is a user selecting the same item twice.
import { ExcludeFilterArrayPipe } from './exclude-filter-array.pipe';

const pipe = new ExcludeFilterArrayPipe();

describe('ExcludeFilterArrayPipe', () => {
  const rows = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];

  // =============================================================================================
  // PAU-01 — exclusion by id
  // =============================================================================================
  describe('PAU-01 excluding selected ids', () => {
    it('removes rows whose id is in the exclusion list', () => {
      expect(pipe.transform(rows, ['b']).map((r) => r.id)).toEqual(['a', 'c']);
    });

    it('removes several at once', () => {
      expect(pipe.transform(rows, ['a', 'c']).map((r) => r.id)).toEqual(['b']);
    });

    it('keeps everything when nothing is selected', () => {
      expect(pipe.transform(rows, []).length).toBe(3);
    });

    it('returns an empty list when everything is selected', () => {
      expect(pipe.transform(rows, ['a', 'b', 'c'])).toEqual([]);
    });

    it('ignores exclusion ids that match no row', () => {
      expect(pipe.transform(rows, ['zzz']).length).toBe(3);
    });

    it('matches ids STRICTLY, so 1 and "1" are different', () => {
      // `args.includes(e['id'])` is strict equality — a numeric id is not excluded by its string form.
      expect(pipe.transform([{ id: 1 }] as any, ['1']).length).toBe(1);
      expect(pipe.transform([{ id: 1 }] as any, [1]).length).toBe(0);
    });

    it('returns a new array and leaves the input alone', () => {
      const input = [...rows];
      expect(pipe.transform(input, ['a'])).not.toBe(input);
      expect(input.length).toBe(3);
    });
  });

  // =============================================================================================
  // PAU-02 — defaults and imperfect input
  // =============================================================================================
  describe('PAU-02 defaults', () => {
    it('defaults both arguments, so calling it bare yields an empty list', () => {
      expect(pipe.transform()).toEqual([]);
    });

    it('keeps every row when the exclusion list is omitted', () => {
      expect(pipe.transform(rows).length).toBe(3);
    });

    it('keeps rows that have no id', () => {
      // id is undefined, which is not in the exclusion list, so the row survives.
      expect(pipe.transform([{ label: 'no id' }] as any, ['a']).length).toBe(1);
    });

    it('THROWS on a null row rather than skipping it', () => {
      // Pinned: `e['id']` is unguarded. Documents the limit rather than implying safety that is not there.
      expect(() => pipe.transform([null] as any, ['a'])).toThrow();
    });
  });
});
