import { Component,AfterViewInit , OnInit,Input,ViewChild } from '@angular/core';
import {MatPaginator} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, docSnapshots, DocumentData, DocumentReference, Firestore, getDoc, getDocs, onSnapshot, orderBy, query, QueryDocumentSnapshot, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore';import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import {  OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-select-communitypost',
  standalone:true,
  imports:[
    CommonModule,
    MatTableModule,
    FormsModule,
    MatPaginatorModule,]
    ,
  templateUrl: './select-communitypost.component.html',
  styleUrls: ['./select-communitypost.component.css']
})
export class SelectCommunitypostComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() eventid:string
  displayedColumns: string[] = ['eventref','categoryname', 'type', 'created','share'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableDataSubscription:Subscription
  mapEvent={}
  constructor(private firestore:Firestore){
  const colRef = collection(this.firestore, 'community post');
    const q = query( colRef, where('type', 'in', ['post', 'video']),   orderBy('created', 'desc') );
    this.tableDataSubscription = collectionSnapshots(q).subscribe(postsnap => {     
       let data = postsnap.map((e,index) => {
       let element = (e as QueryDocumentSnapshot<DocumentData>).data();
        element['index'] = index + 1
        return element
      })
      this.dataSource.data = data
      this.ngAfterViewInit()
    })
   const colRefs = collection(this.firestore, "event collection");
   getDocs(colRefs).then(snap => {      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i];
        this.mapEvent[element.id] = element.data()['name']
      }
    })
  }

  ngOnInit(): void {
    const colRefs = collection(this.firestore, "event collection");
    getDocs(colRefs).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i];
        this.mapEvent[element.id] = element.data()['name']
      }
    });
  }
  loadDataForEvent(eventid: string) {
  if (this.tableDataSubscription) {
    this.tableDataSubscription.unsubscribe();
  }

  const eventDocRef = doc(this.firestore, 'event collection', eventid);
  const colRef = collection(this.firestore, 'community post');
  const q = query(
    colRef,
    where('type', 'in', ['post', 'video']),
    where('eventref', '==', eventDocRef),
    orderBy('created', 'desc')
  );

  this.tableDataSubscription = collectionSnapshots(q).subscribe(postsnap => {
    const data = postsnap.map((e, index) => {
      let element = (e as QueryDocumentSnapshot<DocumentData>).data();
      element['index'] = index + 1;
      return element;
    });
    this.dataSource.data = data;
  });
}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['eventid'] && this.eventid) {
      this.loadDataForEvent(this.eventid);
    }
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  ngOnDestroy() {
    if (this.tableDataSubscription) {
      this.tableDataSubscription.unsubscribe();
    }
  }
  testHLS(hls: any): void {
    if (hls) {
      console.log('HLS URL:', hls);
      window.open(hls, '_blank');
    } else {
      console.warn('No HLS URL available.');
    }
  }
  shareToBigWall(row: any) {
    let docData = { ...row };

    const eventDocRef: DocumentReference = doc(
      this.firestore,
      'event collection',
      this.eventid
    );

    docData['eventref'] = eventDocRef;
    docData['from'] = 'communitypost';
    docData['pinned'] = false;

    const arenaDocRef = doc(
      this.firestore,
      'arena highlights',
      row['docid']
    );

    setDoc(arenaDocRef, docData, { merge: true })
      .then(() => {
        console.log('Document written with ID:', arenaDocRef.id);
      })
      .catch((error) => {
        console.error('Error writing document:', error);
      });
  }

}
