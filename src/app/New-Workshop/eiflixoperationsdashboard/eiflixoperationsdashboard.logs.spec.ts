import { EiflixoperationsdashboardComponent } from './eiflixoperationsdashboard.component';

/**
 * EiFlix Mobile App Logs — filtering, sorting and paging over rows already loaded from `loginlog`.
 * Built from the prototype: the real component needs Firestore and the participant directory, and
 * none of these rules depend on either.
 */
describe('EiflixoperationsdashboardComponent — EiFlix Mobile App Logs', () => {
  const at = (iso: string) => new Date(iso);
  const row = (id: string, profileid: string, name: string, iso: string, os: string, v: string) =>
    ({ id, profileid, name, date: at(iso), dateLabel: iso, device_os: os, current_version: v });

  function make(rows = [
    row('a', 'p1', 'Anita', '2026-09-21T09:00:00', 'android', '2.3.1'),
    row('b', 'p2', 'Bala', '2026-09-21T11:30:00', 'ios', '2.3.0'),
    row('c', 'p1', 'Anita', '2026-09-20T08:00:00', 'android', '2.2.9'),
    row('d', 'p3', 'Chitra', '2026-09-15T20:00:00', 'ios', '2.3.1'),
  ]): any {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
    c.logAll = rows; c.logShown = []; c.logPage = [];
    c.logSearch = ''; c.logNameSearch = ''; c.logNameFilter = 'all'; c.logOsFilter = 'all';
    c.logNameOptions = [{ profileid: 'p1', name: 'Anita' }, { profileid: 'p2', name: 'Bala' }, { profileid: 'p3', name: 'Chitra' }];
    c.logSortKey = 'date'; c.logSortDir = 'desc'; c.logPageIndex = 0; c.logPageSize = 25;
    c.applyLogFilters();
    return c;
  }
  const ids = (c: any) => c.logShown.map((r: any) => r.id);

  it('shows everything newest first by default', () => {
    expect(ids(make())).toEqual(['b', 'a', 'c', 'd']);
  });

  it('filters by the chosen person, by device OS, and by both together', () => {
    const c = make();
    c.logNameFilter = 'p1'; c.onLogFilterChange(); expect(ids(c)).toEqual(['a', 'c']);
    c.logOsFilter = 'ios'; c.onLogFilterChange(); expect(ids(c)).toEqual([]);
    c.logNameFilter = 'all'; c.onLogFilterChange(); expect(ids(c)).toEqual(['b', 'd']);
  });

  it('searches name, id, OS, version and the date label, case-insensitively', () => {
    const c = make();
    c.logSearch = 'ANITA'; c.onLogFilterChange(); expect(ids(c)).toEqual(['a', 'c']);
    c.logSearch = '2.3.1'; c.onLogFilterChange(); expect(ids(c)).toEqual(['a', 'd']);
    c.logSearch = 'p2'; c.onLogFilterChange(); expect(ids(c)).toEqual(['b']);
    c.logSearch = '2026-09-15'; c.onLogFilterChange(); expect(ids(c)).toEqual(['d']);
  });

  it('sorts by any column; clicking the same column flips the direction', () => {
    const c = make();
    c.setLogSort('name');            expect(ids(c)).toEqual(['a', 'c', 'b', 'd']);   // Anita, Anita, Bala, Chitra
    c.setLogSort('name');            expect(ids(c)).toEqual(['d', 'b', 'a', 'c']);
    c.setLogSort('current_version'); expect(ids(c)).toEqual(['c', 'b', 'a', 'd']);   // 2.2.9 < 2.3.0 < 2.3.1 (numeric)
    c.setLogSort('date');            expect(ids(c)).toEqual(['b', 'a', 'c', 'd']);   // date starts descending
    c.setLogSort('date');            expect(ids(c)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('pages the filtered, sorted list and clamps the page when a filter shrinks it', () => {
    const c = make(); c.setLogPageSize(2);
    expect(c.logPage.map((r: any) => r.id)).toEqual(['b', 'a']);
    expect(c.logPageCount).toBe(2); expect(c.logPageFrom).toBe(1); expect(c.logPageTo).toBe(2);
    c.logNext(); expect(c.logPage.map((r: any) => r.id)).toEqual(['c', 'd']); expect(c.logPageFrom).toBe(3);
    c.logNext(); expect(c.logPageIndex).toBe(1);                                   // no page 3
    c.logOsFilter = 'ios'; c.onLogFilterChange();                                   // 2 rows → 1 page
    expect(c.logPageIndex).toBe(0); expect(c.logPage.map((r: any) => r.id)).toEqual(['b', 'd']);
    c.logPrev(); expect(c.logPageIndex).toBe(0);
  });

  it('counts active filters and clears them all', () => {
    const c = make();
    c.logSearch = 'x'; c.logNameFilter = 'p1'; c.logOsFilter = 'ios'; c.onLogFilterChange();
    expect(c.logFilterCount).toBe(3);
    c.clearLogFilters();
    expect(c.logFilterCount).toBe(0); expect(ids(c).length).toBe(4);
  });

  it('counts unique people — over everything in range, and over what the filters leave', () => {
    const c = make();
    expect(c.logUniquePeople).toBe(3);            // p1, p2, p3 behind four rows
    expect(c.logUniquePeopleShown).toBe(3);
    c.logOsFilter = 'android'; c.onLogFilterChange();
    expect(c.logUniquePeopleShown).toBe(1);       // both android rows are p1
    expect(c.logUniquePeople).toBe(3);            // the range total does not move with a filter
  });

  it('the name filter\'s search narrows its options, not the table', () => {
    const c = make();
    c.logNameSearch = 'chi';
    expect(c.logNameOptionsShown.map((o: any) => o.name)).toEqual(['Chitra']);
    expect(ids(c).length).toBe(4);
    c.logNameSearch = 'A';                        // case-insensitive, substring: Anita, Bala, Chitra all contain "a"
    expect(c.logNameOptionsShown.length).toBe(3);
    c.clearLogFilters();
    expect(c.logNameSearch).toBe('');
  });

  it('labels the range', () => {
    const c = make();
    c.logRange = 1; expect(c.logRangeLabel).toBe('today');
    c.logRange = 7; expect(c.logRangeLabel).toBe('last 7 days');
  });
});
