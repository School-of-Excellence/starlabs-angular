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
  private docId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreateupcomingworkshopsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.form = this.fb.group({
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
    this.form.get('unlimitedseat')?.valueChanges.subscribe((unlimited: boolean) => {
      const seats = this.form.get('totalseats');
      if (!seats) return;
      if (unlimited) {
        seats.setValue(null);
        seats.disable();
      } else {
        seats.enable();
      }
    });

    // Edit mode: hydrate the form from the passed workshop document.
    if (data?.mode === 'edit' && data?.workshop) {
      this.isEditMode = true;
      const w = data.workshop;
      this.docId = w.docid || w.id || null;
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

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value?.toDate) return value.toDate();
    return new Date(value);
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
    const eventDate: Date = raw.eventdate;

    const payload: any = {
      eventdate: Timestamp.fromDate(eventDate),
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
        const ref = doc(this.firestore, 'upcomingworkshops', this.docId);
        await updateDoc(ref, payload);
      } else {
        const ref = doc(collection(this.firestore, 'upcomingworkshops'));
        await setDoc(ref, {
          ...payload,
          docid: ref.id,
          created: serverTimestamp()
        });
      }
      this.snackBar.open('Upcoming workshop saved.', 'Close', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving upcoming workshop:', error);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
