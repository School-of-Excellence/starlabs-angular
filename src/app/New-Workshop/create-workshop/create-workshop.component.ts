// import { Component } from '@angular/core';
// import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
// import { Firestore, collection, addDoc, Timestamp, doc, setDoc } from '@angular/fire/firestore';
// import { Router } from '@angular/router';
// import { MatCardModule } from '@angular/material/card';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatButtonModule } from '@angular/material/button';
// import { MatRadioModule } from '@angular/material/radio';
// import { CommonModule } from '@angular/common';
// import { MatSelectModule } from '@angular/material/select';
// import { MatInputModule } from '@angular/material/input';
// import { MatDatepickerModule } from '@angular/material/datepicker';
// import { MatNativeDateModule } from '@angular/material/core';

// @Component({
//   selector: 'app-create-workshop',
//   imports: [
//     MatCardModule,
//     MatFormFieldModule,
//     MatButtonModule,
//     MatRadioModule,
//     CommonModule,
//     MatSelectModule,
//     MatInputModule,
//     MatDatepickerModule,
//     MatNativeDateModule,
//     ReactiveFormsModule
//   ],
//   templateUrl: './create-workshop.component.html',
//   styleUrls: ['./create-workshop.component.css']
// })
// export class CreateWorkshopComponent {
//   form: FormGroup;

//   constructor(
//     private fb: FormBuilder,
//     private firestore: Firestore,
//     private router: Router
//   ) {
//     this.form = this.fb.group({
//       type: ['workshop', Validators.required],
//       title: ['', Validators.required],
//       // category: ['', Validators.required],
//       workshopStartDate: [null, Validators.required],
//       workshopEndDate: [null, Validators.required],
//       registrationStartDate: [null, Validators.required],
//       registrationEndDate: [null, Validators.required]
//     }, { validators: this.dateValidator });
//   }

//   dateValidator(form: FormGroup) {
//     const registrationStartDate = form.get('registrationStartDate')?.value;
//     const registrationEndDate = form.get('registrationEndDate')?.value;
//     const workshopStartDate = form.get('workshopStartDate')?.value;
//     const workshopEndDate = form.get('workshopEndDate')?.value;

//     if (registrationStartDate && registrationEndDate && registrationStartDate > registrationEndDate) {
//       form.get('registrationEndDate')?.setErrors({ invalid: true });
//     }

//     if (registrationEndDate && workshopStartDate && registrationEndDate > workshopStartDate) {
//       form.get('workshopStartDate')?.setErrors({ invalid: true });
//     }

//     if (workshopStartDate && workshopEndDate && workshopStartDate > workshopEndDate) {
//       form.get('workshopEndDate')?.setErrors({ invalid: true });
//     }

//     return null;
//   }

//   async createWorkshop() {
//     if (this.form.valid) {
//       const workshopRef = doc(collection(this.firestore, 'workshopconfiguration'));
//       const docid = workshopRef.id;

//       await setDoc(workshopRef, {
//         detailpage:{
//         ...this.form.value,
//         },
//         created: Timestamp.now(),
//         docid
//       });

//       this.router.navigate(['/workshopconfig', docid]);
//     } else {
//       this.form.markAllAsTouched();
//       console.log('Form is invalid');
//     }
//   }
// }
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Firestore, collection, Timestamp, doc, setDoc } from '@angular/fire/firestore';
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
import { MatTimepickerModule } from '@angular/material/timepicker';

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
    MatTimepickerModule,
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
      registrationStartDate: [null, Validators.required],
      registrationStartTime: [null, Validators.required],
      registrationEndDate:   [null, Validators.required],
      registrationEndTime:   [null, Validators.required],
      workshopStartDate:     [null, Validators.required],
      workshopStartTime:     [null, Validators.required],
      workshopEndDate:       [null, Validators.required],
      workshopEndTime:       [null, Validators.required],
    }, { validators: this.dateValidator });
  }

  /** Merges a Date (from datepicker) and a Date (from timepicker) into one Date */
  private mergeDateTime(date: Date, time: Date): Date {
    const merged = new Date(date);
    merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return merged;
  }

  dateValidator(form: FormGroup) {
    const regStart  = form.get('registrationStartDate')?.value;
    const regEnd    = form.get('registrationEndDate')?.value;
    const wsStart   = form.get('workshopStartDate')?.value;
    const wsEnd     = form.get('workshopEndDate')?.value;

    // Clear previous cross-field errors before re-evaluating
    form.get('registrationEndDate')?.setErrors(
      form.get('registrationEndDate')?.hasError('required') ? { required: true } : null
    );
    form.get('workshopStartDate')?.setErrors(
      form.get('workshopStartDate')?.hasError('required') ? { required: true } : null
    );
    form.get('workshopEndDate')?.setErrors(
      form.get('workshopEndDate')?.hasError('required') ? { required: true } : null
    );

    if (regStart && regEnd && regStart > regEnd) {
      form.get('registrationEndDate')?.setErrors({ invalid: true });
    }
    if (regEnd && wsStart && regEnd > wsStart) {
      form.get('workshopStartDate')?.setErrors({ invalid: true });
    }
    if (wsStart && wsEnd && wsStart > wsEnd) {
      form.get('workshopEndDate')?.setErrors({ invalid: true });
    }

    return null;
  }

  async createWorkshop() {
    if (this.form.valid) {
      const v = this.form.value;

      const registrationStartDate = Timestamp.fromDate(this.mergeDateTime(v.registrationStartDate, v.registrationStartTime));
      const registrationEndDate   = Timestamp.fromDate(this.mergeDateTime(v.registrationEndDate,   v.registrationEndTime));
      const workshopStartDate     = Timestamp.fromDate(this.mergeDateTime(v.workshopStartDate,     v.workshopStartTime));
      const workshopEndDate       = Timestamp.fromDate(this.mergeDateTime(v.workshopEndDate,       v.workshopEndTime));

      const workshopRef = doc(collection(this.firestore, 'workshopconfiguration'));
      const docid = workshopRef.id;

      await setDoc(workshopRef, {
        detailpage: {
          type: v.type,
          title: v.title,
          registrationStartDate,
          registrationEndDate,
          workshopStartDate,
          workshopEndDate,
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