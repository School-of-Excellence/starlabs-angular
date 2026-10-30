import { Component, OnInit,ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CreateAtcmodelComponent } from '../create-atcmodel/create-atcmodel.component';
import { collection, collectionData, documentId, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscriber, Subscription, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { NgFor, NgIf } from '@angular/common';
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
    NgIf,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './view-atcmodel.component.html',
  styleUrl: './view-atcmodel.component.css'
})
export class ViewAtcmodelComponent {
  private subscription  = new Subject<void>();
  displayedColumns: string[] = ['atcmodel','evolutiontype','category','description','Directive','videourl','forms','edit'];
  dataSource = new MatTableDataSource()
  atcmodelData = []
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  mapContentData = {}
  mapFormName = {} // delivery form id → name, only the forms configured on the models (read once each)
  atcmodelSubscription : Subscription
  constructor(
    private dialog : MatDialog,
    private firestore : Firestore
  ){
    const atcmodelcollection = collection(this.firestore, 'atc model')
    this.atcmodelSubscription = collectionData(query(atcmodelcollection, orderBy("atcmodel")), {idField : 'id'}).pipe(takeUntil(this.subscription)).subscribe(snap => {
      this.atcmodelData = snap
      this.ngAfterViewInit()
      this.loadFormNames()
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

  // Forms column: read only the configured forms not read yet (document-id `in` queries, 30 ids each)
  loadFormNames(){
    const ids = [...new Set(this.atcmodelData.flatMap(m => (m['forms'] || []).map(f => f?.['formid']).filter(id => id && this.mapFormName[id] === undefined)))]
    for (let i = 0; i < ids.length; i += 30) {
      getDocs(query(collection(this.firestore, 'delivery forms'), where(documentId(), 'in', ids.slice(i, i + 30)))).then(snap => {
        snap.docs.forEach(d => this.mapFormName[d.id] = d.data()['formname'] ?? '')
      }).catch(err => console.error('Error loading delivery forms:', err))
    }
  }

  trackByFormId(index: number, form: any){
    return form.formid
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
        doc : null,
        existing : this.atcmodelData
      },
      width:'540px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose:true
    })
  }

  onEditDialog(doc:any){
    this.dialog.open(CreateAtcmodelComponent,{
      data:{
        type:'edit',
        doc : doc,
        existing : this.atcmodelData
      },
      width:'540px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose:true
    })
  }

}
