import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CdkDragDrop, CdkDropList, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { getApp } from 'firebase/app';
import { Location } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';


interface purchaseProduct {
  productref: any
  packageref: any
  minimumpayment: any
  tentativestart: any
  status: any
  unlimited: any
  participantproductid: any
  deliverytype: any
}

interface ParticipantPurchase {
  purchasetype: any
  participantjourneyproductref: any
  journeystatus: any
  purchaseref: any
  subscriptionstart: any
  subscriptionend: any
  journeyref: any
  productref: any
  watsonpurchaseid: any
  watsonpurchaselabel: any
  purchasedate: any
  products: Array<purchaseProduct>
}


@Component({
  selector: 'app-journey-product-purchase',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    CommonModule,
    MatMenuModule,
    MatPaginatorModule,
    RouterModule,
    MatButtonModule,
    FormsModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatDividerModule,
    CdkDropList,
    DragDropModule
  ],
  templateUrl: './journey-product-purchase.component.html',
  styleUrl: './journey-product-purchase.component.css'
})
export class JourneyProductPurchaseComponent {

  reviewMode:boolean = false
  participantProductList = []
  validationMode:boolean = false
  // "watsonpurchaseid",
  requiredJourneyKey = ["subscriptionstart", "subscriptionend"]
  requiredProductKey = ["productref", "packageref"]
  journeySubscription: Subscription
  packageSubscription: Subscription
  productSubscription: Subscription
  journeyList = []
  allpackageList = []
  addonpackageList = []
  productList = []
  mapJourney = {}
  mapPackage = {}
  mapProduct = {}
  mapJourneyToProduct = {}
  journeystatusOption = ['Initiated', 'Ongoing', 'Completed', 'Cancelled', 'Shifted', 'Upgraded', 'Downgraded', 'Closed Lost']
  productstatusOption = ['Initiated', 'Ongoing', 'Completed', 'Cancelled', 'Shifted']
  watsonPurchaseList = []
  profileid
  profileData = {}
  // participantJourneyProducts:Array<purchaseJourney> = []
  mapParticipantProducts = {
    null: {
      docid: null,
      productref: null,
      packageref: null,
      minimumpayment: null,
      tentativestart: null,
      status: null,
      sequenceorder: 1000
    }
  }
  participantPurchase:Array<ParticipantPurchase> = []
  loadingWidget: MatDialogRef<any>
  documentToDelete = []
  mapProductDeliveryType = {}
  // mapProductDelivery = {}
  mapMinimumRequiredAmount:any = {}
  watsonDatabase: any;

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    public firestore: Firestore,
    public guard: AuthguardService,
    public dialog: MatDialog,
    public location: Location
  ) {

    this.guard.initializeWatson().then(()=>{
      this.watsonDatabase = getFirestore(getApp("watson"))
    })

    this.watsonParticipantPurchase()
    route.params.subscribe(async param=>{
      this.loadingWidget = this.loadingDialog("Loading ...")
      this.profileid = param['pid']
      console.log(this.profileid)
      await this.fetchPurchase()
      this.loadingWidget?.close()
    })
  }


  ngOnInit(): void {
    this.journeySubscription = collectionData(query(collection(this.firestore, "journey"), orderBy("journey"))).subscribe(journey =>{
      this.journeyList = journey
      for (let i = 0; i < journey.length; i++) {
        const value = journey[i]
        this.mapJourney[value["id"]] = value["journey"];     
      }
    })
    this.productSubscription = collectionData(query(collection(this.firestore,"products"), orderBy("product"))).subscribe(product =>{
      this.productList = product
      for (let i = 0; i < product.length; i++) {
        const value = product[i]
        this.mapProduct[value["id"]] = value["product"];
        this.mapMinimumRequiredAmount[value["id"]] = value["minimumrequiredamount"]
      }
    })
    this.packageSubscription = collectionData(query(collection(this.firestore,"package"), orderBy("package"))).subscribe(packagelist =>{
      this.allpackageList = packagelist
      var addonOption = []
      for (let i = 0; i < packagelist.length; i++) {
        const value = packagelist[i]
        this.mapPackage[value["docid"]] = value["package"];
        if(value["nonjourney"] ?? false){
          addonOption.push(value)
        }
      }
      this.addonpackageList = addonOption
    })
    getDocs(collection(this.firestore,'journey-to-product')).then(productmap=>{
      for (let i = 0; i < productmap.docs.length; i++) {
        const journeyToProduct = productmap.docs[i].data();
        this.mapJourneyToProduct[journeyToProduct["journey"].id] = (journeyToProduct["product"] ?? []).map(e => e.id)
      }
    })
    getDocs(collection(this.firestore,"productToDeliverySequence")).then(productdelivery=>{
      for (let i = 0; i < productdelivery.docs.length; i++) {
        const product = productdelivery.docs[i];
        const data = product.data()
        this.mapProductDeliveryType[data["product"].id] = (data["deliveryoptions"] ?? []).map(e => e["deliverytype"])
      }
      console.log(this.mapProductDeliveryType)
    })
  }

  ngOnDestroy(){
    this.journeySubscription?.unsubscribe()
    this.packageSubscription?.unsubscribe()
    this.productSubscription?.unsubscribe()
  }

  loadingDialog(text?:String):MatDialogRef<any>{
    var loading = this.dialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: {
        msg: text ?? "Loading ....."
      }
    })
    return loading
  }


  async watsonParticipantPurchase(){
    this.guard.initializeWatson().then(()=>{
     getDoc(doc(this.firestore,"profile_data",this.profileid)).then(profile=>{
        this.profileData = profile.data()
        getDocs(collection(this.watsonDatabase,'Participants')).then(async participant => {
          var participantid = null
          for (let i = 0; i < participant.docs.length; i++) {
            const doc = participant.docs[i];
            const participantdata = doc.data()
            if(participantdata["name"]?.toLowerCase().replace(/\s/g, "") == this.profileData["name"]?.toLowerCase().replace(/\s/g, "") || participantdata["email"]?.toLowerCase().replace(/\s/g, "") == this.profileData["email"]?.toLowerCase().replace(/\s/g, "")){
              participantid = participantdata["id"]
              break;
            }
          }
          if(participantid == null){
            alert("unable to find Client in Watson")
          }
          else{
            getDocs(query(collection(this.watsonDatabase, 'ParticipantPurchases'),where("participantid", "==", participantid))).then(purchase=>{
              this.watsonPurchaseList = purchase.docs.map(e => e.data()).filter(e => e["cancelled"] != true)
              console.log(this.watsonPurchaseList);
            })
          }
        })
      })
    })
  }

  async fetchPurchase(){
    // this.firestore.collection("participantdeliverysequence").doc(this.profileid).get().toPromise().then(sequence=>{
    //   if(sequence.exists){
    //     var products = sequence.data()["products"] ?? []
    //     for (let i = 0; i < products.length; i++) {
    //       const element = products[i];
    //       this.mapProductDelivery[element["participantproductid"]] = element["delivery"] ?? []
    //     }
    //   }
    // })
    await getDocs(query(collection(this.firestore,"participantsproduct"), where("profileid", "==", this.profileid))).then(clientproduct=>{
      const participantProducts = clientproduct.docs.map(e => e.data())
      for (let i = 0; i < participantProducts.length; i++) {
        const product = participantProducts[i];
        this.mapParticipantProducts[product["docid"]] = product
      }
    })
    console.log(this.mapParticipantProducts)
    var mapPurchase = {}
    await getDocs(query(collection(this.firestore,"journeyproductpurchase"), where("profileid", "==", this.profileid))).then(purchase=>{
      for (let i = 0; i < purchase.docs.length; i++) {
        const doc = purchase.docs[i];
        mapPurchase[doc.id] = doc.data()
      }
    })
    await getDocs(query(collection(this.firestore,"participantjourneyproduct"), where("profileid", "==", this.profileid))).then(clientjourney=>{
      // var journeyProductlist:Array<purchaseJourney> = []
      var PurchaseboxList:Array<ParticipantPurchase> = []
      for (let i = 0; i < clientjourney.docs.length; i++) {
        const journeyproduct = clientjourney.docs[i];
        const journeyproductdata = journeyproduct.data(); 
        // journeyProductlist.push({
        //   docid: journeyproductdata["docid"],
        //   journeyref: journeyproductdata["journeyref"]?.id ?? null,
        //   subscriptionstart: journeyproductdata["subscriptionstart"]?.toDate() ?? null,
        //   subscriptionend: journeyproductdata["subscriptionend"]?.toDate() ?? null,
        //   journeystatus: journeyproductdata["journeystatus"] ?? null
        // })
        var productList:Array<purchaseProduct> = [];
        if(journeyproductdata["participantproducts"].length == 0){
          productList.push({
            productref: null,
            packageref: null,
            minimumpayment: null,
            tentativestart: null,
            status: null,
            unlimited: false,
            participantproductid: null,
            deliverytype: null
          })
        }
        for (let j = 0; j < journeyproductdata["participantproducts"].length; j++) {
          const product = journeyproductdata["participantproducts"][j];
          var mapProduct = this.mapParticipantProducts[product["participantproductid"]] ?? {}
          productList.push({
            productref: product["productref"]?.id ?? null,
            packageref: mapProduct["packageref"]?.id ?? null,
            minimumpayment: mapProduct["minimumpayment"] ?? (this.mapMinimumRequiredAmount[product["productref"]?.id] ?? null),
            tentativestart: mapProduct["tentativestart"]?.toDate() ?? null,
            status: mapProduct["status"] ?? null,
            unlimited: mapProduct["unlimited"] ?? false,
            participantproductid: mapProduct["docid"],
            deliverytype: mapProduct["deliverytype"] ?? null
          })
        }
        const watsonpurchaseid = journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaseid"] : null
        const watsonpurchaselabel = journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaselabel"] : null
        PurchaseboxList.push({
          purchasetype: journeyproductdata["journeyref"] != null ? "journey" : "product",
          participantjourneyproductref: journeyproductdata["docid"],
          journeystatus: journeyproductdata["journeystatus"] ?? null,
          journeyref: journeyproductdata["journeyref"]?.id ?? null,
          productref: journeyproductdata["participantproducts"].map(e => e["productref"]?.id),
          purchaseref: journeyproductdata["purchaseref"]?.id ?? null,
          subscriptionstart: journeyproductdata["subscriptionstart"]?.toDate() ?? null,
          subscriptionend: journeyproductdata["subscriptionend"]?.toDate() ?? null,
          products: productList,
          watsonpurchaseid: watsonpurchaseid,
          watsonpurchaselabel: watsonpurchaselabel,
          purchasedate: journeyproductdata["purchasedate"]?.toDate?.() ?? null,
        })
      }
      // this.participantJourneyProducts = journeyProductlist
      this.sortPurchaseList(PurchaseboxList)
      this.participantPurchase = PurchaseboxList
    })
    // console.log("journey box", this.participantJourneyProducts)
    console.log("Purchase box", this.participantPurchase)
  }

  onJourneyChange(journeyindex){
    if(this.participantPurchase[journeyindex].journeyref != null){
      this.participantPurchase[journeyindex].products = []
      var mappedProduct = this.mapJourneyToProduct[this.participantPurchase[journeyindex].journeyref] ?? [null]
      for (let i = 0; i < mappedProduct.length; i++) {
        const product = mappedProduct[i];
        this.newProduct(journeyindex, product)
      }
    }
  }

  onJourneyUpgrade(journeyindex, status){
    if(status == "upgraded"){
      this.participantPurchase[journeyindex].products.forEach(product =>{
        if(product.status == null){
          product.status = "cancelled"
        }
      })
    }
  }

  onWatsonPurchaseSelect(index, value){
    var indexInList = this.watsonPurchaseList.findIndex(e => e.id == value)
    if(indexInList != -1){
      var label = this.watsonPurchaseList[indexInList]["product"]
      this.participantPurchase[index].watsonpurchaselabel = label
    } 
  }

  newPurchase(type:string){
    this.participantPurchase.push({
      purchasetype: type,
      participantjourneyproductref: null,
      journeystatus: null,
      journeyref: null,
      productref: [],
      purchaseref: null,
      subscriptionstart: null,
      subscriptionend: null,
      watsonpurchaseid: null,
      watsonpurchaselabel: null,
      purchasedate: null,
      products: [{
        productref: null,
        packageref: null,
        minimumpayment: null,
        tentativestart: null,
        status: null,
        unlimited: false,
        participantproductid: null,
        deliverytype: null
      }]
    })
    this.sortPurchaseList(this.participantPurchase)
  }

  sortPurchaseList(list: Array<ParticipantPurchase>){
    const activeStatuses = new Set(['initiated', 'ongoing', 'completed'])
    const sortDate = (p: ParticipantPurchase): Date | null => {
      if(p.purchasedate instanceof Date) return p.purchasedate
      if(p.subscriptionstart instanceof Date) return p.subscriptionstart
      if(p.subscriptionend instanceof Date) return p.subscriptionend
      return null
    }
    list.sort((a, b) => {
      const aActive = activeStatuses.has(a.journeystatus)
      const bActive = activeStatuses.has(b.journeystatus)
      if(aActive !== bActive) return aActive ? -1 : 1
      const aDate = sortDate(a)
      const bDate = sortDate(b)
      if(aDate == null && bDate == null) return 0
      if(aDate == null) return 1
      if(bDate == null) return -1
      return bDate.getTime() - aDate.getTime()
    })
  }

  removePurchase(journeyindex){
    if(confirm("Sure, Do you want to remove this Journey")){
      if(this.participantPurchase[journeyindex].purchaseref == null){
        this.participantPurchase.splice(journeyindex, 1)
      }
      else{
        this.validateANDdeletePurchase(journeyindex)
      }
    }
  }

  validateANDdeletePurchase(journeyindex){
    var selectedJourney = this.participantPurchase[journeyindex]
    var journeyproduct = selectedJourney.products
    var productValidation = []
    this.loadingWidget = this.loadingDialog("Removing Purchase.....")
    for (let i = 0; i < journeyproduct.length; i++) {
      const productitem = journeyproduct[i];
      if(productitem.status == null){
        this.validateANDdeleteProduct(journeyindex, i).then(value=>{
          productValidation.push(value)
          if(productValidation.length == journeyproduct.length){
            if(productValidation.includes(false)){
              alert("Some Active Deliveries are Found in the Product of Journey")
            }
            else{
              this.participantPurchase.splice(journeyindex, 1)
              if(selectedJourney.purchaseref != null){
                this.documentToDelete.push(doc(this.firestore,"journeyproductpurchase",selectedJourney.purchaseref).path)
              }
              if(selectedJourney.participantjourneyproductref != null){
                this.documentToDelete.push(doc(this.firestore,"participantjourneyproduct",selectedJourney.participantjourneyproductref).path)
              }
              journeyproduct.filter(e => e.participantproductid != null).forEach(p =>{
                this.documentToDelete.push(doc(this.firestore,"participantsproduct",p.participantproductid).path)
              })
            }
            this.loadingWidget.close()
          }
        })
      }
      else{
        alert("The Selected Journey has Active Product(s)")
        this.loadingWidget.close()
        break
      }
    }
  }

  newProduct(journeyindex, productref = null){
    this.participantPurchase[journeyindex].products.push({
      productref: productref,
      packageref: null,
      minimumpayment: this.mapMinimumRequiredAmount[productref],
      tentativestart: null,
      status: null,
      unlimited: false,
      participantproductid: null,
      deliverytype: null
    })
  }

  async removeProduct(journeyindex, productindex){
    var selectedProduct = this.participantPurchase[journeyindex].products[productindex]
    if(confirm("Sure, Do you want to remove this Product")){
      if(selectedProduct.participantproductid == null){
        this.participantPurchase[journeyindex].products.splice(productindex, 1)
      }
      else{
        this.loadingWidget = this.loadingDialog("Removing Product.....")
        await this.validateANDdeleteProduct(journeyindex, productindex).then(value=>{
          if(value){
            this.participantPurchase[journeyindex].products.splice(productindex, 1)
            if(selectedProduct.participantproductid != null){
              this.documentToDelete.push(doc(this.firestore,"participantsproduct",selectedProduct.participantproductid).path)
            }
          }
          else{
            alert("The Product " + this.mapProduct[selectedProduct.productref] + " has active Deliverables cannot be deleted")
          }
        })
        this.loadingWidget.close()
      }
    }
  }

  async validateANDdeleteProduct(journeyindex, productindex):Promise<boolean>{
    var value:boolean
    var selectedProduct = this.participantPurchase[journeyindex].products[productindex]
    await getDocs(query(collection(this.firestore,"deliverables"), where("participantproductid", "==", selectedProduct.participantproductid ?? null))).then(deliverable=>{
      var activeDeliverable = []
      for (let i = 0; i < deliverable.docs.length; i++) {
        const productDelivery = deliverable.docs[i];
        if(productDelivery.data()["status"] != null){
          activeDeliverable.push(productDelivery.id)
        }
      }
      value = activeDeliverable.length == 0
      if(value){
        for (let i = 0; i < deliverable.docs.length; i++) {
          const productDelivery = deliverable.docs[i];
          this.documentToDelete.push(productDelivery.ref.path)
        }
      }
      console.log(activeDeliverable, deliverable.docs.map(e => e.id))
    })
    return value
  }

  validateReview():boolean{
    var value:boolean = true
    this.validationMode = true
    this.participantProductList = []
    for (let i = 0; i < this.participantPurchase.length; i++) {
      const purchase = this.participantPurchase[i];
      purchase["productref"] = purchase["products"].map(e => e["productref"])
      if(purchase.purchasetype == "journey"){
        if(purchase.journeyref == null){
          value = false
          break;
        }
      }
      else if(purchase.purchasetype == "product"){
        if((purchase.productref ?? []).length == 0){
          value = false
          break;
        }
      }
      else{
        value = false
        break;
      }
      for (let a = 0; a < this.requiredJourneyKey.length; a++) {
        const field = this.requiredJourneyKey[a];
        if((purchase[field] ?? null) == null){
          value = false
          i = this.participantPurchase.length + 1
          break;
        }
      }
      var purchaseProduct = purchase["products"]
      for (let j = 0; j < purchaseProduct.length; j++) {
        const product = purchaseProduct[j];
        if(product.participantproductid == null){
          var productIndex = this.productList.findIndex(e => e.id == product.productref)
          if(productIndex != -1){
            product.unlimited = this.productList[productIndex]["unlimited"] ?? false
          }
          else{
            console.log("Thappu nae")
          }
        }
        this.participantProductList.push({
          purchaseindex: i,
          participantproductid: product.participantproductid ?? null,
          joureyref: purchase.journeyref ?? null,
          productref: product.productref,
          packageref: product.packageref,
          tentativestart: product.tentativestart ?? null,
          minimumpayment: product.minimumpayment ?? null,
          status: product.status,
          sequenceorder: ((this.mapParticipantProducts[product.participantproductid] ?? {})["sequenceorder"]) ?? 1000,
          subscriptionstart: purchase.subscriptionstart,
          subscriptionend: purchase.subscriptionend,
          unlimited: product.unlimited ?? false,
          deliverytype: product['deliverytype'] ?? null
        })

        // if(product["status"] == "initiated" && (product["delivery"] ?? []).length == 0){
        //   productData["deliverytype"] = product['deliverytype'] ?? null
        // }

        for (let a = 0; a < this.requiredProductKey.length; a++) {
          const field = this.requiredProductKey[a];
          if((product[field] ?? null) == null){
            value = false
            i = this.participantPurchase.length + 1
            j = purchaseProduct.length + 1
            break;
          }
        }
      }
    }
    return value
  }

  reviewPurchase(){
    // console.log("Journey", this.participantJourneyProducts)
    if(this.validateReview()){
      this.reviewMode = true
      this.participantProductList.sort((a, b) => a["sequenceorder"] - b["sequenceorder"])
      console.log("Purchase", this.participantPurchase)
      console.log("Participant Product", this.participantProductList)
    }
    else{
      console.log("Review", this.participantPurchase)
    }
  }

  drop(event: CdkDragDrop<any[]>) {
    console.log('Drop event:', event);
    
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.participantProductList, event.previousIndex, event.currentIndex);
      console.log('Updated list:', this.participantProductList); 
    }
  }

  updateProduct(){
    this.loadingWidget = this.loadingDialog("Saving Purchase.....")
    var write = 0
    for (let i = 0; i < this.participantProductList.length; i++) {
      const product = this.participantProductList[i];
      var productData = {
        journeyref: product["journeyref"] != null ? doc(this.firestore,"journey",product["journeyref"]) : null,
        productref: product["productref"] != null ? doc(this.firestore,"products",product["productref"]) : null,
        packageref: product["packageref"] != null ? doc(this.firestore,"package",product["packageref"]) : null,
        tentativestart: product["tentativestart"] ?? null,
        minimumpayment: product["minimumpayment"] ?? null,
        status: product["status"],
        sequenceorder: i,
        subscriptionstart: product["subscriptionstart"] ?? null,
        subscriptionend: product["subscriptionend"] ?? null,
        unlimited: product["unlimited"] ?? false,
        profileid: this.profileid,
        deliverytype: product["deliverytype"]
      }
      if(product["participantproductid"] == null){
        product["participantproductid"] = doc(collection(this.firestore, 'participantsproduct')).id
        var additionalData = {
          docid: product["participantproductid"],
        }
        productData = {...productData, ...additionalData}
      }
      console.log(product["participantproductid"], " ---- ", productData)
      setDoc(doc(this.firestore,"participantsproduct",product["participantproductid"]),productData,{merge: true}).then(() =>{
        write += 1
        if(write == this.participantProductList.length){
          this.updatePurchase()
        }
      }).catch(err=>{
        console.log(err)
        i = this.participantProductList.length + 1
        this.loadingWidget?.close()
      })
    }
  }

  updatePurchase(){
    console.log("Purchase.......")
    var write = 0
    for (let i = 0; i < this.participantPurchase.length; i++) {
      const purchase = this.participantPurchase[i];
      var purchaseproduct = this.participantProductList.filter(e => e["purchaseindex"] == i)
      var productRefList = purchaseproduct.map(e => doc(this.firestore,"products",e["productref"]))
      var productParticipantList = []
      purchaseproduct.forEach(p => {
        productParticipantList.push({
          participantproductid: p["participantproductid"],
          productref: doc(this.firestore,"products",p["productref"])
        })
      })
      var purchaseData = {
        productref: productRefList,
        watsonpurchaseid: purchase["watsonpurchaseid"],
        watsonpurchaselabel: purchase["watsonpurchaselabel"],
      }
      var journeyproductData = {
        journeystatus: purchase["journeystatus"],
        productref: productRefList,
        participantproducts: productParticipantList,
        subscriptionstart: purchase["subscriptionstart"] ?? null,
        subscriptionend: purchase["subscriptionend"] ?? null,
      }
      purchase["participantjourneyproductref"] = purchase["participantjourneyproductref"] ?? doc(collection(this.firestore, 'participantjourneyproduct')).id
      if(purchase["purchaseref"] == null){
        purchase["purchaseref"] = doc(collection(this.firestore, 'journeyproductpurchase')).id
        var additionalPurchase = {
          docid: purchase["purchaseref"],
          journeyref: purchase["journeyref"] != null ? doc(this.firestore,"journey",purchase["journeyref"]) : null,
          participantjourneyproductref: doc(this.firestore,"participantjourneyproduct",purchase["participantjourneyproductref"]),
          profileid: this.profileid,
          purchasetype: purchase["purchasetype"]
        }
        purchaseData = {...purchaseData, ...additionalPurchase}
        var additionaljourneyproductData = {
          docid: purchase["participantjourneyproductref"],
          journeyref: purchase["journeyref"] != null ? doc(this.firestore,"journey",purchase["journeyref"]) : null,
          purchaseref: doc(this.firestore,"journeyproductpurchase",purchase["purchaseref"]),
          profileid: this.profileid,
        }
        journeyproductData = {...journeyproductData, ...additionaljourneyproductData}
      }
      console.log("journeyproductpurchase", "-----", purchaseData)
      console.log("participantjourneyproduct", "-----", journeyproductData)
      setDoc(doc(this.firestore,"journeyproductpurchase",purchase["purchaseref"]),purchaseData, {merge: true}).then(()=>{
        write +=1
        if(write == (this.participantPurchase.length * 2)){
          this.updateDeliverySequence() 
        }
      }).catch(err=>{
        console.log(err)
        i = this.participantPurchase.length + 1
        this.loadingWidget?.close()
      })
      setDoc(doc(this.firestore,"participantjourneyproduct",purchase["participantjourneyproductref"]),journeyproductData, {merge: true}).then(()=>{
        write +=1
        if(write == (this.participantPurchase.length * 2)){
          this.updateDeliverySequence()
        }
      }).catch(err=>{
        console.log(err)
        i = this.participantPurchase.length + 1
        this.loadingWidget?.close()
      })
    }
  }

  async updateDeliverySequence(){
    console.log("done")
    await this.guard.updateDeliverySequence(this.profileid, this.participantProductList).catch(err=>{
      console.log(err)
    })
    this.deleteDocuments()
    // await this.firestore.collection("participantdeliverysequence").doc(this.profileid).get().toPromise().then(async sequence=>{
    //   var mapProductDelivery = {}
    //   var newProductSequence = []
    //   if(sequence.exists){
    //     var sequenceproduct = sequence.data()["products"] ?? []
    //     for (let i = 0; i < sequenceproduct.length; i++) {
    //       const item = sequenceproduct[i];
    //       mapProductDelivery[item["participantproductid"]] = item["delivery"] ?? []
    //     }
    //   }
    //   for (let i = 0; i < this.participantProductList.length; i++) {
    //     const participantProduct = this.participantProductList[i];
    //     newProductSequence.push({
    //       participantproductid: participantProduct["participantproductid"],
    //       productref: this.firestore.collection("products").doc(participantProduct["productref"]).ref,
    //       delivery: mapProductDelivery[participantProduct["participantproductid"]] ?? []
    //     })
    //   }
    //   console.log("New Sequence", newProductSequence)
    //   await sequence.ref.set({
    //     profileid: this.profileid,
    //     products: newProductSequence
    //   }).catch(err =>{
    //     console.log(err)
    //   })
    // }).catch(err=>{
    //   console.log(err)
    // })
  }

  deleteDocuments(){
    if(this.documentToDelete.length == 0){
      this.closeScreen()
    }
    else{
      var totalDelete = 0
      for (let i = 0; i < this.documentToDelete.length; i++) {
        const path = this.documentToDelete[i];
        deleteDoc(doc(this.firestore,path)).then(()=>{
          totalDelete += 1
          if(totalDelete == this.documentToDelete.length){
            this.closeScreen()
          }
        })
      }
    }
  }

  closeScreen(){
    this.loadingWidget?.close()
    this.location.back()
    // this.router.navigateByUrl("/participant profiles")
  }

  purchaseExchange(currentPurchaseIndex,productIndex,selectedPurchaseIndex){
    // console.log(this.participantProductList);
    // console.log(currentPurchaseIndex,productIndex,selectedPurchaseIndex);
    // console.log(this.participantPurchase[currentPurchaseIndex],this.participantPurchase[currentPurchaseIndex]['products'][productIndex],this.participantPurchase[selectedPurchaseIndex]);
    // move product to selected purchase
    this.participantPurchase[selectedPurchaseIndex]['productref'].push(this.participantPurchase[currentPurchaseIndex]['products'][productIndex]['productref'])
    this.participantPurchase[selectedPurchaseIndex]['products'].push(this.participantPurchase[currentPurchaseIndex]['products'][productIndex])
    // delete product from current purchase
    this.participantPurchase[currentPurchaseIndex]['productref'].splice(productIndex,1)
    this.participantPurchase[currentPurchaseIndex]['products'].splice(productIndex,1)
    //
    // console.log(this.participantPurchase);
    
  }

}
