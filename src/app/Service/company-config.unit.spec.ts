// company-config.unit.spec.ts — the multi-company GST resolution the Watson payment write depends on.
//
// WHY THIS IS A UNIT SPEC AND NOT AN E2E: the company picker in create-watson-profile reads Watson's
// `accountsconfig/config` through a SEPARATE Firebase app (`getApp("watson")`) and writes the payment
// into Watson's project. The e2e harness deliberately runs with `watson: null` (ci/overlay/
// environment.emulator.ts) so that app is never initialised and `getApp("watson")` throws — the journey
// suite's own note is "We NEVER drive a Watson/SalesCRM action". So the browser suites cannot reach this
// decision at all. What they cannot reach is exactly what is pinned here: the pure resolution that
// decides WHICH legal entity a payment is booked under, which invoice series it carries, and which
// counter doc its non-GST tally lands in.
//
// WHAT IT PROTECTS: this file is a deliberate copy of Watson-Angular's `company-config.ts`, and the two
// repos deploy separately. A divergence does not crash anything — it silently numbers invoices under the
// wrong entity. Each expectation below therefore states the rule, not the implementation.
import {
  CompanyConfig, DEFAULT_COMPANY_KEY, STATE_ABBR,
  companyPrefixFor, findCompany, isDefaultCompany, ratioCounterDocId, resolveCompanies,
} from './company-config';

/** A config doc in the migrated (multi-company) shape. */
const multiCompanyDoc = {
  companies: [
    {
      key: 'A', title: 'Entity One', seriesPrefix: 'none', igststate: 'Tamil Nadu',
      gstdetails: [{ statename: 'Tamil Nadu', statecode: '33', gstno: '33AAAAA0000A1Z5', companyname: 'Entity One' }],
      nongstratio: [{ statename: 'Tamil Nadu', ratio: 100 }],
    },
    {
      key: 'B', title: 'Entity Two', seriesPrefix: 'statecode', igststate: 'Karnataka',
      gstdetails: [{ statename: 'Karnataka', statecode: '29', gstno: '29BBBBB0000B1Z5', companyname: 'Entity Two' }],
      nongstratio: [{ statename: 'Karnataka', ratio: 100 }],
    },
  ],
};

/** The pre-migration doc: one company's fields sit at the top level, with no `companies` array. */
const legacyDoc = {
  gstdetails: [{ statename: 'Tamil Nadu', statecode: '33', gstno: '33AAAAA0000A1Z5', companyname: 'Legacy Entity' }],
  nongstratio: [{ statename: 'Tamil Nadu', ratio: 100 }],
  igststate: 'Tamil Nadu',
};

const companyWith = (over: Partial<CompanyConfig>): CompanyConfig => ({
  key: 'B', title: 'Entity Two', seriesPrefix: 'statecode', gstdetails: [], nongstratio: [], igststate: '', ...over,
});

describe('company-config — which legal entity a Watson payment is booked under', () => {
  describe('resolveCompanies', () => {
    it('reads every company out of a migrated doc', () => {
      const companies = resolveCompanies(multiCompanyDoc);
      expect(companies.length).toBe(2);
      expect(companies.map((c) => c.key)).toEqual(['A', 'B']);
      expect(companies[1].title).toBe('Entity Two');
      expect(companies[1].igststate).toBe('Karnataka');
    });

    it('keeps the FIRST company on the original unprefixed series and prefixes the rest', () => {
      // The whole migration rests on this: company[0] must keep the legacy invoice series, or
      // pre-existing invoice numbers would change shape.
      const companies = resolveCompanies({
        companies: [{ key: 'A', title: 'One' }, { key: 'B', title: 'Two' }],
      });
      expect(companies[0].seriesPrefix).toBe('none');
      expect(companies[1].seriesPrefix).toBe('statecode');
    });

    it('honours an explicit seriesPrefix over the positional default', () => {
      const companies = resolveCompanies({ companies: [{ key: 'A', seriesPrefix: 'statecode' }] });
      expect(companies[0].seriesPrefix).toBe('statecode');
    });

    it('names companies A, B, C… when the doc omits keys', () => {
      const companies = resolveCompanies({ companies: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] });
      expect(companies.map((c) => c.key)).toEqual(['A', 'B', 'C']);
    });

    it('promotes a legacy single-company doc to one default company', () => {
      const companies = resolveCompanies(legacyDoc);
      expect(companies.length).toBe(1);
      expect(companies[0].key).toBe(DEFAULT_COMPANY_KEY);
      expect(companies[0].seriesPrefix).toBe('none');
      expect(companies[0].title).toBe('Legacy Entity');       // taken from gstdetails[0].companyname
      expect(companies[0].gstdetails).toBe(legacyDoc.gstdetails);
    });

    it('never returns an empty list, and never a missing array, for a blank or unreadable doc', () => {
      // A caller that got [] here would write a payment with no entity at all.
      for (const doc of [null, undefined, {}, { companies: [] }, { companies: 'nonsense' }]) {
        const companies = resolveCompanies(doc as any);
        expect(companies.length).toBe(1);
        expect(companies[0].key).toBe(DEFAULT_COMPANY_KEY);
        expect(Array.isArray(companies[0].gstdetails)).toBeTrue();
        expect(Array.isArray(companies[0].nongstratio)).toBeTrue();
      }
    });
  });

  describe('findCompany', () => {
    const companies = resolveCompanies(multiCompanyDoc);

    it('finds the company the payment names', () => {
      expect(findCompany(companies, 'B')?.title).toBe('Entity Two');
    });

    it('treats a payment with NO companykey as the default company', () => {
      // This is what lets every pre-existing payment keep working unchanged.
      for (const key of [null, undefined, '']) {
        expect(findCompany(companies, key as any)?.key).toBe('A');
      }
    });

    it('falls back to the default company for an unknown key rather than throwing', () => {
      expect(findCompany(companies, 'ZZ')?.key).toBe('A');
    });

    it('returns null when there are no companies at all', () => {
      expect(findCompany([], 'A')).toBeNull();
      expect(findCompany(null as any, 'A')).toBeNull();
    });
  });

  describe('isDefaultCompany', () => {
    it('is true for the unprefixed series and for a missing company', () => {
      expect(isDefaultCompany(companyWith({ seriesPrefix: 'none' }))).toBeTrue();
      expect(isDefaultCompany(null)).toBeTrue();
    });

    it('is false only for a state-prefixed series', () => {
      expect(isDefaultCompany(companyWith({ seriesPrefix: 'statecode' }))).toBeFalse();
      // anything else is treated as the original series — the safe direction
      expect(isDefaultCompany(companyWith({ seriesPrefix: 'something-else' }))).toBeTrue();
    });
  });

  describe('companyPrefixFor — the letters stamped on the invoice number', () => {
    it('stamps nothing for the default company, whatever its registration says', () => {
      expect(companyPrefixFor(companyWith({ seriesPrefix: 'none' }), { statecode: '33' })).toBe('');
    });

    it('uses the registration state code of a prefixed company', () => {
      expect(companyPrefixFor(companyWith({}), { statecode: '33' })).toBe('TN');
      expect(companyPrefixFor(companyWith({}), { statecode: '29' })).toBe('KA');
    });

    it('falls back to the first two digits of the seller GSTIN when there is no state code', () => {
      expect(companyPrefixFor(companyWith({}), { gstno: '27CCCCC0000C1Z5' })).toBe('MH');
    });

    it('falls back to IN for an unknown or missing state, never to a wrong state', () => {
      expect(companyPrefixFor(companyWith({}), { statecode: '99' })).toBe('IN');
      expect(companyPrefixFor(companyWith({}), {})).toBe('IN');
      expect(companyPrefixFor(companyWith({}), null)).toBe('IN');
    });

    it('agrees with the GST state-code table it mirrors', () => {
      // Spot-checks against the official codes; STATE_ABBR mirrors watson-cloud-functions.
      expect(STATE_ABBR['33']).toBe('TN');
      expect(STATE_ABBR['29']).toBe('KA');
      expect(STATE_ABBR['07']).toBe('DL');
      expect(STATE_ABBR['36']).toBe('TS');
      expect(Object.values(STATE_ABBR).every((a) => /^[A-Z]{2}$/.test(a))).toBeTrue();
    });
  });

  describe('ratioCounterDocId — whose non-GST tally a payment lands in', () => {
    it('keeps the original MM-YY id for the default company so its counts carry over', () => {
      expect(ratioCounterDocId(companyWith({ seriesPrefix: 'none' }), '09', '26')).toBe('09-26');
      expect(ratioCounterDocId(null, '09', '26')).toBe('09-26');
    });

    it('namespaces every other company by key', () => {
      expect(ratioCounterDocId(companyWith({ key: 'B' }), '09', '26')).toBe('B-09-26');
    });

    it('keeps two companies registered in the same state on separate tallies', () => {
      // Counter keys are bare state names, so sharing a doc would merge two entities' distributions.
      const b = ratioCounterDocId(companyWith({ key: 'B' }), '09', '26');
      const c = ratioCounterDocId(companyWith({ key: 'C' }), '09', '26');
      expect(b).not.toBe(c);
    });
  });

  describe('end to end through the resolution chain', () => {
    it('books a payment that names company B under B, with its own series and tally', () => {
      const companies = resolveCompanies(multiCompanyDoc);
      const chosen = findCompany(companies, 'B')!;
      expect(chosen.key).toBe('B');
      expect(companyPrefixFor(chosen, chosen.gstdetails[0])).toBe('KA');
      expect(ratioCounterDocId(chosen, '09', '26')).toBe('B-09-26');
    });

    it('books a payment that names nothing under the default company, unchanged from before', () => {
      const companies = resolveCompanies(multiCompanyDoc);
      const chosen = findCompany(companies, '')!;
      expect(chosen.key).toBe('A');
      expect(companyPrefixFor(chosen, chosen.gstdetails[0])).toBe('');
      expect(ratioCounterDocId(chosen, '09', '26')).toBe('09-26');
    });
  });
});
