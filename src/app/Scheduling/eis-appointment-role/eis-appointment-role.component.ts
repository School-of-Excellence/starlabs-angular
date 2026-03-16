import { Component, OnDestroy, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { Subject } from 'rxjs';
import { EisAppointmentRoleDialogComponent } from '../eis-appointment-role-dialog/eis-appointment-role-dialog.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-eis-appointment-role',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule
  ],
  templateUrl: './eis-appointment-role.component.html',
  styleUrl: './eis-appointment-role.component.css'
})
export class EisAppointmentRoleComponent implements OnDestroy {

  subscription = new Subject<void>()
  displayedColumns = ["role", "eis", "action"];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  mapProfiles = {}
  mapRole = {}
  profileList = []
  roleList = []

  constructor(private dialog : MatDialog,private firestore : Firestore, public guard: AuthguardService, public router: Router) {
    // this.guard.getRoles().then(async roleData=>{
    //   if(roleData["scheduler"] || roleData["admin"] || roleData["ah"]){
    //     console.log("Good")
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
      this.guard.getAppointmentRolesMap(),
      this.guard.getProfileMap()
    ]
    await Promise.all(promises).then(result =>{
      var apptRoleMap = result[0]
      var profileMap = result[1]
      this.mapRole = apptRoleMap["map"]
      this.roleList = apptRoleMap["list"]
      this.roleList.sort((a, b) => a["role"].localeCompare(b["role"]))
      this.mapProfiles = profileMap["map"]
      this.profileList = profileMap["list"]
    })
  }

  fetchData(){
    var collectionRef = collection(this.firestore, "Roles-To-EIS")
    collectionData(collectionRef, {idField: "id"}).subscribe(snapshot => {
      var matdata = [];
      snapshot.forEach(document=>{
        document["role"] = this.mapRole[document['assigned_role_ref'].id]
        document["eis"] = this.returnNameList(document['assigned_eis'])
        matdata.push(document)
      })
      matdata.sort((a,b) => a["role"].localeCompare(b["role"]))
      this.dataSource.data = matdata
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }

  applyFilter(value) {
    const filterValue = value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  updateData(data){
    var existingRoles = this.dataSource.data.map(e => e["assigned_role_ref"].id)
    this.dialog.open(EisAppointmentRoleDialogComponent, {
      data : {
        data: data,
        profilelist: this.profileList,
        rolelist: data != null ? [this.roleList.find(e => e["id"] == data["assigned_role_ref"].id)] : this.roleList.filter(e => !existingRoles.includes(e["id"]))
      }, 
      disableClose: true,
      autoFocus: false
    })
  }

  returnNameList(list:Array<any>):string{
    var value = []
    for (let i = 0; i < list.length; i++) {
      value.push(this.mapProfiles[list[i].id])
    }
    return value.join(', ')
  }
}
