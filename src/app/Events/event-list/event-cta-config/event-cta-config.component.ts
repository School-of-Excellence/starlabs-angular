import { Component } from '@angular/core';
import { collection, doc, Firestore, setDoc , DocumentReference} from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { getDoc } from 'firebase/firestore';

@Component({
  selector: 'app-event-cta-config',
  imports: [MatFormFieldModule, ReactiveFormsModule , FormsModule , MatInputModule],
  templateUrl: './event-cta-config.component.html',
  styleUrl: './event-cta-config.component.css',
})
export class EventCtaConfigComponent {
  ctaconfig!: FormGroup;
  docRef !: DocumentReference;

  constructor(
    private formbuilder: FormBuilder,
    private firestore: Firestore,
    private dialogRef : MatDialogRef<any>
  ) {
    this.docRef = doc(collection(this.firestore, 'static meta data') , 'eventcta');
    
    this.ctaconfig = this.formbuilder.group({
      confirmparticipation : this.formbuilder.group({
        button : ['', {validators: [Validators.required], updateOn:"change"}],
        description : ['', {validators: [Validators.required], updateOn:"change"}],
      }),
      addon : this.formbuilder.group({
        button : ['', {validators: [Validators.required], updateOn:"change"}],
        description : ['', {validators: [Validators.required], updateOn:"change"}],
      }),
      upgrade : this.formbuilder.group({
        button : ['', {validators: [Validators.required], updateOn:"change"}],
        description : ['', {validators: [Validators.required], updateOn:"change"}],
      }),
      continuity : this.formbuilder.group({
        button : ['', {validators: [Validators.required], updateOn:"change"}],
        description : ['', {validators: [Validators.required], updateOn:"change"}],
      }),
      nocta : this.formbuilder.group({
        button : ['', {validators: [Validators.required], updateOn:"change"}],
        description : ['', {validators: [Validators.required], updateOn:"change"}],
      })
    });

    this.fetchData();
  }

  async fetchData(){
    const ctaconfig = (await getDoc(this.docRef));
    if (ctaconfig.exists) {
      this.ctaconfig?.patchValue({...ctaconfig.data()});
    }
  }

  async onSubmit() {
    try {
      if (this.ctaconfig.valid) {
        const ctaconfig = { ...this.ctaconfig.value };
        await setDoc(this.docRef, ctaconfig);
        alert('Successfully updated event configuations')
      } else {
        alert('Fill all Values');
      }
    } catch (error) {
      console.log(error);
      alert('Error Updating CTA Config');
    } finally{
      this.closeDialog();
    }
  }

  closeDialog(){
    this.dialogRef.close();
  }
}
