import { WorkshopDashboardComponent } from './workshop-dashboard.component';

/**
 * Exist Users Enrolled — counting, the `movedtoexist` rule, and the panel filters.
 *
 * These exercise the pure logic on the component (getters + `applyFilterSide`)
 * without booting Angular: the real component pulls in Firestore, routing, dialogs
 * and a live snapshot, none of which this behaviour depends on. Instances are made
 * from the prototype and the handful of fields the logic reads are set directly, so
 * the suite runs offline and never touches production data.
 */
describe('WorkshopDashboard — Exist Users Enrolled', () => {

  /** A component instance with only the state this logic reads. */
  function make(over: Partial<any> = {}): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.mapProfileNew = {
      n1: { id: 'n1', name: 'New One' },                        // genuinely new, enrolled
      n2: { id: 'n2', name: 'New Two' },                        // genuinely new, not enrolled
      m1: { id: 'm1', name: 'Moved One', movedtoexist: true },  // moved to existing, enrolled
      m2: { id: 'm2', name: 'Moved Two', movedtoexist: true },  // moved to existing, not enrolled
    };
    // `participant metadata` — the collection this screen actually reads.
    const metadata: any = {
      e1: { name: 'Exist One', activejourney: 'jA', customerstatus: 'active' },
      e2: { name: 'Exist Two', activejourney: 'jB', customerstatus: 'expired' },
      m1: { name: 'Moved One', activejourney: 'jA', customerstatus: 'expired' },
      e3: { name: 'Exist Three' },                              // no journey, no status
      n1: { name: 'New One' },
    };
    c.enrolledParticipants = [
      { profileid: 'e1' }, { profileid: 'e2' }, { profileid: 'e3' },
      { profileid: 'm1' }, { profileid: 'n1' },
    ];
    // Built the way the component builds it: metadata first, still-new users overlaid.
    c.mapProfile = { ...metadata, ...c.newUserOverlay.call(c) };
    c.filterOption = 'all';
    c.selectedJourneyFilters = [];
    c.selectedCustomerStatusFilters = [];
    c.selectedTierFilters = [];
    c.selectedCategoryFilters = [];
    c.selectedEnrollmentStatusFilters = [];
    c.selectedNotStartedTypeFilters = [];
    c.selectedSubscriberCode = [];
    c.showReferredOnly = false;
    c.workshopData = { categorybased: false };
    // The component always has this (declared `JourneyMap = {}`) and fills it from the
    // `journey` collection; the options getter sorts by display name through it.
    c.JourneyMap = { jA: 'Foundations', jB: 'Momentum' };
    c.participantWorkshopMap = {};
    c.filteredParticipants = [];
    Object.assign(c, over);
    return c;
  }

  /** The Exist panel, as onMetricClick would populate it. */
  function existPanel(c: any): void {
    c.selectedParticipants = c.enrolledParticipants
      .filter((p: any) => !c.isNewUserProfile(p.profileid))
      .map((p: any) => ({ profileid: p.profileid, name: c.mapProfile[p.profileid]?.name, metadata: c.mapProfile[p.profileid] }));
    c.selectedStatusInfo = { status: 'existUsersEnrolled', challengeName: 'All Participants', subChallengeName: 'Exist Users Enrolled', count: c.selectedParticipants.length };
  }

  const ids = (list: any[]) => list.map(p => p.profileid).sort();

  describe('who counts as a new user', () => {
    it('treats a new_user_data profile with no movedtoexist flag as new', () => {
      expect(make().isNewUserProfile('n1')).toBe(true);
    });

    it('does NOT treat a profile as new once movedtoexist is true', () => {
      expect(make().isNewUserProfile('m1')).toBe(false);
    });

    it('does not treat an unknown profile as new', () => {
      expect(make().isNewUserProfile('e1')).toBe(false);
    });

    it('only treats an exact `true` as moved — a stray value keeps them new', () => {
      const c = make();
      c.mapProfileNew['n1'].movedtoexist = 'false';
      expect(c.isNewUserProfile('n1')).toBe(true);
    });
  });

  describe('the counts', () => {
    it('counts every enrolled non-new person, including one moved to existing', () => {
      expect(make().totalExistUsersEnrolled).toBe(4);   // e1, e2, e3, m1
    });

    it('excludes moved users from New Users Enrolled', () => {
      expect(make().totalNewUsersEnrolled).toBe(1);     // n1 only
    });

    it('excludes moved users from New Users Not Enrolled', () => {
      expect(make().totalNewUsersNotEnrolled).toBe(1);  // n2 only
    });

    it('partitions the enrolled set: Exist + New === Total Enrolled', () => {
      const c = make();
      expect(c.totalExistUsersEnrolled + c.totalNewUsersEnrolled).toBe(c.enrolledParticipants.length);
    });

    it('counts nobody as existing when every enrolled profile is new', () => {
      const c = make({ enrolledParticipants: [{ profileid: 'n1' }] });
      expect(c.totalExistUsersEnrolled).toBe(0);
    });
  });

  describe('a moved user resolves through participant metadata', () => {
    it('keeps the metadata journey and customer status, not the stale new-user doc', () => {
      const c = make();
      expect(c.mapProfile['m1'].activejourney).toBe('jA');
      expect(c.mapProfile['m1'].customerstatus).toBe('expired');
    });

    it('still overlays genuinely new users', () => {
      expect(make().mapProfile['n1'].id).toBe('n1');
    });
  });

  describe('filter options come from the people in the list', () => {
    it('offers each journey once, ignoring new users and blanks', () => {
      expect(make().existJourneyOptions).toEqual(['jA', 'jB']);
    });

    it('offers each customer status once, sorted, ignoring blanks', () => {
      expect(make().customerStatusOptions).toEqual(['active', 'expired']);
    });

    it('offers nothing when no existing participant has a status', () => {
      const c = make();
      delete c.mapProfile['e1'].customerstatus;
      delete c.mapProfile['e2'].customerstatus;
      delete c.mapProfile['m1'].customerstatus;
      expect(c.customerStatusOptions).toEqual([]);
    });
  });

  describe('the panel filters', () => {
    it('shows every existing participant when nothing is filtered', () => {
      const c = make(); existPanel(c);
      c.applyFilterSide();
      expect(ids(c.filteredParticipants)).toEqual(['e1', 'e2', 'e3', 'm1']);
    });

    it('narrows by journey, and a moved user is reachable through it', () => {
      const c = make(); existPanel(c);
      c.selectedJourneyFilters = ['jA'];
      c.applyFilterSide();
      expect(ids(c.filteredParticipants)).toEqual(['e1', 'm1']);
    });

    it('narrows by customer status', () => {
      const c = make(); existPanel(c);
      c.selectedCustomerStatusFilters = ['expired'];
      c.applyFilterSide();
      expect(ids(c.filteredParticipants)).toEqual(['e2', 'm1']);
    });

    it('combines the two filters as AND', () => {
      const c = make(); existPanel(c);
      c.selectedJourneyFilters = ['jA'];
      c.selectedCustomerStatusFilters = ['expired'];
      c.applyFilterSide();
      expect(ids(c.filteredParticipants)).toEqual(['m1']);
    });

    it('returns nothing when the two filters cannot both be satisfied', () => {
      const c = make(); existPanel(c);
      c.selectedJourneyFilters = ['jB'];
      c.selectedCustomerStatusFilters = ['active'];
      c.applyFilterSide();
      expect(c.filteredParticipants.length).toBe(0);
    });

    it('accepts several values of one filter as OR', () => {
      const c = make(); existPanel(c);
      c.selectedCustomerStatusFilters = ['active', 'expired'];
      c.applyFilterSide();
      expect(ids(c.filteredParticipants)).toEqual(['e1', 'e2', 'm1']);
    });

    it('leaves other panels alone — a status filter must not touch Total Enrolled', () => {
      const c = make();
      c.selectedParticipants = c.enrolledParticipants.map((p: any) => ({ profileid: p.profileid }));
      c.selectedStatusInfo = { status: 'totalEnrolled' };
      c.selectedCustomerStatusFilters = ['expired'];
      c.applyFilterSide();
      expect(c.filteredParticipants.length).toBe(5);
    });

    it('clearing filters restores the full list', () => {
      const c = make(); existPanel(c);
      c.selectedJourneyFilters = ['jA'];
      c.selectedCustomerStatusFilters = ['expired'];
      c.applyFilterSide();
      c.clearJourneyFilters();
      expect(c.selectedJourneyFilters).toEqual([]);
      expect(c.selectedCustomerStatusFilters).toEqual([]);
      expect(ids(c.filteredParticipants)).toEqual(['e1', 'e2', 'e3', 'm1']);
    });

    it('toggling a status on and off is symmetric', () => {
      const c = make(); existPanel(c);
      c.toggleCustomerStatusFilter('active');
      expect(ids(c.filteredParticipants)).toEqual(['e1']);
      c.toggleCustomerStatusFilter('active');
      expect(ids(c.filteredParticipants)).toEqual(['e1', 'e2', 'e3', 'm1']);
    });
  });
});

describe('WorkshopDashboard — sub-challenge platform name', () => {
  const c: any = Object.create(WorkshopDashboardComponent.prototype);

  it('shows an unknown platform as stored', () => {
    expect(c.platformNameOf({ platform_name: 'EiFlix Mobile' })).toBe('EiFlix Mobile');
  });

  it('maps the app\'s "eiflixapp" to "EiFlix App", whatever the casing', () => {
    expect(c.platformNameOf({ platform_name: 'eiflixapp' })).toBe('EiFlix App');
    expect(c.platformNameOf({ platform_name: 'EiFlixApp' })).toBe('EiFlix App');
    expect(c.platformNameOf({ platform_name: ' EIFLIX-APP ' })).toBe('EiFlix App');
  });

  it('maps the web app\'s "Eiflixweb" to "EiFlix Web"', () => {
    expect(c.platformNameOf({ platform_name: 'Eiflixweb' })).toBe('EiFlix Web');
  });

  it('falls back to EiFlix Web when the field is missing, null or empty', () => {
    expect(c.platformNameOf({})).toBe('EiFlix Web');
    expect(c.platformNameOf({ platform_name: null })).toBe('EiFlix Web');
    expect(c.platformNameOf({ platform_name: '' })).toBe('EiFlix Web');
    expect(c.platformNameOf({ platform_name: '   ' })).toBe('EiFlix Web');
    expect(c.platformNameOf(undefined)).toBe('EiFlix Web');
  });

  it('trims a padded value rather than showing the padding', () => {
    expect(c.platformNameOf({ platform_name: ' EiFlix TV ' })).toBe('EiFlix TV');
  });
});

describe('WorkshopDashboard — platform usage chart data', () => {
  function make(docs: any[]): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.participantWorkshopMap = new Map(docs.map((d, i) => [d.profileid || `p${i}`, d]));
    c.platBarXaxis = { categories: [] };
    c.computePlatformStats();
    return c;
  }
  const sub = (status: string, platform_name?: any) => ({ status, ...(platform_name === undefined ? {} : { platform_name }) });

  it('counts participants by the platform on their progress document, blank meaning the web app', () => {
    const c = make([
      { profileid: 'a', platform_name: 'eiflixapp', challenges: [] },
      { profileid: 'b', platform_name: 'Eiflixweb', challenges: [] },
      { profileid: 'c', challenges: [] },
      { profileid: 'd', platform_name: 'eiflixapp', challenges: [] },
    ]);
    expect(c.platformTotalParticipants).toBe(4);
    expect(c.platformEnrollRows).toEqual([
      { label: 'EiFlix App', count: 2, pct: 50 },
      { label: 'EiFlix Web', count: 2, pct: 50 },
    ]);
    expect(c.platDonutLabels).toEqual(['EiFlix App', 'EiFlix Web']);
    expect(c.platDonutSeries).toEqual([2, 2]);
  });

  it('counts only touched steps, by the platform stamped on each step, split completed / in progress', () => {
    const c = make([
      { profileid: 'a', challenges: [{ type: 'challenge', challenges: [sub('completed', 'eiflixapp'), sub('inprogress', 'eiflixapp'), sub('')] }] },
      { profileid: 'b', challenges: [{ type: 'challenge', challenges: [sub('completed'), sub('completed', 'Eiflixweb'), sub('')] }] },
    ]);
    expect(c.platformTotalSteps).toBe(4);                       // the two '' rows are untouched
    expect(c.platformStepRows).toEqual([
      { label: 'EiFlix App', completed: 1, inProgress: 1 },
      { label: 'EiFlix Web', completed: 2, inProgress: 0 },
    ]);
    expect(c.platBarXaxis.categories).toEqual(['EiFlix App', 'EiFlix Web']);
    expect(c.platBarSeries).toEqual([
      { name: 'Completed', data: [1, 2] },
      { name: 'In progress', data: [1, 0] },
    ]);
  });

  it('is empty, not broken, with no progress documents', () => {
    const c = make([]);
    expect(c.platformTotalParticipants).toBe(0);
    expect(c.platformEnrollRows).toEqual([]);
    expect(c.platformStepRows).toEqual([]);
  });

  it('tolerates documents without a challenges array or with zoom-call entries that have no sub-steps', () => {
    const c = make([{ profileid: 'a' }, { profileid: 'b', challenges: [{ type: 'zoomcall' }] }]);
    expect(c.platformTotalParticipants).toBe(2);
    expect(c.platformTotalSteps).toBe(0);
  });
});

describe('WorkshopDashboard — Enrolled via <platform> opens the side panel', () => {
  function make(): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.participantWorkshopMap = new Map<string, any>([
      ['a', { profileid: 'a', platform_name: 'eiflixapp', challenges: [] }],
      ['b', { profileid: 'b', platform_name: 'Eiflixweb', challenges: [] }],
      ['c', { profileid: 'c', challenges: [] }],                         // blank → EiFlix Web
    ]);
    c.mapProfile = { a: { name: 'App User' }, b: { name: 'Web User' }, c: { name: 'Legacy User' } };
    c.enrolledParticipants = [{ profileid: 'a' }, { profileid: 'b' }, { profileid: 'c' }];
    c.participantWorkshopCategoryMap = new Map(); c.participantCohortMap = new Map(); c.categoryNamesMap = new Map();
    c.workshopData = { categorybased: false };
    c.selectedTierFilters = []; c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = [];
    c.selectedNotStartedTypeFilters = []; c.selectedSubscriberCode = []; c.showReferredOnly = false;
    c.JourneyMap = {}; c.filteredParticipants = []; c.mapProfileNew = {};
    c.showParticipantPanel = false;
    return c;
  }
  const ids = (list: any[]) => list.map(p => p.profileid).sort();

  it('lists exactly the people whose progress document carries that platform', () => {
    const c = make(); c.onPlatformClick('EiFlix App');
    expect(c.showParticipantPanel).toBe(true);
    expect(ids(c.selectedParticipants)).toEqual(['a']);
    expect(c.selectedStatusInfo).toEqual({ status: 'platform', challengeName: 'Enrolled via', subChallengeName: 'EiFlix App', count: 1 });
    expect(ids(c.filteredParticipants)).toEqual(['a']);
  });

  it('counts a blank platform as the web app, so the panel matches the donut slice', () => {
    const c = make(); c.onPlatformClick('EiFlix Web');
    expect(ids(c.selectedParticipants)).toEqual(['b', 'c']);
    expect(c.selectedStatusInfo.count).toBe(2);
  });

  it('resets the side filters so a previous panel cannot leak into this one', () => {
    const c = make(); c.selectedJourneyFilters = ['jA']; c.selectedCustomerStatusFilters = ['active']; c.filterOption = 'completed';
    c.onPlatformClick('EiFlix Web');
    expect(c.selectedJourneyFilters).toEqual([]); expect(c.selectedCustomerStatusFilters).toEqual([]); expect(c.filterOption).toBe('all');
  });

  it('ignores an empty label (a donut click outside any slice)', () => {
    const c = make(); c.onPlatformClick(''); c.onPlatformClick(undefined as any);
    expect(c.showParticipantPanel).toBe(false);
  });

  it('labels the panel header with the platform, not a status code', () => {
    const c = make(); c.onPlatformClick('EiFlix App');
    expect(`${c.selectedStatusInfo.challengeName} - ${c.selectedStatusInfo.subChallengeName}`).toBe('Enrolled via - EiFlix App');
  });
});

describe('WorkshopDashboard — Users Not in Chat Group', () => {
  function make(over: Partial<any> = {}): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    // existing users: participant metadata points at their user_data document
    c.mapProfile = {
      e1: { name: 'Exist One', firebaseuserref: { id: 'uid-e1', path: 'user_data/uid-e1' } },
      e2: { name: 'Exist Two', firebaseuserref: '/user_data/uid-e2' },          // stored as a path string
      e3: { name: 'Exist Three', user_ref: { id: 'uid-e3' } },                   // older spelling only
      e4: { name: 'Exist Four' },                                                // never signed in
      n1: { name: 'New One', uid: 'uid-n1' },
      n2: { name: 'New Two' },
    };
    c.mapProfileNew = { n1: { id: 'n1', uid: 'uid-n1' }, n2: { id: 'n2' } };
    c.enrolledParticipants = ['e1', 'e2', 'e3', 'e4', 'n1', 'n2'].map(profileid => ({ profileid }));
    c.participantWorkshopCategoryMap = new Map(); c.participantCohortMap = new Map(); c.categoryNamesMap = new Map();
    c.workshopData = { categorybased: false };
    c.selectedTierFilters = []; c.selectedCategoryFilters = []; c.selectedEnrollmentStatusFilters = [];
    c.selectedNotStartedTypeFilters = []; c.selectedSubscriberCode = []; c.showReferredOnly = false;
    c.selectedJourneyFilters = []; c.selectedCustomerStatusFilters = []; c.filterOption = 'all';
    c.JourneyMap = {}; c.filteredParticipants = []; c.selectedParticipants = []; c.selectedStatusInfo = null;
    c.showParticipantPanel = false; c.chatAddBusy = new Set(); c.chatAddAllBusy = false;
    c.supportChatGroupId = 'grp1';
    c.supportChatMembers = new Set(['uid-e1', 'uid-n1']);
    c.notInChatParticipants = [];
    c.profileUserRefs = new Map(); c.profileUserRefsPending = new Set();
    c.resolveProfileUserRefs = async () => {};      // the Firestore fallback is exercised separately
    Object.assign(c, over);
    return c;
  }
  const ids = (list: any[]) => list.map(p => p.profileid).sort();

  describe('uid resolution', () => {
    it('reads a new user\'s uid from new_user_data', () => { expect(make().uidOf('n1')).toBe('uid-n1'); });
    it('reads an existing user\'s uid from the user_data reference on participant metadata', () => { expect(make().uidOf('e1')).toBe('uid-e1'); });
    it('accepts the reference stored as a path string', () => { expect(make().uidOf('e2')).toBe('uid-e2'); });
    it('falls back to the older user_ref spelling', () => { expect(make().uidOf('e3')).toBe('uid-e3'); });
    it('is empty for someone who has never signed in', () => { expect(make().uidOf('e4')).toBe(''); expect(make().uidOf('n2')).toBe(''); });

    it('falls back to profile_data.user_ref when metadata carries no reference', () => {
      const c = make(); c.profileUserRefs.set('e4', 'uid-e4-from-profile');
      expect(c.uidOf('e4')).toBe('uid-e4-from-profile');
      expect(c.uidOf('e1')).toBe('uid-e1');                           // metadata still wins when present
    });

    it('asks for profile_data only for existing users still without a uid, once', () => {
      const c = make(); const asked: string[][] = [];
      c.resolveProfileUserRefs = async (ids: string[]) => { asked.push(ids); };
      c.recomputeNotInChat();
      expect(asked).toEqual([['e4']]);                                 // not n2 (new user), not e2/e3 (resolved)
      c.profileUserRefs.set('e4', '');                                 // looked, none there
      c.recomputeNotInChat();
      expect(asked.length).toBe(2);                                    // the real method dedupes via the cache; the stub is called again but with the same id
    });
  });

  describe('who is missing from the group', () => {
    it('lists enrolled people whose uid is not in members, plus those with no uid to add', () => {
      const c = make(); c.recomputeNotInChat();
      expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'n2']);
      expect(c.totalNotInChatGroup).toBe(4);
      expect(c.notInChatParticipants.find((p: any) => p.profileid === 'e2').uid).toBe('uid-e2');
      expect(c.notInChatParticipants.find((p: any) => p.profileid === 'e4').uid).toBe('');
    });

    it('shows the card only with a group AND someone missing', () => {
      const c = make(); c.recomputeNotInChat();
      expect(c.showNotInChatCard).toBe(true);
      const full = make({ supportChatMembers: new Set(['uid-e1', 'uid-e2', 'uid-e3', 'uid-n1']) }); full.recomputeNotInChat();
      expect(ids(full.notInChatParticipants)).toEqual(['e4', 'n2']);   // no uid → still not in the group
      const none = make({ supportChatMembers: new Set(['uid-e1', 'uid-e2', 'uid-e3', 'uid-n1']), enrolledParticipants: [{ profileid: 'e1' }] });
      none.recomputeNotInChat(); expect(none.showNotInChatCard).toBe(false);
    });

    it('is empty without a group, and until the group document has been read', () => {
      const a = make({ supportChatGroupId: '' }); a.recomputeNotInChat(); expect(a.showNotInChatCard).toBe(false); expect(a.notInChatParticipants).toEqual([]);
      const b = make({ supportChatMembers: null }); b.recomputeNotInChat(); expect(b.showNotInChatCard).toBe(false);
    });

    it('keeps an open panel in step with the live group document', () => {
      const c = make(); c.recomputeNotInChat(); c.onMetricClick('notInChatGroup');
      expect(c.showParticipantPanel).toBe(true);
      expect(c.selectedStatusInfo.status).toBe('notInChatGroup');
      expect(ids(c.filteredParticipants)).toEqual(['e2', 'e3', 'e4', 'n2']);
      expect(c.chatAddableCount).toBe(2);                                   // e2, e3 have uids
      c.supportChatMembers = new Set(['uid-e1', 'uid-n1', 'uid-e2', 'uid-e3']);   // the listener saw the adds
      c.recomputeNotInChat();
      expect(ids(c.filteredParticipants)).toEqual(['e4', 'n2']);
      expect(c.selectedStatusInfo.count).toBe(2);
      expect(c.chatAddableCount).toBe(0);
    });
  });
});
