import { WorkshopDashboardComponent } from './workshop-dashboard.component';
import { WorkshopAccess } from '../workshop-access/workshop-access.model';

/**
 * Manage tag in the side-panel person menu (operator 2026-11-19; specs/plans/2026-11-19-dashboard-person-manage-tag.md).
 *
 * The component logic around the pure rules (tagTogglePlan & co. are in the engine spec): who gets the item, the
 * submenu's note, the ✓, the guards that keep a click from writing, and how an open panel's chips catch up.
 * Instances are made from the prototype with only the state this logic reads, as in the other component specs:
 * no Angular, no Firestore. A guard case proves "nothing written" by the snackbar and the change detector staying
 * untouched — a write that got that far would have reached them.
 */
describe('WorkshopDashboard — Manage tag (person menu)', () => {
  function make(over: Partial<any> = {}): any {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.access = new WorkshopAccess('me', { me: ['participantprogress'] }, [], ['me']);
    c.enrolledParticipants = [
      { profileid: 'p1', id: 'e1', tags: ['t1'] },
      { profileid: 'p2', id: 'e2', tags: [] },
    ];
    c.personTagBusy = new Set<string>();
    c.personTagCache = null;
    c.tagNameCache = new Map([['t1', 'Alpha'], ['t2', 'Beta']]);
    c.segmentTags = [];
    c.segmentTagsState = 'idle';
    c.destroyed = false;
    c.snackbarService = { show: jasmine.createSpy('show') };
    c.cdr = { detectChanges: jasmine.createSpy('detectChanges'), markForCheck: jasmine.createSpy('markForCheck') };
    Object.assign(c, over);
    return c;
  }
  const click = () => ({ stopPropagation: jasmine.createSpy('stopPropagation'), currentTarget: null }) as any;
  const p1 = { profileid: 'p1', name: 'One' };
  const p2 = { profileid: 'p2', name: 'Two' };
  const beta = { id: 't2', name: 'Beta' };

  it('is offered to the clear list only — not to the workshop Clear tick, nor to full dashboard access', () => {
    expect(make().canManageTags).toBe(true);
    const ticked = make({ access: new WorkshopAccess('me', { me: ['clear', 'participantprogress'] }, [], []) });
    expect(ticked.canClear).toBe(true);
    expect(ticked.canManageTags).toBe(false);
    expect(make({ access: new WorkshopAccess('me', {}, ['me'], []) }).canManageTags).toBe(false);
  });

  it('says Loading, No tags yet or Couldn\'t load tags while there is no list to show', () => {
    const c = make();
    expect(c.segmentTagsNote).toBe('Loading tags…');
    c.segmentTagsState = 'loading';
    expect(c.segmentTagsNote).toBe('Loading tags…');
    c.segmentTagsState = 'failed';
    expect(c.segmentTagsNote).toBe("Couldn't load tags");
    c.segmentTagsState = 'ready';
    expect(c.segmentTagsNote).toBe('No tags yet');
    c.segmentTags = [beta];
    expect(c.segmentTagsNote).toBe('');
  });

  it('does not read the tag list for someone without Manage tag', () => {
    const c = make({ access: new WorkshopAccess('me', { me: ['participantprogress'] }, [], []) });
    c.loadSegmentTags();
    expect(c.segmentTagsState).toBe('idle');
  });

  it('ticks the tags the person carries, and follows the next enrolled snapshot', () => {
    const c = make();
    expect(c.personHasTag(p1, 't1')).toBe(true);
    expect(c.personHasTag(p1, 't2')).toBe(false);
    expect(c.personHasTag(p2, 't1')).toBe(false);
    c.enrolledParticipants = [{ profileid: 'p1', id: 'e1', tags: ['t2'] }];   // a new snapshot is a new array
    expect(c.personHasTag(p1, 't1')).toBe(false);
    expect(c.personHasTag(p1, 't2')).toBe(true);
    expect(c.personHasTag({}, 't2')).toBe(false);
  });

  it('is open only for someone enrolled in this workshop', () => {
    const c = make();
    expect(c.personIsEnrolled(p1)).toBe(true);
    expect(c.personIsEnrolled({ profileid: 'zoomOnly' })).toBe(false);
    expect(c.personIsEnrolled(null)).toBe(false);
  });

  describe('a click that must not write', () => {
    it('keeps the menu open, and writes nothing without the clear list', async () => {
      const c = make({ access: new WorkshopAccess('me', { me: ['clear', 'participantprogress'] }, [], []) });
      const e = click();
      await c.togglePersonTag(e, p1, beta);
      expect(e.stopPropagation).toHaveBeenCalled();
      expect(c.snackbarService.show).not.toHaveBeenCalled();
      expect(c.cdr.detectChanges).not.toHaveBeenCalled();
    });

    it('writes nothing for someone not enrolled here', async () => {
      const c = make();
      await c.togglePersonTag(click(), { profileid: 'zoomOnly' }, beta);
      expect(c.snackbarService.show).not.toHaveBeenCalled();
      expect(c.cdr.detectChanges).not.toHaveBeenCalled();
    });

    it('ignores a second click on a tag that is still saving', async () => {
      const c = make();
      c.personTagBusy.add('p1/t2');
      expect(c.isPersonTagBusy(p1, 't2')).toBe(true);
      expect(c.isPersonTagBusy(p1, 't1')).toBe(false);
      expect(c.isPersonTagBusy(p2, 't2')).toBe(false);
      await c.togglePersonTag(click(), p1, beta);
      expect(c.snackbarService.show).not.toHaveBeenCalled();
      expect(c.personTagBusy.has('p1/t2')).toBe(true);   // still the first click's
    });
  });

  it('says "Could not update the tag" when the write fails, and frees the item again', async () => {
    const c = make({ firestoreDefault: {} });   // not a Firestore: the batch cannot be built
    spyOn(console, 'error');
    await c.togglePersonTag(click(), p1, beta);
    expect(c.snackbarService.show).toHaveBeenCalledWith('Could not update the tag');
    expect(c.isPersonTagBusy(p1, 't2')).toBe(false);
  });

  describe('the open panel catches up (its chips are a click-time snapshot)', () => {
    function panel(status: string, over: Partial<any> = {}): any {
      const c = make({
        showParticipantPanel: true,
        selectedStatusInfo: { status },
        selectedParticipants: [p1, p2],
        enrolledTagNames: { p1: ['Alpha'] },
        enrolledTagOptions: ['Alpha'],
        selectedTagFilters: [],
        selectedParticipantData: null,
        selectedParticipantTags: [],
        ...over,
      });
      c.applyFilterSide = jasmine.createSpy('applyFilterSide');
      return c;
    }

    it('adds the chip and the filter option for a tag just added', () => {
      const c = panel('totalEnrolled');
      c.patchPersonTagChips('p2', 't2', true);
      expect(c.enrolledTagNames).toEqual({ p1: ['Alpha'], p2: ['Beta'] });
      expect(c.enrolledTagOptions).toEqual(['Alpha', 'Beta']);
      expect(c.applyFilterSide).not.toHaveBeenCalled();   // no Tag filter ticked: the list is unchanged
    });

    it('drops the chip for a tag just removed; a ticked option stays so it can be unticked, and the filter re-runs', () => {
      const c = panel('existUsersEnrolled', { selectedTagFilters: ['Alpha'] });
      c.patchPersonTagChips('p1', 't1', false);
      expect(c.enrolledTagNames).toEqual({});
      expect(c.enrolledTagOptions).toEqual(['Alpha']);
      expect(c.applyFilterSide).toHaveBeenCalled();
    });

    it('is the same once the live snapshot already carries the change', () => {
      const c = panel('totalNewUsers');
      c.enrolledParticipants = [{ profileid: 'p1', id: 'e1', tags: ['t1'] }, { profileid: 'p2', id: 'e2', tags: ['t2'] }];
      c.patchPersonTagChips('p2', 't2', true);
      expect(c.enrolledTagNames.p2).toEqual(['Beta']);
    });

    it('leaves a panel without tag chips alone, and someone not in the panel', () => {
      // Not in Chat Group shows no tag chips (Sale Achieved, the example here before, no longer opens the panel).
      const chat = panel('notInChatGroup');
      chat.patchPersonTagChips('p2', 't2', true);
      expect(chat.enrolledTagNames).toEqual({ p1: ['Alpha'] });
      const other = panel('totalEnrolled', { selectedParticipants: [p1] });
      other.patchPersonTagChips('p2', 't2', true);
      expect(other.enrolledTagNames).toEqual({ p1: ['Alpha'] });
    });

    it("updates the Participant Data tags when that person is the one open there", () => {
      const c = panel('notInChatGroup', { selectedParticipantData: { profileid: 'p2' } });
      c.patchPersonTagChips('p2', 't2', true);
      expect(c.selectedParticipantTags).toEqual(['Beta']);
      c.patchPersonTagChips('p1', 't2', true);   // someone else
      expect(c.selectedParticipantTags).toEqual(['Beta']);
    });

    it('re-runs a ticked Tag filter; the person menu closes once its person has left the list, before the row goes', () => {
      // The real applyFilterSide: Total Enrolled with "Alpha" ticked lists only its carriers (enrolledTagNames).
      const c = make({
        showParticipantPanel: true, selectedStatusInfo: { status: 'totalEnrolled' },
        selectedParticipants: [p1, p2], enrolledTagNames: { p1: ['Alpha'], p2: ['Alpha'] }, enrolledTagOptions: ['Alpha'],
        selectedTagFilters: ['Alpha'], selectedEnrollmentStatusFilters: [], sideSearch: '',
        selectedParticipantData: null, selectedParticipantTags: [], segmentTagsState: 'ready',
        enrolledParticipants: [{ profileid: 'p1', id: 'e1', tags: ['t1'] }, { profileid: 'p2', id: 'e2', tags: ['t1'] }],
      });
      c.applyFilterSide();
      expect(c.filteredParticipants.map((x: any) => x.profileid)).toEqual(['p1', 'p2']);
      const trigger = { menuOpen: true, closeMenu: jasmine.createSpy('closeMenu') };
      c.onPersonMenuOpened(trigger, p1);
      c.enrolledParticipants = [{ profileid: 'p1', id: 'e1', tags: [] }, { profileid: 'p2', id: 'e2', tags: ['t1'] }];
      c.patchPersonTagChips('p1', 't1', false);
      expect(c.filteredParticipants.map((x: any) => x.profileid)).toEqual(['p2']);
      expect(trigger.closeMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('the person menu and the panel list', () => {
    function opened(over: Partial<any> = {}): { c: any; trigger: any } {
      // segmentTagsState 'ready': opening the menu does not start the tag-list read (no Firestore here).
      const c = make({ filteredParticipants: [p1, p2], segmentTagsState: 'ready', ...over });
      const trigger = { menuOpen: true, closeMenu: jasmine.createSpy('closeMenu') };
      c.onPersonMenuOpened(trigger, p1);
      return { c, trigger };
    }

    it('stays open while its person is still listed, also as a rebuilt entry (a new object)', () => {
      const { c, trigger } = opened();
      c.filteredParticipants = [{ ...p2 }, { ...p1 }];
      c.closePersonMenuIfGone();
      expect(trigger.closeMenu).not.toHaveBeenCalled();
      expect(c.personMenuOpen).toBe(true);
    });

    it('closes when its person has left the list', () => {
      const { c, trigger } = opened();
      c.filteredParticipants = [p2];
      c.closePersonMenuIfGone();
      expect(trigger.closeMenu).toHaveBeenCalledTimes(1);
    });

    it('does nothing once the menu has closed, or when no menu was opened', () => {
      const { c, trigger } = opened();
      c.onPersonMenuClosed();
      expect(c.personMenuOpen).toBe(false);
      c.filteredParticipants = [];
      c.closePersonMenuIfGone();
      expect(trigger.closeMenu).not.toHaveBeenCalled();
      const fresh = make({ filteredParticipants: [] });
      expect(() => fresh.closePersonMenuIfGone()).not.toThrow();
    });

    it('tracks the panel rows by person (the index only when there is no id)', () => {
      const c = make();
      expect(c.trackPanelPerson(0, p1)).toBe('p1');
      expect(c.trackPanelPerson(3, { ...p1 })).toBe('p1');
      expect(c.trackPanelPerson(4, { name: 'No id' })).toBe(4);
      expect(c.trackPanelPerson(5, null)).toBe(5);
    });
  });
});
