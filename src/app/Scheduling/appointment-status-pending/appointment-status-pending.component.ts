import { CommonModule } from '@angular/common';
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MarkAppointmentStatusComponent } from '../mark-appointment-status/mark-appointment-status.component';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, collectionSnapshots, doc, Firestore, Query, query, where } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-appointment-status-pending',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatSortModule,
    MatTableModule,
    MatProgressBarModule,
    MatButtonModule
  ],
  templateUrl: './appointment-status-pending.component.html',
  styleUrl: './appointment-status-pending.component.css'
})
export class AppointmentStatusPendingComponent implements OnDestroy {
  @ViewChild(MatSort) matsort: MatSort;
  loading:boolean = false
  loggedinPID:string
  superRole:boolean = false
  mapRoles = {}
  mapAppointment = {}
  mapProfile = {}
  appointmentHeader = ["name", "appointmentname", "slotdate", "starttime", "hosts", "action"];
  appointmentSource = new MatTableDataSource();
  appointmentSubscription = new Subject<void>()

  constructor(public firestore: Firestore, public guard: AuthguardService, public router: Router, public dailog: MatDialog) {
    guard.getRoles().then(async roles=>{
      this.loading = true
      this.loggedinPID = roles["profile_ref"]["id"]
      this.superRole = roles["admin"] || roles["ah"] || roles["developer"] || roles["scheduler"]
      // if(this.superRole || roles["eis"] || roles["changeagent"]){
        await this.mapData()
        this.fetchAppointments()
      // }
      // else{
      //   alert("Unauthorized access")
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

  applyAppointmentFilter(event: Event){
    const filterValue = (event.target as HTMLInputElement).value;
    this.appointmentSource.filter = filterValue.trim().toLowerCase();
  }

  fetchAppointments(){
    this.appointmentSubscription?.next()
    this.appointmentSubscription?.complete()
    this.appointmentSubscription = new Subject<void>()

    var apptCollection = collection(this.firestore, "appointments")
    var queryOption = [
      where("cancelled", "==", false),
      where("attended", "==", false),
      where("starttime", "<=", new Date())
    ]
    if(!this.superRole){
      queryOption.unshift(where("hosts", "array-contains", doc(this.firestore, "profile_data/"+this.loggedinPID)))
    }
    var apptQuery:Query = query(apptCollection, ...queryOption)
    collectionSnapshots(apptQuery).pipe(
      takeUntil(this.appointmentSubscription)
    ).subscribe(booked=>{
      var data = []
      booked.forEach(appointment=>{
        var appointmentData = appointment.data()
        var hostData = []
        var hostID = []
        appointmentData["appointmentrole"].forEach(role=>{
          var hostName = []
          appointmentData["hostRole"][role.path].forEach(host=>{
            hostName.push(this.mapProfile[host.id])
            hostID.push(host.path)
          })
          var value = "- " + this.mapRoles[role.id] + ": " + hostName.join(', ')
          hostData.push(value)
        })
        hostData = Array.from(new Set(hostData))
        hostID = Array.from(new Set(hostID))
        var metaData = appointmentData
        metaData["type"] = "appointment"
        metaData["clientname"] = this.mapProfile[appointmentData["bookedby"].id]
        metaData["bookingid"] = appointment.id
        metaData["appointmenttype"] = this.mapAppointment[appointmentData["appointment"].id]
        metaData["appointmentid"] = appointmentData["appointment"].id
        metaData["hostdata"] = hostData
        metaData["hostpath"] = hostID
        metaData["name"] = this.mapProfile[appointmentData["bookedby"].id]
        metaData["appointmentname"] = this.mapAppointment[appointmentData["appointment"].id]["appointmenttype"]
        metaData["hosts"] = hostData.join("\n")
        metaData["slotdate"] = appointmentData["starttime"]
        data.push(metaData)
      })
      this.appointmentSource.data = data
      this.appointmentSource.sort = this.matsort
    })
  }

  async updateStatus(appointmentData){
    this.dailog.open(MarkAppointmentStatusComponent, {
      data: appointmentData,
      disableClose: true,
      autoFocus: false
    })
  }
}
