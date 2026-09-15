// sales-numbers.service.unit.spec.ts — unit tests for the sales dashboard's aggregation rules.
//
// WHY UNIT AND NOT E2E: `aggregate()` is a PURE function of its arguments — sales in, DashboardData out.
// The suite's JP-24 only asserts that /sales-numbers mounts and renders its heading; none of the arithmetic
// below is checked anywhere today. Proving "GSV and ASV differ" through a seeded dashboard would need two
// seeded leads, a rendered chart and a scraped number, and would still not isolate which rule broke.
//
// NO TestBed: the service is @Injectable but `aggregate` never touches the injected Firestore, so it is
// constructed with a null handle. The Firestore-backed loaders (loadSalesInRange, loadProfileIdsForNames)
// are deliberately NOT tested here — they are I/O and belong in an e2e case against seeded data.
import { SalesNumbersService, SalesFilters } from './sales-numbers.service';
import { SaleLead, SalesTeam } from './sales-numbers.models';

// The service reads no Firestore in aggregate(); a null handle keeps this a pure-function test.
const svc = new SalesNumbersService(null as any);

// Journey ids the service excludes (private constants in sales-numbers.service.ts:18-19). Pinned here by
// value on purpose: if someone changes them, these tests should fail and force the decision to be explicit.
const EXCLUDE_ONBOARDING_JOURNEY = 'InLXMl7OBAqlDTZcXwK0';
const EXCLUDE_TEST_JOURNEY = 'RXvsMYoK0g4SstvDDURZ';

const START = new Date('2026-09-01T00:00:00');
const END = new Date('2026-09-30T23:59:59');
/** Inside the reporting window AND inside the 6-month chart, so one lead can serve both. */
const IN_WINDOW = new Date('2026-09-15T12:00:00');

const lead = (over: Partial<SaleLead> = {}): SaleLead => ({
  docid: 'd' + Math.random().toString(36).slice(2, 8),
  participantName: 'P',
  salespersonname: 'Asha',
  presalespersonname: '',
  journey: 'J1',
  journeytype: 'new',
  status: 'Approved',
  email: 'p@example.com',
  paymentplan: '',            // empty => NOT assured (no ASV)
  source: 'src-a',
  category: 'Ecosystem',
  productName: 'Prod',
  totalpurchasevalue: 100,
  installmentamount: 0,
  purchasedate: IN_WINDOW,
  date: null,
  paymentplanassureddate: null,
  ...over,
});

const NO_FILTERS: SalesFilters = { sources: [], salespeople: [], team: '' };

/** aggregate() takes 11 positional args; this names the ones each case actually varies. */
const agg = (o: {
  sales?: SaleLead[]; teams?: SalesTeam[]; chart?: SaleLead[]; cancels?: SaleLead[];
  filters?: SalesFilters; view?: 'person' | 'team'; metric?: 'gsv' | 'asv';
  names?: Map<string, string>; sources?: Map<string, string>;
} = {}) => svc.aggregate(
  o.sales ?? [], o.teams ?? [], o.chart ?? [], o.cancels ?? [],
  o.filters ?? NO_FILTERS, o.view ?? 'person', o.metric ?? 'gsv',
  START, END, o.names ?? new Map(), o.sources ?? new Map(),
);

describe('SalesNumbersService.aggregate', () => {
  // =============================================================================================
  // JPU-09 — GSV vs ASV are different figures from the same input
  // =============================================================================================
  describe('JPU-09 gross vs assured', () => {
    it('counts every in-window sale as gross, but only planned sales as assured', () => {
      const sales = [
        lead({ totalpurchasevalue: 100, paymentplan: '' }),        // gross only
        lead({ totalpurchasevalue: 250, paymentplan: '6 months' }), // gross AND assured
      ];
      const t = agg({ sales }).totals;
      expect(t.gsv).toBe(350);
      expect(t.grossCount).toBe(2);
      expect(t.asv).toBe(250);        // the unplanned 100 must NOT appear here
      expect(t.assuredCount).toBe(1);
    });

    it('ranks groups by the ACTIVE metric, so the toggle changes the order', () => {
      const sales = [
        lead({ salespersonname: 'Asha', totalpurchasevalue: 300, paymentplan: '' }),        // gsv 300, asv 0
        lead({ salespersonname: 'Bala', totalpurchasevalue: 200, paymentplan: '3 months' }), // gsv 200, asv 200
      ];
      expect(agg({ sales, metric: 'gsv' }).groups[0].group).toBe('Asha');
      expect(agg({ sales, metric: 'asv' }).groups[0].group).toBe('Bala');
    });

    it('excludes an out-of-window sale from gross entirely', () => {
      const sales = [lead({ purchasedate: new Date('2026-08-31T23:59:59') })];
      expect(agg({ sales }).totals.grossCount).toBe(0);
    });

    it('counts sales exactly on the window boundaries (both bounds inclusive)', () => {
      const sales = [lead({ purchasedate: START }), lead({ purchasedate: END })];
      expect(agg({ sales }).totals.grossCount).toBe(2);
    });
  });

  // =============================================================================================
  // JPU-10 / JPU-20 — salespersonname -> profileid -> team, with an Unassigned fallback
  // =============================================================================================
  describe('JPU-10 team resolution', () => {
    const teams: SalesTeam[] = [{ id: 't1', team: 'North', members: ['pid-asha'] }];

    it('groups a sale under the team its salesperson belongs to', () => {
      const g = agg({
        sales: [lead({ salespersonname: 'Asha' })], teams, view: 'team',
        names: new Map([['Asha', 'pid-asha']]),
      }).groups;
      expect(g.length).toBe(1);
      expect(g[0].group).toBe('North');
    });

    it('falls back to Unassigned when the name resolves to no profileid', () => {
      // JPU-20: the sale must still be COUNTED. Dropping it would understate the totals silently.
      const d = agg({ sales: [lead({ salespersonname: 'Nobody' })], teams, view: 'team' });
      expect(d.groups[0].group).toBe('Unassigned');
      expect(d.totals.gsv).toBe(100);
    });

    it('falls back to Unassigned when the profileid is in no team', () => {
      const d = agg({
        sales: [lead({ salespersonname: 'Asha' })], teams, view: 'team',
        names: new Map([['Asha', 'pid-not-in-any-team']]),
      });
      expect(d.groups[0].group).toBe('Unassigned');
    });

    it('groups by person when the view is person', () => {
      const d = agg({ sales: [lead({ salespersonname: 'Asha' })], teams, view: 'person',
                      names: new Map([['Asha', 'pid-asha']]) });
      expect(d.groups[0].group).toBe('Asha');
    });
  });

  // =============================================================================================
  // JPU-11 — the three exclusion rules, applied everywhere
  // =============================================================================================
  describe('JPU-11 exclusions', () => {
    it('drops a rejected lead', () => {
      expect(agg({ sales: [lead({ status: 'Rejected' })] }).totals.grossCount).toBe(0);
    });

    it('drops a rejected lead regardless of case', () => {
      expect(agg({ sales: [lead({ status: 'rejected' })] }).totals.grossCount).toBe(0);
    });

    it('drops the onboarding journey outright', () => {
      expect(agg({ sales: [lead({ journey: EXCLUDE_ONBOARDING_JOURNEY })] }).totals.grossCount).toBe(0);
    });

    it('drops the test journey ONLY for internal emails', () => {
      // Both conditions must hold — an external participant on the test journey still counts.
      const internal = lead({ journey: EXCLUDE_TEST_JOURNEY, email: 'qa@soexcellence.com' });
      const external = lead({ journey: EXCLUDE_TEST_JOURNEY, email: 'real@participant.com' });
      expect(agg({ sales: [internal] }).totals.grossCount).toBe(0);
      expect(agg({ sales: [external] }).totals.grossCount).toBe(1);
    });

    it('keeps an excluded lead out of bySource as well as the totals', () => {
      // An exclusion that leaks into one view but not another is the bug nobody notices.
      const d = agg({ sales: [lead({ status: 'Rejected', source: 'src-a' })] });
      expect(d.totals.grossCount).toBe(0);
      expect(d.bySource.length).toBe(0);
    });
  });

  // =============================================================================================
  // JPU-12 — cancellations need BOTH journeytype and approval
  // =============================================================================================
  describe('JPU-12 cancellation counting', () => {
    const cancelled = (over: Partial<SaleLead> = {}) =>
      lead({ journeytype: 'cancelled', date: IN_WINDOW, ...over });

    it('counts an approved cancellation', () => {
      const m = agg({ cancels: [cancelled({ status: 'Approved' })] }).monthly;
      expect(m.reduce((n, p) => n + (p.cancelledCount), 0)).toBe(1);
    });

    it('ignores a cancellation that is not approved', () => {
      const m = agg({ cancels: [cancelled({ status: '' })] }).monthly;
      expect(m.reduce((n, p) => n + (p.cancelledCount), 0)).toBe(0);
    });

    it('ignores a non-cancelled lead in the cancellations input', () => {
      const m = agg({ cancels: [lead({ journeytype: 'new', status: 'Approved' })] }).monthly;
      expect(m.reduce((n, p) => n + (p.cancelledCount), 0)).toBe(0);
    });
  });

  // =============================================================================================
  // JPU-13 — the trend chart is always 6 buckets, empty months included
  // =============================================================================================
  describe('JPU-13 monthly chart', () => {
    it('returns exactly 6 points even with no data', () => {
      expect(agg().monthly.length).toBe(6);
    });

    it('still returns 6 points when only one month has sales', () => {
      // A missing month must render as zero, not shift the chart left.
      expect(agg({ chart: [lead()] }).monthly.length).toBe(6);
    });
  });

  // =============================================================================================
  // JPU-14 — product segments follow SEGMENT_ORDER; anything else is Other
  // =============================================================================================
  describe('JPU-14 segments', () => {
    it('always returns the three known segments in order', () => {
      expect(agg().segments.map((s) => s.group)).toEqual(['Ecosystem', 'DFU', 'FTO + Gift']);
    });

    it('returns a zeroed segment when it has no sales', () => {
      const dfu = agg({ sales: [lead({ category: 'Ecosystem' })] }).segments.find((s) => s.group === 'DFU')!;
      expect(dfu.gsv).toBe(0);
      expect(dfu.grossCount).toBe(0);
    });

    it('counts an unknown category in the totals even though it has no segment card', () => {
      const d = agg({ sales: [lead({ category: 'Something New' })] });
      expect(d.segments.map((s) => s.group)).not.toContain('Something New');
      expect(d.totals.gsv).toBe(100); // bucketed as 'Other' — counted, never dropped
    });
  });

  // =============================================================================================
  // Filters — compound filters must intersect, and bySource must ignore the source filter
  // =============================================================================================
  describe('filters', () => {
    it('applies salesperson and source filters together (intersection, not union)', () => {
      const sales = [
        lead({ salespersonname: 'Asha', source: 'src-a' }),
        lead({ salespersonname: 'Asha', source: 'src-b' }),
        lead({ salespersonname: 'Bala', source: 'src-a' }),
      ];
      const d = agg({ sales, filters: { sources: ['src-a'], salespeople: ['Asha'], team: '' } });
      expect(d.totals.grossCount).toBe(1);
    });

    it('builds bySource ignoring the SOURCE filter, so the breakdown stays comparable', () => {
      const sales = [lead({ source: 'src-a' }), lead({ source: 'src-b' })];
      const d = agg({ sales, filters: { sources: ['src-a'], salespeople: [], team: '' } });
      expect(d.totals.grossCount).toBe(1);          // totals honour the filter
      expect(d.bySource.length).toBe(2);            // the breakdown still shows both sources
    });

    it('maps a source id to its display name when one is known', () => {
      const d = agg({ sales: [lead({ source: 'src-a' })], sources: new Map([['src-a', 'Referral']]) });
      expect(d.bySource[0].group).toBe('Referral');
    });

    it('labels a lead with no source as Unspecified rather than dropping it', () => {
      const d = agg({ sales: [lead({ source: '' })] });
      expect(d.bySource[0].group).toBe('Unspecified');
    });

    it('returns filter options de-duplicated and sorted, ignoring blanks', () => {
      const sales = [lead({ salespersonname: 'Bala' }), lead({ salespersonname: 'Asha' }),
                     lead({ salespersonname: 'Asha' }), lead({ salespersonname: '' })];
      expect(agg({ sales }).salespeople).toEqual(['Asha', 'Bala']);
    });
  });
});
