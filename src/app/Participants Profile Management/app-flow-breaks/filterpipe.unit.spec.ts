// filterpipe.unit.spec.ts (app-flow-breaks) — unit tests for the exact-match property filter.
//
// WHY UNIT: a pure filter, and worth pinning precisely because its behaviour is NOT what the name suggests.
// It is an EXACT, case-sensitive, strict-equality match — not a search. A caller expecting substring
// behaviour (as the sibling cohortsFilter pipe provides) silently gets zero rows.
import { FilterPipe } from './filterpipe';

const pipe = new FilterPipe();

describe('FilterPipe (app-flow-breaks)', () => {
  const rows = [
    { status: 'Open', owner: 'asha' },
    { status: 'Closed', owner: 'bala' },
    { status: 'Open', owner: 'bala' },
  ];

  // =============================================================================================
  // PAU-03 — exact matching
  // =============================================================================================
  describe('PAU-03 matching', () => {
    it('keeps rows whose property equals the value exactly', () => {
      expect(pipe.transform(rows, 'Open', 'status').length).toBe(2);
    });

    it('filters on whichever property is named', () => {
      expect(pipe.transform(rows, 'bala', 'owner').length).toBe(2);
    });

    it('is case-SENSITIVE', () => {
      // Unlike cohortsFilter, which lowercases both sides. A caller assuming otherwise gets nothing back.
      expect(pipe.transform(rows, 'open', 'status').length).toBe(0);
    });

    it('does NOT match a substring', () => {
      expect(pipe.transform(rows, 'Ope', 'status').length).toBe(0);
    });

    it('uses strict equality, so "1" does not match 1', () => {
      expect(pipe.transform([{ n: 1 }] as any, '1', 'n').length).toBe(0);
    });

    it('returns an empty array when nothing matches', () => {
      expect(pipe.transform(rows, 'Archived', 'status')).toEqual([]);
    });

    it('returns rows unchanged in the same order', () => {
      expect(pipe.transform(rows, 'Open', 'status').map((r) => r.owner)).toEqual(['asha', 'bala']);
    });
  });

  // =============================================================================================
  // PAU-04 — guards: any missing argument means "no filtering"
  // =============================================================================================
  describe('PAU-04 guards', () => {
    it('returns the full list when the search value is empty', () => {
      // An empty filter box must show everything, not nothing.
      expect(pipe.transform(rows, '', 'status')).toBe(rows);
    });

    it('returns the full list when no property is named', () => {
      expect(pipe.transform(rows, 'Open', '')).toBe(rows);
    });

    it('returns the input unchanged when the list has not loaded', () => {
      expect(pipe.transform(null as any, 'Open', 'status')).toBeNull();
      expect(pipe.transform(undefined as any, 'Open', 'status')).toBeUndefined();
    });

    it('returns an empty result for rows missing the property, rather than throwing', () => {
      expect(pipe.transform([{ other: 1 }] as any, 'Open', 'status')).toEqual([]);
    });
  });
});
