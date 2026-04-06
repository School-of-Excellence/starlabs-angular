import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
import { addDoc, collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { ProductDialogComponent } from '../product-dialog/product-dialog.component';
import { Location } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCalendar } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { platform } from 'os';

@Component({
  selector: 'app-schedule-dialog',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatCalendar,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  templateUrl: './schedule-dialog.component.html',
  styleUrl: './schedule-dialog.component.css'
})
export class ScheduleDialogComponent {
  displayedColumns: string[] = ['name', 'phonenumber', 'journey', 'product+bonus', 'purchasedate', 'onboardingtime', 'queries',
    'schedule', 'report', 'action'];
  dataSource = new MatTableDataSource()
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild('datepicker') datepicker: any;


  selectedDate;
  mindate

  selectedPlatform: 'zoom' | 'openvidu' | null = 'openvidu';
  platformError: boolean = false;



  products = [
    { product: 'uP! Live Event', category: 'Journey', minPayment: '120000/-', cumPayment: '20000/-', tentativeMonth: 'December', tentativePayment: '100000/-', extraPayment: '20000/-' },
    { product: 'WiSH', category: 'Bonus', minPayment: '100000/-', cumPayment: '20000/-', tentativeMonth: 'Select Month', tentativePayment: '-', extraPayment: '-' }
  ];

  availableMonths: string[] = ['October', 'November', 'December', 'January'];
  opencalender: boolean = false;
  mapjourneyname = {}
  mapproductname = {}
  mapProfile = {}
  mapphone = {}
  mapAppointments: any = {};
  loading = false
  superRole: boolean = false
  selectedAppointment = null
  selectedUser: string = null
  loggedinPID
  selectedSlot: number
  opencalenderfor: string | null = null;
  appointmentRoles = []
  rolePersons = {}
  appointmenttypes = []
  goback: boolean = false
  participantjourneyproduct: any
  appointmentdata: any
  userAvailableSlots = [{
    docdata: [{
      id: "",
      index: 0
    }],
    start: "",
    end: "",
    specialist: "",
    appointmentid: ""
  }]
  reschedule
  journey: any;
  participantjourneyproductid: any;
  profileid: any;
  generalnote: any;
  loggedinProfileRole = {}
  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private dialog: MatDialog,
    private firestore: Firestore,
    public guard: AuthguardService,
    public router: Router,
    public route: ActivatedRoute,
    public datepipe: DatePipe,
    public location: Location
  ) {
    this.userAvailableSlots = []
    guard.getRoles().then(async data => {
      this.loggedinPID = data.profile_ref.id
      this.loggedinProfileRole = data
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
            console.log(profileid)
            this.selectedUser = profileid
            this.goback = true
          }
        });
      }
      else {
        minimumDate = new Date(new Date().setDate(new Date().getDate() + 1))
        this.selectedUser = this.loggedinPID
      }
      this.mindate = datepipe.transform(minimumDate, "yyyy-MM-dd")
    });
  }

  ngOnInit() {
    this.participantjourneyproduct = this.data;
    this.reschedule = this.data.isReschedule;
    this.guard.getAppointmentMap().then(data => this.mapAppointments = data.map);

    this.mapProfile = this.participantjourneyproduct['mapProfile']
    this.mapphone = this.participantjourneyproduct['mapPhone']
    this.mapjourneyname = this.participantjourneyproduct['mapJourney']
    this.mapproductname = this.participantjourneyproduct['mapProduct']

    this.dataSource.data = [this.participantjourneyproduct];
    this.dataSource.paginator = this.paginator
    console.log(this.dataSource.data);

    this.getMyAppointment();
    if (![null, undefined, ""].includes(this.participantjourneyproduct['appointmentid'])) {
      getDoc(doc(this.firestore, "appointments", this.participantjourneyproduct['appointmentid'])).then(snap => {
        if (snap.exists()) {
          this.appointmentdata = snap.data()
          this.appointmentdata['bookingid'] = snap.id;
        }
      });
    }
  }

  async fetchData() {


  }

  ngAfterViewInit() {
    this.datepicker?.open();
  }


  scheduledate() {
    this.opencalender = true
    this.datepicker?.open();
    this.getMyAppointment()
  }

  selectPlatform(platform: 'zoom' | 'openvidu') {
    this.selectedPlatform = platform;
    this.platformError = false;
  }

  

  openProduct(element) {
    console.log(element);
    var dialogRef = this.dialog.open(ProductDialogComponent, {
      data: element,
      autoFocus: false,
      width: '500px',
      height: 'auto',
    })
    dialogRef.afterClosed().toPromise().then(value => {
      // console.log(value);

      if (value != null) { }
    })
  }

  async getMyAppointment() {
    // const dialogRef = this.dialog.open(LoadingProgressComponent, {
    //   disableClose: true,
    //   data: { type: "spinner", msg: "Getting Appointments..." }
    // });

    this.loading = true;
    let dataQuery = this.participantjourneyproduct.calltype == 'coach' ? 'journeycoach' : 'onboardingcall';
    await getDocs(query(collection(this.firestore, "appointmenttype"), where(dataQuery, '==', true))).then(res => {
      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.appointmenttypes.push({
          id: element['id'],
          appointment: element['appointmenttype']
        });
      }
    }).finally(() => {
      this.loading = false;
    });
    console.log(this.appointmenttypes, 'this.appointmenttypes');
  }

  async onAppointmentSelect() {
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    this.selectedDate = null
    this.selectedUser = this.participantjourneyproduct['profileid']
    const dialogRef = this.dialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Loading..." } })
    if (this.appointmenttypes.length > 0) {
      this.selectedAppointment = this.appointmenttypes[0];
    }
    console.log(this.selectedAppointment)
    this.appointmentRoles = []
    var additionalRoles = []
    this.rolePersons = {}
    await getDocs(query(collection(this.firestore, "AppointmentType-To-Roles"), where("assigned_appttype_ref", "==", doc(this.firestore, "appointmenttype", this.selectedAppointment.id)), limit(1))).then(roles => {
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
    await getDoc(doc(this.firestore, "customer_eismapping", this.selectedUser)).then(async priorAssigned => {
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
          await this.fetchAppointmentEIS(rolesOfAppt)
        }
      }
    })

    console.log(this.rolePersons)
    if (Object.keys(this.rolePersons).length == 0) {
      alert("No EIS are available for the selected Appointment")
    }
    dialogRef.close()
  }

  async fetchAppointmentEIS(role) {
    await getDocs(query(collection(this.firestore, "Roles-To-EIS"), where("assigned_role_ref", "==", doc(this.firestore, role)))).then(eisRole => {
      var eisRef = []
      console.log("eisroles", eisRole.docs.length);
      eisRole.docs.forEach(doc => {
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


  async onDateSelect(date) {
    await this.onAppointmentSelect()
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    var minimumDate = new Date(new Date(this.mindate).setHours(0, 0, 0))
    this.selectedDate = date
    console.log(this.selectedDate, 'this.selectedDate');

    if (this.selectedDate >= minimumDate) {
      const dialogRef = this.dialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Getting Your Slots..." } })
      var startDate: Date;
      var endDate: Date;
      console.log(this.superRole, 'this.superRole');

      if (this.superRole) {
        startDate = this.selectedDate
      }
      else {
        var currentDateTime = new Date()
        var selectedDateTime = new Date(new Date(this.selectedDate).setHours(new Date().getHours(), new Date().getMinutes(), 0))
        var hours = Math.floor((Math.abs(selectedDateTime.getTime() - currentDateTime.getTime())) / 1000 / 3600);
        if (hours > 24) {
          startDate = this.selectedDate
        }
        else {
          startDate = selectedDateTime
        }
        console.log(selectedDateTime);
      }
      console.log(this.selectedDate);
      endDate = new Date(new Date(startDate).setHours(23, 59, 59))

      var slotsOfEIS = []
      for (let i = 0; i < this.appointmentRoles.length; i++) {
        console.log(this.selectedAppointment.id, 'this.selectedAppointment.id');

        const roleOfAppointment = this.appointmentRoles[i];
        for (let j = 0; j < this.rolePersons[roleOfAppointment].length; j++) {
          const eisProfile = this.rolePersons[roleOfAppointment][j];
          await getDocs(query(collection(this.firestore, "availability"), where("profileref", "==", doc(this.firestore, eisProfile)), where("appointments", "array-contains", doc(this.firestore, "appointmenttype", this.selectedAppointment.id)), where("starttime", ">=", startDate), where("starttime", "<=", endDate))).then(availabilty => {
            console.log(eisProfile, " - ", availabilty.size)
            availabilty.forEach(slots => {
              var localSlot = slots.data()[this.selectedAppointment.id]
              console.log(localSlot);
              if (localSlot != undefined && localSlot != null && localSlot.length != 0) {
                for (let a = 0; a < localSlot.length; a++) {
                  var data = localSlot[a]
                  if (data.booked == false && data.available == true) {
                    slotsOfEIS.push({
                      slotstart: data.slotstart.toDate(),
                      slotend: data.slotend.toDate(),
                      docid: slots.id,
                      index: a,
                      eisprofile: eisProfile,
                      appointmentid: this.selectedAppointment.id,
                      appointmentrole: roleOfAppointment
                    })
                  }
                }
              }
            })
          })
        }
      }
      slotsOfEIS.sort((a, b) => a.slotstart - b.slotstart)
      console.log(slotsOfEIS)

      var slotByRoles = []
      for (let i = 0; i < this.appointmentRoles.length; i++) {
        var data = {}
        var totalEIS = slotsOfEIS.filter(e => e.appointmentrole == this.appointmentRoles[i])
        if (totalEIS.length != 0) {
          data[this.appointmentRoles[i]] = totalEIS
          slotByRoles.push(data)
        }
      }
      console.log(slotByRoles)
      if (slotByRoles.length != this.appointmentRoles.length) {
        alert("EIS Slots not available for the selected date. Try again!")
      }
      else {
        this.mergeEISslots(slotByRoles)
      }
      dialogRef.close()
    }
  }

  mergeEISslots(slots: Array<any>) {

    console.log("slots", slots);
    
    var mergedSlots = [{
      docdata: [{
        id: "",
        index: 0
      }],
      start: "",
      end: "",
      specialist: "",
      appointmentid: ""
    }]
    mergedSlots = []
    if (slots.length == 0) {
      alert("No slots available")
      return
    }
    else if (slots.length == 1) {
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        mergedSlots.push({
          start: slot1.slotstart,
          end: slot1.slotend,
          appointmentid: slot1.appointmentid,
          specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id],
          docdata: [{
            id: slot1.docid,
            index: slot1.index
          }],
        })
      }
    }
    else if (slots.length == 2) {
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      var roleSlot2 = slots[1][this.appointmentRoles[1]]

      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          if (this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") && slot1.eisprofile != slot2.eisprofile) {
            mergedSlots.push({
              start: slot1.slotstart,
              end: slot1.slotend,
              appointmentid: slot1.appointmentid,
              specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot2.eisprofile).id],
              docdata: [
                { id: slot1.docid, index: slot1.index },
                { id: slot2.docid, index: slot2.index },
              ],
            })
          }
        }
      }
    }
    else if (slots.length == 3) {
      var roleSlot1 = slots[0][this.appointmentRoles[0]]
      var roleSlot2 = slots[1][this.appointmentRoles[1]]
      var roleSlot3 = slots[2][this.appointmentRoles[2]]
      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          for (let k = 0; k < roleSlot3.length; k++) {
            const slot3 = roleSlot3[k];
            if (
              this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") &&
              this.datepipe.transform(slot2.slotstart, "short") == this.datepipe.transform(slot3.slotstart, "short") &&
              this.datepipe.transform(slot3.slotstart, "short") == this.datepipe.transform(slot1.slotstart, "short") &&
              slot1.eisprofile != slot2.eisprofile && slot2.eisprofile != slot3.eisprofile && slot3.eisprofile != slot1.eisprofile
            ) {
              mergedSlots.push({
                start: slot1.slotstart,
                end: slot1.slotend,
                appointmentid: slot1.appointmentid,
                specialist: this.mapProfile[doc(this.firestore, slot1.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot2.eisprofile).id] + ", " + this.mapProfile[doc(this.firestore, slot3.eisprofile).id],
                docdata: [
                  { id: slot1.docid, index: slot1.index },
                  { id: slot2.docid, index: slot2.index },
                  { id: slot3.docid, index: slot3.index },
                ],
              })
            }
          }
        }
      }
    }

    this.userAvailableSlots = mergedSlots
    console.log('avilableslots',this.userAvailableSlots)
    if (this.userAvailableSlots.length == 0) {
      alert("No Slots available on the selected date")
    }
  }


  async confirmSlot(slot) {
    console.log(slot);

    // var similarSlot = this.shuffle(this.userAvailableSlots.filter(e => this.datepipe.transform(e.start, "short") == this.datepipe.transform(this.displaySlot[this.selectedSlot].starttime, "short")))
    // console.log(similarSlot)

    // if(similarSlot.length == 0){
    //   alert("Choose At least one Slot")
    // }
    // else{
    //   for (let a = 0; a < similarSlot.length; a++) {
    // var selectedSlot = this.userAvailableSlots[this.selectedSlot]
    var selectedSlot = slot


    // var selectedSlot = similarSlot[a]
    console.log(selectedSlot)

    var selectedDate = this.datepipe.transform(selectedSlot.start, "fullDate")
    var starttime = this.datepipe.transform(selectedSlot.start, "shortTime")
    var endtime = this.datepipe.transform(selectedSlot.end, "shortTime")

    var requiredRoles = []
    for (let i = 0; i < this.appointmentRoles.length; i++) {
      const element = this.appointmentRoles[i];
      requiredRoles.push(doc(this.firestore, element))
    }
    var hosts = []
    var hostRole = {}

    if (confirm("Confirm your appointment on " + selectedDate + " at " + starttime)) {
      const dialogRef = this.dialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Booking Your Slots..." } })
      var availablility = []
      for (let i = 0; i < selectedSlot.docdata.length; i++) {
        const slotDoc = selectedSlot.docdata[i];
        await getDoc(doc(this.firestore, "availability", slotDoc.id)).then(available => {
          if (available.data()[this.selectedAppointment.id] != null) {
            hosts.push(available.data()['profileref']['path'])
            availablility.push(available.data()[this.selectedAppointment.id][slotDoc.index].booked == false && available.data()[this.selectedAppointment.id][slotDoc.index].available == true)
          }
        })
      }

      if (!availablility.includes(false)) {
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const element1 = this.appointmentRoles[i];
          console.log(element1)
          for (let j = 0; j < hosts.length; j++) {
            const element2 = hosts[j];
            console.log(element2)
            console.log(this.rolePersons[element1])
            if (this.rolePersons[element1].includes(element2)) {
              if (hostRole[element1] == undefined || hostRole[element1] == null) {
                hostRole[element1] = []
              }
              if (!hostRole[element1].includes(element2)) {
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
          getDoc(doc(this.firestore, "availability", slotDoc.id)).then(available => {
            var chosenAppointment = available.data()
            for (let j = 0; j < chosenAppointment["appointments"].length; j++) {
              const chosenelement = chosenAppointment["appointments"][j];
              var computedSlots = chosenAppointment[chosenelement.id]
              if (computedSlots != null || computedSlots != undefined) {
                for (let k = 0; k < computedSlots.length; k++) {
                  const slotelement = computedSlots[k];
                  var slotStart: any = new Date(slotelement.slotstart.toDate())
                  var slotEnd: any = new Date(slotelement.slotend.toDate())
                  if ((slotStart >= selectedSlot.start && slotStart < selectedSlot.end) || (slotEnd > selectedSlot.start && slotEnd < selectedSlot.end) || (selectedSlot.start >= slotStart && selectedSlot.start < slotEnd)) {
                    if (!slotelement.booked) {
                      slotelement.available = false
                    }
                    if (chosenelement.id == selectedAppointment && slotDoc.index == k && this.datepipe.transform(slotStart, "short") == this.datepipe.transform(selectedSlot.start, "short") && this.datepipe.transform(slotEnd, "short") == this.datepipe.transform(selectedSlot.end, "short")) {
                      slotelement.booked = true
                    }
                  }
                }
              }
            }
            updateDoc(available.ref, chosenAppointment).catch(err => {
              console.log(slotDoc.id)
            })
          }).catch(err => {
            console.log(err)
          })
        }

        var hostRef = []
        hosts.forEach(data => {
          hostRef.push(doc(this.firestore, data))
        })

        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const element1 = this.appointmentRoles[i];
          var list = []
          hostRole[element1].forEach(people => {
            list.push(doc(this.firestore, people))
          })
          hostRole[element1] = list
        }

        var map = {
          starttime: selectedSlot.start,
          endtime: selectedSlot.end,
          appointment: doc(this.firestore, "appointmenttype", this.selectedAppointment.id),
          appointmentrole: requiredRoles,
          bookedby: doc(this.firestore, "profile_data", this.participantjourneyproduct.profileid),
          hosts: hostRef,
          hostRole,
          slotdata: selectedSlot.docdata,
          attended: false,
          cancelled: false,
          created: new Date(),
          loggedid: this.loggedinPID,
          journeyid: this.participantjourneyproduct.calltype == 'onboarding' ? this.participantjourneyproduct['journeyref'].id : null,
          participantjourneyproductid: this.participantjourneyproduct.calltype == 'onboarding' ? this.participantjourneyproduct['docid'] : null,
          journeycoach: true,
          platform: this.selectedPlatform
        }

        if (this.participantjourneyproduct.calltype == 'onboarding') {
          map['onboarding'] = true;
        }

        try {
          const newDocRef = doc(collection(this.firestore, "appointments"));
          map['docid'] = newDocRef.id;
          await setDoc(newDocRef, map);

          if (this.participantjourneyproduct.calltype == 'onboarding') {
            await updateDoc(doc(this.firestore, "participantjourneyproduct", this.participantjourneyproduct['docid']),
              {
                onboardingscheduled: new Date(selectedSlot.start),
                onboardedby: hostRef,
                appointmentid: newDocRef.id, 
                orientationstatus: "scheduled"
              }
            );
          }

          this.dialog.closeAll();
          this.selectedAppointment = null;
          this.selectedDate = null;
          this.userAvailableSlots = [];

          alert("Appointment Booked Successfully");

          if (this.goback) {
            this.location.back();
          }

        } catch (err) {
          alert('Failed to book appointment. Please try again.');

          if (dialogRef) {
            dialogRef.close();
          }
        }
        dialogRef.close()
      }
      else {
        alert("Oop! The selected slot is no longer available. Try again")
      }
    }
  }
  closedialog() {
    this.dialogRef.close()
  }

  async cancelAppointment() {
    console.log(this.appointmentdata);

    this.guard.cancelAppointment(this.appointmentdata)
    var generalnotes = {
      note: this.generalnote,
      updatedby: this.loggedinPID,
      updated: new Date()
    }

    // if (this.participantjourneyproduct.callType == 'onboarding') {
    //   await updateDoc(doc(this.firestore, "participantjourneyproduct", this.participantjourneyproduct['docid']), {
    //     onboardingscheduled: null,
    //     onreschedule: true,
    //   });
    // }

    this.participantjourneyproduct['generalnotes'] = this.participantjourneyproduct['generalnotes'] || []
    this.participantjourneyproduct['generalnotes'].push(generalnotes)

    updateDoc(doc(this.firestore, "participant metadata", this.participantjourneyproduct['profileid']), {
      generalnotes: this.participantjourneyproduct['generalnotes']
    }).then(() => {
      console.log("Appointment Cancelled Successfully");
      this.guard.openSnackBar("Appointment Cancelled Successfully", "OK",600);
    }).catch((error) => {
      this.guard.openSnackBar("Oops! Error While Cancelling Appointment", "OK",600);
      console.error("Oops! Error While Cancelling Appointment");
    });

    if (this.reschedule != false) {
      this.opencalender = this.opencalenderfor === this.participantjourneyproduct ? false : true;
      this.opencalenderfor = this.opencalender ? this.participantjourneyproduct : null;
      this.journey = this.participantjourneyproduct.journeyid
      this.participantjourneyproductid = this.participantjourneyproduct.participantjourneyproductid

      if (this.opencalender) {
        this.selectedDate = null;
        this.profileid = this.appointmentdata.bookedby.id
        this.participantjourneyproduct['appointmentid'] = this.participantjourneyproduct.bookingid
        try {
          const snap = await getDocs(query(collection(this.firestore, "participantJourneySequence"), where('journeyref', '==', doc(this.firestore, "journey", this.participantjourneyproduct.journeyid)), where('profileid', '==', this.appointmentdata['bookedby'].id)))
          if (snap.docs.length > 0) {
            this.participantjourneyproduct['participantjourneyid'] = snap.docs[0].id;
          } else {
            console.error("No matching document found for journeyref:", this.appointmentdata.journeyid, "and profileid:", this.appointmentdata['bookedby'].id);
          }
        } catch (error) {
          console.error("Error fetching participant journey ID:", error);
        }

        console.log(this.participantjourneyproduct['participantjourneyid']);
        await this.getMyAppointment();
      }
    }
    this.dialogRef.close()
  }




}
