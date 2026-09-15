// country-phone.service.unit.spec.ts — unit tests for the country dialling-code lookup.
//
// WHY UNIT: the service is a static table plus three lookups. No Firestore, no HTTP, no TestBed — just
// `new CountryPhoneService()`. It is CROSS-CUTTING (a change makes every suite mandatory) and it decides
// phone-number VALIDATION across every form that collects a number, so a wrong digit count silently
// rejects real participants or accepts malformed ones.
import { CountryPhoneService } from './country-phone.service';

const svc = new CountryPhoneService();

describe('CountryPhoneService', () => {
  // =============================================================================================
  // SHU-08 — table integrity
  // =============================================================================================
  describe('SHU-08 the country table', () => {
    it('is populated', () => {
      expect(svc.countries.length).toBeGreaterThan(50);
    });

    it('gives every entry a name, code, iso, digits and flag', () => {
      // One malformed row breaks the picker for that country only — easy to miss by eye across 70+ rows.
      svc.countries.forEach((c) => {
        expect(c.name).toBeTruthy();
        expect(c.code).toMatch(/^\+\d+$/);
        expect(c.iso).toMatch(/^[A-Z]{2}$/);
        expect(c.digits).toBeGreaterThan(0);
        expect(c.flag).toBeTruthy();
      });
    });

    it('has no duplicate ISO codes', () => {
      const iso = svc.countries.map((c) => c.iso);
      expect(new Set(iso).size).toBe(iso.length);
    });

    it('keeps the list alphabetical by name', () => {
      // It is rendered as a picker in country order; an out-of-place row is hard to find by scrolling.
      const names = svc.countries.map((c) => c.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    });
  });

  // =============================================================================================
  // SHU-09 — getByCode
  // =============================================================================================
  describe('SHU-09 getByCode', () => {
    it('finds a country by dialling code', () => {
      expect(svc.getByCode('+91')?.iso).toBe('IN');
      expect(svc.getByCode('+44')?.iso).toBe('GB');
    });

    it('returns undefined for an unknown code', () => {
      expect(svc.getByCode('+999')).toBeUndefined();
    });

    it('requires the leading plus — it is an exact string match, not a numeric one', () => {
      expect(svc.getByCode('91')).toBeUndefined();
    });

    it('returns the FIRST match when a code is shared, which for +1 is Canada, not the US', () => {
      // Pinned deliberately. Canada and the United States both carry '+1' and `find` stops at the first.
      // Harmless today because both are 10 digits — but if either row's digit count is ever edited, the
      // other country's validation changes with it and nothing else would reveal that coupling.
      const both = svc.countries.filter((c) => c.code === '+1');
      expect(both.length).toBe(2);
      expect(svc.getByCode('+1')?.iso).toBe('CA');
      expect(both[0].digits).toBe(both[1].digits);
    });
  });

  // =============================================================================================
  // SHU-10 — digit counts and the validation pattern built from them
  // =============================================================================================
  describe('SHU-10 getDigitsForCode / getPatternForCode', () => {
    it('returns the configured digit count', () => {
      expect(svc.getDigitsForCode('+91')).toBe(10);
      expect(svc.getDigitsForCode('+973')).toBe(8);   // Bahrain
    });

    it('falls back to 10 for an unknown code rather than throwing', () => {
      // A number from a country not in the table stays enterable; it is not silently rejected.
      expect(svc.getDigitsForCode('+999')).toBe(10);
    });

    it('builds an anchored, exact-length digit pattern', () => {
      const re = svc.getPatternForCode('+973'); // 8 digits
      expect(re.test('12345678')).toBeTrue();
      expect(re.test('1234567')).toBeFalse();    // too short
      expect(re.test('123456789')).toBeFalse();  // too long
    });

    it('rejects non-digits, spaces and separators', () => {
      const re = svc.getPatternForCode('+91');   // 10 digits
      expect(re.test('98765 43210')).toBeFalse();
      expect(re.test('98765-43210')).toBeFalse();
      expect(re.test('abcdefghij')).toBeFalse();
      expect(re.test('+919876543210')).toBeFalse(); // the code must not be included in the number
    });

    it('rejects an empty string', () => {
      expect(svc.getPatternForCode('+91').test('')).toBeFalse();
    });

    it('uses the 10-digit fallback pattern for an unknown code', () => {
      const re = svc.getPatternForCode('+999');
      expect(re.test('1234567890')).toBeTrue();
      expect(re.test('123456789')).toBeFalse();
    });
  });
});
