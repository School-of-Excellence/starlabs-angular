import { Component, Inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL } from '@angular/fire/storage';

@Component({
  selector: 'app-createupcomingworkshops',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  templateUrl: './createupcomingworkshops.component.html',
  styleUrl: './createupcomingworkshops.component.css'
})
export class CreateupcomingworkshopsComponent {
  form: FormGroup;
  isSaving = false;
  isEditMode = false;
  // 'comingsoon' = Upcoming Workshops tab, 'ads' = Ads tab. Drives which fields
  // the dialog shows and the widgettype stored on the eiflixhomewidgets doc.
  widgettype: 'comingsoon' | 'ads' = 'comingsoon';
  private docId: string | null = null;
  // Ads only: true when the doc being edited already has a saved startdate —
  // combined with "show" it decides whether the startdate is locked.
  private hadSavedStartdate = false;

  // Per-field upload state (keyed by form control name).
  uploadingKeys = new Set<string>();
  uploadProgress: Record<string, number> = {};

  // Auto notification audiences (stored verbatim in notifyto).
  readonly notifyToOptions = [
    'journey',
    'active participants',
    'non active participants',
    'all exist users',
    'new users'
  ];
  journeyOptions: { id: string; label: string }[] = [];
  journeysLoading = false;

  get isUploadingAny(): boolean {
    return this.uploadingKeys.size > 0;
  }

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private storage: Storage,
    private zone: NgZone,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreateupcomingworkshopsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.widgettype = data?.widgettype === 'ads' ? 'ads' : 'comingsoon';

    this.form = this.widgettype === 'ads'
      ? this.buildAdsForm()
      : this.buildComingSoonForm();

    // Edit mode: hydrate the form from the passed document.
    if (data?.mode === 'edit' && data?.widget) {
      this.isEditMode = true;
      const w = data.widget;
      this.docId = w.docid || w.id || null;
      if (this.widgettype === 'ads') {
        this.hadSavedStartdate = !!w.startdate;
        this.form.patchValue({
          head: w.head || '',
          headright: w.headright || '',
          title: w.title || '',
          subtitle: w.subtitle || '',
          description: w.description || '',
          footer: w.footer || '',
          buttonname: w.buttonname || '',
          navigationlink: w.navigationlink || '',
          show: !!w.show,
          imageonly: !!w.imageonly,
          adimage: w.adimage || '',
          adimagetab: w.adimagetab || '',
          adimagemobile: w.adimagemobile || '',
          autonotification: !!w.autonotification,
          notifyto: Array.isArray(w.notifyto) ? w.notifyto : [],
          selectedjourneys: Array.isArray(w.selectedjourneys) ? w.selectedjourneys : [],
          startdate: this.toDate(w.startdate),
          enddate: this.toDate(w.enddate),
          enableappnotification: !!w.enableappnotification
        });
        const saved = Array.isArray(w.appnotificationmap) ? w.appnotificationmap : [];
        saved.forEach((n: any) => this.adsNotifications.push(this.makeNotificationRow(n), { emitEvent: false }));
      } else {
        this.form.patchValue({
          eventdate: this.toDate(w.eventdate),
          type: w.type || '',
          cost: w.cost || '',
          title: w.title || '',
          with: w.with || '',
          location: w.location || '',
          buttonname: w.buttonname || '',
          urlname: w.urlname || '',
          urlbuttonname: w.urlbuttonname || '',
          notifiedtext: w.notifiedtext || '',
          totalseats: w.totalseats ?? null,
          unlimitedseat: !!w.unlimitedseat,
          showconfirmedseat: !!w.showconfirmedseat,
          show: !!w.show,
          tentative: !!w.tentative,
          upcomingimage: w.upcomingimage || '',
          color: w.color || ''
        });
        if (w.unlimitedseat) {
          this.form.get('totalseats')?.disable();
        }
      }
    }

    if (this.widgettype === 'ads') {
      this.loadJourneyOptions();
      this.setupAdsNotificationBehavior();
    }
  }

  private buildComingSoonForm(): FormGroup {
    const group = this.fb.group({
      eventdate: [null, Validators.required],
      type: ['', Validators.required],
      cost: ['', Validators.required],
      title: ['', Validators.required],
      with: [''],
      location: [''],
      buttonname: [''],
      urlname: [''],
      urlbuttonname: [''],
      notifiedtext: [''],
      totalseats: [null],
      unlimitedseat: [false],
      showconfirmedseat: [false],
      show: [false],
      tentative: [false],
      upcomingimage: [''],
      // Hex colour like #FFFFFF (empty allowed).
      color: ['', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]]
    });

    // When "Unlimited seat" is on, disable and clear the total seats input.
    group.get('unlimitedseat')?.valueChanges.subscribe((unlimited: boolean) => {
      const seats = group.get('totalseats');
      if (!seats) return;
      if (unlimited) {
        seats.setValue(null);
        seats.disable();
      } else {
        seats.enable();
      }
    });

    return group;
  }

  private buildAdsForm(): FormGroup {
    return this.fb.group({
      head: [''],
      headright: [''],
      title: ['', Validators.required],
      subtitle: [''],
      description: [''],
      footer: [''],
      buttonname: [''],
      navigationlink: [''],
      show: [false],
      imageonly: [false],
      adimage: [''],
      adimagetab: [''],
      adimagemobile: [''],
      // Auto notification schedule. These are only validated while enabled —
      // syncAdsControlState() disables them when autonotification is off.
      autonotification: [false],
      notifyto: [[] as string[], Validators.required],
      selectedjourneys: [[] as string[], Validators.required],
      startdate: [null as Date | null, Validators.required],
      enddate: [null as Date | null, [Validators.required, this.endAfterStartValidator]],
      enableappnotification: [false],
      appnotificationmap: this.fb.array([])
    });
  }

  // --- auto notification (ads only) ---
  get adsNotifications(): FormArray {
    return this.form.get('appnotificationmap') as FormArray;
  }

  get notifyToIncludesJourney(): boolean {
    const v = this.form.get('notifyto')?.value;
    return Array.isArray(v) && v.includes('journey');
  }

  // Journey audience options: doc id (stored) + `journey` field (label).
  private async loadJourneyOptions(): Promise<void> {
    this.journeysLoading = true;
    try {
      const snap = await getDocs(collection(this.firestore, 'journey'));
      this.journeyOptions = snap.docs
        .map(d => ({ id: d.id, label: (d.data()?.['journey'] || 'Untitled journey').toString() }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (err) {
      console.error('Error loading journeys:', err);
    } finally {
      this.journeysLoading = false;
    }
  }

  // Once a shown ad has a saved startdate, the schedule is live — lock it.
  get isStartdateLocked(): boolean {
    return this.widgettype === 'ads' && this.isEditMode && this.hadSavedStartdate
      && !!this.form.get('show')?.value;
  }

  // Day count uses dates only (start assumed 12:01 am, end 11:59 pm), so
  // Jul 22 → Jul 30 = 8 days = 8 notifications.
  get notificationDayCount(): number {
    const start = this.form.get('startdate')?.value as Date | null;
    const end = this.form.get('enddate')?.value as Date | null;
    if (!start || !end) return 0;
    const days = Math.round((this.dateOnly(end).getTime() - this.dateOnly(start).getTime()) / 86_400_000);
    return days > 0 ? days : 0;
  }

  get minEndDate(): Date | null {
    const start = this.form.get('startdate')?.value as Date | null;
    if (!start) return null;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  }

  notificationDateAt(index: number): Date | null {
    const start = this.form.get('startdate')?.value as Date | null;
    if (!start) return null;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
  }

  private endAfterStartValidator = (control: AbstractControl): ValidationErrors | null => {
    const start = control.parent?.get('startdate')?.value as Date | null;
    const end = control.value as Date | null;
    if (!start || !end) return null;
    return this.dateOnly(end).getTime() > this.dateOnly(start).getTime() ? null : { daterange: true };
  };

  private setupAdsNotificationBehavior(): void {
    this.form.get('autonotification')?.valueChanges.subscribe(() => this.syncAdsControlState());
    this.form.get('notifyto')?.valueChanges.subscribe(() => this.syncAdsControlState());
    this.form.get('enableappnotification')?.valueChanges.subscribe(() => this.syncAdsControlState());
    this.form.get('show')?.valueChanges.subscribe(() => this.syncAdsControlState());
    this.form.get('startdate')?.valueChanges.subscribe(() => {
      const end = this.form.get('enddate');
      end?.updateValueAndValidity({ emitEvent: false });
      if (end?.value && end.hasError('daterange')) end.markAsTouched();
      this.syncNotificationRows();
    });
    this.form.get('enddate')?.valueChanges.subscribe(() => this.syncNotificationRows());

    this.syncNotificationRows();
    this.syncAdsControlState();
  }

  private makeNotificationRow(n: any = {}): FormGroup {
    return this.fb.group({
      title: [n?.title || '', Validators.required],
      subtitle: [n?.subtitle || ''],
      message: [n?.message || '', Validators.required],
      landingPage: [n?.landingPage || ''],
      sticky: [!!n?.sticky],
      logged: [!!n?.logged]
    });
  }

  // Keep one notification row per scheduled day, preserving typed values.
  private syncNotificationRows(): void {
    if (this.widgettype !== 'ads') return;
    const target = this.notificationDayCount;
    const arr = this.adsNotifications;
    while (arr.length < target) arr.push(this.makeNotificationRow(), { emitEvent: false });
    while (arr.length > target) arr.removeAt(arr.length - 1, { emitEvent: false });
    this.syncAdsControlState();
  }

  // Disabled controls skip validation, so the schedule fields only gate the
  // save while their section is visible.
  private syncAdsControlState(): void {
    if (this.widgettype !== 'ads') return;
    const opts = { emitEvent: false };
    const auto = !!this.form.get('autonotification')?.value;
    const notifyto = this.form.get('notifyto');
    const selectedjourneys = this.form.get('selectedjourneys');
    const startdate = this.form.get('startdate');
    const enddate = this.form.get('enddate');
    const enableApp = this.form.get('enableappnotification');
    const arr = this.adsNotifications;

    if (!auto) {
      notifyto?.disable(opts);
      selectedjourneys?.disable(opts);
      startdate?.disable(opts);
      enddate?.disable(opts);
      enableApp?.disable(opts);
      arr.disable(opts);
      return;
    }

    notifyto?.enable(opts);
    if (this.notifyToIncludesJourney) selectedjourneys?.enable(opts);
    else selectedjourneys?.disable(opts);
    if (this.isStartdateLocked) startdate?.disable(opts);
    else startdate?.enable(opts);
    enddate?.enable(opts);
    enableApp?.enable(opts);
    if (enableApp?.value) arr.enable(opts);
    else arr.disable(opts);
  }

  private dateOnly(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private atTime(d: Date, hours: number, minutes: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0, 0);
  }

  // Stored startdate is pinned to 12:01 am and enddate to 11:59 pm — the day
  // count (and appnotificationmap length) comes from the date difference only.
  private adsNotificationPayload(raw: any): any {
    const auto = !!raw.autonotification;
    const enableApp = auto && !!raw.enableappnotification;
    const notifyto: string[] = auto && Array.isArray(raw.notifyto) ? raw.notifyto : [];
    return {
      autonotification: auto,
      notifyto,
      selectedjourneys: notifyto.includes('journey') && Array.isArray(raw.selectedjourneys)
        ? raw.selectedjourneys
        : [],
      startdate: auto && raw.startdate ? Timestamp.fromDate(this.atTime(raw.startdate, 0, 1)) : null,
      enddate: auto && raw.enddate ? Timestamp.fromDate(this.atTime(raw.enddate, 23, 59)) : null,
      enableappnotification: enableApp,
      appnotificationmap: enableApp
        ? (Array.isArray(raw.appnotificationmap) ? raw.appnotificationmap : []).map((n: any) => ({
            title: (n?.title || '').trim(),
            subtitle: (n?.subtitle || '').trim(),
            message: (n?.message || '').trim(),
            landingPage: (n?.landingPage || '').trim(),
            sticky: !!n?.sticky,
            logged: !!n?.logged
          }))
        : []
    };
  }

  // --- colour picker (ads only) ---
  // <input type="color"> needs a valid hex, so fall back to white.
  get colorSwatchValue(): string {
    const v = (this.form.get('color')?.value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : '#FFFFFF';
  }

  onSwatchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value || '';
    this.form.patchValue({ color: value.toUpperCase() });
    this.form.get('color')?.markAsDirty();
  }

  // The upload fields shown for the current widget type, with size hints.
  get uploadFields(): { key: string; label: string; hint: string }[] {
    return this.widgettype === 'ads'
      ? [
          { key: 'adimage', label: 'Ad Image', hint: '1680 × 348' },
          { key: 'adimagetab', label: 'Ad Image (Tab)', hint: '1400 × 700' },
          { key: 'adimagemobile', label: 'Ad Image (Mobile)', hint: '1080 × 540' }
        ]
      : [{ key: 'upcomingimage', label: 'Upcoming Image', hint: '640 × 400' }];
  }

  imageUrlOf(key: string): string {
    return this.form.get(key)?.value || '';
  }

  isUploadingKey(key: string): boolean {
    return this.uploadingKeys.has(key);
  }

  progressOf(key: string): number {
    return this.uploadProgress[key] ?? 0;
  }

  // Upload an image (images only) to Firebase Storage under `eiflixhome`,
  // reporting progress, then store the download URL on the form.
  uploadImage(key: string): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Please select an image file.', 'Close', { duration: 3000 });
        return;
      }

      this.uploadingKeys.add(key);
      this.uploadProgress[key] = 0;

      const filePath = `eiflixhome/${Date.now()}_${file.name}`;
      const task = uploadBytesResumable(ref(this.storage, filePath), file);

      task.on(
        'state_changed',
        (snap) => {
          // Firebase callbacks can fire outside Angular's zone.
          this.zone.run(() => {
            this.uploadProgress[key] = snap.totalBytes
              ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
              : 0;
          });
        },
        (error) => {
          console.error('Error uploading image:', error);
          this.zone.run(() => {
            this.uploadingKeys.delete(key);
            this.snackBar.open('Error uploading image. Please try again.', 'Close', { duration: 3000 });
          });
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(task.snapshot.ref);
            this.zone.run(() => {
              this.form.patchValue({ [key]: downloadURL });
              this.snackBar.open('Image uploaded.', 'Close', { duration: 2000 });
            });
          } catch (error) {
            console.error('Error getting download URL:', error);
            this.zone.run(() =>
              this.snackBar.open('Error uploading image. Please try again.', 'Close', { duration: 3000 })
            );
          } finally {
            this.zone.run(() => this.uploadingKeys.delete(key));
          }
        }
      );
    };
    fileInput.click();
  }

  // Only clears the URL on the form — the stored file is left untouched.
  removeImage(key: string): void {
    this.form.patchValue({ [key]: '' });
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  // Next order = max(order) + 1 among docs of the same widgettype.
  private async nextOrder(): Promise<number> {
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'eiflixhomewidgets'),
        where('widgettype', '==', this.widgettype)
      ));
      let max = 0;
      snap.forEach(d => {
        const o = d.data()?.['order'];
        if (typeof o === 'number' && o > max) max = o;
      });
      return max + 1;
    } catch (err) {
      console.error('Error computing next order:', err);
      return 1;
    }
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving = true;
    // getRawValue() includes disabled controls (totalseats when unlimited).
    const raw = this.form.getRawValue();

    const payload: any = this.widgettype === 'ads'
      ? {
          widgettype: 'ads',
          head: (raw.head || '').trim(),
          headright: (raw.headright || '').trim(),
          title: (raw.title || '').trim(),
          subtitle: (raw.subtitle || '').trim(),
          description: (raw.description || '').trim(),
          footer: (raw.footer || '').trim(),
          buttonname: (raw.buttonname || '').trim(),
          navigationlink: (raw.navigationlink || '').trim(),
          show: !!raw.show,
          imageonly: !!raw.imageonly,
          adimage: (raw.adimage || '').trim(),
          adimagetab: (raw.adimagetab || '').trim(),
          adimagemobile: (raw.adimagemobile || '').trim(),
          ...this.adsNotificationPayload(raw)
        }
      : {
          widgettype: 'comingsoon',
          eventdate: Timestamp.fromDate(raw.eventdate as Date),
          type: (raw.type || '').trim(),
          cost: (raw.cost || '').toLowerCase(),
          title: (raw.title || '').trim(),
          with: (raw.with || '').trim(),
          location: (raw.location || '').trim(),
          buttonname: (raw.buttonname || '').trim(),
          urlname: (raw.urlname || '').trim(),
          urlbuttonname: (raw.urlbuttonname || '').trim(),
          notifiedtext: (raw.notifiedtext || '').trim(),
          totalseats: raw.unlimitedseat ? null : (raw.totalseats ?? null),
          unlimitedseat: !!raw.unlimitedseat,
          showconfirmedseat: !!raw.showconfirmedseat,
          show: !!raw.show,
          tentative: !!raw.tentative,
          upcomingimage: (raw.upcomingimage || '').trim(),
          color: (raw.color || '').trim().toUpperCase()
        };

    try {
      if (this.isEditMode && this.docId) {
        const ref = doc(this.firestore, 'eiflixhomewidgets', this.docId);
        // Don't touch `order` on edit — it's managed by drag-and-drop.
        await updateDoc(ref, payload);
      } else {
        const ref = doc(collection(this.firestore, 'eiflixhomewidgets'));
        // New docs go to the end: next number after the current max order
        // within this widgettype.
        payload.order = await this.nextOrder();
        await setDoc(ref, {
          ...payload,
          docid: ref.id,
          created: serverTimestamp()
        });
      }
      this.snackBar.open('Saved successfully.', 'Close', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving widget:', error);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
