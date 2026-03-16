import { Component, OnInit, ViewChild } from '@angular/core';
import { AddZoomAccountComponent } from '../add-zoom-account/add-zoom-account.component';
import { collection, collectionData, Firestore, orderBy, query, doc, updateDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-zoom-account',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatSlideToggleModule,
    MatIconModule,
    CommonModule
  ],
  templateUrl: './zoom-account.component.html',
  styleUrl: './zoom-account.component.css'
})
export class ZoomAccountComponent {
  displayedColumns: string[] = ['index', 'email', 'firstname', 'lastname', 'inuse', 'accounttype', 'action'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  zoomaccountSubscription: Subscription

  private subscriptionHandle = new Subject<void>()
  

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        collectionData(query(collection(firestore,"zoomaccount"), orderBy("lastname"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(list=>{
          this.dataSource.data = list
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
          console.log(list)
        })
      // }
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.subscriptionHandle.complete();
    this.subscriptionHandle.next();
  }
  
  filterTable(value){
    this.dataSource.filter = value
  }

  onToggle(result, account){
    console.log(result, account)
    updateDoc(doc(this.firestore,"zoomaccount",account["docid"]),{
      accounttype: result.checked ? "licensed" : "basic"
    })
  }

  updateAccount(value){
    this.dialog.open(AddZoomAccountComponent, {
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
