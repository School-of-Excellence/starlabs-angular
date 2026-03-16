import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { isSameDay, isSameMonth } from 'date-fns';
import { CalendarA11y, CalendarDateFormatter, CalendarEvent, CalendarEventTitleFormatter, CalendarModule, CalendarMonthViewComponent, CalendarUtils, CalendarView, DateAdapter } from 'angular-calendar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Firestore, collection, query, orderBy, where, collectionSnapshots, Query, doc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { Subject, takeUntil } from 'rxjs';
import { AppointmentDetailComponent } from '../appointment-detail/appointment-detail.component';

const colors: any = {
  red: {
    primary: '#ad2121',
    secondary: '#FAE3E3',
  },
  blue: {
    primary: '#1e90ff',
    secondary: '#D1E8FF',
  },
  yellow: {
    primary: '#e3bc08',
    secondary: '#FDF1BA',
  },
  green: {
    primary: '#138C05',
    secondary: '#DBF9DB'
  }
};

@Component({
  selector: 'app-appointment-calendar',
  standalone: true,
  imports: [
    CommonModule,
    CalendarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatProgressBarModule,
  ],
  providers: [
    {provide: DateAdapter, useFactory: adapterFactory},
    CalendarDateFormatter,
    CalendarUtils,
    CalendarA11y,
    CalendarEventTitleFormatter,
  ],
  templateUrl: './appointment-calendar.component.html',
  styleUrl: './appointment-calendar.component.css'
})
export class AppointmentCalendarComponent implements OnDestroy {

  loggedinPID;
  loading:boolean = true;
  superRole:boolean = false

  mapProfile = {};
  mapAppointment = {};
  mapRoles = {};

  // Calendar Properties
  CalendarView = CalendarView;
  // Appointment
  selectedMonth = ""
  appointmentViewDate: Date = new Date();
  appointmentView: any = CalendarView.Month;
  appointmentEvents: CalendarEvent[] = [];
  appointmentDayIsOpen: boolean = false;
  // Agenda
  agendaHeading = ["date", "time", "title"]
  agendaDataSource: MatTableDataSource<any> = new MatTableDataSource();
  appointmentSubscription = new Subject<void>()

  currentURL = null

  constructor(public firestore: Firestore, public guard: AuthguardService, public datepipe: DatePipe, public matdialog: MatDialog, public router: Router, public route: ActivatedRoute) {
    this.currentURL = route.snapshot.url[0].path

    guard.getRoles().then(async roleData=>{
      this.superRole = roleData["admin"] || roleData["ah"] || roleData["developer"] || roleData["scheduler"]
      this.loggedinPID = roleData["profile_ref"].id
      // if(this.superRole || roleData["eis"] || roleData["changeagent"]){
        await this.mapData()
        this.dateChangeEvent(this.appointmentViewDate)
        // this.fetchBookedAppointments()
      // }
      // else{
      //   this.router.navigateByUrl("/")
      // }
      this.loading = false
    })
  }

  ngOnDestroy(): void {
    this.appointmentSubscription?.complete()
  }

  async mapData(){
    var promises = [
      this.guard.getAppointmentRolesMap(),
      this.guard.getAppointmentMap(),
      this.guard.getProfileMap()
    ]
    await Promise.all(promises).then(result =>{
      var apptRoleMap = result[0]
      var apptMap = result[1]
      var profileMap = result[2]
      this.mapRoles = apptRoleMap["map"]
      this.mapAppointment = apptMap["map"]
      this.mapProfile = profileMap["map"]
    })
  }

  selectCurrentMonth(){
    this.appointmentViewDate = new Date()
    console.log("Current Date", this.appointmentViewDate)
    this.dateChangeEvent(this.appointmentViewDate)
  }

  moveMonth(next:boolean){
    this.appointmentViewDate.setMonth(this.appointmentViewDate.getMonth() + (next ? 1 : -1)); 
    this.dateChangeEvent(this.appointmentViewDate)
  }

  dateChangeEvent(event){
    console.log(event, this.appointmentViewDate)
    this.appointmentDayIsOpen = false
    var viewDateTransform = this.datepipe.transform(this.appointmentViewDate, "MMMM y")
    if(viewDateTransform != this.selectedMonth){
      console.log("Month Changed", viewDateTransform)
      this.selectedMonth = viewDateTransform
      this.fetchAppointment()
    }
  }

  fetchAppointment(){
    this.appointmentSubscription?.next()
    this.appointmentSubscription?.complete()
    this.appointmentSubscription = new Subject<void>()
    var startDate = this.appointmentViewDate
    startDate.setDate(1)
    startDate.setHours(0, 0, 0, 0)
    var endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
    endDate.setHours(23, 59, 59, 59)
    var apptCollection = collection(this.firestore, "appointments")
    var queryOption = [
      where("starttime", ">=", startDate),
      where("starttime", "<=", endDate), orderBy("starttime")
    ]
    if(!this.superRole || this.currentURL == "mycalendar"){
      queryOption.unshift(where("hosts", "array-contains", doc(this.firestore, "profile_data/"+this.loggedinPID)))
    }
    var apptQuery:Query = query(apptCollection, ...queryOption)
    collectionSnapshots(apptQuery).pipe(
      takeUntil(this.appointmentSubscription)
    ).subscribe(booked =>{
      var calendarData: CalendarEvent[] = []
      for (let i = 0; i < booked.length; i++) {
        const appointment = booked[i];
        var appointmentData = appointment.data()
        var hostData = []
        var hostNames = []
        var hostID = []
        appointmentData["appointmentrole"].forEach(role=>{
          var hostName = []
          appointmentData["hostRole"][role.path].forEach(host=>{
            hostName.push(this.mapProfile[host.id])
            hostNames.push(this.mapProfile[host.id])
            hostID.push(host.path)
          })
          var value = this.mapRoles[role.id] + ": " + hostName.join(', ')
          hostData.push(value)
        })
        hostData = Array.from(new Set(hostData))
        hostNames = Array.from(new Set(hostNames))
        hostID = Array.from(new Set(hostID))
        var metaData = appointmentData
        metaData["type"] = "appointment"
        metaData["clientname"] = this.mapProfile[appointmentData["bookedby"].id]
        metaData["bookingid"] = appointment.id
        metaData["appointmenttype"] = this.mapAppointment[appointmentData["appointment"].id]
        metaData["appointmentid"] = appointmentData["appointment"].id
        metaData["hostdata"] = hostData
        metaData["hostpath"] = hostID
        calendarData.push({
          start: new Date(appointmentData["appointmentstart"] != null ? appointmentData["appointmentstart"].toDate() : appointmentData["starttime"].toDate()),
          end: new Date(appointmentData["appointmentend"] != null ? appointmentData["appointmentend"].toDate() : appointmentData["endtime"].toDate()),
          title: `${metaData["appointmenttype"]} (${metaData["clientname"]}) With ${hostNames.join(', ')}`,
          color: appointmentData["cancelled"] ? colors.red : new Date() < appointmentData["starttime"].toDate() ? colors.green : colors.yellow,
          meta: metaData
        })
      }
      this.appointmentEvents = calendarData

      var eventByDate = {}
      for (let i = 0; i < this.appointmentEvents.length; i++) {
        const event = this.appointmentEvents[i];
        var dateString = this.datepipe.transform(event.start, "shortDate")
        eventByDate[dateString] = eventByDate[dateString] || {date: new Date(event.start), calendardata: []}
        eventByDate[dateString]["calendardata"].push(event)
      }
      this.agendaDataSource.data = Object.values(eventByDate)
      console.log(this.agendaDataSource.data)
    })
  }

  setAppointmentView(view) {
    this.appointmentView = view;
    this.appointmentDayIsOpen = false;
  }

  appointmentDayClicked({ date, events }: { date: Date; events: CalendarEvent[] }): void {
    console.log(date)
    if (isSameMonth(date, this.appointmentViewDate)) {
      if (
        (isSameDay(this.appointmentViewDate, date) && this.appointmentDayIsOpen === true) ||
        events.length === 0
      ) {
        this.appointmentDayIsOpen = false;
      } else {
        this.appointmentDayIsOpen = true;
      }
      this.appointmentViewDate = date;
    }
  }

  eventClick(event): void {
    console.log(event)
    var dialogRef = this.matdialog.open(AppointmentDetailComponent, {
      disableClose: true,
      data: event.meta,
      autoFocus: false
    })

    dialogRef.afterClosed().toPromise().then(data=>{
      if(data != null){
        console.log(data)
        this.guard.cancelAppointment(data)
        // this.cancelAppointment(data.id, data.slotdata, data.appointmentid, data.starttime, data.endtime)
      }
    })
  }

}
