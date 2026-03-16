import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AddEISZoomAccountComponent } from '../add-eis-zoom-account/add-eis-zoom-account.component';

@Component({
  selector: 'app-eis-zoom-account',
  imports: [
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule
  ],
  templateUrl: './eis-zoom-account.component.html',
  styleUrl: './eis-zoom-account.component.css'
})
export class EISZoomAccountComponent implements OnDestroy {
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  displayedColumns = ["sno", "name", "email", "phonenumber", "zoomurl", "zoomid", "zoompassword", "Edit"]
  dataSource = new MatTableDataSource()
  zoomAccountSubscription: Subscription

  constructor(private dialog : MatDialog, private firestore : Firestore, private guard: AuthguardService, private router: Router) {
    // this.guard.getRoles().then(roleData=>{
    //   if(roleData.scheduler || roleData.admin || roleData.ah || roleData.developer){
        this.fetchData()
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // })
  }

  ngOnDestroy(): void {
    this.zoomAccountSubscription?.unsubscribe()
  }

  fetchData(){
    var collectionRef = collection(this.firestore, "EISzoomcontact")
    this.zoomAccountSubscription = collectionData(collectionRef, {idField: "docid"}).subscribe(snapshot =>{
      console.log(snapshot.length);
      this.dataSource.data = snapshot;
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

  updateAccount(data){
    console.log(data)
    this.dialog.open(AddEISZoomAccountComponent, {
      autoFocus: false,
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      data: {
        accountdata: data
      }
    })
  }
}
