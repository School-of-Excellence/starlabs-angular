import { WorkshopDashboardComponent } from './workshop-dashboard.component';

/**
 * Side-panel export (operator 2026-10-20): Total Enrolled threw "Cannot read properties of undefined
 * (reading 'email')" for a new user whose row carried no `metadata`. The export now falls back to
 * participant metadata, then new_user_data, and never throws.
 */
describe('WorkshopDashboard — side panel export', () => {
  function make(rows: any[]): { c: any; csv: () => any[] } {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.mapProfile = { e1: { name: 'Exist One', email: 'e1@x.com', phonenumber: '111', activejourney: 'jA' } };
    c.mapProfileNew = { n1: { name: 'New One', email: 'n1@x.com', phonenumber: '222' } };
    c.JourneyMap = { jA: 'Journey A' };
    c.workshopData = { detailpage: { title: 'WS' } };
    c.selectedStatusInfo = { status: 'totalEnrolled' };
    c.filteredParticipants = rows;
    c.can = () => true;
    let captured: any[] = [];
    c.createCSVContent = (data: any[]) => { captured = data; return ''; };
    c.downloadCSV = () => {};
    spyOn(window, 'confirm').and.returnValue(true);
    return { c, csv: () => captured };
  }

  it('exports rows with no metadata from either directory instead of throwing', async () => {
    const { c, csv } = make([
      { profileid: 'e1', name: 'Exist One' },                       // metadata missing, in participant metadata
      { profileid: 'n1', name: 'New One', metadata: undefined },    // new user only
      { profileid: 'ghost', name: 'Ghost' },                        // in neither
    ]);
    await expectAsync(c.exportParticipants()).toBeResolved();
    const rows = csv();
    expect(rows.length).toBe(3);
    expect(rows[0]['Email']).toBe('e1@x.com');
    expect(rows[0]['Active Journey']).toBe('Journey A');
    expect(rows[1]['Email']).toBe('n1@x.com');
    expect(rows[1]['Phone']).toBe('222');
    expect(rows[2]['Email']).toBe('');
  });

  // Operator 2026-11-12: Total Enrolled also exports each person's enrollment date and time, as the last column.
  it('adds Enrollment Date per person for Total Enrolled only', async () => {
    const { c, csv } = make([
      { profileid: 'e1', name: 'Exist One' },
      { profileid: 'n1', name: 'New One' },
      { profileid: 'ghost', name: 'Ghost' },                        // no enrolled doc
    ]);
    c.enrolledParticipants = [
      { profileid: 'e1', enrollmentdate: { toDate: () => new Date(2026, 2, 15, 12) } },
      { profileid: 'n1', enrollmentdate: { toDate: () => new Date(2026, 9, 2, 12) } },
      { profileid: 'e1', enrollmentdate: { toDate: () => new Date(2026, 5, 1, 12) } },   // later duplicate: first wins
    ];
    c.loadTagNames = async () => new Map();
    await c.exportParticipants();
    let rows = csv();
    expect(Object.keys(rows[0]).slice(-2)).toEqual(['Enrollment Date', 'Tags']);
    expect(rows[0]['Enrollment Date']).toBe(c.formatDateTime(new Date(2026, 2, 15, 12)));
    expect(rows[0]['Enrollment Date']).toContain('12:00');                // the time is included
    expect(rows[1]['Enrollment Date']).toBe(c.formatDateTime(new Date(2026, 9, 2, 12)));
    expect(rows[0]['Enrollment Date']).not.toBe(rows[1]['Enrollment Date']);
    expect(rows[2]['Enrollment Date']).toBe('');

    c.selectedStatusInfo = { status: 'totalStarted' };
    await c.exportParticipants();
    rows = csv();
    expect('Enrollment Date' in rows[0]).toBe(false);
    expect('Tags' in rows[0]).toBe(false);
  });

  // Operator 2026-11-12: the enrolled doc's `tags` (newusertags ids) export as their names, after Enrollment Date.
  it('exports tag names for Total Enrolled, skipping ids with no tag doc', async () => {
    const { c, csv } = make([
      { profileid: 'e1', name: 'Exist One' },
      { profileid: 'n1', name: 'New One' },
    ]);
    c.enrolledParticipants = [
      { profileid: 'e1', tags: ['t1', 'gone', 't2'] },
      { profileid: 'n1' },                                          // no tags field
    ];
    let asked: string[] = [];
    c.loadTagNames = async (ids: string[]) => { asked = ids; return new Map([['t1', 'Gold'], ['t2', 'Chennai, South']]); };
    await c.exportParticipants();
    const rows = csv();
    expect(Object.keys(rows[0]).slice(-2)).toEqual(['Enrollment Date', 'Tags']);
    expect(rows[0]['Tags']).toBe('Gold, Chennai, South');
    expect(rows[1]['Tags']).toBe('');
    expect(asked).toEqual(['t1', 'gone', 't2']);                    // only the exported people's tags are looked up
  });
});

/** Side panel New / Exist (operator 2026-11-12): moved-to-exist people are Exist, not New. */
describe('WorkshopDashboard — side panel New / Exist filter', () => {
  function make(filterOption: string): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.mapProfileNew = { nu: { name: 'Still New' }, mv: { name: 'Moved', movedtoexist: true } };
    c.mapProfile = { ex: { name: 'Existing', workshoponly: true }, mv: { name: 'Moved', workshoponly: true } };
    c.newUserDataState = 'ready';                       // New / Exist split only once new_user_data has landed
    c.selectedParticipants = [{ profileid: 'nu' }, { profileid: 'mv' }, { profileid: 'ex' }];
    c.selectedStatusInfo = { status: 'totalEnrolled' };
    c.filterOption = filterOption;
    c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedEnrollmentStatusFilters = [];
    c.selectedTierFilters = []; c.selectedCategoryFilters = []; c.selectedNotStartedTypeFilters = []; c.selectedTagFilters = [];
    c.selectedSubscriberCode = []; c.showReferredOnly = false;
    c.workshopData = {};
    c.enrolledParticipants = [];
    c.applyFilterSide();
    return c.filteredParticipants.map((p: any) => p.profileid).sort();
  }

  it('New is only the still-new user', () => expect(make('new')).toEqual(['nu']));
  it('Exist includes moved-to-exist and participant metadata people, whatever workshoponly says', () =>
    expect(make('exist')).toEqual(['ex', 'mv']));
  it('All keeps everyone', () => expect(make('all')).toEqual(['ex', 'mv', 'nu']));
});

/** Operator 2026-11-12: the Total Enrolled panel shows each person's enrolled-doc tags beside the New tag. */
describe('WorkshopDashboard — Total Enrolled panel tags', () => {
  it('maps each person to their tag names in stored order, first enrolled doc only, unknown ids left out', async () => {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.enrolledParticipants = [
      { profileid: 'a', tags: ['t2', 't1'] },
      { profileid: 'b', tags: ['gone'] },          // tag doc deleted → no chips
      { profileid: 'c' },                          // no tags field
      { profileid: 'a', tags: ['t3'] },            // later duplicate: ignored
    ];
    let asked: string[] = [];
    c.loadTagNames = async (ids: string[]) => { asked = ids; return new Map([['t1', 'Gold'], ['t2', 'Chennai'], ['t3', 'Never'], ['gone', '']]); };
    await c.loadEnrolledTagNames();
    expect(c.enrolledTagNames).toEqual({ a: ['Chennai', 'Gold'] });
    expect(asked).toEqual(['t2', 't1', 'gone']);
  });
});

/** Operator 2026-11-12: Total Enrolled's filter menu also filters by the enrolment tags. */
describe('WorkshopDashboard — Total Enrolled Tag filter', () => {
  function make(): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.selectedStatusInfo = { status: 'totalEnrolled' };
    c.selectedParticipants = [{ profileid: 'a' }, { profileid: 'b' }, { profileid: 'c' }];
    c.mapProfileNew = { a: { name: 'A' } };             // a is still new
    c.newUserDataState = 'ready';                       // New / Exist split only once new_user_data has landed
    c.mapProfile = {};
    c.filterOption = 'all';
    c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedTierFilters = [];
    c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = []; c.selectedNotStartedTypeFilters = [];
    c.selectedTagFilters = [];
    c.enrolledTagNames = { a: ['Gold', 'Chennai'], b: ['Chennai'] };
    return c;
  }
  const ids = (c: any) => c.filteredParticipants.map((p: any) => p.profileid);

  it('keeps anyone carrying any ticked tag, combines with New / Exist, and clears', () => {
    const c = make();
    c.toggleTagFilter('Gold');
    expect(ids(c)).toEqual(['a']);
    c.toggleTagFilter('Chennai');
    expect(ids(c)).toEqual(['a', 'b']);
    c.filterOption = 'exist';
    c.applyFilterSide();
    expect(ids(c)).toEqual(['b']);
    c.filterOption = 'all';
    c.clearTagFilters();
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });

  it('builds the options from the people in the panel, A to Z', async () => {
    const c = make();
    c.selectedParticipants = [{ profileid: 'a' }, { profileid: 'b' }];
    c.enrolledParticipants = [
      { profileid: 'a', tags: ['t1', 't2'] }, { profileid: 'b', tags: ['t2'] }, { profileid: 'z', tags: ['t3'] },
    ];
    c.loadTagNames = async () => new Map([['t1', 'Gold'], ['t2', 'Chennai'], ['t3', 'Outside']]);
    await c.loadEnrolledTagNames();
    expect(c.enrolledTagOptions).toEqual(['Chennai', 'Gold']);    // z is not in the panel
  });

  it('ignores ticked tags on any other panel', () => {
    const c = make();
    c.selectedTagFilters = ['Gold'];
    c.selectedStatusInfo = { status: 'totalStarted' };
    c.applyFilterSide();
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });
});

/** Operator 2026-11-13: Total Enrolled sorts by enrollment date or name. */
describe('WorkshopDashboard — Total Enrolled sort', () => {
  const ts = (y: number, m: number, d: number) => ({ toMillis: () => new Date(y, m, d).getTime() });
  function make(): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.selectedStatusInfo = { status: 'totalEnrolled' };
    c.selectedParticipants = [
      { profileid: 'b', name: 'bravo' }, { profileid: 'a', name: 'Alpha' }, { profileid: 'n', name: 'Unknown' },
      { profileid: 'c', name: 'Charlie' },
    ];
    c.enrolledParticipants = [
      { profileid: 'b', enrollmentdate: ts(2026, 9, 2) },
      { profileid: 'a', enrollmentdate: ts(2026, 9, 9) },
      { profileid: 'c' },                                           // no date
      { profileid: 'n', enrollmentdate: { seconds: Date.UTC(2026, 9, 5) / 1000 } },
      { profileid: 'b', enrollmentdate: ts(2027, 0, 1) },          // later duplicate: first doc wins
    ];
    c.mapProfile = {}; c.mapProfileNew = {};
    c.filterOption = 'all'; c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedTierFilters = [];
    c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = []; c.selectedNotStartedTypeFilters = [];
    c.selectedTagFilters = []; c.enrolledTagNames = {}; c.sideSort = '';
    return c;
  }
  const ids = (c: any) => c.filteredParticipants.map((p: any) => p.profileid);

  it('with the sort turned off, keeps the unsorted order', () => {
    const c = make(); c.applyFilterSide();
    expect(ids(c)).toEqual(['b', 'a', 'n', 'c']);
  });
  it('enrollment date newest / oldest first, people without a date last both ways', () => {
    const c = make();
    c.setSideSort('enrolledNew'); expect(ids(c)).toEqual(['a', 'n', 'b', 'c']);
    c.setSideSort('enrolledOld'); expect(ids(c)).toEqual(['b', 'n', 'a', 'c']);
  });
  it('name A to Z / Z to A ignoring case, nameless people last both ways', () => {
    const c = make();
    c.setSideSort('nameAZ'); expect(ids(c)).toEqual(['a', 'b', 'c', 'n']);
    c.setSideSort('nameZA'); expect(ids(c)).toEqual(['c', 'b', 'a', 'n']);
  });
  it('picking the active sort again turns it off; other panels ignore it', () => {
    const c = make();
    c.setSideSort('nameAZ'); c.setSideSort('nameAZ');
    expect(c.sideSort).toBe(''); expect(ids(c)).toEqual(['b', 'a', 'n', 'c']);
    c.sideSort = 'nameZA'; c.selectedStatusInfo = { status: 'totalStarted' }; c.applyFilterSide();
    expect(ids(c)).toEqual(['b', 'a', 'n', 'c']);
  });
});

describe('WorkshopDashboard — Total Enrolled opens newest-first', () => {
  it('opening Total Enrolled starts on enrollment date, newest first; other cards start unsorted', () => {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.metrics = new Map([['totalEnrolled', ['x']], ['totalStarted', ['x']]]);
    c.statusDisplayMap = new Map();
    c.buildParticipantEntry = (id: string) => ({ profileid: id, name: id });
    c.applyFilterSide = () => {};
    c.loadEnrolledTagNames = async () => {};
    c.onMetricClick('totalEnrolled');
    expect(c.sideSort).toBe('enrolledNew');
    c.onMetricClick('totalStarted');
    expect(c.sideSort).toBe('');
  });
});

/** Operator 2026-11-16: Total / Exist Users / New Users Enrolled filter by enrollment date. */
describe('WorkshopDashboard — enrollment date range', () => {
  const at = (y: number, m: number, d: number, h = 9) => ({ toMillis: () => new Date(y, m - 1, d, h).getTime() });
  function make(status = 'totalEnrolled'): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.selectedStatusInfo = { status };
    c.selectedParticipants = [{ profileid: 'a', name: 'A' }, { profileid: 'b', name: 'B' }, { profileid: 'c', name: 'C' }, { profileid: 'n', name: 'N' }];
    c.enrolledParticipants = [
      { profileid: 'a', enrollmentdate: at(2026, 11, 1) },
      { profileid: 'b', enrollmentdate: at(2026, 11, 5, 23) },    // late evening: still 5 Nov
      { profileid: 'c', enrollmentdate: at(2026, 11, 9) },
      { profileid: 'n' },                                         // no date
    ];
    c.mapProfile = {}; c.mapProfileNew = {};
    c.filterOption = 'all'; c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedTierFilters = [];
    c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = []; c.selectedNotStartedTypeFilters = [];
    c.selectedTagFilters = []; c.enrolledTagNames = {}; c.sideSort = '';
    c.selectedSubscriberCode = []; c.showReferredOnly = false;
    c.enrolledFrom = ''; c.enrolledTo = '';
    return c;
  }
  const ids = (c: any) => c.filteredParticipants.map((p: any) => p.profileid);

  it('no range keeps everyone, including people without a date', () => {
    const c = make(); c.applyFilterSide();
    expect(ids(c)).toEqual(['a', 'b', 'c', 'n']);
  });
  it('whole days on both ends; a person without a date is left out once a range is set', () => {
    const c = make();
    c.enrolledFrom = '2026-11-05'; c.enrolledTo = '2026-11-09'; c.applyFilterSide();
    expect(ids(c)).toEqual(['b', 'c']);
  });
  it('either end alone works', () => {
    const c = make();
    c.enrolledFrom = '2026-11-02'; c.applyFilterSide();
    expect(ids(c)).toEqual(['b', 'c']);
    c.enrolledFrom = ''; c.enrolledTo = '2026-11-05'; c.applyFilterSide();
    expect(ids(c)).toEqual(['a', 'b']);
  });
  it('ends typed the wrong way round mean the same window; Clear brings everyone back', () => {
    const c = make();
    c.enrolledFrom = '2026-11-09'; c.enrolledTo = '2026-11-05'; c.applyFilterSide();
    expect(ids(c)).toEqual(['b', 'c']);
    c.clearEnrolledRange();
    expect(ids(c)).toEqual(['a', 'b', 'c', 'n']);
  });
  it('applies on Exist Users and New Users Enrolled too, but not on other panels', () => {
    for (const s of ['existUsersEnrolled', 'totalNewUsers']) {
      const c = make(s); c.enrolledFrom = '2026-11-09'; c.applyFilterSide();
      expect(ids(c)).withContext(s).toEqual(['c']);
    }
    const other = make('totalStarted'); other.enrolledFrom = '2026-11-09'; other.applyFilterSide();
    expect(ids(other)).toEqual(['a', 'b', 'c', 'n']);
  });
  it('New Users Enrolled: still applies after the Referred filter rebuilds the list', () => {
    const c = make('totalNewUsers');
    c.isNewUserProfile = () => true;
    c.mapProfileNew = { a: { name: 'A', refferedby: 'X' }, c: { name: 'C', refferedby: 'Y' } };
    c.showReferredOnly = true;
    c.enrolledFrom = '2026-11-09'; c.applyFilterSide();
    expect(ids(c)).toEqual(['c']);
  });
  it('opening a panel clears the range', () => {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.metrics = new Map([['totalEnrolled', []]]); c.statusDisplayMap = new Map();
    c.buildParticipantEntry = (id: string) => ({ profileid: id }); c.applyFilterSide = () => {};
    c.loadEnrolledTagNames = async () => {};
    c.enrolledFrom = '2026-11-01'; c.enrolledTo = '2026-11-30';
    c.onMetricClick('totalEnrolled');
    expect([c.enrolledFrom, c.enrolledTo]).toEqual(['', '']);
  });
});

/** Operator 2026-11-16: the Tag filter also on Exist Users Enrolled and New Users Enrolled. */
describe('WorkshopDashboard — Tag filter on Exist Users / New Users Enrolled', () => {
  function make(status: string): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.selectedStatusInfo = { status };
    c.selectedParticipants = [{ profileid: 'a', name: 'A' }, { profileid: 'b', name: 'B' }, { profileid: 'c', name: 'C' }];
    c.enrolledParticipants = [{ profileid: 'a' }, { profileid: 'b' }, { profileid: 'c' }];
    c.mapProfile = {}; c.mapProfileNew = {};
    c.filterOption = 'all'; c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedTierFilters = [];
    c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = []; c.selectedNotStartedTypeFilters = [];
    c.selectedSubscriberCode = []; c.showReferredOnly = false; c.sideSort = ''; c.enrolledFrom = ''; c.enrolledTo = '';
    c.enrolledTagNames = { a: ['Gold'], b: ['Silver'] };
    c.selectedTagFilters = ['Gold'];
    return c;
  }
  const ids = (c: any) => c.filteredParticipants.map((p: any) => p.profileid);

  it('filters Exist Users Enrolled and New Users Enrolled; not New Users Not Enrolled', () => {
    for (const s of ['existUsersEnrolled', 'totalNewUsers']) {
      const c = make(s); c.applyFilterSide();
      expect(ids(c)).withContext(s).toEqual(['a']);
    }
    const notEnrolled = make('totalNewUsersNotEnrolled'); notEnrolled.applyFilterSide();
    expect(ids(notEnrolled)).toEqual(['a', 'b', 'c']);
  });
  it('New Users Enrolled: still applies after the Referred filter rebuilds the list', () => {
    const c = make('totalNewUsers');
    c.isNewUserProfile = () => true;
    c.mapProfileNew = { a: { name: 'A', refferedby: 'X' }, b: { name: 'B', refferedby: 'Y' } };
    c.showReferredOnly = true; c.applyFilterSide();
    expect(ids(c)).toEqual(['a']);
  });
  it('opening any of the three panels clears ticked tags and reads tag names', () => {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.metrics = new Map([['totalEnrolled', []]]); c.statusDisplayMap = new Map();
    c.enrolledParticipants = []; c.mapProfileNew = {}; c.newUserDataState = 'ready';
    c.isNewUserProfile = () => false; c.buildParticipantEntry = (id: string) => ({ profileid: id });
    c.applyFilterSide = () => {};
    let loads = 0; c.loadEnrolledTagNames = async () => { loads++; };
    for (const m of ['totalEnrolled', 'existUsersEnrolled', 'totalNewUsers']) {
      c.selectedTagFilters = ['Gold']; c.enrolledTagOptions = ['Gold'];
      c.onMetricClick(m);
      expect(c.selectedTagFilters).withContext(m).toEqual([]);
      expect(c.enrolledTagOptions).withContext(m).toEqual([]);
    }
    expect(loads).toBe(3);
  });
});

/**
 * new_user_data is read once and the dashboard no longer waits for it (2026-11-18). The panels it decides stay
 * shut until it lands; a panel opened before it lands is patched in place when it does — names, contact details —
 * without losing its search. New / Exist split nobody until it has landed (the options are disabled meanwhile).
 */
describe('WorkshopDashboard — new_user_data lands after the dashboard painted', () => {
  function make(): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.newUserDataState = 'loading';
    c.mapProfile = { p0: { name: 'Pat Zero', email: 'p0@x.com' } };   // participant metadata only, so far
    c.mapProfileNew = {};
    c.enrolledParticipants = [{ profileid: 'p0' }, { profileid: 'nu' }, { profileid: 'mv' }];
    c.participantWorkshopCategoryMap = new Map(); c.participantCohortMap = new Map(); c.categoryNamesMap = new Map();
    c.workshopData = { categorybased: false };
    c.metrics = new Map([['totalEnrolled', ['p0', 'nu', 'mv']]]); c.statusDisplayMap = new Map();
    c.shareProfileNames = {};
    c.filterOption = 'all'; c.sideSearch = '';
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.selectedTierFilters = [];
    c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = []; c.selectedNotStartedTypeFilters = [];
    c.selectedTagFilters = []; c.enrolledTagNames = {}; c.sideSort = '';
    c.selectedSubscriberCode = []; c.showReferredOnly = false;
    c.enrolledFrom = ''; c.enrolledTo = '';
    c.loadEnrolledTagNames = async () => {};
    return c;
  }
  /** What onNewUserDataSettled does to the maps when the read lands. */
  const land = (c: any) => {
    c.mapProfileNew = { nu: { name: 'NU Alpha', email: 'nu@x.com' }, mv: { name: 'Moved Alpha', email: 'old@x.com', movedtoexist: true } };
    c.newUserDataState = 'ready';
    c.mapProfile = { ...c.mapProfile, ...c.newUserOverlay() };
  };
  const names = (c: any) => c.filteredParticipants.map((p: any) => p.name).sort();

  it('keeps the panels it decides shut until it has landed, and after a failed read', () => {
    for (const state of ['loading', 'failed']) {
      for (const m of ['existUsersEnrolled', 'totalNewUsers', 'totalNewUsersNotEnrolled', 'notInChatGroup']) {
        const c = make(); c.newUserDataState = state; c.showParticipantPanel = false; c.selectedTagFilters = ['Gold'];
        c.onMetricClick(m);
        expect(c.showParticipantPanel).withContext(`${state} ${m}`).toBe(false);
        expect(c.selectedTagFilters).withContext(`${state} ${m}: nothing reset`).toEqual(['Gold']);
      }
    }
  });

  it('patches an open panel in place: new users named, their details filled, the search kept', () => {
    const c = make();
    c.onMetricClick('totalEnrolled');                           // opens while loading (it does not need new_user_data)
    c.sideSearch = 'alpha'; c.applyFilterSide();
    expect(c.filteredParticipants).toEqual([]);                  // nobody is named Alpha yet
    const rows = c.selectedParticipants;
    expect(rows.find((p: any) => p.profileid === 'nu').name).toBe('Unknown');
    land(c);
    c.refreshOpenPanelPeople();
    expect(c.selectedParticipants).toBe(rows);                   // the same rows, patched
    expect(c.sideSearch).toBe('alpha');
    expect(names(c)).toEqual(['Moved Alpha', 'NU Alpha']);
    expect(rows.find((p: any) => p.profileid === 'nu').metadata).toEqual({ name: 'NU Alpha', email: 'nu@x.com' });
    expect(rows.find((p: any) => p.profileid === 'mv').metadata).toBeUndefined();   // never the stale moved doc
    expect(rows.find((p: any) => p.profileid === 'p0').name).toBe('Pat Zero');
  });

  it('never splits New / Exist before it has landed, nor after a failed read: the list stays whole', () => {
    for (const state of ['loading', 'failed']) {
      const c = make(); c.newUserDataState = state;
      c.onMetricClick('totalEnrolled');
      for (const pick of ['new', 'exist']) {
        c.filterOption = pick; c.applyFilterSide();
        expect(c.filteredParticipants.map((p: any) => p.profileid).sort())
          .withContext(`${state} ${pick}: not "New = nobody, Exist = everyone"`).toEqual(['mv', 'nu', 'p0']);
      }
    }
    const c = make();
    c.onMetricClick('totalEnrolled');
    land(c); c.refreshOpenPanelPeople();
    c.filterOption = 'new'; c.applyFilterSide();
    expect(names(c)).toEqual(['NU Alpha']);                      // once landed, the moved person is Exist
    c.filterOption = 'exist'; c.applyFilterSide();
    expect(names(c)).toEqual(['Moved Alpha', 'Pat Zero']);
  });

  it('a read that timed out but lands late still fills the dashboard in; a late read never overrides a settled one', () => {
    const c = make();
    let settled = 0; c.onNewUserDataSettled = () => { settled++; };
    const late = { nu: { name: 'NU Alpha' } };
    c.newUserDataState = 'failed'; c.destroyed = false;
    c.acceptLateNewUserData(late);
    expect(c.newUserDataState).toBe('ready');
    expect(c.mapProfileNew).toBe(late);
    expect(settled).toBe(1);
    c.acceptLateNewUserData({ other: {} });                      // already ready: ignored
    expect(c.mapProfileNew).toBe(late);
    expect(settled).toBe(1);
    const gone = make(); gone.onNewUserDataSettled = () => { settled++; };
    gone.newUserDataState = 'failed'; gone.destroyed = true;
    gone.acceptLateNewUserData(late);                            // the dashboard was left: nothing to fill in
    expect(gone.newUserDataState).toBe('failed');
    expect(settled).toBe(1);
  });

  it('names Share Claimed referrals once it lands', () => {
    const c = make();
    c.showParticipantPanel = true;
    c.selectedStatusInfo = { status: 'shareClaimed' };
    c.selectedParticipants = [{ profileid: 'p0', name: 'Pat Zero', referredNames: ['Unknown'], referredIds: ['nu'] }];
    land(c); c.refreshOpenPanelPeople();
    expect(c.selectedParticipants[0].referredNames).toEqual(['NU Alpha']);
  });
});
