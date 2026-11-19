import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { SelectionModel } from '@angular/cdk/collections';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

export interface Tag {
  id: string;
  name: string;
}

/** Where a tag stands across the people being edited: every one of them, some of them, or none. */
export type TagState = 'all' | 'some' | 'none';

/** One footer sentence: "{verb} <b>{names}</b> {more} {tail}". `text` is the whole sentence, plain. */
export interface SummaryLine {
  verb: string;
  names: string;
  more: string;
  tail: string;
  text: string;
}

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for the unit spec). No Firestore, no DOM.
// ---------------------------------------------------------------------------------------------

const fmt = (n: number): string => n.toLocaleString('en-US');

/** "1 person" / "3 people" / "1,284 people". */
export function peopleWord(n: number): string {
  return `${fmt(n)} ${n === 1 ? 'person' : 'people'}`;
}

/** The state a tag starts in, from how many of the `total` people carry it. */
export function initialBulkState(carriers: number, total: number): TagState {
  if (total <= 0 || carriers <= 0) return 'none';
  return carriers >= total ? 'all' : 'some';
}

/**
 * One tap. A tag that started partial goes some -> all -> none -> some (back to untouched);
 * a tag that started on everyone or on no one flips between all and none.
 */
export function nextBulkState(current: TagState, initial: TagState): TagState {
  if (initial === 'some') {
    if (current === 'some') return 'all';
    if (current === 'all') return 'none';
    return 'some';
  }
  return current === 'all' ? 'none' : 'all';
}

/** The small count on a bulk chip: "all 3", "adds to 3", "on 2 of 3", "removes from 1", or nothing. */
export function bulkChipCount(state: TagState, initial: TagState, carriers: number, total: number): string {
  if (state === 'all') return state === initial ? `all ${fmt(total)}` : `adds to ${fmt(Math.max(total - carriers, 0))}`;
  if (state === 'some') return `on ${fmt(carriers)} of ${fmt(total)}`;
  return state === initial ? '' : `removes from ${fmt(carriers)}`;
}

/** "A, B, C" plus "and 2 more" past `max` names. */
export function joinNames(names: string[], max = 3): { names: string; more: string } {
  if (names.length <= max) return { names: names.join(', '), more: '' };
  return { names: names.slice(0, max).join(', '), more: `and ${fmt(names.length - max)} more` };
}

function line(verb: string, names: string, more: string, tail: string): SummaryLine {
  const text = [verb, names, more, tail].filter(Boolean).join(' ');
  return { verb, names, more, tail, text };
}

/** Assign tags (one person): "Adds X to Aarav" and/or "Removes Y from Aarav". */
export function singleSummary(addNames: string[], removeNames: string[], firstName: string): SummaryLine[] {
  const out: SummaryLine[] = [];
  if (addNames.length) {
    const j = joinNames(addNames);
    out.push(line('Adds', j.names, j.more, `to ${firstName}`));
  }
  if (removeNames.length) {
    const j = joinNames(removeNames);
    out.push(line('Removes', j.names, j.more, `from ${firstName}`));
  }
  return out;
}

export interface BulkChange {
  name: string;
  adds: boolean;
  count: number;
}

/** Edit tags (several people): one line per changed tag, the first `max` and then "and N more changes". */
export function bulkSummary(changes: BulkChange[], max = 4): SummaryLine[] {
  const out = changes.slice(0, max).map(c =>
    c.adds ? line('Adds', c.name, '', `to ${peopleWord(c.count)}`) : line('Removes', c.name, '', `from ${peopleWord(c.count)}`)
  );
  const rest = changes.length - max;
  if (rest > 0) out.push(line('', '', '', `and ${fmt(rest)} more ${rest === 1 ? 'change' : 'changes'}`));
  return out;
}

function words(s: string): string[] {
  return (s || '').toLowerCase().split(/[\s\-_/]+/).filter(Boolean);
}

/**
 * Existing tags that share a word of 3 or more letters with the typed name and are not already shown
 * by the substring filter (`shown`). At most `max`, in list order. Heads off near-duplicate tags.
 */
export function similarTagsFor(term: string, tags: Tag[], shown: Set<string>, max = 6): Tag[] {
  const want = new Set(words(term).filter(w => w.length >= 3));
  if (!want.size) return [];
  return tags.filter(t => !shown.has(t.id) && words(t.name).some(w => want.has(w))).slice(0, max);
}

/** First letters of the first two words, uppercased; "U" when there is no name. */
export function initialsOf(name: string): string {
  const s = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join('');
  return s ? s.toUpperCase() : 'U';
}

@Component({
  selector: 'app-assign-tags-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-tags-dialog.component.html',
  styleUrl: './assign-tags-dialog.component.css',
  // The dialog renders in the CDK overlay, outside the page. Every rule in its sheet is rooted in
  // .atd-root (or the 'atd-dialog-panel' pane), so None leaks nothing; see the CSS header.
  encapsulation: ViewEncapsulation.None
})
export class AssignTagsDialogComponent implements OnInit, OnDestroy {
  tags: Tag[] = [];
  selected = new Set<string>();
  search = '';
  loading = true;
  isSaving = false;
  isCreating = false;
  userName = '';
  userEmail = '';
  // 'single' = assign to one user; 'bulk' = edit the tags of many users;
  // 'manage' = global tag manager (create + rename, Segment links), no user.
  mode: 'single' | 'bulk' | 'manage' = 'single';
  bulkCount = 0;
  private userId = '';
  /** The name as stored (may be blank); userName falls back to 'User' as before. */
  private rawName = '';
  // Single mode: the person's tags when the dialog opened, to show what Save will change.
  initialSelected = new Set<string>();

  // ---- Bulk mode: three states per tag, counted from the selected users' tags (no reads) ----
  /** How many of the selected people carry each tag (each user's tags deduped). */
  bulkCarriers = new Map<string, number>();
  /** Only the tags the operator has tapped away from their starting state. */
  bulkState = new Map<string, TagState>();

  // ---- Manage mode: people per tag, counted by the page from the list it already holds ----
  tagCounts: Record<string, number> | null = null;

  // ---- Manage mode: rename an existing tag (operator 2026-11-12) ----
  // Only the tag's name changes. Every reader keys tags by id, so users, enrolments and shared
  // segment links keep pointing at the same tag and simply show the new name.
  editingId: string | null = null;
  editName = '';
  renameError = '';
  isRenaming = false;
  @ViewChild('renameInput') private renameInput?: ElementRef<HTMLInputElement>;

  /** A short confirmation in the Manage tags footer (rename, copy). Clears itself. */
  notice = '';
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Manage mode, second tab: Segment links ----
  activeTab = 0;
  copySelection = new SelectionModel<string>(true, []);
  readonly segmentHint =
    'https://eiflix.com/web/workshop/NlMLGPs4uj1cDl44H7io?segment=nRpMxgeTYEzhGHEeigrL,3ZLQDG4RiVklI2HUz00D';

  constructor(
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private clipboard: Clipboard,
    private dialogRef: MatDialogRef<AssignTagsDialogComponent>,
    private host: ElementRef<HTMLElement>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    if (data?.mode === 'manage') {
      this.mode = 'manage';
      const counts = data?.tagCounts;
      this.tagCounts = counts && typeof counts === 'object' ? counts : null;
    } else if (data?.mode === 'bulk') {
      this.mode = 'bulk';
      const users: any[] = Array.isArray(data?.users) ? data.users : [];
      this.bulkCount = users.length;
      // Count how many selected users carry each tag. A tag on all of them starts 'all', on some 'some'.
      users.forEach(u => {
        new Set<string>(Array.isArray(u?.tags) ? u.tags : []).forEach(id => {
          if (id) this.bulkCarriers.set(id, (this.bulkCarriers.get(id) || 0) + 1);
        });
      });
    } else {
      const u = data?.user || {};
      this.userId = u.id || u.docid || '';
      this.rawName = (u.name || '').toString().trim();
      this.userName = this.rawName || 'User';
      this.userEmail = (u.email || '').toString().trim();
      (Array.isArray(u.tags) ? u.tags : []).forEach((id: string) => {
        if (!id) return;
        this.selected.add(id);
        this.initialSelected.add(id);
      });
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const ref = query(
        collection(this.firestore, 'newusertags'),
        where('type', '==', 'newusersegments')
      );
      const rows = (await firstValueFrom(collectionData(ref, { idField: 'id' }))) as any[];
      this.tags = rows
        .map(r => ({ id: r.id, name: (r.name || '').toString() }))
        .filter(t => t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Error loading tags:', err);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  // ---- header ----
  get title(): string {
    if (this.mode === 'manage') return 'Manage tags';
    return this.mode === 'bulk' ? 'Edit tags' : 'Assign tags';
  }

  get subtitle(): string {
    if (this.mode === 'manage') return 'Create and rename tags, copy segment links';
    if (this.mode === 'bulk') return this.bulkCount === 1 ? '1 selected person' : `${fmt(this.bulkCount)} selected people`;
    const name = this.rawName;
    if (!name) return this.userEmail || this.userName || 'User';
    return this.userEmail ? `${name} · ${this.userEmail}` : name;
  }

  get initials(): string {
    return initialsOf(this.rawName);
  }

  /** "Aarav" in "On Aarav · 6" and "Adds X to Aarav". */
  get firstName(): string {
    return (this.rawName || '').split(/\s+/).filter(Boolean)[0] || 'this person';
  }

  trackTag(_: number, t: Tag): string {
    return t.id;
  }

  trackLine(_: number, l: SummaryLine): string {
    return l.text;
  }

  // ---- search, create, similar ----
  filteredTags(): Tag[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.tags;
    return this.tags.filter(t => t.name.toLowerCase().includes(term));
  }

  // True when the typed term doesn't already exist as a tag (so we can offer create).
  canCreate(): boolean {
    const term = this.search.trim();
    if (!term) return false;
    return !this.tags.some(t => t.name.toLowerCase() === term.toLowerCase());
  }

  /** Shown only while Create is offered: tags sharing a word with the typed name, not already listed. */
  similarTags(): Tag[] {
    if (!this.canCreate()) return [];
    const shown = new Set(this.filteredTags().map(t => t.id));
    return similarTagsFor(this.search, this.tags, shown);
  }

  pickSimilar(t: Tag): void {
    if (this.mode === 'manage') { this.search = t.name; return; }   // reveal its row, to rename it
    this.toggle(t.id);
    this.search = '';
  }

  // ---- chip state (single and bulk share one chip template) ----
  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  initialState(id: string): TagState {
    if (this.mode === 'bulk') return initialBulkState(this.bulkCarriers.get(id) || 0, this.bulkCount);
    return this.initialSelected.has(id) ? 'all' : 'none';
  }

  stateOf(id: string): TagState {
    if (this.mode === 'bulk') return this.bulkState.get(id) ?? this.initialState(id);
    return this.selected.has(id) ? 'all' : 'none';
  }

  isChanged(id: string): boolean {
    return this.stateOf(id) !== this.initialState(id);
  }

  chipCount(id: string): string {
    if (this.mode !== 'bulk') return '';
    return bulkChipCount(this.stateOf(id), this.initialState(id), this.bulkCarriers.get(id) || 0, this.bulkCount);
  }

  /** Single mode: the person's tags (filtered by the search), then the rest. Alphabetical, like the list. */
  onTags(): Tag[] {
    return this.filteredTags().filter(t => this.selected.has(t.id));
  }

  moreTags(): Tag[] {
    return this.filteredTags().filter(t => !this.selected.has(t.id));
  }

  /** How many listed tags the person has now, whatever the search shows. */
  onCount(): number {
    return this.tags.filter(t => this.selected.has(t.id)).length;
  }

  hasChanges(): boolean {
    if (this.mode === 'bulk') {
      for (const [id, s] of this.bulkState) if (s !== this.initialState(id)) return true;
      return false;
    }
    if (this.mode !== 'single') return false;
    if (this.selected.size !== this.initialSelected.size) return true;
    for (const id of this.selected) if (!this.initialSelected.has(id)) return true;
    return false;
  }

  /** Exactly what Save / Apply will do, in words. */
  summaryLines(): SummaryLine[] {
    if (this.mode === 'single') {
      const adds = this.tags.filter(t => this.selected.has(t.id) && !this.initialSelected.has(t.id)).map(t => t.name);
      const removes = this.tags.filter(t => !this.selected.has(t.id) && this.initialSelected.has(t.id)).map(t => t.name);
      return singleSummary(adds, removes, this.firstName);
    }
    if (this.mode === 'bulk') {
      const changes: BulkChange[] = [];
      this.tags.forEach(t => {
        if (!this.isChanged(t.id)) return;
        const carriers = this.bulkCarriers.get(t.id) || 0;
        if (this.stateOf(t.id) === 'all') changes.push({ name: t.name, adds: true, count: Math.max(this.bulkCount - carriers, 0) });
        else if (this.stateOf(t.id) === 'none') changes.push({ name: t.name, adds: false, count: carriers });
      });
      return bulkSummary(changes);
    }
    return [];
  }

  /** Bulk result: tags now on everyone that were not, and tags now on no one that were on someone. */
  bulkResult(): { add: string[]; remove: string[] } {
    const add: string[] = [];
    const remove: string[] = [];
    this.bulkState.forEach((s, id) => {
      if (s === this.initialState(id)) return;
      if (s === 'all') add.push(id);
      else if (s === 'none') remove.push(id);
    });
    return { add, remove };
  }

  toggle(id: string): void {
    // Manage mode has no user to assign to: clicking a tag renames it instead.
    if (this.mode === 'manage') { this.startRename(id); return; }
    if (this.mode === 'bulk') {
      const init = this.initialState(id);
      const next = nextBulkState(this.stateOf(id), init);
      if (next === init) this.bulkState.delete(id);
      else this.bulkState.set(id, next);
      return;
    }
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.focusTag(id);   // the chip moved to the other cloud; keep keyboard focus on it
  }

  // ---- Manage mode: tabs ----
  selectTab(i: number, focus = false): void {
    if (this.editingId && !this.isRenaming) this.cancelRename();
    this.activeTab = i;
    if (focus) {
      setTimeout(() => this.host?.nativeElement?.querySelector<HTMLElement>(i === 0 ? '#atd-tab-0' : '#atd-tab-1')?.focus());
    }
  }

  // ---- Manage mode: rename ----
  startRename(id: string): void {
    if (this.isRenaming) return;   // one save at a time; a second editor would be closed when the first lands
    this.editingId = id;
    this.editName = this.tagName(id);
    this.renameError = '';
    setTimeout(() => { this.renameInput?.nativeElement.focus(); this.renameInput?.nativeElement.select(); });
  }

  /** Escape must stop here: the dialog itself closes on Escape and would throw the edit away. */
  cancelRename(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    const id = this.editingId;
    this.editingId = null;
    this.editName = '';
    this.renameError = '';
    if (id) this.focusTag(id);   // back to that tag's row
  }

  /** Why the typed name can't be saved, or '' when it can. Checked against the tags on screen. */
  private renameProblem(id: string, name: string, others: Tag[]): string {
    if (!name) return 'Enter a name for the tag.';
    if (others.some(t => t.id !== id && t.name.trim().toLowerCase() === name.toLowerCase())) {
      return 'Another tag already has this name.';
    }
    return '';
  }

  async saveRename(): Promise<void> {
    const id = this.editingId;
    if (!id || this.isRenaming) return;
    const name = this.editName.trim();
    if (name === this.tagName(id)) { this.cancelRename(); return; }   // nothing changed
    this.renameError = this.renameProblem(id, name, this.tags);
    if (this.renameError) return;
    this.isRenaming = true;
    try {
      // Re-check against the stored tags just before writing: someone may have added one since this opened.
      const snap = await getDocs(query(collection(this.firestore, 'newusertags'), where('type', '==', 'newusersegments')));
      const stored: Tag[] = snap.docs.map(d => ({ id: d.id, name: (d.data()?.['name'] || '').toString() }));
      this.renameError = this.renameProblem(id, name, stored);
      if (this.renameError) return;
      // Only the name: the tag keeps its id and every other stored field.
      await updateDoc(doc(this.firestore, 'newusertags', id), { name });
      this.tags = this.tags.map(t => (t.id === id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name));
      this.notify(`Renamed to “${name}”`);
      if (this.editingId === id) this.cancelRename();
    } catch (err) {
      console.error('Error renaming tag:', err);
      this.renameError = 'Could not rename the tag. Please try again.';
    } finally {
      this.isRenaming = false;
      // Still editing (a refusal or a failed write): give the input its focus back, it was disabled while saving.
      if (this.editingId === id) setTimeout(() => this.renameInput?.nativeElement.focus());
    }
  }

  /** People per tag, from the page's counts. Tags made in this dialog read 0. */
  countOf(id: string): number {
    return this.tagCounts?.[id] ?? 0;
  }

  notify(msg: string): void {
    this.notice = msg;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = ''; this.noticeTimer = null; }, 4000);
  }

  /** Focus a tag's chip or ledger row after the view updates (it may have been re-rendered). */
  private focusTag(id: string): void {
    setTimeout(() => {
      const root = this.host?.nativeElement;
      if (!root || typeof root.querySelectorAll !== 'function') return;
      const el = Array.from(root.querySelectorAll<HTMLElement>('[data-tag]')).find(e => e.getAttribute('data-tag') === id);
      el?.focus();
    });
  }

  // Footers: Save/Apply when assigning to user(s); Close in Manage tags.
  get showAssignFooter(): boolean {
    return !this.loading && this.mode !== 'manage';
  }

  get showCloseFooter(): boolean {
    return !this.loading && this.mode === 'manage';
  }

  tagName(id: string): string {
    return this.tags.find(t => t.id === id)?.name || id;
  }

  selectedIds(): string[] {
    return [...this.selected];
  }

  async createTag(): Promise<void> {
    const name = this.search.trim();
    if (!name || this.isCreating || !this.canCreate()) return;
    this.isCreating = true;
    try {
      const ref = doc(collection(this.firestore, 'newusertags'));
      // Stamped silently so this dialog's tags stay within the newusersegments type; not shown in the UI.
      await setDoc(ref, { id: ref.id, name, type: 'newusersegments', created: serverTimestamp() });
      this.tags = [...this.tags, { id: ref.id, name }].sort((a, b) => a.name.localeCompare(b.name));
      // Turn it on for whoever is being edited (not yet saved onto anyone, so it carries the gold ring).
      if (this.mode === 'single') this.selected.add(ref.id);
      else if (this.mode === 'bulk') this.bulkState.set(ref.id, 'all');
      this.search = '';
    } catch (err) {
      console.error('Error creating tag:', err);
      this.snackBar.open('Error creating tag.', 'Close', { duration: 3000 });
    } finally {
      this.isCreating = false;
    }
  }

  async save(): Promise<void> {
    if (this.isSaving) return;

    // Bulk mode: return the tags to add and remove; the caller applies per user.
    if (this.mode === 'bulk') {
      const { add, remove } = this.bulkResult();
      if (add.length === 0 && remove.length === 0) {
        this.snackBar.open('No tag changes to apply.', 'Close', { duration: 2500 });
        return;
      }
      this.dialogRef.close({ add, remove });
      return;
    }

    if (!this.userId) return;
    this.isSaving = true;
    try {
      const ref = doc(this.firestore, 'new_user_data', this.userId);
      await updateDoc(ref, { tags: this.selectedIds() });
      this.snackBar.open('Tags updated.', 'Close', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving tags:', err);
      this.snackBar.open('Error saving tags.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  // ---- Segment links ----
  /** The sample link, split so the segment ids can be highlighted. */
  get segmentHintBase(): string {
    const i = this.segmentHint.indexOf('?segment=');
    return i < 0 ? this.segmentHint : this.segmentHint.slice(0, i + '?segment='.length);
  }

  get segmentHintIds(): string {
    const i = this.segmentHint.indexOf('?segment=');
    return i < 0 ? '' : this.segmentHint.slice(i + '?segment='.length);
  }

  isAllTagsSelected(): boolean {
    return this.tags.length > 0 && this.tags.every(t => this.copySelection.isSelected(t.id));
  }

  someTagsSelected(): boolean {
    return this.copySelection.hasValue() && !this.isAllTagsSelected();
  }

  masterToggleTags(): void {
    if (this.isAllTagsSelected()) {
      this.copySelection.clear();
    } else {
      this.tags.forEach(t => this.copySelection.select(t.id));
    }
  }

  // Copy a single tag's segment: ?segment=<id>
  copySegment(id: string): void {
    const ok = this.clipboard.copy(`?segment=${id}`);
    this.notify(ok ? `Copied the link for ${this.tagName(id)}` : 'Could not copy the link. Please try again.');
  }

  // Copy the selected rows' segment, in table order: ?segment=<id1>,<id2>,...
  copySelectedSegments(): void {
    const ids = this.tags.map(t => t.id).filter(id => this.copySelection.isSelected(id));
    if (ids.length === 0) {
      this.snackBar.open('Select at least one tag.', 'Close', { duration: 2000 });
      return;
    }
    const ok = this.clipboard.copy(`?segment=${ids.join(',')}`);
    this.notify(ok
      ? `Copied a link for ${fmt(ids.length)} tag${ids.length === 1 ? '' : 's'}`
      : 'Could not copy the link. Please try again.');
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
