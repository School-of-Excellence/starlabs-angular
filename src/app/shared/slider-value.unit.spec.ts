// slider-value.unit.spec.ts — unit tests for the slider answer ↔ option-label mapping.
//
// WHAT THESE PROTECT: a slider answer is a 0-BASED INDEX into that field's `options`. The number is
// stored; the LABEL is what the participant reads. Before this helper the web ran a slider from 1 to a
// hardcoded 10 and printed the bare number, while the Flutter app read the same number as an index — so
// an answer of 7 against three options TOOK THE APP DOWN. The clamp is the whole safety story, and it
// shipped with no coverage.
//
// WHY EVERY READ IS CLAMPED RATHER THAN VALIDATED: answers written before this rule exist with positions
// the list can no longer hold (the old 1-10 flipping slider) and with 1-based positions from the web.
// Resolving to the nearest option is deliberately preferred over showing nothing.
import { sliderLabel, sliderPosition } from './slider-value';

describe('slider-value (unit)', () => {
  const THREE = ['Never', 'Sometimes', 'Always'];

  // =================================================================================================
  // QSV-01 — an answer that is already in range
  // =================================================================================================
  describe('QSV-01 in-range positions', () => {
    it('reads each valid index as itself', () => {
      expect(sliderPosition(THREE, 0)).toBe(0);
      expect(sliderPosition(THREE, 1)).toBe(1);
      expect(sliderPosition(THREE, 2)).toBe(2);
    });

    it('names the option at that index', () => {
      expect(sliderLabel(THREE, 0)).toBe('Never');
      expect(sliderLabel(THREE, 1)).toBe('Sometimes');
      expect(sliderLabel(THREE, 2)).toBe('Always');
    });

    it('reads a numeric string the same as a number', () => {
      expect(sliderPosition(THREE, '1')).toBe(1);
      expect(sliderLabel(THREE, '2')).toBe('Always');
    });
  });

  // =================================================================================================
  // QSV-02 — the clamp: answers from before the rule existed
  // =================================================================================================
  describe('QSV-02 clamping out-of-range answers', () => {
    it('pulls an answer past the end back to the last option', () => {
      // The crash case: 7 against three options. It now reads "Always" instead of taking the app down.
      expect(sliderPosition(THREE, 7)).toBe(2);
      expect(sliderLabel(THREE, 7)).toBe('Always');
      expect(sliderPosition(THREE, 10)).toBe(2);
    });

    it('pulls a negative answer up to the first option', () => {
      expect(sliderPosition(THREE, -1)).toBe(0);
      expect(sliderPosition(THREE, -99)).toBe(0);
      expect(sliderLabel(THREE, -1)).toBe('Never');
    });

    it('rounds a fractional position to the nearest option', () => {
      expect(sliderPosition(THREE, 1.4)).toBe(1);
      expect(sliderPosition(THREE, 1.5)).toBe(2);
      expect(sliderPosition(THREE, 0.5)).toBe(1);
    });

    it('reads an untouched slider (null) as the first option', () => {
      expect(sliderPosition(THREE, null)).toBe(0);
      expect(sliderPosition(THREE, undefined)).toBe(0);
      expect(sliderLabel(THREE, null)).toBe('Never');
    });

    it('reads anything non-numeric as the first option', () => {
      expect(sliderPosition(THREE, 'banana')).toBe(0);
      expect(sliderPosition(THREE, {})).toBe(0);
      expect(sliderPosition(THREE, NaN)).toBe(0);
    });
  });

  // =================================================================================================
  // QSV-03 — a field with no usable options
  // =================================================================================================
  describe('QSV-03 missing or empty options', () => {
    it('reads position 0 when options are missing or not a list', () => {
      expect(sliderPosition(null, 3)).toBe(0);
      expect(sliderPosition(undefined, 3)).toBe(0);
      expect(sliderPosition('not a list', 3)).toBe(0);
      expect(sliderPosition({}, 3)).toBe(0);
    });

    it('reads position 0 for an empty list rather than -1', () => {
      // `last < 0` is the guard: without it the clamp would return -1 and index out of the array.
      expect(sliderPosition([], 3)).toBe(0);
      expect(sliderPosition([], 0)).toBe(0);
    });

    it('falls back to printing the raw value when there is no list to name', () => {
      expect(sliderLabel(null, 3)).toBe('3');
      expect(sliderLabel([], 3)).toBe('3');
      expect(sliderLabel('not a list', 7)).toBe('7');
    });

    it('prints an empty string rather than "null" when there is neither list nor value', () => {
      expect(sliderLabel(null, null)).toBe('');
      expect(sliderLabel([], undefined)).toBe('');
    });
  });

  // =================================================================================================
  // QSV-04 — a one-option list, and labels that are not strings
  // =================================================================================================
  describe('QSV-04 edges', () => {
    it('pins every answer to the only option there is', () => {
      expect(sliderPosition(['Only'], 0)).toBe(0);
      expect(sliderPosition(['Only'], 5)).toBe(0);
      expect(sliderLabel(['Only'], 5)).toBe('Only');
    });

    it('stringifies a non-string option', () => {
      expect(sliderLabel([1, 2, 3], 1)).toBe('2');
    });

    it('agrees with itself — the label is always the option at the position', () => {
      for (const value of [-5, -1, 0, 1, 2, 2.5, 9, null, 'x']) {
        const position = sliderPosition(THREE, value);
        expect(sliderLabel(THREE, value)).withContext(String(value)).toBe(THREE[position]);
      }
    });
  });
});
