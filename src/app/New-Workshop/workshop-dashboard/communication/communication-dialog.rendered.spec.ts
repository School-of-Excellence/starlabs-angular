import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CommunicationDialogComponent } from './communication-dialog.component';

/**
 * Rendered checks — what actually happens when the operator clicks the real
 * Material controls. The pure logic is covered next door; these exist because
 * the first two bugs the operator hit were in the template, not the logic.
 * `load()` is stubbed so nothing touches Firestore.
 */
describe('CommunicationDialogComponent (rendered)', () => {
  let fixture: ComponentFixture<CommunicationDialogComponent>;
  let c: CommunicationDialogComponent;
  const sent: any = {};

  const meta = [
    { id: 'b1', data: { profileid: 'b1', name: 'Balaji', email: 'balaji@x.io', phonenumber: '9000000001', countrycode: '91', customerstatus: 'active' } },
    { id: 'n1', data: { profileid: 'n1', name: 'Nanda', email: 'nanda@x.io', phonenumber: '9000000002', countrycode: '91', customerstatus: 'active' } },
    { id: 'r1', data: { profileid: 'r1', name: 'Ravi', email: 'ravi@x.io', phonenumber: '', countrycode: '91' } },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunicationDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {
          workshopId: 'w1', workshopTitle: 'Test', workshopRef: {},
          send: { email: (r: any[]) => { sent.email = r; }, whatsapp: (r: any[]) => { sent.whatsapp = r; }, notification: (r: any[]) => { sent.notification = r; } },
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CommunicationDialogComponent);
    c = fixture.componentInstance;
    spyOn(c as any, 'load').and.callFake(() => {});   // no Firestore
    fixture.detectChanges();                            // ngOnInit
    c.loading = false;
    c.useRows(c.buildRows(meta, [], new Set(['b1'])).rows);
    fixture.detectChanges();
  });

  const el = (sel: string): HTMLElement => fixture.nativeElement.querySelector(sel);
  const all = (sel: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(sel));
  const rowBox = (name: string): HTMLInputElement => {
    const row = all('tr.mat-mdc-row').find(r => r.textContent!.includes(name))!;
    return row.querySelector('[data-testid="wdash-comm-select-row"] input') as HTMLInputElement;
  };
  const search = async (q: string) => {
    const input = el('[data-testid="wdash-comm-search"]') as HTMLInputElement;
    input.value = q; input.dispatchEvent(new Event('input'));
    c.applyFilters();                                   // bypass the debounce timer
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  };

  it('renders the people and attaches the sort header and paginator', () => {
    expect(all('tr.mat-mdc-row').length).toBe(3);
    expect(el('.mat-sort-header-container')).withContext('sort header').toBeTruthy();
    expect(el('mat-paginator')).withContext('paginator').toBeTruthy();
    expect((c as any).dataSource.sort).withContext('MatSort attached to the data source').toBeTruthy();
    expect((c as any).dataSource.paginator).withContext('MatPaginator attached').toBeTruthy();
  });

  it('clicking the row checkbox ticks the person exactly once', () => {
    rowBox('Balaji').click();
    fixture.detectChanges();
    expect(Array.from(c.selected)).toEqual(['b1']);
    expect(rowBox('Balaji').checked).toBe(true);
    expect(el('[data-testid="wdash-comm-selected-count"]').textContent).toContain('1');
  });

  it('clicking anywhere else on the row also ticks, and clicking again unticks', () => {
    const row = all('tr.mat-mdc-row').find(r => r.textContent!.includes('Nanda'))!;
    (row.querySelector('.cm-name') as HTMLElement).click(); fixture.detectChanges();
    expect(Array.from(c.selected)).toEqual(['n1']);
    (row.querySelector('.cm-name') as HTMLElement).click(); fixture.detectChanges();
    expect(c.selected.size).toBe(0);
  });

  it('the operator\'s sequence: search balaji → tick → clear → search nanda → Balaji stays ticked', async () => {
    await search('balaji');
    expect(all('tr.mat-mdc-row').length).toBe(1);
    rowBox('Balaji').click(); fixture.detectChanges();
    await search('');
    expect(rowBox('Balaji').checked).withContext('still ticked after clearing the search').toBe(true);
    await search('nanda');
    rowBox('Nanda').click(); fixture.detectChanges();
    expect(Array.from(c.selected).sort()).toEqual(['b1', 'n1']);
    await search('');
    expect(rowBox('Balaji').checked).toBe(true);
    expect(rowBox('Nanda').checked).toBe(true);
  });

  it('the selected panel lists every ticked name whatever the search shows', async () => {
    await search('balaji'); rowBox('Balaji').click(); fixture.detectChanges();
    await search('nanda');  rowBox('Nanda').click();  fixture.detectChanges();
    const panel = el('[data-testid="wdash-comm-selected-panel"]');
    expect(panel).withContext('panel appears once someone is ticked').toBeTruthy();
    expect(panel.textContent).toContain('Balaji');
    expect(panel.textContent).toContain('Nanda');
    expect(panel.textContent).not.toContain('Ravi');
  });

  it('the selected panel expands and collapses, and its × unticks that person', async () => {
    rowBox('Balaji').click(); rowBox('Ravi').click(); fixture.detectChanges();
    expect(all('[data-testid="wdash-comm-selected-chip"]').length).toBe(2);
    el('[data-testid="wdash-comm-selected-toggle"]').click(); fixture.detectChanges();
    expect(all('[data-testid="wdash-comm-selected-chip"]').length).withContext('collapsed').toBe(0);
    el('[data-testid="wdash-comm-selected-toggle"]').click(); fixture.detectChanges();
    const chips = all('[data-testid="wdash-comm-selected-chip"]');
    const ravi = chips.find(ch => ch.textContent!.includes('Ravi'))!;
    (ravi.querySelector('[data-testid="wdash-comm-selected-remove"]') as HTMLElement).click(); fixture.detectChanges();
    expect(Array.from(c.selected)).toEqual(['b1']);
    expect(rowBox('Ravi').checked).toBe(false);
  });

  it('the Has phone box responds to a single click', () => {
    (el('[data-testid="wdash-comm-need-phone"] input') as HTMLElement).click(); fixture.detectChanges();
    expect(c.needPhone).toBe(true);
    expect(all('tr.mat-mdc-row').length).toBe(2);                 // Ravi has no phone
  });

  it('WhatsApp sends the ticked people in the side panel\'s shape', async () => {
    await search('nanda'); rowBox('Nanda').click(); fixture.detectChanges();
    el('[data-testid="wdash-comm-send-whatsapp"]').click();
    expect(sent.whatsapp.map((p: any) => p.profileid)).toEqual(['n1']);
    expect(sent.whatsapp[0].metadata.countrycode).toBe('91');
  });
});
