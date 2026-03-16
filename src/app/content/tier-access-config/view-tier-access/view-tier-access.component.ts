import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { ConfigNewTierComponent } from '../config-new-tier/config-new-tier.component';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-view-tier-access',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    CommonModule,
  ],
  templateUrl: './view-tier-access.component.html',
  styleUrl: './view-tier-access.component.css'
})
export class ViewTierAccessComponent {

  displayedColumns: string[] = ['tierid','docid','biglevelid','productaccess','edit','delete'];
  dataSource = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  private subscription = new Subject<void>();

  tableData = []
  mapTier = {}
  mapJourney = {}
  mapProduct = {}
  mapBigLevel = {}
  constructor(private firestore:Firestore,private dialog:MatDialog){
    const tieraccessconfigref = collection(this.firestore,"tier access config")
    collectionSnapshots(tieraccessconfigref).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      let snap = snapData.map(doc=>({id:doc.id,...doc.data()}))
      this.tableData = snap
      this.ngAfterViewInit()
    })
    const tierref = collection(this.firestore,"tier")
    getDocs(tierref).then(async tierSnap => {
      for (let i = 0; i < tierSnap.docs.length; i++) {
        const element = tierSnap.docs[i].data();
        this.mapTier[element['id']] = element['tier']
      }
    })
    const journeyref = collection(this.firestore,"journey")
    getDocs(journeyref).then(async snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapJourney[element['id']] = element['journey']
      }
    })
    const productsref = collection(this.firestore,"products")
    getDocs(productsref).then(async snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProduct[element['id']] = element['product']
      }
    })
    const biglevelref = collection(this.firestore,"biglevel")
    getDocs(biglevelref).then(async snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapBigLevel[element['docid']] = element['level']
      }
    })
  }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  onAddTier(){
    this.dialog.open(ConfigNewTierComponent,{
      data:{
        type:"add"
      },
      disableClose:true
    })
  }

  onEdit(tabledoc:any){
    console.log(tabledoc);
    this.dialog.open(ConfigNewTierComponent,{
      data:{
        type:"edit",
        doc:{...tabledoc}
      },
      disableClose:true,
    })
  }

  onDelete(docdata:any){
    const tieraccessconfigref = doc(this.firestore,"tier access config",docdata.docid)
    deleteDoc(tieraccessconfigref).then(() => console.log('Document successfully deleted'))
  }


}
