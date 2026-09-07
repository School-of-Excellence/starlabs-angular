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

/** The three artwork slots, with the size each one is cut to. */
interface Slot {
  key: 'desktop' | 'tablet' | 'mobile';
  label: string;
  hint: string;
}

/**
 * EiFlix popup banner editor — a single Firestore document,
 * `classify/eiflixpopupbanner`.
 *
 * One banner exists for the whole app, so this edits that one document rather
 * than a collection: `setDoc(..., { merge: true })` creates it on the first save
 * and updates it afterwards. Nothing is required — every field may be left
 * empty, and `enable` is the switch that decides whether the banner shows.
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
  toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ heading: ['h1', 'h2', 'h3'] }],
    ['bullet_list', 'ordered_list'],
    ['link', 'text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

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

  ngOnDestroy(): void {
    Object.values(this.editors).forEach(e => e?.destroy());
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, this.docPath.col, this.docPath.id));
      // A missing document is the normal first-run state, not an error.
      const d: any = snap.exists() ? snap.data() : {};
      this.form.patchValue({
        header: this.str(d['header']),
        title: this.str(d['title']),
        description: this.str(d['description']),
        button1text: this.str(d['button1text']),
        button2text: this.str(d['button2text']),
        button1link: this.str(d['button1link']),
        footer: this.str(d['footer']),
        desktop: this.str(d['desktop']),
        tablet: this.str(d['tablet']),
        mobile: this.str(d['mobile']),
        enable: d['enable'] === true,
      }, { emitEvent: false });
      // ngx-editor normalises the HTML it renders ('' becomes <p></p>), so push
      // the saved markup into the model without re-rendering the view — the
      // same guard the workshop configuration editor uses.
      this.richFields.forEach(f =>
        this.form.get(f.key)?.setValue(this.str(d[f.key]), { emitModelToViewChange: false, emitEvent: false }));
      this.form.markAsPristine();
      this.loadError = false;
    } catch (e) {
      console.error('Popup banner load failed:', e);
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }

  private str(v: any): string { return typeof v === 'string' ? v : ''; }

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
  get dirty(): boolean { return !!this.form && this.form.dirty; }
  get anyUploading(): boolean { return Object.values(this.uploading).some(Boolean); }

  /** The saveable shape of the form right now — compared before and after a
   *  write to tell whether the operator edited anything meanwhile. */
  private snapshot(): any {
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

  async save(): Promise<void> {
    if (this.saving || this.loadError) return;
    this.saving = true;
    try {
      const payload = this.snapshot();
      // merge:true so the first save creates the document and a later save never
      // drops a field some other screen may have added to it.
      await setDoc(doc(this.firestore, this.docPath.col, this.docPath.id), payload, { merge: true });
      // An edit or an upload can land while the write is in flight. Clearing the
      // dirty flag unconditionally would mark those unsaved edits as saved.
      if (JSON.stringify(this.snapshot()) === JSON.stringify(payload)) this.form.markAsPristine();
      this.justSaved = true;
      if (this.savedTimer) clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => { this.justSaved = false; }, 4000);
      this.snackBar.open('Popup banner saved.', 'Close', { duration: 2500, panelClass: 'sx-snack' });
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
        !confirm('You have unsaved changes to the popup banner. Close without saving?')) return;
    this.dialogRef.close();
  }
}
