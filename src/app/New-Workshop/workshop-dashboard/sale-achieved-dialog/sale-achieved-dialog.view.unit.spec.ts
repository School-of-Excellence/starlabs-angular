import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SaleAchievedDialogComponent } from './sale-achieved-dialog.component';
import { SaleAchievedSource, SaleLookupStatus } from './sale-achieved';
import { purchaseLabels } from '../../watson-purchases';

/**
 * Sale Achieved dialog (plan: specs/plans/2026-11-23-sale-achieved-dialog.md) — the COMPONENT, mounted with a fake
 * live source. The pure list logic is in sale-achieved.unit.spec.ts; the emulator e2e (hub WSD-01..04) can only reach
 * the "unavailable" state (no Watson there). This covers what neither does: the live source (a dialog opened while
 * the card's lookup runs fills in when it lands), the template wiring of rows / toggles / export / clears, the
 * From / To cross-bounds, and where focus goes. No Watson, no Firestore: the source is a plain object.
 */
class FakeSource implements SaleAchievedSource {
  status: SaleLookupStatus = 'loading';
  buyers: any[] = [];
  windowLabel = 'Bought 7 Nov 2026 – 6 Jan 2027';
  min = '2026-11-07';
  max = '2027-01-06';
  workshopTitle = 'Legacy Live';
  canExport = true;
  newUserIds: ReadonlySet<string> = new Set<string>();
  downloads: { rows: Record<string, string | number>[]; name: string }[] = [];
  download(rows: Record<string, string | number>[], name: string): void { this.downloads.push({ rows, name }); }
}

describe('Sale Achieved dialog — the component on a live source', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10);
  // By default a buyer's first sale ever was in 2025 — before the window — so every purchase is an Upgrade and the
  // list reads as one section (the cases below predate the split); the split has its own case.
  const buyer = (profileid: string, name: string, meta: any, rows: { date: Date; product: string; amount: number }[], firstPaid: Date = at(2025, 1, 1)) => {
    const total = rows.reduce((a, r) => a + r.amount, 0);
    return {
      profileid, name, metadata: meta, salePurchases: rows.map(purchaseLabels), saleTotal: total,
      saleTotalLabel: '₹' + total.toLocaleString('en-IN'), saleLastDate: Math.max(...rows.map((r) => r.date.getTime())),
      saleFirstPaidMs: firstPaid.getTime(),
    };
  };
  const buyers = () => [
    buyer('pA', 'Arvind Kumar', { email: 'arvind@example.com', phonenumber: '9820000006', countrycode: '91' }, [
      { date: at(2026, 11, 8), product: 'Business Accelerator', amount: 50000 },
      { date: at(2026, 11, 20), product: 'Legacy Consultation', amount: 100000 },
    ]),
    buyer('pB', 'Bala', { email: 'bala@example.com' }, [{ date: at(2026, 12, 15), product: 'Scale', amount: 20000 }]),
    buyer('pC', 'Chitra', { email: 'chitra@example.com' }, [{ date: at(2026, 11, 10), product: 'Grow', amount: 20000 }]),
  ];

  let src: FakeSource;
  let close: jasmine.Spy;
  let fixture: ComponentFixture<SaleAchievedDialogComponent>;
  let cmp: SaleAchievedDialogComponent;

  const el = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const all = (id: string) => Array.from(el().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const text = (id: string) => (q(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** ngModel writes values and the disabled state a microtask later. */
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const ready = async (list: any[] = buyers()) => { src.status = 'ready'; src.buyers = list; await settle(); };

  beforeEach(async () => {
    src = new FakeSource();
    close = jasmine.createSpy('close');
    await TestBed.configureTestingModule({
      imports: [SaleAchievedDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { source: src } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SaleAchievedDialogComponent);
    cmp = fixture.componentInstance;
    await settle();
  });

  afterEach(() => { window.getSelection()?.removeAllRanges(); fixture.destroy(); });

  it('opened while the lookup runs, shows loading, then the list when the lookup lands (live source)', async () => {
    expect(q('wsad-loading')).withContext('loading first').not.toBeNull();
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['…', '…']);
    expect(q<HTMLInputElement>('wsad-search')!.disabled).withContext('no tools on a list not yet loaded').toBeTrue();
    expect(q<HTMLButtonElement>('wsad-export')!.disabled).toBeTrue();
    expect(all('wsad-row').length).toBe(0);

    await ready();
    expect(q('wsad-loading')).withContext('loading gone once it lands').toBeNull();
    expect(all('wsad-name').map((e) => e.textContent!.trim())).toEqual(['Arvind Kumar', 'Bala', 'Chitra']);
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['₹1,90,000', '3']);
    expect(q<HTMLInputElement>('wsad-search')!.disabled).toBeFalse();
    expect(q<HTMLButtonElement>('wsad-export')!.disabled).toBeFalse();
    expect(text('wsad-window')).toBe('Bought 7 Nov 2026 – 6 Jan 2027');
  });

  it('follows a NEW buyers array (a re-run lookup), not the first one it saw', async () => {
    await ready();
    expect(all('wsad-row').length).toBe(3);
    src.buyers = buyers().slice(1);
    fixture.detectChanges();
    expect(all('wsad-name').map((e) => e.textContent!.trim())).toEqual(['Bala', 'Chitra']);
    expect(text('wsad-total')).toBe('₹40,000');
    src.status = 'loading';
    fixture.detectChanges();
    expect(q('wsad-loading')).withContext('a re-run shows loading again').not.toBeNull();
  });

  it('shows the unavailable state with every tool off, and "—" for the figures', async () => {
    src.status = 'unavailable';
    await settle();
    expect(text('wsad-unavailable')).toBe("Sale data isn't available in this build");
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['—', '—']);
    for (const id of ['wsad-from', 'wsad-to', 'wsad-search']) expect(q<HTMLInputElement>(id)!.disabled).withContext(id).toBeTrue();
    for (const id of ['wsad-sort-amount', 'wsad-sort-recent', 'wsad-export']) expect(q<HTMLButtonElement>(id)!.disabled).withContext(id).toBeTrue();
  });

  it('says "No purchases in this window" when nobody bought — and that there is no window when a date is missing', async () => {
    await ready([]);
    expect(text('wsad-empty')).toBe('No purchases in this window');
    src.min = '';
    src.max = '';
    fixture.detectChanges();
    expect(text('wsad-empty')).withContext('no window is not "nobody bought"').toContain('There is no sale window yet');
    expect(text('wsad-empty')).not.toContain('No purchases in this window');
  });

  it('lists every purchase in the row itself (no expand / collapse), newest first, in a Products column', async () => {
    await ready();
    expect(all('wsad-row-toggle').length).withContext('no toggle any more').toBe(0);
    expect(Array.from(el().querySelectorAll('thead th')).map((e) => e.textContent!.trim()))
      .toEqual(['Name', 'Email', 'Phone', 'Products', 'Total']);
    const lines = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[data-testid="wsad-purchase"]'))
      .map((p) => Array.from(p.children).map((c) => c.textContent!.replace(/\s+/g, ' ').trim()).join(' | '));
    expect(lines(all('wsad-row')[0])).toEqual(['Legacy Consultation | 20 Nov 2026 · ₹1,00,000', 'Business Accelerator | 8 Nov 2026 · ₹50,000']);
    expect(lines(all('wsad-row')[1])).toEqual(['Scale | 15 Dec 2026 · ₹20,000']);
    expect(all('wsad-products').length).toBe(3);
  });

  it('keeps From and To inside the window and each other (cross-bounds)', async () => {
    await ready();
    const from = q<HTMLInputElement>('wsad-from')!;
    const to = q<HTMLInputElement>('wsad-to')!;
    expect([from.min, from.max, to.min, to.max]).toEqual(['2026-11-07', '2027-01-06', '2026-11-07', '2027-01-06']);
    cmp.from = '2026-11-10';
    fixture.detectChanges();
    expect([to.min, to.max]).withContext('To cannot go before From').toEqual(['2026-11-10', '2027-01-06']);
    cmp.to = '2026-12-01';
    fixture.detectChanges();
    expect([from.min, from.max]).withContext('From cannot go after To').toEqual(['2026-11-07', '2026-12-01']);
    expect(all('wsad-name').map((e) => e.textContent!.trim())).toEqual(['Arvind Kumar', 'Chitra']);
  });

  it('marks narrowed figures "of <all>", and the clear of the dates hands focus to From', async () => {
    await ready();
    expect(el().querySelectorAll('.wsad-fig-of').length).withContext('nothing narrowed -> no note').toBe(0);
    expect(Array.from(el().querySelectorAll('.wsad-fig dt')).map((e) => e.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Total excl. GST', 'Buyers']);
    expect(q('wsad-range-clear')).toBeNull();
    cmp.from = '2026-11-09';
    cmp.to = '2026-11-30';
    await settle();
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['₹1,20,000', '2']);
    expect(Array.from(el().querySelectorAll('.wsad-fig-of')).map((e) => e.textContent!.trim())).toEqual(['of ₹1,90,000', 'of 3 buyers']);
    expect(Array.from(el().querySelectorAll('.wsad-fig dt')).map((e) => e.textContent!.replace(/\s+/g, ' ').trim()))
      .withContext('narrowed figures say "Shown"').toEqual(['Shown excl. GST', 'Buyers shown']);
    q('wsad-range-clear')!.click();
    await settle();
    expect(q('wsad-range-clear')).toBeNull();
    expect([cmp.from, cmp.to]).toEqual(['', '']);
    expect(document.activeElement).withContext('focus stays in the dialog, on From').toBe(q('wsad-from'));
    expect(all('wsad-row').length).toBe(3);
  });

  it('no match: names what its clear clears, which restores the list and puts focus in the search', async () => {
    await ready();
    cmp.query = 'nobody';
    fixture.detectChanges();
    expect(q('wsad-no-match')).not.toBeNull();
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['₹0', '0']);
    expect(q<HTMLButtonElement>('wsad-export')!.disabled).withContext('nothing to export').toBeTrue();
    expect(text('wsad-no-match-clear')).toBe('Clear search');
    cmp.from = '2026-11-09';
    fixture.detectChanges();
    expect(text('wsad-no-match-clear')).toBe('Clear all');
    cmp.query = '';
    cmp.to = '2026-11-09';
    fixture.detectChanges();
    expect(q('wsad-no-match')).withContext('9 Nov alone: nobody bought that day').not.toBeNull();
    expect(text('wsad-no-match-clear')).toBe('Clear dates');
    cmp.query = 'nobody';
    fixture.detectChanges();

    q('wsad-no-match-clear')!.click();
    await settle();
    expect([cmp.from, cmp.to, cmp.query]).toEqual(['', '', '']);
    expect(all('wsad-row').length).toBe(3);
    expect(document.activeElement).withContext('focus stays in the dialog, on the search').toBe(q('wsad-search'));
  });

  it('Escape in a search with text clears it and stays open; in an empty search it is left to the dialog', async () => {
    await ready();
    const reachedDialog = jasmine.createSpy('reachedDialog');
    document.body.addEventListener('keydown', reachedDialog);
    try {
      cmp.query = 'bala';
      await settle();
      expect(all('wsad-row').length).toBe(1);
      const search = q<HTMLInputElement>('wsad-search')!;
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(cmp.query).toBe('');
      expect(all('wsad-row').length).toBe(3);
      expect(reachedDialog).withContext('the first Escape does not reach the dialog (it would close)').not.toHaveBeenCalled();
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(reachedDialog).withContext('an empty search lets Escape close the dialog').toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeEventListener('keydown', reachedDialog);
    }
  });

  it('exports what is shown — range, search and order applied — under the kept file name', async () => {
    await ready();
    cmp.setSort('recent');
    cmp.query = 'example.com';
    cmp.from = '2026-11-09';
    await settle();
    q('wsad-export')!.click();
    expect(src.downloads.length).toBe(1);
    const { rows, name } = src.downloads[0];
    expect(rows.map((r) => r['Participant Name'])).withContext('most recent first; 8 Nov is before From').toEqual(['Bala', 'Arvind Kumar', 'Chitra']);
    expect(rows.map((r) => r['Product'])).toEqual(['Scale', 'Legacy Consultation', 'Grow']);
    expect(rows.map((r) => r['Type'])).withContext('first sales in 2025 -> Upgrades').toEqual(['Upgrade', 'Upgrade', 'Upgrade']);
    expect([rows[1]['Country Code'], rows[1]['Phone']]).toEqual(['91', '9820000006']);
    expect(name).toMatch(/^workshop-sale-achieved-Legacy Live-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('has no Export without the export right', async () => {
    src.canExport = false;
    await ready();
    expect(q('wsad-export')).toBeNull();
  });

  it('sorts by the segment, which reports its state', async () => {
    await ready();
    expect(q('wsad-sort-amount')!.getAttribute('aria-pressed')).toBe('true');
    q('wsad-sort-recent')!.click();
    fixture.detectChanges();
    expect(q('wsad-sort-recent')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('wsad-sort-amount')!.getAttribute('aria-pressed')).toBe('false');
    expect(all('wsad-name').map((e) => e.textContent!.trim())).toEqual(['Bala', 'Arvind Kumar', 'Chitra']);
  });

  it('wraps a long email only at "@" and "." and reads as the whole address', async () => {
    await ready([buyer('pL', 'Long', { email: 'first.last@long-company.co.in' }, [{ date: at(2026, 11, 9), product: 'P', amount: 1 }])]);
    const cell = all('wsad-email')[0];
    expect(cell.textContent).toBe('first.last@long-company.co.in');
    expect(cell.querySelectorAll('wbr').length).toBe(4);
    await ready([buyer('pN', 'No Mail', {}, [{ date: at(2026, 11, 9), product: 'P', amount: 1 }])]);
    expect(all('wsad-email')[0].textContent).toBe('—');
  });

  it('splits the list into New Sales, Funnel Sales and Upgrades: summary, per-section figures, empty notes', async () => {
    const neha = buyer('pN', 'Neha', { email: 'neha@example.com' }, [
      { date: at(2026, 11, 10), product: 'Workshop Seat', amount: 5000 },
      { date: at(2026, 11, 25), product: 'Business Accelerator', amount: 50000 },
    ], at(2026, 11, 10));
    await ready([neha, ...buyers()]);
    const sec = (id: string) => q(id)!;
    const inSec = (id: string, hook: string) => Array.from(sec(id).querySelectorAll<HTMLElement>(`[data-testid="${hook}"]`));
    const names = (id: string) => inSec(id, 'wsad-name').map((e) => e.textContent!.trim());
    const fig = (id: string, hook: string) => (inSec(id, hook)[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();

    expect(Array.from(el().querySelectorAll('section')).map((e) => e.getAttribute('data-testid')))
      .toEqual(['wsad-section-new', 'wsad-section-funnel', 'wsad-section-upgrade']);
    expect(Array.from(el().querySelectorAll('.wsad-sec-title')).map((e) => e.textContent!.trim())).toEqual(['New Sales', 'Funnel Sales', 'Upgrades']);
    expect(names('wsad-section-new')).withContext('her first purchase ever').toEqual(['Neha']);
    expect(names('wsad-section-funnel')).withContext('bought again after it').toEqual(['Neha']);
    expect(names('wsad-section-upgrade')).toEqual(['Arvind Kumar', 'Bala', 'Chitra']);
    expect([fig('wsad-section-new', 'wsad-section-total'), fig('wsad-section-new', 'wsad-section-count')]).toEqual(['₹5,000', '1 buyer']);
    expect([fig('wsad-section-funnel', 'wsad-section-total'), fig('wsad-section-funnel', 'wsad-section-count')]).toEqual(['₹50,000', '1 buyer']);
    expect([fig('wsad-section-upgrade', 'wsad-section-total'), fig('wsad-section-upgrade', 'wsad-section-count')]).toEqual(['₹1,90,000', '3 buyers']);
    expect([text('wsad-total'), text('wsad-count')]).withContext('overall: Neha counts once').toEqual(['₹2,45,000', '4']);
    expect(Array.from(q('wsad-summary')!.querySelectorAll('li')).map((e) => e.textContent!.replace(/\s+/g, ' ').trim()))
      .withContext('each part read apart (never "₹5,0001 buyer")')
      .toEqual(['New Sales, ₹5,000, 1 buyer', 'Funnel Sales, ₹50,000, 1 buyer', 'Upgrades, ₹1,90,000, 3 buyers']);
    expect(all('wsad-section-empty').length).withContext('no section is empty').toBe(0);

    // Each section lists only its own purchases of the person, in the row itself.
    const lines = (id: string) => inSec(id, 'wsad-purchase').map((p) => Array.from(p.children).map((c) => c.textContent!.replace(/\s+/g, ' ').trim()).join(' | '));
    expect(lines('wsad-section-new')).withContext('New Sales: her first purchase').toEqual(['Workshop Seat | 10 Nov 2026 · ₹5,000']);
    expect(lines('wsad-section-funnel')).withContext('Funnel Sales: the rest').toEqual(['Business Accelerator | 25 Nov 2026 · ₹50,000']);

    // A search that leaves a section with nobody says "No match" there.
    cmp.query = 'neha';
    await settle();
    expect(fig('wsad-section-upgrade', 'wsad-section-empty')).toBe('No match');
    expect(inSec('wsad-section-upgrade', 'wsad-row').length).toBe(0);
    expect([text('wsad-total'), text('wsad-count')]).toEqual(['₹55,000', '1']);

    // Nobody new in this window: New Sales and Funnel Sales say so.
    cmp.query = '';
    await ready(buyers());
    expect(fig('wsad-section-new', 'wsad-section-empty')).toBe('None in this window');
    expect(fig('wsad-section-funnel', 'wsad-section-empty')).toBe('None in this window');
    expect(inSec('wsad-section-upgrade', 'wsad-section-empty').length).toBe(0);
  });

  it('shows no summary or section outside a loaded list', async () => {
    for (const status of ['loading', 'unavailable'] as SaleLookupStatus[]) {
      src.status = status;
      await settle();
      for (const id of ['wsad-summary', 'wsad-section-new', 'wsad-section-funnel', 'wsad-section-upgrade', 'wsad-section-empty']) {
        expect(q(id)).withContext(status + ' ' + id).toBeNull();
      }
    }
    await ready([]);
    expect(q('wsad-summary')).withContext('empty').toBeNull();
    await ready();
    cmp.query = 'nobody';
    await settle();
    expect(q('wsad-no-match')).not.toBeNull();
    expect(q('wsad-section-new')).withContext('no match anywhere -> the single no-match state, not three empty sections').toBeNull();
  });

  it('closes by its close button', async () => {
    q('wsad-close')!.click();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
