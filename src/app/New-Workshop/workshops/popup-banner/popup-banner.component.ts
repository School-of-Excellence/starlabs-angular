import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { filter } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { WC2_TOOLBAR_FULL, resetToParagraph, focusedEditor } from '../../workshop-configurationv2/wc2-editor';
import {
  PopupBanner, bannerLabel, bannersFromDoc, bannersToPayload, blankBanner, isLegacyOnly,
} from './popup-banner.model';

/** The three artwork slots, with the size each one is cut to. */
interface Slot {
  key: 'desktop' | 'tablet' | 'mobile';
  label: string;
  hint: string;
}

/**
 * EiFlix popup banner editor — the `popupbanner` field on `classify/eiflixpopupbanner`.
 *
 * SEVERAL banners live in that one field, as an array of maps (2026-10-06). The dialog is a
 * master-detail: the list picks a banner, and the form below edits whichever is selected. One set of
 * six ngx-editor instances is reused across the selection rather than one set per banner — ProseMirror
 * instances are expensive, and a list of ten banners would otherwise build sixty of them.
 *
 * The form is the working copy of the SELECTED banner only. Every path that changes the selection
 * (select, add, remove) commits the form back into the array first, so an edit is never lost by
 * clicking away from it.
 *
 * `setDoc(..., { merge: true })` writes only `popupbanner`. The legacy flat fields are deliberately
 * left on the document: the app that renders the popup still reads them until it is updated, so
 * clearing them here would take the live banner down.
 *
 * Nothing is required — every field may be left empty, and each banner's own `enable` decides
 * whether it shows.
 *
 * The rich-text fields use the same ngx-editor setup and skin as the workshop
 * configuration editor (`wc2-shared.css`), so the two screens behave alike.
 */
@Component({
  selector: 'app-popup-banner',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, NgxEditorModule,
  ],
  templateUrl: './popup-banner.component.html',
  styleUrls: ['./popup-banner.component.css'],
})
export class PopupBannerComponent implements OnInit, OnDestroy {
  form!: FormGroup;

  loading = true;
  saving = false;
  loadError = false;
  justSaved = false;
  private savedTimer: any = null;

  /** Every banner on the document. The form edits whichever `selected` points at. */
  banners: PopupBanner[] = [];
  selected = 0;
  /** Adding, removing or reordering is a change the form's own dirty flag cannot see. */
  listDirty = false;
  /** True while the document still holds only the pre-array banner — shown as a one-off notice. */
  migratedFromLegacy = false;

  /** Rich text everywhere except `button1link`, which is a plain URL. */
  readonly richFields = [
    { key: 'header', label: 'Header', placeholder: 'Small line above the title…', size: 'rt-sm' },
    { key: 'title', label: 'Title', placeholder: 'The headline of the popup…', size: 'rt-sm' },
    { key: 'description', label: 'Description', placeholder: 'The body copy of the popup…', size: 'rt-lg' },
    { key: 'button1text', label: 'Button 1 text', placeholder: 'Label of the first button…', size: 'rt-sm' },
    { key: 'button2text', label: 'Button 2 text', placeholder: 'Label of the second button…', size: 'rt-sm' },
    { key: 'footer', label: 'Footer', placeholder: 'Small print under the buttons…', size: 'rt-sm' },
  ];

  editors: { [key: string]: Editor } = {};
  toolbar: Toolbar = WC2_TOOLBAR_FULL;

  // Sizes are the operator's, verbatim.
  readonly slots: Slot[] = [
    { key: 'desktop', label: 'Desktop', hint: '1356 × 1467 — large / desktop' },
    { key: 'tablet', label: 'Tablet', hint: '1680 × 678 — tablet' },
    { key: 'mobile', label: 'Mobile', hint: '1200 × 546 — mobile' },
  ];
  uploading: { [k: string]: boolean } = {};
  /** Slots whose stored URL failed to load (the Storage file is gone). */
  broken: { [k: string]: boolean } = {};

  private readonly docPath = { col: 'classify', id: 'eiflixpopupbanner' };

  constructor(
    public dialogRef: MatDialogRef<PopupBannerComponent>,
    private fb: FormBuilder,
    private firestore: Firestore,
    private storage: Storage,
    private zone: NgZone,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    // Escape and a backdrop click must run the same unsaved-changes check as the
    // Close button — six rich-text fields are too much work to discard silently.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => this.close());
    this.dialogRef.keydownEvents()
      .pipe(filter(e => e.key === 'Escape'))
      .subscribe(() => this.close());

    // No validators anywhere: the operator asked for nothing mandatory.
    this.form = this.fb.group({
      header: [''],
      title: [''],
      description: [''],
      button1text: [''],
      button2text: [''],
      button1link: [''],
      footer: [''],
      desktop: [''],
      tablet: [''],
      mobile: [''],
      enable: [false],
    });
    this.richFields.forEach(f => { this.editors[f.key] = new Editor(); });
    this.load();
  }

  /** Toolbar 'Normal' button: turn the current block back into a paragraph. */
  toNormal(): void { resetToParagraph(focusedEditor(this.editors)); }

  ngOnDestroy(): void {
    Object.values(this.editors).forEach(e => e?.destroy());
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, this.docPath.col, this.docPath.id));
      // A missing document is the normal first-run state, not an error.
      const d: any = snap.exists() ? snap.data() : {};
      // bannersFromDoc adopts the pre-array flat banner when there is no array yet, so the one
      // already live is never lost behind the new shape.
      this.migratedFromLegacy = isLegacyOnly(d);
      this.banners = bannersFromDoc(d);
      // An empty document still needs something to type into.
      if (this.banners.length === 0) this.banners = [blankBanner()];
      this.selected = 0;
      this.patchForm(this.banners[0]);
      this.listDirty = false;
      this.loadError = false;
    } catch (e) {
      console.error('Popup banner load failed:', e);
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }

  private str(v: any): string { return typeof v === 'string' ? v : ''; }

  // ───────────────────────── the banner list ─────────────────────────

  /** Put one banner into the form. */
  private patchForm(b: PopupBanner): void {
    this.form.patchValue(b, { emitEvent: false });
    // ngx-editor normalises the HTML it renders ('' becomes <p></p>), so push the saved markup into
    // the model without re-rendering the view — the same guard the workshop configuration editor
    // uses. On a selection change this ALSO has to reach the view, or the editors would keep showing
    // the previous banner's text: setContent() is what actually swaps what ProseMirror displays.
    this.richFields.forEach(f => {
      const html = this.str((b as any)[f.key]);
      this.form.get(f.key)?.setValue(html, { emitModelToViewChange: false, emitEvent: false });
      this.editors[f.key]?.setContent(html || '');
    });
    this.form.markAsPristine();
  }

  /** The form's current values as a banner map. */
  private formBanner(): PopupBanner {
    const v = this.form.value;
    return {
      header: v.header || '',
      title: v.title || '',
      description: v.description || '',
      button1text: v.button1text || '',
      button2text: v.button2text || '',
      button1link: (v.button1link || '').trim(),
      footer: v.footer || '',
      desktop: v.desktop || '',
      tablet: v.tablet || '',
      mobile: v.mobile || '',
      enable: v.enable === true,
    };
  }

  /**
   * Write the form back into the array it came from.
   *
   * Every path that changes which banner is on screen calls this FIRST — otherwise switching banners
   * would quietly discard whatever was typed into the one being left.
   */
  private commitForm(): void {
    if (this.selected >= 0 && this.selected < this.banners.length) {
      this.banners[this.selected] = this.formBanner();
    }
  }

  label(b: PopupBanner, i: number): string { return bannerLabel(b, i); }

  trackBanner(index: number): number { return index; }

  selectBanner(i: number): void {
    if (i === this.selected || i < 0 || i >= this.banners.length) return;
    this.commitForm();
    if (this.form.dirty) this.listDirty = true;   // the edit now lives in the array, not the form
    this.selected = i;
    this.patchForm(this.banners[i]);
  }

  addBanner(): void {
    this.commitForm();
    if (this.form.dirty) this.listDirty = true;
    this.banners.push(blankBanner());
    this.selected = this.banners.length - 1;
    this.patchForm(this.banners[this.selected]);
    this.listDirty = true;
  }

  removeBanner(i: number): void {
    if (i < 0 || i >= this.banners.length) return;
    if (!confirm(`Remove "${bannerLabel(this.banners[i], i)}"? This cannot be undone once you save.`)) return;
    this.commitForm();
    this.banners.splice(i, 1);
    // The list is never empty: an operator with no banners has nothing to type into.
    if (this.banners.length === 0) this.banners = [blankBanner()];
    this.selected = Math.min(this.selected > i ? this.selected - 1 : this.selected, this.banners.length - 1);
    if (this.selected < 0) this.selected = 0;
    this.patchForm(this.banners[this.selected]);
    this.listDirty = true;
  }

  // ───────────────────────────── artwork ─────────────────────────────
  onImageError(slot: Slot): void { this.broken[slot.key] = true; }

  pickImage(slot: Slot): void {
    if (this.uploading[slot.key]) return;   // one upload per slot at a time
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) this.upload(slot, f); };
    input.click();
  }

  onDrop(slot: Slot, event: DragEvent): void {
    event.preventDefault();
    if (this.uploading[slot.key]) return;
    const f = event.dataTransfer?.files?.[0];
    if (f) this.upload(slot, f);
  }
  onDragOver(event: DragEvent): void { event.preventDefault(); }

  private async upload(slot: Slot, file: File): Promise<void> {
    // Every path in (click, Enter, Space, drop) funnels through here, so this is
    // the one guard that reliably stops two uploads racing into the same slot.
    if (this.uploading[slot.key]) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('That file is not an image.', 'Close', { duration: 2500, panelClass: 'sx-snack' });
      return;
    }
    this.uploading[slot.key] = true;
    try {
      // Timestamped so a re-upload never collides with the previous file.
      const fileRef = ref(this.storage, `eiflixpopupbanner/${slot.key}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      this.zone.run(() => {
        this.broken[slot.key] = false;
        this.form.get(slot.key)?.setValue(url);
        this.form.get(slot.key)?.markAsDirty();
      });
    } catch (e) {
      console.error(`Popup banner ${slot.key} upload failed:`, e);
      this.zone.run(() =>
        this.snackBar.open(`${slot.label} image upload failed.`, 'Close', { duration: 3000, panelClass: 'sx-snack' }));
    } finally {
      this.zone.run(() => { this.uploading[slot.key] = false; });
    }
  }

  /** Clears the URL from the document. The Storage file itself is left alone,
   *  matching how the workshop settings screen handles a removed asset. */
  clearImage(slot: Slot): void {
    this.form.get(slot.key)?.setValue('');
    this.form.get(slot.key)?.markAsDirty();
  }

  // ───────────────────────────── save ─────────────────────────────
  /** Unsaved work is either an edit in the form OR a change to the list itself. */
  get dirty(): boolean { return (!!this.form && this.form.dirty) || this.listDirty; }
  get anyUploading(): boolean { return Object.values(this.uploading).some(Boolean); }

  /** The saveable shape of EVERY banner right now — compared before and after a
   *  write to tell whether the operator edited anything meanwhile. */
  private snapshot(): any {
    this.commitForm();
    return bannersToPayload(this.banners);
  }

  async save(): Promise<void> {
    if (this.saving || this.loadError) return;
    this.saving = true;
    try {
      const payload = this.snapshot();
      // merge:true so the first save creates the document, a later save never drops a field some
      // other screen added, and — deliberately — the legacy flat fields stay put: the app that
      // renders the popup still reads them until it is updated to read `popupbanner`.
      await setDoc(doc(this.firestore, this.docPath.col, this.docPath.id), payload, { merge: true });
      // An edit or an upload can land while the write is in flight. Clearing the
      // dirty flag unconditionally would mark those unsaved edits as saved.
      if (JSON.stringify(this.snapshot()) === JSON.stringify(payload)) {
        this.form.markAsPristine();
        this.listDirty = false;
        // Once an array is on the document the legacy notice no longer applies.
        this.migratedFromLegacy = false;
      }
      this.justSaved = true;
      if (this.savedTimer) clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => { this.justSaved = false; }, 4000);
      this.snackBar.open(
        this.banners.length === 1 ? 'Popup banner saved.' : `${this.banners.length} popup banners saved.`,
        'Close', { duration: 2500, panelClass: 'sx-snack' });
    } catch (e) {
      console.error('Popup banner save failed:', e);
      this.snackBar.open('Could not save the popup banner.', 'Close', { duration: 4000, panelClass: 'sx-snack' });
    } finally {
      this.saving = false;
    }
  }

  toggleEnable(): void {
    const c = this.form.get('enable');
    c?.setValue(!c.value);
    c?.markAsDirty();
  }

  close(): void {
    if (this.saving &&
        !confirm('A save is still in progress. Close anyway? The save will finish on its own.')) return;
    if (this.anyUploading &&
        !confirm('An image is still uploading. Close anyway? The upload will finish but its URL will not be saved.')) return;
    if (this.dirty &&
        !confirm('You have unsaved changes to the popup banners. Close without saving?')) return;
    this.dialogRef.close();
  }
}
