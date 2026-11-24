import { Component, NgZone, OnDestroy, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Firestore, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from '@angular/fire/firestore';
import {
  HoldBy,
  HoldWrite,
  NewUserDetailsView,
  buildHoldWrite,
  detailsView,
  holdByOf,
  holdCaption,
  isOnHold,
} from './new-user-details';

/** What the New Users screen hands the dialog. */
export interface NewUserDetailsData {
  /** The new_user_data document id. */
  id: string;
  /** The row as the list holds it: the first paint, before the live read answers. */
  user: any;
  /** Tag id -> name, as the table resolves them; a getter follows the screen's live tag list. */
  tagMap: Record<string, string> | (() => Record<string, string> | null | undefined) | null;
  /** The signed-in admin's profile id (WorkshopAccessService.currentProfileId()). */
  profileId: Promise<string | null> | string | null;
}

/**
 * Names of whoever changed a hold, by profile id. Read-only lookups (profile_data, then participant
 * metadata), kept for the session so reopening the dialog never re-reads.
 */
const NAME_LOOKUPS = new Map<string, Promise<string>>();
const NAMES_KNOWN = new Map<string, string>();
/** A lookup that has not answered by now shows the caption without a name. */
const NAME_WAIT_MS = 6000;

@Component({
  selector: 'app-new-user-details-dialog',
  standalone: true,
  imports: [MatSlideToggleModule],
  templateUrl: './new-user-details-dialog.component.html',
  styleUrl: './new-user-details-dialog.component.css',
  // The dialog renders in the CDK overlay. Every rule in its sheet is rooted in .nud-root or in the
  // 'nud-dialog-panel' pane, so None leaks nothing (same approach as the tags dialog).
  encapsulation: ViewEncapsulation.None,
})
export class NewUserDetailsDialogComponent implements OnInit, OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly zone = inject(NgZone);
  private readonly dialogRef = inject<MatDialogRef<NewUserDetailsDialogComponent>>(MatDialogRef);
  private readonly data = inject<NewUserDetailsData>(MAT_DIALOG_DATA);

  readonly id: string;
  /** The document as last read (the row passed in, until the live read answers). */
  private user: any;
  private viewMemo: { user: any; tagMap: Record<string, string> | undefined; view: NewUserDetailsView } | null = null;

  /** Delivery on hold as stored. */
  stored = false;
  /** The value being saved; null when no save is running. */
  pending: boolean | null = null;
  saving = false;
  saveFailed = false;
  /** The live document is gone. */
  missing = false;

  /** The signed-in admin's profile id; null until known, or when it can't be found. */
  adminId: string | null = null;
  adminChecked = false;

  holdBy: HoldBy | null = null;
  /** The changer's name: '' when none was found, null while the lookup runs. */
  holdByName: string | null = null;

  private unsubscribe: (() => void) | null = null;
  private closed = false;

  constructor() {
    const d = this.data || ({} as NewUserDetailsData);
    const user = d.user || {};
    this.id = (d.id || user?.id || user?.docid || '').toString();
    this.user = user;
    this.applyHold(user);
  }

  ngOnInit(): void {
    this.listen();
    this.loadAdmin();
  }

  ngOnDestroy(): void {
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ---- what the template reads ----

  /** Every shown value; rebuilt when the document or the screen's tag names change. */
  get view(): NewUserDetailsView {
    const tagMap = this.tagMapNow();
    const memo = this.viewMemo;
    if (memo && memo.user === this.user && memo.tagMap === tagMap) return memo.view;
    const view = detailsView(this.user, tagMap);
    this.viewMemo = { user: this.user, tagMap, view };
    return view;
  }

  /** The switch shows the value being saved, otherwise the stored one. */
  get checked(): boolean {
    return this.pending ?? this.stored;
  }

  get toggleDisabled(): boolean {
    return this.saving || !this.adminId || this.missing || !this.id;
  }

  /** The admin's own profile could not be found, so nothing can be recorded. */
  get adminMissing(): boolean {
    return this.adminChecked && !this.adminId;
  }

  /** The caption under the switch; null hides it (nothing recorded yet, or the name is still being read). */
  get caption(): string | null {
    if (!this.holdBy || this.holdByName === null) return null;
    return holdCaption(this.stored, this.holdByName, this.holdBy.ms);
  }

  close(): void {
    this.dialogRef.close();
  }

  // ---- the one editable control ----

  async onHoldChange(event: MatSlideToggleChange): Promise<void> {
    const next = event.checked;
    const write = this.toggleDisabled ? null : buildHoldWrite(next, this.adminId, serverTimestamp());
    if (!write) {
      event.source.checked = this.checked;   // nothing is written: put the switch back
      return;
    }
    this.saving = true;
    this.pending = next;
    this.saveFailed = false;
    let saved = false;
    try {
      await this.writeHold(write);
      saved = true;
    } catch (err) {
      console.error('Error saving delivery on hold:', err);
      this.saveFailed = true;
    }
    this.saving = false;
    this.pending = null;
    // The live read normally holds the saved value already; this covers a read that has not answered.
    if (saved) this.stored = next;
    // Set the switch itself: a save that fails before the view updates leaves the [checked] binding
    // unchanged, so the binding alone would not put it back.
    event.source.checked = this.checked;
  }

  /** The one write this dialog makes. updateDoc, never setDoc: a person removed meanwhile is not brought back. */
  protected writeHold(write: HoldWrite): Promise<void> {
    return updateDoc(doc(this.firestore, 'new_user_data', this.id), write as any);
  }

  // ---- reads ----

  private tagMapNow(): Record<string, string> | undefined {
    const m = this.data?.tagMap;
    const map = typeof m === 'function' ? m() : m;
    return map || undefined;
  }

  /** Listens to this one document while the dialog is open. */
  private listen(): void {
    if (!this.id) return;
    try {
      this.unsubscribe = onSnapshot(
        doc(this.firestore, 'new_user_data', this.id),
        snap => this.zone.run(() => {
          if (this.closed) return;
          if (!snap.exists()) {
            this.missing = true;
            return;
          }
          this.missing = false;
          // 'estimate': a change still on its way to the server shows its local time, not a blank.
          const u = snap.data({ serverTimestamps: 'estimate' }) || {};
          this.user = u;
          this.applyHold(u);
        }),
        err => this.zone.run(() => console.error('Error reading the new user:', err)),
      );
    } catch (err) {
      console.error('Error listening to the new user:', err);
    }
  }

  private async loadAdmin(): Promise<void> {
    let id: string | null = null;
    try {
      const raw = await this.data?.profileId;
      id = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    } catch (err) {
      console.error('Could not resolve the signed-in profile:', err);
    }
    if (this.closed) return;
    this.adminId = id;
    this.adminChecked = true;
    // Read the admin's own name now, so the caption after a flip shows it straight away.
    if (id) this.lookupName(id).catch(() => undefined);
  }

  private applyHold(u: any): void {
    this.stored = isOnHold(u);
    const by = holdByOf(u);
    const prevUser = this.holdBy?.user;
    this.holdBy = by;
    if (!by) {
      this.holdByName = null;
      return;
    }
    if (by.user === prevUser && this.holdByName !== null) return;
    if (!by.user) {
      this.holdByName = '';
      return;
    }
    const known = NAMES_KNOWN.get(by.user);
    if (known !== undefined) {
      this.holdByName = known;
      return;
    }
    this.holdByName = null;
    const user = by.user;
    const settle = (name: string) => this.zone.run(() => {
      if (!this.closed && this.holdBy?.user === user) this.holdByName = name;
    });
    this.lookupName(user).then(settle);
    // A lookup slower than NAME_WAIT_MS shows the caption without a name first; the name follows when it lands.
    this.nameLookup(user).then(name => { if (name) settle(name); });
  }

  /** profile_data/{id}.name, then 'participant metadata'/{id}.name; '' when neither has one. Never rejects. */
  private lookupName(id: string): Promise<string> {
    const p = this.nameLookup(id);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<string>(resolve => { timer = setTimeout(() => resolve(''), NAME_WAIT_MS); });
    return Promise.race([p, timeout]).finally(() => { if (timer) clearTimeout(timer); });
  }

  /** The shared lookup for `id`, with no time limit. Never rejects. */
  private nameLookup(id: string): Promise<string> {
    let p = NAME_LOOKUPS.get(id);
    if (!p) {
      p = this.readName(id);
      NAME_LOOKUPS.set(id, p);
    }
    return p;
  }

  private async readName(id: string): Promise<string> {
    if (!id || id.includes('/')) return '';
    let failed = false;
    for (const col of ['profile_data', 'participant metadata']) {
      try {
        const snap = await getDoc(doc(this.firestore, col, id));
        const name = snap.exists() ? (snap.data()?.['name'] ?? '').toString().trim() : '';
        if (name) {
          NAMES_KNOWN.set(id, name);
          return name;
        }
      } catch (err) {
        failed = true;
        console.warn(`Could not read a name from ${col}:`, err);
      }
    }
    if (failed) NAME_LOOKUPS.delete(id);   // a failed read is tried again next time
    else NAMES_KNOWN.set(id, '');
    return '';
  }
}
