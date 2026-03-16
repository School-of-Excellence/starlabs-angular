
import { Component, OnInit, Inject, NgZone } from '@angular/core';
import { AuthguardService } from '../authguard.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { LoadingProgressComponent } from '../loading-progress/loading-progress.component';
import { collection, doc, Firestore, getDoc, getDocs, getFirestore, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { environment } from '../../environments/environment';
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


@Component({
  selector: 'app-create-watson-profile-copy',
  imports: [
    // CommonModule,
    // MatButtonModule,
    // MatIconModule,
    // MatFormFieldModule,
    // MatInputModule,
    // FormsModule,
    // MatDatepickerModule,
    // MatSelectModule,
    // NgxMatSelectSearchModule,

  ],
  template: '',
  styles: '',
})
export class CreateWatsonProfileCopyComponent {
  trackByFn(index: number, item: string): any {
    return item || index;
  }
  // Data from Sales Lead
  watsonLead = {}
  // packageDesignList = []
  profileData = null
  mapProduct = {}
  mapPackage = {}
  mapJourneyProduct = {}
  // selectedPackageDesign = null
  previousKYJ = []
  newKYJ = []
  // Update JourneyProduct & Participant Product
  cancelledProducts = []
  productstoenable = []
  updatedJourneyID = null
  cancelJourneyID = null
  profileExist: boolean = false
  journeyPurchaseLabel: any = null
  addonPurchaseLabel: any = null
  participantList: any[] = []
  selectedParticipant: any = null
  filterParticipantName: string = ''
  totalPurchaseValue: number | null = null
  initialpaymentbalance: number | null = 0;
  pendingbalanceamount: number | null = 0;
  subscriptionStart: Date | null = null
  subscriptionEnd: Date | null = null
  purchaseHistoryList: any[] = []
  purchasedate: Date = null
  lastpaymentscheduledate = null;
  displayAddons = [];
  fullscreenActive = false;
  fullscreenImage = '';

  watsonDB

  get loading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: "loading..." }, disableClose: true })
  }
  constructor(public firestore: Firestore, private guard: AuthguardService, @Inject(MAT_DIALOG_DATA) public metadata: any, public dialogRef: MatDialogRef<CreateWatsonProfileCopyComponent>, public dialog: MatDialog, private ngZone: NgZone) {
    guard.initializeWatson().then(() => {
      this.watsonDB = getFirestore(getApp("watson"))
    })

    this.watsonLead = metadata["watsonlead"]
    // this.packageDesignList = metadata["packagedesign"]
    this.mapProduct = metadata["productmap"]
    this.mapPackage = metadata["packagemap"]
    this.mapJourneyProduct = metadata["journeyproductmap"]
    this.profileData = metadata["profiledata"]
    this.purchasedate = this.watsonLead['purchasedate'].toDate();
    this.totalPurchaseValue = this.watsonLead['totalpurchasevalue'];
    // if (this.watsonLead['journeytype'] == 'addons'){
    //   this.subscriptionStart = this.watsonLead['purchasedate'].toDate()
    //   this.subscriptionEnd = new Date(new Date(this.subscriptionStart.getFullYear(),this.subscriptionStart.getMonth() + this.watsonLead['journeytenure'],this.subscriptionStart.getDate()).setHours(this.subscriptionStart.getHours(),this.subscriptionStart.getMinutes(),this.subscriptionStart.getSeconds(),this.subscriptionStart.getMilliseconds()))
    //   this.returnKYJ();
    // }else{
    // if(this.watsonLead["packagedesignid"] != null){
    if (this.watsonLead['journey'] != null) {
      // this.journeyPurchaseLabel = this.watsonLead["packagedesignid"]
      this.journeyPurchaseLabel = this.watsonLead['purchaselabel']
      this.returnKYJ();
    }
    else if (this.watsonLead['addons'] != null) {
      // this.addonPurchaseLabel = this.watsonLead["packagedesignid"]
      this.addonPurchaseLabel = this.watsonLead['purchaselabel']
      this.returnKYJ();
    }
    // }
    // }

    this.guard.initializeWatson().then(async () => {
      const loadingRef = this.dialog.open(LoadingProgressComponent, { data: { msg: "loading..." }, disableClose: true })
      // firebaseapp.app('watson').firestore().collection("addproduct").onSnapshot((querysnapshot) => {
      //   this.productList = querysnapshot.docs.map(doc => doc.data())
      // })

      await getDocs(collection(this.watsonDB, "Participants")).then(async (allProfileSnap) => {
        // this.participantList = allProfileSnap.docs.map(e => e.data());
        for (let i = 0; i < allProfileSnap.docs.length; i++) {
          const element = allProfileSnap.docs[i];
          this.participantList.push(element.data());
        }
      });

      let email = this.watsonLead['email'].toLowerCase().trim();
      const participantid = this.watsonLead['watsonparticipantid'];
      // const paymentImage = ['new','upgraded','upgrade'].includes(this.watsonLead['type']) ? [decodeURIComponent(this.watsonLead['paymentsnapshot'][0])] : []
      // this.watsonLead['paymentsnapshot'] = paymentImage

      // fetching the participant data from watson
      await getDoc(doc(this.watsonDB, "Participants", participantid)).then(async profilesnap => {
        if (profilesnap.exists()) {

          this.selectedParticipant = profilesnap.data();
          this.profileExist = true;
          console.log(this.selectedParticipant);

          if (this.watsonLead['journeytype'] != 'new') {
            await getDocs(query(collection(this.watsonDB, "Payment Schedule"), where("participantid", "==", this.selectedParticipant['id']), orderBy("date", "desc"))).then((partcipantDoc) => {
              if (partcipantDoc.docs.length != 0) {
                if (this.watsonLead['installmentatend'] == true) {
                  this.watsonLead['installmentstartdate'] = partcipantDoc.docs[0].data()['date'];
                }
              }
            });

            // fetching the participant data from waston and fetching the purchase history from watson
            await getDocs(query(collection(this.watsonDB, "ParticipantPurchases"), where("participantid", '==', this.selectedParticipant['id']), orderBy('purchasedate', 'asc'))).then(async (participantPurchaseSnap) => {
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
          alert('Profile not found in watson');
        }
      });

      // if the journey type is new
      if (this.watsonLead['journeytype'] === 'new') {

        this.journeyPurchaseLabel = this.watsonLead['purchaselabel']

        this.subscriptionStart = this.subscriptionStart ?? this.purchasedate;
        this.subscriptionEnd = this.subscriptionEnd ?? new Date(new Date(this.subscriptionStart.getFullYear(), this.subscriptionStart.getMonth() + this.watsonLead['journeytenure'], this.subscriptionStart.getDate()).setHours(this.subscriptionStart.getHours(), this.subscriptionStart.getMinutes(), this.subscriptionStart.getSeconds(), this.subscriptionStart.getMilliseconds()))
        let email = this.watsonLead['email'].toLowerCase().trim();

        this.ngZone.run(() => {
          loadingRef.close();
        })
      } else if (this.watsonLead['journeytype'] === 'upgrade') {

        let participantjourneyproductid = this.watsonLead['upgradefromparticipantjourneyproductid'];
        await getDoc(doc(this.firestore, "participantjourneyproduct", participantjourneyproductid)).then((jppDoc) => {
          let calculatedate = this.watsonLead['subscriptionfrompurchasedate'] ? this.watsonLead['purchasedate'].toDate() : jppDoc.data()['subscriptionend'].toDate();

          this.subscriptionStart = this.watsonLead['purchasedate'].toDate();
          this.subscriptionEnd = this.subscriptionEnd ?? new Date(new Date(calculatedate.getFullYear(), calculatedate.getMonth() + this.watsonLead['journeytenure'], calculatedate.getDate()).setHours(calculatedate.getHours(), calculatedate.getMinutes(), calculatedate.getSeconds(), calculatedate.getMilliseconds()))
          this.ngZone.run(() => {
            loadingRef.close();
          });

        });

      } else if (this.watsonLead['journeytype'] == 'addons') {

        this.subscriptionStart = this.subscriptionStart ?? this.purchasedate
        this.subscriptionEnd = this.subscriptionEnd ?? new Date(new Date(this.subscriptionStart.getFullYear(), this.subscriptionStart.getMonth() + this.watsonLead['journeytenure'], this.subscriptionStart.getDate()).setHours(this.subscriptionStart.getHours(), this.subscriptionStart.getMinutes(), this.subscriptionStart.getSeconds(), this.subscriptionStart.getMilliseconds()));
        this.ngZone.run(() => {
          loadingRef.close();
        });

      } else if (this.watsonLead['journeytype'] === 'downgrade') {

        var date;
        let participantjourneyproductid = this.watsonLead['downgradefromparticipantjourneyproductid']
        await getDoc(doc(this.firestore, "participantjourneyproduct", participantjourneyproductid)).then((jppDoc) => {
          date = jppDoc.data()['subscriptionend'].toDate();
        });

        this.subscriptionStart = date;
        this.subscriptionEnd = this.subscriptionEnd ?? new Date(new Date(this.subscriptionStart.getFullYear(), this.subscriptionStart.getMonth() + this.watsonLead['journeytenure'], this.subscriptionStart.getDate()).setHours(this.subscriptionStart.getHours(), this.subscriptionStart.getMinutes(), this.subscriptionStart.getSeconds(), this.subscriptionStart.getMilliseconds()))

        this.ngZone.run(() => {
          loadingRef.close();
        });

      } else if (this.watsonLead['journeytype'] === 'cancelled') {

        var date;
        let participantjourneyproductid = this.watsonLead['journeytype'] == 'upgrade' ? this.watsonLead['upgradefromparticipantjourneyproductid'] : this.watsonLead['participantjourneyproductid']

        this.totalPurchaseValue = this.watsonLead['journeytype'] == 'cancelled' ? 0 : this.watsonLead['totalpurchasevalue']
        this.subscriptionStart = this.watsonLead['journeytype'] == 'cancelled' ? null : date;
        this.subscriptionEnd = this.watsonLead['journeytype'] == 'cancelled' ? null : this.subscriptionEnd ?? new Date(new Date(this.subscriptionStart.getFullYear(), this.subscriptionStart.getMonth() + this.watsonLead['journeytenure'], this.subscriptionStart.getDate()).setHours(this.subscriptionStart.getHours(), this.subscriptionStart.getMinutes(), this.subscriptionStart.getSeconds(), this.subscriptionStart.getMilliseconds()))
        this.ngZone.run(() => {
          loadingRef.close();
        });
      } else {
        this.ngZone.run(() => {
          loadingRef.close();
        });
      }
    });
  }

  ngOnInit(): void {
  }

  ngOnDestroy() {
  }

  async returnKYJ() {

    // if the journey type is new
    if (this.watsonLead['journeytype'] == 'new') {

      // fetching the journeydata for the new journey
      var journeyData = (await getDoc(doc(this.firestore, "journey", this.watsonLead["journey"])))
      getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyData.ref))).then((journeyProductDoc) => {
        if (journeyProductDoc.docs.length != 0) {
          for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
            const element = journeyProductDoc.docs[0].data()['product'][i];
            this.newKYJ.push({
              product: this.mapProduct[element.id],
              status: null,
              docid: element.id,
              package: journeyData.data()['journey']
            });
          }
        } else {
          alert("Please Map Products for this Journey")
        }
      });

      //Bonus displayed in KYJ
      if (this.watsonLead["bonus"].length != 0) {
        for (let i = 0; i < this.watsonLead["bonus"].length; i++) {
          const productElementRef = this.watsonLead["bonus"][i];
          this.newKYJ.push({
            product: this.mapProduct[productElementRef],
            status: null,
            docid: null,
            package: "Bonus"
          })
        }
      }

    }
    // if the journey type is upgrade
    else if (this.watsonLead['journeytype'] == 'upgrade') {
      console.log('journey type upgrade');

      //if carryover is true
      if (this.watsonLead['carryover'] == true) {

        console.log('carryover true');

        this.updatedJourneyID = this.watsonLead['upgradefromparticipantjourneyproductid']

        // fetching all the products if the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
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
          }
        });

        //fetching the journeydata for the new journey
        let journeyData;
        await getDoc(doc(this.firestore, "journey", this.watsonLead["journey"])).then((journey) => {
          if (journey.exists()) {
            journeyData = journey;
          }
        });

        // fetching the data of new journey
        getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyData.ref))).then((journeyProductDoc) => {
          console.log(journeyProductDoc.docs.length);
          for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
            const element = journeyProductDoc.docs[0].data()['product'][i];
            this.newKYJ.push({
              product: this.mapProduct[element.id],
              status: null,
              docid: element.id,
              package: journeyData.data()['journey']
            });
          }
        });

        //Bonus displayed in KYJ
        if (this.watsonLead["bonus"].length != 0) {
          for (let i = 0; i < this.watsonLead["bonus"].length; i++) {
            const productElementRef = this.watsonLead["bonus"][i];
            this.newKYJ.push({
              product: this.mapProduct[productElementRef],
              status: null,
              docid: null,
              package: "Bonus"
            })
          }
        }

      }
      // if carry over is false cancel all other existing products
      else {
        console.log('carryover false');

        this.updatedJourneyID = this.watsonLead['upgradefromparticipantjourneyproductid']

        // fetching all the products of the participant and cancelling the unconsumed products except addons
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
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
          }
        });

        // fetching the journey data for the new journey
        var journeyData = (await getDoc(doc(this.firestore, "journey", this.watsonLead["journey"])));

        // fetching the data of new journey
        await getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyData.ref))).then((journeyProductDoc) => {
          console.log(journeyProductDoc.docs.length);
          for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
            const element = journeyProductDoc.docs[0].data()['product'][i];
            this.newKYJ.push({
              product: this.mapProduct[element.id],
              status: null,
              docid: element.id,
              package: journeyData.data()['journey']
            });
          }
        });

        // sending the cancelled products back when the dialog box closes
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          if (existingproduct["status"] == "cancelled") {
            this.cancelledProducts.push(existingproduct["docid"])
          }
        }

        //Bonus displayed in KYJ
        if (this.watsonLead["bonus"].length != 0) {
          for (let i = 0; i < this.watsonLead["bonus"].length; i++) {
            const productElementRef = this.watsonLead["bonus"][i];
            this.newKYJ.push({
              product: this.mapProduct[productElementRef],
              status: null,
              docid: null,
              package: "Bonus"
            })
          }
        }

      }

    } else if (this.watsonLead['journeytype'] == 'downgrade') {

      if (this.watsonLead['downgradetonewpurchase']) {

        console.log('Downgrade to new Journey..');

        this.cancelJourneyID = this.watsonLead['participantjourneyproductid']

        // products to cancel
        var localarray = [];
        await getDoc(doc(this.firestore, "participantjourneyproduct", this.watsonLead['downgradefromparticipantjourneyproductid'])).then((pjpDoc) => {
          for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
            const product = pjpDoc.data()['participantproducts'][i];
            localarray.push(product['participantproductid']);
          }
        });
        // products to cancel

        // // products to enable
        // var localarray2 = [];
        // await this.firestore.collection("participantjourneyproduct").doc(this.watsonLead['downgradetoparticipantjourneyproductid']).get().toPromise().then((pjptoDoc)=>{
        //   for (let i = 0; i < pjptoDoc.data()['participantproducts'].length; i++) {
        //     const product = pjptoDoc.data()['participantproducts'][i];
        //     localarray2.push(product['participantproductid']);
        //   }
        // });
        // // products to enable

        //get all the products of the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
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
          }
        });
        //get all the products of the participant

        // fetching the journey data for the new journey

        var journeyData = (await getDoc(doc(this.firestore, "journey", this.watsonLead["journey"])));


        // fetching the journey data for the new journey
        getDocs(query(collection(this.firestore, "journey-to-product"), where("journey", "==", journeyData.ref))).then((journeyProductDoc) => {

          for (let i = 0; i < journeyProductDoc.docs[0].data()['product'].length; i++) {
            const element = journeyProductDoc.docs[0].data()['product'][i];
            this.newKYJ.push({
              product: this.mapProduct[element.id],
              status: null,
              docid: element.id,
              package: journeyData.data()['journey']
            });
          }
        });

        // products to cancel send to saleslead after closing the dialog box
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          if (existingproduct["status"] == "cancelled") {
            this.cancelledProducts.push(existingproduct["docid"])
          }
        }

      } else if (!this.watsonLead['downgradetonewpurchase']) {

        console.log('Downgrade to existing Journey..');

        this.cancelJourneyID = this.watsonLead['downgradefromparticipantjourneyproductid']
        this.journeyPurchaseLabel = this.watsonLead['purchaselabel']

        // mapping all the products for the participant
        var participantProductMap = {}
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]))).then((ppDoc) => {
          console.log(ppDoc.docs.length);

          for (let i = 0; i < ppDoc.docs.length; i++) {
            const element = ppDoc.docs[i];
            participantProductMap[element.id] = element.data()
          }
        });

        var enableProducts = [];
        //product to enable
        await getDoc(doc(this.firestore, "participantjourneyproduct", this.watsonLead['downgradetoparticipantjourneyproductid'])).then((pjpDoc) => {
          for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
            const products = pjpDoc.data()['participantproducts'][i];
            if (participantProductMap[products['participantproductid']] != null) {
              if (participantProductMap[products['participantproductid']]['status'] == 'cancelled') {
                enableProducts.push(products['participantproductid']);
                this.productstoenable.push(products['participantproductid'])
              }
            }
          }
        });

        // products to cancel
        var cancelProducts = [];
        await getDoc(doc(this.firestore, "participantjourneyproduct", this.watsonLead['downgradefromparticipantjourneyproductid'])).then((pjpDoc) => {
          for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
            const product = pjpDoc.data()['participantproducts'][i];
            if (participantProductMap[product['participantproductid']]['status'] == null) {
              cancelProducts.push(product['participantproductid']);
            }
          }
        });

        //get all the products of the participant
        await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
          for (let i = 0; i < participantproduct.docs.length; i++) {
            const product = participantproduct.docs[i].data();

            this.previousKYJ.push({
              product: this.mapProduct[product["productref"].id],
              status: product["status"],
              docid: product["docid"],
              package: this.mapPackage[product["packageref"]?.id]
            });

            // enable the products and display in KYJ
            if (enableProducts.includes(product['docid'])) {

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
          }
        });
        // get all the products of the participant

        // products to cancel send to saleslead after closing the dialog box
        for (let i = 0; i < this.newKYJ.length; i++) {
          const existingproduct = this.newKYJ[i];
          if (existingproduct["status"] == "cancelled") {
            this.cancelledProducts.push(existingproduct["docid"])
          }
        }

      }

    } else if (this.watsonLead['journeytype'] == 'addons') {

      // fetching all the products for the participant
      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
        for (let i = 0; i < participantproduct.docs.length; i++) {
          const product = participantproduct.docs[i].data();

          var obj = {
            product: this.mapProduct[product["productref"].id],
            status: product["status"],
            docid: product["docid"],
            package: this.mapPackage[product["packageref"]?.id]
          }

          this.previousKYJ.push(obj);
          this.newKYJ.push(obj);
        }
      });

      // adding the addon in KYJ
      this.newKYJ.push({
        product: this.mapProduct[this.watsonLead['addons']],
        status: null,
        docid: this.watsonLead['addons'],
        package: this.mapPackage['Mq5yQNg4mXMgyPQG9nqJ']
      });

    } else if (this.watsonLead['journeytype'] == 'cancelled') {

      this.cancelJourneyID = this.watsonLead['participantjourneyproductid']

      // mapping all the products for the participant
      var participantProductMap = {}
      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]))).then((ppDoc) => {
        for (let i = 0; i < ppDoc.docs.length; i++) {
          const element = ppDoc.docs[i];
          participantProductMap[element.id] = element.data()
        }
      });

      // products to cancel
      await getDoc(doc(this.firestore, "participantjourneyproduct", this.watsonLead['participantjourneyproductid'])).then((pjpDoc) => {
        if (pjpDoc.data()['participantproducts'].length != 0) {
          for (let i = 0; i < pjpDoc.data()['participantproducts'].length; i++) {
            const product = pjpDoc.data()['participantproducts'][i];
            if (participantProductMap[product['participantproductid']]['status'] == null) {
              this.cancelledProducts.push(product['participantproductid'])
            }
          }
        }
      });

      await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.profileData["profileid"]), orderBy("sequenceorder"))).then(participantproduct => {
        for (let i = 0; i < participantproduct.docs.length; i++) {
          const product = participantproduct.docs[i].data();

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
        }
      });

      // sending the cancelled products back to cancel
      for (let i = 0; i < this.newKYJ.length; i++) {
        const existingproduct = this.newKYJ[i];
        if (existingproduct["status"] == "cancelled") {
          this.cancelledProducts.push(existingproduct["docid"])
        }
      }

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
  submitValidation(): boolean {
    let validated: boolean = true

    if (this.watsonLead['journeytype'] === 'new') {
      // if(this.profileExist === false){
      if (this.journeyPurchaseLabel != null) {
        if (this.watsonLead['addons'].length === 0) {
          if (this.addonPurchaseLabel == null) {
            validated = false
          }
        }
      }
      // }
    } else if (this.watsonLead['journeytype'] === 'upgrade') {
      if (this.watsonLead['journey'] != null) {
        if (this.journeyPurchaseLabel != null) {
          if (this.selectedParticipant != null) {
            if (this.watsonLead['addons'].length === 0) {
              if (this.addonPurchaseLabel === null) {
                validated = false
              }
            }
          }
        }
      } else {
        if (this.selectedParticipant != null) {
          if (this.watsonLead['addons'].length != 0) {
            if (this.addonPurchaseLabel != null) {
              if (this.journeyPurchaseLabel === null) {
                validated = false
              }
            }
          }
        }
      }
    } else if (this.watsonLead['journeytype'] === 'downgrade') {

      if (this.watsonLead['journey'] != null) {
        if (this.journeyPurchaseLabel != null) {
          if (this.selectedParticipant != null) {
            validated = false
          }
        }
      }

    } else if (this.watsonLead['journeytype'] === 'addons') {
      // for (let i = 0; i < this.watsonLead['addons'].length; i++) {
      //   const element = this.watsonLead['addons'][i];
      if (this.watsonLead['totalpurchasevalue'] == null) {
        validated = true
      } else if (this.watsonLead['purchaselabel'] == null) {
        validated = true
      } else if (this.watsonLead['installmentamount'] == null) {
        validated = true
      } else {
        validated = false
      }
      // }
    } else if (this.watsonLead['journeytype'] === 'cancelled') {
      validated = false;
    }
    if (this.watsonLead['initialpaymentapproved'] == true) {
      validated = false;
    } else if (this.watsonLead['initialpaymentapproved'] == false) {
      validated = true;
    }
    return validated
  }

  initialPayment() {

    var users = []
    if (environment.firebase.projectId == "fir-sample-aae4a") {
      users = [
        "1NYb4aGqlhZizzXJhU7Ftl5zwTj2",
        "9df7NVWmpSRghdXnec2L79uimWb2",
        "sj4qVoFmLOcIrTgzNMEOOvBI8gJ3",
        "Hgpmo3A60YQaopUFdywl59jXNpX2",
        "2OgWzhcPlCfi8JfLQ8B9CySZM6i2",
        "CVDvaiO0kYNCezw6wodyt2bsrrt2"
      ];
    } else if (environment.firebase.projectId == "starlabs-test") {
      users = [
        "AabsqwYdW4PMZEhKUlPmKU4lF0g2", // Vignesh
        "GcYv0Y8LGsTT34hJfiQFSS2Yoy92", // Ragavendhiren
      ]
    }
    console.log(this.guard.uid);

    if (users.includes(this.guard.uid)) {

      var check = confirm("Are you sure want to Approve the Initial Paymment of Amount : " + this.watsonLead['initialpayment'] + ' Payment ID : ' + this.watsonLead['paymentid']);

      if (check) {
        const loading = this.loading;
        updateDoc(doc(this.firestore, "salesleads", this.watsonLead['docid']), {
          initialpaymentapproved: this.watsonLead['initialpaymentapproved'] == true ? false : true
        }).then(() => {
          console.log("Approved Initial Payment");
          this.guard.openSnackBar("Initial Payment Approved Successfully", "OK")
          this.ngZone.run(() => {
            loading.close();
            this.dialogRef.close(null);
          });
        }).catch((error) => {
          console.log("Error while Approving Initial Payment", error);
          this.guard.openSnackBar("Error while Approving Initial Payment", "OK")
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

  onSubmit() {

    this.ngZone.run(() => {
      this.dialogRef.close({
        data: 'submit',
        // purchaselabel: this.selectedPackageDesign, //this.journeyPurchaseLabel ?? this.addonPurchaseLabel,
        purchaselabel: this.journeyPurchaseLabel ?? this.addonPurchaseLabel, // purchase label
        selectedParticipant: this.selectedParticipant, //participant data
        subscriptionstart: this.subscriptionStart, // subscription start date
        subscriptionend: this.subscriptionEnd, //subscription end date
        totalpurchasevalue: this.totalPurchaseValue, // total purchase value
        productstocancell: this.cancelledProducts, // products to cancell
        productstoenable: this.productstoenable, //products to enable
        upgradedjourney: this.updatedJourneyID, //journey document id to mark the status as upgraded
        canceljourney: this.cancelJourneyID, //journey document id to mark the status as cancelled
        initialpaymentbalance: this.initialpaymentbalance, // initial payment balance by admin
        pendingbalanceamount: this.pendingbalanceamount // watson pendingbalanceamount by admin
      });
    });
  }

}
