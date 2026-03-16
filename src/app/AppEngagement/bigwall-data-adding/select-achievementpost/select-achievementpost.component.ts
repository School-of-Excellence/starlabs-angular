import { Component, Input, OnInit,ViewChild } from '@angular/core';
import {MatPaginator} from '@angular/material/paginator';
import {MatSort, MatSortModule} from '@angular/material/sort';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, docSnapshots, DocumentReference, Firestore, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { inject } from '@angular/core';
import {MatTableDataSource} from '@angular/material/table';
import { Subscription } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-select-achievementpost',
  standalone:true,
  imports:[ 
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSlideToggleModule,
    MatIconModule,
    MatCardModule,
    MatSortModule,
    MatButtonModule,
  ],
  templateUrl: './select-achievementpost.component.html',
  styleUrls: ['./select-achievementpost.component.css']
})

export class SelectAchievementpostComponent implements OnInit {
  displayedColumns: string[] = ['name', 'created', 'private','postcategory','paralleltrajectory','share'];
  dataSource: MatTableDataSource<any> = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @Input() eventid:string

  achievementlistSubscription:Subscription
  mapPostCategory = {}
  constructor(private firestore:Firestore){ 
    const postCollectionRef = collection( this.firestore, 'Achievements', 'posts', 'postcollection' );
    this.achievementlistSubscription = collectionData(postCollectionRef, { idField: 'id' }).subscribe((snap: any) => {
         this.dataSource.data = snap
        this.ngAfterViewInit()
    })
    const postCategoriesRef = collection(this.firestore, 'post_categories');
    getDocs(postCategoriesRef).then((snap) => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i];
        this.mapPostCategory[element.id] = element.data()
      }
      console.log(this.mapPostCategory);
    })
  }

  ngOnInit(): void {
  }

  ngOnChanges(){
    console.log(this.eventid);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  shareToBigWall(row:any){
    console.log('rowrowrow',row)
    let docData = Object.assign({},row)
     const eventRef: DocumentReference = doc(this.firestore, 'event collection', this.eventid);
     docData['eventref'] = eventRef;
     docData['from'] = 'achievement';
     docData['pinned'] = false;
    // const arenaDocRef = doc(this.firestore, 'arena highlights', row['postid']);
    // setDoc(arenaDocRef, docData, { merge: true });
  }
}
