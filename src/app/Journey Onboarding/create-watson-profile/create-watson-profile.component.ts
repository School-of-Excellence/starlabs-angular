
import { Component, OnInit, Inject, NgZone } from '@angular/core';
import { AuthguardService } from '../../authguard.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, doc, DocumentReference, Firestore, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, WriteBatch, writeBatch } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { getApp } from '@angular/fire/app';

interface Checkpoint {
  label: string;
  status: string;
  description: string;
  type?: string; // Added type property
}

type CheckpointType = 'common' | 'new' | 'upgrade' | 'downgrade' | 'addons' | 'cancelled';

@Component({
  selector: 'app-create-watson-profile',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatDatepickerModule,
    MatSelectModule,
    NgxMatSelectSearchModule,

  ],
  templateUrl: './create-watson-profile.component.html',
  styleUrl: './create-watson-profile.component.css'
})
export class CreateWatsonProfileComponent {

  trackByFn(index: number, item: string): any {
    return item || index;
  }

  saleData = {};
  selectedProfile = {};
  mapProduct = {};
  mapPackage = {};
  mapJourneyProduct = {};
  mapJourney = {};
  newSaleCheckpoints = {};
  upgradeSaleCheckpoints = {};
  downgradeSaleCheckpoints = {};
  cancelSaleCheckpoints = {};
  addonSaleCheckpoints = {};
  commonCheckpoints = {}
  mapPackageName = {};
  mapProductminimumamount = {}

  previousKYJ = [];
  newKYJ = [];
  cancelledProducts = [];
  productstoenable = [];
  participantList: any[] = [];
  purchaseHistoryList: any[] = [];
  displayAddons = [];
  participantsProductsData = [];

  // profileData = null;
  updatedJourneyID = null;
  cancelJourneyID = null;
  journeyPurchaseLabel: any = null;
  addonPurchaseLabel: any = null;
  selectedWatsonParticipant: any = null;
  totalPurchaseValue: number | null = null;
  subscriptionStart: Date | null = null;
  subscriptionEnd: Date | null = null;
  purchasedate: Date = null;
  tempPurchaseDate: Date | null = null;
  lastpaymentscheduledate = null;
  watsonPaymentId: string = null;

  profileExist: boolean = false;
  fullscreenActive = false;
  isloading: boolean = true;
  isEditingPurchaseDate: boolean = false;

  filterParticipantName: string = '';
  fullscreenImage: string = '';
  selectedProfileEmail: string = '';
  selectedProfileID: string = '';
  selectedWatsonParticipantID: string = '';

  initialpaymentbalance: number | null = 0;
  pendingbalanceamount: number | null = 0;

  watsonDatabase: Firestore;
  watsonBatch: WriteBatch;
  starlabsBatch: WriteBatch;

  get loading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: "loading..." }, disableClose: true })
  }

  get commoncheckpoint(): Checkpoint[] {
    return Object.values(this.commonCheckpoints);
  }

  // Single unified checkpoint update function
  updateCheckpoint(checkpointType: CheckpointType, id: string, label: string, status: string, description: string) {

    // Create the checkpoint object if it doesn't exist
    if (!this.commonCheckpoints[id]) {
      this.commonCheckpoints[id] = {
        label: '',
        status: '',
        description: '',
        type: checkpointType
      };
    }

    // Update the checkpoint properties
    this.commonCheckpoints[id].label = label;
    this.commonCheckpoints[id].status = status;
    this.commonCheckpoints[id].description = description;
    this.commonCheckpoints[id].type = checkpointType;
  }

  constructor(public firestore: Firestore, private guard: AuthguardService, @Inject(MAT_DIALOG_DATA) public metadata: any, public dialogRef: MatDialogRef<CreateWatsonProfileComponent>, public dialog: MatDialog, private ngZone: NgZone) {

    this.saleData = metadata["saleData"];
    this.mapJourney = metadata['journeymap'];
    this.mapProduct = metadata["productmap"];
    this.mapPackage = metadata["packagemap"];
    this.mapJourneyProduct = metadata["journeyproductmap"];
    this.purchasedate = this.saleData['purchasedate'].toDate();
    this.totalPurchaseValue = this.saleData['totalpurchasevalue'];
    this.selectedWatsonParticipantID = this.saleData['watsonparticipantid'];
    this.mapPackageName = metadata['mappackagename'];
    this.mapProductminimumamount = metadata['mapproductminimumamount'];

    this.guard.initializeWatson().then(async () => {

      const loadingRef = this.dialog.open(LoadingProgressComponent, { data: { msg: "loading..." }, disableClose: true })
      this.watsonDatabase = getFirestore(getApp("watson"));
      console.log("WATSON Database Initialized");

      this.watsonBatch = writeBatch(this.watsonDatabase);
      this.starlabsBatch = writeBatch(this.firestore);

      await getDocs(query(collection(this.firestore, "profile_data"), where("email", "==", this.saleData["email"]))).then(async (profile) => {
        if (profile.docs.length == 0) {
          // New profile
          // exist -> New profile Data -> profile_data (Copy)
          await getDocs(query(collection(this.firestore, "new_user_data"), where("email", "==", this.saleData["email"]))).then(async (newUserData) => {
            if (newUserData.docs.length != 0) {
              const newUserDoc = newUserData.docs[0];
              await setDoc(doc(this.firestore, "profile_data", newUserDoc.id), newUserDoc.data());
              this.selectedProfile = newUserDoc.data();
              this.selectedProfileEmail = newUserDoc.data()['email'];
              this.selectedProfileID = newUserDoc.data()['profileid'];
              console.log("new to profile_data", newUserDoc.id);
              const newUser = newUserDoc.data();
              const userDataRef = doc(this.firestore, "user_data", newUser['uid']);
              const userDataSnap = await getDoc(userDataRef);
              if (!userDataSnap.exists()) {
                await setDoc(userDataRef, {
                  countrycode: newUser['countryCode'],
                  email: newUser['email'],
                  name: newUser['name'],
                  number: newUser['phonenumber'],
                });
                console.log("new to user_data", newUser['uid']);
              } else {
                console.log("user_data already exists", newUser['uid']);
              }
            } else {
              console.log("new_user_data Not Exists");
            }
          });
          console.log("Profile Not Exists");
          this.selectedProfileEmail = this.saleData['email'];
          this.selectedProfileID = this.saleData['profileid'];
          this.selectedProfile = null;
          this.saleData['journeytype'] == 'new' ? this.updateCheckpoint('common', 'breakthroughs_profile', 'Profile in Breakthroughs', 'Completed', 'Not Found') : this.updateCheckpoint('common', 'breakthroughs_profile', 'Profile in Breakthroughs', 'Error', 'Found'); // checkpoint
        } else {
          console.log("Profile Exists");
          // this.profileData = profile.docs.length == 0 ? null : profile.docs[0].data();
          this.selectedProfile = profile.docs.length == 0 ? null : profile.docs[0].data();
          this.selectedProfileEmail = profile.docs[0].data()['email'];
          this.selectedProfileID = profile.docs[0].data()['profileid'];
          // this.saleData['journeytype'] != 'new' ? this.updateCheckpoint('common', 'breakthroughs_profile', 'Profile in Breakthroughs', 'Completed', 'Found') : this.updateCheckpoint('common', 'breakthroughs_profile', 'Profile in Breakthroughs', 'Error', 'Not Found'); // checkpoint
          this.updateCheckpoint('common', 'breakthroughs_profile', 'Profile in Breakthroughs', 'Completed', 'Found');
        }
      });

      // fetching the participant data from watson
      console.log("idddd", this.selectedWatsonParticipantID);
      
      await getDoc(doc(this.watsonDatabase, "Participants", this.selectedWatsonParticipantID)).then(async profilesnap => {
        if (profilesnap.exists()) {
          this.selectedWatsonParticipant = profilesnap.data();
          this.saleData['journeytype'] != 'new' ? this.updateCheckpoint('common', 'watson_profile', 'Profile in Watson', 'Completed', 'Found') : this.updateCheckpoint('common', 'watson_profile', 'Profile in Watson', 'Completed', 'Not Found'); // checkpoint
          this.profileExist = true;

          if (this.saleData['journeytype'] == 'addons') {
            await getDocs(query(collection(this.watsonDatabase, "Payment Schedule"), where("participantid", "==", this.selectedWatsonParticipant['id']), orderBy("date", "desc"))).then((partcipantDoc) => {
              if (partcipantDoc.docs.length != 0) {
                if (this.saleData['installmentatend'] == true) {
                  this.saleData['installmentstartdate'] = partcipantDoc.docs[0].data()['date'];
                }
              }
            });
          }
          if (this.saleData['journeytype'] != 'new') {
            // fetching the participant data from waston and fetching the purchase history from watson
            await getDocs(query(collection(this.watsonDatabase, "ParticipantPurchases"), where("participantid", '==', this.selectedWatsonParticipant['id']), orderBy('purchasedate', 'asc'))).then(async (participantPurchaseSnap) => {
              for (let i = 0; i < participantPurchaseSnap.docs.length; i++) {
                const purchaseElement = participantPurchaseSnap.docs[i].data();
                if (purchaseElement['cancelled'] != true) {
                  this.purchaseHistoryList.push(purchaseElement)
                }
              }
              console.log('purchaseHistoryList', this.purchaseHistoryList.length);
            });

          }

        } else {
          console.log("Watson Profile Not Found");
          this.saleData['journeytype'] == 'new' ? this.updateCheckpoint('common', 'watson_profile', 'Profile in Watson', 'Completed', 'Not Found') : this.updateCheckpoint('common', 'watson_profile', 'Profile in Watson', 'Error', 'Found'); // checkpoint
        };
      });

      if (this.saleData['journey'] != null && this.saleData['journeytype'] != 'cancelled') {
        this.journeyPurchaseLabel = this.saleData['purchaselabel'];
        [null, undefined, ''].includes(this.saleData['purchaselabel']) ? this.updateCheckpoint('common', 'update_journeylabel', 'Journey Label Update', 'Error', 'No Purchase Label Found') : this.updateCheckpoint('common', 'update_journeylabel', 'JourneyLabel Update', 'Completed', 'Mapped'); // checkpoint
      }
      else if (this.saleData?.['addons'].length != 0 && this.saleData['journeytype'] != 'cancelled') {
        this.addonPurchaseLabel = this.saleData['purchaselabel'];
        [null, undefined, ''].includes(this.saleData['purchaselabel']) ? this.updateCheckpoint('common', 'update_addonlabel', 'Addon Label Update', 'Error', 'No Purchase Label Found') : this.updateCheckpoint('common', 'update_addonlabel', 'Addon Label Update', 'Completed', 'Mapped'); // checkpoint
      }

      if (this.saleData['journeytype'] != 'new') {
        await getDocs(collection(this.watsonDatabase, "Participants")).then(async (allProfileSnap) => {
          if (allProfileSnap.docs.length != 0) {
            for (let i = 0; i < allProfileSnap.docs.length; i++) {      
              const element = allProfileSnap.docs[i];
              this.participantList.push(element.data());
            }
          }
        });
      }

      this.watsonPaymentId = doc(collection(this.watsonDatabase, "ParticipantPayments")).id;
      console.log((await this.checkSubscription()).subscriptionStartDate);
      console.log((await this.checkSubscription()).subscriptionEndDate);
      this.subscriptionStart = (await this.checkSubscription()).subscriptionStartDate;
      this.subscriptionEnd = (await this.checkSubscription()).subscriptionEndDate;
      setTimeout(async () => {
        await this.returnKYJ();
        loadingRef.close();
        this.isloading = false;
      }, 2000);
    });
  }

  ngOnInit(): void {

  }

  ngOnDestroy() {
  }

  async checkSubscription() {
    let subscriptionStartDate: Date;
    let subscriptionEndDate: Date;

    if (this.saleData['journeytype'] === 'new') {
      subscriptionStartDate = this.purchasedate;
      subscriptionEndDate = new Date(new Date(subscriptionStartDate.getFullYear(), subscriptionStartDate.getMonth() + this.saleData['journeytenure'], subscriptionStartDate.getDate()).setHours(subscriptionStartDate.getHours(), subscriptionStartDate.getMinutes(), subscriptionStartDate.getSeconds(), subscriptionStartDate.getMilliseconds()));
    } else if (this.saleData['journeytype'] === 'upgrade') {

      let participantjourneyproductid = this.saleData['upgradefromparticipantjourneyproductid'];
      await getDoc(doc(this.firestore, "participantjourneyproduct", participantjourneyproductid)).then((jppDoc) => {
        if (jppDoc.exists()) {
          let calculatedate = this.saleData['subscriptionfrompurchasedate'] ? this.purchasedate : jppDoc.data()['subscriptionend'].toDate();
          subscriptionStartDate = this.purchasedate;
          subscriptionEndDate = subscriptionEndDate ?? new Date(new Date(calculatedate.getFullYear(), calculatedate.getMonth() + this.saleData['journeytenure'], calculatedate.getDate()).setHours(calculatedate.getHours(), calculatedate.getMinutes(), calculatedate.getSeconds(), calculatedate.getMilliseconds()));
        } else {
          console.log("Participant Journey Product Not Found");
        }
      });

    } else if (this.saleData['journeytype'] == 'addons') {

      subscriptionStartDate = subscriptionStartDate ?? this.purchasedate
      subscriptionEndDate = subscriptionEndDate ?? new Date(new Date(subscriptionStartDate.getFullYear(), subscriptionStartDate.getMonth() + this.saleData['journeytenure'], subscriptionStartDate.getDate()).setHours(subscriptionStartDate.getHours(), subscriptionStartDate.getMinutes(), subscriptionStartDate.getSeconds(), subscriptionStartDate.getMilliseconds()));

    } else if (this.saleData['journeytype'] === 'downgrade') {

      if(!this.saleData['downgradetonewpurchase']){
        let startDate:Date;
        let endDate:Date;
        let participantjourneyproductid = this.saleData['downgradetoparticipantjourneyproductid']
        await getDoc(doc(this.firestore, "participantjourneyproduct", participantjourneyproductid)).then((jppDoc) => {
          startDate = jppDoc.data()['subscriptionstart'].toDate();
          endDate = jppDoc.data()['subscriptionend'].toDate();
        });
        subscriptionStartDate = startDate;
        subscriptionEndDate = endDate
      }else {
        subscriptionStartDate = this.purchasedate;
        subscriptionEndDate = new Date(new Date(subscriptionStartDate.getFullYear(), subscriptionStartDate.getMonth() + this.saleData['journeytenure'], subscriptionStartDate.getDate()).setHours(subscriptionStartDate.getHours(), subscriptionStartDate.getMinutes(), subscriptionStartDate.getSeconds(), subscriptionStartDate.getMilliseconds()));
      }

    } else if (this.saleData['journeytype'] === 'cancelled') {
      var startDate:Date;
      var endDate:Date;
      let participantjourneyproductid = this.saleData['participantjourneyproductid'];
      await getDoc(doc(this.firestore, "participantjourneyproduct", participantjourneyproductid)).then((jppDoc) => {
        startDate = jppDoc.data()['subscriptionstart'].toDate();
        endDate = jppDoc.data()['subscriptionend'].toDate();
      });
      subscriptionStartDate = startDate;
      subscriptionEndDate = endDate;
    }

    [null, undefined].includes(subscriptionStartDate) ? this.updateCheckpoint('common', 'subscription_start', 'Subscription Start Date', 'Error', 'Not Updated') : this.updateCheckpoint('common', 'subscription_start', 'Subscription Start Date', 'Completed', 'Updated');  // checkpoint
    [null, undefined].includes(subscriptionEndDate) ? this.updateCheckpoint('common', 'subscription_end', 'Subscription End Date', 'Error', 'Not Updated') : this.updateCheckpoint('common', 'subscription_end', 'Subscription End Date', 'Completed', 'Updated');  // checkpoint
    return { subscriptionStartDate, subscriptionEndDate };
  }

  editPurchaseDate() {
    this.isEditingPurchaseDate = true;
    this.tempPurchaseDate = new Date(this.purchasedate); 
  }

  async savePurchaseDate() {
    const loadingRef = this.dialog.open(LoadingProgressComponent, { data: { msg: "loading..." }, disableClose: true })
    const dateAt12PM = new Date(this.tempPurchaseDate);
    dateAt12PM.setHours(12, 0, 0, 0);

    this.purchasedate = dateAt12PM;
    this.isEditingPurchaseDate = false;

    // Check if installmentstartdate exists
    if (this.saleData['installmentstartdate']) {
      const currentInstallmentDate = this.saleData['installmentstartdate'].toDate();

      // Get the installment date from saleData
      const installmentDate = this.saleData['dueday'] || currentInstallmentDate.getDate();

      // Calculate next month's date
      const nextMonth = new Date(dateAt12PM);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      // Get last day of next month
      const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();

      // Set date (handles cases where installmentDate > days in month)
      nextMonth.setDate(Math.min(installmentDate, lastDayOfNextMonth));
      nextMonth.setHours(12, 0, 0, 0);

      // Convert to Firestore Timestamp
      this.saleData['installmentstartdate'] = Timestamp.fromDate(nextMonth);
      this.saleData['installmentsData'][0]['installmentstartdate'] = Timestamp.fromDate(nextMonth);

      console.log('Installment start date updated to next month:', nextMonth);
    }

    // Update in Firestore
    this.updatePurchaseDateInFirestore(this.purchasedate);

    this.subscriptionStart = (await this.checkSubscription()).subscriptionStartDate;
    this.subscriptionEnd = (await this.checkSubscription()).subscriptionEndDate;
    await this.returnKYJ();
    loadingRef.close();
  }

  cancelPurchaseDateEdit() {
    this.isEditingPurchaseDate = false;
    this.tempPurchaseDate = null;
  }

  updatePurchaseDateInFirestore(purchasedate) {
    const docid = this.saleData['docid'];

    updateDoc(doc(this.firestore, "salesleads", docid), {
      purchasedate: purchasedate,
      installmentstartdate: this.saleData['installmentstartdate'],
      installmentsData :this.saleData['installmentsData']
    }).then(()=> {
      this.guard.openSnackBar("Payment Date Updated Successfully", "OK",600);
    }).catch((error)=> {
      alert(`Error Updating: ${error}`);
    })
  }

  async returnKYJ() {

    const journeyRef = !['', null, undefined].includes(this.saleData["journey"]) ? doc(this.firestore, "journey", this.saleData["journey"]) : null;

    // if the journey type is new
    if (this.saleData['journeytype'] == 'new') {
      console.log('Journey Type: New');
      // fetching the journeydata for the new journey
      await getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyRef))).then((journeyProductDoc) => {
        journeyProductDoc.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'journey_to_product', 'Journey Product Configuration', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'journey_to_product', 'Journey Product Configuration', 'Error', 'Not Found');  // checkpoint
        if (journeyProductDoc.docs.length != 0) {
          for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
            const product = journeyProductDoc.docs[0].data()['product'][i];

            this.newKYJ.push({
              product: this.mapProduct[product.id],
              status: null,
              docid: product.id,
              package: this.mapJourney[journeyRef.id]
            });

            if(![null,undefined,''].includes(this.mapProduct[product.id]) && ![null,undefined,''].includes(this.mapJourney[journeyRef.id])) {
              this.updateCheckpoint(this.saleData['journeytype'], 'journey_productmap', 'Journey Product Map', 'Completed', 'Mapped');  // checkpoint
              this.updateCheckpoint(this.saleData['journeytype'], 'journey_packagemap', 'Journey Package Map', 'Completed', 'Mapped');  // checkpoint
            } else {
              console.error('No Journey product Found');
              this.updateCheckpoint(this.saleData['journeytype'], 'journey_productmap', 'Journey Product Map', 'Error', 'Not Mapped');
              this.updateCheckpoint(this.saleData['journeytype'], 'journey_packagemap', 'Journey Package Map', 'Error', 'Not Mapped');
              
            }

          }
        } else {
          console.log("No Journey Product Found");
        }
      });

      //Bonus displayed in KYJ
      if (this.saleData["bonus"].length != 0) {
        for (let i = 0; i < this.saleData["bonus"].length; i++) {
          const product = this.saleData["bonus"][i];
          this.newKYJ.push({
            product: this.mapProduct[product],
            status: null,
            docid: null,
            package: "Bonus"
          });
          [null, undefined, ''].includes(this.mapProduct[product]) ? this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Error', 'Not Mapped') : this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Completed', 'Mapped');  // checkpoint
        }
      }

      await this.validateWatsonSale();
      await this.validateStarlabsSale();
    }
    // if the journey type is upgrade
    else if (this.saleData['journeytype'] == 'upgrade') {
      console.log('Journey Type : upgrade');

      //if carryover is true
      if (this.saleData['carryover'] == true) {

        console.log('carryover true');

        this.updatedJourneyID = this.saleData['upgradefromparticipantjourneyproductid']

        // fetching all the products if the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then(participantproduct => {
          participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Found');  // checkpoint
          if (participantproduct.docs.length != 0) {

            for (let i = 0; i < participantproduct.docs.length; i++) {
              const product = participantproduct.docs[i].data();
              let obj = {
                product: this.mapProduct[product["productref"].id],
                status: product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              }
              this.previousKYJ.push(obj);
              this.newKYJ.push(obj);
              if(![null, undefined, ''].includes(this.mapProduct[product["productref"].id]) && ![null, undefined, ''].includes(this.mapPackage[product["packageref"]?.id])) {
                this.updateCheckpoint(this.saleData['journeytype'], 'old_participantproduct_map', 'Participant Product', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'old_journey_packagemap', 'Journey Package', 'Completed', 'Mapped');  // checkpoint
              } else {
                console.error('No Participants Product Found');
                this.updateCheckpoint(this.saleData['journeytype'], 'old_journey_packagemap', 'Journey Package', 'Error', 'Not Mapped')
                this.updateCheckpoint(this.saleData['journeytype'], 'old_participantproduct_map', 'Participant Product', 'Error', 'Not Mapped')
              }
            }
          } else {
            console.error("Participant product Not Found");
          }
        });

        // fetching the data of new journey
        await getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyRef))).then((journeyProductDoc) => {
          journeyProductDoc.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'joruney_product', 'Journey to Product', 'Completed', 'Mapped') : this.updateCheckpoint(this.saleData['journeytype'], 'joruney_product', 'Journey to Product', 'Error', 'Not Found');  // checkpoint
          if (journeyProductDoc.docs.length != 0) {
            for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
              const product = journeyProductDoc.docs[0].data()['product'][i];
              this.newKYJ.push({
                product: this.mapProduct[product.id],
                status: null,
                docid: product.id,
                package: this.mapJourney[journeyRef.id]
              });

              if(![null, undefined, ''].includes(this.mapProduct[product.id]) && ![null, undefined, ''].includes(this.mapJourney[journeyRef.id])) {
                this.updateCheckpoint(this.saleData['journeytype'], 'new_participantproduct_map', 'Participant Product', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'new_journey_packagemap', 'Journey Package', 'Completed', 'Mapped');  // checkpoint
              } else {
                console.error('No Participants Product Found');
                this.updateCheckpoint(this.saleData['journeytype'], 'new_journey_packagemap', 'Journey Package', 'Error', 'Not Mapped')
                this.updateCheckpoint(this.saleData['journeytype'], 'new_participantproduct_map', 'Participant Product', 'Error', 'Not Mapped')
              }
            }
          } else {
            console.error("No Journey To Product Found");
          }
        });

        //Bonus displayed in KYJ
        if (this.saleData["bonus"].length != 0) {
          for (let i = 0; i < this.saleData["bonus"].length; i++) {
            const product = this.saleData["bonus"][i];
            [null, undefined, ''].includes(this.mapProduct[product]) ? this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Error', 'Not Mapped') : this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Completed', 'Mapped');  // checkpoint
            this.newKYJ.push({
              product: this.mapProduct[product],
              status: null,
              docid: null,
              package: "Bonus"
            })
          }
        }

      }
      // if carry over is false cancel all other existing products
      else {
        console.log('Carryover false');

        this.updatedJourneyID = this.saleData['upgradefromparticipantjourneyproductid']
        // fetching all the products of the participant and cancelling the unconsumed products except addons
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then(participantproduct => {
          participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Found');  // checkpoint

          if (participantproduct.docs.length != 0) {
            for (let i = 0; i < participantproduct.docs.length; i++) {
              const product = participantproduct.docs[i].data();

              let obj = {
                product: this.mapProduct[product["productref"].id],
                status: product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id],
              }

              let obj2 = {
                product: this.mapProduct[product["productref"].id],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id],
              }

              if (product["status"] == null && this.mapPackage[product['packageref'].id] != 'Addons') {
                obj2['status'] = 'cancelled'
              } else {
                obj2['status'] = product['status']
              }

              this.previousKYJ.push(obj);
              this.newKYJ.push(obj2);

              if(![null,undefined].includes(this.mapProduct[product["productref"].id]) && ![null,undefined].includes(this.mapPackage[product["packageref"]?.id]) ) {
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product Map', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Participants Package Map', 'Completed', 'Mapped');  // checkpoint              
              } else {
                console.error("Error While mapping Participants Product");
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Map Product', 'Error', 'Not Mapped');
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Map Package', 'Error', 'Not Mapped');
              }
            }
          } else {
            console.log("No participants product Found");
          }
        });

        // fetching the data of new journey
        await getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyRef))).then((journeyProductDoc) => {
          journeyProductDoc.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'joruney_product', 'Journey Product Configuration', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'journey_product', 'Journey Product Configuration', 'Error', 'Not Found');  // checkpoint
          console.log(journeyProductDoc.docs.length);

          if (journeyProductDoc.docs.length != 0) {
            for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
              const product = journeyProductDoc.docs[0].data()['product'][i];
              
              this.newKYJ.push({
                product: this.mapProduct[product.id],
                status: null,
                docid: product.id,
                package: this.mapJourney[journeyRef.id]
              });

              if(![null,undefined].includes(this.mapProduct[product.id]) && ![null,undefined].includes(this.mapJourney[journeyRef.id])) {
                this.updateCheckpoint(this.saleData['journeytype'], 'jorurney_productmap', 'Journey Product Map', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'journey_package_map', 'Journey Package Map', 'Completed', 'Mapped');  // checkpoint
              } else {
                console.error("Error While Journey Product Map");
                this.updateCheckpoint(this.saleData['journeytype'], 'jorurney_productmap', 'Journey Product Map', 'Error', 'Not Mapped');
                this.updateCheckpoint(this.saleData['journeytype'], 'journey_package_map', 'Journey Package Map', 'Error', 'Not Mapped');
              }
            }
          } else {
            console.error('No Journey product Found');
          }
        });

        // products to cancel send to saleslead after closing the dialog box
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          try {
            if (existingproduct["status"] == "cancelled") {
              this.cancelledProducts.push(existingproduct["docid"]);
            }
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Completed', 'Fetched Cancelling Products');
          } catch (error) {
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Error', 'Not Products to Cancell or Error');
          }
        }


        //Bonus displayed in KYJ
        if (this.saleData["bonus"].length != 0) {
          for (let i = 0; i < this.saleData["bonus"].length; i++) {
            const productElementRef = this.saleData["bonus"][i];
            [null, undefined, ''].includes(this.mapProduct[productElementRef]) ? this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Error', 'Not Mapped') : this.updateCheckpoint(this.saleData['journeytype'], 'bonus_productmap', 'Map Bonus Product', 'Completed', 'Mapped');  // checkpoint
            this.newKYJ.push({
              product: this.mapProduct[productElementRef],
              status: null,
              docid: null,
              package: "Bonus"
            });
          }
        }

      }

      await this.validateWatsonSale();
      await this.validateStarlabsSale();

    } else if (this.saleData['journeytype'] == 'downgrade') {

      if (this.saleData['downgradetonewpurchase']) {

        console.log('Downgrade to new Journey..');

        this.cancelJourneyID = this.saleData['participantjourneyproductid']

        //get all the products of the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then(participantproduct => {
          participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Founs');  // checkpoint
          if (participantproduct.docs.length != 0) {
            for (let i = 0; i < participantproduct.docs.length; i++) {
              const product = participantproduct.docs[i].data();
              let obj = {
                product: this.mapProduct[product["productref"].id],
                status: product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              }
              this.previousKYJ.push(obj);

              var obj2 = {
                product: this.mapProduct[product["productref"].id],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              }

              if (product["status"] == null && this.mapPackage[product['packageref'].id] != 'Addons') {
                obj2['status'] = 'cancelled'
              } else {
                obj2['status'] = product['status']
              }
              this.newKYJ.push(obj2);
              if (![null,undefined].includes(this.mapProduct[product["productref"].id]) && ![null,undefined].includes(this.mapPackage[product["packageref"]?.id])) {
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product Map', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Participants Package Map', 'Completed', 'Mapped');  // checkpoint
              } else {
                console.error("Error While mapping Participants Product");
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Map Product', 'Error', 'Not Mapped');
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Map Package', 'Error', 'Not Mapped');
              }
            }
          }
        });
        //get all the products of the participant

        // fetching the journey data for the new journey
        await getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyRef))).then((journeyProductDoc) => {
          journeyProductDoc.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'joruney_product', 'Journey Product Configuration', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'journey_product', 'Journey Product Configuration', 'Error', 'Not Found');  // checkpoint
          if (journeyProductDoc.docs.length != 0) {
            for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
              const product = journeyProductDoc.docs[0].data()['product'][i];
              this.newKYJ.push({
                product: this.mapProduct[product.id],
                status: null,
                docid: product.id,
                package: this.mapJourney[journeyRef.id]
              });
              if (![null,undefined].includes(this.mapProduct[product.id]) && ![null,undefined].includes(this.mapJourney[journeyRef.id])){
                this.updateCheckpoint(this.saleData['journeytype'], 'jorurney_productmap', 'Journey Product Map', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'journey_package_map', 'Journey Package Map', 'Completed', 'Mapped');  // checkpoint
              } else {
                console.log("Error While Journey Product Map");
                this.updateCheckpoint(this.saleData['journeytype'], 'jorurney_productmap', 'Journey Product Map', 'Error', 'Not Mapped');
                this.updateCheckpoint(this.saleData['journeytype'], 'journey_package_map', 'Journey Package Map', 'Error', 'Not Mapped');
              }
            }
          } else {
            console.error('No Journey product Found');
          }
        });

        // products to cancel send to saleslead after closing the dialog box
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          try {
            if (existingproduct["status"] == "cancelled") {
              this.cancelledProducts.push(existingproduct["docid"]);
            }
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Completed', 'Fetched Cancelling Products');
          } catch (error) {
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Error', 'Not Products to Cancell or Error');
          }
        }

        await this.validateWatsonSale();
        await this.validateStarlabsSale();

      } else if (!this.saleData['downgradetonewpurchase']) {

        console.log('Downgrade to existing Journey..');

        this.cancelJourneyID = this.saleData['downgradefromparticipantjourneyproductid']

        // mapping all the products for the participant
        var participantProductMap = {}
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID))).then((participantproduct) => {
          participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'all_participants_products', 'All Participants Products', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'all_participants_products_map', 'All Participants Product', 'Error', 'Not Found');  // checkpoint
          if (participantproduct.docs.length != 0) {
            for (let i = 0; i < participantproduct.docs.length; i++) {
              const element = participantproduct.docs[i];
              participantProductMap[element.id] = element.data()
            }
          } else {
            console.error('No Participants Product Found');
          }
        });

        //product to enable
        await getDoc(doc(this.firestore, "participantjourneyproduct", this.saleData['downgradetoparticipantjourneyproductid'])).then((pjpDoc) => {
          pjpDoc.exists() ? this.updateCheckpoint(this.saleData['journeytype'], 'new_participantjourneyproduct', 'New Participant Journey Product Configuration', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'new_participantjourneyproduct', 'New Participant Journey Product', 'Error', 'Not Found');
          if (pjpDoc.exists()) {
            for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
              const products = pjpDoc.data()['participantproducts'][i];
              try {
                if (participantProductMap[products['participantproductid']] != null) {
                  if (participantProductMap[products['participantproductid']]['status'] == 'cancelled') {
                    this.productstoenable.push(products['participantproductid'])
                  }
                }
                this.updateCheckpoint(this.saleData['journeytype'], 'products_enable', 'Products to Enable', 'Completed', 'Fetched');
              } catch (error) {
                this.updateCheckpoint(this.saleData['journeytype'], 'products_enable', 'Products to Enable', 'Error', 'Not Fetched');
              }
            }
          } else {
            console.error('Downgrade to ParticipantJourneyProduct Not Found');
          }
        });

        // products to cancel
        var cancelProducts = [];
        await getDoc(doc(this.firestore, "participantjourneyproduct", this.saleData['downgradefromparticipantjourneyproductid'])).then((pjpDoc) => {
          pjpDoc.exists() ? this.updateCheckpoint(this.saleData['journeytype'], 'participantjourneyproduct', 'Participant Journey Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participantjourneyproduct', 'Participant Journey Product', 'Error', 'Not Found');
          if (pjpDoc.exists()) {
            for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
              const product = pjpDoc.data()['participantproducts'][i];
              try {
                if (participantProductMap[product['participantproductid']]['status'] == null) {
                  cancelProducts.push(product['participantproductid']);
                }
                this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancel', 'Completed', 'Fetched');
              } catch (error) {
                this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancel', 'Error', 'Not Fetched');
              }
            }
          } else {
            console.error('Downgrade From ParticipantJourneyProduct Not Found');
          }
        });

        //get all the products of the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then((participantproduct) => {
          participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Found');  // checkpoint
          if (participantproduct.docs.length != 0) {
            for (let i = 0; i < participantproduct.docs.length; i++) {
              const product = participantproduct.docs[i].data();

              try {
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product Map', 'Completed', 'Mapped');  // checkpoint
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Participants Package Map', 'Completed', 'Mapped');  // checkpoint
                this.previousKYJ.push({
                  product: this.mapProduct[product["productref"].id],
                  status: product["status"],
                  docid: product["docid"],
                  package: this.mapPackage[product["packageref"]?.id]
                });

                // enable the products and display in KYJ
                if (this.productstoenable.includes(product['docid'])) {

                  this.newKYJ.push({
                    product: this.mapProduct[product["productref"].id],
                    status: null,
                    docid: product["docid"],
                    package: this.mapPackage[product["packageref"]?.id]
                  });

                }
                // cancel the products and display in KYJ
                else if (cancelProducts.includes(product['docid'])) {

                  this.newKYJ.push({
                    product: this.mapProduct[product["productref"].id],
                    status: 'cancelled',
                    docid: product["docid"],
                    package: this.mapPackage[product["packageref"]?.id]
                  });

                } else {
                  this.newKYJ.push({
                    product: this.mapProduct[product["productref"].id],
                    status: product["status"],
                    docid: product["docid"],
                    package: this.mapPackage[product["packageref"]?.id]
                  });

                }
              } catch (error) {
                console.log("Error While mapping Participants Product");
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Map Product', 'Error', 'Not Mapped');
                this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Map Package', 'Error', 'Not Mapped');
                
              }
            }
          }
        });
        // get all the products of the participant

        // sending the cancelled products back when the dialog box closes
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          try {
            if (existingproduct["status"] == "cancelled") {
              this.cancelledProducts.push(existingproduct["docid"]);
            }
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Completed', 'Fetched Cancelling Products');
          } catch (error) {
            this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Error', 'Not Products to Cancell or Error');
            
          }
        }
        await this.validateWatsonSale();
      }

    } else if (this.saleData['journeytype'] == 'addons') {

      // fetching all the products for the participant
      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then(participantproduct => {
        participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Found');  // checkpoint

        if (participantproduct.docs.length != 0) {
          for (let i = 0; i < participantproduct.docs.length; i++) {
            const product = participantproduct.docs[i].data();

            try {
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product Map', 'Completed', 'Mapped');  // checkpoint
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Participants Package Map', 'Completed', 'Mapped');  // checkpoint
              var obj = {
                product: this.mapProduct[product["productref"].id],
                status: product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              }

              this.previousKYJ.push(obj);
              this.newKYJ.push(obj);

            } catch (error) {
              console.error("Error While mapping Participants Product");
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Map Product', 'Error', 'Not Mapped');
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Map Package', 'Error', 'Not Mapped');
              
            }
          }
        } else {
          console.error("No participants product Found");
        }
      });

      // adding the addon in KYJ
      this.newKYJ.push({
        product: this.mapProduct[this.saleData['addons']],
        status: null,
        docid: this.saleData['addons'],
        package: this.mapPackage['Mq5yQNg4mXMgyPQG9nqJ']
      });

      await this.validateWatsonSale();
      await this.validateStarlabsSale();

    } else if (this.saleData['journeytype'] == 'cancelled') {

      this.cancelJourneyID = this.saleData['participantjourneyproductid']

      // mapping all the products for the participant
      var participantProductMap = {}
      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID))).then((participantproduct) => {
        participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'all_participants_products', 'All Participants Products', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'all_participants_products_map', 'All Participants Product', 'Error', 'Not Found');  // checkpoint
        if (participantproduct.docs.length != 0) {
          for (let i = 0; i < participantproduct.docs.length; i++) {
            const element = participantproduct.docs[i];
            participantProductMap[element.id] = element.data()
          }
        } else {
          console.error('No Participants product Found')
        }
      });

      // products to cancel
      await getDoc(doc(this.firestore, "participantjourneyproduct", this.saleData['participantjourneyproductid'])).then((pjpDoc) => {
        pjpDoc.exists() ? this.updateCheckpoint(this.saleData['journeytype'], 'participantjourneyproduct', 'Participant Journey Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participantjourneyproduct', 'Participant Journey Product', 'Error', 'Not Found');
        if (pjpDoc.exists()) {
          for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
            const product = pjpDoc.data()['participantproducts'][i];
            try {
              if (participantProductMap[product['participantproductid']]['status'] == null) {
                this.cancelledProducts.push(product['participantproductid'])
              }
              this.updateCheckpoint(this.saleData['journeytype'], 'products_cancel', 'Products to Cancel', 'Completed', 'Fetched');
            } catch (error) {
              this.updateCheckpoint(this.saleData['journeytype'], 'products_cancel', 'Products to Cancel', 'Error', 'Not Fetched');
            }
          }
        } else {
          console.error('No Participants Journey Found');
        }
      });

      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy("sequenceorder"))).then(participantproduct => {
        participantproduct.docs.length != 0 ? this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Completed', 'Found') : this.updateCheckpoint(this.saleData['journeytype'], 'participants_product', 'Participants Product', 'Error', 'Not Found');  // checkpoint
        if (participantproduct.docs.length != 0) {
          for (let i = 0; i < participantproduct.docs.length; i++) {
            const product = participantproduct.docs[i].data();
            try {
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Participants Product Map', 'Completed', 'Mapped');  // checkpoint
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Participants Package Map', 'Completed', 'Mapped');  // checkpoint
              this.previousKYJ.push({
                product: this.mapProduct[product["productref"].id],
                status: product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              });

              this.newKYJ.push({
                product: this.mapProduct[product["productref"].id],
                status: this.cancelledProducts.includes(product["docid"]) ? 'cancelled' : product["status"],
                docid: product["docid"],
                package: this.mapPackage[product["packageref"]?.id]
              });

            } catch (error) {
              console.log("Error While mapping Participants Product");
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_productmap', 'Map Product', 'Error', 'Not Mapped');
              this.updateCheckpoint(this.saleData['journeytype'], 'participants_package_map', 'Map Package', 'Error', 'Not Mapped');
              
            }
          }
        }
      });

      // sending the cancelled products back when the dialog box closes
      for (let i = 0; i < this.newKYJ.length; i++) {
        const existingproduct = this.newKYJ[i];
        try {
          if (existingproduct["status"] == "cancelled") {
            this.cancelledProducts.push(existingproduct["docid"]);
          }
          this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Completed', 'Fetched Cancelling Products');
        } catch (error) {
          this.updateCheckpoint(this.saleData['journeytype'], 'products_cancell', 'Products to Cancell', 'Error', 'Not Products to Cancell or Error');
          
        }
      }

      await this.validateWatsonSale();
      await this.validateStarlabsSale();
    }
  }

  handleImageError(event) {
    event.target.src = 'assets/Images/noimage.png'; // Replace with your placeholder image path
    event.target.parentElement.classList.remove('loading');
  }

  openFullscreen(imageUrl) {
    this.fullscreenImage = imageUrl;
    this.fullscreenActive = true;
    // Prevent scrolling when fullscreen is active
    document.body.style.overflow = 'hidden';
  }

  closeFullscreen() {
    this.fullscreenActive = false;
    this.fullscreenImage = '';
    // Restore scrolling
    document.body.style.overflow = '';
  }

  downloadImage(event) {
    event.stopPropagation(); // Prevent modal from closing

    if (!this.fullscreenImage) return;

    // Create temporary link to download the image
    const link = document.createElement('a');
    link.href = this.fullscreenImage;
    link.download = 'payment-snapshot-' + new Date().getTime() + '.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  filterParticipant() {
    if (this.participantList.length != 0) {
      let filtername = ![null, undefined, ""].includes(this.filterParticipantName) ? this.filterParticipantName.toLowerCase().trim() : ''
      return this.participantList.filter(e => e.name?.trim().toLowerCase().indexOf(filtername) === 0)
    } else {
      return [];
    }
  }

  compareFn(c1: any, c2: any): boolean {
    return c1 && c2 ? c1.id === c2.id : c1 === c2;
  }

  onCancel() {
    this.ngZone.run(() => {
      this.dialogRef.close(null);
    });
  }

  // validating and disabling the button
  // submitValidation(): boolean {
  //   let validated: boolean = true;
  //   console.log(this.commoncheckpoint.some((e) => e['status'].toLowerCase() != 'error'));
    
  //   if (this.saleData['journeytype'] === 'new') {
  //     // if(this.profileExist === false){
  //     if (this.journeyPurchaseLabel != null) {
  //       if (this.saleData['addons'].length === 0) {
  //         if (this.addonPurchaseLabel == null) {
  //           validated = false
  //         }
  //       }
  //     }
  //     // }
  //   } else if (this.saleData['journeytype'] === 'upgrade') {
  //     if (this.saleData['journey'] != null) {
  //       if (this.journeyPurchaseLabel != null) {
  //         if (this.selectedWatsonParticipant != null) {
  //           if (this.saleData['addons'].length === 0) {
  //             if (this.addonPurchaseLabel === null) {
  //               validated = false
  //             }
  //           }
  //         }
  //       }
  //     } else {
  //       if (this.selectedWatsonParticipant != null) {
  //         if (this.saleData['addons'].length != 0) {
  //           if (this.addonPurchaseLabel != null) {
  //             if (this.journeyPurchaseLabel === null) {
  //               validated = false
  //             }
  //           }
  //         }
  //       }
  //     }
  //   } else if (this.saleData['journeytype'] === 'downgrade') {

  //     if (this.saleData['journey'] != null) {
  //       if (this.journeyPurchaseLabel != null) {
  //         if (this.selectedWatsonParticipant != null) {
  //           validated = false
  //         }
  //       }
  //     }

  //   } else if (this.saleData['journeytype'] === 'addons') {
  //     // for (let i = 0; i < this.saleData['addons'].length; i++) {
  //     //   const element = this.saleData['addons'][i];
  //     if (this.saleData['totalpurchasevalue'] == null) {
  //       validated = true
  //     } else if (this.saleData['purchaselabel'] == null) {
  //       validated = true
  //     } else if (this.saleData['installmentamount'] == null) {
  //       validated = true
  //     } else {
  //       validated = false
  //     }
  //     // }
  //   } else if (this.saleData['journeytype'] === 'cancelled') {
  //     validated = false;
  //   } else if (this.saleData['initialpaymentapproved'] == true) {
  //     validated = false;
  //   } else if (this.commoncheckpoint.some((e) => e['status'].toLowerCase() != 'error') == true || this.saleData['initialpaymentapproved'] == false && ) {
  //     validated = true;
  //   }

  //   return validated
  // }

  submitValidation(): boolean {
  // console.log('Common checkpoint validation:', this.commoncheckpoint.some((e) => e['status']?.toLowerCase() !== 'error'));
  
  // // Early return for cancelled journey type
  // if (this.saleData['journeytype'] === 'cancelled') {
  //   return false;
  // }
  
  // // Early return if initial payment is already approved
  // if (this.saleData['initialpaymentapproved'] === true) {
  //   return false;
  // }
  
  // Check common checkpoint errors
  const hasCheckpointErrors = this.commoncheckpoint.some((e) => e['status']?.toLowerCase() === 'error');
  if (hasCheckpointErrors || !this.saleData['initialpaymentapproved']) {
    return true;
  } else {
    return false;
  }
  
  // // Journey type specific validations
  // switch (this.saleData['journeytype']) {
  //   case 'new':
  //     return this.validateNewJourney();
    
  //   case 'upgrade':
  //     return this.validateUpgradeJourney();
    
  //   case 'downgrade':
  //     return this.validateDowngradeJourney();
    
  //   case 'addons':
  //     return this.validateAddonsJourney();
    
  //   default:
  //     // For unknown journey types, check if initial payment is not approved
  //     return this.saleData['initialpaymentapproved'] !== true;
  // }
}

private validateNewJourney(): boolean {
  // For new journeys, validate journey and addon purchase labels
  if (this.journeyPurchaseLabel != null) {
    // If no addons selected, addon purchase label must be present
    if (this.saleData['addons']?.length === 0) {
      return this.addonPurchaseLabel != null;
    }
    return true;
  }
  return false;
}

private validateUpgradeJourney(): boolean {
  const hasJourney = this.saleData['journey'] != null;
  const hasJourneyLabel = this.journeyPurchaseLabel != null;
  const hasSelectedParticipant = this.selectedWatsonParticipant != null;
  const hasAddons = this.saleData['addons']?.length > 0;
  const hasAddonLabel = this.addonPurchaseLabel != null;
  
  if (hasJourney) {
    if (hasJourneyLabel && hasSelectedParticipant) {
      // If no addons, addon label must be present
      if (!hasAddons) {
        return hasAddonLabel;
      }
      return true;
    }
    return false;
  } else {
    // No journey selected
    if (hasSelectedParticipant && hasAddons && hasAddonLabel) {
      // Journey label must be present when no journey but has addons
      return this.journeyPurchaseLabel != null;
    }
    return false;
  }
}

private validateDowngradeJourney(): boolean {
  const hasJourney = this.saleData['journey'] != null;
  const hasJourneyLabel = this.journeyPurchaseLabel != null;
  const hasSelectedParticipant = this.selectedWatsonParticipant != null;
  
  if (hasJourney && hasJourneyLabel) {
    // For downgrade, if participant is selected, validation fails
    return !hasSelectedParticipant;
  }
  
  return false;
}

private validateAddonsJourney(): boolean {
  // For addons journey, all these fields should be null for validation to pass
  const fieldsToCheck = [
    this.saleData['totalpurchasevalue'],
    this.saleData['purchaselabel'],
    this.saleData['installmentamount']
  ];
  
  // Return true if any of the required fields is null
  return fieldsToCheck.some(field => field == null);
}

  async initialPayment() {

    var users = []
    if (environment.firebase.projectId == "fir-sample-aae4a") {
      users = [
        "1NYb4aGqlhZizzXJhU7Ftl5zwTj2",
        "9df7NVWmpSRghdXnec2L79uimWb2",
        "sj4qVoFmLOcIrTgzNMEOOvBI8gJ3",
        "Hgpmo3A60YQaopUFdywl59jXNpX2",
        "2OgWzhcPlCfi8JfLQ8B9CySZM6i2",
        "CVDvaiO0kYNCezw6wodyt2bsrrt2",
        "fRxcCavAs4esXPm9fxRaybIbDjk1"
      ];
    } else if (environment.firebase.projectId == "starlabs-test") {
      users = [
        "AabsqwYdW4PMZEhKUlPmKU4lF0g2", // Vignesh
        "GcYv0Y8LGsTT34hJfiQFSS2Yoy92", // Ragavendhiren
      ]
    }

    if (users.includes(this.guard.uid)) {

      var check = confirm("Are you sure want to Approve the Initial Payment of Amount : " + this.saleData['initialpayment'] + ' Payment ID : ' + this.saleData['paymentid']);

      if (check) {
        const loading = this.loading;
        await updateDoc(doc(this.firestore, "salesleads", this.saleData['docid']), {
          initialpaymentapproved: this.saleData['initialpaymentapproved'] == true ? false : true
        }).then(() => {
          console.log("Approved Initial Payment");
          this.guard.openSnackBar("Initial Payment Approved Successfully", "OK",600)
          this.ngZone.run(() => {
            loading.close();
            this.dialogRef.close(null);
          });
        }).catch((error) => {
          console.error("Error while Approving Initial Payment", error);
          this.guard.openSnackBar("Error while Approving Initial Payment", "OK",600)
          this.ngZone.run(() => {
            loading.close();
            this.dialogRef.close(null);
          });
        });

      }
    } else {
      alert("Your Roll is not eligible for Approving Initial Payment");
    }

  }

  formatName(name) {
    var list = name.toString().split(' ')
    // console.log(list);
    var value = ""
    for (let i = 0; i < list.length; i++) {
      if (list[i] != "" && list[i] != "\t") {
        const element = list[i].toString().trim();
        var word = element[0].toString().toUpperCase()
        if (word.length != 0) {
          var other = element.toString().substring(1).toLowerCase()
        }
        var subname = word + other
        value = value + " " + subname
      }
    }
    return value.trim()
  }

  async onSubmit() {

    let confirmation = confirm(`Are you sure want to Approve ${this.selectedProfile['name']}'s - ${this.saleData['journeytype'].toUpperCase()} Sale`);
    if (confirmation) {

      const loadingDialog = this.dialog.open(LoadingProgressComponent, { data: { msg: "Processing Please Wait..." }, disableClose: true });

      try {
        await this.watsonBatch.commit();
        await this.starlabsBatch.commit();
        this.dialogRef.close({
          profileid: this.selectedProfileID,
          ppData: this.participantsProductsData,
          initialpaymentbalance: this.initialpaymentbalance,
          pendingbalanceamount: this.pendingbalanceamount,
          purchasedate: this.purchasedate
        });
        loadingDialog.close();
      } catch (error) {
        this.dialogRef.close(null);
        loadingDialog.close();
        console.error('Error while Commiting');
      }
    }
    // this.ngZone.run(() => {
    //   this.dialogRef.close({
    //     data: 'submit',
    //     // purchaselabel: this.selectedPackageDesign, //this.journeyPurchaseLabel ?? this.addonPurchaseLabel,
    //     purchaselabel: this.journeyPurchaseLabel ?? this.addonPurchaseLabel, // purchase label
    //     selectedParticipant: this.selectedWatsonParticipant, //participant data
    //     subscriptionstart: this.subscriptionStart, // subscription start date
    //     subscriptionend: this.subscriptionEnd, //subscription end date
    //     totalpurchasevalue: this.totalPurchaseValue, // total purchase value
    //     productstocancell: this.cancelledProducts, // products to cancell
    //     productstoenable: this.productstoenable, //products to enable
    //     upgradedjourney: this.updatedJourneyID, //journey document id to mark the status as upgraded
    //     canceljourney: this.cancelJourneyID, //journey document id to mark the status as cancelled
    //     initialpaymentbalance: this.initialpaymentbalance, // initial payment balance by admin
    //     pendingbalanceamount: this.pendingbalanceamount // watson pendingbalanceamount by admin
    //   });
    // });

  }

  async validateWatsonSale() {
    try {

      const participantRef = doc(this.watsonDatabase, "Participants", this.saleData['watsonparticipantid']);
      let purchaseid: string;
      if (['new', 'addons', 'cancelled'].includes(this.saleData['journeytype'])) {
        purchaseid = this.saleData['watsonpurchaseid'];
      } else if (this.saleData['journeytype'] == 'upgrade') {
        purchaseid = this.saleData['upgradetowatsonpurchaseid'];
      } else if (this.saleData['journeytype'] == 'downgrade') {
        purchaseid = this.saleData['downgradetowatsonpurchaseid'];
      }

      const purchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", purchaseid);
      let paymentref = doc(collection(this.watsonDatabase, "ParticipantPayments"), this.watsonPaymentId);
      let watsonParticipantData = null;
      let watsonPurchaseData = null;
      let watsonPaymentData = null;

      let fromPurchaseDateToNextMonth: Date;
      if (this.saleData['installmentstartdate'] != null) {
        let installmentstartmonth = new Date(this.saleData['installmentstartdate'].toDate())
        let nextMonthLastDate = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth() + 2, 0).getDate()
        let date = nextMonthLastDate < installmentstartmonth.getDate() ? nextMonthLastDate : installmentstartmonth.getDate()
        fromPurchaseDateToNextMonth = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth(), date)
      }

      if (this.saleData['journeytype'] == 'new') {

        const participantDoc = await getDoc(doc(collection(this.watsonDatabase, 'Participants'), this.saleData['watsonparticipantid']));
        
        watsonParticipantData = {
          id: participantRef.id,
          participantid: participantRef.id,
          firstname: this.formatName(this.saleData['firstname']),
          lastname: this.saleData['lastname'],
          name: this.formatName(this.saleData['name']),
          email: this.saleData['email'].toLocaleLowerCase(),
          phone: this.saleData['phonenumber'],
          countrycode: typeof (this.saleData['countrycode']) != 'string' ? this.saleData['countrycode'].toString() : this.saleData['countrycode'] ?? '+91',
          firstpurchasedate: this.purchasedate.toLocaleDateString('en-CA'),
          recentpurchase: this.journeyPurchaseLabel,
          pp_totalpurchasevalue: this.saleData['totalpurchasevalue'],
          pp_totalpaid: Math.ceil(this.saleData['initialpayment'] / 1.18),
          pp_balance: this.saleData['totalpurchasevalue'] - Math.ceil(this.saleData['initialpayment'] / 1.18),
          pp_frequency: "monthly",
          pp_installmentamount: this.saleData['installmentamount'],
          currentemi: this.saleData['installmentamount'],
          pp_installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
          pp_installmentspaid: 0,
          pp_paymentday: this.saleData['dueday'],
          pp_lastpayment: this.purchasedate,
          lastpaymentdate: this.purchasedate,
          pp_installmentsdue: Math.ceil((Math.ceil(this.saleData['totalpurchasevalue'] / 1.18) - this.saleData['initialpayment']) / this.saleData['installmentamount']),
          pp_status: this.saleData['journeytenure'] <= 1 ? "Fully Paid" : "due",
          customerstatus: "regular",
          recentpurchasedate: this.purchasedate.toLocaleDateString('en-CA'),
          paymentcommitment: 'nach',
          paymentcommitmentupdateddate: new Date(),
          nachrecieved: false,
          archive: false,
          profileid: this.saleData['profileid'],
          gstno: null,
          billingname: this.formatName(this.saleData['name']),
          billingemail: this.saleData['email'].toLocaleLowerCase(),
          billingnumber: this.saleData['phonenumber'],
          billingaddress: null,
          tdsenabled: false
        }

        const participantData = participantDoc.exists() ? participantDoc.data() : {};

        watsonParticipantData['gstno'] = ![null, undefined, ""].includes(participantData['gstno']) ? participantData['gstno'] : [null, undefined, ""].includes(this.saleData['gstno']) ? null : this.saleData['gstno']
        watsonParticipantData['billingname'] = ![null, undefined, ""].includes(participantData['billingname']) ? participantData['billingname'] : [null, undefined, ""].includes(this.saleData['billingname']) ? this.formatName(this.saleData['name']) : this.saleData['billingname']
        watsonParticipantData['billingemail'] = ![null, undefined, ""].includes(participantData['billingemail']) ? participantData['billingemail'] : [null, undefined, ""].includes(this.saleData['billingemail']) ? this.saleData['email'].toLocaleLowerCase() : this.saleData['billingemail']
        watsonParticipantData['billingnumber'] = ![null, undefined, ""].includes(participantData['billingnumber']) ? participantData['billingnumber'] : [null, undefined, ""].includes(this.saleData['billingnumber']) ? this.saleData['phonenumber'] : this.saleData['billingnumber']
        watsonParticipantData['billingaddress'] = ![null, undefined, ""].includes(participantData['billingaddress']) ? participantData['billingaddress'] : [null, undefined, ""].includes(this.saleData['billingaddress']) ? null : this.saleData['billingaddress']
        watsonParticipantData['tdsenabled'] = ![null, undefined, ""].includes(participantData['tdsenabled']) ? participantData['tdsenabled'] : [null, undefined, ""].includes(this.saleData['tds']) ? false : this.saleData['tds']

        this.watsonBatch.set(participantRef, watsonParticipantData, { merge: true });
        console.log('Participant Set Batch Completed');

      } else if (this.saleData['journeytype'] == 'upgrade') {

        const previousPurchaseDocRef = doc(collection(this.watsonDatabase, 'ParticipantPurchases'), this.saleData['upgradefromwatsonpurchaseid']);
        const participantDoc = await getDoc(doc(collection(this.watsonDatabase, 'Participants'), this.saleData['watsonparticipantid']));

        watsonParticipantData = {
          profileid: this.selectedProfileID,
          paymentcommitment: 'nach',
          paymentcommitmentupdateddate: new Date(),
          pp_status: this.saleData['journeytenure'] <= 1 ? "Fully Paid" : "due",
          pp_installmentamount: this.saleData['installmentamount'],
          currentemi: this.saleData['installmentamount'],
          recentpurchase: this.journeyPurchaseLabel,
          recentpurchasedate: this.purchasedate.toLocaleDateString('en-CA'),
          nachrecieved: false,
          gstno: null,
          billingname: this.formatName(this.saleData['name']),
          billingemail: this.saleData['email'].toLocaleLowerCase(),
          billingnumber: this.saleData['phonenumber'],
          billingaddress: null,
          tdsenabled: false
        }

        if(participantDoc.exists()) {
          const participantData = participantDoc.data();

          watsonParticipantData['gstno'] = ![null, undefined, ""].includes(participantData['gstno']) ? participantData['gstno'] : [null, undefined, ""].includes(this.saleData['gstno']) ? null : this.saleData['gstno']
          watsonParticipantData['billingname'] = ![null, undefined, ""].includes(participantData['billingname']) ? participantData['billingname'] : [null, undefined, ""].includes(this.saleData['billingname']) ? this.formatName(this.saleData['name']) : this.saleData['billingname']
          watsonParticipantData['billingemail'] = ![null, undefined, ""].includes(participantData['billingemail']) ? participantData['billingemail'] : [null, undefined, ""].includes(this.saleData['billingemail']) ? this.saleData['email'].toLocaleLowerCase() : this.saleData['billingemail']
          watsonParticipantData['billingnumber'] = ![null, undefined, ""].includes(participantData['billingnumber']) ? participantData['billingnumber'] : [null, undefined, ""].includes(this.saleData['billingnumber']) ? this.saleData['phonenumber'] : this.saleData['billingnumber']
          watsonParticipantData['billingaddress'] = ![null, undefined, ""].includes(participantData['billingaddress']) ? participantData['billingaddress'] : [null, undefined, ""].includes(this.saleData['billingaddress']) ? null : this.saleData['billingaddress']
          watsonParticipantData['tdsenabled'] = ![null, undefined, ""].includes(participantData['tdsenabled']) ? participantData['tdsenabled'] : [null, undefined, ""].includes(this.saleData['tds']) ? null : this.saleData['tds']
        }

        this.watsonBatch.update(previousPurchaseDocRef, { 
          purchasestatus: "upgrade",
          lastupdate: serverTimestamp(),
          purchaseupdate_ts: serverTimestamp(),
        });

        console.log('Previous Purchase Update Batch Completed');
        this.watsonBatch.update(participantRef, watsonParticipantData);
        console.log('Participant Update Batch Completed');

      } else if (this.saleData['journeytype'] == 'downgrade' && this.saleData['downgradetonewpurchase']) {
        console.log('Downgrading to New Purchase');
        let existingParticipant = await getDoc(participantRef);
        const participantDoc = await getDoc(doc(collection(this.watsonDatabase, 'Participants'), this.saleData['watsonparticipantid']));

        watsonParticipantData = {
          gstno: null,
          billingname: this.formatName(this.saleData['name']),
          billingemail: this.saleData['email'].toLocaleLowerCase(),
          billingnumber: this.saleData['phonenumber'],
          billingaddress: null,
          tdsenabled: false
        }

        if (participantDoc.exists()) {
          const participantData = participantDoc.data();
          watsonParticipantData['gstno'] = ![null, undefined, ""].includes(participantData['gstno']) ? participantData['gstno'] : [null, undefined, ""].includes(this.saleData['gstno']) ? null : this.saleData['gstno'];
          watsonParticipantData['billingname'] = ![null, undefined, ""].includes(participantData['billingname']) ? participantData['billingname'] : [null, undefined, ""].includes(this.saleData['billingname']) ? this.formatName(this.saleData['name']) : this.saleData['billingname'];
          watsonParticipantData['billingemail'] = ![null, undefined, ""].includes(participantData['billingemail']) ? participantData['billingemail'] : [null, undefined, ""].includes(this.saleData['billingemail']) ? this.saleData['email'].toLocaleLowerCase() : this.saleData['billingemail'];
          watsonParticipantData['billingnumber'] = ![null, undefined, ""].includes(participantData['billingnumber']) ? participantData['billingnumber'] : [null, undefined, ""].includes(this.saleData['billingnumber']) ? this.saleData['phonenumber'] : this.saleData['billingnumber'];
          watsonParticipantData['billingaddress'] = ![null, undefined, ""].includes(participantData['billingaddress']) ? participantData['billingaddress'] : [null, undefined, ""].includes(this.saleData['billingaddress']) ? null : this.saleData['billingaddress'];
          watsonParticipantData['tdsenabled'] = ![null, undefined, ""].includes(participantData['tdsenabled']) ? participantData['tdsenabled'] : [null, undefined, ""].includes(this.saleData['tds']) ? null : this.saleData['tds'];
        }

        this.watsonBatch.update(participantRef, watsonParticipantData);
        
        watsonPurchaseData = (await this.validateWatsonPurchase(participantRef, purchaseRef, fromPurchaseDateToNextMonth));

        if (this.saleData['initialpayment'] > 0) {
          watsonPaymentData = (await this.validateWatsonPayment(participantRef, paymentref, watsonParticipantData));
          if (watsonPaymentData != null) {
            this.watsonBatch.set(paymentref, watsonPaymentData, { merge: true });
          }
          console.log('Payment Batch Set Completed');
        } else {
          this.updateCheckpoint(this.saleData['journeytype'], 'participant_payment', 'Validate Watson Payment', 'Completed', 'No Payment to Create')
        }

        try {
          const downgradeFrompurchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", this.saleData['downgradefromwatsonpurchaseid'])
          let downgradeFromPurchaseData = {
            purchasestatus: 'downgrade',
            lastupdate: new Date(),
            salesperson: this.saleData['salespersonname'],
            cancelled: true,
            purchasecanceldate: new Date()
          }
          this.watsonBatch.update(downgradeFrompurchaseRef, downgradeFromPurchaseData);
        } catch (error) {
          console.error(error);
        }

        if (watsonPurchaseData != null) {
          this.watsonBatch.set(purchaseRef, watsonPurchaseData, { merge: true });
        }
        console.log('Purchase Batch Set Completed');
      } else if (this.saleData['journeytype'] == 'downgrade' && !this.saleData['downgradetonewpurchase']) {
        console.log('Downgrading to Existing Purchase');

        const participantPurchasesRef = doc(this.watsonDatabase, "ParticipantPurchases", this.saleData['downgradefromwatsonpurchaseid']);
        let purchaseBeforeUpdateData = (await getDoc(participantPurchasesRef)).data()
        purchaseBeforeUpdateData['lastupdate'] = new Date()
        purchaseBeforeUpdateData['downgradeoweus'] = this.saleData['oweus'];

        let purchaseDate = this.saleData['installmentstartdate'].toDate();
        let nextMonthLastDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 2, 0).getDate();
        let date = nextMonthLastDate < purchaseDate.getDate() ? nextMonthLastDate : purchaseDate.getDate();
        fromPurchaseDateToNextMonth = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, date);

        const downgradeFromPurchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", this.saleData['downgradefromwatsonpurchaseid']);
        const downgradeToPurchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", this.saleData['downgradefromwatsonpurchaseid']);

        let downgradingData = {
          purchasestatus: 'downgrade',
          lastupdate: new Date(),
          cancelled: true,
          purchasecanceldate:serverTimestamp(),
          purchasecancelamount: this.saleData['oweus'],
          paymentday: this.saleData['dueday'],
          installmentamount: this.saleData['installmentsData'][0]['installmentamount'],
          installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
          salesperson: this.saleData['salespersonname'],
          installmentsData: this.saleData['installmentsData'],
        }

        if (this.productstoenable.length != 0) {
          console.log('Setting batch for Products to enable');
          try {
            for (let j = 0; j < this.productstoenable.length; j++) {
              const enableDocId = this.productstoenable[j];
              const docRef = doc(collection(this.firestore, 'participantsproduct'), enableDocId);
              this.starlabsBatch.update(docRef, { status: null });
            }
            this.updateCheckpoint(this.saleData['journeytype'], 'products_to_enable', 'Enabling Products', 'Completed', 'Validated');
          } catch (error) {
            console.error(error);
            this.updateCheckpoint(this.saleData['journeytype'], 'products_to_enable', 'Enabling Products', 'Error', `Not Validated`);
          }
        }

        if (this.cancelledProducts.length != 0) {
          console.log('Setting batch for Products to Cancel');
          try {
            for (let j = 0; j < this.cancelledProducts.length; j++) {
              const cancelDocId = this.cancelledProducts[j];
              const docRef = doc(collection(this.firestore, 'participantsproduct'), cancelDocId);
              this.starlabsBatch.update(docRef, { status: "cancelled" });
            }
            this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Completed', 'Validated');
          } catch (error) {
            console.error(error);
            this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Error', `Not Validated`);
          }
        }

        const downgradeFromPJPRef = doc(this.firestore, "participantjourneyproduct", this.saleData['downgradefromparticipantjourneyproductid']);
        const downgradeToPJPRef = doc(this.firestore, "participantjourneyproduct", this.saleData['downgradetoparticipantjourneyproductid']);
        this.starlabsBatch.update(downgradeFromPJPRef, { journeystatus: "downgraded" });

        //changing journey status in participantjourney product
        await getDoc(downgradeToPJPRef).then(async (pjpDoc) => {
          if (pjpDoc.data()['journeystatus'] == 'upgraded') {
            this.starlabsBatch.update(downgradeToPJPRef, { journeystatus: "ongoing" });
          } else {
            console.log('participantjourneyproduct journey status is not upgrade so we cant update..');
          }
        });

        this.watsonBatch.set(participantPurchasesRef, purchaseBeforeUpdateData);
        this.watsonBatch.update(downgradeFromPurchaseRef, downgradingData);
        this.watsonBatch.update(downgradeToPurchaseRef, { purchasestatus: 'active', lastupdate: new Date(), });

      } else if (this.saleData['journeytype'] == 'addons') {
        const participantDoc = await getDoc(doc(collection(this.watsonDatabase, 'Participants'), this.saleData['watsonparticipantid']));

        watsonParticipantData = {
          gstno: null,
          billingname: this.formatName(this.saleData['name']),
          billingemail: this.saleData['email'].toLocaleLowerCase(),
          billingnumber: this.saleData['phonenumber'],
          billingaddress: null,
          tdsenabled: false
        }

        if(participantDoc.exists()) {
          const participantData = participantDoc.data();
          watsonParticipantData['gstno'] = ![null, undefined, ""].includes(participantData['gstno']) ? participantData['gstno'] : [null, undefined, ""].includes(this.saleData['gstno']) ? null : this.saleData['gstno']
          watsonParticipantData['billingname'] = ![null, undefined, ""].includes(participantData['billingname']) ? participantData['billingname'] : [null, undefined, ""].includes(this.saleData['billingname']) ? this.formatName(this.saleData['name']) : this.saleData['billingname']
          watsonParticipantData['billingemail'] = ![null, undefined, ""].includes(participantData['billingemail']) ? participantData['billingemail'] : [null, undefined, ""].includes(this.saleData['billingemail']) ? this.saleData['email'].toLocaleLowerCase() : this.saleData['billingemail']
          watsonParticipantData['billingnumber'] = ![null, undefined, ""].includes(participantData['billingnumber']) ? participantData['billingnumber'] : [null, undefined, ""].includes(this.saleData['billingnumber']) ? this.saleData['phonenumber'] : this.saleData['billingnumber']
          watsonParticipantData['billingaddress'] = ![null, undefined, ""].includes(participantData['billingaddress']) ? participantData['billingaddress'] : [null, undefined, ""].includes(this.saleData['billingaddress']) ? null : this.saleData['billingaddress']
          watsonParticipantData['tdsenabled'] = ![null, undefined, ""].includes(participantData['tdsenabled']) ? participantData['tdsenabled'] : [null, undefined, ""].includes(this.saleData['tds']) ? null : this.saleData['tds']
        }

        let lastpaymentscheduledate;
        const PaymentScheduleQuery = query(collection(this.watsonDatabase, "Payment Schedule"), where("participantid", "==", participantRef.id), orderBy("date", "desc"))
        await getDocs(PaymentScheduleQuery).then((partcipantDoc) => {
          if (partcipantDoc.docs.length != 0) {
            lastpaymentscheduledate = partcipantDoc.docs[0].data()['date'].toDate();
          } else {
            this.updateCheckpoint(this.saleData['journeytype'], 'payment_schedule', 'Payment Schedule', 'Error', 'No Schedules Found')
          }
        });

        let purchaseDate = this.saleData['installmentatend'] == true ? lastpaymentscheduledate : this.saleData['installmentstartdate'].toDate();
        let nextMonthLastDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 2, 0).getDate();
        let date = nextMonthLastDate < purchaseDate.getDate() ? nextMonthLastDate : purchaseDate.getDate();
        fromPurchaseDateToNextMonth = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, date);
        this.watsonBatch.update(participantRef, watsonParticipantData);
      } else if (this.saleData['journeytype'] == 'cancelled') {

        const participantPurchasesRef = doc(this.watsonDatabase, "ParticipantPurchases", this.saleData['watsonpurchaseid'])
        let purchaseBeforeUpdateData = (await getDoc(participantPurchasesRef)).data()
        purchaseBeforeUpdateData['lastupdate'] = new Date();
        const purchasehistoryRef = doc(this.watsonDatabase, "ParticipantPurchases_history", purchaseBeforeUpdateData['id']);

        watsonPurchaseData = {
          cancelled: true,
          purchasestatus: 'cancelled',
          purchasecancelamount: this.saleData['totalpurchasevalue'],
          lastupdate: serverTimestamp(),
          installmentsData: this.saleData['installmentsData'],
          installmentamount: this.saleData['installmentsData'][0]['installmentamount'],
          installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
          salenotes: this.saleData['notes'],
          purchasecanceldate: serverTimestamp()
        }

        this.watsonBatch.set(purchasehistoryRef, purchaseBeforeUpdateData);
        this.watsonBatch.update(participantPurchasesRef, watsonPurchaseData);

      }

      if (!['downgrade', 'cancelled'].includes(this.saleData['journeytype'])) {
        let existingParticipant = await getDoc(participantRef);
        watsonPurchaseData = (await this.validateWatsonPurchase(participantRef, purchaseRef, fromPurchaseDateToNextMonth));
        if (this.saleData['initialpayment'] > 0) {
          watsonPaymentData = (await this.validateWatsonPayment(participantRef, paymentref, watsonParticipantData));
        }
        if (watsonPurchaseData != null) {
          this.watsonBatch.set(purchaseRef, watsonPurchaseData, { merge: true });
        }
        if (watsonPaymentData != null) {
          this.watsonBatch.set(paymentref, watsonPaymentData, { merge: true });
        }
      }

      this.updateCheckpoint(this.saleData['journeytype'], 'setting_data', 'Validation for Watson', 'Completed', 'Validated');
      return { watsonParticipantData, watsonPurchaseData, watsonPaymentData };
    } catch (error) {
      this.updateCheckpoint(this.saleData['journeytype'], 'setting_data', 'Validation for Watson', 'Error', error);
      return null;
    }
  }

  async validateWatsonPurchase(participantRef, purchaseRef, fromPurchaseDateToNextMonth) {
    let watsonPurchaseData = null;
    try {
      if ((await getDoc(doc(collection(this.watsonDatabase, 'ParticipantPurchases'), purchaseRef.id))).exists()) {
        this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpurchase', 'Watson Purchase Validation', 'Completed', 'Purchase Already Exists');
        console.log('Purchase Already Exists');
      } else {
        watsonPurchaseData = {
          participantid: participantRef.id,
          fee: this.saleData['totalpurchasevalue'],
          gst: Math.ceil(this.saleData['totalpurchasevalue'] * .18),
          gross: parseInt(this.saleData['totalpurchasevalue']) + Math.ceil(this.saleData['totalpurchasevalue'] * .18),
          initialpayment: this.saleData['initialpayment'],
          product: this.saleData['journeytype'] == 'addons' ? this.addonPurchaseLabel : this.journeyPurchaseLabel,
          // purchasedate: this.purchasedate.toISOString().substring(0, 10),
          purchasedate: this.purchasedate.toLocaleDateString('en-CA'),
          purchasedate_ts: this.purchasedate,
          id: purchaseRef.id,
          installmentamount: this.saleData['installmentamount'],
          installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
          paymentday: this.saleData['dueday'],
          status: this.saleData['journeytenure'] <= 1 ? "Fully Paid" : "due",
          salesperson: this.saleData['salespersonname'],
          presalesperson: this.saleData['presalespersonname'],
          originalfee: this.saleData['originalfee'],
          purchasestatus: this.saleData['journeytype'] == 'addons' ? 'addons' : 'active',
          purchasetype: this.saleData['journeytype'] == 'addons' ? 'addons' : 'journey',
          installmentsData: this.saleData['installmentsData'],
          paymentid: this.saleData['paymentid'],
          salenotes: this.saleData['notes']
        }
        if (this.saleData['journeytype'] == 'upgrade') {
          watsonPurchaseData['carryover'] = this.saleData['carryover']
        }
        if (this.saleData['journeytype'] == 'addons') {
          watsonPurchaseData['installmentatend'] = this.saleData['installmentatend']
        }
        this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpurchase', 'Watson Purchase Validation', 'Completed', 'Validated');
      }

      return watsonPurchaseData;
    } catch (error) {
      this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpurchase', 'Watson Purchase Validation', 'Error', error);
      return null;
    }
  }

  async validateWatsonPayment(participantRef, paymentref, watsonParticipantData) {
    let watsonPaymentData = null;
    let configData = {};

    await getDoc(doc(this.watsonDatabase, "accountsconfig", "config")).then((data) => {
      if (data.exists()) {
        configData = data.data();
      }
    });

    try {

      if ((await getDocs(query(collection(this.watsonDatabase, 'ParticipantPayments'), where('paymentid', '==', this.saleData['paymentid'])))).docs.length == 0) {
        watsonPaymentData = {
          id: paymentref.id,
          participantid: participantRef.id,
          date: this.purchasedate.toLocaleDateString('en-CA'),
          receipt: this.saleData['initialpayment'],
          fee: Math.ceil(this.saleData['initialpayment'] / 1.18),
          gst: this.saleData['initialpayment'] - Math.ceil(this.saleData['initialpayment'] / 1.18),
          paymentid: this.saleData['paymentid'],
          fluid: false,
          paymentdate: this.purchasedate,
          updateddate: new Date(),
          type: 'tokenpayment',
          p_type: 'newpayment',
          newpaymentamount: this.saleData['initialpayment'],
          scheduleamount: 0,
          additionalamount: 0,
          bulkamount: 0,
          invoicesent: false,
        }

        if (watsonParticipantData != null) {
          watsonPaymentData['gstno'] = watsonParticipantData['gstno'],
          watsonPaymentData['billingname'] = watsonParticipantData['billingname'],
          watsonPaymentData['billingaddress'] = watsonParticipantData['billingaddress'],
          watsonPaymentData['billingemail'] = watsonParticipantData['billingemail']
          const { GSTState, GSTRatio } = await this.updateGSTState(watsonPaymentData, configData);
          let gstdetails = configData['gstdetails'].find((e) => e['statename']?.toLowerCase().replace(/\s+/g, ' ').trim() == GSTState?.toLowerCase().replace(/\s+/g, ' ').trim());
          var templateID;
          if ([null, undefined, ""].includes(watsonParticipantData['gstno']) || watsonParticipantData['gstno'].substring(0, 2) == gstdetails['statecode']) {
            templateID = 40962079;
          } else {
            templateID = 40962160;
          }

          watsonPaymentData['gstdetails'] = gstdetails;
          watsonPaymentData['companygstno'] = gstdetails['gstno'];
          watsonPaymentData['templateid'] = templateID;

          const paymentDate = watsonPaymentData['paymentdate'];
          const actualmonth = paymentDate.getMonth() + 1;
          const month = this.padWithZeros(actualmonth, 2);
          const fullYear = paymentDate.getFullYear();
          const year = fullYear.toString().slice(-2);
          const docid = `${month}-${year}`;

          const ratioRef = doc(this.watsonDatabase, "nongstratiocounters", docid);

          if ([null, undefined, ""].includes(watsonParticipantData['gstno'])) {
            GSTRatio[GSTState]++;
            GSTRatio['total']++;
            updateDoc(ratioRef, GSTRatio);
          }
        }
        
        this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpayment', 'Watson Payment Validation', 'Completed', 'Validated');
      } else {
        this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpayment', 'Payment Already Exists', 'Error', 'Error');
      }

      return watsonPaymentData;
    } catch (error) {
      this.updateCheckpoint(this.saleData['journeytype'], 'validate_watsonpayment', 'Watson Payment Validation', 'Error', error);
      return null;
    }
  }

  async updateGSTState(value, configData) {
    let GSTState = null;
    let GSTRatio = null;
    if (![null, undefined, ""].includes(value['gstno'])) {
      const gstno = value['gstno'].substring(0, 2);

      for (let i = 0; i < configData['gstdetails'].length; i++) {
        const element = configData['gstdetails'][i];

        if (element['statecode'] == gstno) {
          GSTState = element['statename'];
          break;
        }

        if (i + 1 == configData['gstdetails'].length && [null, undefined, ""].includes(GSTState)) {
          GSTState = configData['igststate']
        }
      }

    } else {
      const paymentDate = value.paymentdate;
      const actualmonth = paymentDate.getMonth() + 1;
      let month = this.padWithZeros(actualmonth, 2);
      const fullYear = paymentDate.getFullYear();
      const year = fullYear.toString().slice(-2);

      const docid = `${month}-${year}`;

      await getDoc(doc(this.watsonDatabase, "nongstratiocounters", docid)).then(async (counter) => {
        if (counter.exists()) {
          GSTRatio = counter.data();
          GSTState = await this.processRatioData(counter.data(), configData);
        } else {
          const docRef = doc(this.watsonDatabase, "nongstratiocounters", docid);
          var map = {};

          for (let i = 0; i < configData['gstdetails'].length; i++) {
            const element = configData['gstdetails'][i];
            map[element['statename']] = 0;
          }

          map['total'] = 0;
          setDoc(docRef, map).then(async () => {
            console.log("Config Data Set Successfully");
            GSTState = await this.processRatioData(map, configData);
            GSTRatio = map;
          })
        }
      })
    }

    return { GSTState, GSTRatio };
  }

  processRatioData(data, configData) {
    let GSTState;
    for (let i = 0; i < configData['nongstratio'].length; i++) {
      const element = configData['nongstratio'][i];
      const count = data[element['state']];

      let result = 0;
      if (data['total'] > 0) {
        result = (count / data['total']) * 100;
      }

      if (element['ratio'] == 100) {
        GSTState = element['state'];
        break;
      } else if (result <= element['ratio'] && element['ratio'] != 0) {
        GSTState = element['state']
        break;
      } else {
        continue;
      }
    }

    return GSTState;
  }

  padWithZeros(num, targetLength) {
    return num.toString().padStart(targetLength, '0');
  }


  // const downgradeFromPJPRef = doc(this.firestore, "participantjourneyproduct", this.saleData['downgradefromparticipantjourneyproductid']);
  // this.starlabsBatch.update(downgradeFromPJPRef, { journeystatus: "downgraded" });
  async validateStarlabsSale() {

    console.log('Triggered validate starlabs');
    let purchaseid: string;
    if (['new', 'addons', 'cancelled'].includes(this.saleData['journeytype'])) {
      purchaseid = this.saleData['watsonpurchaseid'];
    } else if (this.saleData['journeytype'] == 'upgrade') {
      purchaseid = this.saleData['upgradetowatsonpurchaseid'];
    } else if (this.saleData['journeytype'] == 'downgrade') {
      purchaseid = this.saleData['downgradetowatsonpurchaseid'];
    }

    try {

      if (this.saleData['journeytype'] != 'cancelled' && (this.saleData['journey'] != null || this.saleData['addons'].length != 0)) {
        console.log('Adding Sale..');

        if (this.selectedProfile == null) {
          const profileRef = doc(collection(this.firestore, 'profile_data'), this.selectedProfileID);
          const rolesRef = doc(collection(this.firestore, 'users_roles'));
          this.selectedProfile = {
            name: this.formatName(this.saleData['name']),
            countrycode: typeof (this.saleData['countrycode']) != 'string' ? this.saleData['countrycode'].toString() : this.saleData['countrycode'] ?? '+91',
            number: this.saleData['phonenumber'],
            profile: null,
            email: this.saleData['email'],
            recentpurchase: null,
            user_ref: null,
            created: new Date(),
            enable: true,
            block: false,
            profileid: this.selectedProfileID,
            role_ref: rolesRef
          }

          let rolesData = {
            name: this.formatName(this.saleData['name']),
            profile_ref: profileRef,
            admin: false,
            changeagent: false,
            eitfellowship: false,
            eitapprentice: false,
            eitcoordinator: false,
            eventcoordinator: false,
            participant: true,
            transcriber: false,
            verifier: false,
            chatxadmin: false,
            supportdesk: false,
            id: rolesRef.id
          }

          try {
            this.starlabsBatch.set(profileRef, this.selectedProfile, { merge: true });
            this.starlabsBatch.set(rolesRef, rolesData, { merge: true });
            this.updateCheckpoint(this.saleData['journeytype'], 'new_profile', 'Create New Profile', 'Completed', 'Validated');
          } catch (error) {
            console.error(error);
            this.updateCheckpoint(this.saleData['journeytype'], 'new_profile', 'Create New Profile', 'Error', `Not Validated`);
          }
        } else {
          console.log("Profile already exist");
        }

        // Update Purchase
        if (![null, undefined].includes(this.selectedProfile)) {
          console.log('Update Purchase');

          for (const key in this.saleData) {
            if (['journey', 'addons'].includes(key)) {

              if (this.saleData['journey'] != null || this.saleData['addons'].length != 0) {
                if ((key === 'journey' && this.saleData['journey'] != null) || (key === 'addons' && this.saleData['addons'].length != 0)) {

                  let journey_product_purchase_id: string;
                  let participant_journey_product_id: string;
                  let journey_product_purchase_Ref: DocumentReference;
                  let participant_journey_product_Ref: DocumentReference;

                  if (this.saleData['journeytype'] == 'downgrade' && this.saleData['downgradetonewpurchase']) {
                    console.log('Downgrade Sale to New Purchase');

                    journey_product_purchase_id = this.saleData['downgradetojourneyproductpurchaseid']
                    participant_journey_product_id = this.saleData['downgradetoparticipantjourneyproductid'];
                    journey_product_purchase_Ref = doc(collection(this.firestore, 'journeyproductpurchase'), journey_product_purchase_id);
                    participant_journey_product_Ref = doc(collection(this.firestore, 'participantjourneyproduct'), participant_journey_product_id);

                    if (this.productstoenable.length != 0) {
                      console.log('Setting batch for Products to enable');
                      try {
                        for (let j = 0; j < this.productstoenable.length; j++) {
                          const enableDocId = this.productstoenable[j];
                          const docRef = doc(collection(this.firestore, 'participantsproduct'), enableDocId);
                          this.starlabsBatch.update(docRef, { status: null });
                        }
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_enable', 'Enabling Products', 'Completed', 'Validated');
                      } catch (error) {
                        console.error(error);
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_enable', 'Enabling Products', 'Error', `Not Validated`);
                      }
                    }

                    if (this.cancelledProducts.length != 0) {
                      console.log('Setting batch for Products to Cancel');
                      try {
                        for (let j = 0; j < this.cancelledProducts.length; j++) {
                          const cancelDocId = this.cancelledProducts[j];
                          const docRef = doc(collection(this.firestore, 'participantsproduct'), cancelDocId);
                          this.starlabsBatch.update(docRef, { status: "cancelled" });
                        }
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Completed', 'Validated');
                      } catch (error) {
                        console.error(error);
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Error', `Not Validated`);
                      }
                    }

                    try {
                      const downgradeFromDocRef = doc(collection(this.firestore, 'participantjourneyproduct'), this.saleData['downgradefromparticipantjourneyproductid']);
                      this.starlabsBatch.update(downgradeFromDocRef,{
                        journeystatus: 'downgraded'
                      });
                      this.updateCheckpoint(this.saleData['journeytype'], 'updating_drowngradefrom_pjp', 'Downgrading Existing Journey', 'Completed', `Validated`);
                    } catch (error) {
                      console.error(error);
                      this.updateCheckpoint(this.saleData['journeytype'], 'updating_drowngradefrom_pjp', 'Downgrading Existing Journey', 'Error', `Not Validated`);
                    }

                  } else {
                    console.log(this.saleData['journeytype'], ' Sale');

                    journey_product_purchase_id = ['new', 'addons'].includes(this.saleData['journeytype']) ? this.saleData['journeyproductpurchaseid'] : this.saleData['upgradetojourneyproductpurchaseid'];
                    participant_journey_product_id = ['new', 'addons'].includes(this.saleData['journeytype']) ? this.saleData['participantjourneyproductid'] : this.saleData['upgradetoparticipantjourneyproductid'];

                    journey_product_purchase_Ref = doc(collection(this.firestore, 'journeyproductpurchase'), journey_product_purchase_id);
                    participant_journey_product_Ref = doc(collection(this.firestore, 'participantjourneyproduct'), participant_journey_product_id);

                    if (this.saleData['carryover'] == false && this.cancelledProducts.length != 0) {
                      console.log('Setting batch for Products to Cancel');
                      try {
                        for (let j = 0; j < this.cancelledProducts.length; j++) {
                          const cancelDocId = this.cancelledProducts[j];
                          const docRef = doc(collection(this.firestore, 'participantsproduct'), cancelDocId);
                          this.starlabsBatch.update(docRef, { status: "cancelled" });
                        }
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Completed', 'Validated');
                      } catch (error) {
                        console.error(error);
                        this.updateCheckpoint(this.saleData['journeytype'], 'products_to_cancel', 'Cancelling Products', 'Error', `Not Validated`);
                      }
                    }
                  }

                  const journeyRef = (key === 'journey' && this.saleData['journey'] != null) ? doc(collection(this.firestore, 'journey'), this.saleData['journey']) : null
                  //creating participant products and productreflist
                  let participantProducts = [];
                  let journeyProductRefList = [];
                  let journeyPackageRef = null;
                  if (key === 'journey' && this.saleData['journey'] != null) {
                    console.log('Journey');

                    try {
                      journeyPackageRef = doc(collection(this.firestore, 'package'), this.mapPackageName[this.mapJourney[this.saleData['journey']].toLowerCase().replace(/\s/g, "")]);
                      for (let i = 0; i < this.mapJourneyProduct[this.saleData['journey']].length; i++) {
                        const productElementRef = this.mapJourneyProduct[this.saleData['journey']][i];
                        participantProducts.push({
                          participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
                          productref: productElementRef,
                          packageref: journeyPackageRef
                        })
                        journeyProductRefList.push(productElementRef);
                      };
                      this.updateCheckpoint(this.saleData['journeytype'], 'journey_participant_products', 'Products Added', 'Completed', 'Validated');
                    } catch (error) {
                      console.error(error);
                      this.updateCheckpoint(this.saleData['journeytype'], 'journey_participant_products', 'Products Added', 'Error', `Not Validated`);
                    }

                  }
                  if (key === 'addons' && this.saleData['addons'].length != 0) {
                    console.log('Addons');
                    try {
                      const addonsPackageRef = doc(collection(this.firestore, 'package'), this.mapPackageName[key])
                      for (let i = 0; i < this.saleData['addons'].length; i++) {
                        const addonsProduct = this.saleData['addons'][i];
                        const addonsProductRef = doc(collection(this.firestore, 'products'), addonsProduct)
                        participantProducts.push({
                          participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
                          productref: addonsProductRef,
                          packageref: addonsPackageRef
                        });
                        journeyProductRefList.push(addonsProductRef)
                      };
                      this.updateCheckpoint(this.saleData['journeytype'], 'addons_participant_products', 'Participant Products Addons', 'Completed', 'Validated');
                    } catch (error) {
                      console.error(error);
                      this.updateCheckpoint(this.saleData['journeytype'], 'addons_participant_products', 'Participant Products Addons', 'Error', `Not Validated`);
                    }
                  }
                  if (this.saleData['bonus'].length != 0) {
                    console.log('Bonus');
                    try {
                      let bonusPackageRef = [null, undefined].includes(this.mapPackageName['bonus']) ? null : doc(this.firestore, "package", this.mapPackageName['bonus'])
                      for (let i = 0; i < this.saleData['bonus'].length; i++) {
                        const bonusProduct = this.saleData['bonus'][i];
                        const bonusProductRef = doc(collection(this.firestore, 'products'), bonusProduct)
                        participantProducts.push({
                          participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
                          productref: bonusProductRef,
                          packageref: bonusPackageRef
                        });
                        journeyProductRefList.push(bonusProductRef)
                      }
                      this.updateCheckpoint(this.saleData['journeytype'], 'bonus_participant_products', 'Bonus Added', 'Completed', 'Validated');
                    } catch (error) {
                      console.error(error);
                      this.updateCheckpoint(this.saleData['journeytype'], 'bonus_participant_products', 'Bonus Added', 'Error', `Not Validated`);
                    }
                  }

                  // add journeyproductpurchase
                  try {
                    let journeyproductPurchaseData = {
                      docid: journey_product_purchase_id,
                      journeyref: journeyRef,
                      participantjourneyproductref: participant_journey_product_Ref,
                      productref: journeyProductRefList,
                      profileid: this.selectedProfileID,
                      purchasetype: journeyRef != null ? 'journey' : 'product',
                      watsonpurchaseid: purchaseid,
                      watsonpurchaselabel: this.saleData['purchaselabel'],
                    }
                    this.starlabsBatch.set(journey_product_purchase_Ref, journeyproductPurchaseData);
                    this.updateCheckpoint(this.saleData['journeytype'], 'journey_product_purchase', 'Journey Added', 'Completed', 'Validated');
                    console.log('Batch Set for Journey Product Purchase');
                  } catch (error) {
                    console.error(error);
                    this.updateCheckpoint(this.saleData['journeytype'], 'journey_product_purchase', 'Journey Added', 'Error', `Not Validated`);
                  }

                  if (this.saleData['journeytype'] == 'upgrade') {
                    try {
                      const upgradeFromPJPRef = doc(collection(this.firestore, 'participantjourneyproduct'), this.saleData['upgradefromparticipantjourneyproductid']);
                      this.starlabsBatch.update(upgradeFromPJPRef, {
                        journeystatus: 'upgraded',
                        opportunities_consumed: this.saleData['opportunities_consumed'] || []
                      });
                      this.updateCheckpoint(this.saleData['journeytype'], 'participant_journey_product_previous', 'Previous Journey Upgraded', 'Completed', 'Validated');
                    } catch (error) {
                      console.error('Error in Upgrading Previous Journey');
                      this.updateCheckpoint(this.saleData['journeytype'], 'participant_journey_product_previous', 'Previous Journey Upgraded', 'Error', `Not Validated`);
                    }
                  }

                  // new purchase 
                  try {
                    let participantjourneyproductData = {
                      docid: participant_journey_product_id,
                      journeyref: journeyRef,
                      journeystatus: 'initiated',
                      participantproducts: participantProducts,
                      productref: journeyProductRefList,
                      profileid: this.selectedProfileID,
                      purchaseref: journey_product_purchase_Ref,
                      subscriptionend: this.subscriptionEnd,
                      subscriptionstart: this.subscriptionStart,
                      purchasedate: this.purchasedate,
                      salesperson: this.saleData['salespersonname'],
                      presalesperson: this.saleData['presalesperson'],
                      salesleadsref: doc(collection(this.firestore, 'salesleads'), this.saleData['docid']),
                      journeytype: this.saleData['journeytype'],
                      onboarded: false,
                      paymentplan: null,
                      salenotes: this.saleData['notes'],
                    }
                    this.starlabsBatch.set(participant_journey_product_Ref, participantjourneyproductData);
                    this.updateCheckpoint(this.saleData['journeytype'], 'participant_journey_product', 'Journey Products Created', 'Completed', 'Validated');
                  } catch (error) {
                    console.error(error);
                    this.updateCheckpoint(this.saleData['journeytype'], 'participant_journey_product', 'Journey Products Created', 'Error', `Not Validated`);
                  }

                  try {
                    this.starlabsBatch.update(doc(collection(this.firestore, 'profile_data'), this.selectedProfileID), {
                      recentpurchasedate: this.purchasedate
                    });
                    // this.updateCheckpoint(this.saleData['journeytype'], 'recent_purchase', 'Profile Recent Purchase', 'Completed', 'Validated');
                  } catch (error) {
                    console.error(error);
                    // this.updateCheckpoint(this.saleData['journeytype'], 'recent_purchase', 'Profile Recent Purchase', 'Error', `Not Validated`);
                  }

                  try {
                    //sequence order checking
                    let sequenceOrder = 0
                    var ppData = [];

                    await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileID), orderBy('sequenceorder', 'asc'))).then(async snap => {
                      sequenceOrder = snap.docs.length
                      for (let j = 0; j < snap.docs.length; j++) {
                        const element = snap.docs[j].data();
                        ppData.push({
                          docid: element["docid"],
                          productref: element["productref"].id
                        });
                      }
                    });

                    // add participantsproduct
                    for (let i = 0; i < participantProducts.length; i++) {
                      const ppelement = participantProducts[i];
                      var map = {};
                      var minimumpayment = parseInt(this.mapProductminimumamount[ppelement['productref'].id]['minimumrequiredamount']) ?? 0;
                      const participantsproductRef = doc(collection(this.firestore, 'participantsproduct'), ppelement['participantproductid']);

                      let participantsproductData = {
                        docid: participantsproductRef.id,
                        journeyref: journeyRef,
                        productref: ppelement['productref'],
                        packageref: ppelement['packageref'],
                        status: null,
                        sequenceorder: i + sequenceOrder,
                        profileid: this.selectedProfileID,
                        minimumpayment: minimumpayment,
                        subscriptionstart:this.subscriptionStart,
                        subscriptionend:this.subscriptionEnd
                      }
                      map['docid'] = participantsproductRef.id
                      map['productref'] = ppelement['productref'].id

                      this.starlabsBatch.set(participantsproductRef, participantsproductData);
                      ppData.push(map);
                    }
                    this.participantsProductsData = ppData;
                    this.updateCheckpoint(this.saleData['journeytype'], 'setting_participant_products', 'Setting Participant Products', 'Completed', 'Validated');
                  } catch (error) {
                    console.error(error);
                    this.updateCheckpoint(this.saleData['journeytype'], 'setting_participant_products', 'Setting Participant Products', 'Error', `Not Validated`);
                  }
                }
              }
            }
          }
        } else {
          console.log("profileId empty");
        }

      } else if (this.saleData['journeytype'] == 'cancelled') {

        const cancelDocRef = doc(collection(this.firestore, 'participantjourneyproduct'), this.cancelJourneyID);
        this.starlabsBatch.update(cancelDocRef, { journeystatus: "cancelled" });
        for (let j = 0; j < this.cancelledProducts.length; j++) {
          const cancelDocId = this.cancelledProducts[j];
          const docRef = doc(collection(this.firestore, 'participantsproduct'), cancelDocId);
          this.starlabsBatch.update(docRef, { status: "cancelled" });
        }

      }
      this.updateCheckpoint(this.saleData['journeytype'], 'validate_profile', 'Create Profile in Breakthroughs', 'Completed', 'Validated');
    } catch (error) {
      console.error(error);
      this.updateCheckpoint(this.saleData['journeytype'], 'validate_profile', 'Create Profile in Breakthroughs', 'Error', error);
    }

  }

}
