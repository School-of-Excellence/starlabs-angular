import { DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-participant-delivery-sequence',
  imports: [
    MatFormFieldModule,
    MatProgressBarModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    CommonModule,
    FormsModule,
    MatRadioModule,
    DragDropModule,
    MatIconModule,
    MatDatepickerModule,
    MatExpansionModule,
    ReactiveFormsModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    ProfilePictureComponent
  ],
  templateUrl: './participant-delivery-sequence.component.html',
  styleUrl: './participant-delivery-sequence.component.css'
})
export class ParticipantDeliverySequenceComponent {
  loading: boolean = true
  developer: boolean
  mapJourney = {}
  mapProduct = {}
  mapdeliveries = {}
  mapDeliveryDoc = {}
  mapAppointment = {}
  clientAppointment = []
  statusList = ["Initiated", "Ongoing", "Completed", "Cancelled", "Shifted", "Upgraded"]
  extinctStatus = ["shifted", "upgraded", "completed", "downgraded", "closed lost"]
  deliveryStatus = ["Ready", "Completed"]
  // Profile Box
  profileList = [{
    name: "",
    id: "",
    status: "",
    sequencechanged: false,
    migrationrequired: false
  }]
  routerProfileid = ""
  profileFilterCtrl = ""
  selectedProfileid: string
  profileDataStatus: string
  sequencechanged: boolean
  migrationrequired: boolean
  dataWorkStatus = ["Not entered", "Work in process", "Up to date"]
  // Product Box
  participantProducts = []
  selectedProductIndex: number
  newDelivery: Map<any, any>
  deliveryList = []
  // Delivery Box
  selectDeliveryIndex: number
  selectedAppointments = []

  constructor(public guard: AuthguardService, public route: ActivatedRoute, public router: Router, public firestore: Firestore, public pipe: DatePipe, public location: Location) {
    this.profileList = []
    guard.getAppointmentMap().then(data => this.mapAppointment = data)
    guard.getRoles().then(async roles => {
      this.developer = roles["developer"] ?? false
      // if (roles["admin"] || roles["ah"] || roles["integrator"] || roles["scheduler"] || this.developer) {
      await this.mapData().then(() => {
        route.params.subscribe(data => {
          this.routerProfileid = data['pid']
          this.selectedProfileid = data['pid']
          this.onProfileSelect()
        })
      })
      // }
      // else {
      //   this.router.navigateByUrl("/")
      // }
    })
  }

  ngOnInit(): void {
  }

  getParticipantAppointment() {
    getDocs(query(collection(this.firestore, "appointments"), where("bookedby", "==", doc(this.firestore, "profile_data", this.selectedProfileid)), orderBy("starttime"))).then(appt => { // this
      for (let i = 0; i < appt.docs.length; i++) {
        const doc = appt.docs[i];
        this.clientAppointment.push(doc);
      }
    })
    console.log("client appointment", this.clientAppointment);
  }

  scrollUp() {
    window.scrollTo({
      top: 20,
      behavior: "smooth"
    })
  }

  clearProductData() {
    this.selectedProductIndex = null
    this.newDelivery = null
    this.clearDeliveryData()
  }

  clearDeliveryData() {
    this.selectDeliveryIndex = null
    this.selectedAppointments = []
  }

  async mapData() {
    // Profile
    await getDocs(query(collection(this.firestore, "profile_data"), orderBy("name"))).then(profile => {
      var data = []
      for (let i = 0; i < profile.docs.length; i++) {
        const doc = profile.docs[i];
        var profiledata = doc.data()
        data.push({
          name: profiledata["name"],
          id: doc.id,
          status: profiledata["datastatus"] ?? "Not entered",
          sequencechanged: profiledata["sequencechanged"] ?? false,
          migrationrequired: profiledata["migrationrequired"] ?? false
        })
      }
      this.profileList = data
    })
    // Journey
    getDocs(collection(this.firestore, "journey")).then(journey => {
      for (let i = 0; i < journey.docs.length; i++) {
        const journeyDoc = journey.docs[i];
        this.mapJourney[journeyDoc.ref.path] = journeyDoc.data()["journey"]
      }
    })
    // Product
    getDocs(collection(this.firestore, "products")).then(product => {
      for (let i = 0; i < product.docs.length; i++) {
        const productDoc = product.docs[i];
        this.mapProduct[productDoc.ref.path] = productDoc.data()["product"]
      }
    })
    // Appointment
    getDocs(collection(this.firestore, "appointmenttype")).then(appt => {
      for (let i = 0; i < appt.docs.length; i++) {
        const apptDoc = appt.docs[i];
        this.mapdeliveries[apptDoc.ref.path] = apptDoc.data()["appointmenttype"]
        this.deliveryList.push({
          path: apptDoc.ref.path,
          type: "appointment"
        })
        this.sortDelivery()
      }
    })
    // Form
    getDocs(query(collection(this.firestore, "delivery forms"), orderBy("formname"))).then(form => {
      for (let i = 0; i < form.docs.length; i++) {
        const formDoc = form.docs[i];
        this.mapdeliveries[formDoc.ref.path] = formDoc.data()["formname"]
        this.deliveryList.push({
          path: formDoc.ref.path,
          type: "form"
        })
        this.sortDelivery()
      }
    })
    // Report
    getDocs(query(collection(this.firestore, "delivery report"), orderBy("reportname"))).then(report => {
      for (let i = 0; i < report.docs.length; i++) {
        const reportDoc = report.docs[i];
        this.mapdeliveries[reportDoc.ref.path] = reportDoc.data()["reportname"]
        this.deliveryList.push({
          path: reportDoc.ref.path,
          type: "report"
        })
        this.sortDelivery()
      }
    })
    // Event
    getDocs(query(collection(this.firestore, "delivery events"), orderBy("eventname"))).then(event => {
      for (let i = 0; i < event.docs.length; i++) {
        const eventDoc = event.docs[i];
        this.mapdeliveries[eventDoc.ref.path] = eventDoc.data()["eventname"]
        this.deliveryList.push({
          path: eventDoc.ref.path,
          type: "event"
        })
        this.sortDelivery()
      }
    })
    // Queue
    getDocs(query(collection(this.firestore, "delivery queue"), orderBy("queuename"))).then(queue => {
      for (let i = 0; i < queue.docs.length; i++) {
        const queueDoc = queue.docs[i];
        this.mapdeliveries[queueDoc.ref.path] = queueDoc.data()["queuename"]
        this.deliveryList.push({
          path: queueDoc.ref.path,
          type: "queue"
        })
        this.sortDelivery()
      }
    })
    // Fieldwork
    getDocs(query(collection(this.firestore, "delivery fieldwork"), orderBy("fieldworkname"))).then(fieldwork => {
      for (let i = 0; i < fieldwork.docs.length; i++) {
        const fieldworkDoc = fieldwork.docs[i];
        this.mapdeliveries[fieldworkDoc.ref.path] = fieldworkDoc.data()["fieldworkname"]
        this.deliveryList.push({
          path: fieldworkDoc.ref.path,
          type: "fieldwork"
        })
        this.sortDelivery()
      }
    })
  }

  sortDelivery() {
    this.deliveryList = this.deliveryList.sort((a, b) => this.mapdeliveries[a.path].localeCompare(this.mapdeliveries[b.path]))
  }

  returnProfile(): Array<any> {
    return this.profileList.filter(e => e.name.toLocaleLowerCase().includes(this.profileFilterCtrl.toLocaleLowerCase()))
  }

  changeProfile() {
    this.router.navigateByUrl(this.router.url.replace(this.routerProfileid, this.selectedProfileid));
  }

  onProfileSelect() {
    console.log("Pro-", this.selectedProfileid)
    this.getParticipantAppointment()
    var selectedProfile = this.profileList[this.profileList.findIndex(e => e.id == this.selectedProfileid)]
    this.profileDataStatus = selectedProfile.status
    this.sequencechanged = selectedProfile.sequencechanged
    this.migrationrequired = selectedProfile.migrationrequired
    this.clearProductData()
    this.getParticipantDeliverySequence()
  }

  async getParticipantDeliverySequence() {
    this.loading = true
    var mapProductDelivery = {}
    await getDoc(doc(this.firestore, "participantdeliverysequence", this.selectedProfileid)).then(deliverySequence => {
      if (deliverySequence.exists()) {
        var sequenceproducts = deliverySequence.data()["products"] ?? []
        for (let i = 0; i < sequenceproducts.length; i++) {
          const sequence = sequenceproducts[i];
          mapProductDelivery[sequence["participantproductid"]] = sequence["delivery"] ?? []
        }
      }
    })
    await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileid))).then(participantProduct => {
      var productdatalist = []
      for (let i = 0; i < participantProduct.docs.length; i++) {
        const productDoc = participantProduct.docs[i];
        var productdata = productDoc.data()
        productdata["delivery"] = mapProductDelivery[productDoc.id] ?? []
        productdata["tentativestart"] = productdata["tentativestart"]?.toDate() ?? null
        productdata["subscriptionstart"] = productdata["subscriptionstart"]?.toDate() ?? null
        productdata["subscriptionend"] = productdata["subscriptionend"]?.toDate() ?? null
        productdata["statusdate"] = productdata["statusdate"] ?? {}
        for (const key in productdata["statusdate"]) {
          productdata["statusdate"][key] = productdata["statusdate"][key]?.toDate();
        }
        productdatalist.push(productdata)
      }
      productdatalist.sort((a, b) => a["sequenceorder"] - b["sequenceorder"])
      this.participantProducts = productdatalist
    })
    /*
    await this.firestore.collection("participantdeliverysequence").doc(this.selectedProfileid).get().toPromise().then(deliverySequence=>{
      if(deliverySequence.exists()){
        this.participantProducts = deliverySequence.data()["products"] ?? []
        for (let i = 0; i < this.participantProducts.length; i++) {
          const product = this.participantProducts[i];
          if(product["tentativestart"] != null && product["tentativestart"] != undefined){
            product["tentativestart"] = this.pipe.transform(product["tentativestart"].toDate(), "yyyy-MM-dd")
          }
          product["subscriptionstart"] = this.pipe.transform(product["subscriptionstart"].toDate(), "yyyy-MM-dd")
          product["subscriptionend"] = this.pipe.transform(product["subscriptionend"].toDate(), "yyyy-MM-dd")
          var datestring = {}
          var keys = Object.keys(product["statusdate"] ?? {})
          for (let i = 0; i < keys.length; i++) {
            const datekey = keys[i];
            if(product["statusdate"][datekey] != null && product["statusdate"][datekey] != undefined){
              var statusdate:Date = new Date(product["statusdate"][datekey].toDate())
              datestring[datekey] = this.pipe.transform(statusdate, "yyyy-MM-dd")
            }
          }
          product["statusdate"] = datestring
        }
      }
    })
    */
    // Deliverable
    await getDocs(query(collection(this.firestore, "deliverables"), where("profileid", "==", this.selectedProfileid))).then(delivery => {
      console.log(delivery.size)
      for (let i = 0; i < delivery.docs.length; i++) {
        const deliverable = delivery.docs[i];
        this.mapDeliveryDoc[deliverable.ref.path] = deliverable.data()
      }
      console.log(this.mapDeliveryDoc)
    })
    this.loading = false
  }

  productSequenceDrop(event) {
    moveItemInArray(this.participantProducts, event.previousIndex, event.currentIndex);
    this.clearProductData()
  }

  removeProduct(index) {
    if (confirm("Are you sure want to remove product from this journey? Data will be lost.")) {
      this.participantProducts.splice(index, 1)
    }
  }

  onProductSelect(index) {
    if (this.selectedProductIndex != index) {
      this.selectedProductIndex = index
      this.newDelivery = null
      var selectedProduct = this.participantProducts[this.selectedProductIndex]
      this.clearDeliveryData()
    }
  }

  DeliverySequenceDrop(event) {
    moveItemInArray(this.participantProducts[this.selectedProductIndex].delivery, event.previousIndex, event.currentIndex);
    this.clearDeliveryData()
  }

  deleteDeliverable(index, activityname, sequenceRef) {
    if (this.selectedAppointments.length === 0) {
      if (confirm("Sure, Do you want to remove '" + activityname + "' from this delivery List")) {
        this.participantProducts[this.selectedProductIndex].delivery.splice(index, 1)
        this.mapDeliveryDoc[sequenceRef]["delete"] = true
        this.clearDeliveryData()
      }
    } else {
      alert("You cannot remove this delivery because appointments are booked for it. If you want to remove it, please cancel those appointments first.");
    }
  }

  newDeliverable() {
    var activityname = this.mapdeliveries[this.newDelivery["path"]]
    var activity = this.newDelivery
    if (confirm("Sure, Do you want to add '" + activityname + "' to the delivery List")) {
      var newSequenceID = doc(collection(this.firestore, 'deliverables')).id
      var newSequenceRef = doc(this.firestore, "deliverables", newSequenceID)
      this.participantProducts[this.selectedProductIndex].delivery.push({
        sequenceref: newSequenceRef,
        status: null,
        type: activity["type"],
        // action: "add"
      })
      this.mapDeliveryDoc[newSequenceRef.path] = {
        deliveryref: doc(this.firestore, activity["path"]),
        fileref: [],
        participantproductid: this.participantProducts[this.selectedProductIndex]["docid"],
        profileid: this.selectedProfileid,
        status: null,
        type: activity["type"]
      }
    }
    this.newDelivery = null
  }

  onDeliverySelect(index) {
    if (this.selectDeliveryIndex != index) {
      this.selectDeliveryIndex = index
      var fileref = this.mapDeliveryDoc[this.participantProducts[this.selectedProductIndex].delivery[this.selectDeliveryIndex].sequenceref.path]["fileref"] ?? [] // this
      console.log(fileref)
      var appts = []
      for (let i = 0; i < fileref.length; i++) {
        const file = fileref[i];
        appts.push(file.id)
      }
      this.selectedAppointments = appts
      console.log("selected appointments", this.selectedAppointments);
      // this.scrollUp()
    }
  }

  resetJourney() {
    if (confirm("Sure do you want to reset every changes?")) {
      this.onProfileSelect()
    }
  }

  returnExistingAppt(appt) { // this
    this.clientAppointment.filter(e => console.log(e.data()));
    const filtered = this.clientAppointment.filter(
      e => e.data()["appointment"]["path"] == appt
    );

    console.log("filtered appointments", filtered);
    return filtered;
  }

  onAppointmentSelection() {
    console.log("selected appointments", this.selectedAppointments)
    var ref = []
    for (let i = 0; i < this.selectedAppointments.length; i++) {
      const element = this.selectedAppointments[i];
      ref.push(doc(this.firestore, "appointments", element))
    }
    console.log("ref", ref);
    this.mapDeliveryDoc[this.participantProducts[this.selectedProductIndex].delivery[this.selectDeliveryIndex].sequenceref.path]["fileref"] = ref
    console.log("map delivery doc", this.mapDeliveryDoc);
    // this.mapDeliveryDoc[this.participantProducts[this.selectedProductIndex].delivery[this.selectDeliveryIndex].sequenceref.path]["type"] = "appointment"
  }

  async submitJourney() {
    console.log(this.participantProducts)
    this.loading = true
    this.scrollUp()

    console.log("Delete Deliverables......")
    var deleteDeliverable = Object.keys(this.mapDeliveryDoc).filter(e => this.mapDeliveryDoc[e]["delete"] == true)
    var products = this.participantProducts
    var writesrequired = products.length + (deleteDeliverable.length)
    products.forEach(e => writesrequired = writesrequired + e["delivery"].length)
    var totalwrites = 0

    for (let i = 0; i < deleteDeliverable.length; i++) {
      const key = deleteDeliverable[i]
      console.log(key, this.mapDeliveryDoc[key])
      deleteDoc(doc(this.firestore, key)).then(() => {
        totalwrites += 1
        if (totalwrites == writesrequired) {
          this.clearData()
        }
      })
    }

    console.log("Structure Products")
    for (let i = 0; i < products.length; i++) {
      const productitem = products[i];
      productitem["statusdate"] = productitem["statusdate"] ?? {}
      var dateStamp = {}
      var keys = Object.keys(productitem.statusdate)
      for (let i = 0; i < keys.length; i++) {
        const element = keys[i];
        if (productitem.statusdate[element] != null && productitem.statusdate[element] != undefined) {
          var newstatusdate: any = new Date(productitem.statusdate[element])
          dateStamp[element] = newstatusdate == "Invalid Date" ? new Date(productitem.statusdate[element].toDate()) : new Date(productitem.statusdate[element])
        }
      }
      productitem.statusdate = dateStamp
      productitem.subscriptionstart = new Date(productitem.subscriptionstart)
      productitem.subscriptionend = new Date(productitem.subscriptionend)
      productitem.tentativestart = productitem.tentativestart != null ? new Date(productitem.tentativestart) : null
      productitem.sequenceorder = i
      // Update Participant Products
      if (productitem["docid"] != null && productitem["docid"] != undefined) {
        updateDoc(doc(this.firestore, 'participantsproduct', productitem["docid"]), {
          status: productitem.status,
          statusdate: dateStamp,
          subscriptionstart: productitem.subscriptionstart,
          subscriptionend: productitem.subscriptionend,
          tentativestart: productitem.tentativestart,
          sequenceorder: productitem.sequenceorder
        }).then(() => {
          totalwrites += 1
          if (totalwrites == writesrequired) {
            this.clearData()
          }
        })
      }
      console.log("Calculating Delivery Status...")
      var delivery = productitem.delivery
      for (let j = 0; j < delivery.length; j++) {
        const deliveryitem = delivery[j];
        if (j == 0) {
          if (deliveryitem.status == null) {
            if (productitem.status == "initiated" || productitem.status == "ongoing") {
              deliveryitem.status = "ready"
            }
          }
        }
        else {
          if (deliveryitem.status == null) {
            if (delivery[j - 1].status == "completed") {
              deliveryitem.status = "ready"
              j = delivery.length + 1
            }
            else if (delivery[j - 1].status == "ready") {
              j = delivery.length + 1
            }
          }
        }
      }
    }

    console.log("Add & Update Deliverables")
    for (let i = 0; i < products.length; i++) {
      const deliveryList = products[i]["delivery"];
      for (let j = 0; j < deliveryList.length; j++) {
        const delivery = deliveryList[j];
        var deliverable = this.mapDeliveryDoc[delivery["sequenceref"].path];
        deliverable["status"] = delivery["status"];
        deliverable["type"] = delivery["type"];
        // console.log(delivery, deliverable)
        setDoc(doc(this.firestore, delivery["sequenceref"].path), deliverable, { merge: true }).then(() => {
          totalwrites += 1
          if (totalwrites == writesrequired) {
            this.clearData()
          }
        })
      }
    }
  }

  async clearData() {
    var deliverySequence = []
    for (let i = 0; i < this.participantProducts.length; i++) {
      const product = this.participantProducts[i];
      deliverySequence.push({
        participantproductid: product["docid"],
        productref: product["productref"],
        delivery: product["delivery"]
      })
    }
    await setDoc(doc(this.firestore, "participantdeliverysequence", this.selectedProfileid), {
      products: deliverySequence,
      profileid: this.selectedProfileid,
    }, { merge: true })
    this.loading = false
    this.location.back()
    // this.router.navigateByUrl("/participant profiles")
  }

  onDataStatusChange() {
    updateDoc(doc(this.firestore, "profile_data", this.selectedProfileid), {
      datastatus: this.profileDataStatus,
      sequencechanged: this.sequencechanged,
      migrationrequired: this.migrationrequired
    })
  }
}