import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionData, collectionSnapshots, doc, Firestore, getDoc, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule, Location } from '@angular/common';
import { getApp } from '@angular/fire/app';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-journeyplan',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatIconModule,

  ],
  templateUrl: './journeyplan.component.html',
  styleUrl: './journeyplan.component.css'
})
export class JourneyplanComponent {

  loading = false
  profileRoles = {}
  mapProductDeliveryType = {}
  mapProductDelivery = {}
  packageList = []
  productList = []
  mapProduct = {}
  clientdata = {}
  statuslist = ["Initiated", "Ongoing", "Completed", "Cancelled", "Shifted", "Upgraded"]
  productHeader: string[] = ['productref', 'packageref', 'minimumpayment', 'remainingamount', 'tentativestart'];
  productData: MatTableDataSource<any> = new MatTableDataSource();
  requiredField = ["productref", 'packageref', 'minimumpayment']
  activejourney
  participantProductList = []
  participantjourneyid
  totalpaid = 0
  profileid
  profileData: unknown;
  watsonScheduleList = []
  currentMonth: any;
  endMonth: number;
  currentYear: number;
  cumulativeTotals: any = [];
  private subscription = new Subject<void>();
  watsonDatabase;
  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private guard: AuthguardService,
    private dialog: MatDialog,
    private location: Location
  ) {
    this.loading = true;
    guard.getRoles().then(async roles => {
      this.profileRoles = roles;

      var clientpid = this.route.snapshot.params['pid'].split('&')[0];
      this.profileid = clientpid;
      console.log(clientpid, 'clientpid');

      // console.log(this.route.snapshot.params.pid);
      // console.log(this.participantjourneyid, 'participantjourneyid');
      await getDoc(doc(this.firestore, "profile_data", clientpid)).then(client => {
        this.clientdata = client?.data() ?? {}
      });
      getDoc(doc(this.firestore, "participant metadata", clientpid)).then(snap => {
        this.totalpaid = parseInt(snap.data()['pp_totalpaid'])
      });
      await this.participantProducts();
    });
  }

  ngOnInit(): void {
    getDocs(query(collection(this.firestore, "products"), orderBy("product"))).then(product => {
      var list = []
      for (let i = 0; i < product.docs.length; i++) {
        const doc = product.docs[i];
        const data = doc.data()
        this.mapProduct[doc.id] = data
        list.push({
          docid: doc.id,
          product: data["product"]
        });
      }
      this.productList = list
    });
    getDocs(query(collection(this.firestore, "package"), orderBy("package"))).then(packages => {
      this.packageList = packages.docs.map(e => e.data())
    });
    getDocs(collection(this.firestore, "productToDeliverySequence")).then(productdelivery => {
      for (let i = 0; i < productdelivery.docs.length; i++) {
        const product = productdelivery.docs[i];
        const data = product.data()
        this.mapProductDeliveryType[data["product"].id] = (data["deliveryoptions"] ?? []).map(e => e["deliverytype"])
      }
      // console.log(this.mapProductDeliveryType)
    });

    this.watsonParticipantSchedule();
    this.currentMonth = new Date().getMonth();
  }

  formatDate(date: any): string {
    if (!date) return '';
    // Convert to yyyy-MM-dd format required by input[type="date"]
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  updateDate(event: any, row): void {
    const value = event.target.value;
    row.tentativestart = value ? new Date(value) : null;
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.productData.data, event.previousIndex, event.currentIndex);
    this.productData.data = this.productData.data
  }

  /*
  addNewProduct(){
    this.productData.data.push({
      productref: null,
      packageref: null,
      minimumpayment: null,
      subscriptionstart: null,
      subscriptionend: null,
      tentativestart: null,
      delivery: [],
      docid: null
    })
    this.productData.data = this.productData.data
  }
  */

  async participantProducts() {
    getDoc(doc(this.firestore, "participantdeliverysequence", this.clientdata["profileid"])).then(sequence => {
      if (sequence.exists()) {
        var products = sequence.data()["products"] ?? []
        for (let i = 0; i < products.length; i++) {
          const element = products[i];
          this.mapProductDelivery[element["participantproductid"]] = element["delivery"] ?? []
        }
      }
    });
    collectionData(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.clientdata["profileid"]), orderBy('sequenceorder', 'asc'))).pipe(takeUntil(this.subscription)).subscribe(deliveryproduct => {
      var productList = []
      var cumulativeMinimumPayment = 0;
      for (let i = 0; i < deliveryproduct.length; i++) {
        const productDoc = deliveryproduct[i];
        if (!['cancelled', 'completed'].includes(productDoc['status'])) {

          const productData = productDoc;
          productData["minimumpayment"] = [null, undefined].includes(productData["minimumpayment"]) ? this.mapProduct[productData["productref"]?.id]?.minimumrequiredamount : productData["minimumpayment"]
          const currentPayment = typeof productData["minimumpayment"] === "number" ? productData["minimumpayment"] : parseInt(productData["minimumpayment"] ?? "0");
          // cumulativeMinimumPayment += currentPayment;
          
          // if (cumulativeMinimumPayment <= this.totalpaid) {
          //   productData['remainingamount'] = 0; 
          // } else {
          //   productData['remainingamount'] = cumulativeMinimumPayment - this.totalpaid; 
          // }
          console.log("productData", productData);

          productData['remainingamount'] = productData["minimumpayment"] - this.totalpaid
          productData["productref"] = productData["productref"]?.id
          productData["packageref"] = productData["packageref"]?.id
          productData['subscriptionstart'] = productData['subscriptionstart']?.toDate() ?? null
          productData['subscriptionend'] = productData['subscriptionend']?.toDate() ?? null
          productData['tentativestart'] = productData['tentativestart']?.toDate() ?? null

          // if (productData["minimumpayment"] == null) { // Check for both null and undefined
          //   const minimumRequiredAmount = this.mapProduct[productData["productref"]?.id]?.minimumrequiredamount;
          //   productData["minimumpayment"] = minimumRequiredAmount !== undefined ? minimumRequiredAmount : null;
          // }
          var statuskey = Object.keys(productData["statusdate"] ?? {})
          for (let j = 0; j < statuskey.length; j++) {
            const key = statuskey[j];
            productData["statusdate"][key] = productData["statusdate"][key].toDate()
          }
          productList.push(productData);
        }
      }
      productList.sort((a, b) => a["sequenceorder"] - b["sequenceorder"])
      this.productData.data = productList;
      this.loading = false;

    });
  }

  validateFields(products: Array<any>): boolean {
    var value: boolean = true
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      for (let a = 0; a < this.requiredField.length; a++) {
        const field = this.requiredField[a];
        if ((product[field] ?? null) == null) {
          value = false
          i = products.length + 1
          alert("Product, Package, Minimum Payment and Subscription Date are required for Every Product")
          break;
        }
      }
      if (product["status"] == "initiated" && (this.mapProductDelivery[product["docid"]] ?? []).length == 0 && (product["deliverytype"] == null || product["deliverytype"] == undefined)) {
        value = false
        alert("Select Delivery Type for Initiated Product")
        break;
      }
    }
    return value
  }

  async updateProducts() {
    var productSequence = []
    // var cumulativeMinimumPayment = 0;
    console.log("product data", this.productData.data);
    
    this.productData.data.forEach(e => {
      console.log("date", new Date(e['tentativestart']));
      
      productSequence.push(Object.assign({}, e))
    })

    if (this.validateFields(productSequence)) {
      var loading = this.dialog.open(LoadingProgressComponent, {
        disableClose: true,
        data: {
          msg: "Updating Detail....."
        }
      })
      var totalwrite = 0
      var productDataList = []
      for (let i = 0; i < productSequence.length; i++) {
        const product = productSequence[i];

        var statusdate = product["statusdate"] ?? {}
        if (product["status"] != null) {
          if (statusdate[product["status"]] == null || statusdate[product["status"]] == undefined) {
            statusdate[product["status"]] = new Date()
          }
        }
        product["docid"] = (product["docid"] == null) ? doc(collection(this.firestore, 'participantsproduct')).id : product["docid"]
        var productData = {
          docid: product["docid"],
          profileid: this.clientdata["profileid"],
          productref: doc(this.firestore, "products", product["productref"]),
          packageref: doc(this.firestore, "package", product["packageref"]) ?? null,
          minimumpayment: product['minimumpayment'] ?? null,
          subscriptionstart: product["subscriptionstart"] ?? null,
          subscriptionend: product['subscriptionend'] ?? null,
          tentativestart: [null, undefined, ""].includes(product['tentativestart']) ? null : new Date(product['tentativestart']),
          status: product['status'] ?? null,
          statusdate: statusdate,
          sequenceorder: i,
          unlimited: this.mapProduct[product["productref"]]["unlimited"] ?? false
        }
        if (product["status"] == "initiated" && (product["delivery"] ?? []).length == 0) {
          productData["deliverytype"] = product['deliverytype'] ?? null
        }
        productDataList.push(productData)
      }
      console.log(productSequence)
      await this.guard.updateDeliverySequence(this.clientdata["profileid"], productSequence).catch(err => {
        console.log(err)
      })
      console.log(productDataList)
      for (let i = 0; i < productDataList.length; i++) {
        const productData = productDataList[i];
        setDoc(doc(this.firestore, "participantsproduct", productData["docid"]), productData, { merge: true }).then(async () => {
          totalwrite += 1
          if (totalwrite == productDataList.length) {
            loading.close()
            this.location.back()
          }
        }).catch(err => {
          loading.close()
          console.log(err)
        })
      }
      // update minimum payment to participantjpurneyproduct
      console.log(this.participantjourneyid, 'this.participantjourneyid');

      // if(![null,undefined].includes(this.participantjourneyid)){
      // console.log(this.participantjourneyid, 'partcreatestudioconversationicipantjourneyid');
      var participantProductList = []
      // var totalpaid
      await getDocs(query(collection(this.firestore, "participantsproduct"), where('profileid', '==', this.clientdata["profileid"]))).then(products => {
        products.docs.forEach(e => {
          participantProductList.push(e.data())
        })
      })
      // await this.firestore.collection('participantdashboard').doc(this.clientdata["profileid"]).get().toPromise().then(snap => {
      //   totalpaid = parseInt(snap.data()['pp_totalpaid'])
      // })
      // var profileProduct = participantProductList.filter(product => product["profileid"] == this.clientdata["profileid"]).sort((a, b) => a["sequenceorder"] - b["sequenceorder"])
      // var minimumpayment = 0
      // for (let b = 0; b < profileProduct.length; b++) {
      //   const product = profileProduct[b];
      //   if(product["status"] == "completed"){
      //     minimumpayment += typeof product["minimumpayment"] == "number" ? product["minimumpayment"] : parseInt(product["minimumpayment"] ?? "0")
      //   }
      //   else if(product["status"] == null){
      //     minimumpayment += typeof product["minimumpayment"] == "number" ? product["minimumpayment"] : parseInt(product["minimumpayment"] ?? "0")
      //     break;
      //   }
      // }
      // console.log(minimumpayment, 'minimumpayment');
      var profileProduct = participantProductList.filter(product => product["profileid"] == this.clientdata["profileid"]).sort((a, b) => a["sequenceorder"] - b["sequenceorder"]);

      var minimumpayment = 0;
      for (let b = 0; b < profileProduct.length; b++) {
        const product = profileProduct[b];
        if (product["status"] == null) {
          minimumpayment = typeof product["minimumpayment"] == "number"
            ? product["minimumpayment"]
            : parseInt(product["minimumpayment"] ?? "0");
          break; // Stop after finding the first product with null status
        }
      }

      console.log(minimumpayment, 'minimumpayment');
      await updateDoc(doc(this.firestore, "participant metadata", this.profileid), {
        minimumpayment: minimumpayment
      }).then(() => {
        alert("Journey plan updated Successfully")
      })
      // }
    }
  }

  async watsonParticipantSchedule() {
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.guard.initializeWatson().then(async () => {
      this.profileid = this.route.snapshot.params['pid'].split('&')[0]
      await getDoc(doc(this.firestore, "profile_data", this.profileid)).then(profile => {
        this.profileData = profile.data()
        // console.log(this.profileData, 'profileData');
        this.guard.initializeWatson().then(() => {
          this.watsonDatabase = getFirestore(getApp("watson"))
          getDocs(collection(this.watsonDatabase, "Participants")).then(async participant => {
            var participantid = null
            for (let i = 0; i < participant.docs.length; i++) {
              const doc = participant.docs[i];
              const participantdata = doc.data()
              // console.log(participantdata, 'participantdata');

              if (participantdata["name"]?.toLowerCase().replace(/\s/g, "") == this.profileData["name"]?.toLowerCase().replace(/\s/g, "") || participantdata["email"]?.toLowerCase().replace(/\s/g, "") == this.profileData["email"]?.toLowerCase().replace(/\s/g, "")) {
                participantid = participantdata["id"]
                break;
              }
            }
            if (participantid == null) {
              alert("unable to find Client in Watson")
            }
            else {
              console.log("working.....");

              getDocs(query(collection(this.watsonDatabase, "Payment Schedule"), where('participantid', '==', participantid), orderBy('date', 'asc'))).then((schedule) => {
                // this.watsonScheduleList = schedule.docs.map((e) => e.data()).filter((e) => e['schedulemodified'] != true);
                this.watsonScheduleList = schedule.docs.map((e) => e.data()).filter((e) => e['schedulemodified'] != true);
                let runningTotal = 0;
                this.watsonScheduleList.forEach(schedule => {
                  runningTotal += (schedule.amount / 1.18); // Calculate the amount before GST
                  this.cumulativeTotals.push(runningTotal);
                  // console.log(this.cumulativeTotals, 'this.cumulativeTotals');

                });
                console.log(this.watsonScheduleList, 'this.watsonScheduleList');
              });
            }
          })
        })
      })
    })
  }





  /*
  async participantProducts(){
    await this.firestore.collection("participantdeliverysequence").doc(this.clientdata["profileid"]).get().toPromise().then(deliveryproduct=>{
      if(deliveryproduct.exists){
        var products = deliveryproduct.data()["products"] ?? []
        for (let i = 0; i < products.length; i++) {
          const element = products[i];
          element["productref"] = element["productref"]?.id
          element["packageref"] = element["packageref"]?.id
          element['subscriptionstart'] = element['subscriptionstart']?.toDate() ?? null
          element['subscriptionend'] = element['subscriptionend']?.toDate() ?? null
          element['tentativestart'] = element['tentativestart']?.toDate() ?? null
          var statuskey = Object.keys(element["statusdate"] ?? {})
          for (let j = 0; j < statuskey.length; j++) {
            const key = statuskey[j];
            element["statusdate"][key] = element["statusdate"][key].toDate()
          }

        }
        this.productData.data = products
      }
      else{
        alert("No Participant Delivery Sequence Found!")
      }
    })
  }

  async updateProducts(){
    var data = []
    this.productData.data.forEach(e => {
      data.push(Object.assign({}, e))
    })
    console.log(data)
    var requiredProductField = data.map(e => e["productref"] == null || e["packageref"] == null || e["minimumpayment"] == null || e["subscriptionstart"] == null || e["subscriptionend"] == null)
    var initiatedWithNoDelivery = data.map(e => e["status"] == "initiated" && (e["delivery"] ?? []).length == 0 && (e["deliverytype"] == null || e["deliverytype"] == undefined))
    if(initiatedWithNoDelivery.filter(e => e).length != 0){
      alert("Please add Delivery Option for the Initiated Products")
    }
    else if(requiredProductField.filter(e => e).length != 0){
      alert("Please Provide required product data")
    }
    else{
      var loading = this.dialog.open(LoadingProgressComponent, {
        disableClose: true,
        data: {
          msg: "Updating Detail....."
        }
      })
      var totalwrite = 0
      for (let i = 0; i < data.length; i++) {
        const product = data[i];
        product["sequenceorder"] = i
        product['tentativestart'] = product['tentativestart'] ?? null
        product["productref"] = this.firestore.collection("products").doc(product["productref"]).ref
        product["packageref"] = this.firestore.collection("package").doc(product["packageref"]).ref
        var statusdate = product["statusdate"] ?? {}
        if(product["status"] != null){
          if(statusdate[product["status"]] == null || statusdate[product["status"]] == undefined){
            statusdate[product["status"]] = new Date()
          }
        }
        var productData = {
          packageref: product["packageref"] ?? null,
          subscriptionstart: product["subscriptionstart"] ?? null,
          subscriptionend: product['subscriptionend'] ?? null,
          tentativestart: product['tentativestart'] ?? null,
          minimumpayment: product['minimumpayment'] ?? null,
          status: product['status'] ?? null,
          statusdate: statusdate,
          sequenceorder: i,
        }
        if(product["participantproductid"] == null){
          var newID = this.firestore.createId()
          productData["docid"] = newID
          product["participantproductid"] = newID
          productData["purchasedetailref"] = null
          product["purchasedetailref"] = productData["purchasedetailref"]
          productData["purchaseref"] = null
          product["purchaseref"] = productData["purchaseref"]
          productData["unlimited"] = this.mapProduct[product["productref"].id]["unlimited"] ?? false
          product["unlimited"] = productData["unlimited"]
          productData["productref"] = product["productref"]
          productData["profileid"] = this.clientdata["profileid"]
        }

        if(product["status"] == "initiated" && (product["delivery"] ?? []).length == 0){
          productData["deliverytype"] = product['deliverytype'] ?? null
        }
        console.log(productData)
        this.firestore.collection("participantsproduct").doc(product["participantproductid"]).set(productData, {merge: true}).then(async ()=>{
          totalwrite += 1
          if(totalwrite == data.length){
            await this.firestore.collection("participantdeliverysequence").doc(this.clientdata["profileid"]).update({
              products: data
            })
            loading.close()
            this.location.back()
          }
        })
      }
      console.log(data)
    }
  }
  */

  /*

  displayedColumns: string[] = ['productref', 'packageref', 'subscriptionstart', 'subscriptionend', 'tentativestartdate', 'status', 'minimumpayment'];
  dataSource:MatTableDataSource<any> = new MatTableDataSource();
  tabledata = []

  //mapping
  profileid:any;
  profiledata:any;
  mapProduct:any = null;
  mapPackage:any = null;
  statusList = ["Initiated", "Ongoing", "Completed", "Cancelled", "Shifted", "Upgraded"]

  //loading
  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:'Processing Please wait ...'}})
  }

  constructor(private firestore : AngularFirestore,private route : ActivatedRoute,private auth : AuthguardService,private dialog:MatDialog){
    this.profileid = this.route.snapshot.params.pid
    this.firestore.collection('participantsproduct',ref => ref.where('profileid','==',this.profileid)).get().toPromise().then(async profilesnap => {
      await this.auth.getProductMap().then(e => this.mapProduct = e)
      await this.auth.getPackageMap().then(e => this.mapPackage = e)
      this.tabledata = []
      for (let i = 0; i < profilesnap.docs.length; i++) {
        const element = profilesnap.docs[i].data()
        element['subscriptionstart'] = element['subscriptionstart'] != null ? element['subscriptionstart'].toDate() : null
        element['subscriptionend'] = element['subscriptionend'] != null ? element['subscriptionend'].toDate() : null
        element['tentativestartdate'] = element['tentativestartdate'] != null ? element['tentativestartdate'].toDate() : null
        element['status'] = element['status'] != null ? element['status'] : null
        element['minimumpayment'] = element['minimumpayment'] != null ? element['minimumpayment'] : null
        this.tabledata.push(element)
      }
      console.log(this.tabledata);
      this.dataSource.data = this.tabledata 
    })
  }

  ngOnInit(): void {
    this.firestore.collection('profile_data').doc(this.profileid).get().toPromise().then(async snap => {
      this.profiledata = snap.data()
    })
 
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.tabledata,event.previousIndex, event.currentIndex);
    this.dataSource.data = this.tabledata
  }

  async onSubmit(data){
    console.log(data);
    if(confirm('are you sure want to update')){
      let loadingref = this.loading
      for (let i = 0; i < data.length; i++) {
        const element = data[i];
        await this.firestore.collection('participantsproduct').doc(element['docid']).update(element).then(() => {
          console.log(i,"document successfully updated");
        }).catch(err => {
          console.log(err);
        })
      }
      // await this.firestore.collection('participantdeliverysequence').doc(this.profileid).update({
      //   products : data
      // }).then(() => {
      //   console.log("participant delivery sequence updated");
        loadingref.close()
      // }).catch(err => {
      //   console.log(err);
      // })
    }
  } 
*/
}




// var productremainingamount = this.totalpaid - productSequence[i - 1]['minimumpayment']
// var currentproductremainingamount = productremainingamount - product['minimumpayment']