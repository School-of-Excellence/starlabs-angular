import { AfterViewInit, Component, Inject, OnInit, ViewChild } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { collection, doc, Firestore, getDoc, getDocs, query, where, limit, updateDoc, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'app-reschedule-dialog',
  imports: [
    MatProgressSpinnerModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule
  ],
  templateUrl: './reschedule-dialog.component.html',
  styleUrl: './reschedule-dialog.component.css'
})
export class RescheduleDialogComponent {

  loading: boolean = false;
  isRescheduling: boolean = false;
  opencalender: boolean = false;
  superRole: boolean = false;
  goback: boolean = false
  coachesList = []

  mapappointments = {
    scheduled: { data: [] },
    inprocess: { data: [] },
    completed: { data: [] }
  };
  mapProfile = {};
  mapphone = {};
  mapjourneyname = {};
  mapAppointmentname = {}
  rolePersons = {}

  filterForm: FormGroup

  appointmentRoles = []
  appointmenttypes = []
  userAvailableSlots = [{
    docdata: [{
      id: "",
      index: 0
    }],
    start: "",
    end: "",
    specialist: "",
  }];
  ahmember = []

  displayedColumns: string[] = ['name', 'mobileNumber', 'journey', 'purchasedate', 'onboardeddate', 'salesperson', 'deliveryDate', 'Onborded By'];
  dataSourceCompleted = new MatTableDataSource;
  @ViewChild('paginatorCompleted') paginatorCompleted: MatPaginator;
  @ViewChild('sortCompleted') sortCompleted: MatSort;

  today: Date = new Date();
  selectedDate: Date;
  selectedTab: number = 0;
  selectedSlot: number

  opencalenderfor: string | null = null;
  selectedAppointment = null
  selectedUser: string = null
  loggedinPID
  mindate

  participantjourneyproduct: any;
  participantjourneyproductid: any;
  @ViewChild('datepicker') datepicker: any;

  journey: string | null = null;
  profileid: string | null = null;
  selectedJourneyName: string | null = null;


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private guard: AuthguardService,
    private dialog: MatDialog,
    public datepipe: DatePipe,
    public location: Location,
    public route: ActivatedRoute,
    private formbuilder: FormBuilder
  ) {

    this.userAvailableSlots = [];
    console.log(this.data);

    this.filterForm = this.formbuilder.group({
      name: [''],
      onboardedby: [''],
      dateRange: this.formbuilder.group({
        start: [''],
        end: ['']
      }),
      purchasedate: this.formbuilder.group({
        start: [''],
        end: ['']
      }),
    });

    this.mapProfile = this.data['mapProfile'];
    this.mapphone = this.data['mapPhone'];
    this.mapjourneyname = this.data['mapJourney'];

    this.guard.getAppointmentMap().then(data => this.mapAppointmentname = data);

    guard.getRoles().then(async data => {

      this.loggedinPID = data.profile_ref.id
      var adminRole = data.admin != null ? data.admin : false
      var schedulerRole = data.scheduler != null ? data.scheduler : false
      var ahRole = data.ah != null ? data.ah : false
      this.ahmember.push(data.ahmember)
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
        })
      }
      else {
        minimumDate = new Date(new Date().setDate(new Date().getDate() + 1))
        this.selectedUser = this.loggedinPID
      }
      this.mindate = datepipe.transform(minimumDate, "yyyy-MM-dd")
    });

  }

  ngOnInit() {
    this.fetchdata();
    // Subscribe to filter changes
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  ngAfterViewInit() {
    this.datepicker?.open();
    // this.dataSourceScheduled.paginator = this.paginatorScheduled;
    this.dataSourceCompleted.paginator = this.paginatorCompleted;
    this.dataSourceCompleted.sort = this.sortCompleted;
  }

  onTabChange(index: number) {
    this.selectedTab = index;
  }

  getDaysDifference(timestamp1, timestamp2): number {

    const date1 = timestamp1.toDate();
    const date2 = timestamp2.toDate();

    const diffTime = Math.abs(date2.getTime() - date1.getTime());

    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  calculateAverage() {
    return 10
  }

  applyFilters() {
    this.dataSourceCompleted.filterPredicate = (data: any, filter: string) => {
      // Get filter values
      const filterValue = JSON.parse(filter);
      const onboardedby = filterValue.onboardedby;
      const startDate = filterValue.dateRange.start ? new Date(filterValue.dateRange.start) : null;
      const endDate = filterValue.dateRange.end ? new Date(filterValue.dateRange.end) : null;

      const purchasestartDate = filterValue.purchasedate.start ? new Date(filterValue.purchasedate.start) : null;
      const purchaseendDate = filterValue.purchasedate.end ? new Date(filterValue.purchasedate.end) : null;

      // Apply coach filter
      const coachMatch = !onboardedby || this.mapProfile[data.onboardedby?.[0]?.id] === onboardedby;

      const searchTerm = filterValue.name ? filterValue.name.trim().toLowerCase() : '';
      const name = this.mapProfile[data['profileid']] ? this.mapProfile[data['profileid']] : '';

      let isMatch = true;
      if (searchTerm && name) {
        isMatch = isMatch && name.toLowerCase().includes(searchTerm);
      }

      // Apply date range filter
      let dateMatch = true;
      if (startDate && endDate) {
        const onboardedDate = ![null, undefined, ''].includes(data.onboardedtime) ? (data.onboardedtime instanceof Date ? data.onboardedtime : new Date(data.onboardedtime.toDate())) : null;
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        dateMatch = onboardedDate ? (onboardedDate >= startDate && onboardedDate <= endDate) : false;
      }

      let purchasedateMatch = true;
      if (purchasestartDate && purchaseendDate) {
        const purchaseDate = ![null, undefined, ''].includes(data.purchasedate) ? (data.purchasedate instanceof Date ? data.purchasedate : new Date(data.purchasedate.toDate())) : null;
        // Set end date to end of day
        purchaseendDate.setHours(23, 59, 59, 999);
        purchasedateMatch = purchaseDate ? (purchaseDate >= purchasestartDate && purchaseDate <= purchaseendDate) : false;
      }

      // Return true if all filters match
      return coachMatch && dateMatch && purchasedateMatch && isMatch;
    };

    // Apply the filter
    this.dataSourceCompleted.filter = JSON.stringify(this.filterForm.value);


    // If paginator exists, go back to first page
    if (this.dataSourceCompleted.paginator) {
      this.dataSourceCompleted.paginator.firstPage();
    }
  }

  resetFilters() {
    this.filterForm.reset({
      onboardedby: '',
      opportunityType: '',
      dateRange: {
        start: '',
        end: ''
      },
      purchasedate: {
        start: '',
        end: '',
      }
    });
    this.dataSourceCompleted.filter = '';
  }

  async fetchdata() {
    //Scheduled

    this.loading = true;

    this.mapappointments['completed']['data'] = [];
    await getDocs(query(collection(this.firestore, 'participantjourneyproduct'), where("onboarded", "==", true))).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();

        if (element['onboarded'] === true) {
          this.mapappointments['completed']['data'].push(element);
        }

      }
      this.dataSourceCompleted.data = this.mapappointments['completed']['data'].sort((a, b) => b['onboardedtime'] - a['onboardedtime']);
      this.dataSourceCompleted.paginator = this.paginatorCompleted;
      this.dataSourceCompleted.sort = this.sortCompleted;

      this.loading = false;

    });
  }



  calculateAverageDeliveryDays(): number {
    if (this.dataSourceCompleted.data.length === 0) return 0;

    let totalDays: any = this.dataSourceCompleted.data.reduce((sum: number, element: any) => {
      let days;
      if (![null, undefined, ''].includes(element['purchasedate']) && ![null, undefined, ''].includes(element['onboardedtime'])) {
        days = this.getDaysDifference(element['purchasedate'], element['onboardedtime']);
      } else {
        days = 0;
      }
      return sum + days;
    }, 0);

    return Math.round(totalDays / this.dataSourceCompleted.data.length);
  }

  isPastDate(date: any): boolean {
    if ([null, undefined, ''].includes(date)) return null
    const currentDate = new Date();
    return date.toDate() < currentDate;
  }

  async scheduledate(element) {
    element.isRescheduling = true
    var appointmentdata
    await getDoc(doc(this.firestore, 'appointments', element['appointmentid'])).then(res => {
      appointmentdata = res.data()
      appointmentdata['bookingid'] = res.id
    })
    this.guard.cancelAppointment(appointmentdata)
    if (element.isRescheduling != false) {
      this.opencalender = this.opencalenderfor === element ? false : true;
      this.opencalenderfor = this.opencalender ? element : null;
      this.journey = element.journeyid
      this.participantjourneyproductid = element.participantjourneyproductid
      console.log(this.journey);

      if (this.opencalender) {
        this.selectedDate = null;
        this.profileid = element.bookedby.id
        element['appointmentid'] = element.bookingid
        console.log(element['bookingid']);
        try {
          const snap = await getDocs(query(collection(this.firestore, 'participantJourneySequence'), where('journeyref', '==', doc(this.firestore, 'journey', element.journeyid)), where('profileid', '==', element['bookedby'].id)));

          if (snap.docs.length > 0) {
            element['participantjourneyid'] = snap.docs[0].id;
          } else {
            console.error("No matching document found for journeyref:", element.journeyid, "and profileid:", element['bookedby'].id);
          }
        } catch (error) {
          console.error("Error fetching participant journey ID:", error);
        }

        console.log(element['participantjourneyid']);
        await this.getMyAppointment();
      }
    }
  }

  async getMyAppointment() {

    this.loading = true;
    await getDocs(query(collection(this.firestore, 'appointmenttype'), where('journeycoach', '==', true))).then(res => {

      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.appointmenttypes.push({
          id: element['id'],
          appointment: element['appointmenttype']
        });
      }
    })
      .finally(() => {
        this.loading = false;
      });

    console.log(this.appointmenttypes, 'this.appointmenttypes');

  }

  async onAppointmentSelect() {
    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    this.selectedDate = null
    this.selectedUser = this.profileid
    const dialogRef = this.dialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Loading..." } })
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
            console.log("Fetch 1")
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
    dialogRef.close()
  }

  async fetchAppointmentEIS(role) {
    await getDocs(query(collection(this.firestore, "Roles-To-EIS"), where("assigned_role_ref", "==", doc(this.firestore, role)))).then(eisRole => {
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
    console.log('working....');

    this.userAvailableSlots = []
    // this.displaySlot = []
    this.selectedSlot = null
    var minimumDate = new Date(new Date(this.mindate).setHours(0, 0, 0))
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
    var mergedSlots = [{
      docdata: [{
        id: "",
        index: 0
      }],
      start: "",
      end: "",
      specialist: "",
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
        console.log(slot1.eisprofile, 'id');

        mergedSlots.push({
          start: slot1.slotstart,
          end: slot1.slotend,
          specialist: this.mapProfile[slot1.eisprofile.split('/').pop()],
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
              specialist: this.mapProfile[slot1.eisprofile.split('/').pop()] + ", " + this.mapProfile[slot2.eisprofile.split('/').pop()],
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
                specialist: this.mapProfile[slot1.eisprofile.split('/').pop()] + ", " + this.mapProfile[slot2.eisprofile.split('/').pop()] + ", " + this.mapProfile[slot3.eisprofile.split('/').pop()],
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
    console.log(this.userAvailableSlots)
    /*
    for (let i = 0; i < this.userAvailableSlots.length; i++) {
      const element = this.userAvailableSlots[i];
      var timeValue = this.datepipe.transform(element.start, "shortTime")
      var slotValue = {
        value: timeValue,
        starttime: element.start
      }
      if(this.displaySlot.filter(e => e.value == timeValue).length == 0)  {
        this.displaySlot.push(slotValue)
      }
    }
    */
    if (this.userAvailableSlots.length == 0) {
      alert("No Slots available on the selected date")
    }
  }


  async confirmSlot() {
    // var similarSlot = this.shuffle(this.userAvailableSlots.filter(e => this.datepipe.transform(e.start, "short") == this.datepipe.transform(this.displaySlot[this.selectedSlot].starttime, "short")))
    // console.log(similarSlot)

    // if(similarSlot.length == 0){
    //   alert("Choose At least one Slot")
    // }
    // else{
    //   for (let a = 0; a < similarSlot.length; a++) {
    var selectedSlot = this.userAvailableSlots[this.selectedSlot]
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
      console.log(availablility)
      if (!availablility.includes(false)) {
        for (let i = 0; i < this.appointmentRoles.length; i++) {
          const element1 = this.appointmentRoles[i];
          for (let j = 0; j < hosts.length; j++) {
            const element2 = hosts[j];
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
            /*
            if(available.data()[this.selectedAppointment] != null){
              var localslot = available.data()[this.selectedAppointment]
              localslot[slotDoc.index].booked = true
              localslot[slotDoc.index].available = false
              var newSlot = {}
              newSlot[this.selectedAppointment] = localslot
              console.log(newSlot)
              available.ref.update(newSlot).catch(err=>{
                console.log(slotDoc.id)
              })
            }
            */
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
        await addDoc(collection(this.firestore, "appointments"), {
          starttime: selectedSlot.start,
          endtime: selectedSlot.end,
          appointment: doc(this.firestore, "appointmenttype", this.selectedAppointment.id),
          appointmentrole: requiredRoles,
          bookedby: doc(this.firestore, "profile_data", this.selectedUser),
          hosts: hostRef,
          hostRole,
          slotdata: selectedSlot.docdata,
          attended: false,
          cancelled: false,
          created: serverTimestamp(),
          loggedid: this.loggedinPID,
          journeyid: this.journey,
          participantjourneyproductid: this.participantjourneyproductid,
          journeycoach: true,
          // journeyid: this.selectedAppointment.journeyid,
          // productid: this.selectedAppointment.productid,
          // participantjourneyid: this.selectedAppointment.participantjourneyid
        }).then(async (document) => {
          this.dialog.closeAll()
          this.selectedAppointment = null
          this.selectedDate = null
          this.userAvailableSlots = []
          // this.displaySlot = []
          // this.selectedSlot = null
          // a = similarSlot.length * 2
          alert("Appointment Booked Successfully")
          updateDoc(doc(this.firestore, 'participantjourneyproduct', this.participantjourneyproductid), {
            onboardingscheduled: new Date(selectedSlot.start),
            onboardedby: hostRef,
            appointmentid: document.id
          })
          this.journey = null,
            this.profileid = null,
            this.participantjourneyproductid = null
          this.opencalender = false
          if (this.goback) {
            this.location.back()
          }
        }).catch(err => {
          dialogRef.close()
          console.log(err)
        })
        dialogRef.close()
      }
      else {
        // if(a+1 == similarSlot.length){
        //   this.matDialog.closeAll()
        //   alert("Oop! The selected slot is no longer available. Try again")
        // }
        alert("Oop! The selected slot is no longer available. Try again")
      }
      // }
      // else{
      //   a = similarSlot.length * 2
      // }
      // }
    }
  }

  openRemarks(element) {
    element['view'] = true;
    element['mapProfile'] = this.mapProfile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['journeyname'] = this.mapjourneyname[element['journeyref'].id]?.['journey'] || '';
    this.dialog.open(OnboardingRemarkComponent, {
      data: element,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    })
  }


}
