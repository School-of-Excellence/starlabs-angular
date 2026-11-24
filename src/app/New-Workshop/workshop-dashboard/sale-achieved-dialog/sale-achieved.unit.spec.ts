import {
  buyerPhone, classifySalePurchases, csvTextCell, eiflixNewUserIds, emailBreakParts, exportPhoneParts, isEiflixNewBuyer,
  matchesSaleSearch, purchasesNewestFirst,
  saleDialogExportRows, saleDialogView, saleExportFileName, saleSectionsExportRows, saleSectionsView, saleTypeBuyers,
  saleWindowStartMs, toSaleRow, SaleTools, saleProductOptions, saleToolsNarrow,
} from './sale-achieved';
import { buildSaleBuyers, firstSaleMs, purchaseLabels, saleWindow } from '../../watson-purchases';

/**
 * Sale Achieved dialog (plan: specs/plans/2026-11-23-sale-achieved-dialog.md) — the list logic, without Watson.
 * Buyers are built the way the dashboard's loadSaleAchieved builds them: purchases labelled by purchaseLabels,
 * oldest first, with saleTotal / saleTotalLabel / saleLastDate.
 */
describe('Sale Achieved dialog — range, search, sort, totals and export rows', () => {
  const at = (y: number, m: number, d: number, hh = 10) => new Date(y, m - 1, d, hh);
  const buyer = (profileid: string, name: string, meta: any, rows: { date: Date; product: string; amount: number | null }[]) => {
    const purchases = rows.map(purchaseLabels);
    const total = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    return {
      profileid, name, metadata: meta,
      salePurchases: purchases,
      saleTotal: total,
      saleTotalLabel: '₹' + Math.round(total).toLocaleString('en-IN'),
      saleLastDate: Math.max(...rows.map((r) => r.date.getTime())),
    };
  };
  // Arvind: biggest total, bought early. Bala: one late purchase. Chitra: same total as Bala, earlier.
  const list = () => [
    buyer('pA', 'Arvind Kumar', { email: 'Arvind@Example.com', phonenumber: '9820000006', countrycode: '91' }, [
      { date: at(2026, 11, 8), product: 'Business Accelerator', amount: 50000 },
      { date: at(2026, 11, 20), product: 'Legacy Consultation', amount: 100000 },
    ]),
    buyer('pB', 'Bala', { email: 'bala@example.com', phonenumber: '98400 12345', countryCode: '+91' }, [
      { date: at(2026, 12, 15), product: 'Scale, Grow', amount: 20000 },
    ]),
    buyer('pC', 'Chitra', { email: 'chitra@example.com', phonenumber: '+44 7700 900123' }, [
      { date: at(2026, 11, 10), product: '', amount: 20000 },
    ]),
  ];
  const tools = (over: Partial<SaleTools> = {}): SaleTools => ({ from: '', to: '', query: '', sort: 'amount', ...over });

  it('leaves out a ₹0 buyer — not listed, not counted, overall or after the range (operator 2026-11-23)', () => {
    const zero = buyer('pZ', 'Zero Total', { email: 'zero@example.com' }, [
      { date: at(2026, 11, 12), product: 'Free Webinar', amount: 0 },
      { date: at(2026, 11, 13), product: 'Rounds to nothing', amount: 0.4 },
    ]);
    // Dina paid only in December; in a November range her purchases add up to ₹0, so she drops there.
    const dina = buyer('pD', 'Dina', { email: 'dina@example.com' }, [
      { date: at(2026, 11, 14), product: 'Free Webinar', amount: 0 },
      { date: at(2026, 12, 2), product: 'Mastermind', amount: 30000 },
    ]);
    const v = saleDialogView([...list(), zero, dina], tools());
    expect(v.rows.map((r) => r.name)).withContext('Zero Total is not listed').not.toContain('Zero Total');
    expect(v.count).toBe(4);
    expect(v.allCount).withContext('nor counted in the overall figure').toBe(4);
    expect(v.rows.map((r) => r.name)).withContext('a buyer with a ₹0 line but a paid total stays').toContain('Dina');
    const nov = saleDialogView([...list(), zero, dina], tools({ from: '2026-11-01', to: '2026-11-30' }));
    expect(nov.rows.map((r) => r.name)).withContext('in-range total ₹0 drops out').not.toContain('Dina');
    expect(nov.count).toBe(2);
    // A total that shows as ₹1 is a sale.
    const tiny = buyer('pT', 'Tiny', { email: 'tiny@example.com' }, [{ date: at(2026, 11, 15), product: 'Token', amount: 0.6 }]);
    expect(saleDialogView([tiny], tools()).count).withContext('₹0.6 shows as ₹1, so it counts').toBe(1);
  });

  it('shows everyone by default, biggest total first, with the shown total and count', () => {
    const v = saleDialogView(list(), tools());
    expect(v.rows.map((r) => r.name)).withContext('amount desc; Bala and Chitra tie -> by name').toEqual(['Arvind Kumar', 'Bala', 'Chitra']);
    expect(v.total).toBe(190000);
    expect(v.totalLabel).toBe('₹1,90,000');
    expect(v.count).toBe(3);
    expect([v.filtered, v.allTotalLabel, v.allCount]).withContext('nothing narrows it').toEqual([false, '₹1,90,000', 3]);
  });

  it('says when the figures are of a subset, and keeps the figures of every buyer', () => {
    const v = saleDialogView(list(), tools({ from: '2026-11-09', to: '2026-11-30' }));
    expect([v.filtered, v.totalLabel, v.count, v.allTotalLabel, v.allCount]).toEqual([true, '₹1,20,000', 2, '₹1,90,000', 3]);
    expect(saleDialogView(list(), tools({ query: 'nobody' }))).toEqual(jasmine.objectContaining({ filtered: true, count: 0, allCount: 3 }));
    expect(saleDialogView(list(), tools({ to: '2026-11-30' })).filtered).withContext('one end is enough').toBeTrue();
    expect(saleDialogView(list(), tools({ query: '   ' })).filtered).withContext('a blank search is no search').toBeFalse();
    expect(saleDialogView(list(), tools({ sort: 'recent' })).filtered).withContext('the sort does not narrow').toBeFalse();
    expect(saleDialogView(null as any, tools())).toEqual(jasmine.objectContaining({ count: 0, allCount: 0, allTotalLabel: '₹0' }));
  });

  it('sorts by most recent purchase, latest first', () => {
    const v = saleDialogView(list(), tools({ sort: 'recent' }));
    expect(v.rows.map((r) => r.name)).toEqual(['Bala', 'Arvind Kumar', 'Chitra']);
  });

  it('keeps a stable order for a full tie (same amount, same name)', () => {
    const twin = (id: string) => buyer(id, 'Same', { email: id + '@x.com' }, [{ date: at(2026, 11, 9), product: 'P', amount: 10 }]);
    const v = saleDialogView([twin('p1'), twin('p2'), twin('p3')], tools());
    expect(v.rows.map((r) => r.key)).toEqual(['p1', 'p2', 'p3']);
    expect(saleDialogView([twin('p1'), twin('p2'), twin('p3')], tools({ sort: 'recent' })).rows.map((r) => r.key)).toEqual(['p1', 'p2', 'p3']);
  });

  it('applies From / To to each purchase: buyers with none left drop out, totals follow', () => {
    const v = saleDialogView(list(), tools({ from: '2026-11-09', to: '2026-11-30' }));
    expect(v.rows.map((r) => r.name)).withContext('Bala bought in December -> out').toEqual(['Arvind Kumar', 'Chitra']);
    const arvind = v.rows[0];
    expect(arvind.count).withContext('8 Nov is before From').toBe(1);
    expect(arvind.totalLabel).toBe('₹1,00,000');
    expect(v.total).toBe(120000);
    expect(v.count).toBe(2);
    // Whole days at both ends, an open end, and nothing in range.
    expect(saleDialogView(list(), tools({ from: '2026-12-15' })).rows.map((r) => r.name)).toEqual(['Bala']);
    expect(saleDialogView(list(), tools({ to: '2026-11-08' })).rows.map((r) => r.count)).toEqual([1]);
    const none = saleDialogView(list(), tools({ from: '2027-01-01' }));
    expect([none.count, none.total, none.totalLabel]).toEqual([0, 0, '₹0']);
  });

  it('does not change the buyers it was given', () => {
    const input = list();
    saleDialogView(input, tools({ from: '2026-11-09', query: 'arvind', sort: 'recent' }));
    expect(input.map((b) => b.name)).toEqual(['Arvind Kumar', 'Bala', 'Chitra']);
    expect(input[0].salePurchases.length).toBe(2);
    expect(input[0].saleTotal).toBe(150000);
  });

  it('searches name and email, case-insensitively', () => {
    expect(saleDialogView(list(), tools({ query: 'ARVIND' })).rows.map((r) => r.name)).toEqual(['Arvind Kumar']);
    expect(saleDialogView(list(), tools({ query: 'kumar' })).rows.map((r) => r.name)).toEqual(['Arvind Kumar']);
    expect(saleDialogView(list(), tools({ query: 'BALA@EXAMPLE' })).rows.map((r) => r.name)).toEqual(['Bala']);
    expect(saleDialogView(list(), tools({ query: '@example.com' })).count).toBe(3);
    expect(saleDialogView(list(), tools({ query: '   ' })).count).withContext('blank query keeps everyone').toBe(3);
    expect(saleDialogView(list(), tools({ query: 'nobody' })).count).toBe(0);
  });

  it('searches phone digits, ignoring spaces and "+"', () => {
    const names = (q: string) => saleDialogView(list(), tools({ query: q })).rows.map((r) => r.name);
    expect(names('9820000006')).toEqual(['Arvind Kumar']);
    expect(names('+91 98200')).withContext('dial code + spaces').toEqual(['Arvind Kumar']);
    expect(names('9840012345')).withContext('stored with a space').toEqual(['Bala']);
    expect(names('98400 123')).toEqual(['Bala']);
    expect(names('+447700')).toEqual(['Chitra']);
    expect(names('91')).withContext('the dial code alone matches both +91 numbers').toEqual(['Arvind Kumar', 'Bala']);
    expect(matchesSaleSearch({ name: 'X', metadata: {} }, '98')).withContext('no phone -> no digit match').toBe(false);
  });

  it('search and range combine, and the total is of the buyers shown', () => {
    const v = saleDialogView(list(), tools({ query: 'example.com', from: '2026-11-09', to: '2026-11-30', sort: 'recent' }));
    expect(v.rows.map((r) => r.name)).toEqual(['Arvind Kumar', 'Chitra']);
    expect(v.totalLabel).toBe('₹1,20,000');
  });

  it('shows the phone with its dial code, once', () => {
    expect(buyerPhone({ metadata: { phonenumber: '9820000006', countrycode: '91' } })).toBe('+91\u00a09820000006');
    expect(buyerPhone({ metadata: { phonenumber: '9820000006', countryCode: '+91' } })).toBe('+91\u00a09820000006');
    expect(buyerPhone({ metadata: { phonenumber: '+91 9820000006', countrycode: '91' } })).toBe('+91 9820000006');
    expect(buyerPhone({ metadata: { phonenumber: '9820000006' } })).toBe('9820000006');
    expect(buyerPhone({ metadata: { countrycode: '91' } })).withContext('no number -> nothing').toBe('');
    expect(buyerPhone({})).toBe('');
  });

  it('builds a row per buyer: contact, count, total, latest date, purchases newest first', () => {
    const row = toSaleRow(list()[0]);
    expect(row.key).toBe('pA');
    expect(row.email).toBe('Arvind@Example.com');
    expect(row.emailParts).toEqual(['Arvind', '@Example', '.com']);
    expect(row.phone).toBe('+91\u00a09820000006');
    expect(row.count).toBe(2);
    expect(row.totalLabel).toBe('₹1,50,000');
    expect(row.latestLabel).toBe('20 Nov 2026');
    expect(row.purchases.map((p) => p.product)).toEqual(['Legacy Consultation', 'Business Accelerator']);
    expect(row.purchases[0]).toEqual({ dateLabel: '20 Nov 2026', product: 'Legacy Consultation', amountLabel: '₹1,00,000' });
    const blank = toSaleRow({ profileid: 'pX', name: '', metadata: undefined, salePurchases: [{ date: at(2026, 11, 9), product: '', amount: null, dateLabel: '9 Nov 2026', amountLabel: '—' }] });
    expect([blank.name, blank.email, blank.phone, blank.totalLabel]).toEqual(['Unknown', '', '', '₹0']);
    expect(blank.emailParts).toEqual([]);
    expect(blank.purchases[0]).toEqual({ dateLabel: '9 Nov 2026', product: '', amountLabel: '—' });
  });

  it('cuts an email before each "@" and "." so it wraps there, and joins back to the same text', () => {
    const e = 'priya.raghunathan.krishnamurthy.official.account@gmail.com';
    expect(emailBreakParts(e)).toEqual(['priya', '.raghunathan', '.krishnamurthy', '.official', '.account', '@gmail', '.com']);
    expect(emailBreakParts(e).join('')).toBe(e);
    expect(emailBreakParts('  solo  ')).toEqual(['solo']);
    expect(emailBreakParts('')).toEqual([]);
    expect(emailBreakParts(undefined as any)).toEqual([]);
  });

  it('orders purchases newest first without touching the stored order', () => {
    const b = list()[0];
    expect(purchasesNewestFirst(b).map((p: any) => p.product)).toEqual(['Legacy Consultation', 'Business Accelerator']);
    expect(b.salePurchases.map((p: any) => p.product)).toEqual(['Business Accelerator', 'Legacy Consultation']);
  });

  it('exports one row per purchase of the buyers shown, with name, email, dial code, phone, date, product and amount', () => {
    const shown = saleDialogView(list(), tools({ from: '2026-11-01', to: '2026-11-30' })).buyers;
    const rows = saleDialogExportRows(shown);
    expect(rows.length).withContext('Arvind 2 + Chitra 1; Bala is outside the range').toBe(3);
    expect(Object.keys(rows[0])).toEqual(['Participant Name', 'Email', 'Country Code', 'Phone', 'Purchase Date', 'Product', 'Amount']);
    expect(rows[0]).toEqual({
      'Participant Name': 'Arvind Kumar', 'Email': 'Arvind@Example.com', 'Country Code': '91', 'Phone': '9820000006',
      'Purchase Date': '8 Nov 2026', 'Product': 'Business Accelerator', 'Amount': 50000,
    });
    expect(rows[2]['Participant Name']).toBe('Chitra');
    expect([rows[2]['Country Code'], rows[2]['Phone']]).withContext('a number stored with its dial code is split').toEqual(['44', '7700 900123']);
    // No cell may start with a formula character — a spreadsheet would evaluate it ("+91 98…" -> #NULL!).
    for (const r of rows) for (const v of Object.values(r)) expect(String(v)).not.toMatch(/^[=+\-@]/);
    expect(saleDialogExportRows([])).toEqual([]);
    expect(saleDialogExportRows(null as any)).toEqual([]);
    // The buyers handed in are not changed.
    expect(shown[0].metadata.phonenumber).toBe('9820000006');
  });

  it('splits the phone into a dial code and a number that never starts with "+"', () => {
    const parts = (meta: any) => exportPhoneParts({ metadata: meta });
    expect(parts({ phonenumber: '9820000006', countrycode: '91' })).toEqual({ code: '91', number: '9820000006' });
    expect(parts({ phonenumber: '98400 12345', countryCode: '+91' })).withContext('"+91" -> digits').toEqual({ code: '91', number: '98400 12345' });
    expect(parts({ phonenumber: '+44 7700 900123' })).toEqual({ code: '44', number: '7700 900123' });
    expect(parts({ phonenumber: '+1-415-555-0100', countrycode: '91' })).withContext("the number's own dial code wins").toEqual({ code: '1', number: '415-555-0100' });
    expect(parts({ phonenumber: '+919820000006', countrycode: '91' })).withContext('no separator, known code').toEqual({ code: '91', number: '9820000006' });
    expect(parts({ phonenumber: '+919820000006' })).withContext('no separator, unknown code: the + goes').toEqual({ code: '', number: '919820000006' });
    expect(parts({ phonenumber: '9820000006' })).toEqual({ code: '', number: '9820000006' });
    expect(parts({ countrycode: '91' })).withContext('no number -> nothing').toEqual({ code: '', number: '' });
    expect(exportPhoneParts({})).toEqual({ code: '', number: '' });
  });

  it('exports only what the search leaves', () => {
    const shown = saleDialogView(list(), tools({ query: 'bala' })).buyers;
    expect(saleDialogExportRows(shown).map((r) => r['Product'])).toEqual(['Scale, Grow']);
  });

  it("keeps the side panel's file name (the UTC day, as before)", () => {
    const now = new Date(Date.UTC(2026, 10, 23, 8, 30));
    expect(saleExportFileName('Legacy Live', now)).toBe('workshop-sale-achieved-Legacy Live-2026-11-23.csv');
    expect(saleExportFileName('', now)).toBe('workshop-sale-achieved-workshop-2026-11-23.csv');
  });

  it('keeps a text cell that starts like a formula as text, and readable', () => {
    expect(csvTextCell('=HYPERLINK("http://x","y")')).toBe('\'=HYPERLINK("http://x","y")');
    expect(csvTextCell('+91 9820000006')).toBe("'+91 9820000006");
    expect(csvTextCell('-50% Early bird')).toBe("'-50% Early bird");
    expect(csvTextCell('@home.in')).toBe("'@home.in");
    expect(csvTextCell('\t=1+1')).toBe("'\t=1+1");
    expect(csvTextCell('Arvind Kumar')).toBe('Arvind Kumar');
    expect(csvTextCell('')).toBe('');
    expect(csvTextCell(-500)).withContext('numbers stay numbers').toBe(-500);
    expect(csvTextCell(50000)).toBe(50000);

    const hostile = [{
      profileid: 'pH', name: '=cmd|"/c calc"!A1', metadata: { email: '@evil.example', phonenumber: '-', countrycode: '91' },
      salePurchases: [{ date: at(2026, 11, 9), product: '+Bonus seat', amount: 100, dateLabel: '9 Nov 2026', amountLabel: '₹100' }],
      saleTotal: 100,
    }];
    const [r] = saleDialogExportRows(hostile);
    expect(r['Participant Name']).toBe('\'=cmd|"/c calc"!A1');
    expect(r['Email']).toBe("'@evil.example");
    expect(r['Phone']).toBe("'-");
    expect(r['Product']).toBe("'+Bonus seat");
    expect(r['Amount']).toBe(100);
    for (const v of Object.values(r)) expect(String(v)).not.toMatch(/^[=+\-@\t\r]/);
  });
});

/**
 * New Sales / Funnel Sales / Upgrades (plan: specs/plans/2026-11-23-sale-achieved-dialog.md, last section).
 * "1st sale" = the person's first PAID, DATED purchase EVER. Inside the window: their first sale -> New; after a first
 * sale that is itself inside the window -> Funnel; after a first sale before the window -> Upgrade.
 * The window here starts on 7 Nov 2026 (the dialog's `min`).
 */
describe('Sale Achieved dialog — New Sales, Funnel Sales and Upgrades', () => {
  const at = (y: number, m: number, d: number, hh = 10, mm = 0) => new Date(y, m - 1, d, hh, mm);
  const MIN = '2026-11-07';
  const START = saleWindowStartMs(MIN);
  /** A buyer as loadSaleAchieved builds it: the window's purchases (labelled, oldest first) + their first sale ever. */
  const buyer = (profileid: string, name: string, firstPaid: Date | null, rows: { date: Date; product: string; amount: number | null }[]) => {
    const total = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    return {
      profileid, name, metadata: { email: profileid + '@example.com', phonenumber: '982000000' + profileid.slice(-1), countrycode: '91' },
      salePurchases: rows.map(purchaseLabels), saleTotal: total, saleTotalLabel: '₹' + Math.round(total).toLocaleString('en-IN'),
      saleLastDate: Math.max(...rows.map((r) => r.date.getTime())),
      saleFirstPaidMs: firstPaid ? firstPaid.getTime() : null,
    };
  };
  const tools = (over: Partial<SaleTools> = {}): SaleTools => ({ from: '', to: '', query: '', sort: 'amount', ...over });
  const products = (list: any[]) => list.map((b) => `${b.name}: ${b.salePurchases.map((p: any) => p.product).join(', ')}`);

  // Neha: first purchase ever on 10 Nov (inside), then two more. Om: customer since 2025. Priya: one purchase, her first.
  const world = () => [
    buyer('pN1', 'Neha', at(2026, 11, 10), [
      { date: at(2026, 11, 10), product: 'Workshop Seat', amount: 5000 },
      { date: at(2026, 11, 25), product: 'Business Accelerator', amount: 50000 },
      { date: at(2026, 12, 20), product: 'Mastermind', amount: 100000 },
    ]),
    buyer('pO2', 'Om', at(2025, 3, 1), [
      { date: at(2026, 11, 12), product: 'Legacy Consultation', amount: 75000 },
    ]),
    buyer('pP3', 'Priya', at(2026, 11, 8), [
      { date: at(2026, 11, 8), product: 'Workshop Seat', amount: 5000 },
    ]),
  ];

  // ---------- Filters (operator 2026-11-23): product, buyer type, amount per purchase, repeat buyers ----------
  it('Product filter: only the picked products count; totals follow; the choices are the paid products A→Z', () => {
    expect(saleProductOptions(world())).toEqual(['Business Accelerator', 'Legacy Consultation', 'Mastermind', 'Workshop Seat']);
    const v = saleSectionsView(world(), tools({ products: ['Workshop Seat', 'Mastermind'] }), START);
    expect(products(v.new.buyers)).toEqual(['Neha: Workshop Seat', 'Priya: Workshop Seat']);
    expect(products(v.funnel.buyers)).withContext('Business Accelerator is not picked').toEqual(['Neha: Mastermind']);
    expect(v.upgrade.count).withContext("Om's only purchase is not picked").toBe(0);
    expect(v.funnel.rows[0].totalLabel).toBe('₹1,00,000');
    expect(v.filtered).toBeTrue();
    expect(v.count).withContext('unique buyers shown').toBe(2);
  });

  it('Amount filter: per purchase, min..max inclusive (a reversed pair is swapped); open ends allowed', () => {
    const mid = saleSectionsView(world(), tools({ minAmount: 50000, maxAmount: 75000 }), START);
    expect(products(mid.funnel.buyers)).toEqual(['Neha: Business Accelerator']);
    expect(products(mid.upgrade.buyers)).toEqual(['Om: Legacy Consultation']);
    expect(mid.new.count).toBe(0);
    const swapped = saleSectionsView(world(), tools({ minAmount: 75000, maxAmount: 50000 }), START);
    expect(swapped.count).toBe(mid.count);
    const big = saleSectionsView(world(), tools({ minAmount: 100000 }), START);
    expect(products(big.funnel.buyers)).withContext('open max').toEqual(['Neha: Mastermind']);
    expect(big.count).toBe(1);
  });

  it('Buyer type: EiFlix New User only, or the others (a new_user_data doc, moved to existing or not)', () => {
    const ids = new Set(['pP3']);
    const eiflix = saleSectionsView(world(), tools({ buyerType: 'eiflix' }), START, ids);
    expect(eiflix.sections.flatMap((s) => s.rows.map((r) => r.name))).toEqual(['Priya']);
    const others = saleSectionsView(world(), tools({ buyerType: 'others' }), START, ids);
    expect([...new Set(others.sections.flatMap((s) => s.rows.map((r) => r.name)))].sort()).toEqual(['Neha', 'Om']);
    expect(saleSectionsView(world(), tools({ buyerType: 'all' }), START, ids).count).toBe(3);
  });

  it('Repeat buyers: 2+ paid purchases in the window, counted across the three sections', () => {
    const v = saleSectionsView(world(), tools({ repeatOnly: true }), START);
    expect(products(v.new.buyers)).withContext("Neha's first purchase stays: she is a repeat buyer overall").toEqual(['Neha: Workshop Seat']);
    expect(products(v.funnel.buyers)).toEqual(['Neha: Business Accelerator, Mastermind']);
    expect(v.upgrade.count).withContext('Om bought once').toBe(0);
    expect(v.count).toBe(1);
  });

  it('every filter is part of "filtered"; the sort is not', () => {
    expect(saleToolsNarrow(tools())).toBeFalse();
    expect(saleToolsNarrow(tools({ sort: 'recent' }))).toBeFalse();
    for (const over of [{ products: ['X'] }, { buyerType: 'eiflix' as const }, { minAmount: 1 }, { maxAmount: 0 }, { repeatOnly: true }]) {
      expect(saleToolsNarrow(tools(over))).withContext(JSON.stringify(over)).toBeTrue();
    }
  });

  it("reads the window's first moment from the dialog's min (local midnight, as saleWindow starts it)", () => {
    expect(START).toBe(new Date(2026, 10, 7).getTime());
    expect(START).toBe(saleWindow('2026-11-07', '2026-11-20')!.start.getTime());
    expect(saleWindowStartMs('')).toBeNull();
  });

  it('first sale ever: the earliest PAID, DATED purchase — ₹0 lines, unknown amounts and undated purchases do not count', () => {
    expect(firstSaleMs([
      { date: null, product: 'Undated', amount: 90000 },
      { date: at(2025, 1, 5), product: 'Free Webinar', amount: 0 },
      { date: at(2025, 2, 5), product: 'Rounds to nothing', amount: 0.4 },
      { date: at(2025, 3, 5), product: 'Unknown fee', amount: null },
      { date: at(2025, 6, 5), product: 'Paid', amount: 1000 },
      { date: at(2025, 4, 5), product: 'Paid, earlier', amount: 0.6 },
    ] as any)).withContext('₹0.6 shows as ₹1 -> paid').toBe(at(2025, 4, 5).getTime());
    expect(firstSaleMs([{ date: at(2025, 1, 5), amount: 0 }, { date: null, amount: 500 }])).withContext('nothing paid and dated').toBeNull();
    expect(firstSaleMs([])).toBeNull();
    expect(firstSaleMs(null as any)).toBeNull();
  });

  it("buildSaleBuyers carries each person's first sale from their WHOLE history (no date filter, no extra read)", () => {
    const win = saleWindow('2026-11-07', '2026-12-06')!;
    const emails = new Map([['pOld', 'old@x.com'], ['pNew', 'new@x.com'], ['pFree', 'free@x.com']]);
    const participants = [
      { id: 'w1', data: { id: 'w1', email: 'old@x.com' } }, { id: 'w2', data: { id: 'w2', email: 'old@x.com' } },
      { id: 'w3', data: { id: 'w3', email: 'new@x.com' } }, { id: 'w4', data: { id: 'w4', email: 'free@x.com' } },
    ];
    const purchases = [
      // Old: bought in 2025 under a SECOND Watson participant with the same email -> still their first sale.
      { participantid: 'w2', purchasedate: '2025-05-01', fee: 20000, product: 'Earlier course' },
      { participantid: 'w1', purchasedate: '2026-11-15', fee: 60000, product: 'Upgrade' },
      // New: an undated paid purchase and a cancelled earlier one are ignored; the first sale is inside the window.
      { participantid: 'w3', fee: 99000, product: 'No date' },
      { participantid: 'w3', purchasedate: '2025-01-01', fee: 9000, product: 'Cancelled', cancelled: true },
      { participantid: 'w3', purchasedate: '2026-11-20', fee: 5000, product: 'Seat' },
      // Free: a ₹0 purchase in 2025 is not a sale, so their first sale is the window's.
      { participantid: 'w4', purchasedate: '2025-02-01', fee: 0, product: 'Free Webinar' },
      { participantid: 'w4', purchasedate: '2026-11-21', fee: 7000, product: 'Seat' },
    ];
    const by = new Map(buildSaleBuyers(emails, participants, purchases, win).map((b) => [b.profileid, b]));
    expect(by.get('pOld')!.firstPaidMs).toBe(new Date(2025, 4, 1).getTime());
    expect(by.get('pOld')!.rows.map((r) => r.product)).withContext('the window rows are unchanged').toEqual(['Upgrade']);
    expect(by.get('pNew')!.firstPaidMs).toBe(new Date(2026, 10, 20).getTime());
    expect(by.get('pFree')!.firstPaidMs).toBe(new Date(2026, 10, 21).getTime());

    // Only purchases on or after the day they enrolled in THIS workshop (operator 2026-11-23). pNew enrolled on
    // 20 Nov at 6 pm: the 20 Nov purchase (enrolment DAY) stays; pFree enrolled 22 Nov, after their only
    // in-window purchase, so they drop out. Without an enrolment date (pOld) nothing is dropped.
    const enrolled = new Map([['pNew', new Date(2026, 10, 20, 18).getTime()], ['pFree', new Date(2026, 10, 22).getTime()]]);
    const after = new Map(buildSaleBuyers(emails, participants, purchases, win, enrolled).map((b) => [b.profileid, b]));
    expect(after.get('pNew')!.rows.map((r) => r.product)).withContext('a purchase on the enrolment day counts').toEqual(['Seat']);
    expect(after.has('pFree')).withContext('bought before enrolling -> not this workshop\'s sale').toBeFalse();
    expect(after.get('pOld')!.rows.map((r) => r.product)).withContext('no enrolment date -> nothing dropped').toEqual(['Upgrade']);
    expect(after.get('pNew')!.firstPaidMs).withContext('the first sale still comes from the whole history').toBe(new Date(2026, 10, 20).getTime());
  });

  it('first sale ever inside the window -> New Sales; their later purchases -> Funnel Sales (the person is in both)', () => {
    const v = saleSectionsView(world(), tools(), START);
    expect(products(v.new.buyers)).toEqual(['Neha: Workshop Seat', 'Priya: Workshop Seat']);
    expect(products(v.funnel.buyers)).toEqual(['Neha: Business Accelerator, Mastermind']);
    expect(products(v.upgrade.buyers)).toEqual(['Om: Legacy Consultation']);
    expect(v.funnel.rows[0]).toEqual(jasmine.objectContaining({ name: 'Neha', count: 2, totalLabel: '₹1,50,000', latestLabel: '20 Dec 2026' }));
    expect([v.new.totalLabel, v.new.count, v.funnel.totalLabel, v.funnel.count, v.upgrade.totalLabel, v.upgrade.count])
      .toEqual(['₹10,000', 2, '₹1,50,000', 1, '₹75,000', 1]);
    expect(v.sections.map((s) => s.title)).toEqual(['New Sales', 'Funnel Sales', 'Upgrades']);
  });

  it('first sale ever before the window -> every purchase in the window is an Upgrade', () => {
    const om = buyer('pO2', 'Om', at(2025, 3, 1), [
      { date: at(2026, 11, 12), product: 'Legacy Consultation', amount: 75000 },
      { date: at(2026, 11, 30), product: 'Mastermind', amount: 100000 },
    ]);
    const split = classifySalePurchases(om.salePurchases, om.saleFirstPaidMs, START);
    expect([split.new.length, split.funnel.length]).toEqual([0, 0]);
    expect(split.upgrade.map((p: any) => p.product)).toEqual(['Legacy Consultation', 'Mastermind']);
    // The day before the window still counts as before it.
    const eve = classifySalePurchases(om.salePurchases, at(2026, 11, 6, 23, 59).getTime(), START);
    expect(eve.upgrade.length).withContext('first sale 6 Nov 23:59 is before a window starting 7 Nov').toBe(2);
    const onStart = classifySalePurchases(om.salePurchases, new Date(2026, 10, 7).getTime(), START);
    expect(onStart.funnel.length).withContext('first sale at the window start is inside it').toBe(2);
  });

  it('purchases at the same first moment (one checkout) are ALL the first sale -> all New; later ones Funnel', () => {
    const t = at(2026, 11, 9, 14, 30);
    const b = buyer('pR4', 'Ravi', t, [
      { date: t, product: 'Workshop Seat', amount: 5000 },
      { date: new Date(t.getTime()), product: 'Workbook', amount: 1500 },
      { date: at(2026, 11, 9, 14, 31), product: 'Coaching', amount: 20000 },
    ]);
    const split = classifySalePurchases(b.salePurchases, b.saleFirstPaidMs, START);
    expect(split.new.map((p: any) => p.product)).toEqual(['Workshop Seat', 'Workbook']);
    expect(split.funnel.map((p: any) => p.product)).withContext('a minute later is after the first sale').toEqual(['Coaching']);
  });

  it('leaves ₹0 lines out of every section, and drops a section copy that totals ₹0', () => {
    const b = buyer('pS5', 'Sita', at(2025, 1, 1), [
      { date: at(2026, 11, 9), product: 'Free Webinar', amount: 0 },
      { date: at(2026, 11, 10), product: 'Unknown fee', amount: null },
      { date: at(2026, 11, 11), product: 'Coaching', amount: 20000 },
    ]);
    const v = saleSectionsView([b], tools(), START);
    expect(products(v.upgrade.buyers)).toEqual(['Sita: Coaching']);
    expect(v.upgrade.totalLabel).toBe('₹20,000');
    // Only ₹0 lines -> in no section at all, and not counted.
    const free = buyer('pF6', 'Free Only', at(2026, 11, 9), [{ date: at(2026, 11, 9), product: 'Free Webinar', amount: 0 }]);
    const v2 = saleSectionsView([free], tools(), START);
    expect([v2.new.count, v2.funnel.count, v2.upgrade.count, v2.count, v2.allCount]).toEqual([0, 0, 0, 0, 0]);
  });

  it('a ₹0 line or an undated purchase never decides the first sale', () => {
    // No first-sale moment carried (an older buyer shape): the earliest PAID window line is taken, not the ₹0 one.
    const b = buyer('pT7', 'Tara', null, [
      { date: at(2026, 11, 8), product: 'Free Webinar', amount: 0 },
      { date: at(2026, 11, 12), product: 'Workshop Seat', amount: 5000 },
      { date: at(2026, 11, 20), product: 'Coaching', amount: 20000 },
    ]);
    const split = classifySalePurchases(b.salePurchases, b.saleFirstPaidMs, START);
    expect(split.new.map((p: any) => p.product)).toEqual(['Workshop Seat']);
    expect(split.funnel.map((p: any) => p.product)).toEqual(['Coaching']);
    // An undated purchase line is not placed anywhere.
    const undated = classifySalePurchases([{ date: null, amount: 9000 } as any, ...b.salePurchases], b.saleFirstPaidMs, START);
    expect(undated.new.length + undated.funnel.length + undated.upgrade.length).toBe(2);
    // A carried first sale LATER than a paid window line cannot be right — the window line is the earlier sale.
    const late = classifySalePurchases(b.salePurchases, at(2026, 12, 1).getTime(), START);
    expect(late.new.map((p: any) => p.product)).toEqual(['Workshop Seat']);
  });

  it("the From / To range picks the purchases shown — it never changes a purchase's type", () => {
    // From 20 Nov: Neha's first sale (10 Nov) is out of range, but her later purchases stay Funnel, not New.
    const v = saleSectionsView(world(), tools({ from: '2026-11-20' }), START);
    expect(products(v.new.buyers)).withContext('nobody bought a first sale on or after 20 Nov').toEqual([]);
    expect(products(v.funnel.buyers)).toEqual(['Neha: Business Accelerator, Mastermind']);
    expect(products(v.upgrade.buyers)).withContext("Om's 12 Nov purchase is before From").toEqual([]);
    expect([v.new.count, v.new.allCount]).withContext('empty by the range, not by nature -> "No match"').toEqual([0, 2]);
    const dec = saleSectionsView(world(), tools({ from: '2026-12-01', to: '2026-12-31' }), START);
    expect(products(dec.funnel.buyers)).toEqual(['Neha: Mastermind']);
    expect([dec.total, dec.count]).toEqual([100000, 1]);
  });

  it('counts each buyer ONCE overall (unique), while each section counts its own; totals add up', () => {
    const v = saleSectionsView(world(), tools(), START);
    expect([v.new.count, v.funnel.count, v.upgrade.count]).toEqual([2, 1, 1]);
    expect(v.count).withContext('Neha is in New and Funnel: 3 people, not 4').toBe(3);
    expect(v.allCount).toBe(3);
    expect(v.total).toBe(10000 + 150000 + 75000);
    expect([v.totalLabel, v.allTotalLabel, v.filtered]).toEqual(['₹2,35,000', '₹2,35,000', false]);
    const neha = saleSectionsView(world(), tools({ query: 'neha' }), START);
    expect([neha.count, neha.allCount, neha.filtered, neha.new.count, neha.funnel.count, neha.upgrade.count]).toEqual([1, 3, true, 1, 1, 0]);
  });

  it('search and sort are shared by the three sections', () => {
    const recent = saleSectionsView(world(), tools({ sort: 'recent' }), START);
    expect(recent.new.rows.map((r) => r.name)).withContext('Neha 10 Nov is after Priya 8 Nov').toEqual(['Neha', 'Priya']);
    const amount = saleSectionsView(world(), tools(), START);
    expect(amount.new.rows.map((r) => r.name)).withContext('5,000 each -> by name').toEqual(['Neha', 'Priya']);
    const byPhone = saleSectionsView(world(), tools({ query: '9820000002' }), START);
    expect([byPhone.new.count, byPhone.funnel.count, byPhone.upgrade.count]).withContext("Om's phone").toEqual([0, 0, 1]);
  });

  it('does not change the buyers it was given', () => {
    const input = world();
    saleSectionsView(input, tools({ from: '2026-11-20', query: 'neha' }), START);
    saleTypeBuyers(input, START);
    expect(input[0].salePurchases.length).toBe(3);
    expect(input[0].saleTotal).toBe(155000);
    expect((input[0] as any).saleType).toBeUndefined();
  });

  it('exports one row per purchase shown, section by section, with a "Type" column first', () => {
    const rows = saleSectionsExportRows(saleSectionsView(world(), tools(), START));
    expect(Object.keys(rows[0])).toEqual(['Type', 'Participant Name', 'Email', 'Country Code', 'Phone', 'Purchase Date', 'Product', 'Amount']);
    expect(rows.map((r) => `${r['Type']} | ${r['Participant Name']} | ${r['Product']}`)).toEqual([
      'New Sale | Neha | Workshop Seat',
      'New Sale | Priya | Workshop Seat',
      'Funnel | Neha | Business Accelerator',
      'Funnel | Neha | Mastermind',
      'Upgrade | Om | Legacy Consultation',
    ]);
    expect(rows[4]['Amount']).toBe(75000);
    const dec = saleSectionsExportRows(saleSectionsView(world(), tools({ from: '2026-12-01' }), START));
    expect(dec.map((r) => r['Type'] + ' ' + r['Product'])).withContext('the range keeps the type').toEqual(['Funnel Mastermind']);
    expect(saleSectionsExportRows(saleSectionsView([], tools(), START))).toEqual([]);
  });

  // "EiFlix New User" (operator 2026-11-23): a buyer whose profileid has a new_user_data doc — whatever its
  // movedtoexist (absent, false or true) — gets the chip in the dialog. Only a row flag: nothing else changes.
  // The map is shaped as readNewUserData loads it (profileid -> doc).
  const newUserData = () => ({
    pN1: { name: 'Neha', email: 'pN1@example.com' },                 // movedtoexist absent
    pO2: { name: 'Om', email: 'pO2@example.com', movedtoexist: true }, // moved to existing — still the chip here
    pX9: { name: 'Not a buyer', movedtoexist: false },
  });

  it('EiFlix New User: every new_user_data id counts — movedtoexist absent, false or true', () => {
    const ids = eiflixNewUserIds({ a: {}, b: { movedtoexist: false }, c: { movedtoexist: true }, d: { movedtoexist: 'yes' } });
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(eiflixNewUserIds(null).size).toBe(0);
    expect(eiflixNewUserIds(undefined).size).toBe(0);
    expect(eiflixNewUserIds({}).size).toBe(0);
    const absent = { profileid: 'a' }, notMoved = { profileid: 'b' }, moved = { profileid: 'c' };
    for (const b of [absent, notMoved, moved]) expect(isEiflixNewBuyer(b, ids)).withContext(b.profileid).toBeTrue();
    expect(isEiflixNewBuyer({ profileid: 'zz' }, ids)).withContext('no new_user_data doc').toBeFalse();
    expect(isEiflixNewBuyer({ name: 'No id' }, ids)).withContext('no profileid').toBeFalse();
    expect(isEiflixNewBuyer({ profileid: 'a' }, null)).withContext('ids not loaded yet').toBeFalse();
    expect(toSaleRow({ profileid: 'c', name: 'Moved' }, ids).eiflixNew).toBeTrue();
    expect(toSaleRow({ profileid: 'zz', name: 'Other' }, ids).eiflixNew).toBeFalse();
    expect(toSaleRow({ profileid: 'c', name: 'Moved' }).eiflixNew).withContext('no ids given').toBeFalse();
  });

  it('EiFlix New User: the flag is on the person\'s row in EVERY section they are in; others never carry it', () => {
    const v = saleSectionsView(world(), tools(), START, eiflixNewUserIds(newUserData()));
    const flags = (rows: any[]) => rows.map((r) => `${r.name}:${r.eiflixNew}`);
    expect(flags(v.new.rows)).withContext('Neha (absent) yes, Priya (no doc) no').toEqual(['Neha:true', 'Priya:false']);
    expect(flags(v.funnel.rows)).withContext('Neha again, in Funnel').toEqual(['Neha:true']);
    expect(flags(v.upgrade.rows)).withContext('Om is moved to existing — still EiFlix New User in the dialog').toEqual(['Om:true']);
    const none = saleSectionsView(world(), tools(), START);
    expect(none.sections.flatMap((s) => s.rows).some((r) => r.eiflixNew)).withContext('no ids -> no chip').toBeFalse();
  });

  it('EiFlix New User changes nothing else: same buyers, order, totals, search and export', () => {
    const ids = eiflixNewUserIds(newUserData());
    for (const t of [tools(), tools({ sort: 'recent' }), tools({ query: 'om' }), tools({ from: '2026-11-20' })]) {
      const a = saleSectionsView(world(), t, START);
      const b = saleSectionsView(world(), t, START, ids);
      for (const type of ['new', 'funnel', 'upgrade'] as const) {
        expect(b[type].rows.map((r) => r.key)).toEqual(a[type].rows.map((r) => r.key));
        expect(b[type].rows.map(({ eiflixNew, ...r }) => r)).toEqual(a[type].rows.map(({ eiflixNew, ...r }) => r));
        expect(b[type].buyers).toEqual(a[type].buyers);
      }
      expect([b.total, b.count, b.allTotal, b.allCount, b.filtered]).toEqual([a.total, a.count, a.allTotal, a.allCount, a.filtered]);
      expect(saleSectionsExportRows(b)).toEqual(saleSectionsExportRows(a));
    }
    expect(saleSectionsView(world(), tools({ query: 'EiFlix' }), START, ids).count).withContext('the chip text is not searchable').toBe(0);
  });
});
