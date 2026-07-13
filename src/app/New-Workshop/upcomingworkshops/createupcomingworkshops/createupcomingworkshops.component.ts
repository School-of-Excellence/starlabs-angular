import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
    MatProgressSpinnerModule
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

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
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
        this.form.patchValue({
          head: w.head || '',
          headright: w.headright || '',
          title: w.title || '',
          subtitle: w.subtitle || '',
          description: w.description || '',
          footer: w.footer || '',
          buttonname: w.buttonname || '',
          navigationlink: w.navigationlink || '',
          show: !!w.show
        });
      } else {
        this.form.patchValue({
          eventdate: this.toDate(w.eventdate),
          type: w.type || '',
          cost: w.cost || '',
          title: w.title || '',
          with: w.with || '',
          location: w.location || '',
          buttonname: w.buttonname || '',
          totalseats: w.totalseats ?? null,
          unlimitedseat: !!w.unlimitedseat,
          showconfirmedseat: !!w.showconfirmedseat,
          show: !!w.show
        });
        if (w.unlimitedseat) {
          this.form.get('totalseats')?.disable();
        }
      }
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
      totalseats: [null],
      unlimitedseat: [false],
      showconfirmedseat: [false],
      show: [false]
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
      show: [false]
    });
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
          show: !!raw.show
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
          totalseats: raw.unlimitedseat ? null : (raw.totalseats ?? null),
          unlimitedseat: !!raw.unlimitedseat,
          showconfirmedseat: !!raw.showconfirmedseat,
          show: !!raw.show
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
