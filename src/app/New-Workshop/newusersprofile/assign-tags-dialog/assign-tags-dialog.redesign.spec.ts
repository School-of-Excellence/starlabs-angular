import { SelectionModel } from '@angular/cdk/collections';
import {
  AssignTagsDialogComponent,
  bulkChipCount,
  bulkSummary,
  initialBulkState,
  initialsOf,
  joinNames,
  nextBulkState,
  peopleWord,
  similarTagsFor,
  singleSummary,
  Tag,
} from './assign-tags-dialog.component';

/**
 * Tag dialogs redesign (2026-11-16, design section 5): bulk all/some/none states and their cycle,
 * chip counts, the footer summary that says exactly what Save / Apply will do, similar tags,
 * people counts in Manage tags, and the Segment links confirmations. No Firestore, no DOM.
 */

const TAGS: Tag[] = [
  { id: 'bt', name: 'Breakthrough 2026' },
  { id: 'cv', name: 'Chennai Venue' },
  { id: 'eb', name: 'Early Bird' },
  { id: 'gm', name: 'Gold Members' },
  { id: 'hb', name: 'Hindi Batch' },
  { id: 'wl', name: 'Webinar Leads' },
];

/** The unit-harness style used across this folder: no DI, no field initialisers, every field set here. */
function harness(over: Partial<Record<string, any>> = {}): any {
  const c: any = Object.create(AssignTagsDialogComponent.prototype);
  c.tags = TAGS.slice();
  c.search = '';
  c.mode = 'single';
  c.selected = new Set<string>();
  c.initialSelected = new Set<string>();
  c.bulkCount = 0;
  c.bulkCarriers = new Map<string, number>();
  c.bulkState = new Map<string, string>();
  c.rawName = '';
  c.userName = 'User';
  c.userEmail = '';
  c.tagCounts = null;
  c.editingId = null;
  c.editName = '';
  c.renameError = '';
  c.isRenaming = false;
  c.isSaving = false;
  c.notice = '';
  c.noticeTimer = null;
  c.activeTab = 0;
  c.copySelection = new SelectionModel<string>(true, []);
  c.snackBar = { open: jasmine.createSpy('open') };
  c.dialogRef = { close: jasmine.createSpy('close') };
  c.clipboard = { copy: jasmine.createSpy('copy').and.returnValue(true) };
  Object.assign(c, over);
  return c;
}

/** Bulk harness: `users` is each selected person's tag ids. */
function bulk(users: string[][]): any {
  const carriers = new Map<string, number>();
  users.forEach(tags => new Set(tags).forEach(id => carriers.set(id, (carriers.get(id) || 0) + 1)));
  return harness({ mode: 'bulk', bulkCount: users.length, bulkCarriers: carriers });
}

describe('AssignTagsDialog redesign — pure helpers', () => {
  it('starts a tag as all / some / none from how many people carry it', () => {
    expect(initialBulkState(3, 3)).toBe('all');
    expect(initialBulkState(2, 3)).toBe('some');
    expect(initialBulkState(0, 3)).toBe('none');
    expect(initialBulkState(0, 0)).toBe('none');   // nobody selected: never 'all'
  });

  it('cycles a partial tag some -> all -> none -> some, and flips the others between all and none', () => {
    expect(nextBulkState('some', 'some')).toBe('all');
    expect(nextBulkState('all', 'some')).toBe('none');
    expect(nextBulkState('none', 'some')).toBe('some');
    expect(nextBulkState('none', 'none')).toBe('all');
    expect(nextBulkState('all', 'none')).toBe('none');
    expect(nextBulkState('all', 'all')).toBe('none');
    expect(nextBulkState('none', 'all')).toBe('all');
  });

  it('labels bulk chips: all 3, adds to N, on 2 of 3, removes from N, nothing when untouched and on no one', () => {
    expect(bulkChipCount('all', 'all', 3, 3)).toBe('all 3');
    expect(bulkChipCount('all', 'none', 0, 3)).toBe('adds to 3');
    expect(bulkChipCount('all', 'some', 2, 3)).toBe('adds to 1');
    expect(bulkChipCount('some', 'some', 2, 3)).toBe('on 2 of 3');
    expect(bulkChipCount('none', 'some', 1, 3)).toBe('removes from 1');
    expect(bulkChipCount('none', 'all', 3, 3)).toBe('removes from 3');
    expect(bulkChipCount('none', 'none', 0, 3)).toBe('');
    expect(bulkChipCount('all', 'all', 1284, 1284)).toBe('all 1,284');
  });

  it('says person / people', () => {
    expect(peopleWord(1)).toBe('1 person');
    expect(peopleWord(3)).toBe('3 people');
    expect(peopleWord(0)).toBe('0 people');
  });

  it('joins names, then "and N more" past three', () => {
    expect(joinNames(['A'])).toEqual({ names: 'A', more: '' });
    expect(joinNames(['A', 'B', 'C'])).toEqual({ names: 'A, B, C', more: '' });
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toEqual({ names: 'A, B, C', more: 'and 2 more' });
  });

  it('writes the one-person summary', () => {
    expect(singleSummary(['Hindi Batch'], [], 'Aarav').map(l => l.text)).toEqual(['Adds Hindi Batch to Aarav']);
    expect(singleSummary([], ['Early Bird'], 'Aarav').map(l => l.text)).toEqual(['Removes Early Bird from Aarav']);
    expect(singleSummary(['A', 'B', 'C', 'D'], ['E'], 'Aarav').map(l => l.text))
      .toEqual(['Adds A, B, C and 1 more to Aarav', 'Removes E from Aarav']);
    expect(singleSummary([], [], 'Aarav')).toEqual([]);
  });

  it('writes the bulk summary, one line per changed tag, four at most', () => {
    const lines = bulkSummary([
      { name: 'Gold Members', adds: true, count: 3 },
      { name: 'Early Bird', adds: false, count: 1 },
    ]);
    expect(lines.map(l => l.text)).toEqual(['Adds Gold Members to 3 people', 'Removes Early Bird from 1 person']);
    expect(lines[0].names).toBe('Gold Members');   // the bold part is the tag name only

    const many = bulkSummary(['A', 'B', 'C', 'D', 'E', 'F'].map(n => ({ name: n, adds: true, count: 2 })));
    expect(many.length).toBe(5);
    expect(many[4].text).toBe('and 2 more changes');
    expect(many[4].names).toBe('');
    expect(bulkSummary(['A', 'B', 'C', 'D', 'E'].map(n => ({ name: n, adds: true, count: 2 })))[4].text).toBe('and 1 more change');
  });

  it('finds similar tags by a shared word of 3+ letters, skipping the ones already shown', () => {
    const tags: Tag[] = [
      { id: 'b', name: 'Bengaluru Venue' }, { id: 'c', name: 'Chennai Venue' }, { id: 'k', name: 'Coimbatore Venue' },
      { id: 'g', name: 'Gold Members' }, { id: 'v', name: 'Venue-less' },
    ];
    expect(similarTagsFor('Pune Venue', tags, new Set()).map(t => t.id)).toEqual(['b', 'c', 'k', 'v']);
    expect(similarTagsFor('Pune Venue', tags, new Set(['c'])).map(t => t.id)).toEqual(['b', 'k', 'v']);
    expect(similarTagsFor('go', tags, new Set())).toEqual([]);           // words under 3 letters never match
    expect(similarTagsFor('GOLD batch', tags, new Set()).map(t => t.id)).toEqual(['g']);   // case-insensitive
    expect(similarTagsFor('venue', tags, new Set(), 2).length).toBe(2);
  });

  it('makes initials from the first two words, U without a name', () => {
    expect(initialsOf('Aarav Krishnamurthy')).toBe('AK');
    expect(initialsOf('  priya  ')).toBe('P');
    expect(initialsOf('Anna Maria Lopez')).toBe('AM');
    expect(initialsOf('')).toBe('U');
  });
});

describe('AssignTagsDialog redesign — Assign tags (one person)', () => {
  function one(tags: string[], name = 'Aarav Krishnamurthy'): any {
    return harness({ mode: 'single', rawName: name, userName: name, selected: new Set(tags), initialSelected: new Set(tags) });
  }

  it('splits the person\'s tags from the rest, both following the search', () => {
    const c = one(['cv', 'gm']);
    expect(c.onTags().map((t: Tag) => t.id)).toEqual(['cv', 'gm']);
    expect(c.moreTags().map((t: Tag) => t.id)).toEqual(['bt', 'eb', 'hb', 'wl']);
    c.search = 'venue';
    expect(c.onTags().map((t: Tag) => t.id)).toEqual(['cv']);
    expect(c.moreTags()).toEqual([]);
    expect(c.onCount()).toBe(2);   // the label counts every tag on the person, not just the matching ones
  });

  it('has no changes until a chip moves, and then says exactly what Save will do', () => {
    const c = one(['cv', 'eb']);
    expect(c.hasChanges()).toBeFalse();
    expect(c.summaryLines()).toEqual([]);
    c.toggle('hb');   // add
    c.toggle('eb');   // remove
    expect(c.hasChanges()).toBeTrue();
    expect(c.summaryLines().map((l: any) => l.text)).toEqual(['Adds Hindi Batch to Aarav', 'Removes Early Bird from Aarav']);
    expect(c.isChanged('hb')).toBeTrue();
    expect(c.isChanged('cv')).toBeFalse();
    expect(c.stateOf('hb')).toBe('all');
    expect(c.stateOf('eb')).toBe('none');
    expect(c.chipCount('hb')).toBe('');   // counts are a bulk thing
    c.toggle('hb');
    c.toggle('eb');
    expect(c.hasChanges()).toBeFalse();   // tapped back: nothing to save
  });

  it('keeps ids of deleted tags the person carries, without listing or counting them', () => {
    const c = one(['cv', 'gone']);
    expect(c.onCount()).toBe(1);
    c.toggle('hb');
    expect(c.selectedIds()).toEqual(jasmine.arrayContaining(['cv', 'gone', 'hb']));
    expect(c.summaryLines().map((l: any) => l.text)).toEqual(['Adds Hindi Batch to Aarav']);
  });

  it('heads the dialog with the name and email, and falls back gracefully', () => {
    const c = one([]);
    c.userEmail = 'aarav@example.com';
    expect(c.title).toBe('Assign tags');
    expect(c.subtitle).toBe('Aarav Krishnamurthy · aarav@example.com');
    expect(c.initials).toBe('AK');
    expect(c.firstName).toBe('Aarav');
    const anon = one([], '');
    expect(anon.firstName).toBe('this person');
    expect(anon.initials).toBe('U');
    expect(anon.subtitle).toBe('User');
    anon.userEmail = 'x@example.com';
    expect(anon.subtitle).toBe('x@example.com');
  });

  it('a similar tag acts like tapping its chip, then clears the search', () => {
    const c = one([]);
    c.search = 'Hindi Classes';
    expect(c.canCreate()).toBeTrue();
    expect(c.similarTags().map((t: Tag) => t.id)).toEqual(['hb']);
    c.pickSimilar(TAGS[4]);
    expect(c.selected.has('hb')).toBeTrue();
    expect(c.search).toBe('');
  });
});

describe('AssignTagsDialog redesign — Edit tags (N selected people)', () => {
  it('reads all / some / none per tag from the selected people, deduping each person\'s tags', () => {
    const c = bulk([['gm', 'gm', 'cv', 'bt'], ['cv', 'bt'], ['bt', 'eb']]);
    expect(c.stateOf('bt')).toBe('all');
    expect(c.stateOf('cv')).toBe('some');
    expect(c.stateOf('gm')).toBe('some');   // carried twice by one person still counts once
    expect(c.chipCount('gm')).toBe('on 1 of 3');
    expect(c.stateOf('wl')).toBe('none');
    expect(c.chipCount('bt')).toBe('all 3');
    expect(c.chipCount('cv')).toBe('on 2 of 3');
    expect(c.chipCount('wl')).toBe('');
    expect(c.subtitle).toBe('3 selected people');
    expect(c.title).toBe('Edit tags');
    expect(c.hasChanges()).toBeFalse();
  });

  it('one tap on a partial tag gives it to all, another removes it from all, a third leaves it as it was', () => {
    const c = bulk([['cv'], ['cv'], []]);
    c.toggle('cv');
    expect(c.stateOf('cv')).toBe('all');
    expect(c.chipCount('cv')).toBe('adds to 1');
    expect(c.summaryLines().map((l: any) => l.text)).toEqual(['Adds Chennai Venue to 1 person']);
    expect(c.bulkResult()).toEqual({ add: ['cv'], remove: [] });
    c.toggle('cv');
    expect(c.stateOf('cv')).toBe('none');
    expect(c.chipCount('cv')).toBe('removes from 2');
    expect(c.summaryLines().map((l: any) => l.text)).toEqual(['Removes Chennai Venue from 2 people']);
    expect(c.bulkResult()).toEqual({ add: [], remove: ['cv'] });
    c.toggle('cv');
    expect(c.stateOf('cv')).toBe('some');
    expect(c.isChanged('cv')).toBeFalse();
    expect(c.hasChanges()).toBeFalse();
    expect(c.bulkState.size).toBe(0);
  });

  it('WS-23: for one untagged person a single tap adds the tag, and Apply returns it with no extra step', async () => {
    const c = bulk([[]]);
    expect(c.subtitle).toBe('1 selected person');
    c.toggle('gm');
    expect(c.stateOf('gm')).toBe('all');
    expect(c.chipCount('gm')).toBe('adds to 1');
    expect(c.hasChanges()).toBeTrue();
    await c.save();
    expect(c.dialogRef.close).toHaveBeenCalledWith({ add: ['gm'], remove: [] });
  });

  it('removes a tag everyone has, and keeps untouched partial tags out of the result', async () => {
    const c = bulk([['bt', 'cv'], ['bt']]);
    c.toggle('bt');
    expect(c.chipCount('bt')).toBe('removes from 2');
    expect(c.isChanged('cv')).toBeFalse();
    await c.save();
    expect(c.dialogRef.close).toHaveBeenCalledWith({ add: [], remove: ['bt'] });
  });

  it('Apply with nothing changed closes nothing', async () => {
    const c = bulk([['bt']]);
    await c.save();
    expect(c.dialogRef.close).not.toHaveBeenCalled();
    expect(c.snackBar.open).toHaveBeenCalled();
  });

  it('caps the footer at four lines', () => {
    const c = bulk([[], []]);
    ['bt', 'cv', 'eb', 'gm', 'hb', 'wl'].forEach(id => c.toggle(id));
    const lines = c.summaryLines().map((l: any) => l.text);
    expect(lines.length).toBe(5);
    expect(lines[0]).toBe('Adds Breakthrough 2026 to 2 people');
    expect(lines[4]).toBe('and 2 more changes');
  });

  it('fills the bulk state from the constructor (no reads)', () => {
    const c = new AssignTagsDialogComponent({} as any, {} as any, {} as any, {} as any, {} as any,
      { mode: 'bulk', users: [{ tags: ['cv', 'cv'] }, { tags: ['cv', 'gm'] }, { tags: null }] });
    expect(c.bulkCount).toBe(3);
    expect(c.bulkCarriers.get('cv')).toBe(2);
    expect(c.bulkCarriers.get('gm')).toBe(1);
    expect(c.stateOf('cv')).toBe('some');
    expect(c.bulkState.size).toBe(0);
    c.ngOnDestroy();
  });
});

describe('AssignTagsDialog redesign — Manage tags', () => {
  it('takes people counts from the page, hides them when none were passed, and reads 0 for a new tag', () => {
    const withCounts = new AssignTagsDialogComponent({} as any, {} as any, {} as any, {} as any, {} as any,
      { mode: 'manage', tagCounts: { cv: 286, bt: 1 } });
    expect(withCounts.tagCounts).toEqual({ cv: 286, bt: 1 });
    expect(withCounts.countOf('cv')).toBe(286);
    expect(withCounts.countOf('brand-new')).toBe(0);
    expect(withCounts.title).toBe('Manage tags');
    expect(withCounts.subtitle).toBe('Create and rename tags, copy segment links');
    const without = new AssignTagsDialogComponent({} as any, {} as any, {} as any, {} as any, {} as any, { mode: 'manage' });
    expect(without.tagCounts).toBeNull();
    withCounts.ngOnDestroy();
    without.ngOnDestroy();
  });

  it('single mode remembers the person\'s tags at open, so Save can say what changes', () => {
    const c = new AssignTagsDialogComponent({} as any, {} as any, {} as any, {} as any, {} as any,
      { user: { id: 'u1', name: 'Aarav K', email: ' a@example.com ', tags: ['cv', '', 'gm'] } });
    expect([...c.initialSelected]).toEqual(['cv', 'gm']);
    expect(c.userEmail).toBe('a@example.com');
    expect(c.hasChanges()).toBeFalse();
    c.ngOnDestroy();
  });

  it('refuses a blank or duplicate name before any read or write, with the wording the hub asserts', async () => {
    const c = harness({ mode: 'manage', editingId: 'cv', editName: '   ' });
    await c.saveRename();
    expect(c.renameError).toMatch(/Enter a name/i);
    c.editName = 'gold MEMBERS';
    await c.saveRename();
    expect(c.renameError).toMatch(/already has this name/i);
    expect(c.isRenaming).toBeFalse();
    expect(c.editingId).toBe('cv');   // the editor stays open on a refusal
  });

  it('Escape in the editor cancels the edit only, and stops the dialog from seeing it', () => {
    const c = harness({ mode: 'manage', editingId: 'cv', editName: 'x', renameError: 'Enter a name for the tag.' });
    const ev = jasmine.createSpyObj('ev', ['stopPropagation', 'preventDefault']);
    c.cancelRename(ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(c.editingId).toBeNull();
    expect(c.renameError).toBe('');
  });

  it('switching tabs cancels an edit that is not saving, but never one that is', () => {
    const c = harness({ mode: 'manage', editingId: 'cv' });
    c.selectTab(1);
    expect(c.activeTab).toBe(1);
    expect(c.editingId).toBeNull();
    const saving = harness({ mode: 'manage', editingId: 'cv', isRenaming: true });
    saving.selectTab(1);
    expect(saving.editingId).toBe('cv');
  });

  it('clicking a row while a rename is saving does nothing', () => {
    const c = harness({ mode: 'manage', editingId: 'cv', editName: 'New', isRenaming: true });
    c.toggle('gm');
    expect(c.editingId).toBe('cv');
    expect(c.editName).toBe('New');
  });

  it('a similar tag in Manage tags reveals that tag\'s row instead of toggling anything', () => {
    const c = harness({ mode: 'manage', search: 'Gold Batch 2' });
    expect(c.similarTags().map((t: Tag) => t.id)).toEqual(['gm', 'hb']);
    c.pickSimilar(TAGS[3]);
    expect(c.search).toBe('Gold Members');
    expect(c.filteredTags().map((t: Tag) => t.id)).toEqual(['gm']);
  });
});

describe('AssignTagsDialog redesign — Segment links', () => {
  it('copies the same payloads as before and confirms in the footer', () => {
    const c = harness({ mode: 'manage', activeTab: 1 });
    c.copySelection.select('gm');
    c.copySelection.select('cv');
    c.copySelectedSegments();
    expect(c.clipboard.copy).toHaveBeenCalledWith('?segment=cv,gm');   // table order, not tick order
    expect(c.notice).toBe('Copied a link for 2 tags');
    c.copySegment('cv');
    expect(c.clipboard.copy).toHaveBeenCalledWith('?segment=cv');
    expect(c.notice).toBe('Copied the link for Chennai Venue');
    c.copySelection.clear();
    c.copySelection.select('eb');
    c.copySelectedSegments();
    expect(c.notice).toBe('Copied a link for 1 tag');
    expect(c.snackBar.open).not.toHaveBeenCalled();
    c.ngOnDestroy();
  });

  it('does not claim a copy that failed', () => {
    const c = harness({ mode: 'manage', activeTab: 1 });
    c.clipboard.copy.and.returnValue(false);
    c.copySegment('cv');
    expect(c.notice).toMatch(/Could not copy/);
    c.ngOnDestroy();
  });

  it('the header box reads all, none or mixed', () => {
    const c = harness({ mode: 'manage', activeTab: 1 });
    expect(c.isAllTagsSelected()).toBeFalse();
    expect(c.someTagsSelected()).toBeFalse();
    c.copySelection.select('cv');
    expect(c.someTagsSelected()).toBeTrue();
    c.masterToggleTags();
    expect(c.isAllTagsSelected()).toBeTrue();
    expect(c.someTagsSelected()).toBeFalse();
    c.masterToggleTags();
    expect(c.copySelection.hasValue()).toBeFalse();
  });

  it('splits the sample link so the segment ids can be highlighted', () => {
    const c = harness({ segmentHint: 'https://example.com/w/abc?segment=one,two' });
    expect(c.segmentHintBase).toBe('https://example.com/w/abc?segment=');
    expect(c.segmentHintIds).toBe('one,two');
  });

  it('the notice clears itself', () => {
    jasmine.clock().install();
    try {
      const c = harness({ mode: 'manage' });
      c.notify('Copied the link for Chennai Venue');
      expect(c.notice).toBe('Copied the link for Chennai Venue');
      jasmine.clock().tick(4001);
      expect(c.notice).toBe('');
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
