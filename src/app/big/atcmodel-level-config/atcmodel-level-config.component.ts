import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { UpdateAtcmodelLevelConfigComponent } from './update-atcmodel-level-config/update-atcmodel-level-config.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-atcmodel-level-config',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    FormsModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatPaginatorModule,
  ],
  templateUrl: './atcmodel-level-config.component.html',
  styleUrl: './atcmodel-level-config.component.css'
})
export class AtcmodelLevelConfigComponent {

  // configSubscription: Subscription
  displayedColumns: string[] = ['atcmodel', 'level', 'primaryactivity', 'metrics', 'validation', 'stabilization', 'action'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  // productSubscription: Subscription
  atcModelList = []
  // levelSubscription: Subscription
  levelList = []
  mapLevel = {}
  // activitySubscription: Subscription
  private subscription = new Subject<void>();

  activityList = []
  mapActivity = {}

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        collectionSnapshots(collection(this.firestore,"atcmodel level config")).pipe(takeUntil(this.subscription)).subscribe(listData=>{
          let list = listData.map(doc =>({id:doc.id,...doc.data()}))
          this.dataSource.data = list
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
          console.log(list)
        })
      // }
    })
  }

  ngOnInit(): void {
    collectionSnapshots(query(collection(this.firestore,"bigactivity"),orderBy("activity"))).pipe(takeUntil(this.subscription)).subscribe(listData=>{
      let list = listData.map(doc =>({id:doc.id,...doc.data()}))
      this.activityList = list
      this.activityList.forEach(item=>{
        this.mapActivity[item["docid"]] = item["activity"]
      })
    })
    collectionSnapshots(query(collection(this.firestore,"biglevel"),orderBy("level"))).pipe(takeUntil(this.subscription)).subscribe(listData=>{
      let list = listData.map(doc =>({id:doc.id,...doc.data()}))
      this.levelList = list
      this.levelList.forEach(item=>{
        this.mapLevel[item["docid"]] = item["level"]
      })
    })
    collectionSnapshots(query(collection(this.firestore,"products"),orderBy("atcmodel"))).pipe(takeUntil(this.subscription)).subscribe(listData=>{
      let list = listData.map(doc =>({id:doc.id,...doc.data()}))
      this.atcModelList = list.filter(e => (e["atcmodel"] ?? "").trim().length != 0).map(e => e["atcmodel"])
    })
  }

  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
  }
  
  filterTable(value){
    this.dataSource.filter = value
  }

  updateList(value){
    this.dialog.open(UpdateAtcmodelLevelConfigComponent, {
      data: {
        configdata: value,
        activitylist: this.activityList,
        levellist: this.levelList,
        atcmodellist: this.atcModelList
      },
      maxHeight: "90%",
      maxWidth: "90%",
      disableClose: true,
      autoFocus: false,
    })
  }

}
