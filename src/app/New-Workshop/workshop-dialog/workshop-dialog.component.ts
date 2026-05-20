import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-workshop-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './workshop-dialog.component.html',
  styleUrl: './workshop-dialog.component.css'
})
export class WorkshopDialogComponent implements OnInit {

  referralCodeControl = new FormControl('', [Validators.required]);

  savedCodes: string[] = [];
  createCodeControl = new FormControl('', [
    Validators.pattern(/^[A-Z0-9]+$/),
    Validators.minLength(2)
  ]);

  isLoading = false;

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<WorkshopDialogComponent>,
    private snackBar: MatSnackBar
  ) { }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const ref = doc(this.firestore, 'static meta data', 'Subscriber Code');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data: any = snap.data();

        if (Array.isArray(data?.codes)) {
          this.savedCodes = data.codes;
        }
        if (data?.referralcode) {
          this.referralCodeControl.setValue(data.referralcode);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onCreateInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.createCodeControl.setValue(input.value, { emitEvent: false });
  }

  async saveCode(): Promise<void> {
    const val = this.createCodeControl.value?.trim();
    if (!val || this.createCodeControl.invalid) return;

    if (this.savedCodes.includes(val)) {
      this.snackBar.open(`"${val}" already exists!`, 'OK', {
        duration: 3000,
        panelClass: ['snack-warn']
      });
      return;
    }
    this.savedCodes = [...this.savedCodes, val];
    this.createCodeControl.reset();

    try {
      const ref = doc(this.firestore, 'static meta data', 'Subscriber Code');
      await setDoc(ref, { codes: this.savedCodes }, { merge: true });
      this.snackBar.open('Code saved!', '', { duration: 2000 });
    } catch (error) {
      console.error('Error saving code:', error);
      this.snackBar.open('Failed to save code.', 'Retry', { duration: 3000 });
    }
  }

  async update(): Promise<void> {
    if (!this.referralCodeControl.value) {
      this.referralCodeControl.markAsTouched();
      this.snackBar.open('Please select a referral code.', 'OK', { duration: 3000 });
      return;
    }

    try {
      const ref = doc(this.firestore, 'static meta data', 'Subscriber Code');
      await setDoc(ref, {
        referralcode: this.referralCodeControl.value
      }, { merge: true });

      this.snackBar.open('Referral code updated!', '', { duration: 2000 });
    } catch (error) {
      console.error('Error updating:', error);
      this.snackBar.open('Failed to update.', 'Retry', { duration: 3000 });
      return;
    }

    this.dialogRef.close(this.referralCodeControl.value);
  }

  close(): void {
    this.dialogRef.close();
  }
}