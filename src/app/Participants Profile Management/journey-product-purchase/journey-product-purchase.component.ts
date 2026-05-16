import { CommonModule, formatDate } from '@angular/common';
import { Component, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
  rowlogs?: any
  _initiationNote?: string
  _statusBefore?: any
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
  products: Array<purchaseProduct>
  journeyproductlogs?: any
  purchaselogs?: any
  removedProductLogs?: any
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
    MatDialogModule,
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
  loggedinprofileid = null
  pendingChanges = []
  pendingDeletes = []
  fieldLabels = {
    participantsproduct: {
      journeyref: "Journey",
      productref: "Product",
      packageref: "Package",
      tentativestart: "Tentative Start",
      minimumpayment: "Minimum Payment",
      status: "Product Status",
      subscriptionstart: "Subscription Start",
      subscriptionend: "Subscription End",
      unlimited: "Unlimited",
      deliverytype: "Delivery Option"
    },
    journeyproductpurchase: {
      watsonpurchaseid: "Watson Purchase",
      watsonpurchaselabel: "Watson Label",
      journeyref: "Journey",
      purchasetype: "Purchase Type"
    },
    participantjourneyproduct: {
      journeystatus: "Journey Status",
      subscriptionstart: "Subscription Start",
      subscriptionend: "Subscription End",
      journeyref: "Journey"
    }
  }
  excludedLogFields = ["Products", "Participant Products"]
  collectionLabels = {
    participantsproduct: "Product",
    journeyproductpurchase: "Purchase",
    participantjourneyproduct: "Journey Product"
  }
  purchaseLogs = []
  mapDocLogs = {}
  mapPurchaseDoc = {}
  mapJourneyProductDoc = {}
  mapProfileNames = {}
  historyExpanded = {}
  removedLogs = []
  allRemovedEntries = []
  showRemovedLogs = false

  @ViewChild('confirmInitiateDialog') confirmInitiateDialog!: TemplateRef<any>

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
    this.guard.username().then(profile=>{
      this.loggedinprofileid = profile?.["profileid"] ?? null
    })
    this.guard.getProfileMap().then(profileMap=>{
      this.mapProfileNames = profileMap?.["map"] ?? {}
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
    this.mapPurchaseDoc = mapPurchase
    this.mapJourneyProductDoc = {}
    await getDocs(query(collection(this.firestore,"participantjourneyproduct"), where("profileid", "==", this.profileid))).then(clientjourney=>{
      // var journeyProductlist:Array<purchaseJourney> = []
      var PurchaseboxList:Array<ParticipantPurchase> = []
      for (let i = 0; i < clientjourney.docs.length; i++) {
        const journeyproduct = clientjourney.docs[i];
        const journeyproductdata = journeyproduct.data();
        this.mapJourneyProductDoc[journeyproduct.id] = journeyproductdata
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
          watsonpurchaseid: journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaseid"] : null,
          watsonpurchaselabel: journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaselabel"] : null,
        })
      }
      // this.participantJourneyProducts = journeyProductlist
      PurchaseboxList.sort((a, b) => a.purchasetype.localeCompare(b.purchasetype))
      this.participantPurchase = PurchaseboxList
    })
    // console.log("journey box", this.participantJourneyProducts)
    console.log("Purchase box", this.participantPurchase)
    await this.loadPurchaseLogs()
  }

  async loadPurchaseLogs(){
    await getDocs(query(collection(this.firestore,"participant purchase logs"), where("profileid", "==", this.profileid))).then(logs=>{
      this.purchaseLogs = logs.docs.map(e => e.data()).sort((a, b) =>
        (b["date"]?.toDate?.()?.getTime?.() ?? 0) - (a["date"]?.toDate?.()?.getTime?.() ?? 0)
      )
      this.buildDocLogMap()
    }).catch(err=>{
      console.log(err)
    })
  }

  buildDocLogMap(){
    var map = {}
    var removed = []
    for (let i = 0; i < this.purchaseLogs.length; i++) {
      const log = this.purchaseLogs[i]
      const changes = log["changes"] ?? []
      for (let j = 0; j < changes.length; j++) {
        const change = changes[j]
        const docid = change["docid"]
        if(docid == null) continue
        const fields = change["fields"] ?? {}
        const visibleFieldKeys = Object.keys(fields).filter(k => !this.excludedLogFields.includes(k))
        if(change["action"] == "updated" && visibleFieldKeys.length == 0) continue
        const entry = {
          date: log["date"],
          loggedinprofile: log["loggedinprofile"],
          collection: change["collection"],
          docid: docid,
          action: change["action"],
          label: change["label"] ?? "",
          journey: change["journey"] ?? "",
          note: change["note"] ?? "",
          parentPurchaseref: change["parentPurchaseref"] ?? "",
          parentJourneyProductref: change["parentJourneyProductref"] ?? "",
          fields: fields,
          fieldKeys: visibleFieldKeys
        }
        if(change["action"] == "removed"){
          removed.push(entry)
        }
        else{
          if(map[docid] == null) map[docid] = []
          map[docid].push(entry)
        }
      }
    }
    removed.sort((a, b) =>
      (b["date"]?.toDate?.()?.getTime?.() ?? 0) - (a["date"]?.toDate?.()?.getTime?.() ?? 0)
    )
    this.mapDocLogs = map
    this.allRemovedEntries = removed
    this.attachRowLogs()
  }

  attachRowLogs(){
    var purchaseByRef = {}
    for(let i = 0; i < this.participantPurchase.length; i++){
      const p = this.participantPurchase[i]
      p["removedProductLogs"] = []
      if(p["purchaseref"]) purchaseByRef[p["purchaseref"]] = p
    }
    var orphans = []
    const removedEntries = this.allRemovedEntries ?? []
    for(let i = 0; i < removedEntries.length; i++){
      const e = removedEntries[i]
      const parent = e["parentPurchaseref"] ? purchaseByRef[e["parentPurchaseref"]] : null
      if(parent && e["collection"] == "participantsproduct"){
        parent["removedProductLogs"].push(e)
      } else {
        orphans.push(e)
      }
    }
    this.removedLogs = orphans
    for (let i = 0; i < this.participantPurchase.length; i++) {
      const purchase = this.participantPurchase[i]
      purchase["journeyproductlogs"] = this.mergeLogs(purchase["participantjourneyproductref"])
      purchase["purchaselogs"] = this.mergeLogs(purchase["purchaseref"])
      const products = purchase["products"] ?? []
      for (let j = 0; j < products.length; j++) {
        products[j]["rowlogs"] = this.mergeLogs(products[j]["participantproductid"])
      }
    }
  }

  mergeLogs(...docids){
    var entries = []
    for (let i = 0; i < docids.length; i++) {
      const id = docids[i]
      if(id != null && this.mapDocLogs[id] != null){
        entries = entries.concat(this.mapDocLogs[id])
      }
    }
    entries.sort((a, b) =>
      (b["date"]?.toDate?.()?.getTime?.() ?? 0) - (a["date"]?.toDate?.()?.getTime?.() ?? 0)
    )
    return entries
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
    this.participantPurchase = this.participantPurchase.sort((a, b) => a.purchasetype.localeCompare(b.purchasetype))
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
              var journeyName = this.purchaseLabel(selectedJourney)
              if(selectedJourney.purchaseref != null){
                this.documentToDelete.push(doc(this.firestore,"journeyproductpurchase",selectedJourney.purchaseref).path)
                this.collectDelete("journeyproductpurchase", selectedJourney.purchaseref, journeyName, journeyName)
              }
              if(selectedJourney.participantjourneyproductref != null){
                this.documentToDelete.push(doc(this.firestore,"participantjourneyproduct",selectedJourney.participantjourneyproductref).path)
                this.collectDelete("participantjourneyproduct", selectedJourney.participantjourneyproductref, journeyName, journeyName)
              }
              journeyproduct.filter(e => e.participantproductid != null).forEach(p =>{
                this.documentToDelete.push(doc(this.firestore,"participantsproduct",p.participantproductid).path)
                this.collectDelete("participantsproduct", p.participantproductid, this.productLabel(p), journeyName, selectedJourney.purchaseref, selectedJourney.participantjourneyproductref)
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
        var selectedJourney = this.participantPurchase[journeyindex]
        await this.validateANDdeleteProduct(journeyindex, productindex).then(value=>{
          if(value){
            this.participantPurchase[journeyindex].products.splice(productindex, 1)
            if(selectedProduct.participantproductid != null){
              this.documentToDelete.push(doc(this.firestore,"participantsproduct",selectedProduct.participantproductid).path)
              this.collectDelete("participantsproduct", selectedProduct.participantproductid, this.productLabel(selectedProduct), this.purchaseLabel(selectedJourney), selectedJourney.purchaseref, selectedJourney.participantjourneyproductref)
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
          deliverytype: product['deliverytype'] ?? null,
          _initiationNote: product['_initiationNote'] ?? null
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
    this.pendingChanges = []
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
      this.collectChange("participantsproduct", product["participantproductid"], this.mapParticipantProducts[product["participantproductid"]] ?? null, productData)
      if(product["_initiationNote"]){
        var lastEntry = this.pendingChanges[this.pendingChanges.length - 1]
        if(lastEntry && lastEntry["docid"] === product["participantproductid"]){
          lastEntry["note"] = product["_initiationNote"]
        }
      }
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
      this.collectChange("journeyproductpurchase", purchase["purchaseref"], this.mapPurchaseDoc[purchase["purchaseref"]] ?? null, purchaseData)
      this.collectChange("participantjourneyproduct", purchase["participantjourneyproductref"], this.mapJourneyProductDoc[purchase["participantjourneyproductref"]] ?? null, journeyproductData)
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
    await this.writePurchaseLog()
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

  normalizeForDiff(value){
    if(value == null) return null
    if(typeof value.path === 'string' && typeof value.id === 'string') return value.path
    if(typeof value.toDate === 'function') return value.toDate().toISOString()
    if(value instanceof Date) return value.toISOString()
    if(Array.isArray(value)) return value.map(v => this.normalizeForDiff(v))
    if(typeof value === 'object'){
      var obj = {}
      Object.keys(value).sort().forEach(k => obj[k] = this.normalizeForDiff(value[k]))
      return obj
    }
    return value
  }

  collectChange(collectionName, docid, oldData, newData){
    var isNew = oldData == null
    var fields = {}
    var labels = this.fieldLabels[collectionName] ?? {}
    Object.keys(newData).forEach(key => {
      var label = labels[key]
      if(label == null) return
      var oldVal = this.normalizeForDiff(oldData ? oldData[key] : null)
      var newVal = this.normalizeForDiff(newData[key])
      if(JSON.stringify(oldVal) !== JSON.stringify(newVal)){
        fields[label] = { old: oldVal ?? null, new: newVal ?? null }
      }
    })
    if(isNew || Object.keys(fields).length > 0){
      this.pendingChanges.push({
        collection: collectionName,
        docid: docid,
        action: isNew ? "added" : "updated",
        fields: fields
      })
    }
  }

  collectDelete(collectionName, docid, label, journey, parentPurchaseref?, parentJourneyProductref?){
    if(docid == null) return
    this.pendingDeletes.push({
      collection: collectionName,
      docid: docid,
      action: "removed",
      label: label ?? "",
      journey: journey ?? "",
      parentPurchaseref: parentPurchaseref ?? "",
      parentJourneyProductref: parentJourneyProductref ?? "",
      fields: {}
    })
  }

  productLabel(product){
    var name = this.mapProduct[product["productref"]] ?? product["productref"] ?? "Product"
    var pkg = this.mapPackage[product["packageref"]]
    return pkg ? (name + " / " + pkg) : name
  }

  purchaseLabel(purchase){
    if(purchase["purchasetype"] == "journey"){
      return this.mapJourney[purchase["journeyref"]] ?? "Journey"
    }
    return purchase["watsonpurchaselabel"] ?? "Product Purchase"
  }

  captureStatus(product, opened){
    if(opened){
      product._statusBefore = product.status
    }
  }

  findInitiatedConflicts(product){
    var conflicts = []
    for(let i = 0; i < this.participantPurchase.length; i++){
      const products = this.participantPurchase[i].products ?? []
      for(let j = 0; j < products.length; j++){
        const p = products[j]
        if(p === product) continue
        if(p.status === 'initiated' || p.status === 'ongoing'){
          conflicts.push({ label: this.productLabel(p), status: p.status })
        }
      }
    }
    return conflicts
  }

  onProductStatusChange(product, newStatus){
    if(newStatus !== 'initiated'){
      delete product._initiationNote
      return
    }
    const conflicts = this.findInitiatedConflicts(product)
    if(conflicts.length === 0){
      delete product._initiationNote
      return
    }
    const productName = this.productLabel(product)
    this.dialog.open(this.confirmInitiateDialog, {
      data: { conflicts, productName },
      width: '460px'
    }).afterClosed().subscribe(result => {
      if(result === true){
        product._initiationNote = 'Initiated while ' + conflicts.map(c => c.label + ' (' + c.status + ')').join(', ')
      }
      else{
        product.status = product._statusBefore ?? null
        delete product._initiationNote
      }
    })
  }

  async writePurchaseLog(){
    var allChanges = this.pendingChanges.concat(this.pendingDeletes)
    if(allChanges.length == 0) return
    var logRef = doc(collection(this.firestore, "participant purchase logs"))
    var logData = {
      docid: logRef.id,
      profileid: this.profileid,
      loggedinprofile: this.loggedinprofileid,
      date: new Date(),
      changes: allChanges
    }
    await setDoc(logRef, logData).then(()=>{
      this.purchaseLogs.unshift(logData)
      this.buildDocLogMap()
    }).catch(err=>{
      console.log(err)
    })
    this.pendingChanges = []
    this.pendingDeletes = []
  }

  formatLogDate(date){
    var d = date?.toDate ? date.toDate() : date
    if(d == null) return ""
    return formatDate(d, 'dd/MM/yyyy, h:mm a', 'en-US', '+0530')
  }

  formatLogValue(value){
    if(value == null || value === "") return "—"
    if(value === true) return "Yes"
    if(value === false) return "No"
    if(Array.isArray(value)) return value.map(v => this.formatLogValue(v)).join(", ")
    if(typeof value === 'string'){
      if(/^\d{4}-\d{2}-\d{2}T/.test(value)){
        return formatDate(new Date(value), 'dd/MM/yyyy', 'en-US', '+0530')
      }
      if(value.startsWith("journey/")) return this.mapJourney[value.split("/")[1]] ?? value
      if(value.startsWith("products/")) return this.mapProduct[value.split("/")[1]] ?? value
      if(value.startsWith("package/")) return this.mapPackage[value.split("/")[1]] ?? value
    }
    if(typeof value === 'object') return JSON.stringify(value)
    return value
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
