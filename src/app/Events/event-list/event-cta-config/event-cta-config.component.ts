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
  appCalenderConfig!: FormGroup;
  eventCtaDocRef !: DocumentReference;
  eventAppCalenderDocref !: DocumentReference;

  constructor(
    private formbuilder: FormBuilder,
    private firestore: Firestore,
    private dialogRef : MatDialogRef<any>
  ) {
    // doc references
    this.eventCtaDocRef = doc(collection(this.firestore, 'classify') , 'eventcta');
    this.eventAppCalenderDocref = doc(collection(this.firestore, 'classify') , 'eventstatusmessage');
    
    // calender form
    this.appCalenderConfig = this.formbuilder.group({
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
      }),
      confirmationmessage : ['', {validators: [Validators.required], updateOn:"change"}],
      requested :  ['', {validators: [Validators.required], updateOn:"change"}],
    });

    this.fetchData();
  }

  // function to patch data
  async fetchData(){
    const fallbackConfig = {button : '' , description : ''}
    const [ctaconfigSnap , eventStatusMsgSnap] = await Promise.all([ getDoc(this.eventCtaDocRef) ,  getDoc(this.eventAppCalenderDocref)]);
    const ctaconfig = ctaconfigSnap.data() ?? {};
    const eventStatusMsg = eventStatusMsgSnap.data() ?? {};
    
    const appCalenderConfig = {
      confirmparticipation : ctaconfig['confirmparticipation'] ?? fallbackConfig,
      addon : ctaconfig['addon'] ?? fallbackConfig,
      upgrade : ctaconfig['upgrade'] ?? fallbackConfig,
      continuity : ctaconfig['continuity'] ?? fallbackConfig,
      nocta : ctaconfig['nocta'] ?? fallbackConfig,
      confirmationmessage : eventStatusMsg['confirmationmessage']?.message ?? '',
      requested : eventStatusMsg['requested']?.message ?? ''
    }

    this.appCalenderConfig.patchValue(appCalenderConfig)
  }

  // function to handel submit
  async onSubmit() {
    try {
      if (this.appCalenderConfig.invalid) {
        alert('Fill all Values');
        return
      }

      const value = this.appCalenderConfig.value;
      const fallbackConfig = {button : '' , description : ''};

      const ctaconfig = {
        confirmparticipation: value['confirmparticipation'] || fallbackConfig,
        addon: value['addon'] || fallbackConfig,
        upgrade: value['upgrade'] || fallbackConfig,
        continuity: value['continuity'] || fallbackConfig,
        nocta: value['nocta'] || fallbackConfig,
      };

      const appCalenderConfig = {
        confirmationmessage : {
          message : value['confirmationmessage'] || ""
        },
        requested : {
          message : value['requested'] || ''
        }
      }

      await Promise.all([setDoc(this.eventCtaDocRef, ctaconfig) , setDoc(this.eventAppCalenderDocref, appCalenderConfig)]);
      alert('Successfully updated event configuations');
      this.closeDialog();
    } catch (error) {
      console.log(error);
      alert('Error Updating CTA Config');
    }
  }

  // function to close dialog
  closeDialog(){
    this.dialogRef.close();
  }
}
