import { WorkshopDashboardComponent } from './workshop-dashboard.component';
import { newUserDocsById } from './workshop-dashboard.engine';

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
    c.selectedTagFilters = [];
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
    c.selectedNotStartedTypeFilters = []; c.selectedTagFilters = []; c.selectedSubscriberCode = []; c.showReferredOnly = false;
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
    c.lateNewUserAsked = new Set(); c.lateNewUserPending = new Set();
    c.resolveProfileUserRefs = async () => {};      // the Firestore fallback is exercised separately
    c.newUserDataState = 'ready';                    // new users' uids come from new_user_data
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

    it('lists nobody and hides the card until new_user_data has landed, and when that read failed', () => {
      // A new user's uid is on new_user_data: without it every new user would count as missing from the group.
      for (const state of ['loading', 'failed']) {
        const c = make({ newUserDataState: state }); const asked: string[][] = [];
        c.resolveProfileUserRefs = async (ids: string[]) => { asked.push(ids); };
        c.recomputeNotInChat();
        expect(c.notInChatParticipants).withContext(state).toEqual([]);
        expect(c.showNotInChatCard).withContext(state).toBe(false);
        expect(asked).withContext(`${state}: no profile_data lookups either`).toEqual([]);
      }
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

  // Someone who signs up and enrolls while the dashboard is open is in neither profile map (2026-11-19):
  // looked up in new_user_data on their own instead of showing as "Unknown · No login yet" until a refresh.
  describe('late enrollees', () => {
    const META = (c: any) => ({ e1: c.mapProfile.e1, e2: c.mapProfile.e2, e3: c.mapProfile.e3, e4: c.mapProfile.e4 });
    function late(over: Partial<any> = {}): any {
      const c = make();
      c.participantMetaDocdata = META(c);
      c.mapProfile = { ...c.participantMetaDocdata, ...c.newUserOverlay() };
      c.enrolledParticipants = [...c.enrolledParticipants, { profileid: 'late1' }, { profileid: 'late2' }, { profileid: 'orphan' }];
      c.appliedEnrolledIds = c.enrolledParticipants.map((p: any) => p.profileid);   // the metadata above is for this list
      c.enrolledGen = 1; c.enrolledGenApplied = 1; c.enrolledGenDone = 1; c.destroyed = false;
      c.ngZone = { run: (fn: () => any) => fn() };
      c.cdr = { markForCheck: () => {}, detectChanges: () => {} };
      c.recomputeDerivedState = () => {};
      c.loadSaleAchieved = async () => {};
      c.reads = [] as string[][];
      c.readNewUsersByIds = async (asked: string[]) => { c.reads.push(asked); return {}; };
      Object.assign(c, over);
      return c;
    }
    const found = {
      late1: { id: 'late1', name: 'Late One', uid: 'uid-late1' },   // already in the group
      late2: { id: 'late2', name: 'Late Two', uid: 'uid-late2', email: 'late.two@x.com' },   // not in the group
    };
    /** A promise the test resolves or rejects itself. */
    function deferred<T>() {
      let resolve!: (v: T) => void; let reject!: (e: any) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    }

    it('leaves them out of Not in Chat Group while being looked up, then lists them by name', async () => {
      const c = late({ supportChatMembers: new Set(['uid-e1', 'uid-n1', 'uid-late1']) });
      const asked: string[][] = [];
      c.resolveProfileUserRefs = async (pids: string[]) => { asked.push(pids); };
      let land!: (v: any) => void;
      c.readNewUsersByIds = (pids: string[]) => { c.reads.push(pids); return new Promise(r => { land = r; }); };
      const before = c.mapProfileNew;
      const done = c.fillMissingNewUsers();
      expect(c.reads).toEqual([['late1', 'late2', 'orphan']]);       // only the ids in neither map
      c.recomputeNotInChat();
      expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'n2']);
      expect(asked).toEqual([['e4']]);                                // none of them sent to profile_data
      land(found);
      await done;
      expect(c.mapProfileNew).not.toBe(before);                       // a new object; the old one is unchanged
      expect(before.late1).toBeUndefined();
      expect(c.mapProfile.late2.name).toBe('Late Two');
      expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'late2', 'n2', 'orphan']);
      const l2 = c.notInChatParticipants.find((p: any) => p.profileid === 'late2');
      expect(l2.name).toBe('Late Two');
      expect(l2.uid).toBe('uid-late2');
      expect(c.totalNewUsersEnrolled).toBe(4);                        // n1, n2, late1, late2
      expect(c.totalExistUsersEnrolled).toBe(5);                      // e1–e4 and the orphan
      expect(c.reads.length).toBe(1);                                 // the catch-up asked for nobody new
    });

    it('reads an id once: one not found is an orphan enrolment and stays as it was', async () => {
      const c = late();
      c.readNewUsersByIds = async (pids: string[]) => { c.reads.push(pids); return { late1: found.late1 }; };
      await c.fillMissingNewUsers();
      await c.fillMissingNewUsers();
      expect(c.reads).toEqual([['late1', 'late2', 'orphan']]);
      expect(c.lateNewUserPending.size).toBe(0);
      expect(ids(c.notInChatParticipants)).toContain('orphan');
      expect(c.notInChatParticipants.find((p: any) => p.profileid === 'orphan').name).toBe('Unknown');
      c.enrolledParticipants = [...c.enrolledParticipants, { profileid: 'late3' }];   // the next enrolment...
      c.appliedEnrolledIds = [...c.appliedEnrolledIds, 'late3'];                      // ...once its metadata read is in
      await c.fillMissingNewUsers();
      expect(c.reads[1]).toEqual(['late3']);
    });

    it('does nothing until new_user_data is ready; never asks for ids whose metadata read is still out', async () => {
      for (const state of ['loading', 'failed']) {
        const c = late({ newUserDataState: state });
        await c.fillMissingNewUsers();
        expect(c.reads).withContext(state).toEqual([]);
      }
      // A newer enrolled list (with the late ids) is still being read: the applied one is the seed's six.
      const c = late({ enrolledGen: 2, appliedEnrolledIds: ['e1', 'e2', 'e3', 'e4', 'n1', 'n2'] });
      await c.fillMissingNewUsers();
      expect(c.reads).toEqual([]);
      const gone = late({ destroyed: true });
      await gone.fillMissingNewUsers();
      expect(gone.reads).toEqual([]);
    });

    it('a failed lookup lists them as before and is asked again by the next call', async () => {
      const c = late();
      let fail = true;
      c.readNewUsersByIds = async (pids: string[]) => { c.reads.push(pids); if (fail) throw new Error('offline'); return found; };
      spyOn(console, 'error');
      await c.fillMissingNewUsers();
      expect(console.error).toHaveBeenCalled();
      expect(c.lateNewUserPending.size).toBe(0);
      expect(ids(c.notInChatParticipants)).toContain('late2');
      fail = false;
      await c.fillMissingNewUsers();
      expect(c.reads.length).toBe(2);
      expect(c.mapProfileNew.late2.name).toBe('Late Two');
    });

    // 2026-11-19 review: offline, a cache answer is empty, and taking it would make them orphans for good.
    it('an answer from the cache is retried, then not taken: the ids are not marked as asked', async () => {
      const K: any = WorkshopDashboardComponent;
      const saved = K.LATE_NEW_USER_RETRY_DELAYS_MS;
      K.LATE_NEW_USER_RETRY_DELAYS_MS = [0, 0];                       // the real waits are 1s and 3s
      try {
        const c = late();
        let offline = true;
        c.readNewUsersByIds = async (pids: string[]) => {
          c.reads.push(pids);
          return newUserDocsById(offline
            ? [{ metadata: { fromCache: true }, docs: [] }]
            : [{ metadata: { fromCache: false }, docs: [{ id: 'late2', data: () => ({ name: 'Late Two', uid: 'uid-late2' }) }] }]);
        };
        spyOn(console, 'error');
        await c.fillMissingNewUsers();
        expect(c.reads.length).toBe(3);                               // the first try and both retries
        expect(console.error).toHaveBeenCalledTimes(1);
        for (const id of ['late1', 'late2', 'orphan']) expect(c.lateNewUserAsked.has(id)).withContext(id).toBe(false);
        expect(c.lateNewUserPending.size).toBe(0);
        expect(c.mapProfileNew.late2).toBeUndefined();
        offline = false;
        await c.fillMissingNewUsers();                                  // asked again
        expect(c.reads.length).toBe(4);
        expect(c.mapProfileNew.late2.name).toBe('Late Two');
      } finally {
        K.LATE_NEW_USER_RETRY_DELAYS_MS = saved;
      }
    });

    // 2026-11-19 review: the enrolled handler ran Sale Achieved before these people were known.
    it('runs Sale Achieved again once a late new user is found, with their email known', async () => {
      const c = late();
      const emails: (string | undefined)[] = [];
      c.loadSaleAchieved = async () => { emails.push(c.mapProfile.late2?.email); };
      c.readNewUsersByIds = async () => found;
      await c.fillMissingNewUsers();
      expect(emails).toEqual(['late.two@x.com']);
      const none = late();                                            // only orphans: no new emails, no new run
      let runs = 0; none.loadSaleAchieved = async () => { runs++; };
      await none.fillMissingNewUsers();
      expect(runs).toBe(0);
    });

    // 2026-11-19 review: the group can change between the enrolment and the metadata read for it.
    it('while the newest enrolled list is still being read, lists nobody it cannot identify yet', () => {
      const c = late({
        enrolledGen: 2, enrolledGenDone: 1,
        appliedEnrolledIds: ['e1', 'e2', 'e3', 'e4', 'n1', 'n2', 'orphan'],
        lateNewUserAsked: new Set(['orphan']),                       // looked up before: an orphan enrolment
      });
      const asked: string[][] = [];
      c.resolveProfileUserRefs = async (pids: string[]) => { asked.push(pids); };
      c.recomputeNotInChat();
      expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'n2', 'orphan']);   // late1 / late2 wait
      expect(asked).toEqual([['e4', 'orphan']]);                     // and are not sent to profile_data
      c.enrolledGenDone = 2;                                          // that read has finished
      c.recomputeNotInChat();
      expect(ids(c.notInChatParticipants)).toContain('late2');
    });

    // 2026-11-19 review: two enrolled snapshots close together can finish their metadata reads out of order.
    describe('enrolled snapshots that land out of order', () => {
      const SEED = ['e1', 'e2', 'e3', 'e4', 'n1', 'n2'];
      const ALL = [...SEED, 'late1', 'late2', 'orphan'];
      function orders(): any {
        const c = late({ enrolledGen: 0, enrolledGenApplied: 0, enrolledGenDone: 0, participantMetaDocdata: null, appliedEnrolledIds: [] });
        c.loading = true;
        c.calls = { notInChat: 0, fill: 0, detect: 0 };
        const realNotInChat = c.recomputeNotInChat.bind(c);
        c.recomputeNotInChat = () => { c.calls.notInChat++; realNotInChat(); };
        const realFill = c.fillMissingNewUsers.bind(c);
        c.fillMissingNewUsers = () => { c.calls.fill++; return realFill(); };
        c.cdr = { markForCheck: () => {}, detectChanges: () => { c.calls.detect++; } };
        c.metaReads = new Map<number, ReturnType<typeof deferred<any>>>();
        c.getParticipantMetaMapForIds = (pids: string[]) => {
          const d = deferred<any>(); c.metaReads.set(c.metaReads.size + 1, d); return d.promise;
        };
        return c;
      }
      /** What the snapshot handler does before its await: a new generation and the live list. */
      function snapshot(c: any, list: string[]): Promise<void> {
        const gen = ++c.enrolledGen;
        c.enrolledParticipants = list.map(profileid => ({ profileid }));
        return c.loadEnrolledMeta(gen, list);
      }
      const D1 = (c: any) => META(c);
      const D2 = (c: any) => ({ ...META(c), e4: { name: 'Exist Four (renamed)' } });

      it('(a) the newer read lands first: the older one is dropped and changes nothing', async () => {
        const c = orders();
        const d1 = D1(c), d2 = D2(c);
        const h1 = snapshot(c, SEED);
        const h2 = snapshot(c, ALL);
        c.metaReads.get(2).resolve({ docdata: d2 }); await h2;
        await new Promise(r => setTimeout(r, 0));                     // gen 2's own late-enrollee lookup lands
        expect(c.participantMetaDocdata).toBe(d2);
        expect(c.appliedEnrolledIds).toEqual(ALL);
        const seen = { ...c.calls };
        c.metaReads.get(1).resolve({ docdata: d1 }); await h1;
        expect(c.participantMetaDocdata).toBe(d2);                    // gen 2's, not gen 1's
        expect(c.mapProfile.e4.name).toBe('Exist Four (renamed)');
        expect(c.appliedEnrolledIds).toEqual(ALL);
        expect(c.calls).toEqual(seen);                                // no recompute, no lookup, no repaint
        expect(c.enrolledGenApplied).toBe(2);
        expect(c.loading).toBe(false);
      });

      it('(b) in order: both apply, and loading is cleared once', async () => {
        const c = orders();
        const d1 = D1(c), d2 = D2(c);
        const h1 = snapshot(c, SEED);
        c.metaReads.get(1).resolve({ docdata: d1 }); await h1;
        expect(c.participantMetaDocdata).toBe(d1);
        expect(c.loading).toBe(false);
        const h2 = snapshot(c, ALL);
        c.metaReads.get(2).resolve({ docdata: d2 }); await h2;
        expect(c.participantMetaDocdata).toBe(d2);
        expect(c.mapProfile.e4.name).toBe('Exist Four (renamed)');
        expect(c.calls.notInChat).toBe(2);
        expect(c.calls.detect).toBe(1);
        expect(c.enrolledGenApplied).toBe(2);
      });

      it('(c) the older read lands while the newer is out: no lookup for the newer ids until theirs lands', async () => {
        const c = orders();
        const asked: string[][] = [];
        c.resolveProfileUserRefs = async (pids: string[]) => { asked.push(pids); };
        const h1 = snapshot(c, SEED);
        const h2 = snapshot(c, ALL);
        c.metaReads.get(1).resolve({ docdata: D1(c) }); await h1;
        await Promise.resolve();
        expect(c.reads).toEqual([]);                                  // the late ids are not in the applied list
        expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'n2']);   // and not listed as Unknown
        expect(asked).toEqual([['e4']]);
        c.metaReads.get(2).resolve({ docdata: D2(c) }); await h2;
        expect(c.reads).toEqual([['late1', 'late2', 'orphan']]);
      });

      it('a failed metadata read is logged and stops holding Not in Chat Group back', async () => {
        const c = orders();
        spyOn(console, 'error');
        const h1 = snapshot(c, SEED);
        c.metaReads.get(1).resolve({ docdata: D1(c) }); await h1;
        const h2 = snapshot(c, ALL);
        c.recomputeNotInChat();
        expect(ids(c.notInChatParticipants)).not.toContain('late2');  // waiting for gen 2's read
        c.metaReads.get(2).reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        await h2;                                                     // no unhandled rejection
        expect(console.error).toHaveBeenCalled();
        expect(c.enrolledGenDone).toBe(2);
        expect(c.enrolledGenApplied).toBe(1);
        expect(ids(c.notInChatParticipants)).toContain('late2');      // listed as before, not hidden for good
      });
    });

    // The two call sites must start the lookup BEFORE recomputeNotInChat, or the late ids flash as
    // "No login yet" and are sent to profile_data (2026-11-19 review).
    it('enrolled while new_user_data was loading: the settle starts the lookup before listing anyone', async () => {
      const c = late({ newUserDataState: 'loading', supportChatMembers: new Set(['uid-e1', 'uid-n1', 'uid-late1']) });
      c.refreshOpenPanelPeople = () => {};
      const asked: string[][] = [];
      c.resolveProfileUserRefs = async (pids: string[]) => { asked.push(pids); };
      const land = deferred<any>();
      c.readNewUsersByIds = (pids: string[]) => { c.reads.push(pids); return land.promise; };
      await c.fillMissingNewUsers();                                  // the enrolled handler's call: still loading
      expect(c.reads).toEqual([]);
      c.newUserDataState = 'ready';
      c.onNewUserDataSettled();
      expect(c.reads).toEqual([['late1', 'late2', 'orphan']]);       // issued once, by the settle
      expect(ids(c.notInChatParticipants)).toEqual(['e2', 'e3', 'e4', 'n2']);
      expect(asked).toEqual([['e4']]);                                // none of the late ids sent to profile_data
      land.resolve(found);
      await land.promise; await Promise.resolve(); await Promise.resolve();
      await new Promise(r => setTimeout(r, 0));
      expect(c.reads.length).toBe(1);
      const l2 = c.notInChatParticipants.find((p: any) => p.profileid === 'late2');
      expect(l2.name).toBe('Late Two');
      expect(ids(c.notInChatParticipants)).not.toContain('late1');    // in the group
    });
  });
});

describe('WorkshopDashboard — All Assignments: a text answer expands its own card', () => {
  function make(): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.expandedAssignmentTexts = new Set<string>();
    c.viewed = [];
    c.viewParticipantAssignment = (a: any, p: any) => { c.viewed.push(p.profileid); };
    // The card click is gated on the All Assignments action (onAssignmentCardClick -> can('allassignments')).
    c.access = { can: (key: string) => key === 'allassignments' };
    return c;
  }
  const text = { profileid: 'p1', assignmentType: 'question', submissionformat: 'text', result: 'A long typed answer…', hasResult: true };
  const text2 = { profileid: 'p2', assignmentType: 'question', submissionformat: 'text', result: 'Another answer', hasResult: true };
  const upload = { profileid: 'p3', assignmentType: 'question', submissionformat: 'upload', assignmentresult: [{}], hasResult: true };
  const form = { profileid: 'p4', assignmentType: 'form', result: { id: 'r' }, hasResult: true };
  const none = { profileid: 'p5', assignmentType: 'question', submissionformat: 'text', result: '', hasResult: false };

  it('without All Assignments access a click neither expands nor opens anything', () => {
    const c = make(); c.access = { can: () => false };
    c.onAssignmentCardClick({}, 0, text);
    c.onAssignmentCardClick({}, 0, upload);
    expect(c.expandedAssignmentTexts.size).toBe(0);
    expect(c.viewed).toEqual([]);
  });

  it('recognises a typed answer, and only that', () => {
    const c = make();
    expect(c.isTextSubmission(text)).toBe(true);
    expect(c.isTextSubmission(upload)).toBe(false);
    expect(c.isTextSubmission(form)).toBe(false);
    expect(c.isTextSubmission(none)).toBe(false);
  });

  it('clicking a text card expands that card only; clicking again collapses it', () => {
    const c = make();
    c.onAssignmentCardClick({}, 0, text);
    expect(c.isAssignmentTextExpanded(0, text)).toBe(true);
    expect(c.isAssignmentTextExpanded(0, text2)).toBe(false);          // the neighbour stays clamped
    expect(c.isAssignmentTextExpanded(1, text)).toBe(false);           // same person under another assignment too
    c.onAssignmentCardClick({}, 0, text);
    expect(c.isAssignmentTextExpanded(0, text)).toBe(false);
    expect(c.viewed).toEqual([]);                                      // no viewer dialog for text
  });

  it('files and forms still open their viewer instead of expanding', () => {
    const c = make();
    c.onAssignmentCardClick({}, 0, upload); c.onAssignmentCardClick({}, 0, form);
    expect(c.viewed).toEqual(['p3', 'p4']);
    expect(c.expandedAssignmentTexts.size).toBe(0);
  });

  it('a card with no result does nothing on click', () => {
    const c = make(); c.onAssignmentCardClick({}, 0, none);
    expect(c.viewed).toEqual([]); expect(c.expandedAssignmentTexts.size).toBe(0);
  });
});
