import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NewusersprofileComponent, NxPager } from './newusersprofile.component';

/**
 * Redesign data layer (2026-11-16): lazy referrer names, filter state, readout chips, rule sentences,
 * Created parsing / quick ranges / calendar, no-match counts, selection scope, export reasons, file results.
 * The component is built for real (field initialisers run) with stub services and no template; access is
 * denied so nothing is read, and rows go in through setData().
 */
describe('NewusersprofileComponent — redesign data layer', () => {
  const KEY = 'newusersprofile.columns.v1';
  let dialogOpen: jasmine.Spy;

  function make(): any {
    dialogOpen = jasmine.createSpy('open').and.returnValue({ afterClosed: () => ({ pipe: () => ({ subscribe: () => undefined }) }) });
    const access = {
      currentProfileId: () => Promise.resolve(null),
      getAdminLists: () => Promise.resolve({ newUsersAccess: [] }),
    };
    const snack = { open: jasmine.createSpy('snack') };
    const c: any = TestBed.runInInjectionContext(() => new NewusersprofileComponent(
      {} as any, {} as any, { open: dialogOpen } as any, snack as any, {} as any, {} as any, access as any));
    // No Firestore here: the two lazy reads answer empty unless a test spies on them.
    c.fetchParticipantNames = () => Promise.resolve({});
    c.fetchWorkshopOptions = () => Promise.resolve([]);
    return c;
  }

  const day = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
  const ids = (c: any) => c.dataSource.filteredData.map((u: any) => u.id);

  /** Five people: tags, conversion, dates and referrers to filter on. */
  function rows(): any[] {
    return [
      { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', created: day(2026, 11, 12, 0, 0), tags: ['t1', 't2'], refferedprofile: 'p1' },
      { id: 'u2', name: 'Bala Iyer', email: 'bala@example.com', created: day(2026, 11, 12, 23, 59), tags: ['t1', 't1'], movedtoexist: true },
      { id: 'u3', name: 'Chitra N', email: 'chitra@example.com', created: day(2026, 11, 13, 0, 0), tags: [], subscriber: true, refferedprofile: 'p9' },
      { id: 'u4', name: 'Dev K', email: 'dev@example.com', created: day(2026, 10, 1, 9, 0), tags: ['t2'], refferedprofile: { id: 'u1' } },
      { id: 'u5', name: 'Esha M', email: 'esha@example.com', created: day(2026, 9, 30, 9, 0), tags: ['t3'], refferedprofile: 'zz/bad' },
    ];
  }

  function withData(c: any, data = rows()): any {
    c.setTags([{ id: 't1', name: 'Gold Members' }, { id: 't2', name: 'Corporate' }, { id: 't3', name: 'Hindi Batch' }]);
    c.setData(data);
    return c;
  }

  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  // ---------------------------------------------------------------- Created
  describe('Created dates', () => {
    const parse = (t: string) => NewusersprofileComponent.parseDay(t);
    const ymd = (d: Date | null) => d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null;

    it('reads "12 nov", "12 Nov 2026", D/M/Y numerics, ISO and month-first text', () => {
      const y = new Date().getFullYear();
      expect(ymd(parse('12 nov'))).toEqual([y, 11, 12]);
      expect(ymd(parse('12 Nov 2026'))).toEqual([2026, 11, 12]);
      expect(ymd(parse('  12   NOVEMBER 2026 '))).toEqual([2026, 11, 12]);
      expect(ymd(parse('12/11/2026'))).toEqual([2026, 11, 12]);   // D/M/Y, not M/D/Y
      expect(ymd(parse('1-2-26'))).toEqual([2026, 2, 1]);
      expect(ymd(parse('12.11'))).toEqual([y, 11, 12]);
      expect(ymd(parse('2026-11-05'))).toEqual([2026, 11, 5]);
      expect(ymd(parse('1st Sept 2026'))).toEqual([2026, 9, 1]);
      expect(ymd(parse('Nov 12, 2026'))).toEqual([2026, 11, 12]);
    });

    it('rejects impossible or unreadable text', () => {
      ['', '   ', '31/02/2026', '12 nob', '12 no', 'hello', '13/13/2026', '12/11/202', 'novembers 2'].forEach(t =>
        expect(parse(t)).withContext(t).toBeNull());
    });

    it('applies typed From/To, shows them back as "d MMM y", and keeps unreadable text as no bound', () => {
      const c = withData(make());
      c.fromText = '12 nov 2026';
      c.commitDateText('from');
      expect(c.fromText).toBe('12 Nov 2026');
      expect(c.hasDateFilter).toBeTrue();
      expect(ids(c)).toEqual(['u3', 'u2', 'u1']);   // either end may stay open
      c.toText = '12/11/2026';
      c.commitDateText('to');
      expect(c.toText).toBe('12 Nov 2026');
      // start of day to end of day, inclusive: 00:00 and 23:59 on the 12th, not 00:00 on the 13th
      expect(ids(c).sort()).toEqual(['u1', 'u2']);
      c.toText = 'next week';
      c.commitDateText('to');
      expect(c.toText).toBe('next week');
      expect(c.endDate).toBeNull();
      expect(ids(c).sort()).toEqual(['u1', 'u2', 'u3']);
      c.fromText = '';
      c.commitDateText('from');
      expect(c.hasDateFilter).toBeFalse();
      expect(ids(c).length).toBe(5);
    });

    it('quick ranges end today: Today, Last 7 days (today−6), Last 30 days (today−29), This month (the 1st)', () => {
      const c = make();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const back = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
      const check = (p: string, start: Date) => {
        c.applyPreset(p);
        expect(c.startDate.getTime()).withContext(p).toBe(start.getTime());
        expect(c.endDate.getTime()).withContext(p).toBe(today.getTime());
        // On the 1st, 7th or 30th "This month" equals an earlier preset; the first equal one is marked.
        const first = ['today', '7d', '30d', 'month'].find(q => c.presetRange(q).start.getTime() === start.getTime());
        expect(c.activePreset).withContext(p).toBe(first);
        expect(c.calMonth.getMonth()).toBe(today.getMonth());
        expect(c.fromText).toBe(c.formatDay(start));
      };
      check('today', today);
      check('7d', back(6));
      check('30d', back(29));
      check('month', new Date(today.getFullYear(), today.getMonth(), 1));
      c.clearDates();
      expect(c.activePreset).toBeNull();
      expect(c.fromText).toBe('');
    });

    it('builds the month grid with leading blanks, a range band and today', () => {
      const c = make();
      c.calMonth = new Date(2026, 10, 1);
      c.startDate = day(2026, 11, 3);
      c.endDate = day(2026, 11, 6);
      c.rebuildCalendar();
      const blanks = new Date(2026, 10, 1).getDay();
      expect(c.calDays.filter((d: any) => d === null).length).toBe(blanks);
      const cells = c.calDays.filter((d: any) => d);
      expect(cells.length).toBe(30);
      expect(cells[2].isStart).toBeTrue();
      expect(cells[5].isEnd).toBeTrue();
      expect(cells.filter((d: any) => d.inRange).map((d: any) => d.day)).toEqual([4, 5]);
      expect(c.calMonthLabel).toBe('November 2026');
      c.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      c.rebuildCalendar();
      expect(c.calDays.filter((d: any) => d && d.isToday).map((d: any) => d.day)).toEqual([new Date().getDate()]);
      c.shiftMonth(-1);
      expect(c.calMonth.getDate()).toBe(1);
    });

    it('calendar clicks: first sets From, second sets To, swapped when it falls before From', () => {
      const c = withData(make());
      c.pickDay(day(2026, 11, 20));
      expect(c.formatDay(c.startDate)).toBe('20 Nov 2026');
      expect(c.endDate).toBeNull();
      c.pickDay(day(2026, 11, 5));
      expect(c.formatDay(c.startDate)).toBe('5 Nov 2026');
      expect(c.formatDay(c.endDate)).toBe('20 Nov 2026');
      expect(c.fromText).toBe('5 Nov 2026');
      c.pickDay(day(2026, 11, 25));   // a new From after To drops the To
      expect(c.formatDay(c.startDate)).toBe('25 Nov 2026');
      expect(c.endDate).toBeNull();
    });

    it('spells ranges in words', () => {
      const c = make();
      expect(c.formatRange(day(2026, 10, 1), day(2026, 11, 15))).toBe('1 Oct – 15 Nov 2026');
      expect(c.formatRange(day(2026, 11, 1), day(2026, 11, 15))).toBe('1 – 15 Nov 2026');
      expect(c.formatRange(day(2026, 11, 12), day(2026, 11, 12))).toBe('12 Nov 2026');
      expect(c.formatRange(day(2025, 12, 30), day(2026, 1, 2))).toBe('30 Dec 2025 – 2 Jan 2026');
      expect(c.formatRange(day(2026, 10, 1), null)).toBe('from 1 Oct 2026');
      expect(c.formatRange(null, day(2026, 11, 15))).toBe('until 15 Nov 2026');
      expect(c.formatRange(day(2026, 10, 1), day(2026, 11, 15), false)).toBe('1 Oct – 15 Nov');
    });
  });

  // ---------------------------------------------------------------- rules and readout
  describe('rule sentences', () => {
    function tagRule(c: any, mode: 'all' | 'any', pol: 'include' | 'exclude', chosen: string[]): string {
      c.selectByTagIds = new Set(chosen);
      c.selectByTagMode = mode;
      c.selectByTagPolarity = pol;
      return c.tagRuleText;
    }

    it('states every Tags combination in plain words, names in bold', () => {
      const c = withData(make());
      expect(tagRule(c, 'any', 'include', ['t1', 't2'])).toBe('Shows people tagged Corporate or Gold Members.');
      expect(tagRule(c, 'all', 'include', ['t1', 't2'])).toBe('Shows only people who carry both Corporate and Gold Members.');
      expect(tagRule(c, 'any', 'exclude', ['t1', 't2'])).toBe('Hides everyone tagged Corporate or Gold Members.');
      expect(tagRule(c, 'all', 'exclude', ['t1', 't2'])).toBe('Hides people who carry both Corporate and Gold Members.');
      expect(tagRule(c, 'all', 'include', ['t1', 't2', 't3'])).toBe('Shows only people who carry all of Corporate, Gold Members and Hindi Batch.');
      expect(tagRule(c, 'any', 'include', ['t1', 't2', 't3'])).toBe('Shows people tagged Corporate, Gold Members or Hindi Batch.');
      expect(tagRule(c, 'all', 'include', ['t2'])).toBe('Shows people tagged Corporate.');
      expect(tagRule(c, 'all', 'exclude', ['t2'])).toBe('Hides everyone tagged Corporate.');
      expect(tagRule(c, 'all', 'include', [])).toBe('');
      tagRule(c, 'any', 'exclude', ['t1', 't2']);
      expect(c.tagRuleParts.filter((p: any) => p.bold).map((p: any) => p.text)).toEqual(['Corporate', 'Gold Members']);
    });

    it('keeps Match all + Include as the default, and Exclude still switches to Match any', () => {
      const c = make();
      expect(c.selectByTagMode).toBe('all');
      expect(c.selectByTagPolarity).toBe('include');
      c.setTagPolarity('exclude');
      expect(c.selectByTagMode).toBe('any');
    });

    it('states the Workshops rule for include and exclude', () => {
      const c = make();
      c.workshopTitleById = { w1: 'Winning Heart – Workshop', w2: 'A&H Expanding Horizons' };
      c.selectedWorkshopIds = new Set(['w1']);
      expect(c.workshopRuleText).toBe('Shows people enrolled in Winning Heart – Workshop, with a Workshop column.');
      c.selectedWorkshopIds = new Set(['w1', 'w2']);
      c.workshopFilterMode = 'exclude';
      expect(c.workshopRuleText).toBe('Hides people enrolled in Winning Heart – Workshop or A&H Expanding Horizons. No Workshop column.');
    });
  });

  describe('readout chips', () => {
    it('one chip per active filter, in words; never the search', () => {
      const c = withData(make());
      c.onSearchInput({ target: { value: 'a' } } as any);
      c.commitSearch();
      expect(c.readoutChips).toEqual([]);
      c.toggleTagSelect('t2');
      c.setTagPolarity('exclude');
      c.fromText = '1 Oct 2026';
      c.commitDateText('from');
      c.setConvertedFilter('notconverted');
      expect(c.readoutChips.map((x: any) => [x.key, x.phrase, x.value])).toEqual([
        ['tags', 'Tags, excluding', 'Corporate'],
        ['created', 'Created', 'from 1 Oct 2026'],
        ['conversion', 'Conversion', 'Not converted'],
      ]);
      c.toggleTagSelect('t1');
      c.setTagMode('all');
      expect(c.readoutChips[0].phrase).toBe('Tags, excluding all of');
      expect(c.readoutChips[0].value).toBe('Corporate, Gold Members');
      expect(c.activeFilterCount).toBe(3);
    });

    it('a chip × removes only its filter; Clear all filters keeps the search; the no-match button clears both', () => {
      const c = withData(make());
      c.onSearchInput({ target: { value: 'example' } } as any);
      c.commitSearch();
      c.toggleTagSelect('t1');
      c.setConvertedFilter('converted');
      expect(ids(c)).toEqual(['u2']);
      c.removeChip('conversion');
      expect(c.convertedFilter).toBe('');
      expect(c.selectByTagIds.has('t1')).toBeTrue();
      expect(ids(c).sort()).toEqual(['u1', 'u2']);
      c.setConvertedFilter('converted');
      c.clearAllFilters();
      expect(c.hasActiveFilters).toBeFalse();
      expect(c.searchText).toBe('example');
      expect(c.hasAnyFilter).toBeTrue();
      c.onSearchInput({ target: { value: 'asha' } } as any);
      c.commitSearch();
      c.toggleTagSelect('t3');
      c.clearFiltersAndSearch();
      expect(c.searchText).toBe('');
      expect(c.hasAnyFilter).toBeFalse();
      expect(ids(c).length).toBe(5);
    });
  });

  // ---------------------------------------------------------------- counts
  describe('per-tag counts and no-match conditions', () => {
    it('counts each tag once per person from the in-memory list', () => {
      const c = withData(make());
      expect(c.tagCounts).toEqual({ t1: 2, t2: 2, t3: 1 });
      expect(c.tagCount('t1')).toBe(2);
      expect(c.tagCount('nope')).toBe(0);
    });

    it('when nothing matches, counts each condition alone, the search included', () => {
      const c = withData(make());
      c.onSearchInput({ target: { value: 'asha' } } as any);   // u1, and u4 (referred by Asha Rao)
      c.commitSearch();
      c.toggleTagSelect('t1');                                  // u1, u2
      c.setConvertedFilter('converted');                        // u2
      expect(c.isNoMatch).toBeTrue();
      expect(c.noMatchReasons.map((r: any) => [r.key, r.count])).toEqual([
        ['search', 2], ['tags', 2], ['conversion', 1],
      ]);
      expect(c.noMatchReasons[0].value).toBe('“asha”');
      c.removeReason('search');
      expect(c.searchText).toBe('');
      expect(ids(c)).toEqual(['u2']);
      expect(c.noMatchReasons).toEqual([]);
    });

    it('re-runs the search when a tag is renamed (tag names are searchable)', () => {
      const c = withData(make());
      c.onSearchInput({ target: { value: 'platinum' } } as any);
      c.commitSearch();
      expect(ids(c)).toEqual([]);
      c.setTags([{ id: 't1', name: 'Platinum' }, { id: 't2', name: 'Corporate' }]);
      expect(ids(c).sort()).toEqual(['u1', 'u2']);
      expect(c.vm(c.dataSource.data.find((u: any) => u.id === 'u1')).tagNames).toEqual(['Platinum', 'Corporate']);
    });
  });

  // ---------------------------------------------------------------- selection scope
  describe('selection scope', () => {
    function many(n: number): any[] {
      return Array.from({ length: n }, (_, i) => ({
        id: 'r' + i, name: 'Person ' + i, created: day(2026, 1, 1, 0, i), tags: i % 2 ? ['t1'] : [],
      }));
    }

    it('select all matching, the cross-page state, only this page, and the hidden count', () => {
      const c = withData(make(), many(45));
      expect(c.pageRows.length).toBe(20);
      c.selection.select('r0');
      expect(c.isAllSelected()).toBeFalse();
      expect(c.someSelected()).toBeTrue();
      c.selectAllMatching();
      expect(c.selection.selected.length).toBe(45);
      expect(c.isAllSelected()).toBeTrue();
      expect(c.allMatchingSelected).toBeTrue();
      expect(c.selectedOffPage).toBe(25);
      c.selectAllMatching();                     // select only, never a toggle
      expect(c.selection.selected.length).toBe(45);
      c.onlyThisPage();
      expect(c.selection.selected.length).toBe(20);
      expect(c.allMatchingSelected).toBeFalse();
      expect(c.hiddenSelectedCount).toBe(0);
      c.toggleTagSelect('t1');                   // odd rows only: 10 of the ticked 20 are now hidden
      expect(c.hiddenSelectedCount).toBe(10);
      expect(c.isAllSelected()).toBeFalse();
      c.masterToggle();
      expect(c.isAllSelected()).toBeTrue();
      expect(c.selection.selected.length).toBe(20 + 22 - 10);   // 10 already ticked odd rows on page 1
      c.masterToggle();
      expect(c.hiddenSelectedCount).toBe(c.selection.selected.length);
    });

    it('the pager pages, resizes back to page 1, and states the range', async () => {
      const c = withData(make(), many(45));
      await Promise.resolve();
      const p: NxPager = c.pager;
      expect(p.rangeLabel).toBe('1–20 of 45');
      p.nextPage();
      expect(c.pageRows[0].id).toBe(c.dataSource.data[20].id);
      expect(p.rangeLabel).toBe('21–40 of 45');
      p.lastPage();
      expect(p.hasNext).toBeFalse();
      expect(c.pageRows.length).toBe(5);
      p.setPageSize(50);
      expect(p.pageIndex).toBe(0);
      expect(c.pageRows.length).toBe(45);
      c.toggleTagSelect('t3');                   // nobody: "0 of 0"
      await Promise.resolve();
      expect(p.rangeLabel).toBe('0 of 0');
      expect(c.trackRow(0, { id: 'x1' })).toBe('x1');
    });
  });

  // ---------------------------------------------------------------- conversion
  it('Conversion: picking the active option keeps it; Everyone clears; Moved On follows Converted', () => {
    const c = withData(make());
    c.setConvertedFilter('converted');
    c.setConvertedFilter('converted');
    expect(c.convertedFilter).toBe('converted');
    expect(c.displayedColumns).toContain('movedon');
    expect(c.selectedExportKeys).toContain('movedon');
    c.setConvertedFilter('notconverted');
    expect(c.convertedFilter).toBe('notconverted');
    expect(c.displayedColumns).not.toContain('movedon');
    c.openPanel = 'conversion';
    c.pickConversion('');
    expect(c.convertedFilter).toBe('');
    expect(c.openPanel).toBeNull();
    expect(ids(c).length).toBe(5);
  });

  // ---------------------------------------------------------------- referrer names
  describe('referrer names (lazy)', () => {
    function spyNames(c: any, names: Record<string, string>): jasmine.Spy {
      return spyOn(c, 'fetchParticipantNames').and.callFake((batch: string[]) => {
        const out: Record<string, string> = {};
        batch.forEach(id => { if (names[id]) out[id] = names[id]; });
        return Promise.resolve(out);
      });
    }

    it('reads nothing while Referred by is hidden, nothing is searched and no export includes it', () => {
      const c = make();
      const spy = spyNames(c, {});
      withData(c);
      expect(c.referrerNamesNeeded).toBeFalse();
      expect(spy).not.toHaveBeenCalled();
      c.onSearchInput({ target: { value: '   ' } } as any);
      expect(spy).not.toHaveBeenCalled();
    });

    it('turning Referred by on reads only the ids present, once, and resolves names in the old order', async () => {
      const c = make();
      const spy = spyNames(c, { p1: 'Priya Participant', u1: 'Meta Name For u1' });
      withData(c);
      c.toggleColumn('referredby');
      expect(spy).toHaveBeenCalledTimes(1);
      // u3 is a subscriber (its p9 is never read); 'zz/bad' is not a plain document id
      expect(spy.calls.argsFor(0)[0].sort()).toEqual(['p1', 'u1']);
      await c.loadReferrerNames();
      const byId = (id: string) => c.dataSource.data.find((u: any) => u.id === id);
      expect(c.vm(byId('u1')).referredBy).toBe('Priya Participant');
      expect(c.vm(byId('u4')).referredBy).toBe('Meta Name For u1');   // DocumentReference; metadata beats new_user_data
      expect(c.vm(byId('u3')).referredBy).toBe('Subscriber');
      expect(c.vm(byId('u3')).referrerName).toBe('');
      expect(c.vm(byId('u5')).referredBy).toBe('zz/bad');               // raw id fallback
      c.toggleColumn('referredby');
      c.toggleColumn('referredby');
      expect(spy).toHaveBeenCalledTimes(1);                             // each id is asked for once
    });

    it('falls back to the new user name when participant metadata has none', async () => {
      const c = make();
      spyNames(c, {});
      withData(c);
      c.toggleColumn('referredby');
      await c.loadReferrerNames();
      const u4 = c.dataSource.data.find((u: any) => u.id === 'u4');
      expect(c.referredBy(u4)).toBe('Asha Rao');
    });

    it('a search triggers the read, and the filter re-runs when the names arrive', async () => {
      const c = make();
      const spy = spyNames(c, { p1: 'Priya Participant' });
      withData(c);
      c.onSearchInput({ target: { value: 'priya' } } as any);
      expect(spy).toHaveBeenCalledTimes(1);
      c.commitSearch();
      await c.loadReferrerNames();
      expect(ids(c)).toEqual(['u1']);
    });

    it('opening Export with Referred by chosen triggers the read; batches hold at most 30 ids', () => {
      const c = make();
      const spy = spyNames(c, {});
      const data = Array.from({ length: 35 }, (_, i) => ({ id: 'n' + i, created: day(2026, 1, 1), refferedprofile: 'ref' + i }));
      withData(c, data);
      expect(spy).not.toHaveBeenCalled();
      c.toggleExport();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.calls.allArgs().map((a: any[]) => a[0].length).sort((a: number, b: number) => a - b)).toEqual([5, 30]);
    });
  });

  // ---------------------------------------------------------------- search
  describe('search', () => {
    it('debounces typing by 200ms, but Clear applies at once', fakeAsync(() => {
      const c = withData(make());
      c.onSearchInput({ target: { value: 'bala' } } as any);
      expect(c.searchText).toBe('bala');
      tick(199);
      expect(ids(c).length).toBe(5);
      tick(1);
      expect(ids(c)).toEqual(['u2']);
      c.onSearchInput({ target: { value: 'chitra' } } as any);
      c.clearSearch();
      expect(c.searchText).toBe('');
      expect(ids(c).length).toBe(5);
      tick(500);
      expect(ids(c).length).toBe(5);
    }));

    it('searches the Created cell text and both date formats, as before', () => {
      const c = withData(make());
      c.onSearchInput({ target: { value: '12 Nov 2026, 11:59 PM' } } as any);
      c.commitSearch();
      expect(ids(c)).toEqual(['u2']);
      c.onSearchInput({ target: { value: 'nov 12, 2026' } } as any);   // 'medium'
      c.commitSearch();
      expect(ids(c).sort()).toEqual(['u1', 'u2']);
      expect(c.vm(c.dataSource.data.find((u: any) => u.id === 'u2')).createdLabel).toBe('12 Nov 2026, 11:59 PM');
    });

    it('suggests tags with counts; Enter on a highlighted one filters, plain Enter keeps the text', () => {
      const c = withData(make());
      const key = (k: string) => ({ key: k, preventDefault: () => undefined } as any);
      c.onSearchInput({ target: { value: 'gold' } } as any);
      expect(c.suggestOpen).toBeTrue();
      expect(c.suggestions.map((s: any) => [s.kind, s.label, s.count, s.match])).toEqual([['tag', 'Gold Members', 2, 'Gold']]);
      c.onSearchKeydown(key('Enter'));
      expect(c.searchText).toBe('gold');
      expect(c.selectByTagIds.size).toBe(0);
      expect(c.suggestOpen).toBeFalse();
      c.onSearchInput({ target: { value: 'gold' } } as any);
      c.onSearchKeydown(key('ArrowDown'));
      expect(c.suggestActive).toBe(0);
      c.onSearchKeydown(key('Enter'));
      expect(c.selectByTagIds.has('t1')).toBeTrue();
      expect(c.searchText).toBe('');
      expect(ids(c).sort()).toEqual(['u1', 'u2']);
      c.onSearchInput({ target: { value: 'g' } } as any);   // under 2 characters: no list
      expect(c.suggestOpen).toBeFalse();
    });
  });

  // ---------------------------------------------------------------- panels
  it('Tags panel: chosen first, frozen while open, Find narrows', () => {
    const c = withData(make());
    c.toggleTagSelect('t3');
    c.openFilterPanel('tags');
    expect(c.tagPanelChosen.map((t: any) => t.name)).toEqual(['Hindi Batch']);
    expect(c.tagPanelRest.map((t: any) => t.name)).toEqual(['Corporate', 'Gold Members']);
    c.toggleTagSelect('t1');
    expect(c.tagPanelChosen.map((t: any) => t.name)).toEqual(['Hindi Batch']);
    c.tagFind = 'co';
    expect(c.tagPanelRest.map((t: any) => t.name)).toEqual(['Corporate']);
    c.closePanel();
    expect(c.tagPanelChosen.map((t: any) => t.name)).toEqual(['Gold Members', 'Hindi Batch']);
  });

  it('Workshops list: read on first need, funnel-only first, the full list when Funnel only turns off', async () => {
    const c = withData(make());
    const spy = spyOn(c, 'fetchWorkshopOptions').and.callFake((funnel: boolean) => Promise.resolve(funnel
      ? [{ id: 'w1', title: 'Winning Heart', evergreen: true }]
      : [{ id: 'w1', title: 'Winning Heart', evergreen: true }, { id: 'w2', title: 'Alpha Retreat', evergreen: false }]));
    expect(spy).not.toHaveBeenCalled();
    c.openFilterPanel('workshops');
    expect(c.workshopOptionsLoading).toBeTrue();
    await c.ensureWorkshopsLoaded();
    expect(spy.calls.allArgs()).toEqual([[true]]);
    expect(c.workshopOptionsLoaded).toBeTrue();
    expect(c.allWorkshopsCount).toBeNull();
    c.closePanel();
    c.openFilterPanel('workshops');
    expect(spy).toHaveBeenCalledTimes(1);
    c.setFunnelOnly(false);
    await c.ensureWorkshopsLoaded();
    expect(spy.calls.allArgs()).toEqual([[true], [false]]);
    expect(c.allWorkshopsCount).toBe(2);
    c.workshopFind = 'alp';
    expect(c.filteredWorkshopOptions.map((w: any) => w.title)).toEqual(['Alpha Retreat']);
  });

  it('Columns button note and narrow layout flag', () => {
    const c = make();
    expect(c.columnsShownCount).toBe(5);
    expect(c.columnsTotal).toBe(7);
    c.openPanel = 'tags';
    c.applyWidth(1280);
    expect(c.isNarrow).toBeFalse();
    expect(c.openPanel).toBe('tags');
    c.applyWidth(820);
    expect(c.isNarrow).toBeTrue();
    expect(c.isPhone).toBeFalse();
    expect(c.openPanel).toBeNull();
    c.applyWidth(0);                             // a hidden root keeps the layout
    expect(c.isNarrow).toBeTrue();
    c.applyWidth(390);
    expect(c.isPhone).toBeTrue();
    c.openFiltersSheet();
    c.applyWidth(1000);
    expect(c.filtersSheetOpen).toBeFalse();
  });

  // ---------------------------------------------------------------- export and file
  it('Export: display labels apart from the Excel headers, counts, and disabled reasons', () => {
    const c = withData(make());
    expect(c.exportDisabledReason).toBe('no-rows');
    c.selection.select('u1', 'u2', 'gone');
    expect(c.exportDisabledReason).toBe('');
    expect(c.exportRowCount).toBe(2);
    expect(c.exportSummaryText).toBe('Excel file · 8 columns · 2 rows');
    expect(c.exportLabel('countryCode')).toBe('Country code');
    expect(c.exportLabel('referredby')).toBe('Referred by');
    expect(c.exportColumns.map((x: any) => x.label)).toEqual(
      ['Name', 'Country Code', 'Phone', 'Email', 'Created', 'Status', 'Referred By', 'Tags']);
    c.exportColumnsView.forEach((x: any) => c.toggleExportKey(x.key));
    expect(c.exportColumnCount).toBe(0);
    expect(c.exportDisabledReason).toBe('no-columns');
    expect(c.exportReasonText).toBe('Choose at least one column');
    c.toggleExportKey('email');
    c.workshopFilterLoading = true;
    expect(c.exportDisabledReason).toBe('workshop-loading');
    expect(c.isExportColumnOffered('workshop')).toBeFalse();
  });

  it('file import: counts, unmatched list, and a hidden count that follows the filters', () => {
    const c = withData(make());
    c.selection.select('u5');
    const r = c.applyImportedEmails('leads.xlsx', ['ASHA@example.com', 'bala@example.com', 'nobody@example.com', 'n/a', 42, '']);
    expect(r.kind).toBe('ok');
    expect([r.total, r.matched, r.selectedCount, r.missing, r.invalid, r.replaced]).toEqual([3, 2, 2, 1, 2, true]);
    expect(r.unmatched).toEqual(['nobody@example.com']);
    expect(c.selection.selected.sort()).toEqual(['u1', 'u2']);
    expect(c.fileBanner.title).toBe('Selected 2 people from leads.xlsx');
    expect(c.fileResultHiddenCount).toBe(0);
    c.setConvertedFilter('converted');           // u1 is not converted: now hidden
    expect(c.fileResultHiddenCount).toBe(1);
    const none = c.applyImportedEmails('x.xlsx', ['someone@else.com']);
    expect(none.kind).toBe('none');
    expect(c.selection.selected.sort()).toEqual(['u1', 'u2']);   // unchanged
    expect(c.fileBanner.variant).toBe('warn');
    c.dismissFileResult();
    expect(c.fileBanner).toBeNull();
  });

  it('opens the tag dialog with the design panel, width, and per-tag counts', async () => {
    const c = withData(make());
    await c.openTagsManager();
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    const cfg = dialogOpen.calls.mostRecent().args[1];
    expect(cfg.panelClass).toBe('atd-dialog-panel');
    expect(cfg.width).toBe('580px');
    expect(cfg.maxWidth).toBe('95vw');
    expect(cfg.data.mode).toBe('manage');
    expect(cfg.data.tagCounts).toEqual({ t1: 2, t2: 2, t3: 1 });
    const u = c.dataSource.data[0];
    await c.openTags(u);
    expect(dialogOpen.calls.mostRecent().args[1].data.user).toBe(u);
    expect(dialogOpen.calls.mostRecent().args[1].data.mode).toBeUndefined();
  });

  it('Retry re-subscribes and keeps the search and filters', () => {
    const c = withData(make());
    const users = spyOn(c, 'subscribeUsers');
    const tags = spyOn(c, 'subscribeTags');
    c.accessChecked = true;
    c.accessAllowed = true;
    c.onSearchInput({ target: { value: 'example' } } as any);
    c.commitSearch();
    c.toggleTagSelect('t1');
    c.loadError = true;
    c.tagsSub = { closed: false };
    c.retry();
    expect(c.loadError).toBeFalse();
    expect(users).toHaveBeenCalledTimes(1);
    expect(tags).not.toHaveBeenCalled();   // the tags listener is still alive
    expect(c.searchText).toBe('example');
    expect(c.selectByTagIds.has('t1')).toBeTrue();
  });

  it('ignores lazy results that land after the screen is closed', async () => {
    const c = withData(make());
    let answer!: (v: Record<string, string>) => void;
    spyOn(c, 'fetchParticipantNames').and.returnValue(new Promise(r => (answer = r)));
    c.toggleColumn('referredby');
    c.ngOnDestroy();
    answer({ p1: 'Late Name' });
    await c.loadReferrerNames();
    expect(c.metaMap['p1']).toBeUndefined();
    c.toggleColumn('referredby');
  });

  it('phase follows access, the stream and the rows', () => {
    const c = make();
    expect(c.phase).toBe('checking');
    c.accessChecked = true;
    expect(c.phase).toBe('denied');
    c.accessAllowed = true;
    expect(c.phase).toBe('loading');
    expect(c.totalCount).toBeNull();
    c.loading = false;
    expect(c.phase).toBe('empty');
    withData(c);
    expect(c.phase).toBe('ready');
    expect(c.totalCount).toBe(5);
    c.loadError = true;
    expect(c.phase).toBe('error');
  });
});
