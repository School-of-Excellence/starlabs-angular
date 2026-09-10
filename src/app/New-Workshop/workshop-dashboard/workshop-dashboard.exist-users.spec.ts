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
