import { Component, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, Firestore, orderBy, query } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AppointmentRolesDialogComponent } from '../appointment-roles-dialog/appointment-roles-dialog.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-appointment-roles',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './appointment-roles.component.html',
  styleUrl: './appointment-roles.component.css'
})
export class AppointmentRolesComponent implements OnDestroy {

  subscription = new Subject<void>()
  displayedColumns = ["role", "experiencestage", "experiencelevel", "action"];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

 
  constructor(public dialog:MatDialog, private firestore: Firestore, public guard: AuthguardService, public router: Router) {
    // this.guard.getRoles().then(roleData=>{
    //   if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
        this.fetchData()
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // })
  }


  fetchData(): void {
    var roleCollection = collection(this.firestore, "eisroles")
    var roleQuery = query(roleCollection, orderBy("role"))
    collectionData(roleQuery, {idField: "docid"}).pipe(
      takeUntil(this.subscription)
    ).subscribe( snapshot => {
      this.dataSource.data = snapshot;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }

  ngOnDestroy(): void {
    this.subscription?.complete()
  }

  applyFilter(filtervalue) {
    this.dataSource.filter = filtervalue
  }

  updateRole(data){
    this.dialog.open(AppointmentRolesDialogComponent, {
      data : data,
      disableClose: true,
    })
  }

}
