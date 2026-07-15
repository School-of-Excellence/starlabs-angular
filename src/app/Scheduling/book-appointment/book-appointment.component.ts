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
import { AppointmentBookingService } from '../../appointment-booking.service';

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
export class BookAppointmentComponent implements OnInit {

  mindate
  loggedinPID

  superRole: boolean = false
  selectedUser: string = null
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
    docdata: [{
      id: "",
      index: 0
    }],
    start: "",
    end: "",
    specialist: "",
  }]

  selectedSlot: number
  appointmentRoles = []
  rolePersons = {}
  filteredProfile = ""
  goback: boolean = false

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private http: HttpClient,
    private datepipe: DatePipe,
    private matDialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private bookingService: AppointmentBookingService 
  ) {
    this.clientJourney = []
    this.userAvailableSlots = []
    guard.getRoles().then(async data => {
      this.loggedinPID = data.profile_ref.id
      var adminRole = data.admin != null ? data.admin : false
      var schedulerRole = data.scheduler != null ? data.scheduler : false
      var ahRole = data.ah != null ? data.ah : false
      this.superRole = adminRole || schedulerRole || ahRole
      var minimumDate: Date
      if (this.superRole) {
        minimumDate = new Date()
        this.route.queryParams.subscribe(param => {
          if (param["pid"] != null) {
            var profileid = param["pid"]
            this.selectedUser = profileid
            this.onProfileSelect()
            this.goback = true
          }
        })
      }
      else {
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
    this.guard.getProfileMap().then(data => {
      this.profileList = data.list,
        this.mapProfile = data.map
    })
  }

  returnClient() {
    return this.profileList.filter(e => e.name.toLowerCase().includes(this.filteredProfile.toLowerCase()))
  }

  async onProfileSelect() {
    this.clientJourney = []
    this.userAvailableSlots = []
    this.selectedSlot = null
    this.selectedDate = null
    this.selectedAppointment = null
    this.getMyAppointment()
  }

  async getMyAppointment() {
    this.matDialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Getting Appointments..." } })

    var participantProductcollection = collection(this.firestore, "participantsproduct")
    var productQuery = query(participantProductcollection, where("status", "in", ["initiated", "ongoing"]))
    await getDocs(productQuery).then(async participantproducts => {
      var participantproductid = participantproducts.docs.map(e => e.id)
      var mapDeliverables = []
      var deliverableCollection = collection(this.firestore, "deliverables")
      var deliveryQuery
      if (this.superRole) {
        deliveryQuery = query(deliverableCollection, where("profileid", "==", this.selectedUser), where("type", "==", "appointment"))
      }
      else {
        deliveryQuery = query(deliverableCollection, where("profileid", "==", this.selectedUser), where("type", "==", "appointment"), where("status", "==", "ready"))
      }
      await getDocs(deliveryQuery).then(deliverables => {
        for (let i = 0; i < deliverables.docs.length; i++) {
          const element = deliverables.docs[i];
          mapDeliverables[element.ref.path] = element
        }
      })
      var deliverySequenceDoc = doc(this.firestore, "participantdeliverysequence/" + this.selectedUser)
      await getDoc(deliverySequenceDoc).then(async participantdelivery => {
        if (participantdelivery.exists()) {
          var productSequence = []
          var products = participantdelivery.data()["products"].filter(e => participantproductid.includes(e.participantproductid))
          for (let j = 0; j < products.length; j++) {
            const productitem = products[j];
            var deliverySequence = []
            var deliveryActivity = []
            if (this.superRole) {
              deliveryActivity = productitem.delivery.filter(e => e.type == "appointment" && (e.status == "ready" || e.status == null))
            }
            else {
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
        else {
          alert("No Delivery Sequence Found")
        }
      })
    })
    this.matDialog.closeAll()
  }

  async onAppointmentSelect() {
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    this.selectedDate = null
    this.matDialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Loading..." } })
    console.log(this.selectedAppointment)
    this.appointmentRoles = []
    var additionalRoles = []
    this.rolePersons = {}

    var apptRoleCollection = collection(this.firestore, "AppointmentType-To-Roles")
    var apptRoleQuery = query(apptRoleCollection, where("assigned_appttype_ref", "==", doc(this.firestore, "appointmenttype/" + this.selectedAppointment.id)), limit(1))
    await getDocs(apptRoleQuery).then(roles => {
      roles.forEach(doc => {
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

    var customerMappingDoc = doc(this.firestore, "customer_eismapping/" + this.selectedUser)
    await getDoc(customerMappingDoc).then(async priorAssigned => {
      if (priorAssigned.exists()) {
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const rolesOfAppt = this.appointmentRoles[i];
          if (priorAssigned.data()["eisroles"][rolesOfAppt] != null) {
            var assignedAgents = []
            for (let j = 0; j < priorAssigned.data()["eisroles"][rolesOfAppt].length; j++) {
              assignedAgents.push(priorAssigned.data()["eisroles"][rolesOfAppt][j]["path"]);
            }
            this.rolePersons[rolesOfAppt] = assignedAgents
          }
          else {
            await this.fetchAppointmentEIS(rolesOfAppt)
          }
        }
        for (let i = 0; i < additionalRoles.length; i++) {
          const rolesOfAppt = additionalRoles[i];
          if (priorAssigned.data()["eisroles"][rolesOfAppt] != null) {
            this.appointmentRoles.push(rolesOfAppt)
            var assignedAgents = []
            for (let j = 0; j < priorAssigned.data()["eisroles"][rolesOfAppt].length; j++) {
              assignedAgents.push(priorAssigned.data()["eisroles"][rolesOfAppt][j]["path"]);
            }
            this.rolePersons[rolesOfAppt] = assignedAgents
          }
        }
      }
      else {
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const rolesOfAppt = this.appointmentRoles[i];
          console.log("Fetch 2")
          await this.fetchAppointmentEIS(rolesOfAppt)
        }
      }
    })

    console.log(this.rolePersons)
    if (Object.keys(this.rolePersons).length == 0) {
      alert("No EIS are available for the selected Appointment")
    }
    this.matDialog.closeAll()
  }

  async fetchAppointmentEIS(role) {
    var eisRoleCollection = collection(this.firestore, "Roles-To-EIS")
    var eisRoleQuery = query(eisRoleCollection, where("assigned_role_ref", "==", doc(this.firestore, role)))
    await getDocs(eisRoleQuery).then(eisRole => {
      var eisRef = []
      eisRole.forEach(doc => {
        doc.data()["assigned_eis"].forEach(element => {
          if (element.id != this.selectedUser) {
            eisRef.push(element.path)
          }
        })
      })
      console.log(eisRef)
      this.rolePersons[role] = eisRef
    })
  }

  async onDateSelect() {
    this.userAvailableSlots = await this.bookingService.onDateSelect({
      mindate: this.mindate,
      selectedDate: this.selectedDate,
      superRole: this.superRole,
      appointmentRoles: this.appointmentRoles,
      rolePersons: this.rolePersons,
      selectedAppointment: this.selectedAppointment,
      selectedUserProfileMap: this.mapProfile
    });
    this.selectedSlot = null;
  }

  async confirmSlot() {
    const success = await this.bookingService.confirmSlot({
      userAvailableSlots: this.userAvailableSlots,
      selectedSlotIndex: this.selectedSlot,
      appointmentRoles: this.appointmentRoles,
      rolePersons: this.rolePersons,
      selectedAppointment: this.selectedAppointment,
      selectedUser: this.selectedUser,
      loggedinPID: this.loggedinPID
    });
    if (success) {
      this.selectedAppointment = null;
      this.selectedDate = null;
      this.userAvailableSlots = [];
      alert("Appointment Booked Successfully");
      if (this.goback) this.location.back();
      this.onProfileSelect();
    }
  }
}
