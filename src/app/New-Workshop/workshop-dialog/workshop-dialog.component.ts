import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-workshop-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule
  ],
  templateUrl: './workshop-dialog.component.html',
  styleUrl: './workshop-dialog.component.css'
})
export class WorkshopDialogComponent implements OnInit {
  referralCodeControl = new FormControl('', [
    Validators.required,
    Validators.pattern(/^[A-Z0-9]+$/)
  ]);
  isLoading = false;

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<WorkshopDialogComponent>
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const ref = doc(this.firestore, 'static meta data', 'Subscriber Code');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data: any = snap.data();
        if (data?.referralcode) {
          this.referralCodeControl.setValue(data.referralcode);
        }
      }
    } catch (error) {
      console.error('Error loading referral code:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = (input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (sanitized !== input.value) {
      this.referralCodeControl.setValue(sanitized);
    }
  }

  update(): void {
    if (this.referralCodeControl.invalid) {
      this.referralCodeControl.markAsTouched();
      return;
    }
    this.dialogRef.close(this.referralCodeControl.value);
  }

  close(): void {
    this.dialogRef.close();
  }
}
