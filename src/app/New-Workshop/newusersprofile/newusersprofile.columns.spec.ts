import { NewusersprofileComponent } from './newusersprofile.component';

/** Column chooser (operator 2026-11-12): five columns by default, kept per browser, never zero. */
describe('NewusersprofileComponent — column chooser', () => {
  const KEY = 'newusersprofile.columns.v1';
  function make(): any {
    const c: any = Object.create(NewusersprofileComponent.prototype);
    c.columnOptions = [
      { key: 'name', label: 'Name' }, { key: 'phonenumber', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'created', label: 'Created' }, { key: 'enable', label: 'Status' }, { key: 'referredby', label: 'Referred by' },
      { key: 'tags', label: 'Tags' },
    ];
    c.visibleColumns = new Set((NewusersprofileComponent as any).loadSavedColumns());
    c.selectedWorkshopIds = new Set();
    c.workshopFilterMode = 'include';
    c.convertedFilter = '';
    c.exportColumns = [];
    c.selectedExportKeys = [];
    c.lastWorkshopFilterActive = false;
    c.lastConvertedActive = false;
    c.updateDisplayedColumns();
    return c;
  }
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('defaults to Name, Phone, Email, Created, Tags', () => {
    expect(make().displayedColumns).toEqual(['select', 'name', 'phonenumber', 'email', 'created', 'tags']);
  });

  it('keeps table order when turning columns on, and remembers the choice', () => {
    const c = make();
    c.toggleColumn('referredby');
    c.toggleColumn('enable');
    expect(c.displayedColumns).toEqual(['select', 'name', 'phonenumber', 'email', 'created', 'enable', 'referredby', 'tags']);
    expect(make().displayedColumns).toEqual(c.displayedColumns);   // a new visit reads the saved choice
    expect(c.columnsAreDefault).toBeFalse();
    c.resetColumns();
    expect(c.columnsAreDefault).toBeTrue();
  });

  it('never hides the last column', () => {
    const c = make();
    ['phonenumber', 'email', 'created', 'tags'].forEach(k => c.toggleColumn(k));
    expect(c.isLastColumn('name')).toBeTrue();
    c.toggleColumn('name');
    expect(c.displayedColumns).toEqual(['select', 'name']);
  });

  it('still adds Moved On while the Converted filter is on, whatever was chosen', () => {
    const c = make();
    c.convertedFilter = 'converted';
    c.updateDisplayedColumns();
    expect(c.displayedColumns[c.displayedColumns.length - 1]).toBe('movedon');
  });

  it('ignores a saved value it does not understand', () => {
    localStorage.setItem(KEY, JSON.stringify(['bogus']));
    expect(make().displayedColumns).toEqual(['select', 'name', 'phonenumber', 'email', 'created', 'tags']);
    localStorage.setItem(KEY, '{not json');
    expect(make().displayedColumns).toEqual(['select', 'name', 'phonenumber', 'email', 'created', 'tags']);
  });
});
