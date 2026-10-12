import { EiflixoperationsdashboardComponent } from './eiflixoperationsdashboard.component';

/**
 * EiFlix Mobile App Logs — filtering, sorting and paging over rows already loaded from `loginlog`.
 * Built from the prototype: the real component needs Firestore and the participant directory, and
 * none of these rules depend on either.
 */
describe('EiflixoperationsdashboardComponent — EiFlix Mobile App Logs', () => {
  const at = (iso: string) => new Date(iso);
  const row = (id: string, profileid: string, name: string, iso: string, os: string, v: string, isNewUser = false) =>
    ({ id, profileid, name, date: at(iso), dateLabel: iso, device_os: os, current_version: v, isNewUser });

  // p1 is still a new user (new_user_data, not moved to paid); p2 and p3 are existing.
  function make(rows = [
    row('a', 'p1', 'Anita', '2026-09-21T09:00:00', 'android', '2.3.1', true),
    row('b', 'p2', 'Bala', '2026-09-21T11:30:00', 'ios', '2.3.0'),
    row('c', 'p1', 'Anita', '2026-09-20T08:00:00', 'android', '2.2.9', true),
    row('d', 'p3', 'Chitra', '2026-09-15T20:00:00', 'ios', '2.3.1'),
  ]): any {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
    c.logAll = rows; c.logShown = []; c.logPage = [];
    c.logSearch = ''; c.logNameSearch = ''; c.logNameFilter = 'all'; c.logOsFilter = 'all';
    c.logUserTypeFilter = 'all';
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
    c.logSearch = 'x'; c.logNameFilter = 'p1'; c.logOsFilter = 'ios'; c.logUserTypeFilter = 'new'; c.onLogFilterChange();
    expect(c.logFilterCount).toBe(4);
    c.clearLogFilters();
    expect(c.logFilterCount).toBe(0);
    expect(c.logUserTypeFilter).toBe('all');
    expect(ids(c).length).toBe(4);
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

  it('filters to new users, to existing users, and the two halves are a complete split', () => {
    const c = make();
    c.logUserTypeFilter = 'new'; c.onLogFilterChange();
    expect(ids(c)).toEqual(['a', 'c']);                 // p1's two logins

    c.logUserTypeFilter = 'existing'; c.onLogFilterChange();
    expect(ids(c)).toEqual(['b', 'd']);                 // p2 and p3

    // No row belongs to neither half: a person who has been moved to paid is existing, not missing.
    c.logUserTypeFilter = 'all'; c.onLogFilterChange();
    expect(ids(c).length).toBe(4);
  });

  it('combines the user type with the other filters rather than replacing them', () => {
    const c = make();
    c.logUserTypeFilter = 'new'; c.logOsFilter = 'android'; c.onLogFilterChange();
    expect(ids(c)).toEqual(['a', 'c']);                 // both of p1's rows are android
    c.logOsFilter = 'ios'; c.onLogFilterChange();
    expect(ids(c)).toEqual([]);                         // no new user logged in from ios
    c.logUserTypeFilter = 'existing'; c.onLogFilterChange();
    expect(ids(c)).toEqual(['b', 'd']);
    c.logSearch = 'chitra'; c.onLogFilterChange();      // narrows further, does not reset the type
    expect(ids(c)).toEqual(['d']);
    expect(c.logUserTypeFilter).toBe('existing');
  });

  it('counts unique people within the chosen user type', () => {
    const c = make();
    c.logUserTypeFilter = 'new'; c.onLogFilterChange();
    expect(c.logUniquePeopleShown).toBe(1);             // two rows, one person
    expect(c.logUniquePeople).toBe(3);                  // the range total ignores filters
  });

  it('re-pages when the user type shrinks the list', () => {
    const c = make(); c.setLogPageSize(2);
    c.logNext();
    expect(c.logPageIndex).toBe(1);
    c.logUserTypeFilter = 'new'; c.onLogFilterChange(); // 2 rows → 1 page
    expect(c.logPageIndex).toBe(0);
    expect(c.logPage.map((r: any) => r.id)).toEqual(['a', 'c']);
  });

  it('labels the range', () => {
    const c = make();
    c.logRange = 1; expect(c.logRangeLabel).toBe('today');
    c.logRange = 7; expect(c.logRangeLabel).toBe('last 7 days');
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Which loginlog documents belong on the table, and what the Device OS column reads.
  // The apps set app:'EiFlix'; the web client sets the boolean eiflixweb:true instead.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('isEiflixLogin', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);

    it('keeps an app sign-in', () => {
      expect(c.isEiflixLogin({ app: 'EiFlix' })).toBe(true);
    });

    it('keeps a web sign-in, which carries no app field at all', () => {
      expect(c.isEiflixLogin({ eiflixweb: true })).toBe(true);
    });

    it('keeps a row that carries both', () => {
      expect(c.isEiflixLogin({ app: 'EiFlix', eiflixweb: true })).toBe(true);
    });

    it('drops another product', () => {
      expect(c.isEiflixLogin({ app: 'SolarVoice' })).toBe(false);
      expect(c.isEiflixLogin({ app: 'SolarVoice', eiflixweb: false })).toBe(false);
    });

    it('needs the flag to be the BOOLEAN true, not merely truthy', () => {
      // The string 'false' is truthy. Accepting it would pull in rows that explicitly said
      // they were not web.
      expect(c.isEiflixLogin({ eiflixweb: 'true' })).toBe(false);
      expect(c.isEiflixLogin({ eiflixweb: 'false' })).toBe(false);
      expect(c.isEiflixLogin({ eiflixweb: 1 })).toBe(false);
    });

    it('drops a row with neither marker, and survives a missing document', () => {
      expect(c.isEiflixLogin({})).toBe(false);
      expect(c.isEiflixLogin(null)).toBe(false);
      expect(c.isEiflixLogin(undefined)).toBe(false);
    });
  });

  describe('logDeviceOs', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);

    it('reads "web" for a web sign-in', () => {
      expect(c.logDeviceOs({ eiflixweb: true })).toBe('web');
    });

    it('"web" WINS over whatever device_os the row happens to carry', () => {
      // The flag says where the session actually happened; the other field may be left over.
      expect(c.logDeviceOs({ eiflixweb: true, device_os: 'android' })).toBe('web');
    });

    it('passes the stored OS through for an app sign-in', () => {
      expect(c.logDeviceOs({ app: 'EiFlix', device_os: 'android' })).toBe('android');
      expect(c.logDeviceOs({ app: 'EiFlix', device_os: '  ios  ' })).toBe('ios');
    });

    it('does not turn a non-true flag into "web"', () => {
      expect(c.logDeviceOs({ eiflixweb: false, device_os: 'ios' })).toBe('ios');
      expect(c.logDeviceOs({ eiflixweb: 'true', device_os: 'ios' })).toBe('ios');
    });

    it('is empty rather than "undefined" when there is no OS', () => {
      expect(c.logDeviceOs({ app: 'EiFlix' })).toBe('');
      expect(c.logDeviceOs({ app: 'EiFlix', device_os: null })).toBe('');
      expect(c.logDeviceOs(null)).toBe('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // EiFlix Report — unique PEOPLE per surface, split existing/new.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('deviceClass', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);

    it('claims an exact "web" before anything else can', () => {
      expect(c.deviceClass('web')).toBe('web');
      expect(c.deviceClass(' WEB ')).toBe('web');
    });

    it('recognises the free-text shapes a client really sends', () => {
      expect(c.deviceClass('android')).toBe('android');
      expect(c.deviceClass('Android 13')).toBe('android');
      expect(c.deviceClass('ios')).toBe('ios');
      expect(c.deviceClass('iOS 17.2')).toBe('ios');
      expect(c.deviceClass('iPadOS')).toBe('ios');
      expect(c.deviceClass('iPhone')).toBe('ios');
    });

    it('calls anything else other rather than guessing', () => {
      expect(c.deviceClass('')).toBe('other');
      expect(c.deviceClass(null)).toBe('other');
      expect(c.deviceClass('windows')).toBe('other');
    });
  });

  describe('buildReportCounts', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
    const r = (profileid: string, device_os: string, isNewUser = false) => ({ profileid, device_os, isNewUser });

    it('counts PEOPLE, not rows — nine sign-ins by one person is one person', () => {
      const out = c.buildReportCounts([r('p1', 'android'), r('p1', 'android'), r('p1', 'Android 13')]);
      expect(out.android.total).toBe(1);
      expect(out.mobileTotal.total).toBe(1);
    });

    it('splits each surface into existing and new', () => {
      const out = c.buildReportCounts([
        r('p1', 'android'), r('p2', 'android', true),
        r('p3', 'ios'), r('p4', 'ios', true), r('p5', 'ios', true),
      ]);
      expect(out.android).toEqual({ total: 2, new: 1, existing: 1 });
      expect(out.ios).toEqual({ total: 3, new: 2, existing: 1 });
    });

    it('DEDUPLICATES the mobile total — a person on both phones is one person', () => {
      // Total is therefore LESS than Android + iOS, which is the correct answer, not a bug.
      const out = c.buildReportCounts([r('p1', 'android'), r('p1', 'ios'), r('p2', 'android')]);
      expect(out.android.total).toBe(2);
      expect(out.ios.total).toBe(1);
      expect(out.mobileTotal.total).toBe(2);   // NOT 3
    });

    it('no longer counts web from loginlog — that bucket is PARKED', () => {
      // Operator change 2026-10-09: Web App Users come from content analytics instead, via
      // buildConsumption().webUsers. The loginlog rule is commented out, not deleted, and this
      // asserts it stays switched off so an accidental un-parking is caught.
      const out = c.buildReportCounts([r('p1', 'android'), r('p1', 'web'), r('p2', 'web', true)]);
      expect(out.mobileTotal.total).toBe(1);
      expect(out.web).toEqual({ total: 0, new: 0, existing: 0 });
    });

    it('keeps web rows out of the mobile buckets entirely', () => {
      const out = c.buildReportCounts([r('p1', 'web'), r('p2', 'web')]);
      expect(out.android.total).toBe(0);
      expect(out.ios.total).toBe(0);
      expect(out.mobileTotal.total).toBe(0);
    });

    it('existing + new always equals total, in every bucket', () => {
      const out = c.buildReportCounts([
        r('p1', 'android'), r('p2', 'android', true), r('p3', 'ios', true), r('p4', 'web'),
      ]);
      for (const k of ['android', 'ios', 'mobileTotal', 'web']) {
        expect(out[k].existing + out[k].new).toBe(out[k].total);
      }
    });

    it('ignores a row with no profileid — there is no person to count', () => {
      const out = c.buildReportCounts([r('', 'android'), r('  ', 'ios'), r('p1', 'android')]);
      expect(out.android.total).toBe(1);
      expect(out.ios.total).toBe(0);
    });

    it('ignores an unrecognised OS rather than inventing a bucket for it', () => {
      const out = c.buildReportCounts([r('p1', 'windows'), r('p2', 'android')]);
      expect(out.mobileTotal.total).toBe(1);
      expect(out.web.total).toBe(0);
    });

    it('returns all zeros for nothing at all', () => {
      for (const input of [[], null, undefined]) {
        const out = c.buildReportCounts(input);
        expect(out.android).toEqual({ total: 0, new: 0, existing: 0 });
        expect(out.web).toEqual({ total: 0, new: 0, existing: 0 });
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Total Content Consumption — summed `totaltimespend` per platform_name, split by cohort.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('formatConsumption', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);

    it('reads as hours, minutes and seconds with the small parts padded', () => {
      expect(c.formatConsumption(127 * 3600 + 6 * 60 + 42)).toBe('127 hours 06 minutes 42 seconds');
    });

    it('does NOT roll hours over at 24 — this is a total across many people', () => {
      expect(c.formatConsumption(100 * 3600)).toBe('100 hours 00 minutes 00 seconds');
    });

    it('pads minutes and seconds but not hours', () => {
      expect(c.formatConsumption(3661)).toBe('1 hours 01 minutes 01 seconds');
      expect(c.formatConsumption(59)).toBe('0 hours 00 minutes 59 seconds');
    });

    it('treats nothing, and nonsense, as zero rather than NaN', () => {
      for (const v of [0, null, undefined, NaN, -5, 'abc']) {
        expect(c.formatConsumption(v)).toBe('0 hours 00 minutes 00 seconds');
      }
    });

    it('floors a fractional second rather than printing a decimal', () => {
      expect(c.formatConsumption(61.9)).toBe('0 hours 01 minutes 01 seconds');
    });
  });

  describe('buildConsumption', () => {
    // isNewUserProfile reads nudMap; give the prototype one so the cohort split is real.
    const make = (newIds: string[] = []) => {
      const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
      c.nudMap = new Map(newIds.map(id => [id, { name: id }]));   // no movedtoexist → still new
      return c;
    };
    const doc = (platform_name: string, totaltimespend: number, profileid = 'p1') =>
      ({ platform_name, totaltimespend, profileid });

    it('sums per surface on the platform_name the operator specified', () => {
      const out = make().buildConsumption([
        doc('eiflixapp', 100), doc('eiflixapp', 50), doc('Eiflixweb', 25),
      ]);
      expect(out.app.totalSeconds).toBe(150);
      expect(out.web.totalSeconds).toBe(25);
    });

    it('matches platform_name case-insensitively', () => {
      // platformKey() preserves case elsewhere, so 'Eiflixweb' and 'eiflixweb' are the same surface
      // and must not land in different buckets.
      const out = make().buildConsumption([
        doc('Eiflixweb', 10), doc('eiflixweb', 10), doc('EIFLIXWEB', 10),
        doc('EiflixApp', 7), doc(' eiflixapp ', 3),
      ]);
      expect(out.web.totalSeconds).toBe(30);
      expect(out.app.totalSeconds).toBe(10);
    });

    it('ignores every other platform', () => {
      const out = make().buildConsumption([
        doc('SolarVoice', 999), doc('breakthroughsapp', 999), doc('', 999), doc('eiflixapp', 5),
      ]);
      expect(out.app.totalSeconds).toBe(5);
      expect(out.web.totalSeconds).toBe(0);
    });

    it('splits by cohort using the same new-user rule as the rest of the screen', () => {
      const out = make(['nu1']).buildConsumption([
        doc('eiflixapp', 60, 'p1'), doc('eiflixapp', 40, 'nu1'),
        doc('Eiflixweb', 30, 'nu1'),
      ]);
      expect(out.app).toEqual({ totalSeconds: 100, newSeconds: 40, existingSeconds: 60, workshopSeconds: 0, librarySeconds: 0 });
      expect(out.web).toEqual({ totalSeconds: 30, newSeconds: 30, existingSeconds: 0, workshopSeconds: 0, librarySeconds: 0 });
    });

    it('existing + new always equals total', () => {
      const out = make(['nu1']).buildConsumption([
        doc('eiflixapp', 11, 'p1'), doc('eiflixapp', 7, 'nu1'), doc('Eiflixweb', 5, 'p2'),
      ]);
      for (const k of ['app', 'web']) {
        expect(out[k].existingSeconds + out[k].newSeconds).toBe(out[k].totalSeconds);
      }
    });

    it('skips rows with no usable time rather than counting them as zero-second sessions', () => {
      const out = make().buildConsumption([
        doc('eiflixapp', 0), doc('eiflixapp', -10), doc('eiflixapp', NaN as any), doc('eiflixapp', 9),
      ]);
      expect(out.app.totalSeconds).toBe(9);
    });

    it('counts a row with no profileid as existing rather than dropping its time', () => {
      // The seconds were really watched; we just cannot attribute the person to a cohort.
      const out = make().buildConsumption([doc('eiflixapp', 42, '')]);
      expect(out.app).toEqual({ totalSeconds: 42, newSeconds: 0, existingSeconds: 42, workshopSeconds: 0, librarySeconds: 0 });
    });

    it('returns zeros for nothing at all', () => {
      for (const input of [[], null, undefined]) {
        const out = make().buildConsumption(input);
        expect(out.app).toEqual({ totalSeconds: 0, newSeconds: 0, existingSeconds: 0, workshopSeconds: 0, librarySeconds: 0 });
        expect(out.web).toEqual({ totalSeconds: 0, newSeconds: 0, existingSeconds: 0, workshopSeconds: 0, librarySeconds: 0 });
        expect(out.webUsers).toEqual({ total: 0, new: 0, existing: 0 });
      }
    });

    it('counts WEB APP USERS from these same rows — unique people, not sessions', () => {
      // Operator change 2026-10-09: Web App Users come from content analytics
      // (platform_name 'Eiflixweb'), not from loginlog's device_os.
      const out = make(['nu1']).buildConsumption([
        doc('Eiflixweb', 10, 'p1'), doc('eiflixweb', 10, 'p1'),   // same person twice → one person
        doc('EIFLIXWEB', 10, 'nu1'),
        doc('eiflixapp', 99, 'p9'),                               // mobile never counts here
      ]);
      expect(out.webUsers).toEqual({ total: 2, new: 1, existing: 1 });
    });

    it('a web row with no profileid still counts its SECONDS but not a PERSON', () => {
      // The two answers legitimately differ on the same row: the time was watched, but there is
      // nobody to count.
      const out = make().buildConsumption([doc('Eiflixweb', 42, '')]);
      expect(out.web.totalSeconds).toBe(42);
      expect(out.webUsers).toEqual({ total: 0, new: 0, existing: 0 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Workshop vs Library — a SECOND cut of the same total, by the `from` field.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('buildConsumption — workshop / library split', () => {
    const make = (newIds: string[] = []) => {
      const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
      c.nudMap = new Map(newIds.map(id => [id, { name: id }]));
      return c;
    };
    const doc = (platform_name: string, totaltimespend: number, from?: string, profileid = 'p1') =>
      ({ platform_name, totaltimespend, from, profileid });

    it('splits by `from` on each surface independently', () => {
      const out = make().buildConsumption([
        doc('eiflixapp', 100, 'eiflixworkshop'), doc('eiflixapp', 40, 'eiflixcontent'),
        doc('Eiflixweb', 7, 'eiflixworkshop'), doc('Eiflixweb', 3, 'eiflixcontent'),
      ]);
      expect(out.app.workshopSeconds).toBe(100);
      expect(out.app.librarySeconds).toBe(40);
      expect(out.web.workshopSeconds).toBe(7);
      expect(out.web.librarySeconds).toBe(3);
    });

    it('matches `from` case-insensitively, like platform_name', () => {
      const out = make().buildConsumption([
        doc('eiflixapp', 10, 'EiflixWorkshop'), doc('eiflixapp', 5, ' EIFLIXCONTENT '),
      ]);
      expect(out.app.workshopSeconds).toBe(10);
      expect(out.app.librarySeconds).toBe(5);
    });

    it('still counts time towards the TOTAL when `from` is missing or unknown', () => {
      // The split is a second cut of the total, not a filter on it. Workshop + Library are NOT
      // required to equal Total, and time with an unrecognised origin must not vanish.
      const out = make().buildConsumption([
        doc('eiflixapp', 60, 'eiflixworkshop'), doc('eiflixapp', 25, 'somewhere-else'),
        doc('eiflixapp', 15),
      ]);
      expect(out.app.totalSeconds).toBe(100);
      expect(out.app.workshopSeconds).toBe(60);
      expect(out.app.librarySeconds).toBe(0);
      expect(out.app.workshopSeconds + out.app.librarySeconds).toBeLessThan(out.app.totalSeconds);
    });

    it('is independent of the cohort split — the same seconds appear in both cuts', () => {
      const out = make(['nu1']).buildConsumption([
        doc('eiflixapp', 30, 'eiflixworkshop', 'nu1'), doc('eiflixapp', 20, 'eiflixcontent', 'p1'),
      ]);
      expect(out.app.totalSeconds).toBe(50);
      expect(out.app.newSeconds).toBe(30);        // the workshop row, by cohort
      expect(out.app.existingSeconds).toBe(20);
      expect(out.app.workshopSeconds).toBe(30);   // the same seconds, by origin
      expect(out.app.librarySeconds).toBe(20);
    });

    it('never counts another platform into either split', () => {
      const out = make().buildConsumption([doc('SolarVoice', 9999, 'eiflixworkshop')]);
      expect(out.app.workshopSeconds).toBe(0);
      expect(out.web.workshopSeconds).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Purchases & signups — timestamp fields counted inside the report window.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('countInWindow', () => {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
    const start = new Date(2026, 9, 1, 0, 0, 0).getTime();
    const end = new Date(2026, 9, 9, 23, 59, 59, 999).getTime();
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0);

    it('counts documents whose field falls inside the window', () => {
      const docs = [{ movedon: at(2026, 9, 2) }, { movedon: at(2026, 9, 8) }];
      expect(c.countInWindow(docs, 'movedon', start, end)).toBe(2);
    });

    it('excludes documents outside it, on either side', () => {
      const docs = [{ movedon: at(2026, 8, 30) }, { movedon: at(2026, 9, 20) }];
      expect(c.countInWindow(docs, 'movedon', start, end)).toBe(0);
    });

    it('includes both edges', () => {
      expect(c.countInWindow([{ x: new Date(start) }, { x: new Date(end) }], 'x', start, end)).toBe(2);
    });

    it('counts only the field it was asked about', () => {
      // movedon and created live on the SAME documents, so a count that read the wrong field
      // would still return a plausible number.
      const docs = [
        { created: at(2026, 9, 3), movedon: at(2026, 8, 1) },
        { created: at(2026, 8, 1), movedon: at(2026, 9, 3) },
      ];
      expect(c.countInWindow(docs, 'created', start, end)).toBe(1);
      expect(c.countInWindow(docs, 'movedon', start, end)).toBe(1);
    });

    it('accepts the timestamp shapes THIS read path produces', () => {
      // The Angular SDK hands back real Timestamps (.toDate()); a plain Date turns up in locally
      // built rows. The raw {seconds} shape comes from the ADMIN SDK and never reaches this
      // component, so toDate() does not handle it — such a value is simply not counted, which the
      // unparseable case below pins.
      const ms = at(2026, 9, 5).getTime();
      const docs = [
        { x: new Date(ms) },
        { x: { toDate: () => new Date(ms) } },
      ];
      expect(c.countInWindow(docs, 'x', start, end)).toBe(2);
    });

    it('ignores a missing, null or unparseable field instead of throwing', () => {
      const docs = [{}, { x: null }, { x: 'not a date' }, { x: undefined }, { x: { seconds: 123 } }];
      expect(() => c.countInWindow(docs, 'x', start, end)).not.toThrow();
      expect(c.countInWindow(docs, 'x', start, end)).toBe(0);
    });

    it('copes with no documents at all', () => {
      expect(c.countInWindow([], 'x', start, end)).toBe(0);
      expect(c.countInWindow(null, 'x', start, end)).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // The exported workbook's grid. The expected labels and merges below are taken from the
  // operator's existing hand-written "EiFlix Weekly Report.xlsx", so this test is what keeps the
  // generated file interchangeable with it.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  describe('buildReportSheet', () => {
    const make = () => {
      const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
      c.repRange = 7;
      c.repCounts = {
        android: { existing: 38, new: 20, total: 58 },
        ios: { existing: 42, new: 10, total: 52 },
        mobileTotal: { existing: 80, new: 30, total: 110 },
        web: { existing: 250, new: 51, total: 301 },
      };
      const cons = (e: number, n: number, t: number, w: number, l: number) =>
        ({ existingSeconds: e, newSeconds: n, totalSeconds: t, workshopSeconds: w, librarySeconds: l });
      c.repConsumption = { app: cons(3661, 7322, 10983, 60, 120), web: cons(10, 20, 30, 40, 50) };
      c.repWebUsers = { existing: 250, new: 51, total: 301 };
      c.repNewUsersJoined = 3; c.repJourneyPurchased = 1; c.repMasterclass = 2;
      return c;
    };

    it('lays the labels out exactly where the hand-written workbook puts them', () => {
      const { rows } = make().buildReportSheet();
      expect(rows[0][0]).toBe('EiFlix Weekly Report');            // row 1
      expect(rows[4][0]).toBe('EiFlix Mobile App Users');          // row 5
      expect(rows[5]).toEqual(['Android', '', 'iOS', '', 'Total']); // row 6
      expect(rows[6]).toEqual(['Existing Users', 'New Users', 'Existing Users', 'New Users', '']);
      expect(rows[9][0]).toBe('EiFlix Web App Users');             // row 10
      expect(rows[10]).toEqual(['Existing Users', 'New Users', 'Total', '', '']);
      expect(rows[13][0]).toBe('Total Content Consumption');       // row 14
      expect(rows[14][0]).toBe('EiFlix Mobile App Users');         // row 15
      expect(rows[15]).toEqual(['Existing Users', 'New Users', 'Total', 'Workshop Videos', 'Library Videos']);
      expect(rows[18][0]).toBe('EiFlix Web App Users');            // row 19
      expect(rows[22]).toEqual(['New Users Joined in EiFlix', 'Journey Purchased', 'Masterclass Purchase', '', '']);
    });

    it('keeps the blank spacer rows, so the sections sit where they do in the original', () => {
      const { rows } = make().buildReportSheet();
      for (const i of [1, 3, 8, 12, 17, 21]) {
        expect(rows[i].every(v => v === '')).withContext(`row ${i + 1} is a spacer`).toBe(true);
      }
      expect(rows.length).withContext('the sheet ends after the purchases figures').toBe(24);
    });

    it('puts the right numbers in the right cells', () => {
      const { rows } = make().buildReportSheet();
      expect(rows[7]).toEqual([38, 20, 42, 10, 110]);   // android ex/new, ios ex/new, mobile total
      expect(rows[11]).toEqual([250, 51, 301, '', '']); // web ex/new/total
      expect(rows[23]).toEqual([3, 1, 2, '', '']);      // joined, journey, masterclass — that ORDER
    });

    it('writes the consumption cells as formatted durations, not raw seconds', () => {
      const { rows } = make().buildReportSheet();
      expect(rows[16][0]).toBe('1 hours 01 minutes 01 seconds');
      expect(rows[16][2]).toBe('3 hours 03 minutes 03 seconds');
      expect(rows[20][4]).toBe('0 hours 00 minutes 50 seconds');
    });

    it('merges the same bands as the original, including the two-row Total header', () => {
      const { merges } = make().buildReportSheet();
      const has = (r1: number, c1: number, r2: number, c2: number) =>
        merges.some((m: any) => m.s.r === r1 && m.s.c === c1 && m.e.r === r2 && m.e.c === c2);
      expect(has(0, 0, 0, 4)).withContext('title spans A1:E1').toBe(true);
      expect(has(2, 0, 2, 4)).withContext('period spans A3:E3').toBe(true);
      expect(has(5, 0, 5, 1)).withContext('Android spans A6:B6').toBe(true);
      expect(has(5, 2, 5, 3)).withContext('iOS spans C6:D6').toBe(true);
      expect(has(5, 4, 6, 4)).withContext('Total spans E6:E7 — two rows tall').toBe(true);
      expect(has(9, 0, 9, 2)).withContext('Web App Users spans A10:C10').toBe(true);
      expect(has(13, 0, 13, 4)).withContext('Total Content Consumption spans A14:E14').toBe(true);
      expect(merges.length).toBe(10);
    });

    it('every row is five columns wide, so no merge can point past the grid', () => {
      const { rows } = make().buildReportSheet();
      for (const [i, r] of rows.entries()) expect(r.length).withContext(`row ${i + 1}`).toBe(5);
    });
  });
});

/**
 * Users section date range (operator 2026-10-12) — Today / 7D / 30D plus a manual From-To over the
 * two date-driven cards. Built from the prototype: all of this runs on documents already in memory,
 * which is the point — a range change costs no Firestore read.
 *
 * The seed is built RELATIVE to today with the same setDate() arithmetic the component uses, because
 * the component reads `new Date()` and the spec cannot freeze it.
 */
describe('EiflixoperationsdashboardComponent — Users section date range', () => {
  const daysAgo = (n: number, h = 9) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /**
   * NEW side (never moved):  todayNew -0d · weekNew -3d · oldNew -20d · undatedNew (no created)
   * PAID side (moved):       paidToday moved -0d (created -40d) · paidOld moved -20d
   *                          paidWithPm moved -0d, and its participant-metadata twin has NO move
   *                          date — the trap: the row renders from pm, the date must come from the
   *                          new-user doc.
   */
  function make(): any {
    const c: any = Object.create(EiflixoperationsdashboardComponent.prototype);
    c.reducedMotion = true;          // animateCount jumps straight to the total
    c.activePanel = null;
    c.nudMap = new Map();
    c.pmMap = new Map([['paidWithPm', { name: 'Paid With Pm', customerstatus: 'active' }]]);
    c.usersRange = 'all';
    c.usersCustomStart = '';
    c.usersCustomEnd = '';
    c.usersRangeLabel = '';
    c.cards = [
      { key: 'total-new-users', title: 'Total New Users', caption: 'Signed up · not yet moved to paid', users: [], displayCount: 0 },
      { key: 'new-users-to-paid', title: 'New Users to Paid', caption: 'Moved to existing / paid profiles', users: [], displayCount: 0 },
      { key: 'big-participants', title: 'Total B!G Participants', caption: 'Active in a B!G journey', users: [], displayCount: 0 },
    ];
    c.splitUsers([
      { id: 'todayNew', name: 'Today New', created: daysAgo(0) },
      { id: 'weekNew', name: 'Week New', created: daysAgo(3) },
      { id: 'oldNew', name: 'Old New', created: daysAgo(20) },
      { id: 'undatedNew', name: 'Undated New' },
      { id: 'paidToday', name: 'Paid Today', created: daysAgo(40), movedtoexist: true, movedon: daysAgo(0) },
      { id: 'paidOld', name: 'Paid Old', created: daysAgo(40), movedtoexist: true, movedon: daysAgo(20) },
      { id: 'paidWithPm', name: 'Paid With Pm', created: daysAgo(40), movedtoexist: true, movedon: daysAgo(0) },
    ]);
    return c;
  }

  const card = (c: any, key: string) => c.cards.find((x: any) => x.key === key);
  const ids = (c: any, key: string) => card(c, key).users.map((u: any) => u.id).sort();

  it('shows every row on All — the default, so the headline totals keep their old meaning', () => {
    const c = make();
    expect(c.usersRange).withContext('All is the default').toBe('all');
    expect(ids(c, 'total-new-users')).toEqual(['oldNew', 'todayNew', 'undatedNew', 'weekNew']);
    expect(ids(c, 'new-users-to-paid')).toEqual(['paidOld', 'paidToday', 'paidWithPm']);
    expect(card(c, 'total-new-users').displayCount).toBe(4);
    expect(card(c, 'new-users-to-paid').displayCount).toBe(3);
  });

  it('narrows Total New Users by signup date', () => {
    const c = make();
    c.setUsersRange('today');
    expect(ids(c, 'total-new-users')).withContext('only the signup from today').toEqual(['todayNew']);
    c.setUsersRange('7d');
    expect(ids(c, 'total-new-users')).withContext('-3d is inside 7D, -20d is not').toEqual(['todayNew', 'weekNew']);
    c.setUsersRange('30d');
    expect(ids(c, 'total-new-users')).toEqual(['oldNew', 'todayNew', 'weekNew']);
  });

  it('narrows New Users to Paid by MOVE date, not by signup date', () => {
    const c = make();
    // Every paid row was created 40 days ago, so a filter that read the signup
    // date would empty this card on every window — which is the bug this pins.
    c.setUsersRange('today');
    expect(ids(c, 'new-users-to-paid')).toEqual(['paidToday', 'paidWithPm']);
    c.setUsersRange('30d');
    expect(ids(c, 'new-users-to-paid')).toEqual(['paidOld', 'paidToday', 'paidWithPm']);
    expect(ids(c, 'total-new-users'))
      .withContext('the paid rows must never leak into the new-users card')
      .toEqual(['oldNew', 'todayNew', 'weekNew']);
  });

  it('reads the move date off the new-user doc even when the row renders from a full profile', () => {
    const c = make();
    c.setUsersRange('today');
    // paidWithPm's participant-metadata twin carries NO move date. Reading the
    // date off the rendered source would drop everybody with a full profile.
    expect(ids(c, 'new-users-to-paid')).toContain('paidWithPm');
    expect(card(c, 'new-users-to-paid').users.find((u: any) => u.id === 'paidWithPm').name)
      .withContext('still rendered from participant metadata')
      .toBe('Paid With Pm');
  });

  it('drops undated rows while a range is active and keeps them when there is none', () => {
    const c = make();
    c.setUsersRange('30d');
    expect(ids(c, 'total-new-users')).withContext('no signup date -> no window').not.toContain('undatedNew');
    c.setUsersRange('all');
    expect(ids(c, 'total-new-users')).toContain('undatedNew');
  });

  it('applies a manual From-To range, and tolerates a reversed pick', () => {
    const c = make();
    c.usersCustomStart = ymd(daysAgo(4));
    c.usersCustomEnd = ymd(daysAgo(2));
    c.applyUsersCustom();
    expect(c.usersRange).toBe('custom');
    expect(ids(c, 'total-new-users')).withContext('-3d is the only signup in the window').toEqual(['weekNew']);

    // Reversed: the earlier date is used as the start, so the same set survives.
    c.usersCustomStart = ymd(daysAgo(2));
    c.usersCustomEnd = ymd(daysAgo(4));
    c.applyUsersCustom();
    expect(ids(c, 'total-new-users')).toEqual(['weekNew']);
  });

  it('ignores a half-filled manual range rather than filtering on nothing', () => {
    const c = make();
    c.usersCustomStart = ymd(daysAgo(4));
    c.applyUsersCustom();
    expect(c.usersRange).withContext('one date is not a range').toBe('all');
    expect(c.usersCustomHint).withContext('the header hint shows').toBe(true);
    expect(ids(c, 'total-new-users')).toEqual(['oldNew', 'todayNew', 'undatedNew', 'weekNew']);
  });

  it('clearing the range restores every row and the original captions', () => {
    const c = make();
    const baseNew = card(c, 'total-new-users').caption;
    const basePaid = card(c, 'new-users-to-paid').caption;
    const baseBig = card(c, 'big-participants').caption;

    c.setUsersRange('7d');
    expect(card(c, 'total-new-users').caption).withContext('caption names the window').toContain('7 days');
    expect(card(c, 'new-users-to-paid').caption).toContain('7 days');
    // B!G has no comparable date, so the card has to say it is not filtered.
    expect(card(c, 'big-participants').caption).toContain('not date-filtered');

    c.setUsersRange('all');
    expect(card(c, 'total-new-users').caption).toBe(baseNew);
    expect(card(c, 'new-users-to-paid').caption).toBe(basePaid);
    expect(card(c, 'big-participants').caption).toBe(baseBig);
    expect(ids(c, 'total-new-users')).toEqual(['oldNew', 'todayNew', 'undatedNew', 'weekNew']);
  });

  it('keeps the range when a realtime emission arrives', () => {
    const c = make();
    c.setUsersRange('today');
    expect(ids(c, 'total-new-users')).toEqual(['todayNew']);
    // A new document lands on the live listener — the active window must hold.
    c.splitUsers([
      { id: 'todayNew', name: 'Today New', created: daysAgo(0) },
      { id: 'oldNew', name: 'Old New', created: daysAgo(20) },
      { id: 'justSignedUp', name: 'Just Signed Up', created: daysAgo(0, 10) },
    ]);
    expect(ids(c, 'total-new-users')).toEqual(['justSignedUp', 'todayNew']);
  });
});
