import { anyToDate, saleWindow, purchasesInWindow, watsonPurchaseRows, buildSaleBuyers, formatRupees, sortSaleBuyers, saleExportRows, saleBuyersInRange, saleBuyersTotal } from './watson-purchases';
import { createCsvContent } from './workshop-dashboard/workshop-dashboard.engine';

/** Sale Achieved (workshop dashboard, live workshops) — window and matching, without Watson. */
describe('watson-purchases — Sale Achieved window and matching', () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });

  it('reads Timestamps, local yyyy-mm-dd strings and rejects junk', () => {
    expect(anyToDate(ts('2026-04-01T10:00:00'))!.getDate()).toBe(1);
    const d = anyToDate('2026-06-10')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).withContext('local, not UTC').toEqual([2026, 5, 10]);
    expect(anyToDate('')).toBeNull();
    expect(anyToDate('not a date')).toBeNull();
  });

  it('runs from registration start to ONE MONTH after the workshop end, whole days', () => {
    const w = saleWindow('2026-04-01', ts('2026-06-15T18:00:00'))!;
    expect([w.start.getMonth(), w.start.getDate(), w.start.getHours()]).toEqual([3, 1, 0]);
    expect([w.end.getMonth(), w.end.getDate(), w.end.getHours(), w.end.getMinutes()]).withContext('15 Jun + 1 month = 15 Jul, end of day').toEqual([6, 15, 23, 59]);
    const clamp = saleWindow('2026-01-01', '2026-01-31')!;
    expect([clamp.end.getMonth(), clamp.end.getDate()]).withContext('31 Jan + 1 month = 28 Feb, not 3 Mar').toEqual([1, 28]);
    expect(saleWindow(null, '2026-01-31')).withContext('no registration start -> no window').toBeNull();
  });

  it('keeps purchases inside the window, both ends inclusive, and drops undated ones', () => {
    const w = saleWindow('2026-04-01', '2026-06-15')!;
    const rows = watsonPurchaseRows([
      { product: 'Before', fee: 1, purchasedate: '2026-03-31' },
      { product: 'First day', fee: 2, purchasedate: '2026-04-01' },
      { product: 'Last day', fee: 3, purchasedate: '2026-07-15' },
      { product: 'After', fee: 4, purchasedate: '2026-07-16' },
      { product: 'Undated', fee: 5 },
    ]);
    expect(purchasesInWindow(rows, w).map((r) => r.product)).toEqual(['First day', 'Last day']);
  });

  it('matches enrolled emails to EVERY Watson participant with that email, case-insensitively', () => {
    const w = saleWindow('2026-04-01', '2026-06-15')!;
    const emails = new Map([['pA', 'Arvind@Example.com'], ['pB', 'bala@example.com'], ['pC', 'chitra@example.com']]);
    const participants = [
      { id: 'w1', data: { id: 'W-1', email: 'arvind@example.com' } },
      { id: 'w2', data: { id: 'W-2', email: 'ARVIND@example.com' } },   // a duplicate Watson record, same person
      { id: 'w3', data: { id: 'W-3', email: 'bala@example.com' } },
      // chitra has no Watson participant at all
    ];
    const purchases = [
      { participantid: 'W-1', product: 'Business Accelerator', fee: 50000, purchasedate: '2026-04-01' },
      { participantid: 'W-2', product: 'Legacy Consultation', fee: 100000, purchasedate: '2026-06-10' },
      { participantid: 'W-1', product: 'Outside window', fee: 999, purchasedate: '2026-09-01' },
      { participantid: 'W-1', product: 'Cancelled', fee: 7777, purchasedate: '2026-05-01', cancelled: true },
      { participantid: 'W-3', product: 'Too early', fee: 20000, purchasedate: '2026-03-01' },
    ];
    const buyers = buildSaleBuyers(emails, participants, purchases, w);
    expect(buyers.map((b) => b.profileid)).withContext('bala bought only before the window; chitra is not in Watson').toEqual(['pA']);
    expect(buyers[0].rows.map((r) => r.product)).toEqual(['Business Accelerator', 'Legacy Consultation']);
    expect(buyers[0].total).toBe(150000);
  });

  it('orders buyers biggest first', () => {
    const w = saleWindow('2026-04-01', '2026-06-15')!;
    const buyers = buildSaleBuyers(
      new Map([['small', 's@x.com'], ['big', 'b@x.com']]),
      [{ id: 'a', data: { id: 'S', email: 's@x.com' } }, { id: 'b', data: { id: 'B', email: 'b@x.com' } }],
      [{ participantid: 'S', fee: 1000, purchasedate: '2026-05-01' }, { participantid: 'B', fee: 90000, purchasedate: '2026-05-01' }],
      w,
    );
    expect(buyers.map((b) => b.profileid)).toEqual(['big', 'small']);
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(20694876)).toBe('₹2,06,94,876');
    expect(formatRupees(250000)).toBe('₹2,50,000');
    expect(formatRupees(99999.6)).withContext('rounded to the rupee').toBe('₹1,00,000');
    expect(formatRupees(0)).toBe('₹0');
  });

  // ---- Sale Achieved panel: sort + export (operator 2026-10-14) ----
  const buyer = (name: string, total: number, last: string, purchases: any[]) =>
    ({ name, saleTotal: total, saleLastDate: new Date(last).getTime(), metadata: { email: name.toLowerCase() + '@x.com', phonenumber: '98400' }, salePurchases: purchases });
  const people = [
    buyer('Bala', 300000, '2026-05-01', []),
    buyer('Arvind', 50000, '2026-09-10', []),
    buyer('Chitra', 300000, '2026-06-01', []),
  ];

  it('sorts by amount (biggest first, ties by name) and by most recent purchase', () => {
    expect(sortSaleBuyers(people, 'amount').map((p) => p.name)).toEqual(['Bala', 'Chitra', 'Arvind']);
    expect(sortSaleBuyers(people, 'recent').map((p) => p.name)).toEqual(['Arvind', 'Chitra', 'Bala']);
    expect(people.map((p) => p.name)).withContext('input not mutated').toEqual(['Bala', 'Arvind', 'Chitra']);
  });

  it('exports one row per purchase with date, product and a numeric amount', () => {
    const rows = saleExportRows([
      buyer('Arvind', 150000, '2026-06-10', [
        { dateLabel: '1 Apr 2026', product: 'Business Accelerator', amount: 50000 },
        { dateLabel: '10 Jun 2026', product: 'Legacy Consultation', amount: 100000.4 },
      ]),
      buyer('Bala', 20000, '2026-05-01', [{ dateLabel: '1 May 2026', product: '', amount: 20000 }]),
    ]);
    expect(rows.length).withContext('2 + 1 purchases').toBe(3);
    expect(Object.keys(rows[0])).toEqual(['Participant Name', 'Email', 'Phone', 'Purchase Date', 'Product', 'Amount']);
    expect(rows[0]).toEqual({ 'Participant Name': 'Arvind', 'Email': 'arvind@x.com', 'Phone': '98400', 'Purchase Date': '1 Apr 2026', 'Product': 'Business Accelerator', 'Amount': 50000 });
    expect(rows[1]['Amount']).withContext('rounded to the rupee').toBe(100000);
    expect(rows[2]['Product']).withContext('no name -> empty cell').toBe('');
  });

  it('survives the CSV writer when a product name contains a comma', () => {
    const csv = createCsvContent(saleExportRows([buyer('Arvind', 1, '2026-01-01', [{ dateLabel: '1 Jan 2026', product: 'Scale, Grow', amount: 1 }])]));
    expect(csv.split('\n')[1]).toBe('Arvind,arvind@x.com,98400,1 Jan 2026,"Scale, Grow",1');
  });
  // ---- Sale Achieved panel: date range + total value (operator 2026-11-02) ----
  const bought = (y: number, m: number, d: number, amount: number, hh = 0) => ({ date: new Date(y, m - 1, d, hh), product: 'P', amount });
  const two = () => [
    { name: 'Arvind', saleTotal: 3000, salePurchases: [bought(2026, 4, 1, 1000), bought(2026, 4, 20, 2000, 23)] },
    { name: 'Bala', saleTotal: 500, salePurchases: [bought(2026, 3, 5, 500)] },
  ];

  it('keeps only purchases inside the range, whole days at both ends, and recomputes each total', () => {
    const out: any[] = saleBuyersInRange(two(), '2026-04-01', '2026-04-20');
    expect(out.map((b) => b.name)).withContext('Bala bought before the range -> dropped').toEqual(['Arvind']);
    expect(out[0].salePurchases.length).withContext('1 Apr 00:00 and 20 Apr 23:00 both count').toBe(2);
    const narrow: any[] = saleBuyersInRange(two(), '2026-04-02', '2026-04-30');
    expect(narrow[0].salePurchases.length).withContext('1 Apr left out').toBe(1);
    expect(narrow[0].saleTotal).toBe(2000);
    expect(narrow[0].saleTotalLabel).toBe('₹2,000');
    expect(narrow[0].saleLastDate).toBe(new Date(2026, 3, 20, 23).getTime());
  });

  it('treats a blank end as open, swaps a reversed pair, and leaves the list alone with no range', () => {
    const list = two();
    expect(saleBuyersInRange(list, '', '')).withContext('no range -> same list').toBe(list);
    expect(saleBuyersInRange(two(), '2026-04-10', '').map((b: any) => b.saleTotal)).withContext('open To').toEqual([2000]);
    expect(saleBuyersInRange(two(), '', '2026-03-31').map((b: any) => b.name)).withContext('open From').toEqual(['Bala']);
    expect(saleBuyersInRange(two(), '2026-04-30', '2026-04-01').map((b: any) => b.saleTotal)).withContext('reversed').toEqual([3000]);
    expect(saleBuyersInRange(two(), '2026-05-01', '2026-05-31')).withContext('nothing bought').toEqual([]);
    expect(list[0].salePurchases.length).withContext('input not mutated').toBe(2);
  });

  it('totals the buyers listed', () => {
    expect(saleBuyersTotal(two())).toBe(3500);
    expect(saleBuyersTotal([])).toBe(0);
    expect(formatRupees(saleBuyersTotal(saleBuyersInRange(two(), '2026-04-02', '')))).toBe('₹2,000');
  });
});

