// atc-product.unit.spec.ts — unit tests for ATC product-name matching.
//
// WHAT THESE PROTECT: the one place that decides "is this ATC EI Solution / WiSH?", which selects the
// template sections a specialist fills in. Get it wrong and an ATC is prescribed on the wrong form.
//
// WHY SUBSTRING AND NOT EQUALITY: the real `atc model` records say "EI Solutions" (plural) while the code
// and the prototype were written against "EI Solution". The records cannot be renamed — ATCs already
// reference them — so the check widened instead. The consequences were accepted with the operator on
// 2026-11-02 and are pinned here by name: "EI Solution for Wife" / "…for Husband" ARE EI Solution
// variants and get its sections; "EI Starter Pack" is NOT and stays out; "W!SH" is NOT matched, because
// no `atc model` record uses that spelling and no punctuation stripping is done.
import { isEISolutionProduct, isWiSHProduct, productKey } from './atc-product';

describe('atc-product (unit)', () => {
  // =================================================================================================
  // QAP-01 — normalising the name before it is compared
  // =================================================================================================
  describe('QAP-01 productKey', () => {
    it('trims and lowercases', () => {
      expect(productKey('  EI Solutions  ')).toBe('ei solutions');
      expect(productKey('WiSH')).toBe('wish');
    });

    it('reads an empty key when there is no product', () => {
      expect(productKey(null)).toBe('');
      expect(productKey(undefined)).toBe('');
      expect(productKey('')).toBe('');
      expect(productKey('   ')).toBe('');
    });

    it('stringifies whatever it is handed', () => {
      expect(productKey(42)).toBe('42');
    });
  });

  // =================================================================================================
  // QAP-02 — EI Solution, including the plural the real records use
  // =================================================================================================
  describe('QAP-02 isEISolutionProduct', () => {
    it('matches the singular the code was written against', () => {
      expect(isEISolutionProduct('EI Solution')).toBe(true);
    });

    it('matches the PLURAL the real atc model records actually store', () => {
      // This is why the check is a substring at all.
      expect(isEISolutionProduct('EI Solutions')).toBe(true);
    });

    it('ignores case and surrounding whitespace', () => {
      expect(isEISolutionProduct('  ei solution  ')).toBe(true);
      expect(isEISolutionProduct('EI SOLUTIONS')).toBe(true);
    });

    it('matches the Wife / Husband variants — accepted with the operator', () => {
      expect(isEISolutionProduct('EI Solution for Wife')).toBe(true);
      expect(isEISolutionProduct('EI Solution for Husband')).toBe(true);
    });

    it('does NOT match EI Starter Pack — that exclusion is deliberate', () => {
      expect(isEISolutionProduct('EI Starter Pack')).toBe(false);
    });

    it('does not match an unrelated product or an empty name', () => {
      expect(isEISolutionProduct('WiSH')).toBe(false);
      expect(isEISolutionProduct('Breakthroughs')).toBe(false);
      expect(isEISolutionProduct(null)).toBe(false);
      expect(isEISolutionProduct('')).toBe(false);
    });
  });

  // =================================================================================================
  // QAP-03 — WiSH
  // =================================================================================================
  describe('QAP-03 isWiSHProduct', () => {
    it('matches WiSH in any casing', () => {
      expect(isWiSHProduct('WiSH')).toBe(true);
      expect(isWiSHProduct('wish')).toBe(true);
      expect(isWiSHProduct('WISH')).toBe(true);
    });

    it('matches a name that contains WiSH', () => {
      expect(isWiSHProduct('WiSH Programme')).toBe(true);
    });

    it('does NOT match "W!SH" — no record uses that spelling and no punctuation is stripped', () => {
      expect(isWiSHProduct('W!SH')).toBe(false);
    });

    it('does not match an unrelated product or an empty name', () => {
      expect(isWiSHProduct('EI Solutions')).toBe(false);
      expect(isWiSHProduct(null)).toBe(false);
      expect(isWiSHProduct('')).toBe(false);
    });
  });

  // =================================================================================================
  // QAP-04 — the two are mutually exclusive on every real product name
  // =================================================================================================
  describe('QAP-04 the two checks together', () => {
    it('never calls one real product both EI Solution and WiSH', () => {
      for (const name of ['EI Solution', 'EI Solutions', 'EI Solution for Wife', 'WiSH', 'WiSH Programme', 'EI Starter Pack']) {
        expect(isEISolutionProduct(name) && isWiSHProduct(name)).withContext(name).toBe(false);
      }
    });

    it('DEFECT (pinned): a contrived name containing both WOULD match both', () => {
      // Substring matching has no exclusivity rule. No `atc model` record is named like this today, so
      // it is pinned rather than fixed — but a future record called e.g. "EI Solution WiSH add-on"
      // would silently qualify for both templates. FIX if such a record is ever created.
      expect(isEISolutionProduct('EI Solution WiSH add-on')).toBe(true);
      expect(isWiSHProduct('EI Solution WiSH add-on')).toBe(true);
    });
  });
});
