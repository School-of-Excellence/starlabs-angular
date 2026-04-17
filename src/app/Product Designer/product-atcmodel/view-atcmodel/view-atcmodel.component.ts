import { Component, OnInit,ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CreateAtcmodelComponent } from '../create-atcmodel/create-atcmodel.component';
import { collection, collectionData, Firestore, getDocs, query } from '@angular/fire/firestore';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscriber, Subscription, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { NgFor } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { orderBy } from 'firebase/firestore';

@Component({
  selector: 'app-view-atcmodel',
  imports: [
    MatFormFieldModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    NgFor,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './view-atcmodel.component.html',
  styleUrl: './view-atcmodel.component.css'
})
export class ViewAtcmodelComponent {
  private subscription  = new Subject<void>();
  displayedColumns: string[] = ['atcmodel','evolutiontype','category','description','Directive','videourl','edit'];
  dataSource = new MatTableDataSource()
  atcmodelData = []
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  mapContentData = {}
  atcmodelSubscription : Subscription
  constructor(
    private dialog : MatDialog,
    private firestore : Firestore
  ){
    const atcmodelcollection = collection(this.firestore, 'atc model')
    this.atcmodelSubscription = collectionData(query(atcmodelcollection, orderBy("atcmodel")), {idField : 'id'}).pipe(takeUntil(this.subscription)).subscribe(snap => {
      this.atcmodelData = snap
      this.ngAfterViewInit()
    })

    const contentCollection = collection(this.firestore, 'content_urls')
    getDocs(contentCollection).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapContentData[snap.docs[i].id] = element['title']
      }
    })
    console.log(this.mapContentData, 'this.mapContentData');
  }

  ngAfterViewInit(){
    this.dataSource.data = this.atcmodelData
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  ngonDestroy(){
    this.subscription.next();
    this.subscription.complete();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onOpenDialog(){
    this.dialog.open(CreateAtcmodelComponent,{
      data:{
        type:'add',
        doc : null
      },
      width:'90%',
      height: '90%',
      disableClose:true
    })
  }

  onEditDialog(doc:any){
    this.dialog.open(CreateAtcmodelComponent,{
      data:{
        type:'edit',
        doc : doc
      },
      maxWidth: '90vw',
      maxHeight: '90vh',
      width:'100vw',
      disableClose:true
    })
  }

}
