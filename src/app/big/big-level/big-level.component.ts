import { CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { UpdateBigLevelComponent } from './update-big-level/update-big-level.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';

export interface list {
  list : string
  action: string
}

@Component({
  selector: 'app-big-level',
  imports: [
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    CommonModule,
    MatPaginatorModule,
    MatTableModule,
    CdkDropList
  ],
  templateUrl: './big-level.component.html',
  styleUrl: './big-level.component.css'
})
export class BigLevelComponent {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;
  dragDisabled = true;
  displayedColumns: string[] = ['position', 'level', 'category', 'action'];
  dataSource = new MatTableDataSource();
  private subscription = new Subject<void>();
  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        collectionData(collection(this.firestore,"biglevel")).pipe(takeUntil(this.subscription)).subscribe(list=>{
          this.dataSource.data = list.sort((a, b) => (a["sequence"] ?? 0) - (b["sequence"] ?? 0))
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
          console.log(list)
        })
      // }
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  filterTable(value){
    this.dataSource.filter = value
  }

  onDrop(event: CdkDragDrop<any[]>): void {
    console.log(event)
    this.dragDisabled = true;
    moveItemInArray(this.dataSource.data, event.previousIndex, event.currentIndex);
    this.dataSource.data = this.dataSource.data;
    var batch = writeBatch(this.firestore)
    this.dataSource.data.forEach((item, index)=>{
      var ref = doc(this.firestore,"biglevel",item["docid"])
      batch.update(ref, {
        sequence: index + 1
      })
    })
    batch.commit()
    console.log(event.currentIndex);
  }

  updateList(value){
    this.dialog.open(UpdateBigLevelComponent, {
      data: {
        leveldata: value ?? {
          level: null,
          docid: null,
          sequence: this.dataSource.data.length + 1
        },
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      autoFocus: false,
    })
  }

}
