import { CommonModule, DatePipe, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { arrayUnion, collection, doc, Firestore, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

@Component({
  selector: 'app-book-appointment',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatChipsModule,
    MatAutocompleteModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './book-appointment.component.html',
  styleUrl: './book-appointment.component.css'
})
export class BookAppointmentComponent implements OnInit{

  mindate
  loggedinPID

  superRole:boolean = false
  selectedUser:string = null
  profileList = []

  clientJourney = [{
    products: [{
      productid: "",
      appointment: [{
        id: "",
        deliverypath: "",
        journeyData: {}
      }]
    }]
  }]
  mapAppointments = {}
  mapProfile = {}
  mapProduct = {}
  mapJourney = {}

  selectedAppointment = null
  selectedDate = null

  userAvailableSlots = [{
    docdata : [{
      id: "",
      index: 0
    }],
    start : "",
    end : "",
    specialist: "",
  }]
  
  selectedSlot:number
  appointmentRoles = []
  rolePersons = {}
  filteredProfile = ""
  goback:boolean = false

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private http: HttpClient,
    private datepipe: DatePipe,
    private matDialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location
  ){
    this.clientJourney = []
    this.userAvailableSlots = []
    guard.getRoles().then(async data=>{
      this.loggedinPID = data.profile_ref.id
      var adminRole = data.admin != null ? data.admin : false
      var schedulerRole = data.scheduler != null ? data.scheduler : false
      var ahRole = data.ah != null ? data.ah : false
      this.superRole = adminRole || schedulerRole || ahRole
      var minimumDate:Date
      if(this.superRole){
        minimumDate = new Date()
        this.route.queryParams.subscribe(param=>{
          if(param["pid"] != null){
            var profileid = param["pid"]
            console.log(profileid)
            this.selectedUser = profileid
            this.onProfileSelect()
            this.goback = true
          }
        })
      }
      else{
        minimumDate = new Date(new Date().setDate(new Date().getDate() + 1))
        this.selectedUser = this.loggedinPID
        this.onProfileSelect()
      }
      this.mindate = datepipe.transform(minimumDate, "yyyy-MM-dd")
    })
  }

  ngOnInit(): void {
    this.guard.getAppointmentMap().then(data => this.mapAppointments = data.map)
    this.guard.getProductMap().then(data => this.mapProduct = data)
    this.guard.getProfileMap().then(data =>{
      this.profileList = data.list,
      this.mapProfile = data.map
    })
  }

  returnClient(){
    return this.profileList.filter(e=>e.name.toLowerCase().includes(this.filteredProfile.toLowerCase()))
  }

  async onProfileSelect(){
    this.clientJourney = []
    this.userAvailableSlots = []
    this.selectedSlot = null
    this.selectedDate = null
    this.selectedAppointment = null
    this.getMyAppointment()
  }

  async getMyAppointment(){
    this.matDialog.open(LoadingProgressComponent, {disableClose : true, data : {type : "spinner", msg : "Getting Appointments..."}})

    var participantProductcollection = collection(this.firestore, "participantsproduct")
    var productQuery = query(participantProductcollection, where("status", "in", ["initiated", "ongoing"]))
    await getDocs(productQuery).then(async participantproducts=>{
      var participantproductid = participantproducts.docs.map(e => e.id)
      var mapDeliverables = []
      var deliverableCollection = collection(this.firestore, "deliverables")
      var deliveryQuery
      if(this.superRole){
        deliveryQuery = query(deliverableCollection, where("profileid", "==", this.selectedUser), where("type", "==", "appointment"))
      }
      else{
        deliveryQuery = query(deliverableCollection, where("profileid", "==", this.selectedUser), where("type", "==", "appointment"), where("status", "==", "ready"))
      }
      await getDocs(deliveryQuery).then(deliverables=>{
        for (let i = 0; i < deliverables.docs.length; i++) {
          const element = deliverables.docs[i];
          mapDeliverables[element.ref.path] = element
        }
      })
      var deliverySequenceDoc = doc(this.firestore, "participantdeliverysequence/"+this.selectedUser)
      await getDoc(deliverySequenceDoc).then(async participantdelivery=>{
        if(participantdelivery.exists()){
          var productSequence = []
          var products = participantdelivery.data()["products"].filter(e => participantproductid.includes(e.participantproductid))
          for (let j = 0; j < products.length; j++) {
            const productitem = products[j];
            var deliverySequence = []
            var deliveryActivity = []
            if(this.superRole){
              deliveryActivity = productitem.delivery.filter(e => e.type == "appointment" && (e.status == "ready" || e.status == null))
            }
            else{
              deliveryActivity = productitem.delivery.filter(e => e.type == "appointment" && e.status == "ready")
            }
            for (let k = 0; k < deliveryActivity.length; k++) {
              const activity = deliveryActivity[k];
              var deliverable = mapDeliverables[activity.sequenceref.path]
              deliverySequence.push({
                id: deliverable.data()["deliveryref"].id,
                deliverypath: deliverable.ref.path,
                participantdelivery: participantdelivery.data(),
                status: activity.status,
                productid: productitem.productref.id
              })
            }
            productSequence.push({
              productid: productitem.productref.id,
              appointment: deliverySequence
            })
          }
          this.clientJourney.push({
            products: productSequence
          })
        }
        else{
          alert("No Delivery Sequence Found")
        }
      })
    })
    this.matDialog.closeAll()
  }

  async onAppointmentSelect(){
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    this.selectedDate = null
    this.matDialog.open(LoadingProgressComponent, {disableClose : true, data : {type : "spinner", msg : "Loading..."}})
    console.log(this.selectedAppointment)
    this.appointmentRoles = []
    var additionalRoles = []
    this.rolePersons = {}

    console.log("id", this.selectedAppointment.id);
    
    var apptRoleCollection = collection(this.firestore, "AppointmentType-To-Roles")
    var apptRoleQuery = query(apptRoleCollection, where("assigned_appttype_ref", "==", doc(this.firestore, "appointmenttype/"+this.selectedAppointment.id)), limit(1))
    await getDocs(apptRoleQuery).then(roles=>{
      roles.forEach(doc=>{
        var requiredRole = doc.data()["required_role"] ?? []
        var extraRole = doc.data()["additional_role"] ?? []
        requiredRole.forEach(element => {
          this.appointmentRoles.push(element.path)
        });
        extraRole.forEach(element => {
          additionalRoles.push(element.path)
        });
      })
    })
    console.log(this.appointmentRoles, "Additional Role: ", additionalRoles)

    var customerMappingDoc = doc(this.firestore, "customer_eismapping/"+this.selectedUser)
    await getDoc(customerMappingDoc).then(async priorAssigned=>{
      if(priorAssigned.exists()){
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const rolesOfAppt = this.appointmentRoles[i];
          if(priorAssigned.data()["eisroles"][rolesOfAppt] != null){
            var assignedAgents = []
            for (let j = 0; j < priorAssigned.data()["eisroles"][rolesOfAppt].length; j++) {
              assignedAgents.push(priorAssigned.data()["eisroles"][rolesOfAppt][j]["path"]);
            }
            this.rolePersons[rolesOfAppt] = assignedAgents
          }
          else{
            console.log("Fetch 1")
            await this.fetchAppointmentEIS(rolesOfAppt)
          }
        }
        for (let i = 0; i < additionalRoles.length; i++) {
          const rolesOfAppt = additionalRoles[i];
          if(priorAssigned.data()["eisroles"][rolesOfAppt] != null){
            this.appointmentRoles.push(rolesOfAppt)
            var assignedAgents = []
            for (let j = 0; j < priorAssigned.data()["eisroles"][rolesOfAppt].length; j++) {
              assignedAgents.push(priorAssigned.data()["eisroles"][rolesOfAppt][j]["path"]);
            }
            this.rolePersons[rolesOfAppt] = assignedAgents
          }
        }
      }
      else{
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const rolesOfAppt = this.appointmentRoles[i];
          console.log("Fetch 2")
          await this.fetchAppointmentEIS(rolesOfAppt)
        }
      }
    })

    console.log(this.rolePersons)
    if(Object.keys(this.rolePersons).length == 0){
      alert("No EIS are available for the selected Appointment")
    }
    this.matDialog.closeAll()
  }

  async fetchAppointmentEIS(role){
    var eisRoleCollection = collection(this.firestore, "Roles-To-EIS")
    var eisRoleQuery = query(eisRoleCollection, where("assigned_role_ref", "==", doc(this.firestore, role)))
    await getDocs(eisRoleQuery).then(eisRole=>{
      var eisRef = []
      eisRole.forEach(doc=>{
        doc.data()["assigned_eis"].forEach(element=>{
          if(element.id != this.selectedUser){
            eisRef.push(element.path)
          }
        })
      })
      console.log(eisRef)
      this.rolePersons[role] = eisRef
    })
  }

  async onDateSelect(){
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    var minimumDate = new Date(new Date(this.mindate).setHours(0, 0, 0))
    if(this.selectedDate >= minimumDate){
      this.matDialog.open(LoadingProgressComponent, {disableClose : true, data : {type : "spinner", msg : "Getting Your Slots..."}})
      var startDate:Date;
      var endDate:Date;
      if(this.superRole){
        startDate = this.selectedDate
      }
      else{
        var currentDateTime = new Date()
        var selectedDateTime = new Date(new Date(this.selectedDate).setHours(new Date().getHours(), new Date().getMinutes(), 0))
        var hours = Math.floor((Math.abs(selectedDateTime.getTime() - currentDateTime.getTime())) / 1000 / 3600);
        if(hours > 24){
          startDate = this.selectedDate
        }
        else{
          startDate = selectedDateTime
        }
        console.log(selectedDateTime);
      }
      console.log(this.selectedDate);
      endDate = new Date(new Date(startDate).setHours(23, 59, 59))

      var slotsOfEIS = []
      for (let i = 0; i < this.appointmentRoles.length; i++) {
        const roleOfAppointment = this.appointmentRoles[i];
        for (let j = 0; j < this.rolePersons[roleOfAppointment].length; j++) {
          const eisProfile = this.rolePersons[roleOfAppointment][j];
          var availabilityCollection = collection(this.firestore, "availability")
          var availabilityQuery = query(availabilityCollection, where("profileref", "==", doc(this.firestore, eisProfile)), where("appointments", "array-contains", doc(this.firestore, "appointmenttype/"+this.selectedAppointment.id)), where("starttime", ">=", startDate), where("starttime", "<=", endDate))
          await getDocs(availabilityQuery).then(availabilty=>{
            console.log(eisProfile, " - ", availabilty.size)
            availabilty.forEach(slots=>{
              var localSlot = slots.data()[this.selectedAppointment.id]
              console.log(localSlot);
              if(localSlot != undefined && localSlot != null && localSlot.length != 0){
                for (let a = 0; a < localSlot.length; a++){
                  var data = localSlot[a]
                  if(data.booked == false && data.available == true){
                    slotsOfEIS.push({
                      slotstart: data.slotstart.toDate(),
                      slotend: data.slotend.toDate(),
                      docid: slots.id,
                      index: a,
                      eisprofile: eisProfile,
                      appointmentrole: roleOfAppointment
                    })
                  }
                }
              }
            })
          })
        }
      }
      slotsOfEIS.sort((a,b) => a.slotstart - b.slotstart)
      console.log(slotsOfEIS)

      var slotByRoles = []
      for (let i = 0; i < this.appointmentRoles.length; i++) {
        var data = {}
        var totalEIS = slotsOfEIS.filter(e => e.appointmentrole == this.appointmentRoles[i])
        if(totalEIS.length != 0){
          data[this.appointmentRoles[i]] = totalEIS
          slotByRoles.push(data)
        }
      }
      console.log(slotByRoles)

      console.log("slot leng", slotByRoles.length);
      console.log("apoint lenght", this.appointmentRoles.length);
      
      
      if(slotByRoles.length != this.appointmentRoles.length){
        alert("EIS Slots not available for the selected date. Try again!")
      }
      else{
        this.mergeEISslots(slotByRoles)
      }
      this.matDialog.closeAll()
    }
  }

  mergeEISslots(slots:Array<any>){
    var mergedSlots = [{
      docdata : [{
        id: "",
        index: 0
      }],
      start : "",
      end : "",
      specialist: "",
    }]
    mergedSlots = []
    if(slots.length == 0){
      alert("No slots available")
      return
    }
    else if(slots.length == 1){
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        mergedSlots.push({
          start: slot1.slotstart,
          end: slot1.slotend,
          specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id],
          docdata: [{
            id: slot1.docid,
            index: slot1.index
          }],
        })
      }
    }
    else if(slots.length == 2){
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      var roleSlot2 = slots[1][this.appointmentRoles[1]]

      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          if(this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") && slot1.eisprofile != slot2.eisprofile) {
            mergedSlots.push({
              start: slot1.slotstart,
              end: slot1.slotend,
              specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot2.eisprofile).id],
              docdata: [
                {id: slot1.docid, index: slot1.index},
                {id: slot2.docid, index: slot2.index},
              ],
            })
          }
        }
      }
    }
    else if(slots.length == 3){
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      var roleSlot2 = slots[1][this.appointmentRoles[1]]
      var roleSlot3 = slots[2][this.appointmentRoles[2]]
      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          for (let k = 0; k < roleSlot3.length; k++) {
            const slot3 = roleSlot3[k];
            if(
              this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") && 
              this.datepipe.transform(slot2.slotstart, "short") == this.datepipe.transform(slot3.slotstart, "short") && 
              this.datepipe.transform(slot3.slotstart, "short") == this.datepipe.transform(slot1.slotstart, "short") &&
              slot1.eisprofile != slot2.eisprofile && slot2.eisprofile != slot3.eisprofile && slot3.eisprofile != slot1.eisprofile
              ) {
              mergedSlots.push({
                start: slot1.slotstart,
                end: slot1.slotend,
                specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot2.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot3.eisprofile).id],
                docdata: [
                  {id: slot1.docid, index: slot1.index},
                  {id: slot2.docid, index: slot2.index},
                  {id: slot3.docid, index: slot3.index},
                ],
              })
            }
          }
        }
      }
    }

    this.userAvailableSlots = mergedSlots
    console.log(this.userAvailableSlots)
    if(this.userAvailableSlots.length == 0){
      alert("No Slots available on the selected date")
    }
  }

  async confirmSlot(){
    var batch = writeBatch(this.firestore)
    var selectedSlot = this.userAvailableSlots[this.selectedSlot]
    console.log(selectedSlot)
    if(!selectedSlot){
      alert("Select a Slot to Book!")
      return
    }

    var selectedDate = this.datepipe.transform(selectedSlot.start, "fullDate")
    var starttime = this.datepipe.transform(selectedSlot.start, "shortTime")

    var requiredRoles = []
    for (let i = 0; i < this.appointmentRoles.length; i++) {
      const element = this.appointmentRoles[i];
      requiredRoles.push(doc(this.firestore, element))
    }
    var hosts = []
    var hostRole = {}

    var mapSelectedSlot = {}

    if(confirm("Confirm your appointment on " + selectedDate + " at " + starttime)){
      this.matDialog.open(LoadingProgressComponent, {disableClose : true, data : {type : "spinner", msg : "Booking Your Slots..."}})
      var availablility = []
      for (let i = 0; i < selectedSlot.docdata.length; i++) {
        const slotDoc = selectedSlot.docdata[i];
        var availabilityDoc = doc(this.firestore, "availability/"+slotDoc.id)
        await getDoc(availabilityDoc).then(available=>{
          var availableData = available.data()
          mapSelectedSlot[available.id] = availableData
          if(availableData[this.selectedAppointment.id] != null){
            hosts.push(availableData['profileref']['path'])
            availablility.push(availableData[this.selectedAppointment.id][slotDoc.index].booked == false && availableData[this.selectedAppointment.id][slotDoc.index].available == true)
          }
        })
      }
      console.log(availablility)
      if(!availablility.includes(false)){
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const element1 = this.appointmentRoles[i];
          for (let j = 0; j < hosts.length; j++) {
            const element2 = hosts[j];
            console.log(this.rolePersons[element1])
            if(this.rolePersons[element1].includes(element2)){
              if(hostRole[element1] == undefined || hostRole[element1] == null){
                hostRole[element1] = []
              }
              if(!hostRole[element1].includes(element2)){
                hostRole[element1].push(element2)
              }
            }
          }
        }
        console.log("start time", selectedSlot.start)
        console.log("end time", selectedSlot.end)
        console.log("Appointment", this.selectedAppointment.id)
        console.log("Hosts", hosts)
        console.log("Required", requiredRoles)
        console.log("Host Roles", hostRole)
        console.log("Slot Data", selectedSlot.docdata)
        var selectedAppointment = this.selectedAppointment.id
        for (let i = 0; i < selectedSlot.docdata.length; i++) {
          const slotDoc = selectedSlot.docdata[i];
          // var availabilityDoc = doc(this.firestore, "availability/"+slotDoc.id)
          // getDoc(availabilityDoc).then(available=>{
          //   var chosenAppointment = available.data()
            var chosenAppointment = mapSelectedSlot[slotDoc.id]
            for (let j = 0; j < chosenAppointment["appointments"].length; j++) {
              const chosenelement = chosenAppointment["appointments"][j];
              var computedSlots = chosenAppointment[chosenelement.id]
              if(computedSlots != null || computedSlots != undefined){
                for (let k = 0; k < computedSlots.length; k++) {
                  const slotelement = computedSlots[k];
                  var slotStart:any = new Date(slotelement.slotstart.toDate())
                  var slotEnd:any = new Date(slotelement.slotend.toDate())
                  if((slotStart >= selectedSlot.start && slotStart < selectedSlot.end) || (slotEnd > selectedSlot.start && slotEnd < selectedSlot.end) || (selectedSlot.start >= slotStart && selectedSlot.start < slotEnd)){
                    if(!slotelement.booked){
                      slotelement.available = false
                    }
                    if(chosenelement.id == selectedAppointment && slotDoc.index == k && this.datepipe.transform(slotStart, "short") == this.datepipe.transform(selectedSlot.start, "short") && this.datepipe.transform(slotEnd, "short") == this.datepipe.transform(selectedSlot.end, "short")){
                      slotelement.booked = true
                    }
                  }
                }
              }
            }
            var availabilityDoc = doc(this.firestore, "availability/"+slotDoc.id)
            batch.update(availabilityDoc, chosenAppointment)
          // }).catch(err=>{
          //   console.log(err)
          // })
        }

        var hostRef = []
        hosts.forEach(data=>{
          hostRef.push(doc(this.firestore, data))
        })
        console.log("Host Ref", hostRef)

        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const element1 = this.appointmentRoles[i];
          var list = []
          hostRole[element1].forEach(people=>{
            list.push(doc(this.firestore, people))
          })
          hostRole[element1] = list
        }
        console.log("hostRole", hostRole)
        var docid = doc(collection(this.firestore,"appointments")).id
        var appointmentDoc = doc(this.firestore, "appointments/"+docid)
        var appointmentData = {
          docid: docid,
          starttime: selectedSlot.start,
          endtime: selectedSlot.end,
          appointment: doc(this.firestore, "appointmenttype/"+this.selectedAppointment.id),
          appointmentrole: requiredRoles,
          bookedby: doc(this.firestore, "profile_data/"+this.selectedUser),
          hosts: hostRef,
          hostRole,
          slotdata: selectedSlot.docdata,
          attended: false,
          cancelled: false,
          created: serverTimestamp(),
          loggedid: this.loggedinPID,
          productid: this.selectedAppointment.productid,
          // participantproductid: this.selectedUser
        }
        batch.set(appointmentDoc, appointmentData)
        await batch.commit().then(async(doc)=>{
          await this.createJourneyRecord(appointmentDoc.path)
          this.matDialog.closeAll()
          this.selectedAppointment = null
          this.selectedDate = null
          this.userAvailableSlots = []
          alert("Appointment Booked Successfully")
          if(this.goback){
            this.location.back()
          }
          this.onProfileSelect()
        }).catch(err=>{
          this.matDialog.closeAll()
          console.log(err)
        })
        this.matDialog.closeAll()
      }
      else{
        alert("Oop! The selected slot is no longer available. Try again")
      }
    }
  }

  async createJourneyRecord(apptPath:string){
    var productstatus = null
    var deliverySequence = []
    for (let i = 0; i < this.selectedAppointment.participantdelivery.products.length; i++) {
      const product = this.selectedAppointment.participantdelivery.products[i];
      for (let j = 0; j < product.delivery.length; j++) {
        const delivery = product.delivery[j];
        if(delivery.sequenceref.path == this.selectedAppointment.deliverypath){
          productstatus = product.status ?? "ongoing"
          delivery.status = "ongoing"
          console.log(product)
          var participantProductDoc = doc(this.firestore, "participantsproduct/"+product["participantproductid"])
          await updateDoc(participantProductDoc, {
            status: productstatus
          })
        }
      }
      deliverySequence.push({
        delivery: product.delivery,
        productref: product.productref,
        participantproductid: product.participantproductid
      })
    }
    // await this.firestore.collection("participantJourneySequence").doc(this.selectedAppointment.participantdelivery["profileid"]).update(this.selectedAppointment.journeyData)
    console.log(this.selectedAppointment.participantdelivery, deliverySequence)
    var sequenecDoc = doc(this.firestore, "participantdeliverysequence/"+this.selectedAppointment.participantdelivery["profileid"])
    await updateDoc(sequenecDoc, {
      products: deliverySequence
    })
    var deliveryDoc = doc(this.firestore, this.selectedAppointment.deliverypath)
    await updateDoc(deliveryDoc, {
      fileref: arrayUnion(doc(this.firestore, apptPath)),
      status: "ongoing"
    })
  }
}
