import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, Firestore, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import * as XLSX from 'xlsx';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-roaster',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './roaster.component.html',
  styleUrl: './roaster.component.css'
})
export class RoasterComponent implements OnInit, OnDestroy {
  @ViewChild('TABLE') table:ElementRef;
  @ViewChild(MatSort) matsort:MatSort;
  @ViewChild(MatPaginator) paginator:MatPaginator;

  loading:boolean = true;
  adminRole:boolean = false;
  schedulerRole:boolean = false
  loggedinPID
  appointmentHeader = ["sno", "appointmentproduct", "appointmentname", "starttime", "name", "hosts", "endtime", "date", "action"];
  appointmentSource = new MatTableDataSource();
  bookedAppointments = [{
    name: "",
    id: "",
    appointmentname: "",
    appointmentid: "",
    slotdate: "",
    slotdata: "",
    starttime: new Date(),
    endtime: "",
    bookeddate: "",
    hosts: "",
    cancelled: "",
    canceldate: "",
  }];
  mapProfile = {};
  mapAppointment = {};
  mapProduct = {}
  appointmentSession = []

  selectedDate
  dateFilter:boolean = false

  firestoreSubscription = new Subject<void>();

  constructor(public router:Router, public firestore: Firestore, public guard: AuthguardService, public datepipe: DatePipe, public http: HttpClient, public snackbar: MatSnackBar) {
    this.bookedAppointments = []
    guard.getRoles().then(async roleData=>{
      await this.mapData()
      this.adminRole = roleData.admin || roleData.ah
      this.schedulerRole = roleData.scheduler != null ? roleData.scheduler : false
      this.loggedinPID = roleData["profile_ref"].id
      // if(this.adminRole || this.schedulerRole){
        this.fetchBookedAppointments()
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
      this.loading = false
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.firestoreSubscription?.complete()
  }

  async mapData(){
    var sessionCollection = collection(this.firestore, "appointment session")
    var sessionQuery = query(sessionCollection, orderBy("session"))
    var promises = [
      this.guard.getAppointmentMap(),
      this.guard.getProfileMap(),
      this.guard.getProductMap(),
      getDocs(sessionQuery)
    ]
    await Promise.all(promises).then(result =>{
      console.log(result)
      this.mapAppointment = result[0]["map"]
      this.mapProfile = result[1]["map"]
      this.mapProduct = result[2]
      var list = []
      result[3]["docs"].forEach(val=>{
        list.push(val.data()["session"])
      })
      this.appointmentSession = list
    })
  }

  fetchBookedAppointments(){
    var currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)
    var thirdDate = new Date()
    thirdDate.setDate(thirdDate.getDate() + 3)
    thirdDate.setHours(23, 59, 59, 59)
    console.log(currentDate)
    console.log(thirdDate)
    this.firestoreSubscription?.next()
    this.firestoreSubscription?.complete()
    this.firestoreSubscription = new Subject<void>()
    var apptCollection = collection(this.firestore, "appointments")
    var apptQuery = query(apptCollection, where("cancelled", "==", false), orderBy("starttime"))
    collectionData(apptQuery, {idField: "id"}).pipe(
      takeUntil(this.firestoreSubscription)
    ).subscribe(booked=>{
      var data = []
      for (let i = 0; i < booked.length; i++) {
        const appointment = booked[i];
        var specialist = []
        appointment["appointmentrole"].forEach(role=>{
          appointment["hostRole"][role.path].forEach(host=>{
            specialist.push(this.mapProfile[host.id])
          })
        })
        specialist = Array.from(new Set(specialist))
        // Get Product Name
        var productname = this.mapProduct[appointment["productid"]]
        // Get Session Name
        var appoinmentname
        var appointmentType = this.mapAppointment[appointment["appointment"].id]
        var dataAppointment = appointmentType.toLowerCase().replace(/\s/g, "").trim()
        for (let i = 0; i < this.appointmentSession.length; i++) {
          const session = this.appointmentSession[i].toLowerCase().replace(/\s/g, "").trim();
          // if(dataAppointment.includes("a&hreview")){
          //   productname = "A&H Review"
          // }
          if(dataAppointment.includes(session)){
            appoinmentname = this.appointmentSession[i] + " Session"
            break;
          }
          else{
            appoinmentname = appointmentType
          }
        }
        data.push({
          appointmentproduct: productname != null ? productname : "unable to get for \n'"+appointmentType+"'",
          name: this.mapProfile[appointment["bookedby"].id],
          id: appointment["id"],
          appointmentname: appoinmentname,
          appointmentid: appointment["appointment"].id,
          slotdate: appointment["starttime"].toDate(),
          slotdata: appointment["slotdata"],
          starttime: appointment["starttime"].toDate(),
          endtime: appointment["endtime"].toDate(),
          bookeddate: appointment["created"].toDate(),
          hosts: specialist.join(", "),
          cancelled: appointment["cancelled"],
          canceldate: appointment["cancelledon"] != null ? appointment["cancelledon"].toDate() : "",
          attended: appointment["attended"] ?? false
        }) 
      }
      this.bookedAppointments = data
      this.appointmentSource.data = this.bookedAppointments.filter(e => e.starttime >= currentDate && e.starttime <= thirdDate)
      this.appointmentSource.sort = this.matsort
      this.appointmentSource.paginator = this.paginator
    })
  }

  applyAppointmentFilter(event: Event){
    const filterValue = (event.target as HTMLInputElement).value;
    this.appointmentSource.filter = filterValue.trim().toLowerCase();
  }

  onDateSelect(){
    var start = new Date(this.selectedDate.setHours(0,0,0))
    var end = new Date(this.selectedDate.setHours(23,59,59))
    console.log(start, end)
    this.appointmentSource.data = this.bookedAppointments.filter(e => e.starttime >= start && e.starttime <= end)
    this.appointmentSource.sort = this.matsort
    this.appointmentSource.paginator = this.paginator
    this.dateFilter = true
  }

  getAll(){
    this.appointmentSource.data = this.bookedAppointments
    this.appointmentSource.sort = this.matsort
    this.appointmentSource.paginator = this.paginator
    this.dateFilter = true
    this.selectedDate = null
  }

  clearDate(){
    var currentDate = new Date(new Date().setHours(0,0,0))
    var thirdDate = new Date(new Date(new Date().setDate(new Date().getDate()+3)).setHours(23,59,59))
    this.appointmentSource.data = this.bookedAppointments.filter(e => e.starttime >= currentDate && e.starttime <= thirdDate)
    this.appointmentSource.sort = this.matsort
    this.appointmentSource.paginator = this.paginator
    this.dateFilter = false
    this.selectedDate = null
  }

  async resendEmail(appointment){
    console.log(appointment.id)
    if(confirm("Send appointment confirmation email to " + appointment.name + "?")){
      var produrl = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/resentAppointmentEmail?appointmentid=" + appointment.id // Production
      var testurl = "https://resentappointmentemail-rhdwzw46ya-uc.a.run.app?appointmentid=" + appointment.id // Test
      var url:string
      if(environment.firebase.projectId == "starlabs-test"){
        console.log("test")
        url = testurl
      }
      else if(environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development"){
        console.log("Production")
        url = produrl
      }
      // var host = window.location.host
      // if(host == "star-labs-test.web.app"){
      //   url = testurl
      // }
      // else if(host == "star-labs.web.app" || host == "starlabs-prod-test.web.app"){
      //   url = produrl
      // }
      // else if(host == "localhost:4200"){
      //   url = testurl
      // }
      // else{
      //   alert("Unrecognized Host: " + host)
      // }
      this.http.get(url, {
        headers: new HttpHeaders({
          'Access-Control-Allow-Origin': '*'
        })
      }).subscribe({
        next: () => {
          this.snackbar.open("Email Sent", null, {
            duration: 3000
          });
        },
        error: (err) => {
          console.log(err);
        }
      });
    }
  }

  exportCSV(){
    const ws:XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
    const wb:XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'sheet1');
    //  save to file
    XLSX.writeFile(wb,'Roster.csv')
  }
}
