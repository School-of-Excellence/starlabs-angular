import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { addDoc, collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-onboarding-remark',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
    MatChipsModule
  ],
  templateUrl: './onboarding-remark.component.html',
  styleUrl: './onboarding-remark.component.css'
})
export class OnboardingRemarkComponent {
  loading: boolean = true;
  attended: boolean;
  isChecked: boolean = false;
  continuity: boolean = false;
  upgrade: boolean = false;
  referral: boolean = false;
  addon: boolean = false;

  mapProfile: Object = {};
  mapphone: Object = {};
  mapjourneyname: Object = {};
  mapAppointments: Object = {};
  salesleadsData: Object = {};
  participantjourneyproduct;
  previouseJourneyStatus: string = "upgraded";
  previousJourney: string = "";
  currentJourney: string = "";
  currentJourneyStatus: string = "initiated";
  note: string = "";
  generalnote: string = "";
  loggedInProfileId: string;
  selectedTime: string;

  journeystatusOption: Array<string> = ['Initiated', 'Ongoing', 'Completed', 'Cancelled', 'Shifted', 'Upgraded', 'Downgraded', 'Closed Lost'];
  ahmember: Array<any> = [];

  selectedDate;


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private dialog: MatDialog,
    private firestore: Firestore,
    public guard: AuthguardService,
  ) {
    this.loading = true;
    this.participantjourneyproduct = data;
    this.participantjourneyproduct['emailsent'] = false;
    this.participantjourneyproduct['onboardedtime'] = ![null, undefined, ''].includes(data['onboardingscheduled']) ? data['onboardingscheduled'] : null
    this.guard.getRoles().then(async roles => {
      this.loggedInProfileId = roles['profile_ref'].id
    });
    getDocs(query(collection(this.firestore, "users_roles"), where('ahmember', '==', true))).then(snap => {
      this.ahmember = snap.docs.map(e => e.data())
    });

  }

  ngOnInit(): void {

    this.guard.getAppointmentMap().then(data => this.mapAppointments = data);
    this.mapProfile = this.participantjourneyproduct['mapProfile'];
    this.mapphone = this.participantjourneyproduct['mapPhone'];
    this.mapjourneyname = this.participantjourneyproduct['mapJourney'];

    if (![null, undefined, ''].includes(this.participantjourneyproduct['salesleadsref'])) {
      getDoc(doc(this.firestore, "salesleads", this.participantjourneyproduct['salesleadsref'].id)).then((salesleaddoc) => {
        if (salesleaddoc.exists()) {
          this.salesleadsData = salesleaddoc.data();
          this.participantjourneyproduct['referral'] = [null, undefined, ""].includes(this.salesleadsData['referral']) ? null : this.salesleadsData['referral'];
          this.currentJourney = this.mapjourneyname[this.salesleadsData['journey']];
          if (![null, undefined].includes(this.salesleadsData['previousjourney'])) {
            this.previousJourney = this.mapjourneyname[this.salesleadsData['previousjourney']]
          }
        }
      });
    }

    this.loading = false;
    this.setCheckboxStates();
    if (this.participantjourneyproduct['onboarded'] === null) {
      this.participantjourneyproduct['onboarded'] = false; // Set default to false
    }
  }

  setCheckboxStates() {
    this.continuity = this.participantjourneyproduct['opportunities']?.includes('Continuity');
    this.upgrade = this.participantjourneyproduct['opportunities']?.includes('Upgrade');
    this.referral = this.participantjourneyproduct['opportunities']?.includes('Referral');
    this.addon = this.participantjourneyproduct['opportunities']?.includes('Add-on');
  }

  getCombinedDateTime() {
    if (!this.selectedDate || !this.selectedTime) return null;

    const [hours, minutes] = this.selectedTime.split(':').map(Number);
    const dateTime = new Date(this.selectedDate);
    dateTime.setHours(hours, minutes, 0);
    console.log("DATE TIME", dateTime);
    this.participantjourneyproduct['onboardedtime'] = dateTime;
    console.log(this.participantjourneyproduct['onboardedtime']);

    return dateTime;
  }

  validateOnboard() {
    let disabled = false;

    if (this.participantjourneyproduct['onboarded']) {
      if (this.participantjourneyproduct['onboardedby']?.length == 0) {
        disabled = true;
      }
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }

    if ([null, undefined, ''].includes(this.participantjourneyproduct['appointmentid'])) {
      if ([null, undefined, ''].includes(this.selectedTime) || [null, undefined].includes(this.selectedDate)) {
        disabled = true;
      }
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }

    if (!this.participantjourneyproduct['onboarded']) {
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }

    disabled = [null, undefined, ""].includes(this.participantjourneyproduct['referral']) ? true : false;

    return disabled
  }

 onSubmit() {
    console.log('Submit');

    let check = confirm(this.participantjourneyproduct['onboarded'] ? "Are you sure the Participant is Onboarded" : "Are you sure this Participant is not Onboarded");

    if (check) {
      let value = {
        'opportunities': []
      }
      if (![null, undefined].includes(this.participantjourneyproduct)) {
        this.participantjourneyproduct['onboardingreportlog'] = [];
        if (!this.participantjourneyproduct['onboarded']) {
          value['onboardedby'] = [];
          value['onboardedtime'] = null;
          value['appointmentid'] = null;
          value['onboardingscheduled'] = null;
        } else if (this.participantjourneyproduct['onboarded'] && ![null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) && ![null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])) {
          value['onboardedby'] = this.data['onboardedby']
          value['onboardedtime'] = this.data['onboardedtime'];
          value['appointmentid'] = this.participantjourneyproduct['appointmentid'];
        } else if (this.participantjourneyproduct['onboarded'] && [null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) && [null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])) {
          value['onboardedby'] = this.participantjourneyproduct['onboardedby'];
          value['onboardedtime'] = this.participantjourneyproduct['onboardedtime'];
        }
        value['onboarded'] = true
        value['onboardingreport'] = ![null, undefined, ''].includes(this.note) ? this.note : null;
        value['referral'] = this.participantjourneyproduct['referral'];
        value['journeystatus'] = 'ongoing';
        value['onboardingreportlog'] = [{
          updated: new Date(),
          report: this.note || null
        }];

        if (this.continuity) value['opportunities'].push('Continuity');
        if (this.upgrade) value['opportunities'].push('Upgrade');
        if (this.referral) value['opportunities'].push('Referral');
        if (this.addon) value['opportunities'].push('Add-on');
        
        this.salesleadsData['referral'] = this.participantjourneyproduct['referral'].toLowerCase() == 'Yes' ? true : false ;
        value['salesleadsData'] = JSON.parse(JSON.stringify(this.salesleadsData));
        value['journeytype'] = this.participantjourneyproduct['journeytype'] || null
        
        this.dialogRef.close(value);
      }

    } else {
      console.log("Not Confirmed");
    }
  }

  async onmark() {
    let value = {}
    value['attended'] = this.attended
    console.log(value['attended']);
    this.dialogRef.close(value)
  }

  onEdit() {
    let value = {}
    value['opportunities'] = [];
    if (this.continuity) value['opportunities'].push('Continuity');
    if (this.upgrade) value['opportunities'].push('Upgrade');
    if (this.referral) value['opportunities'].push('Referral');
    if (this.addon) value['opportunities'].push('Add-on');
    value['onboardingreport'] = this.participantjourneyproduct['onboardingreport']
    value['onboardingreportlog'] = this.participantjourneyproduct['onboardingreportlog'] || []
    if (this.participantjourneyproduct['onboardingreport'] !== value['onboardingreport']) {
      value['onboardingreportlog'].push({
        updated: new Date(),
        report: this.participantjourneyproduct['onboardingreport']
      });
    }
    this.dialogRef.close(value)
  }

  addnotes() {

    var generalnotes = {
      note: this.generalnote,
      updatedby: this.loggedInProfileId,
      updated: new Date()
    }
    this.dialogRef.close(generalnotes)
  }

  closeDialog() {
    this.dialogRef.close()
  }

}
