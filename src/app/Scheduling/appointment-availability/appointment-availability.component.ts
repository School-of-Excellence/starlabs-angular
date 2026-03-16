import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CommonModule, DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, Firestore, query, where, orderBy, Query, doc, collectionData, deleteDoc, getDocs } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { AddAppointmentAvailabilityComponent } from '../add-appointment-availability/add-appointment-availability.component';

@Component({
  selector: 'app-appointment-availability',
  imports: [
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatMenuModule,
    MatSelectModule,
    MatPaginatorModule,
  ],
  templateUrl: './appointment-availability.component.html',
  styleUrl: './appointment-availability.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class AppointmentAvailabilityComponent implements OnDestroy {
  @ViewChild('TABLE') table:ElementRef;
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  displayedColumns = ["name", "appointment", "date", "starttime", "endtime", "action"];
  dataSource = new MatTableDataSource();
  expandedElement

  availabilitySubscription:Subscription

  loggedinPID;
  mapAppointment = {}
  appointmentList = []
  mapProfile = {}
  profileList = []

  loading:boolean = true
  adminRole:boolean = false
  schedulerRole:boolean = false

  constructor(public router: Router, public guard : AuthguardService, private dialog : MatDialog, private firestore : Firestore, public datepipe : DatePipe) {
    guard.getRoles().then(async roleData=>{
      this.loggedinPID = roleData["profile_ref"].id
      this.adminRole = (roleData.admin ?? false) || (roleData.ah ?? false)
      this.schedulerRole = roleData.scheduler != null ? roleData.scheduler : false
      // if(this.adminRole || this.schedulerRole || roleData["selfavailability"]){
        this.fetchData()
      // }
      // else{
      //   alert("Unauthoried Access")
      //   this.router.navigateByUrl('/')
      // }
      this.loading = false
    })
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.availabilitySubscription?.unsubscribe()
  }

  isExpanded(element) {
    return this.expandedElement === element;
  }

  /** Toggles the expanded state of an element. */
  toggle(element) {
    this.expandedElement = this.isExpanded(element) ? null : element;
    console.log(this.expandedElement)
  }

  async fetchData(){
    this.guard.getAppointmentMap().then(data => {
      this.mapAppointment = data.map
      this.appointmentList = data.list
    })

    this.guard.getProfileMap().then(data =>{
      this.mapProfile = data.map
      this.profileList = data.list
    })

    var collectionRef = collection(this.firestore, "availability")
    var queryFilter:Query
    var newDate = new Date()
    var todate  = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 0, 0, 0)
    console.log(todate)
    if(this.adminRole || this.schedulerRole){
      queryFilter = query(collectionRef, where("starttime", ">=", todate), orderBy("starttime")) 
    }
    else{
      queryFilter = query(collectionRef, where("profileref", "==", doc(this.firestore, "profile_data/"+this.loggedinPID)), where("starttime", ">=", todate), orderBy("starttime")) 
    }
    this.availabilitySubscription = collectionData(queryFilter, {idField: "id"}).subscribe(snapshot=>{
      console.log(snapshot.length)
      var data = []
      for (let i = 0; i < snapshot.length; i++) {
        const doc = snapshot[i]
        const docData = doc;
        var appointmentList = []
        var slots = []
        docData["appointments"].forEach(element => {
          appointmentList.push(this.mapAppointment[element.id])
          if(docData[element.id] != null){
            var slotdata = docData[element.id]
            for (let i = 0; i < slotdata.length; i++) {
              if(slotdata[i].booked || slotdata[i].available){
                slots.push({
                  appointment: this.mapAppointment[element.id],
                  starttime: this.datepipe.transform(slotdata[i].slotstart.toDate(), 'shortTime'),
                  endtime: this.datepipe.transform(slotdata[i].slotend.toDate(), 'shortTime'),
                  booked: slotdata[i].booked,
                })
              }
            }
          }
        });
        var group = slots.reduce(function(old, current){
          old[current.appointment] = old[current.appointment] || []
          old[current.appointment].push(current)
          return old
        }, Object.create({}))
        data.push({
          name: this.mapProfile[docData["profileref"].id],
          appointment: appointmentList,
          date: docData["starttime"].toDate(),
          starttime: docData["starttime"].toDate(),
          endtime: docData["endtime"].toDate(),
          id: docData["id"],
          slots: slots,
          slotgroup: group,
          isExpanded: false
        });
      }
      this.dataSource.data = data;  
      this.dataSource.sort = this.sort;
      this.dataSource.paginator = this.paginator;
    })
  }
  
  openDailyAvailability(){
    this.dialog.open(AddAppointmentAvailabilityComponent,{
      disableClose : true,
      minWidth: 300,
      maxHeight: "90vh",
      maxWidth: "90vw",
      data: {
        appointmentlist: this.appointmentList,
        profilelist: this.profileList
      }
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onrowdelete(element){
    console.log(element)
    var bookedslots = element['slots'].filter(e => e.booked).length
    if(bookedslots == 0){
      if(confirm("Delete this day Slot?")){
        var docRef = doc(this.firestore, "availability/"+element['id'])
        deleteDoc(docRef).then(()=>{
          console.log("Deleted")
        }).catch(err=>{
          console.log(err)
        })
      }
    }
    else{
      alert("Booking were already made. Please ask client to cancel it")
    }
  }
}
