/**
 * Unit gate — Journey / sales numbers aggregation.  Prefix: JPU-2x
 *
 * SalesNumbersService talks to Firestore, but `aggregate()` does not: it takes already-loaded
 * arrays and returns a plain object, calling only sibling pure helpers. So it is constructed with
 * `new SalesNumbersService(null as any)` — no TestBed, no mock, no emulator. If a future change
 * makes `aggregate()` read `this.firestore`, these specs will throw on null and tell you so.
 *
 * What is pinned here is the GSV/ASV counting rules that the journey-coach dashboard and this
 * screen must agree on. Getting these wrong silently misreports revenue, which is the kind of bug
 * an e2e assertion on a rendered number reports far too late and far too vaguely.
 */
import { SalesNumbersService, type SalesFilters } from './sales-numbers.service';
import type { SaleLead, SalesTeam } from './sales-numbers.models';

// Journeys the dashboard excludes. Mirrored from the private constants in the service —
// if the service's ids change, JPU-20 goes red, which is the intended alarm.
const ONBOARDING_JOURNEY = 'InLXMl7OBAqlDTZcXwK0';
const TEST_JOURNEY = 'RXvsMYoK0g4SstvDDURZ';

const WINDOW_START = new Date('2026-03-01T00:00:00Z');
const WINDOW_END = new Date('2026-03-31T23:59:59Z');
const IN_WINDOW = new Date('2026-03-15T12:00:00Z');
const BEFORE_WINDOW = new Date('2026-02-15T12:00:00Z');

/** A minimal approved, in-window, planless sale. Override only the field under test. */
function lead(over: Partial<SaleLead> = {}): SaleLead {
  return {
    docid: `d${Math.random().toString(36).slice(2, 9)}`,
    participantName: 'A Participant',
    salespersonname: 'Harish',
    presalespersonname: 'Harish',
    journey: 'journey-eco',
    journeytype: 'new',
    status: 'Approved',
    email: 'someone@example.com',
    paymentplan: '',
    source: '',
    category: 'Ecosystem',
    productName: 'Eco',
    totalpurchasevalue: 1000,
    installmentamount: 0,
    purchasedate: IN_WINDOW,
    date: null,
    paymentplanassureddate: null,
    ...over,
  };
}

const NO_FILTERS: SalesFilters = { sources: [], salespeople: [], team: '' };

/** Run aggregate() with sensible defaults; override any argument by name. */
function run(opts: {
  sales?: SaleLead[]; teams?: SalesTeam[]; chartSales?: SaleLead[]; chartCancellations?: SaleLead[];
  filters?: SalesFilters; view?: 'person' | 'team'; metric?: 'gsv' | 'asv';
  names?: Map<string, string>; sources?: Map<string, string>;
} = {}) {
  const svc = new SalesNumbersService(null as any); // aggregate() never touches Firestore
  return svc.aggregate(
    opts.sales ?? [], opts.teams ?? [], opts.chartSales ?? [], opts.chartCancellations ?? [],
    opts.filters ?? NO_FILTERS, opts.view ?? 'person', opts.metric ?? 'gsv',
    WINDOW_START, WINDOW_END,
    opts.names ?? new Map(), opts.sources ?? new Map(),
  );
}

describe('JPU-2x — sales numbers aggregation', () => {

  describe('JPU-20 excluded journeys and rejected sales never reach the totals', () => {
    it('drops the onboarding journey outright', () => {
      expect(run({ sales: [lead({ journey: ONBOARDING_JOURNEY })] }).totals.grossCount).toBe(0);
    });
    it('drops the test journey only for internal email addresses', () => {
      const internal = run({ sales: [lead({ journey: TEST_JOURNEY, email: 'qa@soexcellence.com' })] });
      const real = run({ sales: [lead({ journey: TEST_JOURNEY, email: 'customer@gmail.com' })] });
      expect(internal.totals.grossCount).toBe(0);
      expect(real.totals.grossCount).toBe(1); // a real buyer on the test journey still counts
    });
    it('matches the internal-email rule case-insensitively', () => {
      expect(run({ sales: [lead({ journey: TEST_JOURNEY, email: 'QA@SoExcellence.com' })] })
        .totals.grossCount).toBe(0);
    });
    it('drops rejected sales whatever their journey', () => {
      expect(run({ sales: [lead({ status: 'Rejected' })] }).totals.grossCount).toBe(0);
      expect(run({ sales: [lead({ status: 'rejected' })] }).totals.grossCount).toBe(0);
    });
    it('keeps a sale with no status at all — blank is not rejected', () => {
      expect(run({ sales: [lead({ status: '' })] }).totals.grossCount).toBe(1);
    });
  });

  describe('JPU-21 gross counts every non-excluded sale whose purchase date is in the window', () => {
    it('counts an in-window sale and sums its value into GSV', () => {
      const r = run({ sales: [lead({ totalpurchasevalue: 2500 })] });
      expect(r.totals.grossCount).toBe(1);
      expect(r.totals.gsv).toBe(2500);
    });
    it('ignores a sale purchased before the window', () => {
      expect(run({ sales: [lead({ purchasedate: BEFORE_WINDOW })] }).totals.grossCount).toBe(0);
    });
    it('ignores a sale with no purchase date at all', () => {
      expect(run({ sales: [lead({ purchasedate: null })] }).totals.grossCount).toBe(0);
    });
    it('includes sales landing exactly on each window boundary', () => {
      const r = run({ sales: [lead({ purchasedate: WINDOW_START }), lead({ purchasedate: WINDOW_END })] });
      expect(r.totals.grossCount).toBe(2);
    });
    it('counts gross regardless of journeytype — upgrades and addons are still gross', () => {
      const r = run({ sales: [lead({ journeytype: 'upgrade' }), lead({ journeytype: 'addons' })] });
      expect(r.totals.grossCount).toBe(2);
    });
  });

  describe('JPU-22 assured is the subset of gross that carries a payment plan', () => {
    it('a sale with no payment plan is gross but not assured', () => {
      const r = run({ sales: [lead({ paymentplan: '' })] });
      expect(r.totals.grossCount).toBe(1);
      expect(r.totals.assuredCount).toBe(0);
      expect(r.totals.asv).toBe(0);
    });
    it('a sale with a payment plan counts in both', () => {
      const r = run({ sales: [lead({ paymentplan: '3-month', totalpurchasevalue: 900 })] });
      expect(r.totals.grossCount).toBe(1);
      expect(r.totals.gsv).toBe(900);
      expect(r.totals.assuredCount).toBe(1);
      expect(r.totals.asv).toBe(900);
    });
    it('ASV never exceeds GSV', () => {
      const r = run({ sales: [lead({ paymentplan: 'x' }), lead({ paymentplan: '' })] });
      expect(r.totals.asv).toBeLessThanOrEqual(r.totals.gsv);
    });
  });

  describe('JPU-23 the sale-type split is approved-only for gross, plan-only for assured', () => {
    // The two splits deliberately gate on different things. An unapproved sale still counts
    // toward gross totals but must not be attributed to a new/upgrade/addons bucket.
    it('an unapproved sale counts in gross but in no gross type bucket', () => {
      const r = run({ sales: [lead({ status: '', journeytype: 'new' })] });
      expect(r.totals.grossCount).toBe(1);
      expect(r.totals.newGrossCount).toBe(0);
    });
    it('an approved sale lands in the matching gross type bucket', () => {
      const r = run({ sales: [
        lead({ journeytype: 'new' }), lead({ journeytype: 'upgrade' }), lead({ journeytype: 'addons' }),
      ] });
      expect(r.totals.newGrossCount).toBe(1);
      expect(r.totals.upgradeGrossCount).toBe(1);
      expect(r.totals.addonsGrossCount).toBe(1);
    });
    it('the assured split does NOT require approval — only a plan', () => {
      const r = run({ sales: [lead({ status: '', journeytype: 'new', paymentplan: '6-month' })] });
      expect(r.totals.newGrossCount).toBe(0);    // not approved
      expect(r.totals.newAssuredCount).toBe(1);  // but has a plan
    });
  });

  describe('JPU-24 a cancellation needs all three of: type, in-window cancel date, approval', () => {
    const cancelled = (over: Partial<SaleLead> = {}) =>
      lead({ journeytype: 'cancelled', date: IN_WINDOW, purchasedate: null, ...over });

    it('counts a fully-qualified cancellation', () => {
      const r = run({ sales: [cancelled({ totalpurchasevalue: 400 })] });
      expect(r.totals.cancelledCount).toBe(1);
      expect(r.totals.cancelledValue).toBe(400);
    });
    it('does not count one that was never approved', () => {
      expect(run({ sales: [cancelled({ status: '' })] }).totals.cancelledCount).toBe(0);
    });
    it('does not count one whose cancel date falls outside the window', () => {
      expect(run({ sales: [cancelled({ date: BEFORE_WINDOW })] }).totals.cancelledCount).toBe(0);
    });
    it('does not count a non-cancelled sale that happens to carry a date', () => {
      expect(run({ sales: [cancelled({ journeytype: 'downgrade' })] }).totals.cancelledCount).toBe(0);
    });
    it('a sale can be both gross and cancelled when both dates land in the window', () => {
      // Bought and cancelled in the same month: it really did happen twice.
      const r = run({ sales: [lead({ journeytype: 'cancelled', purchasedate: IN_WINDOW, date: IN_WINDOW })] });
      expect(r.totals.grossCount).toBe(1);
      expect(r.totals.cancelledCount).toBe(1);
    });
  });

  describe('JPU-25 team resolution goes name -> profileid -> team', () => {
    const teams: SalesTeam[] = [{ id: 't1', team: 'North', members: ['p-harish'] }];

    it('groups a sale under its resolved team', () => {
      const r = run({
        sales: [lead({ salespersonname: 'Harish' })], teams, view: 'team',
        names: new Map([['Harish', 'p-harish']]),
      });
      expect(r.groups.map(g => g.group)).toEqual(['North']);
    });
    it('falls back to Unassigned when the name resolves to no profile', () => {
      const r = run({ sales: [lead({ salespersonname: 'Ghost' })], teams, view: 'team' });
      expect(r.groups.map(g => g.group)).toEqual(['Unassigned']);
    });
    it('falls back to Unassigned when the profile belongs to no team', () => {
      const r = run({
        sales: [lead({ salespersonname: 'Meena' })], teams, view: 'team',
        names: new Map([['Meena', 'p-meena']]), // resolved, but not a member of North
      });
      expect(r.groups.map(g => g.group)).toEqual(['Unassigned']);
    });
    it('groups by person, not team, in person view', () => {
      const r = run({
        sales: [lead({ salespersonname: 'Harish' })], teams, view: 'person',
        names: new Map([['Harish', 'p-harish']]),
      });
      expect(r.groups.map(g => g.group)).toEqual(['Harish']);
    });
  });

  describe('JPU-26 the source breakdown ignores the source filter', () => {
    // Otherwise selecting one source would collapse its own chart to a single bar —
    // a facet must not filter the breakdown it exists to populate.
    const sales = [lead({ source: 'web' }), lead({ source: 'referral' })];

    it('still shows every source when one source is selected', () => {
      const r = run({ sales, filters: { sources: ['web'], salespeople: [], team: '' } });
      expect(r.bySource.map(g => g.group).sort()).toEqual(['referral', 'web']);
    });
    it('but the headline totals DO honour the source filter', () => {
      const r = run({ sales, filters: { sources: ['web'], salespeople: [], team: '' } });
      expect(r.totals.grossCount).toBe(1);
    });
    it('the salesperson filter still narrows the source breakdown', () => {
      const r = run({
        sales: [lead({ source: 'web', salespersonname: 'A' }), lead({ source: 'referral', salespersonname: 'B' })],
        filters: { sources: [], salespeople: ['A'], team: '' },
      });
      expect(r.bySource.map(g => g.group)).toEqual(['web']);
    });
  });

  describe('JPU-27 sources are labelled for humans', () => {
    it('maps a source id to its configured name', () => {
      const r = run({ sales: [lead({ source: 'src_1' })], sources: new Map([['src_1', 'Website']]) });
      expect(r.bySource.map(g => g.group)).toEqual(['Website']);
    });
    it('falls back to the raw id when the source is not in the options list', () => {
      const r = run({ sales: [lead({ source: 'src_9' })] });
      expect(r.bySource.map(g => g.group)).toEqual(['src_9']);
    });
    it('labels an unset source as Unspecified rather than blank', () => {
      const r = run({ sales: [lead({ source: '' })] });
      expect(r.bySource.map(g => g.group)).toEqual(['Unspecified']);
    });
  });

  describe('JPU-28 the three product segments are always present, in a fixed order', () => {
    it('emits Ecosystem, DFU, FTO + Gift even when a segment has no sales', () => {
      const r = run({ sales: [lead({ category: 'Ecosystem' })] });
      expect(r.segments.map(s => s.group)).toEqual(['Ecosystem', 'DFU', 'FTO + Gift']);
      expect(r.segments[1].grossCount).toBe(0); // DFU present but empty, not missing
    });
    it('files an unrecognised category under Other, keeping it out of the three cards', () => {
      const r = run({ sales: [lead({ category: 'Mystery' })] });
      expect(r.segments.every(s => s.grossCount === 0)).toBe(true);
      expect(r.totals.grossCount).toBe(1); // still counted in the rollup
    });
    it('totals is the All rollup across every segment', () => {
      const r = run({ sales: [lead({ category: 'Ecosystem' }), lead({ category: 'DFU' })] });
      expect(r.totals.grossCount).toBe(2);
      expect(r.totals).toBe(r.allSegment);
    });
  });

  describe('JPU-29 groups are ranked by the metric currently on screen', () => {
    // Switching GSV/ASV must reorder the table, or the "top performer" is simply wrong.
    const sales = [
      lead({ salespersonname: 'BigGross', totalpurchasevalue: 5000, paymentplan: '' }),
      lead({ salespersonname: 'BigAssured', totalpurchasevalue: 3000, paymentplan: '12-month' }),
    ];
    it('ranks by GSV in the gsv view', () => {
      expect(run({ sales, metric: 'gsv' }).groups[0].group).toBe('BigGross');
    });
    it('ranks by ASV in the asv view', () => {
      expect(run({ sales, metric: 'asv' }).groups[0].group).toBe('BigAssured');
    });
  });

  describe('JPU-30 filter option lists are derived from the loaded data', () => {
    it('lists distinct salespeople from both the table and the chart data, sorted', () => {
      const r = run({
        sales: [lead({ salespersonname: 'Zoe' }), lead({ salespersonname: 'Amit' })],
        chartSales: [lead({ salespersonname: 'Amit' }), lead({ salespersonname: 'Bala' })],
      });
      expect(r.salespeople).toEqual(['Amit', 'Bala', 'Zoe']);
    });
    it('omits blank and whitespace-only values from the option lists', () => {
      const r = run({ sales: [lead({ source: '' }), lead({ source: '   ' }), lead({ source: 'web' })] });
      expect(r.sources).toEqual(['web']);
    });
    it('an empty filter array means "no narrowing", not "match nothing"', () => {
      const r = run({ sales: [lead(), lead()], filters: { sources: [], salespeople: [], team: '' } });
      expect(r.totals.grossCount).toBe(2);
    });
  });

  describe('JPU-31 the monthly chart always spans six buckets', () => {
    it('returns six months even with no data at all', () => {
      const r = run();
      expect(r.monthly.length).toBe(6);
      expect(r.monthly.every(m => m.salesCount === 0 && m.cancelledCount === 0)).toBe(true);
    });
    it('every bucket carries a human month label', () => {
      expect(run().monthly.every(m => /^[A-Z][a-z]{2} \d{4}$/.test(m.month))).toBe(true);
    });
    it('the chart honours the ASV rule — planless sales are excluded from the ASV series', () => {
      const thisMonth = new Date();
      const r = run({
        chartSales: [lead({ purchasedate: thisMonth, paymentplan: '' })],
        metric: 'asv',
      });
      expect(r.monthly.reduce((n, m) => n + m.salesCount, 0)).toBe(0);
    });
  });
});
