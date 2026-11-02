import {
  ED2_FREE_JOURNEY, ED2_NO_JOURNEY, ed2Activity, ed2FreeUsers, ed2PaidIds, ed2StatusLabel, ed2ByStatus, ed2Csv, ed2Duration, ed2JourneyOf, ed2Journeys, ed2Options, ed2SourceKey,
  ed2LeftOut, ed2Matches, ed2Recipients, ed2MonthRange, ed2People, ed2Slices, ed2StatusInMonth, ed2StatusOf, ed2Totals,
} from './engagementdashboardv2.model';

/** Engagement dashboard v2 — content engagement shaping, without Firestore (operator 2026-11-02). */
describe('engagementdashboardv2 model', () => {
  const ts = (d: Date) => ({ toDate: () => d });

  it('covers the whole calendar month in local time', () => {
    const { start, end } = ed2MonthRange(2026, 1);   // February 2026
    expect(start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
    expect(ed2MonthRange(2026, 11).end).withContext('December rolls over correctly').toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it('slices the month back to back with no gap or overlap', () => {
    const { start, end } = ed2MonthRange(2026, 9);
    const s = ed2Slices(start, end, 4);
    expect(s.length).toBe(4);
    expect(s[0].from).toEqual(start);
    expect(s[3].to).toEqual(end);
    expect(s[3].last).toBeTrue();
    for (let i = 0; i < 3; i++) {
      expect(s[i].to.getTime()).withContext(`slice ${i} ends where ${i + 1} starts`).toBe(s[i + 1].from.getTime());
      expect(s[i].last).toBeFalse();
    }
    expect(ed2Slices(start, end, 1)).toEqual([{ from: start, to: end, last: true }]);
  });

  it('places a person by active journey, else last completed journey, else no journey', () => {
    expect(ed2JourneyOf({ activejourney: 'J1', lastcompletedjourney: 'J0' })).toEqual({ id: 'J1', from: 'active' });
    expect(ed2JourneyOf({ activejourney: null, lastcompletedjourney: 'J0' })).toEqual({ id: 'J0', from: 'last' });
    expect(ed2JourneyOf({ activejourney: '', lastcompletedjourney: '' })).toEqual({ id: ED2_NO_JOURNEY, from: 'none' });
    expect(ed2JourneyOf({ activejourney: { id: 'J9' } })).withContext('document reference').toEqual({ id: 'J9', from: 'active' });
  });

  it('keeps only active and non active people', () => {
    expect(ed2StatusOf({ customerstatus: 'active' })).toBe('active');
    expect(ed2StatusOf({ customerstatus: 'Non  Active' })).toBe('non active');
    expect(ed2StatusOf({ customerstatus: 'expired' })).toBeNull();
    expect(ed2StatusOf({})).toBeNull();
  });

  const metas = [
    { id: 'a', data: { profileid: 'a', name: 'Asha', email: 'asha@x.com', countrycode: '91', phonenumber: '98400', customerstatus: 'active', activejourney: 'J1' } },
    { id: 'b', data: { profileid: 'b', name: 'Bala', customerstatus: 'non active', activejourney: null, lastcompletedjourney: 'J1' } },
    { id: 'c', data: { profileid: 'c', name: 'Chitra', customerstatus: 'active', activejourney: 'J2' } },
    { id: 'd', data: { profileid: 'd', name: 'Dev', customerstatus: 'expired', activejourney: 'J1' } },
    { id: 'e', data: { profileid: 'e', name: 'Esha', customerstatus: 'active' } },
    { id: 'a2', data: { profileid: 'a', name: 'Asha dup', customerstatus: 'active', activejourney: 'J2' } },
  ];
  const logs = [
    { profileid: 'a', logdate: ts(new Date(2026, 9, 3)), totaltimespend: 600, from: 'eiflixcontent', platform_name: 'Eiflixweb' },
    { profileid: 'a', logdate: ts(new Date(2026, 9, 20)), totaltimespend: 3000, from: ' EiflixWorkshop ', platform_name: 'eiflixapp' },
    { profileid: 'b', logdate: ts(new Date(2026, 9, 5)), totaltimespend: 30, from: 'eiflixworkshop', platform_name: 'EiflixApp' },
    { profileid: 'd', logdate: ts(new Date(2026, 9, 6)), totaltimespend: 999, from: 'eiflixcontent', platform_name: 'eiflixapp' },
    { profileid: 'zz', logdate: ts(new Date(2026, 9, 7)), totaltimespend: 1, from: 'eiflixcontent', platform_name: 'eiflixapp' },
    { logdate: ts(new Date(2026, 9, 8)) },
  ];

  it('marks people engaged from their content views and sums the time', () => {
    const act = ed2Activity(logs);
    const ashaViews = [...act.byProfile.get('a')!.values()];
    expect(ashaViews).withContext('one entry per (from, platform) pair, keys trimmed and lower-cased').toEqual([
      { from: 'eiflixcontent', platform: 'eiflixweb', stat: { sessions: 1, seconds: 600, lastSeen: new Date(2026, 9, 3) } },
      { from: 'eiflixworkshop', platform: 'eiflixapp', stat: { sessions: 1, seconds: 3000, lastSeen: new Date(2026, 9, 20) } },
    ]);
    expect(act.byProfile.has('')).withContext('a log without profileid is ignored').toBeFalse();

    const people = ed2People(metas, act);
    expect(people.map((p) => p.profileid)).withContext('expired dropped, duplicate profile kept once').toEqual(['a', 'b', 'c', 'e']);
    const [a, b, c, e] = people;
    expect(a.engaged && b.engaged).toBeTrue();
    expect([a.sessions, a.seconds, a.lastSeen]).withContext('summed across sources').toEqual([2, 3600, new Date(2026, 9, 20)]);
    expect(a.byPlatform.map((f) => [f.label, f.seconds])).withContext('platforms too, most watched first').toEqual([['eiflixapp', 3000], ['Eiflixweb', 600]]);
    expect(a.byFrom.map((f) => [f.label, f.seconds])).withContext('most watched source first').toEqual([['eiflixworkshop', 3000], ['eiflixcontent', 600]]);   // one of each spelling: tie -> alphabetical
    expect(c.engaged || e.engaged).withContext('no views this month').toBeFalse();
    expect(a.phone).toBe('+91 98400');
    expect(a.journeyId).withContext('first doc wins').toBe('J1');
    expect(b.journeyFrom).toBe('last');
    expect(e.journeyId).toBe(ED2_NO_JOURNEY);
  });

  it('groups sources case-insensitively, labels them by their usual spelling, and filters by them', () => {
    expect(ed2SourceKey('  EiflixWorkshop ')).toBe('eiflixworkshop');
    expect(ed2SourceKey(undefined)).toBe('');
    const act = ed2Activity([
      ...logs,
      { profileid: 'c', logdate: ts(new Date(2026, 9, 9)), totaltimespend: 60, from: 'eiflixworkshop' },
      { profileid: 'c', logdate: ts(new Date(2026, 9, 9)), totaltimespend: 60 },
    ]);
    // 'eiflixworkshop' is written that way twice and 'EiflixWorkshop' once -> the common spelling wins.
    expect(ed2Options(act, 'from')).toEqual([
      { key: 'eiflixcontent', label: 'eiflixcontent' },
      { key: 'eiflixworkshop', label: 'eiflixworkshop' },
      { key: '', label: 'Not set' },
    ]);
    const onlyContent = ed2People(metas, act, { from: ['eiflixcontent'], platform: [] });
    expect(onlyContent.filter((p) => p.engaged).map((p) => p.profileid)).withContext('b and c watched only other sources').toEqual(['a']);
    expect(onlyContent[0].seconds).withContext('time counts only the picked source').toBe(600);
    expect(onlyContent[0].byFrom.map((f) => f.key)).toEqual(['eiflixcontent']);
    const notSet = ed2People(metas, act, { from: [''], platform: [] });
    expect(notSet.filter((p) => p.engaged).map((p) => p.profileid)).withContext('"Not set" is a source too').toEqual(['c']);
    expect(ed2People(metas, act, { from: [], platform: [] }).filter((p) => p.engaged).length).withContext('none picked = every source').toBe(3);
  });

  it('filters by platform too, AND across the two filters, OR within one', () => {
    const act = ed2Activity(logs);
    // 'eiflixapp' three times + 'EiflixApp' once among the month's views -> 'eiflixapp'.
    expect(ed2Options(act, 'platform')).toEqual([{ key: 'eiflixapp', label: 'eiflixapp' }, { key: 'eiflixweb', label: 'Eiflixweb' }]);
    const web = ed2People(metas, act, { from: [], platform: ['eiflixweb'] });
    expect(web.filter((p) => p.engaged).map((p) => p.profileid)).withContext('only Asha watched on web').toEqual(['a']);
    expect(web[0].seconds).toBe(600);
    expect(web[0].byPlatform.map((f) => f.key)).toEqual(['eiflixweb']);
    // Asha's workshop view was on the app, her content view on the web: no single view matches both.
    const both = ed2People(metas, act, { from: ['eiflixworkshop'], platform: ['eiflixweb'] });
    expect(both.filter((p) => p.engaged).length).withContext('a view must match BOTH filters').toBe(0);
    // A view with no platform_name comes from the Breakthroughs app — named, and sorted like any platform.
    const withApp = ed2Activity([...logs, { profileid: 'c', logdate: ts(new Date(2026, 9, 9)), totaltimespend: 60, from: 'eiflixcontent' }]);
    expect(ed2Options(withApp, 'platform').map((o) => o.label)).toEqual(['Breakthroughs app', 'eiflixapp', 'Eiflixweb']);
    expect(ed2People(metas, withApp, { from: [], platform: [''] }).filter((p) => p.engaged).map((p) => p.byPlatform[0].label)).toEqual(['Breakthroughs app']);
    expect(ed2Options(withApp, 'from').map((o) => o.label)).withContext('From keeps its own wording').not.toContain('Breakthroughs app');
    const either = ed2People(metas, act, { from: [], platform: ['eiflixweb', 'eiflixapp'] });
    expect(either.filter((p) => p.engaged).map((p) => p.profileid)).withContext('OR within one filter').toEqual(['a', 'b']);
  });

  it('places a person in a past month by their one subscription period', () => {
    const oct = ed2MonthRange(2026, 9);
    const d = (y: number, m: number, day: number) => ts(new Date(y, m, day));
    // Active today, subscription 15 Sep 2026 – 14 Sep 2027 -> ran in October.
    expect(ed2StatusInMonth({ customerstatus: 'active', subscriptionstart: d(2026, 8, 15), subscriptionend: d(2027, 8, 14) }, oct)).toBe('active');
    // Active today but started in November -> not a customer in October.
    expect(ed2StatusInMonth({ customerstatus: 'active', subscriptionstart: d(2026, 10, 1), subscriptionend: d(2027, 9, 31) }, oct)).toBe('notyet');
    // Non active today, completed journey ended 10 Oct -> one day in October is enough: Active then.
    expect(ed2StatusInMonth({ customerstatus: 'non active', lastsubscriptionstart: d(2025, 9, 11), lastsubscriptionend: d(2026, 9, 10) }, oct)).toBe('active');
    // Ended 30 Sep -> Non active in October.
    expect(ed2StatusInMonth({ customerstatus: 'non active', lastsubscriptionstart: d(2025, 9, 1), lastsubscriptionend: d(2026, 8, 30) }, oct)).toBe('non active');
    // Started on the month's last day still counts; no dates cannot be placed.
    expect(ed2StatusInMonth({ subscriptionstart: d(2026, 9, 31), subscriptionend: d(2027, 9, 30) }, oct)).toBe('active');
    expect(ed2StatusInMonth({ customerstatus: 'active' }, oct)).toBe('undated');
  });

  it('a past month uses the dates and leaves out who cannot be placed', () => {
    const oct = ed2MonthRange(2026, 9);
    const d = (y: number, m: number, day: number) => ts(new Date(y, m, day));
    const past = [
      { id: 'p', data: { profileid: 'p', customerstatus: 'non active', lastcompletedjourney: 'J1', lastsubscriptionstart: d(2025, 9, 11), lastsubscriptionend: d(2026, 9, 10) } },
      { id: 'q', data: { profileid: 'q', customerstatus: 'active', activejourney: 'J1', subscriptionstart: d(2026, 10, 1), subscriptionend: d(2027, 9, 31) } },
      { id: 'r', data: { profileid: 'r', customerstatus: 'active', activejourney: 'J1' } },
      { id: 's', data: { profileid: 's', customerstatus: 'expired', subscriptionstart: d(2026, 0, 1), subscriptionend: d(2027, 0, 1) } },
    ];
    const act = ed2Activity([]);
    expect(ed2People(past, act).map((p) => [p.profileid, p.status])).withContext('this month: live status').toEqual([['p', 'non active'], ['q', 'active'], ['r', 'active']]);
    expect(ed2People(past, act, { from: [], platform: [] }, oct).map((p) => [p.profileid, p.status])).withContext('October: from the dates').toEqual([['p', 'active']]);
    expect(ed2LeftOut(past, oct)).withContext('expired is never in the population').toEqual({ notYet: 1, undated: 1 });
  });

  it('adds free users from new_user_data: not moved, not paid, signed up by the month', () => {
    const d = (y: number, m: number, day: number) => ts(new Date(y, m, day));
    const nuds = [
      { id: 'zz', data: { name: 'Zara', email: 'zara@x.com', countryCode: '+44', phonenumber: '7700', created: d(2026, 5, 1) } },
      { id: 'mv', data: { name: 'Moved', movedtoexist: true, created: d(2026, 5, 1) } },
      { id: 'a', data: { name: 'Asha as new user', created: d(2026, 5, 1) } },
      { id: 'nw', data: { name: 'Newbie', created: d(2026, 10, 2) } },
      { id: 'nd', data: { name: 'No date' } },
    ];
    const act = ed2Activity(logs);   // 'zz' viewed on 7 Oct
    const paid = ed2PaidIds(metas);
    expect([...paid].sort()).withContext('active + non active only').toEqual(['a', 'b', 'c', 'e']);
    const now = ed2FreeUsers(nuds, act, paid);
    expect(now.people.map((p) => p.profileid)).withContext('moved and paid people are not free users').toEqual(['zz', 'nw', 'nd']);
    expect(now.people.every((p) => p.status === 'free' && p.journeyId === ED2_FREE_JOURNEY)).toBeTrue();
    expect(now.people[0]).toEqual(jasmine.objectContaining({ engaged: true, seconds: 1, phone: '+44 7700' }));
    const oct = ed2FreeUsers(nuds, act, paid, { from: [], platform: [] }, ed2MonthRange(2026, 9));
    expect(oct.people.map((p) => p.profileid)).withContext('October: signed up by then, or no date').toEqual(['zz', 'nd']);
    expect(oct.notYet).withContext('Newbie signed up in November').toBe(1);
    expect(ed2StatusLabel('free')).toBe('Free user');

    const all = [...ed2People(metas, act), ...now.people];
    const t = ed2Totals(all);
    expect([t.total, t.free.total, t.free.engaged]).toEqual([7, 3, 1]);
    const rows = ed2Journeys(all, new Map([['J1', 'Breakthrough'], ['J2', 'Accelerator']]), 'name', 'asc');
    expect(rows.map((r) => r.name)).withContext('No journey, then Free users, always last').toEqual(['Accelerator', 'Breakthrough', 'No journey', 'Free users']);
    expect(ed2Journeys(all, new Map(), 'total', 'desc').map((r) => r.id).slice(-1)).toEqual([ED2_FREE_JOURNEY]);
  });

  it('totals and groups by journey, "No journey" last', () => {
    const people = ed2People(metas, ed2Activity(logs));
    const t = ed2Totals(people);
    expect(t).toEqual({ total: 4, engaged: 2, notEngaged: 2, rate: 50, active: { total: 3, engaged: 1 }, nonActive: { total: 1, engaged: 1 }, free: { total: 0, engaged: 0 } });

    const names = new Map([['J1', 'Breakthrough'], ['J2', 'Accelerator']]);
    const rows = ed2Journeys(people, names);
    expect(rows.map((r) => [r.name, r.total, r.engaged, r.notEngaged, r.rate])).toEqual([
      ['Breakthrough', 2, 2, 0, 100],
      ['Accelerator', 1, 0, 1, 0],
      ['No journey', 1, 0, 1, 0],
    ]);
    expect(ed2Journeys(people, names, 'name', 'asc').map((r) => r.name)).withContext('No journey stays last').toEqual(['Accelerator', 'Breakthrough', 'No journey']);
    expect(ed2Journeys(people, new Map()).map((r) => r.name)[0]).withContext('unknown journey shows its id').toBe('J1');
  });

  it('filters by status and search', () => {
    const people = ed2People(metas, ed2Activity(logs));
    expect(ed2ByStatus(people, 'non active').map((p) => p.profileid)).toEqual(['b']);
    expect(ed2ByStatus(people, 'all').length).toBe(4);
    expect(ed2Matches(people[0], 'ASHA@')).toBeTrue();
    expect(ed2Matches(people[0], '98400')).toBeTrue();
    expect(ed2Matches(people[0], 'nobody')).toBeFalse();
  });

  it('hands the senders the workshop Communication dialog\'s recipient shape', () => {
    const [asha] = ed2People(metas, ed2Activity(logs));
    expect(ed2Recipients([asha])).toEqual([{
      profileid: 'a', name: 'Asha',
      metadata: { name: 'Asha', email: 'asha@x.com', phonenumber: '98400', countryCode: '91', countrycode: '91' },
    }]);
  });

  it('formats watch time and writes a CSV', () => {
    expect(ed2Duration(5400)).toBe('1h 30m');
    expect(ed2Duration(600)).toBe('10m');
    expect(ed2Duration(20)).toBe('< 1m');
    expect(ed2Duration(0)).toBe('—');
    const people = ed2People(metas, ed2Activity(logs));
    const csv = ed2Csv(people.slice(0, 1), new Map([['J1', 'Grow, Scale']]), () => '20 Oct 2026').split('\r\n');
    expect(csv[0]).toBe('Name,Email,Phone,Status,Journey,Engaged,Sessions,Watch time,Last watched,Watched from,Watched on');
    expect(csv[1]).toBe('Asha,asha@x.com,+91 98400,Active,"Grow, Scale",Yes,2,1h,20 Oct 2026,eiflixworkshop 50m; eiflixcontent 10m,eiflixapp 50m; Eiflixweb 10m');
  });
});
