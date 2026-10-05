import { CommonModule, DatePipe, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { AppointmentBookingService, BookSlot, EisSlot } from './appointment-booking.service';
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
export class BookAppointmentComponent implements OnInit, OnChanges{

  /* Optional filter, set only by the Specialist Appointment Studio's Book Session tab: narrows the
     participant's products and appointment types. null = no filter, so /bookappointment is unchanged. */
  @Input() filterProductId: string | null = null
  @Input() filterTypeIds: string[] | null = null

  shownProducts(products: any[]) {
    return (products ?? []).filter(p => !this.filterProductId || p.productid == this.filterProductId)
  }

  shownAppointments(product: any) {
    return (product.appointment ?? []).filter(a => !this.filterTypeIds || this.filterTypeIds.includes(a.id))
  }

  /* A picked appointment the new filter hides is dropped, with its date and slots. */
  ngOnChanges() {
    const a: any = this.selectedAppointment
    if (a && ((this.filterProductId && a.productid != this.filterProductId) || (this.filterTypeIds && !this.filterTypeIds.includes(a.id)))) {
      this.selectedAppointment = null
      this.selectedDate = null
      this.selectedSlot = null
      this.userAvailableSlots = []
    }
  }

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

  userAvailableSlots: BookSlot[] = []
  
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
    private location: Location,
    private booking: AppointmentBookingService
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
    // Roles and their specialists: AppointmentBookingService.rolesFor (shared with the studio's calendar booking).
    const plan = await this.booking.rolesFor(this.selectedAppointment.id, this.selectedUser)
    this.appointmentRoles = plan.roles
    this.rolePersons = plan.rolePersons

    console.log(this.rolePersons)
    if(Object.keys(this.rolePersons).length == 0){
      alert("No EIS are available for the selected Appointment")
    }
    this.matDialog.closeAll()
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

      var rolesWithSlots = this.appointmentRoles.filter(role => slotsOfEIS.some(e => e.appointmentrole == role))
      if(rolesWithSlots.length != this.appointmentRoles.length){
        alert("EIS Slots not available for the selected date. Try again!")
      }
      else{
        this.mergeEISslots(slotsOfEIS)
      }
      this.matDialog.closeAll()
    }
  }

  /* One slot per role at the same start, each a different specialist (AppointmentBookingService.mergeSlots). */
  mergeEISslots(slotsOfEIS: EisSlot[]){
    this.userAvailableSlots = this.booking.mergeSlots(slotsOfEIS, this.appointmentRoles, id => this.mapProfile[id])
    console.log(this.userAvailableSlots)
    if(this.userAvailableSlots.length == 0){
      alert("No Slots available on the selected date")
    }
  }

  async confirmSlot(){
    var selectedSlot = this.userAvailableSlots[this.selectedSlot]
    console.log(selectedSlot)
    if(!selectedSlot){
      alert("Select a Slot to Book!")
      return
    }

    var selectedDate = this.datepipe.transform(selectedSlot.start, "fullDate")
    var starttime = this.datepipe.transform(selectedSlot.start, "shortTime")

    if(confirm("Confirm your appointment on " + selectedDate + " at " + starttime)){
      this.matDialog.open(LoadingProgressComponent, {disableClose : true, data : {type : "spinner", msg : "Booking Your Slots..."}})
      try {
        // The write itself: AppointmentBookingService.book (shared with the studio's calendar booking).
        const result = await this.booking.book({
          slot: selectedSlot,
          typeId: this.selectedAppointment.id,
          plan: { roles: this.appointmentRoles, rolePersons: this.rolePersons },
          participantId: this.selectedUser,
          target: this.selectedAppointment,
          loggedinPID: this.loggedinPID,
        })
        this.matDialog.closeAll()
        if(result == "unavailable"){
          alert("Oop! The selected slot is no longer available. Try again")
          return
        }
        this.selectedAppointment = null
        this.selectedDate = null
        this.userAvailableSlots = []
        alert("Appointment Booked Successfully")
        if(this.goback){
          this.location.back()
        }
        this.onProfileSelect()
      } catch (err) {
        this.matDialog.closeAll()
        console.log(err)
      }
    }
  }
}
