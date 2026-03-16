import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Firestore, collection, addDoc, Timestamp, doc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-create-workshop',
  imports: [
    MatCardModule,
    MatFormFieldModule,
    MatButtonModule,
    MatRadioModule,
    CommonModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-workshop.component.html',
  styleUrls: ['./create-workshop.component.css']
})
export class CreateWorkshopComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private router: Router
  ) {
    this.form = this.fb.group({
      type: ['workshop', Validators.required],
      title: ['', Validators.required],
      // category: ['', Validators.required],
      workshopStartDate: [null, Validators.required],
      workshopEndDate: [null, Validators.required],
      registrationStartDate: [null, Validators.required],
      registrationEndDate: [null, Validators.required]
    }, { validators: this.dateValidator });
  }

  dateValidator(form: FormGroup) {
    const registrationStartDate = form.get('registrationStartDate')?.value;
    const registrationEndDate = form.get('registrationEndDate')?.value;
    const workshopStartDate = form.get('workshopStartDate')?.value;
    const workshopEndDate = form.get('workshopEndDate')?.value;

    if (registrationStartDate && registrationEndDate && registrationStartDate > registrationEndDate) {
      form.get('registrationEndDate')?.setErrors({ invalid: true });
    }

    if (registrationEndDate && workshopStartDate && registrationEndDate > workshopStartDate) {
      form.get('workshopStartDate')?.setErrors({ invalid: true });
    }

    if (workshopStartDate && workshopEndDate && workshopStartDate > workshopEndDate) {
      form.get('workshopEndDate')?.setErrors({ invalid: true });
    }

    return null;
  }

  async createWorkshop() {
    if (this.form.valid) {
      const workshopRef = doc(collection(this.firestore, 'workshopconfiguration'));
      const docid = workshopRef.id;

      await setDoc(workshopRef, {
        detailpage:{
        ...this.form.value,
        },
        created: Timestamp.now(),
        docid
      });

      this.router.navigate(['/workshopconfig', docid]);
    } else {
      this.form.markAllAsTouched();
      console.log('Form is invalid');
    }
  }
}
