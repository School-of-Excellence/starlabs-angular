import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AddBigActivityComponent } from '../add-big-activity/add-big-activity.component';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-big-activity',
  imports: [
    CommonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule
  ],
  templateUrl: './big-activity.component.html',
  styleUrl: './big-activity.component.css'
})
export class BigActivityComponent {
  subscription = new Subject<void>
  displayedColumns: string[] = ["activity", "atcproperty", "shadow","activitytype", "action"]; // "procedureproperty", "assignmentproperty"
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableData:any[] = []
  bigActivitySubscription:Subscription
  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        collectionData(collection(this.firestore,"bigactivity")).pipe(takeUntil(this.subscription)).subscribe(snap => {
          this.tableData = snap
          this.ngAfterViewInit()
        })
      // }
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.bigActivitySubscription?.unsubscribe()
    this.subscription.next();
    this.subscription.complete();
  }

  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }


  filterTable(value){
    this.dataSource.filter = value
  }

  updateAccount(value){
    this.dialog.open(AddBigActivityComponent, {
      data: {
        accountdata: value
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      autoFocus: false,
    })
  }
}
