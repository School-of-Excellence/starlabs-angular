import { Component, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MapClientEisDialogComponent } from '../map-client-eis-dialog/map-client-eis-dialog.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-map-client-eis',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule
  ],
  templateUrl: './map-client-eis.component.html',
  styleUrl: './map-client-eis.component.css'
})
export class MapClientEisComponent implements OnDestroy {
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  displayedColumns = ["profilename", "eisrole", "action"];
  dataSource = new MatTableDataSource();
  subscription = new Subject<void>()

  mapProfiles = {}
  mapRole = {}
  profileList = []
  roleList = []

  constructor(private dialog: MatDialog, private firestore: Firestore, public guard: AuthguardService, public router: Router) {
    // this.guard.getRoles().then(async roleData=>{
    //   if(roleData["integrator"] || roleData["admin"] || roleData["ah"] || roleData["scheduler"]){
        this.mapData().then(() => this.fetchData())
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
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
    var collectionRef = collection(this.firestore, "customer_eismapping")
    collectionData(collectionRef, {idField: "id"}).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshot => {
      var data = []
      for (let i = 0; i < snapshot.length; i++) {
        const doc = snapshot[i];
        doc["profilename"] = this.mapProfiles[doc["profile_ref"].id]
        var eisData = []
        var roles = doc["roles"] ?? []
        if(roles.length != 0){
          roles.forEach(roles =>{
            var roleName = this.mapRole[roles.id]
            var names = []
            doc["eisroles"][roles.path]?.forEach(specialist =>{
              names.push(this.mapProfiles[specialist.id])
            })
            eisData.push(roleName + " - " + names.join(", "))
          })
          doc["eisrole"] = eisData
          data.push(doc)
        }
      }
      this.dataSource.data = data;
      this.dataSource.sort = this.sort;
      this.dataSource.paginator = this.paginator;
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  updateData(data){
    this.dialog.open(MapClientEisDialogComponent, {
      data : {
        data:data,
        mapprofile: this.mapProfiles,
        profilelist: this.profileList,
        rolelist: this.roleList
      },
      maxHeight: "90vh",
      minWidth: "90vw",
      autoFocus: false,
      disableClose: true
    })
  }

  clearRecord(data){
    if(confirm("Sure, Do you want to clear record")){
      deleteDoc(doc(this.firestore, "customer_eismapping/"+data["id"]))
    }
  }

}
