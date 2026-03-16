import { Component, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { collection, collectionData, doc, Firestore } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MapAppointmentRoleDialogComponent } from '../map-appointment-role-dialog/map-appointment-role-dialog.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-map-appointment-role',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './map-appointment-role.component.html',
  styleUrl: './map-appointment-role.component.css'
})
export class MapAppointmentRoleComponent implements OnDestroy{
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  displayedColumns = ["appointment", "assignedrolelist", "requiredrolelist", "additionalrolelist", "action"];
  dataSource:MatTableDataSource<any> = new MatTableDataSource();
  subscription = new Subject<void>()

  mapAppointmentTypes = {}
  mapRoles = {}
  appointmentList = []
  roleList = []


  constructor(private dialog: MatDialog, private firestore: Firestore, public guard: AuthguardService, public router: Router) {
    // this.guard.getRoles().then(async roleData=>{
      // if(roleData["ah"] || roleData["admin"] || roleData["integrator"]){
        this.mapData().then(() => this.fetchData())
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
    // })
  }

  ngOnDestroy(): void {
    this.subscription?.complete()
  }

  async mapData(){
    var promises = [
      this.guard.getAppointmentMap(),
      this.guard.getAppointmentRolesMap(),
    ]
    await Promise.all(promises).then(result =>{
      var apptMap = result[0]
      var roleMap = result[1]
      this.mapAppointmentTypes = apptMap["map"]
      this.appointmentList = apptMap["list"]
      this.appointmentList.sort((a, b) => a["appointmenttype"].localeCompare(b["appointmenttype"]))
      this.mapRoles = roleMap["map"]
      this.roleList = roleMap["list"]
    })
  }

  fetchData(){
    var collectionRef = collection(this.firestore, "AppointmentType-To-Roles")
    collectionData(collectionRef, {idField: "id"}).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshot => {
      var data = []
      for (let i = 0; i < snapshot.length; i++) {
        const docData = snapshot[i];
        docData["appointment"] = this.mapAppointmentTypes[docData["assigned_appttype_ref"].id]
        docData["assignedrolelist"] = this.returnroles(docData["assigned_role"] ?? [])
        docData["requiredrolelist"] = this.returnroles(docData["required_role"] ?? [])
        docData["additionalrolelist"] = this.returnroles(docData["additional_role"] ?? [])
        data.push(docData)
      }
      data.sort((a, b) => a["appointment"].localeCompare(b["appointment"]))
      this.dataSource.data = data;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }

  updateData(data){
    var existingAppointment = this.dataSource.data.map(e => e["assigned_appttype_ref"].id)
    this.dialog.open(MapAppointmentRoleDialogComponent, {
      data: {
        data: data,
        appointmentlist: data != null ? [this.appointmentList.find(e => e["id"] == data["assigned_appttype_ref"].id)] : this.appointmentList.filter(e => !existingAppointment.includes(e["id"])),
        rolelist: this.roleList
      },
      disableClose: true,
      autoFocus: false
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  returnroles(list:Array<any>):string{
    var value = []
    for (let i = 0; i < list.length; i++) {
      value.push(this.mapRoles[list[i].id])
    }
    return value.join(", ")
  }
}